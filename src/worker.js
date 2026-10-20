// Política de seguridad del contenido para la v2 (/ux2/): solo se ejecuta código del propio sitio
// y los scripts en línea que el worker firma con un nonce por respuesta. Si alguien logra meter HTML
// en una página, el navegador igual se niega a ejecutar su código.
function cspV2(env, nonce) {
  const sb = new URL(env.SUPABASE_URL)
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    `connect-src 'self' https://${sb.host} wss://${sb.host}`,
    'frame-src https://www.youtube.com https://www.youtube-nocookie.com',
    "media-src 'self' blob: https:",
    "worker-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ')
}

// ─── Lanzamiento de la v2 ───
// En producción la v2 (/ux2/) queda cerrada mientras corra la cuenta regresiva del admin
// (system_config.countdown). Se abre sola cuando la cuenta llega a cero o cuando se desactiva.
// Con la v2 abierta, la dirección principal lleva a la v2 y la v1 queda en /cuenta
// (ahí siguen el login, el registro, la verificación y la recuperación de contraseña).
// En dev y stage la v2 está siempre abierta.
const HOSTS_PROD = ['cabildodevenezuela.com', 'www.cabildodevenezuela.com']
const LANZAMIENTO_RESPALDO = Date.parse('2026-10-19T11:11:00-04:00')   // solo si no se puede leer la configuración
let _cfgV2 = { t: 0, abierta: null }

async function v2Abierta(env, url) {
  if (!HOSTS_PROD.includes(url.hostname)) return true
  const ahora = Date.now()
  if (_cfgV2.abierta !== null && ahora - _cfgV2.t < 20000) return _cfgV2.abierta
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/system_config?select=value&key=eq.countdown`, {
      headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` },
      cf: { cacheTtl: 15 },
      signal: AbortSignal.timeout(1500),   // carga-base: si Supabase está lento, el sitio no espera
    })
    if (!r.ok) throw new Error('status ' + r.status)
    const v = (await r.json())?.[0]?.value
    const fin = Date.parse(v?.objetivo)
    const abierta = !v || !v.active || (!isNaN(fin) && ahora >= fin)
    _cfgV2 = { t: ahora, abierta }
    return abierta
  } catch (e) {
    if (_cfgV2.abierta !== null) return _cfgV2.abierta
    return ahora >= LANZAMIENTO_RESPALDO
  }
}

const redirigir = (destino, status = 302) => new Response(null, { status, headers: { Location: destino, 'Cache-Control': 'no-store' } })

// ─── Vigía externo (vigia-externo) ───
// Cada 2 min (cron en wrangler.prod.toml) prueba Supabase desde afuera y avisa en #alertas-infra si no responde
// o si el vigía interno (pg_cron) dejó de correr. Cubre el caso en que la base no puede disparar sus propias alertas.
// Necesita el secreto SLACK_BOT_TOKEN y el KV VIGIA (guarda si ya avisó); si falta alguno, no hace nada.
async function vigiaProbar(env) {
  const h = { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` }
  const fallas = []
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/infra_latido`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(15000) })
    if (!r.ok) fallas.push(`La API de Supabase respondió con error ${r.status}.`)
    else {
      const t = Date.parse(await r.json())
      const min = Math.round((Date.now() - t) / 60000)
      if (!isNaN(t) && min > 6) fallas.push(`El vigía interno no corre desde hace ${min} min: la base no está ejecutando sus tareas programadas.`)
    }
  } catch (e) { fallas.push('La API de Supabase no respondió en 15 s.') }
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/health`, { headers: h, signal: AbortSignal.timeout(10000) })
    if (r.status >= 500) fallas.push(`El login respondió con error ${r.status}.`)
  } catch (e) { fallas.push('El login no respondió en 10 s.') }
  return fallas
}

async function vigiaSlack(env, texto) {
  const h = { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` }
  const l = await (await fetch('https://slack.com/api/conversations.list', { method: 'POST', headers: { ...h, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ types: 'public_channel,private_channel', exclude_archived: 'true', limit: '1000' }) })).json()
  const canal = (l.channels || []).find(c => c.name === 'alertas-infra')?.id
  if (!canal) return
  await fetch('https://slack.com/api/chat.postMessage', { method: 'POST', headers: { ...h, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ channel: canal, text: texto, unfurl_links: false }) })
}

async function vigiaExterno(env) {
  if (!env.SLACK_BOT_TOKEN || !env.VIGIA || !env.SUPABASE_KEY) return
  let fallas = await vigiaProbar(env)
  if (fallas.length) { await new Promise(r => setTimeout(r, 20000)); fallas = await vigiaProbar(env) }   // confirmar: no avisar por un parpadeo
  let e = { caido: false, desde: 0, aviso: 0 }
  try { e = { ...e, ...JSON.parse(await env.VIGIA.get('estado') || '{}') } } catch (_) {}
  const ahora = Date.now(), min = () => Math.max(1, Math.round((ahora - e.desde) / 60000))
  let texto = null
  if (fallas.length && !e.caido) { e = { caido: true, desde: ahora, aviso: ahora }; texto = '<!channel> :red_circle: *Supabase con problemas* (vigía externo)\n' + fallas.map(f => '• ' + f).join('\n') + '\nEl sitio y el login pueden no funcionar. Revisá el panel de Supabase.' }
  else if (fallas.length && ahora - e.aviso > 30 * 60000) { e.aviso = ahora; texto = `:red_circle: Supabase *sigue* con problemas (hace ${min()} min).\n` + fallas.map(f => '• ' + f).join('\n') }
  else if (!fallas.length && e.caido) { texto = `:white_check_mark: Supabase volvió a responder (vigía externo). Estuvo con problemas ~${min()} min.`; e = { caido: false, desde: 0, aviso: 0 } }
  if (!texto) return
  await env.VIGIA.put('estado', JSON.stringify(e))
  await vigiaSlack(env, texto)
}

// ─── bloques-publicos: datos para la vista previa de /b/<slug> (WhatsApp, X…) ───
// Solo lo que bloque_publico ya devuelve sin sesión. Timeout corto y caché de 5 min para no cargar la base.
const _limpiarMeta = s => String(s ?? '').replace(/[<>"&\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)
async function bloqueMeta(env, url, slug, ctx) {
  const clave = new Request(`${url.origin}/__bloque-meta/${slug}`)
  try { const c = await caches.default.match(clave); if (c) return await c.json() } catch (e) {}
  let d = null
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/bloque_publico`, {
      method: 'POST', headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_slug: slug }), signal: AbortSignal.timeout(1500),
    })
    if (r.ok) d = await r.json()
  } catch (e) { return { error: true } }
  const img = /^https:\/\/ayxscmxmnoguktfgveud\.supabase\.co\/storage\/v1\/object\/public\//.test(d?.imagen_url || '') ? d.imagen_url : 'https://cabildodevenezuela.com/logo-cabildo.jpg'
  const meta = d ? { ok: true, nombre: _limpiarMeta(d.nombre), lema: _limpiarMeta(d.lema), miembros: Number(d.miembros) || 0, anfitrion: _limpiarMeta(d.anfitrion_nombre), img } : { ok: false }
  try { ctx.waitUntil(caches.default.put(clave, new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=300' } }))) } catch (e) {}
  return meta
}

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(vigiaExterno(env).catch(e => console.error('vigía externo', e))) },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ─── /sb/* desactivado ───
    // Era un proxy abierto a Supabase que nadie usa: cualquiera podía pasar por acá cualquier ruta y método,
    // y Supabase veía la IP de Cloudflare (se perdía el límite de intentos por IP en registro y login).
    // Si algún día hace falta (por ejemplo, si bloquean supabase.co en Venezuela), rehacerlo con una lista
    // cerrada de rutas y reenviando la IP real.
    if (url.pathname === '/sb' || url.pathname.startsWith('/sb/')) {
      return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }

    // ─── v2.cabildodevenezuela.com se retira: todo va al dominio principal ───
    if (url.hostname === 'v2.cabildodevenezuela.com') {
      return redirigir('https://cabildodevenezuela.com' + url.pathname + url.search);
    }

    // ─── Lanzamiento: v2 cerrada → /ux2 vuelve a la portada; v2 abierta → la portada lleva a la v2 ───
    const esRutaV2 = url.pathname === '/ux2' || url.pathname.startsWith('/ux2/');
    if (url.pathname === '/cuenta/') return redirigir('/cuenta' + url.search, 301);
    if (esRutaV2 || url.pathname === '/' || url.pathname === '/index.html') {
      const abierta = await v2Abierta(env, url);
      if (esRutaV2 && !abierta) return redirigir('/' + url.search);
      if (!esRutaV2 && abierta) return redirigir('/ux2/' + url.search);
    }

    // ─── bloques-publicos: /b/<slug> sirve la página pública del bloque ───
    const mBloque = url.pathname.match(/^\/b\/([a-z0-9-]{1,80})\/?$/);
    // bloques-publicos-2: la plantilla solo se sirve por /b/<slug>
    if (url.pathname === '/b' || url.pathname === '/bloque' || url.pathname === '/bloque.html' || (url.pathname.startsWith('/b/') && !mBloque)) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

    // ─── Static assets ───
    const assetResponse = mBloque ? await env.ASSETS.fetch(new URL('/bloque', request.url).toString()) : await env.ASSETS.fetch(request);

    // SPA fallback: rutas como /auth/recovery no son archivos → servir index.html
    const targetResponse = (assetResponse.status === 404)
      ? await env.ASSETS.fetch(new URL('/', request.url).toString())
      : assetResponse;

    // Inyecta window.__ENV en HTML para que el frontend consuma SUPABASE_URL/KEY
    const contentType = targetResponse.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return targetResponse;
    }

    // La v2 y la sala de prensa (/press, pública y con link compartido) llevan la política estricta con nonce.
    const esV2 = url.pathname === '/ux2' || url.pathname.startsWith('/ux2/') || url.pathname === '/press' || url.pathname === '/press.html'
      || url.pathname === '/verificacion-manual' || url.pathname === '/verificacion-manual.html' || !!mBloque;   // fotos de documentos: política estricta
    const nonce = esV2 ? btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))) : '';

    const envScript = `<script${esV2 ? ` nonce="${nonce}"` : ''}>window.__ENV=${JSON.stringify({
      SUPABASE_URL: env.SUPABASE_URL,
      SUPABASE_KEY: env.SUPABASE_KEY,
      API_ENDPOINT: env.API_ENDPOINT,
    })}</script>`;

    let rw = new HTMLRewriter()
      .on('head', {
        element(el) {
          el.prepend(envScript, { html: true });
        },
      });
    if (esV2) rw = rw.on('script', { element(el) { el.setAttribute('nonce', nonce) } });
    let bmeta = null;
    if (mBloque) {
      bmeta = await bloqueMeta(env, url, mBloque[1], ctx);
      if (bmeta?.ok) {
        const titulo = `${bmeta.nombre} · Bloque en el Cabildo de Venezuela`;
        const desc = `${bmeta.lema ? bmeta.lema + ' · ' : ''}${bmeta.miembros.toLocaleString('es-VE')} ${bmeta.miembros === 1 ? 'ciudadano verificado' : 'ciudadanos verificados'}. Anfitrión: ${bmeta.anfitrion}. Sumate en el Cabildo de Venezuela.`;
        const pon = (sel, v) => { rw = rw.on(sel, { element(el) { el.setAttribute('content', v) } }) };
        rw = rw.on('title', { element(el) { el.setInnerContent(titulo) } });
        pon('meta[name="description"]', desc); pon('meta[property="og:title"]', titulo); pon('meta[property="og:description"]', desc);
        pon('meta[property="og:image"]', bmeta.img); pon('meta[property="og:url"]', `https://cabildodevenezuela.com/b/${mBloque[1]}`);
      }
    }
    const out = rw.transform(targetResponse);
    if (!esV2) return out;

    const res = new Response(out.body, mBloque && bmeta && bmeta.ok === false ? { status: 404, headers: out.headers } : out);
    res.headers.set('Content-Security-Policy', cspV2(env, nonce));
    res.headers.set('X-Content-Type-Options', 'nosniff');
    res.headers.set('X-Frame-Options', 'DENY');
    res.headers.set('Referrer-Policy', 'same-origin');
    res.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=(self), payment=(), usb=()');
    res.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.headers.set('Cache-Control', 'no-store');
    return res;
  }
};

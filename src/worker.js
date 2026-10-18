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

export default {
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

    // ─── Static assets ───
    const assetResponse = await env.ASSETS.fetch(request);

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
    const esV2 = url.pathname === '/ux2' || url.pathname.startsWith('/ux2/') || url.pathname === '/press' || url.pathname === '/press.html';
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
    const out = rw.transform(targetResponse);
    if (!esV2) return out;

    const res = new Response(out.body, out);
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

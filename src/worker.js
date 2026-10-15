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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ─── Proxy /sb/* → Supabase ───
    if (url.pathname.startsWith('/sb/')) {
      const upstream = new URL(env.SUPABASE_URL);
      upstream.pathname = url.pathname.replace(/^\/sb/, '');
      upstream.search = url.search;
      return fetch(upstream.toString(), request);
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

    const esV2 = url.pathname === '/ux2' || url.pathname.startsWith('/ux2/');
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

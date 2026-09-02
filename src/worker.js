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

    const envScript = `<script>window.__ENV=${JSON.stringify({
      SUPABASE_URL: env.SUPABASE_URL,
      SUPABASE_KEY: env.SUPABASE_KEY,
      API_ENDPOINT: env.API_ENDPOINT,
    })}</script>`;

    return new HTMLRewriter()
      .on('head', {
        element(el) {
          el.prepend(envScript, { html: true });
        },
      })
      .transform(targetResponse);
  }
};

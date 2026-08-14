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

    // ─── Static assets (window.__ENV ya viene inyectado en el HTML por el build) ───
    return env.ASSETS.fetch(request);
  }
};

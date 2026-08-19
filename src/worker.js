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

    // ─── Static assets con inyección de window.__ENV para HTML ───
    const response = await env.ASSETS.fetch(request);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return response;
    }

    const envPayload = {
      // Cliente Supabase habla contra el mismo origen; el Worker proxy-ea /sb/* al upstream real.
      SUPABASE_URL: `${url.origin}/sb`,
      SUPABASE_KEY: env.SUPABASE_KEY,
      API_ENDPOINT: env.API_ENDPOINT,
    };
    const envScript = `<script>window.__ENV=${JSON.stringify(envPayload)};</script>`;

    return new HTMLRewriter()
      .on('head', {
        element(el) {
          el.prepend(envScript, { html: true });
        },
      })
      .transform(response);
  }
};

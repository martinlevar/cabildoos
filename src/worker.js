// export default {
//   async fetch(request, env, ctx) {
//     // Always fetch the static asset first
//     const response = await env.ASSETS.fetch(request);

//     // Only rewrite HTML responses; everything else passes through
//     const contentType = response.headers.get('content-type') || '';
//     if (!contentType.includes('text/html')) {
//       return response;
//     }

//     // Resolve secret + read vars
//     const supabaseKey = await env.CDV_SUPABASE_TOKEN.get();
//     const config = {
//       SUPABASE_URL: env.SUPABASE_URL,
//       SUPABASE_KEY: supabaseKey,
//       API_ENDPOINT: env.API_ENDPOINT,
//     };

//     // Inject <script> into <head> that exposes window.__ENV
//     return new HTMLRewriter()
//       .on('head', {
//         element(el) {
//           el.prepend(
//             `<script>window.__ENV=${JSON.stringify(config)};</script>`,
//             { html: true }
//           );
//         }
//       })
//       .transform(response);
//   }
// };



// PROXU BC OF CISCO

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ─── Proxy /sb/* → Supabase (works for HTTPS and WebSockets) ───
    if (url.pathname.startsWith('/sb/')) {
      const upstream = new URL(env.SUPABASE_URL);
      upstream.pathname = url.pathname.replace(/^\/sb/, '');
      upstream.search = url.search;
      return fetch(upstream.toString(), request);
    }

    // ─── Static assets ───
    const response = await env.ASSETS.fetch(request);

    // Only rewrite HTML responses; everything else passes through
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return response;
    }

    // Resolve secret + read vars
    const supabaseKey = await env.CDV_SUPABASE_TOKEN.get();
    const config = {
      SUPABASE_URL: `${url.origin}/sb`,
      SUPABASE_KEY: supabaseKey,
      API_ENDPOINT: env.API_ENDPOINT,
    };

    // Inject <script> into <head> that exposes window.__ENV
    return new HTMLRewriter()
      .on('head', {
        element(el) {
          el.prepend(
            `<script>window.__ENV=${JSON.stringify(config)};</script>`,
            { html: true }
          );
        }
      })
      .transform(response);
  }
};
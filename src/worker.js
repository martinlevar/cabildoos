export default {
  async fetch(request, env, ctx) {
    // Always fetch the static asset first
    const response = await env.ASSETS.fetch(request);

    // Only rewrite HTML responses; everything else passes through
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return response;
    }

    // Resolve secret + read vars
    const supabaseKey = await env.CDV_SUPABASE_TOKEN.get();
    const config = {
      SUPABASE_URL: env.SUPABASE_URL,
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
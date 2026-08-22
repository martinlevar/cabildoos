export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ─── Proxy /sb/* → Supabase (HTTP + WebSocket) ───
    if (url.pathname.startsWith('/sb/')) {
      const path = url.pathname.slice(3); // strip '/sb'
      const upstreamBase = env.SUPABASE_URL; // https://ayxscmxmnoguktfgveud.supabase.co

      if (request.headers.get('Upgrade') === 'websocket') {
        return proxyWebSocket(request, upstreamBase + path + url.search);
      }

      return fetch(upstreamBase + path + url.search, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
    }

    // ─── Static assets ───
    const assetResponse = await env.ASSETS.fetch(request);
    const contentType = assetResponse.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return assetResponse;

    // Inyecta window.__ENV — usa el dominio propio como SUPABASE_URL
    // para que el JS client y OAuth redirect_uri usen cabildodevenezuela.com
    const envScript = `<script>window.__ENV=${JSON.stringify({
      SUPABASE_URL: url.origin + '/sb',
      SUPABASE_KEY: env.SUPABASE_KEY,
      API_ENDPOINT: env.API_ENDPOINT,
    })}</script>`;

    return new HTMLRewriter()
      .on('head', {
        element(el) {
          el.prepend(envScript, { html: true });
        },
      })
      .transform(assetResponse);
  },
};

async function proxyWebSocket(request, upstreamUrl) {
  const wssUrl = upstreamUrl.replace(/^https/, 'wss').replace(/^http/, 'ws');

  const upstreamResp = await fetch(wssUrl, {
    method: 'GET',
    headers: request.headers,
  });

  const upstreamWs = upstreamResp.webSocket;
  if (!upstreamWs) {
    return new Response('WebSocket upstream failed', { status: 502 });
  }

  const { 0: clientWs, 1: serverWs } = new WebSocketPair();

  upstreamWs.accept();
  serverWs.accept();

  // client → upstream
  serverWs.addEventListener('message', ({ data }) => {
    try { upstreamWs.send(data); } catch (e) {}
  });
  serverWs.addEventListener('close', ({ code, reason }) => {
    try { upstreamWs.close(code, reason); } catch (e) {}
  });
  serverWs.addEventListener('error', () => {
    try { upstreamWs.close(1011); } catch (e) {}
  });

  // upstream → client
  upstreamWs.addEventListener('message', ({ data }) => {
    try { serverWs.send(data); } catch (e) {}
  });
  upstreamWs.addEventListener('close', ({ code, reason }) => {
    try { serverWs.close(code, reason); } catch (e) {}
  });
  upstreamWs.addEventListener('error', () => {
    try { serverWs.close(1011); } catch (e) {}
  });

  return new Response(null, { status: 101, webSocket: clientWs });
}

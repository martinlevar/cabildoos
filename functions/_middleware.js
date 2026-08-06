/**
 * Cloudflare Pages Middleware
 * Sirve proximamente.html en la ruta raíz de cabildodevenezuela.com.
 * El app completo sigue disponible en cabildoos.pages.dev
 * Para desactivar: borrar este archivo y hacer redeploy.
 */
export async function onRequest(context) {
  const url = new URL(context.request.url)

  if (url.pathname === '/' || url.pathname === '') {
    const proximamente = new URL('/proximamente.html', url)
    return context.env.ASSETS.fetch(proximamente)
  }

  return context.next()
}

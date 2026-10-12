/* ═══════════════════════════════════════════════════════════════
   Cabildo de Venezuela — UX v2
   Usa la misma base y la misma sesión que la versión actual.
   ═══════════════════════════════════════════════════════════════ */
'use strict'

const sb = window.supabase.createClient(window.__ENV.SUPABASE_URL, window.__ENV.SUPABASE_KEY)
const APP_ACTUAL = '/'          // secciones todavía no rediseñadas → versión actual

const $  = (s, el = document) => el.querySelector(s)
const $$ = (s, el = document) => [...el.querySelectorAll(s)]
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const fmtNum = n => Number(n || 0).toLocaleString('es-VE')

const estado = { user: null, butaca: 0, alias: null, ident: null, bloques: [], miBloque: null, tab: 'destacados' }

// ── Navegación ──────────────────────────────────────────────────
const ICONOS = {
  inicio:       '<path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/>',
  butaca:       '<path d="M7 10V6a5 5 0 0 1 10 0v4M5 10h14v5H5zM7 15v4M17 15v4"/>',
  debates:      '<path d="M5 5h14v10H9l-4 4z"/><path d="M9 9h6M9 12h4"/>',
  votaciones:   '<path d="M5 4h14v16H5z"/><path d="m9 12 2 2 4-4"/>',
  propuestas:   '<path d="M6 3h9l4 4v14H6z"/><path d="M9 13l2 2 4-5"/>',
  ciudadanos:   '<circle cx="9" cy="8" r="3"/><path d="M3 19a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M21 19a6 6 0 0 0-4-5.7"/>',
  estadisticas: '<path d="M5 20V10M10 20V4M15 20v-7M20 20v-11"/>',
  aprende:      '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
  noticias:     '<path d="M5 4h12v16H7a2 2 0 0 1-2-2z"/><path d="M17 8h2v10a2 2 0 0 1-2 2M8 8h6M8 12h6M8 16h4"/>',
  auditorio:    '<circle cx="12" cy="12" r="2"/><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>',
  playroom:     '<path d="M6 9h12a3 3 0 0 1 3 3v3a2 2 0 0 1-3.5 1.3L15 14H9l-2.5 2.3A2 2 0 0 1 3 15v-3a3 3 0 0 1 3-3z"/><path d="M8 11v2M7 12h2M16 12h.01"/>',
}
const SECCIONES = [
  ['inicio', 'Inicio'], ['butaca', 'Mi Butaca'], ['debates', 'Debates'], ['votaciones', 'Votaciones'],
  ['propuestas', 'Propuestas'], ['ciudadanos', 'Ciudadanos'], ['estadisticas', 'Estadísticas'],
  ['aprende', 'Aprendé'], ['noticias', 'Noticias'], ['auditorio', 'Auditorio'], ['playroom', 'Playroom'],
]

const LISTAS = new Set(['inicio', 'votaciones', 'butaca', 'debates', 'propuestas', 'ciudadanos', 'estadisticas', 'auditorio'])   // secciones ya rediseñadas

function pintarNav() {
  $('#nav').innerHTML = SECCIONES.map(([id, label]) => `
    <li><a href="#${id}" data-sec="${id}" title="${label}">
      <svg viewBox="0 0 24 24">${ICONOS[id]}</svg><span>${label}</span>
      ${LISTAS.has(id) ? '' : '<span class="soon-tag">pronto</span>'}
    </a></li>`).join('')
}

function ruta() {
  const [sec, arg] = (location.hash || '#inicio').slice(1).split('/')
  const valida = SECCIONES.some(([id]) => id === sec) ? sec : 'inicio'
  $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.sec === valida))
  const vista = LISTAS.has(valida) ? valida : 'pronto'
  $$('.view').forEach(v => { v.hidden = v.dataset.view !== vista })
  if (vista === 'pronto') $('#soon-title').textContent = SECCIONES.find(([id]) => id === valida)[1]
  cerrarMenu()
  window.scrollTo(0, 0)
  if (valida === 'inicio') requestAnimationFrame(dibujarHemiciclo)
  if (valida === 'votaciones') cargarVotaciones()
  if (valida === 'butaca') { pintarMiButaca(); cargarMiButaca() }
  if (valida === 'estadisticas') cargarEstadisticas()
  if (valida === 'auditorio') { pintarAuditorio(); entrarAuditorio() }
  else if (au.canal || au.vigia) salirAuditorio()
  if (valida === 'ciudadanos') cargarCiudadanos(arg)
  else if ($('#modal-ciu') && !$('#modal-ciu').hidden) cerrarPerfil()
  if (valida === 'propuestas') { if (!pr.d) cargarPropuestas(arg); else { refrescarPropuestas(); if (arg) abrirPropuesta(arg) } }
  if (valida === 'debates') {
    if (!dbt.lista.length) cargarDebates(arg)
    else if (arg) { if (arg !== dbt.q?.id) abrirHilo(arg) }
    else if (window.innerWidth <= 860 && dbt.q) { salirDelCanal(); dbt.q = null; $('.db-wrap')?.classList.remove('con-hilo'); pintarListaDebates() }
  }
  else if (dbt.canal) salirDelCanal()
}

function abrirMenu()  { $('#sidebar').classList.add('open'); $('#scrim').classList.add('show') }
function cerrarMenu() { $('#sidebar').classList.remove('open'); $('#scrim').classList.remove('show') }

// ── Reloj (hora de Venezuela) ───────────────────────────────────
const fmtHora  = new Intl.DateTimeFormat('es-VE', { timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
const fmtFecha = new Intl.DateTimeFormat('es-VE', { timeZone: 'America/Caracas', weekday: 'short', day: 'numeric', month: 'short' })
function tickReloj() {
  const now = new Date()
  $('#clock-time').textContent = fmtHora.format(now)
  const f = fmtFecha.format(now).replace(/\./g, '')
  $('#clock-date').textContent = f.charAt(0).toUpperCase() + f.slice(1) + ' · VET'
}

// ── Tema claro / oscuro ─────────────────────────────────────────
function alternarTema() {
  const actual = document.documentElement.dataset.theme
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  const nuevo = actual === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = nuevo
  try { localStorage.setItem('ux2_tema', nuevo) } catch (e) {}
  dibujarHemiciclo()
  if (est.nube && vistaActual() === 'estadisticas') renderWordCloud(est.nube.entities || [], est.nube.horas || est.horas, est.nube.total || 0, est.nube.generado_at, est.nube.error)
}

// ── Aviso breve ─────────────────────────────────────────────────
function aviso(msg, tipo = 'ok') {
  let t = $('#ux2-toast')
  if (!t) {
    t = document.createElement('div'); t.id = 'ux2-toast'
    t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:90;padding:12px 18px;border-radius:12px;font-size:14px;font-weight:500;box-shadow:0 10px 30px rgba(0,0,0,.2);max-width:90vw;text-align:center;transition:opacity .2s'
    document.body.appendChild(t)
  }
  t.style.background = tipo === 'error' ? '#e11d48' : '#141a3c'
  t.style.color = '#fff'
  t.textContent = msg
  t.style.opacity = '1'
  clearTimeout(t._h); t._h = setTimeout(() => { t.style.opacity = '0' }, 4200)
}

// ── Sesión y butaca ─────────────────────────────────────────────
async function cargarUsuario() {
  const { data: { session } } = await sb.auth.getSession()
  estado.user = session?.user || null
  if (!estado.user) { estado.cargado = true; return pintarUsuario() }
  try {
    const [{ data: num }, { data: ident }] = await Promise.all([sb.rpc('get_my_seat'), sb.rpc('get_my_seat_identity')])
    estado.butaca = Number(num) || 0
    const fila = Array.isArray(ident) ? ident[0] : ident
    estado.alias = fila?.alias || null
    estado.ident = fila || {}
  } catch (e) { console.warn('cargarUsuario:', e) }
  estado.cargado = true
  pintarUsuario()
  cargarNotificaciones()
}

function pintarUsuario() {
  const nombre = estado.user
    ? (estado.alias || (estado.butaca ? `Butaca #${estado.butaca}` : 'Mi cuenta'))
    : 'Iniciar sesión'
  $('#user-name').textContent = nombre
  $('#user-avatar').textContent = estado.user ? (estado.alias || 'B').charAt(0).toUpperCase() : '?'
  $('#quick-butaca-num').textContent = estado.butaca ? `#${estado.butaca}` : (estado.user ? 'Sin butaca' : 'Iniciá sesión')
  $('#my-seat-num').textContent = estado.butaca ? `#${estado.butaca}` : ''
}

async function cargarNotificaciones() {
  if (!estado.butaca) return
  try {
    const { data } = await sb.rpc('get_my_notifications', { p_seat: estado.butaca })
    $('#notif-dot').hidden = !(data || []).some(n => !n.read_at)
  } catch (e) {}
}

// ── Hemiciclo ───────────────────────────────────────────────────
// Misma geometría que la versión actual: filas en arco, se llenan del centro hacia los costados.
// Interactivo: pasar el mouse muestra la tarjeta de cada butaca, arrastrar recorre, rueda/pellizco hace zoom.
// Con las columnas desplegadas se enfoca en tu butaca; con las dos plegadas se ve completo.
const H = { DOT: 14, GAP: 14 * 3.1, A0: 24 * Math.PI / 180, A1: 156 * Math.PI / 180, R_IN: 320, R_STEP: 50 }
let totalButacas = 0
let asientos = []
const perfiles = new Map()                 // butaca → { alias, phrase, vote_count, show_*, card_color }
const cam = { x: 0, y: 0, s: 1 }, objetivo = { x: 0, y: 0, s: 1 }
let encuadre = { x: 0, y: 0, s: 1 }        // "ver todo"
let modoCam = 'auto'                       // 'auto' sigue la regla de enfoque; 'manual' tras zoom/arrastre
let hover = 0, animando = false
let limites = null

function ordenCentro(n) {
  if (n <= 1) return [0]
  const o = []
  if (n % 2) { const c = Math.floor(n / 2); o.push(c); for (let d = 1; d <= c; d++) o.push(c - d, c + d) }
  else { const c = n / 2; for (let d = 0; d < c; d++) o.push(c - 1 - d, c + d) }
  return o
}

function calcularAsientos(n) {
  const span = H.A1 - H.A0
  const res = []
  let row = 0
  while (res.length < n) {
    const r = H.R_IN + row * H.R_STEP
    const capacidad = Math.floor(r * span / H.GAP)
    const cant = Math.min(capacidad, n - res.length)
    const orden = ordenCentro(capacidad)
    for (let i = 0; i < cant; i++) {
      const t = capacidad > 1 ? orden[i] / (capacidad - 1) : .5
      const a = H.A0 + t * span
      res.push({ x: r * Math.cos(a), y: r * Math.sin(a), num: res.length + 1 })
    }
    row++
  }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const s of res) { x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y) }
  limites = { x0, x1, y0, y1 }
  return res
}

function tamCanvas() {
  const cv = $('#hemi'); return { W: cv.clientWidth, H: cv.clientHeight }
}

// Encuadre "ver todo": deja lugar arriba para el cartel y abajo para el rótulo
function calcularEncuadre() {
  const { W, H: Hh } = tamCanvas()
  if (!limites || !W || !Hh) return
  const padTop = 70, padBottom = 96, padX = 12
  const s = Math.min((W - padX * 2) / (limites.x1 - limites.x0 + H.DOT * 2),
                     (Hh - padTop - padBottom) / (limites.y1 - limites.y0 + H.DOT * 2))
  encuadre = { s, x: (limites.x0 + limites.x1) / 2, y: (limites.y0 + limites.y1) / 2 + (padBottom - padTop) / 2 / s }
}

function columnasDesplegadas() {
  const app = $('.app')
  return !(app.classList.contains('side-plegado') && app.classList.contains('panel-plegado'))
}

function objetivoAuto() {
  const mia = estado.butaca && asientos[estado.butaca - 1]
  if (mia && columnasDesplegadas()) return { x: mia.x, y: mia.y + 60 / (encuadre.s * 1.7), s: encuadre.s * 1.7 }
  return { ...encuadre }
}

function irA(o, instantaneo = false) {
  Object.assign(objetivo, o)
  if (instantaneo) Object.assign(cam, o)
  animar()
}

function animar() {
  if (animando) return
  animando = true
  const paso = () => {
    const k = .2
    cam.x += (objetivo.x - cam.x) * k; cam.y += (objetivo.y - cam.y) * k; cam.s += (objetivo.s - cam.s) * k
    const listo = Math.abs(objetivo.x - cam.x) < .05 && Math.abs(objetivo.y - cam.y) < .05 && Math.abs(objetivo.s - cam.s) < objetivo.s * .001
    if (listo) Object.assign(cam, objetivo)
    pintar()
    if (listo) { animando = false; return }
    requestAnimationFrame(paso)
  }
  requestAnimationFrame(paso)
}

const aPantalla = (wx, wy, W, Hh) => ({ x: W / 2 + (wx - cam.x) * cam.s, y: Hh / 2 + (wy - cam.y) * cam.s })
const aMundo    = (sx, sy, W, Hh) => ({ x: (sx - W / 2) / cam.s + cam.x, y: (sy - Hh / 2) / cam.s + cam.y })

function pintar() {
  const cv = $('#hemi'); if (!cv || !cv.offsetParent) return
  const { W, H: Hh } = tamCanvas()
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(Hh * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr) }
  const ctx = cv.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, Hh)
  if (!asientos.length) return

  const css = getComputedStyle(document.documentElement)
  const cSeat = css.getPropertyValue('--seat').trim() || '#1a1f3c'
  const cMine = css.getPropertyValue('--orange').trim() || '#f76a1e'
  const cAcc  = css.getPropertyValue('--accent').trim() || '#4f46e5'
  const r = Math.max(1.3, H.DOT * cam.s * .8)
  const m = r + 4

  ctx.fillStyle = cSeat
  for (let i = 0; i < asientos.length; i++) {
    const a = asientos[i]
    if (a.num === estado.butaca) continue
    const p = aPantalla(a.x, a.y, W, Hh)
    if (p.x < -m || p.x > W + m || p.y < -m || p.y > Hh + m) continue
    ctx.globalAlpha = i % 7 === 3 ? .55 : 1           // leve variación de tono, como en el diseño
    ctx.beginPath(); ctx.arc(p.x, p.y, a.num === hover ? r * 1.35 : r, 0, Math.PI * 2); ctx.fill()
  }
  ctx.globalAlpha = 1

  if (hover && hover !== estado.butaca && asientos[hover - 1]) {
    const p = aPantalla(asientos[hover - 1].x, asientos[hover - 1].y, W, Hh)
    ctx.strokeStyle = cAcc; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.35 + 3, 0, Math.PI * 2); ctx.stroke()
  }

  const tip = $('#my-seat-tip')
  const mia = estado.butaca && asientos[estado.butaca - 1]
  if (mia) {
    const p = aPantalla(mia.x, mia.y, W, Hh)
    ctx.shadowColor = 'rgba(247,106,30,.6)'; ctx.shadowBlur = 12
    ctx.fillStyle = cMine
    ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.25, 0, Math.PI * 2); ctx.fill()
    ctx.shadowBlur = 0
    const visible = p.x > 60 && p.x < W - 60 && p.y > 90 && p.y < Hh
    tip.style.left = p.x + 'px'; tip.style.top = p.y + 'px'; tip.hidden = !visible
  } else tip.hidden = true

  // El rótulo de abajo se desvanece al acercarse, para no tapar butacas
  $('.hemi-label').style.opacity = cam.s > encuadre.s * 1.25 ? '0' : '1'
}

// Compatibilidad: otras partes llaman a dibujarHemiciclo() cuando cambia el tamaño o el tema
function dibujarHemiciclo() {
  calcularEncuadre()
  if (modoCam === 'auto') irA(objetivoAuto(), !cam.s || cam.s === 1)
  else { objetivo.s = Math.max(objetivo.s, encuadre.s * .8); pintar() }
}

// ── Interacción ──
function posLocal(e) {
  const cv = $('#hemi'), rect = cv.getBoundingClientRect()
  const f = rect.width / cv.clientWidth || 1            // compensa la escala general de la página
  return { x: (e.clientX - rect.left) / f, y: (e.clientY - rect.top) / f }
}

function butacaEn(sx, sy) {
  const { W, H: Hh } = tamCanvas()
  const w = aMundo(sx, sy, W, Hh)
  const radio = Math.max(H.DOT * 1.1, 10 / cam.s)
  let mejor = 0, dMin = radio * radio
  for (const a of asientos) {
    const d = (a.x - w.x) ** 2 + (a.y - w.y) ** 2
    if (d < dMin) { dMin = d; mejor = a.num }
  }
  return mejor
}

function zoomEn(sx, sy, factor) {
  const { W, H: Hh } = tamCanvas()
  const antes = aMundo(sx, sy, W, Hh)
  const s = Math.min(Math.max(objetivo.s * factor, encuadre.s * .8), encuadre.s * 14)
  // mantener fijo el punto bajo el cursor
  objetivo.x = antes.x - (sx - W / 2) / s
  objetivo.y = antes.y - (sy - Hh / 2) / s
  objetivo.s = s
  modoCam = 'manual'
  animar()
}

function tarjetaButaca(num, sx, sy) {
  const card = $('#seat-card')
  if (!num) { card.hidden = true; return }
  const p = perfiles.get(num)
  const esMia = num === estado.butaca
  const alias = p?.show_alias && p.alias ? p.alias : null
  const nombre = esMia ? 'Tu butaca' : (alias || 'Ciudadano anónimo')
  const publico = !!alias                                      // igual que la versión actual: público = muestra su alias
  card.innerHTML = `
    <div class="sc-head">
      <span class="sc-av" style="background:${esMia ? 'var(--orange)' : colorDe(p?.card_color, num)}">${alias ? esc(alias.charAt(0).toUpperCase())
        : '<svg viewBox="0 0 24 24" style="width:18px;height:18px"><circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/></svg>'}</span>
      <div><b>${esc(nombre)}</b><small>Butaca #${num}</small></div>
      <span class="sc-badge ${publico ? 'pub' : ''}">${publico ? 'Público' : 'Anónimo'}</span>
    </div>
    ${p?.show_phrase && p.phrase ? `<p class="sc-phrase">“${esc(p.phrase)}”</p>` : ''}
    ${p?.show_votes ? `<div class="sc-votes"><b>${fmtNum(p.vote_count)}</b> votaciones</div>` : ''}`
  card.hidden = false
  const { W, H: Hh } = tamCanvas()
  const cw = card.offsetWidth, ch = card.offsetHeight
  let x = sx + 16, y = sy + 16
  if (x + cw > W - 8) x = sx - cw - 16
  if (y + ch > Hh - 8) y = sy - ch - 16
  card.style.left = Math.max(8, x) + 'px'; card.style.top = Math.max(8, y) + 'px'
}

function enfocarButaca(num) {
  const b = num && asientos[num - 1]
  if (!b) return
  modoCam = 'manual'; irA({ x: b.x, y: b.y, s: encuadre.s * 4 })
}

function enlazarHemiciclo() {
  const cv = $('#hemi')
  const punteros = new Map()
  let arrastre = null, pellizco = null

  cv.addEventListener('wheel', e => {
    e.preventDefault()
    const p = posLocal(e)
    zoomEn(p.x, p.y, Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0018)))
  }, { passive: false })

  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId)
    punteros.set(e.pointerId, posLocal(e))
    if (punteros.size === 1) arrastre = { ...posLocal(e), cx: objetivo.x, cy: objetivo.y, movio: false }
    if (punteros.size === 2) {
      const [a, b] = [...punteros.values()]
      pellizco = { d: Math.hypot(a.x - b.x, a.y - b.y), s: objetivo.s }
      arrastre = null
    }
  })

  cv.addEventListener('pointermove', e => {
    const p = posLocal(e)
    if (punteros.has(e.pointerId)) punteros.set(e.pointerId, p)
    if (pellizco && punteros.size === 2) {
      const [a, b] = [...punteros.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      zoomEn((a.x + b.x) / 2, (a.y + b.y) / 2, (pellizco.s * d / pellizco.d) / objetivo.s)
      return
    }
    if (arrastre) {
      const dx = p.x - arrastre.x, dy = p.y - arrastre.y
      if (Math.abs(dx) + Math.abs(dy) > 4) arrastre.movio = true
      if (arrastre.movio) {
        objetivo.x = arrastre.cx - dx / objetivo.s; objetivo.y = arrastre.cy - dy / objetivo.s
        Object.assign(cam, objetivo); modoCam = 'manual'
        cv.style.cursor = 'grabbing'; $('#seat-card').hidden = true; hover = 0
        pintar(); return
      }
    }
    if (e.pointerType === 'mouse') {
      const n = butacaEn(p.x, p.y)
      if (n !== hover) { hover = n; pintar() }
      cv.style.cursor = n ? 'pointer' : 'grab'
      tarjetaButaca(n, p.x, p.y)
    }
  })

  const soltar = e => {
    const tap = arrastre && !arrastre.movio
    punteros.delete(e.pointerId)
    if (punteros.size < 2) pellizco = null
    if (tap && e.pointerType !== 'mouse') {          // en pantallas táctiles, tocar muestra la tarjeta
      const p = posLocal(e), n = butacaEn(p.x, p.y)
      hover = n; pintar(); tarjetaButaca(n, p.x, p.y)
    }
    arrastre = null
    cv.style.cursor = hover ? 'pointer' : 'grab'
  }
  cv.addEventListener('pointerup', soltar)
  cv.addEventListener('pointercancel', soltar)
  cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { hover = 0; pintar(); $('#seat-card').hidden = true } })
  cv.addEventListener('dblclick', e => { const p = posLocal(e); zoomEn(p.x, p.y, 2) })

  // Controles
  $('#hz-mas').addEventListener('click', () => { const { W, H: Hh } = tamCanvas(); zoomEn(W / 2, Hh / 2, 1.5) })
  $('#hz-menos').addEventListener('click', () => { const { W, H: Hh } = tamCanvas(); zoomEn(W / 2, Hh / 2, 1 / 1.5) })
  $('#hz-todo').addEventListener('click', () => { modoCam = 'manual'; irA({ ...encuadre }) })
  $('#hz-mia').addEventListener('click', () => {
    const mia = estado.butaca && asientos[estado.butaca - 1]
    if (!mia) { aviso('Todavía no tenés butaca asignada.'); return }
    modoCam = 'manual'; irA({ x: mia.x, y: mia.y, s: encuadre.s * 4 })
  })
}

async function cargarPerfiles() {
  try {
    for (let desde = 0; ; desde += 1000) {     // Supabase devuelve máx. 1000 filas por pedido
      const { data, error } = await sb.rpc('get_profiles_with_vote_counts').range(desde, desde + 999)
      if (error) throw error
      ;(data || []).forEach(r => perfiles.set(r.seat_number, r))
      if (!data || data.length < 1000) break
    }
  } catch (e) { console.warn('cargarPerfiles:', e) }
}

async function cargarHemiciclo() {
  try {
    const { data, error } = await sb.rpc('get_butaca_count')
    if (error) throw error
    totalButacas = Number(data) || 0
    $('#st-butacas').textContent = fmtNum(totalButacas)
    asientos = calcularAsientos(Math.max(totalButacas, estado.butaca))
    dibujarHemiciclo()
    cargarPerfiles()
  } catch (e) { console.warn('cargarHemiciclo:', e) }
}

// ── Votación activa ─────────────────────────────────────────────
let pregunta = null
async function cargarVotacion() {
  try {
    const { data, error } = await sb.from('questions')
      .select('id, text, category, description, ends_at, status')
      .eq('status', 'activa').gt('ends_at', new Date().toISOString())
      .order('ends_at', { ascending: true }).limit(1)
    if (error) throw error
    pregunta = data?.[0] || null
  } catch (e) { console.warn('cargarVotacion:', e); pregunta = null }

  $('#pill-live').hidden = !pregunta
  if (!pregunta) {
    $('#q-cat').textContent = 'Sin sesión'
    $('#q-timer').textContent = '—'
    $('#q-state').textContent = ''
    $('#q-text').textContent = 'No hay votaciones activas en este momento.'
    $('#q-votar').setAttribute('aria-disabled', 'true')
    $('#st-votos').textContent = '0'
    return
  }
  $('#q-cat').textContent = pregunta.category || 'General'
  $('#q-text').textContent = pregunta.text
  $('#q-debate').href = '#debates/' + pregunta.id
  $('#q-votar').removeAttribute('aria-disabled')
  tickVotacion()
  try {
    const { data } = await sb.rpc('get_question_votes', { p_question_id: pregunta.id })
    const total = (data || []).reduce((a, r) => a + Number(r.total || 0), 0)
    $('#st-votos').textContent = fmtNum(total)
  } catch (e) {}
}

function tickVotacion() {
  if (!pregunta) return
  const s = Math.floor((new Date(pregunta.ends_at) - Date.now()) / 1000)
  if (s <= 0) {
    $('#q-timer').textContent = '00:00:00'; $('#q-state').textContent = 'Finalizada'
    $('#q-votar').setAttribute('aria-disabled', 'true'); $('#pill-live').hidden = true
    return
  }
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60
  $('#q-timer').textContent = [h, m, ss].map(v => String(v).padStart(2, '0')).join(':')
  $('#q-state').textContent = 'En curso'
}

// ── Votaciones ──────────────────────────────────────────────────
// Mismo mecanismo de voto secreto que la versión actual: se sella con un código al azar (nonce) y su hash.
// El voto se guarda con un token anónimo calculado en el servidor; nunca viaja la identidad.
let vPreguntas = [], vResultados = new Map(), vMisVotos = new Set(), vFiltro = 'abiertas'
const OPC = { si: ['Sí', '✓'], no: ['No', '✕'], abs: ['Abstención', '—'] }
const abierta = q => q.status === 'activa' && new Date(q.ends_at) > new Date()

function cuentaRegresiva(ends) {
  const s = Math.floor((new Date(ends) - Date.now()) / 1000)
  if (s <= 0) return 'Finalizada'
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60
  return [h, m, ss].map(v => String(v).padStart(2, '0')).join(':')
}

async function cargarVotaciones() {
  try {
    const [{ data: qs, error }, { data: res }] = await Promise.all([
      sb.from('questions').select('id, text, category, description, ends_at, status, video_url, links')
        .in('status', ['activa', 'cerrada']).order('ends_at', { ascending: false }).limit(40),
      sb.rpc('get_all_question_results'),
    ])
    if (error) throw error
    vPreguntas = qs || []
    vResultados = new Map((res || []).map(r => [r.id, r]))
    if (estado.user) {
      const abiertas = vPreguntas.filter(abierta)
      // Solo si participé, nunca qué voté
      const { data: part } = await sb.rpc('v2_mis_participaciones')
      ;(part || []).forEach(id => vMisVotos.add(id))
    }
  } catch (e) { console.warn('cargarVotaciones:', e) }
  pintarVotaciones()
}

function enlacesDe(q) {
  const links = Array.isArray(q.links) ? q.links : []
  const items = []
  if (q.video_url && /^https?:\/\//.test(q.video_url)) items.push(`<a href="${esc(q.video_url)}" target="_blank" rel="noopener noreferrer">▶ Ver video</a>`)
  links.forEach(l => {
    const url = typeof l === 'string' ? l : l?.url
    const txt = typeof l === 'string' ? 'Enlace' : (l?.label || l?.title || 'Enlace')
    if (url && /^https?:\/\//.test(url)) items.push(`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(txt)}</a>`)
  })
  return items.length ? `<div class="v-links">${items.join('')}</div>` : ''
}

function resultadosDe(q) {
  const r = vResultados.get(q.id)
  const total = Number(r?.total || 0)
  if (!total) return '<p class="muted">Sin votos registrados.</p>'
  const filas = [['si', 'var(--voto-si)'], ['no', 'var(--voto-no)'], ['abs', 'var(--voto-abs)']].map(([k, c]) => {
    const n = Number(r['cnt_' + k] || 0), pct = Math.round(n / total * 100)
    return `<div class="res-row"><b>${OPC[k][0]}</b><div class="res-bar"><i style="width:${pct}%;background:${c}"></i></div><span>${pct}% · ${fmtNum(n)}</span></div>`
  }).join('')
  const gana = ['si', 'no', 'abs'].reduce((a, k) => Number(r['cnt_' + k]) > Number(r['cnt_' + a]) ? k : a, 'si')
  return `<div class="res">${filas}</div><p class="res-gana">Decisión del Cabildo: <b>${OPC[gana][0]}</b> · ${fmtNum(total)} votos</p>`
}

function pintarVotaciones() {
  const lista = $('#vlist')
  const abiertas = vPreguntas.filter(abierta).sort((a, b) => new Date(a.ends_at) - new Date(b.ends_at))
  const cerradas = vPreguntas.filter(q => !abierta(q))
  $('#vc-abiertas').textContent = abiertas.length ? `(${abiertas.length})` : ''
  const qs = vFiltro === 'abiertas' ? abiertas : cerradas
  if (!qs.length) {
    lista.innerHTML = `<div class="card soon"><h3 style="margin:0 0 6px">${vFiltro === 'abiertas' ? 'No hay votaciones abiertas' : 'Todavía no hay resultados'}</h3>
      <p class="muted" style="margin:0">${vFiltro === 'abiertas' ? 'Cuando se abra una nueva sesión la vas a ver acá.' : ''}</p></div>`
    return
  }
  lista.innerHTML = qs.map(q => {
    const mio = vMisVotos.has(q.id)
    const pie = vFiltro === 'abiertas'
      ? (mio
          ? `<span class="v-mio"><svg viewBox="0 0 24 24"><path d="m5 12 4 4 10-10"/></svg>Ya votaste</span>`
          : `<button class="btn btn-dark" data-votar="${q.id}"><svg viewBox="0 0 24 24"><path d="M5 20V10M12 20V4M19 20v-7"/></svg>Votar</button>`)
        + `<a class="btn btn-soft" href="#debates/${q.id}"><svg viewBox="0 0 24 24"><path d="M5 5h14v10H9l-4 4z"/></svg>Debate</a>`
      : resultadosDe(q)
    return `<article class="card vcard">
      <div class="vcard-top"><span class="tag">${esc(q.category || 'General')}</span>
        ${vFiltro === 'abiertas'
          ? `<b class="q-timer" data-cuenta="${esc(q.ends_at)}">${cuentaRegresiva(q.ends_at)}</b><small>para votar</small>`
          : `<small>Cerró el ${new Date(q.ends_at).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })}</small>`}
      </div>
      <h3>${esc(q.text)}</h3>
      ${q.description ? `<p class="v-desc">${esc(q.description)}</p>` : ''}
      ${enlacesDe(q)}
      ${vFiltro === 'abiertas' ? `<div class="vcard-foot">${pie}</div>` : `<div class="vcard-res">${pie}</div>`}
    </article>`
  }).join('')
}

function tickCuentas() {
  $$('[data-cuenta]').forEach(el => { el.textContent = cuentaRegresiva(el.dataset.cuenta) })
  if (!$('#modal-voto').hidden && mvPregunta) $('#mv-timer').textContent = cuentaRegresiva(mvPregunta.ends_at)
}

// ── Modal de voto ──
let mvPregunta = null, mvEleccion = null
function abrirVoto(q) {
  mvPregunta = q; mvEleccion = null
  $('#mv-cat').textContent = q.category || 'General'
  $('#mv-timer').textContent = cuentaRegresiva(q.ends_at)
  $('#mv-pregunta').textContent = q.text
  $('#mv-desc').textContent = q.description || ''
  $('#modal-voto').hidden = false
  document.body.style.overflow = 'hidden'
  pasoVoto()
}
function cerrarVoto() { $('#modal-voto').hidden = true; document.body.style.overflow = '' }

async function pasoVoto() {
  const c = $('#mv-cuerpo'), q = mvPregunta
  if (!estado.user) {
    c.innerHTML = `<div class="mv-nota">Para votar tenés que iniciar sesión.</div><a class="btn btn-dark" style="width:100%" href="${APP_ACTUAL}">Iniciar sesión</a>`; return
  }
  if (!estado.butaca) {
    c.innerHTML = `<div class="mv-nota">Para votar necesitás tener butaca: completá la verificación de identidad.</div><a class="btn btn-dark" style="width:100%" href="${APP_ACTUAL}">Verificarme</a>`; return
  }
  if (!abierta(q)) { c.innerHTML = '<div class="mv-nota">Esta votación ya cerró.</div>'; return }
  if (!vMisVotos.has(q.id)) {
    const { data } = await sb.rpc('v2_mis_participaciones')
    ;(data || []).forEach(id => vMisVotos.add(id))
  }
  if (vMisVotos.has(q.id)) {
    c.innerHTML = `<div class="mv-ok"><div class="sello"><svg viewBox="0 0 24 24"><path d="m5 12 4 4 10-10"/></svg></div>
      <h3>Ya votaste en esta sesión</h3><p>Tu voto quedó sellado. Los resultados se publican al cerrar la votación.</p>
      <button class="btn btn-ghost" id="mv-listo">Cerrar</button></div>`
    $('#mv-listo').onclick = cerrarVoto; return
  }
  c.innerHTML = `
    <div class="opciones">${['si', 'no', 'abs'].map(k => `
      <button class="opcion ${k}${mvEleccion === k ? ' elegida' : ''}" data-op="${k}"><span class="o-ico">${OPC[k][1]}</span>${OPC[k][0]}</button>`).join('')}
    </div>
    <div class="mv-nota"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
      <span>Tu voto es secreto y definitivo: se sella con un código único y no se puede cambiar.</span></div>
    <div class="mv-acciones">
      <button class="btn btn-ghost" id="mv-cancelar">Cancelar</button>
      <button class="btn btn-dark" id="mv-confirmar" ${mvEleccion ? '' : 'aria-disabled="true"'}>${mvEleccion ? 'Confirmar: ' + OPC[mvEleccion][0] : 'Elegí una opción'}</button>
    </div>`
  $$('[data-op]', c).forEach(b => b.onclick = () => { mvEleccion = b.dataset.op; pasoVoto() })
  $('#mv-cancelar').onclick = cerrarVoto
  $('#mv-confirmar').onclick = confirmarVoto
}

async function confirmarVoto() {
  const q = mvPregunta, voto = mvEleccion
  if (!q || !voto) return
  if (!abierta(q)) { aviso('La votación ya cerró.', 'error'); pasoVoto(); return }
  const btn = $('#mv-confirmar'); btn.setAttribute('aria-disabled', 'true'); btn.textContent = 'Sellando…'
  // Sello: nonce aleatorio + SHA-256(voto:nonce), igual que la versión actual
  const arr = new Uint8Array(32); crypto.getRandomValues(arr)
  const nonce = [...arr].map(b => b.toString(16).padStart(2, '0')).join('')
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${voto}:${nonce}`))
  const hash = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
  const { data, error } = await sb.rpc('cast_vote', { p_question_id: q.id, p_vote_hash: hash, p_vote_plain: voto, p_nonce: nonce })
  const err = error?.message || (data && data.ok === false ? data.error : null)
  if (err) { aviso(err, 'error'); pasoVoto(); return }
  // Igual que la versión actual: el comprobante queda solo en este navegador
  try {
    const guardados = JSON.parse(localStorage.getItem('cabildoos_votos') || '{}')
    guardados[q.id] = { voto, nonce, hash, ts: Date.now() }
    localStorage.setItem('cabildoos_votos', JSON.stringify(guardados))
  } catch (e) {}
  vMisVotos.add(q.id)
  $('#mv-cuerpo').innerHTML = `<div class="mv-ok"><div class="sello"><svg viewBox="0 0 24 24"><path d="m5 12 4 4 10-10"/></svg></div>
    <h3>¡Voto sellado!</h3><p>Votaste <b>${OPC[voto][0]}</b>. Los resultados se publican al cerrar la votación.</p>
    <code title="Comprobante">Comprobante: ${hash}</code>
    <button class="btn btn-dark" id="mv-listo">Listo</button></div>`
  $('#mv-listo').onclick = cerrarVoto
  cargarVotacion()
  if (location.hash === '#votaciones') pintarVotaciones()
}

// ── Muro del día ────────────────────────────────────────────────
const COLORES = { white: '#9ca3af', cyan: '#22d3ee', black: '#374151', orange: '#f97316', red: '#e11d48', pink: '#ec4899', purple: '#8b5cf6', blue: '#0ea5e9', indigo: '#6366f1', green: '#16a34a', teal: '#14b8a6', yellow: '#eab308', gray: '#64748b' }
const colorDe = (c, seed) => COLORES[c] || Object.values(COLORES)[Math.abs([...String(seed)].reduce((a, ch) => a + ch.charCodeAt(0), 0)) % 10]
function haceCuanto(ts) {
  const d = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (d < 60) return 'ahora'
  if (d < 3600) return `hace ${Math.floor(d / 60)} min`
  if (d < 86400) return `hace ${Math.floor(d / 3600)} h`
  return `hace ${Math.floor(d / 86400)} d`
}

async function cargarMuro() {
  const ul = $('#muro-list')
  if (!estado.user) { ul.innerHTML = '<li class="muted">Iniciá sesión para ver el Muro del día.</li>'; return }
  try {
    const dayKey = new Date(Date.now() - 7 * 3600e3).toISOString().slice(0, 10)   // igual que la versión actual
    const { data, error } = await sb.from('muro_posts')
      .select('id, alias, card_color, body, created_at, likes_count, muro_replies(count)')
      .eq('day_key', dayKey).order('created_at', { ascending: false }).limit(3)
    if (error) throw error
    if (!data?.length) { ul.innerHTML = '<li class="muted">Todavía no hay publicaciones hoy.</li>'; return }
    ul.innerHTML = data.map(p => {
      const alias = p.alias || 'Ciudadano'
      const resp = p.muro_replies?.[0]?.count ?? 0
      return `<li>
        <span class="m-av" style="background:${colorDe(p.card_color, p.id)}">${esc(alias.charAt(0).toUpperCase())}</span>
        <div>
          <div class="m-meta"><b>${esc(alias)}</b><span>${haceCuanto(p.created_at)}</span></div>
          <p class="m-body">${esc(p.body)}</p>
          <div class="m-stats">
            <span><svg class="heart" viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>${fmtNum(p.likes_count)}</span>
            <span><svg viewBox="0 0 24 24"><path d="M5 5h14v10H9l-4 4z"/></svg>${fmtNum(resp)}</span>
          </div>
        </div></li>`
    }).join('')
  } catch (e) { console.warn('cargarMuro:', e); ul.innerHTML = '<li class="muted">No se pudo cargar el Muro.</li>' }
}

// ── Bloques ─────────────────────────────────────────────────────
async function cargarBloques() {
  try {
    const { data, error } = await sb.rpc('bloques_listar')
    if (error) throw error
    estado.bloques = data || []
  } catch (e) { console.warn('cargarBloques:', e); estado.bloques = [] }
  if (estado.butaca) {
    try { const { data } = await sb.rpc('bloque_mi_estado'); estado.miBloque = data } catch (e) {}
    await cargarSolicitudBloque()
  }
  pintarBloques()
}

const ICON_GRUPO = '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3 19a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M21 19a6 6 0 0 0-4-5.7"/></svg>'

function botonSumarse(b) {
  const mio = estado.miBloque?.bloque_id === b.id
  if (mio) return '<span class="btn btn-ghost" aria-disabled="true">Tu bloque</span>'
  return `<button class="btn btn-ghost" data-unirme="${b.id}">Sumarse</button>`
}

function filaBloque(b) {
  const av = b.anfitrion_foto
    ? `<img class="b-av" src="${esc(b.anfitrion_foto)}" alt="">`
    : `<span class="b-av" style="background:${colorDe(null, b.id)}">${esc(b.nombre.charAt(0))}</span>`
  return `<div class="b-row">${av}
    <div><h4>${esc(b.nombre)}</h4><p>${esc(b.lema || '')}</p><p>Anfitrión: ${esc(b.anfitrion_nombre)}</p>
      <div class="b-mini"><span>👥 ${fmtNum(b.miembros)}</span><span>💡 ${fmtNum(b.ideas)}</span></div></div>
    ${botonSumarse(b)}</div>`
}

function heroBloque(b) {
  return `<div class="b-hero${b.anfitrion_foto ? '' : ' sin-foto'}">
    ${b.anfitrion_foto ? `<img src="${esc(b.anfitrion_foto)}" alt="">` : ''}
    <div class="b-info">
      <h3>${esc(b.nombre)}</h3><span class="ve-line"></span>
      <p>${esc(b.lema || '')}</p>
      <small>Anfitrión del bloque</small><span class="b-host">${esc(b.anfitrion_nombre)}</span>
    </div>
    <div class="b-stats"><span><b>${fmtNum(b.miembros)}</b>Ciudadanos</span><span><b>${fmtNum(b.ideas)}</b>Ideas</span></div>
    ${estado.miBloque?.bloque_id === b.id
      ? '<span class="btn" aria-disabled="true">Ya sos parte de este bloque</span>'
      : `<button class="btn" data-unirme="${b.id}">Sumarse al bloque</button>`}
  </div>`
}

function pintarBloques() {
  const body = $('#bloques-body')
  if (estado.tab === 'crear') { body.innerHTML = vistaCrear(); return }
  const q = ($('#bloque-buscar').value || '').trim().toLowerCase()
  const lista = estado.bloques.filter(b => !q || [b.nombre, b.lema, b.anfitrion_nombre].some(v => (v || '').toLowerCase().includes(q)))
  if (!estado.bloques.length) {
    body.innerHTML = `<div class="empty"><div class="e-icon">${ICON_GRUPO}</div>
      <h3>Todavía no hay bloques</h3><p>Sé el primero en reunir ciudadanos alrededor de tus ideas.</p>
      <button class="btn btn-accent" data-tab-go="crear">Crear bloque</button></div>`
    return
  }
  if (!lista.length) { body.innerHTML = '<p class="muted">No hay bloques que coincidan con tu búsqueda.</p>'; return }
  body.innerHTML = estado.tab === 'destacados'
    ? heroBloque(lista[0]) + lista.slice(1, 4).map(filaBloque).join('') +
      (lista.length > 4 ? '<button class="btn btn-ghost" data-tab-go="todos">Ver todos los bloques →</button>' : '')
    : lista.map(filaBloque).join('')
}

async function unirme(id) {
  if (!estado.user) { location.href = APP_ACTUAL; return }
  if (!estado.butaca) { aviso('Necesitás tener butaca para sumarte a un bloque.', 'error'); return }
  const { error } = await sb.rpc('bloque_unirme', { p_bloque: id })
  if (error) { aviso(error.message, 'error'); return }
  aviso('¡Te sumaste al bloque!')
  cargarBloques()
}

// ── Inicio ──────────────────────────────────────────────────────
function enlazar() {
  window.addEventListener('hashchange', ruta)
  $('#menu-btn').addEventListener('click', abrirMenu)
  $('#scrim').addEventListener('click', cerrarMenu)
  $('#theme-btn').addEventListener('click', alternarTema)
  $('#bloque-buscar').addEventListener('input', pintarBloques)
  $('#q-votar').addEventListener('click', e => { e.preventDefault(); if (pregunta) abrirVoto(pregunta) })
  $('#pill-live').addEventListener('click', e => { e.preventDefault(); location.hash = '#votaciones' })
  $('#mv-cerrar').addEventListener('click', cerrarVoto)
  $('#modal-voto').addEventListener('click', e => { if (e.target.id === 'modal-voto') cerrarVoto() })
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal-voto').hidden) cerrarVoto() })
  $$('[data-vfiltro]').forEach(b => b.addEventListener('click', () => {
    vFiltro = b.dataset.vfiltro
    $$('[data-vfiltro]').forEach(x => x.classList.toggle('active', x === b))
    pintarVotaciones()
  }))
  $('#vlist').addEventListener('click', e => {
    const b = e.target.closest('[data-votar]'); if (!b) return
    const q = vPreguntas.find(x => x.id === b.dataset.votar); if (q) abrirVoto(q)
  })
  $$('.tab').forEach(t => t.addEventListener('click', () => irATab(t.dataset.tab)))
  $('#bloques-body').addEventListener('click', e => {
    const u = e.target.closest('[data-unirme]'); if (u) return unirme(u.dataset.unirme)
    const g = e.target.closest('[data-tab-go]'); if (g) irATab(g.dataset.tabGo)
  })
  // Redibujar el hemiciclo cuando cambia el tamaño de su caja (ventana o columnas plegadas)
  let rz; new ResizeObserver(() => { clearTimeout(rz); rz = setTimeout(dibujarHemiciclo, 60) }).observe($('.hemi-wrap'))
  enlazarHemiciclo()
  $('#side-toggle').addEventListener('click', () => plegar('side'))
  $('#panel-toggle').addEventListener('click', () => plegar('panel'))
  $('#panel-open').addEventListener('click', () => plegar('panel'))
  for (const k of ['side', 'panel']) {
    try { if (localStorage.getItem('ux2_plegado_' + k) === '1') $('.app').classList.add(k + '-plegado') } catch (e) {}
  }
}

// Recargar SOLO si cambia el usuario (login/logout en otra pestaña), y nunca más de una vez por minuto.
// Se activa recién después de saber quién es el usuario, para no confundir el aviso inicial de Supabase.
function vigilarSesion() {
  const idInicial = estado.user?.id || null
  sb.auth.onAuthStateChange((ev, session) => {
    if (ev !== 'SIGNED_IN' && ev !== 'SIGNED_OUT') return
    const idNuevo = session?.user?.id || null
    if (idNuevo === idInicial) return
    try {
      const ultima = Number(sessionStorage.getItem('ux2_recarga') || 0)
      if (Date.now() - ultima < 60_000) return
      sessionStorage.setItem('ux2_recarga', String(Date.now()))
    } catch (e) { return }
    location.reload()
  })
}

// ── Mi Butaca ───────────────────────────────────────────────────
// Perfil (alias, frase, color), privacidad, actividad propia y bloque.
// Todo se guarda con las mismas funciones del servidor que usa la versión actual.
const PALETA = [
  ['orange', 'Naranja', '#f76a1e'], ['yellow', 'Amarillo', '#f59e0b'], ['green', 'Verde', '#34d399'], ['cyan', 'Cyan', '#22d3ee'],
  ['red', 'Rojo', '#f87171'], ['pink', 'Rosa', '#f472b6'], ['white', 'Blanco', '#d1d5db'], ['black', 'Negro', '#6b7280'],
]
const LIM = { alias: 40, phrase: 200 }
const mb = { cargando: false, total: 0, cerradas: 0 }
const vistaActual = () => $$('.view').find(v => !v.hidden)?.dataset.view

const limpiar = s => String(s ?? '').replace(/<[^>]*>/g, '').replace(/javascript\s*:/gi, '')
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim()

function confirmar(titulo, texto, boton = 'Confirmar', peligro = false) {
  return new Promise(res => {
    const m = $('#modal-conf')
    $('#mc-titulo').textContent = titulo; $('#mc-texto').textContent = texto
    const si = $('#mc-si'); si.textContent = boton; si.classList.toggle('btn-peligro', peligro)
    const fin = v => { m.hidden = true; document.removeEventListener('keydown', esc_); res(v) }
    const esc_ = e => { if (e.key === 'Escape') fin(false) }
    si.onclick = () => fin(true); $('#mc-no').onclick = () => fin(false)
    m.onclick = e => { if (e.target === m) fin(false) }
    document.addEventListener('keydown', esc_)
    m.hidden = false; si.focus()
  })
}

async function cargarMiButaca() {
  if (!estado.user || !estado.butaca) return pintarMiButaca()
  if (mb.cargando) return
  mb.cargando = true
  try {
    const [{ data: ident }, { data: st }, { data: cer }] = await Promise.all([
      sb.rpc('get_my_seat_identity'),
      sb.rpc('v2_mis_participaciones'),
      sb.from('questions').select('id').eq('status', 'cerrada'),
    ])
    estado.ident = (Array.isArray(ident) ? ident[0] : ident) || {}
    // Solo participación: en qué votaciones estuve, nunca qué voté
    const cerradas = new Set((cer || []).map(q => q.id))
    mb.total = (st || []).length
    mb.cerradas = (st || []).filter(id => cerradas.has(id)).length
  } catch (e) { console.warn('cargarMiButaca:', e) }
  mb.cargando = false
  pintarMiButaca()
}

function interruptor(campo, on, titulo, ayuda) {
  return `<div class="mb-fila">
    <div><b>${titulo}</b><small>${ayuda}</small></div>
    <button class="switch ${on ? 'on' : ''}" role="switch" aria-checked="${on}" data-visib="${campo}" aria-label="${titulo}"><i></i></button>
  </div>`
}

function pintarMiButaca() {
  const c = $('#mb-cuerpo')
  if (!c) return
  if (!estado.cargado) { c.innerHTML = '<p class="muted">Cargando…</p>'; return }
  if (!estado.user) {
    c.innerHTML = `<div class="card soon"><h3 style="margin:0 0 6px">Iniciá sesión</h3>
      <p class="muted">Para ver tu butaca tenés que entrar con tu cuenta.</p><a class="btn btn-dark" href="${APP_ACTUAL}">Iniciar sesión</a></div>`
    return
  }
  if (!estado.butaca) {
    c.innerHTML = `<div class="card soon"><h3 style="margin:0 0 6px">Todavía no tenés butaca</h3>
      <p class="muted">Completá la verificación de identidad y se te asigna tu lugar en el hemiciclo.</p>
      <a class="btn btn-dark" href="${APP_ACTUAL}">Verificarme</a></div>`
    return
  }
  const id = estado.ident || {}
  const color = PALETA.find(p => p[0] === id.card_color) || PALETA[0]
  const muestraAlias = !!(id.show_alias && id.alias)
  const publico = muestraAlias
  const total = mb.total

  // Bloque
  const me = estado.miBloque || {}
  const b = me.bloque_id ? estado.bloques.find(x => x.id === me.bloque_id) : null
  const espera = me.puedo_sumarme_desde && new Date(me.puedo_sumarme_desde) > new Date() ? new Date(me.puedo_sumarme_desde) : null
  const bloqueHtml = me.bloque_id
    ? `<div class="mb-bloque"><span class="mb-bl-av">${esc((b?.nombre || 'B').charAt(0))}</span>
        <div><b>${esc(b?.nombre || 'Tu bloque')}</b><small>${me.soy_anfitrion ? 'Sos el anfitrión' : 'Sos miembro'}${b ? ` · ${fmtNum(b.miembros)} miembros` : ''}</small></div></div>
       ${me.soy_anfitrion
         ? '<p class="muted mb-nota">Como anfitrión, para salir tenés que cerrar el bloque.</p>'
         : `<button class="btn btn-ghost" id="mb-salir">Salir del bloque</button>
            <p class="muted mb-nota">Si salís, vas a poder sumarte a otro bloque recién en ${me.dias_espera || 30} días.</p>`}`
    : espera
      ? `<p class="muted mb-nota" style="margin:0">Saliste de un bloque hace poco. Vas a poder sumarte a otro desde el <b>${espera.toLocaleDateString('es-VE', { day: 'numeric', month: 'long' })}</b>.</p>`
      : `<p class="muted mb-nota" style="margin:0 0 12px">Todavía no formás parte de ningún bloque.</p>
         <button class="btn btn-ghost" id="mb-ver-bloques">Explorar bloques</button>`

  c.innerHTML = `
  <div class="mb-grid">
   <div class="mb-col">
    <article class="card mb-id">
      <span class="mb-av" style="background:${color[2]}">${muestraAlias ? esc(id.alias.charAt(0).toUpperCase()) : '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/></svg>'}</span>
      <div class="mb-id-txt">
        <small>Butaca</small><b class="mb-num">#${estado.butaca}</b>
        <span class="mb-nombre">${esc(id.alias || 'Sin alias')}</span>
        <span class="sc-badge ${publico ? 'pub' : ''}">${publico ? 'Público' : 'Anónimo'}</span>
      </div>
      <div class="mb-preview">
        <small>Así te ven los demás en el hemiciclo</small>
        <div class="mb-preview-card">
          <b>${esc(muestraAlias ? id.alias : 'Ciudadano anónimo')}</b>
          ${id.show_phrase && id.phrase ? `<p>“${esc(id.phrase)}”</p>` : ''}
          ${id.show_votes ? `<span>${fmtNum(total)} votaciones</span>` : ''}
        </div>
      </div>
      <button class="btn btn-dark" id="mb-ver-hemi"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>Ver en el hemiciclo</button>
    </article>
    <article class="card mb-sec mb-o4">
      <h3>Mi actividad</h3>
      <p class="muted mb-nota">Solo contamos en cuántas votaciones participaste. Qué votaste no se muestra en ningún lado.</p>
      <div class="mb-kpis"><div><b>${fmtNum(total)}</b><small>Votaciones en las que participé</small></div><div><b>${fmtNum(mb.cerradas)}</b><small>En decisiones cerradas</small></div></div>
    </article>
    <article class="card mb-sec mb-o6">
      <h3>Cuenta</h3>
      <p class="mb-email">${esc(estado.user.email || '')}</p>
      <button class="btn btn-ghost" id="mb-salir-sesion">Cerrar sesión</button>
    </article>
   </div>
   <div class="mb-col">
    <article class="card mb-sec mb-o2">
      <h3>Perfil</h3>
      <label class="mb-campo"><span>Alias <em data-cont="alias"></em></span>
        <div class="mb-input"><input id="mb-alias" maxlength="${LIM.alias}" value="${esc(id.alias || '')}" placeholder="Cómo querés que te vean" autocomplete="off">
        <button class="btn btn-dark" data-guardar="alias">Guardar</button></div></label>
      <label class="mb-campo"><span>Frase <em data-cont="phrase"></em></span>
        <div class="mb-input"><textarea id="mb-phrase" maxlength="${LIM.phrase}" rows="2" placeholder="Una frase que te represente">${esc(id.phrase || '')}</textarea>
        <button class="btn btn-dark" data-guardar="phrase">Guardar</button></div></label>
      <div class="mb-campo"><span>Color de tu tarjeta</span>
        <div class="mb-colores">${PALETA.map(([k, n, h]) => `<button class="mb-color ${k === color[0] ? 'active' : ''}" data-color="${k}" title="${n}" aria-label="${n}" style="background:${h}"></button>`).join('')}</div></div>
    </article>
    <article class="card mb-sec mb-o3">
      <h3>Privacidad</h3>
      <p class="muted mb-nota">Por defecto sos anónimo. <b>Qué votaste nunca se muestra</b>, a nadie.</p>
      ${interruptor('alias', !!id.show_alias, 'Mostrar mi alias', 'Tu butaca deja de ser anónima')}
      ${interruptor('phrase', !!id.show_phrase, 'Mostrar mi frase', 'Aparece en tu tarjeta del hemiciclo')}
      ${interruptor('votes', !!id.show_votes, 'Mostrar en cuántas votaciones participé', 'Solo la cantidad, nunca el voto')}
    </article>
    <article class="card mb-sec mb-o5">
      <h3>Mi bloque</h3>
      ${bloqueHtml}
    </article>
   </div>
  </div>`
  contarCampos()
}

function contarCampos() {
  ;['alias', 'phrase'].forEach(k => {
    const el = $('#mb-' + k), cnt = $(`[data-cont="${k}"]`)
    if (el && cnt) cnt.textContent = `${el.value.length}/${LIM[k]}`
  })
}

// Refleja mis cambios en el hemiciclo sin recargar
function reflejarEnHemiciclo() {
  const id = estado.ident || {}, p = perfiles.get(estado.butaca) || { seat_number: estado.butaca }
  Object.assign(p, { alias: id.alias, phrase: id.phrase, show_alias: !!id.show_alias, show_phrase: !!id.show_phrase, show_votes: !!id.show_votes, card_color: id.card_color })
  perfiles.set(estado.butaca, p)
}

async function guardarCampo(campo, btn) {
  const el = $('#mb-' + campo)
  const val = limpiar(el.value).slice(0, LIM[campo])
  if (campo === 'alias' && val && val.length < 2) { aviso('El alias tiene que tener al menos 2 caracteres.', 'error'); return }
  if ((estado.ident?.[campo] || '') === val) { aviso('No hay cambios para guardar.'); return }
  btn.disabled = true
  const { error } = await sb.rpc('save_my_seat_field', { p_field: campo, p_value: val || null })
  btn.disabled = false
  if (error) {
    aviso(error.code === '23505' ? 'Ese alias ya lo usa otra butaca. Probá con otro.' : 'No se pudo guardar. Intentá de nuevo.', 'error')
    return
  }
  estado.ident[campo] = val || null
  if (campo === 'alias') { estado.alias = val || null; pintarUsuario() }
  reflejarEnHemiciclo(); pintarMiButaca()
  aviso(campo === 'alias' ? '✓ Alias guardado' : '✓ Frase guardada')
}

async function guardarColor(color) {
  if (estado.ident?.card_color === color) return
  const { error } = await sb.rpc('save_my_seat_field', { p_field: 'card_color', p_value: color })
  if (error) { aviso('No se pudo guardar el color.', 'error'); return }
  estado.ident.card_color = color
  reflejarEnHemiciclo(); pintarMiButaca()
  aviso('✓ Color guardado')
}

async function cambiarVisibilidad(campo) {
  const id = estado.ident || {}
  const llave = { alias: 'show_alias', phrase: 'show_phrase', votes: 'show_votes' }[campo]
  const nuevo = !id[llave]
  const que = { alias: 'tu alias', phrase: 'tu frase', votes: 'en cuántas votaciones participaste' }[campo]
  if (nuevo && campo === 'alias' && !id.alias) { aviso('Primero guardá un alias.', 'error'); return }
  if (nuevo && campo === 'phrase' && !id.phrase) { aviso('Primero guardá una frase.', 'error'); return }
  const ok = await confirmar(
    nuevo ? `¿Mostrar ${que}?` : `¿Ocultar ${que}?`,
    nuevo ? 'Va a ser visible para todos los ciudadanos del Cabildo de forma inmediata. Lo podés volver a ocultar cuando quieras.'
          : 'Deja de ser visible para todos de forma inmediata.',
    nuevo ? 'Sí, mostrar' : 'Sí, ocultar')
  if (!ok) return
  const v = { show_alias: !!id.show_alias, show_phrase: !!id.show_phrase, show_votes: !!id.show_votes, [llave]: nuevo }
  const { error } = await sb.rpc('set_profile_visibility', { p_show_alias: v.show_alias, p_show_phrase: v.show_phrase, p_show_votes: v.show_votes })
  if (error) { aviso('No se pudo guardar. Intentá de nuevo.', 'error'); return }
  Object.assign(estado.ident, v)
  reflejarEnHemiciclo(); pintarMiButaca()
  aviso(nuevo ? '✓ Ahora es visible' : '✓ Ahora es privado')
}

async function salirDelBloque() {
  const dias = estado.miBloque?.dias_espera || 30
  const ok = await confirmar('¿Salir del bloque?', `Vas a dejar de ver sus ideas y debates internos, y no vas a poder sumarte a otro bloque durante ${dias} días.`, 'Sí, salir', true)
  if (!ok) return
  const { error } = await sb.rpc('bloque_salir')
  if (error) { aviso(error.message || 'No se pudo salir del bloque.', 'error'); return }
  aviso('Saliste del bloque.')
  await cargarBloques()
  pintarMiButaca()
}

function enlazarMiButaca() {
  const c = $('#mb-cuerpo')
  if (!c) return
  c.addEventListener('input', e => { if (e.target.matches('#mb-alias, #mb-phrase')) contarCampos() })
  c.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'mb-alias') { e.preventDefault(); guardarCampo('alias', $('[data-guardar="alias"]')) }
  })
  c.addEventListener('click', async e => {
    const t = e.target.closest('button')
    if (!t) return
    if (t.dataset.guardar) return guardarCampo(t.dataset.guardar, t)
    if (t.dataset.color) return guardarColor(t.dataset.color)
    if (t.dataset.visib) return cambiarVisibilidad(t.dataset.visib)
    if (t.id === 'mb-salir') return salirDelBloque()
    if (t.id === 'mb-ver-bloques') {
      if ($('.app').classList.contains('panel-plegado')) plegar('panel')
      irATab('todos'); $('#panel-bloques').scrollIntoView({ behavior: 'smooth' }); return
    }
    if (t.id === 'mb-ver-hemi') {
      location.hash = '#inicio'
      setTimeout(() => $('#hz-mia')?.click(), 400); return
    }
    if (t.id === 'mb-salir-sesion') {
      if (!await confirmar('¿Cerrar sesión?', 'Se cierra también en la versión actual del Cabildo en este navegador.', 'Cerrar sesión')) return
      await sb.auth.signOut(); location.href = '/ux2/'
    }
  })
}

// ── Debates ─────────────────────────────────────────────────────
// Mismo canal en vivo que la versión actual (debate:<id>): mensajes y cola de manos compartidos.
// El servidor valida butaca propia, debate abierto, largo y turno; esto es solo la interfaz.
const DB_COOLDOWN = 60        // segundos entre mensajes (igual que la versión actual)
const DB_DIRECTO  = 3         // con ≤3 manos levantadas se habla directo
const dbt = { lista: [], q: null, msgs: [], canal: null, mano: 'idle', cola: [], finCd: 0, tick: null }

const dbAbierto = q => q && q.status === 'activa' && new Date(q.ends_at) > new Date()

async function cargarDebates(id) {
  try {
    const { data, error } = await sb.from('questions').select('id, text, category, ends_at, status')
      .in('status', ['activa', 'cerrada']).order('ends_at', { ascending: false }).limit(30)
    if (error) throw error
    dbt.lista = (data || []).sort((a, b) => (dbAbierto(b) - dbAbierto(a)) || (new Date(b.ends_at) - new Date(a.ends_at)))
  } catch (e) { console.warn('cargarDebates:', e) }
  pintarListaDebates()
  const elegido = id || (window.innerWidth > 860 ? dbt.lista.find(dbAbierto)?.id || dbt.lista[0]?.id : null)
  if (elegido) abrirHilo(elegido); else pintarHilo()
}

function pintarListaDebates() {
  const l = $('#db-lista'); if (!l) return
  if (!dbt.lista.length) { l.innerHTML = '<p class="muted" style="padding:16px">Todavía no hay debates.</p>'; return }
  l.innerHTML = dbt.lista.map(q => `
    <button class="db-item ${dbt.q?.id === q.id ? 'active' : ''}" data-debate="${q.id}">
      <span class="db-item-top"><span class="tag">${esc(q.category || 'General')}</span>
        ${dbAbierto(q) ? '<span class="db-vivo"><i></i>En vivo</span>' : `<small>Cerró ${new Date(q.ends_at).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })}</small>`}</span>
      <b>${esc(q.text)}</b>
    </button>`).join('')
}

async function abrirHilo(id) {
  const q = dbt.lista.find(x => x.id === id)
  if (!q) return
  salirDelCanal()
  dbt.q = q; dbt.msgs = []
  $('.db-wrap')?.classList.add('con-hilo')
  pintarListaDebates(); pintarHilo(true)
  try {
    const { data, error } = await sb.from('debate_messages').select('id, seat_number, text, created_at')
      .eq('question_id', id).order('created_at', { ascending: true }).limit(500)
    if (error) throw error
    if (dbt.q?.id !== id) return
    dbt.msgs = data || []
  } catch (e) { console.warn('abrirHilo:', e) }
  pintarHilo()
  if (dbAbierto(q) && estado.user) entrarAlCanal(id)
}

function entrarAlCanal(id) {
  dbt.canal = sb.channel(`debate:${id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'debate_messages', filter: `question_id=eq.${id}` }, ({ new: m }) => {
      if (dbt.q?.id !== id || dbt.msgs.some(x => x.id === m.id)) return
      dbt.msgs.push(m); agregarMensaje(m)
    })
    .on('broadcast', { event: 'hand' }, ({ payload: p }) => {
      if (!p) return
      if (p.type === 'hand_up' && !dbt.cola.find(e => e.seat === p.seat)) {
        dbt.cola.push({ seat: p.seat, raisedAt: p.raisedAt || Date.now() }); dbt.cola.sort((a, b) => a.raisedAt - b.raisedAt)
      } else if (p.type === 'hand_down') dbt.cola = dbt.cola.filter(e => e.seat !== p.seat)
      evaluarCola(); pintarMano()
    })
    .subscribe()
}

function salirDelCanal() {
  if (dbt.mano === 'ready' || dbt.mano === 'queued') avisarMano({ type: 'hand_down', seat: estado.butaca })
  if (dbt.canal) { sb.removeChannel(dbt.canal); dbt.canal = null }
  clearInterval(dbt.tick); dbt.tick = null
  dbt.mano = 'idle'; dbt.cola = []; dbt.finCd = 0
}

const avisarMano = p => { try { dbt.canal?.send({ type: 'broadcast', event: 'hand', payload: p }) } catch (e) {} }

function burbuja(m) {
  const mia = m.seat_number === estado.butaca
  const p = perfiles.get(m.seat_number)
  const alias = p?.show_alias && p.alias ? p.alias : null
  return `<div class="db-msg ${mia ? 'mia' : ''}" data-id="${m.id}">
    <span class="db-av" style="background:${mia ? 'var(--orange)' : colorDe(p?.card_color, m.seat_number)}">${alias ? esc(alias.charAt(0).toUpperCase()) : '#'}</span>
    <div class="db-cuerpo">
      <div class="db-cab"><b>${mia ? 'Vos' : esc(alias || 'Ciudadano anónimo')}</b><span>#${m.seat_number}</span><time>${haceCuanto(m.created_at)}</time></div>
      <p>${esc(m.text)}</p>
    </div></div>`
}

function agregarMensaje(m) {
  const box = $('#db-msgs'); if (!box) return
  box.querySelector('.db-vacio')?.remove()
  const cerca = box.scrollHeight - box.scrollTop - box.clientHeight < 120
  box.insertAdjacentHTML('beforeend', burbuja(m))
  if (cerca || m.seat_number === estado.butaca) box.scrollTop = box.scrollHeight
  const n = $('#db-n'); if (n) n.textContent = participantes()
}

const participantes = () => { const s = new Set(dbt.msgs.map(m => m.seat_number)).size; return `${fmtNum(dbt.msgs.length)} mensajes · ${fmtNum(s)} butacas` }

function pintarHilo(cargando = false) {
  const h = $('#db-hilo'); if (!h) return
  const q = dbt.q
  if (!q) { h.innerHTML = '<div class="db-nada"><p class="muted">Elegí un debate para leerlo.</p></div>'; return }
  const abierto = dbAbierto(q)
  let pie
  if (!abierto) pie = '<div class="db-cerrado">🔒 Este debate cerró. Podés leerlo, pero ya no se puede participar.</div>'
  else if (!estado.user) pie = `<div class="db-cerrado">Para participar <a href="${APP_ACTUAL}">iniciá sesión</a>.</div>`
  else if (!estado.butaca) pie = `<div class="db-cerrado">Para participar necesitás tu butaca: <a href="${APP_ACTUAL}">completá la verificación</a>.</div>`
  else pie = `
    <div class="db-cola" id="db-cola"></div>
    <div class="db-compo">
      <button class="db-mano" id="db-mano" title="Levantar la mano">✋</button>
      <div class="db-campo">
        <textarea id="db-txt" maxlength="280" rows="2" placeholder="Levantá la mano para pedir la palabra…" disabled></textarea>
        <div class="db-estado"><span id="db-estado"></span><em id="db-cont">0/280</em></div>
        <div class="db-cd" id="db-cd" hidden><i id="db-cd-fill"></i></div>
      </div>
      <button class="btn btn-dark" id="db-enviar" disabled>Enviar</button>
    </div>`
  h.innerHTML = `
    <header class="db-head">
      <button class="db-volver" id="db-volver" aria-label="Volver a la lista">‹ Debates</button>
      <div class="vcard-top"><span class="tag">${esc(q.category || 'General')}</span>
        ${abierto ? `<b class="q-timer" data-cuenta="${esc(q.ends_at)}">${cuentaRegresiva(q.ends_at)}</b><span class="db-vivo"><i></i>En vivo</span>` : '<small>Debate cerrado</small>'}</div>
      <h2>${esc(q.text)}</h2>
      <small class="muted" id="db-n">${cargando ? 'Cargando…' : participantes()}</small>
    </header>
    <div class="db-msgs" id="db-msgs">${cargando ? '<p class="muted db-vacio">Cargando mensajes…</p>'
      : dbt.msgs.length ? dbt.msgs.map(burbuja).join('') : `<p class="muted db-vacio">${abierto ? 'Nadie habló todavía. Podés abrir el debate.' : 'Este debate no tuvo mensajes.'}</p>`}</div>
    ${pie}`
  const box = $('#db-msgs'); box.scrollTop = box.scrollHeight
  pintarMano()
}

function pintarMano() {
  const btn = $('#db-mano'); if (!btn) return
  const txt = $('#db-txt'), env = $('#db-enviar'), est = $('#db-estado'), cd = $('#db-cd')
  const pos = dbt.cola.findIndex(e => e.seat === estado.butaca)
  btn.className = 'db-mano ' + dbt.mano
  cd.hidden = dbt.mano !== 'cooldown'
  const puede = dbt.mano === 'ready'
  txt.disabled = !puede; env.disabled = !puede
  txt.placeholder = puede ? 'Tu argumento (máx. 280 caracteres)…' : 'Levantá la mano para pedir la palabra…'
  est.className = ''
  if (dbt.mano === 'ready') { est.innerHTML = '<b>Tu turno</b>: enviá tu argumento'; est.className = 'ok' }
  else if (dbt.mano === 'queued') est.innerHTML = `En cola: posición <b>${pos + 1}</b>`
  else if (dbt.mano === 'cooldown') { est.innerHTML = `Esperá <b>${Math.max(0, Math.ceil((dbt.finCd - Date.now()) / 1000))} s</b> para volver a hablar`; est.className = 'espera' }
  else est.textContent = 'Levantá la mano para hablar'
  const cola = $('#db-cola')
  if (cola) cola.innerHTML = dbt.cola.slice(0, 10).map((e, i) =>
    `<span class="${e.seat === estado.butaca ? 'yo' : i < DB_DIRECTO ? 'habla' : ''}">${i < DB_DIRECTO ? '🎙' : '✋'} #${e.seat}</span>`).join('')
}

function evaluarCola() {
  if (dbt.mano !== 'queued') return
  const pos = dbt.cola.findIndex(e => e.seat === estado.butaca)
  if (pos >= 0 && pos < DB_DIRECTO) dbt.mano = 'ready'
}

function alternarMano() {
  if (!dbAbierto(dbt.q) || !estado.butaca || dbt.mano === 'cooldown') return
  if (dbt.mano === 'ready' || dbt.mano === 'queued') {
    dbt.cola = dbt.cola.filter(e => e.seat !== estado.butaca); dbt.mano = 'idle'
    avisarMano({ type: 'hand_down', seat: estado.butaca }); return pintarMano()
  }
  const e = { seat: estado.butaca, raisedAt: Date.now() }
  dbt.cola.push(e); dbt.cola.sort((a, b) => a.raisedAt - b.raisedAt)
  avisarMano({ type: 'hand_up', seat: estado.butaca, raisedAt: e.raisedAt })
  dbt.mano = dbt.cola.findIndex(x => x.seat === estado.butaca) < DB_DIRECTO ? 'ready' : 'queued'
  pintarMano()
  if (dbt.mano === 'ready') $('#db-txt')?.focus()
}

async function enviarMensaje() {
  if (dbt.mano !== 'ready' || !dbt.q) return
  const el = $('#db-txt'), btn = $('#db-enviar')
  const txt = limpiar(el.value).slice(0, 280)
  if (!txt) return
  btn.disabled = true; el.disabled = true
  const { data, error } = await sb.from('debate_messages')
    .insert({ question_id: dbt.q.id, seat_number: estado.butaca, alias: '', text: txt })
    .select('id, seat_number, text, created_at').single()
  if (error) {
    btn.disabled = false; el.disabled = false
    aviso(/turno|cerr|butaca|caracteres/i.test(error.message || '') ? error.message : 'No se pudo enviar. Intentá de nuevo.', 'error')
    return
  }
  el.value = ''; $('#db-cont').textContent = '0/280'
  if (data && !dbt.msgs.some(m => m.id === data.id)) { dbt.msgs.push(data); agregarMensaje(data) }
  dbt.cola = dbt.cola.filter(e => e.seat !== estado.butaca)
  avisarMano({ type: 'hand_down', seat: estado.butaca })
  dbt.mano = 'cooldown'; dbt.finCd = Date.now() + DB_COOLDOWN * 1000
  clearInterval(dbt.tick)
  dbt.tick = setInterval(() => {
    const resta = dbt.finCd - Date.now()
    const f = $('#db-cd-fill'); if (f) f.style.width = Math.max(0, resta / (DB_COOLDOWN * 10)) + '%'
    if (resta <= 0) { clearInterval(dbt.tick); dbt.tick = null; dbt.mano = 'idle' }
    pintarMano()
  }, 500)
  pintarMano()
}

function enlazarDebates() {
  const v = $('#db-vista'); if (!v) return
  v.addEventListener('click', e => {
    const it = e.target.closest('[data-debate]')
    if (it) { location.hash = '#debates/' + it.dataset.debate; return }
    if (e.target.closest('#db-mano')) return alternarMano()
    if (e.target.closest('#db-enviar')) return enviarMensaje()
    if (e.target.closest('#db-volver')) location.hash = '#debates'
  })
  v.addEventListener('input', e => { if (e.target.id === 'db-txt') $('#db-cont').textContent = `${e.target.value.length}/280` })
  v.addEventListener('keydown', e => {
    if (e.target.id === 'db-txt' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensaje() }
  })
  // Refrescar "hace X min" de vez en cuando
  setInterval(() => { $$('#db-msgs time').forEach((t, i) => { const m = dbt.msgs[i]; if (m) t.textContent = haceCuanto(m.created_at) }) }, 30_000)
}

// ── Propuestas ──────────────────────────────────────────────────
// Cada propuesta tiene un plazo (48 h) para encender N butacas (20). Si lo logra pasa a revisión
// y de ahí al Hemiciclo. El servidor aplica todas las reglas; esto es la interfaz.
const pr = { d: null, filtro: 'carrera', orden: 'cerca', desfase: 0, canal: null, cats: [], abierta: null, poll: null }
const CAT_COLOR = { 'Política': '#4338CA', 'Economía': '#047857', 'Derechos': '#C2410C', 'Social': '#7C3AED', 'Internacional': '#0369A1', 'Justicia': '#BE123C', 'Electoral': '#B45309', 'General': '#475569' }
const ahoraSrv = () => Date.now() + pr.desfase
const restaMs = p => new Date(p.expires_at).getTime() - ahoraSrv()
const viva = p => p.status === 'pending' && restaMs(p) > 0
const fmtResta = ms => {
  if (ms <= 0) return 'Terminó'
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`
}
const calor = p => {                          // 0 = recién lanzada … 1 = por apagarse
  const total = (pr.d?.horas || 48) * 3600e3
  return Math.min(1, Math.max(0, 1 - restaMs(p) / total))
}
const autorDe = p => {
  if (p.es_mia) return 'Tu propuesta'
  const perf = perfiles.get(p.seat_number)
  return perf?.show_alias && perf.alias ? perf.alias : `Butaca #${p.seat_number}`
}

// Mini hemiciclo: N butacas en dos filas de arco que se encienden de izquierda a derecha
function arcoButacas(encendidas, meta, clase = '') {
  const filas = [[Math.round(meta * 0.4), 24], [meta - Math.round(meta * 0.4), 38]]
  const seats = []
  filas.forEach(([n, r]) => {
    for (let i = 0; i < n; i++) {
      const a = Math.PI - (i + 0.5) * Math.PI / n
      seats.push({ a, x: 50 + r * Math.cos(a), y: 46 - r * Math.sin(a) })
    }
  })
  seats.sort((s1, s2) => s2.a - s1.a)
  return `<svg class="arco ${clase}" viewBox="0 0 100 50" aria-hidden="true">${seats.map((s, i) =>
    `<circle cx="${s.x.toFixed(2)}" cy="${s.y.toFixed(2)}" r="3.6" class="${i < encendidas ? 'on' : ''}" data-i="${i}"/>`).join('')}</svg>`
}

async function cargarPropuestas(id) {
  try {
    const [{ data, error }, cats] = await Promise.all([
      sb.rpc('v2_propuestas'),
      pr.cats.length ? Promise.resolve({ data: pr.cats }) : sb.from('categories').select('name, color').order('sort_order'),
    ])
    if (error) throw error
    pr.d = data
    pr.desfase = new Date(data.ahora).getTime() - Date.now()
    if (cats?.data?.length) { pr.cats = cats.data; cats.data.forEach(c => { CAT_COLOR[c.name] = c.color }) }
  } catch (e) { console.warn('cargarPropuestas:', e) }
  pintarPropuestas()
  if (id) abrirPropuesta(id)
  if (!pr.canal) escucharPropuestas()
  if (!pr.poll) pr.poll = setInterval(() => { if (vistaActual() === 'propuestas') refrescarPropuestas() }, 60_000)
}

async function refrescarPropuestas() {
  try {
    const { data } = await sb.rpc('v2_propuestas')
    if (!data) return
    pr.d = data; pr.desfase = new Date(data.ahora).getTime() - Date.now()
    pintarPropuestas()
  } catch (e) {}
}

// En vivo: cuando cambia el conteo de una propuesta, se enciende la butaca en pantalla (sin saber quién fue)
function escucharPropuestas() {
  pr.canal = sb.channel('v2-propuestas')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'proposals' }, ({ new: n }) => {
      const p = pr.d?.propuestas?.find(x => x.id === n.id)
      if (!p) { if (n.status === 'pending') refrescarPropuestas(); return }
      const antes = p.likes
      Object.assign(p, { likes: n.likes, status: n.status })
      if (n.likes > antes) { p.apoyos_hora = (p.apoyos_hora || 0) + (n.likes - antes); pr.d.apoyos_hora += n.likes - antes; latido(p, n.likes - antes) }
      else pintarPropuestas()
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'proposals' }, () => refrescarPropuestas())
    .subscribe()
}

function latido(p, cuantos) {
  const meta = pr.d.meta
  $$(`[data-prop="${p.id}"]`).forEach(card => {
    const arco = card.querySelector('.arco')
    if (arco) for (let i = 0; i < Math.min(p.likes, meta); i++) {
      const c = arco.querySelector(`[data-i="${i}"]`)
      if (c && !c.classList.contains('on')) { c.classList.add('on', 'nueva'); setTimeout(() => c.classList.remove('nueva'), 900) }
    }
    const n = card.querySelector('[data-n]'); if (n) n.textContent = Math.min(p.likes, 9999)
    const f = card.querySelector('[data-faltan]'); if (f) f.innerHTML = faltanTxt(p)
    card.classList.remove('pulso'); void card.offsetWidth; card.classList.add('pulso')
  })
  pintarPista()
  const t = $('#pr-eco')
  if (t) { t.innerHTML = `<i></i>Ahora mismo: +${cuantos} a “${esc(p.text.slice(0, 60))}${p.text.length > 60 ? '…' : ''}”`; t.classList.remove('ver'); void t.offsetWidth; t.classList.add('ver') }
  if (p.status === 'accepted') pintarPropuestas()
}

const faltanTxt = p => {
  const meta = pr.d.meta, f = Math.max(0, meta - p.likes)
  if (p.status !== 'pending') return 'Meta lograda'
  if (f === 0) return 'Meta lograda'
  if (f <= 3) return `<b>¡Faltan ${f}!</b>`
  return `Faltan ${f}`
}

function pintarPropuestas() {
  const d = pr.d, v = $('#pr-vista'); if (!v) return
  if (!d) { $('#pr-grid').innerHTML = '<p class="muted">No se pudieron cargar las propuestas.</p>'; return }
  const props = d.propuestas || []
  const vivas = props.filter(viva)
  const c = { carrera: vivas.length, meta: props.filter(p => p.status === 'accepted').length, hemiciclo: props.filter(p => p.status === 'approved').length, mias: props.filter(p => p.es_mia).length }
  $$('[data-prfiltro]').forEach(b => { b.classList.toggle('active', b.dataset.prfiltro === pr.filtro); const s = b.querySelector('span'); if (s) s.textContent = c[b.dataset.prfiltro] || '' })
  $('#pr-ordenes').hidden = pr.filtro !== 'carrera'
  $$('[data-prorden]').forEach(b => b.classList.toggle('active', b.dataset.prorden === pr.orden))
  const btn = $('#pr-lanzar')
  btn.disabled = !!(estado.user && estado.butaca && !d.puedo_lanzar)
  btn.title = btn.disabled ? 'Ya tenés una propuesta en campaña' : ''
  pintarPista()

  let lista
  if (pr.filtro === 'carrera') {
    lista = vivas.slice().sort(pr.orden === 'apagar' ? (a, b) => restaMs(a) - restaMs(b)
      : pr.orden === 'nuevas' ? (a, b) => new Date(b.created_at) - new Date(a.created_at)
      : (a, b) => (b.likes - a.likes) || (restaMs(a) - restaMs(b)))
  } else if (pr.filtro === 'meta') lista = props.filter(p => p.status === 'accepted')
  else if (pr.filtro === 'hemiciclo') lista = props.filter(p => p.status === 'approved')
  else lista = props.filter(p => p.es_mia).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  const vacio = {
    carrera: ['Ninguna propuesta en carrera', 'Sé quien abra la próxima: lanzá una propuesta y empezá a encender butacas.'],
    meta: ['Todavía no hay propuestas en revisión', 'Cuando una propuesta enciende todas sus butacas, aparece acá mientras el moderador la revisa.'],
    hemiciclo: ['Todavía no hay propuestas en el Hemiciclo', 'Las propuestas aprobadas por el moderador pasan a votación del Cabildo.'],
    mias: ['No lanzaste propuestas todavía', 'Tenés una idea para Venezuela: lanzala y conseguí apoyos.'],
  }[pr.filtro]
  $('#pr-grid').innerHTML = lista.length ? lista.map(tarjetaPropuesta).join('')
    : `<div class="card soon pr-vacio"><h3>${vacio[0]}</h3><p class="muted">${vacio[1]}</p></div>`
}

function pintarPista() {
  const d = pr.d, pista = $('#pr-pista'); if (!d || !pista) return
  const meta = d.meta
  const vivas = (d.propuestas || []).filter(viva).sort((a, b) => b.likes - a.likes).slice(0, 7)
  const prox = (d.propuestas || []).filter(viva).sort((a, b) => restaMs(a) - restaMs(b))[0]
  $('#pr-n-vivas').textContent = fmtNum((d.propuestas || []).filter(viva).length)
  $('#pr-n-hora').textContent = fmtNum(d.apoyos_hora)
  $('#pr-prox').innerHTML = prox ? `<b data-fin="${esc(prox.expires_at)}">${fmtResta(restaMs(prox))}</b>` : '<b>—</b>'
  $('#pr-carriles').innerHTML = vivas.length ? vivas.map(p => {
    const x = Math.min(1, p.likes / meta), cal = calor(p)
    return `<button class="carril" data-abrir="${p.id}" title="${esc(p.text)}">
      <span class="carril-txt">${esc(p.text)}</span>
      <span class="carril-linea"><i class="carril-estela" style="width:${(x * 100).toFixed(1)}%"></i>
        <span class="corredor ${cal > .9 ? 'urge' : ''}" style="left:${(x * 100).toFixed(1)}%;--cal:${cal.toFixed(2)}"><em>${p.likes}</em></span></span>
    </button>`
  }).join('') : '<p class="carril-vacio">La pista está vacía. La próxima propuesta que se lance arranca acá.</p>'
}

function tarjetaPropuesta(p) {
  const meta = pr.d.meta, vive = viva(p)
  const col = CAT_COLOR[p.cat] || CAT_COLOR.General
  const cal = calor(p), pct = vive ? Math.max(0, restaMs(p) / ((pr.d.horas || 48) * 3600e3)) : 0
  const estado_ = p.status === 'accepted' ? '<span class="pr-sello meta">Meta lograda · en revisión</span>'
    : p.status === 'approved' ? '<span class="pr-sello hemi">En el Hemiciclo</span>'
    : p.status === 'expired' ? '<span class="pr-sello fin">No llegó a la meta</span>'
    : p.status === 'rejected' ? '<span class="pr-sello fin">No aprobada</span>'
    : p.status === 'pending' && !vive ? '<span class="pr-sello fin">Terminó</span>' : ''
  return `<article class="card pr-card ${p.es_mia ? 'mia' : ''} ${vive && cal > .9 ? 'urge' : ''}" data-prop="${p.id}" style="--cat:${col}">
    <header class="pr-top">
      <span class="pr-cat">${esc(p.cat || 'General')}</span>
      <span class="pr-autor">${esc(autorDe(p))}</span>
      ${vive && p.apoyos_hora > 0 ? `<span class="pr-fuego" title="Apoyos en la última hora">+${p.apoyos_hora} en la última hora</span>` : ''}
    </header>
    <button class="pr-texto" data-abrir="${p.id}">${esc(p.text)}</button>
    <div class="pr-medio">
      ${arcoButacas(Math.min(p.likes, meta), meta)}
      <div class="pr-cuenta"><b data-n>${p.likes}</b><small>de ${meta} butacas</small><span data-faltan>${faltanTxt(p)}</span></div>
    </div>
    ${vive ? `<div class="mecha" style="--resto:${pct.toFixed(4)};--cal:${cal.toFixed(2)}"><i></i></div>
      <div class="pr-plazo"><span>Se apaga en</span><b data-fin="${esc(p.expires_at)}">${fmtResta(restaMs(p))}</b></div>` : estado_}
    <footer class="pr-pie">
      ${vive ? botonApoyo(p) : ''}
      <button class="pr-mini" data-abrir="${p.id}" aria-label="Ver comentarios"><svg viewBox="0 0 24 24"><path d="M5 5h14v10H9l-4 4z"/></svg>${p.comentarios || 0}</button>
      <button class="pr-mini" data-compartir="${p.id}" aria-label="Copiar enlace"><svg viewBox="0 0 24 24"><path d="M8 12h8M14 6l6 6-6 6"/></svg>Compartir</button>
    </footer>
  </article>`
}

const botonApoyo = p => p.es_mia
  ? `<span class="pr-tuya">Compartila para sumar apoyos</span>`
  : `<button class="btn pr-apoyar ${p.yo_apoye ? 'on' : ''}" data-apoyar="${p.id}">${p.yo_apoye ? 'Apoyando' : 'Encender una butaca'}</button>`

async function apoyar(id, btn) {
  const p = pr.d.propuestas.find(x => x.id === id); if (!p) return
  if (!estado.user) { aviso('Iniciá sesión para apoyar propuestas.'); return }
  if (!estado.butaca) { aviso('Necesitás tu butaca verificada para apoyar.', 'error'); return }
  const quiero = !p.yo_apoye
  if (!quiero && !await confirmar('¿Quitar tu apoyo?', 'Tu butaca se apaga en esta propuesta. Podés volver a apoyarla mientras siga en carrera.', 'Quitar apoyo')) return
  $$(`[data-apoyar="${id}"]`).forEach(b => { b.disabled = true })
  const { data, error } = await sb.rpc('v2_apoyar', { p_id: id, p_apoyar: quiero })
  if (error || !data?.ok) { aviso(data?.error || 'No se pudo registrar tu apoyo.', 'error'); $$(`[data-apoyar="${id}"]`).forEach(b => { b.disabled = false }); return }
  const antes = p.likes
  Object.assign(p, { likes: data.likes, status: data.status, yo_apoye: quiero })
  if (quiero) {
    p.apoyos_hora = (p.apoyos_hora || 0) + 1; pr.d.apoyos_hora++
    $$(`[data-apoyar="${id}"]`).forEach(b => { b.outerHTML = botonApoyo(p) })
    latido(p, Math.max(1, data.likes - antes))
    if (data.status === 'accepted') return momentoMeta(p)
    aviso(Math.max(0, data.meta - data.likes) ? `Encendiste tu butaca. Faltan ${data.meta - data.likes}.` : 'Encendiste tu butaca.')
  } else { pintarPropuestas(); if (pr.abierta === id) abrirPropuesta(id) }
}

function momentoMeta(p) {
  const m = $('#modal-meta')
  $('#mm-arco').innerHTML = arcoButacas(pr.d.meta, pr.d.meta, 'grande completo')
  $('#mm-texto').textContent = p.text
  m.hidden = false
  pintarPropuestas()
}

async function compartir(id) {
  const p = pr.d?.propuestas?.find(x => x.id === id)
  const url = `${location.origin}/ux2/#propuestas/${id}`
  const texto = p ? `Apoyá esta propuesta en el Cabildo de Venezuela: “${p.text}”` : 'Propuesta en el Cabildo de Venezuela'
  try {
    if (navigator.share) await navigator.share({ title: 'Cabildo de Venezuela', text: texto, url })
    else { await navigator.clipboard.writeText(`${texto} ${url}`); aviso('Enlace copiado. Pegalo donde quieras.') }
  } catch (e) {}
}

// ── Detalle con comentarios ──
async function abrirPropuesta(id) {
  const p = pr.d?.propuestas?.find(x => x.id === id)
  if (!p) return
  pr.abierta = id
  const m = $('#modal-prop'), b = $('#mp-cuerpo')
  const meta = pr.d.meta, vive = viva(p)
  const links = (Array.isArray(p.links) ? p.links : []).filter(l => typeof l === 'string' && /^https?:\/\//.test(l))
  b.innerHTML = `
    <div class="pr-top"><span class="pr-cat" style="--cat:${CAT_COLOR[p.cat] || CAT_COLOR.General}">${esc(p.cat || 'General')}</span><span class="pr-autor">${esc(autorDe(p))}</span></div>
    <h2 class="mp-titulo">${esc(p.text)}</h2>
    ${p.context ? `<p class="mp-contexto">${esc(p.context)}</p>` : ''}
    ${links.length || p.video_url ? `<div class="v-links">${p.video_url && /^https?:\/\//.test(p.video_url) ? `<a href="${esc(p.video_url)}" target="_blank" rel="noopener noreferrer">Ver video</a>` : ''}${links.map(l => `<a href="${esc(l)}" target="_blank" rel="noopener noreferrer">${esc(l.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40))}</a>`).join('')}</div>` : ''}
    <div class="mp-carrera" data-prop="${p.id}" style="--cat:${CAT_COLOR[p.cat] || CAT_COLOR.General}">
      ${arcoButacas(Math.min(p.likes, meta), meta, 'grande')}
      <div class="pr-cuenta"><b data-n>${p.likes}</b><small>de ${meta} butacas</small><span data-faltan>${faltanTxt(p)}</span></div>
      ${vive ? `<div class="mecha" style="--resto:${Math.max(0, restaMs(p) / ((pr.d.horas || 48) * 3600e3)).toFixed(4)};--cal:${calor(p).toFixed(2)}"><i></i></div>
        <div class="pr-plazo"><span>Se apaga en</span><b data-fin="${esc(p.expires_at)}">${fmtResta(restaMs(p))}</b></div>` : ''}
      <div class="pr-pie">${vive ? botonApoyo(p) : ''}<button class="pr-mini" data-compartir="${p.id}"><svg viewBox="0 0 24 24"><path d="M8 12h8M14 6l6 6-6 6"/></svg>Compartir</button></div>
    </div>
    <h3 class="mp-sub">Conversación</h3>
    <div class="mp-coments" id="mp-coments"><p class="muted">Cargando…</p></div>
    ${estado.butaca ? `<div class="mp-comentar"><textarea id="mp-coment" maxlength="500" rows="2" placeholder="Sumá un argumento a favor, en contra o una mejora"></textarea><button class="btn btn-dark" id="mp-coment-env">Comentar</button></div>`
      : `<p class="muted mp-nota-c">Para comentar necesitás tu butaca verificada.</p>`}`
  m.hidden = false
  if (location.hash !== '#propuestas/' + id) history.replaceState(null, '', '#propuestas/' + id)
  const { data } = await sb.from('proposal_comments').select('id, from_seat, text, created_at').eq('proposal_id', id).order('created_at', { ascending: true }).limit(200)
  if (pr.abierta !== id) return
  const box = $('#mp-coments')
  box.innerHTML = (data || []).length ? data.map(c => {
    const perf = perfiles.get(c.from_seat), al = perf?.show_alias && perf.alias ? perf.alias : null
    return `<div class="mp-c"><b>${c.from_seat === estado.butaca ? 'Vos' : esc(al || 'Ciudadano anónimo')} <span>#${c.from_seat} · ${haceCuanto(c.created_at)}</span></b><p>${esc(c.text)}</p></div>`
  }).join('') : '<p class="muted">Nadie comentó todavía.</p>'
}

function cerrarPropuestaModal() {
  $('#modal-prop').hidden = true; pr.abierta = null
  if (location.hash.startsWith('#propuestas/')) history.replaceState(null, '', '#propuestas')
}

async function comentar() {
  const el = $('#mp-coment'), id = pr.abierta; if (!el || !id) return
  const txt = limpiar(el.value).slice(0, 500); if (!txt) return
  $('#mp-coment-env').disabled = true
  const { error } = await sb.from('proposal_comments').insert({ proposal_id: id, from_seat: estado.butaca, text: txt })
  $('#mp-coment-env').disabled = false
  if (error) { aviso(error.message?.includes('caracteres') ? error.message : 'No se pudo publicar el comentario.', 'error'); return }
  const p = pr.d.propuestas.find(x => x.id === id); if (p) p.comentarios = (p.comentarios || 0) + 1
  abrirPropuesta(id); pintarPropuestas()
}

// ── Lanzar una propuesta ──
function abrirLanzar() {
  if (!estado.user) { aviso('Iniciá sesión para lanzar una propuesta.'); return }
  if (!estado.butaca) { aviso('Necesitás tu butaca verificada para proponer.', 'error'); return }
  if (pr.d && !pr.d.puedo_lanzar) { aviso('Ya tenés una propuesta en carrera. Cuando termine vas a poder lanzar otra.', 'error'); return }
  const cats = (pr.cats.length ? pr.cats.map(c => c.name) : Object.keys(CAT_COLOR)).filter((c, i, a) => a.indexOf(c) === i)
  $('#ml-cats').innerHTML = cats.map((c, i) => `<button type="button" class="ml-cat ${i === 0 ? 'on' : ''}" data-cat="${esc(c)}" style="--cat:${CAT_COLOR[c] || CAT_COLOR.General}">${esc(c)}</button>`).join('')
  $('#ml-meta-txt').textContent = `Tenés ${pr.d?.horas || 48} horas para encender ${pr.d?.meta || 20} butacas. Si lo lográs, el moderador la revisa para llevarla a votación del Hemiciclo.`
  $('#ml-form').reset(); $('#ml-form').hidden = false; $('#ml-listo').hidden = true
  previsualizar()
  $('#modal-lanzar').hidden = false
  setTimeout(() => $('#ml-texto').focus(), 50)
}

function previsualizar() {
  const t = $('#ml-texto').value, cat = $('.ml-cat.on')?.dataset.cat || 'General'
  $('#ml-cont').textContent = `${t.length}/280`
  $('#ml-cont').classList.toggle('mal', t.trim().length > 0 && t.trim().length < 10)
  $('#ml-prev').innerHTML = `
    <div class="pr-top"><span class="pr-cat" style="--cat:${CAT_COLOR[cat] || CAT_COLOR.General}">${esc(cat)}</span><span class="pr-autor">Tu propuesta</span></div>
    <p class="ml-prev-txt ${t.trim() ? '' : 'vacio'}">${esc(t.trim() || 'Así se va a ver tu propuesta en la pista.')}</p>
    <div class="pr-medio">${arcoButacas(0, pr.d?.meta || 20)}<div class="pr-cuenta"><b>0</b><small>de ${pr.d?.meta || 20} butacas</small></div></div>
    <div class="mecha" style="--resto:1;--cal:0"><i></i></div>
    <div class="pr-plazo"><span>Se apaga en</span><b>${String(pr.d?.horas || 48).padStart(2, '0')}:00:00</b></div>`
  $('#ml-enviar').disabled = t.trim().length < 10
}

async function lanzar(e) {
  e.preventDefault()
  const text = limpiar($('#ml-texto').value)
  if (text.length < 10) return
  const btn = $('#ml-enviar'); btn.disabled = true; btn.textContent = 'Lanzando…'
  const links = $$('.ml-link').map(i => i.value.trim()).filter(v => /^https?:\/\/\S+$/i.test(v)).slice(0, 3)
  const video = $('#ml-video').value.trim()
  const { error } = await sb.from('proposals').insert({
    seat_number: estado.butaca, text, cat: $('.ml-cat.on')?.dataset.cat || 'General',
    context: limpiar($('#ml-contexto').value) || null, links, video_url: /^https?:\/\/\S+$/i.test(video) ? video : null,
  })
  btn.textContent = 'Lanzar propuesta'
  if (error) { btn.disabled = false; aviso(/campaña|caracteres|butaca/i.test(error.message || '') ? error.message : 'No se pudo lanzar la propuesta.', 'error'); return }
  $('#ml-form').hidden = true; $('#ml-listo').hidden = false
  await refrescarPropuestas()
  const mia = pr.d?.propuestas?.find(p => p.es_mia && viva(p))
  $('#ml-compartir').dataset.compartir = mia?.id || ''
  pr.filtro = 'carrera'; pintarPropuestas()
}

function tickPropuestas() {
  if (vistaActual() !== 'propuestas' && $('#modal-prop')?.hidden !== false) return
  $$('[data-fin]').forEach(el => {
    const ms = new Date(el.dataset.fin).getTime() - ahoraSrv()
    el.textContent = fmtResta(ms)
    const card = el.closest('[data-prop]'); const m = card?.querySelector('.mecha')
    if (m) { m.style.setProperty('--resto', Math.max(0, ms / ((pr.d?.horas || 48) * 3600e3)).toFixed(4)) }
    if (ms <= 0 && pr.d && !el.dataset.vencio) { el.dataset.vencio = '1'; setTimeout(refrescarPropuestas, 1500) }
  })
}

function enlazarPropuestas() {
  const v = $('#pr-vista'); if (!v) return
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-apoyar],[data-abrir],[data-compartir],[data-prfiltro],[data-prorden]')
    if (!t) return
    if (t.dataset.apoyar) return apoyar(t.dataset.apoyar, t)
    if (t.dataset.compartir !== undefined && t.dataset.compartir) return compartir(t.dataset.compartir)
    if (t.dataset.abrir) return abrirPropuesta(t.dataset.abrir)
    if (t.dataset.prfiltro) { pr.filtro = t.dataset.prfiltro; return pintarPropuestas() }
    if (t.dataset.prorden) { pr.orden = t.dataset.prorden; return pintarPropuestas() }
  })
  $('#pr-lanzar').addEventListener('click', abrirLanzar)
  $('#mp-x').addEventListener('click', cerrarPropuestaModal)
  $('#modal-prop').addEventListener('click', e => { if (e.target.id === 'modal-prop') cerrarPropuestaModal(); if (e.target.id === 'mp-coment-env') comentar() })
  $('#ml-x').addEventListener('click', () => { $('#modal-lanzar').hidden = true })
  $('#modal-lanzar').addEventListener('click', e => {
    if (e.target.id === 'modal-lanzar') $('#modal-lanzar').hidden = true
    const c = e.target.closest('.ml-cat'); if (c) { $$('.ml-cat').forEach(x => x.classList.toggle('on', x === c)); previsualizar() }
    if (e.target.id === 'ml-cerrar-listo') $('#modal-lanzar').hidden = true
  })
  $('#ml-form').addEventListener('input', previsualizar)
  $('#ml-form').addEventListener('submit', lanzar)
  $('#mm-x').addEventListener('click', () => { $('#modal-meta').hidden = true })
  $('#modal-meta').addEventListener('click', e => { if (e.target.id === 'modal-meta') $('#modal-meta').hidden = true })
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return
    if (!$('#modal-meta').hidden) $('#modal-meta').hidden = true
    else if (!$('#modal-lanzar').hidden) $('#modal-lanzar').hidden = true
    else if (!$('#modal-prop').hidden) cerrarPropuestaModal()
  })
}

// ── Ciudadanos ──────────────────────────────────────────────────
// Directorio (cada uno decide qué muestra), seguir con solicitud, y mensajes privados entre butacas.
const ciu = { tab: 'directorio', q: '', soloPublicos: true, cuantos: 48, sig: new Set(), pend: new Set(), segs: new Set(),
  sol: [], convs: new Map(), noLeidos: 0, perfil: null, ptab: 'propuestas', chat: null, cargado: false }

const nombreDe = (num, p = perfiles.get(num)) => p?.show_alias && p.alias ? p.alias : null
const avatarDe = (num, grande = false) => {
  const p = perfiles.get(num), n = nombreDe(num, p)
  return `<span class="ci-av ${grande ? 'grande' : ''}" style="background:${num === estado.butaca ? 'var(--orange)' : colorDe(p?.card_color, num)}">${n ? esc(n.charAt(0).toUpperCase())
    : '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/></svg>'}</span>`
}

async function cargarSocial() {
  if (!estado.butaca) { ciu.cargado = true; return }
  try {
    const [{ data: f }, { data: m }] = await Promise.all([
      sb.from('follows').select('id, from_seat, to_seat, status'),
      sb.from('messages').select('id, from_seat, to_seat, text, read_at, created_at').order('created_at', { ascending: false }).limit(500),
    ])
    ciu.sig = new Set(); ciu.pend = new Set(); ciu.segs = new Set(); ciu.sol = []
    ;(f || []).forEach(x => {
      if (x.from_seat === estado.butaca) (x.status === 'accepted' ? ciu.sig : ciu.pend).add(x.to_seat)
      else if (x.to_seat === estado.butaca) { if (x.status === 'accepted') ciu.segs.add(x.from_seat); else ciu.sol.push(x) }
    })
    ciu.convs = new Map(); ciu.noLeidos = 0
    ;(m || []).forEach(x => {
      const otro = x.from_seat === estado.butaca ? x.to_seat : x.from_seat
      const c = ciu.convs.get(otro) || { ultimo: x, noLeidos: 0 }
      if (x.to_seat === estado.butaca && !x.read_at) { c.noLeidos++; ciu.noLeidos++ }
      ciu.convs.set(otro, c)
    })
  } catch (e) { console.warn('cargarSocial:', e) }
  ciu.cargado = true
  pintarAvisosSocial()
}

function pintarAvisosSocial() {
  const total = ciu.noLeidos + ciu.sol.length
  const d = $('#msg-dot'); if (d) d.hidden = !total
}

async function cargarCiudadanos(arg) {
  if (!perfiles.size) await cargarPerfiles()
  if (!ciu.cargado) await cargarSocial()
  if (arg === 'mensajes' || arg === 'solicitudes') ciu.tab = arg
  pintarCiudadanos()
  const n = Number(arg); if (n > 0) abrirPerfil(n)
}

function pintarCiudadanos() {
  const v = $('#ci-vista'); if (!v) return
  const c = { siguiendo: ciu.sig.size, seguidores: ciu.segs.size, solicitudes: ciu.sol.length, mensajes: ciu.noLeidos }
  $$('[data-citab]').forEach(b => { b.classList.toggle('active', b.dataset.citab === ciu.tab); const s = b.querySelector('span'); if (s) s.textContent = c[b.dataset.citab] || '' })
  $('#ci-busca').hidden = ciu.tab !== 'directorio'
  const caja = $('#ci-lista')
  if (!estado.butaca && ciu.tab !== 'directorio') {
    caja.innerHTML = `<div class="card soon"><h3>Necesitás tu butaca</h3><p class="muted">Para seguir ciudadanos y enviar mensajes completá la verificación.</p><a class="btn btn-dark" href="${APP_ACTUAL}">Verificarme</a></div>`
    return
  }
  if (ciu.tab === 'solicitudes') {
    caja.innerHTML = ciu.sol.length ? `<div class="ci-filas">${ciu.sol.map(s => `
      <div class="card ci-fila">${avatarDe(s.from_seat)}
        <button class="ci-fila-txt" data-perfil="${s.from_seat}"><b>${esc(nombreDe(s.from_seat) || 'Ciudadano anónimo')}</b><small>Butaca #${s.from_seat} quiere seguirte</small></button>
        <button class="btn btn-dark" data-aceptar="${s.id}">Aceptar</button><button class="btn btn-ghost" data-rechazar="${s.id}">Rechazar</button>
      </div>`).join('')}</div>` : vacioCiu('No tenés solicitudes pendientes', 'Cuando alguien quiera seguirte vas a verlo acá.')
    return
  }
  if (ciu.tab === 'mensajes') {
    const convs = [...ciu.convs.entries()].sort((a, b) => new Date(b[1].ultimo.created_at) - new Date(a[1].ultimo.created_at))
    caja.innerHTML = convs.length ? `<div class="ci-filas">${convs.map(([num, cv]) => `
      <button class="card ci-fila ci-conv ${cv.noLeidos ? 'nuevo' : ''}" data-perfil="${num}" data-ptab="mensajes">${avatarDe(num)}
        <span class="ci-fila-txt"><b>${esc(nombreDe(num) || 'Ciudadano anónimo')} <em>#${num}</em></b>
        <small>${cv.ultimo.from_seat === estado.butaca ? 'Vos: ' : ''}${esc(cv.ultimo.text.slice(0, 90))}</small></span>
        <span class="ci-conv-meta"><time>${haceCuanto(cv.ultimo.created_at)}</time>${cv.noLeidos ? `<i>${cv.noLeidos}</i>` : ''}</span>
      </button>`).join('')}</div>` : vacioCiu('Todavía no tenés conversaciones', 'Abrí el perfil de un ciudadano y escribile.')
    return
  }
  let nums
  if (ciu.tab === 'siguiendo') nums = [...ciu.sig, ...ciu.pend]
  else if (ciu.tab === 'seguidores') nums = [...ciu.segs]
  else {
    const q = ciu.q.trim().toLowerCase().replace(/^#/, '')
    nums = [...perfiles.keys()].filter(n => {
      const p = perfiles.get(n)
      if (q) return String(n) === q || (nombreDe(n, p) || '').toLowerCase().includes(q) || (p?.show_phrase && (p.phrase || '').toLowerCase().includes(q))
      return !ciu.soloPublicos || nombreDe(n, p)
    }).sort((a, b) => (!!nombreDe(b) - !!nombreDe(a)) || (Number(perfiles.get(b)?.vote_count || 0) - Number(perfiles.get(a)?.vote_count || 0)) || a - b)
  }
  const total = nums.length
  if (!total) {
    caja.innerHTML = ciu.tab === 'directorio' ? vacioCiu('Nadie coincide con esa búsqueda', 'Probá con un alias, una palabra de su frase o el número de butaca.')
      : ciu.tab === 'siguiendo' ? vacioCiu('Todavía no seguís a nadie', 'Buscá ciudadanos en el directorio y mandales una solicitud.')
      : vacioCiu('Todavía no tenés seguidores', 'Hacé público tu alias en Mi Butaca para que te encuentren.')
    return
  }
  caja.innerHTML = `${ciu.tab === 'directorio' ? `<p class="muted ci-total">${fmtNum(total)} ${total === 1 ? 'ciudadano' : 'ciudadanos'}${ciu.soloPublicos && !ciu.q ? ' con perfil público' : ''}</p>` : ''}
    <div class="ci-grid">${nums.slice(0, ciu.cuantos).map(tarjetaCiudadano).join('')}</div>
    ${total > ciu.cuantos ? `<button class="btn btn-ghost ci-mas" id="ci-mas">Mostrar más (${fmtNum(total - ciu.cuantos)})</button>` : ''}`
}

const vacioCiu = (t, s) => `<div class="card soon"><h3 style="margin:0 0 6px">${t}</h3><p class="muted" style="margin:0">${s}</p></div>`

function botonSeguir(num) {
  if (num === estado.butaca) return '<span class="ci-yo">Tu butaca</span>'
  if (!estado.butaca) return ''
  const s = ciu.sig.has(num) ? ['Siguiendo', 'on'] : ciu.pend.has(num) ? ['Pendiente', 'pend'] : ['Seguir', '']
  return `<button class="btn ci-seguir ${s[1]}" data-seguir="${num}">${s[0]}</button>`
}

function tarjetaCiudadano(num) {
  const p = perfiles.get(num), n = nombreDe(num, p)
  return `<article class="card ci-card" data-perfil="${num}" tabindex="0">
    ${avatarDe(num)}
    <div class="ci-card-txt"><b>${esc(n || 'Ciudadano anónimo')}</b><small>Butaca #${num}${ciu.segs.has(num) ? ' · te sigue' : ''}</small></div>
    ${p?.show_phrase && p.phrase ? `<p class="ci-frase">“${esc(p.phrase)}”</p>` : ''}
    <div class="ci-card-pie">${p?.show_votes ? `<span>${fmtNum(p.vote_count)} votaciones</span>` : '<span></span>'}${botonSeguir(num)}</div>
  </article>`
}

async function seguir(num) {
  if (!estado.butaca) return
  if (ciu.sig.has(num) || ciu.pend.has(num)) {
    if (!await confirmar(ciu.sig.has(num) ? '¿Dejar de seguir?' : '¿Cancelar la solicitud?', `Butaca #${num}`, ciu.sig.has(num) ? 'Dejar de seguir' : 'Cancelar solicitud')) return
    const { error } = await sb.from('follows').delete().eq('from_seat', estado.butaca).eq('to_seat', num)
    if (error) { aviso('No se pudo completar.', 'error'); return }
    ciu.sig.delete(num); ciu.pend.delete(num)
  } else {
    const { error } = await sb.from('follows').insert({ from_seat: estado.butaca, to_seat: num, status: 'pending' })
    if (error) { aviso('No se pudo enviar la solicitud.', 'error'); return }
    ciu.pend.add(num); aviso(`Solicitud enviada a la butaca #${num}`)
  }
  $$(`[data-seguir="${num}"]`).forEach(b => { b.outerHTML = botonSeguir(num) })
  if (ciu.tab === 'siguiendo') pintarCiudadanos()
}

async function responderSolicitud(id, acepta) {
  const s = ciu.sol.find(x => x.id === id); if (!s) return
  const { error } = acepta ? await sb.from('follows').update({ status: 'accepted' }).eq('id', id) : await sb.from('follows').delete().eq('id', id)
  if (error) { aviso('No se pudo completar.', 'error'); return }
  ciu.sol = ciu.sol.filter(x => x.id !== id)
  if (acepta) { ciu.segs.add(s.from_seat); aviso(`Aceptaste a la butaca #${s.from_seat}`) }
  pintarAvisosSocial(); pintarCiudadanos()
}

// ── Perfil de un ciudadano ──
async function abrirPerfil(num, tab = 'propuestas') {
  if (!perfiles.size) await cargarPerfiles()
  ciu.perfil = num; ciu.ptab = tab
  const p = perfiles.get(num), n = nombreDe(num, p)
  $('#cp-cab').innerHTML = `
    ${avatarDe(num, true)}
    <div class="cp-id"><h2>${esc(num === estado.butaca ? 'Tu butaca' : n || 'Ciudadano anónimo')}</h2>
      <small>Butaca #${num}</small><span class="sc-badge ${n ? 'pub' : ''}">${n ? 'Público' : 'Anónimo'}</span></div>
    ${p?.show_phrase && p.phrase ? `<p class="cp-frase">“${esc(p.phrase)}”</p>` : !n ? '<p class="cp-frase muted">Eligió mantener su identidad privada.</p>' : ''}
    <div class="cp-datos"><span><b id="cp-segs">–</b> seguidores</span><span><b id="cp-sig">–</b> siguiendo</span>${p?.show_votes ? `<span><b>${fmtNum(p.vote_count)}</b> votaciones</span>` : ''}</div>
    <div class="cp-acciones">${botonSeguir(num)}<button class="btn btn-ghost" id="cp-hemi">Ver en el hemiciclo</button></div>`
  $('#modal-ciu').hidden = false
  if (location.hash !== '#ciudadanos/' + num && vistaActual() === 'ciudadanos') history.replaceState(null, '', '#ciudadanos/' + num)
  pintarPestanaPerfil()
  sb.rpc('get_follow_stats', { p_seat: num }).then(({ data }) => {
    if (ciu.perfil !== num || !data) return
    $('#cp-segs').textContent = fmtNum(data.followers); $('#cp-sig').textContent = fmtNum(data.following)
  })
}

async function pintarPestanaPerfil() {
  const num = ciu.perfil, b = $('#cp-cuerpo')
  $$('[data-cptab]').forEach(x => x.classList.toggle('active', x.dataset.cptab === ciu.ptab))
  $('[data-cptab="mensajes"]').hidden = num === estado.butaca
  salirDelChat()
  if (ciu.ptab === 'propuestas') {
    b.innerHTML = '<p class="muted">Cargando…</p>'
    const { data } = await sb.from('proposals').select('id, text, cat, likes, status, created_at, expires_at')
      .eq('seat_number', num).in('status', ['pending', 'accepted', 'approved', 'expired']).order('created_at', { ascending: false }).limit(20)
    if (ciu.perfil !== num || ciu.ptab !== 'propuestas') return
    const etq = { pending: 'En carrera', accepted: 'Meta lograda', approved: 'En el Hemiciclo', expired: 'No llegó a la meta' }
    b.innerHTML = (data || []).length ? data.map(x => `
      <a class="cp-prop" href="#propuestas/${x.id}" style="--cat:${CAT_COLOR[x.cat] || CAT_COLOR.General}">
        <span class="cp-prop-top"><span class="pr-cat">${esc(x.cat || 'General')}</span><span>${etq[x.status] || ''} · ${x.likes} apoyos</span></span>
        <b>${esc(x.text)}</b></a>`).join('') : '<p class="muted">Todavía no lanzó propuestas.</p>'
    return
  }
  // Mensajes
  if (!estado.butaca) { b.innerHTML = '<p class="muted">Necesitás tu butaca verificada para enviar mensajes.</p>'; return }
  b.innerHTML = `<div class="cp-chat" id="cp-chat"><p class="muted">Cargando…</p></div>
    <p class="cp-aviso">Los mensajes son privados entre las dos butacas. No compartas datos personales.</p>
    <div class="cp-escribir"><textarea id="cp-msg" maxlength="1000" rows="2" placeholder="Escribí un mensaje"></textarea><button class="btn btn-dark" id="cp-enviar">Enviar</button></div>`
  const { data } = await sb.from('messages').select('id, from_seat, to_seat, text, created_at')
    .or(`and(from_seat.eq.${estado.butaca},to_seat.eq.${num}),and(from_seat.eq.${num},to_seat.eq.${estado.butaca})`)
    .order('created_at', { ascending: true }).limit(300)
  if (ciu.perfil !== num || ciu.ptab !== 'mensajes') return
  const chat = $('#cp-chat')
  chat.innerHTML = (data || []).length ? data.map(burbujaMsg).join('') : '<p class="muted cp-vacio">Empezá la conversación.</p>'
  chat.scrollTop = chat.scrollHeight
  // marcar leídos
  const cv = ciu.convs.get(num)
  if (cv?.noLeidos) {
    sb.from('messages').update({ read_at: new Date().toISOString() }).eq('to_seat', estado.butaca).eq('from_seat', num).is('read_at', null).then(() => {})
    ciu.noLeidos -= cv.noLeidos; cv.noLeidos = 0; pintarAvisosSocial()
  }
  ciu.chat = sb.channel(`v2-msgs-${estado.butaca}-${num}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, ({ new: m }) => {
      const es = (m.from_seat === num && m.to_seat === estado.butaca) || (m.from_seat === estado.butaca && m.to_seat === num)
      if (!es || ciu.perfil !== num || $(`#cp-chat [data-id="${m.id}"]`)) return
      const c = $('#cp-chat'); c.querySelector('.cp-vacio')?.remove()
      c.insertAdjacentHTML('beforeend', burbujaMsg(m)); c.scrollTop = c.scrollHeight
      if (m.to_seat === estado.butaca) sb.from('messages').update({ read_at: new Date().toISOString() }).eq('id', m.id).then(() => {})
    }).subscribe()
}

const burbujaMsg = m => `<div class="cp-m ${m.from_seat === estado.butaca ? 'mia' : ''}" data-id="${m.id}"><p>${esc(m.text)}</p><time>${new Date(m.created_at).toLocaleString('es-VE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time></div>`

function salirDelChat() { if (ciu.chat) { sb.removeChannel(ciu.chat); ciu.chat = null } }

async function enviarMsg() {
  const el = $('#cp-msg'), num = ciu.perfil; if (!el || !num) return
  const txt = limpiar(el.value).slice(0, 1000); if (!txt) return
  const btn = $('#cp-enviar'); btn.disabled = true
  const { data, error } = await sb.from('messages').insert({ from_seat: estado.butaca, to_seat: num, text: txt })
    .select('id, from_seat, to_seat, text, created_at').single()
  btn.disabled = false
  if (error) { aviso('No se pudo enviar el mensaje.', 'error'); return }
  el.value = ''
  const c = $('#cp-chat'); c.querySelector('.cp-vacio')?.remove()
  if (data && !c.querySelector(`[data-id="${data.id}"]`)) { c.insertAdjacentHTML('beforeend', burbujaMsg(data)); c.scrollTop = c.scrollHeight }
  ciu.convs.set(num, { ultimo: data, noLeidos: 0 })
}

function cerrarPerfil() {
  $('#modal-ciu').hidden = true; salirDelChat(); ciu.perfil = null
  if (/^#ciudadanos\/\d+$/.test(location.hash)) history.replaceState(null, '', '#ciudadanos')
  if (vistaActual() === 'ciudadanos') pintarCiudadanos()
}

function enlazarCiudadanos() {
  const v = $('#ci-vista'); if (!v) return
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-seguir],[data-perfil],[data-aceptar],[data-rechazar],[data-citab],[data-cptab],#ci-mas,#cp-hemi,#cp-enviar')
    if (!t) return
    if (t.dataset.seguir) { e.stopPropagation(); return seguir(Number(t.dataset.seguir)) }
    if (t.dataset.aceptar) return responderSolicitud(t.dataset.aceptar, true)
    if (t.dataset.rechazar) return responderSolicitud(t.dataset.rechazar, false)
    if (t.dataset.citab) { ciu.tab = t.dataset.citab; ciu.cuantos = 48; return pintarCiudadanos() }
    if (t.dataset.cptab) { ciu.ptab = t.dataset.cptab; return pintarPestanaPerfil() }
    if (t.id === 'ci-mas') { ciu.cuantos += 96; return pintarCiudadanos() }
    if (t.id === 'cp-enviar') return enviarMsg()
    if (t.id === 'cp-hemi') { const n = ciu.perfil; cerrarPerfil(); location.hash = '#inicio'; setTimeout(() => enfocarButaca(n), 400); return }
    if (t.dataset.perfil) return abrirPerfil(Number(t.dataset.perfil), t.dataset.ptab || 'propuestas')
  })
  v.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('.ci-card')) abrirPerfil(Number(e.target.dataset.perfil)) })
  let t; $('#ci-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { ciu.q = e.target.value; ciu.cuantos = 48; pintarCiudadanos() }, 150) })
  $('#ci-publicos').addEventListener('change', e => { ciu.soloPublicos = e.target.checked; ciu.cuantos = 48; pintarCiudadanos() })
  $('#cp-x').addEventListener('click', cerrarPerfil)
  $('#modal-ciu').addEventListener('click', e => { if (e.target.id === 'modal-ciu') cerrarPerfil() })
  $('#modal-ciu').addEventListener('keydown', e => { if (e.target.id === 'cp-msg' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMsg() } })
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal-ciu').hidden && $('#modal-conf').hidden) cerrarPerfil() })
}

// ── Crear bloque (segunda verificación) ─────────────────────────
// Pasos: qué implica → tu identidad pública → tu bloque → DNI → consentimiento y envío.
// Las imágenes se re-dibujan en el navegador (se achican y se pierden los metadatos, como la ubicación)
// y las recibe la función "bloques-archivos": el DNI va a un depósito privado.
const CONSENTIMIENTO_VERSION = 'v1-2026-10'
const cb = { paso: 0, sol: null, f: { nombre: '', apellido: '', bio: '', bloque: '', lema: '', desc: '' }, archivos: {}, prev: {}, completar: false, enviando: false }
const PASOS = ['Qué implica', 'Tu identidad pública', 'Tu bloque', 'Tu DNI', 'Confirmar']

async function cargarSolicitudBloque() {
  if (!estado.butaca) { cb.sol = null; return }
  try { const { data } = await sb.rpc('v2_bloque_mi_solicitud'); cb.sol = data || null } catch (e) { cb.sol = null }
}

function vistaCrear() {
  const s = cb.sol
  if (!estado.user) return `<div class="empty"><div class="e-icon">${ICON_GRUPO}</div><h3>Creá tu bloque</h3><p>Iniciá sesión para empezar.</p><a class="btn btn-accent" href="${APP_ACTUAL}">Iniciar sesión</a></div>`
  if (s && s.estado === 'pendiente') {
    const falta = !s.dni_frente || !s.dni_dorso
    const item = (ok, t) => `<li class="${ok ? 'ok' : 'falta'}"><span>${ok ? '✓' : '!'}</span>${t}</li>`
    return `<div class="cb-estado">
      <span class="cb-sello">${falta ? 'Falta completar' : 'En revisión'}</span>
      <h3>${esc(s.bloque_nombre || 'Tu bloque')}</h3>
      <p>${falta ? 'Tu solicitud quedó guardada, pero falta tu DNI para que el equipo pueda revisarla.' : 'El equipo del Cabildo está revisando tu solicitud. Te vamos a avisar cuando haya una respuesta.'}</p>
      <ul class="cb-check">${item(true, 'Datos del bloque')}${item(s.dni_frente, 'DNI · frente')}${item(s.dni_dorso, 'DNI · dorso')}${item(!!s.foto_url, 'Tu foto (opcional)')}</ul>
      ${falta || !s.foto_url ? `<button class="btn btn-accent" data-cb="completar">${falta ? 'Completar solicitud' : 'Agregar mi foto'}</button>` : ''}
    </div>`
  }
  if (s && s.estado === 'aprobada') return `<div class="cb-estado"><span class="cb-sello ok">Aprobado</span><h3>${esc(s.bloque_nombre || 'Tu bloque')}</h3><p>Sos el anfitrión de este bloque.</p></div>`
  if (s && s.estado === 'suspendida') return `<div class="cb-estado"><span class="cb-sello mal">Suspendido</span><h3>${esc(s.bloque_nombre || 'Tu bloque')}</h3><p>${esc(s.motivo || 'Tu bloque está suspendido.')}</p></div>`
  return `<div class="empty">
    <div class="e-icon">${ICON_GRUPO}</div>
    <h3>Creá tu bloque</h3>
    <p>Reuní ciudadanos alrededor de tus ideas.</p>
    ${s?.estado === 'rechazada' ? `<p class="cb-rechazo">Tu solicitud anterior no fue aprobada${s.motivo ? `: ${esc(s.motivo)}` : '.'} Podés enviar una nueva.</p>` : ''}
    <ul class="reqs">
      <li><span class="n">1</span><span><b>Tener butaca.</b> Haber pasado la verificación del Cabildo.</span></li>
      <li><span class="n">2</span><span><b>Mostrar tu nombre.</b> Como anfitrión, tu nombre y apellido serán públicos.</span></li>
      <li><span class="n">3</span><span><b>Verificar tu identidad.</b> Subís tu DNI, que se borra al cerrar el bloque.</span></li>
      <li><span class="n">4</span><span><b>Aprobación.</b> El equipo del Cabildo revisa tu solicitud.</span></li>
    </ul>
    ${estado.butaca ? '<button class="btn btn-accent" data-cb="empezar">Empezar solicitud</button>'
      : `<a class="btn btn-accent" href="${APP_ACTUAL}">Primero conseguí tu butaca</a>`}
  </div>`
}

function abrirCrearBloque(completar = false) {
  if (!estado.butaca) { aviso('Necesitás tu butaca verificada.', 'error'); return }
  cb.completar = completar
  cb.paso = completar ? 4 : 0
  $('#cb-pie').hidden = false
  if (!completar) { cb.archivos = {}; Object.values(cb.prev).forEach(u => URL.revokeObjectURL(u)); cb.prev = {} }
  $('#modal-bloque').hidden = false
  pintarCrear()
}

function cerrarCrearBloque() {
  if (cb.enviando) return
  $('#modal-bloque').hidden = true
}

const campo = (id, etiqueta, max, valor, tipo = 'input', extra = '') => `
  <label class="ml-l">${etiqueta} <em data-cc="${id}">${(valor || '').length}/${max}</em>
    ${tipo === 'input' ? `<input id="cb-${id}" maxlength="${max}" value="${esc(valor)}" ${extra}>` : `<textarea id="cb-${id}" maxlength="${max}" rows="3" ${extra}>${esc(valor)}</textarea>`}</label>`

function cajaArchivo(tipo, titulo, ayuda, forma = 'rect') {
  const ya = cb.prev[tipo] || (tipo === 'foto' && cb.sol?.foto_url) || (tipo === 'imagen' && cb.sol?.imagen_url)
  const subido = tipo.startsWith('dni') && cb.sol?.[tipo] && !cb.archivos[tipo]
  return `<label class="cb-archivo ${forma} ${ya ? 'con' : ''}">
    <input type="file" accept="image/jpeg,image/png,image/webp" ${tipo.startsWith('dni') ? 'capture="environment"' : ''} data-archivo="${tipo}" hidden>
    ${ya ? `<img src="${esc(ya)}" alt="">` : subido ? '<span class="cb-ok-doc">✓ Ya subido</span>' : '<span class="cb-mas">+</span>'}
    <span class="cb-arch-txt"><b>${titulo}</b><small>${ya || subido ? 'Tocá para cambiarla' : ayuda}</small></span>
  </label>`
}

function pintarCrear() {
  const f = cb.f, p = cb.paso
  $('#cb-pasos').innerHTML = PASOS.map((t, i) => `<li class="${i < p ? 'hecho' : i === p ? 'actual' : ''}"><span>${i < p ? '✓' : i + 1}</span>${t}</li>`).join('')
  let cuerpo = ''
  if (p === 0) cuerpo = `
    <h2>Antes de empezar</h2>
    <p class="muted">Un bloque es la única forma de tener una cara pública en el Cabildo. Todo lo demás sigue siendo anónimo.</p>
    <div class="cb-dos">
      <div class="cb-col pub"><h4>Va a ser público</h4><ul><li>Tu nombre y apellido</li><li>Tu foto y tu bio, si las cargás</li><li>El nombre, lema y descripción del bloque</li><li>Cuántos ciudadanos tiene el bloque</li></ul></div>
      <div class="cb-col priv"><h4>Sigue siendo privado</h4><ul><li>Tu número de butaca y cómo votás</li><li>Quiénes son los miembros del bloque</li><li>Tu DNI: solo lo ve el equipo de verificación y se borra al cerrar el bloque o si se rechaza la solicitud</li></ul></div>
    </div>
    <p class="cb-nota">Podés tener un solo bloque. Si te sumaste a otro bloque, al aprobarse el tuyo pasás a ser miembro del tuyo.</p>`
  else if (p === 1) cuerpo = `
    <h2>Tu identidad pública</h2>
    <p class="muted">Así te van a ver como anfitrión. Usá tu nombre real: lo comparamos con tu DNI.</p>
    <div class="cb-form">
      <div class="cb-fila">${campo('nombre', 'Nombre', 60, f.nombre, 'input', 'autocomplete="given-name"')}${campo('apellido', 'Apellido', 60, f.apellido, 'input', 'autocomplete="family-name"')}</div>
      ${campo('bio', 'Bio (opcional)', 500, f.bio, 'textarea', 'placeholder="Quién sos y por qué armás este bloque"')}
      ${cajaArchivo('foto', 'Tu foto (opcional)', 'Una foto tuya, de frente. Nunca usamos la del DNI.', 'redonda')}
    </div>`
  else if (p === 2) cuerpo = `
    <h2>Tu bloque</h2>
    <div class="cb-con-vista">
      <div class="cb-form">
        ${campo('bloque', 'Nombre del bloque', 60, f.bloque, 'input', 'placeholder="Ej: Venezuela Posible"')}
        ${campo('lema', 'Lema', 120, f.lema, 'input', 'placeholder="Una frase que lo resuma"')}
        ${campo('desc', 'Qué propone el bloque', 2000, f.desc, 'textarea', 'placeholder="Ideas, valores, cómo van a trabajar"')}
        ${cajaArchivo('imagen', 'Imagen del bloque (opcional)', 'Horizontal, sin texto encima')}
      </div>
      <div class="cb-vista"><small class="muted">Así se verá en el panel</small><div id="cb-vista-bloque"></div></div>
    </div>`
  else if (p === 3) cuerpo = `
    <h2>Verificá tu identidad</h2>
    <p class="muted">Sacale una foto a tu DNI o documento de identidad. Solo lo ve el equipo de verificación, para confirmar que sos quien decís ser.</p>
    <div class="cb-dni">${cajaArchivo('dni_frente', 'Frente', 'Con buena luz, sin reflejos, que se vean los 4 bordes')}${cajaArchivo('dni_dorso', 'Dorso', 'Mismo cuidado: legible y completo')}</div>
    <p class="cb-nota">Se guarda en un depósito privado, separado de la verificación anónima de tu butaca. Cada vez que alguien del equipo lo abre, queda registrado. Se borra cuando cerrás el bloque o si la solicitud se rechaza.</p>`
  else {
    const nom = cb.completar ? `${cb.sol?.nombre || ''} ${cb.sol?.apellido || ''}` : `${f.nombre} ${f.apellido}`
    const blq = cb.completar ? cb.sol?.bloque_nombre : f.bloque
    cuerpo = `
    <h2>${cb.completar ? 'Subir lo que falta' : 'Confirmá y enviá'}</h2>
    ${cb.completar ? `<p class="muted">Tu solicitud para «${esc(blq || '')}» ya está guardada. Subí lo que falta.</p>
    <div class="cb-dni">${!cb.sol?.dni_frente ? cajaArchivo('dni_frente', 'DNI · frente', 'Con buena luz, sin reflejos, que se vean los 4 bordes') : ''}${!cb.sol?.dni_dorso ? cajaArchivo('dni_dorso', 'DNI · dorso', 'Legible y completo') : ''}${cajaArchivo('foto', 'Tu foto (opcional)', 'Una foto tuya, de frente', 'redonda')}${cajaArchivo('imagen', 'Imagen del bloque (opcional)', 'Horizontal, sin texto encima')}</div>` : `<div class="cb-resumen"><div><small>Anfitrión</small><b>${esc(nom)}</b></div><div><small>Bloque</small><b>${esc(blq)}</b></div><div><small>DNI</small><b>${cb.archivos.dni_frente && cb.archivos.dni_dorso ? 'Frente y dorso listos' : 'Falta'}</b></div></div>
    <label class="cb-acepto"><input type="checkbox" id="cb-ok1"> Acepto que mi nombre y apellido, <b>${esc(nom.trim())}</b>, se muestren públicamente como anfitrión del bloque «${esc(blq)}».</label>
    <label class="cb-acepto"><input type="checkbox" id="cb-ok2"> Entiendo que mi DNI se guarda de forma privada solo para verificar mi identidad, y que se borra al cerrar el bloque o si la solicitud se rechaza.</label>`}
    <ul class="cb-subidas" id="cb-subidas"></ul>`
  }
  $('#cb-cuerpo').innerHTML = cuerpo
  if (p === 2) vistaPreviaBloque()
  const ultimo = p === 4
  $('#cb-atras').hidden = p === 0 || cb.completar
  $('#cb-pasos').hidden = cb.completar
  $('#cb-sig').textContent = ultimo ? (cb.completar ? 'Subir' : 'Enviar solicitud') : p === 0 ? 'Empezar' : 'Siguiente'
  validarPaso()
}

function vistaPreviaBloque() {
  const v = $('#cb-vista-bloque'); if (!v) return
  v.innerHTML = heroBloque({ id: '_', nombre: cb.f.bloque || 'Nombre del bloque', lema: cb.f.lema || 'Tu lema', anfitrion_nombre: `${cb.f.nombre} ${cb.f.apellido}`.trim() || 'Tu nombre', anfitrion_foto: cb.prev.foto || null, miembros: 1, ideas: 0 })
}

function validarPaso() {
  const f = cb.f, p = cb.paso
  const largo = (s, a, b) => s.trim().length >= a && s.trim().length <= b
  let ok = true
  if (p === 1) ok = largo(f.nombre, 2, 60) && largo(f.apellido, 2, 60)
  if (p === 2) ok = largo(f.bloque, 3, 60)
  if (p === 3) ok = (cb.archivos.dni_frente || cb.sol?.dni_frente) && (cb.archivos.dni_dorso || cb.sol?.dni_dorso)
  if (p === 4 && !cb.completar) ok = $('#cb-ok1')?.checked && $('#cb-ok2')?.checked
  if (p === 4 && cb.completar) ok = Object.keys(cb.archivos).length > 0 && (cb.sol?.dni_frente || cb.archivos.dni_frente) && (cb.sol?.dni_dorso || cb.archivos.dni_dorso)
  $('#cb-sig').disabled = !ok || cb.enviando
}

// Achica y re-dibuja la imagen: sale un JPEG nuevo, sin metadatos (ubicación, cámara, etc.)
function prepararImagen(file, maxLado, calidad = 0.85) {
  return new Promise((res, rej) => {
    if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) && !/\.(jpe?g|png|webp|heic)$/i.test(file.name)) return rej(new Error('Elegí una imagen JPG, PNG o WEBP'))
    const img = new Image(), url = URL.createObjectURL(file)
    img.onload = () => {
      const k = Math.min(1, maxLado / Math.max(img.width, img.height))
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      c.toBlob(b => b ? res(b) : rej(new Error('No se pudo procesar la imagen')), 'image/jpeg', calidad)
    }
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('No se pudo leer la imagen. Probá con otra foto.')) }
    img.src = url
  })
}

async function elegirArchivo(tipo, file) {
  if (!file) return
  try {
    const blob = await prepararImagen(file, tipo.startsWith('dni') ? 1800 : tipo === 'foto' ? 800 : 1400)
    cb.archivos[tipo] = blob
    if (cb.prev[tipo]) URL.revokeObjectURL(cb.prev[tipo])
    cb.prev[tipo] = URL.createObjectURL(blob)
    pintarCrear()
  } catch (e) { aviso(e.message, 'error') }
}

async function subirArchivo(tipo, blob) {
  const { data: { session } } = await sb.auth.getSession()
  const fd = new FormData(); fd.append('tipo', tipo); fd.append('archivo', blob, tipo + '.jpg')
  const r = await fetch(`${window.__ENV.SUPABASE_URL}/functions/v1/bloques-archivos?accion=subir`, {
    method: 'POST', headers: { Authorization: `Bearer ${session?.access_token}`, apikey: window.__ENV.SUPABASE_KEY }, body: fd,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.ok) throw new Error(j.error || 'No se pudo subir el archivo')
  return j
}

async function enviarSolicitudBloque() {
  if (cb.enviando) return
  cb.enviando = true; validarPaso()
  const lista = $('#cb-subidas')
  const fila = (t, e) => { let li = lista.querySelector(`[data-s="${t}"]`); if (!li) { li = document.createElement('li'); li.dataset.s = t; lista.appendChild(li) } li.className = e[0]; li.textContent = e[1] }
  try {
    if (!cb.completar) {
      fila('datos', ['va', 'Guardando tu solicitud…'])
      const f = cb.f
      const { error } = await sb.rpc('bloque_solicitar', { p_nombre: f.nombre, p_apellido: f.apellido, p_bio: f.bio, p_foto_url: null,
        p_bloque_nombre: f.bloque, p_lema: f.lema, p_descripcion: f.desc, p_imagen_url: null, p_acepto_nombre_publico: true, p_consentimiento_version: CONSENTIMIENTO_VERSION })
      if (error) throw new Error(error.message || 'No se pudo guardar la solicitud')
      fila('datos', ['ok', 'Solicitud guardada'])
      cb.completar = true
    }
    const nombres = { dni_frente: 'DNI · frente', dni_dorso: 'DNI · dorso', foto: 'Tu foto', imagen: 'Imagen del bloque' }
    for (const t of ['dni_frente', 'dni_dorso', 'foto', 'imagen']) {
      if (!cb.archivos[t]) continue
      fila(t, ['va', `Subiendo ${nombres[t]}…`])
      await subirArchivo(t, cb.archivos[t])
      delete cb.archivos[t]
      fila(t, ['ok', `${nombres[t]} listo`])
    }
    await cargarSolicitudBloque()
    cb.enviando = false
    $('#cb-cuerpo').innerHTML = `<div class="ml-listo"><div class="sello"><svg viewBox="0 0 24 24"><path d="m5 12 4 4 10-10"/></svg></div>
      <h2>Solicitud enviada</h2><p>El equipo del Cabildo va a revisar tus datos y tu DNI. Te avisamos apenas haya una respuesta.</p></div>`
    $('#cb-pie').hidden = true
    pintarBloques()
  } catch (e) {
    cb.enviando = false
    await cargarSolicitudBloque()
    fila('error', ['mal', e.message + (cb.completar ? ' Tu solicitud quedó guardada: podés volver a intentarlo.' : '')])
    validarPaso(); pintarBloques()
  }
}

function enlazarCrearBloque() {
  const m = $('#modal-bloque'); if (!m) return
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-cb]'); if (!b) return
    abrirCrearBloque(b.dataset.cb === 'completar')
  })
  m.addEventListener('input', e => {
    const id = e.target.id?.replace('cb-', '')
    if (id in cb.f) { cb.f[id] = e.target.value; const c = m.querySelector(`[data-cc="${id}"]`); if (c) c.textContent = `${e.target.value.length}/${e.target.maxLength}` }
    if (cb.paso === 2) vistaPreviaBloque()
    validarPaso()
  })
  m.addEventListener('change', e => { if (e.target.dataset.archivo) elegirArchivo(e.target.dataset.archivo, e.target.files[0]); if (e.target.id?.startsWith('cb-ok')) validarPaso() })
  $('#cb-x').addEventListener('click', cerrarCrearBloque)
  m.addEventListener('click', e => { if (e.target.id === 'modal-bloque') cerrarCrearBloque() })
  $('#cb-atras').addEventListener('click', () => { cb.paso = Math.max(0, cb.paso - 1); pintarCrear() })
  $('#cb-sig').addEventListener('click', () => {
    if (cb.paso < 4) { cb.paso++; return pintarCrear() }
    enviarSolicitudBloque()
  })
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !m.hidden && $('#modal-conf').hidden) cerrarCrearBloque() })
}

// ── Estadísticas ────────────────────────────────────────────────
// Números públicos del Cabildo + la nube de tendencias de stats (Gemini), con caché compartida en el servidor.
const est = { d: null, horas: 1, nube: null, cargando: false }
const TEND_URL = () => `${window.__ENV.SUPABASE_URL}/functions/v1/v2-tendencias`

async function cargarEstadisticas() {
  try { const { data, error } = await sb.rpc('v2_estadisticas'); if (error) throw error; est.d = data } catch (e) { console.warn('v2_estadisticas:', e) }
  pintarEstadisticas()
  cargarTendencias()
}

function pintarEstadisticas() {
  const d = est.d; if (!d || !$('#es-kpis')) return
  const k = (n, t, s = '') => `<div class="card es-kpi"><b>${fmtNum(n)}</b><span>${t}</span>${s ? `<small>${s}</small>` : ''}</div>`
  $('#es-kpis').innerHTML =
    k(d.butacas, 'butacas ocupadas') +
    k(d.votos, 'votos emitidos') +
    k(d.propuestas?.lanzadas, 'propuestas lanzadas') +
    k(d.propuestas?.apoyos, 'butacas encendidas', 'apoyos a propuestas') +
    k(d.debate, 'mensajes en debates') +
    k(d.muro, 'publicaciones en el Muro')
  pintarParticipacion()
}

function pintarParticipacion() {
  const lista = est.d?.participacion || [], box = $('#es-part'); if (!box) return
  if (!lista.length) { box.innerHTML = '<p class="muted">Todavía no hay votaciones cerradas.</p>'; return }
  const ET = { si: 'Sí', no: 'No', abs: 'Abst.' }
  box.innerHTML = lista.map(v => {
    const n = { si: Number(v.si || 0), no: Number(v.no || 0), abs: Number(v.abs || 0) }
    const t = n.si + n.no + n.abs || 1, p = x => Math.round(x / t * 100)
    const orden = ['si', 'no', 'abs'].sort((a, b) => n[b] - n[a])
    const empate = n[orden[0]] === n[orden[1]]
    const gana = empate ? `<div class="es-gana empate"><b>=</b><small>Empate</small></div>`
      : `<div class="es-gana ${orden[0]}"><b>${p(n[orden[0]])}%</b><small>${ET[orden[0]]}</small></div>`
    const seg = k => n[k] > 0 ? `<i class="es-seg ${k}" style="flex:${n[k]}" data-tip="${k === 'abs' ? 'Abstención' : ET[k]}: ${fmtNum(n[k])} (${p(n[k])}%)"></i>` : ''
    const fecha = v.ends_at ? new Date(v.ends_at).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' }) : ''
    return `<article class="es-v">
      <div class="es-v-txt" title="${esc(v.texto)}">${esc(v.texto)}</div>
      <div class="es-v-meta">${[fecha, v.category ? esc(v.category) : '', `${fmtNum(v.total)} votos`].filter(Boolean).join(' · ')}</div>
      ${gana}
      <div class="es-pila" role="img" aria-label="Sí ${p(n.si)}%, No ${p(n.no)}%, Abstención ${p(n.abs)}%">${seg('si')}${seg('no')}${seg('abs')}</div>
      <div class="es-v-et"><span><i class="es-dot si"></i>Sí ${p(n.si)}%</span><span><i class="es-dot no"></i>No ${p(n.no)}%</span>${n.abs ? `<span><i class="es-dot abs"></i>Abst. ${p(n.abs)}%</span>` : ''}</div>
    </article>`
  }).join('')
}

// ── Nube de tendencias (port de stats.cabildodevenezuela.com) ──
async function cargarTendencias() {
  const vacio = $('#cloud-empty-msg'), canvas = $('#cloud-canvas')
  if (!vacio) return
  if (!est.nube) { vacio.textContent = 'Analizando conversaciones…'; vacio.style.display = ''; canvas.style.display = 'none' }
  try {
    const r = await fetch(`${TEND_URL()}?horas=${est.horas}`, { headers: { apikey: window.__ENV.SUPABASE_KEY } })
    const data = await r.json()
    if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status)
    est.nube = data
    renderWordCloud(data.entities || [], data.horas || est.horas, data.total || 0, data.generado_at, data.error)
  } catch (e) {
    console.warn('tendencias:', e)
    $('#cloud-tabs')?.remove(); $('#cloud-legend').style.display = 'none'
    vacio.textContent = 'No se pudo cargar el análisis. Probá de nuevo en unos minutos.'; vacio.style.display = ''; canvas.style.display = 'none'
  }
}

function renderWordCloud(entities, hours, total, generado, aviso) {
  const wrap = $('#cloud-wrap'), meta = $('#cloud-meta'), emptyMsg = $('#cloud-empty-msg'), canvas = $('#cloud-canvas'), legend = $('#cloud-legend')
  const label = hours === 1 ? 'última hora' : 'últimas ' + hours + ' horas'
  $('#cloud-tabs')?.remove()
  if (!entities || !entities.length) {
    emptyMsg.textContent = aviso && !generado ? 'El análisis todavía no está disponible.' : 'Sin actividad suficiente en la ' + label
    emptyMsg.style.display = ''; canvas.style.display = 'none'; legend.style.display = 'none'
    meta.textContent = total ? `${fmtNum(total)} mensajes en la ${label}` : 'Sin mensajes en la ' + label
    return
  }
  emptyMsg.style.display = 'none'; canvas.style.display = 'block'; legend.style.display = 'flex'
  const isDark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches)
  const sentimentColor = isDark ? { neg: '#E74C3C', pos: '#2ECC71', neu: '#A0B8D8' } : { neg: '#C0392B', pos: '#1A7A4A', neu: '#4A6FA5' }

  const tabs = document.createElement('div'); tabs.id = 'cloud-tabs'; tabs.className = 'cloud-tabs'
  tabs.innerHTML = `<button class="cloud-tab active">Todos</button>` + entities.map(e =>
    `<button class="cloud-tab cloud-tab-${['neg', 'pos', 'neu'].includes(e.sentiment) ? e.sentiment : 'neu'}" data-entity="${esc(e.name)}" title="${esc(e.name)} · ${fmtNum(e.mentions)} menciones">${esc(e.name.split(' ').slice(0, 2).join(' '))}</button>`).join('')
  wrap.insertBefore(tabs, emptyMsg)

  function drawCloud(filtro) {
    const entradas = []
    ;(filtro ? entities.filter(e => e.name === filtro) : entities).forEach(e => {
      const color = sentimentColor[e.sentiment] || sentimentColor.neu
      ;(e.words || []).forEach((w, i) => entradas.push({ word: w, weight: Math.max(2, (e.words.length - i) + 4), color }))
    })
    if (!entradas.length || typeof WordCloud !== 'function') return
    const W = wrap.offsetWidth || 600, Hh = Math.max(200, Math.round(W * 0.42))
    canvas.width = W; canvas.height = Hh
    const colorMap = {}; entradas.forEach(e => { colorMap[e.word] = e.color })
    const escala = Math.max(8, W / 50)
    WordCloud(canvas, {
      list: entradas.map(e => [e.word, e.weight]),
      weightFactor: s => Math.max(12, s * escala),
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif', fontWeight: 'bold',
      color: w => colorMap[w] || sentimentColor.neu, rotateRatio: 0.1, backgroundColor: 'transparent',
      gridSize: Math.round(W / 55), drawOutOfBound: false, shrinkToFit: true, minSize: 10, wait: 0,
    })
  }
  tabs.querySelectorAll('.cloud-tab').forEach(b => b.addEventListener('click', () => {
    tabs.querySelectorAll('.cloud-tab').forEach(x => x.classList.remove('active')); b.classList.add('active'); drawCloud(b.dataset.entity || null)
  }))
  drawCloud(null)
  const hora = generado ? new Date(generado).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : ''
  meta.textContent = `${label} · ${fmtNum(total)} mensajes · analizado ${hora}${aviso ? ' · mostrando el último análisis disponible' : ''}`
}

function enlazarEstadisticas() {
  const v = $('#es-vista'); if (!v) return
  $('#es-ver-res').addEventListener('click', () => { vFiltro = 'cerradas'; $$('[data-vfiltro]').forEach(x => x.classList.toggle('active', x.dataset.vfiltro === 'cerradas')) })
  $$('[data-horas]').forEach(b => b.addEventListener('click', () => {
    est.horas = Number(b.dataset.horas); est.nube = null
    $$('[data-horas]').forEach(x => x.classList.toggle('active', x === b)); cargarTendencias()
  }))
  // Tooltip compartido para barras
  const tip = $('#es-tip')
  v.addEventListener('pointerover', e => { const t = e.target.closest('[data-tip]'); if (!t) return; tip.textContent = t.dataset.tip; tip.hidden = false })
  v.addEventListener('pointermove', e => { if (!tip.hidden) { tip.style.left = e.clientX / (parseFloat(getComputedStyle(document.body).zoom) || 1) + 12 + 'px'; tip.style.top = e.clientY / (parseFloat(getComputedStyle(document.body).zoom) || 1) + 12 + 'px' } })
  v.addEventListener('pointerout', e => { if (e.target.closest('[data-tip]')) tip.hidden = true })
  v.addEventListener('focusin', e => { const t = e.target.closest('[data-tip]'); if (!t) return; const r = t.getBoundingClientRect(), z = parseFloat(getComputedStyle(document.body).zoom) || 1; tip.textContent = t.dataset.tip; tip.hidden = false; tip.style.left = r.left / z + 'px'; tip.style.top = r.bottom / z + 6 + 'px' })
  v.addEventListener('focusout', () => { tip.hidden = true })
  let rz; new ResizeObserver(() => { clearTimeout(rz); rz = setTimeout(() => { if (est.nube && vistaActual() === 'estadisticas') renderWordCloud(est.nube.entities || [], est.nube.horas || est.horas, est.nube.total || 0, est.nube.generado_at, est.nube.error) }, 250) }).observe($('#cloud-wrap'))
}

// Plegar / desplegar el menú izquierdo o el panel de bloques (se recuerda en este navegador)
function plegar(k) {
  const on = $('.app').classList.toggle(k + '-plegado')
  modoCam = 'auto'
  try { localStorage.setItem('ux2_plegado_' + k, on ? '1' : '0') } catch (e) {}
  const btn = k === 'side' ? $('#side-toggle') : $('#panel-toggle')
  const txt = k === 'side' ? (on ? 'Desplegar menú' : 'Plegar menú') : 'Plegar bloques'
  btn.title = txt; btn.setAttribute('aria-label', txt)
}

function irATab(tab) {
  estado.tab = tab
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab))
  pintarBloques()
}

// ══════════════════════════════════════════════════════════════
//  AUDITORIO — sesiones en vivo. Comparte el canal 'auditorio-live' con la versión actual
//  (presencia por butaca, reacciones, chat efímero y manos), así ambas versiones se ven entre sí.
//  Nada de esto se guarda en la base: el chat existe solo mientras estás en la sala.
// ══════════════════════════════════════════════════════════════
const AU_COOLDOWN = 60          // segundos entre mensajes (igual que la versión actual)
const AU_MAX_MSGS = 150
const AU_EMOJIS = ['👏', '🔥', '💯', '🤔', '✊', '❤️']
const au = { s: null, cargado: false, canal: null, vigia: null, presentes: new Set(), msgs: [], manos: [],
  mano: false, finCd: 0, tick: null, muted: true, ultReac: 0, sala: null }

const auNombre = num => { const p = perfiles.get(num); return p?.show_alias && p.alias ? p.alias : `Butaca #${num}` }
const auMiNombre = () => estado.butaca ? auNombre(estado.butaca) : 'Invitado'

function auYoutube(url) {
  try {
    const u = new URL(url)
    let id = null
    if (u.hostname === 'youtu.be') id = u.pathname.slice(1)
    else if (/(^|\.)youtube\.com$/.test(u.hostname)) id = u.searchParams.get('v') || u.pathname.split('/').filter(Boolean).pop()
    return id && /^[\w-]{6,20}$/.test(id) ? id : null
  } catch (e) { return null }
}
const auLinkSeguro = url => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.href : null } catch (e) { return null } }

async function entrarAuditorio() {
  if (!estado.user) { au.cargado = au.usuarioListo; return pintarAuditorio() }
  await cargarSesionAuditorio()
  if (!au.vigia) au.vigia = sb.channel('auditorio-session-watch-v2')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'auditorio_sessions' }, () => cargarSesionAuditorio())
    .subscribe()
}

async function cargarSesionAuditorio() {
  const antes = au.cargado ? au.s?.id + '|' + au.s?.url : 'primera'
  try {
    const { data, error } = await sb.from('auditorio_sessions').select('id, title, description, url, type, is_active')
      .eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw error
    au.s = data || null
  } catch (e) { console.warn('auditorio:', e); au.s = null }
  au.cargado = true
  marcarAuditorioEnVivo(!!au.s)
  if (vistaActual() !== 'auditorio') return
  if (au.s && !au.canal) unirseSala()
  if (!au.s && au.canal) salirSala()
  if (antes !== au.s?.id + '|' + au.s?.url) pintarAuditorio()
}

function marcarAuditorioEnVivo(on) {
  const a = $('#nav a[data-sec="auditorio"]'); if (a) a.classList.toggle('en-vivo', on)
}

async function vigilarAuditorio() {      // punto rojo en el menú cuando hay sesión, aunque no estés en la sección
  if (!estado.user) return
  try {
    const { data } = await sb.from('auditorio_sessions').select('id').eq('is_active', true).limit(1).maybeSingle()
    marcarAuditorioEnVivo(!!data)
  } catch (e) {}
  sb.channel('auditorio-badge-watch-v2')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'auditorio_sessions' }, async () => {
      if (vistaActual() === 'auditorio') return cargarSesionAuditorio()
      const { data } = await sb.from('auditorio_sessions').select('id').eq('is_active', true).limit(1).maybeSingle()
      marcarAuditorioEnVivo(!!data)
    }).subscribe()
}

function unirseSala() {
  au.canal = sb.channel('auditorio-live', { config: { presence: { key: String(estado.butaca || 0) } } })
  au.canal
    .on('presence', { event: 'sync' }, () => {
      const set = new Set()
      Object.values(au.canal.presenceState()).forEach(l => l.forEach(p => { const n = Number(p.seat); if (n > 0) set.add(n) }))
      au.presentes = set
      pintarPresencia()
    })
    .on('broadcast', { event: 'reaction' }, ({ payload: p }) => {
      if (p && AU_EMOJIS.includes(p.emoji)) flotarReaccion(p.emoji, Number(p.seat) > 0 ? auNombre(Number(p.seat)) : 'Invitado')
    })
    .on('broadcast', { event: 'aud_chat' }, ({ payload: p }) => {
      const seat = Number(p?.seat); const text = limpiar(p?.text).slice(0, 280).trim()
      if (!(seat > 0) || !text) return
      agregarChat({ seat, text, at: Number(p.at) || Date.now() })
    })
    .on('broadcast', { event: 'aud_hand' }, ({ payload: p }) => {
      const seat = Number(p?.seat); if (!(seat > 0)) return
      if (p.action === 'raise') { if (!au.manos.some(m => m.seat === seat)) au.manos.push({ seat, at: Number(p.at) || Date.now() }) }
      else au.manos = au.manos.filter(m => m.seat !== seat)
      au.manos.sort((a, b) => a.at - b.at)
      pintarManos()
    })
    .subscribe(async st => { if (st === 'SUBSCRIBED' && estado.butaca) await au.canal.track({ seat: estado.butaca, at: Date.now() }) })
}

function salirSala() {
  if (au.mano) enviarMano(false)
  if (au.canal) { sb.removeChannel(au.canal); au.canal = null }
  clearInterval(au.tick); au.tick = null
  au.presentes = new Set(); au.msgs = []; au.manos = []; au.mano = false
}

function salirAuditorio() {
  salirSala()
  if (au.vigia) { sb.removeChannel(au.vigia); au.vigia = null }
  const f = $('#au-video iframe'); if (f) f.remove()      // corta el video al salir de la sección
  au.s = null; au.cargado = false
}

// ── Pintado ──
function pintarAuditorio() {
  const c = $('#au-cuerpo'); if (!c) return
  $('#au-envivo').hidden = !au.s
  $('#au-presentes').hidden = !au.s
  $('#au-sub').textContent = au.s ? (au.s.title || 'Sesión en vivo') : 'Sesiones en vivo del Cabildo. Mirá, reaccioná y pedí la palabra.'
  if (!au.cargado) { c.innerHTML = '<div class="card au-vacio"><p class="muted">Cargando…</p></div>'; return }
  if (!estado.user) {
    c.innerHTML = `<div class="card au-vacio">${auIconoVacio()}<h3>El Auditorio es para ciudadanos</h3>
      <p class="muted">Iniciá sesión para entrar a las sesiones en vivo.</p><a class="btn btn-dark" href="${APP_ACTUAL}">Iniciar sesión</a></div>`
    return
  }
  if (!au.s) {
    c.innerHTML = `<div class="card au-vacio">${auIconoVacio()}<h3>No hay ninguna sesión en vivo</h3>
      <p class="muted">Cuando empiece una sesión vas a ver el punto rojo en el menú y se abre acá sola.</p></div>`
    return
  }
  const s = au.s, yt = auYoutube(s.url || ''), link = !yt && auLinkSeguro(s.url || '')
  let escenario
  if (yt) escenario = `<div class="au-video" id="au-video">
      <iframe src="https://www.youtube.com/embed/${yt}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&playsinline=1&enablejsapi=1&iv_load_policy=3&disablekb=1&fs=0"
        title="${esc(s.title || 'Sesión en vivo')}" allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="origin"></iframe>
      <div class="au-tapa"></div>
      <button class="au-sonido" id="au-sonido" title="Activar sonido">${auIconoSonido(true)}<span>Activar sonido</span></button>
    </div>`
  else if (link) {
    const donde = /meet\.google/.test(link) ? 'Google Meet' : /zoom\.us/.test(link) ? 'Zoom' : null
    escenario = `<div class="au-video au-externo"><div>
      <span class="au-ico-grande">📹</span><h3>${donde ? 'Sesión en ' + donde : 'Sesión en vivo'}</h3>
      <p>Esta sesión se transmite en una plataforma externa.</p>
      <a class="btn au-btn-claro" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Abrir ${donde || 'la sesión'} →</a></div></div>`
  } else escenario = `<div class="au-video au-externo"><div><span class="au-espera"><i></i><i></i><i></i></span>
      <h3>La transmisión todavía no empezó</h3><p>Aparece acá sola apenas arranque.</p></div></div>`

  const puedeHablar = !!estado.butaca
  c.innerHTML = `
  <div class="au-wrap">
    <div class="au-col">
      <section class="au-escenario">
        ${escenario}
        <div class="au-flotan" id="au-flotan" aria-hidden="true"></div>
      </section>
      <div class="au-barra card">
        <div class="au-reac" role="group" aria-label="Reaccionar">
          ${AU_EMOJIS.map(e => `<button data-reac="${e}" title="Reaccionar ${e}">${e}</button>`).join('')}
        </div>
        ${s.description ? `<p class="au-desc">${esc(s.description)}</p>` : ''}
      </div>
      <section class="card au-sala">
        <div class="au-sala-cab"><div><h3>La sala</h3><p class="muted" id="au-sala-txt">Cada punto encendido es una butaca mirando ahora.</p></div></div>
        <div class="au-sala-svg" id="au-sala"></div>
      </section>
    </div>
    <aside class="card au-lado">
      <div class="au-manos" id="au-manos"></div>
      <div class="au-chat" id="au-chat"></div>
      ${puedeHablar ? `
      <div class="au-compo">
        <div class="au-compo-fila">
          <button class="db-mano" id="au-mano" title="Pedir la palabra">✋</button>
          <textarea id="au-txt" maxlength="280" rows="2" placeholder="Pedí la palabra…" disabled></textarea>
          <button class="btn btn-dark" id="au-enviar" disabled>Enviar</button>
        </div>
        <div class="db-estado"><span id="au-estado"></span><em id="au-cont">0/280</em></div>
        <div class="db-cd" id="au-cd" hidden><i id="au-cd-fill"></i></div>
      </div>` : `<div class="db-cerrado">Para hablar necesitás tu butaca: <a href="${APP_ACTUAL}">completá la verificación</a>.</div>`}
    </aside>
  </div>`
  pintarPresencia(); pintarManos(); pintarChat(); pintarMiMano()
}

const auIconoVacio = () => `<span class="au-vacio-ico"><svg viewBox="0 0 24 24">${ICONOS.auditorio}</svg></span>`
const auIconoSonido = mudo => mudo
  ? '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="m22 9-6 6M16 9l6 6"/></svg>'
  : '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>'

function pintarPresencia() {
  const n = au.presentes.size
  const el = $('#au-n'); if (el) el.textContent = fmtNum(n)
  const t = $('#au-sala-txt')
  if (t) t.textContent = n ? `${fmtNum(n)} ${n === 1 ? 'butaca está' : 'butacas están'} mirando ahora.` : 'Sé el primero en llegar.'
  pintarSala()
}

// Mini hemiciclo: el escenario arriba, las filas abiertas hacia abajo (como un teatro)
function pintarSala() {
  const box = $('#au-sala'); if (!box) return
  const total = Math.max(totalButacas, estado.butaca, ...au.presentes, 1)
  if (!au.sala || au.sala.n !== total) {
    const span = H.A1 - H.A0, pts = []
    for (let row = 0; pts.length < total; row++) {
      const r = H.R_IN + row * H.R_STEP, cap = Math.floor(r * span / H.GAP), cant = Math.min(cap, total - pts.length), orden = ordenCentro(cap)
      for (let i = 0; i < cant; i++) { const a = H.A0 + (cap > 1 ? orden[i] / (cap - 1) : .5) * span; pts.push({ x: r * Math.cos(a), y: r * Math.sin(a), num: pts.length + 1 }) }
    }
    let x0 = Infinity, x1 = -Infinity, y1 = -Infinity
    pts.forEach(p => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y) })
    au.sala = { n: total, pts, vb: `${x0 - 40} -40 ${x1 - x0 + 80} ${y1 + 80}` }
  }
  const { pts, vb } = au.sala, yo = estado.butaca
  const fondo = pts.filter(p => !au.presentes.has(p.num) && p.num !== yo).map(p => `<circle cx="${p.x.toFixed(0)}" cy="${p.y.toFixed(0)}" r="9"/>`).join('')
  const luz = pts.filter(p => au.presentes.has(p.num) || p.num === yo).map(p =>
    `<g class="${p.num === yo ? 'yo' : ''}"><circle class="halo" cx="${p.x.toFixed(0)}" cy="${p.y.toFixed(0)}" r="36"/><circle cx="${p.x.toFixed(0)}" cy="${p.y.toFixed(0)}" r="15"><title>${esc(p.num === yo ? 'Vos' : auNombre(p.num))}</title></circle>${p.num === yo ? `<circle class="anillo" cx="${p.x.toFixed(0)}" cy="${p.y.toFixed(0)}" r="30"/>` : ''}</g>`).join('')
  box.innerHTML = `<svg viewBox="${vb}" role="img" aria-label="${au.presentes.size} butacas presentes">
    <line class="tablado" x1="-300" y1="-10" x2="300" y2="-10"/><text class="tablado-txt" x="0" y="36" text-anchor="middle">ESCENARIO</text>
    <g class="fondo">${fondo}</g><g class="luz">${luz}</g></svg>`
}

function pintarManos() {
  const el = $('#au-manos'); if (!el) return
  el.innerHTML = `<div class="au-sec-cab">✋ Piden la palabra ${au.manos.length ? `<span class="au-cuenta">${au.manos.length}</span>` : ''}</div>` +
    (au.manos.length ? `<div class="au-manos-lista">${au.manos.slice(0, 12).map((m, i) =>
      `<span class="${m.seat === estado.butaca ? 'yo' : ''}"><b>${i + 1}</b>${esc(m.seat === estado.butaca ? 'Vos' : auNombre(m.seat))}</span>`).join('')}</div>`
      : '<p class="muted au-chico">Nadie pidió la palabra todavía.</p>')
}

function burbujaChat(m) {
  const mia = m.seat === estado.butaca, nombre = auNombre(m.seat), p = perfiles.get(m.seat)
  const ini = p?.show_alias && p.alias ? esc(p.alias.charAt(0).toUpperCase()) : '#'
  return `<div class="au-msg ${mia ? 'mia' : ''}"><span class="db-av" style="background:${mia ? 'var(--orange)' : colorDe(p?.card_color, m.seat)}">${ini}</span>
    <div><div class="au-msg-cab"><b>${mia ? 'Vos' : esc(nombre)}</b><span>#${m.seat}</span></div><p>${esc(m.text)}</p></div></div>`
}

function pintarChat() {
  const el = $('#au-chat'); if (!el) return
  el.innerHTML = au.msgs.length ? au.msgs.map(burbujaChat).join('')
    : '<p class="muted au-chat-vacio">El chat de la sala es efímero: no se guarda y solo lo ven quienes están ahora.</p>'
  el.scrollTop = el.scrollHeight
}

function agregarChat(m) {
  au.msgs.push(m); if (au.msgs.length > AU_MAX_MSGS) au.msgs.shift()
  const el = $('#au-chat'); if (!el) return
  if (au.msgs.length === 1 || au.msgs.length === AU_MAX_MSGS) return pintarChat()
  const cerca = el.scrollHeight - el.scrollTop - el.clientHeight < 120
  el.insertAdjacentHTML('beforeend', burbujaChat(m))
  if (cerca || m.seat === estado.butaca) el.scrollTop = el.scrollHeight
}

function pintarMiMano() {
  const btn = $('#au-mano'); if (!btn) return
  const enCd = au.finCd > Date.now()
  const txt = $('#au-txt'), env = $('#au-enviar'), est = $('#au-estado'), cd = $('#au-cd')
  btn.className = 'db-mano ' + (enCd ? 'cooldown' : au.mano ? 'ready' : 'idle')
  btn.disabled = enCd
  txt.disabled = !au.mano; env.disabled = !au.mano
  txt.placeholder = au.mano ? 'Tu mensaje para la sala (máx. 280)…' : 'Pedí la palabra…'
  cd.hidden = !enCd; est.className = ''
  if (enCd) { est.innerHTML = `Esperá <b>${Math.ceil((au.finCd - Date.now()) / 1000)} s</b> para volver a hablar`; est.className = 'espera' }
  else if (au.mano) { est.innerHTML = '<b>Tenés la palabra</b>: escribí tu mensaje'; est.className = 'ok' }
  else est.textContent = 'Levantá la mano para hablar'
}

// ── Acciones ──
function enviarMano(arriba) {
  au.mano = arriba
  const at = Date.now()
  try { au.canal?.send({ type: 'broadcast', event: 'aud_hand', payload: { seat: estado.butaca, alias: auMiNombre(), action: arriba ? 'raise' : 'lower', at } }) } catch (e) {}
  au.manos = au.manos.filter(m => m.seat !== estado.butaca)
  if (arriba) au.manos.push({ seat: estado.butaca, at })
  pintarManos(); pintarMiMano()
}

function alternarManoAud() {
  if (!estado.butaca || !au.canal || au.finCd > Date.now()) return
  enviarMano(!au.mano)
  if (au.mano) $('#au-txt')?.focus()
}

function enviarChatAud() {
  if (!au.mano || !au.canal) return
  const el = $('#au-txt'), text = limpiar(el.value).replace(/\s+/g, ' ').trim().slice(0, 280)
  if (!text) return
  const m = { seat: estado.butaca, text, at: Date.now() }
  au.canal.send({ type: 'broadcast', event: 'aud_chat', payload: { ...m, alias: auMiNombre() } })
  agregarChat(m)                      // el canal no devuelve tus propios mensajes
  el.value = ''; $('#au-cont').textContent = '0/280'
  enviarMano(false)
  au.finCd = Date.now() + AU_COOLDOWN * 1000
  clearInterval(au.tick)
  au.tick = setInterval(() => {
    const resta = au.finCd - Date.now()
    const f = $('#au-cd-fill'); if (f) f.style.width = Math.max(0, resta / (AU_COOLDOWN * 10)) + '%'
    if (resta <= 0) { clearInterval(au.tick); au.tick = null }
    pintarMiMano()
  }, 500)
  pintarMiMano()
}

function reaccionar(emoji) {
  if (!au.canal || Date.now() - au.ultReac < 700) return      // sin lluvias de reacciones
  au.ultReac = Date.now()
  try { au.canal.send({ type: 'broadcast', event: 'reaction', payload: { emoji, seat: estado.butaca || 0, alias: auMiNombre() } }) } catch (e) {}
  flotarReaccion(emoji, 'Vos')
}

function flotarReaccion(emoji, nombre) {
  const area = $('#au-flotan'); if (!area || area.childElementCount > 40) return
  const el = document.createElement('div')
  el.className = 'au-flota'
  el.style.left = (6 + Math.random() * 80) + '%'
  el.style.setProperty('--deriva', (Math.random() * 60 - 30).toFixed(0) + 'px')
  el.innerHTML = `<span>${emoji}</span><small>${esc(nombre)}</small>`
  area.appendChild(el)
  setTimeout(() => el.remove(), 3400)
}

function alternarSonido() {
  const f = $('#au-video iframe'); if (!f) return
  au.muted = !au.muted
  f.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: au.muted ? 'mute' : 'unMute', args: [] }), '*')
  if (!au.muted) f.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*')
  const b = $('#au-sonido')
  if (b) { b.classList.toggle('activo', !au.muted); b.title = au.muted ? 'Activar sonido' : 'Silenciar'
    b.innerHTML = `${auIconoSonido(au.muted)}<span>${au.muted ? 'Activar sonido' : ''}</span>` }
}

function enlazarAuditorio() {
  const v = $('#au-vista'); if (!v) return
  v.addEventListener('click', e => {
    const r = e.target.closest('[data-reac]'); if (r) return reaccionar(r.dataset.reac)
    if (e.target.closest('#au-mano')) return alternarManoAud()
    if (e.target.closest('#au-enviar')) return enviarChatAud()
    if (e.target.closest('#au-sonido')) return alternarSonido()
  })
  v.addEventListener('input', e => { if (e.target.id === 'au-txt') $('#au-cont').textContent = `${e.target.value.length}/280` })
  v.addEventListener('keydown', e => { if (e.target.id === 'au-txt' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarChatAud() } })
  window.addEventListener('beforeunload', () => { if (au.mano) enviarMano(false) })
}

async function iniciar() {
  pintarNav(); enlazar(); enlazarMiButaca(); enlazarDebates(); enlazarPropuestas(); enlazarCiudadanos(); enlazarCrearBloque(); enlazarEstadisticas(); enlazarAuditorio(); ruta()
  tickReloj(); setInterval(() => { tickReloj(); tickVotacion(); tickCuentas(); tickPropuestas() }, 1000)
  await cargarUsuario()
  vigilarSesion()
  au.usuarioListo = true
  vigilarAuditorio()
  if (vistaActual() === 'auditorio') entrarAuditorio()
  cargarSocial().then(() => {
    if (vistaActual() === 'ciudadanos') pintarCiudadanos()
    if (ciu.perfil) $$(`[data-seguir="${ciu.perfil}"]`).forEach(x => { x.outerHTML = botonSeguir(ciu.perfil) })
  })
  if (vistaActual() === 'propuestas' && pr.d) refrescarPropuestas()
  if (vistaActual() === 'debates' && dbt.q) { pintarHilo(); if (dbAbierto(dbt.q) && estado.user && !dbt.canal) entrarAlCanal(dbt.q.id) }
  await Promise.all([cargarHemiciclo(), cargarVotacion(), cargarMuro(), cargarBloques()])
  if (vistaActual() === 'butaca') cargarMiButaca()
  if (vistaActual() === 'propuestas' && pr.d) pintarPropuestas()   // ya con alias públicos cargados
  setInterval(cargarVotacion, 60_000)   // refresca votos y estado de la sesión
}
iniciar()

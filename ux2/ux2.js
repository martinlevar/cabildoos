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

const estado = { user: null, butaca: 0, alias: null, bloques: [], miBloque: null, tab: 'destacados' }

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

const LISTAS = new Set(['inicio', 'votaciones'])   // secciones ya rediseñadas

function pintarNav() {
  $('#nav').innerHTML = SECCIONES.map(([id, label]) => `
    <li><a href="#${id}" data-sec="${id}" title="${label}">
      <svg viewBox="0 0 24 24">${ICONOS[id]}</svg><span>${label}</span>
      ${LISTAS.has(id) ? '' : '<span class="soon-tag">pronto</span>'}
    </a></li>`).join('')
}

function ruta() {
  const sec = (location.hash || '#inicio').slice(1)
  const valida = SECCIONES.some(([id]) => id === sec) ? sec : 'inicio'
  $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.sec === valida))
  const vista = LISTAS.has(valida) ? valida : 'pronto'
  $$('.view').forEach(v => { v.hidden = v.dataset.view !== vista })
  if (vista === 'pronto') $('#soon-title').textContent = SECCIONES.find(([id]) => id === valida)[1]
  cerrarMenu()
  window.scrollTo(0, 0)
  if (valida === 'inicio') requestAnimationFrame(dibujarHemiciclo)
  if (valida === 'votaciones') cargarVotaciones()
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
  if (!estado.user) return pintarUsuario()
  try {
    const [{ data: num }, { data: ident }] = await Promise.all([sb.rpc('get_my_seat'), sb.rpc('get_my_seat_identity')])
    estado.butaca = Number(num) || 0
    const fila = Array.isArray(ident) ? ident[0] : ident
    estado.alias = fila?.alias || null
  } catch (e) { console.warn('cargarUsuario:', e) }
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
let vPreguntas = [], vResultados = new Map(), vMisVotos = new Map(), vFiltro = 'abiertas'
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
      const mios = await Promise.all(abiertas.map(q => sb.rpc('get_my_vote', { p_question_id: q.id })))
      abiertas.forEach((q, i) => { const v = mios[i]?.data?.[0]?.vote_plain; if (v) vMisVotos.set(q.id, v) })
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
  const filas = [['si', '#16a34a'], ['no', '#e11d48'], ['abs', '#64748b']].map(([k, c]) => {
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
    const mio = vMisVotos.get(q.id)
    const pie = vFiltro === 'abiertas'
      ? (mio
          ? `<span class="v-mio"><svg viewBox="0 0 24 24"><path d="m5 12 4 4 10-10"/></svg>Ya votaste</span>`
          : `<button class="btn btn-dark" data-votar="${q.id}"><svg viewBox="0 0 24 24"><path d="M5 20V10M12 20V4M19 20v-7"/></svg>Votar</button>`)
        + `<a class="btn btn-soft" href="${APP_ACTUAL}"><svg viewBox="0 0 24 24"><path d="M5 5h14v10H9l-4 4z"/></svg>Debate</a>`
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
    const { data } = await sb.rpc('get_my_vote', { p_question_id: q.id })
    if (data?.[0]?.vote_plain) vMisVotos.set(q.id, data[0].vote_plain)
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
  vMisVotos.set(q.id, voto)
  $('#mv-cuerpo').innerHTML = `<div class="mv-ok"><div class="sello"><svg viewBox="0 0 24 24"><path d="m5 12 4 4 10-10"/></svg></div>
    <h3>¡Voto sellado!</h3><p>Votaste <b>${OPC[voto][0]}</b>. Los resultados se publican al cerrar la votación.</p>
    <code title="Comprobante">Comprobante: ${hash}</code>
    <button class="btn btn-dark" id="mv-listo">Listo</button></div>`
  $('#mv-listo').onclick = cerrarVoto
  cargarVotacion()
  if (location.hash === '#votaciones') pintarVotaciones()
}

// ── Muro del día ────────────────────────────────────────────────
const COLORES = { orange: '#f97316', red: '#e11d48', pink: '#ec4899', purple: '#8b5cf6', blue: '#0ea5e9', indigo: '#6366f1', green: '#16a34a', teal: '#14b8a6', yellow: '#eab308', gray: '#64748b' }
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

function vistaCrear() {
  const sol = estado.miBloque?.solicitud
  if (sol && ['pendiente', 'aprobada', 'suspendida'].includes(sol.estado)) {
    const txt = { pendiente: 'Tu solicitud está en revisión.', aprobada: 'Ya sos anfitrión de un bloque.', suspendida: 'Tu bloque está suspendido.' }[sol.estado]
    return `<div class="empty"><h3>${esc(sol.bloque_nombre || 'Tu bloque')}</h3><p>${txt}</p></div>`
  }
  return `<div class="empty">
    <div class="e-icon">${ICON_GRUPO}</div>
    <h3>Creá tu bloque</h3>
    <p>Reuní ciudadanos alrededor de tus ideas.</p>
    <ul class="reqs">
      <li><span class="n">1</span><span><b>Tener butaca.</b> Haber pasado la verificación del Cabildo.</span></li>
      <li><span class="n">2</span><span><b>Mostrar tu nombre.</b> Como anfitrión, tu nombre y apellido serán públicos.</span></li>
      <li><span class="n">3</span><span><b>Verificar tu identidad.</b> Subís tu DNI, que se borra al cerrar el bloque.</span></li>
      <li><span class="n">4</span><span><b>Aprobación.</b> El equipo del Cabildo revisa tu solicitud.</span></li>
    </ul>
    <span class="btn btn-accent" aria-disabled="true">Empezar solicitud · próximamente</span>
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

async function iniciar() {
  pintarNav(); enlazar(); ruta()
  tickReloj(); setInterval(() => { tickReloj(); tickVotacion(); tickCuentas() }, 1000)
  await cargarUsuario()
  vigilarSesion()
  await Promise.all([cargarHemiciclo(), cargarVotacion(), cargarMuro(), cargarBloques()])
  setInterval(cargarVotacion, 60_000)   // refresca votos y estado de la sesión
}
iniciar()

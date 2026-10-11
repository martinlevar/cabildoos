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

const LISTAS = new Set(['inicio', 'votaciones', 'butaca', 'debates'])   // secciones ya rediseñadas

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
  pintarNav(); enlazar(); enlazarMiButaca(); enlazarDebates(); ruta()
  tickReloj(); setInterval(() => { tickReloj(); tickVotacion(); tickCuentas() }, 1000)
  await cargarUsuario()
  vigilarSesion()
  if (vistaActual() === 'debates' && dbt.q) { pintarHilo(); if (dbAbierto(dbt.q) && estado.user && !dbt.canal) entrarAlCanal(dbt.q.id) }
  await Promise.all([cargarHemiciclo(), cargarVotacion(), cargarMuro(), cargarBloques()])
  if (vistaActual() === 'butaca') cargarMiButaca()
  setInterval(cargarVotacion, 60_000)   // refresca votos y estado de la sesión
}
iniciar()

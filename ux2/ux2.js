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

function pintarNav() {
  $('#nav').innerHTML = SECCIONES.map(([id, label]) => `
    <li><a href="#${id}" data-sec="${id}" title="${label}">
      <svg viewBox="0 0 24 24">${ICONOS[id]}</svg><span>${label}</span>
      ${id === 'inicio' ? '' : '<span class="soon-tag">pronto</span>'}
    </a></li>`).join('')
}

function ruta() {
  const sec = (location.hash || '#inicio').slice(1)
  const valida = SECCIONES.some(([id]) => id === sec) ? sec : 'inicio'
  $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.sec === valida))
  $$('.view').forEach(v => { v.hidden = v.dataset.view !== (valida === 'inicio' ? 'inicio' : 'pronto') })
  if (valida !== 'inicio') $('#soon-title').textContent = SECCIONES.find(([id]) => id === valida)[1]
  cerrarMenu()
  if (valida === 'inicio') requestAnimationFrame(dibujarHemiciclo)
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
const H = { DOT: 14, GAP: 14 * 3.1, A0: 24 * Math.PI / 180, A1: 156 * Math.PI / 180, R_IN: 320, R_STEP: 50 }
let totalButacas = 0
let asientos = []

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
      res.push({ x: r * Math.cos(a), y: r * Math.sin(a) })
    }
    row++
  }
  return res
}

function dibujarHemiciclo() {
  const cv = $('#hemi'); if (!cv || !cv.offsetParent) return
  const wrap = cv.parentElement
  const W = wrap.clientWidth, Hh = wrap.clientHeight
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  cv.width = W * dpr; cv.height = Hh * dpr
  const ctx = cv.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, Hh)
  if (!asientos.length) return

  // Encajar: dejar lugar abajo para el rótulo y arriba para el cartel de "tu butaca"
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const s of asientos) { x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y) }
  const padTop = 70, padBottom = 96, padX = 12
  const sc = Math.min((W - padX * 2) / (x1 - x0 + H.DOT * 2), (Hh - padTop - padBottom) / (y1 - y0 + H.DOT * 2))
  const ox = W / 2 - ((x0 + x1) / 2) * sc
  const oy = padTop + H.DOT * sc - y0 * sc
  const r = Math.max(1.3, H.DOT * sc * .8)
  const css = getComputedStyle(document.documentElement)
  const cSeat = css.getPropertyValue('--seat').trim() || '#1a1f3c'
  const cMine = css.getPropertyValue('--orange').trim() || '#f76a1e'

  ctx.fillStyle = cSeat
  asientos.forEach((s, i) => {
    if (i + 1 === estado.butaca) return
    ctx.globalAlpha = i % 7 === 3 ? .55 : 1           // leve variación de tono, como en el diseño
    ctx.beginPath(); ctx.arc(ox + s.x * sc, oy + s.y * sc, r, 0, Math.PI * 2); ctx.fill()
  })
  ctx.globalAlpha = 1

  const tip = $('#my-seat-tip')
  const mia = estado.butaca && asientos[estado.butaca - 1]
  if (mia) {
    const mx = ox + mia.x * sc, my = oy + mia.y * sc
    ctx.shadowColor = 'rgba(247,106,30,.6)'; ctx.shadowBlur = 12
    ctx.fillStyle = cMine
    ctx.beginPath(); ctx.arc(mx, my, r * 1.25, 0, Math.PI * 2); ctx.fill()
    ctx.shadowBlur = 0
    tip.style.left = mx + 'px'; tip.style.top = my + 'px'; tip.hidden = false
  } else tip.hidden = true
}

async function cargarHemiciclo() {
  try {
    const { data, error } = await sb.rpc('get_butaca_count')
    if (error) throw error
    totalButacas = Number(data) || 0
    $('#st-butacas').textContent = fmtNum(totalButacas)
    asientos = calcularAsientos(Math.max(totalButacas, estado.butaca))
    dibujarHemiciclo()
  } catch (e) { console.warn('cargarHemiciclo:', e) }
}

// ── Votación activa ─────────────────────────────────────────────
let pregunta = null
async function cargarVotacion() {
  try {
    const { data, error } = await sb.from('questions')
      .select('id, text, category, ends_at, status')
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
  $$('.tab').forEach(t => t.addEventListener('click', () => irATab(t.dataset.tab)))
  $('#bloques-body').addEventListener('click', e => {
    const u = e.target.closest('[data-unirme]'); if (u) return unirme(u.dataset.unirme)
    const g = e.target.closest('[data-tab-go]'); if (g) irATab(g.dataset.tabGo)
  })
  // Redibujar el hemiciclo cuando cambia el tamaño de su caja (ventana o columnas plegadas)
  let rz; new ResizeObserver(() => { clearTimeout(rz); rz = setTimeout(dibujarHemiciclo, 60) }).observe($('.hemi-wrap'))
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
  tickReloj(); setInterval(() => { tickReloj(); tickVotacion() }, 1000)
  await cargarUsuario()
  vigilarSesion()
  await Promise.all([cargarHemiciclo(), cargarVotacion(), cargarMuro(), cargarBloques()])
  setInterval(cargarVotacion, 60_000)   // refresca votos y estado de la sesión
}
iniciar()

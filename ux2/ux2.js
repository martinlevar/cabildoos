/* ═══════════════════════════════════════════════════════════════
   Cabildo de Venezuela — UX v2
   Usa la misma base y la misma sesión que la versión actual.
   ═══════════════════════════════════════════════════════════════ */
'use strict'

const sb = window.supabase.createClient(window.__ENV.SUPABASE_URL, window.__ENV.SUPABASE_KEY)
const APP_ACTUAL = '/cuenta'    // login, registro y verificación siguen en la v1, que vive en /cuenta

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
  bloque:       '<circle cx="9" cy="8" r="3"/><path d="M3 19a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M21 19a6 6 0 0 0-4-5.7"/>',
  muro:         '<path d="M3 5h18v14H3z"/><path d="M3 10h18M3 15h18M9 5v5M15 10v5M9 15v4"/>',
  playroom:     '<path d="M6 9h12a3 3 0 0 1 3 3v3a2 2 0 0 1-3.5 1.3L15 14H9l-2.5 2.3A2 2 0 0 1 3 15v-3a3 3 0 0 1 3-3z"/><path d="M8 11v2M7 12h2M16 12h.01"/>',
  funding:     '<path d="M3 17l5-5 4 3 8-8"/><path d="M15 7h5v5"/><path d="M3 21h18"/>',
  escalinatas: '<path d="M3 20h18M6 16h15M9 12h12M12 8h9M15 4h6"/>',
}
const SECCIONES = [
  ['inicio', 'Inicio'], ['butaca', 'Mi Butaca'], ['bloque', 'Mi bloque'], ['muro', 'Muro del día'], ['debates', 'Debates'], ['votaciones', 'Votaciones'],
  ['propuestas', 'Propuestas'], ['ciudadanos', 'Ciudadanos'], ['estadisticas', 'Estadísticas'],
  ['aprende', 'Aprendé'], ['noticias', 'Noticias'], ['auditorio', 'Auditorio'], ['playroom', 'Playroom'],
  ['escalinatas', 'Escalinatas'], ['funding', 'Funding'],
]

// Funding es solo para inversores: por ahora se abre únicamente en dev (y local). En stage y producción aparece como «pronto».
const FUNDING_ABIERTO = ['dev.cabildodevenezuela.com', 'localhost', '127.0.0.1'].includes(location.hostname)

const LISTAS = new Set(['escalinatas', 'inicio', 'votaciones', 'butaca', 'bloque', 'debates', 'propuestas', 'ciudadanos', 'estadisticas', 'auditorio', 'playroom', 'aprende', 'muro', 'funding'])   // secciones ya rediseñadas
if (!FUNDING_ABIERTO) LISTAS.delete('funding')

// Sin butaca, las Escalinatas van segundas y marcadas: es el lugar desde donde se sube al Cabildo.
const sinButaca = () => !!(estado.user && !estado.butaca)
// Modo Escalinatas: quien tiene cuenta pero no butaca ve SOLO el chat (sin menú, sin panel, sin el resto del Cabildo).
// La clase se pone antes de pintar (index.html) con lo recordado de la visita anterior, y se confirma al cargar la sesión.
const modoEscalinatas = () => document.documentElement.classList.contains('modo-ezc')
function aplicarModoEscalinatas() {
  const on = sinButaca()
  document.documentElement.classList.toggle('modo-ezc', on)
  try { if (on) localStorage.setItem('ux2_modo_ezc', '1'); else localStorage.removeItem('ux2_modo_ezc') } catch (e) {}
  return on
}
function pintarNav() {
  const lista = sinButaca()
    ? [SECCIONES[0], SECCIONES.find(([id]) => id === 'escalinatas'), ...SECCIONES.filter(([id]) => id !== 'inicio' && id !== 'escalinatas')]
    : SECCIONES
  $('#nav').innerHTML = lista.map(([id, label]) => `
    <li><a href="#${id}" data-sec="${id}" title="${label}" ${id === 'escalinatas' && sinButaca() ? 'class="nav-ezc"' : ''}>
      <svg viewBox="0 0 24 24">${ICONOS[id]}</svg><span>${label}</span>
      ${LISTAS.has(id) ? (id === 'escalinatas' && sinButaca() ? '<span class="nav-tag">estás acá</span>' : '') : '<span class="soon-tag">pronto</span>'}
    </a></li>`).join('')
  if (document.documentElement.classList.contains('android') && !modoEscalinatas()) {   // android-diseno
    $('#nav').insertAdjacentHTML('beforeend', `<li><a href="#inicio" data-ver-bloques title="Bloques"><svg viewBox="0 0 24 24">${ICONOS.bloque}</svg><span>Bloques</span></a></li>`)
  }
  const sec = (location.hash || '#inicio').slice(1).split('/')[0]
  $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.sec === sec))
}

function ruta() {
  let [sec, arg] = (location.hash || '#inicio').slice(1).split('/')
  if (modoEscalinatas() && sec !== 'escalinatas') { history.replaceState(null, '', '#escalinatas'); sec = 'escalinatas'; arg = undefined }
  if (sec === 'monitor') {              // monitor del Hemiciclo: también se abre encima
    if (rv.abierto) cerrarRevelacion()
    if (!vistaActual() || vistaActual() === 'pronto') { $$('.view').forEach(v => { v.hidden = v.dataset.view !== 'inicio' }); $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.sec === 'inicio')) }
    return abrirMonitor()
  }
  if (mon.abierto) cerrarMonitor(false)
  if (sec === 'revelacion') {           // se abre encima de la sección en la que estabas
    if (!vistaActual() || vistaActual() === 'pronto') { $$('.view').forEach(v => { v.hidden = v.dataset.view !== 'inicio' }); $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.sec === 'inicio')) }
    return abrirRevelacion(arg)
  }
  if (rv.abierto) cerrarRevelacion()
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
  if (valida === 'bloque') cargarMiBloque(arg); else if (bq.salaT) bqCerrarSala()
  if (valida === 'muro') { pintarMuroDia(); if (estado.user || mu.cargado) cargarMuroDia() }
  else if (mu.abierto) cerrarHiloMuro()
  if (valida === 'aprende') { pintarAprende(); if (arg) abrirLeccion(arg); else cerrarLeccion() }
  else if (ap.lec) cerrarLeccion()
  if (valida === 'funding' && FUNDING_ABIERTO) entrarFunding(arg); else if (fd.vivo) salirFunding()
  if (valida === 'escalinatas') entrarEscalinatas()
  if (valida === 'playroom') { pintarPlayroom(); if (nd.cargado || estado.user) cargarPlayroom() }
  else if (nd.abierto) cerrarJuego()
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
function verBloques() {   // android-diseno
  document.documentElement.classList.add('ver-bloques'); $('.app')?.classList.remove('panel-plegado'); cerrarMenu()
  setTimeout(() => $('#panel-bloques')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
}
document.addEventListener('click', e => { if (e.target.closest('[data-ver-bloques]')) { setTimeout(verBloques, 0) } })
addEventListener('hashchange', () => { if (!document.documentElement.classList.contains('ver-bloques-fijo')) document.documentElement.classList.remove('ver-bloques') })
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
  document.documentElement.classList.toggle('con-sesion', !!estado.user)  // android-diseno
  $('#user-avatar').textContent = estado.user ? (estado.alias || 'B').charAt(0).toUpperCase() : '?'
  $('#quick-butaca-num').textContent = estado.butaca ? `#${estado.butaca}` : (estado.user ? 'Sin butaca' : 'Iniciá sesión')
  $('#my-seat-num').textContent = estado.butaca ? `#${estado.butaca}` : ''
}

// ── Buscador del header: votaciones, propuestas, ciudadanos, bloques + secciones y lecciones ──
const bus = { t: 0, n: 0, sel: -1, items: [] }
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
function marcar(texto, q) {
  const t = String(texto || ''), nt = norm(t), nq = norm(q).trim(); const i = nq ? nt.indexOf(nq) : -1
  if (i < 0) return esc(t)
  return esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + nq.length)) + '</mark>' + esc(t.slice(i + nq.length))
}
function recortar(texto, q, max = 110) {
  const t = String(texto || ''); if (t.length <= max) return t
  const i = norm(t).indexOf(norm(q).trim()); const desde = Math.max(0, Math.min(i - 30, t.length - max))
  return (desde > 0 ? '…' : '') + t.slice(desde, desde + max) + '…'
}
async function buscar(q) {
  const caja = $('#bus-res'), n = ++bus.n
  q = q.trim()
  if (q.length < 2) { $('#bus-res').hidden = true; $('#bus-q').setAttribute('aria-expanded', 'false'); return }
  // locales (instantáneo): secciones y lecciones de Aprendé
  const nq = norm(q)
  const secciones = SECCIONES.filter(([id, l]) => LISTAS.has(id) && norm(l).includes(nq)).slice(0, 3).map(([id, l]) => ({ g: 'Ir a', ico: `<svg viewBox="0 0 24 24">${ICONOS[id]}</svg>`, t: marcar(l, q), href: '#' + id }))
  const lecciones = (typeof LECCIONES !== 'undefined' ? apLecs() : []).filter(l => norm(l.titulo + ' ' + l.sub + ' ' + l.pasos.map(p => p.t).join(' ')).includes(nq)).slice(0, 2)
    .map(l => ({ g: 'Aprendé', ico: l.ico, t: marcar(l.titulo, q), s: 'Lección · ' + esc(l.sub), href: '#aprende/' + l.id }))
  pintarBusqueda(q, [...secciones, ...lecciones], true)
  try {
    const { data, error } = await sb.rpc('v2_buscar', { p_q: q })
    if (error) throw error
    if (n !== bus.n) return
    const r = data || {}, items = []
    ;(r.votaciones || []).forEach(v => items.push({ g: 'Votaciones', ico: v.abierta ? '🗳️' : '✦', t: marcar(recortar(v.text, q), q),
      s: v.abierta ? `<b class="bus-vivo">Abierta</b> · ${esc(v.category || 'General')}` : `Cerró ${new Date(v.ends_at).toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric' })} · Ver revelación`,
      href: v.abierta ? '#votaciones' : '#revelacion/' + v.id }))
    ;(r.propuestas || []).forEach(p => { const viva_ = p.status === 'pending' && new Date(p.expires_at) > new Date()
      items.push({ g: 'Propuestas', ico: viva_ ? '🔥' : p.status === 'approved' ? '🏛️' : '💡', t: marcar(recortar(p.text, q), q),
        s: viva_ ? `<b class="bus-vivo">En carrera</b> · ${p.likes} apoyos` : { accepted: 'Logró la meta', approved: 'En el Hemiciclo', expired: 'No llegó a la meta' }[p.status] || '', href: '#propuestas/' + p.id }) })
    ;(r.ciudadanos || []).forEach(c => items.push({ g: 'Ciudadanos', ico: `<span class="bus-av" style="background:${colorDe(c.card_color, c.seat)}">${c.alias ? esc(c.alias.charAt(0).toUpperCase()) : '#'}</span>`,
      t: c.alias ? marcar(c.alias, q) : `Butaca #${c.seat}`, s: c.alias ? `Butaca #${c.seat}` : 'Perfil anónimo', href: '#ciudadanos/' + c.seat }))
    ;(r.bloques || []).forEach(b => items.push({ g: 'Bloques', ico: '🚩', t: marcar(b.nombre, q), s: b.lema ? esc(recortar(b.lema, q, 70)) : 'Bloque', bloque: b.nombre }))
    pintarBusqueda(q, [...secciones, ...lecciones, ...items], false)
  } catch (e) { console.warn('buscar:', e); if (n === bus.n) pintarBusqueda(q, [...secciones, ...lecciones], false, true) }
}
function pintarBusqueda(q, items, cargando, error = false) {
  const caja = $('#bus-res'); bus.items = items; bus.sel = -1
  let g = '', html = ''
  items.forEach((it, i) => {
    if (it.g !== g) { g = it.g; html += `<div class="bus-grupo">${g}</div>` }
    html += `<a class="bus-item" role="option" id="bus-i${i}" data-i="${i}" href="${it.href || '#inicio'}"><span class="bus-ico">${it.ico}</span><span class="bus-tx"><span>${it.t}</span>${it.s ? `<small>${it.s}</small>` : ''}</span></a>`
  })
  if (cargando) html += '<div class="bus-estado">Buscando…</div>'
  else if (error) html += '<div class="bus-estado">No se pudo buscar. Probá de nuevo.</div>'
  else if (!items.length) html = `<div class="bus-vacio"><b>Sin resultados para “${esc(q)}”</b><small>Probá con otra palabra, un alias o un número de butaca (#250).</small></div>`
  caja.innerHTML = html; caja.hidden = false; $('#bus-q').setAttribute('aria-expanded', 'true')
}
function cerrarBuscador() { $('#bus-res').hidden = true; $('#bus-q').setAttribute('aria-expanded', 'false'); $('#buscador').classList.remove('abierto-movil') }
function elegirResultado(i) {
  const it = bus.items[i]; if (!it) return
  cerrarBuscador(); $('#bus-q').blur()
  if (it.bloque) { location.hash = '#inicio'; setTimeout(() => document.documentElement.classList.add('ver-bloques'), 0); const b = $('#bloque-buscar'); if (b) { b.value = it.bloque; b.dispatchEvent(new Event('input', { bubbles: true })); $('.app')?.classList.remove('panel-plegado'); b.scrollIntoView({ behavior: 'smooth', block: 'center' }) } return }
  location.hash = it.href
}
function enlazarBuscador() {
  const inp = $('#bus-q'); if (!inp) return
  inp.addEventListener('input', () => { clearTimeout(bus.t); const q = inp.value; bus.t = setTimeout(() => buscar(q), 220) })
  inp.addEventListener('focus', () => { if (inp.value.trim().length >= 2) buscar(inp.value) })
  inp.addEventListener('keydown', e => {
    const n = bus.items.length
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); if (!n) return
      bus.sel = (bus.sel + (e.key === 'ArrowDown' ? 1 : -1) + n) % n
      $$('.bus-item').forEach(x => x.classList.toggle('sel', Number(x.dataset.i) === bus.sel))
      $(`#bus-i${bus.sel}`)?.scrollIntoView({ block: 'nearest' }); inp.setAttribute('aria-activedescendant', `bus-i${bus.sel}`)
    }
    if (e.key === 'Enter') { e.preventDefault(); elegirResultado(bus.sel >= 0 ? bus.sel : 0) }
    if (e.key === 'Escape') { inp.value = ''; cerrarBuscador(); inp.blur() }
  })
  $('#bus-res').addEventListener('mousedown', e => e.preventDefault())
  $('#bus-res').addEventListener('click', e => { const a = e.target.closest('.bus-item'); if (a) { e.preventDefault(); elegirResultado(Number(a.dataset.i)) } })
  document.addEventListener('click', e => { if (!e.target.closest('#buscador') && !e.target.closest('#bus-movil')) cerrarBuscador() })
  document.addEventListener('keydown', e => {
    if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) && !e.target.matches('input, textarea, [contenteditable]')) { e.preventDefault(); inp.focus(); inp.select() }
  })
  $('#bus-movil').addEventListener('click', e => { e.stopPropagation(); $('#buscador').classList.add('abierto-movil'); inp.focus() })
  window.addEventListener('hashchange', () => { cerrarBuscador() })
}

// ── Notificaciones y menú de usuario (header) ──
let notifs = []
async function cargarNotificaciones() {
  if (!estado.butaca) { notifs = []; $('#notif-dot').hidden = true; return }
  try {
    const { data } = await sb.rpc('get_my_notifications', { p_seat: estado.butaca })
    notifs = data || []
    $('#notif-dot').hidden = !notifs.length
    if (!$('#notif-pop').hidden) pintarNotifs()
    revisarNotifsBloque()
  } catch (e) {}
}
const NOTIF = {
  new_proposal:      ['💡', n => `#propuestas/${n.proposal_id}`],
  proposal_approved: ['✅', n => `#propuestas/${n.proposal_id}`],
  proposal_rejected: ['⚠️', n => `#propuestas/${n.proposal_id}`],
  proposal_consent:  ['✍️', () => APP_ACTUAL + '?v1'],   // login-a-v2: se acepta en la v1
  question_active:   ['🗳️', () => '#votaciones'],
  moderation:        ['🛡️', () => null],
  bloque_comunicado: ['📣', () => '#bloque/comunicados'],
  bloque_debate:     ['💬', () => '#bloque/debates'],
  bloque_propuesta:  ['🚀', n => n.proposal_id ? `#propuestas/${n.proposal_id}` : '#bloque/propuestas'],
  bloque_solicitud:  ['🙋', () => '#bloque/admin'],
  bloque_aceptado:   ['✅', () => '#bloque'],
  bloque_rechazado:  ['🚪', () => null],
  bloque_quitado:    ['🚪', () => null],
}
// Si llega un aviso de que me aceptaron o me quitaron de un bloque, se actualiza el estado sin recargar
const notifBloqueVistas = new Set()
function revisarNotifsBloque() {
  const nuevas = notifs.filter(n => /^bloque_(aceptado|rechazado|quitado)$/.test(n.type) && !notifBloqueVistas.has(n.id))
  nuevas.forEach(n => notifBloqueVistas.add(n.id))
  if (nuevas.length) cargarBloques()
}
function pintarNotifs() {
  const pop = $('#notif-pop')
  if (!estado.user) { pop.innerHTML = `<div class="hp-vacio"><p>Iniciá sesión para ver tus notificaciones.</p><a class="btn btn-dark" href="${APP_ACTUAL}">Iniciar sesión</a></div>`; return }
  if (!estado.butaca) { pop.innerHTML = '<div class="hp-vacio"><p>Cuando tengas tu butaca vas a recibir avisos de propuestas y votaciones.</p></div>'; return }
  pop.innerHTML = `<header class="hp-cab"><b>Notificaciones</b>${notifs.length ? '<button data-notif-todas>Marcar todas como leídas</button>' : ''}</header>
    ${notifs.length ? `<ul class="hp-lista">${notifs.map(n => {
      const [ico, dest] = NOTIF[n.type] || ['🔔', () => null], href = dest(n)
      return `<li><${href ? `a href="${esc(href)}"` : 'div'} class="hp-item" data-notif="${n.id}"><span class="hp-ico">${ico}</span><span><span class="hp-txt">${esc(String(n.message || 'Tenés una novedad').replace(/^[^\p{L}\p{N}¿¡]+/u, ''))}</span><small>${haceCuanto(n.created_at)}</small></span></${href ? 'a' : 'div'}></li>`
    }).join('')}</ul>` : '<div class="hp-vacio"><span class="hp-ok">✓</span><p>Estás al día. No tenés notificaciones nuevas.</p></div>'}`
}
async function leerNotif(id) {
  notifs = notifs.filter(n => n.id !== id); $('#notif-dot').hidden = !notifs.length
  try { await sb.rpc('mark_notification_read', { p_id: id }) } catch (e) {}
}
async function leerTodas() {
  notifs = []; $('#notif-dot').hidden = true; pintarNotifs()
  try { await sb.rpc('mark_all_notifications_read', { p_seat: estado.butaca }) } catch (e) {}
}
function pintarMenuUsuario() {
  const pop = $('#user-pop'), oscuro = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches)
  if (!estado.user) { pop.innerHTML = `<div class="hp-vacio"><p>Entrá con tu cuenta del Cabildo.</p><a class="btn btn-dark" href="${APP_ACTUAL}">Iniciar sesión</a></div>`; return }
  const nombre = estado.alias || (estado.butaca ? `Butaca #${estado.butaca}` : 'Mi cuenta')
  pop.innerHTML = `<header class="hp-yo"><span class="avatar">${esc(nombre.charAt(0).toUpperCase())}</span><span><b>${esc(nombre)}</b><small>${estado.butaca ? `Butaca #${estado.butaca}` : 'Sin butaca todavía'}</small></span></header>
    <nav class="hp-nav">
      ${estado.butaca ? `<a href="#butaca">💺 Mi Butaca</a><a href="#ciudadanos/${estado.butaca}">👤 Mi perfil público</a><a href="#ciudadanos/mensajes">💬 Mensajes</a>` : `<a href="${APP_ACTUAL}">🪪 Conseguir mi butaca</a>`}
      <a href="#aprende">🎓 Cómo funciona el Cabildo</a>
      <button data-um="tema">${oscuro ? '☀️ Tema claro' : '🌙 Tema oscuro'}</button>
      <button data-um="salir" class="hp-salir">↩ Cerrar sesión</button>
    </nav>`
}
function abrirPop(id) {
  const otros = id === 'notif-pop' ? 'user-pop' : 'notif-pop'
  $('#' + otros).hidden = true
  const pop = $('#' + id), abrir = pop.hidden
  if (abrir) { id === 'notif-pop' ? (pintarNotifs(), cargarNotificaciones()) : pintarMenuUsuario() }
  pop.hidden = !abrir
  $('#btn-notif').setAttribute('aria-expanded', String(!$('#notif-pop').hidden))
  $('#user-chip').setAttribute('aria-expanded', String(!$('#user-pop').hidden))
}
function cerrarPops() { $('#notif-pop').hidden = true; $('#user-pop').hidden = true; $('#btn-notif').setAttribute('aria-expanded', 'false'); $('#user-chip').setAttribute('aria-expanded', 'false') }
function enlazarHeader() {
  $('#btn-notif').addEventListener('click', e => { e.stopPropagation(); abrirPop('notif-pop') })
  $('#user-chip').addEventListener('click', e => { e.stopPropagation(); abrirPop('user-pop') })
  $('#notif-pop').addEventListener('click', e => {
    e.stopPropagation()
    if (e.target.closest('[data-notif-todas]')) return leerTodas()
    const it = e.target.closest('[data-notif]'); if (it) { leerNotif(it.dataset.notif); cerrarPops() }
  })
  $('#user-pop').addEventListener('click', async e => {
    e.stopPropagation()
    const a = e.target.closest('[data-um]')?.dataset.um
    if (a === 'tema') { alternarTema(); return pintarMenuUsuario() }
    if (a === 'salir') {
      if (!await confirmar('¿Cerrar sesión?', 'Vas a salir del Cabildo en este navegador.', 'Cerrar sesión')) return
      await sb.auth.signOut(); location.reload(); return
    }
    if (e.target.closest('a')) cerrarPops()
  })
  document.addEventListener('click', cerrarPops)
  document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarPops() })
  window.addEventListener('hashchange', cerrarPops)
  setInterval(() => { if (estado.butaca) cargarNotificaciones() }, 120_000)
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
  const chico = W < 520, padTop = chico ? 52 : 70, padBottom = chico ? 26 : 96, padX = chico ? 4 : 12
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
  if (mia && columnasDesplegadas() && window.innerWidth > 860) return { x: mia.x, y: mia.y + 60 / (encuadre.s * 1.7), s: encuadre.s * 1.7 }
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
  if (esAndroid()) { const ta = objetivo.s > encuadre.s * 1.05 ? 'none' : 'pan-y'; if (cv.style.touchAction !== ta) cv.style.touchAction = ta }  // qa35-android
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

  // Butacas presentes (opcional, decidido por cada ciudadano): luz blanca con resplandor
  if (pres.set.size) {
    const oscuro = document.documentElement.dataset.theme === 'dark'
    for (const n of pres.set) {
      if (n === estado.butaca) continue
      const a = asientos[n - 1]; if (!a) continue
      const p = aPantalla(a.x, a.y, W, Hh)
      if (p.x < -m || p.x > W + m || p.y < -m || p.y > Hh + m) continue
      dibujarEncendida(ctx, p.x, p.y, r, oscuro)
    }
  }

  if (hover && hover !== estado.butaca && asientos[hover - 1]) {
    const p = aPantalla(asientos[hover - 1].x, asientos[hover - 1].y, W, Hh)
    ctx.strokeStyle = cAcc; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.35 + 3, 0, Math.PI * 2); ctx.stroke()
  }

  const tip = $('#my-seat-tip')
  const mia = estado.butaca && asientos[estado.butaca - 1]
  if (mia) {
    const p = aPantalla(mia.x, mia.y, W, Hh)
    if (pres.mia) dibujarEncendida(ctx, p.x, p.y, r * 1.5, document.documentElement.dataset.theme === 'dark')
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
    ${pres.set.has(num) ? '<div class="sc-presente"><i></i>Presente ahora</div>' : ''}
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
    estado.perfilesListos = cargarPerfiles().then(() => { if (vistaActual() === 'playroom') pintarPlayroom() })
  } catch (e) { console.warn('cargarHemiciclo:', e) }
}

// ── Presencia (opcional) ────────────────────────────────────────
// Cada ciudadano decide en Mi Butaca si su butaca se "enciende" mientras tiene el Cabildo abierto.
// El servidor solo guarda número de butaca y último latido; la butaca se apaga sola a los 2 minutos sin latido.
// La luz es blanca para todos y no tiene relación con votar: solo dice "esta persona está acá".
const pres = { mia: false, set: new Set(), latido: 0, poll: 0 }
async function cargarPresencia() {
  try {
    const { data, error } = await sb.rpc('v2_presentes')
    if (error) throw error
    pres.set = new Set((data || []).map(Number))
  } catch (e) { pres.set = new Set() }
  if (pres.mia && estado.butaca) pres.set.add(estado.butaca)
  if (vistaActual() === 'inicio') pintar()
}
function latirPresencia() { if (pres.mia && estado.butaca) sb.rpc('v2_presencia_latido').then(() => {}, () => {}) }
async function iniciarPresencia() {
  if (estado.user && estado.butaca) {
    try { const { data } = await sb.rpc('v2_presencia_mia'); pres.mia = !!data } catch (e) {}
  }
  pintarBotonLuz(); latirPresencia(); cargarPresencia()
  clearInterval(pres.latido); pres.latido = setInterval(latirPresencia, 45_000)
  clearInterval(pres.poll); pres.poll = setInterval(() => { if (vistaActual() === 'inicio' || mon.abierto) cargarPresencia() }, 30_000)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { latirPresencia(); cargarPresencia() } })
}
async function cambiarPresencia(rapido = false) {
  if (!estado.butaca) { aviso('Necesitás una butaca para esto.', 'error'); return }
  const nuevo = !pres.mia
  const ok = rapido || await confirmar(
    nuevo ? '¿Encender tu butaca cuando estés presente?' : '¿Dejar de mostrar tu presencia?',
    nuevo ? 'Mientras tengas el Cabildo abierto, tu butaca se va a ver encendida con una luz blanca en el hemiciclo de Inicio y en el Monitor, para todos. Se apaga sola cuando te vas. No muestra nada de lo que votás.'
          : 'Tu butaca deja de encenderse para todos de forma inmediata.',
    nuevo ? 'Sí, encender' : 'Sí, apagar')
  if (!ok) return
  const { error } = await sb.rpc('v2_presencia_config', { p_activa: nuevo })
  if (error) { aviso('No se pudo guardar. Intentá de nuevo.', 'error'); return }
  pres.mia = nuevo
  if (!nuevo) pres.set.delete(estado.butaca)
  pintarMiButaca(); pintarBotonLuz(); cargarPresencia()
  aviso(nuevo ? '💡 Tu butaca se enciende cuando estás presente' : '✓ Tu presencia ya no se muestra')
}
// Botón de Inicio (al lado de "Votos en la sesión") para encender/apagar mi butaca
function pintarBotonLuz() {
  const b = $('#btn-luz'); if (!b) return
  b.hidden = !(estado.user && estado.butaca)
  b.classList.toggle('on', pres.mia)
  b.setAttribute('aria-pressed', String(pres.mia))
  $('#btn-luz-txt').textContent = pres.mia ? 'Butaca encendida' : 'Encender mi butaca'
  b.title = pres.mia ? 'Tu butaca se ve encendida mientras estás presente. Tocá para apagarla.' : 'Encender mi butaca: se ve con luz blanca mientras estás presente'
}

// Dibuja una butaca "encendida": luz blanca con resplandor
function dibujarEncendida(ctx, x, y, r, oscuro) {
  ctx.save()
  // halo (como una lámpara encendida)
  const R = Math.max(7, r * 4.2), g = ctx.createRadialGradient(x, y, r * .6, x, y, R)
  g.addColorStop(0, oscuro ? 'rgba(255,255,255,.75)' : 'rgba(255,186,60,.7)')
  g.addColorStop(.45, oscuro ? 'rgba(255,255,255,.22)' : 'rgba(255,196,80,.28)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, 6.283); ctx.fill()
  // bombilla
  ctx.shadowColor = oscuro ? '#ffffff' : 'rgba(255,170,40,1)'; ctx.shadowBlur = Math.max(6, r * 2.2)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath(); ctx.arc(x, y, r * 1.18, 0, 6.283); ctx.fill()
  if (!oscuro) { ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(240,160,30,.9)'; ctx.lineWidth = Math.max(1, r * .3); ctx.stroke() }
  ctx.restore()
}

// ── Votación activa ─────────────────────────────────────────────
let pregunta = null, iqPreguntas = [], iqMios = new Set(), iqCerradas = [], iqVotos = new Map()
const IQ_MAX = 4
async function cargarVotacion() {
  try {
    const ahora = new Date().toISOString(), hace72 = new Date(Date.now() - 72 * 3600e3).toISOString()
    const [{ data, error }, part, cer] = await Promise.all([
      sb.from('questions').select('id, text, category, description, ends_at, status, links, video_url')
        .eq('status', 'activa').gt('ends_at', ahora).order('ends_at', { ascending: true }).limit(12),
      estado.butaca ? sb.rpc('v2_mis_participaciones') : Promise.resolve({ data: [] }),
      sb.from('questions').select('id, text, category, ends_at, status').in('status', ['activa', 'cerrada'])
        .lt('ends_at', ahora).gt('ends_at', hace72).order('ends_at', { ascending: false }).limit(3),
    ])
    if (error) throw error
    iqPreguntas = data || []
    iqCerradas = cer?.data || []
    iqMios = new Set((part.data || []).map(x => typeof x === 'string' ? x : x.v2_mis_participaciones || x.question_id || x))
  } catch (e) { console.warn('cargarVotacion:', e); iqPreguntas = [] }
  pregunta = iqPreguntas[0] || null
  pintarVotacionesInicio()
  // Votos emitidos en la sesión (todas las votaciones abiertas). Solo el total: el detalle se ve al cerrar.
  if (!iqPreguntas.length) { $('#st-votos').textContent = '0'; iqVotos = new Map(); if (mon.abierto) pintarMonitor(); return }
  try {
    const tot = await Promise.all(iqPreguntas.map(q => sb.rpc('get_question_votes', { p_question_id: q.id })
      .then(({ data }) => (data || []).reduce((a, r) => a + Number(r.total || 0), 0), () => 0)))
    $('#st-votos').textContent = fmtNum(tot.reduce((a, n) => a + n, 0))
    tot.forEach((n, i) => { const el = $(`[data-iq-votos="${iqPreguntas[i].id}"]`); if (el) el.textContent = `${fmtNum(n)} ${n === 1 ? 'voto' : 'votos'}` })
    iqVotos = new Map(iqPreguntas.map((q, i) => [q.id, tot[i]]))
  } catch (e) {}
  if (mon.abierto) pintarMonitor()
}

function pintarVotacionesInicio() {
  const ul = $('#iq-list'); if (!ul) return
  const n = iqPreguntas.length
  $('#pill-live').hidden = !n
  $('#iq-vivo').hidden = !n
  $('#iq-n').textContent = n ? `· ${n}` : ''
  const cerradas = iqCerradas.length ? `<li class="iq-sep">Recién cerradas</li>` + iqCerradas.map(q => `<li class="iq-cerrada ${rvVista(q.id) ? '' : 'nueva'}">
      <a href="#revelacion/${q.id}"><span class="iq-chispa" aria-hidden="true">✦</span><span class="iq-c-txt"><b>${esc(q.text)}</b><small>Cerró ${haceCuanto(q.ends_at)}</small></span>
      <span class="iq-c-ir">${rvVista(q.id) ? 'Ver resultado' : 'Revelación'}</span></a></li>`).join('') : ''
  if (!n) { ul.innerHTML = '<li class="iq-vacio">No hay votaciones abiertas en este momento.</li>' + cerradas; return }
  const pend = iqPreguntas.filter(q => !iqMios.has(q.id)).length
  ul.innerHTML = iqPreguntas.slice(0, IQ_MAX).map(q => {
    const vote = iqMios.has(q.id)
    return `<li class="${vote ? 'hecha' : ''}">
      <div class="iq-top"><span class="tag" style="--cat:${colorCat(q.category)}">${esc(q.category || 'General')}</span><b class="iq-reloj" data-iq-fin="${esc(q.ends_at)}">${cuentaRegresiva(q.ends_at)}</b><small data-iq-votos="${q.id}"></small></div>
      <p title="${esc(q.text)}">${esc(q.text)}</p>
      <div class="iq-acc">
        <a class="iq-deb" href="#debates/${q.id}"><svg viewBox="0 0 24 24"><path d="M5 5h14v10H9l-4 4z"/></svg>Debate</a>
        ${vote ? '<span class="iq-ok">✓ Votaste</span>' : !estado.butaca ? `<a class="btn btn-dark iq-btn" href="${APP_ACTUAL}">Conseguí tu butaca</a>` : `<button class="btn btn-dark iq-btn" data-iq-votar="${q.id}">Votar</button>`}
      </div></li>`
  }).join('') + (n > IQ_MAX ? `<li class="iq-mas"><a href="#votaciones">Ver las ${n} votaciones abiertas${pend ? ` · te faltan ${pend}` : ''} →</a></li>` : '') + cerradas
}

function tickVotacion() {
  let termino = false
  $$('[data-iq-fin]').forEach(el => {
    const s = Math.floor((new Date(el.dataset.iqFin) - Date.now()) / 1000)
    if (s <= 0) { el.textContent = 'Cerró'; termino = true; return }
    el.textContent = cuentaRegresiva(el.dataset.iqFin)
    el.classList.toggle('urge', s < 3600)
  })
  if (termino && !tickVotacion.recargando) { tickVotacion.recargando = true; setTimeout(() => { tickVotacion.recargando = false; cargarVotacion() }, 1500) }
}

// ── Votaciones ──────────────────────────────────────────────────
// Voto secreto: cast_vote anota que la butaca participó (vote_seats) y suma 1 al contador de la opción (vote_tally),
// por separado. No se guarda qué votó cada butaca, ni en la base ni en el dispositivo. El sello SHA-256 es solo visual.
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
  if (vFiltro === 'cerradas') { $('#vc-abiertas').textContent = vPreguntas.filter(abierta).length ? `(${vPreguntas.filter(abierta).length})` : ''; if (!vc.items.length && !vc.fin) cargarCerradas(); return pintarCerradas() }
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
      : rvVista(q.id)
        ? resultadosDe(q) + `<a class="v-otra" href="#revelacion/${q.id}">✦ Ver la revelación otra vez</a>`
        : `<a class="v-revelar" href="#revelacion/${q.id}"><span>✦</span><b>Ver la revelación</b><small>El resultado se muestra con su revelación</small></a>`
    return `<article class="card vcard">
      <div class="vcard-top"><span class="tag" style="--cat:${colorCat(q.category)}">${esc(q.category || 'General')}</span>
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

// ── Cerradas: archivo de todas las votaciones cerradas, se va acumulando (de a 25) ──
const vc = { items: [], total: null, cargando: false, fin: false, q: '', filtro: 'todas', buscarT: 0 }
async function cargarCerradas(reiniciar = false) {
  if (vc.cargando || (vc.fin && !reiniciar)) return
  if (reiniciar) { vc.items = []; vc.fin = false }
  vc.cargando = true; pintarCerradas()
  try {
    let qy = sb.from('questions').select('id, text, category, ends_at, status', { count: 'exact' })
      .in('status', ['activa', 'cerrada']).lt('ends_at', new Date().toISOString())
    if (vc.q) qy = qy.ilike('text', `%${vc.q.replace(/[%_]/g, '')}%`)
    const { data, error, count } = await qy.order('ends_at', { ascending: false }).range(vc.items.length, vc.items.length + 24)
    if (error) throw error
    vc.items.push(...(data || []).filter(q => !vc.items.some(x => x.id === q.id)))
    if (!vc.q) vc.total = count ?? vc.total
    vc.fin = !data || data.length < 25
    if (!vResultados.size) { const { data: res } = await sb.rpc('get_all_question_results'); vResultados = new Map((res || []).map(r => [r.id, r])) }
  } catch (e) { console.warn('cerradas:', e) }
  vc.cargando = false
  pintarCerradas()
}

function chipResultado(q) {
  const r = vResultados.get(q.id), t = Number(r?.total || 0)
  if (!t || t < 3) return '<span class="vc-res nula">Sin resultado</span>'
  const si = Number(r.cnt_si || 0), no = Number(r.cnt_no || 0)
  if (si === no) return '<span class="vc-res empate">Empate</span>'
  const k = si > no ? 'si' : 'no'
  return `<span class="vc-res ${k}">${k === 'si' ? 'SÍ' : 'NO'} ${Math.round(Math.max(si, no) / t * 100)}%</span>`
}

function pintarCerradas() {
  if (vFiltro !== 'cerradas') return
  const lista = $('#vlist'); if (!lista) return
  if (vc.total != null) $('#vc-cerradas').textContent = `(${fmtNum(vc.total)})`
  const sinVer = vc.items.filter(q => !rvVista(q.id)).length
  let items = vc.items
  if (vc.filtro === 'sinver') items = items.filter(q => !rvVista(q.id))
  if (vc.filtro === 'mias') items = items.filter(q => vMisVotos.has(q.id))
  const barra = lista.querySelector('.vc-barra')
  if (!barra) lista.innerHTML = `<div class="vc-barra card">
      <label class="vc-buscar"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="vc-q" type="search" placeholder="Buscar en las votaciones cerradas…" value="${esc(vc.q)}"></label>
      <div class="seg" role="tablist"><button class="seg-btn" data-vc="todas">Todas</button><button class="seg-btn" data-vc="sinver">Sin ver <span id="vc-sinver"></span></button><button class="seg-btn" data-vc="mias">En las que voté</button></div>
    </div><div id="vc-lista"></div>`
  $$('[data-vc]').forEach(b => b.classList.toggle('active', b.dataset.vc === vc.filtro))
  $('#vc-sinver').textContent = sinVer ? `(${sinVer})` : ''
  // agrupadas por mes
  let mes = '', html = ''
  items.forEach(q => {
    const d = new Date(q.ends_at), m = d.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' })
    if (m !== mes) { mes = m; html += `<h3 class="vc-mes">${m.replace(/^./, c => c.toUpperCase())}</h3>` }
    const visto = rvVista(q.id), voto = vMisVotos.has(q.id)
    html += `<a class="vc-fila card ${visto ? '' : 'nueva'}" href="#revelacion/${q.id}">
      <span class="vc-fecha"><b>${d.getDate()}</b><small>${d.toLocaleDateString('es-VE', { month: 'short' }).replace('.', '')}</small></span>
      <span class="vc-txt"><span class="vc-meta"><span class="tag" style="--cat:${colorCat(q.category)}">${esc(q.category || 'General')}</span>${voto ? '<span class="vc-voto">✓ Votaste</span>' : ''}</span><b>${esc(q.text)}</b></span>
      <span class="vc-der">${visto ? chipResultado(q) : '<span class="vc-revelar">✦ Revelación</span>'}</span>
    </a>`
  })
  const pie = vc.cargando ? '<p class="muted vc-pie">Cargando…</p>'
    : !vc.fin ? '<button class="btn btn-ghost vc-mas" data-vc-mas>Cargar más votaciones</button>'
    : items.length ? `<p class="muted vc-pie">${vc.q ? 'No hay más resultados para tu búsqueda.' : 'Llegaste a la primera votación del Cabildo.'}</p>` : ''
  $('#vc-lista').innerHTML = (items.length ? html : !vc.cargando ? `<div class="card soon"><h3 style="margin:0">${vc.q ? 'No encontramos votaciones con ese texto' : vc.filtro === 'sinver' ? '¡Viste todas las revelaciones!' : vc.filtro === 'mias' ? 'Todavía no votaste en ninguna de estas' : 'Todavía no hay votaciones cerradas'}</h3></div>` : '') + pie
}

function tickCuentas() {
  $$('[data-cuenta]').forEach(el => { el.textContent = cuentaRegresiva(el.dataset.cuenta) })
  if (!$('#modal-voto').hidden && mvPregunta) $('#mv-timer').textContent = cuentaRegresiva(mvPregunta.ends_at)
}

// ── Modal de voto ──
let mvPregunta = null, mvEleccion = null, mvConsultado = false
function abrirVoto(q) {
  mvPregunta = q; mvEleccion = null; mvConsultado = false
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
  if (!vMisVotos.has(q.id) && !mvConsultado) {   // una sola consulta por apertura: tocar una opción no espera al servidor
    mvConsultado = true
    c.innerHTML = '<div class="mv-nota">Cargando…</div>'
    const { data } = await sb.rpc('v2_mis_participaciones')
    ;(data || []).forEach(id => vMisVotos.add(id))
    if (mvPregunta !== q) return
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
      <span>Tu voto es secreto y definitivo: no se guarda qué elegiste y no se puede cambiar.</span></div>
    <div class="mv-acciones">
      <button class="btn btn-ghost" id="mv-cancelar">Cancelar</button>
      <button class="btn btn-dark" id="mv-confirmar" ${mvEleccion ? '' : 'aria-disabled="true"'}>${mvEleccion ? 'Confirmar: ' + OPC[mvEleccion][0] : 'Elegí una opción'}</button>
    </div>`
  $$('[data-op]', c).forEach(b => b.onclick = () => {   // la elección se marca al instante, sin volver a pintar todo
    mvEleccion = b.dataset.op
    $$('[data-op]', c).forEach(x => x.classList.toggle('elegida', x === b))
    const conf = $('#mv-confirmar'); conf.removeAttribute('aria-disabled'); conf.textContent = 'Confirmar: ' + OPC[mvEleccion][0]
  })
  $('#mv-cancelar').onclick = cerrarVoto
  $('#mv-confirmar').onclick = confirmarVoto
}

// mob14-27-31: convierte una excepción del servicio en { error } para que siempre se pueda recuperar la pantalla
const seguro = p => Promise.resolve(p).then(r => r, e => ({ data: null, error: { message: e?.message || 'Sin conexión' } }))
let mvEnviando = false

async function confirmarVoto() {
  if (mvEnviando) return                 // MOB-14: una sola confirmación en curso
  mvEnviando = true
  try { await confirmarVotoUnaVez() }
  catch (e) { aviso('No se pudo enviar el voto. Revisá tu conexión y probá de nuevo.', 'error'); try { pasoVoto() } catch (_) {} }
  finally { mvEnviando = false }
}
async function confirmarVotoUnaVez() {
  const q = mvPregunta, voto = mvEleccion
  if (!q || !voto) return
  if (!abierta(q)) { aviso('La votación ya cerró.', 'error'); pasoVoto(); return }
  const btn = $('#mv-confirmar'); btn.setAttribute('aria-disabled', 'true'); btn.textContent = 'Sellando…'
  // Sello: sal aleatoria + SHA-256(voto:sal), calculado en este navegador (igual que la versión actual)
  const arr = new Uint8Array(32); crypto.getRandomValues(arr)
  const nonce = [...arr].map(b => b.toString(16).padStart(2, '0')).join('')
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${voto}:${nonce}`))
  const hash = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
  // El voto se envía YA; la ceremonia corre mientras tanto y solo termina bien si el servidor lo confirmó.
  // La sal y el hash son solo del sello visual: no se envían ni se guardan en ningún lado.
  const envio = sb.rpc('cast_vote', { p_question_id: q.id, p_vote_hash: null, p_vote_plain: voto, p_nonce: null })
    .then(({ data, error }) => error?.message || (data && data.ok === false ? data.error : null), e => e?.message || 'Sin conexión')
  const err = await ceremoniaVoto({ q, voto, hash, nonce, envio })
  if (err) { aviso(err, 'error'); pasoVoto(); return }
  // Qué votaste no se guarda en este dispositivo: si alguien toma el teléfono, no puede verlo.
  vMisVotos.add(q.id)
  $('#mv-cuerpo').innerHTML = `<div class="mv-ok"><div class="sello"><svg viewBox="0 0 24 24"><path d="m5 12 4 4 10-10"/></svg></div>
    <h3>¡Voto enviado!</h3><p>Tu participación quedó registrada. Los resultados se publican al cerrar la votación.</p>
    <button class="btn btn-dark" id="mv-listo">Listo</button></div>`
  $('#mv-listo').onclick = cerrarVoto
  cargarVotacion()
  if (location.hash === '#votaciones') pintarVotaciones()
}

// ══════════════════════════════════════════════════════════════
//  VOTO SELLADO (la imagen de la versión actual + el sobre)
//  1. Terminal "Generando voto privado": tu voto, sal y SHA-256 reales, que se forman en pantalla.
//  2. El sello entra a un sobre que se cierra y se lacra.
//  3. Urna: el sobre cae, ✓ y "Voto emitido" — solo si el servidor confirmó.
//  Unos 5 segundos. Devuelve null si el voto llegó, o el mensaje de error.
// ══════════════════════════════════════════════════════════════
const VS_HEX = '0123456789abcdef'
const vsEspera = ms => new Promise(r => setTimeout(r, ms))
const vsHexAzar = n => Array.from({ length: n }, () => VS_HEX[Math.random() * 16 | 0]).join('')
function vsCascada(el, final, ms) {   // los caracteres "caen" hasta fijar el valor real, de izquierda a derecha
  return new Promise(res => {
    const t0 = performance.now()
    const paso = t => {
      if (!document.contains(el)) return res()
      const k = Math.min(1, (t - t0) / ms), fijos = Math.floor(final.length * k)
      el.textContent = final.slice(0, fijos) + vsHexAzar(final.length - fijos)
      if (k < 1) requestAnimationFrame(paso); else res()
    }
    requestAnimationFrame(paso)
  })
}
const vvSobre = cod => `<svg class="vv-sobre-svg" viewBox="0 0 120 86" aria-hidden="true">
  <rect x="2" y="12" width="116" height="72" rx="8" class="vv-s-cuerpo"/>
  <path d="M2 82 L48 46 M118 82 L72 46" class="vv-s-pliegue"/>
  <path d="M4 14 L60 52 L116 14" class="vv-s-boca"/>
  <path d="M4 14 L60 52 L116 14 Z" class="vv-s-solapa"/>
  <circle cx="60" cy="52" r="11" class="vv-s-lacre"/>
  <text x="60" y="55.5" text-anchor="middle" class="vv-s-cod">${cod}</text></svg>`

function ceremoniaVoto({ q, voto, hash, nonce, envio }) {
  return new Promise(async resolver => {
    const rapido = matchMedia('(prefers-reduced-motion: reduce)').matches
    const T = ms => vsEspera(rapido ? Math.min(ms, 120) : ms)
    const nombre = { si: 'SÍ', no: 'NO', abs: 'ABSTENCIÓN' }, badge = { si: '✓ Votaste SÍ', no: '✓ Votaste NO', abs: '✓ Te abstuviste' }
    const el = document.createElement('div')
    el.className = 'vv'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Sellando tu voto')
    el.innerHTML = `
      <div class="vv-sha">
        <div class="vv-lock"><svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
        <h2>Generando voto privado</h2>
        <p class="vv-sub">Sello criptográfico SHA-256</p>
        <div class="vv-term">
          <div><span>Tu voto</span><b class="vv-voto ${voto}">${nombre[voto]}</b></div>
          <div><span>Sal</span><code class="vv-nonce">—</code></div>
          <div><span>SHA-256</span><code class="vv-hash">—</code></div>
        </div>
        <div class="vv-barra"><i></i></div>
        <div class="vv-sobre-zona"><div class="vv-sobre">${vvSobre(hash.slice(0, 4))}</div></div>
        <div class="vv-hecho"><span><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>Tu voto va al total sin tu nombre ni tu butaca</span></div>
      </div>
      <div class="vv-urna">
        <div class="vv-escena">
          <div class="vv-caida">${vvSobre(hash.slice(0, 4))}</div>
          <svg class="vv-caja" viewBox="0 0 110 88" aria-hidden="true"><rect x="5" y="28" width="100" height="56" rx="8" fill="#1a1f3c"/><rect x="36" y="24" width="38" height="8" rx="4" fill="#0d1220"/><rect x="38" y="26" width="34" height="4" rx="2" fill="#060c1a"/><rect x="12" y="36" width="86" height="2" rx="1" fill="rgba(255,255,255,.08)"/>
            <g fill="rgba(255,255,255,.45)">${[0, 1, 2, 3, 4, 5, 6].map(k => { const a = Math.PI - k * Math.PI / 6; return `<circle cx="${(55 + 17 * Math.cos(a)).toFixed(1)}" cy="${(74 - 17 * Math.sin(a)).toFixed(1)}" r="2.4"/>` }).join('')}${[0, 1, 2, 3, 4].map(k => { const a = Math.PI - k * Math.PI / 4; return `<circle cx="${(55 + 9.5 * Math.cos(a)).toFixed(1)}" cy="${(74 - 9.5 * Math.sin(a)).toFixed(1)}" r="2.4" ${k === 2 ? 'fill="#f76a1e"' : ''}/>` }).join('')}</g></svg>
          <div class="vv-onda"></div>
        </div>
        <div class="vv-ok-zona">
          <div class="vv-check"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></div>
          <div class="vv-badge ${voto}">${badge[voto]}</div>
          <h2>Voto emitido</h2>
          <p class="vv-u-sub">Tu participación quedó registrada en el Cabildo</p>
          <div class="vv-cita">Tu butaca queda anotada como que participó y tu voto se suma al total, por separado. Cabildo no guarda qué votó cada butaca, ni en el servidor ni en este teléfono.</div>
          <p class="vv-nota">Los resultados se publican al cerrar la votación</p>
          <button class="vv-btn" type="button">Volver</button>
        </div>
        <div class="vv-err-zona"><h2>No se pudo enviar tu voto</h2><p class="vv-err-msg"></p><button class="vv-btn vv-volver" type="button">Volver</button></div>
      </div>`
    document.body.appendChild(el)
    const $v = s => el.querySelector(s)
    const cerrar = r => { el.classList.remove('ver'); setTimeout(() => el.remove(), 350); resolver(r) }
    requestAnimationFrame(() => el.classList.add('ver'))
    // 1 · Terminal: sal y SHA-256 reales (≈1,4 s)
    await T(250)
    $v('.vv-barra i').style.transitionDuration = (rapido ? 100 : 1300) + 'ms'; $v('.vv-barra i').style.width = '100%'
    await vsCascada($v('.vv-nonce'), nonce, rapido ? 60 : 550)
    await vsCascada($v('.vv-hash'), hash, rapido ? 60 : 750)
    // 2 · Sobre (≈1,2 s)
    el.classList.add('sobre'); await T(400)
    el.classList.add('cerrado'); await T(400)
    el.classList.add('lacrado'); await T(650)
    // 3 · Urna: espera la confirmación real
    el.classList.add('urna')
    const [err] = await Promise.all([envio, T(380)])   // que la urna se vea antes de que caiga el sobre
    if (err) { el.classList.add('error'); $v('.vv-err-msg').textContent = err; $v('.vv-volver').onclick = () => cerrar(err); $v('.vv-volver').focus(); return }
    el.classList.add('cae')
    $v('.vv-ok-zona .vv-btn').onclick = () => cerrar(null)
    setTimeout(() => $v('.vv-ok-zona .vv-btn')?.focus({ preventScroll: true }), rapido ? 50 : 1500)
  })
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
        <span class="m-av" style="background:${colorDe(p.card_color, p.id)}">${/^Butaca #/.test(alias) ? '#' : esc(alias.charAt(0).toUpperCase())}</span>
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

// ── Portada (textos editables desde el admin) + anuncio global con giro ──
const portada = { anuncio: null, mostrandoAnuncio: false, visto: '' }
async function cargarPortada() {
  try {
    const { data, error } = await sb.rpc('v2_portada')
    if (error) throw error
    pintarPortada(data?.portada)
    ponerAnuncio(data?.anuncio)
    fdConfig(data?.funding)
  } catch (e) { console.warn('portada:', e) }
}
function pintarPortada(p) {
  if (!p) return
  const titulo = String(p.titulo || '').trim(), dest = String(p.destacado || '').trim()
  if (titulo || dest) {
    // corta el título en dos líneas por la última palabra (como el diseño original)
    const pal = titulo.split(/\s+/)
    const l1 = pal.length > 2 ? pal.slice(0, -1).join(' ') : titulo, l2 = pal.length > 2 ? pal.at(-1) : ''
    $('#hero-titulo').innerHTML = `${esc(l1)}${l2 ? ` <br>${esc(l2)}` : ''}${dest ? ` <span>${esc(dest)}</span>` : ''}`
  }
  if (p.subtitulo != null) $('#hero-sub').textContent = p.subtitulo
  if (p.tarjeta) $('#hero-tarjeta').innerHTML = esc(p.tarjeta).replace(/\n/g, '<br>')
}
function ponerAnuncio(a) {
  const texto = a?.text ? String(a.text).trim() : ''
  portada.anuncio = texto ? { text: texto, type: ['info', 'warning', 'error'].includes(a.type) ? a.type : 'info' } : null
  const flip = $('#hero-flip'); if (!flip) return
  if (!portada.anuncio) { flip.classList.remove('girada', 'tiene-anuncio'); portada.mostrandoAnuncio = false; return }
  $('#hero-anuncio').textContent = portada.anuncio.text
  $('#hero-anuncio-tag').innerHTML = `<i></i>${{ info: 'Anuncio', warning: 'Atención', error: 'Urgente' }[portada.anuncio.type]}`
  flip.dataset.tipo = portada.anuncio.type
  flip.classList.add('tiene-anuncio')
  // gira al anuncio (con un pequeño respiro para que se vea el efecto)
  if (!portada.mostrandoAnuncio || portada.visto !== portada.anuncio.text) {
    portada.visto = portada.anuncio.text; portada.mostrandoAnuncio = true
    flip.classList.remove('girada'); requestAnimationFrame(() => setTimeout(() => flip.classList.add('girada'), 600))
  }
}
function vigilarPortada() {
  if (estado.user) sb.channel('portada-v2')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'system_config' }, ({ new: n }) => {
      if (n?.key === 'portada') pintarPortada(n.value)
      if (n?.key === 'funding') fdConfig({ activo: !!n.value?.activo, simulado: n.value?.simulado !== false, meta: Number(n.value?.meta) || 30000 })
      if (n?.key === 'announcement') ponerAnuncio(n.value?.active ? n.value : null)
    }).subscribe()
  setInterval(cargarPortada, 120_000)   // respaldo (y para quien no inició sesión)
  $('#hero-girar')?.addEventListener('click', () => {
    const f = $('#hero-flip'); f.classList.remove('girada'); portada.mostrandoAnuncio = false
    setTimeout(() => { if (portada.anuncio) { portada.mostrandoAnuncio = true; f.classList.add('girada') } }, 8000)
  })
}

// ── Propuestas en carrera (Inicio) ──
async function cargarPropInicio() {
  const ul = $('#ip-list'); if (!ul) return
  try {
    const { data, error } = await sb.rpc('v2_propuestas')
    if (error) throw error
    const ahora = new Date(data.ahora).getTime(), desf = ahora - Date.now(), meta = data.meta || 20
    const vivas = (data.propuestas || []).filter(p => p.status === 'pending' && new Date(p.expires_at).getTime() > ahora)
      .sort((a, b) => (meta - a.likes) - (meta - b.likes) || new Date(a.expires_at) - new Date(b.expires_at))
    $('#ip-n').textContent = vivas.length ? `· ${vivas.length}` : ''
    if (!vivas.length) { ul.innerHTML = '<li class="ip-vacio">No hay propuestas en carrera. <a href="#propuestas">Lanzá la tuya →</a></li>'; return }
    ul.innerHTML = vivas.slice(0, 3).map(p => {
      const falta = Math.max(0, meta - p.likes), resta = new Date(p.expires_at).getTime() - (Date.now() + desf)
      const h = Math.floor(resta / 3600e3), m = Math.floor(resta % 3600e3 / 60e3)
      return `<li><a href="#propuestas/${p.id}">
        <p>${esc(p.text)}</p>
        <div class="ip-barra"><i style="width:${Math.min(100, p.likes / meta * 100)}%"></i></div>
        <div class="ip-datos"><b>${p.likes}/${meta}</b><span>${falta ? `faltan ${falta}` : '¡meta!'}</span><span class="${resta < 6 * 3600e3 ? 'urge' : ''}">⏳ ${h > 0 ? `${h} h ` : ''}${m} min</span></div>
      </a></li>`
    }).join('')
  } catch (e) { console.warn('cargarPropInicio:', e); ul.innerHTML = '<li class="muted">No se pudieron cargar las propuestas.</li>' }
}

// ── Bloques ─────────────────────────────────────────────────────
async function cargarBloques() {
  try {
    const [{ data, error }, reglas] = await Promise.all([sb.rpc('bloques_listar'), sb.rpc('bloques_reglas')])
    if (error) throw error
    estado.bloques = data || []
    estado.reglas = reglas?.data || {}
  } catch (e) { console.warn('cargarBloques:', e); estado.bloques = [] }
  if (estado.butaca) {
    try { const { data } = await sb.rpc('bloque_mi_estado'); estado.miBloque = data } catch (e) {}
    await cargarSolicitudBloque()
  }
  pintarBloques(); actualizarNavBloque()
  if (vistaActual() === 'bloque' && !bq.d) cargarMiBloque()
}

const ICON_GRUPO = '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3 19a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M21 19a6 6 0 0 0-4-5.7"/></svg>'

const pideAprobacion = id => estado.reglas?.[id] !== false
const pedidoPendiente = id => estado.miBloque?.pedido?.estado === 'pendiente' && estado.miBloque.pedido.bloque_id === id
function botonSumarse(b, grande) {
  const cl = grande ? 'btn' : 'btn btn-ghost'
  if (estado.miBloque?.bloque_id === b.id) return `<span class="${cl}" aria-disabled="true">${grande ? 'Ya sos parte de este bloque' : 'Tu bloque'}</span>`
  if (pedidoPendiente(b.id)) return `<button class="${cl} b-pedido" data-cancelar-pedido="${b.id}" title="Solicitud enviada. Tocá para cancelarla">⏳ ${grande ? 'Solicitud enviada' : 'Pendiente'}</button>`
  return `<button class="${cl}" data-unirme="${b.id}">${pideAprobacion(b.id) ? 'Pedir sumarme' : grande ? 'Sumarse al bloque' : 'Sumarse'}</button>`
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
  const fondo = b.imagen_url || b.anfitrion_foto   // la portada del bloque manda; si no hay, la foto del anfitrión
  return `<div class="b-hero${fondo ? '' : ' sin-foto'}">
    ${fondo ? `<img src="${esc(fondo)}" alt="">` : ''}
    <div class="b-info">
      <h3>${esc(b.nombre)}</h3><span class="ve-line"></span>
      <p>${esc(b.lema || '')}</p>
      <small>Anfitrión del bloque</small><span class="b-host">${esc(b.anfitrion_nombre)}</span>
    </div>
    <div class="b-stats"><span><b>${fmtNum(b.miembros)}</b>Ciudadanos</span><span><b>${fmtNum(b.ideas)}</b>Ideas</span></div>
    ${botonSumarse(b, true)}
  </div>`
}

function bannerMiBloque() {
  const p = estado.miBloque?.pedido
  if (!soyDeUnBloque() && p) {
    const pend = p.estado === 'pendiente'
    return `<div class="bq-pedido ${pend ? '' : 'no'}"><span>${pend ? '⏳' : '🚪'}</span>
      <div><b>${pend ? `Pediste sumarte a ${esc(p.bloque_nombre)}` : `${esc(p.bloque_nombre)} no aceptó tu solicitud`}</b>
        <small>${pend ? 'El anfitrión todavía no respondió. Te avisamos cuando lo haga.' : `Podés pedir sumarte a otro bloque${p.reintentar_desde && new Date(p.reintentar_desde) > new Date() ? `, o volver a pedirlo a este desde el ${new Date(p.reintentar_desde).toLocaleDateString('es')}` : ''}.`}</small></div>
      ${pend ? `<button class="bq-link" data-cancelar-pedido="${p.bloque_id}">Cancelar</button>` : ''}</div>`
  }
  if (!soyDeUnBloque()) return ''
  const b = estado.bloques.find(x => x.id === estado.miBloque.bloque_id)
  return `<a class="bq-banner" href="#bloque">${b?.imagen_url ? `<img src="${esc(b.imagen_url)}" alt="">` : `<span>${esc((b?.nombre || 'B').charAt(0))}</span>`}
    <div><small>${estado.miBloque.soy_anfitrion ? 'Tu bloque · sos el anfitrión' : 'Tu bloque'}</small><b>${esc(b?.nombre || 'Mi bloque')}</b></div>
    <em>${estado.miBloque.soy_anfitrion ? 'Administrar' : 'Entrar'} →</em></a>`
}

function pintarBloques() {
  const body = $('#bloques-body')
  if (estado.tab === 'crear') { body.innerHTML = vistaCrear(); return }
  const q = ($('#bloque-buscar').value || '').trim().toLowerCase()
  const lista = estado.bloques.filter(b => !q || [b.nombre, b.lema, b.anfitrion_nombre].some(v => (v || '').toLowerCase().includes(q)))
  if (!estado.bloques.length) {
    body.innerHTML = simTarjeta('') + `<div class="empty"><div class="e-icon">${ICON_GRUPO}</div>
      <h3>Todavía no hay bloques</h3><p>Sé el primero en reunir ciudadanos alrededor de tus ideas.</p>
      <button class="btn btn-accent" data-tab-go="crear">Crear bloque</button></div>`
    return
  }
  if (!lista.length) { body.innerHTML = bannerMiBloque() + simTarjeta(q) + '<p class="muted">No hay bloques que coincidan con tu búsqueda.</p>'; return }
  body.innerHTML = bannerMiBloque() + simTarjeta(q) + (estado.tab === 'destacados'
    ? heroBloque(lista[0]) + lista.slice(1, 4).map(filaBloque).join('') +
      (lista.length > 4 ? '<button class="btn btn-ghost" data-tab-go="todos">Ver todos los bloques →</button>' : '')
    : lista.map(filaBloque).join(''))
}

// ══ bloque-simulador: Bloque Simulador — un bloque de práctica con Claria como anfitriona. Es un tutorial guiado:
// todo pasa en este navegador, no se guarda nada y no cuenta como bloque real.
const SIM_IMG = '/ux2/marcas/claria.svg'
function simTarjeta(q) {
  if (q && !['simulador', 'práctica', 'practica', 'claria', 'tutorial'].some(w => w.includes(q) || q.includes(w))) return ''
  return `<article class="sim-card">
    <div class="sim-cab"><svg class="sim-dots" viewBox="0 0 160 80" aria-hidden="true"><g fill="#ffffff"><circle cx="20" cy="70" r="4"/><circle cx="34" cy="48" r="4"/><circle cx="54" cy="32" r="4"/><circle cx="80" cy="26" r="4"/><circle cx="106" cy="32" r="4"/><circle cx="126" cy="48" r="4"/><circle cx="140" cy="70" r="4"/><circle cx="44" cy="70" r="4"/><circle cx="56" cy="54" r="4"/><circle cx="80" cy="48" r="4"/><circle cx="104" cy="54" r="4"/><circle cx="116" cy="70" r="4"/></g><g fill="#f5c518"><circle cx="80" cy="26" r="4"/><circle cx="56" cy="54" r="4"/><circle cx="116" cy="70" r="4"/></g></svg><img src="${SIM_IMG}" alt="Claria, la anfitriona del simulador"><span class="sim-tag">Simulador · Práctica</span></div>
    <div class="sim-cuerpo">
      <h3>Bloque Simulador</h3>
      <p>Probá cómo funciona un bloque, paso a paso y sin consecuencias reales.</p>
      <div class="sim-host"><img src="${SIM_IMG}" alt=""><span><b>Claria</b><small>Anfitriona</small></span></div>
      <div class="sim-datos"><span><b>5 pasos</b>unos 3 minutos</span><span><b>Sin espera</b>no cuenta como bloque</span></div>
      <button class="btn btn-dark sim-entrar" type="button" data-sim-abrir>Entrar y practicar</button>
      <small class="sim-nota">No te suma a ningún bloque real, no activa los 30 días de espera y no publica nada.</small>
    </div>
  </article>`
}
const SIM_PASOS = [
  { tab: 'Inicio', bot: ['¡Guau, hola! Soy Claria, la anfitriona de este bloque de práctica. No soy una persona real: soy un tutorial.', 'Un bloque es un grupo de ciudadanos que se organiza alrededor de unas ideas. Lo crea un anfitrión que acepta mostrar su nombre real. Los miembros siguen siendo anónimos.'],
    ops: [{ label: 'Empezar el recorrido', yo: 'Empecemos', next: 1, primario: true }, { label: '¿Quién puede crear uno?', yo: '¿Quién puede crear un bloque?', extra: 'Cualquier butaca, con una segunda verificación en la que acepta mostrar nombre y apellido. Por eso yo, como anfitriona, soy lo único público acá.' }] },
  { tab: 'Sumarse', bot: ['Paso 1: sumarte. Tocá «Pedir sumarme». En un bloque real podés escribir un mensaje de presentación para el anfitrión.'],
    ops: [{ label: 'Pedir sumarme', yo: 'Pido sumarme al bloque', next: 2, primario: true, estado: 'Solicitud aceptada · ya sos miembro de práctica' }] },
  { tab: 'Comunicados', bot: ['¡Bienvenido! Paso 2: los comunicados. Es como el anfitrión les habla a todos los miembros a la vez. Mirá uno de ejemplo:'], tarjeta: 'comunicado',
    ops: [{ label: 'Entendido, sigamos', yo: 'Entendido', next: 3, primario: true }, { label: '¿Puedo responder?', yo: '¿Puedo responderle al anfitrión?', extra: 'Los comunicados no se responden: para charlar está la Sala del bloque, y para proponer, la pestaña Ideas.' }] },
  { tab: 'Ideas', bot: ['Paso 3: las ideas. Cualquier miembro propone una idea y los demás la apoyan. Si llega a la meta que eligió el anfitrión (acá, 10 apoyos), sale sola a Propuestas con el sello del bloque.', 'Te escribí una idea de ejemplo. Probá juntar apoyos:'], tarjeta: 'idea',
    ops: [{ label: 'Simular apoyos', yo: 'Quiero ver cómo junta apoyos', accion: 'apoyos', primario: true }] },
  { tab: 'Privacidad', bot: ['Paso 4: tu privacidad. Esto es lo que ve y lo que nunca ve el anfitrión de un bloque:'], tarjeta: 'privacidad',
    ops: [{ label: '¿Y si me quiero ir?', yo: '¿Y si me quiero ir del bloque?', next: 5, primario: true }] },
  { tab: 'Salir', bot: ['Podés salir cuando quieras. Para entrar a otro bloque esperás 30 días; eso evita que la gente salte de bloque en bloque. Igual seguís votando en todo el Cabildo.', 'Si el bloque se cierra o lo suspenden, todos sus miembros quedan libres al instante.'],
    ops: [{ label: 'Terminar el recorrido', yo: 'Listo, terminemos', next: 6, primario: true }] },
  { tab: 'Listo', bot: ['¡Listo! Ya sabés cómo funciona un bloque: sumarte, leer comunicados, proponer ideas, apoyar y cuidar tu privacidad.', 'Ahora podés buscar un bloque real en el panel de Bloques. Este simulador queda acá para cuando quieras repasar.'], estado: 'Recorrido completado',
    ops: [{ label: 'Ver bloques reales', yo: 'Quiero ver bloques reales', fin: true, primario: true }, { label: 'Empezar de nuevo', yo: 'Empezar de nuevo', reiniciar: true }] },
]
// simulador-diseno
const sim = { paso: 0, log: [], escribiendo: false, apoyos: 1, timers: [] }
function simLimpiarTimers() { sim.timers.forEach(t => { clearTimeout(t); clearInterval(t) }); sim.timers = [] }
function simModal() {
  let m = $('#modal-sim'); if (m) return m
  document.body.insertAdjacentHTML('beforeend', `<div class="modal sim-modal" id="modal-sim" hidden role="dialog" aria-modal="true" aria-label="Bloque Simulador">
    <div class="modal-box sim-box">
      <header class="sim-top"><span class="sim-foto"><img src="${SIM_IMG}" alt="Claria, la anfitriona"><span class="sim-insignia" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4"/></svg></span></span><div><b>Bloque Simulador <span class="sim-practica">Práctica</span></b><small>Anfitriona: Claria</small></div>
        <span class="sim-paso" id="sim-paso"></span>
        <button class="modal-x" type="button" data-sim-cerrar aria-label="Cerrar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header>
      <div class="sim-barra"><i id="sim-prog"></i></div>
      <nav class="sim-tabs" id="sim-tabs" aria-label="Secciones del bloque"></nav>
      <div class="sim-chat" id="sim-chat" aria-live="polite"></div>
      <footer class="sim-pie"><small>Respuestas rápidas</small><div class="sim-ops" id="sim-ops"></div>
        <small>Todo en este bloque es de práctica: nada se publica ni cuenta en el Cabildo.</small></footer>
    </div></div>`)
  m = $('#modal-sim')
  m.addEventListener('click', e => {
    if (e.target === m || e.target.closest('[data-sim-cerrar]')) return simCerrar()
    const b = e.target.closest('[data-sim-op]'); if (b) simElegir(+b.dataset.simOp)
  })
  m.addEventListener('keydown', e => { if (e.key === 'Escape') simCerrar() })
  return m
}
function simAbrir() {
  const m = simModal(); m.hidden = false; document.body.style.overflow = 'hidden'
  simLimpiarTimers(); sim.apoyos = 1; simDecir(0, [])
  setTimeout(() => m.querySelector('[data-sim-cerrar]')?.focus(), 50)
}
function simCerrar() { simLimpiarTimers(); const m = $('#modal-sim'); if (m) m.hidden = true; document.body.style.overflow = '' }
function simDecir(n, previo) {
  const p = SIM_PASOS[n]
  const cola = p.bot.map(t => ({ k: 'bot', texto: t }))
  if (p.tarjeta) cola.push({ k: p.tarjeta })
  if (p.estado) cola.push({ k: 'estado', texto: p.estado })
  sim.paso = n; sim.log = previo.slice(); sim.escribiendo = true; simPintar()
  const sig = i => {
    if (i >= cola.length) { sim.escribiendo = false; simPintar(); return }
    sim.timers.push(setTimeout(() => { sim.log.push(cola[i]); sim.escribiendo = i + 1 < cola.length; simPintar(); sig(i + 1) }, i === 0 ? 650 : 900))
  }
  sig(0)
}
function simElegir(i) {
  if (sim.escribiendo) return
  const o = SIM_PASOS[sim.paso].ops[i]; if (!o) return
  sim.log.push({ k: 'yo', texto: o.yo })
  if (o.reiniciar) { simLimpiarTimers(); sim.apoyos = 1; return simDecir(0, []) }
  if (o.fin) { simCerrar(); irATab('todos'); return }
  if (o.extra) { sim.escribiendo = true; simPintar(); sim.timers.push(setTimeout(() => { sim.log.push({ k: 'bot', texto: o.extra }); sim.escribiendo = false; simPintar() }, 700)); return }
  if (o.accion === 'apoyos') {
    sim.escribiendo = true; simPintar()
    const iv = setInterval(() => {
      if (sim.apoyos >= 10) { clearInterval(iv); sim.log.push({ k: 'estado', texto: '10 de 10 apoyos · idea publicada' }); simPintar(); sim.timers.push(setTimeout(() => simDecir(4, sim.log), 900)); return }
      sim.apoyos++; simPintar()
    }, 260)
    sim.timers.push(iv); return
  }
  if (o.estado) sim.log.push({ k: 'estado', texto: o.estado })
  simDecir(o.next, sim.log)
}
function simPintar() {
  if (!$('#modal-sim')) return
  const total = SIM_PASOS.length - 1, p = SIM_PASOS[sim.paso]
  $('#sim-paso').textContent = sim.paso === 0 ? 'Tutorial' : (sim.paso >= total ? 'Completado' : `Paso ${sim.paso} de ${total - 1}`)
  $('#sim-prog').style.width = Math.round(sim.paso / total * 100) + '%'
  $('#sim-tabs').innerHTML = ['Sumarse', 'Comunicados', 'Ideas', 'Privacidad', 'Salir'].map(t => `<span class="${t === p.tab ? 'on' : ''}">${t}</span>`).join('')
  const av = `<img class="sim-av" src="${SIM_IMG}" alt="">`
  $('#sim-chat').innerHTML = sim.log.map(m => {
    if (m.k === 'bot') return `<div class="sim-m bot">${av}<p>${esc(m.texto)}</p></div>`
    if (m.k === 'yo') return `<div class="sim-m yo"><p>${esc(m.texto)}</p></div>`
    if (m.k === 'estado') return `<div class="sim-m estado"><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>${esc(m.texto)}</span></div>`
    if (m.k === 'comunicado') return `<div class="sim-m tarjeta"><div class="sim-t"><div class="sim-t-cab"><span class="tag">Comunicado</span><small>de la anfitriona · recién</small></div>
      <p>Este sábado debatimos cómo pedir más centros de votación en el exterior. Traé tus ideas a la pestaña Ideas.</p><small>Les llega a todos los miembros, con notificación.</small></div></div>`
    if (m.k === 'idea') return `<div class="sim-m tarjeta"><div class="sim-t"><div class="sim-t-cab"><span class="tag sim-verde">Tu idea</span><small>${sim.apoyos} de 10 apoyos</small></div>
      <p><b>Pedir que los consulados abran como centros de votación en las próximas elecciones.</b></p>
      <div class="sim-meta"><i style="width:${Math.min(100, sim.apoyos * 10)}%"></i></div>
      ${sim.apoyos >= 10 ? '<p class="sim-ok">Llegó a la meta: salió a Propuestas con el sello del bloque.</p>' : ''}</div></div>`
    if (m.k === 'privacidad') return `<div class="sim-m tarjeta"><div class="sim-priv"><div><b class="si">El anfitrión ve</b><p>Tu alias, si lo hiciste público. Si no, «Ciudadano anónimo». Y tu mensaje de presentación.</p></div>
      <div><b class="no">Nunca ve</b><p>Tu número de butaca, tu email ni cómo votás en el hemiciclo.</p></div></div></div>`
    return ''
  }).join('') + (sim.escribiendo ? `<div class="sim-m bot">${av}<p class="sim-escribe" aria-label="Claria está escribiendo"><i></i><i></i><i></i></p></div>` : '')
  $('#sim-ops').innerHTML = sim.escribiendo ? '' : p.ops.map((o, i) => `<button type="button" class="sim-op ${o.primario ? 'primario' : ''}" data-sim-op="${i}">${esc(o.label)}</button>`).join('')
  const c = $('#sim-chat'); c.scrollTop = c.scrollHeight
}
document.addEventListener('click', e => { if (e.target.closest('[data-sim-abrir]')) simAbrir() })

async function unirme(id) {
  if (!estado.user) { location.href = APP_ACTUAL; return }
  if (!estado.butaca) { aviso('Necesitás tener butaca para sumarte a un bloque.', 'error'); return }
  const b = estado.bloques.find(x => x.id === id), nom = b?.nombre || 'el bloque'
  let msg = null
  if (pideAprobacion(id)) {
    const otro = estado.miBloque?.pedido?.estado === 'pendiente' && estado.miBloque.pedido.bloque_id !== id
    msg = await confirmarTexto(`Pedir sumarte a ${nom}`,
      `El anfitrión revisa cada solicitud. Va a ver tu alias si lo hiciste público; si no, apareces como "Ciudadano anónimo". Nunca ve tu número de butaca.${otro ? ` Tu solicitud a ${estado.miBloque.pedido.bloque_nombre} se reemplaza por esta.` : ''}`,
      'Enviar solicitud', 'Presentate en pocas palabras (opcional)', 300)
    if (msg === null) return
  }
  const { data, error } = await sb.rpc('bloque_sumarme', { p_bloque: id, p_mensaje: msg || null })
  if (error) { aviso(error.message, 'error'); return }
  aviso(data === 'solicitud' ? '📨 Solicitud enviada. Te avisamos cuando el anfitrión responda.' : '¡Te sumaste al bloque!')
  cargarBloques()
}

async function cancelarPedido() {
  if (!await confirmar('¿Cancelar tu solicitud?', `Dejás de esperar la respuesta de ${estado.miBloque?.pedido?.bloque_nombre || 'el bloque'}.`, 'Cancelar solicitud', true)) return
  const { error } = await sb.rpc('bloque_solicitud_cancelar')
  if (error) return aviso(error.message, 'error')
  aviso('Solicitud cancelada'); cargarBloques()
}

// Confirmación con un campo de texto opcional. Devuelve el texto ('' si lo dejó vacío) o null si canceló.
function confirmarTexto(titulo, texto, boton, placeholder, max = 300) {
  const ta = document.createElement('textarea')
  ta.className = 'mc-campo'; ta.rows = 3; ta.maxLength = max; ta.placeholder = placeholder
  $('#mc-texto').after(ta)
  const p = confirmar(titulo, texto, boton)
  setTimeout(() => ta.focus(), 30)
  return p.then(ok => { const v = ta.value.trim(); ta.remove(); return ok ? v : null })
}

// ══════════════════════════════════════════════════════════════
//  MI BLOQUE — el espacio privado de los miembros y el mini admin del anfitrión.
//  Comunicados (anfitrión → todos) · Debates (los abre el anfitrión) · Sala (charla grupal) · Ideas (de los miembros)
//  · Propuestas del bloque (salen a Propuestas con el sello del bloque y las mismas reglas que todas).
//  Privacidad: el anfitrión ve a solicitantes y miembros por su alias público o como "Ciudadano anónimo",
//  nunca por su número de butaca. En la sala y en los debates cada miembro aparece con su alias público o como
//  "Miembro del bloque". Las propuestas del bloque no se atan a ninguna butaca (se publican desde la butaca 0).
//  En vivo: canal privado bloque:<id> (solo miembros) que avisa QUÉ cambió, nunca quién.
// ══════════════════════════════════════════════════════════════
const bq = { lemaBorrador: null, d: null, error: null, tab: 'comunicados', cargando: false, hilo: null, coms: new Map(), sala: [], salaT: 0, salaN: 0, formDebate: false, sols: null, miem: null, filtro: '', verTodos: false }
const bqRt = { id: null, canal: null, host: null, props: null, ok: false, t: 0, hilos: new Set(), gente: false, poll: 0, n: 0 }

async function bqConectar() {
  const b = bq.d?.bloque; if (!b) return bqDesconectar()
  const host = !!bq.d.soy_anfitrion
  if (bqRt.id === b.id && !!bqRt.host === host) return
  bqDesconectar(); bqRt.id = b.id
  try { await sb.realtime.setAuth() } catch (e) {}
  const escuchar = topic => sb.channel(topic, { config: { private: true } })
    .on('broadcast', { event: 'cambio' }, ({ payload }) => bqCambio(payload))
  bqRt.canal = escuchar('bloque:' + b.id).subscribe(s => { bqRt.ok = s === 'SUBSCRIBED' })
  if (host) bqRt.host = escuchar('bloque-host:' + b.id).subscribe()
  // Apoyos de las propuestas del bloque (tabla pública de propuestas)
  bqRt.props = sb.channel('bloque-props:' + b.id)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'proposals', filter: `bloque_id=eq.${b.id}` }, ({ new: n }) => {
      const p = bq.d?.propuestas?.find(x => x.id === n.id); if (!p) return
      Object.assign(p, { likes: n.likes, status: n.status })
      if (vistaActual() === 'bloque' && bq.tab === 'propuestas') bqRepintar()
    }).subscribe()
  // Respaldo por si el canal en vivo se cae: cada 20 s sin conexión, cada 2 min con conexión
  clearInterval(bqRt.poll)
  bqRt.poll = setInterval(() => {
    if (vistaActual() !== 'bloque' || document.visibilityState !== 'visible') return
    if (!bqRt.ok || ++bqRt.n % 6 === 0) bqRefrescar(true)
  }, 20_000)
}
function bqDesconectar() {
  ;[bqRt.canal, bqRt.host, bqRt.props].forEach(c => { if (c) sb.removeChannel(c) })
  Object.assign(bqRt, { id: null, canal: null, host: null, props: null, ok: false })
  clearInterval(bqRt.poll); bqRt.poll = 0
}
function bqCambio(p) {
  if (!p) return
  if (p.t === 'sala') { if (vistaActual() === 'bloque' && bq.tab === 'sala') bqCargarSala(); return }
  if (p.t === 'comentario' && p.idea) bqRt.hilos.add(p.idea)
  if (p.t === 'solicitud' || p.t === 'miembro') bqRt.gente = true
  if (vistaActual() !== 'bloque') return   // al volver a la vista se recarga todo
  clearTimeout(bqRt.t); bqRt.t = setTimeout(() => bqRefrescar(), 300)
}
// Recarga silenciosa: actualiza contadores, hilos abiertos y listas sin perder lo que el usuario está escribiendo
async function bqRefrescar(todo) {
  if (!bq.d || bq.cargando) return
  const { data, error } = await sb.rpc('bloque_panel')
  if (error) {
    if (/ningún bloque/i.test(error.message || '')) { bq.d = null; bqDesconectar(); aviso('Ya no sos parte de este bloque.'); cargarBloques(); pintarMiBloque() }
    return
  }
  bq.d = data
  if (bq.hilo && (todo || bqRt.hilos.has(bq.hilo))) {
    const r = await sb.rpc('bloque_comentarios_listar', { p_idea: bq.hilo }); if (!r.error) bq.coms.set(bq.hilo, r.data || [])
  }
  bqRt.hilos.clear()
  if (bq.d.soy_anfitrion && bq.tab === 'admin' && (todo || bqRt.gente)) await bqCargarGente()
  bqRt.gente = false
  if (bq.tab === 'sala' && todo) await bqCargarSala()
  if (vistaActual() === 'bloque') bqRepintar()
}
function bqRepintar() {
  const v = $('#bq-vista'); if (!v) return
  const vals = {}, act = document.activeElement
  $$('#bq-vista input[id], #bq-vista textarea[id], #bq-vista select[id]').forEach(e => { vals[e.id] = e.value })
  const foco = act?.id && v.contains(act) ? { id: act.id, s: act.selectionStart, e: act.selectionEnd } : null
  const sala = $('#bq-sala-msgs'), salaPos = sala ? { top: sala.scrollTop, abajo: sala.scrollHeight - sala.scrollTop - sala.clientHeight < 80 } : null
  pintarMiBloque()
  for (const [k, val] of Object.entries(vals)) {
    const e = document.getElementById(k)
    if (e && e.value !== val) { e.value = val; e.dispatchEvent(new Event('input', { bubbles: true })) }
  }
  if (foco) { const e = document.getElementById(foco.id); if (e) { e.focus({ preventScroll: true }); try { e.setSelectionRange(foco.s, foco.e) } catch (_) {} } }
  const s2 = $('#bq-sala-msgs'); if (s2 && salaPos) s2.scrollTop = salaPos.abajo ? s2.scrollHeight : salaPos.top
}
// Portada del bloque y foto del anfitrión: se re-dibujan en el navegador (JPEG nuevo, sin metadatos)
// y las sube la función "bloques-archivos", que reemplaza la anterior y la borra del depósito.
// El selector de archivo vive fuera de la vista para que un refresco en vivo no lo pierda.
function bqElegirFoto(tipo) {
  if (bq.subiendo) return
  let inp = $('#bq-f-input')
  if (!inp) {
    inp = document.createElement('input'); inp.type = 'file'; inp.id = 'bq-f-input'; inp.accept = 'image/jpeg,image/png,image/webp'; inp.hidden = true
    document.body.append(inp)
    inp.addEventListener('change', () => { const f = inp.files?.[0]; inp.value = ''; if (f) bqSubirFoto(inp.dataset.tipo, f) })
  }
  inp.dataset.tipo = tipo; inp.click()
}
async function bqSubirFoto(tipo, file) {
  bq.subiendo = tipo; bqRepintar()
  try {
    const blob = await prepararImagen(file, tipo === 'foto' ? 800 : 1600)
    await subirArchivo(tipo, blob)
    aviso(tipo === 'foto' ? '✓ Foto de perfil actualizada' : '✓ Portada actualizada')
    bq.subiendo = null
    await bqRefrescar(true); cargarBloques()
  } catch (e) { aviso(e.message || 'No se pudo subir la imagen', 'error') }
  bq.subiendo = null; bqRepintar()
}

async function bqCargarGente() {
  const [s, m] = await Promise.all([sb.rpc('bloque_solicitudes_listar'), sb.rpc('bloque_miembros_listar')])
  bq.sols = s.error ? [] : (s.data || []); bq.miem = m.error ? [] : (m.data || [])
}
const BQ_TABS = [['comunicados', 'Comunicados'], ['debates', 'Debates'], ['sala', 'Sala'], ['ideas', 'Ideas'], ['propuestas', 'Propuestas'], ['admin', 'Administrar']]
const soyDeUnBloque = () => !!estado.miBloque?.bloque_id
const bqTxt = t => esc(t || '').replace(/\n/g, '<br>')
function bqFalta(ts) {
  const s = Math.floor((new Date(ts) - Date.now()) / 1000)
  if (s <= 0) return 'cerró'
  const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60)
  return d ? `cierra en ${d} d ${h} h` : h ? `cierra en ${h} h ${m} min` : `cierra en ${m} min`
}

function actualizarNavBloque() {
  const a = $('#nav a[data-sec="bloque"]'); if (a) a.parentElement.hidden = !soyDeUnBloque()
}

async function cargarMiBloque(tab) {
  if (tab && BQ_TABS.some(([k]) => k === tab)) bq.tab = tab
  if (!estado.user || !estado.butaca) { bq.d = null; pintarMiBloque(); return }
  bq.cargando = !bq.d; pintarMiBloque()
  const { data, error } = await sb.rpc('bloque_panel')
  bq.cargando = false
  if (error) { bq.d = null; bq.error = error.message } else { bq.d = data; bq.error = null }
  if (bq.tab === 'admin' && !bq.d?.soy_anfitrion) bq.tab = 'comunicados'
  if (bq.tab === 'admin' && bq.d) await bqCargarGente()
  pintarMiBloque()
  if (bq.tab === 'sala') bqAbrirSala(); else bqCerrarSala()
  bqConectar()
}

function pintarMiBloque() {
  const cab = $('#bq-cab'), tabs = $('#bq-tabs'), cuerpo = $('#bq-cuerpo'); if (!cab) return
  if (!estado.user || !estado.butaca) {
    cab.innerHTML = `<div class="empty"><div class="e-icon">${ICON_GRUPO}</div><h3>Tu bloque</h3><p>Iniciá sesión con tu butaca para ver el espacio de tu bloque.</p></div>`
    tabs.innerHTML = ''; cuerpo.innerHTML = ''; return
  }
  if (bq.cargando) { cab.innerHTML = '<p class="muted">Cargando tu bloque…</p>'; tabs.innerHTML = ''; cuerpo.innerHTML = ''; return }
  const d = bq.d
  if (!d) {
    const ped = estado.miBloque?.pedido?.estado === 'pendiente' ? estado.miBloque.pedido : null
    cab.innerHTML = `<div class="empty"><div class="e-icon">${ICON_GRUPO}</div><h3>${ped ? `Esperando a ${esc(ped.bloque_nombre)}` : 'Todavía no estás en un bloque'}</h3>
      <p>${ped ? 'Tu solicitud está pendiente. Cuando el anfitrión la acepte vas a ver acá el espacio del bloque.' : 'Sumate a uno desde el panel de Bloques para debatir, proponer ideas y charlar con sus miembros.'}</p>
      <button class="btn btn-accent" data-bq="explorar">Explorar bloques</button></div>`
    tabs.innerHTML = ''; cuerpo.innerHTML = ''; return
  }
  const b = d.bloque, host = d.soy_anfitrion
  // Dentro del bloque no hay portada (la portada solo se ve en el panel de Bloques). El cuadro muestra la foto del anfitrión o la inicial.
  const cuadro = b.foto_url
  cab.innerHTML = `<header class="card bq-cabecera">
    <div class="bq-cab-fila">
    ${cuadro ? `<img class="bq-img" src="${esc(cuadro)}" alt="">` : `<span class="bq-img bq-ini">${esc((b.nombre || 'B').charAt(0))}</span>`}
    <div class="bq-tit">
      <span class="bq-rol ${host ? 'host' : ''}">${host ? '★ Sos el anfitrión' : 'Sos miembro'}</span>
      <h1>${esc(b.nombre)}</h1>
      ${b.lema ? `<p class="bq-lema">${esc(b.lema)}</p>` : ''}
      <div class="bq-meta">
        <span>Anfitrión: <b>${esc(b.anfitrion)}</b></span>
        <span class="bq-punto">·</span><span>👥 <b>${fmtNum(b.miembros)}</b> ${b.miembros === 1 ? 'miembro' : 'miembros'}</span>
      </div>
    </div>
    </div>
  </header>`
  const n = {
    comunicados: d.comunicados.length,
    debates: d.debates.filter(x => x.abierto).length,
    ideas: d.ideas.filter(x => x.estado === 'en_debate').length,
    propuestas: d.en_campana,
    admin: d.pendientes || 0,
  }
  tabs.innerHTML = BQ_TABS.filter(([k]) => k !== 'admin' || host).map(([k, t]) =>
    `<button role="tab" class="bq-tab ${bq.tab === k ? 'active' : ''}" aria-selected="${bq.tab === k}" data-bq-tab="${k}">${t}${n[k] ? `<span>${n[k]}</span>` : ''}</button>`).join('')
  cuerpo.innerHTML = ({ comunicados: bqComunicados, debates: bqDebates, sala: bqSala, ideas: bqIdeas, propuestas: bqPropuestas, admin: bqAdmin }[bq.tab] || bqComunicados)(d)
  if (bq.tab === 'sala') bqPintarSala(true)
  if (bq.hilo && $(`#bq-hilo-${bq.hilo}`)) pintarHiloBloque(bq.hilo)
}

const bqCompose = (id, titulo, ayuda, max, filas, boton, accion, placeholder) => `<div class="card bq-compose">
  <label for="${id}"><b>${titulo}</b>${ayuda ? `<small>${ayuda}</small>` : ''}</label>
  <textarea id="${id}" maxlength="${max}" rows="${filas}" placeholder="${placeholder}"></textarea>
  <div class="bq-acc"><span class="bq-cont" data-bq-cont="${id}">0/${max}</span><button class="btn btn-dark" data-bq="${accion}">${boton}</button></div>
</div>`

// ── Comunicados
function bqComunicados(d) {
  const host = d.soy_anfitrion, b = d.bloque
  const av = b.foto_url ? `<img class="bq-av" src="${esc(b.foto_url)}" alt="">` : `<span class="bq-av">${esc(b.anfitrion.charAt(0))}</span>`
  return (host ? bqCompose('bq-com-txt', 'Escribirle a todo el bloque', 'Les llega a todos los miembros como notificación. Hasta 10 por día.', 2000, 3, 'Enviar comunicado', 'comunicar', 'Contales a tus miembros qué viene, qué se decidió o a qué los invitás…') : '') +
    (d.comunicados.length ? d.comunicados.map(c => `<article class="card bq-com">
      <header>${av}<div><b>${esc(b.anfitrion)}</b><small>Anfitrión · ${haceCuanto(c.created_at)}</small></div>
        ${host ? `<button class="bq-x" data-bq-borrar-com="${c.id}" title="Borrar comunicado" aria-label="Borrar comunicado">✕</button>` : ''}</header>
      <p>${bqTxt(c.texto)}</p></article>`).join('')
    : `<p class="bq-vacio">${host ? 'Todavía no enviaste comunicados. Usalos para contarle al bloque qué viene y qué se decidió.' : 'El anfitrión todavía no publicó comunicados.'}</p>`)
}

// ── Debates
function bqDebates(d) {
  const host = d.soy_anfitrion
  const form = host ? (bq.formDebate ? `<div class="card bq-compose">
      <label for="bq-deb-tit"><b>Abrir un debate</b><small>Todos los miembros pueden opinar mientras esté abierto. Les llega una notificación.</small></label>
      <input id="bq-deb-tit" maxlength="140" placeholder="Tema del debate (ej.: ¿Qué priorizamos este mes?)">
      <textarea id="bq-deb-txt" maxlength="1000" rows="3" placeholder="Contexto o pregunta para guiar la conversación (opcional)"></textarea>
      <div class="bq-acc"><label class="bq-sel">Duración <select id="bq-deb-horas"><option value="0">Sin límite</option><option value="24">24 horas</option><option value="48" selected>48 horas</option><option value="168">7 días</option></select></label>
        <span class="bq-acc-der"><button class="btn btn-ghost" data-bq="debate-cancelar">Cancelar</button><button class="btn btn-dark" data-bq="debate-abrir">Abrir debate</button></span></div>
    </div>` : `<button class="btn btn-accent bq-nuevo" data-bq="debate-form">+ Abrir un debate</button>`) : ''
  return form + (d.debates.length ? d.debates.map(x => `<article class="card bq-item ${x.abierto ? '' : 'cerrado'}">
      <header><span class="bq-chip ${x.abierto ? 'on' : ''}">${x.abierto ? '● Abierto' : 'Cerrado'}</span>
        ${x.abierto && x.cierra_at ? `<small>${bqFalta(x.cierra_at)}</small>` : ''}<small class="bq-der">${haceCuanto(x.created_at)}</small></header>
      <h3>${esc(x.titulo)}</h3>${x.texto && x.texto !== x.titulo ? `<p>${bqTxt(x.texto)}</p>` : ''}
      <footer><button class="bq-link" data-bq-hilo="${x.id}" aria-expanded="${bq.hilo === x.id}">💬 ${x.comentarios} ${x.comentarios === 1 ? 'comentario' : 'comentarios'}</button>
        ${host && x.abierto ? `<button class="bq-link peligro" data-bq-cerrar-deb="${x.id}">Cerrar debate</button>` : ''}</footer>
      <div class="bq-hilo" id="bq-hilo-${x.id}" data-abierto="${x.abierto ? 1 : 0}" ${bq.hilo === x.id ? '' : 'hidden'}></div>
    </article>`).join('')
    : `<p class="bq-vacio">${host ? 'Todavía no abriste debates. Abrí uno para escuchar a tus miembros sobre un tema puntual.' : 'Todavía no hay debates abiertos en el bloque.'}</p>`)
}

// ── Ideas
function bqIdeas(d) {
  const host = d.soy_anfitrion, cfg = d.config || {}, umbral = Number(cfg.umbral) || 10
  const reglas = cfg.propuestas_miembros
    ? `Si una idea junta <b>${umbral} apoyos</b> de miembros, sale sola a Propuestas como propuesta del bloque.`
    : 'El anfitrión decide qué ideas se convierten en propuesta del bloque.'
  const ESTADO = { en_debate: ['En debate', 'on'], publicada: ['Es propuesta', 'pub'], adoptada: ['Adoptada', 'pub'], descartada: ['Descartada', ''], cerrado: ['Cerrada', ''] }
  return bqCompose('bq-idea-txt', 'Proponer una idea al bloque', reglas, 1000, 3, 'Publicar idea', 'idea-crear', 'Tu idea en pocas líneas: qué proponés y por qué…') +
    (d.ideas.length ? d.ideas.map(i => {
      const [et, ec] = ESTADO[i.estado] || [i.estado, '']
      const viva = i.estado === 'en_debate', pct = Math.min(100, i.apoyos / umbral * 100)
      return `<article class="card bq-item">
        <header><b>${i.es_mia ? 'Vos' : esc(i.autor)}</b><small>${haceCuanto(i.created_at)}</small><span class="bq-chip ${ec} bq-der">${et}</span></header>
        <p>${bqTxt(i.texto)}</p>
        ${viva && cfg.propuestas_miembros ? `<div class="bq-meta-apoyo"><div class="bq-barra"><i style="width:${pct}%"></i></div><small>${i.apoyos} de ${umbral} apoyos para salir a Propuestas</small></div>` : ''}
        ${i.decision_nota ? `<p class="bq-nota">${esc(i.decision_nota)}</p>` : ''}
        <footer>
          ${viva ? `<button class="btn bq-apoyo ${i.yo_apoye ? 'on' : ''}" data-bq-apoyar="${i.id}">${i.yo_apoye ? '✓ Apoyando' : 'Apoyar'} · ${i.apoyos}</button>` : `<span class="muted">${i.apoyos} ${i.apoyos === 1 ? 'apoyo' : 'apoyos'}</span>`}
          <button class="bq-link" data-bq-hilo="${i.id}" aria-expanded="${bq.hilo === i.id}">💬 ${i.comentarios}</button>
          ${i.propuesta_id ? `<a class="bq-link" href="#propuestas/${i.propuesta_id}">Ver la propuesta →</a>` : ''}
          ${host && (viva || i.estado === 'adoptada') ? `<span class="bq-der"><button class="bq-link" data-bq-publicar="${i.id}">Publicar como propuesta</button><button class="bq-link peligro" data-bq-descartar="${i.id}">Descartar</button></span>` : ''}
        </footer>
        <div class="bq-hilo" id="bq-hilo-${i.id}" data-abierto="1" ${bq.hilo === i.id ? '' : 'hidden'}></div>
      </article>`
    }).join('') : '<p class="bq-vacio">Todavía no hay ideas. ¡Proponé la primera!</p>')
}

// ── Propuestas del bloque
function bqPropuestas(d) {
  const host = d.soy_anfitrion, meta = d.meta || 20
  const ST = { pending: ['En campaña', 'on'], accepted: ['Meta lograda · en revisión', 'pub'], approved: ['En el Hemiciclo', 'pub'], expired: ['No llegó a la meta', ''], rejected: ['No aprobada', ''] }
  const cats = Object.keys(CAT_COLOR)
  const form = host ? `<div class="card bq-compose">
      <label for="bq-prop-txt"><b>Lanzar una propuesta del bloque</b>
        <small>Sale en Propuestas con el sello del bloque y sigue las mismas reglas que todas: necesita ${meta} apoyos en 48 h para llegar al Hemiciclo. En campaña: <b>${d.en_campana}/3</b>.</small></label>
      <textarea id="bq-prop-txt" maxlength="280" rows="3" placeholder="La propuesta, clara y en una frase (10 a 280 caracteres)"></textarea>
      <textarea id="bq-prop-ctx" maxlength="1500" rows="2" placeholder="Contexto o fundamentos (opcional)"></textarea>
      <div class="bq-acc"><label class="bq-sel">Categoría <select id="bq-prop-cat">${cats.map(c => `<option ${c === 'General' ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <span class="bq-acc-der"><span class="bq-cont" data-bq-cont="bq-prop-txt">0/280</span><button class="btn btn-dark" data-bq="prop-crear" ${d.en_campana >= 3 ? 'disabled' : ''}>Lanzar propuesta</button></span></div>
    </div>` : `<p class="bq-ayuda">Las propuestas del bloque compiten en <a href="#propuestas">Propuestas</a> como todas las demás. Apoyalas para que lleguen al Hemiciclo.</p>`
  return form + (d.propuestas.length ? d.propuestas.map(p => {
    const [st, sc] = ST[p.status] || [p.status, ''], vive = p.status === 'pending' && new Date(p.expires_at) > new Date()
    return `<article class="card bq-item bq-prop">
      <header><span class="bq-chip ${vive ? sc : (p.status === 'pending' ? '' : sc)}">${vive ? st : p.status === 'pending' ? 'Terminó' : st}</span><span class="tag">${esc(p.cat || 'General')}</span>
        ${vive ? `<small class="bq-der">se apaga ${bqFalta(p.expires_at).replace('cierra ', '')}</small>` : `<small class="bq-der">${haceCuanto(p.created_at)}</small>`}</header>
      <p class="bq-prop-txt">${esc(p.text)}</p>
      <div class="bq-meta-apoyo"><div class="bq-barra"><i style="width:${Math.min(100, p.likes / meta * 100)}%"></i></div><small><b>${p.likes}</b> de ${meta} apoyos</small></div>
      <footer><a class="bq-link" href="#propuestas/${p.id}">Ver en Propuestas →</a></footer>
    </article>`
  }).join('') : '<p class="bq-vacio">El bloque todavía no lanzó propuestas.</p>')
}

// ── Administrar (solo anfitrión)
function bqAdmin(d) {
  const c = d.config || {}, b = d.bloque
  const sw = (k, on, t, a) => `<div class="mb-fila"><div><b>${t}</b><small>${a}</small></div><button class="switch ${on ? 'on' : ''}" role="switch" aria-checked="${!!on}" data-bq-sw="${k}" aria-label="${t}"><i></i></button></div>`
  return bqGente(d) + `<div class="bq-admin-grid">
    <article class="card bq-admin bq-fotos">
      <h3>Cómo te ven en el panel de Bloques</h3>
      <div class="bq-f-cols">
        <div class="bq-f-prev">${heroBloque({ id: b.id, nombre: b.nombre, lema: bq.lemaBorrador ?? b.lema, anfitrion_nombre: b.anfitrion, anfitrion_foto: b.foto_url, imagen_url: b.imagen_url, miembros: b.miembros, ideas: d.ideas.length })}
          <small class="bq-f-ayuda">Vista previa: así aparece tu bloque en la columna derecha.</small></div>
        <div class="bq-f-ctrl">
          <div class="mb-fila bq-f-fila">
            ${b.imagen_url ? `<img class="bq-f-mini" src="${esc(b.imagen_url)}" alt="">` : '<span class="bq-f-mini vacia">🖼️</span>'}
            <div><b>Portada</b><small>La imagen grande del panel. Mejor vertical o cuadrada. ${b.imagen_url ? '' : 'Si no subís una, se usa tu foto.'}</small></div>
            <button class="btn btn-ghost" data-bq-foto="imagen" ${bq.subiendo ? 'disabled' : ''}>${bq.subiendo === 'imagen' ? 'Subiendo…' : b.imagen_url ? 'Cambiar' : 'Subir'}</button>
          </div>
          <div class="mb-fila bq-f-fila">
            ${b.foto_url ? `<img class="bq-f-mini redonda" src="${esc(b.foto_url)}" alt="">` : `<span class="bq-f-mini redonda">${esc((b.anfitrion || 'A').charAt(0))}</span>`}
            <div><b>Tu foto de perfil</b><small>Es pública: te representa como anfitrión, también dentro del bloque.</small></div>
            <button class="btn btn-ghost" data-bq-foto="foto" ${bq.subiendo ? 'disabled' : ''}>${bq.subiendo === 'foto' ? 'Subiendo…' : 'Cambiar'}</button>
          </div>
          <div class="bq-f-lema">
            <label for="bq-lema"><b>Frase del bloque</b><small>Aparece debajo del nombre, en el panel y dentro del bloque.</small></label>
            <div class="mb-input"><input id="bq-lema" maxlength="120" value="${esc(bq.lemaBorrador ?? b.lema ?? '')}" placeholder="Una frase que resuma tu bloque" autocomplete="off">
              <button class="btn btn-dark" data-bq="lema" ${(bq.lemaBorrador ?? b.lema ?? '') === (b.lema ?? '') ? 'disabled' : ''}>Guardar</button></div>
            <span class="bq-cont" data-bq-cont="bq-lema">${(bq.lemaBorrador ?? b.lema ?? '').length}/120</span>
          </div>
        </div>
      </div>
    </article>
    <article class="card bq-admin">
      <h3>Configuración del bloque</h3>
      ${sw('aprobacion', c.aprobacion !== false, 'Pedir aprobación para sumarse', 'Cada persona te manda una solicitud y vos decidís. Si lo apagás, cualquiera entra directo.')}
      ${sw('sala', c.sala !== false, 'Sala abierta', 'Los miembros pueden escribir en la sala del bloque. Si la cerrás, solo vos podés escribir.')}
      ${sw('propuestas_miembros', !!c.propuestas_miembros, 'Las ideas de los miembros pueden llegar a Propuestas', 'Cuando una idea junta los apoyos que elijas, sale sola como propuesta del bloque.')}
      <div class="mb-fila ${c.propuestas_miembros ? '' : 'apagada'}"><div><b>Apoyos necesarios</b><small>Entre 2 y 500. Hoy el bloque tiene ${fmtNum(b.miembros)} ${b.miembros === 1 ? 'miembro' : 'miembros'}.</small></div>
        <div class="bq-umbral"><input type="number" id="bq-umbral" min="2" max="500" value="${Number(c.umbral) || 10}"><button class="btn btn-dark" data-bq="umbral">Guardar</button></div></div>
    </article>
    <article class="card bq-admin">
      <h3>Tu bloque hoy</h3>
      <div class="bq-stats">
        <div><b>${fmtNum(b.miembros)}</b><small>Miembros</small></div>
        <div><b>${d.debates.filter(x => x.abierto).length}</b><small>Debates abiertos</small></div>
        <div><b>${d.ideas.filter(x => x.estado === 'en_debate').length}</b><small>Ideas en debate</small></div>
        <div><b>${d.en_campana}/3</b><small>Propuestas en campaña</small></div>
      </div>
      <div class="bq-atajos">
        <button class="btn btn-ghost" data-bq-tab="comunicados">📣 Escribir un comunicado</button>
        <button class="btn btn-ghost" data-bq-ir="debate">💬 Abrir un debate</button>
        <button class="btn btn-ghost" data-bq-tab="propuestas">🚀 Lanzar una propuesta</button>
      </div>
      <p class="bq-privado">🔒 Ves a cada persona por su alias público, o como "Ciudadano anónimo" si no lo hizo público. Nunca ves su número de butaca ni cómo vota. Ellos sí te ven a vos: sos la cara pública del bloque.</p>
    </article>
  </div>`
}

// ── Solicitudes y miembros (solo anfitrión)
const bqAvatar = q => `<span class="bq-g-av ${q === 'Ciudadano anónimo' ? 'anon' : ''}" style="${q === 'Ciudadano anónimo' ? '' : `background:${colorDe(null, q)}`}">${q === 'Ciudadano anónimo' ? '?' : esc(q.charAt(0).toUpperCase())}</span>`
function bqGente(d) {
  const abierto = d.config?.aprobacion === false
  if (!bq.sols || !bq.miem) return '<div class="card bq-gente"><p class="muted">Cargando solicitudes y miembros…</p></div>'
  const sols = bq.sols.length ? `<ul class="bq-g-lista">${bq.sols.map(s => `<li>
      ${bqAvatar(s.quien)}<div class="bq-g-txt"><b>${esc(s.quien)}</b><small>Pidió sumarse ${haceCuanto(s.created_at)}</small>
        ${s.mensaje ? `<p>“${esc(s.mensaje)}”</p>` : ''}</div>
      <div class="bq-g-acc"><button class="btn btn-ghost" data-bq-sol="${s.id}" data-ok="0">Rechazar</button><button class="btn btn-dark" data-bq-sol="${s.id}" data-ok="1">Aceptar</button></div>
    </li>`).join('')}</ul>`
    : `<p class="bq-vacio">${abierto ? 'Tu bloque está abierto: la gente entra directo, sin solicitud.' : 'No hay solicitudes pendientes. Cuando alguien pida sumarse lo vas a ver acá al instante.'}</p>`
  const q = bq.filtro.toLowerCase(), lista = bq.miem.filter(m => !q || m.quien.toLowerCase().includes(q))
  const vis = bq.verTodos ? lista : lista.slice(0, 30)
  const miem = bq.miem.length ? `${bq.miem.length > 8 ? `<input class="bq-g-buscar" id="bq-g-buscar" placeholder="Buscar por alias…" value="${esc(bq.filtro)}" autocomplete="off">` : ''}
    <ul class="bq-g-lista">${vis.map(m => `<li>${bqAvatar(m.quien)}<div class="bq-g-txt"><b>${esc(m.quien)}</b><small>Miembro desde ${new Date(m.desde).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}</small></div>
      <button class="bq-link peligro" data-bq-quitar="${m.id}" data-quien="${esc(m.quien)}">Quitar</button></li>`).join('') || '<li class="bq-vacio">Nadie coincide con la búsqueda.</li>'}</ul>
    ${lista.length > vis.length ? `<button class="bq-link" data-bq="ver-todos">Ver los ${lista.length} miembros</button>` : ''}`
    : '<p class="bq-vacio">Todavía no hay miembros además de vos.</p>'
  return `<div class="bq-admin-grid bq-gente-grid">
    <article class="card bq-admin bq-gente"><h3>Solicitudes ${bq.sols.length ? `<span class="bq-g-n">${bq.sols.length}</span>` : ''}</h3>${sols}</article>
    <article class="card bq-admin bq-gente"><h3>Miembros <span class="bq-g-n gris">${fmtNum(bq.miem.length)}</span></h3>${miem}</article>
  </div>`
}

// ── Sala (charla grupal, se actualiza cada 6 s mientras está abierta)
function bqSala(d) {
  const abierta = d.config?.sala !== false, puedo = abierta || d.soy_anfitrion
  return `<div class="card bq-sala">
    <header><div><b>Sala del bloque</b><small>Solo la ven los miembros. Aparecés con tu alias si es público; si no, como "Miembro del bloque".</small></div>
      ${abierta ? '<span class="bq-chip on">● Abierta</span>' : '<span class="bq-chip">Cerrada</span>'}</header>
    <div class="bq-sala-msgs" id="bq-sala-msgs" aria-live="polite"><p class="muted">Cargando mensajes…</p></div>
    ${puedo ? `<div class="bq-sala-esc"><textarea id="bq-sala-txt" rows="1" maxlength="1000" placeholder="${abierta ? 'Escribí un mensaje…' : 'La sala está cerrada para los miembros. Vos podés escribir.'}"></textarea><button class="btn btn-dark" data-bq="sala-enviar" aria-label="Enviar">Enviar</button></div>`
      : '<p class="bq-sala-cerrada">El anfitrión cerró la sala por ahora. Podés seguir participando en Debates e Ideas.</p>'}
  </div>`
}
function bqPintarSala(alFinal) {
  const box = $('#bq-sala-msgs'); if (!box) return
  const cerca = box.scrollHeight - box.scrollTop - box.clientHeight < 80
  box.innerHTML = bq.sala.length ? bq.sala.map(m => `<div class="bq-msg ${m.es_mio ? 'mio' : ''} ${m.anfitrion ? 'host' : ''}">
      <div class="bq-msg-cab"><b>${m.es_mio ? 'Vos' : esc(m.anfitrion ? m.autor.replace(/ \(anfitrión\)$/, '') : m.autor)}</b>${m.anfitrion ? '<span>Anfitrión</span>' : ''}<time>${haceCuanto(m.created_at)}</time>
        ${m.es_mio || bq.d?.soy_anfitrion ? `<button class="bq-x" data-bq-borrar-msg="${m.id}" title="Borrar mensaje" aria-label="Borrar mensaje">✕</button>` : ''}</div>
      <p>${bqTxt(m.texto)}</p></div>`).join('')
    : '<p class="bq-vacio">Todavía no hay mensajes. ¡Saludá al bloque!</p>'
  if (alFinal || cerca) box.scrollTop = box.scrollHeight
}
async function bqCargarSala() {
  const { data, error } = await sb.rpc('bloque_sala_listar', { p_antes: null })
  if (error) return
  const antes = bq.sala.map(m => m.id).join()
  bq.sala = data || []
  if (bq.sala.map(m => m.id).join() !== antes) bqPintarSala(false)
}
function bqAbrirSala() { bqCargarSala().then(() => bqPintarSala(true)); clearInterval(bq.salaT); bq.salaT = setInterval(() => { if (vistaActual() === 'bloque' && bq.tab === 'sala' && document.visibilityState === 'visible' && (!bqRt.ok || ++bq.salaN % 5 === 0)) bqCargarSala() }, 6000) }
function bqCerrarSala() { clearInterval(bq.salaT); bq.salaT = 0 }

// ── Hilos de comentarios (debates e ideas)
async function abrirHiloBloque(id) {
  if (bq.hilo === id) { bq.hilo = null; $(`#bq-hilo-${id}`).hidden = true; $(`[data-bq-hilo="${id}"]`)?.setAttribute('aria-expanded', 'false'); return }
  if (bq.hilo) { const v = $(`#bq-hilo-${bq.hilo}`); if (v) v.hidden = true; $(`[data-bq-hilo="${bq.hilo}"]`)?.setAttribute('aria-expanded', 'false') }
  bq.hilo = id
  const box = $(`#bq-hilo-${id}`); box.hidden = false; box.innerHTML = '<p class="muted">Cargando comentarios…</p>'
  $(`[data-bq-hilo="${id}"]`)?.setAttribute('aria-expanded', 'true')
  const { data, error } = await sb.rpc('bloque_comentarios_listar', { p_idea: id })
  bq.coms.set(id, error ? [] : (data || []))
  pintarHiloBloque(id)
  setTimeout(() => $(`#bq-c-${id}`)?.focus(), 50)
}
function pintarHiloBloque(id) {
  const box = $(`#bq-hilo-${id}`); if (!box) return
  box.hidden = false
  const lista = bq.coms.get(id) || [], abierto = box.dataset.abierto === '1'
  box.innerHTML = `<ul class="bq-coms">${lista.length ? lista.map(c => `<li class="${c.es_mio ? 'mio' : ''}"><div><b>${c.es_mio ? 'Vos' : esc(c.autor)}</b><time>${haceCuanto(c.created_at)}</time></div><p>${bqTxt(c.texto)}</p></li>`).join('') : '<li class="bq-vacio">Todavía no hay comentarios.</li>'}</ul>
    ${abierto ? `<div class="mb-input bq-coment"><input id="bq-c-${id}" maxlength="1000" placeholder="Escribí tu comentario…" autocomplete="off"><button class="btn btn-dark" data-bq-comentar="${id}">Enviar</button></div>` : '<p class="muted bq-cerrado-txt">Este debate está cerrado.</p>'}`
}

// ── Acciones
async function bqRpc(fn, args, ok) {
  const { data, error } = await sb.rpc(fn, args)
  if (error) { aviso(error.message || 'No se pudo completar.', 'error'); return null }
  if (ok) aviso(ok)
  return data ?? true
}
const bqVal = id => ($('#' + id)?.value || '').trim()

async function bqAccion(a, el) {
  const d = bq.d
  if (a === 'explorar') { location.hash = '#inicio'; setTimeout(() => document.documentElement.classList.add('ver-bloques'), 0); $('.app')?.classList.remove('panel-plegado'); irATab('todos'); return }
  if (a === 'ver-todos') { bq.verTodos = true; bqRepintar(); return }
  if (a === 'lema') {
    el.disabled = true
    const r = await bqRpc('bloque_editar_lema', { p_lema: bqVal('bq-lema') }, '✓ Frase actualizada')
    if (r !== null) { bq.lemaBorrador = null; await bqRefrescar(true); cargarBloques() } else el.disabled = false
    return
  }
  if (a === 'comunicar') {
    const t = bqVal('bq-com-txt'); if (t.length < 2) return aviso('Escribí el comunicado.', 'error')
    if (!await confirmar('¿Enviar el comunicado?', `Les llega a los ${fmtNum(d.bloque.miembros)} miembros del bloque como notificación.`, 'Enviar')) return
    el.disabled = true; if (await bqRpc('bloque_comunicar', { p_texto: t }, '📣 Comunicado enviado')) return cargarMiBloque(); el.disabled = false; return
  }
  if (a === 'debate-form') { bq.formDebate = true; pintarMiBloque(); setTimeout(() => $('#bq-deb-tit')?.focus(), 30); return }
  if (a === 'debate-cancelar') { bq.formDebate = false; pintarMiBloque(); return }
  if (a === 'debate-abrir') {
    const t = bqVal('bq-deb-tit'); if (t.length < 3) return aviso('Poné un tema para el debate.', 'error')
    el.disabled = true
    if (await bqRpc('bloque_debate_abrir', { p_titulo: t, p_texto: bqVal('bq-deb-txt'), p_horas: Number($('#bq-deb-horas').value) || 0 }, '💬 Debate abierto')) { bq.formDebate = false; return cargarMiBloque() }
    el.disabled = false; return
  }
  if (a === 'idea-crear') {
    const t = bqVal('bq-idea-txt'); if (t.length < 5) return aviso('La idea tiene que tener al menos 5 caracteres.', 'error')
    el.disabled = true; if (await bqRpc('bloque_idea_crear', { p_texto: t }, '💡 Idea publicada')) return cargarMiBloque(); el.disabled = false; return
  }
  if (a === 'prop-crear') {
    const t = bqVal('bq-prop-txt'); if (t.length < 10) return aviso('La propuesta tiene que tener al menos 10 caracteres.', 'error')
    if (!await confirmar('¿Lanzar la propuesta del bloque?', `Sale ya mismo en Propuestas con el sello de "${d.bloque.nombre}" y tiene 48 horas para juntar ${d.meta} apoyos.`, 'Lanzar')) return
    el.disabled = true
    if (await bqRpc('bloque_propuesta_crear', { p_texto: t, p_cat: $('#bq-prop-cat').value, p_contexto: bqVal('bq-prop-ctx') }, '🚀 Propuesta lanzada')) return cargarMiBloque()
    el.disabled = false; return
  }
  if (a === 'umbral') {
    const u = Math.max(2, Math.min(500, Number($('#bq-umbral').value) || 10))
    if (await bqRpc('bloque_config', { p_sala: d.config.sala !== false, p_propuestas_miembros: !!d.config.propuestas_miembros, p_umbral: u }, '✓ Guardado')) return cargarMiBloque()
    return
  }
  if (a === 'sala-enviar') {
    const box = $('#bq-sala-txt'), t = (box.value || '').trim(); if (!t) return
    el.disabled = true
    const ok = await bqRpc('bloque_sala_enviar', { p_texto: t })
    el.disabled = false
    if (ok) { box.value = ''; box.style.height = ''; await bqCargarSala(); bqPintarSala(true) }
    box.focus(); return
  }
}

function enlazarMiBloque() {
  const v = $('#bq-vista'); if (!v) return
  v.addEventListener('click', async e => {
    const t = e.target
    const tab = t.closest('[data-bq-tab]')
    if (tab) {
      bq.tab = tab.dataset.bqTab; bq.hilo = null; history.replaceState(null, '', '#bloque/' + bq.tab); pintarMiBloque(); bq.tab === 'sala' ? bqAbrirSala() : bqCerrarSala()
      if (bq.tab === 'admin') { await bqCargarGente(); if (bq.tab === 'admin') bqRepintar() }
      return
    }
    const fo = t.closest('[data-bq-foto]'); if (fo) return bqElegirFoto(fo.dataset.bqFoto)
    const so = t.closest('[data-bq-sol]')
    if (so) {
      const ok = so.dataset.ok === '1', s = bq.sols?.find(x => x.id === so.dataset.bqSol)
      if (!ok && !await confirmar('¿Rechazar la solicitud?', `${s?.quien || 'Esta persona'} no va a entrar al bloque. Puede volver a pedirlo en 7 días.`, 'Rechazar', true)) return
      $$(`[data-bq-sol="${so.dataset.bqSol}"]`).forEach(b => { b.disabled = true })
      const r = await bqRpc('bloque_solicitud_responder', { p_id: so.dataset.bqSol, p_aceptar: ok })
      if (r) aviso(r === 'aceptada' ? `✓ ${s?.quien || 'La persona'} ya es parte del bloque` : r === 'ocupado' ? 'Esa persona ya se sumó a otro bloque' : 'Solicitud rechazada')
      return bqRefrescar(true)
    }
    const qu = t.closest('[data-bq-quitar]')
    if (qu) {
      if (!await confirmar('¿Quitar del bloque?', `${qu.dataset.quien} deja de ser miembro y le llega un aviso. Queda libre para sumarse a otro bloque sin esperar.`, 'Quitar', true)) return
      if (await bqRpc('bloque_miembro_quitar', { p_id: qu.dataset.bqQuitar }, 'Miembro quitado')) bqRefrescar(true)
      return
    }
    if (t.closest('[data-bq-ir="debate"]')) { bq.tab = 'debates'; bq.formDebate = true; history.replaceState(null, '', '#bloque/debates'); pintarMiBloque(); bqCerrarSala(); setTimeout(() => $('#bq-deb-tit')?.focus(), 30); return }
    const a = t.closest('[data-bq]'); if (a) return bqAccion(a.dataset.bq, a)
    const h = t.closest('[data-bq-hilo]'); if (h) return abrirHiloBloque(h.dataset.bqHilo)
    const c = t.closest('[data-bq-comentar]')
    if (c) {
      const id = c.dataset.bqComentar, inp = $(`#bq-c-${id}`), txt = (inp.value || '').trim(); if (!txt) return
      c.disabled = true
      if (await bqRpc('bloque_comentar', { p_idea: id, p_texto: txt })) {
        const { data } = await sb.rpc('bloque_comentarios_listar', { p_idea: id }); bq.coms.set(id, data || [])
        const it = [...(bq.d.debates || []), ...(bq.d.ideas || [])].find(x => x.id === id); if (it) it.comentarios = (data || []).length
        pintarMiBloque()
      } else c.disabled = false
      return
    }
    const ap = t.closest('[data-bq-apoyar]')
    if (ap) {
      const id = ap.dataset.bqApoyar; ap.disabled = true
      const r = await bqRpc('bloque_apoyar', { p_idea: id })
      if (r !== null) { await cargarMiBloque(); const i = bq.d?.ideas.find(x => x.id === id); if (i?.estado === 'publicada') aviso('🎉 ¡La idea llegó a los apoyos y salió como propuesta del bloque!') }
      else ap.disabled = false
      return
    }
    const pu = t.closest('[data-bq-publicar]')
    if (pu) {
      if (!await confirmar('¿Publicar esta idea como propuesta?', 'Sale en Propuestas con el sello del bloque, sin mostrar quién la escribió, y tiene 48 horas para juntar apoyos.', 'Publicar')) return
      if (await bqRpc('bloque_idea_publicar', { p_idea: pu.dataset.bqPublicar }, '🚀 La idea ya es propuesta del bloque')) cargarMiBloque()
      return
    }
    const de = t.closest('[data-bq-descartar]')
    if (de) {
      if (!await confirmar('¿Descartar esta idea?', 'Queda en la lista como descartada y ya no se puede apoyar.', 'Descartar', true)) return
      if (await bqRpc('bloque_idea_decidir', { p_idea: de.dataset.bqDescartar, p_estado: 'descartada', p_nota: null }, 'Idea descartada')) cargarMiBloque()
      return
    }
    const cd = t.closest('[data-bq-cerrar-deb]')
    if (cd) {
      if (!await confirmar('¿Cerrar el debate?', 'Los miembros ya no van a poder comentar. Lo dicho queda guardado.', 'Cerrar debate', true)) return
      if (await bqRpc('bloque_debate_cerrar', { p_id: cd.dataset.bqCerrarDeb }, 'Debate cerrado')) cargarMiBloque()
      return
    }
    const bc = t.closest('[data-bq-borrar-com]')
    if (bc) {
      if (!await confirmar('¿Borrar el comunicado?', 'Deja de verse para todos los miembros.', 'Borrar', true)) return
      if (await bqRpc('bloque_comunicado_borrar', { p_id: bc.dataset.bqBorrarCom }, 'Comunicado borrado')) cargarMiBloque()
      return
    }
    const bm = t.closest('[data-bq-borrar-msg]')
    if (bm) {
      if (!await confirmar('¿Borrar el mensaje?', 'Deja de verse en la sala para todos.', 'Borrar', true)) return
      if (await bqRpc('bloque_sala_borrar', { p_id: bm.dataset.bqBorrarMsg })) { await bqCargarSala(); bqPintarSala(false) }
      return
    }
    const sw = t.closest('[data-bq-sw]')
    if (sw && sw.dataset.bqSw === 'aprobacion') {
      const on = bq.d.config.aprobacion === false, pend = bq.sols?.length || 0
      if (!await confirmar(on ? '¿Pedir aprobación para sumarse?' : '¿Abrir el bloque a todos?',
        on ? 'Desde ahora cada persona te manda una solicitud y vos decidís quién entra.'
           : `Cualquier butaca va a poder sumarse directo.${pend ? ` Las ${pend} solicitudes pendientes entran solas.` : ''}`, 'Confirmar')) return
      const r = await bqRpc('bloque_config_aprobacion', { p_on: on }, '✓ Guardado')
      if (r !== null) { if (r > 0) aviso(`✓ Entraron ${r} ${r === 1 ? 'persona' : 'personas'} que estaban esperando`); bqRefrescar(true) }
      return
    }
    if (sw) {
      const c = { sala: bq.d.config.sala !== false, propuestas_miembros: !!bq.d.config.propuestas_miembros, umbral: Number(bq.d.config.umbral) || 10 }
      c[sw.dataset.bqSw] = !c[sw.dataset.bqSw]
      const txt = sw.dataset.bqSw === 'sala'
        ? (c.sala ? ['¿Abrir la sala?', 'Todos los miembros van a poder escribir.'] : ['¿Cerrar la sala?', 'Solo vos vas a poder escribir. Los mensajes quedan guardados.'])
        : (c.propuestas_miembros ? ['¿Habilitar propuestas de los miembros?', `Las ideas que junten ${c.umbral} apoyos van a salir solas a Propuestas como propuestas del bloque.`] : ['¿Deshabilitar propuestas de los miembros?', 'Solo vos vas a poder convertir ideas en propuestas.'])
      if (!await confirmar(txt[0], txt[1], 'Confirmar')) return
      if (await bqRpc('bloque_config', { p_sala: c.sala, p_propuestas_miembros: c.propuestas_miembros, p_umbral: c.umbral }, '✓ Guardado')) cargarMiBloque()
      return
    }
  })
  v.addEventListener('keydown', e => {
    if (e.target.id === 'bq-sala-txt' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('[data-bq="sala-enviar"]')?.click() }
    if (e.target.id?.startsWith('bq-c-') && e.key === 'Enter') { e.preventDefault(); $(`[data-bq-comentar="${e.target.id.slice(5)}"]`)?.click() }
  })
  v.addEventListener('input', e => {
    const c = $(`[data-bq-cont="${e.target.id}"]`); if (c) c.textContent = `${e.target.value.length}/${e.target.maxLength}`
    if (e.target.id === 'bq-g-buscar' && bq.filtro !== e.target.value) { bq.filtro = e.target.value; bqRepintar() }
    if (e.target.id === 'bq-lema') {
      bq.lemaBorrador = e.target.value
      const pv = $('.bq-f-prev .b-info > p'); if (pv) pv.textContent = e.target.value
      const g = $('[data-bq="lema"]'); if (g) g.disabled = e.target.value.trim() === (bq.d?.bloque?.lema || '')
    }
    if (e.target.id === 'bq-sala-txt') { e.target.style.height = 'auto'; e.target.style.height = Math.min(140, e.target.scrollHeight) + 'px' }
  })
}

// ══════════════════════════════════════════════════════════════
//  FUNDING — financiación del Cabildo (se activa desde el admin: system_config.funding).
//  Tres pestañas: Fondo del Cabildo · Proyectos · Socios.
//  · Fondo: franja de $0 a la meta. Cada marca ocupa su tramo con su logo; las butacas que aportan forman
//    un tramo dorado y en la "lupa" aparece cada butaca aportante.
//  · Socios: una butaca que aporta $12 en el año (sumando todos sus aportes) es socia por 12 meses; el
//    acumulado vuelve a 0 cada año. Los socios proponen proyectos y deciden en votación secreta cuáles se
//    financian. En el Hemiciclo nada cambia: 1 butaca = 1 voto, aporte o no.
//  · Proyectos: propuesta → debate (48 h) → votación secreta de socios (mayoría + 30 % de participación)
//    → franja propia donde pueden aportar TODAS las butacas y las marcas → financiado. Si no llega a la
//    meta en el plazo, se devuelve todo.
//  Privacidad: una butaca solo aparece con su número si elige mostrarse; si no, como "Butaca anónima".
//  El voto de los socios es secreto: ni siquiera se le muestra a cada socio lo que votó.
//  Mientras funding.simulado = true todo es una simulación: no se cobra ni se guarda nada.
// ══════════════════════════════════════════════════════════════
const fd = { cfg: null, d: null, vivo: 0, n: 0, nuevos: new Set(), mostrarme: true, ultimo: null, tab: 'cabildo', formProy: false }
const FD_TABS = [['cabildo', 'Fondo del Cabildo'], ['fundadores', 'Fundadores'], ['proyectos', 'Proyectos'], ['socios', 'Socios'], ['como', '¿Cómo funciona?']]
const FD_SOCIO = 12, FD_QUORUM = 0.3
const FD_LOGOS = {
  tepuy: '<svg viewBox="0 0 40 40"><path d="M4 31h32L27 15l-4 6-5-10z" fill="#fff"/><path d="M18 11l5 10-3 4-4-7z" fill="#fff" opacity=".55"/><circle cx="31" cy="9" r="3" fill="#fde68a"/></svg>',
  avila: '<svg viewBox="0 0 40 40"><ellipse cx="20" cy="20" rx="10" ry="14" fill="#fff" transform="rotate(30 20 20)"/><path d="M14 9c6 6 6 16 12 22" stroke="#7c2d12" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>',
  orinoco: '<svg viewBox="0 0 40 40"><path d="M3 24c6-6 11 6 17 0s11-6 17 0" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M3 15c6-6 11 6 17 0s11-6 17 0" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity=".6"/></svg>',
}
const FD_BASE = (document.currentScript?.src || '/ux2/ux2.js').replace(/ux2\.js.*$/, '')
const fdLogo = m => m.logo ? `<img src="${FD_BASE + m.logo}" alt="${esc(m.nombre)}">` : (FD_LOGOS[m.id] || FD_LOGOS.orinoco)
const FD_MARCAS = {
  // Marcas de ejemplo de la simulación (logos en ux2/marcas/). Sin frases: no se les atribuye nada que no dijeron.
  airtm: { id: 'airtm', nombre: 'Airtm', logo: 'marcas/airtm.jpg', color: '#0b0b12', color2: '#3b2f7a' },
  frescolita: { id: 'frescolita', nombre: 'Frescolita', logo: 'marcas/frescolita.jpg', color: '#d9184a', color2: '#f0476f' },
  orinoco: { id: 'orinoco', nombre: 'Orinoco', color: '#1d4ed8', color2: '#38bdf8', frase: 'Donde se juntan los ríos.' },
}
const FD_TRAMOS = [
  [10000, '🛡️', 'Infraestructura y seguridad', 'Servidores, verificación y auditorías de seguridad por 12 meses.'],
  [20000, '📱', 'App nativa', 'Cabildo en iOS y Android, con notificaciones para cada votación.'],
  [30000, '🔎', 'Auditoría independiente', 'Una auditoría externa del secreto del voto, publicada completa.'],
]
const FD_NIVELES = [
  ['Fundadora', 10000, 'Logo grande en la franja, en la página de Funding y en los posts de X del mes.'],
  ['Aliada', 5000, 'Logo en la franja y en la lista de marcas que auspician.'],
  ['Amiga', 1000, 'Nombre en la franja y en la lista de marcas.'],
]
const FD_PASOS = ['Propuesta', 'Debate', 'Votación', 'Financiando', 'Financiado']
const FD_ESTADO = {
  debate: [1, 'Debate de socios', 'deb'], votacion: [2, 'Votación de socios', 'vot'], financiando: [3, 'Financiando', 'fin'],
  financiado: [4, 'Financiado', 'ok'], devuelto: [3, 'No llegó · se devolvió', 'dev'], rechazado: [2, 'No aprobado', 'dev'],
}
const fd$ = n => '$' + Math.round(n).toLocaleString('es-VE')
const fdK = n => n >= 1000 ? '$' + (n / 1000).toLocaleString('es-VE', { maximumFractionDigits: 1 }) + 'K' : fd$(n)
const fdFecha = ms => new Date(ms).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })
function fdFalta(ms) {
  const s = Math.max(0, Math.floor((ms - Date.now()) / 1000)), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60)
  return d ? `${d} ${d === 1 ? 'día' : 'días'}` : h ? `${h} h ${m} min` : `${m} min`
}
const fdPct = (n, t) => (t ? n / t * 100 : 0).toLocaleString('es-VE', { maximumFractionDigits: 1 }) + '%'

// ── Datos de ejemplo (siempre los mismos, para que la demo se vea igual cada vez)
function fdRnd(seed) { let s = seed; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648 }
function fdAportes(rnd, n, dias, montos) {
  const ahora = Date.now(), out = []
  for (let i = 0; i < n; i++) out.push({ butaca: 1 + Math.floor(rnd() * 1068), monto: montos[Math.floor(rnd() * montos.length)], anonima: rnd() < 0.28, at: ahora - Math.floor(Math.pow(rnd(), 1.6) * dias * 864e5) })
  return out.sort((a, b) => b.at - a.at)
}
function fdSimular() {
  const rnd = fdRnd(20261014), ahora = Date.now()
  const chicos = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 5, 5, 5, 5, 10, 10, 25]
  const marca = (id, nivel, monto) => ({ ...FD_MARCAS[id], nivel, monto })
  return {
    meta: fd.cfg?.meta || 30000, cierra: ahora + 23 * 864e5 + 7 * 36e5,
    marcas: [marca('airtm', 'Fundadora', 10000), marca('frescolita', 'Amiga', 1500)],
    aportes: fdAportes(rnd, 742, 21, chicos),
    socios: 214,
    yo: { aportado: 7, socioHasta: null },
    proyectos: [
      { id: 'monumento', titulo: 'Monumento a los presos políticos', lugar: 'Plaza Altamira, Caracas', estado: 'financiando',
        texto: 'Una escultura en homenaje a quienes estuvieron presos por pensar distinto, con sus nombres grabados y un código QR a sus historias.',
        meta: 5000, cierra: ahora + 12 * 864e5, votacion: { si: 0.78, part: 0.64 }, comentarios: 57,
        marcas: [marca('frescolita', 'Amiga', 1000)], aportes: fdAportes(rnd, 380, 9, [1, 1, 1, 1, 5, 5, 10, 25]) },
      { id: 'biblioteca', titulo: 'Biblioteca digital de la Constitución', lugar: 'En línea, para todo el país', estado: 'votacion',
        texto: 'Una edición anotada y gratuita de la Constitución, con audio y lenguaje sencillo, para escuelas y liceos.',
        meta: 3000, votaCierra: ahora + 20 * 36e5, votaron: 0.41, comentarios: 34, marcas: [], aportes: [] },
      { id: 'kit', titulo: 'Kit legal para venezolanos en el exterior', lugar: 'Diáspora', estado: 'debate',
        texto: 'Guías y asesoría gratuita para trámites de documentos, apostillas y residencias en los 10 países con más venezolanos.',
        meta: 8000, votaAbre: ahora + 31 * 36e5, comentarios: 23, marcas: [], aportes: [] },
      { id: 'mural', titulo: 'Mural de la libertad', lugar: 'Maracaibo', estado: 'financiado',
        texto: 'Un mural de 40 metros pintado por artistas zulianos sobre la historia de la lucha democrática.',
        meta: 2500, votacion: { si: 0.84, part: 0.58 }, comentarios: 41, nota: 'Financiado en 9 días. Los artistas empiezan a pintar el 2 de noviembre.',
        marcas: [marca('airtm', 'Amiga', 500)], aportes: fdAportes(rnd, 236, 30, [1, 1, 5, 5, 10, 10, 25]), ajustarMeta: true },
      { id: 'radio', titulo: 'Radio comunitaria', lugar: 'Mérida', estado: 'devuelto',
        texto: 'Una radio por internet con programas hechos por los vecinos.',
        meta: 6000, votacion: { si: 0.61, part: 0.37 }, comentarios: 18, devuelto: { monto: 1240, aportantes: 96 }, marcas: [], aportes: [] },
    ],
  }
}
const fdMuroDe = d => { fdFundadoresArmar(d, fdRnd(4242)); fdMuroArmar(d, fdRnd(777)); return d }
const fdAjustar = d => { d.proyectos.filter(p => p.ajustarMeta).forEach(p => { p.meta = Math.floor(fdTotales(p).total / 100) * 100 }); return d }
const fdTotales = d => {
  const marcas = (d.marcas || []).reduce((n, m) => n + m.monto, 0), butacas = (d.aportes || []).reduce((n, a) => n + a.monto, 0)
  return { marcas, butacas, total: marcas + butacas, aportantes: new Set((d.aportes || []).map(a => a.anonima ? 'a' + a.at + a.butaca : a.butaca)).size }
}
const fdSoySocio = () => !!fd.d?.yo?.socioHasta && fd.d.yo.socioHasta > Date.now()

function fdConfig(cfg) {
  const antes = fd.cfg
  fd.cfg = cfg || null
  if (!fd.cfg?.activo || antes?.simulado !== fd.cfg?.simulado || antes?.meta !== fd.cfg?.meta) { fd.d = null; salirFunding() }
  const li = $('#nav a[data-sec="funding"]')?.parentElement; if (li) li.hidden = FUNDING_ABIERTO && !fd.cfg?.activo   // fuera de dev se ve siempre, como «pronto»
  if (FUNDING_ABIERTO && vistaActual() === 'funding') entrarFunding()
  if (vistaActual() === 'aprende' && $('#modal-leccion')?.hidden) {   // la lección de Funding depende de esta configuración
    pintarAprende(); const id = location.hash.startsWith('#aprende/') ? location.hash.slice(9) : ''; if (id) abrirLeccion(id)
  }
}

function entrarFunding(arg) {
  if (arg && FD_TABS.some(([k]) => k === arg)) fd.tab = arg
  if (fd.cfg?.activo && !fd.d) fd.d = fd.cfg.simulado ? fdMuroDe(fdAjustar(fdSimular()))
    : fdMuroDe({ meta: fd.cfg.meta || 30000, cierra: null, marcas: [], aportes: [], socios: 0, yo: { aportado: 0, socioHasta: null }, proyectos: [] })
  pintarFunding()
  clearInterval(fd.vivo)
  if (fd.cfg?.activo && fd.cfg.simulado) fd.vivo = setInterval(() => { if (vistaActual() === 'funding' && document.visibilityState === 'visible') fdTick() }, 3200)
}
function salirFunding() { clearInterval(fd.vivo); fd.vivo = 0; fdCerrarFull() }

// Aportes en vivo de la simulación: al fondo y, cada tanto, al proyecto que se está financiando
function fdTick() {
  const montos = [1, 1, 1, 1, 1, 1, 5, 5, 10, 25]
  const a = { butaca: 1 + Math.floor(Math.random() * 1068), monto: montos[Math.floor(Math.random() * montos.length)], anonima: Math.random() < 0.25, at: Date.now() }
  const p = fd.d?.proyectos?.find(x => x.estado === 'financiando')
  if (p && ++fd.n % 3 === 0) { fdSumarAProyecto(p, a); return }
  fdSumarAlFondo(a)
}
function fdSumarAlFondo(a, pos) {
  const d = fd.d; if (!d) return
  a.color = a.color || FD_COLORES[Math.floor(Math.random() * FD_COLORES.length)]
  a.sym = a.sym || FD_SIMBOLOS[Math.floor(Math.random() * FD_SIMBOLOS.length)]
  fdRegistrar(d, a)
  if (d.muro) fdUbicar(d, a, pos)
  d.aportes.unshift(a); fd.nuevos.add(a); fd.ultimo = a
  setTimeout(() => fd.nuevos.delete(a), 2600)
  if (fd.tab === 'cabildo') fdActualizar(true); else fdRepintarTab()
}
function fdSumarAProyecto(p, a) {
  p.aportes.unshift(a); fd.nuevos.add(a); fd.ultimo = { ...a, proyecto: p.titulo }
  setTimeout(() => fd.nuevos.delete(a), 2600)
  const t = fdTotales(p)
  if (p.estado === 'financiando' && t.total >= p.meta) { p.estado = 'financiado'; p.nota = 'Financiado. El equipo del proyecto publica los avances acá.'; if (fd.tab === 'proyectos') aviso(`🎉 «${p.titulo}» llegó a la meta`) }
  fdRepintarTab(p.id)
}

// Mi aporte (simulado): suma a mi acumulado del año y, al llegar a $12, me hace socio por 12 meses
function fdMiAporte(monto, p) {
  const d = fd.d, yo = d.yo, eraSocio = fdSoySocio(), sinFundador = !p && !fdMiFundador()
  const a = { butaca: estado.butaca || 250, monto, anonima: !fd.mostrarme, vos: true, at: Date.now(), color: fd.sel.color, sym: fd.sel.sym }
  yo.aportado += monto
  if (!eraSocio && yo.aportado >= FD_SOCIO) { yo.socioHasta = Date.now() + 365 * 864e5; d.socios++ }
  if (p) fdSumarAProyecto(p, a); else { fdSumarAlFondo(a, fd.sel.pos); fd.sel.pos = null; fd.sel.eligiendo = false; const ed = $('.fd-muro-wrap'); if (ed) { ed.outerHTML = fdMuroHTML(); fdMuroDibujar() } }
  if (sinFundador && fdMiFundador()) fdVerFundador(fdMiFundador(), true)
  if (!eraSocio && fdSoySocio()) { aviso('★ ¡Ya sos socio del Cabildo! Ahora podés proponer y votar proyectos.'); const f = fd.formProy && $('#fd-pf-tit') ? null : 1; if (f) pintarFunding(); else fdRepintarTab() }
  else if (!sinFundador || p) aviso(p ? `Así se vería tu aporte de ${fd$(monto)} a «${p.titulo}» (simulación: no se cobró nada)` : `🧱 Sumaste otro lugar en el Muro del Cabildo (simulación: no se cobró nada)`)
}

// ══ El Muro del Cabildo ══
// Como "The Million Dollar Homepage": cada aporte al Fondo gana un lugar para siempre en el muro.
// Tamaño según el aporte ($1 = 1 casillero, $5 = 2×2, $10 = 3×3, $25 = 5×5). Quien aporta elige color,
// símbolo y dónde va. Sin texto libre ni imágenes: solo colores y símbolos de una lista (nada que moderar).
// El muro muestra la butaca solo si eligió mostrarse; si no, "Butaca anónima".
const FD_MURO = { cols: 96, rows: 40 }
const FD_COLORES = ['#f5b942', '#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#ec4899', '#14b8a6', '#f97316', '#facc15', '#f8fafc', '#0ea5e9', '#84cc16']
const FD_SIMBOLOS = ['🇻🇪', '⭐', '❤️', '🕊️', '✊', '🌎', '🔥', '📚', '🌻', '⚡', '🎶', '🏔️']
const FD_TAMANOS = [[1, 1], [5, 2], [10, 3], [25, 5]]
const fdTam = monto => monto >= 25 ? 5 : monto >= 10 ? 3 : monto >= 5 ? 2 : 1
fd.sel = { monto: 5, color: '#f5b942', sym: '🇻🇪', pos: null, eligiendo: false }

function fdMuroArmar(d, rnd) {
  d.muro = { occ: new Int32Array(FD_MURO.cols * FD_MURO.rows).fill(-1), bloques: [], ocupados: 0 }
  // del más viejo al más nuevo; los grandes se ubican primero para que entren
  const orden = [...d.aportes].reverse()
  orden.filter(a => fdTam(a.monto) > 1).concat(orden.filter(a => fdTam(a.monto) === 1)).forEach(a => {
    a.color = a.color || FD_COLORES[Math.floor(rnd() * FD_COLORES.length)]
    a.sym = a.sym || FD_SIMBOLOS[Math.floor(rnd() * FD_SIMBOLOS.length)]
    fdUbicar(d, a, null, rnd)
  })
}
function fdLibre(d, x, y, w) {
  if (x < 0 || y < 0 || x + w > FD_MURO.cols || y + w > FD_MURO.rows) return false
  for (let j = y; j < y + w; j++) for (let i = x; i < x + w; i++) if (d.muro.occ[j * FD_MURO.cols + i] !== -1) return false
  return true
}
// Ubica un aporte: en el lugar pedido si está libre; si no, en uno libre (al azar o el más cercano al pedido)
function fdUbicar(d, a, pos, rnd = Math.random) {
  const w = fdTam(a.monto), C = FD_MURO.cols, R = FD_MURO.rows
  let lugar = pos && fdLibre(d, pos.x, pos.y, w) ? pos : null
  if (!lugar && pos) { // el más cercano a donde quería
    let mejor = null, dist = 1e9
    for (let y = 0; y <= R - w; y++) for (let x = 0; x <= C - w; x++) { const dd = (x - pos.x) ** 2 + (y - pos.y) ** 2; if (dd < dist && fdLibre(d, x, y, w)) { dist = dd; mejor = { x, y } } }
    lugar = mejor
  }
  for (let k = 0; !lugar && k < 500; k++) { const x = Math.floor(rnd() * (C - w + 1)), y = Math.floor(rnd() * (R - w + 1)); if (fdLibre(d, x, y, w)) lugar = { x, y } }
  if (!lugar) for (let y = 0; !lugar && y <= R - w; y++) for (let x = 0; x <= C - w; x++) if (fdLibre(d, x, y, w)) { lugar = { x, y }; break }
  if (!lugar) return false   // el muro está lleno
  const idx = d.muro.bloques.push(a) - 1
  a.cel = { x: lugar.x, y: lugar.y, w }
  for (let j = lugar.y; j < lugar.y + w; j++) for (let i = lugar.x; i < lugar.x + w; i++) d.muro.occ[j * C + i] = idx
  d.muro.ocupados += w * w
  return true
}

function fdMuroHTML() {
  const s = fd.sel
  return `<div class="fd-lupa-cuerpo fd-muro-wrap">
    <header><div><b>El Muro de los Fundadores</b><small>Aportá desde $1: recibís tu Fundador (un avatar único) y su lugar para siempre en el muro. Elegí el tamaño y dónde va.</small></div>
      <div class="fd-muro-der"><span id="fd-muro-n"></span><button class="fd-expand" data-fd="full" title="Ver el muro en pantalla completa" aria-label="Ver el muro en pantalla completa"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg> Pantalla completa</button></div></header>
    <div class="fd-muro-lienzo" id="fd-muro-lienzo">
      <canvas id="fd-muro-canvas" aria-label="Muro del Cabildo: cada casillero es una butaca que aportó"></canvas>
      <div class="fd-fantasma" id="fd-fantasma" hidden></div>
      <div class="fd-muro-tip" id="fd-muro-tip" hidden></div>
    </div>
    <div class="fd-editor" id="fd-editor">${fdEditorHTML()}</div>
  </div>`
}

function fdEditorHTML() {
  const s = fd.sel
  return `      <div class="fd-ed-grupo"><small>Tamaño</small><div class="fd-ed-tam">${FD_TAMANOS.map(([m, w]) => `<button class="${s.monto === m ? 'on' : ''}" data-fd-tam="${m}"><i style="--w:${w}"></i><b>${fd$(m)}</b><span>${w}×${w}</span></button>`).join('')}</div></div>
      <div class="fd-ed-grupo fd-ed-yo"><small>Tu Fundador</small>${fdMiFundador() ? `<button class="fd-ed-av" data-fd-ficha="${fdMiFundador().butaca}"><img src="${fdUrl(fdAvatar(fdMiFundador().seed))}" alt=""><span><b>${fdNum(fdMiFundador().num)}</b><small>Ver ficha</small></span></button>` : '<div class="fd-ed-av sorpresa"><span class="fd-ed-q">?</span><span><b>Sorpresa</b><small>Se revela con tu primer aporte</small></span></div>'}</div>
      <div class="fd-ed-acc">
        <button class="btn fd-ed-lugar ${s.eligiendo ? 'on' : ''}" data-fd="elegir-lugar">${s.eligiendo ? 'Tocá un lugar libre del muro' : s.pos ? '📍 Lugar elegido · cambiar' : '📍 Elegir dónde va'}</button>
        <button class="btn btn-accent" data-fd="muro-aportar">Aportar ${fd$(s.monto)} y ocupar mi lugar</button>
      </div>`
}

// Dibuja el muro en un lienzo (el de la página o el de pantalla completa)
function fdPintarMuro(cv, cont) {
  const d = fd.d; if (!cv || !cont || !d?.muro) return
  // Se trabaja en píxeles CSS (los marcos se posicionan así) y se dibuja a la resolución real de la pantalla
  // (la página usa zoom en escritorio: getBoundingClientRect devuelve el tamaño ya escalado).
  const W = cv.clientWidth || cont.clientWidth, cel = W / FD_MURO.cols, H = cel * FD_MURO.rows
  const k = (cv.getBoundingClientRect().width || W) / W * (window.devicePixelRatio || 1)
  cv.width = Math.round(W * k); cv.height = Math.round(H * k)
  const g = cv.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0); g.clearRect(0, 0, W, H)
  const gap = cel > 6 ? 1 : 0.5
  g.fillStyle = 'rgba(255,255,255,.055)'
  for (let y = 0; y < FD_MURO.rows; y++) for (let x = 0; x < FD_MURO.cols; x++) if (d.muro.occ[y * FD_MURO.cols + x] === -1) g.fillRect(x * cel + gap / 2, y * cel + gap / 2, cel - gap, cel - gap)
  g.imageSmoothingEnabled = false
  for (const a of d.muro.bloques) {
    const { x, y, w } = a.cel, px = x * cel + gap / 2, py = y * cel + gap / 2, lado = w * cel - gap, f = d.fund.get(a.butaca)
    if (f) g.drawImage(fdAvatar(f.seed).cv, px, py, lado, lado); else { g.fillStyle = a.color; g.fillRect(px, py, lado, lado) }
    if (f && (f.socio || (f.vos && fdSoySocio())) && lado >= 12) { g.strokeStyle = '#f5b942'; g.lineWidth = Math.max(1.5, lado / 14); g.strokeRect(px + g.lineWidth / 2, py + g.lineWidth / 2, lado - g.lineWidth, lado - g.lineWidth) }
  }
  const marco = (a, cls) => { const e = document.createElement('div'); e.className = cls
    Object.assign(e.style, { left: a.cel.x * cel + 'px', top: a.cel.y * cel + 'px', width: a.cel.w * cel + 'px', height: a.cel.w * cel + 'px' }); cont.appendChild(e); return e }
  cont.querySelectorAll('.fd-mio').forEach(e => e.remove())
  d.muro.bloques.filter(a => a.vos).forEach(a => marco(a, 'fd-mio' + (fd.nuevos.has(a) ? ' nueva' : '')))          // tus lugares
  d.muro.bloques.filter(a => fd.nuevos.has(a) && !a.vos).forEach(a => { const e = marco(a, 'fd-mio destello'); setTimeout(() => e.remove(), 1600) })   // los que acaban de llegar
}
function fdMuroDibujar() {
  const d = fd.d; if (!d?.muro) return
  fdPintarMuro($('#fd-muro-canvas'), $('#fd-muro-lienzo'))
  const cap = FD_MURO.cols * FD_MURO.rows, n = $('#fd-muro-n')
  if (n) n.innerHTML = `${fmtNum(d.muro.bloques.length)} aportes · <b>${fmtNum(cap - d.muro.ocupados)}</b> lugares libres`
  fdFantasma()
  if ($('#fd-full')) fdPintarFull()
}

// ── Muro en pantalla completa: todo el muro grande + los últimos Fundadores, en vivo
function fdAbrirFull() {
  const d = fd.d; if (!d?.muro || $('#fd-full')) return
  const m = document.createElement('div'); m.id = 'fd-full'; m.className = 'fd-full'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', 'Muro de los Fundadores en pantalla completa')
  m.innerHTML = `<header class="fd-full-cab">
      <div><small class="fd-kicker">Edición ${FD_ED}</small><h2>El Muro de los Fundadores</h2></div>
      <div class="fd-full-stats" id="fd-full-stats"></div>
      <span class="fd-vivo" id="fd-full-vivo"></span>
      <button class="fd-full-x" data-fd-full="cerrar" aria-label="Salir de pantalla completa">✕</button>
    </header>
    <div class="fd-full-cuerpo">
      <div class="fd-full-lienzo" id="fd-full-lienzo"><canvas id="fd-full-canvas"></canvas><div class="fd-muro-tip" id="fd-full-tip" hidden></div></div>
      <aside class="fd-full-lado"><b>Últimos fundadores</b><div id="fd-full-ult"></div></aside>
    </div>
    <footer class="fd-full-pie">Pasá el cursor por el muro para ver a cada Fundador · Borde dorado = socio · Cada aporte desde $1 queda para siempre</footer>`
  document.body.appendChild(m); document.body.style.overflow = 'hidden'
  m.requestFullscreen?.().catch(() => {})
  requestAnimationFrame(fdPintarFull)
}
function fdCerrarFull() {
  const m = $('#fd-full'); if (!m) return
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  m.remove(); document.body.style.overflow = ''
}
function fdPintarFull() {
  const d = fd.d, m = $('#fd-full'); if (!m || !d?.muro) return
  // el lienzo entra entero en la pantalla, respetando la proporción 96:40
  const cont = $('#fd-full-lienzo'), cv = $('#fd-full-canvas'), caja = cont.parentElement   // medidas en píxeles CSS
  const ladoW = $('.fd-full-lado').offsetWidth ? $('.fd-full-lado').offsetWidth + 16 : 0
  const W = Math.min(caja.clientWidth - ladoW, caja.clientHeight * FD_MURO.cols / FD_MURO.rows)
  cont.style.width = Math.max(240, W) + 'px'
  fdPintarMuro(cv, cont)
  const lista = [...d.fund.values()], cap = FD_MURO.cols * FD_MURO.rows
  $('#fd-full-stats').innerHTML = `<span><b>${fmtNum(lista.length)}</b> fundadores</span><span><b>${fmtNum(lista.filter(f => fdAvatar(f.seed).tier[2] === 'leyenda').length)}</b> legendarios</span><span><b>${fmtNum(d.muro.bloques.length)}</b> aportes</span><span><b>${fmtNum(cap - d.muro.ocupados)}</b> lugares libres</span>`
  $('#fd-full-vivo').innerHTML = fdTicker()
  $('#fd-full-ult').innerHTML = lista.sort((a, b) => b.num - a.num).slice(0, 14).map(f => { const av = fdAvatar(f.seed); return `<button class="fd-full-f ${f.vos ? 'vos' : ''}" data-fd-ficha="${f.butaca}">
      <img src="${fdUrl(av)}" alt=""><span><b>${fdNum(f.num)}</b><small>${f.vos ? 'Vos' : f.anonima ? 'Anónima' : 'Butaca #' + f.butaca}</small></span><i class="fd-tier ${av.tier[2]}">${av.tier[0]}</i></button>` }).join('')
}

// Fantasma: muestra dónde iría tu lugar (verde si está libre, rojo si no)
function fdFantasma(ev) {
  const f = $('#fd-fantasma'), cv = $('#fd-muro-canvas'), s = fd.sel; if (!f || !cv) return
  const r = cv.getBoundingClientRect(), z = r.width / cv.clientWidth || 1, cel = cv.clientWidth / FD_MURO.cols, w = fdTam(s.monto)
  let pos = s.pos
  if (ev && s.eligiendo) { pos = { x: Math.min(FD_MURO.cols - w, Math.max(0, Math.floor((ev.clientX - r.left) / z / cel - w / 2 + .5))), y: Math.min(FD_MURO.rows - w, Math.max(0, Math.floor((ev.clientY - r.top) / z / cel - w / 2 + .5))) } }
  if (!pos || (!s.eligiendo && !s.pos)) { f.hidden = true; return }
  f.hidden = false; f.className = 'fd-fantasma' + (fdLibre(fd.d, pos.x, pos.y, w) ? '' : ' ocupado')
  Object.assign(f.style, { left: pos.x * cel + 'px', top: pos.y * cel + 'px', width: w * cel + 'px', height: w * cel + 'px', '--c': s.color })
  const mio = fdMiFundador()
  f.innerHTML = mio ? `<img src="${fdUrl(fdAvatar(mio.seed))}" alt="">` : (w > 1 ? '?' : '')
  f.style.fontSize = Math.floor(w * cel * 0.6) + 'px'
  return pos
}
function fdMuroTip(ev, cv = $('#fd-muro-canvas'), tip = $('#fd-muro-tip')) {
  const d = fd.d; if (!tip || !cv) return
  if (fd.sel.eligiendo && cv.id === 'fd-muro-canvas') { tip.hidden = true; return fdFantasma(ev) }
  const r = cv.getBoundingClientRect(), z = r.width / cv.clientWidth || 1, cel = cv.clientWidth / FD_MURO.cols
  const lx = (ev.clientX - r.left) / z, ly = (ev.clientY - r.top) / z, x = Math.floor(lx / cel), y = Math.floor(ly / cel)
  const i = x >= 0 && y >= 0 && x < FD_MURO.cols && y < FD_MURO.rows ? d.muro.occ[y * FD_MURO.cols + x] : -1
  if (i === -1) { tip.innerHTML = '<b>Lugar libre</b><small>Aportá y puede ser tuyo</small>' }
  else { const a = d.muro.bloques[i], f = d.fund.get(a.butaca), av = f && fdAvatar(f.seed)
    tip.innerHTML = `${f ? `<img src="${fdUrl(av)}" alt="">` : ''}<div><b>${f ? 'Fundador ' + fdNum(f.num) : ''}${f ? ` <span class="fd-tier ${av.tier[2]}">${av.tier[0]}</span>` : ''}</b><small>${a.vos ? 'Vos' : a.anonima ? 'Butaca anónima' : 'Butaca #' + a.butaca} · aportó ${fd$(a.monto)} · ${a.at > Date.now() - 6e4 ? 'recién' : haceCuanto(new Date(a.at).toISOString())}</small></div>` }
  tip.hidden = false
  tip.style.left = Math.min(lx + 14, cv.clientWidth - 250) + 'px'; tip.style.top = Math.max(0, ly - 52) + 'px'
}

// ══ Fundadores del Cabildo ══
// Quien aporta al Fondo anual recibe su Fundador: un avatar pixel art 24×24 único, numerado por orden de
// llegada (#0001 = el primero) y de la edición del año. Decisiones de Martín (15/10/2026):
//  · Registro propio del Cabildo + sello: cada año se publica la huella (SHA-256) del Libro en Bitcoin
//    con un sello de tiempo gratuito. Sin NFT, sin billeteras, sin exponer quién pagó.
//  · Sorpresa y uno por butaca y edición: los rasgos salen de la butaca (en la versión real, de un HMAC
//    del token de la butaca), no de lo que se paga. Aportar más no da más chances de uno raro.
//  · No se transfiere ni se vende: es un reconocimiento cívico.
// Rasgos sin símbolos partidarios ni caricaturas; pieles diversas. Los socios suman un marco dorado.
const FD_ED = 2026
const FD_R = {
  Fondo: [['Azul Caribe', '#6a8cc0', 30], ['Arena', '#e8c27a', 22], ['Rojo', '#d0655d', 18], ['Verde Selva', '#6fae7e', 18], ['Noche de Tepuy', 'noche', 8], ['Tricolor', 'tricolor', 4]],
  Tipo: [['Ciudadano', 0, 90], ['Jaguar', 1, 6], ['Guacamaya', 2, 3], ['Espíritu del Tepuy', 3, 1]],
  Pelo: [['Corto', 30], ['Rizado', 18], ['Afro', 12], ['Largo', 16], ['Moño', 10], ['Calvo', 8], ['Mohicano', 6]],
  Ojos: [['Normales', 60], ['Lentes', 18], ['Lentes de sol', 15], ['Lentes 3D', 4], ['Antifaz', 3]],
  Boca: [['Seria', 40], ['Sonrisa', 32], ['Bigote', 14], ['Barba', 14]],
  Cabeza: [['Ninguno', 55], ['Gorra tricolor', 12], ['Sombrero llanero', 12], ['Cintillo', 9], ['Corona de orquídeas', 7], ['Audífonos', 5]],
  Accesorio: [['Ninguno', 70], ['Pin del Cabildo', 15], ['Arete de oro', 10], ['Ocho estrellas', 5]],
}
const FD_PIELES = ['#f3d2b3', '#e0ac85', '#c68b5e', '#8d5a3b', '#5a3825'], FD_COLPELO = ['#1d1410', '#3b2414', '#6b4423', '#c9a24e', '#9a9a9a', '#b5402e']
const FD_ROPA = ['#2f5fb3', '#1f2937', '#cf3a3a', '#f6c445', '#3f7d4e', '#ffffff']
const FD_TIER = [['Común', 1200, 'comun'], ['Poco común', 6000, 'poco'], ['Raro', 55000, 'raro'], ['Legendario', Infinity, 'leyenda']]   // ≈ 60 % · 25 % · 12 % · 4 %
fd.av = new Map()
fd.lib = { tipo: 'Todos', orden: 'num', q: '', n: 96 }

function fdSemilla(str) { // xmur3 + mulberry32: mismo texto → mismo avatar, siempre
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19 }
  return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); let t = (h ^= h >>> 16) >>> 0
    t += 0x6D2B79F5; let r = Math.imul(t ^ t >>> 15, t | 1); r ^= r + Math.imul(r ^ r >>> 7, r | 61); return ((r ^ r >>> 14) >>> 0) / 4294967296 }
}
const fdElegir = (r, lista) => { let x = r() * lista.reduce((n, i) => n + i[i.length - 1], 0); for (const i of lista) { x -= i[i.length - 1]; if (x <= 0) return i } return lista[lista.length - 1] }

function fdAvatar(seed) {
  if (fd.av.has(seed)) return fd.av.get(seed)
  const r = fdSemilla(seed), cv = document.createElement('canvas'); cv.width = cv.height = 24
  const g = cv.getContext('2d'), R = (x0, y0, x1, y1, c) => { g.fillStyle = c; g.fillRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1) }, P = (x, y, c) => R(x, y, x, y, c)
  const fondo = fdElegir(r, FD_R.Fondo), tipo = fdElegir(r, FD_R.Tipo), ras = { Fondo: fondo[0], Tipo: tipo[0] }
  if (fondo[1] === 'noche') {
    R(0, 0, 23, 23, '#1d2350'); for (let i = 0; i < 9; i++) P(Math.floor(r() * 24), Math.floor(r() * 12), '#fff6c2')
    g.fillStyle = '#2c3a6e'; g.beginPath(); [[0, 24], [0, 17], [5, 14], [9, 16], [14, 13], [19, 16], [24, 15], [24, 24]].forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.fill()
  } else if (fondo[1] === 'tricolor') {
    R(0, 0, 23, 7, '#f6c445'); R(0, 8, 23, 15, '#2f5fb3'); R(0, 16, 23, 23, '#cf3a3a'); [[7, 9], [9, 8], [11, 8], [12, 8], [14, 8], [16, 9]].forEach(([x, y]) => P(x, y, '#ffffff'))
  } else R(0, 0, 23, 23, fondo[1])
  let piel = FD_PIELES[Math.floor(r() * FD_PIELES.length)]
  if (tipo[1] === 1) piel = '#d99a2b'; if (tipo[1] === 2) piel = '#d8352c'; if (tipo[1] === 3) piel = '#9fe0d0'
  const osc = '#' + [1, 3, 5].map(i => Math.max(0, parseInt(piel.slice(i, i + 2), 16) - 40).toString(16).padStart(2, '0')).join('')
  R(4, 21, 19, 23, FD_ROPA[Math.floor(r() * FD_ROPA.length)]); R(9, 18, 14, 21, piel)
  R(7, 6, 16, 18, piel); R(8, 5, 15, 5, piel); R(6, 9, 6, 15, piel); R(17, 9, 17, 15, piel)
  for (let y = 6; y < 19; y++) P(16, y, osc)
  if (tipo[1] === 1) { [[8, 8], [14, 7], [10, 15], [15, 12], [9, 12], [13, 16]].forEach(([x, y]) => P(x, y, '#3a2410')); R(7, 4, 8, 5, piel); R(15, 4, 16, 5, piel); P(11, 14, '#3a2410'); P(12, 14, '#3a2410') }
  if (tipo[1] === 2) { R(13, 11, 17, 13, '#f3e9d2'); P(17, 13, '#222'); R(7, 3, 9, 6, '#2f5fb3'); R(10, 2, 12, 5, '#f6c445') }
  if (tipo[1] === 3) for (let y = 6; y < 19; y += 3) P(8, y, '#ffffff')
  const pelo = tipo[1] === 0 ? fdElegir(r, FD_R.Pelo) : ['—'], cp = FD_COLPELO[Math.floor(r() * FD_COLPELO.length)]
  if (pelo[0] === 'Corto') { R(7, 4, 16, 6, cp); P(7, 7, cp); P(16, 7, cp) }
  else if (pelo[0] === 'Rizado') { for (let x = 6; x < 18; x += 2) R(x, 3, x + 1, 5, cp); R(6, 6, 6, 9, cp); R(17, 6, 17, 9, cp) }
  else if (pelo[0] === 'Afro') { R(4, 1, 19, 6, cp); R(4, 7, 6, 13, cp); R(17, 7, 19, 13, cp) }
  else if (pelo[0] === 'Largo') { R(6, 4, 17, 6, cp); R(5, 7, 6, 19, cp); R(17, 7, 18, 19, cp) }
  else if (pelo[0] === 'Moño') { R(7, 4, 16, 6, cp); R(10, 1, 13, 3, cp) }
  else if (pelo[0] === 'Mohicano') R(10, 0, 13, 6, cp)
  if (tipo[1] === 0) ras.Pelo = pelo[0]
  const ojos = fdElegir(r, FD_R.Ojos); ras.Ojos = ojos[0]
  if (ojos[0] === 'Normales') { P(9, 10, '#1b1b1b'); P(14, 10, '#1b1b1b'); P(9, 9, '#ffffff'); P(14, 9, '#ffffff') }
  else if (ojos[0] === 'Lentes') { R(8, 9, 10, 11, '#222'); R(13, 9, 15, 11, '#222'); P(9, 10, '#bfe3ff'); P(14, 10, '#bfe3ff'); R(11, 10, 12, 10, '#222') }
  else if (ojos[0] === 'Lentes de sol') { R(7, 9, 16, 9, '#111'); R(8, 10, 10, 11, '#111'); R(13, 10, 15, 11, '#111') }
  else if (ojos[0] === 'Lentes 3D') { R(7, 9, 16, 9, '#eee'); R(8, 10, 10, 11, '#e63946'); R(13, 10, 15, 11, '#3a86ff') }
  else if (ojos[0] === 'Antifaz') { R(7, 9, 16, 11, '#111'); P(9, 10, '#fff'); P(14, 10, '#fff') }
  const boca = fdElegir(r, FD_R.Boca); ras.Boca = tipo[1] === 2 ? 'Pico' : boca[0]
  if (tipo[1] !== 2) {
    if (boca[0] === 'Seria') R(10, 15, 13, 15, '#6b2b2b')
    else if (boca[0] === 'Sonrisa') { R(10, 15, 13, 15, '#6b2b2b'); P(9, 14, '#6b2b2b'); P(14, 14, '#6b2b2b') }
    else if (boca[0] === 'Bigote') { R(9, 14, 14, 14, cp); R(10, 16, 13, 16, '#6b2b2b') }
    else if (boca[0] === 'Barba') { R(7, 15, 16, 18, cp); R(10, 15, 13, 15, '#6b2b2b') }
  }
  const cab = fdElegir(r, FD_R.Cabeza); ras.Cabeza = cab[0]
  if (cab[0] === 'Gorra tricolor') { R(7, 3, 16, 3, '#f6c445'); R(7, 4, 16, 4, '#2f5fb3'); R(7, 5, 18, 5, '#cf3a3a') }
  else if (cab[0] === 'Sombrero llanero') { R(4, 5, 19, 5, '#c8a96a'); R(7, 1, 16, 4, '#c8a96a'); R(7, 4, 16, 4, '#5a3a1e') }
  else if (cab[0] === 'Cintillo') R(7, 6, 16, 6, '#e63946')
  else if (cab[0] === 'Corona de orquídeas') [7, 10, 13, 16].forEach(x => { P(x, 4, '#c77dff'); P(x, 5, '#f5e663') })
  else if (cab[0] === 'Audífonos') { R(5, 8, 6, 12, '#222'); R(17, 8, 18, 12, '#222'); R(6, 3, 17, 3, '#222') }
  const acc = fdElegir(r, FD_R.Accesorio); ras.Accesorio = acc[0]
  if (acc[0] === 'Pin del Cabildo') R(6, 21, 7, 22, '#f5b942')
  else if (acc[0] === 'Arete de oro') { P(6, 13, '#f5b942'); P(6, 14, '#f5b942') }
  else if (acc[0] === 'Ocho estrellas') for (let x = 5; x < 19; x += 2) P(x, 22, '#ffffff')
  // rareza = producto de las probabilidades de cada rasgo
  let p = 1
  for (const k of ['Fondo', 'Tipo', 'Ojos', 'Boca', 'Cabeza', 'Accesorio']) {
    const l = FD_R[k], it = l.find(i => i[0] === ras[k]); if (!it) continue
    p *= it[it.length - 1] / l.reduce((n, i) => n + i[i.length - 1], 0)
  }
  const uno = Math.round(1 / p), tier = tipo[1] === 3 ? FD_TIER[3] : FD_TIER.find(t => uno < t[1])
  const av = { cv, ras, uno, tier, url: null }
  fd.av.set(seed, av); return av
}
const fdUrl = av => av.url || (av.url = av.cv.toDataURL())
const fdNum = n => '#' + String(n).padStart(4, '0')

// Libro: un Fundador por butaca, numerado por orden de su primer aporte al Fondo en la edición
function fdRegistrar(d, a) {
  if (d.fund.has(a.butaca)) return null
  const f = { num: d.fund.size + 1, butaca: a.butaca, anonima: a.anonima, at: a.at, vos: !!a.vos, seed: `${FD_ED}-butaca-${a.butaca}`, socio: false }
  d.fund.set(a.butaca, f); return f
}
function fdFundadoresArmar(d, rnd) {
  d.fund = new Map()
  const yo = estado.butaca || 250
  d.aportes.forEach(a => { if (!a.vos && a.butaca === yo) a.butaca = yo % 1068 + 1 })   // en la demo, "vos" todavía no aportaste
  ;[...d.aportes].sort((a, b) => a.at - b.at).forEach(a => fdRegistrar(d, a))
  const lista = [...d.fund.values()]
  for (let i = 0; i < Math.min(d.socios, lista.length); i++) lista[Math.floor(rnd() * lista.length)].socio = true
}
const fdMiFundador = () => fd.d?.fund?.get(estado.butaca || 250) || null

// Revelado (y ficha): los píxeles aparecen de a poco y después los rasgos
function fdVerFundador(f, revelar) {
  const av = fdAvatar(f.seed)
  $('#fd-rev')?.remove()
  const m = document.createElement('div'); m.id = 'fd-rev'; m.className = 'fd-rev' + (revelar ? ' revelando' : ''); m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true')
  m.innerHTML = `<div class="fd-rev-caja">
    <button class="fd-rev-x" data-fd-rev="cerrar" aria-label="Cerrar">✕</button>
    <small class="fd-kicker">Fundadores del Cabildo · Edición ${FD_ED}</small>
    <h2>${revelar ? `¡Sos el Fundador ${fdNum(f.num)}!` : `Fundador ${fdNum(f.num)}`}</h2>
    <div class="fd-rev-arte ${f.socio || (f.vos && fdSoySocio()) ? 'socio' : ''}"><canvas width="24" height="24" id="fd-rev-cv"></canvas></div>
    <div class="fd-rev-datos">
      <span class="fd-tier ${av.tier[2]}">${av.tier[0]}</span><span class="fd-rev-uno">1 de cada ${fmtNum(av.uno)}</span>
      <dl>${Object.entries(av.ras).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      <p class="fd-rev-meta">${f.vos ? 'Tu butaca' : f.anonima ? 'Butaca anónima' : 'Butaca #' + f.butaca} · desde el ${new Date(f.at).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}${f.socio || (f.vos && fdSoySocio()) ? ' · <b>★ Socio</b>' : ''}</p>
      <p class="fd-rev-nota">Queda para siempre en el Libro de Fundadores. Es tuyo: no se vende ni se transfiere.</p>
      <div class="fd-rev-acc">${revelar ? '<button class="btn btn-accent" data-fd-rev="libro">Verme en el Libro</button>' : ''}<button class="btn btn-ghost" data-fd-rev="cerrar">${revelar ? 'Seguir' : 'Cerrar'}</button></div>
    </div></div>`
  ;($('#fd-full') || document.body).appendChild(m)   // dentro de la pantalla completa si está abierta
  const g = $('#fd-rev-cv').getContext('2d')
  if (!revelar || matchMedia('(prefers-reduced-motion: reduce)').matches) { g.drawImage(av.cv, 0, 0); m.classList.remove('revelando'); return }
  const px = [...Array(576).keys()].sort(() => Math.random() - .5), datos = av.cv.getContext('2d').getImageData(0, 0, 24, 24).data
  let i = 0
  const paso = () => {
    for (let k = 0; k < 20 && i < 576; k++, i++) { const p = px[i], o = p * 4; g.fillStyle = `rgb(${datos[o]},${datos[o + 1]},${datos[o + 2]})`; g.fillRect(p % 24, Math.floor(p / 24), 1, 1) }
    if (i < 576) requestAnimationFrame(paso); else setTimeout(() => m.classList.remove('revelando'), 150)
  }
  requestAnimationFrame(paso)
}

// ── Pestaña: Fundadores (el Libro)
function fdTabFundadores() {
  const d = fd.d, lista = [...d.fund.values()], mio = fdMiFundador()
  const leyendas = lista.filter(f => fdAvatar(f.seed).tier[2] === 'leyenda').length
  return `<section class="fd-libro-hero">
      <span class="fd-kicker">Libro de Fundadores · Edición ${FD_ED}</span>
      <h2 class="fd-titulo">Quien sostiene el Cabildo <em>queda para siempre.</em></h2>
      <p>Cada butaca que aporta al Fondo del año recibe su Fundador: un avatar único, numerado por orden de llegada. Sale sorpresa y no depende de cuánto aportes.</p>
      <div class="fd-stats"><div><b>${fmtNum(lista.length)}</b><small>fundadores</small></div><div><b>${leyendas}</b><small>legendarios</small></div>
        <div><b>${mio ? fdNum(mio.num) : '—'}</b><small>${mio ? 'tu número' : 'todavía no sos fundador'}</small></div></div>
      <div class="fd-sello"><span>🔏</span><div><b>Huella del Libro (SHA-256)</b><code id="fd-huella">calculando…</code>
        <small>Cada 1° de enero esta huella se sella en Bitcoin con un sello de tiempo gratuito. Así cualquiera puede comprobar que el Libro nunca se modificó, sin billeteras ni NFT.${fd.cfg.simulado ? ' (Simulación: el sello real empieza con los pagos.)' : ''}</small></div></div>
    </section>
    ${mio ? '' : `<div class="fd-yo"><span class="fd-yo-ico">?</span><div><b>Tu Fundador te está esperando</b><small>Con tu primer aporte al Fondo, desde $1, se revela tu avatar y tu número.</small></div><button class="btn btn-accent" data-fd-tab="cabildo">Aportar al Fondo</button></div>`}
    <div class="fd-lib-filtros">
      <div class="fd-chips">${['Todos', ...FD_R.Tipo.map(t => t[0])].map(t => `<button class="${fd.lib.tipo === t ? 'on' : ''}" data-fd-lib-tipo="${t}">${t}</button>`).join('')}</div>
      <select id="fd-lib-orden" aria-label="Ordenar"><option value="num" ${fd.lib.orden === 'num' ? 'selected' : ''}>Por número</option><option value="raros" ${fd.lib.orden === 'raros' ? 'selected' : ''}>Más raros primero</option></select>
      <input id="fd-lib-q" placeholder="Buscar #número" value="${esc(fd.lib.q)}" inputmode="numeric" autocomplete="off">
    </div>
    <div class="fd-libro" id="fd-libro"></div>`
}
function fdPintarLibro() {
  const box = $('#fd-libro'); if (!box) return
  let lista = [...fd.d.fund.values()]
  if (fd.lib.tipo !== 'Todos') lista = lista.filter(f => fdAvatar(f.seed).ras.Tipo === fd.lib.tipo)
  const q = fd.lib.q.replace(/\D/g, ''); if (q) lista = lista.filter(f => String(f.num).includes(String(Number(q))))
  lista.sort(fd.lib.orden === 'raros' ? (a, b) => fdAvatar(b.seed).uno - fdAvatar(a.seed).uno : (a, b) => a.num - b.num)
  const mio = fdMiFundador(); if (mio && fd.lib.orden === 'num' && !q && fd.lib.tipo === 'Todos') lista = [mio, ...lista.filter(f => f !== mio)]
  const vis = lista.slice(0, fd.lib.n)
  box.innerHTML = vis.length ? vis.map(f => { const av = fdAvatar(f.seed); return `<button class="fd-carta ${f.vos ? 'vos' : ''} ${f.socio || (f.vos && fdSoySocio()) ? 'socio' : ''}" data-fd-ficha="${f.butaca}">
      <img src="${fdUrl(av)}" alt="Fundador ${fdNum(f.num)}" loading="lazy"><b>${fdNum(f.num)}</b><span class="fd-tier ${av.tier[2]}">${av.tier[0]}</span>
      <small>${f.vos ? 'Vos' : f.anonima ? 'Anónima' : 'Butaca #' + f.butaca}</small></button>` }).join('')
    + (lista.length > vis.length ? `<button class="btn btn-ghost fd-mas-lib" data-fd="mas-libro">Ver más (${fmtNum(lista.length - vis.length)})</button>` : '')
    : '<p class="bq-vacio">No hay fundadores con ese filtro.</p>'
}
async function fdHuella() {
  const el = $('#fd-huella'); if (!el) return
  const txt = JSON.stringify([...fd.d.fund.values()].sort((a, b) => a.num - b.num).map(f => [FD_ED, f.num, f.seed, f.at]))
  try { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt)); el.textContent = [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('').replace(/^(.{16}).*(.{16})$/, '$1…$2') }
  catch (e) { el.textContent = 'no disponible en este navegador' }
}

// ── Pintado
function pintarFunding() {
  const c = $('#fd-cuerpo'); if (!c) return
  if (!fd.cfg?.activo) { c.innerHTML = `<div class="card au-vacio"><span class="au-vacio-ico"><svg viewBox="0 0 24 24">${ICONOS.funding}</svg></span><h3>Funding no está disponible</h3><p class="muted">Vuelve pronto.</p></div>`; return }
  if (!fd.d) { entrarFunding(); return }
  const vivos = fd.d.proyectos.filter(p => ['debate', 'votacion', 'financiando'].includes(p.estado)).length
  c.innerHTML = `<nav class="fd-tabs" role="tablist">${FD_TABS.map(([k, t]) => `<button role="tab" class="fd-tab ${fd.tab === k ? 'on' : ''}" aria-selected="${fd.tab === k}" data-fd-tab="${k}">${t}${k === 'proyectos' && vivos ? `<span>${vivos}</span>` : ''}${k === 'socios' && fdSoySocio() ? '<span class="oro">★</span>' : ''}</button>`).join('')}
    ${fd.cfg.simulado ? '<span class="fd-sim-chip" title="Montos, marcas, proyectos y aportes de ejemplo">● Simulación</span>' : ''}</nav>
    <div id="fd-tab"></div>`
  fdRepintarTab()
}
function fdRepintarTab(soloProyecto) {
  const box = $('#fd-tab'); if (!box || !fd.d) return
  if (fd.tab === 'proyectos') {
    if (soloProyecto && $(`#fd-p-${soloProyecto}`)) { $(`#fd-p-${soloProyecto}`).outerHTML = fdProyecto(fd.d.proyectos.find(p => p.id === soloProyecto)); return }
    if ($('#fd-proy-lista')) { $('#fd-proy-lista').innerHTML = fd.d.proyectos.map(fdProyecto).join(''); $('#fd-mi-socio').innerHTML = fdMiSocio(true); return }
    box.innerHTML = fdTabProyectos(); return
  }
  if (fd.tab === 'socios') { box.innerHTML = fdTabSocios(); return }
  if (fd.tab === 'como') { if (!$('.fd-como-hero')) box.innerHTML = fdTabComo(); return }
  if (fd.tab === 'fundadores') { if (!$('#fd-libro')) { box.innerHTML = fdTabFundadores(); fdPintarLibro(); fdHuella() } return }
  if (!$('#fd-franja')) { box.innerHTML = fdTabCabildo(); }
  fdActualizar(false)
}

function fdTicker() {
  const a = fd.ultimo || fd.d?.aportes?.[0]
  if (!a) return '<i></i> Esperando el primer aporte'
  if (a.marca) return `<i></i> <b>${esc(a.marca)}</b> se sumó como marca · ${fd$(a.monto)}`
  return `<i></i> ${a.vos ? '<b>Vos</b> aportaste' : `<b>${a.anonima ? 'Una butaca anónima' : 'Butaca #' + a.butaca}</b> aportó`} ${fd$(a.monto)}${a.proyecto ? ` a <b>${esc(a.proyecto)}</b>` : ''} · ${a.at > Date.now() - 6e4 ? 'recién' : haceCuanto(new Date(a.at).toISOString())}`
}

// Franja reutilizable: tramos de marcas + tramo de butacas + cursor + escala
function fdFranja({ meta, marcas, butacas, aportantes, anchoPx, alta, anim }) {
  const total = marcas.reduce((n, m) => n + m.monto, 0) + butacas, pct = Math.min(100, total / meta * 100)
  const cabe = w => anchoPx * w / 100 >= (alta ? 116 : 104)
  let x = 0
  const segs = marcas.map(m => {
    const w = Math.min(100 - x, m.monto / meta * 100), s = `<div class="fd-seg fd-seg-marca ${cabe(w) ? '' : 'chico'} ${m.nueva ? 'entra' : ''}" style="left:${x}%;width:${w}%;--c1:${m.color};--c2:${m.color2}" title="${esc(m.nombre)} · ${fd$(m.monto)}">
        <span class="fd-logo">${fdLogo(m)}</span><span class="fd-seg-txt"><b>${esc(m.nombre)}</b><small>${fdK(m.monto)}</small></span></div>`
    x += w; return s
  }).join('')
  const wB = Math.min(100 - x, butacas / meta * 100)
  return { pct, xB: x, wB, total, html: `<div class="fd-franja ${alta ? '' : 'mini'}" role="img" aria-label="${fd$(total)} de ${fd$(meta)}">
      ${segs}${butacas ? `<div class="fd-seg fd-seg-butacas ${anim ? 'pulso' : ''} ${cabe(wB) ? '' : 'chico'}" style="left:${x}%;width:${wB}%" title="${fmtNum(aportantes)} butacas · ${fd$(butacas)}"><span class="fd-seg-txt"><b>${fmtNum(aportantes)} butacas</b><small>${fdK(butacas)}</small></span></div>` : ''}
      <div class="fd-cursor" style="left:${pct}%"></div>
      ${alta ? [1, 2].map(k => `<i class="fd-marca-meta" style="left:${k / 3 * 100}%"></i>`).join('') : ''}
    </div>` }
}

// ── Pestaña: Fondo del Cabildo
function fdTabCabildo() {
  const sim = fd.cfg.simulado
  return `
    <section class="fd-hero">
      <div class="fd-hero-top">
        <span class="fd-kicker">Ronda fundacional del Cabildo</span>
        <button class="fd-como-link" data-fd-tab="como">¿Cómo funciona?</button>
        <span class="fd-vivo" id="fd-vivo">${fdTicker()}</span>
      </div>
      <h2 class="fd-titulo">Un Cabildo que se sostiene <em>con su gente.</em></h2>
      <div class="fd-numeros" id="fd-numeros"></div>
      <div class="fd-franja-wrap" id="fd-franja"></div>
      <div class="fd-lupa" id="fd-lupa"></div>
    </section>
    <div class="fd-grid">
      <article class="card fd-card fd-aportar">
        <h3>Aportá con tu butaca</h3>
        <p class="muted">Desde $1. Tu aporte aparece al instante en la franja y te da tu lugar en el <b>Muro del Cabildo</b>.</p>
        <div class="fd-montos">${[1, 5, 10, 25].map(m => `<button class="fd-monto" data-fd-aportar="${m}">${fd$(m)}</button>`).join('')}</div>
        <div id="fd-socio-mini">${fdSocioMini()}</div>
        <label class="fd-check"><input type="checkbox" class="fd-mostrarme" ${fd.mostrarme ? 'checked' : ''}><span>Mostrar mi número de butaca en la franja <small>Si no, aparecés como “Butaca anónima”.</small></span></label>
        ${sim ? '<p class="fd-nota">Simulación: los pagos todavía no están habilitados. Tocar un monto muestra cómo se vería tu aporte.</p>' : '<p class="fd-nota">Los pagos se habilitan pronto.</p>'}
      </article>
      <article class="card fd-card fd-marcas" id="fd-marcas"></article>
      <article class="card fd-card fd-tramos" id="fd-tramos"></article>
    </div>
    <article class="card fd-card fd-auspiciar">
      <div><h3>Auspiciar como marca</h3><p class="muted">Las marcas que creen en el Cabildo ocupan su tramo de la franja con su logo. Sin influencia en las votaciones: el voto es secreto y nadie puede comprarlo.</p></div>
      <div class="fd-niveles">${FD_NIVELES.map(([n, m, t]) => `<div class="fd-nivel"><b>${n}</b><span>${fd$(m)}</span><small>${t}</small></div>`).join('')}</div>
      ${sim ? '<button class="btn btn-dark" data-fd="marca">Simular una marca nueva</button>' : ''}
    </article>`
}
function fdSocioMini() {
  const yo = fd.d.yo
  if (fdSoySocio()) return `<div class="fd-socio-mini ok"><span>★</span><div><b>Sos socio hasta el ${fdFecha(yo.socioHasta)}</b><small>Proponés y votás los proyectos.</small></div><button class="bq-link" data-fd-tab="proyectos">Ver proyectos →</button></div>`
  const falta = Math.max(0, FD_SOCIO - yo.aportado)
  return `<div class="fd-socio-mini"><div class="fd-socio-barra"><i style="width:${Math.min(100, yo.aportado / FD_SOCIO * 100)}%"></i></div>
    <small>Aportaste <b>${fd$(yo.aportado)}</b> este año · te faltan <b>${fd$(falta)}</b> para ser <button class="bq-link" data-fd-tab="socios">socio</button></small></div>`
}

// Actualiza números, franja, lupa y tarjetas sin re-armar la vista (para que las animaciones se vean)
function fdActualizar(anim) {
  const d = fd.d; if (!d || !$('#fd-franja')) return
  const t = fdTotales(d), meta = d.meta
  const dias = d.cierra ? Math.max(0, Math.ceil((d.cierra - Date.now()) / 864e5)) : null
  const f = fdFranja({ meta, marcas: d.marcas, butacas: t.butacas, aportantes: t.aportantes, anchoPx: $('#fd-franja').clientWidth || 800, alta: true, anim })
  $('#fd-numeros').innerHTML = `
    <div class="fd-recaudado"><b>${fd$(t.total)}</b><span>recaudados de <strong>${fd$(meta)}</strong></span></div>
    <div class="fd-stats">
      <div><b>${fdPct(t.total, meta)}</b><small>de la meta</small></div>
      <div><b>${fmtNum(t.aportantes)}</b><small>butacas aportaron</small></div>
      <div><b>${fmtNum(d.socios)}</b><small>socios</small></div>
      <div><b>${d.marcas.length}</b><small>${d.marcas.length === 1 ? 'marca auspicia' : 'marcas auspician'}</small></div>
      ${dias != null ? `<div><b>${dias}</b><small>días restantes</small></div>` : ''}
    </div>`
  $('#fd-franja').innerHTML = `
    <div class="fd-hitos">${FD_TRAMOS.map(([m, ico, n]) => `<div class="fd-hito ${t.total >= m ? 'ok' : ''}" style="left:${m / meta * 100}%"><span>${t.total >= m ? '✓' : ico}</span><small>${n}</small></div>`).join('')}</div>
    ${f.html}
    <div class="fd-escala">${[0, 1, 2, 3].map(k => `<span style="left:${k / 3 * 100}%">${fdK(meta * k / 3)}</span>`).join('')}</div>`
  const emb = `<svg class="fd-embudo" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><path d="M${f.xB} 0 L${Math.min(100, f.xB + Math.max(f.wB, 0.6))} 0 L100 40 L0 40 Z"/></svg>`
  if (!$('#fd-muro-canvas')) $('#fd-lupa').innerHTML = `<div id="fd-embudo">${emb}</div>${fdMuroHTML()}`
  else $('#fd-embudo').innerHTML = emb
  fdMuroDibujar()
  $('#fd-marcas').innerHTML = `<h3>Marcas que auspician</h3>
    ${d.marcas.map(m => `<div class="fd-marca"><span class="fd-marca-logo" style="--c1:${m.color};--c2:${m.color2}">${fdLogo(m)}</span>
      <div><b>${esc(m.nombre)}</b><small>Marca ${m.nivel.toLowerCase()} · ${fd$(m.monto)}</small>${m.frase ? `<p>“${esc(m.frase)}”</p>` : ''}${fd.cfg?.simulado ? '<em class="fd-ej">Ejemplo de la simulación</em>' : ''}</div></div>`).join('')}
    <div class="fd-marca vacia"><span class="fd-marca-logo">+</span><div><b>Tu marca acá</b><small>Quedan ${fd$(Math.max(0, meta - t.total))} para completar la meta</small></div></div>`
  $('#fd-tramos').innerHTML = `<h3>Qué desbloquea cada tramo</h3>
    ${FD_TRAMOS.map(([m, ico, n, txt], i) => {
      const desde = i ? FD_TRAMOS[i - 1][0] : 0, p = Math.max(0, Math.min(100, (t.total - desde) / (m - desde) * 100))
      return `<div class="fd-tramo ${p >= 100 ? 'ok' : p > 0 ? 'en' : ''}"><span>${p >= 100 ? '✓' : ico}</span><div><b>${n} <small>${fdK(m)}</small></b><p>${txt}</p>
        <div class="fd-tramo-barra"><i style="width:${p}%"></i></div></div></div>`
    }).join('')}`
  const sm = $('#fd-socio-mini'); if (sm) sm.innerHTML = fdSocioMini()
  const tk = $('#fd-vivo'); if (tk) tk.innerHTML = fdTicker()
  if (anim) { const n = $('#fd-numeros .fd-recaudado b'); n?.classList.remove('sube'); void n?.offsetWidth; n?.classList.add('sube') }
}
const fdFicha = a => `<span class="fd-b m${a.monto >= 25 ? 3 : a.monto >= 5 ? 2 : 1} ${a.anonima ? 'anon' : ''} ${a.vos ? 'vos' : ''} ${fd.nuevos.has(a) ? 'nueva' : ''}" title="${a.anonima ? 'Butaca anónima' : 'Butaca #' + a.butaca} · ${fd$(a.monto)}">${a.vos ? 'Vos' : a.anonima ? '<svg viewBox="0 0 24 24"><rect x="6" y="11" width="12" height="9" rx="2"/><path d="M9 11V8a3 3 0 0 1 6 0v3"/></svg>' : '#' + a.butaca}${a.monto > 1 ? `<em>${fd$(a.monto)}</em>` : ''}</span>`

// ── Pestaña: Proyectos
function fdMiSocio(compacto) {
  const yo = fd.d.yo
  if (fdSoySocio()) return `<div class="fd-yo ok"><span class="fd-yo-ico">★</span><div><b>Sos socio del Cabildo</b><small>Hasta el ${fdFecha(yo.socioHasta)}. Podés proponer proyectos y votar en secreto cuáles se financian.</small></div>
    ${compacto ? '<button class="btn btn-dark" data-fd="proponer">+ Proponer un proyecto</button>' : ''}</div>`
  const falta = Math.max(0, FD_SOCIO - yo.aportado)
  return `<div class="fd-yo"><span class="fd-yo-ico">☆</span><div><b>Te faltan ${fd$(falta)} para ser socio</b><small>Con ${fd$(FD_SOCIO)} aportados en el año proponés y votás los proyectos. Aportar a un proyecto también suma.</small>
      <div class="fd-socio-barra"><i style="width:${Math.min(100, yo.aportado / FD_SOCIO * 100)}%"></i></div></div>
    <button class="btn btn-accent" data-fd-aportar="${falta}">Aportar ${fd$(falta)} y ser socio</button></div>`
}
function fdTabProyectos() {
  return `<div class="fd-proy-intro">
      <div><h2>Proyectos del Cabildo</h2><p class="muted">Los socios proponen y deciden en <b>votación secreta</b> qué se financia. Cuando un proyecto se aprueba, abre su propia meta y <b>todos pueden aportar</b>: cualquier butaca y cualquier marca. Si no llega a la meta a tiempo, se devuelve todo. <button class="bq-link" data-fd-tab="como">¿Cómo funciona?</button></p></div>
    </div>
    <div id="fd-mi-socio">${fdMiSocio(true)}</div>
    <div id="fd-proy-form">${fd.formProy ? fdFormProyecto() : ''}</div>
    <div class="fd-proy-lista" id="fd-proy-lista">${fd.d.proyectos.map(fdProyecto).join('')}</div>`
}
function fdFormProyecto() {
  return `<article class="card fd-card fd-form">
    <h3>Proponer un proyecto</h3><p class="muted">Se debate 48 horas entre los socios y después se vota en secreto. Si se aprueba, abre su meta para que aporten todos.</p>
    <label>Qué querés hacer<input id="fd-pf-tit" maxlength="80" placeholder="Ej.: Monumento a los presos políticos"></label>
    <label>Dónde<input id="fd-pf-lugar" maxlength="60" placeholder="Ej.: Plaza Altamira, Caracas"></label>
    <label>Por qué y cómo<textarea id="fd-pf-txt" rows="3" maxlength="400" placeholder="Contá en pocas líneas qué se hace con la plata y quién lo ejecuta."></textarea></label>
    <div class="fd-form-fila"><label>Meta (USD)<input id="fd-pf-meta" type="number" min="100" step="100" value="5000"></label>
      <label>Plazo para juntarla<select id="fd-pf-dias"><option value="15">15 días</option><option value="30" selected>30 días</option><option value="60">60 días</option></select></label></div>
    <div class="fd-form-acc"><button class="btn btn-ghost" data-fd="cancelar-proy">Cancelar</button><button class="btn btn-dark" data-fd="crear-proy">Proponer</button></div>
  </article>`
}
function fdProyecto(p) {
  const [paso, etq, cl] = FD_ESTADO[p.estado], socio = fdSoySocio(), sim = fd.cfg.simulado
  const pasos = `<ol class="fd-pasos ${cl}">${FD_PASOS.map((n, i) => `<li class="${i < paso || (i === paso && ['financiado'].includes(p.estado)) ? 'hecho' : i === paso ? 'ahora' : ''}"><i></i><span>${n}</span></li>`).join('')}</ol>`
  let cuerpo = ''
  if (p.estado === 'debate') cuerpo = `<div class="fd-p-info"><span>💬 <b>${p.comentarios}</b> comentarios de socios</span><span>🗳️ La votación abre en <b>${fdFalta(p.votaAbre)}</b></span></div>
      <div class="fd-p-acc">${socio ? '<button class="btn btn-ghost" data-fd-debate="1">Opinar en el debate</button>' : '<span class="fd-p-solo">🔒 El debate es entre socios</span>'}
        ${sim ? `<button class="bq-link" data-fd-sim="abrir" data-p="${p.id}">Simular: abrir la votación</button>` : ''}</div>`
  if (p.estado === 'votacion') cuerpo = `<div class="fd-p-voto">
      <div class="fd-p-part"><div><b>${fdPct(p.votaron, 1)}</b> de los socios ya votó <small>(mínimo ${Math.round(FD_QUORUM * 100)}% para que valga)</small></div>
        <div class="fd-part-barra"><i style="width:${p.votaron * 100}%"></i><em style="left:${FD_QUORUM * 100}%"></em></div>
        <small>El resultado se conoce al cerrar, en ${fdFalta(p.votaCierra)}. Hasta entonces nadie lo sabe.</small></div>
      ${p.yoVote ? '<div class="fd-p-votado">✓ Ya votaste. Tu voto es secreto: no se guarda qué elegiste ni quién lo eligió.</div>'
        : socio ? `<div class="fd-p-opc"><button class="fd-op si" data-fd-votar="${p.id}">Sí, financiarlo</button><button class="fd-op no" data-fd-votar="${p.id}">No</button></div>`
        : `<div class="fd-p-solo">🔒 Solo votan los socios · te faltan ${fd$(Math.max(0, FD_SOCIO - fd.d.yo.aportado))} <button class="bq-link" data-fd-tab="socios">Ver cómo</button></div>`}
      ${sim ? `<button class="bq-link" data-fd-sim="cerrar" data-p="${p.id}">Simular: cerrar la votación</button>` : ''}</div>`
  if (['financiando', 'financiado', 'devuelto'].includes(p.estado)) {
    const t = fdTotales(p), dev = p.estado === 'devuelto'
    const total = dev ? p.devuelto.monto : t.total
    const f = fdFranja({ meta: p.meta, marcas: dev ? [] : p.marcas, butacas: dev ? p.devuelto.monto : t.butacas, aportantes: dev ? p.devuelto.aportantes : t.aportantes, anchoPx: Math.min(window.innerWidth - 80, 760) })
    cuerpo = `${p.votacion ? `<p class="fd-p-res">✓ Aprobado por los socios: <b>${fdPct(p.votacion.si, 1)} Sí</b> · participó el ${fdPct(p.votacion.part, 1)}</p>` : ''}
      <div class="fd-p-meta ${dev ? 'dev' : p.estado === 'financiado' ? 'ok' : ''}">
        <div class="fd-p-num"><b>${fd$(total)}</b><span>de ${fd$(p.meta)} · ${fdPct(total, p.meta)}</span>
          <em>${dev ? `No llegó · se devolvieron ${fd$(p.devuelto.monto)} a ${fmtNum(p.devuelto.aportantes)} aportantes` : p.estado === 'financiado' ? '✓ Financiado' : `Quedan ${fdFalta(p.cierra)}`}</em></div>
        ${f.html}
        ${!dev && p.aportes.length ? `<div class="fd-p-fichas">${p.aportes.slice(0, 12).map(fdFicha).join('')}<span class="fd-mas">${fmtNum(t.aportantes)} butacas${p.marcas.length ? ` · ${p.marcas.map(m => esc(m.nombre)).join(', ')}` : ''}</span></div>` : ''}
      </div>
      ${p.estado === 'financiando' ? `<div class="fd-p-aportar"><span>Aportá a este proyecto <small>Pueden aportar todas las butacas</small></span>
        ${[1, 5, 10, 25].map(m => `<button class="fd-monto chico" data-fd-aportar="${m}" data-p="${p.id}">${fd$(m)}</button>`).join('')}
        ${sim && !p.marcas.some(m => m.id === 'orinoco') ? `<button class="bq-link" data-fd-sim="marca" data-p="${p.id}">Simular: una marca auspicia</button>` : ''}</div>
        <p class="fd-p-regla">Si no llega a ${fd$(p.meta)} antes del ${fdFecha(p.cierra)}, se devuelve todo lo aportado.</p>` : ''}
      ${p.nota ? `<p class="fd-p-nota">${esc(p.nota)}</p>` : ''}`
  }
  if (p.estado === 'rechazado') cuerpo = `<p class="fd-p-res no">✕ No aprobado por los socios${p.votacion ? `: ${fdPct(p.votacion.si, 1)} Sí · participó el ${fdPct(p.votacion.part, 1)}` : ''}.</p>`
  return `<article class="card fd-proy ${cl}" id="fd-p-${p.id}">
    <header><span class="fd-p-chip ${cl}">${etq}</span><span class="fd-p-lugar">📍 ${esc(p.lugar)}</span><span class="fd-p-meta-chip">Meta ${fd$(p.meta)}</span></header>
    <h3>${esc(p.titulo)}</h3><p class="fd-p-txt">${esc(p.texto)}</p>
    ${pasos}${cuerpo}</article>`
}

// ── Pestaña: Socios
function fdTabSocios() {
  const d = fd.d, proy = d.proyectos, financiado = proy.filter(p => p.estado === 'financiado').reduce((n, p) => n + fdTotales(p).total, 0)
  return `<section class="fd-socios-hero">
      <span class="fd-kicker">Socios del Cabildo</span>
      <h2 class="fd-titulo">Los que sostienen el Cabildo <em>deciden qué construir.</em></h2>
      <div class="fd-regla-grande"><b>${fd$(FD_SOCIO)}</b><span>aportados en el año<br>= socio por 12 meses</span></div>
      <div class="fd-stats"><div><b>${fmtNum(d.socios)}</b><small>socios activos</small></div><div><b>${proy.length}</b><small>proyectos propuestos</small></div><div><b>${fd$(financiado)}</b><small>financiado en proyectos</small></div></div>
    </section>
    ${fdMiSocio(false)}
    <div class="fd-grid">
      <article class="card fd-card"><h3>Qué hace un socio</h3>
        <div class="fd-lista"><p><span>💡</span><span><b>Propone proyectos</b> concretos para financiar: un monumento, una biblioteca, asesoría legal.</span></p>
        <p><span>💬</span><span><b>Debate</b> cada propuesta 48 horas con los demás socios.</span></p>
        <p><span>🗳️</span><span><b>Vota en secreto</b> si se financia. Se aprueba con mayoría y al menos ${Math.round(FD_QUORUM * 100)}% de participación.</span></p></div></article>
      <article class="card fd-card"><h3>Cómo se mantiene</h3>
        <div class="fd-lista"><p><span>➕</span><span>Todo suma: aportes al fondo del Cabildo y a cualquier proyecto.</span></p>
        <p><span>📅</span><span>Al llegar a ${fd$(FD_SOCIO)} sos socio <b>por 12 meses</b>. Después el acumulado vuelve a $0 y se renueva aportando de nuevo.</span></p>
        <p><span>↩️</span><span>Si un proyecto no llega a su meta, <b>se devuelve todo</b>.</span></p></div></article>
      <article class="card fd-card"><h3>Lo que no cambia</h3>
        <div class="fd-lista"><p><span>⚖️</span><span>En el <b>Hemiciclo</b> cada butaca vale <b>1 voto</b>, aporte o no aporte.</span></p>
        <p><span>🤝</span><span><b>Todos pueden aportar</b> a cualquier proyecto, sean socios o no, y también las marcas.</span></p>
        <p><span>🔒</span><span>Ser socio <b>no muestra quién sos</b>, y no se guarda qué votó cada socio.</span></p></div></article>
    </div>`
}

// ── Pestaña: ¿Cómo funciona? (para todo público)
function fdTabComo() {
  const si = '<span class="fd-si" aria-label="Sí">✓</span>', no = '<span class="fd-no" aria-label="No">—</span>'
  const fila = (t, a, s, m, nota) => `<tr><th scope="row">${t}${nota ? `<small>${nota}</small>` : ''}</th><td>${a}</td><td>${s}</td><td>${m}</td></tr>`
  const faq = [
    ['¿Qué gano por aportar?', `Tu Fundador: un avatar pixel art único, numerado por orden de llegada (el #0001 es el primero que aportó), que queda para siempre en el Libro de Fundadores ${FD_ED}. Además ocupa su lugar en el Muro: cuanto más aportás, más grande se ve ($1 = 1 casillero, $5 = 2×2, $10 = 3×3, $25 = 5×5). Y si sumás $12 en el año, sos socio y tu Fundador lleva marco dorado.`],
    ['¿Si aporto más, mi Fundador es más raro?', 'No. Tu Fundador sale sorpresa y depende de tu butaca, no de cuánto aportes. Es uno por butaca y por edición: aportar de nuevo no te da otro. Así nadie puede comprar rareza.'],
    ['¿Puedo vender o regalar mi Fundador?', 'No. Es un reconocimiento por sostener el Cabildo, no una inversión: queda en tu butaca para siempre.'],
    ['¿Es un NFT?', 'No. Vive en el Cabildo y cada año la huella del Libro se sella en Bitcoin con un sello de tiempo gratuito, para que cualquiera pueda comprobar que nunca se modificó. No hace falta billetera, no hay comisiones y nadie puede ver quién pagó.'],
    ['¿Tengo que ser socio para aportar?', 'No. Cualquier butaca puede aportar, desde $1, al Fondo del Cabildo o a cualquier proyecto. Ser socio solo hace falta para proponer y votar proyectos.'],
    ['¿Cómo llego a ser socio?', `Sumando ${fd$(FD_SOCIO)} en aportes durante el año. Se suma todo: si aportás $5 al Fondo y $7 a un proyecto, ya sos socio.`],
    ['¿Cuánto dura ser socio?', `12 meses desde que llegás a ${fd$(FD_SOCIO)}. Después tu acumulado vuelve a $0 y lo renovás aportando de nuevo.`],
    ['¿Un socio tiene más votos en el Hemiciclo?', 'No. En las votaciones del Hemiciclo cada butaca vale 1 voto, haya aportado o no. Los socios solo deciden qué proyectos se financian.'],
    ['¿Las marcas pueden decidir algo?', 'No. Las marcas ponen su logo en la franja, pero no proponen ni votan proyectos y no tienen ninguna influencia en las votaciones del Cabildo.'],
    ['¿Qué pasa si un proyecto no junta la plata a tiempo?', 'Se devuelve todo. Cada persona y cada marca recibe de vuelta lo que aportó.'],
    ['¿Puedo aportar sin que se vea mi número de butaca?', 'Sí. Al aportar elegís si mostrar tu número en la franja. Si no, aparecés como “Butaca anónima”.'],
    ['¿Alguien puede saber qué voté en un proyecto?', 'No. La votación de los socios es secreta, igual que en el Hemiciclo: el Cabildo no guarda qué votó cada socio, solo suma al total.'],
    ['¿Cómo sé en qué se usa la plata?', 'Cada aporte aparece en la franja, cada tramo del Fondo dice qué se paga con él, y cada proyecto financiado publica sus avances en su ficha.'],
  ]
  return `<section class="fd-como-hero">
      <span class="fd-kicker">¿Cómo funciona?</span>
      <h2 class="fd-titulo">Todos pueden aportar. <em>Los socios deciden</em> qué construir.</h2>
      <p>Funding es la forma en que el Cabildo se financia con su propia gente, a la vista de todos. Hay tres maneras de participar:</p>
      <div class="fd-roles">
        <div class="fd-rol"><span class="fd-rol-ico">🪙</span><b>Aportante</b><em>Cualquier butaca · desde $1</em>
          <p>Aporta al Fondo del Cabildo y recibe su <b>Fundador</b>: un avatar único y numerado que queda para siempre en el Libro y en el Muro.</p></div>
        <span class="fd-rol-flecha" aria-hidden="true">→</span>
        <div class="fd-rol oro"><span class="fd-rol-ico">★</span><b>Socio</b><em>${fd$(FD_SOCIO)} aportados en el año</em>
          <p>Además de aportar, propone proyectos, los debate y vota en secreto cuáles se financian.</p></div>
        <div class="fd-rol marca"><span class="fd-rol-ico">🏷️</span><b>Marca</b><em>Empresas que auspician</em>
          <p>Pone su logo en su tramo de la franja. No vota ni decide nada.</p></div>
      </div>
    </section>

    <h3 class="fd-como-tit">Dos metas, dos propósitos</h3>
    <div class="fd-dos">
      <article class="card fd-card"><span class="fd-num">1</span><h3>Fondo del Cabildo</h3>
        <p>Sostiene la plataforma: servidores, seguridad, la app y auditorías del secreto del voto. Es una sola meta (hoy ${fd$(fd.d?.meta || 30000)}), dividida en tramos que dicen qué se paga con cada uno.</p>
        <button class="bq-link" data-fd-tab="cabildo">Ver el Fondo →</button></article>
      <article class="card fd-card"><span class="fd-num">2</span><h3>Proyectos</h3>
        <p>Cosas concretas que proponen y aprueban los socios: un monumento, una biblioteca, asesoría legal. Cada proyecto aprobado tiene su propia meta y su propia franja.</p>
        <button class="bq-link" data-fd-tab="proyectos">Ver los proyectos →</button></article>
    </div>

    <h3 class="fd-como-tit">Cómo nace un proyecto</h3>
    <ol class="fd-linea">
      <li><span>💡</span><div><b>1 · Un socio lo propone</b><p>Cuenta qué quiere hacer, dónde, cuánto cuesta y en qué plazo hay que juntarlo.</p><em>Solo socios</em></div></li>
      <li><span>💬</span><div><b>2 · Se debate 48 horas</b><p>Los socios opinan, preguntan y mejoran la idea.</p><em>Solo socios</em></div></li>
      <li><span>🗳️</span><div><b>3 · Votación secreta</b><p>Los socios votan Sí o No. Se aprueba si gana el Sí y vota al menos el ${Math.round(FD_QUORUM * 100)}% de los socios. Nadie sabe qué votó cada uno.</p><em>Solo socios</em></div></li>
      <li><span>🤝</span><div><b>4 · Se abre su meta</b><p>El proyecto tiene su franja propia y <b>todos pueden aportar</b>: cualquier butaca y cualquier marca.</p><em class="todos">Todos</em></div></li>
      <li><span>✅</span><div><b>5 · Financiado… o devuelto</b><p>Si llega a la meta, se hace y publica sus avances. Si no llega a tiempo, <b>se devuelve todo</b>.</p><em class="todos">Garantía para todos</em></div></li>
    </ol>

    <h3 class="fd-como-tit">Quién puede qué</h3>
    <div class="card fd-tabla-wrap"><table class="fd-tabla">
      <thead><tr><th></th><th>Aportante</th><th class="oro">Socio ★</th><th>Marca</th></tr></thead>
      <tbody>
        ${fila('Aportar al Fondo del Cabildo', si, si, si)}
        ${fila('Aportar a cualquier proyecto', si, si, si)}
        ${fila('Aparecer en la franja', si, si, si, 'Las butacas, solo si eligen mostrarse')}
        ${fila('Recibir tu Fundador (avatar único)', si, si, no, 'Socios con marco dorado')}
        ${fila('Proponer proyectos', no, si, no)}
        ${fila('Debatir proyectos', no, si, no)}
        ${fila('Votar qué proyectos se financian', no, si, no)}
        ${fila('Votar en el Hemiciclo', si, si, no, 'Siempre 1 butaca = 1 voto')}
      </tbody></table></div>

    <div class="fd-dos">
      <article class="card fd-card fd-garantia"><h3>🛡️ Tu aporte está protegido</h3>
        <div class="fd-lista"><p><span>↩️</span><span>Si un proyecto no llega a su meta a tiempo, <b>se devuelve todo</b>.</span></p>
        <p><span>👀</span><span><b>Todo está a la vista:</b> cada aporte aparece en la franja y cada tramo dice en qué se usa.</span></p>
        <p><span>⚖️</span><span><b>La plata no compra votos:</b> ni socios ni marcas tienen más peso en el Hemiciclo.</span></p></div></article>
      <article class="card fd-card fd-garantia"><h3>🔒 Tu privacidad</h3>
        <div class="fd-lista"><p><span>🪑</span><span>Tu número de butaca aparece <b>solo si querés</b>. Si no, sos “Butaca anónima”.</span></p>
        <p><span>🗳️</span><span>En la votación de socios <b>no se guarda qué votaste</b>: solo suma al total.</span></p>
        <p><span>★</span><span>Ser socio <b>no muestra quién sos</b>.</span></p></div></article>
    </div>

    <h3 class="fd-como-tit">Preguntas frecuentes</h3>
    <div class="card fd-faq">${faq.map(([q, r]) => `<details><summary>${q}</summary><p>${r}</p></details>`).join('')}</div>

    <div class="fd-como-cta"><button class="btn btn-accent" data-fd-tab="cabildo">Aportar al Fondo del Cabildo</button><button class="btn btn-ghost" data-fd-tab="proyectos">Ver los proyectos</button></div>`
}

function enlazarFunding() {
  const v = $('#fd-vista'); if (!v) return
  v.addEventListener('click', e => {
    const t = e.target, d = fd.d
    const tab = t.closest('[data-fd-tab]')
    if (tab) { fd.tab = tab.dataset.fdTab; history.replaceState(null, '', '#funding/' + fd.tab); pintarFunding(); window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    const ap = t.closest('[data-fd-aportar]')
    if (ap) {
      if (!fd.cfg?.simulado) return aviso('Los pagos se habilitan pronto.')
      const p = ap.dataset.p ? d.proyectos.find(x => x.id === ap.dataset.p) : null
      return fdMiAporte(Number(ap.dataset.fdAportar), p)
    }
    const vo = t.closest('[data-fd-votar]')
    if (vo) {
      const p = d.proyectos.find(x => x.id === vo.dataset.fdVotar); if (!p || p.yoVote) return
      // El voto no se guarda: solo cuenta que votaste (como en el Hemiciclo)
      p.yoVote = true; p.votaron = Math.min(1, p.votaron + 1 / Math.max(1, d.socios))
      aviso('🗳️ Voto registrado. Es secreto.'); fdRepintarTab(p.id); return
    }
    const si = t.closest('[data-fd-sim]')
    if (si) {
      const p = d.proyectos.find(x => x.id === si.dataset.p); if (!p) return
      if (si.dataset.fdSim === 'abrir') { p.estado = 'votacion'; p.votaron = 0.08; p.votaCierra = Date.now() + 48 * 36e5; aviso('Se abrió la votación de socios') }
      if (si.dataset.fdSim === 'cerrar') {
        if (p.votaron < FD_QUORUM) p.votaron = 0.46
        p.votacion = { si: 0.72, part: p.votaron }; p.estado = 'financiando'; p.cierra = Date.now() + 30 * 864e5; p.aportes = p.aportes || []
        aviso(`✓ Aprobado por los socios (72% Sí). «${p.titulo}» ya junta aportes de todos.`)
      }
      if (si.dataset.fdSim === 'marca') {
        p.marcas.push({ ...FD_MARCAS.orinoco, nivel: 'Aliada', monto: Math.round(p.meta * 0.2), nueva: true })
        setTimeout(() => { const m = p.marcas.find(x => x.id === 'orinoco'); if (m) m.nueva = false }, 1500)
        fd.ultimo = { marca: 'Orinoco', monto: Math.round(p.meta * 0.2), at: Date.now() }
      }
      fdRepintarTab(p.id); return
    }
    if (t.closest('[data-fd-debate]')) return aviso('Simulación: acá se abre la sala de debate de los socios.')
    // Muro: tamaño, color, símbolo y lugar
    const ed = () => { const e = $('#fd-editor'); if (e) e.innerHTML = fdEditorHTML(); fdFantasma() }
    const tm = t.closest('[data-fd-tam]'); if (tm) { fd.sel.monto = Number(tm.dataset.fdTam); if (fd.sel.pos && !fdLibre(d, fd.sel.pos.x, fd.sel.pos.y, fdTam(fd.sel.monto))) fd.sel.pos = null; return ed() }
    const co = t.closest('[data-fd-col]'); if (co) { fd.sel.color = co.dataset.fdCol; return ed() }
    const sy = t.closest('[data-fd-sym]'); if (sy) { fd.sel.sym = sy.dataset.fdSym; return ed() }
    if (t.closest('[data-fd="elegir-lugar"]')) { fd.sel.eligiendo = !fd.sel.eligiendo; ed(); if (fd.sel.eligiendo) $('#fd-muro-lienzo')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return }
    if (t.id === 'fd-muro-canvas' && fd.sel.eligiendo) {
      const pos = fdFantasma(e)
      if (pos && fdLibre(d, pos.x, pos.y, fdTam(fd.sel.monto))) { fd.sel.pos = pos; fd.sel.eligiendo = false; ed(); aviso('📍 Lugar elegido. Ahora tocá “Aportar” para quedártelo.') }
      else aviso('Ese lugar ya está ocupado. Probá con otro.', 'error')
      return
    }
    const fi = t.closest('[data-fd-ficha]'); if (fi) { const f = d.fund.get(Number(fi.dataset.fdFicha)); if (f) fdVerFundador(f, false); return }
    const lt = t.closest('[data-fd-lib-tipo]'); if (lt) { fd.lib.tipo = lt.dataset.fdLibTipo; fd.lib.n = 96; $$('[data-fd-lib-tipo]').forEach(b => b.classList.toggle('on', b === lt)); return fdPintarLibro() }
    if (t.closest('[data-fd="mas-libro"]')) { fd.lib.n += 96; return fdPintarLibro() }
    if (t.closest('[data-fd="full"]')) return fdAbrirFull()
    if (t.closest('[data-fd="muro-aportar"]')) { if (!fd.cfg?.simulado) return aviso('Los pagos se habilitan pronto.'); return fdMiAporte(fd.sel.monto) }
    const ac = t.closest('[data-fd]')?.dataset.fd
    if (ac === 'proponer') { fd.formProy = true; $('#fd-proy-form').innerHTML = fdFormProyecto(); setTimeout(() => $('#fd-pf-tit')?.focus(), 30); return }
    if (ac === 'cancelar-proy') { fd.formProy = false; $('#fd-proy-form').innerHTML = ''; return }
    if (ac === 'crear-proy') {
      const tit = ($('#fd-pf-tit').value || '').trim(), meta = Math.max(100, Number($('#fd-pf-meta').value) || 0)
      if (tit.length < 5) return aviso('Contá en pocas palabras qué querés hacer.', 'error')
      d.proyectos.unshift({ id: 'p' + Date.now(), titulo: tit, lugar: ($('#fd-pf-lugar').value || '').trim() || 'Sin lugar definido', texto: ($('#fd-pf-txt').value || '').trim() || 'Propuesto por un socio.',
        meta, estado: 'debate', votaAbre: Date.now() + 48 * 36e5, comentarios: 0, marcas: [], aportes: [], dias: Number($('#fd-pf-dias').value) })
      fd.formProy = false; $('#fd-proy-form').innerHTML = ''; fdRepintarTab(); aviso('💡 Propuesta publicada. Los socios la debaten 48 horas.'); return
    }
    if (ac === 'marca') {
      if (d.marcas.some(m => m.id === 'orinoco')) return aviso('Ya agregaste la marca de ejemplo.')
      d.marcas.push({ ...FD_MARCAS.orinoco, nivel: 'Aliada', monto: 5000, nueva: true })
      setTimeout(() => { const m = d.marcas.find(x => x.id === 'orinoco'); if (m) m.nueva = false }, 1500)
      fd.ultimo = { marca: 'Orinoco', monto: 5000, at: Date.now() }
      fdActualizar(true)
      $('#fd-franja')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  })
  v.addEventListener('change', e => {
    if (e.target.classList.contains('fd-mostrarme')) fd.mostrarme = e.target.checked
    if (e.target.id === 'fd-lib-orden') { fd.lib.orden = e.target.value; fd.lib.n = 96; fdPintarLibro() }
  })
  v.addEventListener('input', e => { if (e.target.id === 'fd-lib-q') { fd.lib.q = e.target.value; fd.lib.n = 96; fdPintarLibro() } })
  // Ficha / revelado del Fundador (se abre encima de todo)
  const cerrarFicha = () => $('#fd-rev')?.remove()
  document.addEventListener('click', e => {
    const r = e.target.closest('[data-fd-rev]')
    if (r?.dataset.fdRev === 'cerrar' || e.target.id === 'fd-rev') return cerrarFicha()
    if (r?.dataset.fdRev === 'libro') { cerrarFicha(); fd.tab = 'fundadores'; fd.lib = { tipo: 'Todos', orden: 'num', q: '', n: 96 }; history.replaceState(null, '', '#funding/fundadores'); pintarFunding(); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  })
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if ($('#fd-rev')) cerrarFicha(); else fdCerrarFull() } })
  // Pantalla completa (vive fuera de la vista): cerrar, fichas y globos
  document.addEventListener('click', e => {
    if (e.target.closest('[data-fd-full="cerrar"]')) return fdCerrarFull()
    const fi = e.target.closest('#fd-full [data-fd-ficha]'); if (fi) { const f = fd.d?.fund.get(Number(fi.dataset.fdFicha)); if (f) fdVerFundador(f, false) }
  })
  document.addEventListener('mousemove', e => { if (e.target.id === 'fd-full-canvas') fdMuroTip(e, e.target, $('#fd-full-tip')) })
  document.addEventListener('mouseout', e => { if (e.target.id === 'fd-full-canvas') { const t = $('#fd-full-tip'); if (t) t.hidden = true } })
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && $('#fd-full')) setTimeout(fdPintarFull, 60) })
  window.addEventListener('resize', () => { if ($('#fd-full')) fdPintarFull() })
  v.addEventListener('mousemove', e => { if (e.target.id === 'fd-muro-canvas') fdMuroTip(e) })
  v.addEventListener('mouseout', e => { if (e.target.id === 'fd-muro-canvas') { const tip = $('#fd-muro-tip'); if (tip) tip.hidden = true; if (fd.sel.eligiendo && !fd.sel.pos) $('#fd-fantasma').hidden = true } })
  let rz = 0; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (vistaActual() === 'funding') fdRepintarTab() }, 200) })
}

// ── Inicio ──────────────────────────────────────────────────────
function enlazar() {
  window.addEventListener('hashchange', ruta)
  $('#menu-btn').addEventListener('click', abrirMenu)
  $('#scrim').addEventListener('click', cerrarMenu)
  $('#theme-btn').addEventListener('click', alternarTema)
  $('#bloque-buscar').addEventListener('input', pintarBloques)
  $('#q-card').addEventListener('click', e => { const b = e.target.closest('[data-iq-votar]'); if (!b) return; const q = iqPreguntas.find(x => x.id === b.dataset.iqVotar); if (q) abrirVoto(q) })
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
    const f = e.target.closest('[data-vc]'); if (f) { vc.filtro = f.dataset.vc; if (vc.filtro !== 'todas' && !vc.fin && vc.items.length < 100) cargarCerradas(); return pintarCerradas() }
    if (e.target.closest('[data-vc-mas]')) return cargarCerradas()
    const b = e.target.closest('[data-votar]'); if (!b) return
    const q = vPreguntas.find(x => x.id === b.dataset.votar); if (q) abrirVoto(q)
  })
  $('#vlist').addEventListener('input', e => {
    if (e.target.id !== 'vc-q') return
    clearTimeout(vc.buscarT); vc.buscarT = setTimeout(() => { vc.q = e.target.value.trim(); cargarCerradas(true) }, 350)
  })
  $$('.tab').forEach(t => t.addEventListener('click', () => irATab(t.dataset.tab)))
  $('#bloques-body').addEventListener('click', e => {
    const u = e.target.closest('[data-unirme]'); if (u) return unirme(u.dataset.unirme)
    if (e.target.closest('[data-cancelar-pedido]')) return cancelarPedido()
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
       <a class="btn btn-dark mb-bl-ir" href="#bloque">${me.soy_anfitrion ? 'Administrar mi bloque' : 'Entrar a mi bloque'} →</a>
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
      ${interruptor('presencia', pres.mia, 'Encender mi butaca cuando estoy presente', 'Se ve con luz blanca en el hemiciclo y en el Monitor mientras tenés el Cabildo abierto')}
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
    if (t.dataset.visib === 'presencia') return cambiarPresencia()
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
      <span class="db-item-top"><span class="tag" style="--cat:${colorCat(q.category)}">${esc(q.category || 'General')}</span>
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
      // Lo que llega por este canal lo puede mandar cualquiera: solo se aceptan números de butaca
      // válidos y una hora creíble (nadie puede "colarse" adelante con una hora vieja).
      const seat = Number(p?.seat), ahora = Date.now()
      if (!Number.isInteger(seat) || seat <= 0 || seat > 1e6 || seat === estado.butaca) return
      if (p.type === 'hand_up' && !dbt.cola.find(e => e.seat === seat)) {
        if (dbt.cola.length >= 200) return
        const t = Number(p.raisedAt)
        dbt.cola.push({ seat, raisedAt: Number.isFinite(t) && t > ahora - 5000 && t <= ahora + 2000 ? t : ahora }); dbt.cola.sort((a, b) => a.raisedAt - b.raisedAt)
      } else if (p.type === 'hand_down') dbt.cola = dbt.cola.filter(e => e.seat !== seat)
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
      <div class="vcard-top"><span class="tag" style="--cat:${colorCat(q.category)}">${esc(q.category || 'General')}</span>
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
    `<span class="${e.seat === estado.butaca ? 'yo' : i < DB_DIRECTO ? 'habla' : ''}">${i < DB_DIRECTO ? '🎙' : '✋'} #${esc(e.seat)}</span>`).join('')
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
  if (dbt.enviando) return
  const qEnvio = dbt.q.id
  dbt.enviando = true; btn.disabled = true; el.disabled = true
  const { data, error } = await seguro(sb.from('debate_messages')
    .insert({ question_id: dbt.q.id, seat_number: estado.butaca, alias: '', text: txt })
    .select('id, seat_number, text, created_at').single())
  dbt.enviando = false
  if (error) {
    // MOB-31: se conserva el texto y se reactiva solo si sigue siendo tu turno en el mismo debate
    const sigue = dbt.mano === 'ready' && dbt.q?.id === qEnvio
    btn.disabled = !sigue; el.disabled = !sigue
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
  if (p.bloque_id) return `Bloque · ${p.bloque_nombre || 'Bloque'}`
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
      <span class="pr-autor ${p.bloque_id ? 'pr-bloque' : ''}">${p.bloque_id ? '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3 19a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M21 19a6 6 0 0 0-4-5.7"/></svg>' : ''}${esc(autorDe(p))}</span>
      ${vive && p.apoyos_hora > 0 ? `<span class="pr-fuego" title="Apoyos en la última hora">+${p.apoyos_hora} en la última hora</span>` : ''}
      <button class="pr-coment" data-abrir="${p.id}" aria-label="Ver comentarios (${p.comentarios || 0})"><svg viewBox="0 0 24 24"><path d="M5 5h14v10H9l-4 4z"/></svg>${p.comentarios || 0}</button>
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
      <button class="pr-x" data-compartir="${p.id}" aria-label="Compartir en X"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.2-8.3L1.8 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z"/></svg><span>Compartir</span></button>
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

// Compartir en X: abre el compositor de X con el post ya escrito, en la cuenta de la persona
// (sin API ni permisos). La persona lo revisa y lo publica ella.
function esAndroid() { return document.documentElement.classList.contains('android') }  // qa35-android
function colorCat(c) { try { return CAT_COLOR[c] || CAT_COLOR.General } catch (e) { return '#475569' } }

// MOB-22 (Android): menú nativo de compartir (WhatsApp, Telegram, copiar…). En el resto sigue abriendo X.
async function compartirPropuesta(id) {
  if (esAndroid() && navigator.share) {
    const p = pr.d?.propuestas?.find(x => x.id === id)
    const url = `${location.origin}/ux2/#propuestas/${id}`
    const texto = p ? `Apoyá esta propuesta en el Cabildo de Venezuela: “${p.text.length > 190 ? p.text.slice(0, 187).trimEnd() + '…' : p.text}”` : 'Propuesta en el Cabildo de Venezuela'
    try { await navigator.share({ title: 'Cabildo de Venezuela', text: texto, url }); return } catch (e) { if (e && e.name === 'AbortError') return }
  }
  compartir(id)
}

// Android: mismo botón de cierre (X dibujada) en todos los paneles
document.addEventListener('DOMContentLoaded', () => {
  if (!esAndroid()) return
  document.querySelectorAll('.modal-x').forEach(b => { if (b.textContent.trim() === '✕') b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>' })
})

function compartir(id) {
  const p = pr.d?.propuestas?.find(x => x.id === id)
  const url = `${location.origin}/ux2/#propuestas/${id}`
  const frase = p ? (p.text.length > 190 ? p.text.slice(0, 187).trimEnd() + '…' : p.text) : ''
  const texto = p ? `Apoyá esta propuesta en el Cabildo de Venezuela: “${frase}”` : 'Propuesta en el Cabildo de Venezuela'
  const q = new URLSearchParams({ text: texto, url, via: 'cabildoven' })
  window.open('https://x.com/intent/post?' + q, '_blank', 'noopener,noreferrer')
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
      <div class="pr-pie">${vive ? botonApoyo(p) : ''}<button class="pr-x" data-compartir="${p.id}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.2-8.3L1.8 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z"/></svg><span>Compartir en X</span></button></div>
    </div>
    <h3 class="mp-sub">Conversación</h3>
    <div class="mp-coments" id="mp-coments"><p class="muted">Cargando…</p></div>
    ${estado.butaca ? `<div class="mp-comentar"><textarea id="mp-coment" maxlength="500" rows="2" placeholder="Sumá un argumento a favor, en contra o una mejora"></textarea><button class="btn btn-dark" id="mp-coment-env">Comentar</button></div>`
      : `<p class="muted mp-nota-c">Para comentar necesitás tu butaca verificada.</p>`}`
  m.hidden = false
  if (location.hash !== '#propuestas/' + id) history.replaceState(null, '', '#propuestas/' + id)
  cargarComentariosProp(id)
}
async function cargarComentariosProp(id) {
  const { data } = await sb.from('proposal_comments').select('id, from_seat, text, created_at').eq('proposal_id', id).order('created_at', { ascending: true }).limit(200)
  if (pr.abierta !== id) return
  const box = $('#mp-coments'); if (!box) return
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

document.addEventListener('input', e => { if (e.target.matches?.('.ml-link.ml-mal, #ml-video.ml-mal')) mlValidarEnlaces() })
function mlValidarEnlaces() {
  let primero = null
  $$('.ml-link, #ml-video').forEach(i => {
    const v = i.value.trim(), mal = !!v && !/^https?:\/\/[^\s.]+\.\S+$/i.test(v)
    i.classList.toggle('ml-mal', mal); i.setAttribute('aria-invalid', mal ? 'true' : 'false')
    if (mal && !primero) primero = i
  })
  const err = $('#ml-err-links')
  if (err) { err.hidden = !primero; err.textContent = primero ? 'Revisá los enlaces marcados: tienen que empezar con https:// (por ejemplo https://ejemplo.com).' : '' }
  return primero
}

async function lanzar(e) {
  e.preventDefault()
  const text = limpiar($('#ml-texto').value)
  if (text.length < 10) { aviso('La propuesta tiene que tener al menos 10 caracteres.', 'error'); $('#ml-texto').focus(); return }
  const malo = mlValidarEnlaces()
  if (malo) { const det = malo.closest('details'); if (det) det.open = true; malo.focus(); malo.scrollIntoView({ block: 'center', behavior: 'smooth' }); return }
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
    if (t.dataset.compartir !== undefined && t.dataset.compartir) return compartirPropuesta(t.dataset.compartir)
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

async function responderSolicitud(id, acepta, btn) {
  const s = ciu.sol.find(x => x.id === id); if (!s) return
  ciu.respondiendo = ciu.respondiendo || new Set()
  if (ciu.respondiendo.has(id)) return            // MOB-27: una sola respuesta en curso por solicitud
  ciu.respondiendo.add(id)
  const fila = btn?.closest('.ci-fila'), botones = fila ? $$('button[data-aceptar],button[data-rechazar]', fila) : []
  botones.forEach(b => { b.disabled = true }); if (btn) btn.textContent = acepta ? 'Aceptando…' : 'Rechazando…'
  const { data, error } = await seguro(acepta
    ? sb.from('follows').update({ status: 'accepted' }).eq('id', id).select('id')
    : sb.from('follows').delete().eq('id', id).select('id'))
  ciu.respondiendo.delete(id)
  if (error || !data?.length) {
    botones.forEach(b => { b.disabled = false; b.textContent = b.dataset.aceptar ? 'Aceptar' : 'Rechazar' })
    aviso('No se pudo completar. Probá de nuevo en un momento.', 'error'); return
  }
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

// En el celular las barras de pestañas (.seg) se desplazan de costado: la elegida siempre queda a la vista
document.addEventListener('click', e => { const b = e.target.closest('.seg .seg-btn'); if (b) b.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }) })

function enlazarCiudadanos() {
  const v = $('#ci-vista'); if (!v) return
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-seguir],[data-perfil],[data-aceptar],[data-rechazar],[data-citab],[data-cptab],#ci-mas,#cp-hemi,#cp-enviar')
    if (!t) return
    if (t.dataset.seguir) { e.stopPropagation(); return seguir(Number(t.dataset.seguir)) }
    if (t.dataset.aceptar) return responderSolicitud(t.dataset.aceptar, true, t)
    if (t.dataset.rechazar) return responderSolicitud(t.dataset.rechazar, false, t)
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
      if (p && AU_EMOJIS.includes(p.emoji)) flotarReaccion(p.emoji, Number.isInteger(Number(p.seat)) && Number(p.seat) > 0 ? auNombre(Number(p.seat)) : 'Invitado')
    })
    .on('broadcast', { event: 'aud_chat' }, ({ payload: p }) => {
      const seat = Number(p?.seat); const text = limpiar(p?.text).slice(0, 280).trim()
      if (!(seat > 0) || !text) return
      if (!Number.isInteger(seat) || seat > 1e6) return
      agregarChat({ seat, text, at: Date.now() })
    })
    .on('broadcast', { event: 'aud_hand' }, ({ payload: p }) => {
      const seat = Number(p?.seat); if (!Number.isInteger(seat) || seat <= 0 || seat > 1e6) return
      if (p.action === 'raise') { if (!au.manos.some(m => m.seat === seat) && au.manos.length < 200) au.manos.push({ seat, at: Date.now() }) }
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
  else if (link && /^https:\/\/[^\s"'<>]+$/.test(link)) {
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

// ══════════════════════════════════════════════════════════════
//  PLAYROOM · NERDOCRASY
//  El servidor manda: elige la pregunta, controla el tiempo (12 s + 2 s de gracia) y nunca envía
//  la respuesta correcta hasta que quedás eliminado. El navegador solo muestra y cuenta.
// ══════════════════════════════════════════════════════════════
const ND_SEG = 12
const ND_ETAPAS = [
  { id: 'KNOW',  nombre: 'Saber',  desde: 1,  hasta: 30, color: '#3b82f6', lema: 'Lo que todo ciudadano debería saber.' },
  { id: 'THINK', nombre: 'Pensar', desde: 31, hasta: 60, color: '#a855f7', lema: 'Saber ya no alcanza.' },
  { id: 'TRAP',  nombre: 'Dudar',  desde: 61, hasta: 90, color: '#f43f5e', lema: '¿Estás seguro?' },
]
const etapaDe = n => ND_ETAPAS.find(e => n <= e.hasta) || ND_ETAPAS[2]
const nd = { est: null, rank: [], cargado: false, abierto: false, intento: null, q: null, nivel: 1, fin: 0, raf: 0,
  respondiendo: false, recordInicio: 0, racha: 0, tInicio: 0 }

async function cargarPlayroom() {
  if (!estado.user) { nd.cargado = true; return pintarPlayroom() }
  try {
    const [e, r] = await Promise.all([sb.rpc('v2_nerdocrasy_estado'), sb.rpc('get_nerdocrasy_ranking', { limit_n: 20 })])
    if (e.error) throw e.error
    nd.est = e.data; nd.rank = r.data || []
  } catch (err) { console.warn('playroom:', err); nd.est = nd.est || null }
  nd.cargado = true
  pintarPlayroom()
}

const ndNombre = seat => seat === estado.butaca ? 'Vos' : auNombre(seat)
const chipEtapa = (id, extra = '') => { const e = ND_ETAPAS.find(x => x.id === id); return e ? `<span class="nd-chip ${extra}" style="--c:${e.color}">${e.id}</span>` : '' }

// La ruta de 90 niveles: tres tramos, dónde quedó la gente (barras) y dónde estás vos
function rutaNiveles(record, porNivel = [], { nivel = 0, compacta = false } = {}) {
  const max = Math.max(1, ...porNivel.map(b => b.n))
  const barras = compacta ? '' : `<div class="nr-barras">${Array.from({ length: 9 }, (_, i) => {
    const b = porNivel.find(x => Number(x.desde) === i * 10), n = b ? b.n : 0
    return `<span style="height:${Math.max(4, n / max * 100)}%" data-tip="${n} ${n === 1 ? 'ciudadano quedó' : 'ciudadanos quedaron'} entre ${i * 10 || 1} y ${i * 10 + 9}"></span>`
  }).join('')}</div>`
  const pos = v => `${Math.min(100, Math.max(0, v / 90 * 100))}%`
  return `<div class="nr ${compacta ? 'compacta' : ''}">
    ${barras}
    <div class="nr-pista">
      ${ND_ETAPAS.map(e => `<span class="nr-tramo" style="--c:${e.color}"><i style="width:${Math.min(100, Math.max(0, ((Math.max(record, nivel) - e.desde + 1) / 30) * 100))}%"></i></span>`).join('')}
      ${record > 0 ? `<span class="nr-marca record" style="left:${pos(record)}" title="Tu récord: ${record}"><b>${compacta ? '' : 'Tu récord · '}${record}</b></span>` : ''}
      ${nivel ? `<span class="nr-marca ahora" style="left:${pos(nivel - .5)}"></span>` : ''}
    </div>
    ${compacta ? '' : `<div class="nr-etapas">${ND_ETAPAS.map(e => `<span><b style="color:${e.color}">${e.id}</b> ${e.desde}–${e.hasta}</span>`).join('')}</div>`}
  </div>`
}

function proximaMeta(est, rank) {
  const r = est.record
  if (r >= 90) return 'Completaste Nerdocrasy. Muy pocos llegan acá.'
  if (!r) return 'Tu primer intento te pone en el ranking del Cabildo.'
  const top10 = rank[9]?.best_level, top1 = rank[0]?.best_level
  if (est.posicion && est.posicion > 10 && top10 && top10 - r <= 8) return `Te ${top10 - r + 1 === 1 ? 'falta 1 nivel' : `faltan ${top10 - r + 1} niveles`} para entrar al top 10.`
  if (est.posicion === 1) return 'Sos el número 1 del Cabildo. Todos te están persiguiendo.'
  const e = etapaDe(r)
  if (e.hasta - r <= 6 && e.id !== 'TRAP') return `A ${e.hasta - r + 1} niveles de desbloquear ${ND_ETAPAS[ND_ETAPAS.indexOf(e) + 1].id}.`
  if (top1 && est.posicion > 1) return `El #1 llegó al nivel ${top1}. ¿Hasta dónde llegás vos?`
  return 'Cada intento empieza en el nivel 1. Un error y quedás afuera.'
}

function pintarPlayroom() {
  const c = $('#pl-cuerpo'); if (!c) return
  const est = nd.est
  $('#pl-vivo').hidden = !(est?.jugando > 0)
  if (est) $('#pl-jugando').textContent = fmtNum(est.jugando)
  if (!nd.cargado) { c.innerHTML = '<div class="card au-vacio"><p class="muted">Cargando…</p></div>'; return }
  if (!estado.user) { c.innerHTML = `<div class="card au-vacio">${plIcono()}<h3>El Playroom es para ciudadanos</h3><p class="muted">Iniciá sesión para jugar.</p><a class="btn btn-dark" href="${APP_ACTUAL}">Iniciar sesión</a></div>`; return }
  if (!est) { c.innerHTML = `<div class="card au-vacio">${plIcono()}<h3>No se pudo cargar el Playroom</h3><p class="muted">Probá de nuevo en un momento.</p></div>`; return }
  if (!est.activo) { c.innerHTML = `<div class="card au-vacio">${plIcono()}<h3>El Playroom está cerrado</h3><p class="muted">Vuelve a abrir pronto. Tu récord y tu posición quedan guardados.</p></div>`; return }

  const r = est.record, e = r ? etapaDe(r) : null
  const puede = !!estado.butaca
  const top = nd.rank.slice(0, 10)
  const yoEnTop = top.some(x => x.seat_id === estado.butaca)
  const filaRank = (x, yo) => `<li class="${yo ? 'yo' : ''} ${x.rank_position <= 3 ? 'podio' : ''}">
      <span class="pr-pos">${x.rank_position <= 3 ? ['🥇', '🥈', '🥉'][x.rank_position - 1] : x.rank_position}</span>
      <span class="pr-quien">${esc(ndNombre(x.seat_id))}${/^Butaca #/.test(ndNombre(x.seat_id)) ? '' : `<small>#${x.seat_id}</small>`}</span>
      <span class="pr-niv">${chipEtapa(x.best_stage)}<b>${x.best_level}</b></span></li>`

  c.innerHTML = `
  <div class="pl-grid">
    <section class="nd-hero">
      <div class="nd-hero-fondo" aria-hidden="true"></div>
      <div class="nd-hero-cab">
        <span class="nd-hero-tag">Trivia cívica · 90 niveles · 12 s por pregunta</span>
        <h2 class="nd-marca">NERDOCRACY</h2>
        <p class="nd-hero-lema">No se gana. Descubrís hasta dónde sabés.</p>
      </div>
      <div class="nd-hero-datos">
        <div><small>Tu récord</small><b>${r || '—'}</b>${e ? chipEtapa(e.id) : '<span class="nd-sin">sin jugar</span>'}</div>
        <div><small>Posición</small><b>${est.posicion ? '#' + fmtNum(est.posicion) : '—'}</b><span class="nd-sin">de ${fmtNum(est.jugadores)}</span></div>
        <div><small>Superás al</small><b>${est.supero != null ? est.supero + '%' : '—'}</b><span class="nd-sin">del Cabildo</span></div>
      </div>
      ${rutaNiveles(r, est.por_nivel || [])}
      <div class="nd-hero-pie">
        <p class="nd-meta-txt">${esc(proximaMeta(est, nd.rank))}</p>
        ${puede ? `<button class="nd-jugar" id="nd-jugar"><span>▶</span> ${r ? 'Jugar de nuevo' : 'Jugar'}</button>`
          : `<a class="nd-jugar" href="${APP_ACTUAL}">Conseguí tu butaca para jugar</a>`}
      </div>
    </section>

    <aside class="card pl-rank">
      <div class="pl-rank-cab"><h3>Ranking del Cabildo</h3><small>${fmtNum(est.jugadores)} jugadores</small></div>
      ${top.length ? `<ol>${top.map(x => filaRank(x, x.seat_id === estado.butaca)).join('')}
        ${!yoEnTop && est.posicion ? `<li class="sep" aria-hidden="true">···</li>${filaRank({ rank_position: est.posicion, seat_id: estado.butaca, best_level: r, best_stage: est.etapa }, true)}` : ''}</ol>`
        : '<p class="muted">Todavía nadie entró al ranking. Puede ser tu nombre.</p>'}
    </aside>

    <section class="card pl-reglas">
      <h3>Cómo se juega</h3>
      <ul>
        <li><span class="pl-r-ico">○ ✕</span><div><b>Sí o No</b><p>Cada pregunta se responde con ○ Sí o ✕ No. En la compu: ← No · → Sí.</p></div></li>
        <li><span class="pl-r-ico">12s</span><div><b>Contra el reloj</b><p>Si se acaba el tiempo, quedás afuera.</p></div></li>
        <li><span class="pl-r-ico">✕1</span><div><b>Un error y se termina</b><p>Cada intento empieza en el nivel 1. Tu récord queda guardado.</p></div></li>
        <li><span class="pl-r-ico">3</span><div><b>Tres etapas</b><p>KNOW (saber), THINK (pensar) y TRAP (las trampas). Cada una más difícil.</p></div></li>
      </ul>
    </section>

    <section class="pl-proximos">
      <div class="pl-prox"><span>🗳️</span><b>Próximo juego</b><small>Pronto en el Playroom</small></div>
      <div class="pl-prox"><span>🏛️</span><b>Próximo juego</b><small>Pronto en el Playroom</small></div>
    </section>
  </div>`
}
const plIcono = () => `<span class="au-vacio-ico"><svg viewBox="0 0 24 24">${ICONOS.playroom}</svg></span>`

// ── Juego ──
function abrirJuego() {
  if (nd.abierto || !estado.butaca) return
  nd.abierto = true; nd.recordInicio = nd.est?.record || 0; nd.racha = 0
  $('#nd').hidden = false; document.body.style.overflow = 'hidden'
  ndJugar()
}

function cerrarJuego() {
  const id = nd.intento
  nd.intento = null; nd.q = null; nd.respondiendo = true; nd.abierto = false
  cancelAnimationFrame(nd.raf); clearTimeout(nd.tTrans)
  if (id) sb.rpc('nerdocrasy_abandon', { p_attempt_id: id }).then(() => {}, () => {})
  $('#nd').hidden = true; document.body.style.overflow = ''
  cargarPlayroom()
}

function ndEscena(html, clase = '') {
  const e = $('#nd-escena'); e.className = 'nd-escena ' + clase; e.innerHTML = html
}

function ndCabecera(nivel) {
  const et = etapaDe(nivel)
  $('#nd').style.setProperty('--etapa', et.color)
  $('#nd-ruta').innerHTML = nivel ? rutaNiveles(nd.recordInicio, [], { nivel, compacta: true }) : ''
  $('#nd-nivel-chip').innerHTML = nivel ? `<small>Nivel</small><b>${nivel}</b>${chipEtapa(et.id)}` : ''
}

async function ndJugar() {
  cancelAnimationFrame(nd.raf)
  nd.intento = null; nd.respondiendo = false; nd.racha = 0
  ndCabecera(0)
  ndEscena('<div class="nd-carga"><span class="nd-anillo"></span><p>Preparando tu intento…</p></div>')
  const { data, error } = await sb.rpc('nerdocrasy_start')
  if (!nd.abierto) { if (data?.attempt_id) sb.rpc('nerdocrasy_abandon', { p_attempt_id: data.attempt_id }).then(() => {}, () => {}); return }
  if (error) {
    const m = error.message || ''
    const txt = m.includes('no_verified_seat') ? 'Necesitás una butaca verificada para jugar.' : m.includes('not_authenticated') ? 'Iniciá sesión para jugar.' : 'No se pudo empezar. Probá de nuevo.'
    return ndEscena(`<div class="nd-carga"><p>${txt}</p><button class="nd-btn-sec" data-nd="volver">Volver al Playroom</button></div>`)
  }
  nd.intento = data.attempt_id
  ndMostrar(data.question, Number(data.question?.level) || 1)
}

// Imágenes válidas: https o SVG embebido (las ilustraciones de las preguntas van guardadas en la propia pregunta)
const ndImgOk = u => /^https:\/\//.test(u || '') || /^data:image\/svg\+xml[;,]/.test(u || '')

function precargar(q) {
  const urls = [q.visual_asset_url, q.visual_asset_a_url, q.visual_asset_b_url].filter(ndImgOk)
  if (!urls.length) return Promise.resolve()
  return Promise.race([Promise.all(urls.map(u => new Promise(res => { const i = new Image(); i.onload = i.onerror = res; i.src = u }))), new Promise(r => setTimeout(r, 1500))])
}

async function ndMostrar(q, nivel) {
  const t0 = Date.now()
  await precargar(q)
  if (!nd.abierto || !nd.intento) return
  nd.q = q; nd.nivel = nivel; nd.respondiendo = false
  ndCabecera(nivel)
  const segura = u => ndImgOk(u) ? esc(u) : ''
  let visual = ''
  if (q.visual_asset_a_url && q.visual_asset_b_url && segura(q.visual_asset_a_url))
    visual = `<div class="nd-visual dos"><figure><span>A</span><img src="${segura(q.visual_asset_a_url)}" alt="${esc(q.visual_alt || 'Imagen A')}"></figure><figure><span>B</span><img src="${segura(q.visual_asset_b_url)}" alt="${esc(q.visual_alt || 'Imagen B')}"></figure></div>`
  else if (segura(q.visual_asset_url))
    visual = `<div class="nd-visual"><img src="${segura(q.visual_asset_url)}" alt="${esc(q.visual_alt || '')}"></div>`
  const rec = nd.recordInicio, hechos = nivel - 1
  let aviso = ''
  if (rec > 0 && hechos === rec) aviso = '<span class="nd-aviso fuego">🔥 Igualaste tu récord. Uno más y es nuevo.</span>'
  else if (rec > 0 && hechos > rec) aviso = `<span class="nd-aviso fuego">🔥 Nuevo récord en curso: ${hechos}</span>`
  else if (rec > 0 && rec - hechos <= 3) aviso = `<span class="nd-aviso">A ${rec - hechos} de tu récord</span>`
  ndEscena(`
    <div class="nd-pregunta">
      ${aviso}
      ${visual}
      <h1 class="nd-texto">${esc(q.question_text)}</h1>
      ${q.visual_caption ? `<p class="nd-cap">${esc(q.visual_caption)}</p>` : ''}
    </div>
    <div class="nd-reloj" role="timer" aria-label="Tiempo"><i id="nd-barra"></i><b id="nd-seg">${ND_SEG}</b></div>
    <div class="nd-botones">
      <button class="nd-resp no" data-resp="OUT" aria-label="No (OUT)"><span class="g">✕</span><b>No</b><kbd>←</kbd></button>
      <button class="nd-resp si" data-resp="IN" aria-label="Sí (IN)"><span class="g">○</span><b>Sí</b><kbd>→</kbd></button>
    </div>`, 'entra')
  // Reloj local de 12 s desde que la pregunta llegó (el servidor da 2 s más de gracia por la latencia)
  nd.fin = t0 + ND_SEG * 1000 - 200
  const tick = () => {
    if (!nd.abierto || nd.respondiendo || !nd.intento) return
    const resta = Math.max(0, nd.fin - Date.now())
    const b = $('#nd-barra'), s = $('#nd-seg')
    if (b) { b.style.transform = `scaleX(${resta / (ND_SEG * 1000)})`; b.parentElement.classList.toggle('apurado', resta < 4000); b.parentElement.classList.toggle('critico', resta < 2000) }
    if (s) s.textContent = Math.ceil(resta / 1000)
    if (resta <= 0) return ndResponder('TIMEOUT')
    nd.raf = requestAnimationFrame(tick)
  }
  nd.raf = requestAnimationFrame(tick)
}

async function ndResponder(sel) {
  if (nd.respondiendo || !nd.intento || !nd.q || !nd.abierto) return
  nd.respondiendo = true
  cancelAnimationFrame(nd.raf)
  const id = nd.intento, nivel = nd.nivel
  $$('.nd-resp').forEach(b => { b.disabled = true; if (b.dataset.resp === sel) b.classList.add('elegido') })
  try {
    if (sel === 'TIMEOUT') {
      const { data } = await sb.rpc('nerdocrasy_timeout', { p_attempt_id: id })
      nd.intento = null
      return ndFin({ motivo: 'tiempo', nivel: nivel - 1, correcta: data?.correct_answer, expl: data?.explanation, record: !!data?.is_record })
    }
    const { data, error } = await sb.rpc('nerdocrasy_submit_answer', { p_attempt_id: id, p_question_id: nd.q.question_id, p_answer: sel })
    if (error) throw error
    if (!nd.abierto) return
    if (data.status === 'timeout') { nd.intento = null; return ndFin({ motivo: 'tiempo', nivel: nivel - 1, record: !!data.is_record }) }
    if (data.status === 'complete') { nd.intento = null; return ndCompleto() }
    if (data.status === 'eliminated') {
      $(`.nd-resp[data-resp="${sel}"]`)?.classList.add('mal')
      await new Promise(r => setTimeout(r, 650))
      nd.intento = null
      return ndFin({ motivo: 'error', nivel: nivel - 1, correcta: data.correct_answer, expl: data.explanation, record: !!data.is_record })
    }
    if (data.status === 'next') {
      nd.racha++
      $(`.nd-resp[data-resp="${sel}"]`)?.classList.add('bien')
      $('#nd-escena').insertAdjacentHTML('beforeend', `<span class="nd-mas">+1</span>`)
      await new Promise(r => setTimeout(r, 380))
      if (!nd.abierto) return
      if (data.stage_transition) {
        const nueva = ND_ETAPAS.find(e => e.id === data.stage), vieja = ND_ETAPAS[ND_ETAPAS.indexOf(nueva) - 1]
        ndCabecera(data.reached_level)
        ndEscena(`<div class="nd-trans" style="--c:${nueva.color}">
          <span class="nd-trans-ok">${vieja.id} ✓</span>
          <h1>${esc(nueva.lema)}</h1>
          <span class="nd-trans-nueva">Empieza ${chipEtapa(nueva.id, 'grande')}</span>
          <p>Niveles ${nueva.desde}–${nueva.hasta}</p></div>`, 'trans')
        // La pregunta siguiente ya tiene su plazo en el servidor: no se demora la transición más de lo justo
        await new Promise(r => { nd.tTrans = setTimeout(r, 1600) })
      }
      return ndMostrar(data.question, data.reached_level)
    }
    throw new Error('respuesta inesperada')
  } catch (e) {
    console.warn('nerdocrasy:', e)
    nd.intento = null
    ndFin({ motivo: 'conexion', nivel: nivel - 1 })
  }
}

async function ndFin(f) {
  ndCabecera(0)
  const antes = nd.recordInicio, nuevo = f.record && f.nivel > antes
  const e = f.nivel > 0 ? etapaDe(f.nivel) : null
  const titulo = f.motivo === 'tiempo' ? 'Se acabó el tiempo' : f.motivo === 'conexion' ? 'Se cortó la conexión' : 'Eliminado'
  const resp = f.correcta === 'IN' ? '○ Sí' : f.correcta === 'OUT' ? '✕ No' : ''
  ndEscena(`
    <div class="nd-fin ${nuevo ? 'record' : ''}">
      <span class="nd-fin-tit">${titulo}</span>
      ${nuevo ? '<span class="nd-fin-badge">★ Nuevo récord</span>' : ''}
      <div class="nd-fin-num"><small>Llegaste al nivel</small><b>${f.nivel > 0 ? f.nivel : '0'}</b>${e ? chipEtapa(e.id) : ''}</div>
      ${nuevo ? `<p class="nd-fin-sub">Tu récord pasó de <b>${antes}</b> a <b>${f.nivel}</b>.</p>`
        : antes > 0 ? `<p class="nd-fin-sub">Tu récord sigue en <b>${antes}</b>.${antes - f.nivel >= 0 ? ` Para superarlo te ${antes - f.nivel + 1 === 1 ? 'faltó 1 nivel' : `faltaron ${antes - f.nivel + 1} niveles`}.` : ''}</p>` : ''}
      ${resp ? `<div class="nd-fin-exp"><span>La respuesta era <b>${resp}</b></span>${f.expl ? `<p>${esc(f.expl)}</p>` : ''}</div>` : ''}
      <p class="nd-fin-pos" id="nd-fin-pos"></p>
      <div class="nd-fin-btns">
        <button class="nd-jugar" data-nd="otra"><span>↻</span> Jugar de nuevo</button>
        <button class="nd-btn-sec" data-nd="volver">Volver al Playroom</button>
      </div>
      <small class="nd-atajo">Enter para jugar de nuevo</small>
    </div>`, 'fin')
  if (nuevo) nd.recordInicio = f.nivel
  // posición actualizada
  try {
    const { data } = await sb.rpc('v2_nerdocrasy_estado')
    if (data) {
      const antesPos = nd.est?.posicion
      nd.est = data
      const p = $('#nd-fin-pos')
      if (p && data.posicion) p.innerHTML = antesPos && data.posicion < antesPos
        ? `Subiste al puesto <b>#${data.posicion}</b> de ${fmtNum(data.jugadores)} (antes #${antesPos}).`
        : `Estás en el puesto <b>#${data.posicion}</b> de ${fmtNum(data.jugadores)}.`
    }
  } catch (e) {}
}

function ndCompleto() {
  ndCabecera(0)
  nd.recordInicio = 90
  ndEscena(`<div class="nd-fin record completo">
    <span class="nd-fin-badge">★ Nerdocrasy completo</span>
    <div class="nd-fin-num"><small>Llegaste al nivel</small><b>90</b></div>
    <div class="nd-fin-etapas">${ND_ETAPAS.map(e => chipEtapa(e.id, 'grande')).join('')}</div>
    <p class="nd-fin-sub">Saber, pensar y no caer en las trampas. Sos parte de un grupo muy chico.</p>
    <div class="nd-fin-btns"><button class="nd-btn-sec" data-nd="volver">Volver al Playroom</button></div>
  </div>`, 'fin')
}

function enlazarPlayroom() {
  $('#pl-vista')?.addEventListener('click', e => {
    if (e.target.closest('#nd-jugar')) abrirJuego()
  })
  $('#pl-vista')?.addEventListener('mouseover', e => {
    const t = e.target.closest('.nr-barras [data-tip]'); const tip = $('#es-tip')
    if (!tip) return
    if (!t) { tip.hidden = true; return }
    const r = t.getBoundingClientRect(), z = parseFloat(getComputedStyle(document.body).zoom) || 1
    tip.textContent = t.dataset.tip; tip.hidden = false
    tip.style.left = (r.left + r.width / 2) / z - tip.offsetWidth / 2 + 'px'; tip.style.top = r.top / z - tip.offsetHeight - 8 + 'px'
  })
  $('#nd').addEventListener('click', e => {
    const r = e.target.closest('[data-resp]'); if (r) return ndResponder(r.dataset.resp)
    if (e.target.closest('#nd-salir')) return cerrarJuego()
    const a = e.target.closest('[data-nd]')?.dataset.nd
    if (a === 'otra') { nd.recordInicio = Math.max(nd.recordInicio, nd.est?.record || 0); return ndJugar() }
    if (a === 'volver') return cerrarJuego()
  })
  document.addEventListener('keydown', e => {
    if ($('#nd').hidden) return
    if (e.key === 'Escape') { e.preventDefault(); return cerrarJuego() }
    if ($('.nd-resp') && !nd.respondiendo) {
      if (['ArrowLeft', 'a', 'A'].includes(e.key)) { e.preventDefault(); return ndResponder('OUT') }
      if (['ArrowRight', 'd', 'D'].includes(e.key)) { e.preventDefault(); return ndResponder('IN') }
    }
    if (e.key === 'Enter' && $('[data-nd="otra"]')) { e.preventDefault(); ndJugar() }
  })
  window.addEventListener('pagehide', () => { if (nd.intento) sb.rpc('nerdocrasy_abandon', { p_attempt_id: nd.intento }) })
}

// ══════════════════════════════════════════════════════════════
//  APRENDÉ — el Cabildo para principiantes
//  Lecciones cortas con escenas animadas (SVG + CSS), simuladores para probar sin miedo
//  y una pregunta al final. El progreso se guarda solo en este navegador.
// ══════════════════════════════════════════════════════════════
const AC = { azul: '#3b6fd8', rojo: '#e0483e', oro: '#f2b33d', verde: '#2f9e6b', violeta: '#8a5cd6', teal: '#1fa3a3', gris: '#9aa0b5', piel: '#f0c8a0' }
const sv = b => `<svg class="ap-svg" viewBox="0 0 640 360" aria-hidden="true">${b}</svg>`
const dl = d => `style="--d:${d}s"`
const tx = (x, y, s, size = 18, cls = 'tinta', w = 800, extra = '') => {
  const anim = /class=/.test(extra), t = `<text x="${x}" y="${y}" class="${cls}" font-size="${size}" font-weight="${w}" text-anchor="middle" ${anim ? '' : extra}>${s}</text>`
  return anim ? `<g ${extra}>${t}</g>` : t
}

function aPer(x, y, s = 1, c = AC.azul, extra = '') {
  return `<g ${extra}><circle cx="${x}" cy="${y - 52 * s}" r="${13 * s}" fill="${AC.piel}" class="borde" stroke-width="${3 * s}"/>
    <path d="M${x - 18 * s} ${y}v${-24 * s}a${18 * s} ${18 * s} 0 0 1 ${36 * s} 0v${24 * s}z" fill="${c}" class="borde" stroke-width="${3 * s}"/></g>`
}
function aUrna(x, y, s = 1, extra = '') {
  const w = 130 * s, h = 100 * s
  return `<g ${extra}><rect x="${x - w / 2}" y="${y - h}" width="${w}" height="${h}" rx="${9 * s}" class="papel borde" stroke-width="${4 * s}"/>
    <rect x="${x - w / 2 - 6 * s}" y="${y - h - 12 * s}" width="${w + 12 * s}" height="${16 * s}" rx="${5 * s}" fill="${AC.azul}" class="borde" stroke-width="${4 * s}"/>
    <rect x="${x - 30 * s}" y="${y - h - 7 * s}" width="${60 * s}" height="${6 * s}" rx="3" class="relleno-tinta"/>
    ${tx(x, y - h / 2 + 8 * s, 'VOTO', 20 * s, 'azul', 900, `letter-spacing="${3 * s}"`)}</g>`
}
const aPapel = (x, y, s = 1, extra = '') => `<g ${extra}><rect x="${x - 22 * s}" y="${y - 30 * s}" width="${44 * s}" height="${58 * s}" rx="${4 * s}" class="papel borde" stroke-width="${3 * s}"/><path d="M${x - 10 * s} ${y - 4 * s}l${8 * s} ${9 * s}l${14 * s} ${-18 * s}" fill="none" stroke="${AC.azul}" stroke-width="${5 * s}" stroke-linecap="round" stroke-linejoin="round"/></g>`
function aHemi(cx, cy, { filas = 4, r0 = 70, paso = 24, prendidas = 0.55, yo = 37, rad = 6.5 } = {}) {
  let i = 0, out = ''
  for (let f = 0; f < filas; f++) {
    const r = r0 + f * paso, n = Math.floor(Math.PI * r / (rad * 3.2))
    for (let k = 0; k < n; k++) {
      const a = Math.PI * (k + .5) / n, x = cx - r * Math.cos(a), y = cy - r * Math.sin(a)
      const h = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1
      const cls = i === yo ? 'seat yo' : h < prendidas ? 'seat on' : 'seat'
      out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad}" class="${cls}" ${cls !== 'seat' ? dl((h * 2.4).toFixed(2)) : ''}/>`
      i++
    }
  }
  return out
}
const aChip = (x, y, t, c = AC.azul, extra = '') => `<g ${extra}><rect x="${x - t.length * 5.4 - 14}" y="${y - 17}" width="${t.length * 10.8 + 28}" height="30" rx="15" fill="${c}"/>${tx(x, y + 4, t, 15, 'blanco', 800)}</g>`
const aCaja = (x, y, w, h, extra = '') => `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="14" class="papel borde" stroke-width="3" ${extra}/>`
const aFlecha = (x1, y1, x2, y2, extra = '') => `<g class="flecha" ${extra}><path d="M${x1} ${y1}L${x2} ${y2}"/><path d="M${x2} ${y2}l${-12 * Math.cos(Math.atan2(y2 - y1, x2 - x1) - .5)} ${-12 * Math.sin(Math.atan2(y2 - y1, x2 - x1) - .5)}M${x2} ${y2}l${-12 * Math.cos(Math.atan2(y2 - y1, x2 - x1) + .5)} ${-12 * Math.sin(Math.atan2(y2 - y1, x2 - x1) + .5)}"/></g>`
const aTacha = (x, y, s = 1, extra = '') => `<path d="M${x - 16 * s} ${y - 16 * s}L${x + 16 * s} ${y + 16 * s}M${x + 16 * s} ${y - 16 * s}L${x - 16 * s} ${y + 16 * s}" stroke="${AC.rojo}" stroke-width="${7 * s}" stroke-linecap="round" class="a-pop" ${extra}/>`
const aBurbuja = (x, y, w, t, mia = false, extra = '') => `<g ${extra}><rect x="${x}" y="${y}" width="${w}" height="40" rx="14" ${mia ? `fill="${AC.azul}"` : 'class="papel borde" stroke-width="2.5"'}/>${tx(x + w / 2, y + 26, t, 14, mia ? 'blanco' : 'tinta', 600)}</g>`
const aCheck = (x, y, s = 1, extra = '') => `<g ${extra}><circle cx="${x}" cy="${y}" r="${16 * s}" fill="${AC.verde}"/><path d="M${x - 7 * s} ${y}l${5 * s} ${6 * s}l${10 * s} ${-12 * s}" fill="none" stroke="#fff" stroke-width="${4 * s}" stroke-linecap="round" stroke-linejoin="round"/></g>`

const ESCENAS = {
  hemiciclo: () => sv(`${aHemi(320, 300, { filas: 6, r0: 90, paso: 30 })}
    <g class="a-pop" ${dl(1.2)}><rect x="252" y="306" width="136" height="34" rx="17" fill="${AC.oro}"/>${tx(320, 329, 'Tu butaca', 16, 'tinta', 900)}</g>`),
  ciclo: () => sv(`<circle cx="320" cy="180" r="118" class="giro-pista a-girar"/>
    ${[[320, 62, '💡', 'Proponés', 0], [430, 245, '💬', 'Debatís', .3], [210, 245, '🗳️', 'Votás', .6]].map(([x, y, e, t, d]) =>
      `<g class="a-pop" ${dl(d)}><circle cx="${x}" cy="${y}" r="50" class="papel borde" stroke-width="3"/><text x="${x}" y="${y + 12}" font-size="36" text-anchor="middle">${e}</text>${tx(x, y + 78, t, 18)}</g>`).join('')}`),
  uno: () => sv(`${aPer(110, 230, 1.6, AC.teal, `class="a-pop" ${dl(0)}`)}${tx(215, 200, '=', 54, 'tenue', 900, `class="a-pop" ${dl(.4)}`)}
    <g class="a-pop" ${dl(.7)}><rect x="262" y="130" width="96" height="110" rx="16" fill="${AC.oro}" class="borde" stroke-width="4"/>${tx(310, 196, '#250', 26, 'tinta', 900)}</g>
    ${tx(405, 200, '=', 54, 'tenue', 900, `class="a-pop" ${dl(1.1)}`)}${aPapel(500, 200, 1.8, `class="a-pop" ${dl(1.4)}`)}
    ${tx(110, 290, '1 persona', 18, 'tinta', 800, `class="a-fade" ${dl(.2)}`)}${tx(310, 290, '1 butaca', 18, 'tinta', 800, `class="a-fade" ${dl(.9)}`)}${tx(500, 290, '1 voto', 18, 'tinta', 800, `class="a-fade" ${dl(1.6)}`)}`),
  verif: () => sv(`<g class="a-pop"><rect x="60" y="110" width="150" height="96" rx="12" class="papel borde" stroke-width="3"/><circle cx="100" cy="150" r="20" fill="${AC.gris}"/><rect x="132" y="138" width="60" height="9" rx="4" class="suave"/><rect x="132" y="156" width="44" height="9" rx="4" class="suave"/>${tx(135, 232, 'Documento', 15, 'tenue', 700)}</g>
    <g class="a-pop" ${dl(.3)}><rect x="236" y="96" width="70" height="124" rx="14" class="papel borde" stroke-width="3"/>${aPer(271, 196, .9, AC.teal)}${tx(271, 246, 'Selfie', 15, 'tenue', 700)}</g>
    ${aFlecha(320, 160, 380, 160, `class="a-fade" ${dl(.8)}`)}
    <g class="a-pop" ${dl(1.1)}><path d="M450 90l60 22v50c0 40-28 66-60 78c-32-12-60-38-60-78v-50z" fill="${AC.verde}" class="borde" stroke-width="3"/><path d="M428 160l16 17l30-34" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></g>
    <g class="a-pop" ${dl(1.7)}><rect x="530" y="122" width="84" height="76" rx="14" fill="${AC.oro}" class="borde" stroke-width="3"/>${tx(572, 168, '#250', 22, 'tinta', 900)}</g>
    ${tx(320, 312, 'Lo hacés una sola vez', 18, 'tinta', 800, `class="a-fade" ${dl(2.1)}`)}`),
  anonimo: () => sv(`<g class="a-pop"><ellipse cx="320" cy="96" rx="110" ry="26" class="papel borde" stroke-width="3"/><path d="M210 96v150c0 14 49 26 110 26s110-12 110-26V96" class="papel borde" stroke-width="3"/>
      ${tx(320, 170, 'Butaca #250', 22, 'tinta', 900)}${tx(320, 205, 'código •••••', 18, 'tenue', 700)}</g>
    ${['Nombre', 'N° de documento', 'Fotos'].map((t, i) => `<g class="a-salir" ${dl(.8 + i * .5)}>${aChip(i === 1 ? 528 : 108, 120 + i * 70, t, AC.rojo)}</g>${aTacha(i === 1 ? 528 : 108, 117 + i * 70, 1.1, dl(1.3 + i * .5))}`).join('')}
    ${tx(320, 330, 'No se guardan', 18, 'rojo', 800, `class="a-fade" ${dl(2.6)}`)}`),
  mostrar: () => sv(`<g class="a-pop"><rect x="200" y="70" width="240" height="220" rx="22" class="papel borde" stroke-width="3"/><circle cx="320" cy="140" r="38" fill="${AC.violeta}"/>${tx(320, 153, 'A', 36, 'blanco', 900)}
    <g class="alt-a">${tx(320, 220, 'Ayn Rand', 26, 'tinta', 900)}</g><g class="alt-b">${tx(320, 220, 'Butaca #250', 24, 'tinta', 900)}</g><g class="alt-a">${tx(320, 258, '“Ideas hoy, libertad mañana”', 14, 'tenue', 600)}</g></g>
    <g class="a-fade" ${dl(.6)}><rect x="470" y="150" width="70" height="38" rx="19" class="interruptor"/><circle cx="489" cy="169" r="14" fill="#fff" class="perilla"/>${tx(505, 218, 'mostrar alias', 13, 'tenue', 700)}</g>`),
  vlista: () => sv(`<g class="a-pop"><rect x="120" y="70" width="400" height="220" rx="20" class="papel borde" stroke-width="3"/>
    <rect x="146" y="96" width="92" height="26" rx="13" fill="${AC.azul}" opacity=".15"/>${tx(192, 114, 'POLÍTICA', 12, 'azul', 900)}
    <circle cx="480" cy="110" r="7" fill="${AC.rojo}" class="a-latir"/>${tx(440, 115, 'En vivo', 13, 'rojo', 800)}
    <rect x="146" y="140" width="330" height="16" rx="8" class="suave"/><rect x="146" y="166" width="250" height="16" rx="8" class="suave"/>
    <circle cx="186" cy="240" r="24" fill="none" class="pista-reloj"/><circle cx="186" cy="240" r="24" fill="none" stroke="${AC.oro}" stroke-width="6" stroke-linecap="round" class="a-reloj" transform="rotate(-90 186 240)"/>
    ${tx(268, 246, 'Cierra en 3 h', 16, 'tinta', 800)}<rect x="360" y="222" width="130" height="40" rx="12" fill="${AC.azul}"/>${tx(425, 248, 'Votar', 16, 'blanco', 900)}</g>`),
  velegir: () => sv(`${tx(320, 70, '¿Debe el Cabildo exigir una auditoría?', 20, 'tinta', 800, 'class="a-fade"')}
    ${[['Sí', AC.verde, 160], ['No', AC.rojo, 320], ['Abstención', AC.gris, 480]].map(([t, c, x], i) => `<g class="a-pop ${i === 0 ? 'elegida' : ''}" ${dl(.2 + i * .15)}><rect x="${x - 70}" y="120" width="140" height="110" rx="20" class="papel borde opcion" stroke-width="3"/><circle cx="${x}" cy="160" r="20" fill="${c}"/>${tx(x, 210, t, 18)}</g>`).join('')}
    <g class="a-tocar"><path d="M168 300c-6-22-2-44 6-60c4-8 14-6 14 2l-2 30l18-6c10-3 18 4 16 14l-6 30c-2 10-10 16-20 16h-14c-6 0-10-4-12-8z" fill="${AC.piel}" class="borde" stroke-width="3"/></g>`),
  vuno: () => sv(`${aUrna(320, 300, 1.3)}<g class="a-volar">${aPapel(320, 80, 1.2)}</g>
    <g class="a-rebote">${aPapel(470, 120, 1, '')}</g><g class="a-pop" ${dl(2.3)}>${aChip(500, 70, 'Ya votaste', AC.rojo)}</g>
    ${tx(140, 160, '1 voto', 26, 'tinta', 900, `class="a-pop" ${dl(.4)}`)}${tx(140, 192, 'por butaca', 18, 'tenue', 700, `class="a-pop" ${dl(.5)}`)}`),
  surna: () => sv(`${aUrna(320, 170, 1.05, 'class="a-pop"')}
    ${aFlecha(270, 190, 170, 240, `class="a-fade" ${dl(.6)}`)}${aFlecha(370, 190, 470, 240, `class="a-fade" ${dl(.6)}`)}
    <g class="a-pop" ${dl(.9)}>${aCaja(130, 290, 220, 86)}${tx(130, 276, 'PARTICIPÓ', 13, 'tenue', 900, 'letter-spacing="2"')}${tx(130, 306, 'Butaca #250 ✓', 19, 'tinta', 900)}</g>
    <g class="a-pop" ${dl(1.2)}>${aCaja(510, 290, 220, 86)}${tx(510, 276, 'CONTADOR', 13, 'tenue', 900, 'letter-spacing="2"')}${tx(510, 306, 'Sí 1.206 · No 412', 19, 'tinta', 900)}</g>
    <path d="M245 300H395" stroke-dasharray="8 8" class="corte a-fade" ${dl(1.7)}/>${aTacha(320, 300, 1.2, dl(2.1))}
    ${tx(320, 40, 'Se separan para siempre', 18, 'tinta', 800, `class="a-fade" ${dl(2.4)}`)}`),
  scandado: () => sv(`<g class="a-pop">${aCaja(320, 180, 420, 230)}
    ${[['Sí', AC.verde, .62], ['No', AC.rojo, .28], ['Abst.', AC.gris, .1]].map(([t, c, p], i) => `${tx(160, 128 + i * 52, t, 15, 'tinta', 800, 'text-anchor="start"')}<rect x="210" y="${112 + i * 52}" width="${300 * p}" height="22" rx="11" fill="${c}" class="borroso"/>`).join('')}</g>
    <g class="a-candado"><rect x="286" y="160" width="68" height="56" rx="10" fill="${AC.oro}" class="borde" stroke-width="3"/><path d="M298 160v-16a22 22 0 0 1 44 0v16" fill="none" class="borde" stroke-width="7"/></g>
    ${tx(320, 330, 'Mientras está abierta, solo se ve cuántos votaron', 16, 'tenue', 700, `class="a-fade" ${dl(.8)}`)}`),
  snadie: () => sv(`${[['🕵️', 120], ['👩‍💼', 250], ['🏛️', 390], ['🤖', 520]].map(([e, x], i) => `<g class="a-pop" ${dl(i * .2)}><circle cx="${x}" cy="150" r="46" class="papel borde" stroke-width="3"/><text x="${x}" y="166" font-size="44" text-anchor="middle">${e}</text></g>${aTacha(x + 34, 116, 1, dl(.9 + i * .2))}`).join('')}
    ${tx(320, 260, 'Qué votaste no se guarda', 24, 'tinta', 900, `class="a-fade" ${dl(1.8)}`)}${tx(320, 292, 'ni en el servidor ni en tu teléfono: solo suma al total', 16, 'tenue', 700, `class="a-fade" ${dl(2)}`)}`),
  duno: () => sv(`<g class="a-pop"><rect x="60" y="110" width="200" height="140" rx="18" class="papel borde" stroke-width="3"/>${tx(160, 150, 'VOTACIÓN', 13, 'azul', 900, 'letter-spacing="2"')}<rect x="84" y="166" width="152" height="12" rx="6" class="suave"/><rect x="84" y="188" width="110" height="12" rx="6" class="suave"/>${tx(160, 232, '🗳️', 26)}</g>
    ${aFlecha(272, 180, 330, 180, `class="a-fade" ${dl(.4)}`)}
    ${aBurbuja(350, 70, 210, 'Yo creo que sí, porque…', false, `class="a-pop" ${dl(.7)}`)}${aBurbuja(400, 126, 200, 'Pero pensá en…', true, `class="a-pop" ${dl(1.1)}`)}${aBurbuja(350, 182, 230, 'Buen punto, aunque…', false, `class="a-pop" ${dl(1.5)}`)}${aBurbuja(420, 238, 170, '¡Coincido!', true, `class="a-pop" ${dl(1.9)}`)}
    ${tx(320, 330, 'Cada votación tiene su debate', 17, 'tenue', 800, `class="a-fade" ${dl(2.2)}`)}`),
  dmano: () => sv(`${[0, 1, 2, 3, 4, 5].map(i => `<g class="a-pop" ${dl(i * .25)}><circle cx="${90 + i * 92}" cy="170" r="34" class="papel borde" stroke-width="3" ${i < 3 ? `stroke="${AC.verde}"` : ''}/><text x="${90 + i * 92}" y="184" font-size="34" text-anchor="middle">${i < 3 ? '🎙️' : '✋'}</text>${tx(90 + i * 92, 234, '#' + [250, 12, 77, 403, 9, 610][i], 15, 'tenue', 800)}</g>`).join('')}
    <rect x="50" y="108" width="276" height="150" rx="20" fill="none" stroke="${AC.verde}" stroke-width="3" stroke-dasharray="8 8" class="a-fade" ${dl(1.8)}/>${tx(188, 96, 'Hablan ahora (3)', 15, 'verde', 900, `class="a-fade" ${dl(1.9)}`)}${tx(462, 96, 'Esperan su turno', 15, 'tenue', 800, `class="a-fade" ${dl(2.1)}`)}`),
  dreglas: () => sv(`<g class="a-pop">${aCaja(320, 140, 440, 120)}<rect x="130" y="112" width="300" height="14" rx="7" class="suave"/><rect x="130" y="136" width="250" height="14" rx="7" class="suave"/><rect x="130" y="160" width="180" height="14" rx="7" class="suave"/>${tx(500, 186, '280', 18, 'azul', 900, 'class="a-contar"')}</g>
    <g class="a-pop" ${dl(.6)}><circle cx="200" cy="268" r="34" class="papel borde" stroke-width="3"/><circle cx="200" cy="268" r="26" fill="none" stroke="${AC.rojo}" stroke-width="6" class="a-reloj" transform="rotate(-90 200 268)"/>${tx(200, 275, '60 s', 15, 'tinta', 900)}</g>
    ${tx(380, 262, 'Máximo 280 caracteres', 17, 'tinta', 800, `class="a-fade" ${dl(.9)}`)}${tx(380, 290, 'y 1 minuto entre mensajes', 17, 'tinta', 800, `class="a-fade" ${dl(1.1)}`)}`),
  pidea: () => sv(`<g class="a-pop"><circle cx="150" cy="150" r="60" fill="${AC.oro}" class="borde" stroke-width="3"/><rect x="128" y="206" width="44" height="30" rx="6" class="papel borde" stroke-width="3"/>${tx(150, 166, '💡', 46)}</g>
    ${aFlecha(230, 170, 300, 170, `class="a-fade" ${dl(.5)}`)}
    <g class="a-lanzar" ${dl(.9)}><rect x="320" y="90" width="260" height="170" rx="18" class="papel borde" stroke-width="3"/>${tx(450, 124, 'MI PROPUESTA', 13, 'azul', 900, 'letter-spacing="2"')}<rect x="344" y="142" width="212" height="12" rx="6" class="suave"/><rect x="344" y="164" width="170" height="12" rx="6" class="suave"/><rect x="344" y="200" width="110" height="36" rx="12" fill="${AC.azul}"/>${tx(399, 224, 'Lanzar 🚀', 14, 'blanco', 900)}</g>
    ${tx(320, 320, 'Una idea en 280 caracteres + contexto y enlaces', 16, 'tenue', 700, `class="a-fade" ${dl(1.4)}`)}`),
  pmeta: () => sv(`<g transform="translate(150 40) scale(3.4)" class="arco-esc">${Array.from({ length: 20 }, (_, i) => { const fila = i < 8 ? 0 : 1, n = fila ? 12 : 8, k = fila ? i - 8 : i, r = fila ? 38 : 24, a = Math.PI - (k + .5) * Math.PI / n; return `<circle cx="${(50 + r * Math.cos(a)).toFixed(1)}" cy="${(46 - r * Math.sin(a)).toFixed(1)}" r="3.6" class="seat on" ${dl((i * .12).toFixed(2))}/>` }).join('')}</g>
    ${tx(320, 225, '20 butacas', 28, 'tinta', 900, `class="a-pop" ${dl(2.5)}`)}<rect x="170" y="262" width="300" height="12" rx="6" class="suave"/><rect x="170" y="262" width="300" height="12" rx="6" fill="${AC.rojo}" class="a-mecha"/>${tx(320, 310, 'en 48 horas', 18, 'rojo', 800)}`),
  pcamino: () => sv(`${[['Campaña', '🔥', 80, AC.oro], ['Meta: 20', '🎯', 240, AC.verde], ['Revisión', '🔎', 400, AC.violeta], ['Votación', '🗳️', 560, AC.azul]].map(([t, e, x, c], i) => `<g class="a-pop" ${dl(i * .5)}><circle cx="${x}" cy="160" r="48" fill="${c}" class="borde" stroke-width="3"/><text x="${x}" y="175" font-size="40" text-anchor="middle">${e}</text>${tx(x, 240, t, 17)}</g>${i < 3 ? aFlecha(x + 56, 160, x + 104, 160, `class="a-fade" ${dl(i * .5 + .3)}`) : ''}`).join('')}
    <circle cx="80" cy="100" r="9" fill="${AC.rojo}" class="a-viaje"/>${tx(320, 310, 'Si llega a la meta, el Cabildo la puede votar', 17, 'tenue', 800, `class="a-fade" ${dl(2.2)}`)}`),
  puna: () => sv(`<g class="a-pop"><rect x="230" y="80" width="180" height="190" rx="18" class="papel borde" stroke-width="3" stroke="${AC.oro}"/>${tx(320, 120, 'EN CARRERA', 13, 'oro', 900, 'letter-spacing="2"')}${tx(320, 190, '🔥', 52)}<rect x="262" y="222" width="116" height="12" rx="6" class="suave"/></g>
    ${[110, 530].map((x, i) => `<g class="a-fade" ${dl(.6 + i * .2)} opacity=".45"><rect x="${x - 70}" y="100" width="140" height="150" rx="16" class="papel borde" stroke-width="3" stroke-dasharray="8 8"/>${tx(x, 190, '🔒', 40)}</g>`).join('')}
    ${tx(320, 320, 'Una propuesta en carrera a la vez', 18, 'tinta', 800, `class="a-fade" ${dl(1)}`)}`),
  bque: () => sv(`<g class="a-pop"><path d="M320 60v200" class="borde" stroke-width="5"/><path d="M322 64h110l-24 30l24 30h-110z" fill="${AC.violeta}" class="borde" stroke-width="3"/></g>
    ${aPer(320, 300, 1.4, AC.oro, `class="a-pop" ${dl(.4)}`)}<g class="a-pop" ${dl(.7)}><rect x="250" y="312" width="140" height="30" rx="15" fill="${AC.oro}"/>${tx(320, 333, 'Anfitrión', 15, 'tinta', 900)}</g>
    ${Array.from({ length: 12 }, (_, i) => { const a = Math.PI * (i / 11), x = 320 - 230 * Math.cos(a), y = 300 - 150 * Math.sin(a); return `<g class="a-acercar" ${dl((1 + i * .12).toFixed(2))}><circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="18" class="papel borde" stroke-width="3"/>${tx(x.toFixed(0), (y + 6).toFixed(0), '?', 16, 'tenue', 900)}</g>` }).join('')}`),
  bsumar: () => sv(`${[['Bloque A', AC.azul, 150], ['Bloque B', AC.verde, 490]].map(([t, c, x]) => `<g class="a-pop"><rect x="${x - 100}" y="80" width="200" height="170" rx="20" fill="${c}" opacity=".12"/><rect x="${x - 100}" y="80" width="200" height="170" rx="20" fill="none" stroke="${c}" stroke-width="3"/>${tx(x, 112, t, 18, 'tinta', 900)}</g>`).join('')}
    <g class="a-mudar">${aPer(150, 220, 1.1, AC.teal)}</g>
    <g class="a-pop" ${dl(1.8)}><rect x="264" y="270" width="112" height="62" rx="12" class="papel borde" stroke-width="3"/><rect x="264" y="270" width="112" height="20" rx="10" fill="${AC.rojo}"/>${tx(320, 322, '30 días', 18, 'tinta', 900)}</g>`),
  bcrear: () => sv(`<g class="a-pop"><rect x="70" y="100" width="180" height="120" rx="18" class="papel borde" stroke-width="3"/>${aPer(120, 196, .8, AC.oro)}${tx(190, 150, 'Martín L.', 17, 'tinta', 900)}${tx(190, 176, 'público', 13, 'verde', 800)}</g>
    <g class="a-pop" ${dl(.6)}><rect x="300" y="110" width="120" height="76" rx="10" class="papel borde" stroke-width="3"/><circle cx="330" cy="140" r="14" fill="${AC.gris}"/><rect x="352" y="132" width="50" height="8" rx="4" class="suave"/>${tx(360, 210, 'DNI', 14, 'tenue', 900)}</g>
    <g class="a-guardar" ${dl(1.2)}><rect x="300" y="110" width="120" height="76" rx="10" fill="${AC.gris}" opacity=".0"/></g>
    <g class="a-pop" ${dl(1.4)}><rect x="460" y="90" width="130" height="150" rx="14" fill="#4b5470" class="borde" stroke-width="3"/><circle cx="525" cy="165" r="30" fill="none" stroke="#c9cfe0" stroke-width="6"/><path d="M525 165l18-10" stroke="#c9cfe0" stroke-width="6" stroke-linecap="round" class="a-girar-perilla"/>${tx(525, 270, 'Caja fuerte', 15, 'tenue', 800)}</g>
    ${aFlecha(428, 150, 452, 150, `class="a-fade" ${dl(1)}`)}${tx(320, 320, 'Tu DNI solo lo ve el equipo, y se borra si el bloque cierra', 15, 'tenue', 700, `class="a-fade" ${dl(2)}`)}`),
  badentro: () => sv(`${[['Idea 1', 110, 90, AC.oro, '-4'], ['Idea 2', 260, 110, '#9be3c8', '3'], ['Idea 3', 410, 86, '#b9c8ff', '-2']].map(([t, x, y, c, r], i) => `<g class="a-pop" ${dl(i * .3)} transform="rotate(${r} ${x + 60} ${y + 60})"><rect x="${x}" y="${y}" width="120" height="110" rx="6" fill="${c}" class="borde" stroke-width="2.5"/>${tx(x + 60, y + 40, t, 16, 'tinta', 900)}${tx(x + 60, y + 82, '👍 ' + (12 - i * 4), 16, 'tinta', 700)}</g>`).join('')}
    <g class="a-sello"><rect x="300" y="236" width="180" height="56" rx="10" fill="none" stroke="${AC.rojo}" stroke-width="5"/>${tx(390, 272, 'DECIDIDO', 22, 'rojo', 900, 'letter-spacing="3"')}</g>
    ${tx(160, 272, 'Los miembros proponen', 15, 'tenue', 700, `class="a-fade" ${dl(1)}`)}${tx(160, 296, 'el anfitrión decide', 15, 'tenue', 700, `class="a-fade" ${dl(1.2)}`)}`),
  cseguir: () => sv(`<g class="a-fade">${aChip(320, 50, 'Solicitud de seguimiento', AC.azul)}</g>
    <g class="a-pop">${aCaja(115, 200, 170, 190)}${aPer(115, 226, 1.1, AC.violeta)}${tx(115, 268, 'Butaca #12', 15, 'tinta', 900)}</g>
    <g class="a-pop" ${dl(.4)}>${aCaja(525, 200, 170, 190)}${aPer(525, 226, 1.1, AC.teal)}${tx(525, 268, 'Vos', 15, 'tinta', 900)}</g>
    ${aFlecha(212, 110, 300, 110, `class="a-fade" ${dl(.8)}`)}${aCheck(320, 110, 1.1, `class="a-pop" ${dl(1.3)}`)}
    ${aBurbuja(232, 170, 150, '¡Hola! ¿Cómo va?', false, `class="a-pop" ${dl(1.8)}`)}${aBurbuja(262, 226, 116, '¡Bien! 👋', true, `class="a-pop" ${dl(2.2)}`)}
    ${tx(320, 330, 'Si acepta, pueden escribirse', 16, 'tenue', 800, `class="a-fade" ${dl(2.6)}`)}`),
  revela: () => { let out = '', i = 0
    for (let f = 0; f < 4; f++) { const r = 60 + f * 22, n = Math.floor(Math.PI * r / 17)
      for (let k = 0; k < n; k++) { const a = Math.PI * (k + .5) / n, x = 320 - r * Math.cos(a), y = 200 - r * Math.sin(a), h = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1
        out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5.5" class="seat ${h < .62 ? 'on' : ''}" ${h < .62 ? dl((h * 2.6).toFixed(2)) : 'style="fill:rgba(255,255,255,.14)"'}/>`; i++ } }
    return sv(`<rect x="0" y="0" width="640" height="360" rx="20" fill="#0b0e1d"/>${tx(320, 40, 'ESA BUTACA VOTÓ · NADIE SABE QUÉ', 14, 'oro', 900, 'letter-spacing="2"')}${out}
    ${[['Sí', AC.verde, 150, .62], ['No', AC.rojo, 320, .3], ['Abst.', AC.gris, 490, .08]].map(([t, c, x, p], k) => `<g class="a-fade" ${dl(2.8 + k * .15)}><rect x="${x - 70}" y="240" width="140" height="86" rx="14" fill="#fff" opacity=".07"/>${tx(x - 52, 266, t, 14, 'blanco', 800, 'text-anchor="start"')}${tx(x + 52, 268, Math.round(p * 100) + '%', 18, 'blanco', 900, 'text-anchor="end"')}<rect x="${x - 54}" y="284" width="108" height="8" rx="4" fill="#fff" opacity=".12"/><rect x="${x - 54}" y="284" width="${108 * p}" height="8" rx="4" fill="${c}"/></g>`).join('')}`) },
  cerradas: () => sv(`${[['12', 'OCT', 'SÍ 62%', AC.verde, false], ['10', 'OCT', '✦ Revelación', '#f97316', true], ['9', 'OCT', 'NO 71%', AC.rojo, false]].map(([d, m, r, c, nueva], k) => `<g class="a-pop" ${dl(k * .3)}><rect x="70" y="${50 + k * 92}" width="500" height="76" rx="16" class="papel borde" stroke-width="${nueva ? 3 : 2}" ${nueva ? 'stroke="#f97316"' : ''}/>
      <rect x="88" y="${64 + k * 92}" width="48" height="48" rx="10" class="suave"/>${tx(112, 92 + k * 92, d, 18, 'tinta', 900)}${tx(112, 106 + k * 92, m, 10, 'tenue', 800)}
      <rect x="152" y="${74 + k * 92}" width="220" height="11" rx="5" class="suave"/><rect x="152" y="${94 + k * 92}" width="160" height="11" rx="5" class="suave"/>
      <rect x="${nueva ? 404 : 434}" y="${72 + k * 92}" width="${nueva ? 150 : 120}" height="32" rx="16" fill="${c}" ${nueva ? 'class="a-latir"' : 'opacity=".9"'}/>${tx(nueva ? 479 : 494, 93 + k * 92, r, 14, 'blanco', 900)}</g>`).join('')}`),
  muro: () => sv(`<g class="a-pop">${aCaja(320, 100, 460, 110)}${tx(320, 78, '¿Qué pensás hoy?', 17, 'tinta', 800)}<rect x="120" y="96" width="400" height="12" rx="6" class="suave"/><rect x="420" y="122" width="96" height="30" rx="10" fill="${AC.azul}"/>${tx(468, 142, 'Publicar', 13, 'blanco', 900)}</g>
    ${[[150, '#cfe0ff'], [320, '#d6f5e5'], [490, '#ffe3cc']].map(([x, c], k) => `<g class="a-pop" ${dl(.6 + k * .25)}><rect x="${x - 75}" y="190" width="150" height="110" rx="14" fill="${c}" class="borde" stroke-width="2"/><rect x="${x - 58}" y="212" width="116" height="9" rx="4" fill="#fff" opacity=".8"/><rect x="${x - 58}" y="230" width="90" height="9" rx="4" fill="#fff" opacity=".8"/>${tx(x - 40, 282, '♥ ' + (14 - k * 5), 13, 'rojo', 800)}</g>`).join('')}
    ${tx(320, 336, 'Una opinión por día · se renueva a las 3:00', 15, 'tenue', 800, `class="a-fade" ${dl(1.6)}`)}`),
  aud: () => sv(`<g class="a-pop"><rect x="120" y="60" width="400" height="230" rx="20" fill="#0b0e1d"/><circle cx="320" cy="175" r="40" fill="#fff" opacity=".15"/><path d="M308 155v40l32-20z" fill="#fff"/><rect x="140" y="76" width="74" height="24" rx="12" fill="${AC.rojo}"/>${tx(177, 93, 'EN VIVO', 12, 'blanco', 900)}</g>
    ${['👏', '🔥', '❤️', '✊', '💯'].map((e, i) => `<text x="${200 + i * 60}" y="270" font-size="30" text-anchor="middle" class="a-flotar" ${dl(i * .5)}>${e}</text>`).join('')}`),
  play: () => sv(`<g class="a-pop"><rect x="150" y="50" width="340" height="260" rx="24" fill="#0b0e1d"/>${tx(320, 104, 'NIVEL', 13, 'blanco', 800, 'opacity=".6" letter-spacing="3"')}<text x="320" y="158" font-size="52" font-weight="900" fill="#fff" text-anchor="middle" class="a-nivel"></text>
    <rect x="190" y="200" width="120" height="80" rx="16" fill="#fff" opacity=".08"/><rect x="330" y="200" width="120" height="80" rx="16" fill="#fff" opacity=".08"/>${tx(250, 252, '✕', 36, 'blanco', 300)}${tx(390, 252, '○', 36, 'blanco', 300)}</g>`),
  // ── Bloques: qué ve el anfitrión cuando pedís sumarte ──
  bpedir: () => sv(`${aPer(105, 196, 1.3, AC.teal, 'class="a-pop"')}${tx(105, 228, 'Vos', 16, 'tinta', 900, 'class="a-fade"')}
    <g class="a-pop" ${dl(.3)}>${aChip(105, 276, 'Butaca #250', AC.oro)}</g>${aTacha(105, 274, 1.1, dl(1.2))}
    ${aFlecha(182, 170, 244, 170, `class="a-fade" ${dl(.6)}`)}
    <g class="a-pop" ${dl(.8)}>${aCaja(425, 172, 340, 214)}${txi(275, 96, 'SOLICITUDES', 13, 'tenue', 900, 'letter-spacing="2"')}
      <circle cx="292" cy="142" r="18" fill="${AC.violeta}"/>${tx(292, 149, 'A', 17, 'blanco', 900)}${txi(320, 138, 'Ayn Rand', 16, 'tinta', 900)}${txi(320, 158, '“¡Hola! Me sumo”', 12, 'tenue', 600)}
      <rect x="482" y="124" width="92" height="34" rx="11" fill="${AC.verde}"/>${tx(528, 146, 'Aceptar', 13, 'blanco', 900)}
      <path d="M275 184H575" class="corte" opacity=".4"/>
      <circle cx="292" cy="214" r="18" fill="${AC.gris}"/>${tx(292, 221, '?', 17, 'blanco', 900)}${txi(320, 210, 'Ciudadano anónimo', 13, 'tinta', 900)}${txi(320, 230, 'sin presentación', 12, 'tenue', 600)}
      <rect x="482" y="196" width="92" height="34" rx="11" fill="${AC.verde}"/>${tx(528, 218, 'Aceptar', 13, 'blanco', 900)}</g>
    <g class="a-pop" ${dl(2)}><rect x="478" y="120" width="100" height="42" rx="13" class="papel" stroke="${AC.verde}" stroke-width="3"/>${tx(528, 147, '✓ Adentro', 14, 'verde', 900)}</g>
    ${tx(320, 330, 'Ve tu alias o “Ciudadano anónimo”, nunca tu butaca', 16, 'tenue', 800, `class="a-fade" ${dl(2.3)}`)}`),
  // ── Funding ──
  ffondo: () => sv(`${tx(320, 48, 'Meta del año: $30.000', 24, 'tinta', 900, 'class="a-fade"')}
    <clipPath id="ap-clip-fondo"><rect x="40" y="130" width="560" height="48" rx="24"/></clipPath>
    <rect x="40" y="130" width="560" height="48" rx="24" class="suave"/>
    <g clip-path="url(#ap-clip-fondo)"><g class="a-crecer" ${dl(.2)}><rect x="40" y="130" width="187" height="48" fill="${AC.violeta}"/>${tx(133, 160, 'Marca', 16, 'blanco', 900)}</g>
      <g class="a-crecer" ${dl(1)}><rect x="227" y="130" width="150" height="48" fill="${AC.oro}"/>${tx(302, 160, 'Butacas', 16, 'tinta', 900)}</g></g>
    ${[[227, '$10K', 'Seguridad'], [413, '$20K', 'App'], [598, '$30K', 'Auditoría']].map(([x, m, t], i) => `<g class="a-fade" ${dl(.6 + i * .2)}><path d="M${x} 186v12" class="corte"/>${tx(Math.min(x, 580), 222, m, 15, 'tinta', 900)}${tx(Math.min(x, 580), 242, t, 13, 'tenue', 700)}</g>`).join('')}
    ${[250, 300, 350].map((x, i) => `<g class="a-caer" ${dl(1.8 + i * .7)}><circle cx="${x}" cy="108" r="15" fill="${AC.oro}" class="borde" stroke-width="2.5"/>${tx(x, 113, '$1', 12, 'tinta', 900)}</g>`).join('')}
    ${tx(320, 300, 'Aporta cualquiera, desde $1', 18, 'tinta', 800, `class="a-fade" ${dl(1.4)}`)}${tx(320, 328, 'Las marcas también aportan, pero no votan ni deciden', 15, 'tenue', 700, `class="a-fade" ${dl(1.7)}`)}`),
  ffundador: () => {
    const c = (x, y, w, s, num, op, d, oro) => { const av = apAvatar(s), img = w - 20
      return `<g class="a-pop" ${dl(d)} opacity="${op}"><rect x="${x}" y="${y}" width="${w}" height="${w + 62}" rx="16" class="papel borde" stroke-width="3" ${oro ? `stroke="${AC.oro}" stroke-width="5"` : ''}/>
        ${av.url ? `<image href="${av.url}" x="${x + 10}" y="${y + 10}" width="${img}" height="${img}"/>` : ''}${tx(x + w / 2, y + w + 26, num, w > 120 ? 22 : 17, 'tinta', 900)}${tx(x + w / 2, y + w + 48, av.tier, 13, oro ? 'oro' : 'tenue', 800)}</g>` }
    return sv(`${c(64, 92, 120, '2026-butaca-418', '#0418', .6, .2)}${c(456, 92, 120, '2026-butaca-611', '#0611', .6, .4)}${c(244, 40, 152, '2026-butaca-250', '#0532', 1, .9, true)}
      ${[[232, 52], [408, 78], [236, 230]].map(([x, y], i) => `<text x="${x}" y="${y}" font-size="22" text-anchor="middle" class="a-latir" fill="${AC.oro}" style="fill:${AC.oro}">✦</text>`).join('')}
      ${tx(320, 336, 'Uno por butaca · sorpresa · no se vende', 16, 'tenue', 800, `class="a-fade" ${dl(1.6)}`)}`) },
  fmuro: () => {
    const W = 26, H = 9, L = 22, x0 = 34, y0 = 54, ocup = new Set(), out = [], col = ['#cfe0ff', '#d6f5e5', '#ffe3cc', '#eadcff', '#ffd6d6', '#fff1bf']
    const bloques = [[2, 1, 3, 'a'], [8, 4, 2, 'b'], [13, 0, 2, 'c'], [18, 3, 3, 'd'], [22, 0, 2, 'e'], [5, 6, 2, 'f'], [15, 6, 2, 'g']], mio = [10, 1, 3]
    ;[...bloques, [...mio, 'vos']].forEach(([cx, cy, s]) => { for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) ocup.add((cx + i) + ',' + (cy + j)) })
    for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) { if (ocup.has(cx + ',' + cy)) continue
      const h = Math.abs(Math.sin((cx * 31 + cy * 17) * 12.9898) * 43758.5453) % 1
      out.push(`<rect x="${x0 + cx * L}" y="${y0 + cy * L}" width="${L - 3}" height="${L - 3}" rx="3" ${h < .48 ? `fill="${col[Math.floor(h * 100) % col.length]}" class="a-fade" ${dl((h * 3).toFixed(2))}` : 'class="suave" opacity=".55"'}/>`) }
    bloques.forEach(([cx, cy, s, k], i) => { const av = apAvatar('muro-' + k)
      out.push(`<g class="a-pop" ${dl((.3 + i * .15).toFixed(2))}>${av.url ? `<image href="${av.url}" x="${x0 + cx * L}" y="${y0 + cy * L}" width="${s * L - 3}" height="${s * L - 3}"/>` : ''}</g>`) })
    const av = apAvatar('2026-butaca-250'), [mx, my, ms] = mio
    out.push(`<g class="a-pop" ${dl(1.6)}><rect x="${x0 + mx * L - 4}" y="${y0 + my * L - 4}" width="${ms * L + 5}" height="${ms * L + 5}" rx="6" fill="none" stroke="${AC.oro}" stroke-width="4"/>${av.url ? `<image href="${av.url}" x="${x0 + mx * L}" y="${y0 + my * L}" width="${ms * L - 3}" height="${ms * L - 3}"/>` : ''}</g>`)
    out.push(`<g class="a-pop" ${dl(2)}>${aChip(x0 + mx * L + ms * L / 2, 34, 'Tu lugar', AC.oro)}</g>`)
    return sv(`${out.join('')}${tx(320, 284, '$1 = un casillero · $25 = un bloque grande', 17, 'tinta', 800, `class="a-fade" ${dl(1)}`)}${tx(320, 314, 'Queda para siempre', 15, 'tenue', 700, `class="a-fade" ${dl(1.3)}`)}`) },
  fsocio: () => { const av = apAvatar('2026-butaca-250')
    return sv(`${[['+$5', 110], ['+$5', 210], ['+$2', 300]].map(([t, x], i) => `<g class="a-pop" ${dl(.2 + i * .45)}><circle cx="${x}" cy="84" r="28" fill="${AC.oro}" class="borde" stroke-width="3"/>${tx(x, 90, t, 16, 'tinta', 900)}</g>`).join('')}
    <clipPath id="ap-clip-socio"><rect x="60" y="150" width="320" height="34" rx="17"/></clipPath><rect x="60" y="150" width="320" height="34" rx="17" class="suave"/>
    <g clip-path="url(#ap-clip-socio)">${[[60, 133], [193, 133], [326, 54]].map(([x, w], i) => `<rect x="${x}" y="150" width="${w}" height="34" fill="${AC.oro}" class="a-crecer" ${dl(.4 + i * .45)}/>`).join('')}</g>
    ${tx(220, 222, '$12 en el año', 20, 'tinta', 900, `class="a-fade" ${dl(1.6)}`)}${tx(220, 248, 'sumando todos tus aportes', 14, 'tenue', 700, `class="a-fade" ${dl(1.7)}`)}
    ${aFlecha(394, 167, 438, 167, `class="a-fade" ${dl(1.8)}`)}
    <g class="a-pop" ${dl(2)}><rect x="452" y="72" width="140" height="140" rx="16" class="papel" stroke="${AC.oro}" stroke-width="6"/>${av.url ? `<image href="${av.url}" x="464" y="84" width="116" height="116"/>` : ''}</g>
    <g class="a-pop" ${dl(2.3)}>${aChip(522, 244, '★ Socio', AC.oro)}</g>
    ${tx(320, 312, 'Por 12 meses proponés y votás proyectos, en secreto', 16, 'tenue', 800, `class="a-fade" ${dl(2.6)}`)}`) },
  fproy: () => sv(`${[['Propuesta', '💡', 70, AC.oro], ['Debate 48 h', '💬', 195, AC.teal], ['Votan socios', '🗳️', 320, AC.violeta], ['Financiando', '💛', 445, AC.azul], ['Financiado', '✅', 570, AC.verde]].map(([t, e, x, c], i) => `<g class="a-pop" ${dl(i * .4)}><circle cx="${x}" cy="150" r="40" fill="${c}" class="borde" stroke-width="3"/><text x="${x}" y="163" font-size="34" text-anchor="middle">${e}</text>${tx(x, 218, t, 14)}</g>${i < 4 ? aFlecha(x + 46, 150, x + 78, 150, `class="a-fade" ${dl(i * .4 + .25)}`) : ''}`).join('')}
    <circle cx="70" cy="92" r="9" fill="${AC.rojo}" class="a-viaje"/>
    ${aFlecha(445, 232, 445, 270, `class="a-fade" ${dl(2)}`)}<g class="a-pop" ${dl(2.2)}>${aChip(400, 300, '↩ Si no llega, se devuelve todo', AC.rojo)}</g>`),
}
// Avatar de Fundador para las escenas (si Funding no está cargado, la escena igual se dibuja)
function apAvatar(seed) { try { const av = fdAvatar(seed); return { url: fdUrl(av), tier: av.tier[0] } } catch (e) { return { url: '', tier: '' } } }
const txi = (x, y, s, size = 16, cls = 'tinta', w = 800, extra = '') => `<text x="${x}" y="${y}" class="${cls}" font-size="${size}" font-weight="${w}" text-anchor="start" ${extra}>${s}</text>`

// ── Lecciones ──
const LECCIONES = [
  { id: 'cabildo', titulo: '¿Qué es el Cabildo?', sub: 'La idea en 1 minuto', color: AC.azul, ico: '🏛️', ir: ['#inicio', 'Ver el hemiciclo'], pasos: [
    { esc: 'hemiciclo', t: 'Un parlamento de ciudadanos', p: 'El Cabildo es un hemiciclo digital. Cada punto es una <b>butaca</b>, y cada butaca es una persona real. Vos también tenés tu lugar.' },
    { esc: 'ciclo', t: 'Proponés, debatís, votás', p: 'Acá los ciudadanos <b>proponen</b> ideas, las <b>debaten</b> con argumentos y las <b>votan</b>. Lo que decide el Cabildo queda a la vista de todos.' },
    { esc: 'uno', t: '1 persona = 1 butaca = 1 voto', p: 'Nadie puede tener dos butacas. Por eso lo que vota el Cabildo <b>no se puede inflar ni falsificar</b>: es la voz real de la gente.' }],
    quiz: { q: '¿Cuántas butacas puede tener una persona?', o: [['Una sola', 1], ['Las que quiera', 0], ['Tres', 0]], e: 'Una persona, una butaca. Así cada voto vale lo mismo.' } },
  { id: 'butaca', titulo: 'Tu butaca', sub: 'Anónima y tuya', color: AC.oro, ico: '💺', ir: ['#butaca', 'Ir a Mi Butaca'], pasos: [
    { esc: 'verif', t: 'Primero, mostrás que sos una persona real', p: 'Una sola vez, con tu documento y una selfie. Así sabemos que sos una persona y que no tenés otra butaca. Después recibís tu número.' },
    { esc: 'anonimo', t: 'Y después, participás con tu número', p: 'No guardamos tu nombre ni tu número de documento, y las fotos se borran. Frente a los demás, tu butaca queda identificada solo por su número.' },
    { esc: 'mostrar', t: 'Vos elegís qué mostrar', p: 'Podés ponerle un <b>alias</b>, una frase y un color, o no mostrar nada. Probalo acá abajo 👇', sim: 'alias' }],
    quiz: { q: '¿Tu nombre real aparece en tu butaca?', o: [['No, solo si elijo mostrar un alias', 1], ['Sí, siempre', 0], ['Solo para los que me siguen', 0]], e: 'Tu butaca es anónima. El alias es opcional y lo elegís vos.' } },
  { id: 'votar', titulo: 'Cómo votar', sub: 'Paso a paso', color: AC.verde, ico: '🗳️', ir: ['#votaciones', 'Ir a votar'], pasos: [
    { esc: 'vlista', t: 'Entrá a Votaciones', p: 'Ahí ves las votaciones <b>abiertas</b>. Cada una tiene un reloj: cuando llega a cero, se cierra.' },
    { esc: 'velegir', t: 'Elegí Sí, No o Abstención', p: 'Leé la pregunta (y el contexto si tiene), tocá tu opción y <b>confirmá</b>. Abstenerse también cuenta: significa “participé, pero no elijo”.' },
    { esc: 'vuno', t: 'Un voto, y no se cambia', p: 'Tenés un voto por pregunta. Una vez que confirmás, <b>no se puede cambiar</b>: pensalo bien antes.' },
    { esc: null, t: 'Probalo sin miedo', p: 'Esto es una práctica: no cuenta para nada. Votá y mirá qué pasa por dentro.', sim: 'votar' }],
    quiz: { q: 'Votaste “Sí” y te arrepentiste. ¿Podés cambiarlo?', o: [['No, el voto es definitivo', 1], ['Sí, durante 5 minutos', 0], ['Sí, hasta que cierre', 0]], e: 'Cada butaca vota una vez por pregunta, y ese voto queda.' } },
  { id: 'secreto', titulo: 'Tu voto es secreto', sub: 'De verdad', color: AC.violeta, ico: '🔒', ir: ['#votaciones', 'Ver resultados'], pasos: [
    { esc: 'surna', t: 'La urna no sabe quién sos', p: 'Cuando votás pasan dos cosas por separado: se anota que tu butaca <b>participó</b>, y se suma 1 al <b>contador</b> de tu opción. Nunca se guarda qué votó cada butaca.' },
    { esc: 'scandado', t: 'Los resultados, al cerrar', p: 'Mientras la votación está abierta solo se ve <b>cuántos</b> votaron, no qué ganó. Así nadie se deja llevar por la mayoría.' },
    { esc: 'snadie', t: 'Qué votaste no se guarda', p: 'Ni en el servidor ni en tu teléfono. Ningún ciudadano ni administrador puede consultarlo, porque <b>ese dato no se guarda en ningún lado</b>.' },
    { esc: 'revela', t: 'La revelación', p: 'Cuando la votación cierra, el hemiciclo <b>enciende las butacas que votaron</b>, todas del <b>mismo color</b>: se ve que esa butaca participó, pero nunca qué votó. El resultado aparece solo en los <b>totales</b> de abajo.' },
    { esc: 'cerradas', t: 'Todas quedan guardadas', p: 'En <b>Votaciones → Cerradas</b> se acumulan todas las votaciones. Las que todavía no viste tienen el botón naranja <b>✦ Revelación</b>; las que ya viste muestran su resultado.' }],
    quiz: { q: 'En la revelación tu butaca se enciende. ¿Qué significa?', o: [['Que voté, pero no qué voté', 1], ['Que voté Sí', 0], ['Que gané la votación', 0]], e: 'Todas las butacas que votaron se encienden del mismo color. Qué votó cada una no se guarda en ningún lado.' } },
  { id: 'debates', titulo: 'Debates', sub: 'Argumentos, no gritos', color: AC.teal, ico: '💬', ir: ['#debates', 'Ir a Debates'], pasos: [
    { esc: 'duno', t: 'Un debate por cada votación', p: 'Mientras una votación está abierta, su debate también. Leé qué piensan los demás antes de votar.' },
    { esc: 'dmano', t: 'Levantá la mano ✋', p: 'Para hablar, levantás la mano. Hasta <b>3 personas</b> hablan a la vez; el resto espera su turno en la fila.', sim: 'mano' },
    { esc: 'dreglas', t: 'Corto y con respeto', p: 'Cada mensaje tiene hasta <b>280 caracteres</b> y hay <b>1 minuto</b> de espera entre mensajes. Así todos tienen lugar.' }],
    quiz: { q: '¿Qué hacés para escribir en un debate?', o: [['Levanto la mano y espero mi turno', 1], ['Escribo directamente', 0], ['Le pido permiso a un admin', 0]], e: 'Levantás la mano: si hay lugar, hablás enseguida; si no, esperás tu turno.' } },
  { id: 'propuestas', titulo: 'Propuestas', sub: 'Tu idea, al Cabildo', color: AC.rojo, ico: '💡', ir: ['#propuestas', 'Ir a Propuestas'], pasos: [
    { esc: 'pidea', t: 'Tenés una idea: lanzala', p: 'Escribila en hasta 280 caracteres. Podés sumar contexto y enlaces para explicarla mejor.' },
    { esc: 'pmeta', t: '48 horas para encender 20 butacas', p: 'Durante <b>48 horas</b>, otros ciudadanos pueden <b>apoyarla</b>. Si llega a <b>20 apoyos</b>, logró la meta. Si no, vence. Probalo 👇', sim: 'propuesta' },
    { esc: 'pcamino', t: 'De idea a votación', p: 'Las que llegan a la meta pasan a <b>revisión</b>. Si se aprueban, el Cabildo entero las <b>vota</b>.' },
    { esc: 'puna', t: 'Una a la vez', p: 'Cada butaca puede tener <b>una propuesta en carrera</b>. Cuando termina, podés lanzar otra. Elegí tu mejor idea.' }],
    quiz: { q: 'Tu propuesta llegó a 14 apoyos en 48 horas. ¿Qué pasa?', o: [['Vence: no llegó a la meta', 1], ['Pasa igual a votación', 0], ['Se extiende sola otra semana', 0]], e: 'La meta es 20 apoyos en 48 horas. Si no llega, vence y podés lanzar otra.' } },
  { id: 'bloques', titulo: 'Bloques', sub: 'Organizarse', color: AC.violeta, ico: '🚩', ir: ['#inicio', 'Ver bloques'], pasos: [
    { esc: 'bque', t: '¿Qué es un bloque?', p: 'Un grupo de ciudadanos que se junta alrededor de ideas comunes, con un <b>anfitrión</b> que lo lidera. El anfitrión muestra su nombre real; los miembros siguen siendo <b>anónimos</b> para el público, que solo ve cuántos son.' },
    { esc: 'bpedir', t: 'Pedir sumarte', p: 'Tocás <b>“Pedir sumarme”</b> y, si querés, escribís una presentación. El anfitrión te ve con tu <b>alias</b> si lo hiciste público, o como <b>“Ciudadano anónimo”</b>, y decide si entrás. <b>Nunca ve tu número de butaca</b> ni qué votás. Si el bloque está abierto a todos, entrás directo. Probalo 👇', sim: 'sumarme' },
    { esc: 'bsumar', t: 'Un bloque a la vez', p: 'Podés estar en <b>un bloque a la vez</b>. Si te vas a otro, esperás <b>30 días</b>. Si el anfitrión te quita, quedás libre <b>sin esperar</b>. Y siempre seguís votando todo lo del Cabildo.' },
    { esc: 'badentro', t: 'Adentro, todo en vivo', p: 'Comunicados del anfitrión, debates, una sala para charlar e ideas que los miembros apoyan. <b>Todo se actualiza solo</b>, sin recargar. Si el anfitrión lo habilita, una idea con suficientes apoyos sale como <b>propuesta del bloque</b>; si no, <b>el anfitrión decide</b> qué impulsar.' },
    { esc: 'bcrear', t: 'Crear tu propio bloque', p: 'Para ser anfitrión mostrás tu <b>nombre real</b> y verificás tu identidad otra vez con tu DNI, que queda bajo llave y se borra si el bloque cierra. Desde <b>Administrar</b> elegís si pedís aprobación, aceptás o quitás miembros, y cambiás tu foto, la portada y la frase del bloque.' }],
    quiz: { q: 'Pedís sumarte a un bloque. ¿Qué ve el anfitrión?', o: [['Mi alias si es público, o “Ciudadano anónimo”', 1], ['Mi número de butaca', 0], ['Mi nombre real', 0]], e: 'El anfitrión decide quién entra, pero nunca ve tu butaca ni cómo votás.' } },
  { id: 'comunidad', titulo: 'Muro, Ciudadanos, Auditorio y Playroom', sub: 'Lo demás', color: AC.teal, ico: '🎟️', ir: ['#playroom', 'Ir al Playroom'], pasos: [
    { esc: 'muro', t: 'El Muro del día', p: 'Cada butaca puede dejar <b>una opinión por día</b> (hasta 280 caracteres). Los demás la leen, le dan me gusta y responden. A las 3:00 de Venezuela empieza un Muro nuevo.' },
    { esc: 'cseguir', t: 'Seguí a otras butacas', p: 'En <b>Ciudadanos</b> podés seguir a otras butacas. Si aceptan tu solicitud, pueden mandarse mensajes.' },
    { esc: 'aud', t: 'El Auditorio', p: 'Sesiones <b>en vivo</b>: mirás, reaccionás y podés pedir la palabra en el chat de la sala.' },
    { esc: 'play', t: 'El Playroom', p: '<b>Nerdocrasy</b>: 90 niveles de preguntas sobre democracia. Un error y empezás de nuevo. ¿Hasta dónde llegás?' }],
    quiz: { q: '¿Cuándo podés mandarle un mensaje a otra butaca?', o: [['Cuando acepta que la sigas', 1], ['Siempre, a cualquiera', 0], ['Nunca', 0]], e: 'Primero mandás una solicitud de seguimiento; si la acepta, pueden escribirse.' } },
  { id: 'funding', titulo: 'Funding', sub: 'Sostener el Cabildo', color: AC.oro, ico: '💛', ir: ['#funding', 'Ir a Funding'], si: () => FUNDING_ABIERTO && !!fd.cfg?.activo, pasos: [
    { esc: 'ffondo', t: 'El Cabildo se sostiene entre todos', p: 'En <b>Funding</b> hay una meta anual para mantener el Cabildo: infraestructura y seguridad, una app nativa y una auditoría independiente. Cualquiera puede aportar <b>desde $1</b>. Las <b>marcas</b> también aportan y su logo aparece en la franja, pero <b>no votan ni deciden</b>.' },
    { esc: 'ffundador', t: 'Tu Fundador, para siempre', p: 'Con tu primer aporte al Fondo recibís tu <b>Fundador</b>: un avatar pixel único, numerado por orden de llegada. Es <b>sorpresa</b> y sale de tu butaca: aportar más <b>no lo hace más raro</b>. No se vende ni se transfiere, y queda en el <b>Libro de Fundadores</b>, sellado cada año en Bitcoin para probar que nadie lo alteró.' },
    { esc: 'fmuro', t: 'Tu lugar en el Muro', p: 'Cada aporte ocupa un lugar en el <b>Muro de los Fundadores</b>, como un mosaico: $1 es un casillero y $25 un bloque grande. Vos elegís dónde va. Si tu butaca no se muestra, aparece como <b>“Anónima”</b>.' },
    { esc: 'fsocio', t: 'Socios: los que deciden los proyectos', p: 'Si tus aportes suman <b>$12 en el año</b>, sos <b>socio</b> por 12 meses: proponés proyectos y los votás <b>en secreto</b>. Votar en el Cabildo sigue siendo gratis para todos: <b>1 butaca = 1 voto</b>, aportes o no. Probalo 👇', sim: 'socio' },
    { esc: 'fproy', t: 'Proyectos: o se logran, o se devuelve', p: 'Un proyecto nace como propuesta de un socio, se debate <b>48 horas</b> y lo votan los socios. Si se aprueba, aportan todos (también las marcas) hasta llegar a la meta. <b>Si no llega, se devuelve todo.</b>' }],
    quiz: { q: 'Aportaste a un proyecto y no llegó a su meta. ¿Qué pasa con tu aporte?', o: [['Se me devuelve', 1], ['Queda para el Cabildo', 0], ['Pasa a otro proyecto', 0]], e: 'Los proyectos son todo o nada: si no llegan a la meta, se devuelve cada aporte.' } },
]
// Lecciones visibles (Funding solo aparece cuando está activado desde el admin)
const apLecs = () => LECCIONES.filter(l => !l.si || l.si())

const FAQ = [
  ['¿Alguien puede saber qué voté?', 'No. El Cabildo anota que tu butaca participó y suma tu voto al total, por separado. Qué votó cada butaca no se guarda en ningún lado.'],
  ['¿La revelación muestra qué votó cada butaca?', 'No. Se encienden las butacas que votaron, todas del mismo color: solo demuestra que esa butaca participó. El resultado se ve únicamente en los totales.'],
  ['¿Dónde veo las votaciones que ya cerraron?', 'En Votaciones → Cerradas. Ahí se acumulan todas, con buscador y filtros (sin ver, en las que voté).'],
  ['¿Por qué no veo quién va ganando?', 'Para que nadie vote “con la mayoría”. Mientras la votación está abierta solo se ve cuántos votaron; el resultado aparece al cerrar.'],
  ['¿Cuántas veces puedo escribir en el Muro?', 'Una opinión por día. Si querés cambiarla, podés borrarla y escribir otra. El Muro se renueva a las 3:00 de Venezuela.'],
  ['¿Puedo cambiar mi voto?', 'No. Hay un voto por butaca y por pregunta, y es definitivo.'],
  ['¿Qué pasa si mi propuesta no llega a 20 apoyos?', 'Vence a las 48 horas. Podés lanzar otra cuando quieras.'],
  ['¿Tengo que mostrar mi nombre?', 'No. Tu butaca es anónima. Solo los anfitriones de bloques muestran su nombre real, porque lo eligen.'],
  ['¿El anfitrión de un bloque sabe quién soy?', 'No. Cuando pedís sumarte ve tu alias si lo hiciste público, o “Ciudadano anónimo”, y tu presentación si escribiste una. Nunca ve tu número de butaca ni qué votás.'],
  ['¿Puedo estar en dos bloques?', 'No, en uno a la vez. Si cambiás de bloque, esperás 30 días. Si el anfitrión te quita, quedás libre enseguida.'],
  ['¿Qué guardan de mí?', 'Tu email (para entrar) y tu butaca. No guardamos tu nombre ni tu número de documento, y las fotos de la verificación se borran.'],
  ['¿Tengo que aportar para votar?', 'No. Votar, proponer y debatir en el Cabildo es gratis para todas las butacas. Ser socio solo sirve para decidir qué proyectos se financian.', () => FUNDING_ABIERTO && !!fd.cfg?.activo],
  ['¿Si aporto más, mi Fundador es más raro?', 'No. Tu Fundador sale de tu butaca, no de cuánto aportás. Hay uno por butaca y por año, y no se vende ni se transfiere.', () => FUNDING_ABIERTO && !!fd.cfg?.activo],
  ['¿Las marcas deciden algo?', 'No. Las marcas aportan y su logo aparece en la franja, pero no votan ni deciden proyectos.', () => FUNDING_ABIERTO && !!fd.cfg?.activo],
]

// ── Estado y progreso (solo en este navegador) ──
const ap = { hechas: new Set(), lec: null, paso: 0, sim: {} }
try { JSON.parse(localStorage.getItem('ux2_aprende_v1') || '[]').forEach(id => ap.hechas.add(id)) } catch (e) {}
const apGuardar = () => { try { localStorage.setItem('ux2_aprende_v1', JSON.stringify([...ap.hechas])) } catch (e) {} }

function pintarAprende() {
  const c = $('#ap-cuerpo'); if (!c) return
  const lecs = apLecs(), n = lecs.filter(l => ap.hechas.has(l.id)).length, total = lecs.length, sig = lecs.find(l => !ap.hechas.has(l.id))
  const pct = n / total, R = 34, C = 2 * Math.PI * R
  c.innerHTML = `
  <section class="ap-hero">
    <div class="ap-hero-txt">
      <span class="ap-tag">Aprendé · para principiantes</span>
      <h1>El Cabildo, explicado <em>sin vueltas</em></h1>
      <p>${total} lecciones cortas, con dibujos y prácticas. En 15 minutos sabés votar, proponer${FUNDING_ABIERTO && fd.cfg?.activo ? ', organizarte y sostener el Cabildo' : ' y organizarte'}.</p>
      <div class="ap-hero-acc">
        <button class="btn btn-dark ap-empezar" data-leccion="${(sig || lecs[0]).id}">${n === 0 ? '▶ Empezar' : sig ? `▶ Seguir: ${esc(sig.titulo)}` : '↻ Repasar'}</button>
        <div class="ap-prog" title="${n} de ${total} lecciones">
          <svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="${R}" class="ap-prog-pista"/><circle cx="40" cy="40" r="${R}" class="ap-prog-arco" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}" transform="rotate(-90 40 40)"/></svg>
          <b>${n}/${total}</b>
        </div>
        ${n === total ? '<span class="ap-insignia">🏅 Ciudadano informado</span>' : ''}
      </div>
    </div>
    <div class="ap-hero-esc">${ESCENAS.hemiciclo()}</div>
  </section>

  <ol class="ap-ruta">
    ${lecs.map((l, i) => `<li class="ap-lec ${ap.hechas.has(l.id) ? 'hecha' : ''} ${sig?.id === l.id ? 'siguiente' : ''}" style="--c:${l.color}">
      <button data-leccion="${l.id}">
        <span class="ap-num">${ap.hechas.has(l.id) ? '✓' : i + 1}</span>
        <span class="ap-ico">${l.ico}</span>
        <span class="ap-lec-txt"><b>${esc(l.titulo)}</b><small>${esc(l.sub)} · ${l.pasos.length} pasos${l.pasos.some(p => p.sim) ? ' · con práctica' : ''}</small></span>
        <span class="ap-lec-ir">${ap.hechas.has(l.id) ? 'Repasar' : sig?.id === l.id ? 'Empezar' : 'Ver'} →</span>
      </button></li>`).join('')}
  </ol>

  <section class="card ap-faq">
    <h2>Preguntas rápidas</h2>
    ${FAQ.filter(f => !f[2] || f[2]()).map(([q, r]) => `<details><summary>${esc(q)}</summary><p>${esc(r)}</p></details>`).join('')}
  </section>`
}

// ── Lección ──
function abrirLeccion(id) {
  const l = apLecs().find(x => x.id === id); if (!l) return
  ap.lec = l; ap.paso = 0; ap.sim = {}
  $('#modal-leccion').hidden = false; document.body.style.overflow = 'hidden'
  pintarLeccion()
}
function cerrarLeccion() {
  if ($('#modal-leccion').hidden) return
  $('#modal-leccion').hidden = true; document.body.style.overflow = ''
  clearInterval(ap.sim.t); ap.lec = null
  if (location.hash.startsWith('#aprende/')) history.replaceState(null, '', '#aprende')
  pintarAprende()
}

function pintarLeccion() {
  const l = ap.lec, box = $('#ap-leccion'); if (!l || !box) return
  clearInterval(ap.sim.t)
  const total = l.pasos.length + 1, enQuiz = ap.paso >= l.pasos.length, p = l.pasos[ap.paso]
  box.style.setProperty('--c', l.color)
  box.innerHTML = `
    <header class="ap-l-cab"><span class="ap-l-ico">${l.ico}</span><div><small>Lección ${apLecs().indexOf(l) + 1} de ${apLecs().length}</small><h2 id="ap-l-titulo">${esc(l.titulo)}</h2></div></header>
    <div class="ap-pasos" role="progressbar" aria-valuemin="1" aria-valuemax="${total}" aria-valuenow="${ap.paso + 1}">${Array.from({ length: total }, (_, i) => `<i class="${i < ap.paso ? 'ok' : i === ap.paso ? 'act' : ''}"></i>`).join('')}</div>
    ${enQuiz ? quizHTML(l) : `
    ${p.esc ? `<div class="ap-escena" key="${ap.paso}">${ESCENAS[p.esc]()}</div>` : ''}
    <div class="ap-texto"><h3>${esc(p.t)}</h3><p>${p.p}</p></div>
    ${p.sim ? `<div class="ap-sim" id="ap-sim">${simHTML(p.sim)}</div>` : ''}`}
    <footer class="ap-nav">
      <button class="btn" data-ap="atras" ${ap.paso === 0 ? 'disabled' : ''}>← Atrás</button>
      ${enQuiz ? '' : `<button class="btn btn-dark" data-ap="sig">${ap.paso === l.pasos.length - 1 ? 'Una pregunta →' : 'Siguiente →'}</button>`}
    </footer>`
  if (p?.sim) iniciarSim(p.sim)
  if (p?.esc === 'play') animarNivel()
  box.closest('.modal-box').scrollTop = 0
}

function quizHTML(l) {
  const q = l.quiz, orden = q.o.map((o, i) => [o, i]).sort((a, b) => ((a[1] * 7 + l.id.length) % 3) - ((b[1] * 7 + l.id.length) % 3))
  return `<div class="ap-quiz">
    <span class="ap-quiz-tag">Para cerrar</span>
    <h3>${esc(q.q)}</h3>
    <div class="ap-ops">${orden.map(([[t, ok]]) => `<button class="ap-op" data-ok="${ok}">${esc(t)}</button>`).join('')}</div>
    <div class="ap-res" id="ap-res" hidden></div>
  </div>`
}

function responderQuiz(btn) {
  const l = ap.lec, ok = btn.dataset.ok === '1', res = $('#ap-res')
  if (!ok) { btn.classList.add('mal'); btn.disabled = true; res.hidden = false; res.className = 'ap-res mal'; res.innerHTML = '<b>Casi.</b> Probá con otra opción.'; return }
  $$('.ap-op').forEach(b => b.disabled = true); btn.classList.add('bien')
  const nueva = !ap.hechas.has(l.id); ap.hechas.add(l.id); apGuardar()
  const lecs = apLecs(), sig = lecs[lecs.indexOf(l) + 1]
  const todas = lecs.every(x => ap.hechas.has(x.id))
  res.hidden = false; res.className = 'ap-res bien'
  res.innerHTML = `<div class="ap-confeti" aria-hidden="true">${Array.from({ length: 18 }, (_, i) => `<i style="--x:${(Math.sin(i * 2.4) * 160).toFixed(0)}px;--r:${i * 47}deg;--c:${[AC.oro, AC.azul, AC.verde, AC.rojo, AC.violeta][i % 5]}"></i>`).join('')}</div>
    <b>¡Correcto!</b> ${esc(l.quiz.e)}
    <div class="ap-fin">${todas && nueva ? '<span class="ap-insignia">🏅 ¡Completaste todo! Sos un Ciudadano informado.</span>' : `<span class="ap-hecha">✓ Lección completada</span>`}
      <div class="ap-fin-btns"><a class="btn" href="${l.ir[0]}" data-ap="ir">${esc(l.ir[1])}</a>${sig ? `<button class="btn btn-dark" data-leccion="${sig.id}">Siguiente: ${esc(sig.titulo)} →</button>` : '<button class="btn btn-dark" data-ap="cerrar">Terminar</button>'}</div></div>`
}

// ── Simuladores ──
function simHTML(tipo) {
  if (tipo === 'alias') return `<div class="sim-alias"><label class="sim-sw"><input type="checkbox" id="sim-alias-on" checked><span></span> Mostrar mi alias</label>
    <div class="sim-carta"><span class="sim-av">A</span><b id="sim-alias-nombre">Ayn Rand</b><small id="sim-alias-sub">Butaca #250</small></div></div>`
  if (tipo === 'votar') return `<div class="sim-votar"><p class="sim-q">¿Las arepas son mejores que las empanadas? <small>(práctica)</small></p>
    <div class="sim-ops">${[['si', 'Sí', AC.verde], ['no', 'No', AC.rojo], ['abs', 'Abstención', AC.gris]].map(([k, t, c]) => `<button data-sim-voto="${k}" style="--c:${c}">${t}</button>`).join('')}</div>
    <div class="sim-dentro" id="sim-dentro" hidden>
      <div><small>PARTICIPÓ</small><b>Butaca #${estado.butaca || 250} ✓</b></div>
      <span class="sim-corte">✂</span>
      <div><small>CONTADOR</small><b id="sim-cont"></b></div>
    </div><p class="sim-nota" id="sim-nota" hidden>Fijate: <b>nada une tu butaca con tu opción</b>. Y si intentás votar otra vez, no te deja.</p></div>`
  if (tipo === 'propuesta') return `<div class="sim-prop"><div class="sim-prop-arco" id="sim-arco">${arcoButacas(3, 20, 'grande')}</div>
    <div class="sim-prop-datos"><b id="sim-apoyos">3 / 20 apoyos</b><span id="sim-reloj">⏳ 47:59:59</span></div>
    <button class="btn btn-dark" id="sim-apoyar">🔥 Simular apoyos</button><p class="sim-nota" id="sim-prop-nota">Tocá varias veces: cada toque es otra butaca apoyando.</p></div>`
  if (tipo === 'sumarme') return `<div class="sim-sumar"><div class="sim-sumar-yo">
      <label class="sim-sw"><input type="checkbox" id="sim-sum-alias" checked><span></span> Mi alias “Ayn Rand” es público</label>
      <textarea id="sim-sum-msg" rows="2" maxlength="300" placeholder="Presentación (opcional)">¡Hola! Me interesa el bloque.</textarea>
      <button class="btn btn-dark" id="sim-sum-pedir">Pedir sumarme</button></div>
    <div class="sim-sumar-host"><small>ASÍ TE VE EL ANFITRIÓN</small><div id="sim-sum-vista"></div></div></div>
    <p class="sim-nota" id="sim-sum-nota">Cambiá el interruptor o la presentación y mirá qué le llega al anfitrión.</p>`
  if (tipo === 'socio') return `<div class="sim-socio"><div class="sim-socio-barra"><i id="sim-soc-fill"></i><span>$12</span></div>
    <div class="sim-socio-datos"><b id="sim-soc-n">$0 de $12 en el año</b><span id="sim-soc-est">Todavía no sos socio</span></div>
    <div class="sim-socio-btns">${[1, 5, 10].map(m => `<button class="btn btn-dark" data-sim-aporte="${m}">+ $${m}</button>`).join('')}</div>
    <p class="sim-nota" id="sim-soc-nota">Sumá aportes, aunque sean chicos: cuenta el total del año.</p></div>`
  if (tipo === 'mano') return `<div class="sim-mano"><div class="sim-cola" id="sim-cola"></div><button class="db-mano" id="sim-mano-btn">✋</button><p class="sim-nota" id="sim-mano-nota">Hay 4 personas en la fila. Levantá la mano.</p></div>`
  return ''
}

function iniciarSim(tipo) {
  if (tipo === 'mano') {
    ap.sim.cola = [12, 77, 403, 9]; ap.sim.yo = false; pintarCola()
    ap.sim.t = setInterval(() => { if (ap.sim.cola.length && ap.sim.yo) { ap.sim.cola.shift(); pintarCola() } }, 1600)
  }
  if (tipo === 'sumarme') { ap.sim.pedido = 0; simSumarVista() }
  if (tipo === 'socio') ap.sim.plata = 0
  if (tipo === 'propuesta') { ap.sim.n = 3; ap.sim.seg = 48 * 3600 - 1; ap.sim.t = setInterval(() => { ap.sim.seg = Math.max(0, ap.sim.seg - 977); const h = Math.floor(ap.sim.seg / 3600), m = Math.floor(ap.sim.seg % 3600 / 60), s = ap.sim.seg % 60; const r = $('#sim-reloj'); if (r) r.textContent = `⏳ ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; if (!ap.sim.seg && ap.sim.n < 20) { clearInterval(ap.sim.t); $('#sim-prop-nota').innerHTML = '⌛ <b>Se acabó el tiempo.</b> La propuesta venció. Volvé a intentarlo con “Atrás” y “Siguiente”.'; $('#sim-apoyar').disabled = true } }, 100) }
}
function simSumarVista() {
  const el = $('#sim-sum-vista'); if (!el) return
  const alias = $('#sim-sum-alias')?.checked, msg = ($('#sim-sum-msg')?.value || '').trim()
  const est = ap.sim.pedido === 2 ? '<em class="ok">✓ Aceptado</em>' : ap.sim.pedido === 1 ? '<em>⏳ Revisando…</em>' : '<em class="nada">Todavía no pediste</em>'
  el.innerHTML = `<div class="sim-sumar-fila ${ap.sim.pedido ? '' : 'tenue'}"><span class="sim-av" style="${alias ? '' : 'background:#9aa0b5'}">${alias ? 'A' : '?'}</span>
    <div><b>${alias ? 'Ayn Rand' : 'Ciudadano anónimo'}</b><small>${msg ? '“' + esc(msg) + '”' : 'Sin presentación'}</small></div>${est}</div>
    <p class="sim-sumar-no">🚫 No ve: tu butaca #${estado.butaca || 250} ni tus votos</p>`
}
function pintarCola() {
  const el = $('#sim-cola'); if (!el) return
  const fila = [...ap.sim.cola, ...(ap.sim.yo ? ['yo'] : [])]
  el.innerHTML = fila.map((s, i) => `<span class="${s === 'yo' ? 'yo' : ''} ${i < 3 ? 'habla' : ''}">${i < 3 ? '🎙️' : '✋'} ${s === 'yo' ? 'Vos' : '#' + s}</span>`).join('')
  const pos = fila.indexOf('yo'), nota = $('#sim-mano-nota')
  if (!nota) return
  if (pos < 0) nota.textContent = `Hay ${fila.length} personas en la fila. Levantá la mano.`
  else if (pos < 3) { nota.innerHTML = '🎙️ <b>¡Te toca!</b> Ya podés escribir tu argumento.'; clearInterval(ap.sim.t) }
  else nota.innerHTML = `Estás en la fila: posición <b>${pos + 1}</b>. Hablan 3 a la vez…`
}

// ── Nivel de Nerdocrasy que sube solo en la escena ──
function animarNivel() { let n = 1; const el = $('.a-nivel'); if (!el) return; el.textContent = n; ap.sim.t = setInterval(() => { if (!document.contains(el)) return clearInterval(ap.sim.t); n = n >= 90 ? 1 : n + 1; el.textContent = n }, 120) }

function enlazarAprende() {
  $('#ap-vista')?.addEventListener('click', e => { const b = e.target.closest('[data-leccion]'); if (b) location.hash = '#aprende/' + b.dataset.leccion })
  const m = $('#modal-leccion'); if (!m) return
  m.addEventListener('click', e => {
    if (e.target === m) return cerrarLeccion()
    const a = e.target.closest('[data-ap]')?.dataset.ap
    if (a === 'cerrar') return cerrarLeccion()
    if (a === 'ir') { $('#modal-leccion').hidden = true; document.body.style.overflow = ''; ap.lec = null; return }
    if (a === 'sig') { ap.paso++; return pintarLeccion() }
    if (a === 'atras') { ap.paso = Math.max(0, ap.paso - 1); return pintarLeccion() }
    const l = e.target.closest('[data-leccion]'); if (l) { location.hash = '#aprende/' + l.dataset.leccion; return }
    const op = e.target.closest('.ap-op'); if (op && !op.disabled) return responderQuiz(op)
    const v = e.target.closest('[data-sim-voto]')
    if (v) {
      if (ap.sim.votado) { const n = $('#sim-nota'); n.hidden = false; n.innerHTML = '🚫 <b>Ya votaste.</b> Un voto por butaca, y no se cambia.'; n.classList.add('sacudir'); setTimeout(() => n.classList.remove('sacudir'), 500); return }
      ap.sim.votado = v.dataset.simVoto
      $$('[data-sim-voto]').forEach(b => b.classList.toggle('elegida', b === v))
      const base = { si: 1205, no: 412, abs: 61 }, et = { si: 'Sí', no: 'No', abs: 'Abst.' }
      $('#sim-cont').innerHTML = Object.keys(base).map(k => `${et[k]} <span class="${k === ap.sim.votado ? 'sube' : ''}">${fmtNum(base[k] + (k === ap.sim.votado ? 1 : 0))}</span>`).join(' · ')
      $('#sim-dentro').hidden = false; $('#sim-nota').hidden = false
      return
    }
    if (e.target.closest('#sim-apoyar')) {
      if (ap.sim.n >= 20) return
      ap.sim.n++; $('#sim-arco').innerHTML = arcoButacas(ap.sim.n, 20, 'grande' + (ap.sim.n >= 20 ? ' completo' : ''))
      $(`#sim-arco circle[data-i="${ap.sim.n - 1}"]`)?.classList.add('nueva')
      $('#sim-apoyos').textContent = `${ap.sim.n} / 20 apoyos`
      if (ap.sim.n >= 20) { clearInterval(ap.sim.t); $('#sim-prop-nota').innerHTML = '🎯 <b>¡Meta lograda!</b> Ahora pasa a revisión y puede convertirse en votación del Cabildo.'; $('#sim-apoyar').disabled = true }
      else if (ap.sim.n >= 15) $('#sim-prop-nota').innerHTML = `🔥 ¡Faltan <b>${20 - ap.sim.n}</b>!`
      return
    }
    if (e.target.closest('#sim-sum-pedir')) {
      if (ap.sim.pedido) return
      const btn = $('#sim-sum-pedir'); ap.sim.pedido = 1; btn.textContent = '⏳ Pendiente'; btn.disabled = true
      $('#sim-sum-alias').disabled = $('#sim-sum-msg').disabled = true; simSumarVista()
      $('#sim-sum-nota').textContent = 'Tu solicitud le llegó al anfitrión…'
      ap.sim.t = setTimeout(() => { if (!$('#sim-sum-vista')) return; ap.sim.pedido = 2; simSumarVista(); btn.textContent = '✓ Sos miembro'
        $('#sim-sum-nota').innerHTML = '🎉 <b>¡Te aceptó!</b> Entraste al bloque, y el anfitrión nunca supo cuál es tu butaca.' }, 1800)
      return
    }
    const ap$ = e.target.closest('[data-sim-aporte]')
    if (ap$) {
      const antes = ap.sim.plata; ap.sim.plata += +ap$.dataset.simAporte
      $('#sim-soc-fill').style.width = Math.min(100, ap.sim.plata / 12 * 100) + '%'
      $('#sim-soc-n').textContent = `$${ap.sim.plata} de $12 en el año`
      const nota = $('#sim-soc-nota')
      if (ap.sim.plata >= 12) {
        const hasta = new Date(); hasta.setFullYear(hasta.getFullYear() + 1)
        $('#sim-soc-est').innerHTML = `<b class="sim-socio-ok">★ Socio hasta ${hasta.toLocaleDateString('es', { month: 'short', year: 'numeric' })}</b>`
        $('.sim-socio').classList.add('socio')
        nota.innerHTML = antes < 12 ? '🎉 <b>¡Sos socio!</b> Ahora proponés y votás proyectos en secreto. En el Cabildo tu voto vale lo mismo que antes: 1 butaca = 1 voto.'
          : 'Aportar más ayuda al Cabildo, pero <b>no te da más votos</b> ni un Fundador más raro.'
      } else { $('#sim-soc-est').textContent = `Te faltan $${12 - ap.sim.plata}`; nota.textContent = 'Sumá aportes, aunque sean chicos: cuenta el total del año.' }
      return
    }
    if (e.target.closest('#sim-mano-btn')) {
      if (ap.sim.yo) return
      ap.sim.yo = true; e.target.closest('#sim-mano-btn').classList.add('ready'); pintarCola(); return
    }
  })
  m.addEventListener('input', e => { if (e.target.matches('#sim-sum-alias, #sim-sum-msg')) simSumarVista() })
  m.addEventListener('change', e => {
    if (e.target.id === 'sim-sum-alias') simSumarVista()
    if (e.target.id === 'sim-alias-on') {
      const on = e.target.checked
      $('#sim-alias-nombre').textContent = on ? 'Ayn Rand' : 'Ciudadano anónimo'
      $('.sim-av').textContent = on ? 'A' : '#'
    }
  })
  document.addEventListener('keydown', e => {
    if ($('#modal-leccion').hidden) return
    if (e.key === 'Escape') return cerrarLeccion()
    if (e.target.matches('input, textarea')) return
    if (e.key === 'ArrowRight' && $('[data-ap="sig"]')) { ap.paso++; pintarLeccion() }
    if (e.key === 'ArrowLeft' && ap.paso > 0) { ap.paso--; pintarLeccion() }
  })
}

// ══════════════════════════════════════════════════════════════
//  MURO DEL DÍA — una opinión por butaca por día (se reinicia a las 3:00 de Venezuela).
//  El servidor pone la butaca, el alias (solo si es público) y el color; acá no se pide user_id ajeno.
// ══════════════════════════════════════════════════════════════
const mu = { posts: [], mios: new Set(), cargado: false, canal: null, abierto: null, orden: 'recientes', enviando: false }
const diaMuro = () => new Date(Date.now() - 7 * 3600e3).toISOString().slice(0, 10)
const finDiaMuro = () => { const d = new Date(Date.now() - 7 * 3600e3); d.setUTCHours(0, 0, 0, 0); return d.getTime() + 31 * 3600e3 }
const miPostHoy = () => mu.posts.find(p => p.seat_number === estado.butaca)
const MU_SEL = 'id, seat_number, alias, card_color, body, created_at, likes_count, muro_replies(id, seat_number, alias, card_color, body, created_at)'

async function cargarMuroDia() {
  if (!estado.user) { mu.cargado = true; return pintarMuroDia() }
  try {
    const { data, error } = await sb.from('muro_posts').select(MU_SEL).eq('day_key', diaMuro()).order('created_at', { ascending: false }).limit(300)
    if (error) throw error
    mu.posts = (data || []).map(p => ({ ...p, muro_replies: (p.muro_replies || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)) }))
    mu.mios = new Set()
    if (mu.posts.length) {
      const { data: l } = await sb.from('muro_likes').select('post_id').eq('user_id', estado.user.id).in('post_id', mu.posts.map(p => p.id))
      ;(l || []).forEach(x => mu.mios.add(x.post_id))
    }
  } catch (e) { console.warn('muro:', e) }
  mu.cargado = true
  pintarMuroDia()
  escucharMuro()
}

function escucharMuro() {
  if (mu.canal || !estado.user) return
  mu.canal = sb.channel('muro-v2')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'muro_posts', filter: `day_key=eq.${diaMuro()}` }, ({ new: p }) => {
      if (mu.posts.some(x => x.id === p.id)) return
      mu.posts.unshift({ id: p.id, seat_number: p.seat_number, alias: p.alias, card_color: p.card_color, body: p.body, created_at: p.created_at, likes_count: p.likes_count || 0, muro_replies: [], nueva: true })
      if (vistaActual() === 'muro') pintarMuroDia()
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'muro_replies' }, ({ new: r }) => {
      const p = mu.posts.find(x => x.id === r.post_id); if (!p || p.muro_replies.some(x => x.id === r.id)) return
      p.muro_replies.push({ id: r.id, seat_number: r.seat_number, alias: r.alias, card_color: r.card_color, body: r.body, created_at: r.created_at })
      if (vistaActual() === 'muro') pintarMuroDia()
      if (mu.abierto === p.id) pintarHiloMuro()
    })
    .subscribe()
}
function dejarMuro() { if (mu.canal) { sb.removeChannel(mu.canal); mu.canal = null } }

const muAv = (alias, color, seat) => `<span class="mu-av" style="background:${colorDe(color, seat)}">${/^Butaca #/.test(alias || '') ? '#' : esc((alias || '#').charAt(0).toUpperCase())}</span>`

function tarjetaMuro(p) {
  const mia = p.seat_number === estado.butaca, c = colorDe(p.card_color, p.seat_number), resp = p.muro_replies.length
  return `<article class="mu-card ${mia ? 'mia' : ''} ${p.nueva ? 'nueva' : ''}" style="--c:${c}" data-mu-abrir="${p.id}" tabindex="0">
    <header>${muAv(p.alias, p.card_color, p.seat_number)}<div><b>${mia ? 'Vos' : esc(p.alias)}</b><small>#${p.seat_number} · ${haceCuanto(p.created_at)}</small></div></header>
    <p>${esc(p.body)}</p>
    <footer>
      <button class="mu-like ${mu.mios.has(p.id) ? 'on' : ''}" data-mu-like="${p.id}" aria-label="Me gusta"><svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg><span>${fmtNum(p.likes_count)}</span></button>
      <span class="mu-resp"><svg viewBox="0 0 24 24"><path d="M5 5h14v10H9l-4 4z"/></svg>${resp ? fmtNum(resp) : 'Responder'}</span>
    </footer>
  </article>`
}

function pintarMuroDia() {
  const esc_ = $('#mu-escribir'), grid = $('#mu-grid'); if (!grid) return
  tickMuro()
  const hoy = new Date(Date.now() - 7 * 3600e3)
  $('#mu-sub').textContent = `${hoy.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).replace(/^./, c => c.toUpperCase())} · Una opinión por butaca, por día.`
  if (!mu.cargado) { grid.innerHTML = '<p class="muted">Cargando…</p>'; return }
  // Caja para escribir
  const mio = miPostHoy(), ident = estado.ident || {}
  const miAlias = ident.show_alias && ident.alias ? ident.alias : `Butaca #${estado.butaca}`
  if (!estado.user) esc_.innerHTML = `<div class="card mu-caja mu-caja-info"><p>Iniciá sesión para leer y escribir en el Muro.</p><a class="btn btn-dark" href="${APP_ACTUAL}">Iniciar sesión</a></div>`
  else if (!estado.butaca) esc_.innerHTML = `<div class="card mu-caja mu-caja-info"><p>Para escribir en el Muro necesitás tu butaca.</p><a class="btn btn-dark" href="${APP_ACTUAL}">Completar verificación</a></div>`
  else if (mio) esc_.innerHTML = `<div class="card mu-caja mu-hecho"><span class="mu-ok">✓</span><div><b>Ya dejaste tu opinión de hoy.</b><p>Mañana a las 3:00 se abre un Muro nuevo. Si querés cambiarla, podés borrarla y escribir otra.</p></div>
      <button class="btn" data-mu-borrar="${mio.id}">Borrar y escribir otra</button></div>`
  else if (!esc_.querySelector('#mu-txt')) esc_.innerHTML = `<div class="card mu-caja">
      ${muAv(miAlias, ident.card_color, estado.butaca)}
      <div class="mu-caja-cuerpo">
        <label for="mu-txt" class="mu-caja-tit">¿Qué pensás hoy, <b>${esc(miAlias)}</b>?</label>
        <textarea id="mu-txt" maxlength="280" rows="3" placeholder="Tu opinión del día. Tenés una sola: que valga."></textarea>
        <div class="mu-caja-pie"><small>Publicás como <b>${esc(miAlias)}</b>${ident.show_alias ? '' : ' (tu alias está oculto)'} · se ve hasta mañana a las 3:00</small>
          <span class="mu-cont" id="mu-cont">280</span><button class="btn btn-dark" id="mu-publicar" disabled>Publicar</button></div>
      </div></div>`
  // Lista
  const lista = [...mu.posts].sort(mu.orden === 'apoyadas' ? (a, b) => b.likes_count - a.likes_count || new Date(b.created_at) - new Date(a.created_at) : (a, b) => new Date(b.created_at) - new Date(a.created_at))
  $('#mu-cuenta').textContent = mu.posts.length ? `${fmtNum(mu.posts.length)} ${mu.posts.length === 1 ? 'voz' : 'voces'} hoy` : ''
  grid.innerHTML = lista.length ? lista.map(tarjetaMuro).join('') : '<div class="card au-vacio"><span class="au-vacio-ico"><svg viewBox="0 0 24 24">' + ICONOS.muro + '</svg></span><h3>El Muro de hoy está vacío</h3><p class="muted">Sé la primera voz del día.</p></div>'
  mu.posts.forEach(p => { delete p.nueva })
}

function tickMuro() {
  const r = $('#mu-reloj'); if (!r) return
  const resta = Math.max(0, finDiaMuro() - Date.now()), h = Math.floor(resta / 3600e3), m = Math.floor(resta % 3600e3 / 60e3)
  r.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/></svg>Nuevo Muro en <b>${h} h ${String(m).padStart(2, '0')} min</b>`
  if (resta === 0 && mu.cargado) { mu.cargado = false; dejarMuro(); cargarMuroDia() }
}

async function publicarMuro() {
  const el = $('#mu-txt'), btn = $('#mu-publicar'); if (!el || mu.enviando) return
  const txt = limpiar(el.value).trim().slice(0, 280); if (!txt) return
  mu.enviando = true; btn.disabled = true; btn.textContent = 'Publicando…'
  const { data, error } = await seguro(sb.from('muro_posts').insert({ user_id: estado.user.id, body: txt, day_key: diaMuro() }).select(MU_SEL).single())
  mu.enviando = false
  if (error) {
    btn.disabled = false; btn.textContent = 'Publicar'
    if (error.code === '23505' || /row-level|policy/i.test(error.message)) { aviso('Ya publicaste tu opinión de hoy. Volvé mañana.', 'error'); return cargarMuroDia() }
    return aviso(/caracteres|butaca/i.test(error.message) ? error.message : 'No se pudo publicar. Intentá de nuevo.', 'error')
  }
  if (!mu.posts.some(p => p.id === data.id)) mu.posts.unshift({ ...data, muro_replies: [], nueva: true })
  $('#mu-escribir').innerHTML = ''
  aviso('¡Publicado en el Muro del día!')
  pintarMuroDia(); cargarMuro()
}

async function borrarMuro(id) {
  if (!await confirmar('¿Borrar tu publicación de hoy?', 'Se borra con sus respuestas y me gusta. Después podés escribir otra.', 'Borrar', true)) return
  const { error } = await sb.from('muro_posts').delete().eq('id', id)
  if (error) return aviso('No se pudo borrar. Intentá de nuevo.', 'error')
  mu.posts = mu.posts.filter(p => p.id !== id)
  if (mu.abierto === id) cerrarHiloMuro()
  aviso('Publicación borrada. Ya podés escribir otra.')
  pintarMuroDia(); cargarMuro()
}

async function likeMuro(id, btn) {
  if (!estado.butaca) return aviso('Necesitás tu butaca para dar me gusta.', 'error')
  const p = mu.posts.find(x => x.id === id); if (!p || btn?.disabled) return
  const antes = mu.mios.has(id)
  const pinta = () => $$(`[data-mu-like="${id}"]`).forEach(b => { b.classList.toggle('on', mu.mios.has(id)); b.querySelector('span').textContent = fmtNum(p.likes_count) })
  mu.mios[antes ? 'delete' : 'add'](id); p.likes_count += antes ? -1 : 1; pinta()
  $$(`[data-mu-like="${id}"]`).forEach(b => { b.disabled = true; if (!antes) b.classList.add('late') })
  const { data, error } = await sb.rpc('muro_toggle_like', { p_post_id: id })
  if (error) { mu.mios[antes ? 'add' : 'delete'](id); p.likes_count += antes ? 1 : -1 }
  else { mu.mios[data.liked ? 'add' : 'delete'](id); p.likes_count = data.likes_count }
  pinta(); $$(`[data-mu-like="${id}"]`).forEach(b => { b.disabled = false; setTimeout(() => b.classList.remove('late'), 400) })
}

function abrirHiloMuro(id) { mu.abierto = id; $('#modal-muro').hidden = false; document.body.style.overflow = 'hidden'; pintarHiloMuro(); setTimeout(() => $('#mu-resp-txt')?.focus(), 50) }
function cerrarHiloMuro() { mu.abierto = null; $('#modal-muro').hidden = true; document.body.style.overflow = '' }
function pintarHiloMuro() {
  const p = mu.posts.find(x => x.id === mu.abierto), box = $('#mu-detalle'); if (!p || !box) return cerrarHiloMuro()
  const mia = p.seat_number === estado.butaca
  box.innerHTML = `<article class="mu-det" style="--c:${colorDe(p.card_color, p.seat_number)}">
      <header>${muAv(p.alias, p.card_color, p.seat_number)}<div><b>${mia ? 'Vos' : esc(p.alias)}</b><small>Butaca #${p.seat_number} · ${haceCuanto(p.created_at)}</small></div></header>
      <p>${esc(p.body)}</p>
      <footer><button class="mu-like ${mu.mios.has(p.id) ? 'on' : ''}" data-mu-like="${p.id}"><svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg><span>${fmtNum(p.likes_count)}</span></button>
        ${mia ? `<button class="mu-borrar" data-mu-borrar="${p.id}">Borrar</button>` : ''}</footer>
    </article>
    <div class="mu-hilo" id="mu-hilo">${p.muro_replies.length ? p.muro_replies.map(r => `<div class="mu-r">${muAv(r.alias, r.card_color, r.seat_number)}<div><div class="mu-r-cab"><b>${r.seat_number === estado.butaca ? 'Vos' : esc(r.alias)}</b><small>#${r.seat_number} · ${haceCuanto(r.created_at)}</small></div><p>${esc(r.body)}</p></div></div>`).join('')
      : '<p class="muted mu-hilo-vacio">Todavía nadie respondió.</p>'}</div>
    ${estado.butaca ? `<div class="mu-responder"><textarea id="mu-resp-txt" maxlength="280" rows="1" placeholder="Respondé con respeto…"></textarea><button class="btn btn-dark" id="mu-resp-btn">Responder</button></div>`
      : '<p class="muted">Necesitás tu butaca para responder.</p>'}`
  const h = $('#mu-hilo'); h.scrollTop = h.scrollHeight
}

async function responderMuro() {
  const el = $('#mu-resp-txt'), btn = $('#mu-resp-btn'), p = mu.posts.find(x => x.id === mu.abierto); if (!el || !p) return
  const txt = limpiar(el.value).trim().slice(0, 280); if (!txt) return
  if (btn.disabled) return
  btn.disabled = true
  const { data, error } = await seguro(sb.from('muro_replies').insert({ post_id: p.id, user_id: estado.user.id, body: txt }).select('id, seat_number, alias, card_color, body, created_at').single())
  btn.disabled = false
  if (error) return aviso(/caracteres|butaca/i.test(error.message) ? error.message : 'No se pudo responder.', 'error')
  if (!p.muro_replies.some(r => r.id === data.id)) p.muro_replies.push(data)
  el.value = ''; pintarHiloMuro(); pintarMuroDia(); $('#mu-resp-txt')?.focus()
}

function enlazarMuro() {
  const v = $('#mu-vista'); if (!v) return
  v.addEventListener('click', e => {
    if (e.target.closest('#mu-publicar')) return publicarMuro()
    const b = e.target.closest('[data-mu-borrar]'); if (b) return borrarMuro(b.dataset.muBorrar)
    const l = e.target.closest('[data-mu-like]'); if (l) return likeMuro(l.dataset.muLike, l)
    const o = e.target.closest('[data-mu-orden]')
    if (o) { mu.orden = o.dataset.muOrden; $$('[data-mu-orden]').forEach(x => x.classList.toggle('active', x === o)); return pintarMuroDia() }
    const a = e.target.closest('[data-mu-abrir]'); if (a) return abrirHiloMuro(a.dataset.muAbrir)
  })
  v.addEventListener('keydown', e => {
    if (e.target.id === 'mu-txt' && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); publicarMuro() }
    if (e.key === 'Enter' && e.target.matches('[data-mu-abrir]')) abrirHiloMuro(e.target.dataset.muAbrir)
  })
  v.addEventListener('input', e => {
    if (e.target.id !== 'mu-txt') return
    const n = 280 - e.target.value.length, c = $('#mu-cont')
    c.textContent = n; c.className = 'mu-cont' + (n <= 20 ? ' poco' : '')
    $('#mu-publicar').disabled = !e.target.value.trim()
  })
  const m = $('#modal-muro')
  m.addEventListener('click', e => {
    if (e.target === m || e.target.closest('[data-mu="cerrar"]')) return cerrarHiloMuro()
    const l = e.target.closest('[data-mu-like]'); if (l) return likeMuro(l.dataset.muLike, l)
    const b = e.target.closest('[data-mu-borrar]'); if (b) return borrarMuro(b.dataset.muBorrar)
    if (e.target.closest('#mu-resp-btn')) return responderMuro()
  })
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !m.hidden && $('#modal-conf')?.hidden !== false) cerrarHiloMuro() })
  m.addEventListener('keydown', e => {
    if (e.target.id === 'mu-resp-txt' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); responderMuro() }
  })
}

// ══════════════════════════════════════════════════════════════
//  MONITOR — el Hemiciclo y las votaciones vigentes a pantalla completa, como una pantalla de sesión.
//  Pensado para proyectar o dejar abierto: se actualiza solo, tiene reloj, cuentas regresivas y modo pantalla completa.
//  Privacidad: mientras una votación está abierta NO se marca qué butacas votaron; solo se muestran totales.
//  Cuando entra un voto nuevo, una onda recorre todo el hemiciclo (es simbólica: no señala a nadie).
// ══════════════════════════════════════════════════════════════
const mon = { abierto: false, volver: 'inicio', raf: 0, poll: 0, dpr: 1, cam: null, ondas: [], votos: null, quieto: 0, ultimaQ: '' }
const fmtMonHora = new Intl.DateTimeFormat('es-VE', { timeZone: 'America/Caracas', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })
const fmtMonFecha = new Intl.DateTimeFormat('es-VE', { timeZone: 'America/Caracas', weekday: 'long', day: 'numeric', month: 'long' })

function abrirMonitor() {
  if (!mon.abierto) { mon.volver = vistaActual() || 'inicio'; mon.votos = null; mon.ondas = [] }
  mon.abierto = true
  $('#mon').hidden = false; document.body.style.overflow = 'hidden'
  monTamano(); tickMonitor(); pintarMonitor()
  cargarVotacion(); cargarPresencia()                      // datos frescos al abrir
  if (!totalButacas) cargarHemiciclo()
  clearInterval(mon.poll); mon.poll = setInterval(() => { if (mon.abierto) cargarVotacion() }, 15_000)
  clearInterval(mon.rueda); mon.rueda = setInterval(monRodar, 7000)
  cancelAnimationFrame(mon.raf); mon.raf = requestAnimationFrame(monCuadro)
  monDespertar()
  setTimeout(() => $('#mon-cerrar')?.focus({ preventScroll: true }), 50)
}

function cerrarMonitor(volver = true) {
  if (!mon.abierto) return
  mon.abierto = false
  cancelAnimationFrame(mon.raf); clearInterval(mon.poll); clearInterval(mon.rueda); clearTimeout(mon.quieto)
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  $('#mon').hidden = true; $('#mon').classList.remove('quieto'); document.body.style.overflow = ''
  if (volver && location.hash.startsWith('#monitor')) location.hash = '#' + (mon.volver || 'inicio')
  if (vistaActual() === 'inicio') requestAnimationFrame(dibujarHemiciclo)
}

function pintarMonitor() {
  if (!mon.abierto) return
  const n = iqPreguntas.length
  const total = [...iqVotos.values()].reduce((a, v) => a + v, 0)
  $('#mon-butacas').textContent = totalButacas ? fmtNum(totalButacas) : '—'
  $('#mon-abiertas').textContent = fmtNum(n)
  $('#mon-votos').textContent = fmtNum(total)
  $('#mon-vivo').classList.toggle('apagado', !n)
  $('#mon-vivo-txt').textContent = n ? 'Sesión en vivo' : 'Sin sesión'
  // Llegaron votos nuevos: onda por el hemiciclo y "+N" junto al contador
  if (mon.votos !== null && total > mon.votos) {
    mon.ondas.push(performance.now())
    const mas = $('#mon-mas'); mas.textContent = `+${fmtNum(total - mon.votos)}`
    mas.classList.remove('sube'); void mas.offsetWidth; mas.classList.add('sube')
  }
  mon.votos = total
  // Lista de votaciones vigentes
  const ul = $('#mon-vq')
  const firma = iqPreguntas.map(q => q.id).join()
  if (!n) ul.innerHTML = '<li class="mon-vacio"><b>No hay votaciones abiertas</b><span>Cuando empiece una sesión aparece aquí sola, con su cuenta regresiva.</span></li>'
  else {
    if (firma !== mon.ultimaQ) {
      ul.innerHTML = iqPreguntas.map((q, i) => `<li class="mon-q" style="--i:${i}">
        <div class="mon-q-top"><span class="mon-tag">${esc(q.category || 'General')}</span><b class="mon-cd" data-mon-fin="${esc(q.ends_at)}">${cuentaRegresiva(q.ends_at)}</b></div>
        <p title="${esc(q.text)}">${esc(q.text)}</p>
        <div class="mon-q-barra"><i data-mon-barra="${q.id}"></i></div>
        <div class="mon-q-pie"><span data-mon-votos="${q.id}"></span><span data-mon-pc="${q.id}"></span></div>
      </li>`).join('')
    }
    iqPreguntas.forEach(q => {
      const v = iqVotos.get(q.id) ?? 0, pc = totalButacas ? v / totalButacas * 100 : 0
      const a = $(`[data-mon-votos="${q.id}"]`), b = $(`[data-mon-pc="${q.id}"]`), c = $(`[data-mon-barra="${q.id}"]`)
      if (a) a.innerHTML = `<b>${fmtNum(v)}</b> ${v === 1 ? 'voto' : 'votos'}`
      if (b) b.textContent = `${pc > 0 && pc < 1 ? '<1' : Math.round(pc)}% de participación`
      if (c) c.style.width = Math.min(100, pc) + '%'
    })
  }
  mon.ultimaQ = n ? firma : ''
  $('#mon-cerradas').innerHTML = iqCerradas.length ? `<h3>Recién cerradas</h3>` + iqCerradas.map(q => `<a class="mon-cer ${rvVista(q.id) ? '' : 'nueva'}" href="#revelacion/${q.id}">
      <span class="iq-chispa" aria-hidden="true">✦</span><span><b>${esc(q.text)}</b><small>Cerró ${haceCuanto(q.ends_at)}</small></span><em>${rvVista(q.id) ? 'Ver resultado' : 'Revelación'}</em></a>`).join('') : ''
}

function tickMonitor() {
  const now = new Date()
  $('#mon-hora').textContent = fmtMonHora.format(now).replace(/\s+/g, ' ')
  const f = fmtMonFecha.format(now); $('#mon-fecha').textContent = f.charAt(0).toUpperCase() + f.slice(1) + ' · hora de Venezuela'
  $$('[data-mon-fin]').forEach(el => {
    const s = Math.floor((new Date(el.dataset.monFin) - Date.now()) / 1000)
    el.textContent = s <= 0 ? 'Cerró' : cuentaRegresiva(el.dataset.monFin)
    el.closest('.mon-q')?.classList.toggle('urge', s > 0 && s < 600)
    el.closest('.mon-q')?.classList.toggle('fin', s <= 0)
  })
}

// Encuadre del hemiciclo dentro de la escena (misma geometría y orientación que el de Inicio)
function monTamano() {
  const cv = $('#mon-hemi'), esc_ = $('#mon-escena'); if (!cv || !esc_ || !limites) { mon.cam = null; return }
  mon.dpr = Math.min(window.devicePixelRatio || 1, 2)
  const W = esc_.clientWidth, Hh = esc_.clientHeight
  cv.width = Math.max(1, Math.round(W * mon.dpr)); cv.height = Math.max(1, Math.round(Hh * mon.dpr))
  const pad = Math.min(W, Hh) * .04, t1 = Math.max(13, Math.min(W * .024, 34)), abajo = t1 * 3.4   // lugar para el rótulo bajo el arco
  const s = Math.max(.05, Math.min((W - pad * 2) / (limites.x1 - limites.x0 + H.DOT * 2), (Hh - pad * 2 - abajo) / (limites.y1 - limites.y0 + H.DOT * 2)))
  const alto = (limites.y1 - limites.y0) * s + abajo
  mon.cam = { s, t1, cx: W / 2 - (limites.x0 + limites.x1) / 2 * s, cy: (Hh - alto) / 2 - limites.y0 * s, W, Hh }
}

function monCuadro(now) {
  if (!mon.abierto) return
  mon.raf = requestAnimationFrame(monCuadro)
  if (!mon.cam || mon.cam.W !== $('#mon-escena').clientWidth) monTamano()
  if (!mon.cam || !asientos.length) return
  const cv = $('#mon-hemi'), ctx = cv.getContext('2d'), d = mon.dpr, { s, cx, cy, W, Hh } = mon.cam
  ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, W, Hh)
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches
  const rad = Math.max(1.6, Math.min(10, H.DOT * s * .75))
  const vivo = iqPreguntas.length > 0
  // ondas activas (cada voto nuevo dispara una, dura 2,2 s)
  mon.ondas = mon.ondas.filter(t0 => now - t0 < 2200)
  const rMax = H.R_IN + 40 * H.R_STEP
  const frentes = quieto ? [] : mon.ondas.map(t0 => (now - t0) / 2200 * (rMax + 200))
  for (let i = 0; i < asientos.length; i++) {
    const a = asientos[i]
    if (a.num === estado.butaca) continue
    const rr = Math.hypot(a.x, a.y)
    // respiración suave en barrido (igual para todos: no representa votos)
    let alfa = vivo && !quieto ? .24 + .08 * Math.sin(Math.atan2(a.y, a.x) * 4 - now / 900) : .22
    let oro = 0
    for (const f of frentes) oro = Math.max(oro, Math.exp(-(((rr - f) / 55) ** 2)))
    if (oro > .02) { ctx.fillStyle = `rgba(245,185,66,${(.25 + .75 * oro).toFixed(3)})` }
    else ctx.fillStyle = `rgba(255,255,255,${alfa.toFixed(3)})`
    ctx.beginPath(); ctx.arc(cx + a.x * s, cy + a.y * s, rad, 0, 6.283); ctx.fill()
  }
  // butacas presentes (luz blanca)
  for (const n of pres.set) {
    if (n === estado.butaca) continue
    const a = asientos[n - 1]; if (a) dibujarEncendida(ctx, cx + a.x * s, cy + a.y * s, rad, true)
  }
  // tu butaca
  const mia = estado.butaca && asientos[estado.butaca - 1]
  if (mia) {
    const x = cx + mia.x * s, y = cy + mia.y * s
    if (pres.mia) { ctx.save(); ctx.shadowColor = 'rgba(255,255,255,.95)'; ctx.shadowBlur = rad * 5; ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(x, y, rad * 1.7, 0, 6.283); ctx.fill(); ctx.restore() }
    ctx.shadowColor = 'rgba(247,106,30,.8)'; ctx.shadowBlur = 16; ctx.fillStyle = '#f76a1e'
    ctx.beginPath(); ctx.arc(x, y, rad * 1.35, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0
    ctx.strokeStyle = 'rgba(247,106,30,.6)'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(x, y, rad * 1.35 + 5 + (quieto ? 0 : Math.sin(now / 350) * 1.5), 0, 6.283); ctx.stroke()
  }
  // rótulo en el centro del arco
  const t1 = mon.cam.t1, fx = cx, fy = cy + limites.y1 * s + rad + t1 * 1.2   // rótulo debajo del arco, como en Inicio
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.font = `800 ${t1}px Inter, system-ui, sans-serif`
  ctx.fillText('C A B I L D O', fx, fy)
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = `600 ${t1 * .48}px Inter, system-ui, sans-serif`
  ctx.fillText('D E   V E N E Z U E L A', fx, fy + t1 * .95)
  const linea = [mia ? `● Tu butaca #${estado.butaca}` : '', pres.set.size ? `💡 ${fmtNum(pres.set.size)} ${pres.set.size === 1 ? 'butaca presente' : 'butacas presentes'}` : ''].filter(Boolean).join('     ')
  if (linea) { ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = `700 ${t1 * .42}px Inter, system-ui, sans-serif`; ctx.fillText(linea, fx, fy + t1 * 1.75) }
}

// Si no entran todas las votaciones, la lista baja sola de a una tarjeta (como en una pantalla de sesión).
// Se detiene mientras el mouse está encima o en el teléfono (ahí se desplaza a mano).
function monRodar() {
  const l = $('.mon-lista'); if (!l || mon.encima || window.innerWidth <= 900) return
  if (l.scrollHeight - l.clientHeight < 8) return
  const fin = l.scrollTop + l.clientHeight >= l.scrollHeight - 8
  const paso = ($('.mon-q')?.offsetHeight || 160) + 12
  l.scrollTo({ top: fin ? 0 : l.scrollTop + paso, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
}

// En pantalla completa, los controles y el cursor se esconden si no se mueve el mouse
function monDespertar() {
  const m = $('#mon'); m.classList.remove('quieto'); clearTimeout(mon.quieto)
  if (document.fullscreenElement) mon.quieto = setTimeout(() => m.classList.add('quieto'), 3000)
}
function monPantallaCompleta() {
  const m = $('#mon')
  if (document.fullscreenElement) document.exitFullscreen?.()
  else if (m.requestFullscreen) m.requestFullscreen().catch(() => aviso('Tu navegador no permitió la pantalla completa.', 'err'))
  else aviso('Tu navegador no permite pantalla completa. Probá con F11.', 'err')
}

function enlazarMonitor() {
  $('#btn-luz')?.addEventListener('click', () => cambiarPresencia(true))
  const m = $('#mon')
  $('#mon-cerrar').addEventListener('click', () => cerrarMonitor())
  $('#mon-full').addEventListener('click', monPantallaCompleta)
  m.addEventListener('pointermove', monDespertar)
  $('.mon-lista').addEventListener('pointerenter', () => { mon.encima = true })
  $('.mon-lista').addEventListener('pointerleave', () => { mon.encima = false })
  m.addEventListener('click', e => { if (e.target.closest('.mon-cer')) cerrarMonitor(false) })
  document.addEventListener('fullscreenchange', () => {
    const full = document.fullscreenElement === m
    $('#mon-full span').textContent = full ? 'Salir de pantalla completa' : 'Pantalla completa'
    m.classList.toggle('full', full); monDespertar()
    setTimeout(monTamano, 60)
  })
  document.addEventListener('keydown', e => {
    if (!mon.abierto || e.target.closest('input, textarea')) return
    if (e.key === 'Escape' && !document.fullscreenElement) cerrarMonitor()
    if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey) monPantallaCompleta()
  })
  window.addEventListener('resize', () => { if (mon.abierto) monTamano() })
  if (window.ResizeObserver) new ResizeObserver(() => { if (mon.abierto) monTamano() }).observe($('#mon-escena'))
}

// ══════════════════════════════════════════════════════════════
//  REVELACIÓN — el momento en que una votación cerrada muestra su resultado.
//  Privacidad: se encienden las butacas que votaron, TODAS del mismo color: muestra que esa butaca votó,
//  nunca qué votó (ese dato no existe en la base). El resultado se ve solo en los totales.
//  Hemiciclo clásico (arco hacia arriba). Pregunta, hemiciclo y panel van en franjas separadas: nunca se pisan.
// ══════════════════════════════════════════════════════════════
const RV_COL = { si: '#22c55e', no: '#ef4444', abs: '#94a3b8', luz: '#f5b942' }
const RV_T = { intro: 1300, luz: 3000, pausa: 700, conteo: 3600 }
const rv = { abierto: false, q: null, r: null, pts: [], orden: [], miIdx: -1, t0: 0, raf: 0, fase: '', volver: 'inicio', vistas: new Set(), dpr: 1 }
try { JSON.parse(localStorage.getItem('ux2_reveladas') || '[]').forEach(id => rv.vistas.add(id)) } catch (e) {}
const rvVista = id => rv.vistas.has(id)
const rvMarcar = id => { rv.vistas.add(id); try { localStorage.setItem('ux2_reveladas', JSON.stringify([...rv.vistas].slice(-300))) } catch (e) {} }

function rvAsientos(n) {
  const span = H.A1 - H.A0, res = []
  for (let row = 0; res.length < n; row++) {
    const r = H.R_IN + row * H.R_STEP, cap = Math.floor(r * span / H.GAP), cant = Math.min(cap, n - res.length), orden = ordenCentro(cap)
    for (let i = 0; i < cant; i++) { const a = H.A0 + (cap > 1 ? orden[i] / (cap - 1) : .5) * span; res.push({ x: r * Math.cos(a), y: -r * Math.sin(a), a }) }
  }
  return res
}
// Barajado con semilla (mismo orden para todos los que miran la misma votación)
function rvBarajar(n, semilla) {
  let s = [...String(semilla)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
  const azar = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
  const o = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [o[i], o[j]] = [o[j], o[i]] }
  return o
}

// Butacas que participaron en una votación (de a 1000 filas, el máximo por pedido)
async function rvSillas(id) {
  const todas = []
  try {
    for (let desde = 0; desde < 50000; desde += 1000) {
      const { data, error } = await sb.from('vote_seats').select('seat_number').eq('question_id', id).range(desde, desde + 999)
      if (error) throw error
      todas.push(...(data || []))
      if (!data || data.length < 1000) break
    }
  } catch (e) { console.warn('vote_seats:', e) }
  return { data: todas }
}

async function abrirRevelacion(id) {
  if (!id) return
  rv.volver = vistaActual() || 'inicio'
  rv.abierto = true; rv.q = null; rv.r = null
  $('#rv').hidden = false; document.body.style.overflow = 'hidden'
  $('#rv-preg').innerHTML = '<p class="rv-cargando">Abriendo la urna…</p>'; $('#rv-panel').innerHTML = ''; $('#rv-mi').hidden = true; $('#rv-fase').textContent = ''
  try {
    let q = [...iqPreguntas, ...iqCerradas, ...vPreguntas].find(x => x.id === id)
    const [qq, votos, part, cant, sillas] = await Promise.all([
      q ? Promise.resolve({ data: q }) : sb.from('questions').select('id, text, category, ends_at, status').eq('id', id).maybeSingle(),
      sb.rpc('get_question_votes', { p_question_id: id }),
      estado.butaca ? sb.rpc('v2_mis_participaciones') : Promise.resolve({ data: [] }),
      totalButacas ? Promise.resolve({ data: totalButacas }) : sb.rpc('get_butaca_count'),
      // Qué butacas participaron (nunca qué votó cada una: ese dato no existe)
      rvSillas(id),
    ])
    q = qq.data
    if (!rv.abierto) return
    if (!q) { $('#rv-preg').innerHTML = '<p class="rv-cargando">No encontramos esa votación.</p>'; return }
    if (new Date(q.ends_at) > new Date() && q.status === 'activa') { $('#rv-preg').innerHTML = `<p class="rv-cargando">Esta votación sigue abierta. La revelación llega cuando cierre.</p><a class="rv-cta" href="#votaciones" data-rv="cerrar">Ir a votar</a>`; return }
    const r = { si: 0, no: 0, abs: 0 }; let soloTotal = false
    ;(votos.data || []).forEach(x => { if (x.vote_plain in r) r[x.vote_plain] = Number(x.total) || 0; if (x.vote_plain === 'total') soloTotal = true })
    r.total = r.si + r.no + r.abs
    r.nula = soloTotal || r.total < 3
    rv.q = q; rv.r = r
    const reales = [...new Set((sillas?.data || []).map(x => Number(x.seat_number)).filter(n => n > 0))]
    const maxSilla = reales.reduce((a, n) => Math.max(a, n), 0)
    const butacas = Math.max(Number(cant.data) || 0, maxSilla, r.total, estado.butaca || 0, 50)
    rv.pts = rvAsientos(butacas)
    rv.participe = (part.data || []).includes(q.id) || reales.includes(estado.butaca)
    rv.miIdx = estado.butaca && estado.butaca <= rv.pts.length ? estado.butaca - 1 : -1
    if (reales.length) {
      // Se encienden las butacas REALES que votaron, en orden al azar y todas del mismo color
      const orden = rvBarajar(reales.length, q.id).map(k => reales[k] - 1)
      rv.encendibles = orden
      if (rv.participe && rv.miIdx >= 0) { rv.encendibles = orden.filter(i => i !== rv.miIdx); rv.encendibles.push(rv.miIdx) }   // la tuya, última
      rv.cuenta = reales.length
    } else {
      // Sin acceso a la lista de participación: encendido simbólico (tantas como votos)
      let orden = rvBarajar(rv.pts.length, q.id)
      if (rv.miIdx >= 0) { orden = orden.filter(i => i !== rv.miIdx); if (rv.participe) orden.splice(Math.max(0, r.total - 1), 0, rv.miIdx) }
      rv.encendibles = orden.slice(0, r.total)
      rv.cuenta = r.total
    }
    rv.butacas = butacas
    const largo = (q.text || '').length
    $('#rv-preg').innerHTML = `<span class="rv-tag">${esc(q.category || 'General')} · cerró el ${new Date(q.ends_at).toLocaleDateString('es-VE', { day: 'numeric', month: 'long' })}</span><h1 class="${largo > 220 ? 'muy-larga' : largo > 120 ? 'larga' : ''}" title="${esc(q.text)}">${esc(q.text)}</h1>`
    $('#rv-mi').innerHTML = rv.participe ? '<b>Tu butaca</b><span>Participaste · tu voto es secreto</span>' : '<b>Tu butaca</b><span>No votaste en esta</span>'
    $('#rv').classList.remove('final')
    rvMarcar(q.id)
    rvTamano()
    rv.t0 = performance.now()
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) rv.t0 -= 1e6
    rv.fase = ''
    cancelAnimationFrame(rv.raf); rv.raf = requestAnimationFrame(rvCuadro)
  } catch (e) { console.warn('revelacion:', e); $('#rv-preg').innerHTML = '<p class="rv-cargando">No se pudo abrir la revelación. Probá de nuevo.</p>' }
}

function cerrarRevelacion() {
  if (!rv.abierto) return
  rv.abierto = false; cancelAnimationFrame(rv.raf)
  $('#rv').hidden = true; document.body.style.overflow = ''
  if (location.hash.startsWith('#revelacion')) location.hash = '#' + (rv.volver || 'inicio')
  if (vistaActual() === 'votaciones') pintarVotaciones()
  pintarVotacionesInicio()
}

function rvTamano() {
  const cv = $('#rv-hemi'), esc_ = $('#rv-escena'); if (!cv || !esc_) return
  rv.dpr = window.devicePixelRatio || 1
  const W = esc_.clientWidth, Hh = esc_.clientHeight
  cv.width = Math.max(1, W * rv.dpr); cv.height = Math.max(1, Hh * rv.dpr)
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  rv.pts.forEach(p => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y) })
  const arriba = 46, abajo = 8   // lugar para el cartel "Tu butaca"
  const s = Math.max(.05, Math.min((W * .94) / (x1 - x0 + 30), (Hh - arriba - abajo) / (y1 - y0 + 30)))
  rv.cam = { s, cx: W / 2 - (x0 + x1) / 2 * s, cy: arriba + (Hh - arriba - abajo) / 2 - (y0 + y1) / 2 * s, W, Hh }
}

const rvEase = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
function rvCuadro(now) {
  if (!rv.abierto || !rv.r) return
  const t = now - rv.t0, r = rv.r, T = RV_T
  const tLuz0 = T.intro, tLuz1 = T.intro + T.luz, tCont0 = tLuz1 + T.pausa, tCont1 = tCont0 + T.conteo
  const pLuz = Math.min(1, Math.max(0, (t - tLuz0) / T.luz)), pCont = r.nula ? 0 : Math.min(1, Math.max(0, (t - tCont0) / T.conteo))
  const encendidas = Math.floor(rvEase(pLuz) * rv.encendibles.length)
  const fase = t < tLuz0 ? 'intro' : t < tLuz1 ? 'luz' : r.nula ? 'fin' : t < tCont0 ? 'pausa' : t < tCont1 ? 'conteo' : 'fin'
  if (fase !== rv.fase) rvFase(fase)
  // ── dibujar
  const cv = $('#rv-hemi'), ctx = cv.getContext('2d'), d = rv.dpr, { s, cx, cy } = rv.cam
  ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height)
  const rad = Math.max(1.6, Math.min(7, H.DOT * s * .5))
  const prendida = new Uint8Array(rv.pts.length); for (let k = 0; k < encendidas; k++) prendida[rv.encendibles[k]] = 1
  ctx.fillStyle = 'rgba(255,255,255,.09)'
  rv.pts.forEach((p, i) => { if (prendida[i] || i === rv.miIdx) return; ctx.beginPath(); ctx.arc(cx + p.x * s, cy + p.y * s, rad, 0, 6.283); ctx.fill() })
  const dib = (i, col, brillo) => { const p = rv.pts[i]; ctx.shadowColor = col; ctx.shadowBlur = brillo; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx + p.x * s, cy + p.y * s, rad, 0, 6.283); ctx.fill() }
  // Todas las butacas encendidas tienen el MISMO color: muestra que se votó, nunca qué se votó
  rv.encendibles.slice(0, encendidas).forEach(i => { if (i !== rv.miIdx) dib(i, RV_COL.luz, rad * 2.2) })
  ctx.shadowBlur = 0
  // tu butaca
  if (rv.miIdx >= 0) {
    const p = rv.pts[rv.miIdx], x = cx + p.x * s, y = cy + p.y * s, on = prendida[rv.miIdx]
    if (on) dib(rv.miIdx, '#ffffff', rad * 3)
    ctx.shadowBlur = 0; ctx.strokeStyle = on ? '#ffffff' : 'rgba(255,255,255,.5)'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(x, y, rad + 5 + (on ? Math.sin(now / 300) * 1.5 : 0), 0, 6.283); ctx.stroke()
    const mi = $('#rv-mi'); mi.hidden = t < tLuz0 + 300
    mi.style.left = x + 'px'; mi.style.top = y + 'px'
  }
  // ── números
  const num = $('#rv-num'); if (num) num.textContent = fmtNum(encendidas)
  const pc = $('#rv-pc'); if (pc) pc.textContent = `${Math.round(encendidas / rv.butacas * 100)}%`
  if (fase === 'conteo' || fase === 'fin') {
    const e = r.nula ? 0 : rvEase(pCont)
    ;['si', 'no', 'abs'].forEach(k => {
      const v = Math.round(r[k] * e), pct = r.total ? v / r.total * 100 : 0
      const n = $(`#rv-n-${k}`), b = $(`#rv-b-${k}`), pp = $(`#rv-p-${k}`)
      if (n) n.textContent = fmtNum(v); if (b) b.style.width = pct + '%'; if (pp) pp.textContent = (r[k] / r.total * 100 * e).toFixed(1).replace('.', ',') + '%'
    })
    const lider = r.si === r.no ? null : r.si > r.no ? 'si' : 'no'
    $$('.rv-col').forEach(c => c.classList.toggle('lider', !!lider && c.dataset.k === lider && e > .35))
  }
  rv.raf = requestAnimationFrame(rvCuadro)
}

function rvFase(f) {
  rv.fase = f
  const r = rv.r, panel = $('#rv-panel'), fase = $('#rv-fase')
  $('#rv-saltar').hidden = f === 'fin'
  if (f === 'intro') { fase.textContent = 'La urna se cerró'; panel.innerHTML = '' }
  if (f === 'luz') {
    fase.textContent = 'Encendiendo las butacas que votaron'
    panel.innerHTML = `<div class="rv-part"><b id="rv-num">0</b><span>butacas votaron</span><em id="rv-pc">0%</em><small>de participación</small></div>`
  }
  if (f === 'pausa') { fase.textContent = 'Contando…' }
  if (f === 'conteo') {
    fase.textContent = 'Contando los votos'
    panel.innerHTML = `<div class="rv-cols">${[['si', 'Sí'], ['no', 'No'], ['abs', 'Abstención']].map(([k, t]) => `<div class="rv-col" data-k="${k}" style="--c:${RV_COL[k]}">
        <div class="rv-col-cab"><span>${t}</span><b id="rv-p-${k}">0%</b></div>
        <div class="rv-col-barra"><i id="rv-b-${k}"></i></div><small><span id="rv-n-${k}">0</span> votos</small></div>`).join('')}</div>`
  }
  if (f === 'fin') {
    fase.textContent = 'Resultado'
    $('#rv').classList.add('final')
    const otra = [...iqCerradas, ...vPreguntas.filter(q => !abierta(q))].find(q => q.id !== rv.q.id && !rvVista(q.id))
    let titulo, clase = '', sub = ''
    if (r.total === 0 || (r.nula && !r.total)) { titulo = 'Votación sin resultado'; sub = 'Hubo menos de 3 votos: el resultado no se publica para proteger el secreto del voto.'; clase = 'nula' }
    else if (r.nula) { titulo = 'Votación sin resultado'; sub = 'Hubo menos de 3 votos: el resultado no se publica para proteger el secreto del voto.'; clase = 'nula' }
    else if (r.si === r.no) { titulo = 'Empate'; sub = `${fmtNum(r.si)} a ${fmtNum(r.no)}`; clase = 'empate' }
    else { const k = r.si > r.no ? 'si' : 'no'; titulo = `El Cabildo dijo ${k === 'si' ? 'SÍ' : 'NO'}`; sub = `con el ${(r[k] / r.total * 100).toFixed(1).replace('.', ',')}% de los votos · ${fmtNum(r.total)} butacas votaron`; clase = k }
    const cols = r.nula ? '' : `<div class="rv-cols chico">${[['si', 'Sí'], ['no', 'No'], ['abs', 'Abstención']].map(([k, t]) => `<div class="rv-col ${clase === k ? 'lider' : ''}" data-k="${k}" style="--c:${RV_COL[k]}">
        <div class="rv-col-cab"><span>${t}</span><b>${(r[k] / r.total * 100).toFixed(1).replace('.', ',')}%</b></div>
        <div class="rv-col-barra"><i style="width:${r[k] / r.total * 100}%"></i></div><small>${fmtNum(r[k])} votos</small></div>`).join('')}</div>`
    panel.innerHTML = `<div class="rv-fin ${clase}">
      <h2>${titulo}</h2><p>${sub}</p>${cols}
      <div class="rv-acc">
        <a class="rv-cta sec" href="#debates/${rv.q.id}" data-rv="ir">Ver el debate</a>
        <button class="rv-cta sec" data-rv="compartir">Compartir</button>
        ${otra ? `<a class="rv-cta" href="#revelacion/${otra.id}">Siguiente revelación →</a>` : `<button class="rv-cta" data-rv="cerrar">Listo</button>`}
      </div></div>`
    if (clase === 'si' || clase === 'no') rvConfeti(RV_COL[clase])
  }
}

function rvConfeti(c) {
  const box = $('#rv-panel'); if (!box || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const el = document.createElement('div'); el.className = 'rv-confeti'; el.setAttribute('aria-hidden', 'true')
  el.innerHTML = Array.from({ length: 26 }, (_, i) => `<i style="--x:${(Math.sin(i * 2.1) * 260).toFixed(0)}px;--y:${(-120 - Math.abs(Math.cos(i * 1.3)) * 160).toFixed(0)}px;--r:${i * 53}deg;--c:${[c, '#f5b942', '#fff'][i % 3]};--d:${(i % 5) * .05}s"></i>`).join('')
  box.appendChild(el); setTimeout(() => el.remove(), 2200)
}

function enlazarRevelacion() {
  const v = $('#rv'); if (!v) return
  v.addEventListener('click', e => {
    const a = e.target.closest('[data-rv]')?.dataset.rv
    if (a === 'cerrar') { e.preventDefault(); return cerrarRevelacion() }
    if (a === 'saltar') { rv.t0 = performance.now() - 1e6; return }
    if (a === 'compartir') {
      const url = `${location.origin}${location.pathname}#revelacion/${rv.q.id}`
      navigator.clipboard?.writeText(url).then(() => aviso('Enlace copiado'), () => aviso('No se pudo copiar el enlace', 'error'))
      return
    }
    if (a === 'ir') { rv.abierto = false; cancelAnimationFrame(rv.raf); $('#rv').hidden = true; document.body.style.overflow = '' }
  })
  document.addEventListener('keydown', e => { if (!v.hidden && e.key === 'Escape') cerrarRevelacion() })
  window.addEventListener('resize', () => { if (rv.abierto && rv.r) rvTamano() })
  if (window.ResizeObserver) new ResizeObserver(() => { if (rv.abierto && rv.r) rvTamano() }).observe($('#rv-escena'))
}

// ══════════════════════════════════════════════════════════════
//  LAS ESCALINATAS — la antesala del Cabildo
//  Para quienes se registraron con su email y todavía no tienen butaca:
//  charlan, piden ayuda con la verificación y desde acá suben al Cabildo.
//  · Nombres sin datos: "Escalinata #N" (sin butaca) o la butaca de siempre (de visita).
//    El nombre de las Escalinatas no queda unido a la butaca que se consiga después.
//  · Los mensajes duran 24 h. Límites, links y teléfonos se controlan en el servidor.
//  · Se ocultan con 3 reportes de butacas (o 6 con al menos uno de una butaca).
// ══════════════════════════════════════════════════════════════
const EZC_CANALES = [['general', 'general'], ['economia', 'economía'], ['elecciones', 'elecciones'], ['cultura', 'cultura'], ['diaspora', 'diáspora']]
const EZC_PASOS = ['Documento', 'Gestos', 'Selfie con documento', 'Revisión']
const EZC_FAQ = [
  ['doc', '¿Por qué piden mi documento?', 'Para que cada persona tenga una sola butaca. Así nadie puede votar dos veces ni inflar una votación.'],
  ['guardan', '¿Qué guardan de mí?', 'Tu email para entrar y tu butaca. No se guarda tu nombre ni tu número de documento, y las fotos de la verificación se borran.'],
  ['secreto', '¿Mi voto es secreto?', 'Sí. Se anota que tu butaca participó y tu voto se suma al total, por separado. No se guarda qué votó cada butaca.'],
  ['tarda', '¿Cuánto tarda?', 'Completar los pasos lleva unos minutos. Después una persona del equipo revisa tu verificación.'],
]
const ICO_EZC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20h18M6 16h15M9 12h12M12 8h9M15 4h6"/></svg>'
const ezc = { d: null, cargando: false, error: null, tab: 'charla', canal: 'general', msgs: {}, faq: null, rep: null, enviando: false, borrador: '', n: 0, abajo: true }
const ezcCanalActual = () => ezc.tab === 'ayuda' ? 'ayuda' : ezc.canal

// En qué paso quedó la verificación (dato que ya guarda el verificador: ultimo_paso / status)
function ezcPaso(v) {
  if (!v) return { i: 0, txt: 'Todavía no empezaste. Tené a mano tu cédula o pasaporte: son unos minutos.', btn: 'Empezar mi verificación' }
  if (v.status === 'aprobado') return { i: 4, txt: 'Tu verificación está aprobada. Recargá la página para entrar con tu butaca.', btn: null }
  if (v.status === 'pendiente_revision' || v.paso === 'enviado') return { i: 3, txt: 'Ya enviaste todo. Una persona del equipo está revisando tu verificación.', btn: null }
  if (v.status === 'rechazado') return { i: 0, txt: 'Tu verificación no fue aprobada. Podés intentarlo de nuevo con fotos más claras.', btn: 'Intentar de nuevo' }
  if (v.paso === 'documento_sin_detalle' || v.paso === 'documento_fallido') return { i: 0, txt: 'No pudimos leer bien tu documento. Probá con buena luz, sin reflejos y con el documento entero en la foto.', btn: 'Reintentar' }
  if (v.paso === 'documento') return { i: 1, txt: 'Tu documento ya está validado. Te falta el paso de los gestos frente a la cámara.', btn: 'Seguir donde quedé' }
  if (/liveness|gesto/.test(v.paso || '')) return { i: 2, txt: 'Te falta la selfie sosteniendo tu documento.', btn: 'Seguir donde quedé' }
  return { i: 1, txt: 'Quedaste a mitad de camino. Retomá tu verificación cuando quieras.', btn: 'Seguir donde quedé' }
}

async function entrarEscalinatas() {
  if (!estado.cargado) return pintarEscalinatas()        // iniciar() vuelve a llamar con la sesión lista
  if (!estado.user) return pintarEscalinatas()
  if (!ezc.d) { ezc.cargando = true; pintarEscalinatas() }
  const { data, error } = await sb.rpc('escalinatas_entrar')
  ezc.cargando = false
  if (error) ezc.error = error.message; else { ezc.d = data; ezc.error = null }
  pintarEscalinatas()
  cargarMensajesEzc()
}

async function cargarMensajesEzc() {
  if (!estado.user || !ezc.d) return
  const canal = ezcCanalActual(), n = ++ezc.n
  const { data, error } = await sb.rpc('escalinatas_mensajes', { p_canal: canal })
  if (n !== ezc.n) return
  ezc.msgs[canal] = error ? { error: error.message } : { lista: Array.isArray(data) ? data : [] }
  pintarMensajesEzc()
}

function ezcCamino(d) {
  const visita = d.yo.tipo === 'butaca'
  return `<div class="card ezc-camino">
    <ol class="ezc-pasos" aria-label="Tu camino">
      <li class="hecho"><span class="ezc-nodo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg></span>Registro</li>
      <li class="actual" aria-current="step"><span class="ezc-nodo"><i></i></span>${visita ? 'De visita' : 'Escalinatas'}</li>
      <li class="${visita ? 'hecho' : ''}"><span class="ezc-nodo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16M6 20V10M10 20V10M14 20V10M18 20V10M3 10l9-6 9 6"/></svg></span>Cabildo</li>
    </ol>
    <p>${visita
      ? 'Acá esperan los que todavía no tienen butaca. Respondé dudas en <b>Ayuda</b> y ayudalos a subir.'
      : 'Desde acá mirás y charlás. Para <b>votar, proponer y debatir</b>, subí al Cabildo verificando tu identidad.'}</p>
    <div class="ezc-camino-pie">
      <span class="ezc-cifras"><b>${fmtNum(d.esperando)}</b> esperan en las Escalinatas · <b>${fmtNum(d.subieron_semana)}</b> subieron esta semana</span>
      ${visita ? '<a class="btn btn-ghost" href="#inicio">Volver al Cabildo</a>' : `<a class="btn btn-dark" href="${APP_ACTUAL}">${ICO_EZC}Subir al Cabildo</a>`}
    </div>
  </div>`
}

function ezcLado(d) {
  const faq = `<div class="ezc-faq">
      <b class="ezc-lado-tit">Preguntas frecuentes</b>
      ${EZC_FAQ.map(([id, q, r]) => `<div class="ezc-faq-it ${ezc.faq === id ? 'abierta' : ''}">
        <button type="button" data-ezc-faq="${id}" aria-expanded="${ezc.faq === id}">${esc(q)}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
        ${ezc.faq === id ? `<p>${esc(r)}</p>` : ''}</div>`).join('')}
    </div>`
  if (d.yo.tipo === 'butaca') return `<div class="card ezc-lado">
      <b class="ezc-lado-tit">Cómo ayudar</b>
      <ul class="ezc-tips">
        <li>Contá cómo fue tu verificación y en qué te trabaste.</li>
        <li>Nunca pidas ni aceptes fotos de documentos por el chat.</li>
        <li>Si ves spam o insultos, reportalo: con 3 reportes de butacas se oculta.</li>
      </ul>${faq}</div>`
  const p = ezcPaso(d.verificacion)
  return `<div class="card ezc-lado">
    <div class="ezc-verif-cab"><b class="ezc-lado-tit">Tu verificación</b><span class="muted">${p.i >= 4 ? 'Completa' : `Paso ${p.i + 1} de 4`}</span></div>
    <div class="ezc-barras">${EZC_PASOS.map((n, i) => `<div class="${i < p.i ? 'hecho' : i === p.i ? 'actual' : ''}"><i></i><span>${n}</span></div>`).join('')}</div>
    <p class="ezc-verif-txt">${esc(p.txt)}</p>
    ${p.btn ? `<a class="btn btn-dark ezc-verif-btn" href="${APP_ACTUAL}">${esc(p.btn)}</a>` : ''}
    ${p.i === 0 ? `<ul class="ezc-tips"><li>Tu cédula o pasaporte vigente</li><li>Un lugar con buena luz</li><li>Unos minutos y la cámara del teléfono</li></ul>` : ''}
    ${faq}</div>`
}

function pintarEscalinatas() {
  const v = $('#ezc-vista'); if (!v) return
  const cab = `<header class="view-head"><div><h1>Las Escalinatas</h1><p>Afuera del Cabildo, mientras subís.</p></div></header>`
  if (!estado.cargado || (ezc.cargando && !ezc.d)) { v.innerHTML = cab + '<p class="muted">Cargando…</p>'; return }
  if (!estado.user) {
    v.innerHTML = cab + `<div class="empty"><div class="e-icon">${ICO_EZC}</div><h3>Las Escalinatas son para quienes tienen cuenta</h3>
      <p>Creá tu cuenta con tu email, charlá con otros venezolanos y subí al Cabildo cuando te verifiques.</p>
      <a class="btn btn-dark" href="${APP_ACTUAL}">Crear cuenta o iniciar sesión</a></div>`
    return
  }
  if (!ezc.d) { v.innerHTML = cab + `<div class="empty"><h3>No se pudieron abrir las Escalinatas</h3><p>${esc(ezc.error || 'Probá de nuevo en un momento.')}</p><button class="btn btn-ghost" data-ezc-reintentar>Reintentar</button></div>`; return }
  const d = ezc.d, canal = ezcCanalActual(), sil = d.silenciado_hasta && new Date(d.silenciado_hasta) > new Date()
  const nombreCanal = (EZC_CANALES.find(c => c[0] === ezc.canal) || ['', ''])[1]
  ezc.cabecera = ''
  if (modoEscalinatas()) return pintarEscalinatasSolo(v, d, canal, sil, nombreCanal)
  v.innerHTML = cab + `<div class="ezc-grid">
    ${ezcCamino(d)}
    <section class="card ezc-sala" aria-label="Sala de charla">
      <div class="ezc-tabs" role="tablist">
        <button role="tab" type="button" data-ezc-tab="charla" aria-selected="${ezc.tab === 'charla'}" class="${ezc.tab === 'charla' ? 'on' : ''}">Charla</button>
        <button role="tab" type="button" data-ezc-tab="ayuda" aria-selected="${ezc.tab === 'ayuda'}" class="${ezc.tab === 'ayuda' ? 'on' : ''}">Ayuda<span class="ezc-larga"> para verificarte</span></button>
      </div>
      ${ezc.tab === 'charla' ? `<div class="ezc-canales">${EZC_CANALES.map(([id, n]) => `<button type="button" data-ezc-canal="${id}" class="${ezc.canal === id ? 'on' : ''}" aria-pressed="${ezc.canal === id}">#${n}</button>`).join('')}</div>` : ''}
      <ol class="ezc-msgs" id="ezc-msgs" aria-live="polite"><li class="muted ezc-vacio">Cargando…</li></ol>
      <form class="ezc-escribir" id="ezc-form">
        <p class="ezc-aviso" id="ezc-aviso" role="status" ${sil ? '' : 'hidden'}>${sil ? 'Por ahora no podés escribir en las Escalinatas.' : ''}</p>
        <div class="ezc-fila">
          <label class="sr-only" for="ezc-txt">Escribí un mensaje</label>
          <input id="ezc-txt" maxlength="280" autocomplete="off" ${sil ? 'disabled' : ''} placeholder="${canal === 'ayuda' ? 'Contá en qué paso te trabaste…' : `Escribí en #${esc(nombreCanal)}…`}">
          <button class="btn btn-dark ezc-enviar" type="submit" aria-label="Enviar" ${sil ? 'disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
        </div>
        <p class="ezc-nota">Hablás como <b class="${d.yo.tipo === 'butaca' ? 'but' : 'esc'}">${esc(d.yo.nombre)}</b>. Sin links ni teléfonos. Nunca compartas tu documento por el chat.</p>
      </form>
    </section>
    ${ezcLado(d)}
  </div>`
  const inp = $('#ezc-txt'); if (inp) inp.value = ezc.borrador
  ezc.abajo = true
  pintarMensajesEzc()
}

// Solo el chat, centrado: la sala ocupa la pantalla (celular) o una "tablet" en el centro (computadora)
function ezcEscribirHtml(d, canal, sil, nombreCanal) {
  return `<form class="ezc-escribir" id="ezc-form">
      <p class="ezc-aviso" id="ezc-aviso" role="status" ${sil ? '' : 'hidden'}>${sil ? 'Por ahora no podés escribir en las Escalinatas.' : ''}</p>
      <div class="ezc-fila">
        <label class="sr-only" for="ezc-txt">Escribí un mensaje</label>
        <input id="ezc-txt" maxlength="280" autocomplete="off" enterkeyhint="send" ${sil ? 'disabled' : ''} placeholder="${canal === 'ayuda' ? 'Contá en qué paso te trabaste…' : `Escribí en #${esc(nombreCanal)}…`}">
        <button class="btn btn-dark ezc-enviar" type="submit" aria-label="Enviar" ${sil ? 'disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
      </div>
      <p class="ezc-nota">Hablás como <b class="${d.yo.tipo === 'butaca' ? 'but' : 'esc'}">${esc(d.yo.nombre)}</b>. Sin links ni teléfonos. Nunca compartas tu documento por el chat.</p>
    </form>`
}
function pintarEscalinatasSolo(v, d, canal, sil, nombreCanal) {
  const p = ezcPaso(d.verificacion)
  // En Ayuda, la verificación y las preguntas van arriba DENTRO del scroll de mensajes (en el celular no tapan la charla)
  ezc.cabecera = ezc.tab === 'ayuda' ? `<li class="ezc-solo-ayuda">
      <div class="ezc-solo-verif">
        <div class="ezc-verif-cab"><b class="ezc-lado-tit">Tu verificación</b><span class="muted">${p.i >= 4 ? 'Completa' : `Paso ${p.i + 1} de 4`}</span></div>
        <div class="ezc-barras">${EZC_PASOS.map((n, i) => `<div class="${i < p.i ? 'hecho' : i === p.i ? 'actual' : ''}"><i></i><span>${n}</span></div>`).join('')}</div>
        <div class="ezc-solo-verif-pie"><p class="ezc-verif-txt">${esc(p.txt)}</p>${p.btn ? `<a class="btn btn-dark" href="${APP_ACTUAL}">${esc(p.btn)}</a>` : ''}</div>
      </div>
      <div class="ezc-solo-faq">${EZC_FAQ.map(([id, q]) => `<button type="button" data-ezc-faq="${id}" aria-expanded="${ezc.faq === id}" class="${ezc.faq === id ? 'on' : ''}">${esc(q)}</button>`).join('')}</div>
      ${ezc.faq ? `<p class="ezc-solo-faq-r">${esc((EZC_FAQ.find(f => f[0] === ezc.faq) || [])[2] || '')}</p>` : ''}
    </li>` : ''
  const canales = ezc.tab === 'ayuda' ? '' : `<div class="ezc-canales">${EZC_CANALES.map(([id, n]) => `<button type="button" data-ezc-canal="${id}" class="${ezc.canal === id ? 'on' : ''}" aria-pressed="${ezc.canal === id}">#${n}</button>`).join('')}</div>`
  v.innerHTML = `<section class="card ezc-solo" aria-label="Las Escalinatas">
    <header class="ezc-solo-cab">
      <span class="ezc-solo-ico" aria-hidden="true">${ICO_EZC}</span>
      <div class="ezc-solo-tit">
        <h1>Las Escalinatas</h1>
        <p><b>${fmtNum(d.esperando)}</b> esperan · <b>${fmtNum(d.subieron_semana)}</b> subieron esta semana</p>
      </div>
      <a class="btn btn-dark ezc-solo-subir" href="${APP_ACTUAL}">Subir al Cabildo</a>
    </header>
    <p class="ezc-solo-bajada">Desde acá charlás y te ayudamos a verificarte. Con tu butaca vas a poder <b>votar, proponer y debatir</b>.</p>
    <div class="ezc-tabs" role="tablist">
      <button role="tab" type="button" data-ezc-tab="charla" aria-selected="${ezc.tab === 'charla'}" class="${ezc.tab === 'charla' ? 'on' : ''}">Charla</button>
      <button role="tab" type="button" data-ezc-tab="ayuda" aria-selected="${ezc.tab === 'ayuda'}" class="${ezc.tab === 'ayuda' ? 'on' : ''}">Ayuda<span class="ezc-larga"> para verificarte</span></button>
    </div>
    ${canales}
    <ol class="ezc-msgs" id="ezc-msgs" aria-live="polite">${ezc.cabecera}<li class="muted ezc-vacio">Cargando…</li></ol>
    ${ezcEscribirHtml(d, canal, sil, nombreCanal)}
  </section>`
  const inp = $('#ezc-txt'); if (inp) inp.value = ezc.borrador
  ezc.abajo = ezc.tab !== 'ayuda'          // en Ayuda se arranca arriba, mostrando tu verificación
  pintarMensajesEzc()
}

function ezcMensajeHtml(m) {
  if (m.oculto) return `<li class="ezc-m ezc-oculto">Mensaje oculto por reportes de ciudadanos.</li>`
  const clase = m.tipo === 'equipo' ? 'equipo' : m.mio ? 'mio' : m.tipo
  const etq = m.fijado ? 'fijado' : m.mio ? 'vos' : m.tipo === 'butaca' ? 'con butaca' : ''
  const av = m.tipo === 'equipo' ? 'CV' : (m.num ?? '·')
  const rep = m.mio || m.tipo === 'equipo' ? ''
    : m.reportado ? '<span class="ezc-rep-ok">Reportado</span>'
    : ezc.rep === m.id ? `<span class="ezc-rep-conf"><button type="button" data-ezc-rep-si="${esc(m.id)}">Reportar</button><button type="button" data-ezc-rep-no>Cancelar</button></span>`
    : `<button type="button" class="ezc-rep" data-ezc-rep="${esc(m.id)}" aria-label="Reportar este mensaje" title="Reportar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4h11l-1.5 4L16 12H5"/></svg></button>`
  return `<li class="ezc-m ${clase} ${m.fijado ? 'fijado' : ''}">
    <span class="ezc-av" aria-hidden="true">${esc(String(av))}</span>
    <div class="ezc-m-cuerpo">
      <div class="ezc-m-cab"><b>${esc(m.nombre)}</b>${etq ? `<span class="ezc-etq">${etq}</span>` : ''}${m.fijado ? '' : `<time datetime="${esc(m.at)}">${haceCuanto(m.at)}</time>`}</div>
      <p>${esc(m.texto)}</p>
    </div>${rep}</li>`
}

function pintarMensajesEzc() {
  const ol = $('#ezc-msgs'); if (!ol) return
  const st = ezc.msgs[ezcCanalActual()], cab = ezc.cabecera || ''
  if (!st) { ol.innerHTML = cab + '<li class="muted ezc-vacio">Cargando…</li>'; return }
  if (st.error) { ol.innerHTML = cab + `<li class="muted ezc-vacio">${esc(st.error)}</li>`; return }
  const arriba = ol.scrollTop
  const abajo = ezc.abajo || ol.scrollHeight - ol.scrollTop - ol.clientHeight < 90
  const fij = st.lista.filter(m => m.fijado), resto = st.lista.filter(m => !m.fijado)
  ol.innerHTML = cab + fij.map(ezcMensajeHtml).join('')
    + '<li class="ezc-sep" aria-hidden="true"><span>Los mensajes se borran a las 24 h</span></li>'
    + (resto.length ? resto.map(ezcMensajeHtml).join('') : `<li class="muted ezc-vacio">${ezcCanalActual() === 'ayuda' ? 'Contá en qué paso de la verificación te trabaste y te ayudamos.' : 'Todavía no hay mensajes en este canal. ¡Saludá!'}</li>`)
  ol.scrollTop = abajo ? ol.scrollHeight : arriba
  ezc.abajo = false
}

function ezcAviso(t) {
  const a = $('#ezc-aviso'); if (!a) return
  a.textContent = t; a.hidden = !t
  clearTimeout(ezcAviso.t); if (t) ezcAviso.t = setTimeout(() => { a.hidden = true }, 4500)
}

async function ezcEnviar() {
  const inp = $('#ezc-txt'); if (!inp || ezc.enviando) return
  const t = limpiar(inp.value)
  if (!t) return
  ezc.enviando = true; $('.ezc-enviar')?.setAttribute('aria-disabled', 'true')
  const canal = ezcCanalActual()
  const { error } = await sb.rpc('escalinatas_enviar', { p_canal: canal, p_texto: t })
  ezc.enviando = false; $('.ezc-enviar')?.removeAttribute('aria-disabled')
  if (error) return ezcAviso(error.message)
  ezcAviso(''); inp.value = ''; ezc.borrador = ''; ezc.abajo = true
  cargarMensajesEzc()
}

async function ezcReportar(id) {
  ezc.rep = null
  const { data, error } = await sb.rpc('escalinatas_reportar', { p_id: id })
  if (error) { ezcAviso(error.message); return pintarMensajesEzc() }
  const m = ezc.msgs[ezcCanalActual()]?.lista?.find(x => x.id === id)
  if (m) { m.reportado = true; if (data?.oculto) m.oculto = true }
  pintarMensajesEzc()
  aviso('Gracias. Si otras butacas también lo reportan, se oculta para todos.')
}

function enlazarEscalinatas() {
  const v = $('#ezc-vista'); if (!v) return
  v.addEventListener('click', e => {
    const t = e.target.closest('[data-ezc-tab],[data-ezc-canal],[data-ezc-faq],[data-ezc-rep],[data-ezc-rep-si],[data-ezc-rep-no],[data-ezc-reintentar]')
    if (!t) return
    if (t.dataset.ezcTab) { if (ezc.tab !== t.dataset.ezcTab) { ezc.tab = t.dataset.ezcTab; ezc.rep = null; pintarEscalinatas(); cargarMensajesEzc() } return }
    if (t.dataset.ezcCanal) { if (ezc.canal !== t.dataset.ezcCanal) { ezc.canal = t.dataset.ezcCanal; ezc.rep = null; pintarEscalinatas(); cargarMensajesEzc() } return }
    if (t.dataset.ezcFaq) {
      ezc.faq = ezc.faq === t.dataset.ezcFaq ? null : t.dataset.ezcFaq
      if (modoEscalinatas()) { const sc = $('#ezc-msgs')?.scrollTop || 0; pintarEscalinatas(); const ol = $('#ezc-msgs'); if (ol) ol.scrollTop = sc; return }
      const lado = $('.ezc-lado', v); if (lado && ezc.d) lado.outerHTML = ezcLado(ezc.d); return
    }
    if (t.dataset.ezcRep) { ezc.rep = t.dataset.ezcRep; return pintarMensajesEzc() }
    if (t.dataset.ezcRepSi) return ezcReportar(t.dataset.ezcRepSi)
    if (t.hasAttribute('data-ezc-rep-no')) { ezc.rep = null; return pintarMensajesEzc() }
    if (t.hasAttribute('data-ezc-reintentar')) return entrarEscalinatas()
  })
  v.addEventListener('submit', e => { if (e.target.id === 'ezc-form') { e.preventDefault(); ezcEnviar() } })
  v.addEventListener('input', e => { if (e.target.id === 'ezc-txt') ezc.borrador = e.target.value })
}

async function iniciar() {
  try { localStorage.removeItem('cabildoos_votos') } catch (e) {}   // borra votos que versiones anteriores guardaban en el teléfono
  pintarNav(); actualizarNavBloque(); fdConfig(null); enlazar(); enlazarFunding(); enlazarMiButaca(); enlazarDebates(); enlazarPropuestas(); enlazarCiudadanos(); enlazarCrearBloque(); enlazarEstadisticas(); enlazarAuditorio(); enlazarPlayroom(); enlazarAprende(); enlazarMuro(); enlazarEscalinatas(); enlazarRevelacion(); enlazarMonitor(); enlazarMiBloque(); enlazarHeader(); enlazarBuscador(); ruta(); iniciarA2()
  tickReloj(); setInterval(() => { tickReloj(); tickVotacion(); tickCuentas(); tickPropuestas(); if (vistaActual() === 'muro') tickMuro(); if (mon.abierto) tickMonitor() }, 1000)
  await cargarUsuario()
  const habiaModo = modoEscalinatas()
  if (aplicarModoEscalinatas() || habiaModo) { pintarNav(); ruta() }       // ruta() ya abre la sala
  else if (vistaActual() === 'escalinatas') entrarEscalinatas()
  vigilarSesion()
  vigilarPortada()
  au.usuarioListo = true
  vigilarAuditorio()
  if (vistaActual() === 'auditorio') entrarAuditorio()
  if (vistaActual() === 'playroom') cargarPlayroom()
  if (vistaActual() === 'muro') cargarMuroDia()
  cargarSocial().then(() => {
    if (vistaActual() === 'ciudadanos') pintarCiudadanos()
    if (ciu.perfil) $$(`[data-seguir="${ciu.perfil}"]`).forEach(x => { x.outerHTML = botonSeguir(ciu.perfil) })
  })
  if (vistaActual() === 'propuestas' && pr.d) refrescarPropuestas()
  if (vistaActual() === 'debates' && dbt.q) { pintarHilo(); if (dbAbierto(dbt.q) && estado.user && !dbt.canal) entrarAlCanal(dbt.q.id) }
  await Promise.all([cargarHemiciclo(), cargarVotacion(), cargarMuro(), cargarBloques(), cargarPropInicio(), cargarPortada()])
  iniciarPresencia()
  iniciarTiempoReal()
  if (vistaActual() === 'butaca') cargarMiButaca()
  if (vistaActual() === 'propuestas' && pr.d) pintarPropuestas()   // ya con alias públicos cargados
  setInterval(cargarVotacion, 60_000)
  setInterval(() => { if (vistaActual() === 'inicio') { cargarPropInicio(); cargarMuro() } }, 90_000)   // refresca votos y estado de la sesión
}

// ══════════════════════════════════════════════════════════════
//  APP EN LA PANTALLA DE INICIO (solo celulares)
//  · Nunca aparece dentro de la app ya instalada (display-mode standalone / navigator.standalone).
//  · Android (Chrome/Edge): botón "Instalar" que abre el instalador del sistema (beforeinstallprompt).
//    Si el navegador no lo ofrece (Samsung, Firefox…), muestra los pasos del menú.
//  · iPhone: pasos con el botón Compartir → "Agregar a inicio" (Safari no permite un botón directo).
//  · Dentro de Instagram, Facebook, TikTok…: pide abrir en el navegador, porque ahí no se puede agregar.
//  · Mientras siga usando la web en el celular, siempre tiene cómo pasar a la app:
//    ventana (una vez) → botón flotante → si lo cierra, botón "App" en el encabezado.
//  · Abrir la app instalada (o instalarla desde Android) apaga todo en ese navegador.
//  Todo se recuerda solo en este navegador.
// ══════════════════════════════════════════════════════════════
const A2 = { clave: 'ux2_a2hs_v1', evento: null, plat: null, abierto: false, intentos: 0 }
const a2Leer = () => { try { return JSON.parse(localStorage.getItem(A2.clave) || '{}') || {} } catch (e) { return {} } }
const a2Guardar = o => { try { localStorage.setItem(A2.clave, JSON.stringify({ ...a2Leer(), ...o })) } catch (e) {} }
const a2EsApp = () => ['standalone', 'fullscreen', 'minimal-ui'].some(m => matchMedia(`(display-mode: ${m})`).matches) || navigator.standalone === true

function a2Plataforma() {
  const ua = navigator.userAgent || ''
  const ios = /iPhone|iPod/.test(ua), android = /Android/.test(ua) && /Mobile/.test(ua)
  if (!ios && !android) return null
  const apps = [['Instagram', /Instagram/], ['Facebook', /FBAN|FBAV|FB_IAB|FBIOS/], ['TikTok', /musical_ly|BytedanceWebview|TikTok/], ['LinkedIn', /LinkedInApp/],
    ['X', /Twitter/], ['Snapchat', /Snapchat/], ['Line', /\bLine\//], ['la app de Google', /\bGSA\//]]
  const inapp = (apps.find(([, re]) => re.test(ua)) || [])[0] || null
  const nav = ios ? (/CriOS/.test(ua) ? 'chrome' : /FxiOS/.test(ua) ? 'firefox' : /EdgiOS/.test(ua) ? 'edge' : /OPiOS|OPT\//.test(ua) ? 'otro' : 'safari')
    : (/SamsungBrowser/.test(ua) ? 'samsung' : /Firefox/.test(ua) ? 'firefox' : 'chrome')
  return { so: ios ? 'ios' : 'android', nav, inapp }
}

const A2_ICO = {
  compartir: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>',
  mas: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/></svg>',
  puntos: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  mira: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
}
const a2Paso = (ico, t, s) => `<li><span class="a2-ico">${A2_ICO[ico]}</span><span><b>${t}</b>${s ? `<small>${s}</small>` : ''}</span></li>`

function a2Cuerpo() {
  const p = A2.plat
  if (p.inapp) return `<p class="a2-aviso">Estás viendo el Cabildo dentro de <b>${esc(p.inapp)}</b>, y desde ahí no se puede agregar a tu inicio.</p>
    <ol class="a2-pasos">${a2Paso(p.so === 'ios' ? 'puntos' : 'puntos', `Tocá ${p.so === 'ios' ? '<i>···</i> o el ícono de brújula' : '<i>⋮</i>'}`, 'Arriba o abajo de la pantalla')}
      ${a2Paso('mira', `Elegí <i>Abrir en ${p.so === 'ios' ? 'Safari' : 'el navegador'}</i>`, 'Ahí vas a ver estos pasos para agregarlo')}</ol>
    <div class="a2-acc"><button class="btn btn-dark" data-a2="copiar">Copiar enlace</button><button class="btn btn-ghost" data-a2="luego">Ahora no</button></div>`
  if (p.so === 'android' && A2.evento) return `<ul class="a2-ventajas"><li>Se abre al instante, a pantalla completa</li><li>Sin buscar la página cada vez</li><li>No ocupa casi nada de espacio</li></ul>
    <div class="a2-acc"><button class="btn btn-dark a2-instalar" data-a2="instalar">Instalar la app</button><button class="btn btn-ghost" data-a2="luego">Ahora no</button></div>`
  let pasos
  if (p.so === 'ios') pasos = p.nav === 'safari'
    ? a2Paso('compartir', 'Tocá <i>Compartir</i>', 'En la barra de Safari. Si no lo ves, tocá primero <i>···</i>') + a2Paso('mas', 'Elegí <i>Agregar a inicio</i>', 'Deslizá hacia abajo en la lista si no aparece') + a2Paso('ok', 'Tocá <i>Agregar</i>', 'Listo: el Cabildo queda en tu pantalla de inicio')
    : a2Paso('compartir', 'Tocá <i>Compartir</i>', p.nav === 'firefox' ? 'En el menú <i>☰</i> de Firefox' : 'Arriba a la derecha, junto a la dirección') + a2Paso('mas', 'Elegí <i>Agregar a inicio</i>', 'Si no aparece, abrí esta página en Safari') + a2Paso('ok', 'Tocá <i>Agregar</i>', 'Listo: el Cabildo queda en tu pantalla de inicio')
  else pasos = p.nav === 'samsung'
    ? a2Paso('menu', 'Tocá el menú <i>☰</i>', 'Abajo a la derecha') + a2Paso('mas', 'Elegí <i>Agregar página a</i> → <i>Pantalla de inicio</i>', '') + a2Paso('ok', 'Tocá <i>Agregar</i>', 'Listo: el Cabildo queda en tu pantalla de inicio')
    : a2Paso('puntos', 'Tocá el menú <i>⋮</i>', 'Arriba a la derecha del navegador') + a2Paso('mas', 'Elegí <i>Instalar app</i> o <i>Agregar a pantalla de inicio</i>', '') + a2Paso('ok', 'Confirmá con <i>Instalar</i>', 'Listo: el Cabildo queda en tu pantalla de inicio')
  return `<ol class="a2-pasos">${pasos}</ol>
    <div class="a2-acc"><button class="btn btn-dark" data-a2="hecho">Listo, ya lo agregué</button><button class="btn btn-ghost" data-a2="luego">Ahora no</button></div>`
}

function a2Pintar() {
  let el = $('#a2')
  if (!el) {
    el = document.createElement('div'); el.id = 'a2'; el.className = 'a2'
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'a2-t')
    document.body.appendChild(el)
  }
  el.innerHTML = `<div class="a2-box">
    <button class="a2-x" data-a2="luego" aria-label="Cerrar">✕</button>
    <div class="a2-cab"><img src="/ux2/iconos/icono-192.png" alt="" width="56" height="56">
      <div><h2 id="a2-t">Llevá el Cabildo en tu celular</h2><p>Agregalo a tu pantalla de inicio y abrilo como una app, con un toque.</p></div></div>
    ${a2Cuerpo()}</div>`
  return el
}

function a2Abrir() {
  if (A2.abierto || a2EsApp()) return
  A2.abierto = true; a2Accesos()
  const el = a2Pintar(); el.hidden = false
  requestAnimationFrame(() => el.classList.add('ver'))
  setTimeout(() => { const box = el.querySelector('.a2-box'); box?.setAttribute('tabindex', '-1'); box?.focus({ preventScroll: true }) }, 350)
}
function a2Cerrar(motivo) {
  const el = $('#a2'); if (!el || !A2.abierto) return
  A2.abierto = false; el.classList.remove('ver'); setTimeout(() => { el.hidden = true }, 300)
  if (motivo === 'hecho') a2Guardar({ marcado: Date.now() })
  // La primera vez que se cierra la ventana, pasa a la etapa del botón flotante
  if (!a2Leer().fase) a2Guardar({ fase: 'flotante' })
  a2Accesos()
}

// Etapas mientras use la web en el celular:
//   1. ventana grande (automática, una vez)  →  2. botón flotante "Usar como app"
//   3. si cierra el flotante (✕) → queda un botón "App" chico en el encabezado, siempre disponible.
// Dentro de la app instalada no aparece nada.
const a2Visible = () => !!A2.plat && !a2EsApp() && !a2Leer().instalada

function a2Accesos() {
  const s = a2Leer(), ok = a2Visible()
  const flota = ok && s.fase === 'flotante' && !A2.abierto
  let f = $('#a2-flota')
  if (flota && !f) {
    f = document.createElement('div'); f.id = 'a2-flota'; f.className = 'a2-flota'
    f.innerHTML = `<button class="a2-flota-ir" data-a2="abrir"><img src="/ux2/iconos/icono-192.png" alt="" width="28" height="28"><span><b>Usar el Cabildo como app</b><small>Agregalo a tu pantalla de inicio</small></span></button>
      <button class="a2-flota-x" data-a2="no-flota" aria-label="No me interesa">✕</button>`
    document.body.appendChild(f)
    requestAnimationFrame(() => f.classList.add('ver'))
  }
  if (f) { f.hidden = !flota; if (flota) requestAnimationFrame(() => f.classList.add('ver')) }
  document.body.classList.toggle('a2-con-flota', flota)
  const hd = $('#a2-hd'); if (hd) hd.hidden = !(ok && s.fase === 'header')
}

function a2Programar(ms) {
  setTimeout(() => {
    if (!a2Visible() || a2Leer().fase || A2.abierto) return
    const ocupado = document.querySelector('.modal:not([hidden]), .rv:not([hidden]), .nd:not([hidden]), .mon:not([hidden]), #fd-full, #fd-rev, #modal-conf:not([hidden])')
    if (ocupado || document.visibilityState !== 'visible') { if (++A2.intentos < 30) a2Programar(6000); return }
    a2Abrir()
  }, ms)
}

function iniciarA2() {
  A2.plat = a2Plataforma()
  if (a2EsApp()) { a2Guardar({ instalada: true, at: Date.now(), via: 'app' }); return }   // está usando la app instalada
  // Si un navegador quedó marcado como "instalada" pero vuelve a usarse como web, la marca vence en 30 días
  const s0 = a2Leer(); if (s0.instalada && s0.via !== 'app' && Date.now() - (s0.at || 0) > 30 * 864e5) a2Guardar({ instalada: false })
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); A2.evento = e; if (A2.abierto) a2Pintar() })
  window.addEventListener('appinstalled', () => { a2Guardar({ instalada: true, at: Date.now(), via: 'instalada' }); a2Cerrar(); a2Accesos() })
  if (!A2.plat) return
  navigator.getInstalledRelatedApps?.().then(l => { if (l?.length) { a2Guardar({ instalada: true, at: Date.now(), via: 'detectada' }); a2Accesos() } }).catch(() => {})
  // compatibilidad con la versión anterior del aviso
  if (!s0.fase && (s0.hecho || s0.veces)) a2Guardar({ fase: 'flotante' })
  document.addEventListener('click', async e => {
    if (e.target.closest('#a2-hd')) return a2Abrir()
    const a = e.target.closest('[data-a2]')?.dataset.a2
    if (!a && e.target.id === 'a2') return a2Cerrar('luego')
    if (a === 'abrir') return a2Abrir()
    if (a === 'no-flota') { a2Guardar({ fase: 'header' }); const f = $('#a2-flota'); f?.classList.remove('ver'); setTimeout(a2Accesos, 250); aviso('Listo. Si cambiás de idea, tocá "App" arriba.'); return }
    if (a === 'luego' || a === 'hecho') return a2Cerrar(a)
    if (a === 'instalar' && A2.evento) {
      const ev = A2.evento; A2.evento = null
      try { ev.prompt(); const r = await ev.userChoice; if (r?.outcome === 'accepted') { a2Guardar({ instalada: true, at: Date.now(), via: 'instalada' }); return a2Cerrar('hecho') } } catch (err) {}
      a2Pintar()   // si lo canceló, quedan los pasos manuales
    }
    if (a === 'copiar') {
      try { await navigator.clipboard.writeText(location.origin + '/ux2/'); aviso('Enlace copiado. Pegalo en Safari o Chrome.') }
      catch (err) { aviso('Copiá la dirección de esta página y abrila en el navegador.') }
    }
  })
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && A2.abierto) a2Cerrar('luego') })
  a2Accesos()
  if (a2Visible() && !a2Leer().fase) a2Programar(4000)
}


// ══════════════════════════════════════════════════════════════
//  TIEMPO REAL GENERAL (sin refrescar la página)
//  · Canal público "v2-publico": la base avisa QUÉ cambió (votaciones, votos, butacas, propuestas,
//    comentarios, Muro, bloques, presencia, portada) — nunca quién ni datos personales — y acá se
//    recarga lo que corresponde por las vías normales (que respetan la privacidad).
//  · Canal propio (con sesión): notificaciones, mensajes y solicitudes de seguimiento.
//  · Al volver a la pestaña, o si el canal se cayó y vuelve, se refresca todo.
//  Los avisos se agrupan (debounce) para no recargar 50 veces si llegan 50 votos juntos.
// ══════════════════════════════════════════════════════════════
const rt = { pub: null, mio: null, t: {}, caido: false, oculto: 0 }
const rtLuego = (k, fn, ms) => { clearTimeout(rt.t[k]); rt.t[k] = setTimeout(() => { try { fn() } catch (e) { console.warn('rt', k, e) } }, ms) }

async function rtListaDebates() {   // solo la lista (no reabre el hilo que la persona está leyendo)
  try {
    const { data } = await sb.from('questions').select('id, text, category, ends_at, status').in('status', ['activa', 'cerrada']).order('ends_at', { ascending: false }).limit(30)
    if (!data) return
    dbt.lista = data.sort((a, b) => (dbAbierto(b) - dbAbierto(a)) || (new Date(b.ends_at) - new Date(a.ends_at)))
    pintarListaDebates()
    if (dbt.q) { const n = data.find(x => x.id === dbt.q.id); if (n) dbt.q = { ...dbt.q, ...n } }
  } catch (e) {}
}

// Segunda capa contra avisos falsos o en avalancha: solo tipos conocidos, con forma válida,
// y si llegan demasiados en poco tiempo se ignoran y se hace UNA recarga al final.
const RT_TIPOS = new Set(['votaciones', 'votos', 'butacas', 'propuestas', 'comentarios', 'muro', 'muro_resp', 'bloques', 'presencia', 'portada', 'esc'])
const rtFlujo = { n: 0, desde: 0, frenado: false }
function rtRecibir(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p) || !RT_TIPOS.has(p.t)) return
  if (p.t === 'esc' && !EZC_CANALES.some(([id]) => id === p.c) && p.c !== 'ayuda') return
  const ahora = Date.now()
  if (ahora - rtFlujo.desde > 10_000) { rtFlujo.desde = ahora; rtFlujo.n = 0 }
  if (++rtFlujo.n > 80) {                       // más de 80 avisos en 10 s: algo raro → una sola recarga al rato
    if (!rtFlujo.frenado) { rtFlujo.frenado = true; setTimeout(() => { rtFlujo.frenado = false; rtTodo() }, 15_000) }
    return
  }
  rtCambio(p)
}

function rtCambio(p) {
  const v = vistaActual()
  switch (p.t) {
    case 'votaciones':
      rtLuego('vot', () => {
        cargarVotacion()
        if (v === 'votaciones') cargarVotaciones()
        if (v === 'debates') rtListaDebates()
        if (v === 'estadisticas') cargarEstadisticas()
      }, 500); break
    case 'votos':
      rtLuego('votos', () => { cargarVotacion(); if (v === 'votaciones') cargarVotaciones() }, 1200); break
    case 'butacas':
      rtLuego('butacas', () => {
        cargarHemiciclo()
        Promise.resolve(estado.perfilesListos).then(() => {
          if (vistaActual() === 'ciudadanos') pintarCiudadanos()
          if (vistaActual() === 'propuestas' && pr.d) pintarPropuestas()
        })
        if (v === 'estadisticas') cargarEstadisticas()
      }, 1500); break
    case 'propuestas':
      rtLuego('prop-ini', cargarPropInicio, 800)
      if (!estado.user && pr.d) rtLuego('prop', refrescarPropuestas, 800)   // con sesión ya llega por su propio canal
      if (p.op === 'DELETE' && pr.d) rtLuego('prop', refrescarPropuestas, 800)
      break
    case 'comentarios':
      if (pr.abierta && pr.abierta === p.id) rtLuego('coment', () => cargarComentariosProp(p.id), 300)
      if (pr.d) rtLuego('prop', refrescarPropuestas, 1500)
      break
    case 'muro': case 'muro_resp':
      if (estado.user) rtLuego('muro-ini', cargarMuro, 800)
      if (!mu.cargado) break
      if (p.t === 'muro' && p.op === 'UPDATE' && p.likes != null) {   // un "me gusta": se actualiza en el lugar
        const post = mu.posts.find(x => x.id === p.id)
        if (post && post.likes_count !== p.likes) { post.likes_count = p.likes; if (vistaActual() === 'muro') pintarMuroDia(); if (mu.abierto === p.id) pintarHiloMuro() }
      } else if (p.op === 'DELETE') rtLuego('muro', cargarMuroDia, 600)   // borrados de posts o respuestas
      break
    case 'bloques': rtLuego('bloques', cargarBloques, 800); break
    case 'presencia': rtLuego('pres', cargarPresencia, 600); break
    case 'portada': rtLuego('portada', cargarPortada, 800); break
    case 'esc': if (vistaActual() === 'escalinatas' && p.c === ezcCanalActual()) rtLuego('esc', cargarMensajesEzc, 350); break
  }
}

function rtTodo() {   // después de volver a la pestaña o de reconectar
  cargarVotacion(); cargarPropInicio(); cargarBloques(); cargarPresencia(); cargarHemiciclo()
  if (estado.user) { cargarMuro(); cargarSocial(); if (estado.butaca) cargarNotificaciones() }
  const v = vistaActual()
  if (v === 'votaciones') cargarVotaciones()
  if (v === 'debates') rtListaDebates()
  if (v === 'propuestas' && pr.d) refrescarPropuestas()
  if (v === 'muro' && mu.cargado) cargarMuroDia()
  if (v === 'estadisticas') cargarEstadisticas()
  if (v === 'escalinatas') entrarEscalinatas()
  if (pr.abierta) cargarComentariosProp(pr.abierta)
}

function rtEstado(st) {
  if (st === 'SUBSCRIBED') { if (rt.caido) { rt.caido = false; rtTodo() } }
  else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') rt.caido = true
}

function iniciarTiempoReal() {
  // Canal PRIVADO de solo lectura: solo la base puede emitir (los navegadores no pueden mandar avisos falsos)
  if (!rt.pub) rt.pub = sb.channel('v2-publico', { config: { private: true } }).on('broadcast', { event: 'cambio' }, ({ payload }) => rtRecibir(payload)).subscribe(rtEstado)
  // Lo mío: notificaciones, mensajes y seguimientos (la base solo me manda filas que puedo ver)
  if (!rt.mio && estado.user && estado.butaca) {
    const yo = estado.butaca
    rt.mio = sb.channel('v2-mio-' + yo)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `to_seat=eq.${yo}` }, () => rtLuego('notif', cargarNotificaciones, 300))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `to_seat=eq.${yo}` }, () => rtLuego('social', () => { cargarSocial().then(() => { if (vistaActual() === 'ciudadanos') pintarCiudadanos() }) }, 500))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'follows', filter: `to_seat=eq.${yo}` }, () => rtLuego('social', () => { cargarSocial().then(() => { if (vistaActual() === 'ciudadanos') pintarCiudadanos() }) }, 500))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'follows', filter: `from_seat=eq.${yo}` }, () => rtLuego('social', () => { cargarSocial().then(() => { if (vistaActual() === 'ciudadanos') pintarCiudadanos() }) }, 500))
      .subscribe(rtEstado)
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') rt.oculto = Date.now()
  else if (rt.oculto && Date.now() - rt.oculto > 20_000) { rt.oculto = 0; rtTodo() }
})

iniciar()

// hero-ciclo: el mini hemiciclo de la portada se enciende en dos pasadas, queda encendido 5 minutos y vuelve a empezar
;(function cicloHeroLoop() {
  const ESPERA = 5 * 60 * 1000 + 10000   // 5 minutos encendido + ~10 s de las dos pasadas
  setInterval(() => {
    const s = document.querySelector('.hero-loop'); if (!s || document.hidden) return
    s.classList.remove('anim'); void s.offsetWidth; s.classList.add('anim')
  }, ESPERA)
})()

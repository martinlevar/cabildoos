// ═══════════════════════════════════════════════════════════════
//  BLOG — las notas del Cabildo (las mismas de /press, tabla prensa_notas) dentro de la v2.
//  #blog → lista de notas · #blog/<slug> → la nota completa. Datos: rpc prensa_publica (pública).
//  El formato, los gráficos y la animación son los de press.html (generado por gen_blog.py).
// ═══════════════════════════════════════════════════════════════
;(function () {
  const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const CUERPO = () => document.getElementById('bl-cuerpo')
  // Formato de los textos: **negrita**, [texto](https://enlace), ## título, ### subtítulo, - lista, > cita, | tabla |
  // Los enlaces a otra nota (/press?n=slug) se abren dentro del Blog.
  function enLinea(t) {
    let h = esc(t)
    h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    h = h.replace(/\[([^\]]+)\]\(((?:https:\/\/|\/)[^\s)]+)\)/g, (m, txt, url) => {
      const nota = url.match(/^\/press(?:\.html)?\?n=([a-z0-9-]+)$/)
      if (nota) return `<a href="#blog/${nota[1]}">${txt}</a>`
      return `<a href="${url.replace(/"/g, '%22')}"${url.startsWith('/') ? '' : ' target="_blank" rel="noopener"'}>${txt}</a>`
    })
    return h
  }
  function cifrasHtml(n) {
    if (!n.cifras?.length) return ''
    return `<div class="cifras" role="list" aria-label="En números">${n.cifras.map(c => `<div class="cifra" role="listitem"><b>${esc(c.valor)}</b><span>${esc(c.texto)}</span></div>`).join('')}</div>`
      + (n.cifras_nota ? `<p class="nota-cifras">${esc(n.cifras_nota)}</p>` : '')
  }
  function citaHtml(n) {
    if (!n.cita_texto) return ''
    const quien = [n.cita_autor, n.cita_cargo].filter(Boolean).map(esc).join(', ')
    return `<blockquote>«${esc(n.cita_texto)}»${quien ? `<cite>— ${quien}</cite>` : ''}</blockquote>`
  }
  // ══ Gráficos: se alimentan de las estadísticas agregadas que calcula la base de datos (stats) ══
  let S = {}, CFG = {}
  const num = n => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const semTxt = s => { const [, m, d] = String(s).split('-').map(Number); return `${d} ${MES[m - 1] || ''}` }
  const pct = (a, t) => t ? Math.round(a * 100 / t) : 0
  const techo = v => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); for (const k of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (k * p >= v) return k * p; return 10 * p }
  const tabla = (cab, filas) => `<details class="g-tabla"><summary>Ver los datos</summary><div class="g-scroll"><table><thead><tr>${cab.map(c => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${filas.map(f => `<tr>${f.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`
  const fig = (id, titulo, sub, dentro, fuente) => `<figure class="grafico" id="g-${id}"><h3>${esc(titulo)}</h3>${sub ? `<p class="g-sub">${esc(sub)}</p>` : ''}${dentro}${fuente ? `<p class="g-fuente">${esc(fuente)}</p>` : ''}</figure>`
  const FUENTE = () => 'Fuente: datos agregados de Cabildo de Venezuela' + (S.calculado ? `, actualizados el ${semTxt(S.calculado.slice(0, 10))} de ${S.calculado.slice(0, 4)}.` : '.')

  // Tooltip único para todos los gráficos
  const tip = document.createElement('div'); tip.id = 'bl-tip'; tip.setAttribute('role', 'tooltip'); document.documentElement.appendChild(tip)   // fuera del body: no le afecta el zoom de escritorio
  function verTip(html, x, y) { tip.innerHTML = html; tip.classList.add('ver'); const r = tip.getBoundingClientRect(); let l = x + 14, t = y - r.height - 12; if (l + r.width > innerWidth - 8) l = x - r.width - 14; if (l < 8) l = 8; if (t < 8) t = y + 18; tip.style.left = l + 'px'; tip.style.top = t + 'px' }
  const ocultarTip = () => tip.classList.remove('ver')
  document.addEventListener('pointerover', e => { const el = e.target.closest?.('[data-tip]'); if (el) verTip(el.dataset.tip, e.clientX, e.clientY) })
  document.addEventListener('pointermove', e => { const el = e.target.closest?.('[data-tip]'); if (el) verTip(el.dataset.tip, e.clientX, e.clientY) })
  document.addEventListener('pointerout', e => { if (e.target.closest?.('[data-tip]')) ocultarTip() })
  addEventListener('scroll', ocultarTip, { passive: true })
  const fila = (color, txt, val) => `<span class="t-f"><i style="background:${color}"></i>${txt}: <b>${val}</b></span>`

  // Línea: crecimiento de cuentas y butacas
  function gCrecimiento() {
    const d = S.crecimiento || []; if (d.length < 2) return ''
    const ult = d[d.length - 1]
    return fig('crecimiento', 'Cómo creció la primera versión', `De la primera cuenta, en agosto, a ${num(ult.cuentas)} cuentas y ${num(ult.butacas)} butacas verificadas. Total acumulado por semana.`,
      `<ul class="g-leyenda"><li><i style="background:var(--g-c1)"></i>Cuentas registradas</li><li><i style="background:var(--g-c2)"></i>Butacas verificadas</li></ul><div class="g-lienzo" data-g="linea"></div>`
      + tabla(['Semana del', 'Cuentas', 'Butacas'], d.map(x => [semTxt(x.semana), num(x.cuentas), num(x.butacas)])), FUENTE() + ' Una butaca es una persona con identidad verificada.')
  }
  function dibujarLinea(el) {
    const d = S.crecimiento || [], W = Math.max(280, el.clientWidth), H = W < 480 ? 220 : 260
    const m = { l: 40, r: W < 480 ? 46 : 56, t: 14, b: 28 }, iw = W - m.l - m.r, ih = H - m.t - m.b
    const max = techo(Math.max(...d.map(x => Math.max(x.cuentas, x.butacas))))
    const X = i => m.l + i * iw / (d.length - 1), Y = v => m.t + ih - v / max * ih
    const ticks = [0, .25, .5, .75, 1].map(k => k * max)
    const paso = W < 480 ? 3 : 2
    const camino = k => d.map((x, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(x[k]).toFixed(1)}`).join('')
    const u = d.length - 1
    let yc = Y(d[u].cuentas), yb = Y(d[u].butacas); if (yb - yc < 16) yb = yc + 16
    el.innerHTML = `<svg class="g-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Gráfico de líneas: cuentas registradas y butacas verificadas por semana">
      ${ticks.map(t => `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--line)" stroke-width="1"/><text class="g-eje" x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">${t >= 1000 ? num(t / 1000) + ' mil' : num(t)}</text>`).join('')}
      ${d.map((x, i) => (i % paso === (u % paso)) ? `<text class="g-eje" x="${X(i)}" y="${H - 8}" text-anchor="middle">${semTxt(x.semana)}</text>` : '').join('')}
      <path d="${camino('cuentas')}" fill="none" stroke="var(--g-c1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="${camino('butacas')}" fill="none" stroke="var(--g-c2)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${X(u)}" cy="${Y(d[u].cuentas)}" r="4" fill="var(--g-c1)" stroke="var(--surface)" stroke-width="2"/>
      <circle cx="${X(u)}" cy="${Y(d[u].butacas)}" r="4" fill="var(--g-c2)" stroke="var(--surface)" stroke-width="2"/>
      <text class="g-dir" x="${X(u) + 9}" y="${yc + 4}">${num(d[u].cuentas)}</text>
      <text class="g-dir" x="${X(u) + 9}" y="${yb + 4}">${num(d[u].butacas)}</text>
      <g class="g-cruz" style="display:none"><line y1="${m.t}" y2="${m.t + ih}" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 3"/><circle r="5" fill="var(--g-c1)" stroke="var(--surface)" stroke-width="2"/><circle r="5" fill="var(--g-c2)" stroke="var(--surface)" stroke-width="2"/></g>
      <rect x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent"/>
    </svg>`
    const svg = el.firstElementChild, cruz = svg.querySelector('.g-cruz'), [ln, c1, c2] = cruz.children
    const mover = e => {
      const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) * W / r.width
      const i = Math.max(0, Math.min(u, Math.round((px - m.l) / (iw / u)))), x = d[i]
      cruz.style.display = ''; ln.setAttribute('x1', X(i)); ln.setAttribute('x2', X(i))
      c1.setAttribute('cx', X(i)); c1.setAttribute('cy', Y(x.cuentas)); c2.setAttribute('cx', X(i)); c2.setAttribute('cy', Y(x.butacas))
      verTip(`Semana del <b>${semTxt(x.semana)}</b><br>${fila('var(--g-c1)', 'Cuentas', num(x.cuentas))}${fila('var(--g-c2)', 'Butacas', num(x.butacas))}`, e.clientX, e.clientY)
    }
    svg.addEventListener('pointermove', mover); svg.addEventListener('pointerdown', mover)
    svg.addEventListener('pointerleave', () => { cruz.style.display = 'none'; ocultarTip() })
  }

  // Barras: participación semanal en votaciones
  function gActividad() {
    let d = S.actividad || []; const i0 = d.findIndex(x => x.votos > 0); if (i0 < 0) return ''
    d = d.slice(i0)
    const tv = d.reduce((a, x) => a + x.votos, 0), tm = d.reduce((a, x) => a + x.mensajes, 0)
    return fig('actividad', 'Participación en votaciones, semana a semana', `Cada barra suma las participaciones de las votaciones que cerraron esa semana. En total, ${num(tv)} participaciones y ${num(tm)} mensajes de debate.`,
      `<div class="g-lienzo" data-g="barras"></div>` + tabla(['Semana del', 'Participaciones', 'Mensajes'], d.map(x => [semTxt(x.semana), num(x.votos), num(x.mensajes)])), FUENTE() + ' Cada butaca vota una sola vez por votación.')
  }
  function dibujarBarras(el) {
    const todo = S.actividad || [], d = todo.slice(Math.max(0, todo.findIndex(x => x.votos > 0)))
    const W = Math.max(280, el.clientWidth), H = W < 480 ? 200 : 230, m = { l: 40, r: 6, t: 22, b: 28 }, iw = W - m.l - m.r, ih = H - m.t - m.b
    const max = techo(Math.max(...d.map(x => x.votos))), Y = v => m.t + ih - v / max * ih
    const bw = iw / d.length, ancho = Math.min(46, bw * .62), pico = d.reduce((a, x, i) => x.votos > d[a].votos ? i : a, 0)
    const barra = (x, y, w, h) => { const r = Math.min(4, h, w / 2); return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z` }
    el.innerHTML = `<svg class="g-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Gráfico de barras: participaciones en votaciones por semana">
      ${[0, .5, 1].map(k => k * max).map(t => `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--line)"/><text class="g-eje" x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">${t >= 1000 ? num(t / 1000) + ' mil' : num(t)}</text>`).join('')}
      ${d.map((x, i) => { const cx = m.l + bw * i + bw / 2, h = Math.max(0, ih - (Y(x.votos) - m.t))
        return `<g data-tip="${esc(`Semana del <b>${semTxt(x.semana)}</b><br>Participaciones: <b>${num(x.votos)}</b><br>Mensajes de debate: <b>${num(x.mensajes)}</b>`)}">
          <rect x="${m.l + bw * i}" y="${m.t}" width="${bw}" height="${ih}" fill="transparent"/>
          ${h > 0 ? `<path d="${barra(cx - ancho / 2, Y(x.votos), ancho, h)}" fill="var(--g-bar)"/>` : ''}
          ${i === pico || i === d.length - 1 ? `<text class="g-dir" x="${cx}" y="${Y(x.votos) - 7}" text-anchor="middle">${num(x.votos)}</text>` : ''}
          <text class="g-eje" x="${cx}" y="${H - 8}" text-anchor="middle">${semTxt(x.semana)}</text></g>` }).join('')}
    </svg>`
  }

  // Barras horizontales: temas
  function gTemas() {
    const d = S.temas || []; if (!d.length) return ''
    const max = Math.max(...d.map(x => x.participaciones)), tot = d.reduce((a, x) => a + x.participaciones, 0)
    return fig('temas', 'De qué temas se votó', `Participaciones por tema de la votación. ${pct(d[0].participaciones, tot)} % fueron sobre ${d[0].tema.toLowerCase()}.`,
      `<div class="hb">${d.map(x => `<span class="hb-l">${esc(x.tema)}</span><span class="hb-f" data-tip="${esc(`<b>${esc(x.tema)}</b><br>${num(x.votaciones)} votaciones<br>${num(x.participaciones)} participaciones (${pct(x.participaciones, tot)} %)`)}"><span class="hb-b" style="width:${(x.participaciones / max * 82).toFixed(1)}%"></span><span class="hb-v">${num(x.participaciones)} · ${pct(x.participaciones, tot)} %</span></span>`).join('')}</div>`
      + tabla(['Tema', 'Votaciones', 'Participaciones'], d.map(x => [x.tema, num(x.votaciones), num(x.participaciones)])), FUENTE())
  }

  // Barras apiladas al 100 %: votaciones más concurridas
  function gVotaciones() {
    const d = (S.votaciones || []).filter(x => x.si + x.no + x.abs >= 3); if (!d.length) return ''
    const fecha = f => { const [y, mm, dd] = String(f).split('-').map(Number); return `${dd} de ${MES[mm - 1]}` }
    const corta = t => String(t).length >= 220 ? String(t).replace(/\s+\S*$/, '') + '…' : t
    return fig('votaciones', 'Las votaciones con más participación', 'Cómo votaron las butacas en las consultas más concurridas de la primera versión.',
      `<ul class="g-leyenda"><li><i class="cuad" style="background:var(--g-si)"></i>Sí</li><li><i class="cuad" style="background:var(--g-abs)"></i>Abstención</li><li><i class="cuad" style="background:var(--g-no)"></i>No</li></ul>`
      + d.map(x => { const t = x.si + x.no + x.abs, seg = (k, cls, nom) => { const p = pct(x[k], t); return x[k] ? `<span class="${cls}" style="flex:${x[k]} 1 0" data-tip="${esc(`<b>${nom}</b>: ${num(x[k])} butacas (${p} %)`)}">${p >= 9 ? p + ' %' : ''}</span>` : '' }
          return `<div class="vt"><p class="vt-q">${esc(corta(x.texto))}<small>${esc(x.tema)} · cerró el ${fecha(x.cierre)} · ${num(t)} butacas</small></p><div class="vt-b" role="img" aria-label="${esc(`Sí ${pct(x.si, t)} %, abstención ${pct(x.abs, t)} %, no ${pct(x.no, t)} %`)}">${seg('si', 'si', 'Sí')}${seg('abs', 'abs', 'Abstención')}${seg('no', 'no', 'No')}</div></div>` }).join('')
      + tabla(['Votación', 'Sí', 'Abst.', 'No', 'Total'], d.map(x => [corta(x.texto), num(x.si), num(x.abs), num(x.no), num(x.si + x.abs + x.no)])),
      'Los resultados reflejan la opinión de las butacas que participaron en cada votación; no son una encuesta representativa de toda la población. ' + FUENTE())
  }

  // Nube de palabras
  const NUBE_FUERA = ['necesitamos', 'importante', 'contra', 'entrar', 'fecha', 'falta', 'situación', 'realidad', 'pagar', 'daño', 'trabajo', 'apoyo', 'apoyar', 'acciones', 'proceso', 'intereses', 'medios']
  const NOMBRES = { 'maría': 'María', 'maria': 'María', corina: 'Corina', machado: 'Machado', trump: 'Trump', delcy: 'Delcy', 'rodríguez': 'Rodríguez', diosdado: 'Diosdado', maduro: 'Maduro', lorenzo: 'Lorenzo', mendoza: 'Mendoza', eeuu: 'EE. UU.', venezuela: 'Venezuela', dios: 'Dios', onu: 'ONU', cne: 'CNE', mcm: 'MCM' }
  function gNube() {
    const fuera = new Set([...NUBE_FUERA, ...String(CFG.nube_excluir || '').split(',')].map(w => w.trim().toLowerCase()).filter(Boolean))
    let d = (S.nube || []).filter(x => !fuera.has(String(x.palabra).toLowerCase()))
    const est = d.find(x => x.palabra === 'estados'), uni = d.find(x => x.palabra === 'unidos')
    if (est && uni) d = d.filter(x => x !== est && x !== uni).concat([{ palabra: 'Estados Unidos', n: Math.min(est.n, uni.n) }])
    const ee = d.find(x => x.palabra === 'eeuu'), eu = d.find(x => x.palabra === 'Estados Unidos')
    if (ee && eu) { d = d.filter(x => x !== ee); eu.n += ee.n }
    d = d.map(x => ({ ...x, palabra: NOMBRES[x.palabra] || x.palabra }))
    d = d.sort((a, b) => b.n - a.n).slice(0, 60); if (d.length < 8) return ''
    const max = d[0].n, min = d[d.length - 1].n
    const tam = n => (14 + (Math.sqrt(n) - Math.sqrt(min)) / (Math.sqrt(max) - Math.sqrt(min) || 1) * 30).toFixed(1)
    const hash = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
    const orden = d.map((x, i) => ({ ...x, i })).sort((a, b) => hash(a.palabra) - hash(b.palabra))
    return fig('nube', 'De qué habló la gente', 'Las palabras más usadas en debates, muros, propuestas y comentarios. El tamaño indica cuántas veces se usó cada una.',
      `<div class="nube" role="list" aria-label="Nube de palabras">${orden.map(x => `<span role="listitem" class="${x.i < 8 ? 'n1' : x.i < 24 ? 'n2' : ''}" style="font-size:${tam(x.n)}px" data-tip="${esc(`<b>${esc(x.palabra)}</b>: ${num(x.n)} menciones`)}">${esc(x.palabra)}</span>`).join('')}</div>`
      + tabla(['Palabra', 'Menciones'], d.map(x => [x.palabra, num(x.n)])),
      'Solo se cuentan palabras usadas por al menos ocho butacas distintas; se omiten artículos, conectores y palabras de uso general. ' + FUENTE())
  }

  // Totales en vivo
  function gTotales() {
    const t = S.totales; if (!t) return ''
    const c = [[num(t.butacas), 'butacas verificadas'], [num(t.cuentas), 'cuentas registradas'], [num(t.votaciones), 'votaciones realizadas'], [num(t.participaciones), 'participaciones en votaciones'],
      [num(t.promedio_por_votacion), 'butacas por votación, en promedio'], [num(t.maximo_por_votacion), 'participaciones en la más concurrida'], [num(t.propuestas), 'propuestas ciudadanas'], [num(t.mensajes), 'mensajes de debate y comentarios']]
    return `<div class="cifras totales" role="list" aria-label="El Cabildo en números">${c.map(([v, l]) => `<div class="cifra" role="listitem"><b>${v}</b><span>${l}</span></div>`).join('')}</div><p class="nota-cifras">${esc(FUENTE())}</p>`
  }
  // ══ Animación de la verificación: ilustración genérica (no usa imágenes ni datos de ninguna persona) ══
  const AV_PASOS = [
    { c: ['Nombre ✓', 'Número ✓', 'Fecha de nacimiento ✓', 'Foto completa: se descarta'], t: 'Foto del documento', d: 'Un análisis automático lee el nombre, el número y la fecha de nacimiento y los compara con lo que escribiste. La foto completa no se guarda.' },
    { c: ['Girá la cabeza', 'Persona real ✓'], t: 'Prueba de vida', d: 'Movés la cabeza frente a la cámara para demostrar que hay una persona real, no una foto.' },
    { c: ['Datos del documento pixelados ✓'], t: 'Selfie con el documento', d: 'Antes de enviarla, tu teléfono pixela los datos del documento. Solo se ve tu cara.' },
    { c: ['Revisión humana ✓', 'Imágenes borradas', 'Huella cifrada: 9c1e…06d5'], t: 'Revisión humana y borrado', d: 'Una persona del equipo compara la cara del documento con la selfie. Al terminar, las imágenes se borran y del número solo queda una huella cifrada.' },
  ]
  function avCarnet(x, y, w, h, conDatos) {
    const fx = x + 12, fy = y + 14, fw = w * .3, fh = h - 28
    const lineas = [.9, .7, .8, .55, .65].map((k, i) => `<rect x="${fx + fw + 14}" y="${y + 22 + i * ((h - 40) / 5)}" width="${(w - fw - 38) * k}" height="7" rx="3.5" fill="var(--a-bar)"/>`).join('')
    return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="var(--a-card)" stroke="var(--a-card-line)"/>
      <rect x="${x}" y="${y}" width="${w / 3}" height="5" fill="#f5c518"/><rect x="${x + w / 3}" y="${y}" width="${w / 3}" height="5" fill="#1e40af"/><rect x="${x + 2 * w / 3}" y="${y}" width="${w / 3}" height="5" fill="#dc2626"/>
      <rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" rx="6" fill="var(--a-fig-2)"/>
      <circle cx="${fx + fw / 2}" cy="${fy + fh * .38}" r="${fw * .22}" fill="var(--a-fig)"/>
      <path d="M${fx + fw * .14},${fy + fh} q${fw * .36},-${fh * .42} ${fw * .72},0 z" fill="var(--a-fig)"/>
      ${conDatos === false ? '' : lineas}</g>`
  }
  function avPersona(cx, cy, r) {
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--a-fig)"/><path d="M${cx - r * 1.9},${cy + r * 3.1} q${r * 1.9},-${r * 2.5} ${r * 3.8},0 z" fill="var(--a-fig)"/>`
  }
  function avEscena(n) {
    const V = 'viewBox="0 0 640 340" role="img"'
    if (n === 0) {
      const datos = ['Nombre', 'N.º de documento', 'Fecha de nacimiento']
      return `<svg ${V} aria-label="Un documento de identidad ilustrado mientras se analizan sus datos">
        ${avCarnet(150, 92, 250, 156)}
        <g class="a-scan"><rect x="140" y="88" width="270" height="3" rx="1.5" fill="var(--accent)"/><rect x="140" y="80" width="270" height="10" fill="var(--accent)" opacity=".12"/></g>
        ${datos.map((t, i) => `<g class="a-in" style="animation-delay:${.7 + i * .55}s"><text class="av-t" x="436" y="${132 + i * 34}">${t}</text><text class="av-ok" x="604" y="${132 + i * 34}" text-anchor="end">✓</text></g>`).join('')}
        <g class="a-in" style="animation-delay:2.6s"><text class="av-t-s" x="436" y="246">La foto completa se descarta</text></g>
      </svg>`
    }
    if (n === 1) {
      return `<svg ${V} aria-label="Un teléfono que muestra a una persona ilustrada moviendo la cabeza">
        <rect x="250" y="20" width="140" height="300" rx="22" fill="var(--a-phone)"/><rect x="258" y="30" width="124" height="280" rx="16" fill="var(--a-screen)"/>
        <ellipse cx="320" cy="150" rx="46" ry="60" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="6 5"/>
        <g class="a-turn">${avPersona(320, 140, 30)}</g>
        <text class="av-t-s" x="320" y="290" text-anchor="middle">Girá la cabeza</text>
        <g class="a-in" style="animation-delay:.4s"><path d="M200,150 l-18,0 m6,-7 l-7,7 7,7" stroke="var(--accent)" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M440,150 l18,0 m-6,-7 l7,7 -7,7" stroke="var(--accent)" stroke-width="2.5" fill="none" stroke-linecap="round"/></g>
        <g class="a-in" style="animation-delay:2.8s"><circle cx="372" cy="58" r="15" fill="var(--a-ok)"/><path d="M365,58 l5,5 9,-10" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>
      </svg>`
    }
    if (n === 2) {
      const x0 = 338, y0 = 150, w = 170, h = 108, cols = 11, filas = 7, cw = w / cols, ch = h / filas
      const tonos = ['#c7d2fe', '#a5b4fc', '#e0e7ff', '#cbd5e1', '#94a3b8', '#dbe2f3', '#b4bfdc']
      let celdas = '', k = 0
      const orden = []; for (let f = 0; f < filas; f++) for (let c = 0; c < cols; c++) orden.push([f, c])
      orden.sort((a, b) => ((a[0] * 7 + a[1] * 13) % 17) - ((b[0] * 7 + b[1] * 13) % 17))
      for (const [f, c] of orden) celdas += `<rect class="a-px" style="animation-delay:${1.1 + (k++) * .018}s" x="${(x0 + c * cw).toFixed(1)}" y="${(y0 + f * ch).toFixed(1)}" width="${(cw + .6).toFixed(1)}" height="${(ch + .6).toFixed(1)}" fill="${tonos[(f * 3 + c * 5) % tonos.length]}"/>`
      return `<svg ${V} aria-label="Una persona ilustrada sostiene un documento y los datos del documento se pixelan">
        <rect x="150" y="20" width="340" height="300" rx="18" fill="var(--a-screen)" stroke="var(--line)"/>
        ${avPersona(262, 128, 44)}
        <g transform="rotate(-4 ${x0 + w / 2} ${y0 + h / 2})">${avCarnet(x0, y0, w, h)}${celdas}</g>
        <circle cx="${x0 + 6}" cy="${y0 + h - 8}" r="15" fill="var(--a-fig)"/>
        <g class="a-in av-badge" style="animation-delay:2.6s"><rect x="372" y="38" width="104" height="26" rx="13" fill="var(--accent)"/><text class="av-t" x="424" y="56" text-anchor="middle" style="fill:#fff;font-size:12px;font-weight:700">Pixelado ✓</text></g>
      </svg>`
    }
    // n === 3: revisión y borrado
    const thumbCara = `<g><rect x="70" y="70" width="120" height="150" rx="10" fill="var(--a-card)" stroke="var(--a-card-line)"/><rect x="84" y="84" width="92" height="122" rx="6" fill="var(--a-fig-2)"/><circle cx="130" cy="130" r="22" fill="var(--a-fig)"/><path d="M98,206 q32,-46 64,0 z" fill="var(--a-fig)"/></g>`
    let px = ''; for (let f = 0; f < 4; f++) for (let c = 0; c < 5; c++) px += `<rect x="${268 + c * 12}" y="${150 + f * 12}" width="12.6" height="12.6" fill="${['#c7d2fe', '#a5b4fc', '#e0e7ff', '#cbd5e1', '#94a3b8'][(f * 2 + c) % 5]}"/>`
    const thumbSelfie = `<g><rect x="220" y="70" width="120" height="150" rx="10" fill="var(--a-screen)" stroke="var(--line)"/>${avPersona(262, 120, 20)}${px}</g>`
    return `<svg ${V} aria-label="La cara del documento y la selfie pixelada se revisan y luego se borran">
      <text class="av-t-s" x="130" y="58" text-anchor="middle">Cara del documento</text><text class="av-t-s" x="280" y="58" text-anchor="middle">Selfie pixelada</text>
      <g class="a-trash" style="--tx:360px;--ty:20px;animation-delay:3.1s">${thumbCara}</g>
      <g class="a-trash" style="--tx:220px;--ty:20px;animation-delay:3.25s">${thumbSelfie}</g>
      <g class="a-in" style="animation-delay:.5s">${avPersona(430, 120, 20)}<circle cx="452" cy="102" r="12" fill="var(--a-ok)"/><path d="M446,102 l4,4 8,-8" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><text class="av-t-s" x="430" y="196" text-anchor="middle">Revisión humana</text></g>
      <g class="a-in" style="animation-delay:2.6s"><path d="M528,150 h52 l-6,62 h-40 z" fill="none" stroke="var(--ink-2)" stroke-width="2.4" stroke-linejoin="round"/><path d="M522,150 h64 M545,150 v-8 h18 v8" stroke="var(--ink-2)" stroke-width="2.4" fill="none" stroke-linecap="round"/><text class="av-t-s" x="554" y="236" text-anchor="middle">Se borran</text></g>
      <g class="a-in" style="animation-delay:4s"><text class="av-t-s" x="320" y="282" text-anchor="middle">Del número de documento solo queda una huella cifrada:</text><text class="av-mono" x="320" y="306" text-anchor="middle">9c1e 47b2 · · · a83f 06d5</text></g>
    </svg>`
  }
  function gAnimVerificacion() {
    return `<figure class="grafico anim-v" id="g-anim-verificacion" aria-roledescription="animación"><h3>Cómo funciona la verificación</h3><p class="g-sub">Ilustración del proceso, paso a paso. No usa imágenes de ninguna persona real.</p>
      <div class="av-lienzo" aria-live="polite"></div><div class="av-chips" aria-hidden="true"></div>
      <div class="av-paso"><b></b><span></span></div><p class="av-desc"></p>
      <div class="av-ctrl"><button type="button" data-av="prev" aria-label="Paso anterior">←</button><button type="button" data-av="pausa">Pausar</button><button type="button" data-av="next" aria-label="Paso siguiente">→</button>
      <div class="av-puntos" role="group" aria-label="Pasos">${AV_PASOS.map((p, i) => `<button type="button" data-av-ir="${i}" aria-label="Paso ${i + 1}: ${esc(p.t)}">${i + 1}</button>`).join('')}</div></div></figure>`
  }
  function iniciarAnimaciones() {
    CUERPO().querySelectorAll('.anim-v').forEach(fig => {
      if (fig.dataset.listo) return; fig.dataset.listo = '1'
      const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches
      let paso = 0, pausado = quieto, timer = null
      const lienzo = fig.querySelector('.av-lienzo'), bPausa = fig.querySelector('[data-av="pausa"]')
      const mostrar = n => {
        paso = (n + AV_PASOS.length) % AV_PASOS.length
        lienzo.innerHTML = avEscena(paso)
        fig.querySelector('.av-paso b').textContent = `Paso ${paso + 1} de ${AV_PASOS.length}`
        fig.querySelector('.av-paso span').textContent = AV_PASOS[paso].t
        fig.querySelector('.av-desc').textContent = AV_PASOS[paso].d
        fig.querySelector('.av-chips').innerHTML = AV_PASOS[paso].c.map(x => `<span>${esc(x)}</span>`).join('')
        fig.querySelectorAll('[data-av-ir]').forEach(b => +b.dataset.avIr === paso ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current'))
        programar()
      }
      const programar = () => { clearTimeout(timer); if (!pausado) timer = setTimeout(() => mostrar(paso + 1), paso === 3 ? 6500 : 5200) }
      bPausa.textContent = pausado ? 'Reproducir' : 'Pausar'
      fig.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return
        if (b.dataset.av === 'prev') mostrar(paso - 1)
        else if (b.dataset.av === 'next') mostrar(paso + 1)
        else if (b.dataset.av === 'pausa') { pausado = !pausado; bPausa.textContent = pausado ? 'Reproducir' : 'Pausar'; programar() }
        else if (b.dataset.avIr) mostrar(+b.dataset.avIr)
      })
      // solo anima cuando está a la vista
      new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting && !fig.dataset.visto) { fig.dataset.visto = '1'; mostrar(0) } }), { threshold: .25 }).observe(fig)
      lienzo.innerHTML = avEscena(0); fig.querySelector('.av-paso b').textContent = `Paso 1 de ${AV_PASOS.length}`; fig.querySelector('.av-paso span').textContent = AV_PASOS[0].t; fig.querySelector('.av-desc').textContent = AV_PASOS[0].d
    })
  }

  // blog-padron-hemiciclo: padrón (personas identificadas) vs. hemiciclo (butacas sin nombre). Ilustración, sin datos reales.
  function gPadronHemiciclo() {
    const fila = (n, cs) => `<li class="pvh-fila"><span class="pvh-av" aria-hidden="true"></span><span class="pvh-cel n"><i style="width:${cs[0]}%"></i></span><span class="pvh-cel c">V-<i style="width:${cs[1]}%"></i></span><span class="pvh-cel b">✓</span><span class="pvh-cel u"><i style="width:${cs[2]}%"></i></span></li>`
    const filas = [[78, 70, 64], [62, 76, 80], [88, 66, 58], [70, 80, 72], [58, 72, 84], [82, 64, 66]].map((c, i) => fila(i, c)).join('')
    let puntos = '', k = 0, yo = [150, 100]
    for (let f = 0; f < 6; f++) {
      const r = 46 + f * 17, n = Math.floor(Math.PI * r / 11.5)
      for (let j = 0; j < n; j++) {
        const a = Math.PI * (j + .5) / n, x = (150 - r * Math.cos(a)).toFixed(1), y = (196 - r * Math.sin(a)).toFixed(1)
        if (k === 61) yo = [x, y]
        const h = Math.abs(Math.sin(k * 12.9898) * 43758.5453) % 1
        puntos += `<circle cx="${x}" cy="${y}" r="4.2" class="${k === 61 ? 'yo' : h < .55 ? 'on' : ''}"/>`; k++
      }
    }
    const hemi = `<svg class="pvh-hemi" viewBox="0 0 300 206" role="img" aria-label="Un hemiciclo de puntos: cada punto es una butaca, con un número y sin nombre">${puntos}
      <g class="pvh-tag"><path d="M${yo[0]} 32V${+yo[1] - 6}"/><rect x="${yo[0] - 34}" y="6" width="68" height="26" rx="13"/><text x="${yo[0]}" y="23.5" text-anchor="middle">#1.204</text></g></svg>`
    return `<figure class="grafico pvh" id="g-padron-vs-hemiciclo"><h3>Un padrón o un hemiciclo</h3><p class="g-sub">Ilustración: los datos están tapados y no corresponden a ninguna persona real.</p>
      <div class="pvh-dos">
        <section class="pvh-lado padron" aria-label="Constructores: un padrón">
          <span class="pvh-k">Constructores</span><b class="pvh-t">Un padrón</b>
          <div class="pvh-cab" aria-hidden="true"><span></span><span>Nombre</span><span>Cédula</span><span>Biom.</span><span>Lugar</span></div>
          <ul class="pvh-lista" aria-hidden="true">${filas}</ul>
          <p class="pvh-pie">Cada fila es <b>una persona identificada</b>: sirve para ubicar a los venezolanos y preparar su inscripción electoral.</p>
        </section>
        <section class="pvh-lado hemiciclo" aria-label="El Cabildo: un hemiciclo">
          <span class="pvh-k">El Cabildo</span><b class="pvh-t">Un hemiciclo</b>
          ${hemi}
          <ul class="pvh-chips"><li><span class="no">✕</span> Nombre: no se guarda</li><li><span class="no">✕</span> Documento: solo una huella cifrada</li><li><span class="no">✕</span> Qué votaste: no se guarda</li></ul>
          <p class="pvh-pie">Cada punto es <b>una butaca</b>: un número, sin nombre. Sirve para debatir, proponer y votar sin exponerse.</p>
        </section>
      </div></figure>`
  }

  const GRAFICOS = { '[grafico:padron-vs-hemiciclo]': gPadronHemiciclo, '[grafico:crecimiento]': gCrecimiento, '[grafico:actividad]': gActividad, '[grafico:participacion]': gActividad, '[grafico:temas]': gTemas, '[grafico:votaciones]': gVotaciones, '[nube]': gNube, '[totales]': gTotales, '[animacion:verificacion]': gAnimVerificacion }
  function dibujarTodo() { const c = CUERPO(); if (!c || c.closest('[hidden]')) return; c.querySelectorAll('.g-lienzo[data-g="linea"]').forEach(dibujarLinea); c.querySelectorAll('.g-lienzo[data-g="barras"]').forEach(dibujarBarras) }
  let _rz; addEventListener('resize', () => { clearTimeout(_rz); _rz = setTimeout(dibujarTodo, 150) })
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', dibujarTodo)

  function cuerpoHtml(n) {
    const bloques = String(n.cuerpo || '').replace(/\r/g, '').split(/\n\s*\n/)
    const usaCifras = /^\s*\[cifras\]\s*$/m.test(n.cuerpo || ''), usaCita = /^\s*\[cita\]\s*$/m.test(n.cuerpo || '')
    const out = []
    bloques.forEach((b, i) => {
      const t = b.trim(); if (!t) return
      const lineas = t.split('\n').map(l => l.trim())
      if (t === '[cifras]') out.push(cifrasHtml(n))
      else if (t === '[cita]') out.push(citaHtml(n))
      else if (GRAFICOS[t.toLowerCase()]) out.push(GRAFICOS[t.toLowerCase()]())
      else if (t.startsWith('### ')) out.push(`<h3>${enLinea(t.slice(4))}</h3>`)
      else if (t.startsWith('## ')) out.push(`<h2>${enLinea(t.slice(3))}</h2>`)
      else if (lineas.every(l => l.startsWith('- '))) out.push(`<ul class="lista">${lineas.map(l => `<li>${enLinea(l.slice(2))}</li>`).join('')}</ul>`)
      else if (lineas.every(l => /^[>›]\s?/.test(l))) out.push(`<p class="quote-md">${lineas.map(l => enLinea(l.replace(/^[>›]\s?/, ''))).join('<br>')}</p>`)
      else if (lineas.every(l => l.startsWith('|'))) {
        const filas = lineas.map(l => l.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())).filter(f => !f.every(c => /^:?-+:?$/.test(c)))
        const [cab, ...resto] = filas
        out.push(`<table class="comparacion" style="--cols:${cab.length}"><thead><tr>${cab.map(c => `<th scope="col">${enLinea(c)}</th>`).join('')}</tr></thead><tbody>${resto.map(f => `<tr>${f.map((c, k) => `<td data-col="${esc(cab[k] || '')}">${enLinea(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`)
      } else out.push(`<p${i === 0 ? ' class="lead"' : ''}>${lineas.map(enLinea).join(' ')}</p>`)
      if (i === 0 && !usaCifras) out.push(cifrasHtml(n))
      if (i === 0 && !usaCita) out.push(citaHtml(n))
    })
    return out.join('\n')
  }
  const fechaLarga = f => { const d = new Date(f + 'T12:00:00'); return isNaN(d) ? '' : d.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(/^./, x => x.toUpperCase()) }
  const fechaCorta = f => { const d = new Date(f + 'T12:00:00'); return isNaN(d) ? '' : d.toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' }) }
  const LOGO_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.8 3h3.1l-6.8 7.7 8 10.3h-6.3l-4.9-6.4L5.3 21H2.2l7.2-8.3L1.8 3h6.4l4.4 5.8zm-1.1 16.2h1.7L7.4 4.7H5.6z" fill="currentColor" stroke="none"/></svg>'
  const linkPublico = slug => `https://cabildodevenezuela.com/press?n=${encodeURIComponent(slug)}`

  // ── Datos: se piden una vez y se reusan 5 minutos ──
  let D = null, cuando = 0, pidiendo = null
  function cargar() {
    if (D && Date.now() - cuando < 5 * 60e3) return Promise.resolve(D)
    if (pidiendo) return pidiendo
    const E = window.__ENV || {}
    pidiendo = fetch(`${E.SUPABASE_URL}/rest/v1/rpc/prensa_publica`, { method: 'POST', headers: { apikey: E.SUPABASE_KEY, Authorization: `Bearer ${E.SUPABASE_KEY}`, 'Content-Type': 'application/json' }, body: '{}' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { preparar(d); D = d; cuando = Date.now(); return d })
      .finally(() => { pidiendo = null })
    return pidiendo
  }
  // prensa-viva: marcadores con las cifras del día. Ej.: «ya reúne a {butacas} venezolanos»
  function preparar(d) {
    S = d.stats || {}; CFG = d.config || {}
    const T = S.totales || {}
    const fechaDatos = S.calculado ? new Date(S.calculado.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
    const vivo = s => typeof s !== 'string' ? s : s.replace(/\{([a-z_]+)\}/g, (m, k) => k === 'fecha_datos' ? (fechaDatos || m) : (T[k] != null && T[k] !== '' && !isNaN(T[k]) ? num(T[k]) : m))
    ;(d.notas || []).forEach(x => {
      ['titulo', 'bajada', 'cuerpo', 'cifras_nota', 'cita_texto'].forEach(k => { x[k] = vivo(x[k]) })
      if (Array.isArray(x.cifras)) x.cifras.forEach(c => { c.valor = vivo(c.valor); c.texto = vivo(c.texto) })
    })
    // la destacada primero, después de la más nueva a la más vieja
    d.notas = (d.notas || []).slice().sort((a, b) => (b.destacada ? 1 : 0) - (a.destacada ? 1 : 0) || String(b.fecha).localeCompare(String(a.fecha)))
  }

  // ── Lista ──
  function tarjeta(n, grande) {
    return `<a class="bl-card${grande ? ' bl-card-top' : ''}" href="#blog/${encodeURIComponent(n.slug)}">
      ${grande ? '<span class="bl-cinta" aria-hidden="true"><i></i><i></i><i></i></span>' : ''}
      <span class="bl-meta">${n.etiqueta ? `<span class="bl-tag">${esc(n.etiqueta)}</span>` : ''}<span>${esc(fechaCorta(n.fecha))}</span></span>
      <b class="bl-tit">${esc(n.titulo)}</b>
      ${n.bajada ? `<span class="bl-baj">${esc(n.bajada)}</span>` : ''}
      <span class="bl-leer">Leer la nota <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
    </a>`
  }
  function pintarLista(c) {
    const notas = D.notas
    if (!notas.length) { c.innerHTML = '<div class="card bl-vacio"><p class="muted">Pronto vas a encontrar acá las notas del Cabildo.</p></div>'; return }
    const [primera, ...resto] = notas
    c.innerHTML = `<div class="bl">${tarjeta(primera, true)}${resto.length ? `<div class="bl-grilla">${resto.map(n => tarjeta(n)).join('')}</div>` : ''}
      <p class="bl-pie muted">¿Sos periodista? Las notas también están en la <a href="/press" target="_blank" rel="noopener">sala de prensa</a>, con el contacto y el logo para descargar.</p></div>`
  }

  // ── Nota ──
  function pintarNota(c, n) {
    const otras = D.notas.filter(x => x !== n)
    const txtX = `${n.titulo} — vía @cabildoven`
    c.innerHTML = `<div class="bl">
      <a class="bl-volver" href="#blog"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>Todas las notas</a>
      <article class="card bl-art">
        ${n.etiqueta ? `<span class="etiqueta">${esc(n.etiqueta)}</span>` : ''}<h1>${esc(n.titulo)}</h1>
        ${n.bajada ? `<p class="bajada">${esc(n.bajada)}</p>` : ''}
        <div class="datos-pub"><span>${esc(fechaLarga(n.fecha))}</span>${n.lugar ? `<span>${esc(n.lugar)}</span>` : ''}</div>
        ${cuerpoHtml(n)}
        <div class="bl-compartir">
          <span class="muted">Compartí esta nota</span>
          <a class="btn bl-x" href="https://x.com/intent/post?${esc(new URLSearchParams({ text: txtX, url: linkPublico(n.slug) }).toString())}" target="_blank" rel="noopener noreferrer">${LOGO_X}Compartir en X</a>
          <button class="btn btn-ghost" type="button" data-bl-copiar="${esc(n.slug)}">Copiar el link</button>
        </div>
      </article>
      <section class="card bl-com" id="bl-com" aria-label="Opiniones sobre la nota"></section><!-- blog-comentarios -->
      ${otras.length ? `<section class="bl-otras"><h2>Otras notas</h2><div class="bl-grilla">${otras.map(o => tarjeta(o)).join('')}</div></section>` : ''}
    </div>`
    dibujarTodo()
    iniciarAnimaciones()
    comCargar(n.slug)
  }

  // blog-vistas: cuántos navegadores abren cada nota y cuántos llegaron con el link del email (?de=email)
  let deEmail = false
  try { deEmail = new URLSearchParams(location.search).get('de') === 'email' || sessionStorage.getItem('bl_de_email') === '1'
    if (new URLSearchParams(location.search).get('de') === 'email') { sessionStorage.setItem('bl_de_email', '1'); history.replaceState(null, '', location.pathname + location.hash) } } catch (e) {}
  const vistas = new Set()
  function registrarVista(slug) {
    if (vistas.has(slug)) return; vistas.add(slug)
    let sid = null
    try { sid = localStorage.getItem('ux2_cx'); if (!/^[0-9a-f-]{36}$/.test(sid || '')) { sid = crypto.randomUUID(); localStorage.setItem('ux2_cx', sid) } } catch (e) { try { sid = crypto.randomUUID() } catch (e2) { return } }
    const origen = deEmail ? 'email' : 'web'
    const E = window.__ENV || {}
    try { sessionStorage.removeItem('bl_de_email') } catch (e) {}
    deEmail = false
    try {
      fetch(`${E.SUPABASE_URL}/rest/v1/rpc/blog_vista`, { method: 'POST', keepalive: true,
        headers: { apikey: E.SUPABASE_KEY, Authorization: `Bearer ${E.SUPABASE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_slug: slug, p_sid: sid, p_origen: origen }) }).catch(() => {})
    } catch (e) {}
  }

  function entrar(arg) {
    const c = CUERPO(); if (!c) return
    if (!D) c.innerHTML = '<div class="card bl-vacio"><p class="muted">Cargando…</p></div>'
    cargar().then(() => {
      if (!/^blog(\/|$)/.test(location.hash.slice(1))) return   // ya se fue a otra sección
      const n = arg ? D.notas.find(x => x.slug === decodeURIComponent(arg)) : null
      if (n) { pintarNota(c, n); document.title = n.titulo + ' · Blog del Cabildo'; registrarVista(n.slug) }
      else { if (arg) history.replaceState(null, '', '#blog'); pintarLista(c) }
    }).catch(() => { c.innerHTML = '<div class="card bl-vacio"><p class="muted">No pudimos cargar las notas. Probá de nuevo en un momento.</p></div>' })
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-bl-copiar]'); if (!b) return
    const url = linkPublico(b.dataset.blCopiar)
    const listo = () => { const t = b.textContent; b.textContent = '¡Link copiado!'; setTimeout(() => { b.textContent = t }, 1800) }
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(listo, () => prompt('Copiá el link:', url))
    else prompt('Copiá el link:', url)
  })

  // ══ blog-comentarios: opiniones de las butacas al pie de cada nota ══
  const com = { slug: '', items: [], total: 0, ver: 20, enviando: false }
  const G = () => ({ sb: window.sb || (typeof sb !== 'undefined' ? sb : null), est: typeof estado !== 'undefined' ? estado : {} })
  async function comCargar(slug) {
    const box = document.getElementById('bl-com'); if (!box) return
    if (com.slug !== slug) { com.slug = slug; com.items = []; com.total = 0; com.ver = 20 }
    comPintar(true)
    const { sb: cli } = G(); if (!cli) return
    const { data, error } = await cli.rpc('blog_comentarios_listar', { p_slug: slug })
    if (com.slug !== slug) return
    if (!error && data) { com.items = data.items || []; com.total = data.total || 0 }
    comPintar(false)
  }
  const comHace = ts => typeof haceCuanto === 'function' ? haceCuanto(ts) : new Date(ts).toLocaleDateString('es-VE')
  const comAv = c => typeof muAv === 'function' ? muAv(c.alias || `Butaca #${c.seat}`, c.color, c.seat) : ''
  function comPintar(cargando) {
    const box = document.getElementById('bl-com'); if (!box) return
    const { est } = G()
    const tieneButaca = !!(est.user && est.butaca)
    const borrador = document.getElementById('bl-com-txt')?.value || ''
    const form = tieneButaca
      ? `<form class="bl-com-form" id="bl-com-form">
          <div class="bl-com-yo">${comAv({ alias: est.ident?.show_alias ? est.ident?.alias : null, color: est.ident?.card_color, seat: est.butaca })}<span>Opinás como <b>${est.ident?.show_alias && est.ident?.alias ? esc(est.ident.alias) : 'Butaca #' + est.butaca}</b></span></div>
          <textarea id="bl-com-txt" maxlength="600" rows="3" placeholder="¿Qué te pareció la nota? Dejá tu opinión…">${esc(borrador)}</textarea>
          <div class="bl-com-acc"><small class="muted"><span id="bl-com-n">${borrador.length}</span>/600 · sin links · respetuoso</small><button class="btn btn-dark" type="submit" ${com.enviando ? 'disabled' : ''}>${com.enviando ? 'Publicando…' : 'Publicar opinión'}</button></div>
        </form>`
      : `<div class="bl-com-sin"><p>${est.user ? 'Para opinar necesitás tu butaca verificada.' : 'Iniciá sesión con tu butaca para dejar tu opinión.'}</p>${est.user ? '<a class="btn btn-ghost" href="#escalinatas">Cómo conseguir mi butaca</a>' : `<a class="btn btn-dark" href="${typeof APP_ACTUAL !== 'undefined' ? APP_ACTUAL : '/'}">Iniciar sesión</a>`}</div>`
    // blog-comentarios-2: me gusta y respuestas
    const CORAZON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>'
    const uno = (c, resp) => `<li class="bl-com-item${resp ? ' resp' : ''}">
          ${comAv(c)}<div class="bl-com-c">
            <div class="bl-com-cab"><b>${c.mio ? 'Vos' : esc(c.alias || `Butaca #${c.seat}`)}</b><small class="muted">#${c.seat} · ${esc(comHace(c.created_at))}</small>
              ${c.mio ? `<button type="button" class="bl-com-x" data-com-borrar="${esc(c.id)}">Borrar</button>` : tieneButaca ? (c.reportado ? '<small class="muted bl-com-x">Reportada</small>' : `<button type="button" class="bl-com-x" data-com-reportar="${esc(c.id)}">Reportar</button>`) : ''}</div>
            <p>${esc(c.body)}</p>
            <div class="bl-com-acc2">
              <button type="button" class="bl-com-like${c.yo_like ? ' si' : ''}" data-com-like="${esc(c.id)}" aria-pressed="${!!c.yo_like}" aria-label="Me gusta">${CORAZON}<span>${c.likes ? Number(c.likes).toLocaleString('es-VE') : ''}</span></button>
              <button type="button" class="bl-com-resp" data-com-responder="${esc(resp || c.id)}">Responder</button>
            </div>
          </div></li>`
    const caja = id => com.resp === id && tieneButaca ? `<li class="bl-com-item resp"><form class="bl-com-rform" data-com-rform="${esc(id)}">
          <textarea id="bl-com-rtxt" maxlength="600" rows="2" placeholder="Escribí tu respuesta…">${esc(com.rborrador || '')}</textarea>
          <div class="bl-com-acc"><button type="button" class="btn btn-ghost" data-com-rcancelar>Cancelar</button><button class="btn btn-dark" type="submit" ${com.enviando ? 'disabled' : ''}>${com.enviando ? 'Publicando…' : 'Responder'}</button></div>
        </form></li>` : ''
    const lista = cargando && !com.items.length ? '<p class="muted bl-com-vacio">Cargando opiniones…</p>'
      : !com.items.length ? '<p class="muted bl-com-vacio">Todavía no hay opiniones. ¡Dejá la primera!</p>'
      : `<ul class="bl-com-lista">${com.items.slice(0, com.ver).map(c => uno(c, null)
          + ((c.respuestas || []).length || com.resp === c.id ? `<li class="bl-com-hilo"><ul>${(c.respuestas || []).map(r => uno(r, c.id)).join('')}${caja(c.id)}</ul></li>` : '')).join('')}</ul>
        ${com.items.length > com.ver ? `<button type="button" class="btn btn-ghost bl-com-mas" data-com-mas>Ver más opiniones (${com.items.length - com.ver})</button>` : ''}`
    box.innerHTML = `<h2>Opiniones${com.total ? ` <span class="muted">(${com.total.toLocaleString('es-VE')})</span>` : ''}</h2>${form}${lista}`
  }
  document.addEventListener('input', e => { if (e.target.id === 'bl-com-rtxt') com.rborrador = e.target.value })
  document.addEventListener('input', e => { if (e.target.id === 'bl-com-txt') { const n = document.getElementById('bl-com-n'); if (n) n.textContent = e.target.value.length } })
  document.addEventListener('submit', async e => {
    const rf = e.target.closest?.('[data-com-rform]')
    if (rf) {
      e.preventDefault()
      const t = (document.getElementById('bl-com-rtxt')?.value || '').trim()
      if (t.length < 2 || com.enviando) return
      const { sb: cli } = G(); com.enviando = true; comPintar(false)
      const { error } = await cli.rpc('blog_comentar', { p_slug: com.slug, p_body: t, p_parent: rf.dataset.comRform })
      com.enviando = false
      if (error) { comPintar(false); if (typeof aviso === 'function') aviso(error.message.replace(/^.*?: /, ''), 'error'); return }
      com.resp = null; com.rborrador = ''
      if (typeof aviso === 'function') aviso('Tu respuesta se publicó')
      return comCargar(com.slug)
    }
    if (e.target.id !== 'bl-com-form') return
    e.preventDefault()
    const ta = document.getElementById('bl-com-txt'), txt = (ta?.value || '').trim()
    if (txt.length < 2 || com.enviando) return
    const { sb: cli } = G(); com.enviando = true; comPintar(false)
    const { error } = await cli.rpc('blog_comentar', { p_slug: com.slug, p_body: txt })
    com.enviando = false
    if (error) { comPintar(false); if (typeof aviso === 'function') aviso(error.message.replace(/^.*?: /, ''), 'error'); return }
    const t = document.getElementById('bl-com-txt'); if (t) t.value = ''
    if (typeof aviso === 'function') aviso('Tu opinión se publicó')
    comCargar(com.slug)
  })
  document.addEventListener('click', async e => {
    const { sb: cli } = G()
    const mas = e.target.closest('[data-com-mas]'); if (mas) { com.ver += 20; comPintar(false); return }
    const sinButaca = () => { if (typeof aviso === 'function') aviso(G().est.user ? 'Para participar necesitás tu butaca verificada.' : 'Iniciá sesión con tu butaca para participar.') }
    const lk = e.target.closest('[data-com-like]')
    if (lk) {
      if (!(G().est.user && G().est.butaca)) return sinButaca()
      const it = com.items.flatMap(c => [c, ...(c.respuestas || [])]).find(c => c.id === lk.dataset.comLike); if (!it) return
      it.yo_like = !it.yo_like; it.likes = Math.max(0, (+it.likes || 0) + (it.yo_like ? 1 : -1)); comPintar(false)   // se ve al instante
      const { data, error } = await cli.rpc('blog_comentario_like', { p_id: it.id })
      if (error) { it.yo_like = !it.yo_like; it.likes = Math.max(0, (+it.likes || 0) + (it.yo_like ? 1 : -1)); comPintar(false); if (typeof aviso === 'function') aviso(error.message.replace(/^.*?: /, ''), 'error'); return }
      if (data) { it.yo_like = !!data.liked; it.likes = +data.likes || 0; comPintar(false) }
      return
    }
    const rs = e.target.closest('[data-com-responder]')
    if (rs) {
      if (!(G().est.user && G().est.butaca)) return sinButaca()
      com.resp = com.resp === rs.dataset.comResponder ? null : rs.dataset.comResponder; com.rborrador = ''; comPintar(false)
      setTimeout(() => document.getElementById('bl-com-rtxt')?.focus(), 30)
      return
    }
    if (e.target.closest('[data-com-rcancelar]')) { com.resp = null; com.rborrador = ''; comPintar(false); return }
    const b = e.target.closest('[data-com-borrar]')
    if (b) {
      const ok = typeof confirmar === 'function' ? await confirmar('¿Borrar tu opinión?', 'Deja de verse en la nota.', 'Borrar', true) : window.confirm('¿Borrar tu opinión?')
      if (!ok) return
      const { error } = await cli.rpc('blog_comentario_borrar', { p_id: b.dataset.comBorrar })
      if (error && typeof aviso === 'function') aviso('No se pudo borrar', 'error')
      return comCargar(com.slug)
    }
    const r = e.target.closest('[data-com-reportar]')
    if (r) {
      const ok = typeof confirmar === 'function' ? await confirmar('¿Reportar esta opinión?', 'Si varias butacas la reportan, se oculta. Usalo para insultos, spam o datos personales, no para opiniones distintas a la tuya.', 'Reportar') : window.confirm('¿Reportar esta opinión?')
      if (!ok) return
      const { error } = await cli.rpc('blog_comentario_reportar', { p_id: r.dataset.comReportar })
      if (typeof aviso === 'function') aviso(error ? error.message.replace(/^.*?: /, '') : 'Gracias, la reportaste', error ? 'error' : 'ok')
      return comCargar(com.slug)
    }
  })

  window.cabildoBlog = { entrar }
})()

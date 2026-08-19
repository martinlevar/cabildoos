let sfActiveTab = 'seguidos'; 

// console.log(window.__ENV);

// ══════════════════════════════════════════════════════════════
//  SUPABASE CLIENT
// ══════════════════════════════════════════════════════════════
const { createClient } = window.supabase
const sb = createClient(
  window.__ENV.SUPABASE_URL,
  window.__ENV.SUPABASE_KEY
)

function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Safe fallback for non-secure contexts (HTTP) or older browsers
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, function (c) {
    return (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4))).toString(16);
  });
}

// ── Genera hash SHA-256 real en el browser (Web Crypto API)
// En producción: SHA256(embedding_facial + nro_pasaporte + fecha_nac + país + nonce)
// En demo: SHA256(país + nonce + timestamp) — misma función, distintos inputs
async function generarIdentityHash(country, nonce) {
  const raw = `${country}:${nonce}:${Date.now()}:cabildoos`
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('')
}

// ── Genera nonce criptográfico aleatorio
function generarNonce() {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('')
}

// ══════════════════════════════════════════════════════════
//  CAPA DE VERIFICACIÓN DE IDENTIDAD — PROCESAMIENTO LOCAL
// ══════════════════════════════════════════════════════════

// ── Lazy-load Tesseract.js ──
async function cargarTesseract() {
  if (window.Tesseract) return
  await new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
    s.onload = res; s.onerror = rej
    document.head.appendChild(s)
  })
}

// ── Lazy-load face-api.js + modelo liviano ──
let faceApiLoaded = false
async function cargarFaceApi() {
  if (faceApiLoaded) return
  await new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js'
    s.onload = res; s.onerror = rej
    document.head.appendChild(s)
  })
  await faceapi.nets.tinyFaceDetector.loadFromUri(
    'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model'
  )
  faceApiLoaded = true
}

// ══════════════════════════════════════════════════════════════
//  OCR MULTI-REGIÓN — escanea el documento en paralelo por zonas
//  para maximizar la lectura de todos los campos, especialmente
//  la fecha que suele estar en la columna derecha del DNI.
// ══════════════════════════════════════════════════════════════

// Dibuja una región de `img` en un canvas y aplica preprocesamiento
function _ocrCanvas(img, sx, sy, sw, sh, escala, contraste, binarizar = false) {
  const canvas = document.createElement('canvas')
  canvas.width  = Math.floor(sw * escala)
  canvas.height = Math.floor(sh * escala)
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = imgData.data
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]
    const v = binarizar
      ? (g > 127 ? 255 : 0)
      : Math.max(0, Math.min(255, (g - 128) * contraste + 128))
    d[i] = d[i+1] = d[i+2] = v
  }
  ctx.putImageData(imgData, 0, 0)
  return canvas
}

// Convierte un canvas en texto OCR
async function _ocrDeCanvas(canvas) {
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png', 1.0))
  const url  = URL.createObjectURL(blob)
  try {
    const { data: { text } } = await Tesseract.recognize(url, 'spa+eng', { logger: () => {} })
    return text || ''
  } catch { return '' }
  finally { URL.revokeObjectURL(url) }
}

// OCR principal: 3 regiones en paralelo
// - imagen completa (captura header/nacionalidad)
// - columna derecha ×3 con alto contraste (nombre, fecha, número)
// - columna derecha ×3 binarizada (MRZ y texto con fondo oscuro)
async function extraerTextoCompleto(file) {
  if (!file) return ''
  await cargarTesseract()

  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = async () => {
      URL.revokeObjectURL(url)
      const W = img.naturalWidth, H = img.naturalHeight
      // La columna derecha del DNI (donde está toda la info de texto)
      // empieza aproximadamente al 38% del ancho (después de la foto)
      const rx = Math.floor(W * 0.38), rw = W - rx

      const [t1, t2, t3] = await Promise.all([
        _ocrDeCanvas(_ocrCanvas(img, 0,  0, W,  H,  2, 1.8)),         // completa ×2
        _ocrDeCanvas(_ocrCanvas(img, rx, 0, rw, H,  3, 2.5)),         // col. derecha ×3 alto contraste
        _ocrDeCanvas(_ocrCanvas(img, rx, 0, rw, H,  3, 1.8, true)),   // col. derecha ×3 binarizada
      ])
      resolve([t1, t2, t3].join('\n'))
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve('') }
    img.src = url
  })
}

/// ── Comparación de datos: OCR vs. datos ingresados ──
function vpCompararDatos(ocrTexto, nombre, numDoc, fechaNac, pais) {
  const ocr = ocrTexto.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // quitar acentos
    .replace(/[^a-z0-9\n]/g, ' ').replace(/\s+/g, ' ')

  // 1. Número de documento — búsqueda con tolerancia a errores OCR (0↔O, 1↔I)
  const numNorm = numDoc.replace(/[^a-z0-9]/gi, '').toLowerCase()
  const ocrFlat = ocr.replace(/\s/g,'')
  // Variantes con sustituciones comunes de OCR
  const numVariants = [numNorm]
  const numOcr = numNorm.replace(/0/g,'o').replace(/1/g,'i').replace(/o/g,'0').replace(/i/g,'1')
  if (numOcr !== numNorm) numVariants.push(numOcr)
  numVariants.push(numNorm.replace(/0/g,'o'))
  numVariants.push(numNorm.replace(/o/g,'0'))
  numVariants.push(numNorm.replace(/1/g,'i'))
  numVariants.push(numNorm.replace(/i/g,'1'))
  const numMatch = numNorm.length >= 4 && numVariants.some(v => ocrFlat.includes(v))

  // 2. Nombre — al menos 60% de palabras del nombre encontradas en OCR
  const palabras = nombre.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/\s+/).filter(p => p.length > 2)
  const palabrasEncontradas = palabras.filter(p => ocr.includes(p))
  const nombreMatch = palabras.length > 0 && palabrasEncontradas.length / palabras.length >= 0.6

  // 3. Fecha — multi-formato con corrección de errores OCR
  let fechaMatch = false
  if (fechaNac) {
    const [anio, mes, dia] = fechaNac.split('-')
    const mesNum = parseInt(mes, 10)
    const diaNum = parseInt(dia, 10).toString()  // "06" → "6"

    // Texto limpio para búsqueda de palabras
    const ocrLow = ocrTexto.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\n ]/g, ' ').replace(/\s+/g, ' ')

    // Versión con correcciones de errores OCR comunes (l↔1, O/o↔0)
    const ocrFix = ocrLow
      .replace(/(?<![a-z])l(?![a-z])/g, '1')   // l aislada → 1
      .replace(/(?<![a-z])o(?![a-z])/g, '0')   // o aislada → 0

    // ── Búsqueda del AÑO (tolerante a l↔1, O↔0) ──
    const anioVariants = [anio,
      anio.replace(/1/g,'l'), anio.replace(/1/g,'i'),
      anio.replace(/0/g,'o'), anio.replace(/0/g,'O')]
    const tieneAnio = anioVariants.some(v => ocrLow.includes(v)) ||
      ocrFix.includes(anio)

    // ── Búsqueda del DÍA ──
    // El día puede aparecer como "6", "06", "6 ", " 6 "
    const tieneDia = new RegExp(`(^| )0?${diaNum}( |$|\\b)`, 'm').test(ocrLow)

    // ── Búsqueda del MES — abreviaturas en español, inglés, formatos DNI ──
    const MESES = [
      [],                                        // índice 0 (unused)
      ['ene','jan','enero','january'],            // 1
      ['feb','febrero','february'],              // 2
      ['mar','marzo','march'],                   // 3
      ['abr','apr','abril','april'],             // 4
      ['may','mayo'],                            // 5
      ['jun','juni','junio','june'],             // 6  ← tu caso
      ['jul','julio','july'],                    // 7
      ['ago','aug','agosto','august'],           // 8
      ['set','sep','sept','septiembre','september'], // 9
      ['oct','octubre','october'],               // 10
      ['nov','noviembre','november'],            // 11
      ['dic','dec','diciembre','december'],      // 12
    ]
    const mesAbrevs = MESES[mesNum] || []
    const tieneMes = mesAbrevs.some(m => ocrLow.includes(m))

    // ── Formatos numéricos puros (dígitos extraídos del OCR) ──
    const ocrDigits = ocrTexto.replace(/[^0-9]/g, '')
    // También con corrección de l↔1 y O↔0
    const ocrDigitsFix = ocrTexto
      .replace(/l/gi, '1').replace(/[oO]/g, '0').replace(/[^0-9]/g, '')

    const numFormatos = [
      `${anio.slice(2)}${mes}${dia}`,   // MRZ:    830606
      `${dia}${mes}${anio}`,            // DDMMYYYY: 06061983
      `${dia}${mes}${anio.slice(2)}`,   // DDMMYY:  060683
      `${anio}${mes}${dia}`,            // YYYYMMDD: 19830606
      `${mes}${dia}${anio}`,            // MMDDYYYY: 06061983
    ]
    const encontradoNumerico = numFormatos.some(f =>
      ocrDigits.includes(f) || ocrDigitsFix.includes(f)
    )

    fechaMatch =
      encontradoNumerico ||
      // Texto: mes + año (el DNI argentino dice "06 JUN 1983")
      (tieneMes && tieneAnio) ||
      // Texto: mes + día (si el año no se lee bien)
      (tieneMes && tieneDia) ||
      // Texto: día + año con el mes numérico
      (tieneDia && tieneAnio && ocrLow.includes(` ${mes} `))
  }

  // 4. Nacionalidad / país — buscar en OCR
  let nacionalidadMatch = true  // permisivo por defecto si no hay país
  if (pais) {
    // Mapa de país seleccionado → palabras clave que aparecen en documentos
    const PAISES = {
      'Argentina':  ['argentina', 'argentino', 'argentina'],
      'Venezuela':  ['venezuela', 'venezolano', 'bolivariana'],
      'Colombia':   ['colombia', 'colombiano', 'colombiana'],
      'Chile':      ['chile', 'chileno', 'chilena'],
      'Peru':       ['peru', 'peruano', 'peruana'],
      'Mexico':     ['mexico', 'mexicano', 'mexicana', 'estados unidos mexicanos'],
      'Ecuador':    ['ecuador', 'ecuatoriano', 'ecuatoriana'],
      'Bolivia':    ['bolivia', 'boliviano', 'boliviana'],
      'Uruguay':    ['uruguay', 'uruguayo', 'uruguaya'],
      'Paraguay':   ['paraguay', 'paraguayo', 'paraguaya'],
      'Brasil':     ['brasil', 'brazil', 'brasileiro', 'brasileira'],
      'España':     ['espana', 'espanol', 'espanola', 'reino de espana'],
      'USA':        ['united states', 'usa', 'america'],
    }
    const claves = PAISES[pais] || [pais.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')]
    const ocr3 = ocrTexto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
    nacionalidadMatch = claves.some(c => ocr3.includes(c))
  }

  return { numDoc: numMatch, nombre: nombreMatch, fecha: fechaMatch, nacionalidad: nacionalidadMatch }
}

// ── Detección facial en selfie (solo un archivo ahora) ──
async function verificarPresenciaFacial(selfieFile, _ignorado) {
  if (!selfieFile) return null
  await cargarFaceApi()
  const bmp = await createImageBitmap(selfieFile)
  const cvs = document.createElement('canvas')
  cvs.width = bmp.width; cvs.height = bmp.height
  cvs.getContext('2d').drawImage(bmp, 0, 0)
  const resultados = await faceapi.detectAllFaces(cvs, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.3 }))
  if (!resultados.length) return null
  const conf = Math.round((resultados[0]?.score ?? 0.85) * 100)
  return { cantidad: resultados.length, confianza: conf }
}

// ── UI helpers para filas de procesamiento ──
function activarFilaProceso(id) {
  const row = document.getElementById(id)
  if (!row) return
  row.classList.remove('done'); row.classList.add('active')
  row.querySelector('.vp-proc-icon').textContent = '⟳'
}
function completarFilaProceso(id, subtexto, isWarn = false) {
  const row = document.getElementById(id)
  if (!row) return
  row.classList.remove('active'); row.classList.add('done')
  row.querySelector('.vp-proc-icon').textContent = isWarn ? '⚠' : '✓'
  if (subtexto) row.querySelector('.vp-proc-sub').textContent = subtexto
}

// ── Genera imagen compuesta para validadores ──
// IZQUIERDA: selfie completa — a escala de selfie los datos del doc no son legibles,
//             pero el validador ve que la persona sostiene un documento físico real
// DERECHA: documento completo pixelado, con SOLO la zona de la foto del rostro
//           des-pixelada (izq ~35%, excluyendo renglón inferior con número)
function generarImagenConDocumentoBloqueado(selfieDocFile, docFrenteFile) {
  return new Promise((resolve, reject) => {
    if (!selfieDocFile) return reject(new Error('Sin imagen de selfie'))

    const cargarImg = (file) => new Promise((res, rej) => {
      if (!file) return res(null)
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload  = () => { URL.revokeObjectURL(url); res(img) }
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Error cargando imagen')) }
      img.src = url
    })

    Promise.all([cargarImg(selfieDocFile), cargarImg(docFrenteFile)])
      .then(([selfieImg, docImg]) => {
        const OUT_H = 900
        const OUT_W = 1600
        const PAD = 20
        const HEADER_H = 34

        const canvas = document.createElement('canvas')
        canvas.width = OUT_W; canvas.height = OUT_H
        const ctx = canvas.getContext('2d')

        ctx.fillStyle = '#0d0d0d'
        ctx.fillRect(0, 0, OUT_W, OUT_H)

        // ── PANEL IZQUIERDO: Selfie completa sin modificar ──
        const selfieAreaW = OUT_W / 2 - PAD * 1.5
        const selfieAreaH = OUT_H - PAD * 3 - HEADER_H
        const selfieR = selfieImg.naturalWidth / selfieImg.naturalHeight
        let sW = selfieAreaW, sH = sW / selfieR
        if (sH > selfieAreaH) { sH = selfieAreaH; sW = sH * selfieR }
        const sX = PAD + (selfieAreaW - sW) / 2
        const sY = PAD + HEADER_H + (selfieAreaH - sH) / 2

        ctx.imageSmoothingEnabled = true
        ctx.drawImage(selfieImg, sX, sY, sW, sH)

        // ── Pixelar zona inferior de la selfie donde está el documento ──
        // El rostro del ciudadano queda visible (arriba ~55%), el doc queda pixelado
        const pixStartFrac = 0.54   // empieza a pixelar en el 54% de la altura de la selfie
        const pixStartY = sY + sH * pixStartFrac
        const pixH      = sH * (1 - pixStartFrac)
        // Fuente: recortar esa franja de la selfie original
        const srcPY  = pixStartFrac * selfieImg.naturalHeight
        const srcPH  = selfieImg.naturalHeight - srcPY
        const PIX_S  = Math.max(18, Math.floor(sW / 16))  // tamaño del bloque de pixelado
        const tmpSel = document.createElement('canvas')
        tmpSel.width  = Math.ceil(sW / PIX_S)
        tmpSel.height = Math.ceil(pixH / PIX_S)
        const tmpSelCtx = tmpSel.getContext('2d')
        tmpSelCtx.imageSmoothingEnabled = false
        tmpSelCtx.drawImage(selfieImg,
          0, srcPY, selfieImg.naturalWidth, srcPH,
          0, 0, tmpSel.width, tmpSel.height)
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(tmpSel, 0, 0, tmpSel.width, tmpSel.height, sX, pixStartY, sW, pixH)
        ctx.imageSmoothingEnabled = true

        // Banda translúcida encima del pixelado con aviso
        ctx.fillStyle = 'rgba(0,0,0,0.50)'
        ctx.fillRect(sX, pixStartY, sW, pixH)
        ctx.fillStyle = 'rgba(239,68,68,0.88)'
        ctx.fillRect(sX, pixStartY + pixH * 0.38, sW, 22)
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 10px sans-serif'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('DATOS DEL DOCUMENTO OCULTOS', sX + sW / 2, pixStartY + pixH * 0.38 + 11)

        // Header panel izquierdo
        ctx.fillStyle = 'rgba(34,197,94,0.9)'
        ctx.fillRect(PAD, PAD, selfieAreaW, HEADER_H)
        ctx.fillStyle = '#000'
        ctx.font = 'bold 13px sans-serif'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('✓ CIUDADANO SOSTENIENDO DOCUMENTO', PAD + selfieAreaW / 2, PAD + HEADER_H / 2)

        // ── PANEL DERECHO: Documento — solo foto del rostro visible ──
        const docAreaX = OUT_W / 2 + PAD / 2
        const docAreaW = OUT_W / 2 - PAD * 1.5
        const docAreaH = OUT_H - PAD * 3 - HEADER_H

        if (docImg) {
          const docR = docImg.naturalWidth / docImg.naturalHeight
          let dW = docAreaW, dH = dW / docR
          if (dH > docAreaH) { dH = docAreaH; dW = dH * docR }
          const dX = docAreaX + (docAreaW - dW) / 2
          const dY = PAD + HEADER_H + (docAreaH - dH) / 2

          // PASO 1: pixelar TODO el documento
          const PIX = Math.max(14, Math.floor(dW / 20))
          const tmpC = document.createElement('canvas')
          tmpC.width  = Math.ceil(dW / PIX)
          tmpC.height = Math.ceil(dH / PIX)
          const tmpCtx = tmpC.getContext('2d')
          tmpCtx.imageSmoothingEnabled = false
          tmpCtx.drawImage(docImg, 0, 0, docImg.naturalWidth, docImg.naturalHeight, 0, 0, tmpC.width, tmpC.height)
          ctx.imageSmoothingEnabled = false
          ctx.drawImage(tmpC, 0, 0, tmpC.width, tmpC.height, dX, dY, dW, dH)
          ctx.imageSmoothingEnabled = true

          ctx.fillStyle = 'rgba(100,0,0,0.38)'
          ctx.fillRect(dX, dY, dW, dH)

          // PASO 2: des-pixelar SOLO la foto del rostro del documento
          // En DNI argentino y latinoamericano la foto ocupa:
          //   izquierda: ~35% del ancho
          //   vertical: ~18% → 82% del alto (excluye header institucional y franja inferior con número)
          const faceX = dX
          const faceY = dY + dH * 0.18   // saltar el header "REPUBLICA ARGENTINA..."
          const faceW = dW * 0.34
          const faceH = dH * 0.62         // no llega al número que está abajo del todo

          ctx.save()
          ctx.beginPath()
          ctx.rect(faceX, faceY, faceW, faceH)
          ctx.clip()
          ctx.imageSmoothingEnabled = true
          ctx.drawImage(docImg, 0, 0, docImg.naturalWidth, docImg.naturalHeight, dX, dY, dW, dH)
          ctx.restore()

          // Borde verde alrededor de la foto del documento
          ctx.strokeStyle = '#22c55e'
          ctx.lineWidth   = 3
          ctx.strokeRect(faceX, faceY, faceW, faceH)

          // Etiqueta en zona bloqueada
          const bloqX = dX + faceW + 8
          const bloqW = dW - faceW - 16
          ctx.fillStyle = 'rgba(239,68,68,0.88)'
          ctx.fillRect(bloqX, dY + dH * 0.43, bloqW, 24)
          ctx.fillStyle = '#fff'
          ctx.font = 'bold 10px sans-serif'
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          ctx.fillText('DATOS PERSONALES OCULTOS', bloqX + bloqW / 2, dY + dH * 0.43 + 12)

        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.08)'
          ctx.fillRect(docAreaX + PAD, PAD + HEADER_H + PAD, docAreaW - PAD * 2, docAreaH - PAD * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.3)'
          ctx.font = '14px sans-serif'
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          ctx.fillText('Sin imagen de documento', docAreaX + docAreaW / 2, PAD + HEADER_H + docAreaH / 2)
        }

        // Header panel derecho
        ctx.fillStyle = 'rgba(34,197,94,0.9)'
        ctx.fillRect(docAreaX, PAD, docAreaW, HEADER_H)
        ctx.fillStyle = '#000'
        ctx.font = 'bold 13px sans-serif'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('FOTO DEL DOCUMENTO ✓ · DATOS OCULTOS 🔒', docAreaX + docAreaW / 2, PAD + HEADER_H / 2)

        // Divisor vertical
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(OUT_W / 2, PAD); ctx.lineTo(OUT_W / 2, OUT_H - PAD)
        ctx.stroke()

        // Pie de página
        ctx.fillStyle = 'rgba(255,255,255,0.25)'
        ctx.font = '11px sans-serif'
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
        ctx.fillText('CabildoOS · Validación humana · Sin datos personales transmitidos', OUT_W / 2, OUT_H - 6)

        canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.93)
      })
      .catch(reject)
  })
}

function generarImagenAnonimizada(selfieFile, docFile) {
  return generarImagenConDocumentoBloqueado(selfieFile, docFile)
}

// ── Flujo completo hacia Supabase
// 1. Inserta identidad (solo hash + país)
// 2. Sube imagen anonimizada a Storage
// 3. Inserta solicitud de verificación
async function enviarVerificacionASupabase(country, selfieFile, anonBlobPreGenerado = null, docFrenteFile = null) {
  // Hash incluye número de documento para que sea único por identidad real
  const numDoc = document.getElementById('vp-num-doc')?.value.trim() || ''
  const nonce  = generarNonce()
  const encoder = new TextEncoder()
  const data    = encoder.encode(numDoc + country + nonce)
  const hashBuf = await crypto.subtle.digest('SHA-256', data)
  const hash    = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,'0')).join('')

  // 1. Crear registro de identidad
  const { data: identity, error: idErr } = await sb
    .from('identities')
    .insert({ identity_hash: hash, country, status: 'pending' })
    .select('id, identity_hash')
    .single()

  if (idErr) throw new Error('Error creando identidad: ' + idErr.message)

  // 2. Imagen anonimizada — si no se pre-generó, generarla ahora
  const anonBlob = anonBlobPreGenerado || await generarImagenConDocumentoBloqueado(selfieFile, docFrenteFile)
  const filePath = `requests/${identity.id}/selfie_anon.jpg`

  const { error: uploadErr } = await sb.storage
    .from('anon-verification')
    .upload(filePath, anonBlob, { contentType: 'image/jpeg', upsert: true })

  if (uploadErr) throw new Error('Error subiendo imagen: ' + uploadErr.message)

  // 3. Crear solicitud de verificación (con user_id si está logueado)
  const { data: request, error: reqErr } = await sb
    .from('verification_requests')
    .insert({
      identity_hash: hash,
      anon_image_path: filePath,
      status: 'pending',
      user_id: _authUser?.id || null
    })
    .select('id')
    .single()

  if (reqErr) throw new Error('Error creando solicitud: ' + reqErr.message)

  // Guardamos en memoria para usar en pasos siguientes
  window._vpSession = {
    hash,
    nonce,
    identityId: identity.id,
    requestId: request.id,
    filePath
  }

  return { hash, requestId: request.id }
}

// ── Aprobar via Supabase (llama a la función SQL assign_next_seat)
async function aprobarEnSupabase(hash) {
  const { data, error } = await sb.rpc('assign_next_seat', { p_identity_hash: hash })
  if (error) throw new Error('Error asignando butaca: ' + error.message)
  return data  // número de butaca asignado
}

// ── Consultar estado de una solicitud (polling)
async function consultarEstado(requestId) {
  const { data } = await sb
    .from('verification_requests')
    .select('status')
    .eq('id', requestId)
    .single()
  return data?.status
}

// ══════════════════════════════════════════════════════════════
//  DATA & PROFILES
// ══════════════════════════════════════════════════════════════
const IS_DEMO      = new URLSearchParams(location.search).has('demo')
const SEAT_CAPACITY = IS_DEMO ? 2847 : 300  // asientos totales del hemiciclo (fijos)
let TOTAL_SEATS    = IS_DEMO ? 2847 : 0     // asientos ocupados (usuarios verificados)
let MY_SEAT        = IS_DEMO ? 7 : (parseInt(localStorage.getItem('cabildoos_butaca')) || 0)

const PHRASES = [
  'Venezuela libre y soberana.',
  'Por los que no pueden estar aquí.',
  'La democracia no se negocia.',
  'Desde el exilio, mi voto vale igual.',
  'Madrid presente. Venezuela en el corazón.',
  'Mi tierra merece algo mejor.',
  'Ciudadano del mundo, venezolano del alma.',
  'No olvidamos. No callamos. No nos rendimos.',
  'La patria nos une a pesar de la distancia.',
  'Cada voto cuenta. Cada voz importa.',
  'Construyendo desde la diáspora.',
  'Aquí desde Buenos Aires, pensando en Caracas.',
  'La revolución de los datos ya comenzó.',
  'Transparencia o nada.',
  'Resisto porque creo.',
  'Santiago de Chile. Venezolano de corazón.',
  'Nueva York presente en el hemiciclo.',
  'El futuro es participativo.',
  'Joven, venezolana y comprometida.',
  'Esto es lo más cerca que he estado del congreso.',
]
const NAMES = [
  'Ana M.','Carlos R.','María J.','Luis A.','Valentina C.',
  'Diego F.','Gabriela P.','Andrés T.','Sofía L.','Miguel Á.',
  'Carmen V.','Jesús M.','Isabella R.','José G.','Fernanda S.',
  'Daniel B.','Adriana O.','Pedro N.','Laura H.','Alejandro Z.',
  'Mónica V.','Roberto C.','Patricia F.','Eduardo M.','Claudia R.',
]
const AVATAR_COLORS = [
  '#1a1f3c','#2d3561','#4a4e69','#6b6f8a','#374151',
  '#065f46','#1e40af','#6d28d9','#7c2d12','#9d174d',
]

function lcg(seed) {
  return ((seed * 1664525 + 1013904223) & 0x7fffffff) >>> 0
}
let _myVoteCount = null   // null = todavía no cargado desde Supabase

async function _refreshMyVoteCount() {
  if (!MY_SEAT || MY_SEAT <= 0) return
  try {
    const { data } = await sb.rpc('get_my_vote_stats', { p_seat_number: MY_SEAT })
    if (data) _myVoteCount = data.reduce((sum, r) => sum + Number(r.cnt || 0), 0)
  } catch(e) {}
}

function getProfile(num) {
  if (num === MY_SEAT && MY_SEAT > 0) {
    const _votos = JSON.parse(localStorage.getItem('cabildoos_votos') || '{}')
    const votesCount = _myVoteCount !== null ? _myVoteCount : Object.keys(_votos).length
    return {
      isMe: true, isAnon: !_visibilidad.alias,
      name: 'Tú', displayName: _visibilidad.alias ? (_authProfile?.alias || `Butaca #${MY_SEAT}`) : 'Ciudadano Anónimo',
      phrase: _visibilidad.phrase ? (_authProfile?.phrase || '') : '',
      votes: _visibilidad.votes ? votesCount : 0, color: '#f76a1e',
      initials: String(MY_SEAT),
    }
  }
  // ── Datos reales desde Supabase (caché cargado por cargarPerfilesPublicos)
  // La RPC ahora devuelve TODOS los asientos: públicos con alias, privados con alias=null
  const cached = _profilesCache[num]
  const cIdx = num % AVATAR_COLORS.length
  if (cached && cached.showAlias && cached.alias) {
    // Alias visible: mostrar identidad + datos según toggles
    return {
      isMe: false, isAnon: false,
      name: cached.alias,
      displayName: cached.alias,
      phrase: cached.showPhrase ? (cached.phrase || '') : '',
      votes: cached.showVotes  ? (cached.votes  || 0)  : 0,
      color: AVATAR_COLORS[cIdx],
      initials: cached.alias.slice(0, 2).toUpperCase(),
    }
  }
  // Alias oculto: anónimo; votos sólo si show_votes está activo
  return {
    isMe: false, isAnon: true,
    name: `Butaca #${num}`,
    displayName: `Butaca #${num}`,
    phrase: '',
    votes: cached?.showVotes ? (cached?.votes || 0) : 0,
    color: AVATAR_COLORS[cIdx],
    initials: '#',
  }
}

// ══════════════════════════════════════════════════════════════
//  HEMICICLO GEOMETRY (world coords)
// ══════════════════════════════════════════════════════════════
const DOT_R  = 14        // visual dot radius — always fixed
const GAP    = DOT_R * 3.1
const A0 = 24 * Math.PI / 180
const A1 = 156 * Math.PI / 180
const SPAN = A1 - A0

// Adaptive radii — recalculated via rebuildHemiciclo()
let R_IN   = 320
let R_STEP = 50

// Computes ideal R_IN / R_STEP for any seat count
function getAdaptiveParams(count) {
  const firstRow = Math.max(4, Math.round(Math.pow(count, 0.35)))
  const rIn  = Math.round(firstRow * GAP / SPAN)
  const rStep = Math.max(28, Math.round(rIn * 0.155))
  return { rIn, rStep }
}

// Mutable seat array + bounds (rebuilt whenever count changes)
let SEATS = []
let bx0, bx1, by0, by1
let MY_SEAT_POS

// ── Zoom limits ──────────────────────────────────────────────
let   MIN_SCALE = 0.12   // se recalcula dinámicamente → zoom-out máximo = ver todo
const MAX_SCALE = 14

function calcMinScale() {
  if (!bx0 && !bx1) return          // seats aún no generados
  const cv = document.getElementById('hemiciclo')
  if (!cv) return
  const W = cv.clientWidth  || cv.width
  const H = cv.clientHeight || cv.height
  if (!W || !H) return
  const scX = W / (bx1 - bx0 + DOT_R * 4)
  const scY = H / (by1 - by0 + DOT_R * 4)
  MIN_SCALE = Math.min(scX, scY) * 0.88
}

// Devuelve el orden de índices de posición para llenar una fila
// de centro hacia los costados (1ro centro, 2do izq, 3ro der, ...)
function centerOutOrder(n) {
  if (n <= 1) return [0]
  const order = []
  if (n % 2 === 1) {
    // impar: empieza en el centro exacto
    const c = Math.floor(n / 2)
    order.push(c)
    for (let d = 1; d <= c; d++) { order.push(c - d); order.push(c + d) }
  } else {
    // par: empieza en los dos índices centrales
    const c = n / 2
    for (let d = 0; d < c; d++) { order.push(c - 1 - d); order.push(c + d) }
  }
  return order
}

function buildSeats() {
  SEATS.length = 0
  let n = 0, row = 0
  // Siempre generamos SEAT_CAPACITY posiciones (hemiciclo completo visible desde el inicio)
  while (n < SEAT_CAPACITY) {
    const r        = R_IN + row * R_STEP
    const fullCant = Math.floor(r * SPAN / GAP)
    const cant     = Math.min(fullCant, SEAT_CAPACITY - n)
    const order    = centerOutOrder(fullCant)  // orden centro → costados
    for (let i = 0; i < cant; i++) {
      const posIdx = order[i]
      const t = fullCant > 1 ? posIdx / (fullCant - 1) : 0.5
      const a = A0 + t * SPAN
      SEATS.push({ num: n + 1, x: r * Math.cos(a), y: r * Math.sin(a), row })
      n++
    }
    row++
  }
  bx0=0; bx1=0; by0=0; by1=0
  if (SEATS.length > 0) {
    bx0=Infinity; bx1=-Infinity; by0=Infinity; by1=-Infinity
    SEATS.forEach(s => {
      bx0=Math.min(bx0,s.x); bx1=Math.max(bx1,s.x)
      by0=Math.min(by0,s.y); by1=Math.max(by1,s.y)
    })
  }
  MY_SEAT_POS = SEATS[Math.min(MY_SEAT, SEAT_CAPACITY) - 1] || SEATS[0] || { x: 0, y: 0 }
}
buildSeats()
calcMinScale()   // límite de zoom-out = ver todas las sillas
// Sincronizar labels y ocultar botones de demo según modo
;(function() {
  const fmt = TOTAL_SEATS > 0 ? TOTAL_SEATS.toLocaleString('es-VE').replace(',','.') : '0'
  const el = document.getElementById('citizen-num')
  if (el) el.textContent = fmt
  const cl = document.querySelector('.cl-sub')
  if (cl) cl.textContent = `— ${fmt} butacas en el hemiciclo`
  // En modo real: ocultar botones de demo/simulación
  if (!IS_DEMO) {
    const bs = document.getElementById('btn-simular')
    const bh = document.getElementById('btn-hemi-config')
    if (bs) bs.style.display = 'none'
    if (bh) bh.style.display = 'none'
  }
})()

// ══════════════════════════════════════════════════════════════
//  HEMICICLO CONFIG PANEL
// ══════════════════════════════════════════════════════════════
let hcpPendingCount = TOTAL_SEATS

function rebuildHemiciclo(count) {
  count = Math.max(5, Math.min(5000, count))
  TOTAL_SEATS = count
  // Geometry stays fixed — only dot count changes
  R_IN   = 320
  R_STEP = 50
  buildSeats()
  // Update UI labels
  const fmt = count.toLocaleString('es-VE')
  const el = document.getElementById('citizen-num')
  if (el) el.textContent = fmt.replace(',','.')
  const cl = document.querySelector('.cl-sub')
  if (cl) cl.textContent = `— ${fmt.replace(',','.')} butacas en el hemiciclo`
  // Fly to full view
  calcMinScale()   // actualizar límite con nuevo bounding box
  const W = canvas.clientWidth, H = canvas.clientHeight
  const scX = W / (bx1 - bx0 + DOT_R * 4)
  const scY = H / (by1 - by0 + DOT_R * 4)
  cam.ts = Math.max(MIN_SCALE, Math.min(scX, scY) * 0.88)
  cam.tx = (bx0 + bx1) / 2
  cam.ty = (by0 + by1) / 2
  // Update counter display in panel
  hcpUpdateDisplay(count)
}

function hcpUpdateDisplay(count) {
  hcpPendingCount = count
  const big = document.getElementById('hcp-count-big')
  if (big) big.textContent = count.toLocaleString('es-VE').replace(',','.')
  // Slider gradient
  const slider = document.getElementById('hcp-slider')
  if (slider) {
    slider.value = count
    const pct = ((count - 5) / (5000 - 5) * 100).toFixed(1)
    slider.style.setProperty('--pct', pct + '%')
  }
  // Manual input
  const inp = document.getElementById('hcp-input')
  if (inp) inp.value = count
  // Presets: mark active if exact match
  document.querySelectorAll('.hcp-preset').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.n) === count)
  })
}

function hcpSelectPreset(btn) {
  const n = parseInt(btn.dataset.n)
  hcpUpdateDisplay(n)
  rebuildHemiciclo(n)
}

function hcpSliderMove(el) {
  const n = parseInt(el.value)
  hcpUpdateDisplay(n)
  rebuildHemiciclo(n)
}

function hcpInputMove(el) {
  hcpPendingCount = parseInt(el.value) || hcpPendingCount
  const big = document.getElementById('hcp-count-big')
  if (big) big.textContent = (hcpPendingCount).toLocaleString('es-VE').replace(',','.')
  document.querySelectorAll('.hcp-preset').forEach(b => b.classList.remove('active'))
}

function hcpAplicar() {
  const inp = document.getElementById('hcp-input')
  const n = Math.max(5, Math.min(5000, parseInt(inp.value) || TOTAL_SEATS))
  rebuildHemiciclo(n)
}

function abrirHemiConfig() {
  if (!_requireButaca()) return
  document.getElementById('hemi-config-panel').classList.add('open')
  document.getElementById('btn-hemi-config').style.color = 'var(--orange)'
  hcpUpdateDisplay(TOTAL_SEATS)
}

function cerrarHemiConfig() {
  document.getElementById('hemi-config-panel').classList.remove('open')
  document.getElementById('btn-hemi-config').style.color = ''
}

// Close panel on outside click
document.addEventListener('click', e => {
  const panel = document.getElementById('hemi-config-panel')
  if (!panel.classList.contains('open')) return
  if (e.target.closest('#hemi-config-panel')) return
  if (e.target.closest('#btn-hemi-config')) return
  cerrarHemiConfig()
})

// ══════════════════════════════════════════════════════════════
//  CAMERA
// ══════════════════════════════════════════════════════════════

const cam = {
  x: MY_SEAT_POS.x,
  y: MY_SEAT_POS.y,
  scale: 3.2,
  tx: MY_SEAT_POS.x, // target for smooth pan
  ty: MY_SEAT_POS.y,
  ts: 3.2,           // target scale
}

function toScreen(wx, wy, W, H) {
  return {
    x: (wx - cam.x) * cam.scale + W / 2,
    y: (wy - cam.y) * cam.scale + H / 2,
  }
}
function toWorld(sx, sy, W, H) {
  return {
    x: (sx - W / 2) / cam.scale + cam.x,
    y: (sy - H / 2) / cam.scale + cam.y,
  }
}

// Actualiza el texto y acción del botón naranja del mapa según si el usuario tiene butaca
function _actualizarBtnButaca() {
  const btn = document.getElementById('btn-map-butaca')
  if (!btn) return
  if (MY_SEAT > 0) {
    btn.textContent = '↵ Mi butaca'
  } else if (_authUser) {
    btn.textContent = '↵ Crear butaca'
  } else {
    btn.textContent = '↵ Crear butaca'
  }
}

function mapButacaBtn() {
  if (MY_SEAT > 0) {
    resetCamera()
  } else if (_isObserverMode()) {
    // Observador — no tiene butaca ni necesita verificación
    showToast('Modo observador — sin butaca asignada')
  } else if (_authUser) {
    // Logueado pero sin verificar → ir a verificación
    showScreen('verify-onboard')
  } else {
    abrirAuth('registro')
  }
}

function resetCamera() {
  cam.tx = MY_SEAT_POS.x
  cam.ty = MY_SEAT_POS.y
  cam.ts = 3.2
}

function zoomOut() {
  const W = canvas.clientWidth || canvas.width
  const H = canvas.clientHeight || canvas.height
  const scX = W  / (bx1 - bx0 + DOT_R * 4)
  const scY = H  / (by1 - by0 + DOT_R * 4)
  cam.ts = Math.max(MIN_SCALE, Math.min(scX, scY) * 0.88)
  cam.tx = (bx0 + bx1) / 2
  cam.ty = (by0 + by1) / 2
}

// Smooth camera lerp
function lerpCam() {
  const EZ = 0.1
  cam.x += (cam.tx - cam.x) * EZ
  cam.y += (cam.ty - cam.y) * EZ
  cam.scale += (cam.ts - cam.scale) * EZ
}

// ══════════════════════════════════════════════════════════════
//  CANVAS & DRAW
// ══════════════════════════════════════════════════════════════
const canvas = document.getElementById('hemiciclo')
const ctx    = canvas.getContext('2d')
// ── Estado de follows (cargado desde Supabase) ──────────────────────────────
const followingConfirmed  = new Set()  // yo sigo (aceptado)
const followingPending    = new Set()  // solicitudes enviadas sin respuesta
const followersConfirmed  = new Set()  // me siguen (aceptado)
let   _pendingRequestsToMe = []        // solicitudes que debo aceptar/rechazar [{id,from_seat,alias}]
let   _unreadConvos = {}               // {from_seat: {count, lastText, lastTime}}

// Alias para compatibilidad con canvas (usa `following`)
const following = followingConfirmed
let hoveredSeat = null
let t0 = Date.now()

function draw() {
  lerpCam()
  const W = canvas.width, H = canvas.height
  const t = Date.now()

  ctx.clearRect(0, 0, W, H)

  // Viewport culling bounds (with margin)
  const margin = DOT_R * cam.scale + 8
  const vx0 = -margin, vx1 = W + margin
  const vy0 = -margin, vy1 = H + margin

  SEATS.forEach(s => {
    const { x: sx, y: sy } = toScreen(s.x, s.y, W, H)
    if (sx < vx0 || sx > vx1 || sy < vy0 || sy > vy1) return

    const isMine     = s.num === MY_SEAT
    const isHovered  = hoveredSeat === s.num
    const isFollow   = following.has(s.num)
    // Asiento ocupado: es el mío, o existe en el caché de perfiles reales
    const isOccupied = isMine || (s.num in _profilesCache)

    // Dot radius on screen
    let r = Math.max(1.2, DOT_R * cam.scale)
    if (isMine) r *= (1 + ((Math.sin((t - t0) / 600) + 1) / 2) * 0.18)
    if (isHovered) r *= 1.22

    if (!isOccupied) {
      // ── Asiento vacío: contorno visible ──
      ctx.globalAlpha = cam.scale < 0.4 ? 0.4 : 0.65
      ctx.beginPath()
      ctx.arc(sx, sy, Math.max(1.2, r * 0.92), 0, Math.PI * 2)
      ctx.strokeStyle = '#6a7a90'
      ctx.lineWidth   = Math.max(1, Math.min(2, cam.scale * 1.2))
      ctx.stroke()
      ctx.globalAlpha = 1
    } else {
      // ── Asiento ocupado: relleno ──
      let fill, glow = null
      if (isMine) { fill = '#f76a1e'; glow = 'rgba(247,106,30,.5)'; }
      else        { fill = '#1a1f3c'; }

      if (cam.scale < 0.5) {
        const alpha = 0.35 + 0.65 * (s.row % 2 === 0 ? 1 : 0.7)
        ctx.globalAlpha = alpha
      }

      if (glow && r > 3) {
        ctx.shadowColor = glow
        ctx.shadowBlur  = r * 0.9
      }

      ctx.beginPath()
      ctx.arc(sx, sy, r, 0, Math.PI * 2)
      ctx.fillStyle = fill
      ctx.fill()
      ctx.shadowBlur  = 0
      ctx.globalAlpha = 1
    }
  })

  requestAnimationFrame(draw)
}

// ══════════════════════════════════════════════════════════════
//  CANVAS EVENTS
// ══════════════════════════════════════════════════════════════
const area = document.getElementById('canvas-area')
let drag = { active: false, startX:0, startY:0, camX:0, camY:0, moved:false }
let lastPinchDist = null

function getCanvasXY(e) {
  const rect = canvas.getBoundingClientRect()
  const scX  = canvas.width  / rect.width
  const scY  = canvas.height / rect.height
  return {
    x: (e.clientX - rect.left) * scX,
    y: (e.clientY - rect.top)  * scY,
  }
}

// Zoom lock flag — blocks profile cards while scrolling
let isZooming = false
let zoomEndTimer = null
function setZooming() {
  isZooming = true
  hideCard()
  clearTimeout(zoomEndTimer)
  zoomEndTimer = setTimeout(() => { isZooming = false }, 350)
}

// Wheel zoom (centered on cursor)
canvas.addEventListener('wheel', e => {
  e.preventDefault()
  setZooming()
  const { x: sx, y: sy } = getCanvasXY(e)
  const W = canvas.width, H = canvas.height
  const wBefore = toWorld(sx, sy, W, H)
  const factor  = e.deltaY > 0 ? 0.82 : 1 / 0.82
  cam.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, cam.scale * factor))
  cam.ts    = cam.scale
  const wAfter = toWorld(sx, sy, W, H)
  cam.x += wBefore.x - wAfter.x
  cam.y += wBefore.y - wAfter.y
  cam.tx = cam.x; cam.ty = cam.y
}, { passive: false })

canvas.addEventListener('mousedown', e => {
  drag.active = true; drag.moved = false
  drag.startX = e.clientX; drag.startY = e.clientY
  drag.camX   = cam.x;     drag.camY   = cam.y
  area.classList.add('dragging')
  hideCard()
})

window.addEventListener('mousemove', e => {
  if (drag.active) {
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (Math.abs(dx) + Math.abs(dy) > 3) { drag.moved = true; hideCard() }
    cam.x  = drag.camX - dx / cam.scale
    cam.y  = drag.camY - dy / cam.scale
    cam.tx = cam.x; cam.ty = cam.y
    return
  }

  // Only show profiles on the congress screen, and not while zooming or with overlays open
  if (!document.getElementById('congress').classList.contains('active')) return
  if (isZooming) return
  if (document.getElementById('cal-overlay')?.classList.contains('open')) return

  // Block cards when hovering the footer controls
  const ctrls = document.getElementById('map-controls')
  if (ctrls) {
    const r = ctrls.getBoundingClientRect()
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
      hideCard(); return
    }
  }

  // Hover seat detection
  const rect = canvas.getBoundingClientRect()
  if (
    e.clientX < rect.left || e.clientX > rect.right ||
    e.clientY < rect.top  || e.clientY > rect.bottom
  ) { hideCard(); return }

  const { x: sx, y: sy } = getCanvasXY(e)
  const W = canvas.width, H = canvas.height
  const hitR = Math.max(DOT_R, DOT_R * cam.scale * 1.2)  // px on screen

  let closest = null, minD = hitR + 6
  SEATS.forEach(s => {
    if (!(s.num in _profilesCache) && s.num !== MY_SEAT) return  // butaca vacía: ignorar hover
    const { x: ssx, y: ssy } = toScreen(s.x, s.y, W, H)
    const d = Math.hypot(sx - ssx, sy - ssy)
    if (d < minD) { minD = d; closest = s }
  })

  if (closest) {
    const closestOccupied = closest.num === MY_SEAT || (closest.num in _profilesCache)
    hoveredSeat = closestOccupied ? closest.num : null
    // Only update card if not pinned (mouse on card), seat changed, and seat is occupied
    if (!cardPinned && closestOccupied && closest.num !== cardSeat) {
      showCard(closest, e.clientX, e.clientY)
    } else if (!cardPinned && !closestOccupied) {
      hideCard()
    }
  } else {
    hoveredSeat = null
    if (!cardPinned) hideCard()
  }
})

window.addEventListener('mouseup', e => {
  // Click on canvas no longer opens modal — modal opens from q-text click only
  drag.active = false
  area.classList.remove('dragging')
})

canvas.addEventListener('mouseleave', () => { if (!cardPinned) hideCard() })

// ══════════════════════════════════════════════════════════════
//  TOUCH CANVAS (mobile: pan 1 dedo, pinch zoom 2 dedos, tap)
// ══════════════════════════════════════════════════════════════
const touch = { active:false, x:0, y:0, camX:0, camY:0, moved:false, pinch:false, pinchDist:0, tapTime:0 }

canvas.addEventListener('touchstart', e => {
  e.preventDefault()
  if (e.touches.length === 1) {
    touch.active = true; touch.pinch = false; touch.moved = false
    touch.x = e.touches[0].clientX
    touch.y = e.touches[0].clientY
    touch.camX = cam.x; touch.camY = cam.y
    touch.tapTime = Date.now()
  } else if (e.touches.length === 2) {
    touch.active = false; touch.pinch = true; touch.moved = true
    touch.pinchDist = Math.hypot(
      e.touches[1].clientX - e.touches[0].clientX,
      e.touches[1].clientY - e.touches[0].clientY
    )
  }
}, { passive: false })

canvas.addEventListener('touchmove', e => {
  e.preventDefault()
  if (touch.pinch && e.touches.length === 2) {
    const dist = Math.hypot(
      e.touches[1].clientX - e.touches[0].clientX,
      e.touches[1].clientY - e.touches[0].clientY
    )
    const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2
    const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2
    const { x: sx, y: sy } = getCanvasXY({ clientX: cx, clientY: cy })
    const W = canvas.width, H = canvas.height
    const wBefore = toWorld(sx, sy, W, H)
    const factor = dist / touch.pinchDist
    cam.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, cam.scale * factor))
    cam.ts = cam.scale
    const wAfter = toWorld(sx, sy, W, H)
    cam.x += wBefore.x - wAfter.x
    cam.y += wBefore.y - wAfter.y
    cam.tx = cam.x; cam.ty = cam.y
    touch.pinchDist = dist
  } else if (touch.active && e.touches.length === 1) {
    const dx = e.touches[0].clientX - touch.x
    const dy = e.touches[0].clientY - touch.y
    if (Math.abs(dx) + Math.abs(dy) > 5) { touch.moved = true; hideCard() }
    cam.x = touch.camX - dx / cam.scale
    cam.y = touch.camY - dy / cam.scale
    cam.tx = cam.x; cam.ty = cam.y
  }
}, { passive: false })

canvas.addEventListener('touchend', e => {
  e.preventDefault()
  if (touch.pinch) { touch.pinch = false; return }
  if (!touch.moved && (Date.now() - touch.tapTime) < 300) {
    const { x: sx, y: sy } = getCanvasXY({ clientX: touch.x, clientY: touch.y })
    const W = canvas.width, H = canvas.height
    const hitR = Math.max(DOT_R, DOT_R * cam.scale * 2.8) + 12
    let closest = null, minD = hitR
    SEATS.forEach(s => {
      if (s.num > TOTAL_SEATS && s.num !== MY_SEAT) return
      const { x: ssx, y: ssy } = toScreen(s.x, s.y, W, H)
      const d = Math.hypot(sx - ssx, sy - ssy)
      if (d < minD) { minD = d; closest = s }
    })
    if (closest) showCard(closest, touch.x, touch.y)
    else hideCard()
  }
  touch.active = false
}, { passive: false })

// ── Canvas sizing
function resizeCanvas() {
  canvas.width  = area.clientWidth
  canvas.height = area.clientHeight
  calcMinScale()   // recalcular límite de zoom-out al nuevo tamaño de ventana
}
window.addEventListener('resize', resizeCanvas)

// ══════════════════════════════════════════════════════════════
//  PROFILE CARD
// ══════════════════════════════════════════════════════════════
let cardSeat   = null
let hideTimer  = null
let cardPinned = false   // true while mouse is inside the card

function showCard(seat, cx, cy) {
  cardSeat = seat.num
  const p = getProfile(seat.num)
  const card = document.getElementById('profile-card')

  // Color de tarjeta del usuario — fondo siempre blanco, color elegido solo como acento
  const CARD_ACCENT = {
    white:  '#d1d5db',  // gris neutro
    orange: '#f76a1e',
    yellow: '#f59e0b',
    green:  '#34d399',
    cyan:   '#22d3ee',
    black:  '#6b7280',
    red:    '#f87171',
    pink:   '#f472b6',
  }
  const CARD_THEMES = {
    white:  { bg:'#ffffff', text:'#1c1c1e', muted:'#888',    border:'rgba(0,0,0,.1)' },
    yellow: { bg:'#ffffff', text:'#1c1c1e', muted:'#888',    border:'rgba(0,0,0,.1)' },
    green:  { bg:'#ffffff', text:'#1c1c1e', muted:'#888',    border:'rgba(0,0,0,.1)' },
    cyan:   { bg:'#ffffff', text:'#1c1c1e', muted:'#888', border:'rgba(0,0,0,.1)' },
    black:  { bg:'#ffffff', text:'#1c1c1e', muted:'#888', border:'rgba(0,0,0,.1)' },
    red:    { bg:'#ffffff', text:'#1c1c1e', muted:'#888', border:'rgba(0,0,0,.1)' },
    pink:   { bg:'#ffffff', text:'#1c1c1e', muted:'#888', border:'rgba(0,0,0,.1)' },
    orange: { bg:'#ffffff', text:'#1c1c1e', muted:'#888', border:'rgba(0,0,0,.1)' },
  }
  const cached = _profilesCache[seat.num]
  const cardColor = cached?.cardColor || 'orange'
  const accentColor = CARD_ACCENT[cardColor] ?? CARD_ACCENT.orange
  card.style.background = '#ffffff'
  document.getElementById('pc-name').style.color   = '#1c1c1e'
  document.getElementById('pc-butaca').style.color  = '#888'
  const phraseEl = document.getElementById('pc-phrase')
  phraseEl.style.color = '#1c1c1e'

  // Avatar y acento con el color elegido
  const av = document.getElementById('pc-avatar')
  av.style.background = accentColor
  card.style.setProperty('--pc-color', accentColor)
  av.textContent = p.initials

  document.getElementById('pc-name').textContent    = p.displayName
  document.getElementById('pc-butaca').textContent  = `Butaca #${seat.num}`
  const badge = document.getElementById('pc-badge')
  if (p.isAnon) { badge.textContent = 'Anónimo'; badge.className = 'pc-anon-badge anon'; }
  else          { badge.textContent = 'Público';  badge.className = 'pc-anon-badge pub'; }

  document.getElementById('pc-phrase').textContent  = p.phrase ? `"${p.phrase}"` : ''
  const pcVotesEl = document.getElementById('pc-votes-n')
  const pcVotesRow = pcVotesEl?.closest('.pc-votes')
  if (p.votes > 0) {
    pcVotesEl.textContent = p.votes
    if (pcVotesRow) pcVotesRow.style.display = ''
  } else {
    if (pcVotesRow) pcVotesRow.style.display = 'none'
  }

  const fbtn = document.getElementById('pc-follow-btn')

  if (p.isMe) {
    // Propio dot: sin botones de acción
    fbtn.style.display = 'none'
  } else {
    if (MY_SEAT > 0) {
      fbtn.style.display = ''
      if (followingConfirmed.has(seat.num)) {
        fbtn.textContent = 'Siguiendo'; fbtn.className = 'pc-follow following'
      } else if (followingPending.has(seat.num)) {
        fbtn.textContent = 'Pendiente'; fbtn.className = 'pc-follow disabled'
      } else {
        fbtn.textContent = 'Seguir'; fbtn.className = 'pc-follow'
      }
    } else {
      fbtn.style.display = 'none'
    }
  }

  // Position: bottom sheet on mobile, floating near cursor on desktop
  if (window.innerWidth <= 640) {
    card.style.left = ''
    card.style.top  = ''
  } else {
    const W = window.innerWidth, H = window.innerHeight
    const CW = 264, CH = 220
    let x = cx + 18, y = cy - 60
    if (x + CW > W - 8) x = cx - CW - 14
    if (y + CH > H - 8) y = H - CH - 8
    if (y < 8) y = 8
    card.style.left = x + 'px'
    card.style.top  = y + 'px'
  }

  clearTimeout(hideTimer)
  card.classList.add('visible')
}

function hideCard() {
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    document.getElementById('profile-card').classList.remove('visible')
    cardSeat = null
    hoveredSeat = null
  }, 260)
}

document.getElementById('profile-card').addEventListener('mouseenter', () => {
  clearTimeout(hideTimer)
  cardPinned = true
})
document.getElementById('profile-card').addEventListener('mouseleave', () => {
  cardPinned = false
  hideCard()
})

async function toggleFollow() {
  if (!cardSeat || cardSeat === MY_SEAT || !MY_SEAT) return
  const btn = document.getElementById('pc-follow-btn')
  const seat = cardSeat

  if (followingConfirmed.has(seat) || followingPending.has(seat)) {
    // Unfollow / cancelar solicitud
    const { error } = await sb.from('follows')
      .delete()
      .eq('from_seat', MY_SEAT)
      .eq('to_seat', seat)
    if (!error) {
      followingConfirmed.delete(seat)
      followingPending.delete(seat)
      btn.textContent = 'Seguir'
      btn.className   = 'pc-follow'
      showToast(`Dejaste de seguir la butaca #${seat}`)
      renderSocial('seguidos')
    }
  } else {
    // Enviar solicitud de seguimiento
    btn.disabled = true
    const { error } = await sb.from('follows').insert({
      from_seat: MY_SEAT,
      to_seat:   seat,
      status:    'pending'
    })
    btn.disabled = false
    if (!error) {
      followingPending.add(seat)
      btn.textContent = 'Pendiente'
      btn.className   = 'pc-follow disabled'
      showToast(`Solicitud enviada a butaca #${seat}`)
    } else {
      showToast('Error al enviar solicitud', true)
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  SIMULATION
// ══════════════════════════════════════════════════════════════
const simCanvas = document.getElementById('sim-canvas')
const simCtx    = simCanvas.getContext('2d')
let simCSSW = 0, simCSSH = 0

const SIM = {
  active: false,
  results: {},
  revealed: 0,
  order: [],
  revealedArr: null,
  ivId: null,
  totalSi: 0, totalNo: 0, totalAbs: 0,
  camX: 0, camY: 0, camS: 1,
}

// ══════════════════════════════════════════════════════════════
//  MOBILE NAV SHEET (botón ⊞ en top-right → bottom sheet)
// ══════════════════════════════════════════════════════════════
function mobNavToggle() {
  const sheet = document.getElementById('mob-nav-sheet')
  const btn   = document.getElementById('mob-nav-btn')
  if (!sheet) return
  const isOpen = sheet.classList.contains('open')
  if (isOpen) {
    mobNavClose()
  } else {
    // Mostrar/ocultar botón de salir según sesión
    const signOut = document.getElementById('mob-sign-out-btn')
    if (signOut) signOut.style.display = _authUser ? '' : 'none'
    sheet.classList.add('open')
    btn?.classList.add('open')
  }
}
function mobNavClose() {
  document.getElementById('mob-nav-sheet')?.classList.remove('open')
  document.getElementById('mob-nav-btn')?.classList.remove('open')
}

// ── Mobile: adaptaciones al arrancar ────────────────────────
;(function() {
  if (window.innerWidth > 640) return
  // Zoom hint
  const hint = document.getElementById('zoom-hint-txt')
  if (hint) hint.innerHTML = 'Deslizá para explorar · Pellizcá para hacer zoom'
  // Reformatear citizen-count para layout vertical (número encima, label debajo)
  const cc = document.querySelector('.citizen-count')
  if (cc) {
    const num = document.getElementById('citizen-num')?.textContent || '0'
    cc.innerHTML = `<b id="citizen-num" style="font-size:14px;color:var(--dark)">${num}</b><span>ciudadanos</span>`
  }
})()

// ── Demo 300 butacas — llama desde consola: simDemo() ───────────────────────
window.simDemo = function(n = 300) {
  // Asegurar geometría completa
  const prevTotal = TOTAL_SEATS
  TOTAL_SEATS = n
  buildSeats()

  hideCard()
  document.getElementById('modal-bd')?.classList.remove('open')

  // Distribución aleatoria realista
  const opciones = ['si','si','si','no','no','abs',null]
  SIM.results = {}; SIM.totalSi = 0; SIM.totalNo = 0; SIM.totalAbs = 0
  SEATS.filter(s => s.num <= n).forEach(s => {
    const v = opciones[Math.floor(Math.random() * opciones.length)]
    SIM.results[s.num] = v
    if (v === 'si') SIM.totalSi++
    else if (v === 'no') SIM.totalNo++
    else if (v === 'abs') SIM.totalAbs++
  })
  SIM._realSi = SIM.totalSi; SIM._realNo = SIM.totalNo; SIM._realAbs = SIM.totalAbs

  SIM.revealed = 0
  SIM.order = SEATS.filter(s => s.num <= n).map(s => s.num).sort(() => Math.random() - 0.5)
  const simTotal = SIM.order.length
  SIM.revealedArr = new Uint8Array(n + 1)

  const qEl = document.getElementById('sw-question-txt')
  if (qEl) qEl.textContent = '¿Apoya usted esta propuesta de ley?'
  const simTotalEl = document.getElementById('sim-total')
  if (simTotalEl) simTotalEl.textContent = simTotal.toLocaleString('es-AR')
  document.getElementById('sim-progress').textContent = '0'

  SIM.active = true
  document.getElementById('sim-overlay').classList.add('open')
  document.getElementById('sim-winner-banner').classList.remove('show')
  const _fs = document.getElementById('sim-floating-status')
  if (_fs) _fs.classList.add('counting')
  const _lbl = document.getElementById('sim-floating-label')
  if (_lbl) _lbl.textContent = 'Contando sobres…'
  const _footer = document.getElementById('sim-footer-bar')
  if (_footer) _footer.classList.remove('show')

  resizeSimCanvas()

  const rangeX = bx1 - bx0, rangeY = by1 - by0
  const padX = Math.max(rangeX * 0.05, DOT_R * 4)
  const padY = Math.max(rangeY * 0.05, DOT_R * 4)
  SIM.camS = Math.min(simCSSW / (rangeX + padX*2), simCSSH / (rangeY + padY*2), 12) * 0.92
  SIM.camX = (bx0 + bx1) / 2
  SIM.camY = (by0 + by1) / 2

  SIM.startTime  = Date.now()
  SIM.flashMap   = {}
  SIM._done      = false
  SIM.REVEAL_DUR = simTotal <= 5 ? 4000 : simTotal <= 20 ? 3500 : simTotal <= 80 ? 4000 : 5000

  simDraw()
}
// ─────────────────────────────────────────────────────────────────────────────

async function iniciarSimulacion() {
  if (!_requireButaca()) return
  if (SEATS.length === 0) {
    await cargarConteoReal()
    if (SEATS.length === 0) return
  }

  hideCard()
  const mbd = document.getElementById('modal-bd')
  if (mbd) mbd.classList.remove('open')

  // ── UI inicial ────────────────────────────────────────────────────────────
  SIM.active  = true
  SIM.phase   = 'reveal'   // arranca directo en reveal
  SIM.results = {}
  SIM.totalSi = 0; SIM.totalNo = 0; SIM.totalAbs = 0
  SIM.revealed = 0
  SIM.revealedArr = new Uint8Array(TOTAL_SEATS + 1)
  SIM.flashMap    = {}
  SIM._done       = false
  SIM._settleStart= 0
  SIM.dramaticMap = {}

  document.getElementById('sim-overlay').classList.add('open')
  document.getElementById('sim-winner-banner').classList.remove('show')
  const _fs = document.getElementById('sim-floating-status')
  if (_fs) _fs.classList.add('counting')
  const _lbl = document.getElementById('sim-floating-label')
  if (_lbl) _lbl.textContent = 'Cargando votos…'
  const _footer = document.getElementById('sim-footer-bar')
  if (_footer) _footer.classList.remove('show')

  resizeSimCanvas()

  // Cámara centrada en el hemiciclo real
  const rangeX = bx1 - bx0, rangeY = by1 - by0
  const padX = Math.max(rangeX * 0.05, DOT_R * 4)
  const padY = Math.max(rangeY * 0.05, DOT_R * 4)
  SIM.camS = Math.min(simCSSW / (rangeX + padX*2), simCSSH / (rangeY + padY*2), 12) * 0.92
  SIM.camX = (bx0 + bx1) / 2
  SIM.camY = (by0 + by1) / 2

  // Arrancar animación de luces AHORA, antes de que cargue la data
  simDraw()

  // ── Cargar datos en paralelo ──────────────────────────────────────────────
  const qId = PREGUNTAS_IDS[qIdx]
  const participatedSeats = new Set()
  if (qId) {
    await Promise.allSettled([
      sb.from('vote_seats').select('seat_number').eq('question_id', qId)
        .then(({ data }) => { if (data) data.forEach(r => participatedSeats.add(r.seat_number)) }),
      sb.rpc('get_question_votes', { p_question_id: qId })
        .then(({ data }) => { if (data) data.forEach(row => {
          if (row.vote_plain === 'si')  SIM.totalSi  = Number(row.total)
          if (row.vote_plain === 'no')  SIM.totalNo  = Number(row.total)
          if (row.vote_plain === 'abs') SIM.totalAbs = Number(row.total)
        })})
    ])
  }

  // ── Data lista → corte instantáneo a revelación ───────────────────────────
  SEATS.forEach(s => {
    SIM.results[s.num] = participatedSeats.has(s.num) ? 'voted' : null
  })
  SIM._realSi  = SIM.totalSi
  SIM._realNo  = SIM.totalNo
  SIM._realAbs = SIM.totalAbs

  SIM.order = SEATS.filter(s => s.num <= TOTAL_SEATS).map(s => s.num).sort(() => Math.random() - 0.5)
  const simTotal = SIM.order.length
  SIM.order.forEach(snum => {
    SIM.dramaticMap[snum] = 'naranja'
  })
  SIM.REVEAL_DUR = simTotal <= 5 ? 4000 : simTotal <= 20 ? 3500 : simTotal <= 80 ? 4000 : 5000

  // Actualizar header
  const qEl = document.getElementById('sw-question-txt')
  if (qEl) qEl.textContent = PREGUNTAS[qIdx] || qEl.textContent
  const simTotalEl = document.getElementById('sim-total')
  if (simTotalEl) simTotalEl.textContent = simTotal.toLocaleString('es-AR')
  document.getElementById('sim-progress').textContent = '0'
  if (_lbl) _lbl.textContent = 'Contando sobres…'

  // Corte instantáneo: las luces se apagan y arranca el conteo real
  SIM.phase     = 'counting'
  SIM.startTime = Date.now()
}

function simToScreen(wx, wy) {
  return {
    x: (wx - SIM.camX) * SIM.camS + simCSSW / 2,
    y: (wy - SIM.camY) * SIM.camS + simCSSH / 2,
  }
}

function simDraw() {
  if (!SIM.active) return
  const W = simCSSW, H = simCSSH
  const t = Date.now()
  const dotR = Math.max(3.5, DOT_R * SIM.camS)

  // ══════════════════════════════════════════════════════════════════════════
  // FASE FUEGOS ARTIFICIALES — todas las butacas parpadeando 4 colores
  // Corre mientras los datos cargan; corte instantáneo cuando llegan.
  // ══════════════════════════════════════════════════════════════════════════
  if (SIM.phase === 'fireworks') {
    // 4 colores del cabildo
    const FW_COLORS = ['#ef4444', '#22c55e', '#f59e0b', '#3b82f6']
    const FW_GLOWS  = ['rgba(239,68,68,', 'rgba(34,197,94,', 'rgba(245,158,11,', 'rgba(59,130,246,']

    // Fondo oscuro
    simCtx.clearRect(0, 0, W, H)
    simCtx.fillStyle = '#040C1E'
    simCtx.fillRect(0, 0, W, H)

    // Resplandor radial
    const grd = simCtx.createRadialGradient(W/2, H*0.9, 0, W/2, H*0.9, W * 0.7)
    grd.addColorStop(0,   'rgba(37,99,235,0.15)')
    grd.addColorStop(1,   'transparent')
    simCtx.fillStyle = grd
    simCtx.fillRect(0, 0, W, H)

    // Cada butaca (todas las 300) con su color que cicla independientemente
    for (let i = 0; i < SEATS.length; i++) {
      const s = SEATS[i]
      const { x: sx, y: sy } = simToScreen(s.x, s.y)
      if (sx < -dotR*4 || sx > W+dotR*4 || sy < -dotR*4 || sy > H+dotR*4) continue

      // Índice de color: cada butaca tiene velocidad y offset distintos
      const speed  = 200 + (s.num % 7) * 40          // 200–440 ms por color
      const offset = s.num * 137.5                    // golden angle offset → distribución uniforme
      const cIdx   = Math.floor((t + offset) / speed) % 4

      // Pulso de brillo (senoidal, desfasado por butaca)
      const pulse = (Math.sin(t / 500 + s.num * 0.9) + 1) / 2   // 0..1
      const r     = dotR * (0.9 + pulse * 0.5)

      simCtx.save()
      simCtx.shadowColor = FW_GLOWS[cIdx] + '0.9)'
      simCtx.shadowBlur  = 10 + pulse * 14
      simCtx.beginPath()
      simCtx.arc(sx, sy, Math.max(1, r), 0, Math.PI * 2)
      simCtx.fillStyle = FW_COLORS[cIdx]
      simCtx.fill()
      simCtx.restore()
    }
    simCtx.shadowBlur  = 0
    simCtx.globalAlpha = 1

    requestAnimationFrame(simDraw)
    return
  }
  // ══════════════════════════════════════════════════════════════════════════

  // ── Reveal frame-driven (curva cúbica + jitter aleatorio) ────────────────
  const _simTotal = SIM.order.length
  if (_simTotal > 0 && SIM.startTime) {
    // ── Revelar seats según curva de tiempo ──
    if (SIM.revealed < _simTotal) {
      const elapsed = t - SIM.startTime
      const rawT    = Math.min(elapsed / SIM.REVEAL_DUR, 1)
      const eased   = rawT < 0.5
        ? 4 * rawT * rawT * rawT
        : 1 - Math.pow(-2 * rawT + 2, 3) / 2
      const target = Math.min(Math.floor(eased * _simTotal), _simTotal)
      const prev   = SIM.revealed
      while (SIM.revealed < target) {
        const snum = SIM.order[SIM.revealed]
        SIM.revealedArr[snum] = 1
        SIM.flashMap[snum]    = t
        SIM.revealed++
      }
      if (SIM.revealed > prev)
        document.getElementById('sim-progress').textContent =
          SIM.revealed.toLocaleString('es-AR')
    }
    // ── Detectar fin (separado del bloque anterior para que se evalúe siempre) ──
    if (SIM.revealed >= _simTotal && !SIM._done) {
      SIM._done = true
      SIM._settleStart = t   // arrancar efecto de asentamiento
      const fs = document.getElementById('sim-floating-status')
      if (fs) fs.classList.remove('counting')
      const lbl = document.getElementById('sim-floating-label')
      if (lbl) lbl.textContent = '✓ Votos revelados'
      setTimeout(() => {
        const footer = document.getElementById('sim-footer-bar')
        if (footer) footer.classList.add('show')
        const certBtn = document.getElementById('sim-cert-btn')
        if (certBtn && MY_SEAT > 0 && SIM.results && SIM.results[MY_SEAT]) {
          certBtn.style.display = 'flex'
        }
      }, 2200)  // esperar que termine el settle antes de mostrar footer
    }
  }
  // Progresión del efecto de asentamiento (verde/rojo → naranja)
  const SETTLE_DUR = 2000
  const settleT = SIM._settleStart ? Math.min((t - SIM._settleStart) / SETTLE_DUR, 1) : 0
  // ─────────────────────────────────────────────────────────────────────────

  simCtx.clearRect(0, 0, W, H)
  simCtx.fillStyle = '#1d1d1d'
  simCtx.fillRect(0, 0, W + 1, H + 1)

  // Pass 1: unrevealed dots — very dark, no glow
  simCtx.shadowBlur = 0
  SEATS.forEach(s => {
    if (SIM.revealedArr && SIM.revealedArr[s.num]) return
    const { x: sx, y: sy } = simToScreen(s.x, s.y)
    if (sx < -dotR || sx > W+dotR || sy < -dotR || sy > H+dotR) return
    simCtx.beginPath()
    simCtx.arc(sx, sy, dotR, 0, Math.PI * 2)
    simCtx.fillStyle = '#2e2e2e'
    simCtx.fill()
  })

  // Helper: fade-in suave desde el momento de revelación (efecto "luz que enciende")
  // ft = 0 justo al revelar, 1 cuando ya está completamente encendida (900ms)
  const FADE_MS = 900
  const _ft = snum => {
    const ts = SIM.flashMap?.[snum]
    if (!ts) return 1
    return Math.min((t - ts) / FADE_MS, 1)
  }
  // Easing suave: empieza rápido, termina lento (como una bombita que calienta)
  const _warmup = ft => ft < 0.5 ? 2*ft*ft : 1-(1-ft)*(1-ft)*2

  // Pass 2a: no votó — gris, se enciende suavemente
  simCtx.shadowBlur = 0
  SEATS.forEach(s => {
    if (!SIM.revealedArr || !SIM.revealedArr[s.num]) return
    if (SIM.results[s.num] !== null && SIM.results[s.num] !== undefined) return
    // También mostrar gris si votó pero no tenemos la dirección (modo real de privacidad)
    // → nunca llega aquí porque 'voted' ≠ null, cae en pass 2b
    const { x: sx, y: sy } = simToScreen(s.x, s.y)
    if (sx < -dotR || sx > W+dotR || sy < -dotR || sy > H+dotR) return
    const w = _warmup(_ft(s.num))
    simCtx.globalAlpha = 0.15 + w * 0.85
    simCtx.beginPath()
    simCtx.arc(sx, sy, dotR, 0, Math.PI * 2)
    simCtx.fillStyle = '#888888'
    simCtx.fill()
  })
  simCtx.globalAlpha = 1

  // Pass 2b: participó — tres fases:
  //   contando   → verde o rojo aleatorio (dramaticMap)
  //   asentando  → flicker rápido entre dramático y naranja (settleT 0→1)
  //   final      → naranja estable
  SEATS.forEach(s => {
    if (!SIM.revealedArr || !SIM.revealedArr[s.num]) return
    if (SIM.results[s.num] !== 'voted') return
    const { x: sx, y: sy } = simToScreen(s.x, s.y)
    if (sx < -dotR*8 || sx > W+dotR*8 || sy < -dotR*8 || sy > H+dotR*8) return
    const w     = _warmup(_ft(s.num))

    // Naranja directo — sin pasar por verde/rojo
    const r = 237, g = 100, b = 25
    const glowR = 247, glowG = 106, glowB = 30

    simCtx.shadowColor = `rgba(${glowR},${glowG},${glowB},0.5)`
    simCtx.shadowBlur  = dotR * 4 * w
    simCtx.globalAlpha = 0.2 + w * 0.8
    simCtx.beginPath()
    simCtx.arc(sx, sy, dotR, 0, Math.PI * 2)
    simCtx.fillStyle = `rgb(${r},${g},${b})`
    simCtx.fill()
    simCtx.shadowBlur = 0
  })
  simCtx.globalAlpha = 1

  // Pass 2c: abstención — ámbar (solo en modo simulación)
  SEATS.forEach(s => {
    if (!SIM.revealedArr || !SIM.revealedArr[s.num]) return
    if (SIM.results[s.num] !== 'abs') return
    const { x: sx, y: sy } = simToScreen(s.x, s.y)
    if (sx < -dotR*8 || sx > W+dotR*8 || sy < -dotR*8 || sy > H+dotR*8) return
    const w     = _warmup(_ft(s.num))
    simCtx.shadowColor = `rgba(250,204,21,${0.45 * w})`
    simCtx.shadowBlur  = dotR * 4 * w
    simCtx.globalAlpha = 0.2 + w * 0.8
    simCtx.beginPath()
    simCtx.arc(sx, sy, dotR, 0, Math.PI * 2)
    simCtx.fillStyle = `rgb(214,171,22)`
    simCtx.fill()
    simCtx.shadowBlur = 0
  })
  simCtx.globalAlpha = 1

  // Pass 3: SÍ — verde, glow nace suave y respira cuando está encendido
  SEATS.forEach(s => {
    if (!SIM.revealedArr || !SIM.revealedArr[s.num] || SIM.results[s.num] !== 'si') return
    const { x: sx, y: sy } = simToScreen(s.x, s.y)
    if (sx < -dotR*8 || sx > W+dotR*8 || sy < -dotR*8 || sy > H+dotR*8) return
    const w     = _warmup(_ft(s.num))
    const phase = (s.num * 1.7) % (Math.PI * 2)
    const pulse = (Math.sin(t / 700 + phase) + 1) / 2
    simCtx.shadowColor = `rgba(34,230,120,${(0.45 + pulse * 0.4) * w})`
    simCtx.shadowBlur  = dotR * (4 + pulse * 7) * w
    simCtx.globalAlpha = 0.2 + w * 0.8
    simCtx.beginPath()
    simCtx.arc(sx, sy, dotR * (1 + pulse * 0.18), 0, Math.PI * 2)
    simCtx.fillStyle = `rgb(${30 + Math.round(pulse*30)},${185 + Math.round(pulse*70)},${80 + Math.round(pulse*40)})`
    simCtx.fill()
    simCtx.shadowBlur = 0
  })
  simCtx.globalAlpha = 1

  // Pass 4: NO — rojo, mismo tratamiento suave
  SEATS.forEach(s => {
    if (!SIM.revealedArr || !SIM.revealedArr[s.num] || SIM.results[s.num] !== 'no') return
    const { x: sx, y: sy } = simToScreen(s.x, s.y)
    if (sx < -dotR*8 || sx > W+dotR*8 || sy < -dotR*8 || sy > H+dotR*8) return
    const w     = _warmup(_ft(s.num))
    const phase = (s.num * 2.1) % (Math.PI * 2)
    const pulse = (Math.sin(t / 650 + phase) + 1) / 2
    simCtx.shadowColor = `rgba(240,60,60,${(0.45 + pulse * 0.4) * w})`
    simCtx.shadowBlur  = dotR * (4 + pulse * 7) * w
    simCtx.globalAlpha = 0.2 + w * 0.8
    simCtx.beginPath()
    simCtx.arc(sx, sy, dotR * (1 + pulse * 0.18), 0, Math.PI * 2)
    simCtx.fillStyle = `rgb(${185 + Math.round(pulse*70)},${25 + Math.round(pulse*15)},${25 + Math.round(pulse*15)})`
    simCtx.fill()
    simCtx.shadowBlur = 0
  })
  simCtx.globalAlpha = 1

  if (SIM.active) requestAnimationFrame(simDraw)
}

function mostrarBannerGanador() {
  const cntSi  = SIM._realSi  ?? SIM.totalSi
  const cntNo  = SIM._realNo  ?? SIM.totalNo
  const cntAbs = SIM._realAbs ?? SIM.totalAbs
  // Denominador = solo votantes (si+no+abs), NO incluye ausentes
  const totalVotos = cntSi + cntNo + cntAbs
  const pctSi  = totalVotos > 0 ? ((cntSi  / totalVotos) * 100).toFixed(1) : '0.0'
  const pctNo  = totalVotos > 0 ? ((cntNo  / totalVotos) * 100).toFixed(1) : '0.0'
  const pctAbs = totalVotos > 0 ? ((cntAbs / totalVotos) * 100).toFixed(1) : '0.0'
  const ganaSi = cntSi > cntNo
  const empate = cntSi === cntNo && totalVotos > 0

  document.getElementById('sw-num-si').textContent = cntSi.toLocaleString('es-AR')
  document.getElementById('sw-num-no').textContent = cntNo.toLocaleString('es-AR')

  const numAbs = document.getElementById('sw-num-abs')
  if (numAbs) numAbs.textContent = cntAbs.toLocaleString('es-AR')

  const wl = document.getElementById('sw-winner-line')
  if (totalVotos === 0) {
    wl.textContent = 'Sin votos registrados'
    wl.style.color = '#888'
  } else if (empate) {
    wl.textContent = `Empate — ${pctSi}% SÍ · ${pctNo}% NO`
    wl.style.color = '#888'
  } else {
    wl.textContent = ganaSi
      ? `✓ Gana el SÍ con ${pctSi}%`
      : `✓ Gana el NO con ${pctNo}%`
    wl.style.color = ganaSi ? '#178a5b' : '#c41e1e'
  }
  wl.classList.remove('show')

  document.getElementById('sim-winner-banner').classList.add('show')

  setTimeout(() => {
    document.getElementById('sw-bar-si').style.width = pctSi + '%'
    document.getElementById('sw-bar-no').style.width = pctNo + '%'
    const barAbs = document.getElementById('sw-bar-abs')
    if (barAbs) barAbs.style.width = pctAbs + '%'
  }, 80)
  setTimeout(() => { wl.classList.add('show') }, 900)
}

function cerrarBanner() {
  document.getElementById('sim-winner-banner').classList.remove('show')
  document.getElementById('sw-bar-si').style.width = '0%'
  document.getElementById('sw-bar-no').style.width = '0%'
  const barAbs = document.getElementById('sw-bar-abs')
  if (barAbs) barAbs.style.width = '0%'
  // Change cancel button to "back to congress"
  const btn = document.getElementById('sim-cancel')
  btn.textContent = '← Volver al congreso'
  btn.onclick = terminarSimulacion
}

// ── CERTIFICATE ─────────────────────────────────────────────────────────────
// Preload logo pre-clipped as a circle so html2canvas captures it perfectly
let _certLogoB64 = null
;(function _preloadCertLogo() {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    const SIZE = 240  // output circle size in px
    const c = document.createElement('canvas')
    c.width = SIZE; c.height = SIZE
    const ctx = c.getContext('2d')
    // Clip to circle
    ctx.beginPath()
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2)
    ctx.closePath()
    ctx.clip()
    // Draw image centered & squared (crop to square first)
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    const sx = (img.naturalWidth  - side) / 2
    const sy = (img.naturalHeight - side) / 2
    ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE)
    _certLogoB64 = c.toDataURL('image/png')
    // Update img element if already in DOM
    const el = document.getElementById('cert-logo-img')
    if (el) el.src = _certLogoB64
  }
  img.src = 'logo-cabildo.jpg'
})()

function _generarCopy(voto, gana, empate) {
  if (voto === 'abs') {
    return `"La abstención también es una postura. Butaca <b>#${MY_SEAT}</b> estuvo presente y eligió el silencio — que habla más fuerte de lo que parece."`
  }
  if (empate) {
    return `"El hemiciclo quedó dividido. Pero la butaca <b>#${MY_SEAT}</b> estuvo ahí, y eso no se borra."`
  }
  const votoGano = (voto === 'si' && gana === 'si') || (voto === 'no' && gana === 'no')
  if (votoGano) {
    return `"Tu voz fue parte de la mayoría. La butaca <b>#${MY_SEAT}</b> habló — y Venezuela escuchó."`
  } else {
    return `"Tu voto no ganó esta vez. Pero la democracia vive porque voces como la de la butaca <b>#${MY_SEAT}</b> nunca se callan."`
  }
}

function abrirCertificado() {
  if (!MY_SEAT) return
  const voto = SIM.results ? SIM.results[MY_SEAT] : null
  if (!voto) { alert('No se encontró tu voto para esta votación.'); return }

  const cntSi  = SIM._realSi  || 0
  const cntNo  = SIM._realNo  || 0
  const cntAbs = SIM._realAbs || 0
  const total  = cntSi + cntNo + cntAbs
  const ganaSi = cntSi > cntNo
  const empate = cntSi === cntNo && total > 0
  const gana   = empate ? 'empate' : (ganaSi ? 'si' : 'no')
  const pctSi  = total > 0 ? ((cntSi  / total) * 100).toFixed(1) : '0.0'
  const pctNo  = total > 0 ? ((cntNo  / total) * 100).toFixed(1) : '0.0'
  const pctAbs = total > 0 ? ((cntAbs / total) * 100).toFixed(1) : '0.0'
  const participacion = TOTAL_SEATS > 0
    ? ((total / TOTAL_SEATS) * 100).toFixed(0) + '%'
    : '—'

  const pregunta = PREGUNTAS[qIdx] || ''
  const fecha = new Date().toLocaleDateString('es-AR', { day:'numeric', month:'short', year:'numeric' })
  const hash  = 'cert·' + Math.random().toString(36).slice(2,6) + '·' + MY_SEAT.toString(16).padStart(4,'0')

  // Logo: usar base64 si está disponible (garantiza captura en html2canvas)
  const logoEl = document.getElementById('cert-logo-img')
  if (logoEl && _certLogoB64) logoEl.src = _certLogoB64

  const votoLabels = { si:'SÍ', no:'NO', abs:'ABS' }
  const votoSubs   = { si:'A favor de la propuesta', no:'En contra de la propuesta', abs:'Se abstuvo de votar' }
  const winnerTxts = {
    si: `<b>Ganó el SÍ</b> con ${pctSi}%`,
    no: `<b>Ganó el NO</b> con ${pctNo}%`,
    empate: `<b>Empate</b> — ${pctSi}% SÍ · ${pctNo}% NO`
  }

  document.getElementById('cert-question-txt').textContent = pregunta
  const pill = document.getElementById('cert-pill')
  pill.textContent = votoLabels[voto] || voto.toUpperCase()
  pill.className = 'cert-pill ' + voto
  document.getElementById('cert-vote-sub').textContent = votoSubs[voto] || ''

  // Stats
  document.getElementById('cs-num-si').textContent  = cntSi.toLocaleString('es-AR')
  document.getElementById('cs-num-no').textContent  = cntNo.toLocaleString('es-AR')
  document.getElementById('cs-num-abs').textContent = cntAbs.toLocaleString('es-AR')
  document.getElementById('cs-pct-si').textContent  = pctSi + '%'
  document.getElementById('cs-pct-no').textContent  = pctNo + '%'
  document.getElementById('cs-pct-abs').textContent = pctAbs + '%'
  document.getElementById('cs-total-votos').textContent = total.toLocaleString('es-AR')
  document.getElementById('cs-winner-txt').innerHTML = winnerTxts[gana] || ''
  if (cntAbs === 0) document.getElementById('cs-row-abs').style.display = 'none'
  else document.getElementById('cs-row-abs').style.display = ''

  document.getElementById('cert-butaca').textContent = '#' + MY_SEAT
  document.getElementById('cert-participacion').textContent = participacion
  document.getElementById('cert-fecha').textContent = fecha
  document.getElementById('cert-copy').innerHTML = _generarCopy(voto, gana, empate)
  document.getElementById('cert-hash').textContent = hash

  document.getElementById('cert-overlay').classList.add('open')

  // Animar barras con pequeño delay
  setTimeout(() => {
    document.getElementById('cs-bar-si').style.width  = pctSi  + '%'
    document.getElementById('cs-bar-no').style.width  = pctNo  + '%'
    document.getElementById('cs-bar-abs').style.width = pctAbs + '%'
  }, 120)
}

function cerrarCertificado() {
  document.getElementById('cert-overlay').classList.remove('open')
}

async function _loadHtml2Canvas() {
  if (window.html2canvas) return
  await new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
    s.onload = res; s.onerror = rej
    document.head.appendChild(s)
  })
}

async function descargarCertImagen(ev) {
  const modal = document.getElementById('cert-modal')
  if (!modal) return
  const btn = ev.currentTarget
  const origHTML = btn.innerHTML
  btn.textContent = 'Generando…'; btn.disabled = true
  try {
    await _loadHtml2Canvas()
    const canvas = await html2canvas(modal, {
      scale: 3, useCORS: true, allowTaint: false,
      backgroundColor: '#ffffff', logging: false
    })
    const link = document.createElement('a')
    link.download = 'certificado-voto-cabildo.png'
    link.href = canvas.toDataURL('image/png')
    link.click()
  } catch(e) { console.error(e); alert('Error al generar imagen.') }
  btn.innerHTML = origHTML; btn.disabled = false
}

async function descargarCertPDF(ev) {
  const modal = document.getElementById('cert-modal')
  if (!modal) return
  const btn = ev.currentTarget
  const origHTML = btn.innerHTML
  btn.textContent = 'Generando…'; btn.disabled = true
  try {
    await _loadHtml2Canvas()
    if (!window.jspdf) {
      await new Promise((res, rej) => {
        const s = document.createElement('script')
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
        s.onload = res; s.onerror = rej
        document.head.appendChild(s)
      })
    }
    const canvas = await html2canvas(modal, {
      scale: 3, useCORS: true, allowTaint: false,
      backgroundColor: '#ffffff', logging: false
    })
    const imgData = canvas.toDataURL('image/png')
    const { jsPDF } = window.jspdf
    const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' })
    const pW = pdf.internal.pageSize.getWidth()
    const pH = pdf.internal.pageSize.getHeight()
    const iW = canvas.width / 3
    const iH = canvas.height / 3
    const ratio = Math.min(pW / iW, pH / iH) * 0.9
    const x = (pW - iW * ratio) / 2
    const y = (pH - iH * ratio) / 2
    pdf.addImage(imgData, 'PNG', x, y, iW * ratio, iH * ratio)
    pdf.save('certificado-voto-cabildo.pdf')
  } catch(e) { console.error(e); alert('Error al generar PDF.') }
  btn.innerHTML = origHTML; btn.disabled = false
}
// ────────────────────────────────────────────────────────────────────────────

function terminarSimulacion() {
  SIM.active = false
  clearInterval(SIM.ivId)
  document.getElementById('sim-overlay').classList.remove('open')
  document.getElementById('sim-winner-banner').classList.remove('show')
  document.getElementById('sw-bar-si').style.width = '0%'
  document.getElementById('sw-bar-no').style.width = '0%'
  const _barAbs = document.getElementById('sw-bar-abs')
  if (_barAbs) _barAbs.style.width = '0%'
  // Reset footer flotante
  const _footer = document.getElementById('sim-footer-bar')
  if (_footer) _footer.classList.remove('show')
  const _certBtn = document.getElementById('sim-cert-btn')
  if (_certBtn) _certBtn.style.display = 'none'
  cerrarCertificado()
}

function resizeSimCanvas() {
  const dpr = window.devicePixelRatio || 1
  simCSSW = window.innerWidth
  simCSSH = window.innerHeight
  simCanvas.width  = simCSSW * dpr
  simCanvas.height = simCSSH * dpr
  simCanvas.style.width  = simCSSW + 'px'
  simCanvas.style.height = simCSSH + 'px'
  simCtx.scale(dpr, dpr)
}
window.addEventListener('resize', () => {
  if (!SIM.active) return
  resizeSimCanvas()
  // Recompute camera on resize so nothing shifts
  const padX = (bx1 - bx0) * 0.05, padY = (by1 - by0) * 0.05
  const sc = Math.min(
    simCSSW / (bx1 - bx0 + padX * 2),
    simCSSH / (by1 - by0 + padY * 2)
  ) * 0.92
  SIM.camS = sc
})

// ══════════════════════════════════════════════════════════════
//  CITIZENS LIST
// ══════════════════════════════════════════════════════════════
let listRendered = false

function abrirCiudadanos() {
  if (!_requireButaca()) return
  hideCard()
  renderCitizensList()  // siempre re-renderizar para reflejar MY_SEAT actual
  document.getElementById('citizens-panel').classList.add('open')
}
function cerrarCiudadanos() {
  document.getElementById('citizens-panel').classList.remove('open')
}

function renderCitizensList() {
  const list = document.getElementById('cl-list')
  const rows = []

  // "Tu butaca" solo si el usuario tiene una (está verificado)
  if (MY_SEAT > 0) {
    rows.push(`<div class="cl-divider">Tu butaca</div>`)
    rows.push(clRow(MY_SEAT, true))
  }

  // Todos los ciudadanos verificados
  rows.push(`<div class="cl-divider">Todos los ciudadanos</div>`)
  for (let i = 1; i <= Math.min(TOTAL_SEATS, 200); i++) {
    if (i === MY_SEAT) continue
    rows.push(clRow(i, false))
  }
  if (TOTAL_SEATS === 0) {
    rows.push(`<div style="text-align:center;padding:24px;opacity:.4;font-size:13px">Aún no hay ciudadanos verificados</div>`)
  } else if (TOTAL_SEATS > 200) {
    rows.push(`<div class="cl-divider" style="padding-bottom:20px;opacity:.4">— mostrando 200 de ${TOTAL_SEATS.toLocaleString('es-VE').replace(',','.')} —</div>`)
  }

  list.innerHTML = rows.join('')
  listRendered = true
}

function clRow(num, isMe) {
  const p = getProfile(num)
  const badgeCls  = p.isAnon ? 'anon' : 'pub'
  const badgeTxt  = p.isAnon ? 'Anónimo' : 'Público'
  const followCls = followingConfirmed.has(num) ? 'following' : ''
  const followTxt = num === MY_SEAT ? 'Tu butaca'
    : followingConfirmed.has(num) ? 'Siguiendo'
    : followingPending.has(num)   ? 'Pendiente'
    : 'Seguir'
  const followDis = num === MY_SEAT ? 'style="opacity:.35;pointer-events:none"' : ''
  return `
  <div class="cl-item ${isMe ? 'cl-me' : ''}" id="cl-row-${num}">
    <div class="cl-av" style="background:${p.color}">${p.initials}</div>
    <div class="cl-info">
      <div class="cl-name">
        ${p.displayName}
        <span class="cl-badge-sm ${badgeCls}">${badgeTxt}</span>
      </div>
      <div class="cl-phrase">${p.phrase}</div>
      ${p.votes > 0 ? `<div class="cl-meta">${p.votes} votaciones</div>` : ''}
    </div>
    <div class="cl-num">#${num}</div>
    <button class="cl-follow-sm ${followCls}" ${followDis}
      onclick="toggleFollowList(${num}, this)">${followTxt}</button>
  </div>`
}

async function toggleFollowList(num, btn) {
  if (followingConfirmed.has(num) || followingPending.has(num)) {
    const { error } = await sb.from('follows')
      .delete().eq('from_seat', MY_SEAT).eq('to_seat', num)
    if (!error) {
      followingConfirmed.delete(num)
      followingPending.delete(num)
      btn.textContent = 'Seguir'
      btn.classList.remove('following')
      showToast(`Dejaste de seguir la butaca #${num}`)
      renderSocial('seguidos')
      // Sync profile card
      if (cardSeat === num) {
        const fbtn = document.getElementById('pc-follow-btn')
        if (fbtn) { fbtn.textContent = 'Seguir'; fbtn.className = 'pc-follow' }
      }
    }
  } else {
    btn.disabled = true
    const { error } = await sb.from('follows').insert({ from_seat: MY_SEAT, to_seat: num, status: 'pending' })
    btn.disabled = false
    if (!error) {
      followingPending.add(num)
      btn.textContent = 'Pendiente'
      btn.classList.add('following')
      showToast(`Solicitud enviada a butaca #${num}`)
      if (cardSeat === num) {
        const fbtn = document.getElementById('pc-follow-btn')
        if (fbtn) { fbtn.textContent = 'Pendiente'; fbtn.className = 'pc-follow disabled' }
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  CABILDO SELECTOR
// ══════════════════════════════════════════════════════════════
function mostrarSelectorCabildos() {
  showScreen('cabildo-selector')
  _startIntroAnim('cs-canvas')
  // Cargar conteo real de ciudadanos de Venezuela
  sb.rpc('get_butaca_count').then(({ data }) => {
    const el = document.getElementById('cs-ve-members')
    if (el && data) el.textContent = data + ' ciudadanos'
  }).catch(() => {})
}

// SVG del logo Venezuela (reutilizado en nav y en config preview)
const _CABILDO_LOGOS = {
  venezuela: `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
    <circle cx="100" cy="100" r="98" fill="#1a2b5e"/>
    <circle cx="100" cy="100" r="90" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="2" stroke-dasharray="3,4"/>
    <circle cx="100" cy="100" r="81" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="1"/>
    <g fill="white">
      <circle cx="100" cy="36" r="4.5"/><circle cx="115" cy="38" r="4.5"/><circle cx="129" cy="44" r="4.5"/>
      <circle cx="142" cy="53" r="4.5"/><circle cx="153" cy="65" r="4.5"/>
      <circle cx="85"  cy="38" r="4.5"/><circle cx="71"  cy="44" r="4.5"/>
      <circle cx="58"  cy="53" r="4.5"/><circle cx="47"  cy="65" r="4.5"/>
      <circle cx="100" cy="50" r="4"/><circle cx="113" cy="52" r="4"/><circle cx="125" cy="57" r="4"/>
      <circle cx="136" cy="65" r="4"/><circle cx="87"  cy="52" r="4"/>
      <circle cx="75"  cy="57" r="4"/><circle cx="64"  cy="65" r="4"/>
      <circle cx="100" cy="64" r="3.5"/><circle cx="111" cy="66" r="3.5"/><circle cx="121" cy="71" r="3.5"/>
      <circle cx="89"  cy="66" r="3.5"/><circle cx="79"  cy="71" r="3.5"/>
      <circle cx="100" cy="78" r="3"/><circle cx="109" cy="80" r="3"/><circle cx="91"  cy="80" r="3"/>
    </g>
    <circle cx="149" cy="73" r="5.5" fill="#3ecc6e"/>
    <text x="100" y="120" text-anchor="middle" font-size="24" font-weight="700" fill="white" font-family="sans-serif" letter-spacing="-0.5">Cabildo</text>
    <line x1="54" y1="128" x2="146" y2="128" stroke="rgba(255,255,255,.35)" stroke-width="1.2"/>
    <text x="100" y="138" text-anchor="middle" font-size="11" fill="rgba(255,255,255,.6)" font-family="sans-serif">de</text>
    <text x="100" y="162" text-anchor="middle" font-size="24" font-weight="700" fill="white" font-family="sans-serif" letter-spacing="-0.5">Venezuela</text>
    <text x="72" y="178" font-size="13" fill="rgba(255,255,255,.75)" font-family="sans-serif">★ ★ ★ ★ ★ ★ ★</text>
  </svg>`
}

function _aplicarMarcaCabildo(cabildoId) {
  const nombre  = localStorage.getItem('cabildoos_cb_nombre')  || 'Cabildo de Venezuela'
  const slogan  = localStorage.getItem('cabildoos_cb_slogan')  || 'Generación Independencia 2026'
  const logoSvg = _CABILDO_LOGOS[cabildoId] || _CABILDO_LOGOS['venezuela']

  // Nav: mostrar brand, ocultar logo genérico y pill de país
  document.getElementById('nav-logo-os').style.display  = 'none'
  document.getElementById('nav-vdiv-cong').style.display = 'none'
  document.getElementById('cong-sel').style.display     = 'none'

  const brand = document.getElementById('nav-cabildo-brand')
  brand.classList.add('visible')
  document.getElementById('nav-cb-logo-wrap').innerHTML = logoSvg
  document.getElementById('nav-cb-name').textContent    = nombre
  document.getElementById('nav-cb-slogan').textContent  = slogan

}

function _resetearMarcaCabildo() {
  document.getElementById('nav-logo-os').style.display   = ''
  document.getElementById('nav-vdiv-cong').style.display = ''
  document.getElementById('cong-sel').style.display      = ''
  document.getElementById('nav-cabildo-brand').classList.remove('visible')
}


function entrarCabildo(id) {
  if (id === 'venezuela') {
    localStorage.setItem('cabildoos_cabildo', 'venezuela')
    // Limpiar cualquier inline pointer-events que haya quedado de la verificación
    const mc = document.getElementById('map-controls')
    if (mc) mc.style.pointerEvents = ''
    const cng = document.getElementById('congress')
    if (cng) cng.style.pointerEvents = ''
    _stopIntroAnim()
    showScreen('congress')
    _aplicarMarcaCabildo(id)
    resizeCanvas()
    cargarConteoReal()
    cargarPreguntasActivas()
    if (MY_SEAT_POS) resetCamera()
    _actualizarBtnButaca()
  }
}

// ══════════════════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'))
  document.getElementById(id).classList.add('active')
  document.body.classList.toggle('on-landing',          id === 'landing')
  document.body.classList.toggle('on-congress',         id === 'congress')
  document.body.classList.toggle('on-intro',            id === 'intro')
  document.body.classList.toggle('on-verify-onboard',   id === 'verify-onboard')
  document.body.classList.toggle('on-cabildo-selector', id === 'cabildo-selector')
  // Collapse panel when leaving landing
  if (id !== 'landing') {
    cerrarSocialPanel()
  }
  // Intro animation lifecycle
  if (id === 'intro') _startIntroAnim('intro-canvas', true)
  else if (id === 'verify-onboard') _startIntroAnim('vo-canvas', true)
  else _stopIntroAnim()

}

// ══════════════════════════════════════════════════════════════
//  VERIFY IDENTITY FLOW
// ══════════════════════════════════════════════════════════════
let vpCurrentStep = 1
let vpAnonBlob = null  // blob de la imagen anonimizada generada localmente

// ══════════════════════════════════════════════════════════════
//  AUTH — REGISTRO / LOGIN
// ══════════════════════════════════════════════════════════════

let _authUser = null     // usuario logueado actual
let _betaActive = false  // si el código beta es requerido para registrarse
let _authProfile = null  // perfil (alias, butaca_numero, verification_id, …)

// ── Observer mode helpers ──────────────────────────────────────────────────────
// El MASTER y los OBSERVADORES entran al cabildo sin butaca ni verificación.
// Solo pueden ver; no pueden votar, debatir ni hacer preguntas.
function _isMaster() {
  return _authUser?.app_metadata?.is_master === true
      && _authUser?.email === 'notagencydev@gmail.com'
}
function _isObserver() {
  return _authUser?.app_metadata?.role === 'observer'
}
// Modo observador: master O usuario invitado como observador
function _isObserverMode() {
  return _isMaster() || _isObserver()
}

// Detectar flujo de recovery — soporta implicit flow (hash) y PKCE (query string)
let _isPasswordRecovery = (
  new URLSearchParams(window.location.hash.replace(/^#/, '')).get('type') === 'recovery' ||
  new URLSearchParams(window.location.search).get('type') === 'recovery'
)

// Cargar estado beta antes de auth para que el form de registro ya lo refleje
_loadBetaActive()

// Inicializar auth al cargar
;(async () => {
  // onAuthStateChange para eventos posteriores (login, logout, cambio de pestaña)
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      _isPasswordRecovery = true
      showScreen('congress')
      setTimeout(() => abrirAuth('reset'), 80)
      return
    }
    if (event === 'SIGNED_OUT') { _isPasswordRecovery = false; _onLogout(); return }
    if (_isPasswordRecovery) return
    if (event === 'SIGNED_IN' && session?.user) await _onLogin(session.user)
    if (event === 'TOKEN_REFRESHED') {
      if (!session?.user) {
        // Refresh falló — usuario eliminado o sesión revocada
        await sb.auth.signOut().catch(() => {})
        showScreen('intro')
        return
      }
      if (!_authUser) await _onLogin(session.user)
    }
  })

  // getUser() valida server-side — detecta usuarios eliminados por el admin
  // (getSession() usa solo el JWT local y no detecta si el user fue borrado)
  try {
    if (_isPasswordRecovery) { showScreen('congress'); return }
    const { data: { user }, error } = await sb.auth.getUser()
    if (error || !user) {
      // Token inválido o user eliminado → limpiar sesión local
      await sb.auth.signOut().catch(() => {})
      _onLogout()
    } else {
      await _onLogin(user)
    }
  } catch(e) {
    console.error('[auth] init error:', e)
    try { await sb.auth.signOut().catch(() => {}); _onLogout() } catch(_) {}
  }
})()

async function _onLogin(user) {
  _authUser = user
  window._MY_ROLE = user?.user_metadata?.role || ''
  document.body.classList.remove('observer-mode')

  localStorage.removeItem('cabildoos_butaca')
  localStorage.removeItem('cabildoos_vid')
  MY_SEAT = 0

  showScreen('congress')
  resizeCanvas()

  // ── Nav: actualizar ANTES de cualquier await para que nunca aparezca "Crear cuenta" ──
  const _emailName = user.email?.split('@')[0] || 'Usuario'
  document.getElementById('nav-creat-btn')?.style.setProperty('display', 'none')
  document.getElementById('nav-upill-wrap')?.style.setProperty('display', 'flex')
  document.getElementById('nav-user-divider')?.style.setProperty('display', 'block')
  document.getElementById('nav-upill-alias')  && (document.getElementById('nav-upill-alias').textContent  = _emailName)
  document.getElementById('nav-umenu-alias')  && (document.getElementById('nav-umenu-alias').textContent  = _emailName)
  document.getElementById('nav-upill-av')     && (document.getElementById('nav-upill-av').textContent     = _emailName.charAt(0).toUpperCase())
  document.getElementById('btn-auth-nav')?.style.setProperty('display', 'none')
  const navInfo = document.getElementById('nav-user-info')
  if (navInfo) navInfo.style.display = 'flex'

  // ── Ahora sí: cargar perfil async ──────────────────────────────────────────
  const [{ data: profile, error: profileErr }, { data: seatRows }] = await Promise.all([
    sb.from('profiles').select('*').eq('id', user.id).single(),
    sb.rpc('get_my_seat_identity'),
  ])
  // Mezclar datos de seat_identities (alias, phrase, visibilidad) en el perfil
  if (profile && seatRows && seatRows[0]) {
    const si = seatRows[0]
    profile.alias      = si.alias
    profile.phrase     = si.phrase
    profile.show_alias = si.show_alias
    profile.show_phrase= si.show_phrase
    profile.show_votes = si.show_votes
    profile.is_public  = si.is_public
  }

  // ── Si no hay perfil, verificar que el usuario aún existe en el servidor ───
  // Caso: admin borró el usuario pero el JWT local todavía era válido en esta pestaña
  if (!profile && !profileErr?.message?.includes('No rows')) {
    // Error inesperado — dejar pasar
  } else if (!profile) {
    const isGoogleNew = (user.app_metadata?.provider === 'google' || user.identities?.some(i => i.provider === 'google'))
    if (!isGoogleNew) {
      // No es usuario nuevo de Google — validar que la cuenta existe en el servidor
      const { error: userErr } = await sb.auth.getUser()
      if (userErr) {
        // El usuario fue eliminado — cerrar sesión y mandar al intro
        await sb.auth.signOut().catch(() => {})
        showScreen('intro')
        return
      }
    }
  }

  // ── Usuario Google sin alias → pedir alias antes de continuar ──────────────
  const isGoogleUser = user.app_metadata?.provider === 'google' ||
    user.identities?.some(i => i.provider === 'google')
  if (isGoogleUser && !profile?.alias) {
    _mostrarModalAliasGoogle(user)
    return
  }

  // ── Acceso revocado: cerrar sesión inmediatamente ──────────────────────────
  if (user.app_metadata?.role === 'revoked') {
    await sb.auth.signOut()
    showScreen('intro')
    return
  }

  // ── Observer: experiencia de solo lectura, sin flujo de verificación ────────
  if (_isObserver()) {
    document.body.classList.add('observer-mode', 'invited-observer')
    // Nav: mostrar pill con "Observador" (no "Crear cuenta")
    document.getElementById('nav-creat-btn')?.style.setProperty('display', 'none')
    document.getElementById('nav-upill-wrap')?.style.setProperty('display', 'flex', 'important')
    document.getElementById('nav-user-divider')?.style.setProperty('display', 'block', 'important')
    voActualizarAlias('Observador')
    await cargarConteoReal()
    initProfilesRealtime()  // detectar si el admin borra este observador
    return
  }

  // ── Verificar estado de cuenta ──────────────────────────────────────────────
  if (profile?.status === 'suspended') {
    await sb.auth.signOut()
    showScreen('intro')
    setTimeout(() => {
      document.getElementById('reg-msg') && (document.getElementById('reg-msg').textContent = '')
      document.getElementById('login-msg').textContent = 'Tu cuenta está suspendida. Contactá al equipo de Cabildo de Venezuela.'
      document.getElementById('login-msg').className = 'auth-msg err'
      authSetTab('login')
      document.getElementById('auth-overlay').classList.add('open')
    }, 300)
    return
  }
  if (profile?.status === 'banned') {
    await sb.auth.signOut()
    showScreen('intro')
    setTimeout(() => {
      document.getElementById('login-msg').textContent = 'Tu acceso está permanentemente bloqueado. No podés ingresar a Cabildo de Venezuela.'
      document.getElementById('login-msg').className = 'auth-msg err'
      authSetTab('login')
      document.getElementById('auth-overlay').classList.add('open')
    }, 300)
    return
  }

  _authProfile = profile
  _visibilidad.alias  = !!profile?.show_alias
  _visibilidad.phrase = !!profile?.show_phrase
  perfilPublico = _visibilidad.alias || _visibilidad.phrase

  // Actualizar nav con nombre real (alias) si está disponible
  const displayName = profile?.alias || _emailName
  document.getElementById('nav-upill-alias')  && (document.getElementById('nav-upill-alias').textContent  = displayName)
  document.getElementById('nav-umenu-alias')  && (document.getElementById('nav-umenu-alias').textContent  = displayName)
  document.getElementById('nav-upill-av')     && (document.getElementById('nav-upill-av').textContent     = displayName.charAt(0).toUpperCase())
  document.getElementById('nav-user-alias')   && (document.getElementById('nav-user-alias').textContent   = displayName)

  // Badge de verificación en el dropdown
  const ddBadge = document.getElementById('nav-dd-status-badge')
  const ddButaca = document.getElementById('nav-dd-butaca')

  if (profile?.verification_id) {
    localStorage.setItem('cabildoos_vid', profile.verification_id)
    if (ddBadge) { ddBadge.textContent = 'Verificado'; ddBadge.className = 'nav-dd-verified' }
  } else {
    // Recovery: si hay un verification_id guardado localmente, intentar linkearlo
    // (puede que el submit ocurrió antes de que claim_seat se llamara en el submit)
    const localVid = localStorage.getItem('cabildoos_vid')
    if (localVid) {
      try {
        await sb.rpc('claim_seat', { p_verification_id: localVid })
        // Verificar si claim_seat asignó butaca (sin leer profiles.butaca_numero)
        const { data: seatNum } = await sb.rpc('get_my_seat')
        if (seatNum) {
          window.location.reload()
          return
        }
      } catch(e) { console.warn('claim_seat recovery:', e) }
    }
    const { data: req } = await sb.from('verification_requests')
      .select('status').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).single()
    if (ddBadge) {
      ddBadge.textContent = req?.status === 'pending' ? 'En revisión' : 'Sin verificar'
      ddBadge.className = 'nav-dd-pending'
    }
    if (ddButaca) ddButaca.textContent = ''
  }

  // Obtener butaca via get_my_seat() — sin leer profiles.butaca_numero
  // El número de butaca vive en seat_identities, keyed por HMAC del user_id.
  // profiles NO contiene la butaca: rompe el link email → butaca en la BD.
  let _seatNum = 0
  try {
    const { data: myS } = await sb.rpc('get_my_seat')
    _seatNum = myS || 0
  } catch(_) {}

  if (_seatNum > 0) {
    MY_SEAT = _seatNum
    localStorage.setItem('cabildoos_butaca', _seatNum)
    if (ddButaca) ddButaca.textContent = '· Butaca #' + _seatNum
    cargarPerfilesPublicos().then(() => {
      buildSeats()
      if (MY_SEAT_POS) resetCamera()
    })
    vpAplicarButacaEnUI(_seatNum)
    // Mostrar action buttons, grupo separador y social buttons
    const actBtns = document.getElementById('nav-action-btns')
    if (actBtns) actBtns.style.display = 'flex'
    const grpSep = document.getElementById('nav-group-sep')
    if (grpSep) grpSep.style.display = 'block'
    const socBtns = document.getElementById('nav-social-btns')
    if (socBtns) socBtns.style.display = 'flex'
    const seatLbl = document.getElementById('nav-seat-lbl')
    if (seatLbl) seatLbl.textContent = '#' + _seatNum
    const butacaInfo = document.getElementById('nav-umenu-butaca')
    if (butacaInfo) butacaInfo.textContent = 'Butaca #' + _seatNum
    voActualizarAlias(displayName)
    _actualizarBtnButaca()
    _refreshMyVoteCount()
    _loadFollows()
    _loadUnreadMessages()
    initMessagesRealtime()
    _loadNotifications()
    initNotificationsRealtime()
    initProfilesRealtime()  // reiniciar con token autenticado para capturar DELETE en profiles
    _checkProposalConsent()
    _syncBugFab()
    const _cabildo = localStorage.getItem('cabildoos_cabildo')
    if (_cabildo) {
      entrarCabildo(_cabildo)
    } else {
      mostrarSelectorCabildos()
    }
  } else {
    // ── Modo observador: master o usuario invitado como observer ──────────
    if (_isObserverMode()) {
      voActualizarAlias(_isMaster() ? 'Master' : (displayName || 'Observador'))
      mostrarSelectorCabildos()
      return
    }
    // ── Usuario normal sin butaca → flujo de verificación ─────────────────
    document.getElementById('st-noident').style.display = 'flex'
    document.getElementById('st-ident').style.display   = 'none'
    const lbl = document.getElementById('st-noident-label')
    if (lbl) lbl.textContent = 'Verificar identidad'
    // MY_SEAT y localStorage ya se limpiaron al inicio de _onLogin (MY_SEAT=0)
    voActualizarAlias(displayName)
    _actualizarBtnButaca()  // "↵ Crear butaca"
    // Breve delay para que el usuario vea el hemiciclo un momento
    setTimeout(() => showScreen('verify-onboard'), 2200)
  }
}

function _onLogout() {
  _authUser = null
  _authProfile = null
  document.body.classList.add('observer-mode')
  // Legacy landing nav
  const btnAuthNav = document.getElementById('btn-auth-nav')
  if (btnAuthNav) btnAuthNav.style.display = 'block'
  const navUserInfo = document.getElementById('nav-user-info')
  if (navUserInfo) navUserInfo.style.display = 'none'
  const stNoident = document.getElementById('st-noident')
  if (stNoident) stNoident.style.display = 'flex'
  const stIdent = document.getElementById('st-ident')
  if (stIdent) stIdent.style.display = 'none'
  const lbl = document.getElementById('st-noident-label')
  if (lbl) lbl.textContent = 'Crear cuenta'
  // Congress nav — nuevo UI
  const creatBtn = document.getElementById('nav-creat-btn')
  if (creatBtn) creatBtn.style.display = 'block'
  const upillWrap = document.getElementById('nav-upill-wrap')
  if (upillWrap) upillWrap.style.display = 'none'
  const udiv = document.getElementById('nav-user-divider')
  if (udiv) udiv.style.display = 'none'
  const actBtns = document.getElementById('nav-action-btns')
  if (actBtns) actBtns.style.display = 'none'
  const grpSep2 = document.getElementById('nav-group-sep')
  if (grpSep2) grpSep2.style.display = 'none'
  const socBtns2 = document.getElementById('nav-social-btns')
  if (socBtns2) socBtns2.style.display = 'none'
  // Ocultar social footer
  document.getElementById('social-footer')?.classList.remove('visible')
  // Limpiar caché de butaca — previene que el próximo usuario herede el seat
  localStorage.removeItem('cabildoos_butaca')
  localStorage.removeItem('cabildoos_vid')
  MY_SEAT = 0
  _syncBugFab()
  // Volver a la pantalla intro
  showScreen('intro')
}

// ── Congress nav — dropdown de congresos ──
function toggleCongDD() {
  const dd = document.getElementById('cong-dd')
  if (!dd) return
  dd.classList.toggle('open')
  if (dd.classList.contains('open')) {
    setTimeout(() => document.addEventListener('click', _closeCongDD, { once: true }), 0)
  }
}
function _closeCongDD(e) {
  if (!document.getElementById('cong-sel')?.contains(e.target)) {
    document.getElementById('cong-dd')?.classList.remove('open')
  }
}

// ── Congress nav — user pill ──
function toggleUserPill() {
  const menu = document.getElementById('nav-umenu')
  if (!menu) return
  menu.classList.toggle('open')
  if (menu.classList.contains('open')) {
    setTimeout(() => document.addEventListener('click', _closeUserPillOutside, { once: true }), 0)
  }
}
function closeUserPill() {
  document.getElementById('nav-umenu')?.classList.remove('open')
}
function _closeUserPillOutside(e) {
  if (!document.getElementById('nav-upill-btn')?.contains(e.target)) closeUserPill()
}

// ── Nav dropdown ──
function toggleNavDropdown() {
  const btn = document.getElementById('nav-user-btn')
  const dd  = document.getElementById('nav-dropdown')
  const open = dd.classList.toggle('open')
  btn.classList.toggle('open', open)
  if (open) {
    // Cerrar al clic fuera
    setTimeout(() => document.addEventListener('click', _closeNavDropdownOutside, { once: true }), 0)
  }
}
function _closeNavDropdownOutside(e) {
  if (!document.getElementById('nav-user-btn')?.contains(e.target)) cerrarNavDropdown()
}
function cerrarNavDropdown() {
  document.getElementById('nav-dropdown')?.classList.remove('open')
  document.getElementById('nav-user-btn')?.classList.remove('open')
}

// ── Ir al congreso desde landing ──
function irACongreso() { irAlCongreso() }  // alias
function irAlCongreso() {
  showScreen('congress')
  if (typeof cargarPreguntasActivas === 'function') cargarPreguntasActivas()
  if (typeof initHemiciclo === 'function') initHemiciclo()
  if (typeof _updatePqBadge === 'function') _updatePqBadge()
}

// ── Abrir / cerrar modal ──
// ── Beta code: cargar estado y aplicar al form ────────────────
async function _loadBetaActive() {
  try {
    const { data } = await sb.from('system_config')
      .select('value').eq('key', 'beta_active').single()
    _betaActive = data?.value === true || data?.value === 'true'
  } catch(e) { _betaActive = false }
  _applyBetaCodeField()
}

function _applyBetaCodeField() {
  const wrap = document.getElementById('reg-code-wrap')
  if (!wrap) return
  wrap.style.display = _betaActive ? '' : 'none'
  // Si no se requiere código, limpiar el campo para que no interfiera
  if (!_betaActive) {
    const inp = document.getElementById('reg-code')
    if (inp) inp.value = ''
  }
  authCheckRegistro()
}

function abrirAuth(tab = 'registro') {
  authSetTab(tab)
  document.getElementById('auth-overlay').classList.add('open')
  if (tab === 'registro') _applyBetaCodeField()
}
function cerrarAuth() {
  document.getElementById('auth-overlay').classList.remove('open')
}

// ── Google OAuth ──────────────────────────────────────────────────────────────
async function loginConGoogle() {
  const redirectTo = window.location.origin + window.location.pathname
  await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo }
  })
}

// ── Modal alias para usuarios nuevos de Google ────────────────────────────────
let _googleAliasUser = null

function _mostrarModalAliasGoogle(user) {
  _googleAliasUser = user
  // Precargar avatar de Google si está disponible
  const avatarUrl = user.user_metadata?.avatar_url
  const avatarEl  = document.getElementById('gam-avatar')
  if (avatarUrl && avatarEl) {
    avatarEl.innerHTML = `<img src="${avatarUrl}" alt="avatar">`
  } else if (avatarEl) {
    const name = user.user_metadata?.full_name || user.email || 'G'
    avatarEl.textContent = name.charAt(0).toUpperCase()
  }
  // Pre-llenar con nombre de Google sanitizado
  const googleName = (user.user_metadata?.full_name || user.user_metadata?.name || '')
    .toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 30)
  const input = document.getElementById('gam-alias-input')
  if (input) { input.value = googleName; gamCheckAlias() }
  document.getElementById('google-alias-overlay').classList.add('open')
}

function gamCheckAlias() {
  const val   = document.getElementById('gam-alias-input').value.trim()
  const btn   = document.getElementById('gam-btn')
  const hint  = document.getElementById('gam-alias-hint')
  const valid = /^[a-z0-9_]{3,30}$/.test(val)
  btn.disabled = !valid
  if (!val) { hint.textContent = ''; hint.className = 'auth-field-hint'; return }
  if (valid) { hint.textContent = '✓ Alias válido'; hint.className = 'auth-field-hint ok' }
  else       { hint.textContent = 'Solo letras minúsculas, números y _. Mínimo 3 caracteres.'; hint.className = 'auth-field-hint err' }
}

async function guardarAliasGoogle() {
  const alias = document.getElementById('gam-alias-input').value.trim().toLowerCase()
  const btn   = document.getElementById('gam-btn')
  const msg   = document.getElementById('gam-msg')
  if (!_googleAliasUser) return

  btn.disabled = true; btn.textContent = 'Guardando…'; msg.textContent = ''

  // Verificar alias único via RPC (alias vive en seat_identities, no en profiles)
  const { data: available } = await sb.rpc('check_alias_available', { p_alias: alias })
  if (available === false) {
    msg.textContent = 'Ese alias ya está en uso, elegí otro.'
    msg.className = 'auth-msg err'
    btn.disabled = false; btn.textContent = 'Confirmar alias →'
    return
  }

  // Upsert perfil básico (sin alias ni butaca — esos viven en seat_identities)
  const { error } = await sb.from('profiles').upsert({
    id: _googleAliasUser.id,
    email: _googleAliasUser.email,
    status: 'sin_verificar'
  }, { onConflict: 'id' })

  if (error) {
    msg.textContent = 'Error al guardar: ' + error.message
    msg.className = 'auth-msg err'
    btn.disabled = false; btn.textContent = 'Confirmar alias →'
    return
  }

  document.getElementById('google-alias-overlay').classList.remove('open')
  // Continuar flujo normal
  await _onLogin(_googleAliasUser)
}

// ── Modal "Revisá tu email" post-registro ─────────────────────────────────────
function mostrarEmailSent(email) {
  document.getElementById('esm-email-addr').textContent = email

  // Detectar proveedor para botón directo
  const domain = email.split('@')[1]?.toLowerCase() || ''
  let url = 'https://mail.google.com'
  if (domain.includes('gmail'))       url = 'https://mail.google.com'
  else if (domain.includes('outlook') || domain.includes('hotmail') || domain.includes('live') || domain.includes('msn'))
    url = 'https://outlook.live.com/mail/inbox'
  else if (domain.includes('yahoo'))  url = 'https://mail.yahoo.com'
  else if (domain.includes('icloud') || domain.includes('me.com') || domain.includes('mac.com'))
    url = 'https://www.icloud.com/mail'
  else url = `https://${domain}`

  document.getElementById('esm-open-btn').href = url
  document.getElementById('email-sent-overlay').classList.add('open')
}
function cerrarEmailSent() {
  document.getElementById('email-sent-overlay').classList.remove('open')
}
function authSetTab(tab) {
  const hideTabs = tab === 'reset' || tab === 'forgot' || tab === 'confirm'
  document.getElementById('auth-form-registro').style.display = tab === 'registro' ? '' : 'none'
  document.getElementById('auth-form-login').style.display    = tab === 'login'    ? '' : 'none'
  document.getElementById('auth-form-reset').style.display    = tab === 'reset'    ? '' : 'none'
  document.getElementById('auth-form-forgot').style.display   = tab === 'forgot'   ? '' : 'none'
  document.getElementById('tab-registro').classList.toggle('active', tab === 'registro')
  document.getElementById('tab-login').classList.toggle('active', tab === 'login')
  document.querySelector('.auth-tabs').style.display = hideTabs ? 'none' : ''
  if (tab === 'reset') {
    document.getElementById('reset-pass').value = ''
    document.getElementById('reset-pass2').value = ''
    document.getElementById('reset-btn').disabled = true
    document.getElementById('reset-msg').textContent = ''
  }
  if (tab === 'forgot') {
    document.getElementById('forgot-email').value = ''
    document.getElementById('forgot-btn').disabled = true
    document.getElementById('forgot-msg').textContent = ''
  }
}

// ── Reset de contraseña ──
function authCheckReset() {
  const pass  = document.getElementById('reset-pass').value
  const pass2 = document.getElementById('reset-pass2').value
  const hint1 = document.getElementById('reset-pass-hint')
  const hint2 = document.getElementById('reset-pass2-hint')
  const btn   = document.getElementById('reset-btn')

  const ok1 = pass.length >= 8
  hint1.textContent = ok1 ? '✓' : (pass ? 'Mínimo 8 caracteres' : '')
  hint1.className = 'auth-field-hint ' + (ok1 ? 'ok' : (pass ? 'err' : ''))

  const ok2 = pass === pass2 && pass2.length > 0
  hint2.textContent = ok2 ? '✓ Coinciden' : (pass2 ? '✗ No coinciden' : '')
  hint2.className = 'auth-field-hint ' + (ok2 ? 'ok' : (pass2 ? 'err' : ''))

  btn.disabled = !(ok1 && ok2)
}

async function cambiarContrasena() {
  const pass = document.getElementById('reset-pass').value
  const btn  = document.getElementById('reset-btn')
  const msg  = document.getElementById('reset-msg')
  btn.disabled = true
  msg.textContent = 'Guardando...'
  msg.className = 'auth-msg'

  const { error } = await sb.auth.updateUser({ password: pass })
  if (error) {
    msg.textContent = 'Error: ' + error.message
    msg.className = 'auth-msg err'
    btn.disabled = false
    return
  }
  msg.textContent = '✓ Contraseña actualizada. Ingresando...'
  msg.className = 'auth-msg ok'
  history.replaceState(null, '', window.location.pathname)
  _isPasswordRecovery = false
  setTimeout(async () => {
    cerrarAuth()
    // El usuario ya tiene sesión activa — hacer login normal
    const { data: { session } } = await sb.auth.getSession()
    if (session?.user) await _onLogin(session.user)
  }, 1400)
}

// ── Toggle visibilidad de contraseña ────────────────────────────────────────
const _eyeOpen  = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
const _eyeClosed = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`

function togglePassVis(inputId, btn) {
  const input = document.getElementById(inputId)
  if (!input) return
  const showing = input.type === 'text'
  input.type = showing ? 'password' : 'text'
  btn.innerHTML = showing ? _eyeOpen : _eyeClosed
  btn.style.color = showing ? '' : 'rgba(247,106,30,.8)'
}

// ── Validaciones en tiempo real ──
function authCheckRegistro() {
  const alias = document.getElementById('reg-alias').value.trim()
  const email = document.getElementById('reg-email').value.trim()
  const pass  = document.getElementById('reg-pass').value
  const hint  = document.getElementById('reg-alias-hint')

  const aliasOk = /^[a-z0-9_]{3,30}$/.test(alias)
  if (alias && !aliasOk) {
    hint.textContent = 'Solo minúsculas, números y _ (3-30 caracteres)'
    hint.className = 'auth-field-hint err'
  } else if (alias && aliasOk) {
    hint.textContent = '✓'
    hint.className = 'auth-field-hint ok'
  } else {
    hint.textContent = ''
    hint.className = 'auth-field-hint'
  }

  const code = document.getElementById('reg-code')?.value.trim()
  const codeOk = !_betaActive || (code?.length >= 4)
  const ok = aliasOk && email.includes('@') && pass.length >= 8 && codeOk
  document.getElementById('reg-btn').disabled = !ok
}

function authCheckLogin() {
  const email = document.getElementById('login-email').value.trim()
  const pass  = document.getElementById('login-pass').value
  document.getElementById('login-btn').disabled = !(email.includes('@') && pass.length >= 6)
}

// ── Registro ──
async function registrarse() {
  const alias = sanitizeInput(document.getElementById('reg-alias').value).toLowerCase()
  const email = document.getElementById('reg-email').value.trim()
  const pass  = document.getElementById('reg-pass').value
  const btn   = document.getElementById('reg-btn')
  const msg   = document.getElementById('reg-msg')

  const code = document.getElementById('reg-code')?.value.trim() || ''

  // Verificar si el email está prohibido
  const { data: isBanned } = await sb.rpc('check_email_banned', { p_email: email })
  if (isBanned) {
    msg.textContent = 'Este email no puede registrarse en Cabildo de Venezuela.'
    msg.className = 'auth-msg err'
    return
  }

  // Validar código de acceso beta solo si está activo
  if (_betaActive) {
    const { data: codeOk, error: codeErr } = await sb.rpc('validate_beta_code', { p_code: code })
    if (codeErr || !codeOk) {
      msg.textContent = 'Código de acceso incorrecto. Solicitalo al equipo de Cabildo de Venezuela.'
      msg.className = 'auth-msg err'
      return
    }
  }

  // Verificar alias único via RPC (alias vive en seat_identities, no en profiles)
  const { data: aliasOk } = await sb.rpc('check_alias_available', { p_alias: alias })
  if (aliasOk === false) {
    msg.textContent = 'Ese alias ya está en uso, elegí otro.'
    msg.className = 'auth-msg err'
    return
  }

  btn.disabled = true
  btn.textContent = 'Creando cuenta…'
  msg.textContent = ''

  const _regOrigin = window.location.origin
  const _regRedirect = (_regOrigin && _regOrigin.startsWith('http'))
    ? _regOrigin + window.location.pathname
    : undefined

  const { data, error } = await sb.auth.signUp({
    email,
    password: pass,
    options: {
      data: { alias },
      ...(  _regRedirect ? { emailRedirectTo: _regRedirect } : {})
    }
  })

  if (error) {
    const msg422 = error.message?.toLowerCase() || ''
    const isExisting = msg422.includes('already registered') || msg422.includes('user already')
    const isDisabled = msg422.includes('signup') || msg422.includes('not allowed') || msg422.includes('disabled')
    if (isExisting) {
      msg.innerHTML = 'Ese email ya tiene una cuenta. <button type="button" onclick="authSetTab(\'login\')" style="background:none;border:none;color:#f97316;font-weight:700;cursor:pointer;font-size:inherit;padding:0;text-decoration:underline">Iniciar sesión →</button>'
    } else if (isDisabled) {
      msg.textContent = 'Los registros están temporalmente cerrados. Contactá al equipo de Cabildo de Venezuela.'
    } else {
      msg.textContent = error.message
    }
    msg.className = 'auth-msg err'
    btn.disabled = false
    btn.textContent = 'Crear usuario →'
    return
  }

  // Supabase v2: email existente devuelve identities:[] en vez de error
  if (!data.user) {
    msg.textContent = 'Error al crear la cuenta. Intentá de nuevo.'
    msg.className = 'auth-msg err'
    btn.disabled = false
    btn.textContent = 'Crear usuario →'
    return
  }
  // Si identities está vacío puede ser cuenta existente O email pendiente de confirmación
  if (data.user.identities && data.user.identities.length === 0 && data.user.email_confirmed_at) {
    msg.innerHTML = 'Ese email ya tiene una cuenta. <button type="button" onclick="authSetTab(\'login\')" style="background:none;border:none;color:#f97316;font-weight:700;cursor:pointer;font-size:inherit;padding:0;text-decoration:underline">Iniciar sesión →</button>'
    msg.className = 'auth-msg err'
    btn.disabled = false
    btn.textContent = 'Crear usuario →'
    return
  }

  btn.textContent = 'Crear usuario →'
  btn.disabled = false

  if (data.user?.email_confirmed_at) {
    // Supabase tiene email confirmation desactivado — sesión inmediata
    setTimeout(() => cerrarAuth(), 800)
  } else {
    // Confirmación por email requerida — mostrar modal
    cerrarAuth()
    mostrarEmailSent(email)
  }
}

// ── Login ──
async function iniciarSesion() {
  const email = document.getElementById('login-email').value.trim()
  const pass  = document.getElementById('login-pass').value
  const btn   = document.getElementById('login-btn')
  const msg   = document.getElementById('login-msg')

  btn.disabled = true
  btn.textContent = 'Entrando…'
  msg.textContent = ''

  const { error } = await sb.auth.signInWithPassword({ email, password: pass })

  if (error) {
    msg.textContent = 'Email o contraseña incorrectos.'
    msg.className = 'auth-msg err'
    btn.disabled = false
    btn.textContent = 'Entrar →'
    return
  }

  cerrarAuth()
}

// ── Recuperar contraseña ──
function authCheckForgot() {
  const email = document.getElementById('forgot-email').value.trim()
  document.getElementById('forgot-btn').disabled = !email.includes('@')
}

async function enviarResetEmail() {
  const email = document.getElementById('forgot-email').value.trim()
  const btn   = document.getElementById('forgot-btn')
  const msg   = document.getElementById('forgot-msg')
  btn.disabled = true
  btn.textContent = 'Enviando…'
  msg.textContent = ''

  // Construir redirectTo solo si estamos en http/https (no file://)
  const origin = window.location.origin
  const redirectOpts = (origin && origin.startsWith('http'))
    ? { redirectTo: origin + window.location.pathname }
    : {}

  const { error } = await sb.auth.resetPasswordForEmail(email, redirectOpts)

  btn.textContent = 'Enviar link →'
  if (error) {
    msg.textContent = 'Error: ' + (error.message || 'No se pudo enviar. Revisá el email.')
    msg.className = 'auth-msg err'
    btn.disabled = false
  } else {
    msg.innerHTML = `
      <span style="display:block;margin-bottom:4px">✓ Email enviado a <strong>${email}</strong></span>
      <span style="font-size:12px;opacity:.8">Revisá tu bandeja de entrada y la carpeta de spam. El link expira en 1 hora.</span>`
    msg.className = 'auth-msg ok'
  }
}

// ── Cerrar sesión ──
async function cerrarSesion() {
  // Limpiar el overlay de verificación si estaba abierto (inline style pointer-events)
  try { cerrarVerificacion() } catch(e) {}
  // Restaurar map-controls por si quedó bloqueado
  const mc = document.getElementById('map-controls')
  if (mc) mc.style.pointerEvents = ''
  const cng = document.getElementById('congress')
  if (cng) cng.style.pointerEvents = ''
  localStorage.removeItem('cabildoos_cabildo')
  _myVoteCount = null
  followingConfirmed.clear(); followingPending.clear()
  followersConfirmed.clear(); _pendingRequestsToMe = []
  _unreadConvos = {}
  _clearNotifications()
  if (_votesPollingInterval) { clearInterval(_votesPollingInterval); _votesPollingInterval = null }
  const badge = document.getElementById('nav-notif-badge')
  if (badge) badge.style.display = 'none'
  _resetearMarcaCabildo()
  await sb.auth.signOut()
}

// ══════════════════════════════════════════════════════════════
//  LECTOR PDF417 — BarcodeDetector API nativa (Chrome/Android)
//  + html5-qrcode como fallback (Firefox/Safari)
//  BarcodeDetector usa el mismo motor que los bancos y Apple Pay
// ══════════════════════════════════════════════════════════════

let h5QrLoaded    = false
let vpQrScanner   = null
let vpBarcodeData = null   // datos extraídos del código de barras

async function cargarHtml5QrCode() {
  if (h5QrLoaded) return
  await new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js'
    s.onload = () => { h5QrLoaded = true; res() }
    s.onerror = rej
    document.head.appendChild(s)
  })
}

// Parser del PDF417 del DNI argentino — cubre todas las variantes RENAPER
// Formato estándar: @APELLIDO@NOMBRE@@SEXO@NUMERO@EJEMPLAR@DDMMYYYY@DDMMYYYY@CUIL@
// Variantes: con puntos en DNI (30.368.193), año ≤ 2025, campo combinado, sin @ inicial
function parsearCodigoBarraDNI(texto) {
  if (!texto) return { apellido:'', nombre:'', numDoc:'', fechaNac:'' }

  const partes = texto.split('@').map(p => p.trim())
  let apellido = '', nombre = '', numDoc = '', fechaNac = ''

  for (const parte of partes) {
    if (!parte) continue

    // DNI sin puntos: 7-8 dígitos exactos
    if (/^\d{7,8}$/.test(parte) && !numDoc) {
      numDoc = parte; continue
    }

    // DNI con puntos: 30.368.193 o 9.368.193
    if (/^\d{1,2}\.\d{3}\.\d{3}$/.test(parte) && !numDoc) {
      numDoc = parte.replace(/\./g, ''); continue
    }

    // Fecha DDMMYYYY: 8 dígitos, año 1900–2025
    if (/^\d{8}$/.test(parte) && !fechaNac) {
      const dd = +parte.slice(0,2), mm = +parte.slice(2,4), yyyy = +parte.slice(4,8)
      if (yyyy >= 1900 && yyyy <= 2025 && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        fechaNac = `${parte.slice(4,8)}-${parte.slice(2,4)}-${parte.slice(0,2)}`; continue
      }
    }

    // Sexo, ejemplar, CUIL/tramite: skip
    if (parte === 'M' || parte === 'F') continue
    if (/^[A-C]$/.test(parte)) continue
    if (/^\d{9,}$/.test(parte)) continue
    // CUIL con guiones: 20-12345678-9
    if (/^\d{2}-\d{7,8}-\d$/.test(parte)) continue

    // Texto: nombre o apellido
    if (/^[A-ZÁÉÍÓÚÜÑ\s'-]+$/i.test(parte) && parte.length > 2) {
      if (!apellido) { apellido = parte; continue }
      if (!nombre)   { nombre   = parte; continue }
    }
  }

  // ── Fallback por regex sobre el texto completo (si @ no alcanzó) ──
  if (!numDoc) {
    // DNI con puntos embebido en el texto
    const m1 = texto.match(/\b(\d{2})\.(\d{3})\.(\d{3})\b/)
    if (m1) numDoc = m1[1] + m1[2] + m1[3]
    else {
      const m2 = texto.match(/\b(\d{7,8})\b/)
      if (m2) numDoc = m2[1]
    }
  }
  if (!fechaNac) {
    // Buscar DDMMYYYY en cualquier parte del texto
    const m = texto.match(/\b(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(19\d{2}|20[01]\d|202[0-5])\b/)
    if (m) fechaNac = `${m[3]}-${m[2]}-${m[1]}`
  }

  return { apellido, nombre, numDoc, fechaNac }
}

function vpMostrarBarcodeMsg(msg, color = 'var(--mid)') {
  const el = document.getElementById('vp-barcode-msg')
  if (el) { el.textContent = msg; el.style.color = color }
}

function vpMostrarDebugRaw(texto, formato) {
  const panel = document.getElementById('vp-debug-raw')
  const pre   = document.getElementById('vp-debug-raw-text')
  if (!panel || !pre) return
  // Mostrar con @ reemplazados por "·@·" para que sea legible
  const visible = texto
    .replace(/\r\n/g, '↵').replace(/\n/g, '↵').replace(/\r/g, '↵')
    .replace(/@/g, ' @ ')
    .trim()
  pre.textContent = `[${formato}] "${visible}"`
  panel.style.display = 'block'
}

let vpBarcodeScanTimer = null

// ══════════════════════════════════════════════════════════════════════════════
//  CONFIGURACIÓN BACKEND
// ══════════════════════════════════════════════════════════════════════════════

// Cambiar a la URL de Render una vez deployado
// const VP_API_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
//   ? 'http://localhost:8000'
//   : 'https://cabildoos-api.onrender.com'  // Render deploy

const VP_API_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:8787'
  : 'https://verify.cabildodevenezuela.com'  // Cloudflare verification-worker


function uuidv4() {
  if (self.crypto?.randomUUID) return self.crypto.randomUUID();
  const b = self.crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

// ID único de sesión — vincula todas las fotos de este usuario
let vpVerificationId = generateUUID();

// Datos extraídos del documento por Gemini (para el submit final)
let vpGeminiResult = null
// Bounding box de la foto del DNI detectada por Gemini — {x1,y1,x2,y2} en fracciones
let vpFaceBox = null

// ─────────────────────────────────────────────────────────────────────────────
//  PASO 2: FOTO DEL DOCUMENTO — getUserMedia + Gemini Vision
// ─────────────────────────────────────────────────────────────────────────────

let vpTipoDoc2 = 'DNI_AR'  // tipo activo
let vpZbarLoaded = false

// ══════════════════════════════════════════════════════════════════════════════
//  PASO 2 — DOCUMENTO (getUserMedia, sin galería)
// ══════════════════════════════════════════════════════════════════════════════

let vpDocScanTimer = null   // BarcodeDetector live scan interval
let vpDocDetector  = null   // instancia reutilizable de BarcodeDetector

function vpDocMsg(txt, color) {
  const el = document.getElementById('vp-doc-msg')
  if (el) { el.textContent = txt; el.style.color = color || 'var(--mid)' }
}

async function vpDocIniciar() {
  // Reset UI
  document.getElementById('vp-doc-preview').style.display    = 'none'
  document.getElementById('vp-doc-pre').style.display        = ''
  document.getElementById('vp-barcode-result').style.display = 'none'
  document.getElementById('vp-doc-sin-datos').style.display  = 'none'
  document.getElementById('vp-doc-analizando').style.display = 'none'
  document.getElementById('vp-debug-raw').style.display      = 'none'
  document.getElementById('vp-doc-scanline').style.display   = ''
  document.getElementById('vp-doc-ok-overlay').style.display = 'none'
  vpDocMsg('Iniciando cámara…')

  // Abrir cámara trasera (sin file picker)
  try {
    await vpAbrirCamara('cam-doc-video', 'environment')
    // Esperar que el video realmente tenga frames (evita capturar pantalla negra)
    const vid = document.getElementById('cam-doc-video')
    await new Promise(res => {
      if (vid.videoWidth > 0) { res(); return }
      vid.addEventListener('loadeddata', res, { once: true })
      setTimeout(res, 3000) // máximo 3 segundos de espera
    })
    vpDocMsg('Mostrá el frente del documento completo')
  } catch(e) {
    vpDocMsg('Sin acceso a cámara — verificá los permisos', '#f59e0b')
    return
  }

  // Iniciar BarcodeDetector en vivo si disponible
  if ('BarcodeDetector' in window) {
    try {
      const allFmts = await BarcodeDetector.getSupportedFormats()
      // Solo formatos 2D que pueden contener datos personales completos
      // Los 1D (code128, code39, itf, etc.) solo tienen el número de legajo — inútiles
      const DOC_2D = ['pdf417', 'qr_code', 'data_matrix', 'aztec']
      const docFmts = DOC_2D.filter(f => allFmts.includes(f))
      vpDocDetector = new BarcodeDetector({ formats: docFmts.length ? docFmts : allFmts })
      vpDocScanTimer = setInterval(vpDocScanFrame, 300)
    } catch(_) {}
  }
}

// Longitud mínima para que un rawValue sea "datos reales" (no solo un número de legajo)
const VP_MIN_BARCODE_LEN = 20

async function vpDocScanFrame() {
  const vid = document.getElementById('cam-doc-video')
  if (!vid || !vid.videoWidth || !vpDocDetector) return
  try {
    const codes = await vpDocDetector.detect(vid)
    for (const c of codes) {
      const raw = c.rawValue && c.rawValue.trim()
      // Ignorar barcodes cortos (números sueltos, código de barras 1D del legajo)
      if (!raw || raw.length < VP_MIN_BARCODE_LEN) continue
      clearInterval(vpDocScanTimer); vpDocScanTimer = null
      vpDocMsg('✓ Código detectado', '#22c55e')
      if (navigator.vibrate) navigator.vibrate(80)
      vpDocCapturarFrame(raw)
      return
    }
  } catch(_) {}
}

// Captura manual (botón) o auto-captura con rawValue ya conocido
async function vpDocCapturar(rawValueConocido) {
  if (vpDocScanTimer) { clearInterval(vpDocScanTimer); vpDocScanTimer = null }
  await vpDocCapturarFrame(rawValueConocido || null)
}

async function vpDocCapturarFrame(_unused) {
  const vid = document.getElementById('cam-doc-video')
  if (!vid || !vid.videoWidth) { showToast('Esperá que la cámara esté lista'); return }

  // Capturar frame a canvas
  const canvas = document.createElement('canvas')
  canvas.width = vid.videoWidth; canvas.height = vid.videoHeight
  canvas.getContext('2d').drawImage(vid, 0, 0)

  // Detener cámara (ya tenemos la foto)
  vpPararCamara()
  document.getElementById('vp-doc-scanline').style.display = 'none'
  document.getElementById('vp-doc-pre').style.display      = 'none'

  // Mostrar preview
  const preview = document.getElementById('vp-doc-preview')
  preview.src = canvas.toDataURL('image/jpeg', 0.92)
  preview.style.display = 'block'

  // Guardar blob
  canvas.toBlob(blob => { vpCapturedDoc = blob }, 'image/jpeg', 0.92)

  // ── Llamar al backend (Gemini Vision) ──────────────────────────────────────
  document.getElementById('vp-doc-analizando').style.display = ''
  document.getElementById('vp-doc-decode-msg').textContent   = 'Analizando con sistema VaV…'
  vpDocMsg('Enviando al servidor…')

  try {
    const b64 = canvas.toDataURL('image/jpeg', 0.92).split(',')[1]

    // Datos del paso 1
    const nombre    = (document.getElementById('vp-nombre')?.value    || '').trim()
    const apellido  = (document.getElementById('vp-apellido')?.value  || '').trim()
    const numDoc    = (document.getElementById('vp-num-doc')?.value   || '').trim()
    const pais      = (document.getElementById('vp-pais')?.value      || '').trim()
    const fechaNac  = (document.getElementById('vp-fecha-nac')?.value || '').trim()

    const docCtrl = new AbortController()
    const docTimeout = setTimeout(() => docCtrl.abort(), 45000)

    const resp = await fetch(`${VP_API_URL}/verify/documento`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: docCtrl.signal,
      body: JSON.stringify({
        verification_id:      vpVerificationId,
        image_b64:            b64,
        tipo_doc:             vpTipoDoc2,
        nombre_declarado:     nombre,
        apellido_declarado:   apellido,
        numero_declarado:     numDoc,
        pais_declarado:       pais,
        fecha_nac_declarada:  fechaNac,
        // Incluir user_id y email para que assign_butaca pueda linkear el profile
        // aunque claim_seat falle por error de red
        user_id:       _authUser?.id || null,
        contact_email: _authUser?.email || null,
      }),
    })
    clearTimeout(docTimeout)

    document.getElementById('vp-doc-analizando').style.display = 'none'

    if (resp.status === 409) {
      vpDocMsg('Este documento ya fue usado para verificar otra cuenta', '#ef4444')
      document.getElementById('vp-doc-sin-datos').style.display = ''
      document.getElementById('vp-doc-sin-datos').querySelector('p').textContent =
        'Cada documento de identidad solo puede usarse una vez en CabildoOS.'
      return
    }
    if (!resp.ok) {
      const detail = await resp.json().catch(() => ({}))
      throw new Error(`${resp.status}: ${detail.detail || resp.statusText}`)
    }

    const data = await resp.json()
    vpGeminiResult = data.extracted
    vpFaceBox = data.face_box || null   // coordenadas exactas de la foto del DNI
    vpMostrarResultadoGemini(data)

  } catch (err) {
    document.getElementById('vp-doc-analizando').style.display = 'none'
    console.error('[vpDocCapturarFrame]', err)
    const msg = err.name === 'AbortError'
      ? 'Tiempo agotado (45s) — intentá de nuevo'
      : `Error: ${err.message}`
    vpDocMsg(msg, '#ef4444')
    document.getElementById('vp-doc-sin-datos').style.display = ''
  }
}

function vpMostrarResultadoGemini(data) {
  const ext = data.extracted || {}

  const paisDeclarado = (document.getElementById('vp-pais')?.value || '').trim()

  // Validación de país — bloqueante si declararon país
  // Override: ciertos tipos de doc implican un país con certeza (DNI_AR → Argentina).
  // Si Gemini no pudo leer pais_emisor (holograma/reflejo), no bloqueamos si el tipo
  // de doc y el país declarado coinciden — Gemini no es la fuente de verdad en ese caso.
  const _vpNormStr = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  const _vpDocPaisMap = { 'DNI_AR': 'argentina', 'LICENCIA': 'argentina', 'CEDULA_VE': 'venezuela' }
  const _vpPaisImplicado = _vpDocPaisMap[vpTipoDoc2] || ''
  const _vpDocImplicaPais = _vpPaisImplicado && _vpNormStr(paisDeclarado) === _vpPaisImplicado
  const _vpPaisOk = !paisDeclarado || ext.pais_coincide || _vpDocImplicaPais
  if (!_vpPaisOk) {
    vpDocMsg('Nacionalidad incorrecta', '#ef4444')
    const panel = document.getElementById('vp-doc-sin-datos')
    panel.style.display = ''
    panel.querySelector('div').textContent = 'El documento no coincide con el país declarado'
    panel.querySelector('p').textContent =
      `Declaraste "${paisDeclarado}" pero el documento es de ${ext.pais_emisor || 'otro país'}. Solo podés verificarte con un documento del país que declarás.`
    const btnContinuar = panel.querySelector('.vp-btn-main')
    if (btnContinuar) btnContinuar.style.display = 'none'
    return
  }

  // Campos obligatorios — todos deben estar presentes
  const faltantes = []
  if (!ext.nombre_completo)   faltantes.push('nombre')
  if (!ext.numero_documento)  faltantes.push('número de documento')
  if (!ext.fecha_nacimiento)  faltantes.push('fecha de nacimiento')
  if (!ext.es_documento_real) faltantes.push('documento físico válido')
  if (!ext.nombre_coincide)   faltantes.push('nombre coincidente con lo declarado')
  if (!ext.numero_coincide)   faltantes.push('número coincidente con lo declarado')
  if (!ext.fecha_coincide)    faltantes.push('fecha de nacimiento coincidente con lo declarado')

  if (faltantes.length > 0) {
    vpDocMsg('No se pudieron leer todos los datos', '#ef4444')
    const panel = document.getElementById('vp-doc-sin-datos')
    panel.style.display = ''
    panel.querySelector('div').textContent = 'Foto insuficiente — reintentá'
    panel.querySelector('p').textContent =
      `Faltó detectar: ${faltantes.join(', ')}. Mejor iluminación, sin reflejos, documento completo en cuadro.`
    if (ext.observaciones) {
      const obs = document.createElement('p')
      obs.style.cssText = 'color:var(--mid);font-size:11px;margin:4px 0 0;font-style:italic'
      obs.textContent = ext.observaciones
      panel.appendChild(obs)
    }
    const btnContinuar = panel.querySelector('.vp-btn-main')
    if (btnContinuar) btnContinuar.style.display = 'none'
    return
  }

  // Todo OK — mostrar confirmación
  const panel = document.getElementById('vp-barcode-result')
  const fields = document.getElementById('vp-barcode-fields')
  panel.style.display = ''

  fields.innerHTML = [
    `<div><span style="color:var(--mid);font-size:11px">NOMBRE</span><br><b>${ext.nombre_completo}</b></div>`,
    `<div><span style="color:var(--mid);font-size:11px">NÚMERO</span><br><b>${ext.numero_documento}</b></div>`,
    `<div><span style="color:var(--mid);font-size:11px">NACIMIENTO</span><br><b>${ext.fecha_nacimiento}</b></div>`,
    ext.pais_emisor ? `<div><span style="color:var(--mid);font-size:11px">PAÍS</span><br><b>${ext.pais_emisor}</b></div>` : '',
    `<div style="margin-top:8px;color:#22c55e;font-size:12px">✓ Todos los datos verificados — avanzando…</div>`,
  ].join('')

  // Mostrar contador y dejar que el usuario confirme manualmente
  const cnt = document.createElement('p')
  cnt.style.cssText = 'text-align:center;font-size:11px;color:var(--mid);margin:8px 0 0'
  cnt.textContent = vpReintentoDoc > 0 ? `Intento ${vpReintentoDoc + 1} de ${VP_MAX_REINTENTOS}` : ''
  panel.appendChild(cnt)
}

function vpDocReintentar() {
  vpReintentoDoc++
  if (vpReintentoDoc >= VP_MAX_REINTENTOS) { vpReiniciarTodo(); return }
  document.getElementById('vp-barcode-result').style.display = 'none'
  document.getElementById('vp-doc-sin-datos').style.display  = 'none'
  document.getElementById('vp-debug-raw').style.display      = 'none'
  document.getElementById('vp-doc-preview').style.display    = 'none'
  const btnContinuar = document.querySelector('#vp-doc-sin-datos .vp-btn-main')
  if (btnContinuar) btnContinuar.style.display = ''
  vpBarcodeData = null
  vpGeminiResult = null
  vpFaceBox = null
  vpDocIniciar()
}

// ══════════════════════════════════════════════════════════════════════════════
//  PASO 3 — LIVENESS (instrucción aleatoria anti-foto-estática)
// ══════════════════════════════════════════════════════════════════════════════

const VP_LIVENESS = [
  { emoji: '😉', texto: 'Guiñá un ojo' },
  { emoji: '😁', texto: 'Sonreí bien amplio' },
  { emoji: '😮', texto: 'Abrí la boca' },
  { emoji: '✌️', texto: 'Mostrá dos dedos' },
]
let vpLivenessInstruccion = null

// ── Contadores de reintentos (max 3 por paso) ─────────────────────────────────
let vpReintentoDoc      = 0
let vpReintentoSelfie   = 0
let vpReintentoSelfieDoc = 0
const VP_MAX_REINTENTOS = 3

function vpReiniciarTodo() {
  vpPararCamara()
  clearInterval(_vpPollingTimer)
  vpReintentoDoc = 0
  vpReintentoSelfie = 0
  vpReintentoSelfieDoc = 0
  vpBarcodeData = null
  vpGeminiResult = null
  vpFaceBox = null
  vpCapturedSelfie = null
  vpCapturedSelfieDoc = null
  vpAnonBlob = null
  vpVerificationId = crypto.randomUUID()
  vpShowStep(1)
  showToast('Demasiados intentos — reiniciando desde el principio')
}

// ── Chip de tipo de documento ──────────────────────────────────────────────────

function vpDocChip(tipo) {
  vpTipoDoc2 = tipo
  document.querySelectorAll('.vp-chip').forEach(c => c.classList.remove('active'))
  const chip = document.getElementById('vp-chip-' + tipo)
  if (chip) chip.classList.add('active')
  // Actualizar label del botón según tipo
  const labels = {
    DNI_AR:    'Fotografiar DNI (frente)',
    PASAPORTE: 'Fotografiar página de datos',
    CEDULA_VE: 'Fotografiar cédula (frente)',
    LICENCIA:  'Fotografiar licencia (frente)'
  }
  const lbl = document.getElementById('vp-doc-foto-label')
  if (lbl) lbl.textContent = labels[tipo] || 'Fotografiar documento'
}

// ── Foto tomada: decodificar y mostrar resultado ───────────────────────────────

async function vpDocFotoTomada(input) {
  const file = input.files?.[0]
  if (!file) return
  try { input.value = '' } catch(_) {}

  vpCapturedDoc = file

  // Mostrar preview
  const img  = document.getElementById('vp-doc-img')
  const wrap = document.getElementById('vp-doc-preview-wrap')
  img.src = URL.createObjectURL(file)
  wrap.style.display = ''

  // Mostrar overlay de análisis
  const overlay = document.getElementById('vp-doc-decode-overlay')
  const msgEl   = document.getElementById('vp-doc-decode-msg')
  overlay.style.display = 'flex'
  msgEl.textContent = 'Leyendo datos…'

  // Ocultar resultados anteriores
  document.getElementById('vp-barcode-result').style.display  = 'none'
  document.getElementById('vp-doc-sin-datos').style.display   = 'none'
  document.getElementById('vp-debug-raw').style.display       = 'none'

  // Decodificar
  const res = await vpDecodificarImagen(file, msgEl)
  overlay.style.display = 'none'

  if (res && res.texto) {
    vpMostrarDebugRaw(res.texto, res.formato)
    vpProcesarCodigoBarras(res.texto)
  } else {
    // No se pudo leer — el verificador revisará la foto
    document.getElementById('vp-doc-sin-datos').style.display = ''
  }
}

// ── Motor de decodificación ────────────────────────────────────────────────────
// Cadena: BarcodeDetector → ZBar WASM → html5-qrcode (ZXing)

async function vpDecodificarImagen(file, msgEl) {
  const msg = txt => { if (msgEl) msgEl.textContent = txt }
  try {
    // 1. BarcodeDetector nativo (Chrome Desktop, Android, macOS)
    if ('BarcodeDetector' in window) {
      msg('Leyendo código de barras…')
      try {
        const formatos = await BarcodeDetector.getSupportedFormats()
        const detector = new BarcodeDetector({ formats: formatos })
        const bitmap   = await createImageBitmap(file)
        const codes    = await detector.detect(bitmap)
        bitmap.close()
        for (const c of codes) {
          if (c.rawValue && c.rawValue.trim())
            return { texto: c.rawValue, formato: 'BarcodeDetector/' + c.format }
        }
        // Barcode detectado pero rawValue vacío: crop y reintento
        if (codes.length > 0) {
          const { x, y, width: w, height: h } = codes[0].boundingBox
          try {
            const bmp2 = await createImageBitmap(file)
            const PAD  = 0.08
            const crop = await createImageBitmap(bmp2,
              Math.max(0, x - w*PAD), Math.max(0, y - h*PAD),
              w*(1+2*PAD), h*(1+2*PAD),
              { resizeWidth: Math.min(w*4, 3000), resizeHeight: Math.min(h*4, 1500) })
            bmp2.close()
            const codes2 = await detector.detect(crop)
            crop.close()
            for (const c of codes2) {
              if (c.rawValue && c.rawValue.trim())
                return { texto: c.rawValue, formato: 'BarcodeDetector/crop' }
            }
          } catch(_) {}
        }
      } catch(_) {}
    }

    // 2. ZBar WASM (mejor soporte PDF417)
    msg('Probando ZBar…')
    try {
      const r = await decodificarConZBar(file)
      if (r) return { texto: r.value, formato: 'ZBar/' + r.type }
    } catch(_) {}

    // 3. html5-qrcode / ZXing (fallback Firefox / Safari)
    msg('Probando ZXing…')
    try {
      await cargarHtml5QrCode()
      if (!document.getElementById('vp-decode-hidden')) {
        const d = document.createElement('div')
        d.id = 'vp-decode-hidden'
        d.style.cssText = 'display:none;position:absolute;width:1px;height:1px'
        document.body.appendChild(d)
      }
      const scanner = new Html5Qrcode('vp-decode-hidden', { verbose: false })
      const result  = await scanner.scanFile(file, false)
      if (result && result.trim()) return { texto: result, formato: 'ZXing' }
    } catch(e) {
      const s = String(e)
      if (!s.includes('No MultiFormat') && !s.includes('NotFoundException') && !s.includes('No QR code'))
        console.warn('[ZXing]', e)
    }

    return null
  } catch(err) {
    console.error('[vpDecodificarImagen]', err)
    return null
  }
}

// ── ZBar WASM ──────────────────────────────────────────────────────────────────

async function cargarZBar() {
  if (vpZbarLoaded) return
  await new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/@undecaf/zbar-wasm@0.10.1/dist/main.js'
    s.onload = () => { vpZbarLoaded = true; res() }
    s.onerror = rej
    document.head.appendChild(s)
  })
}

async function decodificarConZBar(file) {
  await cargarZBar()
  const zbar = window.zbarWasm
  if (!zbar) return null
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width; canvas.height = bitmap.height
  canvas.getContext('2d').drawImage(bitmap, 0, 0)
  bitmap.close()
  const imageData = ctx => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
  const symbols = await zbar.scanImageData(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height))
  if (!symbols || symbols.length === 0) return null
  const pdf417 = symbols.find(s => s.typeName === 'PDF417' || s.type === 'PDF417') || symbols[0]
  return { value: pdf417.decode ? pdf417.decode() : pdf417.data, type: pdf417.typeName || pdf417.type }
}

// ── Parser MRZ ICAO 9303 ──────────────────────────────────────────────────────

function parsearMRZ(mrz) {
  const lines = mrz.trim().split('\n').map(l => l.trim())
  if (lines.length < 2) {
    const s = lines[0] || ''
    if (s.length >= 44) { lines[0] = s.slice(0, 44); lines[1] = s.slice(44, 88) }
    else return null
  }
  const l1 = lines[0].padEnd(44, '<')
  const l2 = lines[1].padEnd(44, '<')
  const decode = s => s.replace(/</g, ' ').trim()
  const decodeDate = s => {
    if (!/^\d{6}$/.test(s)) return ''
    const yy = +s.slice(0,2), mm = s.slice(2,4), dd = s.slice(4,6)
    return `${yy > 30 ? 1900+yy : 2000+yy}-${mm}-${dd}`
  }
  const nameField = l1.slice(5)
  const sep = nameField.indexOf('<<')
  const apellido = sep >= 0 ? decode(nameField.slice(0, sep)) : ''
  const nombre   = sep >= 0 ? decode(nameField.slice(sep+2).replace(/</g,' ')) : ''
  return {
    apellido, nombre,
    numDoc:   decode(l2.slice(0,9)).replace(/</g,''),
    fechaNac: decodeDate(l2.slice(13,19)),
    sexo:     l2[20] === 'F' ? 'F' : l2[20] === 'M' ? 'M' : '',
    pais:     l2.slice(10,13)
  }
}

// ── Continuar sin datos de barcode ────────────────────────────────────────────

function vpSaltarBarcode() {
  vpBarcodeData = { manual: true }
  vpGoStep(3)
}

async function vpIniciarBarcodeScanner() {
  vpPararBarcodeScanner()
  vpBarcodeData = null
  vpCapturedDoc = null

  const resDiv     = document.getElementById('vp-barcode-result')
  const fallbackEl = document.getElementById('vp-scan-fallback')
  const scanLine   = document.getElementById('vp-scan-line')
  if (resDiv)     resDiv.style.display     = 'none'
  if (fallbackEl) fallbackEl.style.display = 'none'
  if (scanLine)   scanLine.style.display   = 'none'

  vpMostrarBarcodeMsg('Abriendo cámara...')

  // Abrir cámara
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    })
    vpCameraStream = stream
    const video = document.getElementById('cam-doc-video')
    video.srcObject = stream
    await video.play().catch(() => {})
  } catch(e) {
    vpMostrarBarcodeMsg(`Sin acceso a cámara: ${e.message}`, '#ef4444')
    if (fallbackEl) fallbackEl.style.display = 'block'
    return
  }

  const video = document.getElementById('cam-doc-video')
  if (scanLine) scanLine.style.display = 'block'

  // En mobile mostramos "Tomar foto" de inmediato — la cámara nativa da mucha mejor calidad
  // que el streaming. En desktop damos 8s para que el BarcodeDetector lo intente.
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  if (isMobile) {
    if (fallbackEl) fallbackEl.style.display = 'block'
    vpMostrarBarcodeMsg('Apuntá al código o tomá una foto del documento ↓')
  } else {
    vpScannerTimeout = setTimeout(() => {
      if (fallbackEl) fallbackEl.style.display = 'block'
      vpMostrarBarcodeMsg('¿No se detecta el código? Tomá una foto manual ↓', '#f59e0b')
    }, 8000)
  }

  // ── Estrategia 1: BarcodeDetector nativa (Chrome, Edge, Android)
  //    Mismo motor que Apple Pay / Google Pay / apps bancarias
  if ('BarcodeDetector' in window) {
    let detector
    try {
      const fmt = await BarcodeDetector.getSupportedFormats()
      const pedidos = ['pdf417','qr_code','data_matrix','code_128','aztec'].filter(f => fmt.includes(f))
      detector = new BarcodeDetector({ formats: pedidos.length ? pedidos : fmt })
    } catch(e) {
      detector = new BarcodeDetector()
    }

    vpMostrarBarcodeMsg('Apuntá el frente del DNI — el código está en la esquina inferior derecha')

    let busy = false, dots = 0
    vpBarcodeScanTimer = setInterval(async () => {
      if (busy || video.readyState < 2 || !video.videoWidth) return
      busy = true
      try {
        dots = (dots % 3) + 1
        vpMostrarBarcodeMsg('Buscando código de barras' + '.'.repeat(dots))

        const codes = await detector.detect(video)
        if (codes.length > 0) {
          // Intentar todos los códigos. Si rawValue está vacío, recortar y ampliar.
          let rawTexto = ''
          for (const code of codes) {
            if (code.rawValue) {
              rawTexto = code.rawValue
              break
            }
            // rawValue vacío → detectó la geometría pero no pudo leer los datos
            // Solución: recortar el área del barcode y ampliarla 4x → reintentar
            const box = code.boundingBox
            if (box && box.width > 10 && box.height > 10) {
              const SCALE = 4
              const crop = document.createElement('canvas')
              crop.width  = Math.round(box.width  * SCALE)
              crop.height = Math.round(box.height * SCALE)
              crop.getContext('2d').drawImage(
                video,
                box.x, box.y, box.width, box.height,
                0, 0, crop.width, crop.height
              )
              try {
                const codes2 = await detector.detect(crop)
                if (codes2.length > 0 && codes2[0].rawValue) {
                  rawTexto = codes2[0].rawValue
                  break
                }
              } catch(e2) {}
            }
          }

          if (rawTexto) {
            clearTimeout(vpScannerTimeout); vpScannerTimeout = null
            clearInterval(vpBarcodeScanTimer); vpBarcodeScanTimer = null
            if (scanLine) scanLine.style.display = 'none'

            // Foto del documento
            const canvas = document.createElement('canvas')
            canvas.width = video.videoWidth; canvas.height = video.videoHeight
            canvas.getContext('2d').drawImage(video, 0, 0)
            vpCapturedDoc = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.92))

            vpMostrarDebugRaw(rawTexto, codes[0]?.format || 'unknown')
            vpProcesarCodigoBarras(rawTexto)
          } else {
            const fallbackEl = document.getElementById('vp-scan-fallback')
            if (fallbackEl) fallbackEl.style.display = 'block'
            vpMostrarBarcodeMsg('Código detectado — acercá MÁS el DNI o usá el botón "Tomar foto" ↓', '#f59e0b')
          }
        }
      } catch(e) {
        if (e.name !== 'NotSupportedError' && e.name !== 'SecurityError') {
          vpMostrarBarcodeMsg(`Error: ${e.message?.slice(0,60)}`, '#ef4444')
        }
      } finally { busy = false }
    }, 300)

  } else {
    // ── Estrategia 2: html5-qrcode / ZXing.js (Firefox, Safari)
    try { await cargarHtml5QrCode() }
    catch(e) { vpMostrarBarcodeMsg('Error cargando escáner — verificá conexión', '#ef4444'); return }

    // html5-qrcode necesita un div en el DOM
    let h5div = document.getElementById('__vp_h5qr')
    if (!h5div) {
      h5div = document.createElement('div')
      h5div.id = '__vp_h5qr'
      h5div.style.display = 'none'
      document.body.appendChild(h5div)
    }
    vpQrScanner = new Html5Qrcode('__vp_h5qr', { verbose: false })

    vpMostrarBarcodeMsg('Apuntá el frente del DNI — el código está en la esquina inferior derecha')

    let busy = false, dots = 0
    vpBarcodeScanTimer = setInterval(async () => {
      if (busy || video.readyState < 2 || !video.videoWidth) return
      busy = true
      try {
        dots = (dots % 3) + 1
        vpMostrarBarcodeMsg('Buscando código de barras' + '.'.repeat(dots))

        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth; canvas.height = video.videoHeight
        canvas.getContext('2d').drawImage(video, 0, 0)
        const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9))
        const file = new File([blob], 'frame.jpg', { type: 'image/jpeg' })

        const text = await vpQrScanner.scanFile(file, false)

        clearTimeout(vpScannerTimeout); vpScannerTimeout = null
        clearInterval(vpBarcodeScanTimer); vpBarcodeScanTimer = null
        if (scanLine) scanLine.style.display = 'none'

        vpCapturedDoc = blob
        vpProcesarCodigoBarras(text)

      } catch(e) {
        // "No encontré código en este frame" = normal, no mostrar
        const msg = e?.message || ''
        const esNormal = msg.includes('No barcode') || msg.includes('Unable to')
          || msg.includes('NotFoundException') || msg.includes('No MultiFormat')
          || msg.includes('No code') || msg.includes('QR code parse error')
        if (!esNormal) vpMostrarBarcodeMsg(`Error: ${msg.slice(0,60)}`, '#ef4444')
      } finally { busy = false }
    }, 600)
  }
}

// Procesa el texto crudo del código de barras
function vpProcesarCodigoBarras(texto) {
  // Detectar si es MRZ (2 líneas de 44 chars ICAO o texto con <<)
  const esMRZ = texto.includes('<<') || (texto.includes('\n') && texto.split('\n').some(l => l.length >= 30 && /^[A-Z0-9<]{20,}$/.test(l.trim())))

  let parsed
  if (esMRZ) {
    const mrzParsed = parsearMRZ(texto)
    if (mrzParsed) {
      parsed = {
        apellido: mrzParsed.apellido,
        nombre:   mrzParsed.nombre,
        numDoc:   mrzParsed.numDoc,
        fechaNac: mrzParsed.fechaNac,
        fuente:   'MRZ'
      }
    }
  } else {
    const p = parsearCodigoBarraDNI(texto)
    if (p.numDoc || p.apellido) parsed = { ...p, fuente: 'PDF417' }
  }

  if (!parsed || (!parsed.numDoc && !parsed.apellido)) {
    // Texto leído pero no es un documento reconocido
    const retryEl = document.getElementById('vp-decode-retry')
    const errEl   = document.getElementById('vp-decode-error-msg')
    if (errEl)   errEl.textContent = 'Código leído pero no corresponde a un documento válido. Intentá de nuevo.'
    if (retryEl) retryEl.style.display = ''
    document.getElementById('vp-s2c-pre').style.display = ''
    return
  }

  vpBarcodeData = parsed

  const resDiv = document.getElementById('vp-barcode-result')
  const fields = document.getElementById('vp-barcode-fields')

  if (fields) {
    const rows = []
    if (parsed.apellido) rows.push(`<b>Apellido:</b> ${parsed.apellido}`)
    if (parsed.nombre)   rows.push(`<b>Nombre:</b>   ${parsed.nombre}`)
    if (parsed.numDoc)   rows.push(`<b>Número:</b>   ${parsed.numDoc}`)
    if (parsed.fechaNac) rows.push(`<b>Fecha nac.:</b> ${parsed.fechaNac}`)
    if (parsed.fuente)   rows.push(`<small style="color:var(--mid)">Fuente: ${parsed.fuente}</small>`)
    fields.innerHTML = rows.join('<br>')
  }
  if (resDiv) resDiv.style.display = 'block'
  document.getElementById('vp-s2c-pre').style.display     = 'none'
  document.getElementById('vp-decode-retry').style.display = 'none'
}

function vpPararBarcodeScanner() {
  if (vpScannerTimeout)   { clearTimeout(vpScannerTimeout);   vpScannerTimeout   = null }
  if (vpBarcodeScanTimer) { clearInterval(vpBarcodeScanTimer); vpBarcodeScanTimer = null }
  if (vpQrScanner)        { try { vpQrScanner.stop() } catch(e) {} vpQrScanner = null }
}

// Fallback para documentos sin código de barras (cédula venezolana antigua, etc.)
async function vpCapturarFallbackOCR() {
  const video = document.getElementById('cam-doc-video')
  if (!video || !video.videoWidth) { showToast('Usá el botón "Tomar foto" para verificar'); return }

  const c = document.createElement('canvas')
  c.width = video.videoWidth; c.height = video.videoHeight
  c.getContext('2d').drawImage(video, 0, 0)
  vpCapturedDoc = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92))

  vpPararBarcodeScanner()

  // OCR sobre el frame capturado
  vpMostrarBarcodeMsg('Leyendo datos del documento por OCR...')
  const nombreUsuario = document.getElementById('vp-nombre')?.value.trim() || ''
  const numDocUsuario = document.getElementById('vp-num-doc')?.value.trim() || ''
  const fechaUsuario  = document.getElementById('vp-fecha-nac')?.value || ''
  const country       = document.getElementById('vp-pais')?.value || ''

  try {
    const ocrTexto = await extraerTextoCompleto(vpCapturedDoc)
    const match    = vpCompararDatos(ocrTexto, nombreUsuario, numDocUsuario, fechaUsuario, country)

    if (!match.numDoc || !match.nombre) {
      const preview = ocrTexto.replace(/\n/g,' ').trim().slice(0, 200)
      vpMostrarBarcodeMsg(`No se pudieron leer los datos — mejorá la iluminación`, '#ef4444')
      const resDiv = document.getElementById('vp-barcode-result')
      if (resDiv) {
        resDiv.style.display = 'block'
        resDiv.style.borderColor = '#ef4444'
        resDiv.style.background = 'rgba(239,68,68,0.1)'
        resDiv.querySelector('div').style.color = '#ef4444'
        resDiv.querySelector('div').textContent = '✗ No se leyeron todos los datos'
        document.getElementById('vp-barcode-fields').innerHTML =
          `Texto leído: "${preview}"<br><br><b>Corregí la iluminación y volvé a intentar</b>`
        resDiv.querySelector('button').style.display = 'none'
      }
      return
    }

    // OCR OK — simular barcodeData con los datos OCR
    vpBarcodeData = {
      apellido: nombreUsuario.split(' ')[0],
      nombre:   nombreUsuario.split(' ').slice(1).join(' '),
      numDoc:   numDocUsuario.replace(/\D/g,''),
      fechaNac: fechaUsuario,
      porOCR:   true
    }
    vpMostrarBarcodeMsg('✓ Datos leídos por OCR', '#22c55e')
    const resDiv = document.getElementById('vp-barcode-result')
    if (resDiv) {
      resDiv.style.display = 'block'
      document.getElementById('vp-barcode-fields').innerHTML =
        `<b>Número:</b> ${numDocUsuario}<br><b>Nombre:</b> ${nombreUsuario}<br><b>Fecha:</b> ${fechaUsuario}<br><span style="color:#f59e0b;font-size:11px">⚠ Verificado por OCR — el validador humano confirma</span>`
      resDiv.querySelector('button').style.display = 'block'
    }
  } catch(e) {
    vpMostrarBarcodeMsg('Error procesando el documento', '#ef4444')
  }
}

// Fallback: foto manual del documento → intentar barcode → OCR
async function vpEscanearFotoDoc(input) {
  const file = input.files?.[0]
  if (!file) return
  input.value = '' // reset para que onChange dispare nuevamente si es necesario

  vpPararBarcodeScanner()
  vpCapturedDoc = file
  vpMostrarBarcodeMsg('Analizando foto del documento...')

  // Intento 1: BarcodeDetector sobre imagen estática
  if ('BarcodeDetector' in window) {
    try {
      const img = await createImageBitmap(file)
      const fmt = await BarcodeDetector.getSupportedFormats()
      const detector = new BarcodeDetector({ formats: fmt })
      const codes = await detector.detect(img)
      img.close()
      if (codes.length > 0) {
        vpProcesarCodigoBarras(codes[0].rawValue)
        return
      }
    } catch(e) {}
  }

  // Intento 2: html5-qrcode sobre imagen estática
  try {
    await cargarHtml5QrCode()
    let h5div = document.getElementById('__vp_h5qr')
    if (!h5div) {
      h5div = document.createElement('div')
      h5div.id = '__vp_h5qr'; h5div.style.display = 'none'
      document.body.appendChild(h5div)
    }
    const scanner = new Html5Qrcode('__vp_h5qr', { verbose: false })
    const text = await scanner.scanFile(file, false)
    vpMostrarDebugRaw(text, 'html5-qrcode')
    vpProcesarCodigoBarras(text)
    return
  } catch(e) {}

  // Intento 3: OCR (para cédulas venezolanas sin código de barras)
  vpMostrarBarcodeMsg('Sin código de barras — intentando leer texto del documento...', '#f59e0b')
  try {
    const ocrTexto = await extraerTextoCompleto(file)
    const nombreUsuario = document.getElementById('vp-nombre')?.value.trim() || ''
    const numDocUsuario = document.getElementById('vp-num-doc')?.value.trim() || ''
    const fechaUsuario  = document.getElementById('vp-fecha-nac')?.value || ''
    const country       = document.getElementById('vp-pais')?.value || ''

    const match = vpCompararDatos(ocrTexto, nombreUsuario, numDocUsuario, fechaUsuario, country)
    if (!match.numDoc || !match.nombre) {
      vpMostrarBarcodeMsg('No se pudieron leer los datos — tomá otra foto con mejor luz', '#ef4444')
      document.getElementById('vp-scan-fallback').style.display = 'block'
      return
    }
    vpBarcodeData = {
      apellido: nombreUsuario.split(' ')[0],
      nombre:   nombreUsuario.split(' ').slice(1).join(' '),
      numDoc:   numDocUsuario.replace(/\D/g,''),
      fechaNac: fechaUsuario,
      porOCR:   true
    }
    vpMostrarBarcodeMsg('✓ Datos verificados por OCR', '#22c55e')
    const resDiv = document.getElementById('vp-barcode-result')
    const fields = document.getElementById('vp-barcode-fields')
    if (fields) fields.innerHTML =
      `<b>Número:</b> ${numDocUsuario}<br><b>Nombre:</b> ${nombreUsuario}<br><b>Fecha:</b> ${fechaUsuario}<br><span style="color:#f59e0b;font-size:11px">⚠ Verificado por OCR — el validador confirma</span>`
    if (resDiv) { resDiv.style.display = 'block'; resDiv.querySelector('button').style.display = 'block' }
  } catch(e) {
    vpMostrarBarcodeMsg('Error al procesar la foto — intentá de nuevo', '#ef4444')
  }
}

// El usuario confirmó los datos del código de barras
function vpConfirmarBarcode() {
  // Gemini ya verificó todo — avanzar directo al paso 3 (liveness)
  vpGoStep(3)
}

// ══════════════════════════════════════════════════════════════
//  CÁMARA — captura obligatoria (sin galería)
// ══════════════════════════════════════════════════════════════

let vpCapturedDoc       = null  // Blob: foto del documento
let vpCapturedSelfie    = null  // Blob: selfie simple
let vpCapturedSelfieDoc = null  // Blob: selfie sosteniendo doc
let vpCameraStream      = null  // MediaStream activo

async function vpAbrirCamara(videoId, facing = 'environment') {
  vpPararCamara()
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facing },
        width:  { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    })
    vpCameraStream = stream
    const video = document.getElementById(videoId)
    if (!video) return
    video.srcObject = stream
    await video.play().catch(() => {})

    // Espejo: detectar cámara real usada (en desktop, 'environment' cae en frontal)
    // El canvas captura el stream raw (sin transformación CSS) → imagen siempre correcta
    const track = stream.getVideoTracks()[0]
    const actualFacing = track?.getSettings()?.facingMode
    const isFront = actualFacing ? actualFacing === 'user' : facing === 'user'
    video.style.transform = isFront ? 'scaleX(-1)' : 'none'
  } catch (e) {
    console.error('Cámara no disponible:', e)
    showToast('No se pudo acceder a la cámara — verificá los permisos del navegador')
    throw e
  }
}

function vpPararCamara() {
  if (vpCameraStream) {
    vpCameraStream.getTracks().forEach(t => t.stop())
    vpCameraStream = null
  }
}

// ══════════════════════════════════════════════════════════════
//  ESCÁNER EN TIEMPO REAL — paso 2
//  Escanea frames continuamente hasta verificar los 4 campos.
//  Auto-captura cuando todos coinciden.
// ══════════════════════════════════════════════════════════════

let vpScannerTimer     = null   // setInterval handle
let vpScannerRunning   = false  // bandera anti-solapamiento
let vpScannerTimeout   = null   // timeout para botón manual (30s)

// Captura un frame del video y lo devuelve como Blob
function vpCapturarFrame(videoId, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const video = document.getElementById(videoId)
    if (!video || !video.videoWidth) { reject(new Error('video no listo')); return }
    const canvas = document.createElement('canvas')
    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('blob null')), 'image/jpeg', quality)
  })
}

function vpSetScanMsg(txt, color = 'var(--mid)') {
  const el = document.getElementById('vp-scan-msg')
  if (el) { el.textContent = txt; el.style.color = color }
}

function vpActualizarScanUI(found) {
  const campos = { numDoc: 'Número', nombre: 'Nombre', fecha: 'Fecha nac.', nacionalidad: 'País' }
  Object.entries(campos).forEach(([key, label]) => {
    const el = document.getElementById(`scan-ind-${key}`)
    if (!el) return
    if (found[key]) {
      el.className = 'scan-ind encontrado'
      el.querySelector('.scan-ic').textContent = '✓'
    } else {
      el.className = 'scan-ind buscando'
      el.querySelector('.scan-ic').textContent = '◌'
    }
    el.childNodes[1] && (el.childNodes[1].textContent = ' ' + label)
  })
}

async function vpIniciarScanner() {
  vpPararScanner()

  // Mostrar overlay de indicadores
  const overlay = document.getElementById('vp-scan-overlay')
  if (overlay) overlay.style.display = 'block'

  // Resetear indicadores
  vpActualizarScanUI({ numDoc: false, nombre: false, fecha: false, nacionalidad: false })
  vpSetScanMsg('Apuntá al documento completo — incluyendo la fecha inferior')

  // Botón manual después de 30s si el scanner no logra verificar
  vpScannerTimeout = setTimeout(() => {
    const btn = document.getElementById('vp-scan-manual-btn')
    if (btn) btn.style.display = 'block'
    vpSetScanMsg('¿Problemas? Mejorá la iluminación o usá la captura manual', '#f59e0b')
  }, 30000)

  // Obtener datos del formulario
  const nombreUsuario = document.getElementById('vp-nombre')?.value.trim() || ''
  const numDocUsuario = document.getElementById('vp-num-doc')?.value.trim() || ''
  const fechaUsuario  = document.getElementById('vp-fecha-nac')?.value || ''
  const country       = document.getElementById('vp-pais')?.value || ''

  let intentos = 0

  vpScannerTimer = setInterval(async () => {
    if (vpScannerRunning) return
    vpScannerRunning = true
    intentos++

    try {
      vpSetScanMsg(`Escaneando${'.'.repeat((intentos % 3) + 1)}`)

      const frame = await vpCapturarFrame('cam-doc-video', 0.88)
      const texto = await extraerTextoCompleto(frame)
      const found = vpCompararDatos(texto, nombreUsuario, numDocUsuario, fechaUsuario, country)

      vpActualizarScanUI(found)

      const todosOK = found.numDoc && found.nombre && found.fecha && found.nacionalidad

      if (todosOK) {
        // ¡Todos verificados! — capturar frame de alta calidad y avanzar
        vpPararScanner()
        vpSetScanMsg('✓ Documento verificado — capturando...', '#22c55e')

        // Captura final en alta calidad
        const docBlob = await vpCapturarFrame('cam-doc-video', 0.95)
        vpCapturedDoc = docBlob
        vpPararCamara()

        // Pequeña pausa para que el usuario vea el ✓
        await new Promise(r => setTimeout(r, 800))
        vpGoStep(3)  // → selfie

      } else {
        // Construir mensaje de hint
        const faltantes = []
        if (!found.numDoc)       faltantes.push('número')
        if (!found.nombre)       faltantes.push('nombre')
        if (!found.fecha)        faltantes.push('fecha')
        if (!found.nacionalidad) faltantes.push('país')
        vpSetScanMsg(`Buscando: ${faltantes.join(', ')} — mostrá el documento completo`)
      }

    } catch (e) {
      console.warn('Scanner frame error:', e)
    } finally {
      vpScannerRunning = false
    }
  }, 5000)  // escanea cada 5s (3 OCR en paralelo toman ~4s)
}

function vpPararScanner() {
  if (vpScannerTimer) { clearInterval(vpScannerTimer); vpScannerTimer = null }
  if (vpScannerTimeout) { clearTimeout(vpScannerTimeout); vpScannerTimeout = null }
  vpScannerRunning = false
  const overlay = document.getElementById('vp-scan-overlay')
  if (overlay) overlay.style.display = 'none'
}

// Captura manual de emergencia (aparece tras 30s de fallo)
async function vpCapturarManualDoc() {
  try {
    const blob = await vpCapturarFrame('cam-doc-video', 0.95)
    vpCapturedDoc = blob
    vpPararScanner()
    vpPararCamara()
    vpGoStep(3)
  } catch (e) {
    showToast('Error al capturar — verificá que la cámara esté activa')
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  AUTO-CAPTURE — countdown overlay sobre la cámara
// ══════════════════════════════════════════════════════════════════════════════

async function vpContador(videoWrapperId, segundos) {
  const wrap = document.getElementById(videoWrapperId)
  if (!wrap) return
  // Crear overlay de countdown
  const overlay = document.createElement('div')
  overlay.style.cssText = `
    position:absolute;inset:0;display:flex;flex-direction:column;
    align-items:center;justify-content:center;z-index:10;
    background:rgba(0,0,0,.35);border-radius:10px;
  `
  const num = document.createElement('div')
  num.style.cssText = 'font-size:72px;font-weight:900;color:#fff;line-height:1;text-shadow:0 2px 12px rgba(0,0,0,.5)'
  const txt = document.createElement('div')
  txt.style.cssText = 'font-size:13px;color:rgba(255,255,255,.8);margin-top:8px;font-weight:600'
  txt.textContent = 'Mantené quieto…'
  overlay.appendChild(num); overlay.appendChild(txt)
  wrap.style.position = 'relative'
  wrap.appendChild(overlay)
  for (let i = segundos; i > 0; i--) {
    num.textContent = i
    await new Promise(r => setTimeout(r, 1000))
  }
  overlay.remove()
}

async function vpAutoCapturar(tipo, wrapperId, segundos = 3) {
  await vpContador(wrapperId, segundos)
  await vpCapturar(tipo)
}

// ── Paso 3: liveness con auto-capture ────────────────────────────────────────
// Token incremental — si cambia mientras la cadena está corriendo, las .then() se cancelan
let _vpLivenessToken = 0

function vpLivenessIniciar() {
  const token = ++_vpLivenessToken  // capturar token de esta sesión de liveness
  vpLivenessInstruccion = VP_LIVENESS[Math.floor(Math.random() * VP_LIVENESS.length)]
  const emoji = document.getElementById('vp-liveness-emoji')
  const texto = document.getElementById('vp-liveness-texto')
  if (emoji) emoji.textContent = vpLivenessInstruccion.emoji
  if (texto) texto.textContent = vpLivenessInstruccion.texto
  vpResetCamUI('selfie')
  vpAbrirCamara('cam-selfie-video', 'user')
    .then(() => {
      if (token !== _vpLivenessToken) return  // usuario navegó a otro paso — cancelar
      // Esperar que el video tenga frames reales
      const vid = document.getElementById('cam-selfie-video')
      return new Promise(res => {
        if (vid.videoWidth > 0) { res(); return }
        vid.addEventListener('loadeddata', res, { once: true })
        setTimeout(res, 2000)
      })
    })
    .then(() => {
      if (token !== _vpLivenessToken) return  // cancelado
      return vpAutoCapturar('selfie', 'cam-selfie-wrap', 4)
    })
    .then(() => {
      if (token !== _vpLivenessToken) return  // cancelado — no parar la cámara del otro paso
      // Mostrar preview y botones de confirmación — NO avanzar automático
      vpPararCamara()
      document.getElementById('cam-selfie-pre').style.display  = 'none'
      document.getElementById('cam-selfie-post').style.display = ''
      document.getElementById('cam-selfie-preview').style.display = 'block'
      const cnt = document.getElementById('vp-selfie-contador')
      if (cnt) cnt.textContent = `Intento ${vpReintentoSelfie + 1} de ${VP_MAX_REINTENTOS}`
    })
    .catch(e => console.warn('Liveness error:', e))
}

function vpLivenessReintentar() {
  vpReintentoSelfie++
  if (vpReintentoSelfie >= VP_MAX_REINTENTOS) { vpReiniciarTodo(); return }
  document.getElementById('cam-selfie-post').style.display = 'none'
  document.getElementById('cam-selfie-preview').style.display = 'none'
  document.getElementById('cam-selfie-pre').style.display = ''
  vpLivenessInstruccion = VP_LIVENESS[Math.floor(Math.random() * VP_LIVENESS.length)]
  const emoji = document.getElementById('vp-liveness-emoji')
  const texto = document.getElementById('vp-liveness-texto')
  if (emoji) emoji.textContent = vpLivenessInstruccion.emoji
  if (texto) texto.textContent = vpLivenessInstruccion.texto
  vpResetCamUI('selfie')
  vpLivenessIniciar()
}

async function vpVerificarLiveness(instruccion) {
  try {
    if (!vpCapturedSelfie) return true  // si no hay foto, pasar (error previo)
    const b64 = await new Promise((res, rej) => {
      const reader = new FileReader()
      reader.onload  = () => res(reader.result.split(',')[1])
      reader.onerror = rej
      reader.readAsDataURL(vpCapturedSelfie)
    })
    const resp = await fetch(`${VP_API_URL}/verify/liveness`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_b64: b64, instruccion }),
    })
    if (!resp.ok) return true  // si el backend falla, no bloquear
    const data = await resp.json()
    return data.cumplió === true
  } catch(e) {
    console.warn('Error verificando liveness:', e)
    return true  // ante error de red, no bloquear
  }
}

// ── Paso 4: selfie sosteniendo documento con auto-capture ────────────────────
async function vpSelfieDocIniciar() {
  try {
    await vpAbrirCamara('cam-selfiedoc-video', 'user')
    const vid = document.getElementById('cam-selfiedoc-video')
    await new Promise(res => {
      if (vid.videoWidth > 0) { res(); return }
      vid.addEventListener('loadeddata', res, { once: true })
      setTimeout(res, 2000)
    })
    await vpAutoCapturar('selfiedoc', 'cam-selfiedoc-wrap', 8)
    // Mostrar preview y botones de confirmación — usuario decide
    vpPararCamara()
    document.getElementById('cam-selfiedoc-pre').style.display  = 'none'
    document.getElementById('cam-selfiedoc-post').style.display = ''
    document.getElementById('cam-selfiedoc-preview').style.display = 'block'
    const cnt = document.getElementById('vp-selfiedoc-contador')
    if (cnt) cnt.textContent = `Intento ${vpReintentoSelfieDoc + 1} de ${VP_MAX_REINTENTOS}`
  } catch(e) {
    console.warn('SelfieDoc error:', e)
  }
}

function vpSelfieDocReintentar() {
  vpReintentoSelfieDoc++
  if (vpReintentoSelfieDoc >= VP_MAX_REINTENTOS) { vpReiniciarTodo(); return }
  document.getElementById('cam-selfiedoc-post').style.display = 'none'
  document.getElementById('cam-selfiedoc-preview').style.display = 'none'
  document.getElementById('cam-selfiedoc-pre').style.display = ''
  vpResetCamUI('selfiedoc')
  vpSelfieDocIniciar()
}

// ══════════════════════════════════════════════════════════════════════════════
//  BLUR DE DOCUMENTO — pixela la zona donde está el documento en la selfie
// ══════════════════════════════════════════════════════════════════════════════

// Extrae SOLO la foto de la cara del DNI usando las coordenadas exactas de Gemini.
// vpFaceBox = {x1, y1, x2, y2} en fracciones (0-1) detectadas por Gemini Vision.
// Si no hay coordenadas, usa porcentajes típicos de DNI latinoamericano como fallback.
async function vpExtraerCaraDoc(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let fx, fy, fw, fh

      if (vpFaceBox && vpFaceBox.x1 != null) {
        // Coordenadas exactas detectadas por Gemini — agregar pequeño margen (5%)
        const margin = 0.02
        const x1 = Math.max(0, vpFaceBox.x1 - margin)
        const y1 = Math.max(0, vpFaceBox.y1 - margin)
        const x2 = Math.min(1, vpFaceBox.x2 + margin)
        const y2 = Math.min(1, vpFaceBox.y2 + margin)
        fx = Math.floor(img.width  * x1)
        fy = Math.floor(img.height * y1)
        fw = Math.floor(img.width  * (x2 - x1))
        fh = Math.floor(img.height * (y2 - y1))
        console.log('[vpExtraerCaraDoc] usando coordenadas Gemini:', vpFaceBox)
      } else {
        // Fallback: zona típica de la foto en DNI latinoamericano
        //   horizontal: izquierda ~0-38%  |  vertical: ~14-80%
        fx = Math.floor(img.width  * 0.01)
        fy = Math.floor(img.height * 0.14)
        fw = Math.floor(img.width  * 0.37)
        fh = Math.floor(img.height * 0.66)
        console.log('[vpExtraerCaraDoc] usando fallback de porcentajes fijos')
      }

      const canvas = document.createElement('canvas')
      // Salida máx 500px por lado para que llegue nítida al admin
      const maxSide = 500
      const scale   = Math.min(maxSide / fw, maxSide / fh, 1)
      canvas.width  = Math.round(fw * scale)
      canvas.height = Math.round(fh * scale)
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, fx, fy, fw, fh, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', 0.90)
    }
    img.onerror = reject
    img.src = URL.createObjectURL(blob)
  })
}

async function vpPixelarDocumento(blob) {
  // 1. Pedir a Gemini la caja del documento en la foto
  let docBox = null
  try {
    const b64 = await new Promise((res, rej) => {
      const reader = new FileReader()
      reader.onload  = () => res(reader.result.split(',')[1])
      reader.onerror = rej
      reader.readAsDataURL(blob)
    })
    const resp = await fetch(`${VP_API_URL}/verify/censurar-campos`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ image_b64: b64 }),
    })
    if (resp.ok) {
      const data = await resp.json()
      docBox = data.document || null
      console.log('[censurar] document box:', docBox)
    }
  } catch(e) {
    console.warn('[censurar] Error:', e)
  }

  // 2. Aplicar blur pesado al área del documento
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width  = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)

      // Definir zona a blurear
      let bx, by, bw, bh
      if (docBox && docBox.x1 != null) {
        bx = docBox.x1 * img.width
        by = docBox.y1 * img.height
        bw = (docBox.x2 - docBox.x1) * img.width
        bh = (docBox.y2 - docBox.y1) * img.height
      } else {
        // Fallback: zona inferior central (documento típico en selfie)
        bx = img.width  * 0.05
        by = img.height * 0.48
        bw = img.width  * 0.90
        bh = img.height * 0.48
      }

      // Pixelación tipo mosaico (más agresiva que blur CSS)
      const pixSize = Math.max(Math.floor(Math.min(bw, bh) / 14), 10)
      for (let py = by; py < by + bh; py += pixSize) {
        for (let px = bx; px < bx + bw; px += pixSize) {
          const mx = Math.min(px + (pixSize/2|0), img.width  - 1)
          const my = Math.min(py + (pixSize/2|0), img.height - 1)
          const [r, g, b] = ctx.getImageData(mx, my, 1, 1).data
          ctx.fillStyle = `rgb(${r},${g},${b})`
          ctx.fillRect(px, py, pixSize, pixSize)
        }
      }

      // Borde sutil alrededor del área censurada
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'
      ctx.lineWidth = 2
      ctx.strokeRect(bx, by, bw, bh)

      canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', 0.72)
    }
    img.onerror = reject
    img.src = URL.createObjectURL(blob)
  })
}

async function vpCapturar(tipo) {
  const videoId = tipo === 'doc' ? 'cam-doc-video'
                : tipo === 'selfie' ? 'cam-selfie-video'
                : 'cam-selfiedoc-video'
  const video = document.getElementById(videoId)
  if (!video || !video.videoWidth) {
    showToast('Cámara no lista — esperá un momento')
    return
  }

  const canvas = document.createElement('canvas')
  canvas.width  = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')

  // Despejar el espejo para selfies (guardamos imagen real, no invertida)
  if (tipo !== 'doc') {
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
  }
  ctx.drawImage(video, 0, 0)

  canvas.toBlob(blob => {
    if (!blob) { showToast('Error al capturar — intentá de nuevo'); return }

    // Guardar blob
    if (tipo === 'doc')       vpCapturedDoc       = blob
    else if (tipo === 'selfie')    vpCapturedSelfie    = blob
    else if (tipo === 'selfiedoc') vpCapturedSelfieDoc = blob

    // Mostrar preview
    const previewId = `cam-${tipo}-preview`
    const wrapId    = `cam-${tipo}-wrap`
    const preId     = `cam-${tipo}-pre`
    const postId    = `cam-${tipo}-post`

    const preview = document.getElementById(previewId)
    if (preview) {
      preview.src = URL.createObjectURL(blob)
      preview.style.display = 'block'
    }
    const wrap = document.getElementById(wrapId)
    if (wrap) wrap.style.display = 'none'
    const pre  = document.getElementById(preId)
    if (pre)  pre.style.display  = 'none'
    const post = document.getElementById(postId)
    if (post) post.style.display = 'block'

  }, 'image/jpeg', 0.92)
}

function vpRetomar(tipo) {
  const previewId = `cam-${tipo}-preview`
  const wrapId    = `cam-${tipo}-wrap`
  const preId     = `cam-${tipo}-pre`
  const postId    = `cam-${tipo}-post`

  const preview = document.getElementById(previewId)
  if (preview) { preview.style.display = 'none'; preview.src = '' }
  const wrap = document.getElementById(wrapId)
  if (wrap) wrap.style.display = 'block'
  const pre  = document.getElementById(preId)
  if (pre)  pre.style.display  = 'block'
  const post = document.getElementById(postId)
  if (post) post.style.display = 'none'

  if (tipo === 'doc')       vpCapturedDoc       = null
  else if (tipo === 'selfie')    vpCapturedSelfie    = null
  else if (tipo === 'selfiedoc') vpCapturedSelfieDoc = null
}

function vpUsarDoc() {
  if (!vpCapturedDoc) return
  vpPararCamara()
  vpGoStep(3)  // → selfie (desde paso 2b)
}

async function vpUsarSelfie() {
  if (!vpCapturedSelfie) return
  const instrTxt = vpLivenessInstruccion?.texto || ''
  const btn = document.querySelector('#cam-selfie-post .vp-btn-main')
  if (btn) { btn.textContent = 'Verificando…'; btn.disabled = true }

  const ok = await vpVerificarLiveness(instrTxt)
  if (btn) { btn.textContent = 'Usar esta →'; btn.disabled = false }

  if (!ok) {
    vpReintentoSelfie++
    if (vpReintentoSelfie >= VP_MAX_REINTENTOS) { vpReiniciarTodo(); return }
    const cnt = document.getElementById('vp-selfie-contador')
    if (cnt) cnt.textContent = `⚠ No se detectó la acción. Intento ${vpReintentoSelfie + 1} de ${VP_MAX_REINTENTOS}`
    return
  }
  vpReintentoSelfie = 0
  vpGoStep(4)
}

function vpUsarSelfieDoc() {
  if (!vpCapturedSelfieDoc) return
  vpPararCamara()
  vpIniciarProceso()  // → procesamiento
}

// ── crearIdentidad: requiere login primero ──
function crearIdentidad() {
  if (!_authUser) {
    abrirAuth('registro')
    return
  }
  if (MY_SEAT > 0) {
    // Ya verificado
    abrirMiPerfil()
    return
  }
  abrirVerificacion()
}

let _verifyOverlayOpenedAt = 0

function abrirVerificacion() {
  _verifyOverlayOpenedAt = Date.now()   // time-gate: bloquea ghost clicks del primer segundo
  vpCurrentStep = 1
  vpAnonBlob = null
  vpFaceBox = null
  vpBarcodeData = null
  vpGeminiResult = null
  // UUID con fallback para Safari antiguo
  vpVerificationId = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random()*16|0; return (c==='x'?r:(r&0x3|0x8)).toString(16)
      })
  // Limpiar blobs de cámara
  vpCapturedDoc = null
  vpCapturedSelfie = null
  vpCapturedSelfieDoc = null
  try { vpPararBarcodeScanner() } catch(e) {}
  try { vpPararScanner() } catch(e) {}
  try { vpPararCamara() } catch(e) {}
  // Resetear UI de cámara
  try { ;['doc','selfie','selfiedoc'].forEach(t => vpResetCamUI(t)) } catch(e) {}
  document.querySelectorAll('.vp-proc-row').forEach(r => {
    r.classList.remove('active','done')
    const icon = r.querySelector('.vp-proc-icon'); if (icon) icon.textContent = '◌'
    const sub  = r.querySelector('.vp-proc-sub');  if (sub)  sub.textContent  = ''
  })
  const campos = ['vp-nombre','vp-apellido','vp-num-doc','vp-fecha-nac']
  campos.forEach(id => { const el = document.getElementById(id); if (el) el.value = '' })
  const selects = ['vp-tipo-doc','vp-pais','vp-dob-dia','vp-dob-mes','vp-dob-ano']
  selects.forEach(id => { const el = document.getElementById(id); if (el) el.value = '' })
  document.getElementById('vp-dob-wrap')?.classList.remove('error')
  vpInitDobSelects()
  document.getElementById('vp-btn-s1').disabled = true
  // Mostrar botón × solo para usuarios ya verificados (pueden cerrar el overlay)
  // Usuarios no verificados no pueden escapar del overlay hasta completar el flujo
  const closeBtn = document.getElementById('vp-close-btn')
  if (closeBtn) closeBtn.style.display = MY_SEAT > 0 ? '' : 'none'
  // Bloquear controles del hemiciclo mientras el overlay está abierto
  const mc = document.getElementById('map-controls')
  if (mc) mc.style.pointerEvents = 'none'
  vpShowStep(1)
  document.getElementById('verify-overlay').classList.add('open')
}

function uuidv4() {
  if (self.crypto?.randomUUID) return self.crypto.randomUUID();

  if (self.crypto?.getRandomValues) {
    const b = self.crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;   // versión 4
    b[8] = (b[8] & 0x3f) | 0x80;   // variante RFC 4122
    const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  }

  // Último recurso: no criptográfico
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function cerrarVerificacion() {
  vpPararCamara()
  clearInterval(_vpPollingTimer)
  document.getElementById('verify-overlay').classList.remove('open')
  // Rehabilitar controles del hemiciclo
  const mc = document.getElementById('map-controls')
  if (mc) mc.style.pointerEvents = ''
  // Si el usuario no tiene butaca asignada (no verificado), volver a verify-onboard
  // para que no quede atrapado en congress sin identidad
  if (_authUser && !MY_SEAT && !_isObserverMode()) {
    setTimeout(() => showScreen('verify-onboard'), 250)
  }
}

function vpResetCamUI(tipo) {
  const preview = document.getElementById(`cam-${tipo}-preview`)
  if (preview) { preview.style.display = 'none'; preview.src = '' }
  const wrap = document.getElementById(`cam-${tipo}-wrap`)
  if (wrap) wrap.style.display = 'block'
  const pre  = document.getElementById(`cam-${tipo}-pre`)
  if (pre)  pre.style.display  = 'block'
  const post = document.getElementById(`cam-${tipo}-post`)
  if (post) post.style.display = 'none'
}

function vpShowStep(n) {
  // Parar todo al salir — y cancelar cualquier cadena de liveness en vuelo
  ++_vpLivenessToken  // invalida cualquier .then() pendiente de liveness
  vpPararBarcodeScanner()
  vpPararScanner()
  vpPararCamara()
  // (streams del paso 2 ya no aplican — arquitectura simplificada)

  document.querySelectorAll('.vp-step').forEach(s => s.classList.remove('active'))
  const el = document.getElementById('vp-s' + n)
  if (el) el.classList.add('active')

  if (n === 2) {
    vpDocIniciar()
  } else if (n === 3) {
    vpLivenessIniciar()
  } else if (n === 4) {
    vpResetCamUI('selfiedoc')
    vpSelfieDocIniciar()
  }

  // Progress dots
  const dots  = document.querySelectorAll('.vp-prog-dot')
  const lines = document.querySelectorAll('.vp-prog-line')
  const stepMap = { 1:0, 2:1, 3:2, '4a':2, '4b':2, 5:3, 6:3 }
  const idx = stepMap[String(n)] ?? n - 1
  dots.forEach((d,i)  => { d.classList.toggle('active', i===idx); d.classList.toggle('done', i<idx) })
  lines.forEach((l,i) => l.classList.toggle('done', i<idx))
  vpCurrentStep = n
}

function vpGoStep(n) { vpShowStep(n) }

// ── Validación de inputs de verificación ──────────────────────────
function vpSanitizeNombre(el) {
  // Solo letras (incluye tildes, ñ, ü), espacios, guiones y puntos
  const cur = el.value
  const san = cur.replace(/[^a-zA-ZáéíóúÁÉÍÓÚàèìòùÀÈÌÒÙâêîôûÂÊÎÔÛäëïöüÄËÏÖÜñÑçÇ'\- .]/g, '')
  if (san !== cur) { const pos = el.selectionStart - (cur.length - san.length); el.value = san; try { el.setSelectionRange(pos, pos) } catch(e){} }
}

function vpSanitizeDoc(el) {
  const tipo = document.getElementById('vp-tipo-doc')?.value
  const cur = el.value
  // DNI/Cédula = solo números; Pasaporte = alfanumérico
  const san = tipo === 'PASAPORTE'
    ? cur.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    : cur.replace(/\D/g, '')
  if (san !== cur) { el.value = san }
}

function vpOnTipoDocChange() {
  const tipo = document.getElementById('vp-tipo-doc')?.value
  const docEl = document.getElementById('vp-num-doc')
  if (!docEl) return
  if (tipo === 'PASAPORTE') {
    docEl.setAttribute('inputmode', 'text')
    docEl.placeholder = 'Ej: AA123456 (sin espacios)'
  } else {
    docEl.setAttribute('inputmode', 'numeric')
    docEl.placeholder = 'Solo números, sin espacios'
  }
  // Re-sanitizar si ya había algo escrito
  vpSanitizeDoc(docEl)
  vpCheckStep1()
}

function vpInitDobSelects() {
  const diaEl = document.getElementById('vp-dob-dia')
  if (diaEl && diaEl.options.length <= 1) {
    for (let d = 1; d <= 31; d++) {
      const o = document.createElement('option')
      o.value = String(d).padStart(2, '0')
      o.textContent = String(d).padStart(2, '0')
      diaEl.appendChild(o)
    }
  }
  const anoEl = document.getElementById('vp-dob-ano')
  if (anoEl && anoEl.options.length <= 1) {
    const maxYear = new Date().getFullYear() - 16
    for (let y = maxYear; y >= 1924; y--) {
      const o = document.createElement('option')
      o.value = String(y)
      o.textContent = String(y)
      anoEl.appendChild(o)
    }
  }
}

function vpUpdateFechaNac() {
  const dia = document.getElementById('vp-dob-dia')?.value
  const mes = document.getElementById('vp-dob-mes')?.value
  const ano = document.getElementById('vp-dob-ano')?.value
  const hidden = document.getElementById('vp-fecha-nac')
  if (hidden) {
    hidden.value = (dia && mes && ano) ? `${ano}-${mes}-${dia}` : ''
  }
  vpCheckStep1()
}

function vpSetFechaNacMax() {
  vpInitDobSelects()
}

function vpCheckStep1() {
  vpSetFechaNacMax()  // asegura el max siempre actualizado
  const nombre   = document.getElementById('vp-nombre')?.value.trim()
  const tipoDoc  = document.getElementById('vp-tipo-doc')?.value
  const numDoc   = document.getElementById('vp-num-doc')?.value.trim()
  const fechaNac = document.getElementById('vp-fecha-nac')?.value
  const pais     = document.getElementById('vp-pais')?.value

  // Validar edad mínima 16 años
  let edadOk = false
  if (fechaNac) {
    const max = new Date(); max.setFullYear(max.getFullYear() - 16)
    edadOk = new Date(fechaNac) <= max
  }

  const ok = nombre?.length > 1 && tipoDoc && numDoc?.length > 3 && fechaNac && edadOk && pais
  document.getElementById('vp-btn-s1').disabled = !ok

  // Mostrar hint de edad si la fecha está puesta pero no cumple
  const dobWrap = document.getElementById('vp-dob-wrap')
  if (dobWrap) dobWrap.classList.toggle('error', !!(fechaNac && !edadOk))
}

function vpPreview(input, type) {
  // Legacy — ya no se usa (reemplazado por cámara)
  if (!input.files || !input.files[0]) return
  const zone = document.getElementById('vpu-' + type)
  if (zone) zone.classList.add('uploaded')

  // Thumbnail
  const reader = new FileReader()
  reader.onload = (e) => {
    let img = zone.querySelector('.vpu-thumb')
    if (!img) {
      img = document.createElement('img')
      img.className = 'vpu-thumb'
      img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:inherit;opacity:0.6;pointer-events:none;'
      zone.style.position = 'relative'
      zone.insertBefore(img, zone.firstChild)
    }
    img.src = e.target.result
  }
  reader.readAsDataURL(input.files[0])

}

async function vpIniciarProceso() {
  vpShowStep(5)
  document.querySelectorAll('.vp-proc-row').forEach(r => {
    r.classList.remove('active','done')
    r.querySelector('.vp-proc-icon').textContent = '◌'
    r.querySelector('.vp-proc-sub').textContent  = ''
  })

  const fallas = []

  // ── Paso 1: foto de documento ──────────────────────────────────────────────
  activarFilaProceso('vpc-r1')
  if (!vpCapturedDoc) {
    completarFilaProceso('vpc-r1', 'No se tomó foto del documento', true)
    fallas.push('Falta la foto del documento')
    await vpMostrarFallo(fallas); return
  }
  const match = vpGeminiResult
    ? (vpGeminiResult.nombre_coincide && vpGeminiResult.numero_coincide)
    : true   // si no hubo análisis Gemini, lo deja pasar (revisión manual)
  completarFilaProceso('vpc-r1',
    vpGeminiResult
      ? `Gemini Vision · ${match ? 'Datos coinciden ✓' : 'Revisión manual requerida ⚠'}`
      : 'Foto guardada · revisión manual'
  )

  // ── Paso 2: comparación de datos ──────────────────────────────────────────
  activarFilaProceso('vpc-r2')
  completarFilaProceso('vpc-r2', match ? 'Nombre ✓ · Número ✓' : 'Datos a revisar manualmente ⚠', !match)

  // ── Paso 3: selfie liveness ────────────────────────────────────────────────
  activarFilaProceso('vpc-r3')
  if (!vpCapturedSelfie) {
    completarFilaProceso('vpc-r3', 'No se tomó selfie de liveness', true)
    fallas.push('Falta el selfie de verificación de presencia')
  } else {
    completarFilaProceso('vpc-r3', `Liveness · "${vpLivenessInstruccion?.texto || 'completado'}" ✓`)
  }

  // ── Paso 4: selfie sosteniendo documento + generar imagen censurada ─────────
  activarFilaProceso('vpc-r4')
  if (!vpCapturedSelfieDoc) {
    completarFilaProceso('vpc-r4', 'No se tomó selfie con documento', true)
    fallas.push('Falta el selfie sosteniendo el documento')
  } else {
    completarFilaProceso('vpc-r4', 'Foto capturada ✓')
  }

  // ── Paso 5: generar imagen censurada para el admin ─────────────────────────
  activarFilaProceso('vpc-r5')
  if (vpCapturedSelfieDoc) {
    try {
      vpAnonBlob = await vpPixelarDocumento(vpCapturedSelfieDoc)
      completarFilaProceso('vpc-r5', 'Imagen censurada generada — cara visible, documento pixelado ✓')
      // Mostrar preview en paso 6a
      const previewImg = document.getElementById('vp-anon-preview')
      const previewPh  = document.getElementById('vp-anon-preview-ph')
      if (previewImg) { previewImg.src = URL.createObjectURL(vpAnonBlob); previewImg.style.display = 'block' }
      if (previewPh)  previewPh.style.display = 'none'
    } catch(e) {
      completarFilaProceso('vpc-r5', 'Error generando imagen censurada', true)
      fallas.push('No se pudo procesar la imagen')
    }
  }

  await new Promise(r => setTimeout(r, 300))

  if (fallas.length > 0) {
    await vpMostrarFallo(fallas)
  } else {
    vpShowStep('6a')
  }
}

// ── Muestra el paso de fallo con razones específicas ──
async function vpMostrarFallo(fallas) {
  const container = document.getElementById('vp-fail-reasons')
  if (container) {
    container.innerHTML = fallas
      .map(f => `<div class="vp-val-row red">✗ ${f}</div>`)
      .join('')
  }
  await new Promise(r => setTimeout(r, 300))
  vpShowStep('6b')
}

// ── Envío final al backend Python ──────────────────────────────────────────
// ── Helper: avanzar a paso 7 cuando el servidor ya procesó la verificación ─────
function _vpAvanzarAPaso7() {
  if (_authUser) {
    ;(async () => {
      try { await sb.rpc('claim_seat', { p_verification_id: vpVerificationId }) }
      catch (e) { console.warn('claim_seat link:', e) }
    })()
  }
  const emailEl = document.getElementById('vp-s7-email')
  const hintEl  = document.getElementById('vp-s7-email-hint')
  if (emailEl && _authUser?.email) {
    emailEl.textContent = _authUser.email
    if (hintEl) hintEl.style.display = 'block'
  } else if (hintEl) {
    hintEl.style.display = 'none'
  }
  vpShowStep(7)
  vpIniciarPolling(vpVerificationId)
}

async function vpEnviarVerificacion() {
  const btn = document.querySelector('#vp-s6a .vp-btn-main')
  if (btn) { btn.textContent = 'Enviando…'; btn.disabled = true }

  // ── Chequeo previo: si la verificación YA llegó al servidor, ir directo a paso 7.
  // Esto cubre el caso de "Reintentar envío" donde el submit anterior sí llegó pero
  // el cliente no recibió la respuesta (timeout, CORS previo, red cortada, etc.)
  if (vpVerificationId) {
    try {
      const preCheck = await fetch(`${VP_API_URL}/verify/status/${vpVerificationId}`)
      if (preCheck.ok) {
        const preData = await preCheck.json()
        if (preData.status === 'pendiente_revision' || preData.status === 'aprobado') {
          console.log('[verify] Pre-check: ya procesado (' + preData.status + ') — saltando upload')
          _vpAvanzarAPaso7()
          return
        }
      }
    } catch (preErr) {
      console.warn('[verify] Pre-check falló (normal en primer intento):', preErr.message)
    }
  }

  // Convertir blobs a base64
  function blobToB64(blob) {
    return new Promise((res, rej) => {
      const reader = new FileReader()
      reader.onload  = () => res(reader.result.split(',')[1])
      reader.onerror = rej
      reader.readAsDataURL(blob)
    })
  }

  // Comprimir imagen: resize a maxWidth y codificar como JPEG con calidad dada
  // Reduce imágenes de cámara de 4-6 MB a ~100-250 KB, evitando timeouts en conexiones lentas
  function comprimirImagen(blob, maxWidth = 1024, quality = 0.72) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(blob)
      img.onload = () => {
        URL.revokeObjectURL(url)
        const scale  = Math.min(1, maxWidth / img.width)
        const canvas = document.createElement('canvas')
        canvas.width  = Math.round(img.width  * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob falló')), 'image/jpeg', quality)
      }
      img.onerror = reject
      img.src = url
    })
  }

  try {
    // selfie_doc_b64 → selfie CON documento pixelado (vpAnonBlob ya lo tiene)
    // doc_face_b64   → SOLO la cara recortada del DNI (sin ningún dato visible)
    const docFaceBlob = vpCapturedDoc ? await vpExtraerCaraDoc(vpCapturedDoc).catch(() => null) : null

    // Comprimir ambas imágenes antes de codificar — reduce payload de ~16MB a ~400KB
    const [selfieComprimida, docComprimida] = await Promise.all([
      vpAnonBlob  ? comprimirImagen(vpAnonBlob,  1280, 0.72).catch(() => vpAnonBlob)  : Promise.resolve(null),
      docFaceBlob ? comprimirImagen(docFaceBlob,  800, 0.80).catch(() => docFaceBlob) : Promise.resolve(null),
    ])

    const [selfieDocB64, docB64] = await Promise.all([
      selfieComprimida ? blobToB64(selfieComprimida) : Promise.resolve(''),
      docComprimida    ? blobToB64(docComprimida)    : Promise.resolve(''),
    ])

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 90000)

    const resp = await fetch(`${VP_API_URL}/verify/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        verification_id: vpVerificationId,
        selfie_doc_b64:  selfieDocB64,   // selfie real con documento (para admin)
        doc_b64:         docB64,          // foto real del documento (para admin)
        gemini_match: (() => {
          if (!vpGeminiResult) return false
          const _paisDec = (document.getElementById('vp-pais')?.value || '').trim()
          const _paisOk  = _paisDec ? vpGeminiResult.pais_coincide : true
          return vpGeminiResult.nombre_coincide && vpGeminiResult.numero_coincide && vpGeminiResult.fecha_coincide && _paisOk
        })(),
        // Reforzar user_id y email en submit también (por si documento fue en otra sesión)
        user_id:       _authUser?.id || null,
        contact_email: _authUser?.email || null,
      }),
    })
    clearTimeout(timeout)

    if (!resp.ok) throw new Error(`Error del servidor: ${resp.status}`)
    const data = await resp.json()

    window._vpSession = window._vpSession || {}
    window._vpSession.verification_id = vpVerificationId
    window._vpSession.status = data.status

    _vpAvanzarAPaso7()
  } catch (e) {
    console.error('Error enviando verificacion:', e)

    // Antes de mostrar "Reintentar" — verificar si la verificación YA llegó al servidor.
    // Reintentamos hasta 4 veces con backoff progresivo por si el servidor tarda en escribir a DB.
    console.warn('[verify] Submit falló con:', e.name, e.message, '— verificando si llegó al server...')
    try {
      const delays = [1500, 3000, 5000, 7000]
      for (const delay of delays) {
        await new Promise(r => setTimeout(r, delay))
        try {
          const statusResp = await fetch(`${VP_API_URL}/verify/status/${vpVerificationId}`)
          if (statusResp.ok) {
            const statusData = await statusResp.json()
            console.log('[verify] Status check intento:', statusData.status)
            if (statusData.status === 'pendiente_revision' || statusData.status === 'aprobado') {
              _vpAvanzarAPaso7()
              return
            }
          }
        } catch (checkErr) {
          console.warn('[verify] Status check falló:', checkErr.message)
        }
      }
    } catch (_) { /* mostrar error normal */ }

    if (btn) { btn.textContent = 'Reintentar envío'; btn.disabled = false }
    showToast('Error al enviar — verificá tu conexión')
  }
}

// ── Polling: espera aprobación del admin ─────────────────────────────────────
let _vpPollingTimer = null

function vpIniciarPolling(verification_id) {
  clearInterval(_vpPollingTimer)
  _vpPollingTimer = setInterval(async () => {
    try {
      const resp = await fetch(`${VP_API_URL}/verify/status/${verification_id}`)
      if (!resp.ok) return
      const data = await resp.json()

      if (data.status === 'aprobado' && data.butaca_numero) {
        clearInterval(_vpPollingTimer)
        // Persistir en localStorage
        localStorage.setItem('cabildoos_butaca', data.butaca_numero)
        localStorage.setItem('cabildoos_vid',    verification_id)
        // OPTION B: vincular verification_id al profile (fuente de verdad para login futuro)
        // profiles.verification_id → verifications.butaca_numero (sin seat_number directo)
        try { await sb.rpc('claim_seat', { p_verification_id: verification_id }) } catch(e) { console.warn('claim_seat:', e) }
        // Mostrar #butaca en paso 8
        const numEl = document.getElementById('vp-seat-num')
        if (numEl) numEl.textContent = data.butaca_numero
        const hashEl = document.getElementById('vp-hash-display')
        if (hashEl) hashEl.textContent = `ID: ${verification_id.slice(0,8).toUpperCase()}`
        // Mostrar ID de recuperación completo
        const recovEl = document.getElementById('vp-recovery-id')
        if (recovEl) recovEl.textContent = verification_id
        const recovWrap = document.getElementById('vp-recovery-wrap')
        if (recovWrap) recovWrap.style.display = 'block'
        vpShowStep(8)
        // Actualizar UI principal
        vpAplicarButacaEnUI(data.butaca_numero)
      } else if (data.status === 'rechazado') {
        clearInterval(_vpPollingTimer)
        localStorage.removeItem('cabildoos_butaca')
        localStorage.removeItem('cabildoos_vid')
        vpShowStep(6)
        showToast('Tu verificación fue rechazada. Podés intentarlo de nuevo.')
      }
    } catch (e) {
      // Error de red — seguir intentando
    }
  }, 8000)  // cada 8 segundos
}

function vpFinalizar() {
  cerrarVerificacion()
  const butaca = localStorage.getItem('cabildoos_butaca')
  if (butaca) {
    vpAplicarButacaEnUI(butaca)
    // Verificación aprobada → mostrar selector de cabildos
    mostrarSelectorCabildos()
  } else {
    // Solicitud enviada — en revisión
    const lbl = document.getElementById('st-noident-label')
    if (lbl) lbl.textContent = 'Verificación en revisión…'
    showToast('Solicitud enviada — se actualizará cuando el admin apruebe')
    showScreen('verify-onboard')
  }
}

function vpAplicarButacaEnUI(butacaNum) {
  // Ocultar "sin verificar", mostrar "verificado"
  document.getElementById('st-noident').style.display = 'none'
  document.getElementById('st-ident').style.display   = 'flex'
  document.querySelectorAll('.av-seat-num').forEach(el => el.textContent = butacaNum)
  document.querySelectorAll('.nav-butaca').forEach(el => el.textContent = '#' + butacaNum)
  // Congress nav — nuevo seat label
  const seatLbl = document.getElementById('nav-seat-lbl')
  if (seatLbl) seatLbl.textContent = '#' + butacaNum
  const umenuButaca = document.getElementById('nav-umenu-butaca')
  if (umenuButaca) umenuButaca.textContent = 'Butaca #' + butacaNum
  // Actualizar dropdown badge (landing legacy)
  const ddBadge = document.getElementById('nav-dd-status-badge')
  if (ddBadge) { ddBadge.textContent = 'Verificado'; ddBadge.className = 'nav-dd-verified' }
  const ddButaca = document.getElementById('nav-dd-butaca')
  if (ddButaca) ddButaca.textContent = '· Butaca #' + butacaNum
  // Mostrar footer flotante
  mostrarFooter()
  // Actualizar hemiciclo: mostrar mi dot naranja
  if (!IS_DEMO) {
    MY_SEAT = parseInt(butacaNum) || 0
    cargarConteoReal() // refresca conteo real + mueve cámara a mi butaca
  }
}

// ── Restaurar estado verificado al recargar ──────────────────────────────────
function vpRestaurarEstado() {
  const butaca = localStorage.getItem('cabildoos_butaca')
  const vid    = localStorage.getItem('cabildoos_vid')
  if (butaca) {
    vpAplicarButacaEnUI(butaca)
    return
  }
  if (vid) {
    const lbl = document.getElementById('st-noident-label')
    if (lbl) lbl.textContent = 'Verificación en revisión…'
    vpIniciarPolling(vid)
  }
}
// ── Cargar cantidad real de butacas aprobadas desde Supabase ────────────────
async function cargarConteoReal() {
  if (IS_DEMO) return // en modo demo, el conteo viene de TOTAL_SEATS estático
  try {
    const count = await sb.rpc('get_butaca_count')
    const n = count.data ?? 0
    // NO modificar MY_SEAT aquí — es responsabilidad exclusiva de _onLogin/_onLogout
    // para evitar race conditions con la limpieza de localStorage
    TOTAL_SEATS = Math.min(Math.max(n, MY_SEAT), SEAT_CAPACITY) // nunca superar la capacidad
    await cargarPerfilesPublicos()     // cargar perfiles reales antes de redibujar
    buildSeats()
    const fmt = n.toLocaleString('es-VE').replace(',', '.')
    const el = document.getElementById('citizen-num')
    if (el) el.textContent = fmt
    const cl = document.querySelector('.cl-sub')
    if (cl) cl.textContent = `— ${fmt} ${n === 1 ? 'butaca' : 'butacas'} en el hemiciclo`
    // Si tengo butaca, centrar la cámara en mi dot naranja
    if (MY_SEAT > 0 && MY_SEAT_POS) {
      cam.tx = MY_SEAT_POS.x; cam.ty = MY_SEAT_POS.y; cam.ts = 3.2
    }
  } catch (e) {
    console.warn('cargarConteoReal:', e)
  }
}

// Ejecutar cuando el DOM esté listo (o inmediatamente si ya lo está)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { vpRestaurarEstado(); cargarConteoReal(); _cargarCatTheme(); cargarPreguntasActivas(); initQuestionsRealtime(); initVotesRealtime(); initProfilesRealtime(); initFollowsRealtime(); _audCheckActiveBadge(); _audInitBadgeRealtime() })
} else {
  vpRestaurarEstado()
  cargarConteoReal()
  _cargarCatTheme()
  cargarPreguntasActivas()
  initQuestionsRealtime()
  initVotesRealtime()
  initProfilesRealtime()
  initFollowsRealtime()
}

/// ── Cargar estado de follows desde Supabase ──────────────────────────────────
async function _loadFollows() {
  if (!MY_SEAT) return
  followingConfirmed.clear()
  followingPending.clear()
  followersConfirmed.clear()
  _pendingRequestsToMe = []

  const { data, error } = await sb.from('follows').select('id, from_seat, to_seat, status')
  if (error || !data) return

  data.forEach(f => {
    if (f.from_seat === MY_SEAT) {
      if (f.status === 'accepted') followingConfirmed.add(f.to_seat)
      else followingPending.add(f.to_seat)
    }
    if (f.to_seat === MY_SEAT) {
      if (f.status === 'accepted') followersConfirmed.add(f.from_seat)
      else _pendingRequestsToMe.push({ id: f.id, from_seat: f.from_seat })
    }
  })
  _renderMensajes()
}

// ── Realtime: follows en tiempo real ─────────────────────────────────────────
function initFollowsRealtime() {
  try {
    sb.channel('follows-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'follows' }, payload => {
        const f = payload.new
        if (f.to_seat === MY_SEAT && f.status === 'pending') {
          // Alguien me quiere seguir
          if (!_pendingRequestsToMe.find(r => r.id === f.id)) {
            _pendingRequestsToMe.push({ id: f.id, from_seat: f.from_seat })
            _renderMensajes()
            const alias = _profilesCache[f.from_seat]?.alias || `Butaca #${f.from_seat}`
            showToast(`${alias} quiere seguirte`)
          }
        }
        if (f.from_seat === MY_SEAT && f.status === 'pending') {
          followingPending.add(f.to_seat)
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'follows' }, payload => {
        const f = payload.new
        if (f.status !== 'accepted') return
        // Aceptaron mi solicitud
        if (f.from_seat === MY_SEAT) {
          followingPending.delete(f.to_seat)
          followingConfirmed.add(f.to_seat)
          const alias = _profilesCache[f.to_seat]?.alias || `Butaca #${f.to_seat}`
          showToast(`${alias} aceptó tu solicitud`)
          renderSocial('seguidos')
          // Actualizar botón en canvas si está abierto
          if (cardSeat === f.to_seat) {
            const fbtn = document.getElementById('pc-follow-btn')
            if (fbtn) { fbtn.textContent = 'Siguiendo'; fbtn.className = 'pc-follow following' }
          }
        }
        // Yo acepté (otro tab / redundante, ya manejado en aceptarSolicitud)
        if (f.to_seat === MY_SEAT) {
          _pendingRequestsToMe = _pendingRequestsToMe.filter(r => r.id !== f.id)
          followersConfirmed.add(f.from_seat)
          _renderMensajes()
          renderSocial('seguidores')
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'follows' }, payload => {
        const f = payload.old
        if (f.from_seat === MY_SEAT) {
          followingConfirmed.delete(f.to_seat)
          followingPending.delete(f.to_seat)
        }
        if (f.to_seat === MY_SEAT) {
          followersConfirmed.delete(f.from_seat)
          _pendingRequestsToMe = _pendingRequestsToMe.filter(r => r.from_seat !== f.from_seat)
          _renderMensajes()
        }
      })
      .subscribe()
  } catch(e) { console.warn('Realtime follows no disponible:', e) }
}

// ── Cargar mensajes no leídos al login ───────────────────────────────────────
async function _loadUnreadMessages() {
  if (!MY_SEAT) return
  _unreadConvos = {}
  const { data } = await sb.from('messages')
    .select('from_seat, text, created_at')
    .eq('to_seat', MY_SEAT)
    .is('read_at', null)
    .order('created_at', { ascending: false })
  if (!data) return
  data.forEach(m => {
    if (!_unreadConvos[m.from_seat]) {
      _unreadConvos[m.from_seat] = { count: 0, lastText: m.text, lastTime: m.created_at }
    }
    _unreadConvos[m.from_seat].count++
  })
  _renderMensajes()
}

// ── Realtime global para mensajes entrantes ───────────────────────────────────
function initMessagesRealtime() {
  try {
    const existing = sb.getChannels().find(c => c.topic === 'realtime:messages-inbox')
    if (existing) sb.removeChannel(existing)
    sb.channel('messages-inbox')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages'
      }, payload => {
        const m = payload.new
        if (m.to_seat !== MY_SEAT) return   // no es para mí

        // Si el modal de perfil está abierto en esa conversación, no notificar
        const modalOpen = document.getElementById('user-profile-modal')?.classList.contains('open')
        if (modalOpen && _upmSeat === m.from_seat && _upmCurTab === 'mensajes') return

        // Acumular no-leídos
        if (!_unreadConvos[m.from_seat]) {
          _unreadConvos[m.from_seat] = { count: 0, lastText: m.text, lastTime: m.created_at }
        }
        _unreadConvos[m.from_seat].count++
        _unreadConvos[m.from_seat].lastText = m.text
        _unreadConvos[m.from_seat].lastTime = m.created_at

        _renderMensajes()

        // Toast con preview del mensaje
        const alias = _profilesCache[m.from_seat]?.alias || `Butaca #${m.from_seat}`
        showToast(`💬 ${alias}: ${m.text.length > 40 ? m.text.slice(0,40)+'…' : m.text}`)
      })
      .subscribe()
  } catch(e) { console.warn('Realtime messages no disponible:', e) }
}

// ── Conversaciones: cargar todas (leídas + no leídas) y renderizar ────────────
const AVATAR_COLORS_CONVO = ['#1a1f3c','#f76a1e','#3ecf8e','#f04545','#6366f1','#0ea5e9','#8b5cf6','#ec4899']

async function _loadAndRenderConversaciones() {
  const el = document.getElementById('sf-mensajes-list')
  if (!el) return
  el.innerHTML = '<p style="color:#8a8a8a;font-size:13px;text-align:center;padding:32px">Cargando…</p>'

  if (!MY_SEAT) {
    el.innerHTML = '<p style="color:#8a8a8a;font-size:13px;text-align:center;padding:32px">Necesitás una butaca verificada</p>'
    return
  }

  // Solicitudes pendientes primero
  let html = ''
  if (_pendingRequestsToMe.length) {
    html += `<p style="font-size:10px;font-weight:700;color:#8a8a8a;letter-spacing:.06em;text-transform:uppercase;margin-bottom:10px">Solicitudes de seguimiento</p>`
    html += _pendingRequestsToMe.map(req => {
      const alias = _profilesCache[req.from_seat]?.alias || `Butaca #${req.from_seat}`
      return `<div class="sf-req-card">
        <p>👤 <strong>${escapeHtml(alias)}</strong> quiere seguirte</p>
        <div class="sf-req-btns">
          <button class="sf-req-accept" onclick="aceptarSolicitud('${req.id}',${req.from_seat})">✓ Aceptar</button>
          <button class="sf-req-reject" onclick="rechazarSolicitud('${req.id}',${req.from_seat})">✕ Rechazar</button>
        </div>
      </div>`
    }).join('')
  }

  // Notificaciones de propuestas no leídas
  const unreadNotifs = _notifications.filter(n => !n.read_at && n.type === 'new_proposal')
  if (unreadNotifs.length) {
    html += `<p style="font-size:10px;font-weight:700;color:#8a8a8a;letter-spacing:.06em;text-transform:uppercase;margin:${_pendingRequestsToMe.length?'16px':0} 0 10px">Nuevas propuestas</p>`
    html += unreadNotifs.map(n => {
      const alias = _profilesCache[n.from_seat]?.alias || `Butaca #${n.from_seat}`
      const t = new Date(n.created_at).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})
      const ci = n.from_seat % AVATAR_COLORS_CONVO.length
      return `<div class="sf-convo-row" onclick="_abrirPropuestaNotif('${n.proposal_id}','${n.from_seat}','${n.id}')">
        <div class="sf-convo-av" style="background:${AVATAR_COLORS_CONVO[ci]}">📣</div>
        <div class="sf-convo-info">
          <p class="sf-convo-name">${escapeHtml(alias)}</p>
          <p class="sf-convo-preview">${escapeHtml(n.message)}</p>
        </div>
        <div class="sf-convo-meta"><span class="sf-convo-time">${t}</span><span class="sf-convo-badge">!</span></div>
      </div>`
    }).join('')
  }

  // Todas las conversaciones de mensajes (leídas + no leídas)
  try {
    const { data } = await sb.from('messages')
      .select('from_seat, to_seat, text, created_at, read_at')
      .or(`from_seat.eq.${MY_SEAT},to_seat.eq.${MY_SEAT}`)
      .order('created_at', { ascending: false })

    // Agrupar por contraparte
    const convos = {}
    ;(data || []).forEach(m => {
      const other = m.from_seat === MY_SEAT ? m.to_seat : m.from_seat
      if (!convos[other]) {
        convos[other] = { seat: other, lastText: m.text, lastTime: m.created_at, unread: 0 }
      }
      if (m.to_seat === MY_SEAT && !m.read_at) convos[other].unread++
    })

    const convoList = Object.values(convos).sort((a,b) => new Date(b.lastTime) - new Date(a.lastTime))

    if (convoList.length) {
      html += `<p style="font-size:10px;font-weight:700;color:#8a8a8a;letter-spacing:.06em;text-transform:uppercase;margin:${(_pendingRequestsToMe.length||unreadNotifs.length)?'16px':0} 0 10px">Mensajes directos</p>`
      html += convoList.map(c => {
        const alias = _profilesCache[c.seat]?.alias || `Butaca #${c.seat}`
        const initials = alias.slice(0,2).toUpperCase()
        const ci = c.seat % AVATAR_COLORS_CONVO.length
        const t = new Date(c.lastTime).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})
        const preview = c.lastText.length > 45 ? c.lastText.slice(0,45)+'…' : c.lastText
        return `<div class="sf-convo-row" onclick="abrirUserProfile(${c.seat},'mensajes-inbox');cerrarSocialPanel()">
          <div class="sf-convo-av" style="background:${AVATAR_COLORS_CONVO[ci]}">
            ${initials}
            ${c.unread > 0 ? '<span class="unread-dot"></span>' : ''}
          </div>
          <div class="sf-convo-info">
            <p class="sf-convo-name">${escapeHtml(alias)}</p>
            <p class="sf-convo-preview">${escapeHtml(preview)}</p>
          </div>
          <div class="sf-convo-meta">
            <span class="sf-convo-time">${t}</span>
            ${c.unread > 0 ? `<span class="sf-convo-badge">${c.unread}</span>` : ''}
          </div>
        </div>`
      }).join('')
    }
  } catch(e) { console.warn('_loadAndRenderConversaciones:', e) }

  if (!html) {
    html = `<div style="text-align:center;padding:40px 16px;color:#8a8a8a">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" style="margin-bottom:12px;opacity:.3"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <p style="font-weight:500">No tenés mensajes aún</p>
      <p style="font-size:12px;margin-top:4px">Podés escribirle a cualquier ciudadano desde su perfil</p>
    </div>`
  }

  el.innerHTML = html
}

// ── Sistema de notificaciones ─────────────────────────────────────────────────
let _notifications = []   // [{id, from_seat, type, proposal_id, message, created_at}]

async function _loadNotifications() {
  if (!MY_SEAT) return
  const { data } = await sb.rpc('get_my_notifications', { p_seat: MY_SEAT })
  _notifications = data || []
  _renderNotifBadge()
}

function initNotificationsRealtime() {
  if (!MY_SEAT) return
  try {
    const chName  = 'notifications-live-' + MY_SEAT
    const existing = sb.getChannels().find(c => c.topic === 'realtime:' + chName)
    if (existing) sb.removeChannel(existing)
    sb.channel(chName)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `to_seat=eq.${MY_SEAT}`
      }, payload => {
        const n = payload.new
        _notifications.unshift(n)
        _renderNotifBadge()
        // Actualizar panel si está abierto
        if (document.getElementById('notif-modal')?.classList.contains('open')) _renderNotifPanel()

        // Toast con botón "Ver propuesta"
        const alias = _profilesCache[n.from_seat]?.alias || `Butaca #${n.from_seat}`
        _showNotifToast(n, alias)
      })
      .subscribe()
  } catch(e) { console.warn('Realtime notifications:', e) }
}

function _renderNotifBadge() {
  const propCount = (_notifications || []).filter(n => !n.read_at).length
  const msgCount  = Object.values(_unreadConvos || {}).reduce((s, c) => s + c.count, 0)
  const reqCount  = (_pendingRequestsToMe || []).length
  const total     = propCount + msgCount + reqCount

  const badge = document.getElementById('nav-notif-badge')
  if (badge) {
    badge.textContent   = total > 9 ? '9+' : total
    badge.style.display = total > 0 ? '' : 'none'
  }
  // Punto rojo en el ícono de campana cuando hay algo nuevo
  const dot = document.getElementById('nav-notif-live-dot')
  if (dot) dot.style.display = total > 0 ? '' : 'none'
}

// ══════════════════════════════════════════════════════════════
//  CONSENTIMIENTO DE PROPUESTA MODIFICADA
// ══════════════════════════════════════════════════════════════
;(function() {
  let _consentProposalId = null
  let _consentChannel    = null

  // Chequear si hay propuestas pendientes de consentimiento para esta butaca
  window._checkProposalConsent = async function() {
    if (!MY_SEAT) return
    try {
      const { data } = await sb.from('proposals')
        .select('id, text, original_text, original_cat, cat, consent_status, seat_number')
        .eq('seat_number', MY_SEAT)
        .eq('consent_status', 'pending')
        .eq('status', 'pending')
        .limit(1)
        .single()

      if (data) _openConsentModal(data)
    } catch(e) { /* sin propuestas pendientes */ }

    // Suscribir a cambios en proposals de este seat para detectar nuevas solicitudes
    _initConsentRealtime()
  }

  function _initConsentRealtime() {
    const chName = 'consent-proposals-' + MY_SEAT
    if (_consentChannel) sb.removeChannel(_consentChannel)
    _consentChannel = sb.channel(chName)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'proposals',
        filter: `seat_number=eq.${MY_SEAT}`
      }, payload => {
        const p = payload.new
        if (p.consent_status === 'pending' && p.status === 'pending') {
          _openConsentModal(p)
        }
        if (typeof renderPropuestas === 'function') renderPropuestas()
      })
      // Likes en tiempo real: escucha proposals UPDATE (el trigger sync actualiza proposals.likes)
      // Usar el count autoritative del DB en vez de delta sobre valor cacheado
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'proposals' }, payload => {
        const p = payload.new
        if (p?.id && typeof p.likes === 'number') _propSetCount(p.id, p.likes)
      })
      .subscribe()
  }

  function _openConsentModal(proposal) {
    _consentProposalId = proposal.id
    const origText = proposal.original_text || '(texto no disponible)'
    const newText  = proposal.text || ''

    document.getElementById('consent-orig-text').textContent = origText
    document.getElementById('consent-new-text').textContent  = newText
    document.getElementById('consent-overlay').classList.add('open')
  }

  window._consentClose = function() {
    document.getElementById('consent-overlay').classList.remove('open')
    _consentProposalId = null
  }

  window._consentRespond = async function(accepted) {
    if (!_consentProposalId) return
    const btnA = document.getElementById('consent-btn-accept')
    const btnD = document.getElementById('consent-btn-decline')
    btnA.disabled = true; btnD.disabled = true

    try {
      const { error } = await sb.rpc('respond_proposal_consent', {
        p_proposal_id: _consentProposalId,
        p_accepted:    accepted
      })
      if (error) throw error

      _consentClose()
      if (accepted) {
        showToast('✓ Aceptaste los cambios — el moderador podrá activar tu propuesta con tu nombre')
      } else {
        showToast('Rechazaste los cambios — la propuesta fue archivada')
      }
    } catch(e) {
      showToast('Error al responder: ' + (e.message || 'intentá de nuevo'))
      btnA.disabled = false; btnD.disabled = false
    }
  }
})()

// ── Panel de Notificaciones ────────────────────────────────────────────────────
function abrirNotifModal() {
  document.getElementById('notif-modal').classList.add('open')
  _renderNotifPanel()
}

function cerrarNotifModal() {
  document.getElementById('notif-modal').classList.remove('open')
}

function _relTime(iso) {
  if (!iso) return ''
  const diff = (Date.now() - new Date(iso)) / 1000
  if (diff < 60)    return 'ahora'
  if (diff < 3600)  return `hace ${Math.floor(diff / 60)}m`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
  return `hace ${Math.floor(diff / 86400)}d`
}

function _renderNotifPanel() {
  const el = document.getElementById('notif-list')
  if (!el) return

  const items = []

  // 1. Solicitudes de seguimiento (con Aceptar/Rechazar)
  ;(_pendingRequestsToMe || []).forEach(req => {
    const alias = _profilesCache[req.from_seat]?.alias || `Butaca #${req.from_seat}`
    const ci    = req.from_seat % AVATAR_COLORS_CONVO.length
    items.push({
      key: 'req_' + req.id, icBg: AVATAR_COLORS_CONVO[ci],
      icHtml: `<span style="font-size:14px;font-weight:800;color:#fff">${alias.slice(0,2).toUpperCase()}</span>`,
      title: `<strong>${escapeHtml(alias)}</strong> quiere seguirte`,
      sub: '', time: null, unread: true, noAction: true,
      extra: `<div class="notif-item-btns">
        <button class="notif-accept-btn" onclick="aceptarSolicitudNotif('${req.id}',${req.from_seat},event)">Aceptar</button>
        <button class="notif-reject-btn" onclick="rechazarSolicitudNotif('${req.id}',${req.from_seat},event)">Rechazar</button>
      </div>`,
      order: 0,
    })
  })

  // 2. Mensajes no leídos
  Object.entries(_unreadConvos || {}).forEach(([seat, data]) => {
    if (data.count <= 0) return
    const n   = Number(seat)
    const alias = _profilesCache[n]?.alias || `Butaca #${seat}`
    const pre = (data.lastText || 'Mensaje nuevo').slice(0, 52)
    items.push({
      key: 'msg_' + seat, icBg: '#E8F0FE',
      icHtml: '💬',
      title: `<strong>${escapeHtml(alias)}</strong> te envió ${data.count > 1 ? data.count + ' mensajes' : 'un mensaje'}`,
      sub: escapeHtml(pre), time: data.lastTime, unread: true,
      onclick: `abrirUserProfile(${n},'mensajes-inbox');cerrarNotifModal()`,
      order: 1,
    })
  })

  // 3. Nuevas propuestas de seguidos
  ;(_notifications || []).filter(n => n.type === 'new_proposal').forEach(n => {
    const alias = _profilesCache[n.from_seat]?.alias || `Butaca #${n.from_seat}`
    items.push({
      key: 'prop_' + n.id, icBg: '#FFF0E6',
      icHtml: '📣',
      title: `<strong>${escapeHtml(alias)}</strong> publicó una nueva propuesta`,
      sub: escapeHtml(n.message || ''), time: n.created_at, unread: !n.read_at,
      onclick: `_abrirPropuestaNotif('${n.proposal_id}','${n.from_seat}','${n.id}');cerrarNotifModal()`,
      order: 2,
    })
  })

  // 4. Propuesta aprobada
  ;(_notifications || []).filter(n => n.type === 'proposal_approved').forEach(n => {
    items.push({
      key: 'appr_' + n.id, icBg: '#E6F4EA',
      icHtml: '✅',
      title: `Tu propuesta fue <strong>aprobada</strong>`,
      sub: n.message || '', time: n.created_at, unread: !n.read_at,
      onclick: `_markSingleNotifRead('${n.id}');cerrarNotifModal()`,
      order: 1,
    })
  })

  // 5. Pregunta activa (votación abierta)
  ;(_notifications || []).filter(n => n.type === 'question_active').forEach(n => {
    items.push({
      key: 'qact_' + n.id, icBg: '#EEF2FF',
      icHtml: '🗳️',
      title: `Tu pregunta está <strong>activa en el hemiciclo</strong>`,
      sub: n.message || '', time: n.created_at, unread: !n.read_at,
      onclick: `_markSingleNotifRead('${n.id}');cerrarNotifModal()`,
      order: 1,
    })
  })

  // 6. Propuesta rechazada
  ;(_notifications || []).filter(n => n.type === 'proposal_rejected').forEach(n => {
    items.push({
      key: 'rej_' + n.id, icBg: '#FEF2F2',
      icHtml: '❌',
      title: `Tu propuesta fue <strong>rechazada</strong>`,
      sub: n.message || '', time: n.created_at, unread: !n.read_at,
      onclick: `_markSingleNotifRead('${n.id}');cerrarNotifModal()`,
      order: 1,
    })
  })

  // 7. Consentimiento de edición — admin modificó tu propuesta, necesita tu aprobación
  ;(_notifications || []).filter(n => n.type === 'proposal_consent').forEach(n => {
    items.push({
      key: 'consent_' + n.id, icBg: '#FFF7ED',
      icHtml: '✏️',
      title: `El moderador <strong>editó tu propuesta</strong> — necesita tu aprobación`,
      sub: n.message || 'Tocá para revisar los cambios',
      time: n.created_at, unread: !n.read_at,
      onclick: `_markSingleNotifRead('${n.id}');cerrarNotifModal();_checkProposalConsent()`,
      order: 0,
    })
  })

  if (!items.length) {
    el.innerHTML = `<div class="notif-empty">
      <div class="notif-empty-icon">🔔</div>
      <p>Todo al día</p>
      <span>Las notificaciones aparecen aquí</span>
    </div>`
    return
  }

  // Ordenar: no leídos primero, luego por tipo, luego por tiempo
  items.sort((a, b) => {
    if (a.unread !== b.unread) return a.unread ? -1 : 1
    if (a.order !== b.order)   return a.order - b.order
    if (!a.time) return -1; if (!b.time) return 1
    return new Date(b.time) - new Date(a.time)
  })

  el.innerHTML = items.map(item => `
    <div class="notif-item${item.unread ? ' unread' : ''}${item.noAction ? ' no-action' : ''}"
         ${item.onclick ? `onclick="${item.onclick}"` : ''}>
      <div class="notif-ic" style="background:${item.icBg}">${item.icHtml}</div>
      <div class="notif-content">
        <p class="notif-item-title">${item.title}</p>
        ${item.sub ? `<p class="notif-item-sub">${item.sub}</p>` : ''}
        <span class="notif-item-time">${_relTime(item.time)}</span>
        ${item.extra || ''}
      </div>
      ${item.unread ? '<div class="notif-unread-dot"></div>' : ''}
    </div>`
  ).join('')
}

async function aceptarSolicitudNotif(reqId, fromSeat, ev) {
  ev.stopPropagation()
  const btn = ev.currentTarget; btn.textContent = '…'; btn.disabled = true
  const { error } = await sb.from('follows').update({ status: 'accepted' }).eq('id', reqId)
  if (!error) {
    _pendingRequestsToMe = _pendingRequestsToMe.filter(r => r.id !== reqId)
    followersConfirmed.add(fromSeat)
    _renderNotifPanel(); _renderNotifBadge()
    showToast(`Aceptaste a Butaca #${fromSeat}`)
  } else { btn.textContent = 'Aceptar'; btn.disabled = false }
}

async function rechazarSolicitudNotif(reqId, fromSeat, ev) {
  ev.stopPropagation()
  const btn = ev.currentTarget; btn.textContent = '…'; btn.disabled = true
  const { error } = await sb.from('follows').delete().eq('id', reqId)
  if (!error) {
    _pendingRequestsToMe = _pendingRequestsToMe.filter(r => r.id !== reqId)
    _renderNotifPanel(); _renderNotifBadge()
    showToast('Solicitud rechazada')
  } else { btn.textContent = 'Rechazar'; btn.disabled = false }
}

async function _markAllNotifsRead() {
  if (MY_SEAT) await sb.rpc('mark_all_notifications_read', { p_seat: MY_SEAT })
  _notifications = _notifications.map(n => ({ ...n, read_at: new Date().toISOString() }))
  _renderNotifBadge()
  _renderNotifPanel()
}

async function _markSingleNotifRead(id) {
  const now = new Date().toISOString()
  await sb.from('notifications').update({ read_at: now }).eq('id', id)
  _notifications = _notifications.map(n => n.id === id ? { ...n, read_at: now } : n)
  _renderNotifBadge()
  _renderNotifPanel()
}

function _showNotifToast(n, alias) {
  const existing = document.getElementById('notif-toast')
  if (existing) existing.remove()

  let msg, btnTxt, btnAction

  if (n.type === 'proposal_consent') {
    // Notificación urgente: el moderador editó tu propuesta y espera tu respuesta
    msg      = '✏️ El moderador editó tu propuesta — necesita tu aprobación'
    btnTxt   = 'Revisar'
    btnAction = `_markSingleNotifRead('${n.id}');_checkProposalConsent()`
  } else if (n.type === 'proposal_approved') {
    msg      = '✅ Tu propuesta fue aprobada'
    btnTxt   = 'Ver'
    btnAction = `_abrirPropuestaNotif('${n.proposal_id}','${n.from_seat}','${n.id}')`
  } else if (n.type === 'proposal_rejected') {
    msg      = '❌ Tu propuesta fue rechazada'
    btnTxt   = 'Ver'
    btnAction = `_abrirPropuestaNotif('${n.proposal_id}','${n.from_seat}','${n.id}')`
  } else {
    // new_proposal u otros
    msg      = `📣 <strong>${escapeHtml(alias)}</strong> publicó una propuesta`
    btnTxt   = 'Ver'
    btnAction = `_abrirPropuestaNotif('${n.proposal_id}','${n.from_seat}','${n.id}')`
  }

  const toast = document.createElement('div')
  toast.id = 'notif-toast'
  toast.style.cssText = `
    position:fixed; bottom:60px; left:50%; transform:translateX(-50%);
    background:#1d1d1d; color:#fff; border-radius:14px; padding:12px 18px;
    font-size:13px; font-weight:500; z-index:2000; display:flex;
    align-items:center; gap:12px; box-shadow:0 8px 32px rgba(0,0,0,.3);
    max-width:360px; animation:toastIn .3s ease;
  `
  toast.innerHTML = `
    <span>${msg}</span>
    <button onclick="${btnAction};document.getElementById('notif-toast')?.remove()"
      style="background:#fff;color:#1d1d1d;border:none;border-radius:8px;
             padding:5px 12px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0">
      ${btnTxt}
    </button>
  `
  document.body.appendChild(toast)
  // Consentimiento se queda 12 segundos, el resto 6s
  setTimeout(() => { if (toast.parentNode) toast.remove() }, n.type === 'proposal_consent' ? 12000 : 6000)
}

async function _abrirPropuestaNotif(proposalId, fromSeat, notifId) {
  // Marcar como leída
  await sb.rpc('mark_notification_read', { p_id: notifId })
  _notifications = _notifications.filter(n => n.id !== notifId)
  _renderNotifBadge()

  // Quitar toast
  const t = document.getElementById('notif-toast')
  if (t) t.remove()

  // Abrir perfil del autor en tab propuestas
  abrirUserProfile(Number(fromSeat), 'propuestas')
}

// Limpiar al cerrar sesión
function _clearNotifications() {
  _notifications = []
  _renderNotifBadge()
}

// ── Realtime de votos y perfiles — todos ven lo mismo, siempre actualizado ──
let _votesPollingInterval = null
let _votesChannel = null
let _profilesChannel = null

function initVotesRealtime() {
  if (_votesPollingInterval) clearInterval(_votesPollingInterval)

  // Realtime: escuchar vote_seats (participación pública) en lugar de votes.
  // La tabla votes tiene RLS bloqueado — nadie puede leer votos directamente.
  // vote_seats solo registra "butaca X participó" — sin el contenido del voto.
  if (_votesChannel) { try { sb.removeChannel(_votesChannel) } catch(_) {} }
  try {
    _votesChannel = sb.channel('votes-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vote_seats' }, payload => {
        const seat = payload.new?.seat_number
        if (!seat) return
        if (_profilesCache[seat]) {
          _profilesCache[seat].votes = (_profilesCache[seat].votes || 0) + 1
          buildSeats()
        } else {
          cargarPerfilesPublicos().then(() => buildSeats())
        }
      })
      .subscribe()
  } catch(e) { console.warn('votes-live realtime:', e) }

  // Fallback: rebuild completo cada 60s para corregir cualquier desync acumulado
  _votesPollingInterval = setInterval(() => {
    cargarPerfilesPublicos().then(() => buildSeats())
  }, 60000)
}

// ── Realtime de perfiles: cambios de alias, privacidad o frase → todos los ven al instante ──
function initProfilesRealtime() {
  if (_profilesChannel) { try { sb.removeChannel(_profilesChannel) } catch(_) {} }
  try {
    _profilesChannel = sb.channel('profiles-live')
      // Cambios en seat_identities → refrescar hemiciclo para todos
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'seat_identities' }, async () => {
        await cargarPerfilesPublicos()
        buildSeats()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'seat_identities' }, async () => {
        await cargarPerfilesPublicos()
        buildSeats()
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'seat_identities' }, async () => {
        await cargarPerfilesPublicos()
        buildSeats()
      })
      // DELETE en profiles → si es el usuario actual, cerrar sesión inmediatamente
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'profiles' }, async (payload) => {
        if (_authUser && payload.old?.id === _authUser.id) {
          await sb.auth.signOut().catch(() => {})
          _onLogout()
        }
      })
      .subscribe()
  } catch(e) { console.warn('profiles-live realtime:', e) }
}

// ── Realtime: auto-actualiza preguntas cuando el admin crea/activa/cierra/borra una ──
function initQuestionsRealtime() {
  try {
    sb.channel('questions-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'questions' }, async payload => {
        const ev   = payload.eventType          // 'INSERT' | 'UPDATE' | 'DELETE'
        const newQ = payload.new || {}
        const oldQ = payload.old || {}

        // ── DELETE: pregunta eliminada ──────────────────────────────────────
        if (ev === 'DELETE') {
          const deletedId = oldQ.id
          if (_debateQId === deletedId) {
            if (_debateCdIv) { clearInterval(_debateCdIv); _debateCdIv = null }
            cerrarDebate()
            _debateQId   = null
            _debateEnded = false
            showToast('La votación fue eliminada por el administrador')
          }
          await cargarPreguntasActivas()
          return
        }

        const q = newQ

        // ── CLOSED: admin cerró la pregunta ─────────────────────────────────
        if (q.status === 'cerrada') {
          if (_debateQId === q.id && !_debateEnded) {
            if (_debateCdIv) { clearInterval(_debateCdIv); _debateCdIv = null }
            _debateEndsAt = new Date()
            const valEl = document.getElementById('dp-cd-val')
            const lblEl = document.getElementById('dp-cd-lbl')
            if (valEl) { valEl.textContent = 'Finalizada'; valEl.className = 'dp-cd-val ended' }
            if (lblEl) lblEl.textContent = 'Estado'
            _dpSetEndedUI(true)
          }
          PREGUNTAS_DATA.forEach((qdata, i) => {
            if (qdata.id === q.id) {
              const timerEl = document.getElementById(`q-timer-${i}`)
              if (timerEl) { timerEl.textContent = 'Finalizada'; timerEl.classList.add('ended') }
            }
          })
        }

        // ── UPDATE con nuevo ends_at: reiniciar countdown ────────────────────
        if (ev === 'UPDATE' && q.status === 'activa' && q.ends_at) {
          const idx = PREGUNTAS_DATA.findIndex(p => p.id === q.id)
          if (idx !== -1) {
            PREGUNTAS_DATA[idx].ends_at         = q.ends_at
            PREGUNTAS_DATA[idx].duration_minutes = q.duration_minutes
          }
          if (_debateQId === q.id && !_debateEnded) {
            _dpStartCountdown(q.ends_at)
            showToast('⏱ Duración actualizada')
          }
        }

        await cargarPreguntasActivas()
      })
      .subscribe()
  } catch(e) { console.warn('Realtime no disponible:', e) }
}

function entrarComoObservador() {
  document.body.classList.add('observer-mode')
  showScreen('congress')
}

function irACongreso() {
  showScreen('congress'); resizeCanvas(); if (MY_SEAT_POS) resetCamera()
}

function volverALanding() {
  // Landing ya no es el default — permanecemos en congress
  // Mantenemos la función para compatibilidad con código legacy
  showScreen('congress')
}

function voIniciarVerificacion() {
  try {
    abrirVerificacion()
  } catch(e) {
    console.error('abrirVerificacion error:', e)
    showToast('Error al abrir verificación: ' + e.message)
  }
}

// ── Guard: redirige a verificación si el usuario no tiene butaca ─────────────
function _requireButaca() {
  if (MY_SEAT > 0) return true   // verificado → permitir
  if (_isObserverMode()) {
    showToast('Modo observador — sin permiso para participar')
    return false
  }
  if (_authUser) {
    // Logueado pero sin butaca → pantalla de verificación
    showScreen('verify-onboard')
    showToast('Verificá tu identidad para participar')
  } else {
    abrirAuth('registro')
  }
  return false
}

function voExplorar() {
  showScreen('congress')
  // Bloquear TODOS los elementos de congress por 500ms para matar el ghost click
  // que llega ~300ms después del tap en "Explorar el cabildo"
  const congressEl = document.getElementById('congress')
  if (congressEl) {
    congressEl.style.pointerEvents = 'none'
    setTimeout(() => { congressEl.style.pointerEvents = '' }, 500)
  }
  resizeCanvas()
  // Cargar datos reales: conteo + perfiles + preguntas
  cargarConteoReal().then(() => {
    // Centrar la cámara en el primer seat real visible
    if (SEATS.length > 0) {
      cam.tx = SEATS[0].x
      cam.ty = SEATS[0].y
      cam.ts = 3.5
    }
  })
  cargarPreguntasActivas()
  // Actualizar botón del mapa para usuario sin butaca
  _actualizarBtnButaca()
}

function voActualizarAlias(alias) {
  const lbl = document.getElementById('vo-alias-lbl')
  if (lbl && alias) lbl.textContent = `Bienvenido, ${alias}`
}

// ══════════════════════════════════════════════════════════════
//  MI PERFIL
// ══════════════════════════════════════════════════════════════
let perfilPublico = false  // derivado: true si ANY campo está visible
let _visibilidad  = { alias: false, phrase: false, votes: false }  // estado granular

async function abrirMiPerfil() {
  if (!_requireButaca()) return
  // Poblar con datos reales del perfil
  if (_authProfile) {
    document.getElementById('mp-alias-input').value  = _authProfile.alias  || ''
    document.getElementById('mp-phrase-input').value = _authProfile.phrase || ''
  }
  if (_authUser) {
    document.getElementById('mp-strip-email').textContent = _authUser.email || ''
  }
  // Sincronizar toggles granulares con valores de DB
  _visibilidad.alias  = !!_authProfile?.show_alias
  _visibilidad.phrase = !!_authProfile?.show_phrase
  _visibilidad.votes  = !!_authProfile?.show_votes
  perfilPublico = _visibilidad.alias || _visibilidad.phrase
  _syncVisibilidadUI()

  // Sincronizar swatch de color activo
  const currentColor = _authProfile?.card_color || 'orange'
  document.querySelectorAll('.mp-color-swatch').forEach(s => s.classList.remove('active'))
  const activeEl = document.getElementById('mpc-' + currentColor)
  if (activeEl) activeEl.classList.add('active')

  // Stats: Supabase es la fuente de verdad; localStorage solo como fallback
  let cntSi = 0, cntNo = 0, cntAbs = 0
  if (MY_SEAT > 0) {
    try {
      const { data } = await sb.rpc('get_my_vote_stats', { p_seat_number: MY_SEAT })
      if (data) {
        data.forEach(row => {
          if (row.vote_plain === 'si')  cntSi  = Number(row.cnt)
          if (row.vote_plain === 'no')  cntNo  = Number(row.cnt)
          if (row.vote_plain === 'abs') cntAbs = Number(row.cnt)
        })
      }
    } catch(e) {
      // Fallback a localStorage si Supabase falla
      console.warn('get_my_vote_stats fallback a localStorage:', e)
      const votos = JSON.parse(localStorage.getItem('cabildoos_votos') || '{}')
      const vals  = Object.values(votos)
      cntSi  = vals.filter(v => v.voto === 'si').length
      cntNo  = vals.filter(v => v.voto === 'no').length
      cntAbs = vals.filter(v => v.voto === 'abs').length
    }
  }

  const elSi  = document.getElementById('mp-count-si')
  const elNo  = document.getElementById('mp-count-no')
  const elAbs = document.getElementById('mp-count-abs')
  if (elSi)  elSi.textContent  = cntSi
  if (elNo)  elNo.textContent  = cntNo
  if (elAbs) elAbs.textContent = cntAbs
  document.getElementById('mi-perfil-overlay').classList.add('open')

  // Ganadoras: directo desde Supabase
  const elGan = document.getElementById('mp-count-ganadora')
  if (elGan) elGan.textContent = '…'
  if (MY_SEAT > 0) {
    try {
      const { data } = await sb.rpc('get_my_winning_decisions', { p_seat_number: MY_SEAT })
      if (elGan) elGan.textContent = (data ?? 0)
    } catch(e) {
      if (elGan) elGan.textContent = '—'
    }
  } else {
    if (elGan) elGan.textContent = '0'
  }
}

// ══════════════════════════════════════════════════════════════
//  ESTADÍSTICAS
// ══════════════════════════════════════════════════════════════
async function abrirEstadisticas() {
  document.getElementById('stats-panel').classList.add('open')
  const body = document.getElementById('sp-body')
  body.innerHTML = '<div class="sp-loading">Cargando resultados…</div>'

  try {
    const { data, error } = await sb.rpc('get_all_question_results')
    if (error) throw error
    _renderStatsPanel(data || [])
  } catch(e) {
    console.error('abrirEstadisticas:', e)
    body.innerHTML = '<div class="sp-empty">Error al cargar resultados.<br>Intentá de nuevo.</div>'
  }
}

function cerrarEstadisticas() {
  document.getElementById('stats-panel').classList.remove('open')
}

function _renderStatsPanel(rows) {
  const body = document.getElementById('sp-body')
  if (!rows || rows.length === 0) {
    body.innerHTML = '<div class="sp-empty">No hay preguntas registradas aún.</div>'
    return
  }

  const html = rows.map(r => {
    const theme   = (window._CAT_THEME?.[r.category] || _CAT_DEFAULT)
    const si      = Number(r.cnt_si), no = Number(r.cnt_no), abs = Number(r.cnt_abs)
    const revealed = si + no + abs
    const pctSi   = revealed > 0 ? ((si  / revealed) * 100).toFixed(0) : 0
    const pctNo   = revealed > 0 ? ((no  / revealed) * 100).toFixed(0) : 0
    const pctAbs  = revealed > 0 ? ((abs / revealed) * 100).toFixed(0) : 0
    const ended   = r.ends_at ? new Date(r.ends_at) < new Date() : true
    const ganaSi  = si > no
    const empate  = si === no && revealed > 0

    let resultBadge = ''
    if (!ended) {
      resultBadge = '<span class="sp-result-badge open">En curso</span>'
    } else if (revealed === 0) {
      resultBadge = '<span class="sp-result-badge tie">Sin votos</span>'
    } else if (empate) {
      resultBadge = '<span class="sp-result-badge tie">Empate</span>'
    } else {
      resultBadge = ganaSi
        ? '<span class="sp-result-badge won">✓ Ganó SÍ</span>'
        : '<span class="sp-result-badge lost">✓ Ganó NO</span>'
    }

    const catPill = r.category
      ? `<span class="sp-q-pill" style="background:${theme.pill};color:${theme.txt}">${r.category}</span>`
      : ''

    return `<div class="sp-q-card">
      <div class="sp-q-top">
        <p class="sp-q-text">${r.text}</p>
        ${catPill}
      </div>
      <div class="sp-bars">
        <div class="sp-bar-row">
          <span class="sp-bar-lbl si">SÍ</span>
          <div class="sp-bar-track"><div class="sp-bar-fill si" style="width:${pctSi}%"></div></div>
          <span class="sp-bar-num">${si}</span>
          <span class="sp-bar-pct">${pctSi}%</span>
        </div>
        <div class="sp-bar-row">
          <span class="sp-bar-lbl no">NO</span>
          <div class="sp-bar-track"><div class="sp-bar-fill no" style="width:${pctNo}%"></div></div>
          <span class="sp-bar-num">${no}</span>
          <span class="sp-bar-pct">${pctNo}%</span>
        </div>
        <div class="sp-bar-row">
          <span class="sp-bar-lbl abs">ABS</span>
          <div class="sp-bar-track"><div class="sp-bar-fill abs" style="width:${pctAbs}%"></div></div>
          <span class="sp-bar-num">${abs}</span>
          <span class="sp-bar-pct">${pctAbs}%</span>
        </div>
      </div>
      <div class="sp-q-footer">
        <span class="sp-bar-lbl" style="color:var(--mid);font-size:10px">${revealed} votos totales</span>
        ${resultBadge}
      </div>
    </div>`
  }).join('')

  body.innerHTML = html
}

function mpMarkDirty(field) {
  // noop — save button becomes visible via CSS :focus-within
}

async function mpSetColor(color) {
  // Actualizar UI inmediatamente
  document.querySelectorAll('.mp-color-swatch').forEach(s => s.classList.remove('active'))
  const el = document.getElementById('mpc-' + color)
  if (el) el.classList.add('active')
  // Guardar en DB
  const { error } = await sb.rpc('save_my_seat_field', { p_field: 'card_color', p_value: color })
  if (error) { showToast('Error al guardar color'); return }
  if (_authProfile) _authProfile.card_color = color
  // Actualizar caché propio
  if (MY_SEAT > 0 && _profilesCache[MY_SEAT]) _profilesCache[MY_SEAT].cardColor = color
  showToast('✓ Color guardado')
}

async function mpSaveField(field) {
  if (!_authUser) return
  const input = document.getElementById('mp-' + field + '-input')
  const val = sanitizeInput(input.value)
  const update = {}
  update[field] = val
  const { error } = await sb.rpc('save_my_seat_field', { p_field: field, p_value: val })
  if (error) { showToast('Error al guardar'); return }
  // Actualizar cache local
  if (!_authProfile) _authProfile = {}
  _authProfile[field] = val
  // Reflejar en nav si es alias
  if (field === 'alias' && val) {
    document.getElementById('nav-user-alias').textContent = val
  }
  input.blur()
  showToast('✓ Guardado')
}
function cerrarMiPerfil() {
  const ov = document.getElementById('mi-perfil-overlay')
  ov.classList.add('closing')
  ov.classList.remove('open')
  setTimeout(() => ov.classList.remove('closing'), 200)
  document.getElementById('mp-bar-si').style.width  = '0%'
  document.getElementById('mp-bar-no').style.width  = '0%'
  document.getElementById('mp-bar-abs').style.width = '0%'
}
// ── Visibilidad granular de perfil ───────────────────────────────────────────
function _syncVisibilidadUI() {
  document.getElementById('mp-toggle-alias')?.classList.toggle('on',  _visibilidad.alias)
  document.getElementById('mp-toggle-phrase')?.classList.toggle('on', _visibilidad.phrase)
}

let _pendingVisibilidadField = null
let _pendingVisibilidadValue = null

function toggleVisibilidad(field) {
  const newVal = !_visibilidad[field]
  _pendingVisibilidadField = field
  _pendingVisibilidadValue = newVal
  const labels = { alias: 'tu alias', phrase: 'tu frase', votes: 'tus votaciones' }
  document.getElementById('pco-icon').textContent  = newVal ? '🌐' : '🔒'
  document.getElementById('pco-title').textContent = newVal
    ? `¿Mostrar ${labels[field]}?`
    : `¿Ocultar ${labels[field]}?`
  document.getElementById('pco-body').textContent  = newVal
    ? `${labels[field].charAt(0).toUpperCase() + labels[field].slice(1)} pasará a ser visible para todos los usuarios de la plataforma de forma inmediata.`
    : `${labels[field].charAt(0).toUpperCase() + labels[field].slice(1)} dejará de ser visible para todos de forma inmediata.`
  document.getElementById('pco-btn').textContent   = newVal ? 'Sí, mostrar' : 'Sí, ocultar'
  document.getElementById('pco-btn').style.background = newVal ? '#1d1d1d' : '#ef4444'
  document.getElementById('privacy-confirm-overlay').style.display = 'flex'
}

function cerrarPrivacyConfirm() {
  document.getElementById('privacy-confirm-overlay').style.display = 'none'
  _pendingVisibilidadField = null
  _pendingVisibilidadValue = null
}

async function confirmarCambioPrivacidad() {
  if (!_pendingVisibilidadField) return
  const field = _pendingVisibilidadField
  const newVal = _pendingVisibilidadValue
  cerrarPrivacyConfirm()

  // Aplicar el cambio localmente primero (optimistic)
  _visibilidad[field] = newVal
  perfilPublico = _visibilidad.alias || _visibilidad.phrase || _visibilidad.votes
  _syncVisibilidadUI()

  const { error } = await sb.rpc('set_profile_visibility', {
    p_show_alias:  _visibilidad.alias,
    p_show_phrase: _visibilidad.phrase,
    p_show_votes:  _visibilidad.votes,
  })
  if (error) {
    // Revertir si falló
    _visibilidad[field] = !newVal
    perfilPublico = _visibilidad.alias || _visibilidad.phrase || _visibilidad.votes
    _syncVisibilidadUI()
    showToast('Error al guardar — intentá de nuevo', true)
    return
  }

  // Sincronizar _authProfile
  if (_authProfile) {
    _authProfile.show_alias  = _visibilidad.alias
    _authProfile.show_phrase = _visibilidad.phrase
    _authProfile.show_votes  = _visibilidad.votes
    _authProfile.is_public   = perfilPublico
  }

  // Actualizar caché: mi butaca refleja la visibilidad nueva
  if (MY_SEAT > 0) {
    _profilesCache[MY_SEAT] = {
      alias:      _visibilidad.alias  ? (_authProfile?.alias  || null) : null,
      phrase:     _visibilidad.phrase ? (_authProfile?.phrase || '')   : '',
      votes:      _myVoteCount || 0,
      showAlias:  _visibilidad.alias,
      showPhrase: _visibilidad.phrase,
      showVotes:  _visibilidad.votes,
      isPublic:   perfilPublico,
    }
  }

  buildSeats()
  const fieldLabel = { alias: 'Alias', phrase: 'Frase', votes: 'Votaciones' }[field]
  showToast(newVal ? `✓ ${fieldLabel} ahora visible` : `✓ ${fieldLabel} ocultado`)
}

// Compatibilidad retroactiva — ya no se usa pero puede quedar referenciado en otros lugares
function togglePerfilPublico() { toggleVisibilidad('alias') }

// ══════════════════════════════════════════════════════════════
//  PROPONER PREGUNTA
// ══════════════════════════════════════════════════════════════
function abrirPropuesta() {
  // Reset form
  document.getElementById('pp-text').value = ''
  document.getElementById('pp-context').value = ''
  document.getElementById('pp-video').value = ''
  document.getElementById('pp-links-list').innerHTML = ''
  document.getElementById('pp-add-link-btn').disabled = false
  document.querySelectorAll('.pp-cat').forEach(b => b.classList.remove('sel'))
  actualizarPropuesta()
  ppContextCount()
  document.getElementById('propuesta-overlay').classList.add('open')
  setTimeout(() => document.getElementById('pp-text').focus(), 200)
}

function cerrarPropuesta() {
  document.getElementById('propuesta-overlay').classList.remove('open')
  const iframe = document.getElementById('pp-video-iframe')
  if (iframe) iframe.src = ''
  const wrap = document.getElementById('pp-video-preview')
  if (wrap) wrap.style.display = 'none'
}

function actualizarPropuesta() {
  const n = document.getElementById('pp-text').value.length
  const badge = document.getElementById('pp-char-badge')
  if (badge) {
    badge.textContent = n + '/280'
    badge.className = 'pp-char-badge' + (n > 250 ? ' warn' : '') + (n >= 280 ? ' over' : '')
  }
  document.getElementById('pp-submit').disabled = n < 10
}

function ppContextCount() {
  const n = document.getElementById('pp-context').value.length
  const badge = document.getElementById('pp-context-badge')
  if (badge) badge.textContent = n + '/1200'
}

function selCat(btn) {
  document.querySelectorAll('.pp-cat').forEach(b => b.classList.remove('sel'))
  btn.classList.add('sel')
}

let _ppLinkCount = 0
function ppAgregarLink() {
  const list = document.getElementById('pp-links-list')
  if (list.children.length >= 3) return
  _ppLinkCount++
  const id = 'pp-link-' + _ppLinkCount
  const row = document.createElement('div')
  row.className = 'pp-link-row'
  row.id = id
  row.innerHTML = `
    <input type="url" placeholder="https://..." />
    <button class="pp-link-remove" onclick="ppRemoveLink('${id}')">×</button>
  `
  list.appendChild(row)
  if (list.children.length >= 3) {
    document.getElementById('pp-add-link-btn').disabled = true
  }
}

function ppRemoveLink(id) {
  const row = document.getElementById(id)
  if (row) row.remove()
  document.getElementById('pp-add-link-btn').disabled = false
}

function _ppVideoPreview(url) {
  const wrap = document.getElementById('pp-video-preview')
  const iframe = document.getElementById('pp-video-iframe')
  if (!wrap || !iframe) return
  const embedUrl = _imYoutubeEmbed(url.trim())
  if (embedUrl) {
    iframe.referrerPolicy = 'origin'
    iframe.src = embedUrl
    wrap.style.display = ''
  } else {
    iframe.src = ''
    wrap.style.display = 'none'
  }
}

async function enviarPropuesta() {
  const text = sanitizeInput(document.getElementById('pp-text').value)
  const catEl = document.querySelector('.pp-cat.sel')
  const cat = sanitizeInput(catEl ? catEl.textContent : 'General')
  const context = sanitizeInput(document.getElementById('pp-context').value) || null
  const video_url = sanitizeInput(document.getElementById('pp-video').value) || null

  // Recolectar links no vacíos
  const linkInputs = document.querySelectorAll('#pp-links-list .pp-link-row input')
  const links = Array.from(linkInputs)
    .map(i => sanitizeInput(i.value))
    .filter(v => v.length > 0)

  if (!text || text.length < 10) return
  if (!MY_SEAT || MY_SEAT <= 0) { showToast('Necesitás una butaca verificada para proponer'); return }

  const btn = document.getElementById('pp-submit')
  btn.disabled = true
  btn.textContent = 'Enviando…'

  const { error } = await sb.from('proposals').insert({
    seat_number: MY_SEAT,
    text,
    cat,
    context,
    links: links.length > 0 ? links : [],
    video_url,
    likes: 0,
    status: 'pending'
  })

  if (error) {
    showToast('Error al enviar: ' + (error.message || 'intente de nuevo'))
    btn.disabled = false
    btn.textContent = 'Enviar al moderador →'
    return
  }

  cerrarPropuesta()
  mostrarFooter()
  showToast('✓ Propuesta enviada. El moderador la revisará antes de publicarla.')
}

// ══════════════════════════════════════════════════════════════
//  TIMER & QUESTIONS
// ══════════════════════════════════════════════════════════════
let PREGUNTAS = [] // cargadas desde Supabase — questions WHERE status='activa'
let PREGUNTAS_IDS  = []
let PREGUNTAS_DATA = []
let qIdx = 0, _revealTriggered = {}

// ── Caché de perfiles reales desde Supabase
//    seat_number → { alias, phrase, votes, isPublic }
//    Perfiles privados: alias=null, phrase=null, votes=real — el conteo no es dato sensible
let _profilesCache = {}

async function cargarPerfilesPublicos() {
  try {
    // Una sola query atómica: TODOS los asientos + votos reales (privados sin alias/phrase)
    const { data: rows, error } = await sb.rpc('get_profiles_with_vote_counts')
    if (error) throw error
    if (rows) {
      _profilesCache = {}
      rows.forEach(r => {
        _profilesCache[r.seat_number] = {
          alias:      r.alias    || null,
          phrase:     r.phrase   || '',
          votes:      Number(r.vote_count) || 0,
          showAlias:  !!r.show_alias,
          showPhrase: !!r.show_phrase,
          showVotes:  !!r.show_votes,
          isPublic:   !!(r.show_alias || r.show_phrase || r.show_votes),
          cardColor:  r.card_color || 'orange',
        }
      })
    }
  } catch(e) { 
    console.warn('cargarPerfilesPublicos:', e) 
    // console.log('warning 123')
  }
}

async function cargarPreguntasActivas() {
  try {
    const { data } = await sb.from('questions').select('id, text, ends_at, duration_minutes, category, description, video_url, links, status').in('status', ['activa', 'cerrada']).order('created_at')
    if (data) {
      PREGUNTAS      = data.map(q => q.text)
      PREGUNTAS_IDS  = data.map(q => q.id)
      PREGUNTAS_DATA = data
      qIdx = 0
    }
    renderQCards()
    // El strip cambió de altura — recalcular canvas
    requestAnimationFrame(resizeCanvas)
  } catch (e) { console.warn('cargarPreguntasActivas:', e) }
}

function fmtTime(s) {
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), ss = s%60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`
}

// Tick global — actualiza timers de todas las cards cada segundo
setInterval(() => {
  if (!document.getElementById('congress').classList.contains('active')) return
  PREGUNTAS_DATA.forEach((qdata, i) => {
    const timerEl = document.getElementById(`q-timer-${i}`)
    if (!timerEl) return
    const remaining = Math.floor((new Date(qdata.ends_at) - Date.now()) / 1000)
    if (remaining > 0) {
      timerEl.textContent = fmtTime(remaining)
      timerEl.className = 'q-card-timer-val'
    } else {
      timerEl.textContent = 'Finalizada'
      timerEl.className = 'q-card-timer-val ended'
      // Cuando recién termina, re-renderizar para que el badge cambie a "Revelación"
      if (!_revealTriggered[qdata.id]) {
        _revealTriggered[qdata.id] = true
        renderQCards()
        requestAnimationFrame(resizeCanvas)
        // If this question is open in debate panel, close input
        if (_debateQId === qdata.id) _dpSetEndedUI(true)
      }
    }
  })
}, 1000)

function renderQCards() {
  const strip = document.getElementById('q-cards-strip')
  if (!strip) return
  strip.innerHTML = ''
  if (PREGUNTAS_DATA.length === 0) {
    strip.classList.add('empty')
    strip.innerHTML = '<p class="q-empty-msg">Sin preguntas activas…</p>'
    return
  }
  const CAT_THEME = window._CAT_THEME
  const CAT_DEFAULT = _CAT_DEFAULT
  const votos = JSON.parse(localStorage.getItem('cabildoos_votos') || '{}')

  // Ordenar: activas primero (por tiempo restante asc), finalizadas al fondo; excluir archivadas
  const sorted = PREGUNTAS_DATA
    .map((qdata, i) => ({ qdata, i, remaining: Math.floor((new Date(qdata.ends_at) - Date.now()) / 1000) }))
    .filter(({ qdata }) => !isArchivada(qdata.id))
    .sort((a, b) => {
      const aEnded = a.remaining <= 0, bEnded = b.remaining <= 0
      if (aEnded !== bEnded) return aEnded ? 1 : -1
      if (!aEnded) return a.remaining - b.remaining
      return b.remaining - a.remaining
    })

  if (sorted.length === 0) {
    strip.classList.add('empty')
    strip.innerHTML = '<p class="q-empty-msg">Sin preguntas activas…</p>'
    return
  }
  strip.classList.remove('empty')

  sorted.forEach(({ qdata, i, remaining }) => {
    const ended = remaining <= 0
    const yaVoto = votos[qdata.id]
    const votoVal = yaVoto?.voto
    const theme = CAT_THEME[qdata.category] || CAT_DEFAULT

    // Chip de estado de voto (activo = clickeable para votar/cambiar, finalizado = solo lectura)
    let voteAreaHTML = ''
    if (ended) {
      // Estado final — no clickeable
      const statusMap = {
        si:  { lbl:'Voté SÍ',     bg:'#dcfce7', color:'#166534' },
        no:  { lbl:'Voté NO',     bg:'#fee2e2', color:'#991b1b' },
        abs: { lbl:'Me abstuve',  bg:'#fef9c3', color:'#854d0e' },
      }
      const st = votoVal ? statusMap[votoVal] : { lbl:'Ausente', bg:'#f1f1ef', color:'#999' }
      voteAreaHTML = `<span class="q-vote-status-chip" style="background:${st.bg};color:${st.color}">${st.lbl}</span>`
    } else {
      // Activa — botón clickeable
      let voteBtnTxt, voteBtnCls = 'q-card-vote-btn'
      if (votoVal === 'si')  { voteBtnTxt = 'Voté SÍ';    voteBtnCls += ' ya-vote si' }
      else if (votoVal === 'no')  { voteBtnTxt = 'Voté NO';    voteBtnCls += ' ya-vote no' }
      else if (votoVal === 'abs') { voteBtnTxt = 'Me abstuve'; voteBtnCls += ' ya-vote abs' }
      else { voteBtnTxt = 'Votar' }
      voteAreaHTML = `<button class="${voteBtnCls}" style="flex:1" onclick="abrirVotoForQ(${i})">${voteBtnTxt}</button>`
    }

    // Badge countdown: activa = "En curso", finalizada = botón revelación
    const cdRight = ended
      ? `<button class="q-card-reveal-badge" onclick="abrirVotoForQ(${i})">Revelación</button>`
      : `<span class="q-card-cd-badge" style="background:${theme.pill};color:${theme.txt}">En curso</span>`

    const card = document.createElement('div')
    card.className = ended ? 'q-card ended' : 'q-card'
    card.style.background = theme.bg
    card.style.borderColor = theme.pill
    card.innerHTML = `
      <div class="q-card-inner" onclick="abrirInfoModal(${i})">
        ${qdata.category ? `<span class="q-cat-pill" style="background:${theme.pill};color:${theme.txt}">${escapeHtml(qdata.category)}</span>` : ''}
        <div class="q-card-btn-group">
          <button onclick="event.stopPropagation();archivarPregunta('${qdata.id}')" title="Archivar">
            <svg width="11" height="3" viewBox="0 0 14 3" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="1" y1="1.5" x2="13" y2="1.5"/></svg>
          </button>
          <button onclick="event.stopPropagation();abrirInfoModal(${i})" title="Expandir">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
          </button>
        </div>
        <p class="q-card-text">${escapeHtml(qdata.text)}</p>
      </div>
      <div class="q-card-countdown" style="background:${theme.cd};border-top-color:${theme.pill}">
        <div class="q-card-countdown-left">
          <span class="q-card-cd-lbl">${ended ? 'Estado' : 'Tiempo restante'}</span>
          <span class="q-card-timer-val${ended ? ' ended' : ''}" id="q-timer-${i}">${ended ? 'Finalizada' : fmtTime(remaining)}</span>
        </div>
        ${cdRight}
      </div>
      <div class="q-card-actions" style="background:${theme.bg}">
        <button class="q-card-debate-btn${ended ? ' off' : ''}" style="flex:1" onclick="abrirDebateForQ(${i})">
          <span class="debate-dot${ended ? ' off' : ''}"></span>${ended ? 'Debate OFF' : 'Debate'}
        </button>
        ${voteAreaHTML}
      </div>`
    strip.appendChild(card)
  })
}

function abrirVotoForQ(i) {
  qIdx = i
  abrirModal()
}
async function abrirDebateForQ(i) {
  if (!_authUser || !MY_SEAT) {
    if (_isObserverMode()) {
      showToast('Modo observador — sin permiso para participar en el debate')
    } else {
      showToast('Verificá tu identidad para participar en el debate')
      if (_authUser) showScreen('verify-onboard'); else abrirAuth('registro')
    }
    return
  }
  const qdata = PREGUNTAS_DATA[i]
  if (!qdata) return
  qIdx = i
  _debateQId   = qdata.id
  _debateTheme = (window._CAT_THEME[qdata.category] || _CAT_DEFAULT)
  const ended  = Math.floor((new Date(qdata.ends_at) - Date.now()) / 1000) <= 0

  // Hero header — category color
  const hdr = document.getElementById('dp-header')
  if (hdr) {
    hdr.style.background  = _debateTheme.bg
    hdr.style.borderColor = _debateTheme.pill
  }

  // Category pill
  const pillEl = document.getElementById('dp-cat-pill')
  if (pillEl && qdata.category) {
    pillEl.textContent      = qdata.category
    pillEl.style.background = _debateTheme.pill
    pillEl.style.color      = _debateTheme.txt
    pillEl.style.display    = 'inline-flex'
  } else if (pillEl) {
    pillEl.style.display = 'none'
  }

  // Big question text
  const qtEl = document.getElementById('dp-subtitle')
  if (qtEl) qtEl.textContent = qdata.text || PREGUNTAS[i] || ''

  // Countdown
  _dpStartCountdown(ended ? null : qdata.ends_at)
  if (ended) {
    const valEl = document.getElementById('dp-cd-val')
    const lblEl = document.getElementById('dp-cd-lbl')
    if (valEl) { valEl.textContent = 'Finalizada'; valEl.className = 'dp-cd-val ended' }
    if (lblEl) lblEl.textContent = 'Estado'
  }

  _dpSetEndedUI(ended)
  abrirDebate()
  await _loadDebateMessages(qdata.id)
  if (!ended) _subscribeDebate(qdata.id)
}

function updateQDisplay() { /* compat — no-op, debate uses abrirDebateForQ */ }
function prevPregunta() {
  if (PREGUNTAS.length === 0) return
  qIdx = (qIdx - 1 + PREGUNTAS.length) % PREGUNTAS.length
  updateQDisplay()
}
function nextPregunta() {
  if (PREGUNTAS.length === 0) return
  qIdx = (qIdx + 1) % PREGUNTAS.length
  updateQDisplay()
}

// ══════════════════════════════════════════════════════════════
//  DEBATE CHAT
// ══════════════════════════════════════════════════════════════
let debateOpen = false

// ══════════════════════════════════════════════════════════════
//  ARCHIVO DE PREGUNTAS
// ══════════════════════════════════════════════════════════════
function _loadArchivadas() {
  try { return new Set(JSON.parse(localStorage.getItem('cabildoos_archivadas') || '[]')) } catch(e) { return new Set() }
}
function _saveArchivadas(set) {
  localStorage.setItem('cabildoos_archivadas', JSON.stringify([...set]))
}
function _loadReveladas() {
  try { return new Set(JSON.parse(localStorage.getItem('cabildoos_reveladas') || '[]')) } catch(e) { return new Set() }
}
function _saveReveladas(set) {
  localStorage.setItem('cabildoos_reveladas', JSON.stringify([...set]))
}

let _archivadas = _loadArchivadas()
let _reveladas  = _loadReveladas()

function isArchivada(qId) { return _archivadas.has(qId) }

function archivarPregunta(qId) {
  _archivadas.add(qId)
  _saveArchivadas(_archivadas)
  renderQCards()
  requestAnimationFrame(resizeCanvas)
  renderQuestionsTab()
  _updatePqBadge()
}

function insertarPregunta(qId) {
  _archivadas.delete(qId)
  _saveArchivadas(_archivadas)
  renderQCards()
  requestAnimationFrame(resizeCanvas)
  renderQuestionsTab()
  _updatePqBadge()
  cerrarPreguntas()
}

function marcarRevelada(qId) {
  if (!qId) return
  _reveladas.add(qId)
  _saveReveladas(_reveladas)
  // Auto-archive if question is ended
  const qdata = PREGUNTAS_DATA.find(q => q.id === qId)
  if (qdata) {
    const ended = Math.floor((new Date(qdata.ends_at) - Date.now()) / 1000) <= 0
    if (ended && !_archivadas.has(qId)) {
      _archivadas.add(qId)
      _saveArchivadas(_archivadas)
      renderQCards()
      requestAnimationFrame(resizeCanvas)
      _updatePqBadge()
    }
  }
  renderQuestionsTab()
}

function _updatePqBadge() {
  const badge = document.getElementById('ctb-badge')
  if (!badge) return
  // Contar solo las que existen en PREGUNTAS_DATA (las borradas del admin desaparecen)
  const n = PREGUNTAS_DATA.filter(q => _archivadas.has(q.id)).length
  badge.textContent = n
  badge.style.display = n > 0 ? 'inline-flex' : 'none'
}

function abrirPreguntas() {
  if (!_requireButaca()) return
  renderQuestionsTab()
  document.getElementById('preguntas-panel').classList.add('open')
}
function cerrarPreguntas() {
  document.getElementById('preguntas-panel').classList.remove('open')
}

function renderQuestionsTab() {
  const list  = document.getElementById('pq-list')
  const empty = document.getElementById('pq-empty')
  const sub   = document.getElementById('pq-sub')
  if (!list) return
  const archived = PREGUNTAS_DATA.filter(q => _archivadas.has(q.id))
  if (sub) sub.textContent = `— ${archived.length} archivada${archived.length !== 1 ? 's' : ''}`
  list.innerHTML = ''
  if (archived.length === 0) {
    if (empty) empty.style.display = 'flex'
    return
  }
  if (empty) empty.style.display = 'none'
  const CAT_THEME = window._CAT_THEME || {}
  archived.forEach(qdata => {
    const theme = CAT_THEME[qdata.category] || _CAT_DEFAULT
    const ended = Math.floor((new Date(qdata.ends_at) - Date.now()) / 1000) <= 0
    const row   = document.createElement('div')
    row.className = 'pq-item'
    row.innerHTML = `
      <div class="pq-item-dot" style="background:${theme.pill}"></div>
      <div class="pq-item-body">
        ${qdata.category ? `<p class="pq-item-cat">${escapeHtml(qdata.category)}</p>` : ''}
        <p class="pq-item-text">${escapeHtml(qdata.text)}</p>
        <p class="pq-item-sub">${ended ? 'Finalizada' : 'En curso'}</p>
      </div>
      <button class="pq-insert-btn" onclick="insertarPregunta('${qdata.id}')">Insertar</button>`
    list.appendChild(row)
  })
}

// ── PALETA CATEGORÍAS (global) ────────────────────────────────
// Valores iniciales hardcoded como fallback mientras carga Supabase
window._CAT_THEME = {
  'Política':       { bg:'#EEF2FF', pill:'#C7D2FE', txt:'#3730A3', cd:'#E0E7FF' },
  'Economía':       { bg:'#ECFDF5', pill:'#A7F3D0', txt:'#065F46', cd:'#D1FAE5' },
  'Derechos':       { bg:'#FFF7ED', pill:'#FED7AA', txt:'#9A3412', cd:'#FFEDD5' },
  'Social':         { bg:'#F5F3FF', pill:'#DDD6FE', txt:'#5B21B6', cd:'#EDE9FE' },
  'Internacional':  { bg:'#F0F9FF', pill:'#BAE6FD', txt:'#0C4A6E', cd:'#E0F2FE' },
  'Justicia':       { bg:'#FFF1F2', pill:'#FECDD3', txt:'#9F1239', cd:'#FFE4E6' },
  'Electoral':      { bg:'#FFFBEB', pill:'#FDE68A', txt:'#92400E', cd:'#FEF3C7' },
}
const _CAT_DEFAULT = { bg:'#F9F9F7', pill:'#E4E4E0', txt:'#555', cd:'#F2F2F0' }

// Deriva tema completo desde un color hex
function _catThemeFromHex(hex) {
  const r=parseInt(hex.slice(1,3),16)||0, g=parseInt(hex.slice(3,5),16)||0, b=parseInt(hex.slice(5,7),16)||0
  const rf=r/255, gf=g/255, bf=b/255
  const mx=Math.max(rf,gf,bf), mn=Math.min(rf,gf,bf)
  const l=(mx+mn)/2, d=mx-mn
  const s=d===0?0:d/(1-Math.abs(2*l-1))
  let h=0
  if(d!==0){
    if(mx===rf)      h=((gf-bf)/d)%6
    else if(mx===gf) h=(bf-rf)/d+2
    else             h=(rf-gf)/d+4
    h=Math.round(h*60); if(h<0) h+=360
  }
  const hsl=(hh,ss,ll)=>`hsl(${hh},${Math.round(ss*100)}%,${Math.round(ll*100)}%)`
  return { bg:hsl(h,.60,.96), pill:hsl(h,.70,.82), txt:hsl(h,.75,.28), cd:hsl(h,.45,.93) }
}

// Carga categorías desde Supabase y sobreescribe _CAT_THEME
async function _cargarCatTheme() {
  try {
    const { data } = await sb.from('categories').select('name,color').order('sort_order')
    if (!data) return
    data.forEach(cat => {
      if (cat.name && cat.color) window._CAT_THEME[cat.name] = _catThemeFromHex(cat.color)
    })
    // Re-renderizar cards si ya están cargadas
    if (typeof renderQCards === 'function') renderQCards()
  } catch(e) { /* usa fallback hardcoded */ }
}

// ── DEBATE REAL ──────────────────────────────────────────────
let _debateQId      = null   // question_id currently shown
let _debateChannel  = null   // supabase realtime channel
let _debateEnded    = false  // is the question ended?
let _debateTheme    = _CAT_DEFAULT // active category theme
let _debateEndsAt   = null   // Date of question end
let _debateCdIv     = null   // countdown interval

// ── MODERACIÓN: cola de manos ─────────────────────────────────
const DP_COOLDOWN_SEC  = 60   // segundos entre mensajes
const DP_QUEUE_DIRECT  = 3    // si ≤ estas personas en cola → mano verde automática

let _dpHandState    = 'idle'  // 'idle' | 'queued' | 'ready' | 'cooldown'
let _dpQueue        = []      // [{seat, raisedAt}] — cola de manos levantadas
let _dpCooldownEnd  = 0       // timestamp fin de cooldown
let _dpCooldownTick = null    // setInterval para la barra

// Actualiza UI según estado actual
function _dpRenderHand() {
  const btn    = document.getElementById('dp-hand-btn')
  const status = document.getElementById('dp-mod-status')
  const inp    = document.getElementById('dp-input')
  const snd    = document.getElementById('dp-send-btn')
  const track  = document.getElementById('dp-cooldown-track')
  if (!btn) return

  const myPos = _dpQueue.findIndex(e => e.seat === MY_SEAT)

  btn.className = 'dp-hand-btn'
  if (status) { status.className = 'dp-mod-status'; status.innerHTML = '' }
  if (track)  track.style.display = 'none'

  if (_dpHandState === 'ready') {
    btn.className = 'dp-hand-btn ready'
    btn.title = 'Podés hablar — click para bajar la mano'
    if (status) { status.className = 'dp-mod-status green'; status.innerHTML = '<b>Podés hablar</b> — enviá tu argumento' }
    if (inp) inp.disabled = false
    if (snd) snd.disabled = false

  } else if (_dpHandState === 'queued') {
    btn.className = 'dp-hand-btn waiting'
    btn.title = 'Esperando turno'
    if (status) status.innerHTML = myPos >= 0 ? `Esperando turno — posición <b>${myPos + 1}</b> en cola` : 'En cola…'
    if (inp) inp.disabled = true
    if (snd) snd.disabled = true

  } else if (_dpHandState === 'cooldown') {
    btn.className = 'dp-hand-btn cooldown'
    btn.title = 'Cooldown activo'
    const rem = Math.max(0, Math.ceil((_dpCooldownEnd - Date.now()) / 1000))
    if (status) { status.className = 'dp-mod-status red'; status.innerHTML = `Esperá <b>${rem}s</b> antes de volver a hablar` }
    if (inp) inp.disabled = true
    if (snd) snd.disabled = true
    if (track) { track.style.display = 'block' }

  } else {
    // idle
    btn.title = 'Levantar mano para hablar'
    if (status) status.innerHTML = 'Levantá la mano para hablar'
    if (inp) inp.disabled = true
    if (snd) snd.disabled = true
  }
}

// Recalcula si yo debo pasar de 'queued' → 'ready'
function _dpEvalQueue() {
  if (_dpHandState !== 'queued') return
  const myPos = _dpQueue.findIndex(e => e.seat === MY_SEAT)
  if (myPos >= 0 && myPos < DP_QUEUE_DIRECT) {
    _dpHandState = 'ready'
    _dpRenderHand()
  }
}

// Toggle mano — levantar / bajar
function _dpToggleHand() {
  if (_debateEnded || !MY_SEAT) return
  if (_dpHandState === 'cooldown') return   // no puede mientras cooldown
  if (_dpHandState === 'ready' || _dpHandState === 'queued') {
    // Bajar la mano
    _dpQueue = _dpQueue.filter(e => e.seat !== MY_SEAT)
    _dpHandState = 'idle'
    _dpBroadcast({ type: 'hand_down', seat: MY_SEAT })
    _dpRenderHand()
    return
  }
  // Levantar la mano
  if (_dpQueue.find(e => e.seat === MY_SEAT)) return  // ya está
  const entry = { seat: MY_SEAT, raisedAt: Date.now() }
  _dpQueue.push(entry)
  _dpQueue.sort((a, b) => a.raisedAt - b.raisedAt)
  _dpBroadcast({ type: 'hand_up', seat: MY_SEAT, raisedAt: entry.raisedAt })

  const myPos = _dpQueue.findIndex(e => e.seat === MY_SEAT)
  if (myPos < DP_QUEUE_DIRECT) {
    _dpHandState = 'ready'
  } else {
    _dpHandState = 'queued'
  }
  _dpRenderHand()
}

// Inicia cooldown de 60s
function _dpStartCooldown() {
  if (_dpCooldownTick) clearInterval(_dpCooldownTick)
  _dpCooldownEnd = Date.now() + DP_COOLDOWN_SEC * 1000
  _dpHandState   = 'cooldown'
  _dpRenderHand()

  const fill = document.getElementById('dp-cooldown-fill')
  const track = document.getElementById('dp-cooldown-track')
  if (track) track.style.display = 'block'

  _dpCooldownTick = setInterval(() => {
    const rem  = Math.max(0, _dpCooldownEnd - Date.now())
    const pct  = (rem / (DP_COOLDOWN_SEC * 1000)) * 100
    if (fill) fill.style.width = pct + '%'
    _dpRenderHand()
    if (rem <= 0) {
      clearInterval(_dpCooldownTick)
      _dpCooldownTick = null
      _dpHandState = 'idle'
      if (track) track.style.display = 'none'
      _dpRenderHand()
    }
  }, 1000)
}

// Broadcast al canal de debate
function _dpBroadcast(payload) {
  if (!_debateChannel) return
  try { _debateChannel.send({ type: 'broadcast', event: 'hand', payload }) } catch(e) {}
}

// Reset completo de moderación al abrir/cerrar debate
function _dpResetMod() {
  if (_dpCooldownTick) { clearInterval(_dpCooldownTick); _dpCooldownTick = null }
  _dpHandState = 'idle'
  _dpQueue     = []
  _dpCooldownEnd = 0
  const track = document.getElementById('dp-cooldown-track')
  if (track) track.style.display = 'none'
  _dpRenderHand()
}

function _dpStartCountdown(endsAt) {
  if (_debateCdIv) clearInterval(_debateCdIv)
  _debateEndsAt = endsAt ? new Date(endsAt) : null
  const valEl = document.getElementById('dp-cd-val')
  const lblEl = document.getElementById('dp-cd-lbl')
  function tick() {
    if (!valEl) return
    if (!_debateEndsAt) { valEl.textContent = '—'; return }
    const rem = Math.floor((_debateEndsAt - Date.now()) / 1000)
    if (rem <= 0) {
      valEl.textContent = 'Finalizada'
      valEl.className   = 'dp-cd-val ended'
      if (lblEl) lblEl.textContent = 'Estado'
      clearInterval(_debateCdIv)
      _debateCdIv = null
      _dpSetEndedUI(true)
    } else {
      valEl.textContent = fmtTime(rem)
      valEl.className   = 'dp-cd-val'
      if (lblEl) lblEl.textContent = 'Tiempo restante'
    }
  }
  tick()
  _debateCdIv = setInterval(tick, 1000)
}

function _dpTimeAgo(ts) {
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (diff < 60)  return 'ahora'
  if (diff < 3600) return `hace ${Math.floor(diff/60)} min`
  return `hace ${Math.floor(diff/3600)}h ${Math.floor((diff%3600)/60)} min`
}

function _dpAppendMsg(msg, isMine) {
  const msgs = document.getElementById('dp-messages')
  // Remove loading/empty placeholder
  const ph = msgs.querySelector('.dp-loading,.dp-empty')
  if (ph) ph.remove()
  const div = document.createElement('div')
  div.className = 'dp-msg' + (isMine ? ' mine' : '')
  div.dataset.msgId = msg.id
  const seatLabel = `#${msg.seat_number}`
  const timeLabel = _dpTimeAgo(msg.created_at)
  const aliasHtml = msg.alias ? `<span class="dp-msg-alias">${escapeHtml(msg.alias)}</span>` : ''
  div.innerHTML = `
    <div class="dp-msg-head">
      <span class="dp-msg-seat">${seatLabel}</span>
      ${aliasHtml}
      <span class="dp-msg-time">${timeLabel}</span>
    </div>
    <span class="dp-msg-text">${escapeHtml(msg.text)}</span>`
  msgs.appendChild(div)
  msgs.scrollTop = msgs.scrollHeight
}

function escapeHtml(s) {
  if (s == null) return ''
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;')
}

// Sanitiza texto de usuario antes de guardar en DB:
// elimina tags HTML/script y caracteres de control
function sanitizeInput(s) {
  if (s == null) return ''
  return String(s)
    .replace(/<[^>]*>/g, '')           // strip HTML tags
    .replace(/javascript\s*:/gi, '')   // strip javascript: URIs
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // strip control chars
    .trim()
}

async function _loadDebateMessages(questionId) {
  const msgs = document.getElementById('dp-messages')
  msgs.innerHTML = '<div class="dp-loading">Cargando mensajes…</div>'
  try {
    const { data, error } = await sb.from('debate_messages')
      .select('*').eq('question_id', questionId)
      .order('created_at', { ascending: true })
    if (error) throw error
    msgs.innerHTML = ''
    if (!data || data.length === 0) {
      msgs.innerHTML = '<div class="dp-empty">Sé el primero en debatir esta pregunta.</div>'
      return
    }
    msgs.innerHTML = '<div class="dp-msg-divider">— inicio del debate —</div>'
    data.forEach(m => _dpAppendMsg(m, m.seat_number === MY_SEAT))
  } catch(e) {
    msgs.innerHTML = '<div class="dp-empty">Error al cargar mensajes.</div>'
    console.warn('_loadDebateMessages:', e)
  }
}

function _subscribeDebate(questionId) {
  // Unsubscribe previous
  if (_debateChannel) {
    sb.removeChannel(_debateChannel)
    _debateChannel = null
  }
  _dpResetMod()  // limpiar cola al cambiar de debate

  _debateChannel = sb.channel(`debate:${questionId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'debate_messages',
      filter: `question_id=eq.${questionId}`
    }, payload => {
      const msg = payload.new
      if (document.querySelector(`[data-msg-id="${msg.id}"]`)) return
      _dpAppendMsg(msg, msg.seat_number === MY_SEAT)
    })
    // ── Manos levantadas ──────────────────────────────────────
    .on('broadcast', { event: 'hand' }, ({ payload }) => {
      if (!payload) return
      if (payload.type === 'hand_up') {
        // Agregar a cola si no existe
        if (!_dpQueue.find(e => e.seat === payload.seat)) {
          _dpQueue.push({ seat: payload.seat, raisedAt: payload.raisedAt || Date.now() })
          _dpQueue.sort((a, b) => a.raisedAt - b.raisedAt)
        }
        _dpEvalQueue()   // evaluar si yo subo de posición
        _dpRenderHand()
      } else if (payload.type === 'hand_down') {
        _dpQueue = _dpQueue.filter(e => e.seat !== payload.seat)
        _dpEvalQueue()
        _dpRenderHand()
      }
    })
    .subscribe()
}

function _dpSetEndedUI(ended) {
  _debateEnded = ended
  const inputRow   = document.getElementById('dp-input-row')
  const modBar     = document.getElementById('dp-mod-bar')
  const cdTrack    = document.getElementById('dp-cooldown-track')
  const closedNote = document.getElementById('dp-closed-note')
  const liveBadge  = document.getElementById('dp-live-badge')
  if (ended) {
    if (inputRow)   inputRow.style.display  = 'none'
    if (modBar)     modBar.style.display    = 'none'
    if (cdTrack)    cdTrack.style.display   = 'none'
    closedNote.classList.add('show')
    if (liveBadge) { liveBadge.innerHTML = '🔒 Cerrado'; liveBadge.classList.add('closed') }
    _dpResetMod()
  } else {
    if (inputRow) inputRow.style.display = ''
    if (modBar)   modBar.style.display   = ''
    closedNote.classList.remove('show')
    if (liveBadge) {
      liveBadge.innerHTML = '<span class="debate-dot" style="background:var(--green);animation:pulse-dot 1.4s ease-in-out infinite"></span>En vivo'
      liveBadge.classList.remove('closed')
    }
  }
}

function toggleDebate() {
  debateOpen ? cerrarDebate() : abrirDebate()
}

function abrirDebate() {
  document.getElementById('debate-panel').classList.add('open')
  if (document.getElementById('debate-btn')) document.getElementById('debate-btn').classList.add('live')
  debateOpen = true
}

function cerrarDebate() {
  document.getElementById('debate-panel').classList.remove('open')
  if (document.getElementById('debate-btn')) document.getElementById('debate-btn').classList.remove('live')
  debateOpen = false
  if (_debateChannel) { sb.removeChannel(_debateChannel); _debateChannel = null }
  if (_debateCdIv)    { clearInterval(_debateCdIv); _debateCdIv = null }
  _dpResetMod()
}

async function dpEnviar() {
  if (_debateEnded) return
  if (_dpHandState !== 'ready') return   // solo puede hablar si la mano está verde
  const inp = document.getElementById('dp-input')
  const txt = sanitizeInput(inp.value)
  if (!txt || !_debateQId || !MY_SEAT) return
  inp.value = ''
  inp.disabled = true

  try {
    const { error } = await sb.from('debate_messages').insert({
      question_id: _debateQId,
      seat_number: MY_SEAT,
      alias: '',
      text: txt
    })
    if (error) {
      console.warn('dpEnviar error:', error)
      inp.value = txt
      inp.disabled = false
      showToast('Error al enviar mensaje')
      return
    }
    // Éxito → bajar mano y arrancar cooldown
    _dpQueue = _dpQueue.filter(e => e.seat !== MY_SEAT)
    _dpBroadcast({ type: 'hand_down', seat: MY_SEAT })
    _dpEvalQueue()    // siguiente en cola puede subir
    _dpStartCooldown()
  } catch(e) {
    console.warn('dpEnviar:', e)
    inp.value = txt
    inp.disabled = false
    showToast('Error al enviar mensaje')
  }
}

// Close debate on outside click
document.addEventListener('click', e => {
  if (!debateOpen) return
  if (e.target.closest('#debate-panel') || e.target.closest('#debate-btn') || e.target.closest('.q-card-debate-btn') || e.target.closest('#info-modal-overlay')) return
  cerrarDebate()
})

// ══════════════════════════════════════════════════════════════
//  BLOQUE MATCH — show when SI votes > 10
// ══════════════════════════════════════════════════════════════
//  INFO MODAL
// ══════════════════════════════════════════════════════════════
let _infoModalIdx = -1
let _infoModalIv  = null

function _imYoutubeEmbed(url) {
  try {
    const u = new URL(url)
    let id = null
    if (u.hostname === 'youtu.be') id = u.pathname.slice(1)
    else if (u.hostname.includes('youtube.com')) id = u.searchParams.get('v') || u.pathname.split('/').pop()
    if (id) return `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1`
  } catch(e) {}
  return null
}

function _imBuildVoteArea(qdata, ended) {
  const votos    = JSON.parse(localStorage.getItem('cabildoos_votos') || '{}')
  const votoVal  = votos[qdata.id]?.voto
  const voteArea = document.getElementById('im-vote-area')
  if (!voteArea) return
  if (ended) {
    const statusMap = {
      si:  { lbl:'Voté SÍ',    bg:'#dcfce7', color:'#166534' },
      no:  { lbl:'Voté NO',    bg:'#fee2e2', color:'#991b1b' },
      abs: { lbl:'Me abstuve', bg:'#fef9c3', color:'#854d0e' },
    }
    const st = votoVal ? statusMap[votoVal] : { lbl:'Ausente', bg:'#f1f1ef', color:'#999' }
    voteArea.innerHTML = `<span class="im-vote-status" style="background:${st.bg};color:${st.color};flex:1">${st.lbl}</span>`
  } else {
    let cls = 'im-vote-btn', lbl = 'Votar'
    if (votoVal === 'si')       { cls += ' ya-vote si';  lbl = 'Voté SÍ' }
    else if (votoVal === 'no')  { cls += ' ya-vote no';  lbl = 'Voté NO' }
    else if (votoVal === 'abs') { cls += ' ya-vote abs'; lbl = 'Me abstuve' }
    const onclick = votoVal ? '' : `onclick="cerrarInfoModal();abrirVotoForQ(${_infoModalIdx})"`
    voteArea.innerHTML = `<button class="${cls}" style="flex:1" ${onclick}>${lbl}</button>`
  }
}

function _imSetEnded(ended, qdata) {
  const cdVal  = document.getElementById('im-cd-val')
  const cdLbl  = document.getElementById('im-cd-lbl')
  const cdRight = document.getElementById('im-cd-right')
  if (ended) {
    if (cdVal) { cdVal.textContent = 'Finalizada'; cdVal.className = 'ended' }
    if (cdLbl) cdLbl.textContent = 'Estado'
    if (cdRight) cdRight.innerHTML = `<button class="im-reveal-btn" onclick="cerrarInfoModal();abrirVotoForQ(${_infoModalIdx})">Revelación</button>`
  } else {
    if (cdVal) cdVal.className = ''
    if (cdLbl) cdLbl.textContent = 'Tiempo restante'
    if (cdRight) cdRight.innerHTML = `<span class="im-status-badge" id="im-status-badge" style="background:${(window._CAT_THEME[qdata.category]||_CAT_DEFAULT).pill};color:${(window._CAT_THEME[qdata.category]||_CAT_DEFAULT).txt}">En curso</span>`
  }
  // Debate button
  const debBtn = document.getElementById('im-debate-btn')
  const debLbl = document.getElementById('im-debate-lbl')
  if (debBtn) debBtn.className = 'im-debate-btn' + (ended ? ' off' : '')
  if (debLbl) debLbl.textContent = ended ? 'Debate OFF' : 'Debate'
  _imBuildVoteArea(qdata, ended)
}

function abrirInfoModal(i) {
  const qdata = PREGUNTAS_DATA[i]
  if (!qdata) return
  _infoModalIdx = i
  const theme   = (window._CAT_THEME[qdata.category] || _CAT_DEFAULT)
  const remaining = Math.floor((new Date(qdata.ends_at) - Date.now()) / 1000)
  const ended   = remaining <= 0

  // Hero colors
  const hero = document.getElementById('im-hero')
  if (hero) { hero.style.background = theme.bg }

  // Countdown bar colors
  const cdBar = document.getElementById('im-countdown')
  if (cdBar) { cdBar.style.background = theme.cd; cdBar.style.borderColor = theme.pill }

  // Actions bar
  const actBar = document.getElementById('im-actions')
  if (actBar) { actBar.style.background = theme.bg; actBar.style.borderColor = theme.pill }

  // Category pill
  const pill = document.getElementById('im-cat-pill')
  if (pill && qdata.category) {
    pill.textContent = qdata.category; pill.style.background = theme.pill; pill.style.color = theme.txt; pill.style.display = 'inline-block'
  } else if (pill) { pill.style.display = 'none' }

  // Question text
  document.getElementById('im-question-text').textContent = qdata.text || ''

  // Countdown live tick
  if (_infoModalIv) clearInterval(_infoModalIv)
  const cdVal = document.getElementById('im-cd-val')
  function imTick() {
    const rem = Math.floor((new Date(qdata.ends_at) - Date.now()) / 1000)
    if (rem <= 0) {
      clearInterval(_infoModalIv); _infoModalIv = null
      _imSetEnded(true, qdata)
    } else {
      if (cdVal) cdVal.textContent = fmtTime(rem)
    }
  }
  _imSetEnded(ended, qdata)
  if (!ended) {
    if (cdVal) cdVal.textContent = fmtTime(remaining)
    _infoModalIv = setInterval(imTick, 1000)
  }

  // Video
  const videoWrap = document.getElementById('im-video-wrap')
  const videoCont = document.getElementById('im-video-container')
  if (qdata.video_url) {
    videoCont.innerHTML = ''
    const ytEmbed = _imYoutubeEmbed(qdata.video_url)
    if (ytEmbed) {
      const iframe = document.createElement('iframe')
      iframe.setAttribute('allowfullscreen', '')
      iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture')
      iframe.referrerPolicy = 'origin'
      iframe.src = ytEmbed
      videoCont.appendChild(iframe)
    } else {
      const vid = document.createElement('video')
      vid.src = qdata.video_url; vid.controls = true
      videoCont.appendChild(vid)
    }
    videoWrap.style.display = ''
  } else {
    videoWrap.style.display = 'none'; videoCont.innerHTML = ''
  }

  // Description
  const descWrap = document.getElementById('im-description-wrap')
  const descEl   = document.getElementById('im-description')
  if (qdata.description) { descEl.textContent = qdata.description; descWrap.style.display = '' }
  else descWrap.style.display = 'none'

  // Links
  const linksWrap = document.getElementById('im-links-wrap')
  const linksEl   = document.getElementById('im-links')
  const links = Array.isArray(qdata.links) ? qdata.links.filter(Boolean) : []
  if (links.length) {
    linksEl.innerHTML = links.map(url => `<a class="im-link-item" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>`).join('')
    linksWrap.style.display = ''
  } else {
    linksWrap.style.display = 'none'; linksEl.innerHTML = ''
  }

  // Hide im-body if no content at all
  document.getElementById('im-body').style.display = (qdata.video_url || qdata.description || links.length) ? '' : 'none'

  document.getElementById('info-modal-overlay').classList.add('open')
}

function cerrarInfoModal() {
  document.getElementById('info-modal-overlay').classList.remove('open')
  if (_infoModalIv) { clearInterval(_infoModalIv); _infoModalIv = null }
  setTimeout(() => { document.getElementById('im-video-container').innerHTML = '' }, 250)
}

function imAbrirDebate() {
  cerrarInfoModal()
  abrirDebateForQ(_infoModalIdx)
}

// ══════════════════════════════════════════════════════════════
function checkBloqueMatch() {
  // 23 participaciones, 61% SI → ~14 votos SÍ — trigger match
  const siVotes = Math.round(23 * 0.61)   // 14
  const wrap = document.getElementById('mp-bloque-wrap')
  if (wrap) wrap.style.display = siVotes >= 10 ? 'block' : 'none'
}
// Run on first open of perfil
document.addEventListener('DOMContentLoaded', checkBloqueMatch)

// ── Reloj en tiempo real sobre el hemiciclo ──────────────────────────────────
;(function() {
  const DAYS   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
  const MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  const elTime = document.getElementById('hemi-dt-time')
  const elDate = document.getElementById('hemi-dt-date')
  function tickClock() {
    // Siempre en hora de Venezuela (America/Caracas, UTC-4)
    const now = new Date()
    const ve  = new Date(now.toLocaleString('en-US', { timeZone: 'America/Caracas' }))
    const hh  = String(ve.getHours()).padStart(2,'0')
    const mm  = String(ve.getMinutes()).padStart(2,'0')
    const ss  = String(ve.getSeconds()).padStart(2,'0')
    if (elTime) elTime.textContent = hh + ':' + mm + ':' + ss
    if (elDate) elDate.textContent = DAYS[ve.getDay()] + ' ' + ve.getDate() + ' ' + MONTHS[ve.getMonth()] + ' · VET'
  }
  tickClock()
  setInterval(tickClock, 1000)
})()

// ══════════════════════════════════════════════════════════════
//  CALENDARIO HISTÓRICO
// ══════════════════════════════════════════════════════════════
;(function() {
  const MONTHS_ES    = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  const MONTHS_SHORT = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  const CAT_COLORS = {
    'Política':      { bg:'#E6F1FB', color:'#185FA5' },
    'Economía':      { bg:'#FEF9C3', color:'#854d0e' },
    'Derechos':      { bg:'#EDE9FE', color:'#5B21B6' },
    'Social':        { bg:'#DCFCE7', color:'#166534' },
    'Internacional': { bg:'#FFE4E6', color:'#9F1239' },
    'Justicia':      { bg:'#FEF3C7', color:'#92400E' },
    'Electoral':     { bg:'#ECFDF5', color:'#065F46' },
  }

  let _calYear   = new Date().getFullYear()
  let _calMonth  = new Date().getMonth()
  let _calData   = {}
  let _calDebate = {}
  let _calVotes  = {}
  let _calSelDay = null
  let _calOpen   = false
  let _calLoading = false

  window.calToggle = function(e) { if (e) e.stopPropagation(); _calOpen ? _calClose() : _calOpenPanel() }

  function _calOpenPanel() {
    const overlay = document.getElementById('cal-overlay')
    if (!overlay) return
    _calOpen = true
    overlay.classList.add('open')
    // Ocultar profile card del hemiciclo
    document.getElementById('profile-card')?.classList.remove('visible')
    hoveredSeat = null
    _calLoadMonth(_calYear, _calMonth)
  }

  function _calClose() {
    const overlay = document.getElementById('cal-overlay')
    if (!overlay) return
    _calOpen = false
    overlay.classList.remove('open')
    calCloseDebate()
  }
  window.calClose = _calClose

  window.calNavMonth = function(dir) {
    _calMonth += dir
    if (_calMonth > 11) { _calMonth = 0;  _calYear++ }
    if (_calMonth < 0)  { _calMonth = 11; _calYear-- }
    _calData = {}; _calVotes = {}; _calSelDay = null
    calCloseDebate()
    const title = document.getElementById('cal-mid-title')
    const view  = document.getElementById('cal-day-view')
    if (title) title.textContent = 'Historial'
    if (view)  view.innerHTML = '<div class="cal-empty"><div class="cal-empty-icon">📅</div><span>Seleccioná un día<br>con actividad para ver el detalle</span></div>'
    _calLoadMonth(_calYear, _calMonth)
  }

  async function _calLoadMonth(year, month) {
    if (_calLoading) return
    _calLoading = true
    const lbl = document.getElementById('cal-month-lbl')
    if (lbl) lbl.textContent = MONTHS_ES[month] + ' ' + year

    const startOf = new Date(year, month, 1).toISOString()
    const endOf   = new Date(year, month + 1, 0, 23, 59, 59).toISOString()

    try {
      const { data: qs, error } = await sb.from('questions')
        .select('id, text, category, status, created_at, ends_at')
        .gte('created_at', startOf)
        .lte('created_at', endOf)
        .order('created_at')

      if (error) throw error
      _calData = {}

      if (qs && qs.length) {
        const qIds = qs.map(q => q.id)

        // Debate counts en un solo query
        const { data: dmsgs } = await sb.from('debate_messages')
          .select('question_id')
          .in('question_id', qIds)

        _calDebate = {}
        if (dmsgs) dmsgs.forEach(m => {
          _calDebate[m.question_id] = (_calDebate[m.question_id] || 0) + 1
        })

        // Agrupar por día
        qs.forEach(q => {
          const d   = new Date(q.created_at)
          const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
          if (!_calData[key]) _calData[key] = []
          _calData[key].push(q)
        })
      }
      _calRenderGrid(year, month)
    } catch(e) {
      console.warn('calLoadMonth:', e)
    } finally {
      _calLoading = false
    }
  }

  function _calRenderGrid(year, month) {
    const container = document.getElementById('cal-days')
    if (!container) return

    const today    = new Date()
    let startDow   = new Date(year, month, 1).getDay() - 1
    if (startDow < 0) startDow = 6
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const daysInPrev  = new Date(year, month, 0).getDate()
    let html = ''

    for (let i = startDow - 1; i >= 0; i--)
      html += `<div class="cal-day-cell inactive"><span class="cdn">${daysInPrev - i}</span></div>`

    for (let d = 1; d <= daysInMonth; d++) {
      const key   = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      const qs    = _calData[key] || []
      const isToday = year === today.getFullYear() && month === today.getMonth() && d === today.getDate()
      const isSel = _calSelDay === key
      let cls = 'cal-day-cell'
      if (isToday) cls += ' today'
      if (isSel)   cls += ' selected'
      if (qs.length) cls += ' has-activity'
      const hasDebate = qs.some(q => (_calDebate[q.id] || 0) > 0)
      const dots = qs.length
        ? `<div class="cal-dots">
            <div class="cal-dot" style="background:#1D9E75"></div>
            ${hasDebate ? '<div class="cal-dot" style="background:#7F77DD"></div>' : ''}
           </div>`
        : ''
      const clickable = qs.length ? `onclick="calSelectDay('${key}','${d} ${MONTHS_SHORT[month]}')"` : ''
      html += `<div class="${cls}" ${clickable}><span class="cdn">${d}</span>${dots}</div>`
    }

    const totalCells = startDow + daysInMonth
    const trailing   = (7 - (totalCells % 7)) % 7
    for (let d = 1; d <= trailing; d++)
      html += `<div class="cal-day-cell inactive"><span class="cdn">${d}</span></div>`

    container.innerHTML = html
  }

  window.calSelectDay = async function(key, label) {
    const qs = _calData[key]
    if (!qs || !qs.length) return
    _calSelDay = key
    calCloseDebate()
    _calRenderGrid(_calYear, _calMonth)

    const view  = document.getElementById('cal-day-view')
    const title = document.getElementById('cal-mid-title')
    if (!view) return

    if (title) title.textContent = label + ' · ' + qs.length + (qs.length === 1 ? ' pregunta' : ' preguntas')
    view.innerHTML = '<div class="cal-loading">Cargando resultados…</div>'

    // Cargar votos para preguntas cerradas
    const closed = qs.filter(q => q.status === 'cerrada' || new Date(q.ends_at) < new Date())
    await Promise.all(closed.map(async q => {
      if (_calVotes[q.id]) return
      try {
        const { data } = await sb.rpc('get_question_votes', { p_question_id: q.id })
        if (data) {
          let si = 0, no = 0, abs = 0
          data.forEach(r => {
            if (r.vote_plain === 'si')  si++
            else if (r.vote_plain === 'no')  no++
            else if (r.vote_plain === 'abs') abs++
          })
          _calVotes[q.id] = { si, no, abs }
        }
      } catch(e) {}
    }))

    view.innerHTML = qs.map(q => {
      const cat    = CAT_COLORS[q.category] || { bg:'#F0F0EC', color:'#5F5E5A' }
      const ended  = q.status === 'cerrada' || new Date(q.ends_at) < new Date()
      const v      = _calVotes[q.id]
      const total  = v ? v.si + v.no + v.abs : 0
      const pctSi  = total > 0 ? Math.round(v.si / total * 100) : 0
      const dcount = _calDebate[q.id] || 0
      const color  = v && v.si >= v.no ? '#1D9E75' : '#EF4444'
      const timeStr = new Date(q.created_at).toLocaleTimeString('es-VE', { hour:'2-digit', minute:'2-digit' })

      let barHtml = ''
      if (ended && v && total > 0) {
        barHtml = `<div class="cal-q-bar-row">
          <span class="cal-q-votes">${total} votos</span>
          <div class="cal-q-bar"><div class="cal-q-bar-fill" style="width:${pctSi}%;background:${color}"></div></div>
          <span class="cal-q-pct" style="color:${color}">${pctSi}% SÍ</span>
        </div>`
      } else if (!ended) {
        barHtml = `<div class="cal-q-bar-row"><span class="cal-q-votes" style="color:#F5A623">En curso</span></div>`
      }

      const debateSection = dcount > 0
        ? `<div class="cal-debate-toggle" onclick="calToggleDebate(this,'${q.id}',${dcount})" data-qid="${q.id}">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span>${dcount} mensajes</span>
          </div>`
        : ''

      return `<div class="cal-q-card">
        <div class="cal-q-top">
          <span class="cal-q-cat" style="background:${cat.bg};color:${cat.color}">${q.category||'—'}</span>
          <span class="cal-q-time">${timeStr}</span>
        </div>
        <div class="cal-q-text">${q.text}</div>
        ${barHtml}
        ${debateSection}
      </div>`
    }).join('')
  }

  window.calCloseDebate = function() {
    const col = document.getElementById('cal-debate-col')
    if (col) col.classList.remove('open')
    document.querySelectorAll('.cal-debate-toggle.active').forEach(b => b.classList.remove('active'))
  }

  window.calToggleDebate = async function(btn, qId, dcount) {
    const col    = document.getElementById('cal-debate-col')
    const msgsEl = document.getElementById('cal-deb-msgs')
    const titleEl = document.getElementById('cal-deb-title')
    if (!col || !msgsEl) return

    // Si ya está mostrando este debate → cerrar
    if (col.classList.contains('open') && col.dataset.qid === String(qId)) {
      calCloseDebate()
      return
    }

    // Marcar toggle activo
    document.querySelectorAll('.cal-debate-toggle').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')

    // Buscar texto de la pregunta
    const allQs = Object.values(_calData).flat()
    const q = allQs.find(x => x.id === qId)
    if (titleEl) titleEl.textContent = q ? q.text : `Debate · ${dcount} mensajes`

    col.dataset.qid = String(qId)
    col.classList.add('open')

    // Si ya cargamos este qId, no volver a fetchear
    if (col.dataset.loaded === String(qId)) return

    msgsEl.innerHTML = '<div class="cal-dm-loading">Cargando debate…</div>'
    try {
      const { data, error } = await sb.from('debate_messages')
        .select('seat_number, alias, text, created_at')
        .eq('question_id', qId)
        .order('created_at', { ascending: true })
      if (error) throw error
      col.dataset.loaded = String(qId)
      if (!data || !data.length) {
        msgsEl.innerHTML = '<div class="cal-deb-empty">Sin mensajes en este debate.</div>'
        return
      }
      msgsEl.innerHTML = data.map(m => {
        const t   = new Date(m.created_at).toLocaleTimeString('es-VE', { hour:'2-digit', minute:'2-digit' })
        const who = m.alias || `Butaca #${m.seat_number}`
        return `<div class="cal-dm">
          <div class="cal-dm-meta">
            <span class="cal-dm-seat">#${m.seat_number}</span>
            ${m.alias ? escapeHtml(m.alias) + ' ·' : ''} ${t}
          </div>
          ${escapeHtml(m.text)}
        </div>`
      }).join('')
      msgsEl.scrollTop = msgsEl.scrollHeight
    } catch(e) {
      msgsEl.innerHTML = '<div class="cal-deb-empty">Error al cargar el debate.</div>'
    }
  }

  window.calAbrirDebate = function(qId) {
    const allQs = Object.values(_calData).flat()
    const q = allQs.find(x => x.id === qId)
    if (!q) return
    _calClose()
    _debateQId   = qId
    _debateEnded = true
    _debateTheme = (window._CAT_THEME?.[q.category] || _CAT_DEFAULT)
    const subtitle = document.getElementById('dp-subtitle')
    if (subtitle) subtitle.textContent = q.text
    _loadDebateMessages(qId)
    _dpSetEndedUI(true)
    document.getElementById('debate-panel')?.classList.add('open')
    debateOpen = true
  }

  // Cerrar con Escape
  document.addEventListener('keydown', e => {
    if (_calOpen && e.key === 'Escape') _calClose()
  })
})()

// ══════════════════════════════════════════════════════════════
//  MODAL
// ══════════════════════════════════════════════════════════════
function abrirModal() {
  if (!_authUser || !MY_SEAT) {
    showToast(_isObserverMode() ? 'Modo observador — sin permiso para votar' : 'Verificá tu identidad para poder votar')
    return
  }

  // Si la votación ya cerró → revelación
  const qdata = PREGUNTAS_DATA[qIdx]
  if (qdata?.ends_at && new Date(qdata.ends_at) <= new Date()) {
    marcarRevelada(qdata.id)
    if (!SIM.active) iniciarSimulacion()
    return
  }

  const txt = PREGUNTAS[qIdx] || 'Pregunta activa'
  document.getElementById('modal-title').textContent = txt

  // Verificar si ya votó esta pregunta (chequeo local rápido)
  const qId = PREGUNTAS_IDS[qIdx]
  const votos = JSON.parse(localStorage.getItem('cabildoos_votos') || '{}')
  if (qId && votos[qId]) {
    const v = votos[qId].voto   // 'si' | 'no' | 'abs'
    const lbl = document.getElementById('ya-voto-lbl')
    if (lbl) {
      const labels = { si: 'SÍ', no: 'NO', abs: 'ABSTENCIÓN' }
      const colors = { si: '#178a5b', no: '#c0392b', abs: '#888' }
      lbl.textContent = labels[v] || v.toUpperCase()
      lbl.style.color = colors[v] || '#555'
    }
    showPh(4)
  } else {
    showPh(1)
  }
  document.getElementById('modal-bd').classList.add('open')
}

async function cancelarVoto() {
  const qId = PREGUNTAS_IDS[qIdx]
  if (!qId) return
  const btn = document.getElementById('btn-cancelar-voto')
  if (btn) btn.disabled = true

  // Eliminar voto via RPC (server-side — mantiene anonimato)
  const { data: cancelResult, error } = await sb.rpc('cancel_vote', { p_question_id: qId })
  const cancelError = cancelResult?.error || null
  const effectiveError = error || (cancelError && cancelError !== 'no_vote_found' ? { message: cancelError } : null)

  if (effectiveError) {
    console.error('cancelarVoto:', effectiveError)
    if (btn) btn.disabled = false
    showToast('Error al cancelar el voto')
    return
  }

  // Eliminar de localStorage
  const votos = JSON.parse(localStorage.getItem('cabildoos_votos') || '{}')
  delete votos[qId]
  localStorage.setItem('cabildoos_votos', JSON.stringify(votos))

  if (btn) btn.disabled = false
  showPh(1) // volver a la votación
}
function cerrarModal() {
  document.getElementById('modal-bd').classList.remove('open')
  showPh(1)
}
function checkBdClick(e) {
  if (e.target === document.getElementById('modal-bd')) cerrarModal()
}
// ══════════════════════════════════════════════════════════════
//  ANIMACIONES DE VOTO — SHA-256 + URNA
// ══════════════════════════════════════════════════════════════
let _shaCallback = null

function _randHex(n) {
  const H = '0123456789abcdef'
  return Array.from({length:n}, () => H[Math.floor(Math.random()*16)]).join('')
}
function _cascade(el, final, duration) {
  if (!el) return
  const H = '0123456789abcdef', n = final.length, start = Date.now()
  const tick = () => {
    const t = Math.min((Date.now()-start)/duration, 1)
    const rev = Math.floor(t*n)
    let s = ''
    for (let i=0;i<n;i++) s += i<rev ? final[i] : H[Math.floor(Math.random()*16)]
    el.textContent = s
    if (t<1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
function _progressTo(el, from, to, duration) {
  if (!el) return
  const start = Date.now()
  const tick = () => {
    const t = Math.min((Date.now()-start)/duration, 1)
    const e = 1-Math.pow(1-t,3)
    el.style.width = (from+(to-from)*e)+'%'
    if (t<1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

function _showSHAOverlay(voto, onContinue) {
  _shaCallback = onContinue
  const labels = {si:'SÍ', no:'NO', abs:'ABSTENCIÓN'}
  const cls    = {si:'vote-si', no:'vote-no', abs:'vote-abs'}

  const nonceEl = document.getElementById('vav-sha-nonce')
  const hashEl  = document.getElementById('vav-sha-hash')
  const barEl   = document.getElementById('vav-sha-bar')
  const doneEl  = document.getElementById('vav-sha-done')
  const btnEl   = document.getElementById('vav-sha-btn')
  const votoLbl = document.getElementById('vav-sha-voto-lbl')

  if (nonceEl) nonceEl.textContent = '—'
  if (hashEl)  hashEl.textContent  = '—'
  if (barEl)   barEl.style.width   = '0%'
  if (doneEl)  doneEl.classList.remove('show')
  if (btnEl)   btnEl.classList.remove('show')
  if (votoLbl) { votoLbl.textContent = labels[voto]||voto.toUpperCase(); votoLbl.className='vav-term-val '+(cls[voto]||'') }

  document.getElementById('vav-sha-overlay').classList.add('open')

  const fakeNonce = _randHex(64)
  const fakeHash  = _randHex(64)

  setTimeout(() => { _cascade(nonceEl, fakeNonce, 600); _progressTo(barEl, 0, 38, 600) }, 300)
  setTimeout(() => { _cascade(hashEl,  fakeHash,  900); _progressTo(barEl, 38, 88, 900) }, 950)
  setTimeout(() => {
    _progressTo(barEl, 88, 100, 250)
    setTimeout(() => {
      if (doneEl) doneEl.classList.add('show')
      if (btnEl)  btnEl.classList.add('show')
    }, 280)
  }, 2100)
}

function _shaOverlayContinue() {
  document.getElementById('vav-sha-overlay').classList.remove('open')
  if (_shaCallback) { _shaCallback(); _shaCallback = null }
}

function _showUrnaOverlay(voto) {
  const labels   = {si:'✓ Votaste SÍ', no:'✓ Votaste NO', abs:'✓ Te abstuviste'}
  const colBar   = {si:'#4ade80', no:'#f87171', abs:'#fbbf24'}
  const badgeCls = {si:'si', no:'no', abs:'abs'}

  const resetEl = id => { const el=document.getElementById(id); if(el){el.classList.remove('show','go','dropping');void el.offsetWidth}; return el }
  const envEl    = resetEl('vav-env-wrap')
  const checkEl  = resetEl('vav-urna-check')
  const rippleEl = resetEl('vav-urna-ripple')
  const badgeEl  = resetEl('vav-urna-vote-badge')
  const titleEl  = resetEl('vav-urna-title')
  const subEl    = resetEl('vav-urna-sub')
  const quoteEl  = resetEl('vav-urna-quote')
  const noteEl   = resetEl('vav-urna-note')
  const btnEl    = resetEl('vav-urna-btn')

  const bar = document.getElementById('vav-env-color-bar')
  if (bar) bar.setAttribute('fill', colBar[voto]||'#60a5fa')

  if (badgeEl) { badgeEl.textContent=labels[voto]||'✓ Voto emitido'; badgeEl.className='vav-urna-vote-badge '+(badgeCls[voto]||'') }

  document.getElementById('vav-urna-overlay').classList.add('open')

  setTimeout(() => { if(envEl)    envEl.classList.add('dropping') },    300)
  setTimeout(() => { if(rippleEl) rippleEl.classList.add('go') },       700)
  setTimeout(() => { if(checkEl)  checkEl.classList.add('show') },      600)
  ;[badgeEl,titleEl,subEl,quoteEl,noteEl,btnEl].forEach(el => { if(el) el.classList.add('show') })
}

function _mostrarVotacionCerrada() {
  const existing = document.getElementById('vav-closed-overlay')
  if (existing) { existing.classList.add('open'); return }

  const el = document.createElement('div')
  el.id = 'vav-closed-overlay'
  el.innerHTML = `
    <div class="vav-closed-inner">
      <div class="vav-closed-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <h3 class="vav-closed-title">Votación cerrada</h3>
      <p class="vav-closed-msg">No pudiste emitir tu voto porque la votación ya cerró. Los resultados estarán disponibles en la pantalla de revelación.</p>
      <button class="vav-closed-btn" onclick="document.getElementById('vav-closed-overlay').classList.remove('open')">Entendido</button>
    </div>`
  document.body.appendChild(el)
  requestAnimationFrame(() => el.classList.add('open'))
}

function _urnaOverlayClose() {
  document.getElementById('vav-urna-overlay')?.classList.remove('open')
  cerrarModal()
}

// ── Voting flow ──────────────────────────────────────────────────────
function elegir(v) {
  // Actualizar input hidden
  const vtEl = document.getElementById('voto-txt')
  if (vtEl) vtEl.value = v

  // Poblar ph2 con el voto elegido
  const labels  = {si:'SÍ', no:'NO', abs:'ABSTENCIÓN'}
  const icons   = {si:'✓', no:'✕', abs:'—'}
  const display = document.getElementById('ph2-vote-display')
  const icon    = document.getElementById('ph2-vote-icon')
  const label   = document.getElementById('ph2-vote-label')
  const qEcho   = document.getElementById('ph2-question-echo')

  if (display) { display.className = 'ph2-vote-display ' + v }
  if (icon)    { icon.className    = 'ph2-vote-icon '    + v; icon.textContent = icons[v] || '' }
  if (label)   { label.className   = 'ph2-vote-label '   + v; label.textContent = labels[v] || v.toUpperCase() }
  if (qEcho)     qEcho.textContent = PREGUNTAS[qIdx] || ''

  _showSHAOverlay(v, () => showPh(2))
}

async function confirmarVoto() {
  const voto = document.getElementById('voto-txt').value
  const qId  = PREGUNTAS_IDS[qIdx]
  if (!qId || !_authUser || !MY_SEAT) { showToast('Error: sesión no lista, recargá la página'); return }

  // Verificar que la votación sigue abierta
  const qdata = PREGUNTAS_DATA[qIdx]
  if (qdata?.ends_at && new Date(qdata.ends_at) <= new Date()) {
    showPh(1)
    cerrarModal()
    _mostrarVotacionCerrada()
    return
  }

  const btn = document.querySelector('#modal-bd .btn-ok')
  if (btn) { btn.disabled=true; btn.textContent='Sellando…' }

  const arr   = new Uint8Array(32)
  crypto.getRandomValues(arr)
  const nonce = Array.from(arr).map(b=>b.toString(16).padStart(2,'0')).join('')

  const raw  = `${voto}:${nonce}`
  const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  const hash = Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('')

  // Guardar en localStorage para que el usuario pueda ver su voto localmente
  const stored = JSON.parse(localStorage.getItem('cabildoos_votos')||'{}')
  stored[qId]  = {voto, nonce, hash, ts:Date.now()}
  localStorage.setItem('cabildoos_votos', JSON.stringify(stored))

  // cast_vote: el servidor computa identity_hash internamente — nunca viaja por la red
  const { data: castResult, error } = await sb.rpc('cast_vote', {
    p_question_id: qId,
    p_vote_hash:   hash,
    p_vote_plain:  voto,
    p_nonce:       nonce
  })

  const castError = castResult?.error || null

  if (btn) { btn.disabled=false; btn.textContent='Confirmar y sellar' }

  if (error || castError) {
    if (castError === 'already_voted') {
      showToast('Ya registraste tu voto en esta pregunta')
    } else {
      console.error('Vote commit error:', error || castError)
      showToast('Error al guardar voto: '+(error?.message || castError || 'intente de nuevo'))
    }
    return
  }

  _showUrnaOverlay(voto)
  renderQCards()
}

function showPh(n) {
  document.querySelectorAll('#modal-bd .phase').forEach((p,i) => p.classList.toggle('active', i+1===n))
}

// ══════════════════════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════════════════════
let toastT = null
function showToast(msg) {
  const t = document.getElementById('toast')
  t.textContent = msg; t.classList.add('show')
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800)
}

// ══════════════════════════════════════════════════════════════
//  INTRO SCREEN — hemiciclo animado sobre fondo azul
// ══════════════════════════════════════════════════════════════
let _introRaf = null
let _introRevealTimer = null
let _introSeats = []
let _introFrame = 0
let _introCtx = null
let _introCv = null

let _introResizeListenerAdded = false

function _initIntroCanvas(canvasId = 'intro-canvas') {
  _introCv = document.getElementById(canvasId)
  if (!_introCv) return
  _introCtx = _introCv.getContext('2d')
  _resizeIntro()
  // Solo agregar el resize listener una vez
  if (!_introResizeListenerAdded) {
    window.addEventListener('resize', _resizeIntro)
    _introResizeListenerAdded = true
  }
}

function _resizeIntro() {
  if (!_introCv) return
  _introCv.width  = window.innerWidth
  _introCv.height = window.innerHeight
  _buildIntroSeats()
}

function _buildIntroSeats() {
  _introSeats = []
  const W = _introCv.width, H = _introCv.height
  const cx = W / 2
  const cy = H + H * 0.05        // centro del arco debajo de la pantalla
  const scale = Math.min(W * 0.54, H * 0.84)
  const innerR = scale * 0.40
  const outerR = scale * 0.98
  const nRows  = 9
  const dotSp  = Math.max(10, W / 130)

  for (let row = 0; row < nRows; row++) {
    const t = row / (nRows - 1)
    const r = innerR + t * (outerR - innerR)
    const arcLen = Math.PI * r
    const n = Math.round(arcLen / dotSp)
    for (let i = 0; i < n; i++) {
      const angle = Math.PI * i / (n - 1)
      const x = cx - r * Math.cos(angle)
      const y = cy - r * Math.sin(angle)
      if (y > H * 0.02 && y < H * 0.97) {
        _introSeats.push({ x, y, row, vote: 'neutral', revealed: false, glow: 0 })
      }
    }
  }
  // Marcar un asiento central como "mi butaca"
  const midRow = Math.floor(nRows / 2)
  const midSeats = _introSeats.filter(s => s.row === midRow)
  const myS = midSeats[Math.floor(midSeats.length / 2)]
  if (myS) myS.vote = 'me'
}

function _introRevealComplete() {
  // Revelación completa — mostrar hero y dejar los dots vivos (sin re-ciclar)
  const hero = document.getElementById('intro-hero')
  if (hero) hero.classList.add('visible')
}

function _introAssignAndReveal() {
  if (!_introRaf) return  // ya fue detenida
  _introSeats.forEach(s => {
    if (s.vote === 'me') return
    const r = Math.random()
    s.vote     = r < .56 ? 'si' : r < .82 ? 'no' : r < .94 ? 'abs' : 'neutral'
    s.revealed = false
    s.glow     = 0
  })
  const W = _introCv.width, H = _introCv.height
  const cx = W / 2, cy = H + H * 0.05
  const ordered = _introSeats
    .filter(s => s.vote !== 'me')
    .sort((a, b) => ((a.x-cx)**2+(a.y-cy)**2) - ((b.x-cx)**2+(b.y-cy)**2))
  let i = 0
  const batchSize = Math.max(6, Math.round(ordered.length / 90))
  function tick() {
    if (!_introRaf) return
    for (let j = 0; j < batchSize && i < ordered.length; j++, i++) {
      ordered[i].revealed = true
      ordered[i].glow = 2.2
    }
    if (i < ordered.length) {
      _introRevealTimer = setTimeout(tick, 28)
    } else {
      // Reveal terminó — dots se quedan congelados, aparece el hero
      _introRevealTimer = setTimeout(_introRevealComplete, 600)
    }
  }
  tick()
}

const _IVOTE_FILL = {
  si:      '#22c55e',
  no:      '#ef4444',
  abs:     '#f59e0b',
  neutral: 'rgba(255,255,255,0.07)',
  me:      '#f76a1e'
}
const _IVOTE_GLOW = {
  si:      'rgba(34,197,94,',
  no:      'rgba(239,68,68,',
  abs:     'rgba(245,158,11,',
  neutral: 'rgba(255,255,255,',
  me:      'rgba(247,106,30,'
}

function _introDrawFrame() {
  if (!_introCtx || !_introCv) return
  _introFrame++
  const W = _introCv.width, H = _introCv.height
  const ctx = _introCtx

  // Fondo azul profundo
  ctx.fillStyle = '#040C1E'
  ctx.fillRect(0, 0, W, H)

  // Resplandor radial azul desde abajo-centro
  const g = ctx.createRadialGradient(W/2, H*1.04, 0, W/2, H*1.04, W * 0.65)
  g.addColorStop(0,   'rgba(37,99,235,0.24)')
  g.addColorStop(0.4, 'rgba(30,64,175,0.10)')
  g.addColorStop(1,   'transparent')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // Dots
  _introSeats.forEach(s => {
    const isMine = s.vote === 'me'
    if (!isMine && !s.revealed) return

    // Decay del glow
    if (s.glow > 0) s.glow = Math.max(0, s.glow - 0.048)

    const pulse = isMine ? (Math.sin(_introFrame / 30) * 0.5 + 0.5) : 0
    const baseR = isMine ? 5.5 : 4.0
    const r     = baseR + (s.glow > 0.4 ? s.glow * 1.2 : 0) + (isMine ? pulse * 1.8 : 0)
    const gl    = isMine ? 12 + pulse * 20 : s.glow * 18

    if (gl > 0.5) {
      const alpha = isMine ? 0.6 + pulse * 0.35 : Math.min(0.85, s.glow * 0.6)
      ctx.shadowColor = _IVOTE_GLOW[s.vote] + alpha + ')'
      ctx.shadowBlur  = gl
    }

    ctx.beginPath()
    ctx.arc(s.x, s.y, Math.max(0.5, r), 0, Math.PI * 2)
    ctx.fillStyle = _IVOTE_FILL[s.vote]
    ctx.fill()
    ctx.shadowBlur = 0
  })

  _introRaf = requestAnimationFrame(_introDrawFrame)
}

function _startIntroAnim(canvasId = 'intro-canvas', triggerReveal = false) {
  _initIntroCanvas(canvasId)
  if (_introRaf) {
    // Ya corriendo — si se pide reveal, dispararlo
    if (triggerReveal) setTimeout(_introAssignAndReveal, 200)
    return
  }
  const hero = document.getElementById('intro-hero')
  if (hero) hero.classList.remove('visible')
  _introSeats.forEach(s => {
    if (s.vote !== 'me') { s.vote = 'neutral'; s.revealed = false; s.glow = 0 }
  })
  _introFrame = 0
  _introRaf = requestAnimationFrame(_introDrawFrame)
  if (triggerReveal) setTimeout(_introAssignAndReveal, 800)
}

function _stopIntroAnim() {
  if (_introRaf) { cancelAnimationFrame(_introRaf); _introRaf = null }
  if (_introRevealTimer) { clearTimeout(_introRevealTimer); _introRevealTimer = null }
}

// ══════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════
resizeCanvas()
draw()
document.body.classList.add('on-intro')
// Inicializar canvas inmediatamente (dots neutrales), pero la revelación
// de colores la dispara el splash cuando termina
_startIntroAnim('intro-canvas')

// ══════════════════════════════════════════════════════════════
//  VENEZUELAN FLAG — generated via canvas for HD crispness
// ══════════════════════════════════════════════════════════════
;(function buildFlags() {
  const W = 54, H = 36          // CSS pixels
  const dpr = window.devicePixelRatio || 1
  const sh  = H / 3             // stripe height

  // 5-pointed star path at (cx,cy), outer radius ro, inner ri
  function starPath(ctx, cx, cy, ro, ri) {
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? ro : ri
      const a = (i * 36 - 90) * Math.PI / 180
      const x = cx + r * Math.cos(a)
      const y = cy + r * Math.sin(a)
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fill()
  }

  document.querySelectorAll('[data-flag]').forEach(el => {
    const c = document.createElement('canvas')
    c.width  = W * dpr
    c.height = H * dpr
    c.style.width  = W + 'px'
    c.style.height = H + 'px'
    const ctx = c.getContext('2d')
    ctx.scale(dpr, dpr)

    // Three stripes
    ctx.fillStyle = '#FCD116'; ctx.fillRect(0,    0,  W, sh)
    ctx.fillStyle = '#003893'; ctx.fillRect(0,   sh,  W, sh)
    ctx.fillStyle = '#CF1126'; ctx.fillRect(0, sh*2,  W, sh)

    // 7 stars in a circle inside the blue stripe
    const cx  = W / 2
    const cy  = sh + sh / 2        // center of blue stripe
    const arc = sh * 0.42          // radius of star arrangement
    const ro  = sh * 0.155         // outer star radius
    const ri  = ro * 0.4           // inner star radius

    ctx.fillStyle = '#ffffff'
    for (let i = 0; i < 7; i++) {
      const angle = (90 + i * (360 / 7)) * Math.PI / 180
      const sx = cx + arc * Math.cos(angle)
      const sy = cy - arc * Math.sin(angle)  // minus: SVG y goes down
      starPath(ctx, sx, sy, ro, ri)
    }

    el.appendChild(c)
  })
})()

// ══════════════════════════════════════════════════════════════
//  SPLASH — Cabildo de Venezuela badge animation
// ══════════════════════════════════════════════════════════════
;(function runSplash() {
  const canvas = document.getElementById('splash-canvas')
  const ctx    = canvas.getContext('2d')
  const dpr    = window.devicePixelRatio || 1

  const SIZE = 280
  canvas.width        = SIZE * dpr
  canvas.height       = SIZE * dpr
  canvas.style.width  = SIZE + 'px'
  canvas.style.height = SIZE + 'px'
  ctx.scale(dpr, dpr)

  const cx = SIZE / 2   // 140
  const cy = SIZE / 2   // 140
  const BADGE_R = 134

  // ── Hemiciclo dots config ──────────────────────────────────
  // Focal point slightly below center (like a real parliament chamber)
  const hcx = cx, hcy = cy + 20
  const ARC_START = 208 * Math.PI / 180   // lower-left
  const ARC_END   = 332 * Math.PI / 180   // lower-right  (arc opens upward)

  const rowDefs = [
    { r: 82, count: 9, dr: 4.0 },
    { r: 68, count: 8, dr: 3.7 },
    { r: 54, count: 7, dr: 3.5 },
    { r: 40, count: 6, dr: 3.2 },
    { r: 26, count: 5, dr: 3.0 },
  ]

  const allDots = []
  rowDefs.forEach((row, ri) => {
    for (let i = 0; i < row.count; i++) {
      const t = row.count === 1 ? 0.5 : i / (row.count - 1)
      const angle = ARC_START + t * (ARC_END - ARC_START)
      const x = hcx + Math.cos(angle) * row.r
      const y = hcy + Math.sin(angle) * row.r
      const isGreen = (ri === 3 && i === row.count - 2)
      allDots.push({ x, y, dr: row.dr, isGreen, scale: 0, revealAt: Infinity, done: false })
    }
  })

  // ── Easing ────────────────────────────────────────────────
  function elasticOut(t) {
    if (t <= 0) return 0; if (t >= 1) return 1
    const c = (2 * Math.PI) / 3
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c) + 1
  }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3) }

  // ── Stagger reveal — outer rows first, then inner ─────────
  const DOT_DUR = 380
  const STAGGER = 48
  const t0 = performance.now()
  const BADGE_IN_DUR = 500   // badge circle grows in first

  let dotIdx = 0
  rowDefs.forEach((row, ri) => {
    const rowDots = allDots.filter((_, i) => {
      let base = 0; for (let r = 0; r < ri; r++) base += rowDefs[r].count
      return i >= base && i < base + row.count
    })
    // shuffle within row for organic feel
    for (let i = rowDots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rowDots[i], rowDots[j]] = [rowDots[j], rowDots[i]]
    }
    rowDots.forEach(d => {
      d.revealAt = t0 + BADGE_IN_DUR + dotIdx * STAGGER
      dotIdx++
    })
  })
  const greenDot = allDots.find(d => d.isGreen)
  if (greenDot) greenDot.revealAt = t0 + BADGE_IN_DUR + (dotIdx - 1) * STAGGER + 60

  // ── Draw badge background ─────────────────────────────────
  function drawBadge(now, badgeT) {
    const sc = easeOut(Math.min(badgeT, 1))
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(sc, sc)
    ctx.translate(-cx, -cy)

    // Navy circle
    ctx.beginPath()
    ctx.arc(cx, cy, BADGE_R, 0, Math.PI * 2)
    ctx.fillStyle = '#1a3066'
    ctx.fill()

    // Outer dotted ring
    const DOT_RING_R = BADGE_R - 4
    const DOT_RING_N = 64
    for (let i = 0; i < DOT_RING_N; i++) {
      const a = (i / DOT_RING_N) * Math.PI * 2
      const dx = cx + Math.cos(a) * DOT_RING_R
      const dy = cy + Math.sin(a) * DOT_RING_R
      ctx.beginPath()
      ctx.arc(dx, dy, 2.2, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.45)'
      ctx.fill()
    }

    // Inner solid ring
    ctx.beginPath()
    ctx.arc(cx, cy, BADGE_R - 12, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.65)'
    ctx.lineWidth = 1.2
    ctx.stroke()

    // ── Text: Cabildo / de / Venezuela ──
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // "Cabildo"
    ctx.font = '800 33px Manrope, sans-serif'
    ctx.fillStyle = '#ffffff'
    ctx.fillText('Cabildo', cx, cy + 22)

    // "— de —"
    ctx.font = '700 12px Manrope, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillText('de', cx, cy + 42)
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.fillRect(cx - 42, cy + 41.5, 28, 1)
    ctx.fillRect(cx + 14, cy + 41.5, 28, 1)

    // "Venezuela"
    ctx.font = '800 31px Manrope, sans-serif'
    ctx.fillStyle = '#ffffff'
    ctx.fillText('Venezuela', cx, cy + 62)

    // Gold stars arc
    const STAR_COLOR = '#e9b84a'
    const STARS = 7
    const STAR_ARC_R = 86
    const STAR_ARC_START = (180 + 38) * Math.PI / 180
    const STAR_ARC_END   = (360 - 38) * Math.PI / 180
    ctx.font = '10px serif'
    ctx.fillStyle = STAR_COLOR
    for (let i = 0; i < STARS; i++) {
      const t = STARS === 1 ? 0.5 : i / (STARS - 1)
      const a = STAR_ARC_START + t * (STAR_ARC_END - STAR_ARC_START)
      const sx = cx + Math.cos(a) * STAR_ARC_R
      const sy = cy + Math.sin(a) * STAR_ARC_R
      ctx.save()
      ctx.translate(sx, sy)
      ctx.rotate(a + Math.PI / 2)
      ctx.fillText('★', 0, 0)
      ctx.restore()
    }

    // Curved "Generación Independencia 2026" text
    const CURVE_R = BADGE_R - 17
    const CURVE_TEXT = 'Generación Independencia 2026'
    const CURVE_START = -1.18   // radians (~-68°, top-right area)
    const CURVE_END   =  0.22
    ctx.font = '600 7.5px Manrope, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const charSpan = CURVE_END - CURVE_START
    for (let i = 0; i < CURVE_TEXT.length; i++) {
      const t = CURVE_TEXT.length === 1 ? 0.5 : i / (CURVE_TEXT.length - 1)
      const a = CURVE_START + t * charSpan
      const lx = cx + Math.cos(a) * CURVE_R
      const ly = cy + Math.sin(a) * CURVE_R
      ctx.save()
      ctx.translate(lx, ly)
      ctx.rotate(a + Math.PI / 2)
      ctx.fillText(CURVE_TEXT[i], 0, 0)
      ctx.restore()
    }

    ctx.restore()
  }

  // ── Draw hemiciclo dots ───────────────────────────────────
  function drawDots(now) {
    allDots.forEach(d => {
      if (now < d.revealAt) return
      const elapsed = now - d.revealAt
      const t = Math.min(elapsed / DOT_DUR, 1)
      d.scale = elasticOut(t)
      if (t >= 1) d.done = true
      if (d.scale <= 0) return

      if (d.isGreen && d.done) {
        const pulse = (Math.sin(now / 500) + 1) / 2
        ctx.shadowColor = `rgba(34,197,94,${0.6 + pulse * 0.4})`
        ctx.shadowBlur  = d.dr * (5 + pulse * 8)
      }

      ctx.beginPath()
      ctx.arc(d.x, d.y, d.dr * d.scale, 0, Math.PI * 2)
      ctx.fillStyle = d.isGreen ? '#22c55e' : 'rgba(255,255,255,0.92)'
      ctx.fill()
      ctx.shadowBlur = 0
    })
  }

  // ── Main loop ─────────────────────────────────────────────
  let textShown = false
  let finished  = false
  let raf

  function frame(now) {
    ctx.clearRect(0, 0, SIZE, SIZE)

    const badgeT = (now - t0) / BADGE_IN_DUR
    drawBadge(now, badgeT)
    if (badgeT >= 0.3) drawDots(now)

    const lastDot = allDots[allDots.length - 1]
    if (!textShown && lastDot && lastDot.done) {
      textShown = true
      const wm = document.getElementById('splash-wordmark')
      wm.innerHTML = 'Cabildo de Venezuela<span class="wm-sub">Generación Independencia 2026</span>'
      setTimeout(() => wm.classList.add('show'), 60)
    }

    if (!finished) raf = requestAnimationFrame(frame)
  }

  raf = requestAnimationFrame(frame)

  // Total duration: badge in + all dots + hold
  const totalDots = allDots.length
  const holdMs = BADGE_IN_DUR + totalDots * STAGGER + DOT_DUR + 1200
  setTimeout(() => {
    finished = true
    cancelAnimationFrame(raf)
    document.getElementById('splash').classList.add('out')
    // Disparar revelación de colores en el hemiciclo intro
    if (typeof _startIntroAnim === 'function') _startIntroAnim('intro-canvas', true)
    setTimeout(() => {
      document.getElementById('splash').style.display = 'none'
    }, 700)
  }, holdMs)
})()

// ══════════════════════════════════════════════════════════════
//  SOCIAL FOOTER
// ══════════════════════════════════════════════════════════════
const proposals = []

function mostrarFooter() {
  document.getElementById('social-footer').classList.add('visible')
}

// El centro modal se cierra solo con su propio backdrop click — no necesitamos listener global

function sfSelectTab(tab) {
  if (!_requireButaca()) return
  // Abrir el centro modal
  const modal = document.getElementById('sf-center-modal')
  modal.classList.add('open')
  sfActiveTab = tab

  // Modo: propuestas vs social
  const isPropsMode = tab === 'propuestas'
  const titleEl = document.getElementById('sf-cm-title')
  const tabsEl  = document.getElementById('sf-cm-tabs')
  if (titleEl) titleEl.textContent = isPropsMode ? 'Mis Propuestas' : 'Social'
  if (tabsEl)  tabsEl.style.display = isPropsMode ? 'none' : 'flex'

  // Activar tab en header del modal
  document.querySelectorAll('.sf-cm-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab))
  document.querySelectorAll('.sf-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab))

  // Mostrar pane correcto
  document.querySelectorAll('.sf-cm-pane').forEach(p => p.classList.toggle('active', p.id === 'sfp-' + tab))

  // Cargar contenido
  if (tab === 'propuestas') propSelectSubTab('mis')
  if (tab === 'seguidores') renderSocial('seguidores')
  if (tab === 'seguidos')   renderSocial('seguidos')
  if (tab === 'mensajes')   _loadAndRenderConversaciones()
}

// ── Abrir social tab desde el user pill dropdown ──
function abrirSocialTab(tab) {
  closeUserPill()
  sfSelectTab(tab)
}

// ── Cerrar centro modal social ──
function cerrarSocialPanel() {
  sfActiveTab = null
  document.getElementById('sf-center-modal')?.classList.remove('open')
  document.querySelectorAll('.sf-cm-tab').forEach(t => t.classList.remove('active'))
  document.querySelectorAll('.sf-tab').forEach(t => t.classList.remove('active'))
  document.querySelectorAll('#nav-social-btns .nav-act-btn').forEach(b => b.classList.remove('active-tab'))
}

let _propSubTab = 'mis'

function propSelectSubTab(tab) {
  _propSubTab = tab
  document.querySelectorAll('.prop-sub-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tab))
  const misEl   = document.getElementById('sf-propuestas-list')
  const otrasEl = document.getElementById('sf-otras-propuestas-list')
  if (misEl)   misEl.style.display   = tab === 'mis'   ? '' : 'none'
  if (otrasEl) otrasEl.style.display = tab === 'otras' ? '' : 'none'
  if (tab === 'mis')   renderPropuestas()
  if (tab === 'otras') renderOtrasPropuestas()
}

async function renderOtrasPropuestas() {
  const el = document.getElementById('sf-otras-propuestas-list')
  if (!el) return
  el.innerHTML = '<p class="sf-empty" style="opacity:.5">Cargando…</p>'

  const query = sb.from('proposals')
    .select('*')
    .eq('status', 'approved')
    .order('likes', { ascending: false })
    .limit(60)
  if (MY_SEAT > 0) query.neq('seat_number', MY_SEAT)

  const { data, error } = await query

  if (error || !data?.length) {
    el.innerHTML = '<p class="sf-empty">No hay propuestas aprobadas de otros usuarios aún.</p>'
    return
  }

  el.innerHTML = data.map(p => {
    const ci    = p.seat_number % AVATAR_COLORS_CONVO.length
    const alias = _profilesCache[p.seat_number]?.alias || `Butaca #${p.seat_number}`
    const init  = alias.slice(0, 2).toUpperCase()
    const date  = new Date(p.created_at).toLocaleDateString('es-ES', { day:'numeric', month:'short' })
    const txt   = escapeHtml(p.text.length > 110 ? p.text.slice(0, 110) + '…' : p.text)
    return `<div class="otras-prop-card" onclick="abrirUserProfile(${p.seat_number},'propuestas');cerrarSocialPanel()">
      <div class="otras-prop-author">
        <div class="otras-prop-av" style="background:${AVATAR_COLORS_CONVO[ci]}">${init}</div>
        <span class="otras-prop-alias">${escapeHtml(alias)}</span>
      </div>
      <p class="otras-prop-text">${txt}</p>
      <div class="otras-prop-meta">
        <span class="otras-prop-cat">${escapeHtml(p.cat)}</span>
        <span class="otras-prop-likes" id="sf-like-n-${p.id}">
          <svg width="11" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <span class="sf-like-count">${p.likes}</span>
        </span>
        <span class="otras-prop-date">${date}</span>
      </div>
    </div>`
  }).join('')
}

async function renderPropuestas() {
  const el = document.getElementById('sf-propuestas-list')
  el.innerHTML = '<p class="sf-empty" style="opacity:.5">Cargando…</p>'

  if (!MY_SEAT || MY_SEAT <= 0) {
    el.innerHTML = '<p class="sf-empty">Necesitás una butaca verificada para proponer.</p>'
    return
  }

  const { data, error } = await sb.from('proposals')
    .select('*')
    .eq('seat_number', MY_SEAT)
    .order('created_at', { ascending: false })

  if (error || !data?.length) {
    el.innerHTML = `<div class="sf-empty" style="padding:32px 0">
      <p style="margin-bottom:12px">Todavía no tenés propuestas.</p>
      <button class="prop-new-btn" onclick="cerrarSocialPanel();abrirPropuesta()">+ Crear primera propuesta</button>
    </div>`
    return
  }

  const statusLabel = { pending: 'En revisión', approved: '✓ Aprobada', rejected: 'Rechazada' }
  const statusClass = { pending: 'pending', approved: 'approved', rejected: 'rejected' }

  el.innerHTML = data.map(p => {
    const date = new Date(p.created_at).toLocaleDateString('es-ES', { day:'numeric', month:'short' })
    return `<div class="prop-card-v2">
      <div class="prop-card-v2-top">
        <p class="prop-card-v2-text">${escapeHtml(p.text.length > 90 ? p.text.slice(0,90) + '…' : p.text)}</p>
        <span class="prop-status-pill ${statusClass[p.status] || 'pending'}">${statusLabel[p.status] || 'En revisión'}</span>
      </div>
      <div class="prop-card-v2-meta">
        <span class="prop-cat-tag">${escapeHtml(p.cat)}</span>
        <span class="prop-likes" id="sf-like-n-${p.id}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <span class="sf-like-count">${p.likes}</span>
        </span>
        <span style="font-size:11px;color:var(--mid);margin-left:auto">${date}</span>
      </div>
    </div>`
  }).join('')
}

function compartirPropuesta(i) {
  const p = proposals[i]
  const url = `https://cabildo.os/p/${btoa(p.text).slice(0,8)}`
  navigator.clipboard.writeText(url).catch(() => {})
  showToast('🔗 Link copiado al portapapeles')
}

// Mock social data — vacío: no mostrar datos de ejemplo
const mockSocial = []

// ══════════════════════════════════════════════════════════════
//  SOCIAL CENTER MODAL — lista seguidores / seguidos
// ══════════════════════════════════════════════════════════════
let _slmCurrentTab = 'seguidores'

function abrirSocialModal(tab) {
  _slmCurrentTab = tab || 'seguidores'
  slmShowTab(_slmCurrentTab)
  document.getElementById('social-modal').classList.add('open')
}

function cerrarSocialModal() {
  document.getElementById('social-modal').classList.remove('open')
}

function slmShowTab(tab) {
  _slmCurrentTab = tab
  document.getElementById('slm-tab-seguidores').classList.toggle('active', tab === 'seguidores')
  document.getElementById('slm-tab-seguidos').classList.toggle('active',   tab === 'seguidos')
  const seats = tab === 'seguidores' ? [...followersConfirmed] : [...followingConfirmed]
  const el    = document.getElementById('slm-body')
  if (!seats.length) {
    el.innerHTML = `<p class="sf-empty" style="padding:40px 0">
      ${tab === 'seguidores' ? 'Nadie te sigue aún.' : 'No seguís a nadie aún.'}</p>`
    return
  }
  el.innerHTML = seats.map(seatNum => {
    const p = _profilesCache[seatNum]
    const alias   = p?.alias   || `Butaca #${seatNum}`
    const phrase  = p?.phrase  || ''
    const votes   = p?.votes   || 0
    const initials = alias.slice(0, 2).toUpperCase()
    const cIdx    = seatNum % AVATAR_COLORS.length
    const color   = AVATAR_COLORS[cIdx]
    return `<div class="slm-user-card">
      <div class="slm-uav" style="background:${color}">${initials}</div>
      <div class="slm-uinfo">
        <div class="slm-uname">${escapeHtml(alias)}</div>
        ${phrase ? `<div class="slm-uphrase">"${escapeHtml(phrase)}"</div>` : ''}
        <div class="slm-umeta">${votes} votaciones · Butaca #${seatNum}</div>
      </div>
      <button class="slm-ver-btn" onclick="abrirUserProfile(${seatNum},'${tab}')">Ver perfil</button>
    </div>`
  }).join('')
}

// ══════════════════════════════════════════════════════════════
//  USER PROFILE MODAL
// ══════════════════════════════════════════════════════════════
let _upmSeat     = null   // butaca del usuario que estamos viendo
let _upmFromTab  = 'seguidores'
let _upmCurTab   = 'propuestas'
let _upmProps    = []     // propuestas cargadas
let _upmLikes    = new Set()  // ids de proposals que yo likee
let _upmMsgChannel = null

window._upmFromTab = 'seguidores'

async function abrirUserProfile(seatNum, fromTab) {
  // Observador → registrarse; logueado sin butaca → verificarse
  if (document.body.classList.contains('observer-mode')) { abrirAuth('registro'); return }
  if (!_requireButaca()) return
  _upmSeat    = seatNum
  _upmFromTab = fromTab || 'seguidores'
  window._upmFromTab = _upmFromTab
  cerrarSocialModal()

  // Poblar header — la RPC incluye todos los asientos con granular visibility
  const p          = _profilesCache[seatNum]
  const showAlias  = !!(p?.showAlias  && p?.alias)
  const showPhrase = !!(p?.showPhrase && p?.phrase)
  const showVotes  =  !!(p?.showVotes)
  const isPrivate  = !showAlias
  const alias      = showAlias  ? p.alias   : `Butaca #${seatNum}`
  const phrase     = showPhrase ? p.phrase  : ''
  const votes      = showVotes  ? (p?.votes || 0) : 0
  const cIdx      = seatNum % AVATAR_COLORS.length
  const color     = AVATAR_COLORS[cIdx]

  const avEl = document.getElementById('upm-av')
  if (isPrivate) {
    avEl.textContent = '🔒'; avEl.style.background = '#e5e7eb'; avEl.style.fontSize = '20px'
  } else {
    avEl.textContent = alias.slice(0, 2).toUpperCase()
    avEl.style.background = color; avEl.style.fontSize = ''
  }
  document.getElementById('upm-alias').textContent       = isPrivate ? 'Ciudadano Anónimo' : alias
  document.getElementById('upm-seat').textContent        = `Butaca #${seatNum}`
  document.getElementById('upm-phrase-hero').textContent = isPrivate
    ? 'Este ciudadano eligió mantener su identidad privada.'
    : (phrase ? `"${phrase}"` : '')

  // Seguir button
  const fbtn = document.getElementById('upm-follow-btn')
  if (followingConfirmed.has(seatNum)) {
    fbtn.textContent = 'Siguiendo'; fbtn.className = 'upm-follow-btn-hero following'
  } else if (followingPending.has(seatNum)) {
    fbtn.textContent = 'Pendiente'; fbtn.className = 'upm-follow-btn-hero'
  } else {
    fbtn.textContent = 'Seguir'; fbtn.className = 'upm-follow-btn-hero'
  }

  // Cargar stats de seguidores/seguidos del usuario visto
  document.getElementById('upm-stat-segs').textContent = '…'
  document.getElementById('upm-stat-siguiendo').textContent = '…'
  sb.rpc('get_follow_stats', { p_seat: seatNum }).then(({ data }) => {
    if (data) {
      document.getElementById('upm-stat-segs').textContent      = data.followers ?? '—'
      document.getElementById('upm-stat-siguiendo').textContent = data.following  ?? '—'
    }
  }).catch(() => {})

  // Abrir modal — si venimos de una notificación de mensaje, abrir directo en mensajes
  document.getElementById('user-profile-modal').classList.add('open')
  upmShowTab(fromTab === 'mensajes-inbox' ? 'mensajes' : 'propuestas')
}

function cerrarUserProfile() {
  document.getElementById('user-profile-modal').classList.remove('open')
  if (_upmMsgChannel) { sb.removeChannel(_upmMsgChannel); _upmMsgChannel = null }
  _upmSeat = null
}

async function upmToggleFollow() {
  if (!_upmSeat || !MY_SEAT) return
  const fbtn = document.getElementById('upm-follow-btn')
  if (followingConfirmed.has(_upmSeat) || followingPending.has(_upmSeat)) {
    const { error } = await sb.from('follows').delete()
      .eq('from_seat', MY_SEAT).eq('to_seat', _upmSeat)
    if (!error) {
      followingConfirmed.delete(_upmSeat); followingPending.delete(_upmSeat)
      fbtn.textContent = 'Seguir'; fbtn.className = 'upm-follow-btn-hero'
      showToast(`Dejaste de seguir butaca #${_upmSeat}`)
    }
  } else {
    fbtn.disabled = true
    const { error } = await sb.from('follows').insert({ from_seat: MY_SEAT, to_seat: _upmSeat, status: 'pending' })
    fbtn.disabled = false
    if (!error) {
      followingPending.add(_upmSeat)
      fbtn.textContent = 'Pendiente'; fbtn.className = 'upm-follow-btn-hero'
      showToast(`Solicitud enviada a butaca #${_upmSeat}`)
    }
  }
}

function upmShowTab(tab) {
  _upmCurTab = tab
  document.getElementById('upm-tab-props').classList.toggle('active', tab === 'propuestas')
  document.getElementById('upm-tab-msgs').classList.toggle('active',  tab === 'mensajes')
  document.getElementById('upm-msg-bar').style.display = tab === 'mensajes' ? '' : 'none'
  if (tab === 'propuestas') upmLoadProposals()
  else                      upmLoadMessages()
}

async function upmLoadProposals() {
  const el = document.getElementById('upm-content')
  el.innerHTML = '<p class="sf-empty" style="opacity:.5">Cargando…</p>'

  // Cargar propuestas del usuario
  const [propsRes, myLikesRes] = await Promise.all([
    sb.from('proposals').select('id, text, cat, likes, status, created_at')
      .eq('seat_number', _upmSeat).order('created_at', { ascending: false }),
    MY_SEAT ? sb.from('proposal_likes').select('proposal_id')
      .eq('from_seat', MY_SEAT) : Promise.resolve({ data: [] })
  ])

  const props = propsRes.data || []
  _upmProps   = props
  _upmLikes   = new Set((myLikesRes.data || []).map(r => r.proposal_id))

  if (!props.length) {
    el.innerHTML = '<p class="sf-empty" style="padding:40px 0">Este usuario no tiene propuestas aún.</p>'
    return
  }

  // Cargar comentarios por propuesta
  const propIds = props.map(p => p.id)
  const { data: cmtCounts } = await sb.from('proposal_comments')
    .select('proposal_id').in('proposal_id', propIds)
  const cmtMap = {}
  ;(cmtCounts || []).forEach(c => { cmtMap[c.proposal_id] = (cmtMap[c.proposal_id] || 0) + 1 })

  const statusLabel = { pending: 'En revisión', approved: '✓ Aprobada', rejected: 'Rechazada' }
  el.innerHTML = props.map((p, i) => {
    const liked   = _upmLikes.has(p.id)
    const cmtN    = cmtMap[p.id] || 0
    const likeN   = p.likes || 0
    const date    = new Date(p.created_at).toLocaleDateString('es-ES', { day:'numeric', month:'short' })
    return `<div class="upm-prop-card" id="upm-prop-${p.id}">
      <p class="upm-prop-text">${escapeHtml(p.text)}</p>
      <div class="upm-prop-footer">
        <span class="upm-prop-cat">${escapeHtml(p.cat)}</span>
        <span style="font-size:10px;color:var(--mid);margin-left:6px">${statusLabel[p.status]||'En revisión'}</span>
        <span style="font-size:10px;color:var(--mid);margin-left:auto;margin-right:8px">${date}</span>
        <button class="upm-comment-btn" onclick="upmToggleComments('${p.id}')">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          ${cmtN}
        </button>
        <button class="upm-like-btn ${liked?'liked':''}" id="upm-like-${p.id}" onclick="upmToggleLike('${p.id}')">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="${liked?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <span id="upm-like-n-${p.id}">${likeN}</span>
        </button>
      </div>
      <div class="upm-comments-wrap" id="upm-cmts-${p.id}" style="display:none"></div>
    </div>`
  }).join('')
}

// Actualiza contadores de likes de una propuesta con el valor exacto del DB (sin delta)
function _propSetCount(propId, count) {
  if (!propId) return
  const upmEl = document.getElementById(`upm-like-n-${propId}`)
  if (upmEl) upmEl.textContent = count
  document.querySelectorAll(`#sf-like-n-${propId} .sf-like-count`).forEach(el => {
    el.textContent = count
  })
}

// Actualiza en el DOM todos los contadores de likes de una propuesta (delta = +1 o -1)
// Cubre: perfil modal (upm-like-n-*), social footer mis propuestas y otras propuestas (sf-like-n-*)
function _propLikeDelta(propId, delta) {
  if (!propId) return
  // Perfil modal (user profile popup)
  const upmEl = document.getElementById(`upm-like-n-${propId}`)
  if (upmEl) upmEl.textContent = Math.max(0, (parseInt(upmEl.textContent) || 0) + delta)

  // Social footer (mis propuestas + otras propuestas — mismo ID pattern)
  const sfEl = document.querySelector(`#sf-like-n-${propId} .sf-like-count`)
  if (sfEl) sfEl.textContent = Math.max(0, (parseInt(sfEl.textContent) || 0) + delta)
}

async function upmToggleLike(propId) {
  if (!MY_SEAT) { showToast('Necesitás una butaca para dar likes'); return }
  const btn = document.getElementById(`upm-like-${propId}`)
  const nEl = document.getElementById(`upm-like-n-${propId}`)
  const liked = _upmLikes.has(propId)

  if (liked) {
    await sb.from('proposal_likes').delete()
      .eq('proposal_id', propId).eq('from_seat', MY_SEAT)
    _upmLikes.delete(propId)
    // El trigger en DB actualiza proposals.likes — solo actualizamos UI local
    _propLikeDelta(propId, -1)
    btn.classList.remove('liked')
    btn.querySelector('svg path').setAttribute('fill','none')
  } else {
    const { error } = await sb.from('proposal_likes').insert({ proposal_id: propId, from_seat: MY_SEAT })
    if (!error) {
      _upmLikes.add(propId)
      _propLikeDelta(propId, +1)
      btn.classList.add('liked')
      btn.querySelector('svg path').setAttribute('fill','currentColor')
    }
  }
}

async function upmToggleComments(propId) {
  const wrap = document.getElementById(`upm-cmts-${propId}`)
  if (wrap.style.display !== 'none') { wrap.style.display = 'none'; return }
  wrap.style.display = 'block'
  wrap.innerHTML = '<p style="font-size:11px;color:var(--mid);padding:8px 0">Cargando…</p>'
  const { data } = await sb.from('proposal_comments')
    .select('id, from_seat, text, created_at').eq('proposal_id', propId)
    .order('created_at', { ascending: true })
  const cmts = data || []
  const cmtHtml = cmts.map(c => {
    const p = _profilesCache[c.from_seat]
    const alias = p?.alias || `#${c.from_seat}`
    const init  = alias.slice(0,2).toUpperCase()
    const cIdx  = c.from_seat % AVATAR_COLORS.length
    return `<div class="upm-comment-row">
      <div class="upm-cmt-av" style="background:${AVATAR_COLORS[cIdx]}">${init}</div>
      <div class="upm-cmt-bubble">
        <div class="upm-cmt-name">${escapeHtml(alias)}</div>
        <div class="upm-cmt-text">${escapeHtml(c.text)}</div>
      </div>
    </div>`
  }).join('')
  const canComment = MY_SEAT && MY_SEAT > 0
  wrap.innerHTML = (cmts.length ? cmtHtml : '<p class="sf-empty" style="padding:8px 0;font-size:11px">Sin comentarios aún.</p>') +
    (canComment ? `<div class="upm-cmt-input-row">
      <input class="upm-cmt-input" id="upm-cmt-inp-${propId}" placeholder="Dejá un comentario…" maxlength="300"
             onkeydown="if(event.key==='Enter'){upmSendComment('${propId}');event.preventDefault()}">
      <button class="upm-cmt-send" onclick="upmSendComment('${propId}')">↑</button>
    </div>` : '')
}

async function upmSendComment(propId) {
  const inp = document.getElementById(`upm-cmt-inp-${propId}`)
  const text = inp?.value?.trim()
  if (!text || !MY_SEAT) return
  inp.disabled = true
  const { error } = await sb.from('proposal_comments').insert({ proposal_id: propId, from_seat: MY_SEAT, text })
  inp.disabled = false
  if (!error) {
    inp.value = ''
    // Recargar comentarios
    await upmToggleComments(propId)  // cierra
    await upmToggleComments(propId)  // reabre con nuevo
    showToast('Comentario publicado')
  }
}

async function upmLoadMessages() {
  const el = document.getElementById('upm-content')
  el.innerHTML = '<p class="sf-empty" style="opacity:.5">Cargando…</p>'
  if (!MY_SEAT || !_upmSeat) {
    el.innerHTML = '<p class="sf-empty">Necesitás una butaca para enviar mensajes.</p>'; return
  }

  // Fetch hilo entre los dos
  const { data } = await sb.from('messages').select('*')
    .or(`and(from_seat.eq.${MY_SEAT},to_seat.eq.${_upmSeat}),and(from_seat.eq.${_upmSeat},to_seat.eq.${MY_SEAT})`)
    .order('created_at', { ascending: true })

  upmRenderMessages(data || [])

  // Marcar como leídos en DB y limpiar badge
  sb.from('messages').update({ read_at: new Date().toISOString() })
    .eq('to_seat', MY_SEAT).eq('from_seat', _upmSeat).is('read_at', null).then(() => {})
  delete _unreadConvos[_upmSeat]
  _renderMensajes()

  // Suscribir realtime al hilo
  if (_upmMsgChannel) sb.removeChannel(_upmMsgChannel)
  _upmMsgChannel = sb.channel(`msgs-${MY_SEAT}-${_upmSeat}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
      const m = payload.new
      const relevant = (m.from_seat === MY_SEAT && m.to_seat === _upmSeat)
                    || (m.from_seat === _upmSeat && m.to_seat === MY_SEAT)
      if (relevant && _upmCurTab === 'mensajes') {
        const wrap = document.getElementById('upm-content').querySelector('.upm-chat-wrap')
        if (wrap) {
          const isMine = m.from_seat === MY_SEAT
          const bubble = document.createElement('div')
          bubble.className = 'upm-msg-bubble ' + (isMine ? 'mine' : 'theirs')
          bubble.textContent = m.text
          wrap.appendChild(bubble)
          bubble.scrollIntoView({ behavior: 'smooth' })
        }
      }
    })
    .subscribe()
}

function upmRenderMessages(msgs) {
  const el = document.getElementById('upm-content')
  if (!msgs.length) {
    el.innerHTML = '<div class="upm-chat-wrap"><p class="sf-empty" style="padding:40px 0">Empezá la conversación 👋</p></div>'
    return
  }
  el.innerHTML = '<div class="upm-chat-wrap">' + msgs.map(m => {
    const isMine = m.from_seat === MY_SEAT
    const t = new Date(m.created_at).toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' })
    return `<div style="display:flex;flex-direction:column;align-items:${isMine?'flex-end':'flex-start'}">
      <div class="upm-msg-bubble ${isMine?'mine':'theirs'}">${m.text}</div>
      <div class="upm-msg-time">${t}</div>
    </div>`
  }).join('') + '</div>'
  // Scroll al final
  setTimeout(() => { el.scrollTop = el.scrollHeight }, 50)
}

async function upmSendMsg() {
  const inp  = document.getElementById('upm-msg-input')
  const text = sanitizeInput(inp?.value)
  if (!text || !MY_SEAT || !_upmSeat) return
  inp.value = ''
  inp.disabled = true
  const { error } = await sb.from('messages').insert({ from_seat: MY_SEAT, to_seat: _upmSeat, text })
  inp.disabled = false
  if (error) { inp.value = text; showToast('Error al enviar', true) }
  else { inp.focus() }
}

function _renderMensajes() {
  const el = document.getElementById('sf-mensajes-list')
  if (!el) return

  const unreadSeats   = Object.keys(_unreadConvos).map(Number)
  const totalRequests = _pendingRequestsToMe.length
  const totalUnread   = unreadSeats.reduce((s, seat) => s + _unreadConvos[seat].count, 0)

  _renderNotifBadge()

  if (!totalRequests && !unreadSeats.length) {
    el.innerHTML = `<div class="sf-empty-msg">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <p>No tenés mensajes aún</p>
      <p style="font-size:11px;margin-top:4px;color:var(--mid)">Las solicitudes y mensajes aparecerán aquí</p>
    </div>`
    return
  }

  // Sección solicitudes de seguimiento
  const reqsHtml = totalRequests ? `
    <p style="font-size:10px;font-weight:700;color:var(--mid);letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">Solicitudes</p>
    ${_pendingRequestsToMe.map(req => {
      const p = _profilesCache[req.from_seat]
      const alias    = p?.alias || `Butaca #${req.from_seat}`
      const initials = alias.slice(0, 2).toUpperCase()
      const cIdx     = req.from_seat % AVATAR_COLORS.length
      return `<div class="sf-req-card" id="sf-req-${req.id}">
        <div class="sf-req-top">
          <div class="sf-req-av" style="background:${AVATAR_COLORS[cIdx]}">${initials}</div>
          <div class="sf-req-info">
            <div class="sf-req-name">${escapeHtml(alias)}</div>
            <div class="sf-req-sub">quiere seguirte</div>
          </div>
        </div>
        <div class="sf-req-actions">
          <button class="sf-req-accept" onclick="aceptarSolicitud('${req.id}',${req.from_seat})">✓ Aceptar</button>
          <button class="sf-req-reject" onclick="rechazarSolicitud('${req.id}',${req.from_seat})">Rechazar</button>
        </div>
      </div>`
    }).join('')}` : ''

  // Sección mensajes no leídos
  const msgsHtml = unreadSeats.length ? `
    <p style="font-size:10px;font-weight:700;color:var(--mid);letter-spacing:.06em;text-transform:uppercase;margin:${totalRequests?'14px':0} 0 8px">Mensajes</p>
    ${unreadSeats.map(seat => {
      const p        = _profilesCache[seat]
      const alias    = p?.alias || `Butaca #${seat}`
      const initials = alias.slice(0, 2).toUpperCase()
      const cIdx     = seat % AVATAR_COLORS.length
      const conv     = _unreadConvos[seat]
      const preview  = conv.lastText.length > 45 ? conv.lastText.slice(0,45)+'…' : conv.lastText
      const t        = new Date(conv.lastTime).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})
      return `<div class="sf-msg-row unread" onclick="abrirUserProfile(${seat},'mensajes-inbox');sfSelectTab('');cerrarSocialPanel()" style="cursor:pointer">
        <div class="sf-msg-av" style="background:${AVATAR_COLORS[cIdx]}">${initials}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
            <span style="font-size:12px;font-weight:700;color:var(--dark)">${escapeHtml(alias)}</span>
            <span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:20px;background:#ef4444;color:#fff;margin-left:auto">${conv.count}</span>
          </div>
          <p class="sf-msg-preview">${escapeHtml(preview)}</p>
        </div>
        <span class="sf-msg-time">${t}</span>
      </div>`
    }).join('')}` : ''

  // Notificaciones de propuestas de seguidos
  const unreadNotifs = _notifications.filter(n => !n.read_at && n.type === 'new_proposal')
  const notifsHtml = unreadNotifs.length ? `
    <p style="font-size:10px;font-weight:700;color:var(--mid);letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px;margin-top:${(totalRequests || unreadSeats.length) ? 12 : 0}px">Nuevas propuestas</p>
    ${unreadNotifs.map(n => {
      const alias = _profilesCache[n.from_seat]?.alias || `Butaca #${n.from_seat}`
      const t = new Date(n.created_at).toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' })
      return `<div class="sf-msg-row" style="cursor:pointer" onclick="_abrirPropuestaNotif('${n.proposal_id}','${n.from_seat}','${n.id}')">
        <div class="sf-msg-av" style="background:#f76a1e;color:#fff;font-size:14px">📣</div>
        <div class="sf-msg-info">
          <p class="sf-msg-alias" style="font-weight:700">${escapeHtml(alias)}</p>
          <p class="sf-msg-preview">${escapeHtml(n.message)}</p>
        </div>
        <span class="sf-msg-time">${t}</span>
      </div>`
    }).join('')}` : ''

  el.innerHTML = reqsHtml + msgsHtml + notifsHtml
}

async function aceptarSolicitud(reqId, fromSeat) {
  const { error } = await sb.from('follows')
    .update({ status: 'accepted' })
    .eq('id', reqId)
  if (!error) {
    _pendingRequestsToMe = _pendingRequestsToMe.filter(r => r.id !== reqId)
    followersConfirmed.add(fromSeat)
    _renderMensajes()
    renderSocial('seguidores')
    showToast(`Aceptaste a butaca #${fromSeat} como seguidor`)
  }
}

async function rechazarSolicitud(reqId, fromSeat) {
  const { error } = await sb.from('follows')
    .delete()
    .eq('id', reqId)
  if (!error) {
    _pendingRequestsToMe = _pendingRequestsToMe.filter(r => r.id !== reqId)
    _renderMensajes()
    showToast(`Solicitud de butaca #${fromSeat} rechazada`)
  }
}

function renderSocial(type) {
  const el = document.getElementById(`sf-${type}-list`)
  const seats = type === 'seguidos'
    ? [...followingConfirmed]
    : [...followersConfirmed]

  if (!seats.length) {
    el.innerHTML = '<p class="sf-empty">' + (type === 'seguidos' ? 'No seguís a nadie aún.' : 'Nadie te sigue aún.') + '</p>'
    return
  }
  const source = seats.map(n => {
    const p = _profilesCache[n] || getProfile(n)
    return { seat: n, alias: p.alias || `Butaca #${n}`, phrase: p.phrase || '' }
  })
  const countLabel = type === 'seguidos'
    ? `${seats.length} ${seats.length === 1 ? 'persona seguida' : 'personas seguidas'}`
    : `${seats.length} ${seats.length === 1 ? 'seguidor' : 'seguidores'}`
  el.innerHTML = `<div class="sf-soc-section-hd">${countLabel}</div>` +
    source.map(s => {
    const initials = s.alias.slice(0, 2).toUpperCase()
    const ci = s.seat % AVATAR_COLORS_CONVO.length
    const phrase = escapeHtml(s.phrase ? s.phrase.slice(0, 55) + (s.phrase.length > 55 ? '…' : '') : `Butaca #${s.seat}`)
    return `<div class="sf-social-row">
      <div class="sf-soc-av" style="background:${AVATAR_COLORS_CONVO[ci]}">${initials}</div>
      <div class="sf-soc-info">
        <p class="sf-soc-name">${escapeHtml(s.alias)}</p>
        <p class="sf-soc-sub">${phrase}</p>
      </div>
      <button class="sf-soc-btn" onclick="abrirUserProfile(${s.seat});cerrarSocialPanel()">Ver</button>
    </div>`
  }).join('')
}

// Simulate follower responses arriving
function simularRespuestasSeguidores(propIdx) {
  const p = proposals[propIdx]
  let tick = 0
  const iv = setInterval(() => {
    const r = Math.random()
    if (r < 0.6)      p.si++
    else if (r < 0.85) p.no++
    else               p.abs++
    tick++
    if (tick >= 7) clearInterval(iv)
    if (sfActiveTab === 'propuestas') renderPropuestas()
  }, 1800)
}

// ══════════════════════════════════════════════════════════════
//  SISTEMA — modales legales
// ══════════════════════════════════════════════════════════════

// ── Modales legales ──────────────────────────────────────────
function abrirModalPrivacidad() {
  document.getElementById('modal-privacidad').classList.add('open')
}
function abrirModalTerminos() {
  document.getElementById('modal-terminos').classList.add('open')
}
function abrirModalAyuda() {
  document.getElementById('modal-ayuda').classList.add('open')
}

async function enviarPreguntaAyuda() {
  const msg = sanitizeInput(document.getElementById('ayuda-pregunta').value)
  if (!msg) return
  try {
    await sb.from('bug_reports').insert({
      seat_number: MY_SEAT || null,
      alias:       _authProfile?.alias || null,
      category:    'consulta',
      message:     '[Pregunta de Ayuda] ' + msg,
    })
    document.getElementById('ayuda-pregunta').value = ''
    document.getElementById('modal-ayuda').classList.remove('open')
    mostrarToast('✓ Tu pregunta fue enviada — te respondemos pronto')
  } catch(e) {
    mostrarToast('Error al enviar la pregunta')
  }
}

// ── Bug report / Contacto ─────────────────────────────────────
const _BUG_TITLES = {
  error:     '🔴 Reportar un problema',
  sugerencia:'💡 Sugerencia de mejora',
  consulta:  '❓ Consulta',
  contacto:  '✉️ Contacto',
}
function abrirBugReport(categoria) {
  const cat = categoria || 'error'
  document.getElementById('bug-modal-title').textContent = _BUG_TITLES[cat] || 'Escribinos'
  document.getElementById('bug-category').value = cat
  document.getElementById('bug-message').value = ''
  document.getElementById('bug-modal-overlay').classList.add('open')
  setTimeout(() => document.getElementById('bug-message').focus(), 100)
}

function cerrarBugReport() {
  document.getElementById('bug-modal-overlay').classList.remove('open')
}

async function enviarBugReport() {
  const msg = sanitizeInput(document.getElementById('bug-message').value)
  if (!msg) return
  const btn = document.getElementById('bug-send-btn')
  btn.disabled = true; btn.textContent = 'Enviando…'
  try {
    await sb.from('bug_reports').insert({
      seat_number: MY_SEAT || null,
      alias:       _authProfile?.alias || null,
      category:    document.getElementById('bug-category').value,
      message:     msg,
    })
    cerrarBugReport()
    mostrarToast('✓ Mensaje enviado — gracias')
  } catch(e) {
    mostrarToast('Error al enviar')
  } finally {
    btn.disabled = false; btn.textContent = 'Enviar'
  }
}

// Mostrar "Reportar" en el footer solo cuando está logueado
function _syncBugFab() {
  const lnk = document.getElementById('footer-bug-link')
  if (lnk) lnk.style.display = _authUser ? '' : 'none'
}

// ══════════════════════════════════════════════════════════════
//  AUDITORIO
// ══════════════════════════════════════════════════════════════
let _audChannel        = null
let _audSessionChannel = null
let _audPresenceState  = {}
let _audCurrentSession = null

// Canvas state
let _audCv = null, _audCtx2 = null
let _audCamX = 0, _audCamY = 0, _audZoom = 1
let _audDragState = null
let _audPresentSet = new Set()
let _audRafId = null
let _audMuted = false   // estado de mute del video
let _audTouchDist = 0

async function abrirAuditorio() {
  document.getElementById('auditorio-overlay').classList.add('open')
  await _audLoadSession()
  _audJoinPresence()
  _audSubscribeSession()
  // Init canvas after transition
  setTimeout(_audCanvasInit, 320)
}

function cerrarAuditorio() {
  document.getElementById('auditorio-overlay').classList.remove('open')
  const vc = document.getElementById('aud-video-container')
  if (vc) { const fr = vc.querySelector('iframe'); if (fr) fr.remove() }
  if (_audChannel)        { sb.removeChannel(_audChannel);        _audChannel = null }
  if (_audSessionChannel) { sb.removeChannel(_audSessionChannel); _audSessionChannel = null }
  _audPresenceState = {}
  _audCanvasDestroy()
}

// ── Canvas interactivo ──────────────────────────────────────
function _audCanvasInit() {
  const wrap = document.getElementById('aud-canvas-wrap')
  const cv   = document.getElementById('aud-hemi-canvas')
  if (!wrap || !cv) return
  _audCv  = cv
  _audCtx2 = cv.getContext('2d')
  _audCanvasResize()
  _audFit()
  _audDraw()

  // Show "Mi butaca" btn if applicable
  const meBtn = document.getElementById('aud-goto-me-btn')
  if (meBtn) meBtn.style.display = MY_SEAT > 0 ? '' : 'none'

  cv.addEventListener('mousedown',  _audMD)
  cv.addEventListener('wheel',      _audWheel, { passive: false })
  cv.addEventListener('touchstart', _audTS, { passive: true })
  cv.addEventListener('touchmove',  _audTM, { passive: false })
  cv.addEventListener('touchend',   _audTE, { passive: true })
  window.addEventListener('mousemove', _audMV)
  window.addEventListener('mouseup',   _audMU)
}

function _audCanvasDestroy() {
  if (_audCv) {
    _audCv.removeEventListener('mousedown',  _audMD)
    _audCv.removeEventListener('wheel',      _audWheel)
    _audCv.removeEventListener('touchstart', _audTS)
    _audCv.removeEventListener('touchmove',  _audTM)
    _audCv.removeEventListener('touchend',   _audTE)
  }
  window.removeEventListener('mousemove', _audMV)
  window.removeEventListener('mouseup',   _audMU)
  if (_audRafId) { cancelAnimationFrame(_audRafId); _audRafId = null }
  _audCv = null; _audCtx2 = null; _audDragState = null
}

function _audCanvasResize() {
  if (!_audCv) return
  const wrap = document.getElementById('aud-canvas-wrap')
  if (!wrap) return
  const W = wrap.clientWidth, H = wrap.clientHeight
  _audCv.width  = W * devicePixelRatio
  _audCv.height = H * devicePixelRatio
  _audCv.style.width  = W + 'px'
  _audCv.style.height = H + 'px'
}

function _audFit() {
  if (!_audCv || !SEATS || !SEATS.length || bx1 === bx0) return
  const W = _audCv.width, H = _audCv.height
  _audZoom = Math.min(W * 0.88 / (bx1 - bx0), H * 0.88 / (by1 - by0))
  _audCamX = -((bx0 + bx1) / 2) * _audZoom
  _audCamY = -((by0 + by1) / 2) * _audZoom  // sin flip-Y
}

function _audGoToMe() {
  if (!_audCv || MY_SEAT <= 0) return
  const me = SEATS.find(s => s.num === MY_SEAT)
  if (!me) return
  // Zoom in y centrar exactamente en mi butaca
  const W = _audCv.width, H = _audCv.height
  const fitZoom = Math.min(W * 0.88 / (bx1 - bx0), H * 0.88 / (by1 - by0))
  _audZoom = Math.max(fitZoom * 4, _audZoom)
  _audCamX = -me.x * _audZoom
  _audCamY = -me.y * _audZoom  // sin flip-Y
  _audDraw()
}

// Mouse/touch handlers
function _audMD(e) {
  _audDragState = { sx: e.clientX, sy: e.clientY, cx: _audCamX, cy: _audCamY }
}
function _audMV(e) {
  if (!_audDragState) return
  _audCamX = _audDragState.cx + (e.clientX - _audDragState.sx) * devicePixelRatio
  _audCamY = _audDragState.cy + (e.clientY - _audDragState.sy) * devicePixelRatio
  _audDraw()
}
function _audMU() { _audDragState = null }
function _audWheel(e) {
  e.preventDefault()
  const f = e.deltaY < 0 ? 1.12 : 0.9
  _audZoom = Math.max(0.2, Math.min(12, _audZoom * f))
  _audDraw()
}
function _audTS(e) {
  if (e.touches.length === 1) {
    _audDragState = { sx: e.touches[0].clientX, sy: e.touches[0].clientY, cx: _audCamX, cy: _audCamY }
  } else if (e.touches.length === 2) {
    _audTouchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
  }
}
function _audTM(e) {
  e.preventDefault()
  if (e.touches.length === 1 && _audDragState) {
    _audCamX = _audDragState.cx + (e.touches[0].clientX - _audDragState.sx) * devicePixelRatio
    _audCamY = _audDragState.cy + (e.touches[0].clientY - _audDragState.sy) * devicePixelRatio
  } else if (e.touches.length === 2) {
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
    if (_audTouchDist > 0) _audZoom = Math.max(0.2, Math.min(12, _audZoom * (d / _audTouchDist)))
    _audTouchDist = d
  }
  _audDraw()
}
function _audTE() { _audDragState = null }

function _audDraw() {
  if (_audRafId) cancelAnimationFrame(_audRafId)
  _audRafId = requestAnimationFrame(_audDrawFrame)
}

function _audDrawFrame() {
  _audRafId = null
  const ctx = _audCtx2, cv = _audCv
  if (!ctx || !cv || !SEATS || !SEATS.length) return

  const W = cv.width, H = cv.height
  ctx.clearRect(0, 0, W, H)
  ctx.save()
  ctx.translate(W / 2 + _audCamX, H / 2 + _audCamY)
  ctx.scale(_audZoom, _audZoom)  // sin flip-Y: hemiciclo orientado con podio arriba (hacia el video)

  const zInv = 1 / _audZoom
  const dotR  = Math.max(4,   8  * zInv)
  const litR  = Math.max(9,   16 * zInv)

  // Background dots
  ctx.fillStyle = 'rgba(255,255,255,0.14)'
  SEATS.forEach(s => {
    if (_audPresentSet.has(s.num) || s.num === MY_SEAT) return
    ctx.beginPath()
    ctx.arc(s.x, s.y, dotR, 0, Math.PI * 2)
    ctx.fill()
  })

  // Present seats with glow
  SEATS.forEach(s => {
    const isMe      = MY_SEAT > 0 && s.num === MY_SEAT
    const isPresent = _audPresentSet.has(s.num)
    if (!isPresent && !isMe) return

    const color = '#F5A623'
    // Outer glow
    ctx.globalAlpha = 0.12
    ctx.fillStyle = color
    ctx.beginPath(); ctx.arc(s.x, s.y, litR * 3.5, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 0.22
    ctx.beginPath(); ctx.arc(s.x, s.y, litR * 2,   0, Math.PI * 2); ctx.fill()
    // Core dot
    ctx.globalAlpha = 1
    ctx.shadowColor = color
    ctx.shadowBlur  = 18 * zInv
    ctx.fillStyle   = color
    ctx.beginPath(); ctx.arc(s.x, s.y, litR, 0, Math.PI * 2); ctx.fill()
    ctx.shadowBlur  = 0
    // Pulse ring + extra halo for my seat
    if (isMe) {
      ctx.globalAlpha = 0.6
      ctx.strokeStyle = color
      ctx.lineWidth   = 2.5 * zInv
      ctx.beginPath(); ctx.arc(s.x, s.y, litR * 2.2, 0, Math.PI * 2); ctx.stroke()
      ctx.globalAlpha = 0.25
      ctx.beginPath(); ctx.arc(s.x, s.y, litR * 3.5, 0, Math.PI * 2); ctx.stroke()
      ctx.globalAlpha = 1
    }
  })

  ctx.restore()
}

async function _audLoadSession() {
  try {
    const { data } = await sb.from('auditorio_sessions')
      .select('*').eq('is_active', true).limit(1).maybeSingle()
    _audCurrentSession = data || null
  } catch(e) { _audCurrentSession = null }
  _audRender()
}

function _audSubscribeSession() {
  if (_audSessionChannel) sb.removeChannel(_audSessionChannel)
  _audSessionChannel = sb.channel('auditorio-session-watch')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'auditorio_sessions' }, () => {
      _audLoadSession()
    })
    .subscribe()
}

function _audJoinPresence() {
  if (_audChannel) sb.removeChannel(_audChannel)
  _audChannel = sb.channel('auditorio-live', { config: { presence: { key: String(MY_SEAT || 0) } } })

  _audChannel
    .on('presence', { event: 'sync' }, () => {
      _audPresenceState = _audChannel.presenceState()
      _audUpdatePresence()
    })
    .on('broadcast', { event: 'reaction' }, ({ payload }) => {
      _audShowFloatReaction(payload.emoji)
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && MY_SEAT > 0) {
        await _audChannel.track({ seat: MY_SEAT, at: Date.now() })
      }
    })
}

function _audUpdatePresence() {
  const presentSeats = new Set()
  Object.values(_audPresenceState).forEach(list =>
    list.forEach(p => { if (p.seat > 0) presentSeats.add(p.seat) })
  )
  const countEl = document.getElementById('aud-count')
  const viewerWrap = document.getElementById('aud-viewer-count')
  if (countEl) countEl.textContent = presentSeats.size
  if (viewerWrap) viewerWrap.style.display = presentSeats.size > 0 ? 'flex' : 'none'
  _audRenderHemi([...presentSeats])
}

function _audRender() {
  const hasSession = !!_audCurrentSession
  const empty   = document.getElementById('aud-empty')
  const content = document.getElementById('aud-session-content')
  const liveBadge = document.getElementById('aud-live-badge')
  const titleEl   = document.getElementById('aud-title')
  const descEl    = document.getElementById('aud-session-desc')

  if (!hasSession) {
    if (empty)   empty.style.display   = ''
    if (content) content.style.display = 'none'
    if (liveBadge) liveBadge.style.display = 'none'
    if (titleEl) titleEl.textContent = 'Auditorio'
    if (descEl)  descEl.style.display = 'none'
    return
  }

  const s = _audCurrentSession
  if (empty)   empty.style.display   = 'none'
  if (content) content.style.display = ''
  if (liveBadge) liveBadge.style.display = ''
  if (titleEl) titleEl.textContent = s.title || 'Auditorio'
  if (descEl) {
    descEl.textContent = s.description || ''
    descEl.style.display = s.description ? '' : 'none'
  }

  // Detectar tipo de video
  const url      = s.url || ''
  const ytEmbed  = url ? _imYoutubeEmbed(url) : null
  const stage    = document.getElementById('aud-video-stage')
  const videoContainer = document.getElementById('aud-video-container')
  const joinWrap = document.getElementById('aud-join-wrap')
  const noStream = document.getElementById('aud-no-stream')

  const showEl = (el, on) => { if (el) el.style.display = on ? '' : 'none' }

  if (ytEmbed) {
    // YouTube live — autoplay, sin controles
    showEl(stage,    true)
    showEl(joinWrap, false)
    showEl(noStream, false)
    if (videoContainer) {
      // Reemplazar solo el iframe, sin tocar el overlay ni el botón mute
      const old = videoContainer.querySelector('iframe')
      if (old) old.remove()
      const iframe = document.createElement('iframe')
      iframe.referrerPolicy = 'origin'
      iframe.setAttribute('allowfullscreen', '')
      iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture')
      // autoplay=1, controls=0, enablejsapi=1 para postMessage mute
      // mute=1 es necesario para que autoplay funcione sin interacción previa
      _audMuted = false
      iframe.src = ytEmbed + '&autoplay=1&controls=0&modestbranding=1&rel=0&showinfo=0&fs=0&disablekb=1&iv_load_policy=3&playsinline=1&enablejsapi=1'
      // Insertar al principio para que el overlay y el botón queden encima
      videoContainer.insertBefore(iframe, videoContainer.firstChild)
      // Mostrar botón mute (ícono de silenciado al inicio)
      _audUpdateMuteBtn()
    }
    // Info bar
    const sesLbl = document.getElementById('aud-video-session-lbl')
    if (sesLbl) sesLbl.textContent = s.title || ''
  } else if (url) {
    // Link externo (Zoom, Meet, etc.)
    showEl(stage,    false)
    showEl(joinWrap, true)
    showEl(noStream, false)
    const btn   = document.getElementById('aud-join-btn')
    const title = document.getElementById('aud-join-title')
    if (btn) btn.href = url
    if (url.includes('meet.google')) {
      if (title) title.textContent = 'Sesión en Google Meet'
      if (btn)   btn.textContent   = 'Abrir Google Meet →'
    } else if (url.includes('zoom.us')) {
      if (title) title.textContent = 'Sesión en Zoom'
      if (btn)   btn.textContent   = 'Abrir Zoom →'
    } else {
      if (title) title.textContent = 'Sesión en vivo'
      if (btn)   btn.textContent   = 'Abrir sesión →'
    }
  } else {
    // Sin URL — transmisión no iniciada
    showEl(stage,    false)
    showEl(joinWrap, false)
    showEl(noStream, true)
  }
}

function _audRenderHemi(presentSeats) {
  _audPresentSet = new Set(presentSeats)
  const canvas   = document.getElementById('aud-canvas-wrap')
  const noViewers = document.getElementById('aud-no-viewers')
  if (canvas)    canvas.style.display    = presentSeats.length ? '' : 'none'
  if (noViewers) noViewers.style.display = presentSeats.length ? 'none' : ''
  if (_audCv) _audDraw()
  // Actualizar contador de espectadores en la info bar
  const countLbl = document.getElementById('aud-video-count-lbl')
  if (countLbl) {
    const n = presentSeats.length
    countLbl.textContent = n === 1 ? '1 viendo' : `${n} viendo`
  }
}

function _audToggleMute() {
  _audMuted = !_audMuted
  const iframe = document.querySelector('#aud-video-container iframe')
  if (iframe && iframe.contentWindow) {
    const cmd = _audMuted ? 'mute' : 'unMute'
    iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: cmd, args: '' }), '*')
  }
  _audUpdateMuteBtn()
}
function _audUpdateMuteBtn() {
  const on  = document.getElementById('aud-mute-icon-on')
  const off = document.getElementById('aud-mute-icon-off')
  if (on)  on.style.display  = _audMuted ? 'none' : ''
  if (off) off.style.display = _audMuted ? '' : 'none'
}

function _audRenderHemi_UNUSED(presentSeats) {
  const svg = document.getElementById('aud-hemi-canvas')
  if (!svg) return

  const noViewers = document.getElementById('aud-no-viewers')

  if (!presentSeats.length) {
    svg.style.display = 'none'
    if (noViewers) noViewers.style.display = ''
    return
  }

  svg.style.display = ''
  if (noViewers) noViewers.style.display = 'none'

  // Arcos generados centrados — forma ∪ (público mirando al escenario/video arriba)
  const W = 640, H = 230
  const cx = W / 2, cy = -16  // centro del arco encima del SVG
  const A0 = 22 * Math.PI / 180
  const A1 = 158 * Math.PI / 180
  const arcRows = [
    { r: 65,  n: 14 },
    { r: 100, n: 22 },
    { r: 136, n: 30 },
    { r: 172, n: 38 },
    { r: 207, n: 45 },
  ]
  const R_MIN = arcRows[0].r, R_MAX = arcRows[arcRows.length - 1].r

  const stageLabel =
    `<line x1="${W*0.18}" y1="5" x2="${W*0.82}" y2="5" stroke="rgba(255,255,255,0.15)" stroke-width="1.5" stroke-linecap="round"/>` +
    `<text x="${W/2}" y="16" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.22)" font-family="Manrope,sans-serif" letter-spacing="0.08em">ESCENARIO</text>`

  // ── Fondo: arcos limpios grises ──
  let bgDots = ''
  arcRows.forEach(({ r, n }) => {
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0.5
      const a = A0 + t * (A1 - A0)
      bgDots += `<circle cx="${(cx + r * Math.cos(a)).toFixed(1)}" cy="${(cy + r * Math.sin(a)).toFixed(1)}" r="2.2" fill="rgba(255,255,255,0.13)"/>`
    }
  })

  // ── Butacas presentes: mapeo angular usando posiciones reales del SEATS array ──
  let glowDots = ''
  const hasRealSeats = SEATS && SEATS.length > 0 && bx1 > bx0

  if (hasRealSeats) {
    // Centro del hemiciclo: medio en X, mínimo en Y (base del arco / podio)
    const hcx = (bx0 + bx1) / 2
    const hcy = by0
    const maxR = Math.max(by1 - by0, (bx1 - bx0) / 2) || 1

    const presentSet = new Set(presentSeats)
    SEATS.forEach(s => {
      if (!presentSet.has(s.num)) return

      const dx = s.x - hcx
      const dy = Math.max(0, s.y - hcy)  // forzar dy >= 0 (hemiciclo superior)
      const r   = Math.sqrt(dx * dx + dy * dy)
      // Ángulo: 0 = ala derecha, π/2 = centro, π = ala izquierda
      const angle = Math.atan2(dy, dx)
      const t     = Math.max(0, Math.min(1, angle / Math.PI))
      const rowT  = Math.max(0, Math.min(1, r / maxR))

      // Convertir a posición en el arco generado
      const arcAngle = A0 + t * (A1 - A0)
      const arcR     = R_MIN + rowT * (R_MAX - R_MIN)
      const gx = (cx + arcR * Math.cos(arcAngle)).toFixed(1)
      const gy = (cy + arcR * Math.sin(arcAngle)).toFixed(1)

      glowDots +=
        `<circle cx="${gx}" cy="${gy}" r="20" fill="#F5A623" opacity=".06"/>` +
        `<circle cx="${gx}" cy="${gy}" r="12" fill="#F5A623" opacity=".16"/>` +
        `<circle cx="${gx}" cy="${gy}" r="6"  fill="#F5A623" opacity=".95" filter="url(#aud-glow)"><title>Butaca #${s.num}</title></circle>`
    })
  } else {
    // Fallback: proporcional por número de butaca (cuando SEATS aún no cargó)
    const maxSeat = (typeof SEAT_CAPACITY !== 'undefined' && SEAT_CAPACITY > 0) ? SEAT_CAPACITY : 300
    const totalDots = arcRows.reduce((s, r) => s + r.n, 0)
    const dotPos = []
    arcRows.forEach(({ r, n }) => {
      for (let i = 0; i < n; i++) {
        const t = n > 1 ? i / (n - 1) : 0.5
        const a = A0 + t * (A1 - A0)
        dotPos.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
      }
    })
    presentSeats.forEach(seatNum => {
      const idx = Math.max(0, Math.min(totalDots - 1, Math.round(((seatNum - 1) / maxSeat) * (totalDots - 1))))
      const { x: gx, y: gy } = dotPos[idx]
      glowDots +=
        `<circle cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" r="20" fill="#F5A623" opacity=".06"/>` +
        `<circle cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" r="12" fill="#F5A623" opacity=".16"/>` +
        `<circle cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" r="6"  fill="#F5A623" opacity=".95" filter="url(#aud-glow)"/>`
    })
  }

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
  svg.innerHTML =
    `<defs><filter id="aud-glow" x="-120%" y="-120%" width="340%" height="340%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter></defs>` +
    stageLabel + bgDots + glowDots
}

function audReaccionar(emoji) {
  if (!_audChannel) return
  _audChannel.send({ type: 'broadcast', event: 'reaction', payload: { emoji } })
  _audShowFloatReaction(emoji)
}

function _audShowFloatReaction(emoji) {
  const area = document.getElementById('aud-float-area')
  if (!area) return
  const el = document.createElement('div')
  el.className = 'aud-float-reaction'
  el.textContent = emoji
  el.style.left = (15 + Math.random() * 70) + '%'
  area.appendChild(el)
  setTimeout(() => el.remove(), 2500)
}

// Badge en nav cuando hay sesión activa (check al iniciar sesión)
async function _audCheckActiveBadge() {
  try {
    const { data } = await sb.from('auditorio_sessions')
      .select('id').eq('is_active', true).limit(1).maybeSingle()
    const badge = document.getElementById('nav-auditorio-badge')
    if (badge) badge.style.display = data ? '' : 'none'
  } catch(e) {}
}

function _audInitBadgeRealtime() {
  sb.channel('auditorio-badge-watch')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'auditorio_sessions' }, () => {
      _audCheckActiveBadge()
      // Si el auditorio está abierto, recargar sesión
      if (document.getElementById('auditorio-overlay')?.classList.contains('open')) {
        _audLoadSession()
      }
    })
    .subscribe()
}
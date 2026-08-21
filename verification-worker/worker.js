/**
 * CabildoOS — Verification Worker v2
 * ────────────────────────────────────────────────────────────────────────────
 * Orquestador multi-modelo para verificación de identidad.
 *
 * Endpoints:
 *   POST /verify/documento        — Análisis de documento (Gemini 3.7 Flash × 2)
 *   POST /verify/liveness         — Verificación de vivacidad
 *   POST /verify/censurar-campos  — Pixelado de datos sensibles
 *   POST /verify/submit           — Envío final (valida token HMAC)
 *   GET  /verify/status/:id       — Estado de verificación
 *
 * Env secrets (wrangler secret put):
 *   GEMINI_API_KEY    — API key de Google AI Studio
 *   SESSION_SECRET    — Clave HMAC para firmar tokens de sesión (≥32 bytes)
 *   SUPABASE_URL      — URL del proyecto Supabase
 *   SUPABASE_SERVICE_KEY — Service role key de Supabase
 *
 * Modelo primario:   gemini-3.7-flash   (análisis completo)
 * Modelo secundario: gemini-3.7-flash   (cross-check independiente, mismo modelo distinto contexto)
 */

// ─── Constantes ───────────────────────────────────────────────────────────────
const GEMINI_BASE   = 'https://generativelanguage.googleapis.com/v1beta/models'
const MODEL_PRIMARY = 'gemini-3.7-flash'
const MODEL_CROSS   = 'gemini-3.7-flash'

// Umbrales de seguridad
const MIN_CONSENSUS_SCORE = 0.60  // confianza mínima del modelo primario
const BLOCK_ON_OCCLUSION  = true  // bloquear si cualquier modelo detecta oclusión
const TOKEN_TTL_MS = 30 * 60 * 1000  // 30 minutos de validez del token de sesión

// ─── HMAC helpers (Web Crypto) ────────────────────────────────────────────────
async function hmacSign(data, secret) {
  const enc  = new TextEncoder()
  const key  = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig  = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

async function hmacVerify(data, signature, secret) {
  const expected = await hmacSign(data, secret)
  // comparación en tiempo constante
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return diff === 0
}

async function sha256hex(text) {
  const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('')
}

// ─── Generación y verificación de token de sesión ─────────────────────────────
async function crearSessionToken(payload, secret) {
  const data = JSON.stringify({ ...payload, iat: Date.now() })
  const b64  = btoa(data)
  const sig  = await hmacSign(b64, secret)
  return `${b64}.${sig}`
}

async function verificarSessionToken(token, secret) {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [b64, sig] = parts
  const valid = await hmacVerify(b64, sig, secret)
  if (!valid) return null
  try {
    const payload = JSON.parse(atob(b64))
    if (Date.now() - payload.iat > TOKEN_TTL_MS) return null  // expirado
    return payload
  } catch { return null }
}

// ─── Llamada a Gemini ─────────────────────────────────────────────────────────
async function geminiCall(model, prompt, imageB64, apiKey) {
  const url  = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`
  const body = {
    contents: [{
      parts: [
        { inline_data: { mime_type: 'image/jpeg', data: imageB64 } },
        { text: prompt }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    }
  }
  const resp = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Gemini ${model} error ${resp.status}: ${err.slice(0, 200)}`)
  }
  const data = await resp.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
  try { return JSON.parse(text) } catch { return {} }
}

// ─── Prompt principal (Gemini Flash) ──────────────────────────────────────────
function buildPromptPrimario(tipo, nombre, apellido, numDoc, pais, fechaNac) {
  return `
Sos un sistema experto en verificación de documentos de identidad latinoamericanos.
Analizá la imagen adjunta con MÁXIMO RIGOR DE SEGURIDAD y respondé en JSON válido.

TIPO DE DOCUMENTO DECLARADO: ${tipo}
DATOS DECLARADOS POR EL USUARIO:
  - Nombre:    "${nombre}"
  - Apellido:  "${apellido}"
  - N° doc:    "${numDoc}"
  - País:      "${pais}"
  - Fecha nac: "${fechaNac}"

INSTRUCCIONES:
1. DETECCIÓN DE FRAUDE (prioridad máxima):
   - oclusion_detectada: ¿Hay algún papel, sticker, cinta adhesiva, dedo, mano u objeto que cubra CUALQUIER parte del documento?
   - zona_numero_cubierta: ¿El número de documento o número de trámite está parcialmente o totalmente cubierto por algo?
   - es_pantalla: ¿El documento se está mostrando desde una pantalla (monitor, celular, tablet) en lugar de ser físico?
   - es_fotocopia: ¿Parece una fotocopia o impresión en papel en lugar del documento original?
   - manipulacion_digital: ¿Hay señales de edición digital? Buscá: bordes con aliasing extraño alrededor de números o letras, tipografía inconsistente, colores que no encajan, diferencias de nitidez localizadas solo en la zona del número.
   - superposicion_detectada: ¿Hay algún texto, número o imagen superpuesto digitalmente sobre el documento?
   - consistencia_tipografica: ¿La tipografía del número de documento es visualmente idéntica (mismo peso, mismo kerning, mismo color) al resto del texto del mismo tipo en el documento?

2. EXTRACCIÓN DE DATOS:
   - numero_extraido: número de documento exactamente como aparece (null si no visible)
   - nombre_extraido: nombre como aparece en el doc
   - apellido_extraido: apellido como aparece en el doc
   - fecha_nac_extraida: fecha de nacimiento como aparece (null si no visible)
   - pais_emisor: país que emitió el documento
   - tipo_documento_real: tipo real detectado (DNI, PASAPORTE, CÉDULA, LICENCIA, etc.)

3. COINCIDENCIA CON DECLARADO:
   - nombre_coincide: boolean (comparación flexible, permite pequeñas diferencias de OCR)
   - apellido_coincide: boolean
   - numero_coincide: boolean (ESTRICTO — debe coincidir exactamente, sin el número oculto)
   - fecha_coincide: boolean (flexible con formato)
   - pais_coincide: boolean

4. CARA EN EL DOCUMENTO:
   - cara_visible: ¿La foto del portador es visible y nítida?
   - face_box: {"x1": float, "y1": float, "x2": float, "y2": float} — coordenadas de la cara como fracción (0-1) del ancho/alto de la imagen. null si no hay cara.

5. PUNTUACIÓN:
   - confianza: float 0-1 — tu confianza general en que este es un documento auténtico con datos legibles y sin manipulación

ADVERTENCIA CRÍTICA:
Si oclusion_detectada es true O zona_numero_cubierta es true O manipulacion_digital es true
O superposicion_detectada es true — el campo confianza debe ser ≤ 0.30.

Respondé SOLO con el JSON, sin texto adicional.
`.trim()
}

// ─── Prompt de cross-check (Gemini Pro) ───────────────────────────────────────
const PROMPT_CROSSCHECK = `
Sos un auditor de seguridad de documentos. Mirá esta imagen con ojo crítico.

Respondé SOLO en JSON con estas claves booleanas (true/false):
{
  "documento_fisico_real": ¿Es un documento físico real (no pantalla, no fotocopia, no impresión)?
  "sin_oclusion": ¿El documento está completamente libre de objetos, papeles, stickers o dedos que lo cubran?
  "numero_completamente_visible": ¿El número de documento es 100% visible sin ninguna parte tapada?
  "tipografia_uniforme": ¿Todos los números y letras tienen tipografía uniforme sin inserciones visibles?
  "sin_edicion_digital": ¿No hay señales de edición digital en el documento?
  "cara_presente": ¿Hay una foto de cara en el documento?
}

SIN texto adicional. SOLO el JSON.
`.trim()

// ─── Motor de consenso ────────────────────────────────────────────────────────
function evaluarConsenso(primario, crosscheck) {
  const flags = []
  const bloqueos = []

  // ── Señales de fraude duras (bloqueo automático) ──
  if (primario.oclusion_detectada === true)      bloqueos.push('oclusión detectada (modelo primario)')
  if (primario.zona_numero_cubierta === true)     bloqueos.push('número cubierto (modelo primario)')
  if (primario.manipulacion_digital === true)     bloqueos.push('manipulación digital (modelo primario)')
  if (primario.superposicion_detectada === true)  bloqueos.push('superposición digital (modelo primario)')
  if (primario.es_pantalla === true)              bloqueos.push('documento en pantalla')
  if (primario.es_fotocopia === true)             bloqueos.push('fotocopia detectada')

  if (crosscheck.sin_oclusion === false)           bloqueos.push('oclusión confirmada (crosscheck)')
  if (crosscheck.numero_completamente_visible === false) bloqueos.push('número no visible (crosscheck)')
  if (crosscheck.sin_edicion_digital === false)    bloqueos.push('edición digital confirmada (crosscheck)')
  if (crosscheck.documento_fisico_real === false)  bloqueos.push('documento no físico (crosscheck)')

  // ── Señales de advertencia (no bloquean, pero bajan confianza) ──
  if (primario.consistencia_tipografica === false) flags.push('tipografía inconsistente')
  if (crosscheck.tipografia_uniforme === false)     flags.push('tipografía no uniforme (crosscheck)')

  const bloqueado = bloqueos.length > 0
  const confianzaAjustada = bloqueado
    ? 0
    : Math.max(0, (primario.confianza || 0) - flags.length * 0.10)

  return { bloqueado, bloqueos, flags, confianzaAjustada }
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────
async function supabaseInsert(table, record, env) {
  const url  = `${env.SUPABASE_URL}/rest/v1/${table}`
  const resp = await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Prefer':        'return=representation',
    },
    body: JSON.stringify(record),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(`Supabase insert error: ${JSON.stringify(data)}`)
  return Array.isArray(data) ? data[0] : data
}

async function supabaseSelect(table, filter, env) {
  const params = new URLSearchParams(filter)
  const url    = `${env.SUPABASE_URL}/rest/v1/${table}?${params}`
  const resp   = await fetch(url, {
    headers: {
      'apikey':        env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    }
  })
  return resp.json()
}

// ─── CORS ─────────────────────────────────────────────────────────────────────
const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Session-Token',
}

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function errorResp(msg, status = 400, extra = {}) {
  return jsonResp({ ok: false, detail: msg, ...extra }, status)
}

// ─── Handler principal ────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    // Preflight CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS })
    }

    // ── POST /verify/documento ──────────────────────────────────────────────
    if (url.pathname === '/verify/documento' && request.method === 'POST') {
      let body
      try { body = await request.json() } catch { return errorResp('JSON inválido') }

      const {
        verification_id, image_b64, tipo_doc,
        nombre_declarado, apellido_declarado, numero_declarado,
        pais_declarado, fecha_nac_declarada,
        user_id, contact_email,
      } = body

      if (!image_b64 || !verification_id) return errorResp('Faltan campos requeridos')

      // ── Verificar duplicado ──
      try {
        const numHash = await sha256hex(numero_declarado || '')
        const existing = await supabaseSelect('verification_identities',
          { doc_hash: `eq.${numHash}`, select: 'id' }, env)
        if (Array.isArray(existing) && existing.length > 0) {
          return jsonResp({ ok: false, detail: 'Documento ya registrado' }, 409)
        }
      } catch (e) {
        console.warn('[documento] Error checking duplicate:', e.message)
      }

      // ── Llamadas en paralelo a ambos modelos ──
      const promptP = buildPromptPrimario(
        tipo_doc, nombre_declarado, apellido_declarado,
        numero_declarado, pais_declarado, fecha_nac_declarada
      )

      let primario = {}, crosscheck = {}
      let primaryError = null, crossError = null

      const [rPrimary, rCross] = await Promise.allSettled([
        geminiCall(MODEL_PRIMARY, promptP,        image_b64, env.GEMINI_API_KEY),
        geminiCall(MODEL_CROSS,   PROMPT_CROSSCHECK, image_b64, env.GEMINI_API_KEY),
      ])

      if (rPrimary.status === 'fulfilled') primario = rPrimary.value
      else { primaryError = rPrimary.reason?.message; console.error('[Primary]', primaryError) }

      if (rCross.status === 'fulfilled') crosscheck = rCross.value
      else { crossError = rCross.reason?.message; console.error('[Cross]', crossError) }

      // Si el modelo primario falló completamente, no podemos continuar
      if (primaryError && !primario.numero_extraido) {
        return errorResp(`Error analizando documento: ${primaryError}`, 500)
      }

      // ── Motor de consenso ──
      const consenso = evaluarConsenso(primario, crosscheck)

      if (BLOCK_ON_OCCLUSION && consenso.bloqueado) {
        // Loguear intento de fraude en Supabase
        try {
          await supabaseInsert('verification_fraud_attempts', {
            verification_id,
            user_id:      user_id || null,
            tipo_bloqueo: consenso.bloqueos[0],
            bloqueos:     consenso.bloqueos,
            flags:        consenso.flags,
            timestamp:    new Date().toISOString(),
          }, env)
        } catch (e) { console.warn('[fraud log]', e.message) }

        return jsonResp({
          ok:        false,
          blocked:   true,
          reason:    consenso.bloqueos[0],
          all_reasons: consenso.bloqueos,
          detail:    `Verificación bloqueada: ${consenso.bloqueos.join('; ')}`,
          extracted: null,
        }, 422)
      }

      // ── Armar resultado para el frontend ──
      const extracted = {
        numero_extraido:    primario.numero_extraido,
        nombre_extraido:    primario.nombre_extraido,
        apellido_extraido:  primario.apellido_extraido,
        fecha_nac_extraida: primario.fecha_nac_extraida,
        pais_emisor:        primario.pais_emisor,
        tipo_documento_real: primario.tipo_documento_real,
        // coincidencias
        nombre_coincide:    primario.nombre_coincide   ?? false,
        apellido_coincide:  primario.apellido_coincide ?? false,
        numero_coincide:    primario.numero_coincide   ?? false,
        fecha_coincide:     primario.fecha_coincide    ?? false,
        pais_coincide:      primario.pais_coincide     ?? true,
        // meta
        confianza:          consenso.confianzaAjustada,
        flags:              consenso.flags,
        cara_visible:       primario.cara_visible ?? crosscheck.cara_presente ?? false,
        crosscheck_passed:  !crossError && Object.keys(crosscheck).length > 0,
      }

      // ── Generar token de sesión firmado ──
      const numHash = await sha256hex(numero_declarado || '')
      const tokenPayload = {
        verification_id,
        user_id:  user_id || null,
        num_hash: numHash,
        paso_ok:  ['documento'],
        confianza: consenso.confianzaAjustada,
      }
      const sessionToken = await crearSessionToken(tokenPayload, env.SESSION_SECRET)

      return jsonResp({
        ok:            true,
        extracted,
        face_box:      primario.face_box || null,
        session_token: sessionToken,
        consensus: {
          bloqueado:    false,
          flags:        consenso.flags,
          crosscheck_ok: !crossError,
        }
      })
    }

    // ── POST /verify/liveness ───────────────────────────────────────────────
    if (url.pathname === '/verify/liveness' && request.method === 'POST') {
      let body
      try { body = await request.json() } catch { return errorResp('JSON inválido') }

      const { image_b64, instruccion, session_token } = body

      if (!image_b64) return errorResp('Falta image_b64')

      // Verificar token si se provee (no bloquear si falta — backward compat)
      let tokenData = null
      if (session_token && env.SESSION_SECRET) {
        tokenData = await verificarSessionToken(session_token, env.SESSION_SECRET)
        if (!tokenData) {
          return errorResp('Token de sesión inválido o expirado', 401)
        }
      }

      const prompt = `
Analizá esta selfie para verificación de vivacidad.
La instrucción que se le dio al usuario fue: "${instruccion?.texto || instruccion || 'desconocida'}"

Respondé en JSON:
{
  "cumplió": boolean — ¿La persona en la foto cumplió la instrucción indicada?,
  "hay_persona_real": boolean — ¿Hay una persona real en la foto (no foto de foto, no máscara)?,
  "es_foto_de_foto": boolean — ¿Parece una foto de una foto o pantalla?,
  "cara_detectada": boolean,
  "confianza": float 0-1
}
`.trim()

      let result = {}
      try {
        result = await geminiCall(MODEL_PRIMARY, prompt, image_b64, env.GEMINI_API_KEY)
      } catch(e) {
        console.error('[liveness]', e.message)
        return jsonResp({ cumplió: true, hay_persona_real: true, error: e.message })
      }

      // Actualizar token con liveness aprobado
      let nuevoToken = session_token
      if (tokenData && result.cumplió && result.hay_persona_real) {
        const updatedPayload = {
          ...tokenData,
          paso_ok: [...(tokenData.paso_ok || []), 'liveness'],
        }
        nuevoToken = await crearSessionToken(updatedPayload, env.SESSION_SECRET)
      }

      return jsonResp({
        cumplió:       result.cumplió    ?? true,
        hay_persona_real: result.hay_persona_real ?? true,
        es_foto_de_foto:  result.es_foto_de_foto  ?? false,
        session_token: nuevoToken,
        confianza:     result.confianza ?? 0.8,
      })
    }

    // ── POST /verify/censurar-campos ────────────────────────────────────────
    if (url.pathname === '/verify/censurar-campos' && request.method === 'POST') {
      let body
      try { body = await request.json() } catch { return errorResp('JSON inválido') }

      const { image_b64 } = body
      if (!image_b64) return errorResp('Falta image_b64')

      // Detectar zonas a censurar con Gemini Flash
      const prompt = `
Sos un sistema de privacidad para documentos de identidad.
En esta imagen de documento identificá las zonas de texto sensible
(número de documento, número de trámite, código de barras, dirección).
NO incluyas la zona de la foto del rostro.

Respondé en JSON:
{
  "zonas_censurar": [
    {"x1": float, "y1": float, "x2": float, "y2": float, "tipo": "string"}
  ]
}
Las coordenadas son fracciones del ancho/alto (0-1).
`.trim()

      try {
        const result = await geminiCall(MODEL_PRIMARY, prompt, image_b64, env.GEMINI_API_KEY)
        return jsonResp({ ok: true, zonas: result.zonas_censurar || [] })
      } catch(e) {
        return jsonResp({ ok: false, zonas: [], error: e.message })
      }
    }

    // ── POST /verify/submit ─────────────────────────────────────────────────
    if (url.pathname === '/verify/submit' && request.method === 'POST') {
      let body
      try { body = await request.json() } catch { return errorResp('JSON inválido') }

      const {
        verification_id, selfie_doc_b64, doc_b64,
        session_token, gemini_match,
        user_id, contact_email,
        face_similarity_score,  // nuevo: score de comparación facial enviado por frontend
      } = body

      if (!verification_id) return errorResp('Falta verification_id')

      // ── Validar token de sesión ──
      let tokenData = null
      if (env.SESSION_SECRET) {
        if (!session_token) {
          return errorResp('Token de sesión requerido', 401)
        }
        tokenData = await verificarSessionToken(session_token, env.SESSION_SECRET)
        if (!tokenData) {
          return errorResp('Token de sesión inválido o expirado. Reiniciá el proceso.', 401)
        }
        // Verificar que el token corresponde a esta sesión
        if (tokenData.verification_id && tokenData.verification_id !== verification_id) {
          return errorResp('Token de sesión no corresponde a esta verificación', 401)
        }
        // Verificar que el paso de documento fue completado
        if (!tokenData.paso_ok?.includes('documento')) {
          return errorResp('El análisis del documento no fue completado correctamente', 422)
        }
      }

      // ── Validación de similitud facial (si el frontend la envía) ──
      const FACE_SIMILARITY_MIN = 0.45  // umbral mínimo (0=diferente, 1=idéntico)
      if (face_similarity_score !== undefined && face_similarity_score !== null) {
        if (face_similarity_score < FACE_SIMILARITY_MIN) {
          try {
            await supabaseInsert('verification_fraud_attempts', {
              verification_id,
              user_id:      user_id || null,
              tipo_bloqueo: 'face_mismatch',
              bloqueos:     [`Similitud facial: ${face_similarity_score.toFixed(3)} < ${FACE_SIMILARITY_MIN}`],
              timestamp:    new Date().toISOString(),
            }, env)
          } catch(e) { console.warn('[face log]', e.message) }

          return errorResp(
            `El rostro de la selfie no coincide con la foto del documento (score: ${face_similarity_score.toFixed(2)})`,
            422
          )
        }
      }

      // ── Análisis final de la imagen compuesta ──
      // Verificamos que la selfie muestre a la persona sosteniendo el documento
      let submitAnalysis = {}
      if (selfie_doc_b64) {
        const promptSubmit = `
Analizá esta imagen compuesta de verificación de identidad.
La mitad izquierda muestra una selfie del usuario. La mitad derecha muestra el documento de identidad.

Respondé en JSON:
{
  "persona_sostiene_documento": boolean — ¿La persona en la selfie parece estar sosteniendo un documento físico?,
  "mismo_entorno": boolean — ¿La foto y el documento parecen haber sido tomados en el mismo momento (misma iluminación general)?,
  "flags": [] — lista de strings con cualquier irregularidad notada
}
`.trim()
        try {
          submitAnalysis = await geminiCall(MODEL_PRIMARY, promptSubmit, selfie_doc_b64, env.GEMINI_API_KEY)
        } catch(e) { console.warn('[submit analysis]', e.message) }
      }

      // ── Guardar en Supabase ──
      try {
        const record = {
          id:                 verification_id,
          user_id:            user_id || null,
          contact_email:      contact_email || null,
          status:             'pendiente_revision',
          gemini_match:       gemini_match ?? false,
          confianza_modelo:   tokenData?.confianza || null,
          face_similarity:    face_similarity_score || null,
          submit_flags:       submitAnalysis.flags || [],
          token_pasos_ok:     tokenData?.paso_ok || [],
          created_at:         new Date().toISOString(),
        }
        await supabaseInsert('verification_requests', record, env)
      } catch(e) {
        console.error('[submit] Supabase error:', e.message)
        // Si ya existe (409), continuar igual
        if (!e.message.includes('duplicate')) {
          return errorResp(`Error guardando verificación: ${e.message}`, 500)
        }
      }

      return jsonResp({
        ok:     true,
        status: 'pendiente_revision',
        verification_id,
        submit_checks: {
          persona_sostiene_documento: submitAnalysis.persona_sostiene_documento ?? null,
          mismo_entorno:              submitAnalysis.mismo_entorno ?? null,
          flags:                      submitAnalysis.flags || [],
        }
      })
    }

    // ── GET /verify/status/:id ──────────────────────────────────────────────
    const statusMatch = url.pathname.match(/^\/verify\/status\/([^/]+)$/)
    if (statusMatch && request.method === 'GET') {
      const verification_id = statusMatch[1]
      try {
        const rows = await supabaseSelect('verification_requests',
          { id: `eq.${verification_id}`, select: 'id,status,created_at' }, env)
        if (!Array.isArray(rows) || rows.length === 0) {
          return jsonResp({ found: false }, 404)
        }
        return jsonResp({ found: true, ...rows[0] })
      } catch(e) {
        return errorResp(e.message, 500)
      }
    }

    return errorResp('Ruta no encontrada', 404)
  }
}

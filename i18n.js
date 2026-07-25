// ============================================================
// i18n.js — Diccionario ES/EN y función de traducción
//
// Punto 5 de la Matriz de priorización ("Textos de negocio
// incrustados en la capa de lógica — bloquea i18n limpio"), Fase 1
// del plan de la Sección 4.4 de la Revisión Técnica VetoLAB.
//
// PROPÓSITO: este archivo es la ÚNICA fuente de texto de negocio en
// español/inglés del proyecto. La capa de lógica (`parser.js`,
// `math.js`) ya NO contiene oraciones hardcodeadas — devuelve
// códigos (`{code: "..."}`, `biasKey: "..."`) que se resuelven aquí.
// Esto separa correctamente "qué pasó" (código, capa de lógica) de
// "cómo se lo digo al usuario" (texto, esta capa de presentación).
//
// ALCANCE DE ESTA RONDA: se completa el diccionario para TODAS las
// claves que hoy consumen `parser.js` (warnings), `math.js`
// (biasKey, reliability) y los textos de `app.js` que dependían de
// diccionarios propios (`reliabilityLabel`, `priorityReasonText`,
// `humanizeStatus`, el warning de colisión entre capturas). No se
// activa todavía un selector visible ES/EN en la UI ni persistencia
// en localStorage — eso corresponde a las fases 6-7 del plan original
// (fuera del alcance de esta ronda; hoy `state.lang` se fija a "es"
// como valor por defecto en `app.js`, listo para conectarse cuando
// esa fase se implemente).
//
// FORMATO DE CLAVE: "categoria.codigo" — la categoría agrupa por
// origen (warning.*, bias.*, reliability.*, status.*, ui.*) para que
// sea fácil ubicar de dónde viene cada texto sin tener que buscar en
// el código fuente de `parser.js`/`math.js`.
//
// INTERPOLACIÓN: algunas claves de warning necesitan un valor
// dinámico (ej. "nA=0 pero pA>0"). En vez de construir el string
// final en la capa de lógica (lo que reintroduciría texto ahí), la
// capa de lógica pasa los datos crudos como `params` junto al code,
// y `t()` los sustituye en el template vía `{campo}`.
// ============================================================

const I18N = {
  es: {
    // ---- parser.js: warnings de validateRows ----
    "warning.pa_out_of_range": "pA fuera de rango [0,100]",
    "warning.pb_out_of_range": "pB fuera de rango [0,100]",
    "warning.na_zero_pa_positive": "nA=0 pero pA>0: inconsistente",
    "warning.nb_zero_pb_positive": "nB=0 pero pB>0: inconsistente",
    "warning.n_unusually_high": "n inusualmente alto — revisar OCR",
    "warning.low_confidence_separator": "separador • no detectado con claridad — verificar partidas",
    "warning.ocr_failed": "fila detectada pero ilegible tras OCR (posible fusión con fila vecina) — completar manualmente",
    "warning.name_guessed_no_pool": "nombre de mapa no reconocido y sin candidato posicional confiable (pool no estándar, ej. FACEIT Premium) — completar manualmente",
    "warning.name_guessed_positional": "nombre de mapa no reconocido por OCR — asignado por posición dentro del pool activo, verificar",
    "warning.name_collision_same_capture": "nombre de mapa duplicado en esta captura — se detectaron dos filas para el mismo mapa, revisa cuál es correcta",
    "warning.name_collision_cross_source": "nombre de mapa duplicado entre distintas capturas — se detectó este mapa en más de una imagen subida, revisa cuál es correcta",

    // ---- math.js: dirección de sesgo por asimetría muestral (Sección 4.3) ----
    "bias.a": "Tu muestra es más grande y estable; el winrate rival (menos partidas) tiende a regresar hacia 50%. La ventaja real probablemente esté subestimada por el diferencial crudo.",
    "bias.b": "La muestra rival es más grande y estable; tu winrate (menos partidas) es más sensible a shrinkage. La ventaja observada a tu favor es menos confiable de lo que aparenta.",
    "bias.c": "Tamaños de muestra comparables: no hay sesgo direccional derivado de la asimetría muestral.",

    // ---- math.js / app.js: etiquetas de confiabilidad (chip de cada tarjeta) ----
    "reliability.confiable": "Diferencial confiable",
    "reliability.marginal": "Diferencial marginal",
    "reliability.incierto": "Muestra insuficiente",
    "reliability.empate-estadistico": "Empate estadístico",

    // ---- app.js: priorityReasonText (tooltip "i" de las listas de prioridad) ----
    "reason.confiable": "Diferencial confiable: la diferencia es estadísticamente distinguible y ambas muestras son razonablemente precisas.",
    "reason.marginal": "Diferencial marginal: la diferencia es distinguible pero pequeña en magnitud una vez corregida.",
    "reason.incierto": "Muestra insuficiente: al menos un lado tiene un intervalo de confianza ancho — el número podría moverse con más partidas.",
    "reason.empate-estadistico": "Empate estadístico: la diferencia observada no es distinguible del ruido muestral con la evidencia actual.",
    "reason.suffix_n": "(n={nA} vs n={nB})",

    // ---- app.js: humanizeStatus (progreso de OCR) ----
    "status.loading_tesseract_core": "Cargando motor OCR…",
    "status.initializing_tesseract": "Inicializando…",
    "status.loading_language_traineddata": "Cargando modelo de idioma…",
    "status.initializing_api": "Preparando análisis…",
    "status.recognizing_text": "Leyendo texto…",

    // ---- app.js: badge de warnings sobre cada tarjeta de mapa ----
    "ui.warning_badge_single": "revisar",
    "ui.warning_badge_plural": "{count} avisos",
  },

  en: {
    // ---- parser.js: validateRows warnings ----
    "warning.pa_out_of_range": "pA out of range [0,100]",
    "warning.pb_out_of_range": "pB out of range [0,100]",
    "warning.na_zero_pa_positive": "nA=0 but pA>0: inconsistent",
    "warning.nb_zero_pb_positive": "nB=0 but pB>0: inconsistent",
    "warning.n_unusually_high": "Unusually high n — check OCR",
    "warning.low_confidence_separator": "• separator not clearly detected — verify match count",
    "warning.ocr_failed": "row detected but unreadable after OCR (possibly merged with a neighboring row) — fill in manually",
    "warning.name_guessed_no_pool": "map name not recognized and no reliable positional candidate (non-standard pool, e.g. FACEIT Premium) — fill in manually",
    "warning.name_guessed_positional": "map name not recognized by OCR — assigned by position within the active pool, please verify",
    "warning.name_collision_same_capture": "duplicate map name within this capture — two rows were detected for the same map, please check which one is correct",
    "warning.name_collision_cross_source": "duplicate map name across different captures — this map was detected in more than one uploaded image, please check which one is correct",

    // ---- math.js: sample-asymmetry bias direction (Section 4.3) ----
    "bias.a": "Your sample is larger and more stable; the opponent's winrate (fewer games) tends to regress toward 50%. The raw differential likely understates your real advantage.",
    "bias.b": "The opponent's sample is larger and more stable; your winrate (fewer games) is more sensitive to shrinkage. Your apparent advantage is less reliable than it looks.",
    "bias.c": "Comparable sample sizes: no directional bias from sample asymmetry.",

    // ---- math.js / app.js: reliability chip labels ----
    "reliability.confiable": "Reliable differential",
    "reliability.marginal": "Marginal differential",
    "reliability.incierto": "Insufficient sample",
    "reliability.empate-estadistico": "Statistical tie",

    // ---- app.js: priorityReasonText (priority list "i" tooltip) ----
    "reason.confiable": "Reliable differential: the difference is statistically distinguishable and both samples are reasonably precise.",
    "reason.marginal": "Marginal differential: the difference is distinguishable but small in magnitude once corrected.",
    "reason.incierto": "Insufficient sample: at least one side has a wide confidence interval — the number could shift with more games.",
    "reason.empate-estadistico": "Statistical tie: the observed difference is not distinguishable from sample noise given the current evidence.",
    "reason.suffix_n": "(n={nA} vs n={nB})",

    // ---- app.js: humanizeStatus (OCR progress) ----
    "status.loading_tesseract_core": "Loading OCR engine…",
    "status.initializing_tesseract": "Initializing…",
    "status.loading_language_traineddata": "Loading language model…",
    "status.initializing_api": "Preparing analysis…",
    "status.recognizing_text": "Reading text…",

    // ---- app.js: warning badge on each map card ----
    "ui.warning_badge_single": "review",
    "ui.warning_badge_plural": "{count} warnings",
  },
};

const DEFAULT_LANG = "es";

/**
 * Resuelve una clave i18n al idioma indicado, con interpolación simple
 * de `{campo}` a partir de `params`. Si la clave no existe en el
 * idioma pedido, cae a español (nunca deja el texto vacío); si no
 * existe en ningún idioma, devuelve la clave misma como último
 * recurso visible (mejor un código visible en pantalla, señal clara
 * de un diccionario incompleto, que un `undefined` silencioso).
 *
 * @param {string} key - clave "categoria.codigo"
 * @param {string} lang - "es" | "en"
 * @param {object} [params] - valores para interpolar en `{campo}`
 */
function t(key, lang = DEFAULT_LANG, params = null) {
  const dict = I18N[lang] || I18N[DEFAULT_LANG];
  let text = dict[key] ?? I18N[DEFAULT_LANG][key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    }
  }
  return text;
}

/**
 * Traduce un warning con forma `{code, params?}` (como los que ahora
 * emite `validateRows` en parser.js) o, por compatibilidad, un string
 * plano ya traducido (no debería ocurrir tras esta migración, pero
 * evita romper si algún llamador externo aún pasa texto crudo).
 */
function translateWarning(warning, lang = DEFAULT_LANG) {
  if (typeof warning === "string") return warning; // compatibilidad hacia atrás
  if (warning && typeof warning === "object" && warning.code) {
    return t(`warning.${warning.code}`, lang, warning.params);
  }
  return String(warning);
}

if (typeof module !== "undefined") {
  module.exports = { I18N, DEFAULT_LANG, t, translateWarning };
}

// ============================================================
// Parser OCR — TAPIT.GG map veto rows
// Convierte texto crudo de Tesseract.js en filas estructuradas
// {map, pA, nA, pB, nB}
//
// Patrón esperado por fila:
//   [MapName] (pA%) nA • nB (pB%)
//
// DECISIÓN DE DISEÑO CLAVE: el ancla de segmentación es el patrón
// numérico "(NN%) ... NN [sep] NN ... (NN%)", NO el nombre del mapa.
// Razón: el nombre del mapa es texto variable (fuente, ícono superpuesto,
// idioma) que Tesseract puede fallar en reconocer por completo, y si
// eso pasa esa fila nunca genera un punto de corte — perdiendo la fila
// entera o contaminando la fila vecina con sus dígitos (bug reportado:
// al fallar el reconocimiento de "Mirage"/"Inferno"/"Anubis"/"Cache",
// sus números se colaban dentro del segmento de "Ancient").
// El símbolo "%" en cambio es una constante visual rígida: SIEMPRE
// aparecen exactamente dos por fila, así que anclar ahí es mucho más
// robusto. El nombre del mapa se busca DESPUÉS, solo como etiqueta,
// tomando el texto entre el fin de la fila anterior y el inicio de
// esta, y si no se reconoce ningún nombre válido ahí, se asigna por
// posición (el N-ésimo mapa del pool en el orden estándar de FACEIT).
//
// NOTA (fix de regresión total de detección): el separador "•" entre
// nA y nB de la fila se OCRea de forma inconsistente como distintos
// glifos según la captura (©, °, », «, ¢, +, entre otros — nunca el
// carácter real). El separador YA NO se matchea contra una lista fija
// de símbolos; se acepta cualquier fragmento corto de 1–5 caracteres
// no-dígito entre los dos conteos. Ver ROW_PATTERN abajo y
// tests/parser.regression.test.js para la evidencia sobre capturas
// reales que motivó el cambio.
// ============================================================

const MAP_POOL = [
  "Dust2", "Mirage", "Nuke", "Ancient", "Inferno", "Anubis", "Cache",
  "Vertigo", "Overpass", "Train",
];

// Orden estándar en que FACEIT/TAPIT.GG suele listar el pool activo
// (7 mapas de la temporada vigente). Se usa como fallback de
// identificación cuando el OCR no logra leer ningún nombre de mapa
// reconocible cerca de una fila numérica válida — SOLO en el caso de
// 7 filas detectadas. Ver `buildFallbackPool` abajo para los casos de
// 3-6 y 8 filas, que este orden fijo NO puede cubrir correctamente.
const STANDARD_ORDER = ["Dust2", "Mirage", "Nuke", "Ancient", "Inferno", "Anubis", "Cache"];

// Mapa(s) opcional(es) de la temporada vigente, activables por sistema
// de voto popular de FACEIT (no siempre presentes): actualmente SOLO
// Vertigo. Se declara aparte de STANDARD_ORDER porque "existe en el
// juego" (MAP_POOL, 10 mapas) y "puede aparecer en un veto esta
// temporada" (STANDARD_ORDER + esto) son cosas distintas — Overpass y
// Train existen en CS2 pero no son candidatos válidos de fallback
// aunque el veto tenga 8 filas.
const SEASONAL_OPTIONAL_MAPS = ["Vertigo"];

// ------------------------------------------------------------
// Grupo 1 #1 de la Guía de seguimiento y resolución de errores —
// "No existe un rechazo explícito de conteos imposibles".
//
// POR QUÉ ESTO EXISTE COMO FUENTE DE VERDAD COMPARTIDA: antes de este
// fix, tanto `buildFallbackPool` (aquí abajo) como `looksLikeMapGrid`
// (app.js, RELIABLE_BAND_COUNTS = new Set([3,7,8])) codificaban CADA
// UNO su propia noción parcial de "conteo razonable", de forma
// inconsistente entre sí, pero NINGUNO de los dos rechazaba
// explícitamente un conteo que el juego real no puede producir (ej.
// 12 bandas detectadas). Ese conteo caía silenciosamente por el mismo
// camino que un 4/5/6 legítimo — sin ninguna señal de que, a
// diferencia de 4/5/6 (posibles pero infrecuentes), 12 es
// geométricamente IMPOSIBLE dado el pool de mapas de la temporada.
//
// RANGO: el veto real de FACEIT solo puede sobrevivir/mostrar entre 3
// filas (mínimo del escenario Premium de doble baneo simultáneo) y 8
// filas (máximo: pool estándar de 7 + el mapa opcional de voto
// popular, Vertigo — ver SEASONAL_OPTIONAL_MAPS). No existe ningún
// escenario documentado de FACEIT esta temporada donde el veto
// muestre menos de 3 o más de 8 filas de mapa simultáneamente.
// ------------------------------------------------------------
const MIN_PLAUSIBLE_MAP_COUNT = 3;
const MAX_PLAUSIBLE_MAP_COUNT = 8;

/**
 * Determina si un conteo de filas/bandas detectadas es geométricamente
 * plausible dado el pool real de mapas de FACEIT esta temporada (3 a 8
 * filas — ver constantes arriba). Devuelve `false` para cualquier valor
 * fuera de ese rango, incluyendo 0 (ninguna fila detectada), negativos,
 * o valores no finitos.
 *
 * IMPORTANTE — esto responde una pregunta DISTINTA de "¿existe un orden
 * posicional confiable para este conteo?" (esa es `buildFallbackPool`,
 * que devuelve `null` para 3-6 aunque esos conteos SÍ sean plausibles).
 * `isPlausibleMapCount` solo responde "¿este número de filas podría
 * corresponder a una captura real del veto, o es una señal de que la
 * detección de bandas/OCR falló por completo (recorte incorrecto,
 * imagen equivocada, ruido masivo)?". Un conteo puede ser plausible
 * (ej. 5) y aun así no tener fallback posicional (`null`), y un conteo
 * puede ser implausible (ej. 12) sin que eso tenga relación alguna con
 * si existe o no fallback posicional para ese número.
 *
 * @param {number} n - cantidad de filas/bandas detectadas
 * @returns {boolean}
 */
function isPlausibleMapCount(n) {
  return Number.isFinite(n) && n >= MIN_PLAUSIBLE_MAP_COUNT && n <= MAX_PLAUSIBLE_MAP_COUNT;
}

// Etiqueta de nombre por defecto cuando ni el OCR ni el fallback
// posicional lograron identificar el mapa de una fila. Se centraliza
// aquí (en vez de repetir el literal en cada sitio de assignMapNames)
// para que quede claro que es texto de PRESENTACIÓN — la lógica de
// warnings en validateRows ya NO compara contra este string (ver flag
// `noPoolFallback` en assignMapNames), así que este valor puede
// cambiarse o traducirse sin afectar ningún comportamiento.
const UNIDENTIFIED_MAP_LABEL = "Mapa sin identificar";

/**
 * Construye el pool de candidatos de fallback posicional para una
 * captura específica, a partir de cuántas filas se detectaron
 * realmente (por patrón numérico en parseMapRows, o por geometría de
 * bandas en detectRowBands/app.js).
 *
 * POR QUÉ ESTO EXISTE: STANDARD_ORDER asumía implícitamente que
 * SIEMPRE hay exactamente 7 mapas en veto, en ese orden. Eso es falso
 * en dos escenarios reales de FACEIT Premium:
 *   (a) doble baneo simultáneo por ambos equipos — el veto puede
 *       sobrevivir con tan solo 3 mapas, y NO hay garantía de que
 *       esos 3 sean un sub-orden de STANDARD_ORDER (depende de qué
 *       baneó cada equipo, no de una posición fija);
 *   (b) sistema de voto popular que agrega un mapa opcional de
 *       temporada — el veto puede llegar a 8 mapas, y el único 8vo
 *       candidato válido esta temporada es Vertigo, no cualquier
 *       mapa de MAP_POOL.
 *
 * Asignar un nombre por posición cuando rowCount !== 7 sin este ajuste
 * produce una etiqueta INCORRECTA pero con apariencia de certeza (ej.
 * asumir "Dust2" en un veto de 3 mapas donde Dust2 ni siquiera
 * sobrevivió el veto) — más peligroso que no tener nombre, porque no
 * se distingue visualmente de un acierto real salvo por el badge ⚠.
 *
 * NOTA sobre `rowCount` fuera del rango plausible (< 3 u > 8, ver
 * `isPlausibleMapCount` arriba): esta función NO valida eso — sigue
 * devolviendo su fallback conservador (`STANDARD_ORDER`) para cualquier
 * `rowCount > 8`, igual que antes de este fix. La responsabilidad de
 * RECHAZAR un conteo geométricamente imposible (y mostrar un warning
 * distinto de "revisar recorte") vive en la capa que detecta las bandas
 * (`app.js`, vía `isPlausibleMapCount`), no aquí — `buildFallbackPool`
 * solo decide qué pool de NOMBRES ofrecer una vez que ya se decidió
 * seguir adelante con ese conteo. Mantener ambas responsabilidades
 * separadas evita que un mismo conteo (ej. 12) deba rechazarse dos
 * veces con lógicas potencialmente divergentes.
 *
 * @param {number} rowCount - filas detectadas en esta captura.
 * @returns {string[]|null} pool ordenado de candidatos, o null si no
 *   existe un orden posicional confiable para ese tamaño.
 *
 * NOTA (Grupo 1 #2 de la Guía de seguimiento y resolución de errores):
 * `rowCount < 7` devuelve `null` para CUALQUIER valor entre
 * `MIN_PLAUSIBLE_MAP_COUNT` (3) y 6 inclusive — no solo para el caso 3
 * (FACEIT Premium, doble baneo simultáneo, el único documentado en
 * detalle en el resto de este comentario y en los tests históricos).
 * Los conteos 4, 5 y 6 son igual de plausibles que 3 según
 * `isPlausibleMapCount` (todos están dentro del rango real del pool
 * de veto de esta temporada) y representan variantes intermedias
 * igual de reales: doble baneo asimétrico, abandono parcial del veto,
 * u otras combinaciones donde sobreviven más de 3 pero menos de 7
 * mapas. La razón para devolver `null` es EXACTAMENTE la misma en los
 * cuatro casos (3, 4, 5 y 6): no existe un orden posicional único que
 * `STANDARD_ORDER` (pensado para exactamente 7 mapas en un orden fijo)
 * pueda mapear de forma confiable a un subconjunto arbitrario de
 * tamaño variable — qué mapas sobrevivieron y en qué orden depende de
 * qué baneó cada equipo, no de una posición fija en el pool completo.
 * Tratar 4/5/6 con una lógica distinta de 3 (por ejemplo, intentando
 * igual un fallback posicional parcial) reintroducría el mismo riesgo
 * que este `null` existe para evitar: una etiqueta con apariencia de
 * certeza que en realidad no tiene respaldo posicional real. Ver
 * `app_regression_test.js` para los casos de test que verifican este
 * mismo tratamiento uniforme sobre 3, 4, 5 y 6.
 */
function buildFallbackPool(rowCount) {
  if (rowCount === 7) return STANDARD_ORDER;
  if (rowCount === 8) return [...STANDARD_ORDER, ...SEASONAL_OPTIONAL_MAPS];
  if (rowCount < 7) return null; // ambiguo: sin orden posicional confiable (3, 4, 5 o 6 — doble baneo/abandono parcial del veto, ver nota arriba)
  return STANDARD_ORDER; // tamaño inesperado (>8): fallback conservador, ya queda marcado ⚠ igual
}

// Normaliza variantes de OCR de nombres de mapa a nombre canónico
function normalizeMapName(raw) {
  const s = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  const table = {
    dust2: "Dust2", dust: "Dust2",
    mirage: "Mirage",
    nuke: "Nuke",
    ancient: "Ancient",
    inferno: "Inferno",
    anubis: "Anubis",
    cache: "Cache",
    vertigo: "Vertigo",
    overpass: "Overpass",
    train: "Train",
  };
  for (const key of Object.keys(table)) {
    if (s.includes(key)) return table[key];
  }
  return null;
}

// ------------------------------------------------------------
// Bug reportado: "no se detecta Mirage/Ancient" en capturas reales de
// TAPIT.GG donde el ícono de ranking (★ dorada/gris/ámbar/roja — ver
// Sección 0.2 del documento de fundamentos: exactamente 1 estrella por
// cada extremo del ranking de 7 mapas de cada equipo, obligatoria
// salvo el caso Premium de 3 mapas) aparece pegado al lado IZQUIERDO
// del nombre del mapa, en vez de al lado derecho (como en Dust2/Cache,
// donde el patrón anterior sí funcionaba sin problema).
//
// CAUSA RAÍZ: cuando el ícono se solapa visualmente con el nombre,
// Tesseract no siempre inserta un carácter de ruido ADYACENTE al
// nombre completo (caso ya tolerado por MAP_NAME_PATTERN sin cambios,
// ej. "*&Mirage" -> matchea "Mirage" igual) — a veces el ruido cae
// INTERCALADO entre letras del propio nombre ("Mir*age") o incluso
// REEMPLAZA una letra por un glifo visualmente similar ("An¢ient",
// donde "¢" sustituye a la "c"). Ninguno de los dos casos matcheaba
// contra el patrón anterior, que exigía las letras del nombre
// perfectamente contiguas.
//
// FIX EN DOS PARTES (verificado explícitamente contra el fixture 05,
// la prueba de especificidad más estricta del proyecto — 0 falsos
// positivos nuevos sobre el panel de stats extendido, ver
// parser_regression_test.js):
//
//   1. `deconfuseMapText`: sustituye glifos visualmente confundibles
//      con una letra específica (¢/©->c, °->o, ¡->i, @->a, €->e, $->s)
//      ANTES de aplicar el patrón — cubre el caso "letra reemplazada".
//      Se aplica sobre una copia del texto SOLO para la búsqueda de
//      nombre; nunca se usa el texto deconfundido para nada más (no
//      afecta el parseo numérico ni ningún otro campo).
//   2. `MAP_NAME_PATTERN` ahora permite hasta 2 caracteres no
//      alfanuméricos intercalados ENTRE cada letra del nombre esperado
//      — cubre el caso "letra rodeada de ruido sin ser reemplazada".
//      El límite de 2 (no ilimitado) evita relajar tanto el patrón que
//      empiece a matchear texto no relacionado con separaciones de
//      basura muy largas — mismo criterio de "tolerancia acotada, no
//      total" que ya usa ROW_PATTERN para el separador entre conteos.
// ------------------------------------------------------------

// ------------------------------------------------------------
// Grupo 9 #1 de la Guía de seguimiento y resolución de errores —
// "Externalizar constantes de OCR frágiles a un lugar único,
// versionable" (VetoLAB_TAPIT_Analisis_Tecnico.md, Sección 12.6). Ver
// ocrConstants.js para la justificación numérica completa de cada
// valor y para el detalle del patrón Node/navegador usado aquí — en
// resumen: en Node se importa explícitamente; en el navegador,
// ocrConstants.js ya se cargó como <script> anterior (ver index.html)
// y sus `const` de nivel superior ya están en este mismo scope global
// de scripts clásicos, así que el objeto de abajo solo LEE esos
// nombres ya existentes en vez de volver a declararlos (declarar de
// nuevo el mismo identificador con var/let/const sería un SyntaxError
// de redeclaración contra el const ya presente en el scope compartido).
const PARSER_OCR_CONST = (typeof module !== "undefined")
  ? require("./ocrConstants.js")
  : { N_UNUSUALLY_HIGH_THRESHOLD, MAP_NAME_CONFUSABLES }; // lectura de los const globales ya cargados

/**
 * Sustituye glifos individuales conocidos por la letra que Tesseract
 * más probablemente confundió con ese símbolo, SOLO para efectos de
 * búsqueda del nombre de mapa (ver `MAP_NAME_PATTERN` más abajo). No
 * se usa para nada más — nunca reemplaza el texto real de la fila que
 * consume `parseRowNumbers`/`ROW_PATTERN`.
 */
function deconfuseMapText(text) {
  let out = "";
  for (const ch of text) out += PARSER_OCR_CONST.MAP_NAME_CONFUSABLES[ch] ?? ch;
  return out;
}

// Construye, para una palabra dada, un patrón que permite hasta 2
// caracteres no alfanuméricos intercalados ENTRE cada letra — ej. para
// "Cache" -> "C[^A-Za-z0-9]{0,2}a[^A-Za-z0-9]{0,2}c[^A-Za-z0-9]{0,2}..."
const NAME_NOISE_GAP = "[^A-Za-z0-9]{0,2}";
function withNoiseGaps(word) {
  return word.split("").join(NAME_NOISE_GAP);
}

const MAP_NAME_PATTERN = new RegExp(
  "(" + [
    withNoiseGaps("Dust") + NAME_NOISE_GAP + "\\s*2",
    withNoiseGaps("Mirage"),
    withNoiseGaps("Nuke"),
    withNoiseGaps("Ancient"),
    withNoiseGaps("Inferno"),
    withNoiseGaps("Anubis"),
    withNoiseGaps("Cache"),
    withNoiseGaps("Vertigo"),
    withNoiseGaps("Overpass"),
    withNoiseGaps("Train"),
  ].join("|") + ")",
  "gi"
);

/**
 * Patrón ancla de una fila completa: (pA%) [texto corto] nA [sep] nB (pB%)
 * El "texto corto" entre el primer % y el primer dígito de conteo tolera
 * hasta ~6 caracteres de ruido (símbolos de estrella mal leídos, espacios).
 *
 * BUG CORREGIDO: el separador visual "•" entre nA y nB NUNCA sobrevive el
 * OCR como el propio carácter "•". Verificado con Tesseract 5.3.4 sobre
 * capturas reales de TAPIT.GG: el mismo glifo se lee de forma inconsistente
 * como "©", "°", "»", "«", "¢" o "+" según la fila y la compresión de la
 * imagen — nunca como bullet, punto medio, asterisco ni guión. La versión
 * anterior de este regex solo aceptaba [•·,*\-–], por lo que NINGUNA fila
 * del patrón principal coincidía jamás contra OCR real (0 mapas detectados
 * en el 100% de las capturas de prueba). La solución correcta no es
 * ampliar la lista de símbolos (seguirá habiendo glifos nuevos con otra
 * fuente/compresión), sino no depender del carácter exacto: exigimos 1–5
 * caracteres cualesquiera que NO sean dígito ni paréntesis entre los dos
 * conteos. Esto conserva la protección original (nunca fusiona dígitos
 * contiguos sin separador, ver ROW_PATTERN_NO_SEP más abajo para ese caso
 * extremo) sin acoplarse a un glifo específico que el OCR no reproduce
 * de forma fiable.
 */
// Grupo 8 #3 de la Guía de seguimiento y resolución de errores —
// CONFIRMACIÓN (no cambio de lógica) vía ingeniería inversa directa
// del bundle de TAPIT.GG (VetoLAB_TAPIT_Analisis_Tecnico.md, Sección
// 11.2): el separador entre nA y nB NUNCA fue un carácter de texto en
// el origen — es literalmente `<span className="w-1 h-1 bg-white
// rounded-full">` (un círculo CSS de 4x4px), no un glifo "•" ni
// ningún otro símbolo. Esto confirma de forma definitiva que la
// estrategia ya implementada aquí (aceptar cualquier fragmento corto
// de 1-5 caracteres no-dígito, en vez de una lista fija de símbolos
// conocidos) es la única conceptualmente correcta: no existe ningún
// glifo "verdadero" que buscar, porque la fuente de verdad nunca fue
// texto. Un futuro mantenedor NO debe reintentar "arreglar" esto con
// una lista de símbolos más completa — el problema no es una lista
// incompleta, es que la pregunta en sí ("¿qué carácter usa TAPIT?")
// no tiene respuesta.
const ROW_PATTERN = /\((\d{1,3})\s*%\)[^\d(]{0,6}(\d{1,3})[^\d(]{1,5}(\d{1,3})[^\d(]{0,6}\((\d{1,3})\s*%\)/g;

/**
 * Extrae todas las filas completas ancladas en el patrón numérico.
 * Devuelve también los índices de inicio/fin en el texto normalizado,
 * para luego poder buscar el nombre de mapa correspondiente por
 * posición (el texto inmediatamente anterior a cada fila).
 */
function extractRowsByPattern(text) {
  const found = [];
  for (const m of text.matchAll(ROW_PATTERN)) {
    found.push({
      pA: parseInt(m[1], 10),
      nA: parseInt(m[2], 10),
      nB: parseInt(m[3], 10),
      pB: parseInt(m[4], 10),
      start: m.index,
      end: m.index + m[0].length,
      raw: m[0],
    });
  }
  return found;
}

/**
 * Fallback para filas donde el separador entre conteos se perdió por
 * completo en el OCR (ej. "12 7" sin • visible). Más estricto que el
 * patrón principal: exige que ambos números aparezcan como tokens ya
 * separados por espacio — nunca infiere un split dentro de un bloque
 * de dígitos contiguo (evita el bug "12•7" → "127" leído como n=127).
 */
const ROW_PATTERN_NO_SEP = /\((\d{1,3})\s*%\)[^\d(]{0,6}(\d{1,3})\s+(\d{1,3})[^\d(]{0,6}\((\d{1,3})\s*%\)/g;

function extractRowsFallback(text, alreadyFoundRanges) {
  const found = [];
  for (const m of text.matchAll(ROW_PATTERN_NO_SEP)) {
    const overlaps = alreadyFoundRanges.some(
      (r) => m.index < r.end && m.index + m[0].length > r.start
    );
    if (overlaps) continue;
    found.push({
      pA: parseInt(m[1], 10),
      nA: parseInt(m[2], 10),
      nB: parseInt(m[3], 10),
      pB: parseInt(m[4], 10),
      start: m.index,
      end: m.index + m[0].length,
      raw: m[0],
      lowConfidence: true,
    });
  }
  return found;
}

/**
 * Patrón de rescate para el caso donde el recorte de la franja de stats
 * corta el "(" de apertura del PRIMER porcentaje (visto en capturas
 * donde el bloque miniatura+nombre+★ ocupa menos ancho de lo típico,
 * ej. "Dust2" o "Nuke" sin subtítulo — el crop en app.js asume un
 * mínimo de ancho para ese bloque y en esas filas se pasa de largo).
 * Sin el "(", el patrón principal nunca matchea aunque el resto de la
 * fila (dígitos, %, segundo paréntesis completo) esté perfectamente
 * legible — así que ese dato válido se perdía por completo.
 *
 * Este patrón exige el "%)" de cierre del primer grupo (ancla fuerte,
 * nunca se corta porque cae más a la derecha) pero NO exige el "("
 * de apertura, y sigue exigiendo el segundo par "(NN%)" completo para
 * no relajar demasiado la protección contra falsos positivos — solo
 * se usa como último recurso, después de que los dos patrones
 * estrictos ya fallaron.
 */
const ROW_PATTERN_NO_OPEN_PAREN = /(\d{1,3})\s*%\)[^\d(]{0,6}(\d{1,3})[^\d(]{1,5}(\d{1,3})[^\d(]{0,6}\((\d{1,3})\s*%\)/g;

function extractRowsRescue(text, alreadyFoundRanges) {
  const found = [];
  for (const m of text.matchAll(ROW_PATTERN_NO_OPEN_PAREN)) {
    const overlaps = alreadyFoundRanges.some(
      (r) => m.index < r.end && m.index + m[0].length > r.start
    );
    if (overlaps) continue;
    found.push({
      pA: parseInt(m[1], 10),
      nA: parseInt(m[2], 10),
      nB: parseInt(m[3], 10),
      pB: parseInt(m[4], 10),
      start: m.index,
      end: m.index + m[0].length,
      raw: m[0],
      lowConfidence: true,
    });
  }
  return found;
}

// Grupo 3 #3.3.1 (rescate de un solo dígito, ver bloque extendido más
// abajo tras extractRowsSingleDigitRescue) — declarado aquí, cerca de
// los otros ROW_PATTERN_*, para mantener agrupadas todas las
// constantes de patrón de la cadena de rescate en el mismo orden en
// que se aplican.


// ------------------------------------------------------------
// Grupo 3 #3.3.1 de la Guía de seguimiento y resolución de errores —
// "Inferno mal ordenado en Mapas" (falso — bug real de fila de UN
// SOLO dígito por lado, no de ranking). Bug reportado: la fila real
// de Inferno era "(100%) 1 • 2 (50%)" — el separador (renderizado por
// TAPIT como un <span> circular CSS de 4x4px, NUNCA como carácter de
// texto, ver comentario de ROW_PATTERN arriba) se perdió por completo
// en el OCR de esa fila puntual, colapsando "1" + "2" en el token
// fusionado "12". Ninguno de los tres patrones anteriores lo
// distinguía de un conteo real de 12 partidas:
//   - ROW_PATTERN exige 1-5 caracteres no-dígito entre nA y nB — "12"
//     no tiene ningún carácter entre los dígitos, así que no matchea
//     como fila de 2 números (matchea como un solo n=12, igual que
//     ROW_PATTERN_NO_SEP intenta evitar en el caso de 12•7 -> 127).
//   - ROW_PATTERN_NO_SEP exige "\s+" (al menos un espacio) entre los
//     dos números — en este caso no queda ningún espacio.
//   - ROW_PATTERN_NO_OPEN_PAREN hereda la misma exigencia de 1-5
//     caracteres no-dígito de ROW_PATTERN, así que tampoco lo cubre.
//
// El resultado real observado (Inferno apareciendo PRIMERO en la
// lista de picks, no desaparecido) confirma que `nums` no fue `null`
// — algún patrón sí matcheó, probablemente absorbiendo dígitos de la
// fila vecina (Ancient, con conteos de 2 dígitos) dentro del bloque
// fusionado, produciendo un `n` corrupto e inflado que disparó un
// deltaAdj artificialmente alto.
//
// FIX: patrón de rescate MÁS ESTRICTO que los tres anteriores, no más
// laxo — exige EXACTAMENTE 1 dígito a cada lado del bloque fusionado
// (`(\d)(\d)`, no `(\d{1,3})(\d{1,3})`), precisamente porque "12"
// fusionado sin separador es genuinamente ambiguo SOLO cuando ambos
// conteos son de un solo dígito (1-9): en ese caso específico, un
// bloque de exactamente 2 dígitos consecutivos puede interpretarse de
// forma no ambigua como "1 dígito de nA + 1 dígito de nB" sin
// arriesgar fusionar un nA o nB real de 2+ dígitos (ej. un "12" real
// no se reinterpreta jamás como "1"+"2" bajo este patrón, porque ya
// lo captura ROW_PATTERN/ROW_PATTERN_NO_SEP con éxito antes de llegar
// aquí — este patrón es el ÚLTIMO recurso de la cadena, se ejecuta
// solo sobre lo que los tres anteriores no reclamaron).
// Se activa SOLO cuando los tres patrones anteriores ya fallaron
// (mismo criterio de "capas de rescate en orden creciente de
// permisividad" que ROW_PATTERN_NO_OPEN_PAREN), y SIEMPRE marca la
// fila como lowConfidence: true — nunca se asume con la misma certeza
// que un match con separador visible que sí distingue nA de nB. El
// warning `low_confidence_separator` (ya existente, ver validateRows)
// señala la fila para revisión manual en vez de decidir en silencio
// cuál de las dos lecturas (1•2 vs. n=12) es la correcta.
const ROW_PATTERN_SINGLE_DIGIT_AMBIGUOUS = /\((\d{1,3})\s*%\)[^\d(]{0,6}(\d)(\d)[^\d(]{0,6}\((\d{1,3})\s*%\)/g;

function extractRowsSingleDigitRescue(text, alreadyFoundRanges) {
  const found = [];
  for (const m of text.matchAll(ROW_PATTERN_SINGLE_DIGIT_AMBIGUOUS)) {
    const overlaps = alreadyFoundRanges.some(
      (r) => m.index < r.end && m.index + m[0].length > r.start
    );
    if (overlaps) continue;
    found.push({
      pA: parseInt(m[1], 10),
      nA: parseInt(m[2], 10),
      nB: parseInt(m[3], 10),
      pB: parseInt(m[4], 10),
      start: m.index,
      end: m.index + m[0].length,
      raw: m[0],
      lowConfidence: true,
    });
  }
  return found;
}

/**
 * Asigna nombre de mapa a cada fila detectada. Primero intenta leer
 * el nombre real en el texto que precede a la fila (hasta el final de
 * la fila anterior). Si no encuentra ninguno reconocible ahí, cae al
 * orden estándar del pool por posición — mejor una etiqueta razonable
 * y marcada como incierta que perder la fila completa.
 */
function assignMapNames(rows, fullText) {
  const sorted = [...rows].sort((a, b) => a.start - b.start);
  const usedStandardSlots = new Set();
  // Pool de candidatos calculado UNA vez para toda la captura, según
  // cuántas filas se detectaron en total — no STANDARD_ORDER fijo (ver
  // buildFallbackPool arriba). null cuando rowCount < 7: no existe un
  // orden posicional confiable (caso Premium de doble baneo).
  const fallbackPool = buildFallbackPool(sorted.length);

  return sorted.map((row, i) => {
    const prevEnd = i > 0 ? sorted[i - 1].end : 0;
    const label = fullText.slice(prevEnd, row.start);

    const nameMatch = [...deconfuseMapText(label).matchAll(MAP_NAME_PATTERN)].pop(); // el más cercano a la fila
    let mapName = nameMatch ? normalizeMapName(nameMatch[0]) : null;
    let nameGuessed = false;
    // Punto 5 de la Matriz de priorización: flag explícito en vez de
    // que validateRows tenga que comparar `r.map.startsWith("Mapa sin
    // identificar")` — ese string es texto de PRESENTACIÓN (puede
    // traducirse a "Unidentified map N" en inglés) y no debe ser la
    // señal que determina qué warning emitir. `UNIDENTIFIED_MAP_LABEL`
    // sigue siendo el nombre visible por defecto (se sobrescribe en la
    // UI si en el futuro se traduce), pero la LÓGICA se basa en este
    // booleano, no en el contenido del string.
    let noPoolFallback = false;

    if (!mapName) {
      if (fallbackPool) {
        // Fallback por posición: siguiente candidato del pool activo
        // (7 u 8 mapas) no usado aún. Nunca se usa cuando fallbackPool
        // es null — ver rama de abajo.
        const positional = fallbackPool.find((m) => !usedStandardSlots.has(m));
        mapName = positional || `${UNIDENTIFIED_MAP_LABEL} ${i + 1}`;
        noPoolFallback = !positional;
      } else {
        // rowCount < 7 (Premium, doble baneo simultáneo): no hay forma
        // honesta de saber posicionalmente qué mapa es este — el orden
        // de supervivencia no sigue STANDARD_ORDER. Se etiqueta como
        // explícitamente ambiguo en vez de inventar un nombre plausible
        // pero potencialmente falso.
        mapName = `${UNIDENTIFIED_MAP_LABEL} ${i + 1}`;
        noPoolFallback = true;
      }
      nameGuessed = true;
    }
    usedStandardSlots.add(mapName);

    return {
      map: mapName,
      pA: row.pA, nA: row.nA, pB: row.pB, nB: row.nB,
      lowConfidence: !!row.lowConfidence,
      nameGuessed,
      noPoolFallback,
    };
  });
}

/**
 * Parsea el texto crudo devuelto por Tesseract. Estrategia:
 * 1. Ancla filas completas en el patrón numérico rígido (con separador).
 * 2. Rellena huecos con el patrón sin separador (más estricto, sin
 *    fusionar dígitos contiguos).
 * 3. Asigna nombre de mapa por proximidad textual, con fallback por
 *    posición estándar si el OCR no logró leer el nombre.
 */
function parseMapRows(rawText) {
  const text = rawText.replace(/\s+/g, " ").trim();

  const primary = extractRowsByPattern(text);
  const fallback = extractRowsFallback(text, primary);
  const rescued = extractRowsRescue(text, [...primary, ...fallback]);
  // Grupo 3 #3.3.1: cuarto y último nivel de rescate, solo para el
  // caso específico de "ambos conteos son de un solo dígito y el
  // separador se perdió por completo" (ver comentario extenso junto a
  // ROW_PATTERN_SINGLE_DIGIT_AMBIGUOUS). Se ejecuta sobre lo que los
  // tres niveles anteriores no reclamaron todavía, en el mismo
  // criterio de permisividad creciente que ya sigue extractRowsRescue.
  const singleDigitRescued = extractRowsSingleDigitRescue(text, [...primary, ...fallback, ...rescued]);
  const allRows = [...primary, ...fallback, ...rescued, ...singleDigitRescued].sort((a, b) => a.start - b.start);

  if (allRows.length === 0) return [];

  const withNames = assignMapNames(allRows, text);

  // Desambiguación por nombre repetido (Hallazgo 2.2.1 / punto 3 de la
  // Matriz de priorización — "Deduplicación silenciosa por nombre").
  //
  // ANTES: si dos filas terminaban con el mismo `r.map` (ej. OCR
  // reconoció el mismo nombre en dos filas contiguas por ruido, o dos
  // filas cayeron al mismo slot de fallback posicional por una
  // colisión), la segunda se DESCARTABA en `filter` sin ningún rastro
  // — el usuario veía menos mapas de los que la imagen realmente tenía
  // y no había forma de saber que se perdió una fila completa.
  //
  // AHORA: se conservan AMBAS filas. La segunda (y siguientes) ocurrencia
  // de un mismo nombre se renombra a "Nombre (2)", "Nombre (3)", etc. y
  // se marca `nameCollision: true` — `validateRows` convierte esto en un
  // warning visible (⚠) para que el usuario revise manualmente cuál de
  // las dos filas es la real, en vez de que el sistema decida en
  // silencio "quedarme con la primera detección válida".
  const seen = new Map(); // nombre base -> cantidad de apariciones vistas
  return withNames.map((r) => {
    const count = seen.get(r.map) || 0;
    seen.set(r.map, count + 1);
    if (count === 0) return r;
    return {
      ...r,
      map: `${r.map} (${count + 1})`,
      nameCollision: true,
    };
  });
}

/**
 * Extrae los 4 valores numéricos de UNA fila ya aislada visualmente
 * (recorte de banda, ver detectRowBands/cropRowToDataURL en app.js).
 * A diferencia de ROW_PATTERN aplicado sobre la página completa, aquí
 * basta la primera coincidencia — no hay filas vecinas con las que
 * confundirse, así que no se necesita lógica de desambiguación por
 * posición. Devuelve null si la fila no produjo ningún patrón numérico
 * reconocible (dígito ilegible en el propio OCR de esa fila).
 */
function parseRowNumbers(rowText) {
  const text = rowText.replace(/\s+/g, " ").trim();

  ROW_PATTERN.lastIndex = 0;
  const m = ROW_PATTERN.exec(text);
  ROW_PATTERN.lastIndex = 0;
  if (m) {
    return {
      pA: parseInt(m[1], 10),
      nA: parseInt(m[2], 10),
      nB: parseInt(m[3], 10),
      pB: parseInt(m[4], 10),
    };
  }

  // Rescate: el recorte de la franja de stats (cropStatsZoneToDataURL en
  // app.js) puede cortar el "(" de apertura del primer porcentaje cuando
  // el bloque miniatura+nombre+★ es más angosto de lo típico (ej. "Dust2",
  // "Nuke" — nombres cortos sin icono adicional que empuje el bloque hacia
  // la derecha). En ese caso el resto de la fila sigue siendo legible
  // (dígitos, "%)", segundo paréntesis completo), así que en vez de
  // descartar la fila entera se prueba este patrón más permisivo antes de
  // rendirse. Se marca lowConfidence para que quede visible en el ⚠ de UI.
  ROW_PATTERN_NO_OPEN_PAREN.lastIndex = 0;
  const rescueMatch = ROW_PATTERN_NO_OPEN_PAREN.exec(text);
  ROW_PATTERN_NO_OPEN_PAREN.lastIndex = 0;
  if (rescueMatch) {
    return {
      pA: parseInt(rescueMatch[1], 10),
      nA: parseInt(rescueMatch[2], 10),
      nB: parseInt(rescueMatch[3], 10),
      pB: parseInt(rescueMatch[4], 10),
      lowConfidence: true,
    };
  }

  // Grupo 3 #3.3.1: último recurso, específico del bug real reportado
  // ("Inferno mal ordenado en Mapas"). Cuando una fila aislada por
  // banda trae AMBOS conteos de un solo dígito y el separador (nunca
  // un carácter real, ver cabecera de ROW_PATTERN) se pierde por
  // completo en el OCR, el texto colapsa a un bloque de exactamente 2
  // dígitos consecutivos (ej. "1"+"2" -> "12"), indistinguible en el
  // propio texto de un conteo real de 12 partidas. Ver el comentario
  // extenso junto a ROW_PATTERN_SINGLE_DIGIT_AMBIGUOUS para el porqué
  // este patrón es seguro (solo interpreta como "1 dígito + 1 dígito"
  // un bloque de EXACTAMENTE 2 dígitos, nunca reinterpreta un conteo
  // real de 2+ dígitos que ROW_PATTERN/ROW_PATTERN_NO_SEP ya habrían
  // capturado arriba con éxito). Siempre lowConfidence: true — nunca
  // se asume con la misma certeza que un match con separador visible.
  ROW_PATTERN_SINGLE_DIGIT_AMBIGUOUS.lastIndex = 0;
  const singleDigitMatch = ROW_PATTERN_SINGLE_DIGIT_AMBIGUOUS.exec(text);
  ROW_PATTERN_SINGLE_DIGIT_AMBIGUOUS.lastIndex = 0;
  if (singleDigitMatch) {
    return {
      pA: parseInt(singleDigitMatch[1], 10),
      nA: parseInt(singleDigitMatch[2], 10),
      nB: parseInt(singleDigitMatch[3], 10),
      pB: parseInt(singleDigitMatch[4], 10),
      lowConfidence: true,
    };
  }

  return null;
}

/**
 * Busca un nombre de mapa reconocible dentro del texto de una fila ya
 * aislada. Devuelve null si no hay ninguno (la fila debe entonces
 * etiquetarse por posición geométrica, ver STANDARD_ORDER + índice de
 * banda en app.js — NUNCA por un cursor secuencial que dependa de qué
 * filas anteriores lograron parsearse, que es la causa raíz del bug de
 * "el mapa aparece con el nombre equivocado" reportado en capturas con
 * al menos un dígito ilegible en medio de la lista).
 */
function findMapNameInRow(rowText) {
  const match = [...deconfuseMapText(rowText).matchAll(MAP_NAME_PATTERN)][0];
  return match ? normalizeMapName(match[0]) : null;
}

/**
 * Valida y sanea filas parseadas: corrige inversiones obvias
 * (ej. winrate% > 100, o n=0 con winrate>0) y marca advertencias
 * para revisión manual del usuario — el modelo NUNCA debe operar
 * silenciosamente sobre datos corruptos (ver Sección 0.4 del documento).
 *
 * CAMBIO (punto 5 de la Matriz de priorización — "Textos de negocio
 * incrustados en la capa de lógica, bloquea i18n limpio"): cada
 * warning ya NO es un string en español hardcodeado — es un objeto
 * `{code, params?}`. La traducción a texto visible (ES o EN) se
 * resuelve en la capa de presentación (`i18n.js` + `app.js`), nunca
 * aquí. Esto es intencional y no cosmético: antes, agregar un idioma
 * nuevo requería tocar `parser.js` (capa de lógica); ahora solo
 * requiere agregar entradas al diccionario de `i18n.js`. Los `code`
 * usados aquí deben existir como clave `warning.<code>` en
 * `I18N.es`/`I18N.en` — ver `i18n.js`.
 */
function validateRows(rows) {
  return rows.map((r) => {
    const warnings = [];
    if (r.pA > 100 || r.pA < 0) warnings.push({ code: "pa_out_of_range" });
    if (r.pB > 100 || r.pB < 0) warnings.push({ code: "pb_out_of_range" });
    if (r.nA === 0 && r.pA > 0) warnings.push({ code: "na_zero_pa_positive" });
    if (r.nB === 0 && r.pB > 0) warnings.push({ code: "nb_zero_pb_positive" });
    // Grupo 8 #1 de la Guía de seguimiento y resolución de errores:
    // el umbral bajó de 500 a 120 (ver ocrConstants.js) tras confirmar
    // por ingeniería inversa del propio código de TAPIT.GG
    // (VetoLAB_TAPIT_Analisis_Tecnico.md, Sección 11.5) que su ajuste
    // `matches_limit` acota el historial POR JUGADOR a un máximo de
    // 100 partidas totales — ningún conteo real por mapa debería
    // acercarse siquiera a 500. Con 500, este warning era
    // prácticamente inalcanzable incluso ante una fusión de dígitos
    // real del OCR (ej. "12"+"7" leído como "127"), que es exactamente
    // el caso que este warning existe para atrapar.
    if (r.nA > PARSER_OCR_CONST.N_UNUSUALLY_HIGH_THRESHOLD || r.nB > PARSER_OCR_CONST.N_UNUSUALLY_HIGH_THRESHOLD) {
      warnings.push({ code: "n_unusually_high" });
    }
    if (r.lowConfidence) warnings.push({ code: "low_confidence_separator" });
    if (r.ocrFailed) warnings.push({ code: "ocr_failed" });
    if (r.nameGuessed) {
      // Grupo 7 de la Guía de seguimiento y resolución de errores:
      // cuando el nombre no vino del OCR de texto pero SÍ se corroboró
      // por el ícono del mapa (`iconMatched`, ver `identifyMapByIcon`
      // en iconMatch.js / `runPerRowOCR` en app.js), es una calidad de
      // evidencia distinta y mejor que un fallback posicional ciego —
      // hay una comparación visual real detrás, no solo "el N-ésimo
      // mapa del pool". Se le da su propio código de warning
      // (`name_guessed_icon_match`), con menor severidad implícita que
      // `name_guessed_no_pool`/`name_guessed_positional` (la traducción
      // en i18n.js lo redacta como corroboración, no como suposición),
      // y esta rama tiene PRIORIDAD sobre las otras dos: si el ícono
      // corroboró, no tiene sentido además decir "asignado por
      // posición", que ya no es lo que ocurrió.
      warnings.push({
        code: r.iconMatched
          ? "name_guessed_icon_match"
          : (r.noPoolFallback ? "name_guessed_no_pool" : "name_guessed_positional"),
      });
    }
    // Punto 3 de la Matriz de priorización (Hallazgo 2.2.1): dos filas
    // detectadas con el mismo nombre base ya NO se descartan en
    // silencio en `parseMapRows` — se conservan ambas con el nombre
    // desambiguado ("Nuke (2)") y se avisa aquí explícitamente para que
    // el usuario decida cuál fila es la real, en vez de que el sistema
    // elija "la primera detección válida" sin que nadie se entere.
    if (r.nameCollision) {
      warnings.push({ code: "name_collision_same_capture" });
    }
    return { ...r, warnings, needsReview: warnings.length > 0 };
  });
}

if (typeof module !== "undefined") {
  module.exports = {
    parseMapRows, validateRows, normalizeMapName, MAP_POOL,
    STANDARD_ORDER, SEASONAL_OPTIONAL_MAPS, buildFallbackPool,
    parseRowNumbers, findMapNameInRow, UNIDENTIFIED_MAP_LABEL,
    isPlausibleMapCount, MIN_PLAUSIBLE_MAP_COUNT, MAX_PLAUSIBLE_MAP_COUNT,
    deconfuseMapText, MAP_NAME_CONFUSABLES: PARSER_OCR_CONST.MAP_NAME_CONFUSABLES,
  };
}

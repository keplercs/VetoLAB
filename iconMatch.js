// ============================================================
// iconMatch.js — Identificación de mapa por ícono (hash perceptual)
//
// Implementa la idea de diseño documentada en el Grupo 7 de la Guía
// de seguimiento y resolución de errores — VetoLAB: "usar el ícono de
// cada mapa (posición fija a un lado de la caja en la interfaz de
// FACEIT/TAPIT.GG) como identificador, con el nombre de texto vía OCR
// como corroboración", en vez de depender del OCR de texto como único
// mecanismo de identificación.
//
// DECISIÓN DE PRODUCTO (confirmada explícitamente antes de implementar
// esto, no asumida): el ícono NUNCA sobrescribe un nombre que el OCR de
// texto ya reconoció con éxito. Solo actúa cuando el OCR de texto no
// encontró ningún nombre reconocible en la fila — en ese caso, el
// resultado del hash de ícono reemplaza al fallback posicional ciego
// (`buildFallbackPool`/`STANDARD_ORDER` en parser.js) por una
// identificación basada en evidencia visual real, en vez de una
// suposición de "el N-ésimo mapa del pool". Esto es estrictamente un
// FALLBACK MÁS FUERTE, no un segundo mecanismo que compita con el OCR
// de texto ni que pueda contradecirlo.
//
// MÉTODO: dHash (difference hash) de 8x8 — 64 bits — sobre la imagen
// en escala de grises. Se eligió dHash sobre aHash/pHash por:
//   - aHash (average hash): sensible a cambios globales de brillo/tinte
//     — el overlay ámbar/dorado que aplica la interfaz real sobre cada
//     ícono (ver `suppressIconColors` en app.js) desplaza el brillo
//     medio de forma no uniforme entre mapas, degradando aHash más que
//     a dHash en las pruebas realizadas contra estas referencias.
//   - pHash (perceptual hash, DCT): más robusto aún, pero requiere una
//     transformada de coseno discreta — complejidad de implementación
//     no justificada por la mejora marginal sobre dHash en este caso,
//     dado el margen de separación ya amplio (ver abajo).
//   - dHash: compara píxeles adyacentes (izquierda vs derecha) en vez
//     de contra un promedio global, lo que lo hace más tolerante a
//     shifts de brillo/tinte uniforme y todavía sensible a la
//     estructura real de la imagen (bordes, geometría, contraste local)
//     — exactamente el tipo de invariancia que necesita un ícono con
//     overlay de color variable.
//
// VALIDACIÓN EMPÍRICA (contra las 7 imágenes de referencia usadas para
// generar MAP_ICON_REFERENCE_HASHES, simulando tinte ámbar + reducción
// a tamaño de ícono real + compresión JPEG agresiva, condiciones más
// duras que el caso real):
//   - Distancia de Hamming MÍNIMA entre dos mapas DISTINTOS: 24-25 bits
//     de 64.
//   - Distancia de Hamming del MISMO mapa bajo variaciones realistas
//     (tinte ±10%, compresión JPEG baja, jitter de recorte ±3px,
//     tamaño de ícono ±25%): 0-9 bits de 64.
//   Hay un margen de separación amplio (~15 bits) entre ambos
//   regímenes — es la base empírica de MATCH_THRESHOLD_BITS más abajo,
//   no un valor arbitrario.
//
// LIMITACIÓN DECLARADA: estas 7 referencias son capturas/screenshots
// de cada mapa provistas manualmente por quien mantiene el proyecto,
// no un dataset extraído directamente de la interfaz real de
// TAPIT.GG. Vertigo no tiene referencia todavía (mapa no disponible al
// momento de generar este módulo — ver `MAP_ICON_REFERENCE_HASHES`,
// que deliberadamente NO incluye una entrada para "Vertigo"): un ícono
// de Vertigo real simplemente no encontrará coincidencia por debajo
// del umbral y el sistema lo tratará como "sin corroboración visual"
// (comportamiento seguro por diseño, ver `matchIconHash` más abajo),
// nunca como una identificación falsa forzada contra las 7 referencias
// existentes.
// ============================================================

/**
 * Hashes de referencia (dHash 8x8, 64 bits, como BigInt) para los 7
 * mapas actualmente disponibles en el pool activo de FACEIT. Generados
 * una sola vez a partir de imágenes de referencia de cada mapa
 * (recorte cuadrado del ícono/thumbnail característico), NO en tiempo
 * de ejecución — no hay ninguna dependencia de red ni de assets
 * externos para calcular esto en el navegador del usuario.
 *
 * Para regenerar (si se reemplaza alguna imagen de referencia, o
 * cuando Vertigo esté disponible y se agregue su propia referencia):
 * ver `computeDHash` más abajo, que es exactamente el mismo algoritmo
 * usado para generar estos valores — aplicarlo sobre una nueva imagen
 * de referencia y agregar la entrada correspondiente aquí.
 */
const MAP_ICON_REFERENCE_HASHES = {
  Dust2: 0x81cdc73677772565n,
  Mirage: 0x6672dcec90b21131n,
  Nuke: 0x6b4b13d6d772fc97n,
  Ancient: 0xc6ce4630227253d9n,
  Inferno: 0xf93bf1d1dddffcfcn,
  Anubis: 0x88c8c8b9c9c9e0f8n,
  Cache: 0x1010c8cdad7976cen,
  // NOTA: "Vertigo" (SEASONAL_OPTIONAL_MAPS en parser.js) no tiene
  // referencia todavía — no disponible en FACEIT al momento de
  // generar este módulo. No se agrega una entrada placeholder/vacía a
  // propósito: una entrada ausente es indistinguible de "no
  // corrobora", que es el comportamiento correcto mientras no exista
  // una referencia real que hashear.
};

// Umbral de distancia de Hamming por debajo del cual dos hashes se
// consideran "el mismo mapa". Ver la validación empírica en el
// comentario de cabecera: mismo mapa bajo variación realista cae en
// 0-9 bits; mapas distintos empiezan en 24-25 bits. 16 es el punto
// medio de ese margen — ni tan ajustado que un jitter normal de
// recorte/compresión lo rompa, ni tan laxo que se acerque al régimen
// de "mapas distintos".
const MATCH_THRESHOLD_BITS = 16;
const HASH_SIZE = 8; // dHash 8x8 = 64 bits

/**
 * Distancia de Hamming entre dos hashes de 64 bits (BigInt). Cuenta
 * los bits en que difieren. Se usa BigInt (no Number) porque 64 bits
 * excede el rango de entero seguro de JS (Number.MAX_SAFE_INTEGER es
 * de 53 bits) — un hash de 64 bits en Number perdería precisión y
 * produciría falsos positivos/negativos silenciosos.
 */
function hammingDistance(a, b) {
  let x = a ^ b;
  let count = 0n;
  while (x > 0n) {
    count += x & 1n;
    x >>= 1n;
  }
  return Number(count);
}

/**
 * Calcula el dHash (difference hash) de 8x8 de una imagen ya reducida
 * a escala de grises, representada como un array plano de valores de
 * luminancia (0-255), con las dimensiones dadas.
 *
 * ALGORITMO: redimensiona a (HASH_SIZE+1) x HASH_SIZE (9x8 por
 * defecto), compara cada píxel con su vecino a la derecha — si es más
 * brillante, bit=1, si no, bit=0 — y empaqueta los 64 bits resultantes
 * en un BigInt. Esto es el mismo algoritmo estándar de dHash (Neal
 * Krawetz, "Kind of Like That", 2011), reimplementado aquí sin
 * dependencias externas porque el objetivo es que el navegador del
 * usuario pueda calcularlo con solo Canvas 2D, sin cargar ninguna
 * librería adicional.
 *
 * @param {Uint8ClampedArray|Array<number>} grayPixels - luminancia por
 *   píxel, longitud width*height, ya en escala de grises.
 * @param {number} width
 * @param {number} height
 * @returns {bigint}
 */
function dHashFromGrayscale(grayPixels, width, height) {
  let hash = 0n;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      const left = grayPixels[y * width + x];
      const right = grayPixels[y * width + x + 1];
      hash = (hash << 1n) | (left > right ? 1n : 0n);
    }
  }
  return hash;
}

/**
 * Calcula el dHash de un canvas/ImageData ya recortado al área del
 * ícono. Reduce la imagen a (HASH_SIZE+1) x HASH_SIZE con un canvas
 * intermedio (el propio downscale del canvas actúa como suavizado
 * anti-aliasing, igual que hace `imageSmoothingEnabled` en el resto
 * del proyecto — ver `buildDownsampledCanvas` en app.js para el mismo
 * patrón ya usado para bandas), convierte a escala de grises por
 * luminancia estándar (mismos coeficientes que
 * `applyGrayscaleAutocontrast` en app.js, para consistencia interna
 * del proyecto), y aplica `dHashFromGrayscale`.
 *
 * @param {HTMLCanvasElement} sourceCanvas - canvas ya recortado al
 *   área aproximada del ícono (ver `cropIconZoneToCanvas` en app.js).
 * @returns {bigint}
 */
function computeDHash(sourceCanvas) {
  const w = HASH_SIZE + 1;
  const h = HASH_SIZE;
  const small = document.createElement("canvas");
  small.width = w;
  small.height = h;
  const ctx = small.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(sourceCanvas, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h).data;
  const gray = new Float64Array(w * h);
  for (let i = 0, p = 0; i < imgData.length; i += 4, p++) {
    gray[p] = 0.299 * imgData[i] + 0.587 * imgData[i + 1] + 0.114 * imgData[i + 2];
  }
  return dHashFromGrayscale(gray, w, h);
}

/**
 * Compara un hash calculado contra las 7 referencias conocidas y
 * devuelve la mejor coincidencia si está por debajo del umbral, o
 * `null` si ninguna referencia se acerca lo suficiente (caso esperado
 * para Vertigo, para íconos mal recortados, o para ruido).
 *
 * NUNCA lanza una identificación forzada: si la distancia mínima
 * encontrada iguala o supera `MATCH_THRESHOLD_BITS`, se devuelve
 * `null` en vez de "el menos malo de los 7" — es preferible no
 * corroborar nada a corroborar con baja confianza real, coherente con
 * el resto del proyecto (nunca inventar certeza donde no la hay, ver
 * `buildFallbackPool`/`UNIDENTIFIED_MAP_LABEL` en parser.js).
 *
 * @param {bigint} hash
 * @returns {{map: string, distance: number}|null}
 */
function matchIconHash(hash) {
  let best = null;
  for (const [map, refHash] of Object.entries(MAP_ICON_REFERENCE_HASHES)) {
    const d = hammingDistance(hash, refHash);
    if (best === null || d < best.distance) {
      best = { map, distance: d };
    }
  }
  if (best === null || best.distance >= MATCH_THRESHOLD_BITS) return null;
  return best;
}

/**
 * Punto de entrada de alto nivel: dado un canvas ya recortado al área
 * del ícono de una fila, calcula su hash y devuelve la mejor
 * coincidencia (o `null`). Envuelve `computeDHash` + `matchIconHash`
 * para que `app.js` no necesite conocer el detalle de que el resultado
 * intermedio es un BigInt.
 *
 * @param {HTMLCanvasElement} iconCanvas
 * @returns {{map: string, distance: number}|null}
 */
function identifyMapByIcon(iconCanvas) {
  try {
    const hash = computeDHash(iconCanvas);
    return matchIconHash(hash);
  } catch (err) {
    // Un canvas vacío/inválido no debe romper el pipeline de OCR — la
    // corroboración por ícono es siempre un plus, nunca una ruta
    // crítica. Ver mismo criterio de robustez que `runOCR` en app.js
    // (try/catch amplio, degradación segura).
    console.warn("identifyMapByIcon: no se pudo calcular el hash del ícono:", err);
    return null;
  }
}

if (typeof module !== "undefined") {
  module.exports = {
    MAP_ICON_REFERENCE_HASHES, MATCH_THRESHOLD_BITS, HASH_SIZE,
    hammingDistance, dHashFromGrayscale, computeDHash, matchIconHash,
    identifyMapByIcon,
  };
}

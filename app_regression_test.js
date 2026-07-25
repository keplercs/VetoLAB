// ============================================================
// Test de regresión — app.js (gate de pipeline OCR)
//
// Origen: punto 11 de la Matriz de priorización (Revisión Técnica
// VetoLAB) — "fallbackPool depende de un conteo geométrico no
// validado". `looksLikeMapGrid` decidía si el OCR usa el pipeline por
// fila (`runPerRowOCR`, que se apoya en `buildFallbackPool` de
// parser.js para asignar nombre por posición cuando el OCR no logra
// leer uno) aceptando cualquier conteo de bandas entre 3 y 10. Pero
// `buildFallbackPool` solo tiene un orden posicional CONFIABLE para 3,
// 7 u 8 filas — para cualquier otro conteo caía a un fallback
// conservador (`STANDARD_ORDER` completo) que puede quedar mal
// dimensionado para TODA la captura sin que nada lo valide antes.
//
// El fix: `looksLikeMapGrid` ahora exige que `bands.length` sea
// exactamente uno de los tamaños de pool conocidos y válidos
// (3, 7, 8). Cualquier otro conteo hace que `runOCR` degrade
// directamente a `runWholeImageOCR`, que no depende de contar bandas.
//
// POR QUÉ ESTE TEST EXTRAE LA FUNCIÓN DE app.js EN VEZ DE
// REESCRIBIRLA A MANO: app.js no es requireable en Node tal cual (usa
// `document`/`els` a nivel de módulo y ejecuta código de arranque del
// navegador al cargar). Copiar la lógica de `looksLikeMapGrid` a mano
// en este archivo sería exactamente el tipo de duplicación silenciosa
// que un refactor futuro podría desincronizar sin que ningún test lo
// note. En vez de eso, este test extrae el bloque fuente real de
// `looksLikeMapGrid` (delimitado por marcadores estables) directamente
// de app.js y lo evalúa — si `app.js` cambia la lógica, este test la
// ejercita tal cual quedó, no una copia congelada.
//
// Ejecutar: node app_regression_test.js
// ============================================================

const assert = require("assert");
const fs = require("fs");
const path = require("path");

let failures = 0;
function check(label, fn) {
  try {
    fn();
    console.log(`OK   ${label}`);
  } catch (err) {
    failures++;
    console.error(`FAIL ${label} — ${err.message}`);
  }
}

console.log("=== Test de regresión: app.js (gate looksLikeMapGrid, punto 11) ===\n");

const appSource = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");

// Extrae desde la declaración de RELIABLE_BAND_COUNTS hasta el cierre
// de looksLikeMapGrid (ancla de inicio/fin por texto literal presente
// en app.js — si cualquiera de las dos anclas deja de existir porque
// la función se renombró o se movió, este test falla explícitamente
// en vez de silenciosamente probar una versión vieja).
const startAnchor = "const RELIABLE_BAND_COUNTS = new Set([3, 7, 8]);";
const endAnchorFn = "function looksLikeMapGrid(bands) {";
const startIdx = appSource.indexOf(startAnchor);
const fnStartIdx = appSource.indexOf(endAnchorFn, startIdx);

assert.ok(startIdx !== -1, "No se encontró la declaración de RELIABLE_BAND_COUNTS en app.js — ¿se renombró o se eliminó?");
assert.ok(fnStartIdx !== -1, "No se encontró la función looksLikeMapGrid en app.js — ¿se renombró o se eliminó?");

const fnBodyStart = appSource.indexOf("{", fnStartIdx);
const fnBodyEnd = appSource.indexOf("\n}", fnBodyStart);
assert.ok(fnBodyEnd !== -1, "No se pudo determinar el cierre de looksLikeMapGrid en app.js");

const extractedSource = appSource.slice(startIdx, fnBodyEnd + 2);

// Evalúa el bloque extraído en un scope aislado y expone
// looksLikeMapGrid + RELIABLE_BAND_COUNTS para el resto del test.
const sandbox = {};
// eslint-disable-next-line no-new-func
new Function(
  "sandbox",
  `${extractedSource}\nsandbox.looksLikeMapGrid = looksLikeMapGrid;\nsandbox.RELIABLE_BAND_COUNTS = RELIABLE_BAND_COUNTS;`
)(sandbox);

const { looksLikeMapGrid, RELIABLE_BAND_COUNTS } = sandbox;

function makeBands(count, height = 40) {
  return Array.from({ length: count }, () => ({ h: height }));
}

// ------------------------------------------------------------
// 1. Conteos confiables (3, 7, 8) con alturas uniformes: deben pasar.
// ------------------------------------------------------------
console.log("--- Conteos confiables (3, 7, 8): deben aprobar el pipeline por fila ---");

check("looksLikeMapGrid: 3 bandas uniformes -> true (pool Premium, doble baneo)", () => {
  assert.strictEqual(looksLikeMapGrid(makeBands(3)), true);
});

check("looksLikeMapGrid: 7 bandas uniformes -> true (pool estándar de temporada)", () => {
  assert.strictEqual(looksLikeMapGrid(makeBands(7)), true);
});

check("looksLikeMapGrid: 8 bandas uniformes -> true (pool + mapa opcional Vertigo)", () => {
  assert.strictEqual(looksLikeMapGrid(makeBands(8)), true);
});

// ------------------------------------------------------------
// 2. Conteos NO confiables: deben degradar (false), aunque las
//    alturas sean perfectamente uniformes — este es exactamente el
//    caso que el punto 11 corrige (antes pasaban con bands.length
//    entre 3 y 10 sin más chequeo que la uniformidad de altura).
// ------------------------------------------------------------
console.log("\n--- Conteos NO confiables: deben degradar a runWholeImageOCR ---");

check("looksLikeMapGrid: 4 bandas uniformes -> false (antes del fix: true)", () => {
  assert.strictEqual(looksLikeMapGrid(makeBands(4)), false);
});

check("looksLikeMapGrid: 5 bandas uniformes -> false (antes del fix: true)", () => {
  assert.strictEqual(looksLikeMapGrid(makeBands(5)), false);
});

check("looksLikeMapGrid: 6 bandas uniformes -> false (antes del fix: true) — el caso citado explícitamente en el hallazgo 11 (6 bandas mal contadas de un caso realmente-7)", () => {
  assert.strictEqual(looksLikeMapGrid(makeBands(6)), false);
});

check("looksLikeMapGrid: 9 bandas uniformes -> false (antes del fix: true)", () => {
  assert.strictEqual(looksLikeMapGrid(makeBands(9)), false);
});

check("looksLikeMapGrid: 10 bandas uniformes -> false (antes del fix: true, límite superior del rango viejo)", () => {
  assert.strictEqual(looksLikeMapGrid(makeBands(10)), false);
});

check("looksLikeMapGrid: 2 bandas -> false (ya era false antes y sigue siéndolo)", () => {
  assert.strictEqual(looksLikeMapGrid(makeBands(2)), false);
});

check("looksLikeMapGrid: 11 bandas -> false (fuera de cualquier rango considerado)", () => {
  assert.strictEqual(looksLikeMapGrid(makeBands(11)), false);
});

check("looksLikeMapGrid: 0 bandas -> false", () => {
  assert.strictEqual(looksLikeMapGrid([]), false);
});

// ------------------------------------------------------------
// 3. La condición de uniformidad de altura se sigue aplicando incluso
//    con un conteo confiable — el fix no debe relajar esa protección
//    existente, solo agregar la restricción de conteo.
// ------------------------------------------------------------
console.log("\n--- La condición de uniformidad de altura sigue vigente sobre conteos confiables ---");

check("looksLikeMapGrid: 7 bandas pero con una altura muy dispar -> false", () => {
  const bands = makeBands(7);
  bands[3] = { h: 3 }; // una banda mucho más chica que el resto (ruido, no fila real)
  assert.strictEqual(looksLikeMapGrid(bands), false);
});

check("looksLikeMapGrid: 8 bandas con alturas dentro del margen (< 2.2x) -> true", () => {
  const bands = makeBands(8, 40);
  bands[0] = { h: 50 }; // 50/40 = 1.25, dentro del margen
  assert.strictEqual(looksLikeMapGrid(bands), true);
});

// ------------------------------------------------------------
// 4. RELIABLE_BAND_COUNTS debe ser exactamente {3, 7, 8} — coherente
//    con los tres casos que buildFallbackPool (parser.js) resuelve de
//    forma confiable (ver parser.js: rowCount===7 -> STANDARD_ORDER,
//    rowCount===8 -> STANDARD_ORDER+Vertigo, rowCount<7 -> null salvo
//    el caso 3 mapas de Premium con doble baneo, que se maneja como
//    "sin nombre inventado" en vez de un orden posicional).
// ------------------------------------------------------------
console.log("\n--- Coherencia con buildFallbackPool (parser.js) ---");

check("RELIABLE_BAND_COUNTS contiene exactamente {3, 7, 8}, ni más ni menos", () => {
  const expected = new Set([3, 7, 8]);
  assert.strictEqual(RELIABLE_BAND_COUNTS.size, expected.size, "tamaño de RELIABLE_BAND_COUNTS inesperado");
  for (const n of expected) {
    assert.ok(RELIABLE_BAND_COUNTS.has(n), `RELIABLE_BAND_COUNTS debería incluir ${n}`);
  }
});

// Verificación cruzada opcional contra buildFallbackPool real, si
// parser.js está disponible en este mismo directorio (debería estarlo
// siempre en este proyecto).
//
// NOTA IMPORTANTE sobre el caso n=3: `buildFallbackPool(3)` devuelve
// `null` A PROPÓSITO (parser.js: "ambiguo: sin orden posicional
// confiable — Premium, doble baneo") — NO porque sea un tamaño
// inseguro para el pipeline por fila, sino porque para 3 mapas no
// existe ningún orden posicional plausible que inventar. El pipeline
// por fila (`runPerRowOCR`/`assignMapNames`) ya maneja ese `null`
// correctamente: etiqueta la fila como "Mapa sin identificar N" en
// vez de arriesgar una posición falsa (ver `parser.js` y el test
// `veto_07_premium_3maps` en `parser_regression_test.js`). Por eso 3
// SÍ pertenece a `RELIABLE_BAND_COUNTS` de `looksLikeMapGrid` (el
// conteo de bandas en sí es confiable/plausible para ese escenario)
// aunque su `buildFallbackPool` sea `null` (no hay POSICIÓN confiable
// que asignar, y el sistema ya no la inventa). "Conteo de bandas
// confiable" y "pool posicional no-nulo" son dos propiedades
// relacionadas pero distintas — este test verifica cada una por
// separado en vez de asumir que son la misma.
try {
  const { buildFallbackPool } = require("./parser.js");

  check("n=7 y n=8 (pool posicional completo) tienen un buildFallbackPool NO NULO", () => {
    assert.ok(buildFallbackPool(7) !== null, "buildFallbackPool(7) no debería ser null");
    assert.ok(buildFallbackPool(8) !== null, "buildFallbackPool(8) no debería ser null");
  });

  check("n=3 (caso Premium/doble baneo) tiene buildFallbackPool NULO a propósito — looksLikeMapGrid igual debe aceptarlo, porque el pipeline por fila etiqueta explícitamente en vez de inventar posición", () => {
    assert.strictEqual(buildFallbackPool(3), null, "buildFallbackPool(3) debe seguir siendo null por diseño");
    assert.strictEqual(looksLikeMapGrid(makeBands(3)), true, "looksLikeMapGrid debe aceptar 3 bandas igualmente");
  });
} catch (err) {
  console.log("SKIP verificación cruzada con parser.js — no se pudo requerir (" + err.message + ")");
}

console.log(`\n${failures === 0 ? "✔ Todos los tests pasaron." : `✘ ${failures} test(s) fallaron.`}`);
process.exit(failures === 0 ? 0 : 1);

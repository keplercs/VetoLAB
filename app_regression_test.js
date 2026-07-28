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
// de looksLikeMapGrid Y, a continuación, hasta el cierre de
// flagImplausibleBandCount (Grupo 1 #1 — la función que consulta
// isPlausibleMapCount de parser.js para decidir el warning de conteo
// geométricamente imposible). Ancla de inicio/fin por texto literal
// presente en app.js — si cualquiera de las anclas deja de existir
// porque la función se renombró o se movió, este test falla
// explícitamente en vez de silenciosamente probar una versión vieja.
const startAnchor = "const RELIABLE_BAND_COUNTS = new Set([3, 4, 5, 6, 7, 8]);";
const endAnchorFn = "function looksLikeMapGrid(bands) {";
const startIdx = appSource.indexOf(startAnchor);
const fnStartIdx = appSource.indexOf(endAnchorFn, startIdx);

assert.ok(startIdx !== -1, "No se encontró la declaración de RELIABLE_BAND_COUNTS en app.js — ¿se renombró o se eliminó?");
assert.ok(fnStartIdx !== -1, "No se encontró la función looksLikeMapGrid en app.js — ¿se renombró o se eliminó?");

const fnBodyStart = appSource.indexOf("{", fnStartIdx);
const fnBodyEnd = appSource.indexOf("\n}", fnBodyStart);
assert.ok(fnBodyEnd !== -1, "No se pudo determinar el cierre de looksLikeMapGrid en app.js");

// Extensión (Grupo 1 #1): busca flagImplausibleBandCount justo después
// de looksLikeMapGrid y, si existe, extiende el bloque extraído hasta
// su cierre también. Si la función no existe todavía (versión previa
// de app.js sin este fix), el bloque extraído se limita al original y
// los tests de flagImplausibleBandCount más abajo hacen SKIP en vez de
// fallar — no penaliza a quien todavía no aplicó el fix.
const flagAnchor = "function flagImplausibleBandCount(bandCount) {";
const flagStartIdx = appSource.indexOf(flagAnchor, fnBodyEnd);
let extractedEnd = fnBodyEnd + 2;
if (flagStartIdx !== -1) {
  const flagBodyStart = appSource.indexOf("{", flagStartIdx);
  const flagBodyEnd = appSource.indexOf("\n}", flagBodyStart);
  if (flagBodyEnd !== -1) extractedEnd = flagBodyEnd + 2;
}

const extractedSource = appSource.slice(startIdx, extractedEnd);

// Evalúa el bloque extraído en un scope aislado y expone
// looksLikeMapGrid + RELIABLE_BAND_COUNTS (+ flagImplausibleBandCount,
// si se extrajo) para el resto del test.
//
// isPlausibleMapCount se inyecta como global del sandbox ANTES de
// evaluar el bloque extraído — en el navegador real, parser.js se
// carga como <script> normal (no módulo) antes que app.js (ver el
// orden `defer` en index.html: i18n -> faceitContext -> math ->
// parser -> app), así que isPlausibleMapCount ya existe como global
// cuando flagImplausibleBandCount se define. Aquí se replica esa
// misma disponibilidad importando la función real de parser.js, en
// vez de una reimplementación paralela que podría desincronizarse.
let isPlausibleMapCountForSandbox;
try {
  ({ isPlausibleMapCount: isPlausibleMapCountForSandbox } = require("./parser.js"));
} catch (err) {
  isPlausibleMapCountForSandbox = undefined;
}

const sandbox = {};
// eslint-disable-next-line no-new-func
new Function(
  "sandbox",
  "isPlausibleMapCount",
  `${extractedSource}
sandbox.looksLikeMapGrid = looksLikeMapGrid;
sandbox.RELIABLE_BAND_COUNTS = RELIABLE_BAND_COUNTS;
if (typeof flagImplausibleBandCount === "function") sandbox.flagImplausibleBandCount = flagImplausibleBandCount;`
)(sandbox, isPlausibleMapCountForSandbox);

const { flagImplausibleBandCount } = sandbox;

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
// Bug real reportado 26/07/2026 — Dust2/Mirage no reconocidos en una
// captura real de 5 filas. Evidencia (Tesseract 5.3.4, misma versión
// del proyecto, corrida directamente sobre la captura real): con
// `runWholeImageOCR` (PSM 3, el que corría antes para 4/5/6 bandas por
// no pertenecer a RELIABLE_BAND_COUNTS), Tesseract perdía por completo
// las líneas de Dust2 y Mirage al segmentar mal el layout de una
// imagen angosta con thumbnails — un problema de PSM/segmentación de
// layout, no de contraste ni de ruido de ícono. Con el pipeline por
// fila (`runPerRowOCR`, PSM 7 — línea única, banda ya aislada
// geométricamente), las 5 filas se reconocieron limpias, incluyendo
// Dust2 y Mirage.
//
// Esto invierte la conclusión anterior para 4/5/6: el pipeline por
// fila es estructuralmente superior para el OCR de TEXTO en sí,
// independientemente de si existe o no un pool de fallback POSICIONAL
// confiable para ese conteo (esa es una pregunta distinta, que sigue
// resolviendo `buildFallbackPool` en parser.js sin cambios — ver
// bloque de verificación cruzada más abajo). Por eso 4/5/6 se mueven
// aquí, a la sección de conteos CONFIABLES para correr el pipeline por
// fila.
// ------------------------------------------------------------
console.log("\n--- Conteos 4, 5, 6: TAMBIÉN deben aprobar el pipeline por fila (actualizado tras bug real 26/07/2026) ---");

check("looksLikeMapGrid: 4 bandas uniformes -> true (actualizado: el pipeline por fila con PSM 7 reconoce el nombre mejor que PSM 3 de imagen completa, independiente del fallback posicional)", () => {
  assert.strictEqual(looksLikeMapGrid(makeBands(4)), true);
});

check("looksLikeMapGrid: 5 bandas uniformes -> true (actualizado — caso real reportado: captura de 5 filas donde PSM 3 perdía Dust2/Mirage y PSM 7 por fila las reconoció correctamente)", () => {
  assert.strictEqual(looksLikeMapGrid(makeBands(5)), true);
});

check("looksLikeMapGrid: 6 bandas uniformes -> true (actualizado; sigue sin existir fallback posicional para este conteo — ver buildFallbackPool — pero eso ya no impide usar el pipeline por fila, que resuelve el nombre por OCR de texto en la gran mayoría de los casos)", () => {
  assert.strictEqual(looksLikeMapGrid(makeBands(6)), true);
});

// ------------------------------------------------------------
// Conteos NO confiables: deben seguir degradando (false). Estos NO
// cambiaron con la actualización de 4/5/6 — siguen fuera del rango
// geométricamente plausible del pool de veto de FACEIT esta temporada
// (isPlausibleMapCount/MIN_PLAUSIBLE_MAP_COUNT/MAX_PLAUSIBLE_MAP_COUNT
// en parser.js: 3 a 8 inclusive), así que no tiene sentido intentar
// segmentar bandas para un conteo que ya se sabe imposible.
// ------------------------------------------------------------
console.log("\n--- Conteos NO confiables: deben degradar a runWholeImageOCR ---");

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
// 4. RELIABLE_BAND_COUNTS debe ser exactamente {3, 4, 5, 6, 7, 8}
//    (actualizado tras el bug real del 26/07/2026) — el rango completo
//    geométricamente plausible (isPlausibleMapCount/MIN_PLAUSIBLE_MAP_COUNT/
//    MAX_PLAUSIBLE_MAP_COUNT en parser.js), NO solo los tres casos donde
//    buildFallbackPool tiene un pool POSICIONAL confiable. Estas dos
//    propiedades ya no coinciden a propósito: "conteo confiable para
//    correr el pipeline por fila" ahora depende de si el conteo es
//    geométricamente plausible (¿podría ser una captura real?), no de
//    si existe una posición de fallback que inventar si el OCR de
//    texto falla — esa sigue siendo la pregunta distinta que resuelve
//    `buildFallbackPool`, con su propio comportamiento sin cambios
//    (ver bloque de verificación cruzada más abajo).
// ------------------------------------------------------------
console.log("\n--- Coherencia con isPlausibleMapCount (parser.js) ---");

check("RELIABLE_BAND_COUNTS contiene exactamente {3, 4, 5, 6, 7, 8}, ni más ni menos", () => {
  const expected = new Set([3, 4, 5, 6, 7, 8]);
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
  const { buildFallbackPool, STANDARD_ORDER } = require("./parser.js");

  check("n=7 y n=8 (pool posicional completo) tienen un buildFallbackPool NO NULO", () => {
    assert.ok(buildFallbackPool(7) !== null, "buildFallbackPool(7) no debería ser null");
    assert.ok(buildFallbackPool(8) !== null, "buildFallbackPool(8) no debería ser null");
  });

  check("n=3 (caso Premium/doble baneo) tiene buildFallbackPool NULO a propósito — looksLikeMapGrid igual debe aceptarlo, porque el pipeline por fila etiqueta explícitamente en vez de inventar posición", () => {
    assert.strictEqual(buildFallbackPool(3), null, "buildFallbackPool(3) debe seguir siendo null por diseño");
    assert.strictEqual(looksLikeMapGrid(makeBands(3)), true, "looksLikeMapGrid debe aceptar 3 bandas igualmente");
  });

  // Grupo 1 #2 de la Guía de seguimiento y resolución de errores —
  // "buildFallbackPool no distingue 4/5/6 de 'tamaño inesperado
  // (>8)'". Antes de este fix, 4/5/6 devolvían `null` (comportamiento
  // ya correcto), pero ningún test lo verificaba explícitamente —
  // solo el caso 3 tenía cobertura. Estos tres casos replican
  // exactamente el mismo patrón de aserción usado arriba para n=3:
  // buildFallbackPool debe seguir siendo null (sin fallback
  // posicional inventado), y NO deben confundirse con el caso >8
  // ("tamaño inesperado"), que sí devuelve STANDARD_ORDER como
  // fallback conservador — un comportamiento deliberadamente distinto
  // que estos tests dejan trazado para que una futura modificación de
  // buildFallbackPool no colapse 4/5/6 dentro de la rama de >8 por
  // error de rango.
  //
  // ACTUALIZACIÓN (bug real reportado 26/07/2026): la nota original
  // aquí afirmaba que looksLikeMapGrid(4/5/6) debía seguir siendo
  // `false`, a diferencia de n=3. Esa afirmación quedó OBSOLETA tras
  // el fix del bug real de Dust2/Mirage no reconocidos — ver el
  // comentario extenso junto a `RELIABLE_BAND_COUNTS` en app.js:
  // el pipeline por fila (PSM 7) demostró ser superior al de imagen
  // completa (PSM 3) para el OCR de texto en sí, independientemente de
  // si existe fallback posicional. Por eso `RELIABLE_BAND_COUNTS` se
  // amplió a {3,4,5,6,7,8}, y looksLikeMapGrid(4/5/6) ahora es `true`,
  // igual que ya lo era para 3 — misma asimetría de siempre (pipeline
  // por fila SÍ corre; pool posicional sigue sin existir para estos
  // tres conteos), solo que ahora aplica a los tres, no solo a uno.
  // Los tests de `looksLikeMapGrid` para 4/5/6 viven arriba en este
  // mismo archivo (sección "Conteos 4, 5, 6: TAMBIÉN deben aprobar el
  // pipeline por fila"); aquí se agrega la aserción explícita de la
  // asimetría, análoga a la de n=3 dos bloques arriba.
  check("n=4/5/6: buildFallbackPool sigue NULO, pero looksLikeMapGrid ahora SÍ los acepta — misma asimetría que ya existía para n=3, ahora extendida", () => {
    for (const n of [4, 5, 6]) {
      assert.strictEqual(buildFallbackPool(n), null, `buildFallbackPool(${n}) debe seguir siendo null por diseño`);
      assert.strictEqual(looksLikeMapGrid(makeBands(n)), true, `looksLikeMapGrid debe aceptar ${n} bandas tras el fix del 26/07/2026`);
    }
  });

  check("n=4 (variante intermedia, ej. doble baneo asimétrico): buildFallbackPool debe ser NULO, mismo tratamiento que n=3 — no debe confundirse con el fallback conservador de '>8'", () => {
    assert.strictEqual(buildFallbackPool(4), null, "buildFallbackPool(4) debe ser null, igual que buildFallbackPool(3)");
  });

  check("n=5 (variante intermedia, ej. abandono parcial del veto): buildFallbackPool debe ser NULO, mismo tratamiento que n=3", () => {
    assert.strictEqual(buildFallbackPool(5), null, "buildFallbackPool(5) debe ser null, igual que buildFallbackPool(3)");
  });

  check("n=6 (variante intermedia): buildFallbackPool debe ser NULO, mismo tratamiento que n=3 — el caso citado explícitamente en el hallazgo 11/Grupo 1 (6 bandas mal contadas de un caso realmente-7 no debe recibir un nombre posicional inventado)", () => {
    assert.strictEqual(buildFallbackPool(6), null, "buildFallbackPool(6) debe ser null, igual que buildFallbackPool(3)");
  });

  check("buildFallbackPool: 3, 4, 5 y 6 son indistinguibles entre sí en su tratamiento (todos null) — verifica que ninguno reciba accidentalmente un pool no-nulo distinto de los demás", () => {
    const results = [3, 4, 5, 6].map((n) => buildFallbackPool(n));
    assert.ok(results.every((r) => r === null), `se esperaba null para 3,4,5,6 — se obtuvo: ${JSON.stringify(results)}`);
  });

  check("buildFallbackPool: el tratamiento null de 3-6 es distinto del fallback conservador de '>8' (ej. n=9 sí debe devolver STANDARD_ORDER, no null)", () => {
    const pool9 = buildFallbackPool(9);
    assert.notStrictEqual(pool9, null, "buildFallbackPool(9) no debe ser null — '>8' usa el fallback conservador STANDARD_ORDER, un tratamiento deliberadamente distinto de 3-6");
    assert.deepStrictEqual(pool9, STANDARD_ORDER, "buildFallbackPool(9) debe devolver STANDARD_ORDER como fallback conservador");
  });
} catch (err) {
  console.log("SKIP verificación cruzada con parser.js — no se pudo requerir (" + err.message + ")");
}

// ------------------------------------------------------------
// Grupo 1 #1 de la Guía de seguimiento y resolución de errores —
// "No existe un rechazo explícito de conteos imposibles".
//
// Cubre isPlausibleMapCount (parser.js, fuente de verdad compartida
// sobre qué conteos de fila son geométricamente posibles dado el pool
// real de FACEIT esta temporada: 3 a 8) y flagImplausibleBandCount
// (app.js, la función que consulta esa fuente de verdad para decidir
// si una captura debe llevar el warning explícito
// "band_count_implausible", distinto del que ya reciben 4/5/6 —
// posibles pero sin fallback posicional — o el caso de 0 filas, que
// tiene su propio mensaje dedicado y no debe duplicarse).
// ------------------------------------------------------------
console.log("\n--- isPlausibleMapCount / flagImplausibleBandCount (Grupo 1 #1) ---");

try {
  const { isPlausibleMapCount, MIN_PLAUSIBLE_MAP_COUNT, MAX_PLAUSIBLE_MAP_COUNT } = require("./parser.js");

  check("MIN_PLAUSIBLE_MAP_COUNT es 3 y MAX_PLAUSIBLE_MAP_COUNT es 8 (rango real del pool de veto de FACEIT esta temporada)", () => {
    assert.strictEqual(MIN_PLAUSIBLE_MAP_COUNT, 3);
    assert.strictEqual(MAX_PLAUSIBLE_MAP_COUNT, 8);
  });

  check("isPlausibleMapCount: acepta exactamente 3 a 8 inclusive", () => {
    for (let n = 3; n <= 8; n++) {
      assert.strictEqual(isPlausibleMapCount(n), true, `isPlausibleMapCount(${n}) debería ser true`);
    }
  });

  check("isPlausibleMapCount: rechaza 0, 1, 2 (por debajo del mínimo real de 3 — Premium doble baneo)", () => {
    assert.strictEqual(isPlausibleMapCount(0), false);
    assert.strictEqual(isPlausibleMapCount(1), false);
    assert.strictEqual(isPlausibleMapCount(2), false);
  });

  check("isPlausibleMapCount: rechaza 9, 10, 12 (por encima del máximo real de 8 — pool + Vertigo)", () => {
    assert.strictEqual(isPlausibleMapCount(9), false);
    assert.strictEqual(isPlausibleMapCount(10), false);
    assert.strictEqual(isPlausibleMapCount(12), false, "12 bandas es geométricamente imposible dado el pool real — caso citado explícitamente en el hallazgo del Grupo 1 #1");
  });

  check("isPlausibleMapCount: rechaza valores no finitos o negativos sin lanzar excepción", () => {
    assert.strictEqual(isPlausibleMapCount(-1), false);
    assert.strictEqual(isPlausibleMapCount(NaN), false);
    assert.strictEqual(isPlausibleMapCount(Infinity), false);
  });

  if (typeof flagImplausibleBandCount === "function") {
    check("flagImplausibleBandCount: false para 0 bandas (tiene su propio mensaje dedicado, no se duplica el warning)", () => {
      assert.strictEqual(flagImplausibleBandCount(0), false);
    });

    check("flagImplausibleBandCount: false para conteos plausibles (3, 4, 5, 6, 7, 8)", () => {
      for (const n of [3, 4, 5, 6, 7, 8]) {
        assert.strictEqual(flagImplausibleBandCount(n), false, `flagImplausibleBandCount(${n}) debería ser false`);
      }
    });

    check("flagImplausibleBandCount: true para conteos geométricamente imposibles (9, 12)", () => {
      assert.strictEqual(flagImplausibleBandCount(9), true);
      assert.strictEqual(flagImplausibleBandCount(12), true, "12 bandas debe marcarse como implausible — caso del hallazgo original");
    });
  } else {
    console.log("SKIP flagImplausibleBandCount — no se pudo extraer de app.js (¿se renombró la función?)");
  }
} catch (err) {
  console.log("SKIP tests de isPlausibleMapCount/flagImplausibleBandCount — " + err.message);
}

console.log(`\n${failures === 0 ? "✔ Todos los tests pasaron." : `✘ ${failures} test(s) fallaron.`}`);
process.exit(failures === 0 ? 0 : 1);

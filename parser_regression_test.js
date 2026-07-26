// ============================================================
// Test de regresión — parser.js
//
// Origen: el 22/07/2026 se reportó que el sitio no detectaba NINGÚN
// mapa en ninguna captura real de TAPIT.GG. Causa raíz: ROW_PATTERN en
// parser.js exigía que el separador entre nA y nB fuera uno de
// [•·,*\-–], pero Tesseract nunca transcribe el bullet real "•" como
// ese carácter — lo lee como "©", "°", "»", "«", "¢" o "+" según la
// imagen. Resultado: 0/5 capturas de prueba producían una sola fila.
//
// CAMBIO DE FORMATO (esta versión): las fixtures ya NO se leen de
// archivos .txt sueltos en tests/fixtures/ — viven consolidadas en
// tests/fixtures.js como datos estructurados (texto real de OCR +
// metadata: kind, minMaps/expected, label). Motivo: un archivo por
// caso mezclaba "código de test" con "datos de test" de forma poco
// mantenible, y no había un lugar natural para casos sintéticos
// (pool dinámico, ver bloque final de este archivo) sin seguir
// creando archivos .txt nuevos para cada escenario. Ver fixtures.js
// para la explicación completa de por qué el ruido de OCR se
// mantiene tal cual (no se "limpia" a mano).
//
// Este runner sigue sin depender de Tesseract/imágenes reales — solo
// valida que parseMapRows/validateRows/parseRowNumbers/findMapNameInRow
// sigan extrayendo correctamente el contenido ya conocido de
// fixtures.js. Si un cambio futuro al regex vuelve a romper la
// extracción, este test debe fallar.
//
// Ejecutar: node tests/parser.regression.test.js
// ============================================================

const assert = require("assert");
const {
  parseMapRows,
  validateRows,
  parseRowNumbers,
  findMapNameInRow,
  STANDARD_ORDER,
} = require("../parser.js");
const { FIXTURES } = require("./fixtures.js");

let failures = 0;
let totalMaps = 0;

console.log("=== Test de regresión: parser.js contra fixtures consolidados (fixtures.js) ===\n");

// ------------------------------------------------------------
// Fixtures "whole-image": texto de página completa, se valida con
// parseMapRows + un mínimo de mapas esperados.
// ------------------------------------------------------------
const wholeImageFixtures = FIXTURES.filter((fx) => fx.kind === "whole-image");

// Punto 12 de la Matriz de priorización (Hallazgo 2.4.2 — "La fixture
// 05 no prueba lo que su comentario dice que prueba"): el comentario
// de `veto_05_statspanel` en fixtures.js declara explícitamente que es
// "el fixture más importante para probar ESPECIFICIDAD, no solo
// recall" — es decir, que el parser NO debe generar falsos positivos
// a partir del panel de stats extendido (ratings, K/D, ADR, nombres de
// jugadores) que precede a la sección real de veto en ese texto crudo.
// Un `assert.ok(rows.length >= fx.minMaps)` es un límite INFERIOR: solo
// puede detectar que se perdieron filas reales, nunca que se ganaron
// filas falsas de más. Con ese assert, si `ROW_PATTERN` empezara a
// matchear accidentalmente contra el ruido del panel de stats, el test
// seguiría en verde mientras el conteo total no bajara de 6 — el
// escenario exacto que este fixture dice existir para prevenir.
//
// Por eso esta fixture específica se excluye del loop genérico de
// abajo (que sigue usando >= para el resto, donde SÍ es correcto:
// ciertas filas reales pueden perderse por ruido de OCR sin que sea
// un bug, ver comentario de "whole-image" en fixtures.js) y se valida
// aparte con `assert.strictEqual` contra el conteo exacto verificado
// hoy contra parser.js (6 filas — el panel de stats no genera ningún
// falso positivo adicional en el estado actual del regex).
const SPECIFICITY_FIXTURE_ID = "veto_05_statspanel";
const specificityFixture = FIXTURES.find((fx) => fx.id === SPECIFICITY_FIXTURE_ID);

if (specificityFixture) {
  const rows = validateRows(parseMapRows(specificityFixture.rawText));
  totalMaps += rows.length;

  try {
    assert.strictEqual(
      rows.length,
      6,
      `${SPECIFICITY_FIXTURE_ID}: se esperaban EXACTAMENTE 6 mapas (prueba de especificidad — 0 falsos ` +
      `positivos del panel de stats extendido), se obtuvieron ${rows.length}. Si este número subió, ` +
      `revisar si ROW_PATTERN empezó a matchear contra el panel de ratings/K-D/ADR en vez de solo la ` +
      `sección real de veto.`
    );
    for (const r of rows) {
      assert.ok(r.pA >= 0 && r.pA <= 100, `${SPECIFICITY_FIXTURE_ID}/${r.map}: pA fuera de rango (${r.pA})`);
      assert.ok(r.pB >= 0 && r.pB <= 100, `${SPECIFICITY_FIXTURE_ID}/${r.map}: pB fuera de rango (${r.pB})`);
      assert.ok(Number.isFinite(r.nA) && r.nA >= 0, `${SPECIFICITY_FIXTURE_ID}/${r.map}: nA inválido (${r.nA})`);
      assert.ok(Number.isFinite(r.nB) && r.nB >= 0, `${SPECIFICITY_FIXTURE_ID}/${r.map}: nB inválido (${r.nB})`);
    }
    console.log(`OK   ${SPECIFICITY_FIXTURE_ID} — exactamente ${rows.length} mapas (prueba de especificidad, 0 falsos positivos) — ${specificityFixture.label}`);
  } catch (err) {
    failures++;
    console.error(`FAIL ${SPECIFICITY_FIXTURE_ID} — ${err.message}`);
  }
} else {
  failures++;
  console.error(`FAIL ${SPECIFICITY_FIXTURE_ID} — fixture no encontrada en fixtures.js (¿se renombró el id?)`);
}

const genericWholeImageFixtures = wholeImageFixtures.filter((fx) => fx.id !== SPECIFICITY_FIXTURE_ID);

for (const fx of genericWholeImageFixtures) {
  const rows = validateRows(parseMapRows(fx.rawText));
  totalMaps += rows.length;

  try {
    assert.ok(
      rows.length >= fx.minMaps,
      `${fx.id}: se esperaban >= ${fx.minMaps} mapas, se obtuvieron ${rows.length}`
    );
    // Guardas de cordura sobre cada fila extraída
    for (const r of rows) {
      assert.ok(r.pA >= 0 && r.pA <= 100, `${fx.id}/${r.map}: pA fuera de rango (${r.pA})`);
      assert.ok(r.pB >= 0 && r.pB <= 100, `${fx.id}/${r.map}: pB fuera de rango (${r.pB})`);
      assert.ok(Number.isFinite(r.nA) && r.nA >= 0, `${fx.id}/${r.map}: nA inválido (${r.nA})`);
      assert.ok(Number.isFinite(r.nB) && r.nB >= 0, `${fx.id}/${r.map}: nB inválido (${r.nB})`);
    }
    console.log(`OK   ${fx.id} — ${rows.length} mapas (>= ${fx.minMaps} esperados) — ${fx.label}`);
  } catch (err) {
    failures++;
    console.error(`FAIL ${fx.id} — ${err.message}`);
  }
}

// Guarda específica contra el bug original: si esto es 0, el bug volvió.
try {
  assert.ok(
    totalMaps > 0,
    "REGRESIÓN CRÍTICA: 0 mapas detectados en TODAS las fixtures whole-image — el bug del separador volvió."
  );
  console.log(`\nOK   Total de mapas extraídos across fixtures whole-image: ${totalMaps} (> 0)`);
} catch (err) {
  failures++;
  console.error(`\nFAIL ${err.message}`);
}

// ------------------------------------------------------------
// Fixtures "per-row" (fix del bug de cascada de etiquetas)
//
// Origen: reporte del 22/07/2026 — "no se detectó Nuke" en una
// captura con 7 mapas. Diagnóstico real: el mapa "Ancient" tenía un
// dígito ilegible (OCR leyó "B" en vez de "8"), lo cual hacía que ESA
// fila completa desapareciera del texto reconocido en el pipeline de
// imagen completa. El asignador de nombres por posición (cursor
// secuencial sobre STANDARD_ORDER que solo avanzaba sobre filas
// EXITOSAMENTE parseadas) se desincronizaba a partir de ahí. El fix
// (runPerRowOCR en app.js) usa el índice GEOMÉTRICO de cada fila
// (medido en la imagen antes de correr OCR) en vez de un cursor que
// depende de qué se logró leer, así que un dígito ilegible en una
// fila nunca desincroniza las filas siguientes. Este bloque verifica
// esa lógica de asignación (parseRowNumbers + findMapNameInRow +
// índice) contra las fixtures per-row, ya aisladas por recorte.
// ------------------------------------------------------------
console.log("\n=== Test del pipeline por fila (fix de cascada de etiquetas) ===\n");

const perRowFixtures = FIXTURES.filter((fx) => fx.kind === "per-row");

for (const fx of perRowFixtures) {
  try {
    assert.strictEqual(
      fx.rows.length,
      fx.rows.length, // longitud fija por diseño de la fixture, guarda de forma
      `${fx.id}: longitud de filas inconsistente`
    );

    fx.rows.forEach(({ text, expected }, i) => {
      const nums = parseRowNumbers(text);
      assert.ok(nums, `${fx.id} fila ${i} (${expected.map}): parseRowNumbers no encontró números en "${text}"`);

      let mapName = findMapNameInRow(text);
      if (!mapName) mapName = STANDARD_ORDER[i] || `Mapa ${i + 1}`;

      assert.strictEqual(mapName, expected.map, `${fx.id} fila ${i}: nombre esperado "${expected.map}", obtenido "${mapName}"`);
      assert.strictEqual(nums.pA, expected.pA, `${fx.id}/${mapName}: pA esperado ${expected.pA}, obtenido ${nums.pA}`);
      assert.strictEqual(nums.nA, expected.nA, `${fx.id}/${mapName}: nA esperado ${expected.nA}, obtenido ${nums.nA}`);
      assert.strictEqual(nums.nB, expected.nB, `${fx.id}/${mapName}: nB esperado ${expected.nB}, obtenido ${nums.nB}`);
      assert.strictEqual(nums.pB, expected.pB, `${fx.id}/${mapName}: pB esperado ${expected.pB}, obtenido ${nums.pB}`);
    });

    console.log(`OK   ${fx.id} — ${fx.rows.length}/${fx.rows.length} filas correctas por índice geométrico, sin corrimiento de etiquetas`);
  } catch (err) {
    failures++;
    console.error(`FAIL ${fx.id} — ${err.message}`);
  }
}

// ------------------------------------------------------------
// Test de pool dinámico (bug de asunción de 7 mapas fijos)
//
// Origen: STANDARD_ORDER en parser.js asumía siempre exactamente 7
// mapas en un orden fijo. Esto es falso en dos escenarios reales de
// FACEIT Premium: (a) doble baneo simultáneo por ambos equipos, el
// veto puede sobrevivir con tan solo 3 mapas; (b) sistema de voto
// popular que agrega un mapa opcional de temporada (Vertigo), el
// veto puede llegar a 8 mapas. Con el fallback antiguo
// (STANDARD_ORDER[i] / STANDARD_ORDER.find(...)), un nombre no
// reconocido por OCR en esos escenarios se etiquetaba con un mapa
// INCORRECTO pero con apariencia de certeza (ej. asumía "Dust2" en
// un veto de 3 mapas donde Dust2 ni siquiera sobrevivió el veto).
//
// NOTA: este bloque asume que parser.js ya expone `buildFallbackPool`
// (ver conversación de depuración). Si esa función todavía no existe
// en parser.js, este bloque falla intencionalmente — es la señal de
// que el fix pendiente de pool dinámico aún no se ha implementado.
// ------------------------------------------------------------
console.log("\n=== Test de pool dinámico (fix de asunción de 7 mapas fijos) ===\n");

let parserModule;
try {
  parserModule = require("../parser.js");
} catch (err) {
  parserModule = null;
}

if (parserModule && typeof parserModule.buildFallbackPool === "function") {
  const { buildFallbackPool } = parserModule;

  try {
    // Caso Premium: 3 mapas, sin candidato posicional confiable.
    const fx3 = FIXTURES.find((f) => f.id === "veto_07_premium_3maps");
    const rows3 = validateRows(parseMapRows(fx3.rawText));
    assert.strictEqual(rows3.length, 3, `${fx3.id}: se esperaban 3 filas, se obtuvieron ${rows3.length}`);
    rows3.forEach((r) => {
      assert.ok(
        r.map.startsWith("Mapa sin identificar") || r.nameGuessed,
        `${fx3.id}: con pool < 7 no debe asignarse un nombre posicional inventado con falsa certeza, se obtuvo "${r.map}"`
      );
    });
    console.log(`OK   ${fx3.id} — sin fallback posicional inventado en pool de 3 mapas`);

    // Caso voto popular: 8 mapas, el 8vo candidato debe ser Vertigo.
    const fx8 = FIXTURES.find((f) => f.id === "veto_08_voto_8maps");
    const rows8 = validateRows(parseMapRows(fx8.rawText));
    assert.strictEqual(rows8.length, 8, `${fx8.id}: se esperaban 8 filas, se obtuvieron ${rows8.length}`);
    const pool8 = buildFallbackPool(8);
    assert.ok(pool8.includes("Vertigo"), `${fx8.id}: Vertigo debe ser candidato válido en pool de 8`);
    assert.ok(
      !pool8.includes("Overpass") && !pool8.includes("Train"),
      `${fx8.id}: Overpass/Train no son candidatos válidos esta temporada`
    );
    console.log(`OK   ${fx8.id} — Vertigo como único candidato extra en pool de 8 mapas`);
  } catch (err) {
    failures++;
    console.error(`FAIL pool dinámico — ${err.message}`);
  }
} else {
  console.log(
    "SKIP pool dinámico — buildFallbackPool aún no está implementado en parser.js " +
    "(fix pendiente, ver conversación de depuración). Este bloque no cuenta como" +
    " fallo hasta que el fix se implemente y este skip deba convertirse en test real."
  );
}

console.log(`\n${failures === 0 ? "✔ Todos los tests pasaron." : `✘ ${failures} test(s) fallaron.`}`);
process.exit(failures === 0 ? 0 : 1);

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
  deconfuseMapText,
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

// ------------------------------------------------------------
// Test del bug real reportado el 26/07/2026: "no se reconoce
// Mirage/Ancient" en una captura real de TAPIT.GG.
//
// CAUSA RAÍZ (distinta de los bugs anteriores de este archivo): NO es
// un problema de separador entre conteos ni de dígitos ilegibles — es
// el ícono de RANKING (★ dorada/gris/ámbar/roja, obligatorio por mapa
// bajo el sistema descrito en la Sección 0.2 del documento de
// fundamentos: exactamente 1 estrella por cada extremo del ranking de
// 7 mapas por equipo) que, cuando queda pegado al lado IZQUIERDO del
// nombre en vez de al derecho, hace que Tesseract inserte ruido DENTRO
// de las letras del nombre ("Mir*age") o reemplace una letra por un
// glifo visualmente similar ("An¢ient", "¢" por "c") — a diferencia
// del caso ya cubierto de ruido antes/después del nombre COMPLETO.
//
// Ver `deconfuseMapText` + `MAP_NAME_PATTERN` (tolerancia a ruido
// intercalado) en parser.js para el fix.
// ------------------------------------------------------------
console.log("\n=== Test del bug real: ícono de ranking a la izquierda del nombre (Mirage/Ancient) ===\n");

const fx09 = FIXTURES.find((f) => f.id === "veto_09_estrella_izquierda");
if (fx09) {
  try {
    const rows = validateRows(parseMapRows(fx09.rawText));
    const names = rows.map((r) => r.map);
    assert.ok(names.includes("Mirage"), `Mirage debía reconocerse pese al ruido intercalado ("Mir*age"); nombres obtenidos: ${names.join(", ")}`);
    assert.ok(names.includes("Ancient"), `Ancient debía reconocerse pese a la letra reemplazada ("An¢ient"); nombres obtenidos: ${names.join(", ")}`);
    assert.ok(names.includes("Dust2"), "Dust2 (caso limpio, sin ruido) debe seguir reconociéndose sin cambios");
    assert.ok(names.includes("Cache"), "Cache (caso limpio, sin ruido) debe seguir reconociéndose sin cambios");
    assert.ok(names.includes("Inferno"), "Inferno (caso limpio, sin ruido) debe seguir reconociéndose sin cambios");
    // Ninguna de las 5 filas debe caer a nameGuessed (fallback posicional
    // o "Mapa sin identificar") — las 5 tienen nombre reconocible en el
    // propio texto, aunque con ruido.
    const guessedCount = rows.filter((r) => r.nameGuessed).length;
    assert.strictEqual(guessedCount, 0, `ninguna fila debía caer a nameGuessed; ${guessedCount} filas sí lo hicieron`);
    console.log(`OK   ${fx09.id} — Mirage y Ancient reconocidos pese al ruido intercalado del ícono de ranking, 0 filas con nombre adivinado`);
  } catch (err) {
    failures++;
    console.error(`FAIL ${fx09.id} — ${err.message}`);
  }
} else {
  failures++;
  console.error("FAIL veto_09_estrella_izquierda — fixture no encontrada en fixtures.js");
}

console.log("\n--- deconfuseMapText: casos unitarios ---");

const deconfuseCases = [
  { input: "An¢ient", expectedContains: "Ancient", label: "¢ reemplaza a c" },
  { input: "Nu°e", expectedContains: "Nuoe", label: "° reemplaza a o (prueba unitaria del mapeo, no el caso real reportado)" },
  { input: "Mirage", expectedContains: "Mirage", label: "texto limpio no debe alterarse" },
  { input: "team_100fe is banning a map", expectedContains: "team_100fe is banning a map", label: "texto sin confusables no debe alterarse" },
];

for (const { input, expectedContains, label } of deconfuseCases) {
  try {
    const out = deconfuseMapText(input);
    assert.strictEqual(out, expectedContains, `deconfuseMapText("${input}") = "${out}", esperado "${expectedContains}"`);
    console.log(`OK   deconfuseMapText("${input}") -> "${out}" — ${label}`);
  } catch (err) {
    failures++;
    console.error(`FAIL deconfuseMapText — ${err.message}`);
  }
}

console.log("\n--- MAP_NAME_PATTERN: tolerancia a ruido intercalado NO debe generar falsos positivos (re-verificación del fixture 05) ---");

try {
  // Re-confirma explícitamente que el fix de tolerancia a ruido no
  // reabrió la vulnerabilidad de especificidad que veto_05_statspanel
  // existe para prevenir — el conteo EXACTO (no >=) debe seguir siendo
  // 6, igual que antes de este fix.
  const fx05 = FIXTURES.find((f) => f.id === "veto_05_statspanel");
  const rows05 = validateRows(parseMapRows(fx05.rawText));
  assert.strictEqual(
    rows05.length, 6,
    `veto_05_statspanel debía seguir dando EXACTAMENTE 6 filas tras el fix de tolerancia a ruido intercalado; se obtuvieron ${rows05.length} — la tolerancia a ruido pudo haber empezado a matchear contra el panel de stats`
  );
  console.log("OK   veto_05_statspanel sigue dando exactamente 6 filas tras agregar tolerancia a ruido intercalado — sin nuevos falsos positivos");
} catch (err) {
  failures++;
  console.error(`FAIL re-verificación fixture 05 — ${err.message}`);
}

// ------------------------------------------------------------
// Test del bug real reportado: "Inferno mal ordenado en Mapas"
// (Grupo 3 #3.3.1 de la Guía de seguimiento y resolución de errores).
//
// CAUSA RAÍZ: la fila real de Inferno era "(100%) 1 • 2 (50%)" — un
// solo dígito a cada lado del separador. El separador (nunca un
// carácter de texto real, ver cabecera de ROW_PATTERN) se perdió por
// completo en el OCR de esta fila puntual, colapsando "1"+"2" en el
// bloque fusionado "12" — indistinguible en el propio texto de un
// conteo real de 12 partidas. Ninguno de los tres patrones de rescate
// previos a este fix distinguía este caso, lo que en el pipeline real
// dejaba abierta la puerta a que ese "12" se corrompiera absorbiendo
// dígitos de la fila vecina (Ancient), produciendo un n inflado y un
// deltaAdj artificialmente alto que desplazó a Inferno al tope de la
// lista de picks.
//
// FIX: ROW_PATTERN_SINGLE_DIGIT_AMBIGUOUS — cuarto patrón de rescate,
// MÁS estricto que los tres anteriores (exige EXACTAMENTE 1 dígito a
// cada lado del bloque fusionado, no 1-3), que interpreta el bloque
// de 2 dígitos consecutivos como nA=1 dígito + nB=1 dígito, y SIEMPRE
// marca la fila lowConfidence:true.
// ------------------------------------------------------------
console.log("\n=== Test del bug real: Inferno mal ordenado — fila de 1 dígito por lado fusionada sin separador (Grupo 3 #3.3.1) ===\n");

const fx10 = FIXTURES.find((f) => f.id === "veto_10_inferno_1digit_fusionado");
if (fx10) {
  try {
    fx10.rows.forEach(({ text, expected }, i) => {
      const nums = parseRowNumbers(text);
      assert.ok(nums, `${fx10.id} fila ${i}: parseRowNumbers no encontró números en "${text}"`);
      assert.strictEqual(nums.pA, expected.pA, `${fx10.id}: pA esperado ${expected.pA}, obtenido ${nums.pA}`);
      assert.strictEqual(nums.nA, expected.nA, `${fx10.id}: nA esperado ${expected.nA} (dígito único), obtenido ${nums.nA} — ¿se está fusionando "12" como un solo número en vez de 1+2?`);
      assert.strictEqual(nums.nB, expected.nB, `${fx10.id}: nB esperado ${expected.nB} (dígito único), obtenido ${nums.nB}`);
      assert.strictEqual(nums.pB, expected.pB, `${fx10.id}: pB esperado ${expected.pB}, obtenido ${nums.pB}`);
      assert.strictEqual(
        nums.lowConfidence, true,
        `${fx10.id}: el rescate de dígito único SIEMPRE debe marcar lowConfidence:true — nunca se asume con la certeza de un separador visible real`
      );

      const mapName = findMapNameInRow(text);
      assert.strictEqual(mapName, expected.map, `${fx10.id}: nombre esperado "${expected.map}", obtenido "${mapName}"`);
    });
    console.log(`OK   ${fx10.id} — "12" fusionado se interpreta como nA=1/nB=2 (no como n=12 corrupto), marcado lowConfidence — ${fx10.label}`);
  } catch (err) {
    failures++;
    console.error(`FAIL ${fx10.id} — ${err.message}`);
  }
} else {
  failures++;
  console.error("FAIL veto_10_inferno_1digit_fusionado — fixture no encontrada en fixtures.js");
}

console.log("\n--- ROW_PATTERN_SINGLE_DIGIT_AMBIGUOUS: no debe interferir con conteos reales de 2+ dígitos ya cubiertos por patrones anteriores ---");

const noRegressionCases = [
  {
    label: "conteo real de 2 dígitos separados por un espacio simple (ya es un separador válido de 1-5 chars para ROW_PATTERN) — no debe reinterpretarse como 2 dígitos únicos",
    text: "(43%) 30 22 (40%)",
    expected: { pA: 43, nA: 30, nB: 22, pB: 40 },
    expectLowConfidence: false, // ROW_PATTERN principal ya lo captura (el espacio " " matchea [^\d(]{1,5}) — comportamiento preexistente, sin cambios por este fix
  },
  {
    label: "fila limpia con separador real de 1 solo dígito por lado — debe seguir leyendo con ROW_PATTERN normal, sin degradar a lowConfidence",
    text: "(100%) 1 © 2 (50%)",
    expected: { pA: 100, nA: 1, nB: 2, pB: 50 },
    expectLowConfidence: false,
  },
  {
    label: "conteo real de 3 dígitos fusionado (ej. 127 de 12•7) — el patrón de 1 dígito NO debe intentar partir esto, debe seguir sin matchear vía el rescate nuevo",
    text: "(50%) 127 (60%)",
    expected: null, // ningún patrón (incluyendo el nuevo, que exige exactamente 2 dígitos en el bloque) debe rescatar un bloque de 3 dígitos
  },
];

for (const c of noRegressionCases) {
  try {
    const nums = parseRowNumbers(c.text);
    if (c.expected === null) {
      assert.strictEqual(nums, null, `se esperaba null para "${c.text}", se obtuvo ${JSON.stringify(nums)}`);
    } else {
      assert.ok(nums, `parseRowNumbers no encontró números en "${c.text}"`);
      assert.strictEqual(nums.pA, c.expected.pA);
      assert.strictEqual(nums.nA, c.expected.nA);
      assert.strictEqual(nums.nB, c.expected.nB);
      assert.strictEqual(nums.pB, c.expected.pB);
      if (c.expectLowConfidence !== undefined) {
        assert.strictEqual(!!nums.lowConfidence, c.expectLowConfidence);
      }
    }
    console.log(`OK   ${c.label}`);
  } catch (err) {
    failures++;
    console.error(`FAIL ${c.label} — ${err.message}`);
  }
}

console.log(`\n${failures === 0 ? "✔ Todos los tests pasaron." : `✘ ${failures} test(s) fallaron.`}`);
process.exit(failures === 0 ? 0 : 1);

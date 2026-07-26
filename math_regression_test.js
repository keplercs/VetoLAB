// ============================================================
// Test de regresión — math.js
//
// Origen: punto 4 de la Matriz de priorización (Revisión Técnica
// VetoLAB, hallazgo 2.4.1 — "Cero tests para math.js"). math.js es
// el módulo que produce el número final que el usuario usa para
// decidir qué banear/pickear, y hasta ahora no tenía ninguna
// cobertura de test, a diferencia de parser.js. Este archivo cierra
// esa brecha con la cobertura mínima recomendada en la revisión:
//
//   - wilsonInterval contra casos de referencia conocidos.
//   - shrinkageEstimate en los límites (n=0 -> mu0; n grande -> p̂).
//   - differenceIsSignificant (Newcombe, tras el fix del punto 7) con
//     un caso claramente significativo y uno claramente no
//     significativo, más el caso específico que motivó el fix
//     (pA=40%/pB=60%, n=15 en ambos lados — ver comentario de
//     `overlapFraction` en math.js).
//   - Los 4 puntos de corte de analyzeMap.reliability (empate /
//     incierto / marginal / confiable), con inputs diseñados para
//     caer en cada régimen.
//   - rankForBan/rankForPick: el orden de salida debe coincidir
//     exactamente con |deltaAdj| descendente — el bug que motivó el
//     rediseño reciente documentado en el propio math.js.
//
// Ejecutar: node tests/math_regression_test.js
// ============================================================

const assert = require("assert");
const {
  wilsonInterval,
  shrinkageEstimate,
  differenceIsSignificant,
  analyzeMap,
  rankForBan,
  rankForPick,
} = require("../math.js");

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

// Tolerancia para comparaciones de punto flotante en este archivo.
function approx(actual, expected, tol, label) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label}: esperado ≈${expected} (±${tol}), obtenido ${actual}`
  );
}

console.log("=== Test de regresión: math.js (núcleo estadístico) ===\n");

// ------------------------------------------------------------
// 1. wilsonInterval — casos de referencia
// ------------------------------------------------------------
console.log("--- wilsonInterval ---");

check("wilsonInterval: n=0 devuelve intervalo abierto [0,1] centrado en 0.5", () => {
  const w = wilsonInterval(0, 0);
  assert.strictEqual(w.p, 0.5);
  assert.strictEqual(w.low, 0);
  assert.strictEqual(w.high, 1);
  assert.strictEqual(w.n, 0);
});

check("wilsonInterval: caso de libro de texto 8/10 — valor verificado por cálculo independiente", () => {
  // 8 éxitos de 10 -> Wilson 95% = [0.4902, 0.9433], verificado
  // recalculando la fórmula cerrada de forma independiente (fuera de
  // math.js) con z=1.959963985. Este es el valor correcto para Wilson
  // al 95% (distinto del intervalo de Clopper-Pearson "exacto", que da
  // límites más amplios — no confundir ambos métodos).
  const w = wilsonInterval(8, 10);
  approx(w.p, 0.8, 1e-9, "p̂");
  approx(w.low, 0.4902, 0.001, "límite inferior");
  approx(w.high, 0.9433, 0.001, "límite superior");
});

check("wilsonInterval: caso simétrico 5/10 — intervalo centrado en 0.5", () => {
  const w = wilsonInterval(5, 10);
  approx(w.p, 0.5, 1e-9, "p̂");
  // Con p̂=0.5, el centro ajustado de Wilson también es 0.5 (simetría).
  const mid = (w.low + w.high) / 2;
  approx(mid, 0.5, 1e-6, "punto medio del intervalo");
  assert.ok(w.low > 0.2 && w.low < 0.25, `límite inferior fuera de rango esperado: ${w.low}`);
});

check("wilsonInterval: siempre queda contenido en [0,1] incluso en extremos (0/n, n/n)", () => {
  const wLow = wilsonInterval(0, 5);
  const wHigh = wilsonInterval(5, 5);
  assert.ok(wLow.low >= 0 && wLow.high <= 1, "0/5 fuera de [0,1]");
  assert.ok(wHigh.low >= 0 && wHigh.high <= 1, "5/5 fuera de [0,1]");
  assert.ok(wLow.low === 0, "0/5 debería tener low=0 pero high>0 (a diferencia de Wald)");
  assert.ok(wHigh.high === 1, "5/5 debería tener high=1");
});

check("wilsonInterval: mayor n produce intervalo más angosto para el mismo p̂", () => {
  const narrow = wilsonInterval(30, 60); // p̂=0.5, n=60
  const wide = wilsonInterval(5, 10); // p̂=0.5, n=10
  const widthNarrow = narrow.high - narrow.low;
  const widthWide = wide.high - wide.low;
  assert.ok(widthNarrow < widthWide, `n=60 (${widthNarrow}) debería ser más angosto que n=10 (${widthWide})`);
});

// ------------------------------------------------------------
// 2. shrinkageEstimate — comportamiento en los límites
// ------------------------------------------------------------
console.log("\n--- shrinkageEstimate ---");

check("shrinkageEstimate: n=0 devuelve exactamente mu0 (sin evidencia, el prior domina por completo)", () => {
  const adj = shrinkageEstimate(0.9, 0, 12, 0.5);
  assert.strictEqual(adj, 0.5);
});

check("shrinkageEstimate: n muy grande converge a p̂ (la evidencia domina sobre el prior)", () => {
  const adj = shrinkageEstimate(0.8, 100000, 12, 0.5);
  approx(adj, 0.8, 0.001, "shrinkage con n=100000");
});

check("shrinkageEstimate: n=k, mu0=0.5 -> el ajuste es el punto medio exacto entre p̂ y mu0", () => {
  // (n*p̂ + k*mu0)/(n+k) con n=k se reduce a (p̂+mu0)/2
  const adj = shrinkageEstimate(0.9, 12, 12, 0.5);
  approx(adj, 0.7, 1e-9, "punto medio 0.9 y 0.5");
});

check("shrinkageEstimate: monotonía — más partidas con el mismo p̂ acerca el ajuste al p̂ crudo", () => {
  const low_n = shrinkageEstimate(0.9, 5, 12, 0.5);
  const high_n = shrinkageEstimate(0.9, 50, 12, 0.5);
  assert.ok(high_n > low_n, `n=50 (${high_n}) debería estar más cerca de 0.9 que n=5 (${low_n})`);
  assert.ok(high_n < 0.9, "no debe superar p̂ crudo (contracción, no amplificación)");
});

// ------------------------------------------------------------
// 3. differenceIsSignificant — intervalo híbrido de Newcombe
//    (punto 7: reemplaza al test tipo Wald anterior)
// ------------------------------------------------------------
console.log("\n--- differenceIsSignificant (Newcombe) ---");

check("differenceIsSignificant: diferencia grande con muestras razonables es significativa", () => {
  // 80% (n=50) vs 40% (n=50): diferencia de 40 puntos, muestras
  // decentes -> debe ser claramente distinguible de cero.
  const d = differenceIsSignificant(0.8, 50, 0.4, 50);
  assert.strictEqual(d.significant, true, `esperado significativo, low=${d.low} high=${d.high}`);
  assert.ok(d.low > 0, "el intervalo completo debe quedar por encima de 0");
});

check("differenceIsSignificant: diferencia pequeña con muestras chicas NO es significativa", () => {
  // 52% (n=8) vs 48% (n=8): diferencia mínima, muestra muy chica ->
  // el ruido domina, no debe ser distinguible de cero.
  const d = differenceIsSignificant(0.52, 8, 0.48, 8);
  assert.strictEqual(d.significant, false, `esperado NO significativo, low=${d.low} high=${d.high}`);
  assert.ok(d.low < 0 && d.high > 0, "el intervalo debe contener el cero");
});

check("differenceIsSignificant: 40%(n=15) vs 60%(n=15) — 20 puntos de diferencia, muestra chica: Newcombe es conservador y correctamente NO la marca significativa", () => {
  // Este caso aparece en el comentario de `overlapFraction` en math.js
  // como ejemplo de que el SOLAPAMIENTO VISUAL crudo de intervalos es
  // una heurística engañosa (Krzywinski & Altman 2013). Eso no implica
  // que Newcombe deba declarar esta diferencia "significativa": con
  // n=15 de cada lado, los intervalos de Wilson individuales son
  // amplios (≈0.20–0.64 y ≈0.36–0.80) y se solapan sustancialmente en
  // términos reales, no solo aparentes — 20 puntos de diferencia con
  // esa muestra sigue siendo compatible con ruido. Newcombe, al
  // heredar la cobertura de Wilson, es intencionalmente conservador
  // aquí (a diferencia de un test tipo Wald más laxo con n pequeño).
  // Verificado con cálculo independiente: low=-0.485, high=+0.143 —
  // el intervalo contiene el cero.
  const d = differenceIsSignificant(0.40, 15, 0.60, 15);
  assert.strictEqual(d.significant, false, `esperado NO significativo con n=15, low=${d.low} high=${d.high}`);
  assert.ok(d.low < 0 && d.high > 0, "el intervalo debe contener el cero con esta muestra chica");
});

check("differenceIsSignificant: la MISMA diferencia de 20 puntos (40% vs 60%) SÍ se vuelve significativa al crecer la muestra a n=80", () => {
  // Complemento del caso anterior: mismo delta exacto, más evidencia.
  // Esto es lo que realmente demuestra que Newcombe funciona como se
  // espera — no que cualquier diferencia de 20 puntos deba marcarse
  // significativa sin importar n (eso sería precisamente el error de
  // razonamiento que Gelman & Stern [20] y Krzywinski & Altman [21]
  // señalan), sino que la significancia depende correctamente de la
  // combinación magnitud + tamaño de muestra.
  const d15 = differenceIsSignificant(0.40, 15, 0.60, 15);
  const d80 = differenceIsSignificant(0.40, 80, 0.60, 80);
  assert.strictEqual(d15.significant, false, "n=15 no debe ser significativo");
  assert.strictEqual(d80.significant, true, `n=80 debe ser significativo, low=${d80.low} high=${d80.high}`);
});

check("differenceIsSignificant: nA=0 o nB=0 nunca es significativo (sin evidencia de un lado)", () => {
  const d1 = differenceIsSignificant(0.9, 0, 0.1, 10);
  const d2 = differenceIsSignificant(0.9, 10, 0.1, 0);
  assert.strictEqual(d1.significant, false);
  assert.strictEqual(d2.significant, false);
});

check("differenceIsSignificant: pA===pB con n idénticos da intervalo degenerado centrado en 0, no significativo", () => {
  const d = differenceIsSignificant(0.5, 20, 0.5, 20);
  approx(d.delta, 0, 1e-9, "delta debe ser exactamente 0");
  assert.strictEqual(d.significant, false);
});

check("differenceIsSignificant: el signo de low/high es consistente con el signo de delta", () => {
  const dPos = differenceIsSignificant(0.9, 40, 0.3, 40);
  const dNeg = differenceIsSignificant(0.3, 40, 0.9, 40);
  assert.ok(dPos.delta > 0 && dPos.low > 0, "delta positivo grande -> low > 0");
  assert.ok(dNeg.delta < 0 && dNeg.high < 0, "delta negativo grande -> high < 0");
});

// ------------------------------------------------------------
// 4. analyzeMap.reliability — los 4 regímenes de clasificación
// ------------------------------------------------------------
console.log("\n--- analyzeMap: umbrales de reliability ---");

check("reliability: empate-estadistico cuando la diferencia no es distinguible de cero", () => {
  const a = analyzeMap({ map: "Test", pA: 51, nA: 10, pB: 49, nB: 10 });
  assert.strictEqual(a.reliability, "empate-estadistico");
});

check("reliability: incierto cuando la diferencia es significativa pero algún IC95 es muy ancho", () => {
  // Diferencia grande y consistente, pero n bajo en ambos lados ->
  // intervalos de Wilson anchos (>WIDE_INTERVAL_THRESHOLD=0.35).
  const a = analyzeMap({ map: "Test", pA: 90, nA: 6, pB: 20, nB: 6 });
  assert.strictEqual(a.reliability, "incierto", `reliability obtenido: ${a.reliability}`);
});

check("reliability: marginal cuando es significativa, con IC95 angosto, pero |deltaAdj| < 0.03", () => {
  // El régimen "marginal" exige simultáneamente: (a) diferencia
  // distinguible de cero bajo Newcombe, (b) IC95 angosto en ambos
  // lados (< WIDE_INTERVAL_THRESHOLD=0.35), y (c) |deltaAdj| < 0.03.
  // Con un delta crudo tan chico (3 puntos: 51.5% vs 48.5%), (a)
  // requiere n considerablemente grande — con n=5000 por lado el
  // intervalo de Newcombe ya no contiene el cero, y el shrinkage
  // (k=12) apenas mueve deltaAdj respecto al crudo porque n>>k.
  // Verificado empíricamente contra la propia implementación: n=1000
  // y n=2000 aún caen en empate-estadistico (no alcanza (a)); desde
  // n≈3000 en adelante se estabiliza en marginal.
  const a = analyzeMap({ map: "Test", pA: 51.5, nA: 5000, pB: 48.5, nB: 5000 });
  assert.strictEqual(a.reliability, "marginal", `reliability obtenido: ${a.reliability}, deltaAdj=${a.deltaAdj}, sig=${a.diffTest.significant}`);
  assert.ok(Math.abs(a.deltaAdj) < 0.03, "deltaAdj debe quedar por debajo del umbral de 3 puntos");
});

check("reliability: confiable cuando es significativa, IC95 angosto, y |deltaAdj| >= 0.03", () => {
  const a = analyzeMap({ map: "Test", pA: 75, nA: 80, pB: 35, nB: 80 });
  assert.strictEqual(a.reliability, "confiable", `reliability obtenido: ${a.reliability}, deltaAdj=${a.deltaAdj}`);
});

// ------------------------------------------------------------
// 5. rankForBan / rankForPick — orden exacto por |deltaAdj|
//    (bug que motivó el rediseño reciente: el orden no debe volver a
//    divergir del número que efectivamente se le muestra al usuario)
// ------------------------------------------------------------
console.log("\n--- rankForBan / rankForPick: orden por |deltaAdj| ---");

check("rankForBan: ordena de mayor a menor |deltaAdj| entre las desventajas del lado activo", () => {
  const maps = [
    analyzeMap({ map: "MapaA", pA: 30, nA: 80, pB: 70, nB: 80 }), // deltaAdj muy negativo
    analyzeMap({ map: "MapaB", pA: 45, nA: 80, pB: 55, nB: 80 }), // deltaAdj levemente negativo
    analyzeMap({ map: "MapaC", pA: 70, nA: 80, pB: 30, nB: 80 }), // deltaAdj positivo (no debe entrar)
  ];
  const banked = rankForBan(maps, 1);
  assert.strictEqual(banked.length, 2, "solo MapaA y MapaB tienen deltaAdj negativo (perspectiva 1)");
  assert.strictEqual(banked[0].map, "MapaA", "MapaA (mayor |deltaAdj|) debe ir primero");
  assert.strictEqual(banked[1].map, "MapaB");
  // Verificación explícita de monotonía descendente en |deltaAdj|.
  for (let i = 1; i < banked.length; i++) {
    assert.ok(
      Math.abs(banked[i - 1].deltaAdj) >= Math.abs(banked[i].deltaAdj),
      `orden roto entre ${banked[i - 1].map} y ${banked[i].map}`
    );
  }
});

check("rankForPick: ordena de mayor a menor |deltaAdj| entre las ventajas del lado activo", () => {
  const maps = [
    analyzeMap({ map: "MapaX", pA: 70, nA: 80, pB: 30, nB: 80 }), // deltaAdj muy positivo
    analyzeMap({ map: "MapaY", pA: 55, nA: 80, pB: 45, nB: 80 }), // deltaAdj levemente positivo
    analyzeMap({ map: "MapaZ", pA: 30, nA: 80, pB: 70, nB: 80 }), // negativo (no debe entrar)
  ];
  const picked = rankForPick(maps, 1);
  assert.strictEqual(picked.length, 2);
  assert.strictEqual(picked[0].map, "MapaX", "MapaX (mayor |deltaAdj|) debe ir primero");
  assert.strictEqual(picked[1].map, "MapaY");
});

check("rankForBan/rankForPick: el orden mostrado nunca contradice |deltaAdj| aun con valores muy cercanos (caso +9.5% vs +10.9% citado en el comentario del código)", () => {
  const maps = [
    analyzeMap({ map: "Cercano9", pA: 59.5, nA: 200, pB: 50, nB: 200 }),
    analyzeMap({ map: "Cercano11", pA: 60.9, nA: 200, pB: 50, nB: 200 }),
  ];
  const picked = rankForPick(maps, 1);
  assert.strictEqual(
    picked[0].map, "Cercano11",
    `el mapa con mayor |deltaAdj| debe listarse primero; orden obtenido: ${picked.map((p) => p.map).join(", ")}`
  );
});

check("perspectiva invertida (-1) intercambia qué lista (ban/pick) recibe cada mapa", () => {
  const maps = [analyzeMap({ map: "MapaA", pA: 30, nA: 80, pB: 70, nB: 80 })]; // deltaAdj negativo desde A
  const bannedFromA = rankForBan(maps, 1);
  const pickedFromB = rankForPick(maps, -1);
  assert.strictEqual(bannedFromA.length, 1, "desde la perspectiva A, este mapa es para banear");
  assert.strictEqual(pickedFromB.length, 1, "desde la perspectiva B, el mismo mapa es para reservar/pick");
});

console.log(`\n${failures === 0 ? "✔ Todos los tests pasaron." : `✘ ${failures} test(s) fallaron.`}`);
process.exit(failures === 0 ? 0 : 1);

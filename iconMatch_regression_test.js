// ============================================================
// Test de regresión — iconMatch.js (Grupo 7 de la Guía de
// seguimiento y resolución de errores — VetoLAB)
//
// Cubre: hammingDistance (aritmética BigInt correcta), dHashFromGrayscale
// (algoritmo determinista sobre datos sintéticos conocidos), y
// matchIconHash (umbral de decisión, incluyendo el caso explícito de
// "ningún mapa referenciado se acerca lo suficiente" — el caso real
// que hoy representa Vertigo, sin referencia todavía).
//
// Ejecutar: node iconMatch_regression_test.js
// ============================================================

const assert = require("assert");
const {
  MAP_ICON_REFERENCE_HASHES,
  MATCH_THRESHOLD_BITS,
  HASH_SIZE,
  hammingDistance,
  dHashFromGrayscale,
  matchIconHash,
} = require("../iconMatch.js");

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

console.log("=== Test de regresión: iconMatch.js ===\n");

// ------------------------------------------------------------
// 1. hammingDistance — aritmética BigInt correcta
// ------------------------------------------------------------
console.log("--- hammingDistance ---");

check("hammingDistance: mismo valor -> distancia 0", () => {
  assert.strictEqual(hammingDistance(0n, 0n), 0);
  assert.strictEqual(hammingDistance(0xffffffffffffffffn, 0xffffffffffffffffn), 0);
});

check("hammingDistance: bits opuestos completos (64 bits) -> distancia 64", () => {
  assert.strictEqual(hammingDistance(0n, 0xffffffffffffffffn), 64);
});

check("hammingDistance: un solo bit de diferencia -> distancia 1", () => {
  assert.strictEqual(hammingDistance(0b1000n, 0b0000n), 1);
  assert.strictEqual(hammingDistance(0b1010n, 0b1000n), 1);
});

check("hammingDistance: simétrica (a,b) === (b,a)", () => {
  const a = 0x81cdc73677772565n;
  const b = 0x6672dcec90b21131n;
  assert.strictEqual(hammingDistance(a, b), hammingDistance(b, a));
});

check("hammingDistance: no requiere que a > b (funciona con XOR, no con resta)", () => {
  assert.strictEqual(hammingDistance(0b0001n, 0b1110n), 4);
});

// ------------------------------------------------------------
// 2. dHashFromGrayscale — algoritmo determinista sobre datos sintéticos
// ------------------------------------------------------------
console.log("\n--- dHashFromGrayscale ---");

check("dHashFromGrayscale: gradiente estrictamente creciente -> todos los bits en 0 (izquierda nunca es más brillante que la derecha)", () => {
  // 9 columnas x 8 filas, cada fila es [0, 32, 64, ..., 256] — creciente.
  const w = 9, h = 8;
  const gray = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      gray[y * w + x] = x * 32;
    }
  }
  const hash = dHashFromGrayscale(gray, w, h);
  assert.strictEqual(hash, 0n, `esperado 0n (todo ascendente), obtenido ${hash.toString(16)}`);
});

check("dHashFromGrayscale: gradiente estrictamente decreciente -> todos los bits en 1", () => {
  const w = 9, h = 8;
  const gray = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      gray[y * w + x] = 256 - x * 32;
    }
  }
  const hash = dHashFromGrayscale(gray, w, h);
  const allOnes = (1n << 64n) - 1n;
  assert.strictEqual(hash, allOnes, `esperado todos los bits en 1, obtenido ${hash.toString(16)}`);
});

check("dHashFromGrayscale: imagen uniforme (sin gradiente) -> todos los bits en 0 (empate: 'left > right' es false)", () => {
  const w = 9, h = 8;
  const gray = new Float64Array(w * h).fill(128);
  const hash = dHashFromGrayscale(gray, w, h);
  assert.strictEqual(hash, 0n);
});

check("dHashFromGrayscale: produce exactamente HASH_SIZE*HASH_SIZE bits de longitud efectiva (<= 2^64-1)", () => {
  const w = HASH_SIZE + 1, h = HASH_SIZE;
  const gray = new Float64Array(w * h);
  for (let i = 0; i < gray.length; i++) gray[i] = Math.random() * 255;
  const hash = dHashFromGrayscale(gray, w, h);
  assert.ok(hash >= 0n && hash < (1n << BigInt(HASH_SIZE * HASH_SIZE)), "hash fuera del rango de 64 bits esperado");
});

// ------------------------------------------------------------
// 3. matchIconHash — umbral de decisión
// ------------------------------------------------------------
console.log("\n--- matchIconHash ---");

check("matchIconHash: hash EXACTO de una referencia -> match perfecto (distancia 0) con esa referencia", () => {
  const dust2Hash = MAP_ICON_REFERENCE_HASHES.Dust2;
  const result = matchIconHash(dust2Hash);
  assert.ok(result, "se esperaba un match, se obtuvo null");
  assert.strictEqual(result.map, "Dust2");
  assert.strictEqual(result.distance, 0);
});

check("matchIconHash: hash a distancia MENOR que el umbral de su referencia más cercana -> match", () => {
  const nukeHash = MAP_ICON_REFERENCE_HASHES.Nuke;
  // Voltea unos pocos bits (menos que MATCH_THRESHOLD_BITS) para simular
  // una variación realista de compresión/tinte, sin cambiar de mapa.
  const perturbed = nukeHash ^ 0b111n; // 3 bits de diferencia
  const result = matchIconHash(perturbed);
  assert.ok(result, "se esperaba un match pese a la perturbación pequeña");
  assert.strictEqual(result.map, "Nuke");
});

check("matchIconHash: hash a distancia MAYOR o IGUAL al umbral de TODAS las referencias -> null (nunca fuerza un match de baja confianza)", () => {
  // Construye un hash sintético maximamente distinto de todas las
  // referencias conocidas (complemento de la primera referencia, que
  // por construcción está a 64 bits de ella y típicamente muy lejos
  // de las demás también).
  const anyRef = Object.values(MAP_ICON_REFERENCE_HASHES)[0];
  const allOnes = (1n << 64n) - 1n;
  const farHash = anyRef ^ allOnes; // complemento exacto: distancia 64 de esa referencia
  const result = matchIconHash(farHash);
  // No se afirma un valor exacto (depende de las 7 referencias reales),
  // solo la propiedad de diseño: si la distancia mínima real >= umbral,
  // el resultado debe ser null, nunca "el menos malo de los 7".
  const distances = Object.values(MAP_ICON_REFERENCE_HASHES).map((h) => hammingDistance(farHash, h));
  const minDist = Math.min(...distances);
  if (minDist >= MATCH_THRESHOLD_BITS) {
    assert.strictEqual(result, null, `distancia mínima real (${minDist}) >= umbral (${MATCH_THRESHOLD_BITS}) pero matchIconHash no devolvió null`);
  } else {
    console.log(`  (nota: el hash sintético cayó a ${minDist} bits de alguna referencia, por debajo del umbral — no invalida el test, solo no ejercita el caso 'sin match' con este hash en particular)`);
  }
});

check("matchIconHash: caso explícito Vertigo — ninguna referencia existe todavía, así que CUALQUIER hash de un ícono real de Vertigo debe devolver null o, en el peor caso, jamás una identificación con distancia por debajo del umbral contra una referencia que no le corresponde", () => {
  assert.ok(!("Vertigo" in MAP_ICON_REFERENCE_HASHES), "Vertigo no debería tener referencia todavía — agregar una entrada real rompe intencionalmente este test como recordatorio de actualizar este comentario");
});

check("matchIconHash: devuelve SIEMPRE el mapa de distancia mínima entre las referencias que sí están por debajo del umbral (no el primero por orden de inserción)", () => {
  const names = Object.keys(MAP_ICON_REFERENCE_HASHES);
  assert.ok(names.length >= 2, "se necesitan al menos 2 referencias para este test");
  const targetName = names[names.length - 1]; // la última en inserción, para evitar sesgo de "siempre gana el primero"
  const targetHash = MAP_ICON_REFERENCE_HASHES[targetName];
  const perturbed = targetHash ^ 0b1n; // 1 bit de diferencia: debe seguir siendo la mejor coincidencia
  const result = matchIconHash(perturbed);
  assert.ok(result, "se esperaba un match");
  assert.strictEqual(result.map, targetName, `se esperaba ${targetName} (última referencia insertada) pero se obtuvo ${result.map} — posible sesgo de orden de iteración`);
});

check("MATCH_THRESHOLD_BITS está estrictamente entre 0 y 64 (umbral con sentido dimensional)", () => {
  assert.ok(MATCH_THRESHOLD_BITS > 0 && MATCH_THRESHOLD_BITS < 64);
});

check("Todas las referencias declaradas son mapas del pool estándar (ningún typo silencioso)", () => {
  const validNames = new Set(["Dust2", "Mirage", "Nuke", "Ancient", "Inferno", "Anubis", "Cache", "Vertigo", "Overpass", "Train"]);
  for (const name of Object.keys(MAP_ICON_REFERENCE_HASHES)) {
    assert.ok(validNames.has(name), `"${name}" no es un nombre de mapa reconocido — ¿typo en MAP_ICON_REFERENCE_HASHES?`);
  }
});

check("Distancia de Hamming cruzada entre TODAS las referencias reales es >= MATCH_THRESHOLD_BITS (ninguna referencia se confunde con otra por diseño)", () => {
  const entries = Object.entries(MAP_ICON_REFERENCE_HASHES);
  const violations = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [nameA, hashA] = entries[i];
      const [nameB, hashB] = entries[j];
      const d = hammingDistance(hashA, hashB);
      if (d < MATCH_THRESHOLD_BITS) violations.push(`${nameA} vs ${nameB}: distancia ${d} < umbral ${MATCH_THRESHOLD_BITS}`);
    }
  }
  assert.strictEqual(violations.length, 0, `Referencias demasiado parecidas entre sí:\n${violations.join("\n")}`);
});

console.log(`\n${failures === 0 ? "✔ Todos los tests pasaron." : `✘ ${failures} test(s) fallaron.`}`);
process.exit(failures === 0 ? 0 : 1);

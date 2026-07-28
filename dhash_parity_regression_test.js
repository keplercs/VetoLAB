// Verifica que dHashFromGrayscale en regenerate_icon_hashes.js (Grupo 10)
// y dHashFromGrayscale en iconMatch.js (producción) sean EXACTAMENTE el
// mismo algoritmo — si divergen, los hashes regenerados por el script
// no serían comparables contra los que produce el navegador en
// producción, invalidando el propósito completo del Grupo 10.
const { dHashFromGrayscale: prodHash } = require("../iconMatch.js");

// Extrae la función homónima del script de Grupo 10 sin ejecutar main()
// (que dispararía red) — cargamos solo su definición vía sandbox.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const src = fs.readFileSync(path.join(__dirname, "../regenerate_icon_hashes.js"), "utf8");
const fnMatch = src.match(/function dHashFromGrayscale\([\s\S]*?\n}/);
if (!fnMatch) throw new Error("No se encontró dHashFromGrayscale en regenerate_icon_hashes.js");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(`${fnMatch[0]}\nthis.dHashFromGrayscale = dHashFromGrayscale;`, sandbox);
const scriptHash = sandbox.dHashFromGrayscale;

// Casos de prueba: aleatorio + los dos casos extremos ya usados en
// iconMatch_regression_test.js (gradiente creciente/decreciente).
function randomCase(w, h, seed) {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s / 0x7fffffff) * 255; };
  const arr = new Float64Array(w * h);
  for (let i = 0; i < arr.length; i++) arr[i] = rnd();
  return arr;
}

const w = 9, h = 8;
let failures = 0;
for (let seed = 1; seed <= 20; seed++) {
  const gray = randomCase(w, h, seed);
  const a = prodHash(gray, w, h);
  const b = scriptHash(gray, w, h);
  if (a !== b) {
    failures++;
    console.error(`FAIL seed=${seed}: iconMatch.js=${a.toString(16)} vs script=${b.toString(16)}`);
  }
}

// Casos extremos (mismos que iconMatch_regression_test.js)
const grow = new Float64Array(w*h); for (let y=0;y<h;y++) for (let x=0;x<w;x++) grow[y*w+x]=x*32;
const shrink = new Float64Array(w*h); for (let y=0;y<h;y++) for (let x=0;x<w;x++) shrink[y*w+x]=256-x*32;
for (const [label, data] of [["creciente", grow], ["decreciente", shrink]]) {
  const a = prodHash(data, w, h), b = scriptHash(data, w, h);
  if (a !== b) { failures++; console.error(`FAIL caso ${label}: ${a.toString(16)} vs ${b.toString(16)}`); }
  else console.log(`OK   caso ${label} coincide: ${a.toString(16)}`);
}

console.log(failures === 0
  ? "\n✔ Paridad confirmada: los 22 casos (20 aleatorios + 2 extremos) producen EXACTAMENTE el mismo hash en iconMatch.js y en regenerate_icon_hashes.js."
  : `\n✘ ${failures} discrepancias — el script de Grupo 10 NO es fiel al algoritmo de producción, hay que corregirlo antes de usarlo.`);
process.exit(failures === 0 ? 0 : 1);

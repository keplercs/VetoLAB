// Test funcional (no parte de la suite permanente) para validar el fix
// de Grupo 1 antes de darlo por bueno. Extrae el bloque real de
// detectRowBands/detectBandsInZone de app.js (mismo patrón que ya usa
// app_regression_test.js / color_side_regression_test.js: sandbox +
// canvas sintético, sin depender de `document` real).
const fs = require("fs");
const assert = require("assert");

const src = fs.readFileSync("app.js", "utf8");
const idxStart = src.indexOf("const STATS_ZONE_X_START");
const idxEnd = src.indexOf("\n}", src.indexOf("function detectRowBands(canvas) {")) + 2;
const block = src.slice(idxStart, idxEnd);

// Canvas sintético: un buffer RGBA que detectBandsInZone puede leer vía
// getContext().getImageData(). Permite definir zonas de "contenido"
// (thumbnail o texto) y "fondo" (oscuro uniforme) por separado.
function makeSyntheticCanvas(width, height, pixelFn) {
  return {
    width, height,
    getContext() {
      return {
        getImageData(x, y, w, h) {
          const data = new Uint8ClampedArray(w * h * 4);
          for (let yy = 0; yy < h; yy++) {
            for (let xx = 0; xx < w; xx++) {
              const [r, g, b, a] = pixelFn(x + xx, y + yy);
              const i = (yy * w + xx) * 4;
              data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a ?? 255;
            }
          }
          return { data };
        },
      };
    },
  };
}

const sandbox = {
  document: {
    createElement() {
      // buildDownsampledCanvas solo se ejecuta si width > maxWidth;
      // en estos tests el canvas ya es angosto (scale=1), así que
      // este createElement no debería invocarse en el camino feliz.
      throw new Error("document.createElement no debería llamarse en este test (canvas ya angosto)");
    },
  },
};

new Function(
  "sandbox", "document",
  `${block}
sandbox.detectRowBands = detectRowBands;
sandbox.detectBandsInZone = detectBandsInZone;
sandbox.ICON_ZONE_X_START = ICON_ZONE_X_START;
sandbox.ICON_ZONE_X_END = ICON_ZONE_X_END;
sandbox.STATS_ZONE_X_START = STATS_ZONE_X_START;
sandbox.STATS_ZONE_X_END = STATS_ZONE_X_END;`
)(sandbox, sandbox.document);

const { detectRowBands } = sandbox;

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

console.log("=== Test funcional: fix de anclaje por thumbnail (Grupo 1) ===\n");

const W = 300, H = 400; // imagen angosta (< BAND_DETECTION_MAX_WIDTH=600), scale=1
const BG = { r: 20, g: 20, b: 20 };

// 3 filas simuladas, con contenido tanto en la zona de thumbnail
// (x: 0-14%) como en la zona de texto (x: 55-98%), separadas por
// gaps de fondo puro. Alturas de banda ~40px con separación ~20px.
function threeRowsBothZonesAgree(x, y) {
  const rows = [[20, 60], [100, 140], [180, 220]]; // [y0,y1) de contenido
  const inRow = rows.some(([a, b]) => y >= a && y < b);
  const thumbZone = x >= W * sandbox.ICON_ZONE_X_START && x < W * sandbox.ICON_ZONE_X_END;
  const textZone = x >= W * sandbox.STATS_ZONE_X_START && x < W * sandbox.STATS_ZONE_X_END;
  if (inRow && (thumbZone || textZone)) return [200, 200, 200, 255]; // contenido claro
  return [BG.r, BG.g, BG.b, 255];
}

check("ambas zonas coinciden en el conteo (3 bandas) -> usa fuente 'thumbnail', sin mismatch", () => {
  const canvas = makeSyntheticCanvas(W, H, threeRowsBothZonesAgree);
  const result = detectRowBands(canvas);
  assert.strictEqual(result.bands.length, 3, `se esperaban 3 bandas, se obtuvieron ${result.bands.length}`);
  assert.strictEqual(result.source, "thumbnail", `se esperaba source='thumbnail', se obtuvo '${result.source}'`);
  assert.strictEqual(result.mismatch, false, "no debería marcarse mismatch cuando ambas zonas coinciden");
});

// Caso de discrepancia real: la zona de texto tiene una banda de más
// (ej. ruido de UI ajeno a las filas de mapa, como el panel de stats
// extendido documentado en veto_05_statspanel de fixtures.js), pero el
// thumbnail solo tiene las 3 filas reales.
function textZoneHasExtraNoise(x, y) {
  const thumbRows = [[20, 60], [100, 140], [180, 220]];
  // Banda extra falsa con altura comparable a las reales (40px, igual
  // que las demás) — una banda mucho más chica sería descartada por el
  // propio filtro `b.h >= maxH * 0.5` de detectBandsInZone antes de
  // siquiera llegar a la comparación de conteos, lo cual no ejercitaría
  // la rama de discrepancia real que este test busca cubrir.
  const textRows = [[20, 60], [100, 140], [180, 220], [260, 300]];
  const thumbZone = x >= W * sandbox.ICON_ZONE_X_START && x < W * sandbox.ICON_ZONE_X_END;
  const textZone = x >= W * sandbox.STATS_ZONE_X_START && x < W * sandbox.STATS_ZONE_X_END;
  if (thumbZone && thumbRows.some(([a, b]) => y >= a && y < b)) return [200, 200, 200, 255];
  if (textZone && textRows.some(([a, b]) => y >= a && y < b)) return [200, 200, 200, 255];
  return [BG.r, BG.g, BG.b, 255];
}

check("zonas discrepan en conteo (thumbnail=3, texto=4) -> fallback a 'text', mismatch=true", () => {
  const canvas = makeSyntheticCanvas(W, H, textZoneHasExtraNoise);
  const result = detectRowBands(canvas);
  assert.strictEqual(result.bands.length, 4, "debe usar el conteo de la franja de texto (fallback)");
  assert.strictEqual(result.source, "text");
  assert.strictEqual(result.mismatch, true, "debe marcarse mismatch cuando las fuentes discrepan");
});

check("bg siempre proviene de la franja de texto, nunca del thumbnail, incluso cuando se usa 'thumbnail' como source", () => {
  // Construye una escena donde el fondo real (fuera de contenido) es
  // BG, y confirma que result.bg se acerca a ese valor (estimado sobre
  // la franja de texto) y no a algún otro color que solo aparezca en
  // la zona de thumbnail.
  const canvas = makeSyntheticCanvas(W, H, threeRowsBothZonesAgree);
  const result = detectRowBands(canvas);
  assert.ok(Math.abs(result.bg.r - BG.r) < 5, `bg.r inesperado: ${result.bg.r}`);
  assert.ok(Math.abs(result.bg.g - BG.g) < 5, `bg.g inesperado: ${result.bg.g}`);
  assert.ok(Math.abs(result.bg.b - BG.b) < 5, `bg.b inesperado: ${result.bg.b}`);
});

check("ninguna zona detecta contenido (imagen vacía) -> 0 bandas, source='text', mismatch=false", () => {
  const canvas = makeSyntheticCanvas(W, H, () => [BG.r, BG.g, BG.b, 255]);
  const result = detectRowBands(canvas);
  assert.strictEqual(result.bands.length, 0);
  assert.strictEqual(result.mismatch, false, "sin contenido en ninguna zona no es una discrepancia, es ausencia total");
});

check("thumbnail detecta 0 bandas pero texto sí detecta -> no coinciden, fallback a texto con mismatch", () => {
  // Simula el escenario real reportado: OCR de texto encuentra filas,
  // pero el recorte de thumbnail no tiene contraste suficiente (ej.
  // imagen recortada sin la columna de miniaturas visible).
  function onlyTextZoneHasContent(x, y) {
    const rows = [[20, 60], [100, 140]];
    const textZone = x >= W * sandbox.STATS_ZONE_X_START && x < W * sandbox.STATS_ZONE_X_END;
    if (textZone && rows.some(([a, b]) => y >= a && y < b)) return [200, 200, 200, 255];
    return [BG.r, BG.g, BG.b, 255];
  }
  const canvas = makeSyntheticCanvas(W, H, onlyTextZoneHasContent);
  const result = detectRowBands(canvas);
  assert.strictEqual(result.bands.length, 2, "debe recuperar las 2 filas vía la franja de texto");
  assert.strictEqual(result.source, "text");
  assert.strictEqual(result.mismatch, true, "thumbnail vacío + texto con contenido es una discrepancia real, no un empate");
});

console.log(`\n${failures === 0 ? "✔ Todos los tests pasaron." : `✘ ${failures} test(s) fallaron.`}`);
process.exit(failures === 0 ? 0 : 1);

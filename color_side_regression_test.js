// ============================================================
// Test de regresión — Grupo 11 (color_side_mismatch, app.js)
//
// Origen: verificación del análisis técnico §10 contra el bundle real
// de TAPIT.GG (content.js v1.16.6) y contra una captura real de veto
// subida durante la sesión de depuración. Dos hallazgos verificados
// que este archivo protege:
//
//   1. La fórmula real del bundle es
//      d = c>A ? "text-green-500" : c===A ? "text-gray-500" : "text-red-500"  (lado propio)
//      u = c<A ? "text-green-500" : c===A ? "text-gray-500" : "text-red-500"  (lado rival)
//      donde c=winRate propio, A=winRate rival — confirmado por fragmento
//      literal del bundle, no inferido.
//   2. Contra 5 filas de una captura real medida a nivel de píxel: el
//      bloque de color de cada lado cae en x≈0.38–0.49 (propio) y
//      x≈0.57–0.70 (rival) del ancho de fila, con verde real
//      ≈RGB(12,196,80) y rojo real ≈RGB(250,43,45) — muy cercanos a
//      Tailwind green-500 (#22c55e) y red-500 (#ef4444). El dorado del
//      ícono de ranking (★ mejor mapa, #c2ae40) puede aparecer como
//      RGB(207,160,29) — R y G ambos altos a la vez — y NO debe
//      clasificarse como verde ni rojo (ver classifyComparisonColorPixel).
//
// Este archivo no depende de la imagen real (no puede vivir en el
// repo) — reproduce sintéticamente los valores RGB medidos, igual que
// dhash_parity_regression_test.js reproduce casos sintéticos para
// dHashFromGrayscale sin necesitar red.
//
// app.js no es requireable directamente en Node (usa `document`/`els`
// a nivel de módulo) — mismo patrón que app_regression_test.js: se
// extrae el bloque fuente real (delimitado por marcadores estables) y
// se evalúa en un sandbox aislado, para ejercitar la lógica tal cual
// vive en el archivo, no una copia congelada.
//
// Ejecutar: node color_side_regression_test.js
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

console.log("=== Test de regresión: color_side_mismatch (Grupo 11, app.js) ===\n");

const appSource = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");

const constZoneStart = appSource.indexOf("const COMPARISON_COLOR_ZONE_OWN");
const constZoneEndAnchor = "const COMPARISON_COLOR_DOMINANCE = ";
const constZoneEndIdx = appSource.indexOf(constZoneEndAnchor);
assert.ok(constZoneStart !== -1 && constZoneEndIdx !== -1, "No se encontraron las constantes COMPARISON_COLOR_* en app.js");
const constZoneLineEnd = appSource.indexOf("\n", constZoneEndIdx);
const constantsSource = appSource.slice(constZoneStart, constZoneLineEnd + 1);

const classifyStart = appSource.indexOf("function classifyComparisonColorPixel");
const sampleStart = appSource.indexOf("function sampleComparisonColorSide");
const corroborateStart = appSource.indexOf("function corroborateSideFromColor");
assert.ok(classifyStart !== -1, "No se encontró classifyComparisonColorPixel en app.js");
assert.ok(sampleStart !== -1, "No se encontró sampleComparisonColorSide en app.js");
assert.ok(corroborateStart !== -1, "No se encontró corroborateSideFromColor en app.js");
assert.ok(classifyStart < sampleStart && sampleStart < corroborateStart, "Orden de definición inesperado — el sandbox asume classify -> sample -> corroborate");

function extractFunctionBlock(source, startIdx) {
  const bodyStart = source.indexOf("{", startIdx);
  const bodyEnd = source.indexOf("\n}", bodyStart);
  return source.slice(startIdx, bodyEnd + 2);
}

const classifySource = extractFunctionBlock(appSource, classifyStart);
const sampleSource = extractFunctionBlock(appSource, sampleStart);
const extractedSource = extractFunctionBlock(appSource, corroborateStart);

// Sandbox mínimo: simula un canvas 2D con un buffer de píxeles
// sintético en vez de depender de una implementación real de Canvas
// (no disponible en Node sin una dependencia nativa adicional). Cada
// "sourceCanvas" de prueba es un objeto con getContext() que devuelve
// getImageData() sobre un buffer que el propio test controla — permite
// reproducir exactamente los valores RGB medidos en la captura real
// sin necesitar la imagen ni una librería de canvas.
function makeFakeCanvas(width, height, pixelFn) {
  // pixelFn(x, y) -> [r,g,b,a]
  return {
    width, height,
    getContext() {
      return {
        drawImage() {
          // El sourceCanvas real nunca es DESTINO de un drawImage en
          // este flujo (solo es fuente, leído vía getImageData con
          // coordenadas absolutas) — no-op intencional.
        },
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
      // Simula un <canvas> "destino" (el `tmp` que crea
      // sampleComparisonColorSide): drawImage(source, sx, sy, sw, sh, ...)
      // debe recortar del `source` real a partir de (sx,sy) — luego
      // getImageData(0,0,w,h) sobre ESTE canvas debe devolver esos
      // mismos píxeles ya recortados, igual que un <canvas> real.
      const self = { width: 0, height: 0 };
      self.getContext = () => ({
        drawImage(source, sx, sy, sw, sh) {
          self._source = source;
          self._sx = sx; self._sy = sy; self._sw = sw; self._sh = sh;
        },
        getImageData(x, y, w, h) {
          const srcCtx = self._source.getContext();
          // Lee del canvas fuente real, desplazado por el offset que
          // drawImage capturó — replica exactamente el recorte que
          // haría un <canvas> real.
          return srcCtx.getImageData(self._sx + x, self._sy + y, w, h);
        },
      });
      return self;
    },
  },
};

new Function(
  "sandbox",
  "document",
  `${constantsSource}
${classifySource}
${sampleSource}
${extractedSource}
sandbox.classifyComparisonColorPixel = classifyComparisonColorPixel;
sandbox.sampleComparisonColorSide = sampleComparisonColorSide;
sandbox.corroborateSideFromColor = corroborateSideFromColor;
sandbox.COMPARISON_COLOR_ZONE_OWN = COMPARISON_COLOR_ZONE_OWN;
sandbox.COMPARISON_COLOR_ZONE_RIVAL = COMPARISON_COLOR_ZONE_RIVAL;`
)(sandbox, sandbox.document);

const { classifyComparisonColorPixel, corroborateSideFromColor } = sandbox;

// ------------------------------------------------------------
// 1. classifyComparisonColorPixel — valores medidos en la captura real
// ------------------------------------------------------------
console.log("--- classifyComparisonColorPixel: valores medidos en captura real ---");

check("verde real Tailwind (Dust2, lado propio, 53%>51%) -> 'green'", () => {
  assert.strictEqual(classifyComparisonColorPixel(12, 196, 80), "green");
});

check("rojo real Tailwind (Dust2, lado rival, 51%<53%) -> 'red'", () => {
  assert.strictEqual(classifyComparisonColorPixel(250, 43, 45), "red");
});

check("dorado del ícono de ranking (★ mejor mapa, #c2ae40 con antialiasing) -> null (NO confundirse con rojo/verde)", () => {
  assert.strictEqual(classifyComparisonColorPixel(207, 160, 29), null);
  assert.strictEqual(classifyComparisonColorPixel(194, 174, 64), null); // valor nominal exacto de #c2ae40
});

check("gris de empate (text-gray-500, ~#6b7280) -> null", () => {
  assert.strictEqual(classifyComparisonColorPixel(107, 114, 128), null);
});

check("blanco del texto de conteo de partidas (siempre fijo, nunca coloreado) -> null", () => {
  assert.strictEqual(classifyComparisonColorPixel(255, 255, 255), null);
});

check("fondo oscuro de la fila (~#1a1a1a) -> null", () => {
  assert.strictEqual(classifyComparisonColorPixel(26, 26, 26), null);
});

// ------------------------------------------------------------
// 2. corroborateSideFromColor — casos end-to-end con canvas sintético
// ------------------------------------------------------------
console.log("\n--- corroborateSideFromColor: casos completos ---");

const ROW_W = 538, ROW_H = 42; // dimensiones aprox. de una fila real (ver captura de referencia)
const band = { y0: 10, y1: 32, h: 22 };

function ownZonePx() { return Math.floor(ROW_W * 0.36); } // dentro de COMPARISON_COLOR_ZONE_OWN
function rivalZonePx() { return Math.floor(ROW_W * 0.56); } // dentro de COMPARISON_COLOR_ZONE_RIVAL

check("caso Dust2 real (pA=53 > pB=51): propio verde + rival rojo -> consistent=true", () => {
  const canvas = makeFakeCanvas(ROW_W, ROW_H, (x, y) => {
    const ownStart = Math.floor(ROW_W * 0.36), ownEnd = Math.floor(ROW_W * 0.51);
    const rivalStart = Math.floor(ROW_W * 0.56), rivalEnd = Math.floor(ROW_W * 0.72);
    if (x >= ownStart && x < ownEnd) return [12, 196, 80, 255]; // verde real medido
    if (x >= rivalStart && x < rivalEnd) return [250, 43, 45, 255]; // rojo real medido
    return [26, 26, 26, 255]; // fondo
  });
  const result = corroborateSideFromColor(canvas, band, 53, 51);
  assert.ok(result, "se esperaba una señal de color, se obtuvo null");
  assert.strictEqual(result.ownColor, "green");
  assert.strictEqual(result.rivalColor, "red");
  assert.strictEqual(result.consistent, true);
});

check("caso Mirage real (pA=33 < pB=43): propio rojo + rival verde -> consistent=true", () => {
  const canvas = makeFakeCanvas(ROW_W, ROW_H, (x, y) => {
    const ownStart = Math.floor(ROW_W * 0.36), ownEnd = Math.floor(ROW_W * 0.51);
    const rivalStart = Math.floor(ROW_W * 0.56), rivalEnd = Math.floor(ROW_W * 0.72);
    if (x >= ownStart && x < ownEnd) return [250, 43, 45, 255];
    if (x >= rivalStart && x < rivalEnd) return [12, 196, 80, 255];
    return [26, 26, 26, 255];
  });
  const result = corroborateSideFromColor(canvas, band, 33, 43);
  assert.strictEqual(result.ownColor, "red");
  assert.strictEqual(result.rivalColor, "green");
  assert.strictEqual(result.consistent, true);
});

check("discrepancia real: color dice pA>pB pero el número leído dice pA<pB -> consistent=false", () => {
  // Color observado = propio verde (implica pA>pB), pero los nums
  // leídos por OCR de texto dicen pA=30 < pB=70 — discrepancia real
  // que sí debe marcar el warning.
  const canvas = makeFakeCanvas(ROW_W, ROW_H, (x, y) => {
    const ownStart = Math.floor(ROW_W * 0.36), ownEnd = Math.floor(ROW_W * 0.51);
    const rivalStart = Math.floor(ROW_W * 0.56), rivalEnd = Math.floor(ROW_W * 0.72);
    if (x >= ownStart && x < ownEnd) return [12, 196, 80, 255]; // verde
    if (x >= rivalStart && x < rivalEnd) return [250, 43, 45, 255]; // rojo
    return [26, 26, 26, 255];
  });
  const result = corroborateSideFromColor(canvas, band, 30, 70);
  assert.ok(result, "se esperaba señal de color");
  assert.strictEqual(result.consistent, false, "debía detectar la discrepancia entre color y números");
});

check("empate real (pA=pB=50, sin dominancia de color en ninguna zona) -> null, sin falso warning", () => {
  const canvas = makeFakeCanvas(ROW_W, ROW_H, () => [26, 26, 26, 255]); // toda la fila en gris/fondo, sin dominancia
  const result = corroborateSideFromColor(canvas, band, 50, 50);
  assert.strictEqual(result, null, "una fila sin señal de color no debe generar ni consistent:true ni consistent:false — debe ser null");
});

check("mapa BANEADO pero con texto de comparación aún coloreado (caso real: captura team_brunomani, fila Nuke, pA=46>pB=42, thumbnail gris pero (46%) sigue en verde) -> SÍ debe corroborar normalmente, null NO es el resultado esperado aquí", () => {
  // Corrige una suposición incorrecta de una versión anterior de este
  // test: "mapa baneado" NO implica ausencia de color en el bloque de
  // texto de comparación — solo el thumbnail/ícono se desatura de
  // forma confiable al banear (Sección 0.2 del documento de
  // fundamentos). Verificado con medición real a nivel de píxel contra
  // una captura donde Nuke estaba baneado (thumbnail en escala de
  // grises pura) y aun así mostraba RGB(0,201,80) real en el bloque
  // "(46%)". La función NO recibe el thumbnail — solo la franja de
  // texto — así que debe seguir corroborando con total normalidad en
  // este caso, no devolver null.
  const canvas = makeFakeCanvas(ROW_W, ROW_H, (x, y) => {
    const ownStart = Math.floor(ROW_W * 0.36), ownEnd = Math.floor(ROW_W * 0.51);
    const rivalStart = Math.floor(ROW_W * 0.56), rivalEnd = Math.floor(ROW_W * 0.72);
    if (x >= ownStart && x < ownEnd) return [0, 201, 80, 255]; // verde real medido en Nuke baneado
    if (x >= rivalStart && x < rivalEnd) return [250, 43, 45, 255]; // rojo (42% < 46%)
    return [26, 26, 26, 255];
  });
  const result = corroborateSideFromColor(canvas, band, 46, 42);
  assert.ok(result, "se esperaba señal de color pese al baneo del mapa");
  assert.strictEqual(result.ownColor, "green");
  assert.strictEqual(result.rivalColor, "red");
  assert.strictEqual(result.consistent, true);
});

check("empate real con pA===pB pero SIN color gris explícito muestreado (ruido/JPEG bajo el umbral): también debe caer a null, no a falso mismatch", () => {
  const canvas = makeFakeCanvas(ROW_W, ROW_H, () => [30, 30, 32, 255]); // casi fondo, ruido mínimo
  const result = corroborateSideFromColor(canvas, band, 50, 50);
  assert.strictEqual(result, null);
});

check("ruido de JPEG aislado (pocos píxeles) no dispara falso positivo — exige MIN_PIXELS", () => {
  const canvas = makeFakeCanvas(ROW_W, ROW_H, (x, y) => {
    // Solo 2 píxeles "verdes" perdidos en toda la zona propia — por
    // debajo de MIN_PIXELS, no debe contar como señal real.
    const ownStart = Math.floor(ROW_W * 0.36);
    if (x === ownStart + 1 && y === 15) return [12, 196, 80, 255];
    if (x === ownStart + 2 && y === 16) return [12, 196, 80, 255];
    return [26, 26, 26, 255];
  });
  const result = corroborateSideFromColor(canvas, band, 60, 40);
  assert.strictEqual(result, null, "2 píxeles de ruido no deben interpretarse como señal de color real");
});

// ------------------------------------------------------------
// 3. Bug real corregido: ícono de ranking contaminando el color de
//    comparación (captura real team_brunomani, filas Inferno/Ancient/
//    Anubis). El ícono vive DENTRO del mismo bloque coloreado que el
//    paréntesis de porcentaje (confirmado por el JSX real del bundle:
//    `<div class=d>[icono] (winRate%) n</div>`) y sus colores
//    (#ef4444 rojo "peor mapa", #fb923c naranja "2º peor", #c2ae40
//    dorado "mejor") son indistinguibles por tono puro del rojo/verde
//    de comparación real. Estos tests reproducen los valores RGB
//    medidos exactamente en la captura real que expuso el bug — antes
//    del fix de clustering, el ícono rojo de Inferno habría podido
//    ganar el conteo total de píxeles sobre un "(NN%)" verde corto.
// ------------------------------------------------------------
console.log("\n--- Corrección: ícono de ranking contaminando la zona de color ---");

check("ícono 🔥 rojo (#ef4444, 'peor mapa') pegado a un (40%) verde corto (caso real: fila Inferno) -> el cluster del TEXTO gana, no el del ícono", () => {
  // Reproduce la medición real: ícono rojo aislado en un cluster corto
  // (x≈0.377-0.388), seguido de un hueco, seguido del texto verde real
  // "(40%)" fragmentado en varios sub-runs pero con más columnas en
  // total. Ver conversación de depuración para las coordenadas x
  // exactas medidas contra la captura real.
  const canvas = makeFakeCanvas(ROW_W, ROW_H, (x, y) => {
    const iconStart = Math.floor(ROW_W * 0.377), iconEnd = Math.floor(ROW_W * 0.389);
    const textStart = Math.floor(ROW_W * 0.405), textEnd = Math.floor(ROW_W * 0.478); // "(40%)" real, más ancho que el ícono
    if (x >= iconStart && x < iconEnd) return [251, 44, 54, 255]; // ícono rojo real medido
    if (x >= textStart && x < textEnd) return [3, 201, 65, 255]; // texto verde real medido
    return [26, 26, 26, 255];
  });
  const result = sandbox.sampleComparisonColorSide(canvas, band, sandbox.COMPARISON_COLOR_ZONE_OWN);
  assert.strictEqual(result, "green", "el cluster del texto (más ancho) debe ganar sobre el ícono aislado más corto");
});

check("ícono ★ dorado (#c2ae40, 'mejor mapa') junto a un (78%) verde (caso real: fila Anubis) -> dorado no se clasifica ni verde ni rojo, texto gana sin contaminación", () => {
  const canvas = makeFakeCanvas(ROW_W, ROW_H, (x, y) => {
    const iconStart = Math.floor(ROW_W * 0.40), iconEnd = Math.floor(ROW_W * 0.41);
    const textStart = Math.floor(ROW_W * 0.42), textEnd = Math.floor(ROW_W * 0.49);
    if (x >= iconStart && x < iconEnd) return [194, 174, 64, 255]; // dorado nominal #c2ae40
    if (x >= textStart && x < textEnd) return [0, 201, 80, 255]; // verde real
    return [26, 26, 26, 255];
  });
  const result = sandbox.sampleComparisonColorSide(canvas, band, sandbox.COMPARISON_COLOR_ZONE_OWN);
  assert.strictEqual(result, "green");
});

check("classifyComparisonColorPixel: naranja del ícono (#fb923c, '2º peor mapa') NO debe confundirse con verde, y su dominancia de R lo acerca al umbral de rojo — verificar que sigue clasificando según el diseño (documentado como limitación conocida, no un bug adicional)", () => {
  // Este caso documenta una limitación real que el fix de clustering
  // mitiga (el ícono aislado pierde contra el cluster de texto más
  // grande) pero no elimina en el nivel de clasificación de un solo
  // píxel: el naranja Tailwind (#fb923c) sí cae en la categoría "red"
  // de classifyComparisonColorPixel por dominancia de canal. El fix
  // de clustering es la mitigación real (ver tests de arriba); a nivel
  // de píxel individual, seguirá clasificando como red -- por diseño,
  // documentado, no un caso a "arreglar" aquí.
  assert.strictEqual(classifyComparisonColorPixel(255, 137, 4), "red");
});

console.log("\n--- Robustez ante variación vertical (bug real: una sola línea Y pierde señal) ---");

check("la señal de color debe sobrevivir aunque el texto no esté perfectamente centrado en la banda (verificado: una sola línea Y central puede perder ~87% de los puntos de color a solo 3px de la línea base real)", () => {
  const canvas = makeFakeCanvas(ROW_W, ROW_H, (x, y) => {
    const ownStart = Math.floor(ROW_W * 0.36), ownEnd = Math.floor(ROW_W * 0.51);
    // El color solo aparece en la mitad SUPERIOR de la banda (y < h/2),
    // simulando texto desplazado respecto al centro geométrico exacto
    // — si sampleComparisonColorSide solo mirara una línea Y central,
    // esto perdería toda la señal.
    if (x >= ownStart && x < ownEnd && y < ROW_H / 2) return [12, 196, 80, 255];
    return [26, 26, 26, 255];
  });
  const result = sandbox.sampleComparisonColorSide(canvas, band, sandbox.COMPARISON_COLOR_ZONE_OWN);
  assert.strictEqual(result, "green", "debe detectar la señal aunque no esté en la línea Y central exacta");
});


process.exit(failures === 0 ? 0 : 1);

// ============================================================
// regenerate_icon_hashes.js — Grupo 10 #1 de la Guía de seguimiento y
// resolución de errores (VetoLAB_TAPIT_Analisis_Tecnico.md, Sección
// 12.3: "Regenerar los hashes de referencia desde las miniaturas
// oficiales de FACEIT").
//
// QUÉ HACE: descarga las miniaturas oficiales y públicas de cada mapa
// desde `distribution.faceit-cdn.net` (URLs extraídas directamente del
// bundle de TAPIT.GG — ver tabla en §4.3 del análisis técnico) y
// recalcula el dHash 8x8 de cada una con EXACTAMENTE el mismo
// algoritmo que `computeDHash`/`dHashFromGrayscale` en iconMatch.js —
// para que el hash regenerado sea comparable bit a bit contra los que
// ya produce ese archivo en el navegador.
//
// POR QUÉ NO SE EJECUTÓ COMO PARTE DE ESTA RONDA: este entorno de
// desarrollo tiene la red saliente deshabilitada (no hay forma de
// hacer `fetch`/`https.get` hacia `distribution.faceit-cdn.net` desde
// aquí). Este archivo es el ENTREGABLE de la solución — queda listo
// para correr en cualquier máquina con acceso a internet; no requiere
// ninguna dependencia fuera de Node core (usa `https` nativo, sin
// `sharp`/`canvas`/`jimp` — decodifica el JPEG "a mano" NO es
// razonable en pocas líneas, así que este script sí necesita UNA
// dependencia externa mínima para decodificar la imagen: `sharp`).
//
// CÓMO EJECUTARLO:
//   0. (Ya verificado en esta ronda, no hace falta repetirlo salvo que
//      se edite alguno de los dos archivos): `node
//      tests/dhash_parity_regression_test.js` confirma que el
//      `dHashFromGrayscale` de este script es BIT A BIT idéntico al de
//      `iconMatch.js` — si algún día se modifica uno de los dos sin
//      tocar el otro, ese test lo va a detectar antes de que se
//      generen hashes no comparables contra producción.
//   1. npm install sharp --no-save        (una sola vez, requiere red)
//   2. node regenerate_icon_hashes.js
//   3. Copiar el objeto impreso por consola dentro de
//      MAP_ICON_REFERENCE_HASHES en iconMatch.js, reemplazando los
//      valores actuales por estos (generados desde el asset oficial,
//      ya con el recorte de cuadrado central del fix 4.3.1 aplicado).
//   4. Volver a correr `node tests/iconMatch_regression_test.js` — el
//      test "Distancia de Hamming cruzada entre TODAS las referencias
//      reales es >= MATCH_THRESHOLD_BITS" debe seguir en verde. Punto
//      4.3.3 de la guía de seguimiento: el margen ya viene MÁS
//      AJUSTADO de lo documentado originalmente con las referencias
//      actuales sin este fix (21 bits medidos, no los ~24-25
//      estimados al inicio) — así que tras regenerar con el recorte
//      de cuadrado central, revisar explícitamente si ese margen se
//      redujo aún más antes de dar por buenos los hashes nuevos, no
//      solo confirmar que el test siga en verde con el umbral actual.
//
// FIX 4.3.1 (Guía de seguimiento y resolución de errores — VetoLAB,
// Grupo 4, hallazgo 4.2/4.3.1): ANTES, `computeDHashFromUrl` estiraba
// (`fit: "fill"`) la imagen panorámica completa directamente a 9x8,
// sin preservar relación de aspecto. Esto produce dHashes que no son
// comparables de forma confiable contra el recorte real que hace
// `cropIconZoneToCanvas` en app.js (rectángulo angosto y alto,
// ICON_ZONE_X_START=0..ICON_ZONE_X_END=0.14 del ancho de fila) — el
// efecto de distorsión es peor en mapas con miniaturas menos
// distintivas estructuralmente tras el aplastamiento (caso reportado:
// Nuke, interior industrial de paleta gris-azulada uniforme).
//
// AHORA: antes de redimensionar a 9x8, se recorta el CUADRADO CENTRAL
// de la imagen de referencia (lado = min(width, height), centrado en
// ambos ejes) — ver `computeDHashFromUrl` más abajo. Esto no distorsiona
// el contenido central de la miniatura de la misma forma que un
// estiramiento panorámico->9x8 directo, aunque tampoco iguala
// exactamente el aspect ratio angosto-y-alto real de
// `cropIconZoneToCanvas` (ver limitación declarada abajo, sin cambios
// respecto al análisis original — sigue siendo un ajuste parcial, no
// una corrección geométrica exacta).
//
// LIMITACIÓN DECLARADA (heredada del propio análisis técnico, §4.3,
// vigente tras el fix 4.3.1): recortar el cuadrado central corrige la
// distorsión más grosera (estirar un panorama ancho a un hash casi
// cuadrado) pero NO garantiza que el aspect ratio final coincida
// exactamente con `cropIconZoneToCanvas` (que es angosto y alto, no
// cuadrado). El ajuste fino real requiere decidir qué región del
// thumbnail oficial de FACEIT es la que efectivamente aparece dentro
// de `ICON_ZONE_X_START..ICON_ZONE_X_END` en una captura típica, y
// recortar la referencia a esa misma proporción, no a un cuadrado
// genérico — eso sigue pendiente de validación visual directa contra
// una captura real antes de dar por definitivos los hashes
// regenerados con este fix. No reemplaza esa validación, solo reduce
// la magnitud del problema mientras esa validación no se hace.
//
// Cache no tiene URL en `distribution.faceit-cdn.net` en el bundle
// analizado (usa una ruta distinta de `assets.faceit-cdn.net/.../
// votables/...`, con un ID truncado en el propio análisis — ver
// VetoLAB_TAPIT_Analisis_Tecnico.md §4.3) y Vertigo no tiene URL
// conocida en absoluto todavía. Ambos casos quedan fuera de este
// script hasta confirmar sus URLs completas.
// ============================================================

const https = require("https");

// URLs oficiales confirmadas por ingeniería inversa del bundle de
// TAPIT.GG (VetoLAB_TAPIT_Analisis_Tecnico.md, Sección 4.3) — públicas,
// sin autenticación.
const REFERENCE_URLS = {
  Dust2: "https://distribution.faceit-cdn.net/images/4eafa800-b504-4dd2-afd0-90882c729140.jpeg",
  Mirage: "https://distribution.faceit-cdn.net/images/c47710c4-4407-4dbd-ac89-2ef3b20a262e.jpeg",
  Nuke: "https://distribution.faceit-cdn.net/images/faa7775b-f42b-4627-891a-21ee7cc13637.jpeg",
  Ancient: "https://distribution.faceit-cdn.net/images/6f72ffec-7607-44cf-9c31-09a865fa92f5.jpeg",
  Train: "https://distribution.faceit-cdn.net/images/9e2d5b60-e16e-4309-8e77-8d4427938095.jpeg",
  Inferno: "https://distribution.faceit-cdn.net/images/d71cae42-b38c-470d-a548-0c59d6c71fbe.jpeg",
  Overpass: "https://distribution.faceit-cdn.net/images/8ba6f730-fa31-4dd7-9b41-4cff81d79fef.jpeg",
  Anubis: "https://distribution.faceit-cdn.net/images/1c2412c7-ae0c-4fa1-ad86-82a3287cb479.jpeg",
  // Cache y Vertigo: sin URL completa confirmada todavía — ver nota de
  // cabecera. No se listan aquí para no descargar una URL truncada.
};

const HASH_SIZE = 8; // idéntico a iconMatch.js — dHash 8x8 = 64 bits

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`${url} -> HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

// Mismo algoritmo EXACTO que dHashFromGrayscale en iconMatch.js —
// duplicado aquí a propósito (este script corre en Node sin acceso a
// las funciones de iconMatch.js pensadas para Canvas del navegador),
// no una reimplementación aproximada.
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

// Fix 4.3.3 (Guía de seguimiento y resolución de errores — VetoLAB,
// Grupo 4): distancia de Hamming entre dos hashes de 64 bits (BigInt).
// Duplicada intencionalmente de `hammingDistance` en iconMatch.js —
// mismo criterio que dHashFromGrayscale arriba: este script no importa
// código pensado para el navegador, y el algoritmo es trivial de
// mantener sincronizado (XOR + conteo de bits).
function hammingDistance(a, b) {
  let x = a ^ b;
  let count = 0n;
  while (x > 0n) {
    count += x & 1n;
    x >>= 1n;
  }
  return Number(count);
}

async function computeDHashFromUrl(url) {
  // Requiere `sharp` (npm install sharp) SOLO en este script de
  // regeneración offline — iconMatch.js en producción sigue usando
  // Canvas 2D del navegador, sin ninguna dependencia nueva ahí.
  const sharp = require("sharp");
  const buffer = await downloadBuffer(url);
  const w = HASH_SIZE + 1, h = HASH_SIZE;

  // Fix 4.3.1 (Grupo 4 de la Guía de seguimiento y resolución de
  // errores): antes de redimensionar a 9x8, se recorta el CUADRADO
  // CENTRAL de la imagen de referencia (lado = min(width, height),
  // centrado en ambos ejes) en vez de estirar directamente la imagen
  // panorámica completa. Estirar un panorama ancho (relación de
  // aspecto muy distinta de 9:8) a un hash casi cuadrado distorsiona
  // la estructura interna de la miniatura de forma no uniforme en
  // cada eje — el recorte central preserva el contenido real del
  // centro de la imagen sin ese aplastamiento asimétrico. Ver
  // comentario de cabecera de este archivo para la limitación
  // declarada que sigue vigente (esto no iguala exactamente el aspect
  // ratio angosto-y-alto de `cropIconZoneToCanvas` en app.js, solo
  // corrige la distorsión más grosera).
  const metadata = await sharp(buffer).metadata();
  const squareSize = Math.min(metadata.width, metadata.height);
  const left = Math.floor((metadata.width - squareSize) / 2);
  const top = Math.floor((metadata.height - squareSize) / 2);

  const { data } = await sharp(buffer)
    .extract({ left, top, width: squareSize, height: squareSize })
    .resize(w, h, { fit: "fill" }) // mismo fit "estirar" que ctx.drawImage sin mantener aspecto, igual que computeDHash en iconMatch.js — pero ahora sobre un recorte ya cuadrado, no sobre el panorama completo
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // `data` ya viene en escala de grises (1 canal) porque .grayscale()
  // + .raw() colapsa a 1 byte por píxel — coincide con el paso de
  // luminancia 0.299R+0.587G+0.114B que hace iconMatch.js manualmente
  // sobre RGBA (sharp aplica una fórmula de luminancia equivalente).
  const gray = new Float64Array(w * h);
  for (let i = 0; i < gray.length; i++) gray[i] = data[i];
  return dHashFromGrayscale(gray, w, h);
}

async function main() {
  const results = {};
  for (const [map, url] of Object.entries(REFERENCE_URLS)) {
    try {
      const hash = await computeDHashFromUrl(url);
      results[map] = "0x" + hash.toString(16) + "n";
      console.log(`OK   ${map}: ${results[map]}`);
    } catch (err) {
      console.error(`FAIL ${map} (${url}): ${err.message}`);
    }
  }

  console.log("\n// --- Pegar dentro de MAP_ICON_REFERENCE_HASHES en iconMatch.js ---");
  for (const [map, hex] of Object.entries(results)) {
    console.log(`  ${map}: ${hex},`);
  }

  // Punto 4.3.3 de la Guía de seguimiento y resolución de errores:
  // "re-ejecutar iconMatch_regression_test.js... para confirmar que el
  // nuevo recorte no reduce el margen aún más". En vez de dejar esa
  // verificación completamente manual (correr el test aparte y leer su
  // salida), este script calcula aquí mismo la distancia de Hamming
  // MÍNIMA entre cada par de referencias recién generadas — el mismo
  // dato que motivó documentar "21 bits, no 24-25" la ronda anterior —
  // para que quien regenera vea inmediatamente si el fix 4.3.1 empeoró,
  // mejoró o dejó igual ese margen, antes incluso de pegar los hashes
  // en iconMatch.js y correr la suite completa.
  const mapNames = Object.keys(results);
  if (mapNames.length >= 2) {
    let minDist = Infinity;
    let minPair = null;
    for (let i = 0; i < mapNames.length; i++) {
      for (let j = i + 1; j < mapNames.length; j++) {
        const a = BigInt(results[mapNames[i]]);
        const b = BigInt(results[mapNames[j]]);
        const d = hammingDistance(a, b);
        if (d < minDist) {
          minDist = d;
          minPair = [mapNames[i], mapNames[j]];
        }
      }
    }
    console.log(`\n// --- Verificación 4.3.3: margen de Hamming entre las ${mapNames.length} referencias nuevas ---`);
    console.log(`// Distancia mínima entre dos mapas distintos: ${minDist} bits (par: ${minPair[0]} vs ${minPair[1]})`);
    console.log(
      "// Referencia previa (sin el recorte de cuadrado central del fix 4.3.1): 21 bits mínimo (Mirage vs Train).\n" +
      "// Umbral de decisión (MATCH_THRESHOLD_BITS en ocrConstants.js): 16 bits.\n" +
      (minDist <= 16
        ? "// ALERTA: el margen nuevo es <= MATCH_THRESHOLD_BITS — NO pegar estos hashes sin antes revisar el par señalado; iconMatch_regression_test.js fallará."
        : minDist < 21
          ? "// AVISO: el margen se redujo respecto a las referencias anteriores (21 bits) — sigue por encima del umbral, pero vale la pena revisar el par señalado antes de dar el fix por definitivo."
          : "// OK: el margen se mantuvo igual o mejoró respecto a las referencias anteriores (21 bits).")
    );
  }
}

main();

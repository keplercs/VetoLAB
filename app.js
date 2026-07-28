// ============================================================
// App — orquesta OCR, parsing, modelo matemático y render.
// ============================================================

// Grupo 9 #1 de la Guía de seguimiento y resolución de errores —
// "Externalizar constantes de OCR frágiles a un lugar único,
// versionable" (VetoLAB_TAPIT_Analisis_Tecnico.md, Sección 12.6). Ver
// ocrConstants.js para la justificación numérica completa. app.js es
// un archivo exclusivamente de navegador (usa `document`/`els` desde
// el primer render), pero se mantiene el mismo patrón defensivo que
// parser.js/iconMatch.js por consistencia y por si en el futuro algún
// fragmento de este archivo se extrae para test (como ya hace
// app_regression_test.js con looksLikeMapGrid): en el navegador,
// ocrConstants.js ya se cargó como <script> anterior (ver index.html)
// y sus `const` de nivel superior ya están en este mismo scope global
// — el objeto de abajo solo LEE esos nombres ya existentes, nunca los
// vuelve a declarar (evita el SyntaxError de redeclaración).
const APP_OCR_CONST = (typeof module !== "undefined")
  ? require("./ocrConstants.js")
  : { ICON_HUE_SUPPRESS_RANGES };

let state = {
  maps: [], // {map, pA, nA, pB, nB, warnings, needsReview, sourceId, order}
  editingIndex: null,
  perspective: "A", // "A" = ver ventaja desde tu lado (pA-pB) | "B" = ver desde el lado rival (pB-pA)
  nextOrder: 0, // contador incremental para preservar el orden de aparición en la imagen
  compact: true, // Compacto es el modo por defecto: switch a la izquierda = Compacto (sin contexto FaceIt).
  // Detallado (switch a la derecha) agrega el contexto FaceIt a cada tarjeta — el antiguo
  // switch separado "Sin/Con contexto FaceIt" se fusionó aquí, no debe quedar un control
  // obsoleto operando en paralelo con otro nombre.
  // `lang` resuelve texto vía `t(key, state.lang)` en toda función de
  // render. Ya no es un valor fijo: se inicializa con
  // `detectInitialLang()` (detección de navigator.language, ver más
  // abajo) y puede cambiarse en caliente desde el selector de idioma
  // del header (#langSwitch), sin recargar la página.
  lang: resolveInitialLang(),
};

// ============================================================
// Selector de idioma (header, junto a "¿Cómo funciona?")
//
// DETECCIÓN AUTOMÁTICA: al cargar la página, se usa el idioma del
// navegador (`navigator.language`, ej. "es-MX", "en-US", "fr-FR") para
// elegir un idioma inicial razonable. Solo se distinguen dos casos:
//   - el idioma del navegador empieza con "es" (cualquier variante
//     regional: es-ES, es-MX, es-AR...) -> español.
//   - CUALQUIER OTRO idioma (en, fr, de, pt, ja, etc.) -> inglés, como
//     fallback universal — el proyecto solo tiene diccionario ES/EN
//     (ver i18n.js), así que un francófono ve inglés antes que un
//     español que no habla, igual que la convención habitual de la
//     mayoría de sitios bilingües ES/EN.
// El usuario puede sobreescribir esta detección en cualquier momento
// con el selector visible. Ese cambio SÍ se persiste entre sesiones
// (Grupo 5 #1 de la Guía de seguimiento y resolución de errores) vía
// una única clave de `localStorage` (`LANG_STORAGE_KEY`, ver
// `resolveInitialLang()`/`setLang()` más abajo) — se acepta
// conscientemente como el único punto de persistencia de todo el
// proyecto, porque es exactamente el caso que lo amerita: sin esto,
// cualquier elección manual del usuario se perdía en cada recarga,
// volviendo siempre a la detección automática por navegador.
function detectInitialLang() {
  const navLang = (navigator.language || navigator.userLanguage || "en").toLowerCase();
  return navLang.startsWith("es") ? "es" : "en";
}

// Grupo 5 #1 de la Guía de seguimiento y resolución de errores —
// "Falta persistencia del idioma seleccionado manualmente". Antes,
// `state.lang` se inicializaba SIEMPRE con `detectInitialLang()`
// (detección por `navigator.language`), así que cualquier elección
// manual del usuario en el selector se perdía en la siguiente carga
// de página. `resolveInitialLang()` intenta primero leer una elección
// manual persistida en `localStorage` (clave `LANG_STORAGE_KEY`,
// validando que el valor sea exactamente "es" o "en" — nunca se
// confía ciegamente en el contenido de storage, que puede haber sido
// modificado o corrompido fuera de esta app) y solo si no existe o la
// lectura falla (modo privado, política de navegador que bloquea
// storage, etc.) cae al comportamiento anterior de detección por
// idioma del navegador. Este es el único punto de persistencia de
// todo el proyecto (ver comentario histórico más arriba); se acepta
// conscientemente como el único caso que lo amerita, en vez de dejar
// que cada selección manual se pierda en cada recarga.
const LANG_STORAGE_KEY = "vetolab_lang";

function resolveInitialLang() {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored === "es" || stored === "en") return stored;
  } catch (err) {
    // Storage inaccesible (modo privado, política del navegador, etc.):
    // se seguirá con la detección normal, sin propagar el error.
  }
  return detectInitialLang();
}

// Banderas como SVG inline (mismo criterio que el resto de los íconos
// del proyecto: nunca imágenes externas ni glifos de fuente/emoji,
// que varían de apariencia según SO/fuente instalada). Círculo de
// recorte vía <clipPath> para que ambas encajen en el contenedor
// circular de 16x16 que define el CSS (.flag), sin depender de que el
// SVG "sepa" que va a mostrarse recortado en un círculo.
const FLAG_ES = `<svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <clipPath id="clipEs"><circle cx="12" cy="12" r="12"/></clipPath>
  <g clip-path="url(#clipEs)">
    <rect width="24" height="24" fill="#AA151B"/>
    <rect y="6" width="24" height="12" fill="#F1BF00"/>
  </g>
</svg>`;

const FLAG_GB = `<svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <clipPath id="clipGb"><circle cx="12" cy="12" r="12"/></clipPath>
  <g clip-path="url(#clipGb)">
    <rect width="24" height="24" fill="#00247D"/>
    <path d="M0 0 L24 24 M24 0 L0 24" stroke="#FFFFFF" stroke-width="4.5"/>
    <path d="M0 0 L24 24 M24 0 L0 24" stroke="#CF142B" stroke-width="1.6"/>
    <path d="M12 0 V24 M0 12 H24" stroke="#FFFFFF" stroke-width="7.5"/>
    <path d="M12 0 V24 M0 12 H24" stroke="#CF142B" stroke-width="4.2"/>
  </g>
</svg>`;

const FLAG_BY_LANG = { es: FLAG_ES, en: FLAG_GB };
const LANG_CODE_LABEL = { es: "ESP", en: "ENG" };

// ============================================================
// Punto 10 de la Matriz de priorización: carga diferida real de
// Tesseract.js.
//
// ANTES: <script src=".../tesseract.min.js"> vivía en el <head> de
// index.html — el navegador lo descargaba SIEMPRE, aunque el usuario
// nunca llegara a subir ninguna imagen. Tesseract.js (+ su worker
// WASM) es, con diferencia, el recurso más pesado de toda la página
// (varios MB), y cargarlo eager retrasaba el primer render por un
// costo que la mayoría de las visitas ni siquiera necesitan pagar.
//
// AHORA: el <script> ya no existe en el HTML. `loadTesseractScript()`
// lo inyecta dinámicamente la PRIMERA vez que de verdad hace falta —
// dentro de runOCR(), justo antes de la primera llamada real a
// `Tesseract.*` — y cachea la promesa en `tesseractLoadPromise` para
// que subir una segunda o tercera imagen en la misma sesión reutilice
// el script ya cargado en vez de volver a inyectarlo.
//
// index.html sí conserva un <link rel="preconnect"> al CDN (costo
// mínimo, no bloquea render) para que, si el usuario efectivamente
// sube una imagen, el handshake TLS con cdnjs ya esté adelantado y la
// carga diferida sea lo más rápida posible una vez disparada.
// ============================================================
const TESSERACT_CDN_URL = "https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.0.4/tesseract.min.js";

// NOTA DE SEGURIDAD PENDIENTE (punto 10, recomendación 3 de la
// revisión técnica): lo ideal es añadir Subresource Integrity
// (`integrity="sha384-..."` + `crossorigin="anonymous"`) a este script
// de terceros con permisos de ejecución total en la página. No se
// fija aquí un hash porque no hay forma de verificarlo de forma
// confiable desde este entorno (sin acceso de red saliente para
// descargar el binario exacto y calcularlo) — un hash SRI incorrecto
// ROMPE la carga por completo (el navegador bloquea el script si no
// coincide), lo cual sería peor que no tener SRI. Para completarlo:
// 1. Abrir https://cdnjs.com/libraries/tesseract.js/5.0.4
// 2. Copiar el hash con el botón "Copy SRI Hash" del archivo
//    tesseract.min.js
// 3. Pegarlo abajo en `TESSERACT_SRI_HASH` (o null para omitir el
//    atributo, comportamiento actual).
const TESSERACT_SRI_HASH = null;

let tesseractLoadPromise = null;

function loadTesseractScript() {
  if (window.Tesseract) return Promise.resolve();
  if (tesseractLoadPromise) return tesseractLoadPromise;

  tesseractLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TESSERACT_CDN_URL;
    if (TESSERACT_SRI_HASH) {
      script.integrity = TESSERACT_SRI_HASH;
      script.crossOrigin = "anonymous";
    }
    script.onload = () => resolve();
    script.onerror = () => {
      // Si falla, se limpia la promesa cacheada para permitir reintentar
      // en un próximo intento de OCR (ej. corte de red momentáneo) en
      // vez de dejar la carga permanentemente rota para toda la sesión.
      tesseractLoadPromise = null;
      reject(new Error("No se pudo cargar Tesseract.js desde el CDN"));
    };
    document.head.appendChild(script);
  });

  return tesseractLoadPromise;
}

const els = {
  dropZone: document.getElementById("dropZone"),
  fileInput: document.getElementById("fileInput"),
  thumbs: document.getElementById("thumbs"),
  scanStatus: document.getElementById("scanStatus"),
  progLabel: document.getElementById("progLabel"),
  progFill: document.getElementById("progFill"),
  progPct: document.getElementById("progPct"),
  mapList: document.getElementById("mapList"),
  mapsSection: document.getElementById("mapsSection"),
  resultsWrap: document.getElementById("resultsWrap"),
  mainEl: document.getElementById("mainEl"),
  banList: document.getElementById("banList"),
  pickList: document.getElementById("pickList"),
  perspectiveSwitch: document.getElementById("perspectiveSwitch"),
  sideLeftLabel: document.getElementById("sideLeftLabel"),
  sideRightLabel: document.getElementById("sideRightLabel"),
  compactSwitch: document.getElementById("compactSwitch"),
  compactOffLabel: document.getElementById("compactOffLabel"),
  compactOnLabel: document.getElementById("compactOnLabel"),
  addManual: document.getElementById("addManual"),
  howBtn: document.getElementById("howBtn"),
  howBtnLabel: document.getElementById("howBtnLabel"),
  howModal: document.getElementById("howModal"),
  closeModal: document.getElementById("closeModal"),
  langSwitch: document.getElementById("langSwitch"),
  langBtn: document.getElementById("langBtn"),
  langBtnFlag: document.getElementById("langBtnFlag"),
  langBtnCode: document.getElementById("langBtnCode"),
  langMenu: document.getElementById("langMenu"),
  langOptEs: document.getElementById("langOptEs"),
  langOptEn: document.getElementById("langOptEn"),
};

// ---------- Modal "¿Cómo funciona?" ----------

function openHowModal() {
  els.howModal.classList.add("open");
}
function closeHowModal() {
  els.howModal.classList.remove("open");
}
els.howBtn.addEventListener("click", openHowModal);
els.closeModal.addEventListener("click", closeHowModal);
els.howModal.addEventListener("click", (e) => {
  if (e.target === els.howModal) closeHowModal(); // clic fuera del panel
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && els.howModal.classList.contains("open")) closeHowModal();
});

// ---------- Selector de idioma ----------

// Pinta banderas + código, marca la opción activa en el menú, y
// traduce el texto estático del header (el botón "¿Cómo funciona?" y
// el contenido del modal, que no pasa por render() como las tarjetas
// de mapa). Se llama una vez al cargar y cada vez que cambia state.lang.
function applyLangToStaticUI() {
  const lang = state.lang;
  els.langBtnFlag.innerHTML = FLAG_BY_LANG[lang];
  els.langBtnCode.textContent = LANG_CODE_LABEL[lang];
  els.langBtn.setAttribute("aria-label", t("ui.lang_switch_label", lang));

  els.langOptEs.classList.toggle("active", lang === "es");
  els.langOptEn.classList.toggle("active", lang === "en");
  els.langOptEs.setAttribute("aria-selected", String(lang === "es"));
  els.langOptEn.setAttribute("aria-selected", String(lang === "en"));

  els.howBtnLabel.textContent = t("ui.how_it_works_btn", lang);
  document.documentElement.lang = lang;
}

// Rellena las banderas dentro del propio menú (ES/EN), una sola vez —
// a diferencia del botón principal (que cambia según el idioma
// activo), las opciones del menú siempre muestran SU PROPIA bandera
// fija, sin importar cuál esté seleccionada.
els.langOptEs.querySelector(".flag").innerHTML = FLAG_ES;
els.langOptEn.querySelector(".flag").innerHTML = FLAG_GB;

function openLangMenu() {
  els.langMenu.classList.add("open");
  els.langBtn.setAttribute("aria-expanded", "true");
}
function closeLangMenu() {
  els.langMenu.classList.remove("open");
  els.langBtn.setAttribute("aria-expanded", "false");
}
function setLang(lang) {
  if (state.lang === lang) { closeLangMenu(); return; }
  state.lang = lang;
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch (err) {
    // Igual que en resolveInitialLang(): si storage no está disponible,
    // el cambio de idioma sigue funcionando para esta sesión, solo no
    // sobrevive a un refresh — no es un error que deba interrumpir nada.
  }
  applyLangToStaticUI();
  render(); // re-traduce todo el texto dinámico (tarjetas, chips, listas de prioridad)
  closeLangMenu();
}

els.langBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const isOpen = els.langMenu.classList.contains("open");
  if (isOpen) closeLangMenu(); else openLangMenu();
});
els.langOptEs.addEventListener("click", () => setLang("es"));
els.langOptEn.addEventListener("click", () => setLang("en"));

document.addEventListener("click", (e) => {
  if (!els.langSwitch.contains(e.target)) closeLangMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && els.langMenu.classList.contains("open")) closeLangMenu();
});

applyLangToStaticUI();

// ---------- Uploader interactions ----------

els.dropZone.addEventListener("click", (e) => {
  if (e.target.closest(".thumb")) return;
  els.fileInput.click();
});

["dragover", "dragleave", "drop"].forEach((evt) => {
  els.dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (evt === "dragover") els.dropZone.classList.add("drag");
    if (evt === "dragleave" || evt === "drop") els.dropZone.classList.remove("drag");
  });
});
els.dropZone.addEventListener("drop", (e) => {
  const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
  if (files.length) handleFiles(files);
});
els.fileInput.addEventListener("change", (e) => {
  const files = [...e.target.files];
  if (files.length) handleFiles(files);
});

// Pegado desde el portapapeles (Ctrl+V / Cmd+V).
document.addEventListener("paste", (e) => {
  if (els.howModal.classList.contains("open")) return;
  const active = document.activeElement;
  if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;

  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  const files = [];
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  if (files.length) {
    e.preventDefault();
    handleFiles(files);
  }
});

// Grupo 4 #1 de la Guía de seguimiento y resolución de errores ("carga
// de imágenes: restringir a una sola") — el veto es sobre un único
// conjunto de mapas por partida, así que no tiene sentido de negocio
// mantener varias capturas de origen distinto activas en la misma
// sesión (dos capturas no pueden pertenecer a dos vetos simultáneos).
//
// ANTES: `<input multiple>` + este `forEach` permitían acumular N
// imágenes, cada una fusionada vía `mergeMaps` — lo que obligaba a
// `mergeMaps` a resolver "colisión entre fuentes" (mismo nombre de
// mapa detectado en dos imágenes distintas) como si fuera un caso
// normal esperado, cuando en realidad no debería poder ocurrir si solo
// existe una imagen a la vez.
//
// AHORA: cualquier imagen nueva REEMPLAZA por completo el estado
// anterior (decisión tomada explícitamente: reemplazo automático, sin
// pedir confirmación) — se limpia `state.maps`, `state.nextOrder`, el
// contenedor de miniaturas (`els.thumbs`) y cualquier progreso de OCR
// en pantalla antes de procesar la nueva captura. Si llegan varios
// archivos a la vez (ej. selección múltiple burlando el `<input>` sin
// `multiple`, o un drop con más de un archivo), solo se conserva el
// primero — coherente con "un solo veto, una sola imagen a la vez" en
// vez de silenciosamente aceptar el resto.
function handleFiles(files) {
  const file = files[0];
  if (!file) return;

  state.maps = [];
  state.nextOrder = 0;
  state.editingIndex = null;
  els.thumbs.innerHTML = "";
  els.scanStatus.style.display = "none";
  render();

  const sourceId = `src_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const url = URL.createObjectURL(file);
  const thumb = document.createElement("div");
  thumb.className = "thumb";
  thumb.dataset.sourceId = sourceId;
  thumb.innerHTML = `<img src="${url}"><div class="rm" role="button" aria-label="Quitar imagen"><svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 3 L13 13 M13 3 L3 13"/></svg></div>`;
  thumb.querySelector(".rm").addEventListener("click", (e) => {
    e.stopPropagation();
    thumb.remove();
    state.maps = state.maps.filter((m) => m.sourceId !== sourceId);
    render();
  });
  els.thumbs.appendChild(thumb);
  runOCR(file, url, sourceId);
}

// ---------- Detección de filas por geometría + OCR por fila ----------

function loadImageToCanvas(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext("2d").drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = reject;
    img.src = url;
  });
}

const STATS_ZONE_X_START = 0.55;
const STATS_ZONE_X_END = 0.98;

// Grupo 7 de la Guía de seguimiento y resolución de errores —
// "identificación de mapa por ícono, con OCR de texto como
// corroboración". Zona horizontal donde vive el ícono/thumbnail del
// mapa dentro de la fila (posición fija en la interfaz de TAPIT.GG:
// el bloque miniatura+nombre+★ ocupa el inicio de la fila, ANTES de
// donde empieza la franja de stats — ver STATS_ZONE_X_START arriba,
// que ya marca ese mismo límite desde el otro lado). Se usa un rango
// angosto (0 a 0.14) en vez de todo el tramo hasta STATS_ZONE_X_START
// porque el ícono en sí es un cuadrado pequeño al extremo izquierdo;
// el resto del tramo izquierdo es el nombre de texto del mapa (zona
// que ya cubre `findMapNameInRow`/MAP_NAME_PATTERN sobre el propio
// texto OCR, no sobre imagen).
const ICON_ZONE_X_START = 0;
const ICON_ZONE_X_END = 0.14;

// ------------------------------------------------------------
// Grupo 11 de la Guía de seguimiento y resolución de errores —
// "corroboración de lado (propio/rival) vía color de texto de
// comparación", versión CORREGIDA respecto al planteamiento original
// del análisis técnico (§10: "validación cruzada del signo del
// diferencial"). Verificado en dos pasos, no asumido:
//
//   1. Contra el bundle real de TAPIT.GG (content.js v1.16.6): el
//      color de cada mitad de la franja de stats es
//      `c>A ? "text-green-500" : c===A ? "text-gray-500" : "text-red-500"`
//      para el lado propio, e inverso para el lado rival — donde `c`
//      y `A` son los mismos winRate que ya lee el OCR de texto. Es
//      decir: el color es una función DETERMINISTA de los mismos dos
//      números que el OCR ya intenta leer, no una fuente de datos
//      independiente. Por eso NO se implementa como validador del
//      signo de `pA - pB` (correlacionaría con el mismo error de OCR
//      que se buscaría detectar, dando falsa confianza) — ver
//      discusión completa en la conversación de depuración de esta
//      ronda.
//   2. Contra una captura real de TAPIT.GG (medición de píxeles): el
//      bloque de color de cada lado NO ocupa toda la franja de stats
//      (STATS_ZONE_X_START=0.55 a 0.98), sino una sub-franja angosta
//      y centrada — medido en 5 filas reales: lado propio en
//      x≈0.38–0.49 del ancho total de fila, lado rival en
//      x≈0.57–0.70. Verde real ≈ RGB(12,196,80) (Tailwind green-500
//      #22c55e), rojo real ≈ RGB(250,43,45) (Tailwind red-500
//      #ef4444) — ambos con muy poca desviación del valor Tailwind
//      nominal, confirmando que sobreviven razonablemente bien a la
//      compresión de una captura de pantalla típica.
//
// USO CORREGIDO: en vez de validar el signo de un delta ya calculado,
// esta zona sirve para CORROBORAR qué lado del separador es el propio
// y cuál el rival cuando el patrón numérico de una fila se lee pero
// el layout resulta ambiguo (ver `sampleComparisonColorSide` más
// abajo) — análogo en espíritu a `identifyMapByIcon` (Grupo 7): una
// señal visual independiente del texto, usada solo como corroboración
// cuando hace falta, nunca como fuente primaria ni como override de
// un resultado numérico ya obtenido con confianza.
const COMPARISON_COLOR_ZONE_OWN = { xStart: 0.36, xEnd: 0.51 };
const COMPARISON_COLOR_ZONE_RIVAL = { xStart: 0.56, xEnd: 0.72 };
// Umbral de dominancia de canal para clasificar un píxel como
// verde/rojo "real" de Tailwind (no ruido de JPEG ni el dorado del
// ícono de ranking, que en la captura medida se solapó en valores
// como RGB(207,160,29) — alto R Y alto G a la vez, distinto del rojo
// puro que exige R alto con G/B bajos, o del verde puro que exige G
// alto con R/B bajos).
const COMPARISON_COLOR_DOMINANCE = 45;

function estimateBackgroundColor(imgData, width, height, xStart, xEnd) {
  const samples = [];
  for (let y = 0; y < height; y += 2) {
    const rowStart = y * width * 4;
    for (let x = xStart; x < xEnd; x += 2) {
      const i = rowStart + x * 4;
      const lum = 0.299 * imgData[i] + 0.587 * imgData[i + 1] + 0.114 * imgData[i + 2];
      samples.push({ r: imgData[i], g: imgData[i + 1], b: imgData[i + 2], lum });
    }
  }
  samples.sort((a, b) => a.lum - b.lum);
  const darkest = samples.slice(0, Math.max(1, Math.floor(samples.length * 0.1)));
  const n = darkest.length;
  const sum = darkest.reduce((acc, p) => ({ r: acc.r + p.r, g: acc.g + p.g, b: acc.b + p.b }), { r: 0, g: 0, b: 0 });
  return { r: sum.r / n, g: sum.g / n, b: sum.b / n };
}

// Punto 17 de la Matriz de priorización ("Escaneo de imagen a
// resolución completa sin downsampling previo", app.js, Media/Media):
//
// ANTES: `detectRowBands` y `estimateBackgroundColor` recorrían TODOS
// los píxeles de la imagen original en dos pasadas completas (una para
// estimar el color de fondo, otra para el perfil de distancia de color
// por fila) antes de siquiera decidir si el pipeline por fila es
// aplicable. En capturas móviles de alta densidad esto es un número de
// operaciones significativo en el hilo principal, para un resultado
// (los límites y0/y1 de cada banda) que no necesita precisión de
// sub-píxel de la imagen completa — solo ubicar razonablemente bien
// dónde empieza y termina cada fila.
//
// AHORA: la detección corre sobre una versión reducida del canvas
// (ancho máximo `BAND_DETECTION_MAX_WIDTH = 600px`, la imagen original
// se deja intacta si ya es más angosta que eso) y las coordenadas de
// las bandas resultantes (`y0`/`y1`/`h`) se reescalan de vuelta a la
// resolución original antes de retornar — el resto del pipeline
// (`cropRowToDataURL`, que sigue trabajando sobre `sourceCanvas` a
// resolución completa y además escala 3-4x para el propio OCR) no
// necesita ningún cambio, porque recibe bandas ya expresadas en las
// coordenadas que espera. Esto recorta el costo de las dos pasadas de
// análisis de píxeles en un orden de magnitud para capturas grandes,
// sin perder precisión donde de verdad importa (el recorte final que
// efectivamente lee Tesseract).
const BAND_DETECTION_MAX_WIDTH = 600;

function buildDownsampledCanvas(canvas, maxWidth) {
  const { width, height } = canvas;
  if (width <= maxWidth) {
    // Ya es más angosta que el límite: no hace falta reducir nada, se
    // analiza tal cual (evita un downscale que no ahorraría trabajo).
    return { canvas, scale: 1 };
  }
  const scale = maxWidth / width;
  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.round(width * scale));
  small.height = Math.max(1, Math.round(height * scale));
  const sctx = small.getContext("2d");
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = "medium";
  sctx.drawImage(canvas, 0, 0, small.width, small.height);
  return { canvas: small, scale };
}

// Grupo 1 de la Guía de seguimiento y resolución de errores — "Fix de
// anclaje por thumbnail". Extracción de la lógica de banding original
// (idéntica en su fórmula de threshold/gap, sin cambios), parametrizada
// por la franja horizontal (xStartRatio/xEndRatio) sobre la que mide
// distancia de color contra el fondo. Esto permite correr exactamente
// el mismo algoritmo sobre dos franjas distintas de la fila — el
// thumbnail (ICON_ZONE_X_START..END) y el texto de stats
// (STATS_ZONE_X_START..END) — y comparar sus resultados en
// `detectRowBands`, en vez de depender de una sola franja como fuente
// única de verdad geométrica.
//
// POR QUÉ EL THUMBNAIL ES UN ANCLA MÁS FIABLE: confirmado contra el
// bundle real de TAPIT.GG (VetoLAB_TAPIT_Analisis_Tecnico.md, §4.3) —
// el propio selector que usa FACEIT para listar filas de veto exige
// `:has([src*="games"])`, es decir, ancla cada fila a la presencia de
// la miniatura del mapa, no al texto. Una miniatura fotográfica de
// bordes duros produce un salto de contraste contra el fondo oscuro
// mucho más nítido y estable que el texto disperso (números, %,
// separador de 4x4px) que mide la franja de stats — que es
// precisamente la zona donde `pad` puede invadir la fila vecina en
// layouts compactos (ver bug de winrate fusionado, Grupo 3).
function detectBandsInZone(analysisCanvas, xStartRatio, xEndRatio) {
  const ctx = analysisCanvas.getContext("2d");
  const { width, height } = analysisCanvas;
  const imgData = ctx.getImageData(0, 0, width, height).data;

  const xStart = Math.floor(width * xStartRatio);
  const xEnd = Math.floor(width * xEndRatio);
  const bg = estimateBackgroundColor(imgData, width, height, xStart, xEnd);

  const rowDist = new Float32Array(height);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    let count = 0;
    const rowStart = y * width * 4;
    for (let x = xStart; x < xEnd; x++) {
      const i = rowStart + x * 4;
      const dr = imgData[i] - bg.r;
      const dg = imgData[i + 1] - bg.g;
      const db = imgData[i + 2] - bg.b;
      sum += Math.sqrt(dr * dr + dg * dg + db * db);
      count++;
    }
    rowDist[y] = count ? sum / count : 0;
  }

  const sorted = Float32Array.from(rowDist).sort();
  const floorLevel = sorted[Math.floor(sorted.length * 0.1)];
  const maxLevel = sorted[sorted.length - 1];
  const threshold = floorLevel + Math.max(6, 0.15 * (maxLevel - floorLevel));

  const rawBands = [];
  let start = null;
  let gap = 0;
  for (let y = 0; y < height; y++) {
    const isContent = rowDist[y] > threshold;
    if (isContent) {
      if (start === null) start = y;
      gap = 0;
    } else if (start !== null) {
      gap++;
      if (gap > 4) {
        rawBands.push({ y0: start, y1: y - gap, h: y - gap - start });
        start = null;
        gap = 0;
      }
    }
  }
  if (start !== null) rawBands.push({ y0: start, y1: height, h: height - start });

  if (rawBands.length === 0) return { bands: [], bg };
  const maxH = Math.max(...rawBands.map((b) => b.h));
  const filtered = rawBands.filter((b) => b.h >= maxH * 0.5);

  return { bands: filtered, bg };
}

// Grupo 1: punto de entrada. Corre la detección sobre AMBAS franjas
// (thumbnail y texto) y decide cuál usar:
//
//   - Si ambas coinciden en el NÚMERO de bandas detectadas (y hay al
//     menos una), se usan los límites y0/y1 de la franja de
//     THUMBNAIL — bordes de caja fotográfica más nítidos y estables
//     que el texto disperso, según lo confirmado en el comentario de
//     `detectBandsInZone` arriba. El color de fondo (`bg`) SIEMPRE se
//     toma de la franja de texto, nunca del thumbnail: el "fondo" de
//     la zona de thumbnail es la propia miniatura fotográfica, no el
//     fondo oscuro uniforme de la fila, así que no es un valor válido
//     para `suppressIconColors`/`applyGrayscaleAutocontrast` más
//     adelante en el pipeline.
//   - Si divergen (o cualquiera de las dos no detectó nada), se
//     conserva el comportamiento histórico (franja de texto) como
//     fallback seguro, y se marca `mismatch: true` para que `runOCR`
//     pueda adjuntar un warning explícito (`band_source_mismatch`) —
//     nunca se decide en silencio cuál de las dos lecturas geométricas
//     divergentes es la correcta.
function detectRowBands(canvas) {
  const { canvas: analysisCanvas, scale } = buildDownsampledCanvas(canvas, BAND_DETECTION_MAX_WIDTH);

  const byThumbnail = detectBandsInZone(analysisCanvas, ICON_ZONE_X_START, ICON_ZONE_X_END);
  const byText = detectBandsInZone(analysisCanvas, STATS_ZONE_X_START, STATS_ZONE_X_END);

  const agree = byThumbnail.bands.length > 0 &&
    byThumbnail.bands.length === byText.bands.length;

  const chosenBands = agree ? byThumbnail.bands : byText.bands;
  const source = agree ? "thumbnail" : "text";
  // Discrepancia real: cualquier desacuerdo en el conteo salvo el caso
  // "ninguna de las dos zonas detectó nada" (byText.bands.length===0 Y
  // byThumbnail.bands.length===0), que no es una discrepancia sino una
  // ausencia total de contenido — ya cubierta más adelante por el
  // camino normal de "0 filas detectadas" en runOCR, sin necesidad de
  // un warning adicional. Un thumbnail vacío mientras el texto SÍ
  // detecta filas (o viceversa) sí es señal real de que la geometría
  // de esta captura es atípica (recorte sin columna de miniaturas,
  // franja de stats con ruido ajeno, etc.).
  const mismatch = !agree && (byThumbnail.bands.length > 0 || byText.bands.length > 0);

  // Reescalado de vuelta a la resolución original del canvas de entrada
  // (`canvas`, no `analysisCanvas`) — invisible para quien llama: si
  // `scale === 1` (imagen ya angosta) esto es una identidad exacta.
  const invScale = 1 / scale;
  const bands = chosenBands.map((b) => ({
    y0: Math.round(b.y0 * invScale),
    y1: Math.round(b.y1 * invScale),
    h: Math.round(b.h * invScale),
  }));

  // `bg` siempre proviene de la franja de texto (ver nota arriba) —
  // nunca de `byThumbnail.bg`.
  return { bands, bg: byText.bg, source, mismatch };
}

// Punto 11 de la Matriz de priorización ("fallbackPool depende de un
// conteo geométrico no validado", app.js, Media/Media):
//
// ANTES: este gate aceptaba cualquier conteo de bandas entre 3 y 10
// (con la sola condición adicional de que las alturas fueran
// razonablemente uniformes) y dejaba pasar ESE conteo tal cual al
// pipeline por fila (`runPerRowOCR` → `buildFallbackPool(bands.length)`
// en app.js). El problema: `buildFallbackPool` (parser.js) solo tiene
// un orden posicional CONFIABLE para 3, 7 u 8 filas — ver su propio
// comentario ("no existe un orden posicional confiable para 3-6" /
// "tamaño inesperado (>8): fallback conservador, ya queda marcado ⚠
// igual"). Para cualquier otro conteo (4, 5, 6, 9, 10 — típicamente el
// resultado de que `detectRowBands` cuente una banda de más o de menos
// por ruido de UI dentro de la franja analizada), el sistema igual
// entraba al pipeline por fila y terminaba usando el fallback
// conservador `STANDARD_ORDER` completo, que puede quedar mal
// dimensionado para TODA la captura (no solo una fila) sin que nada lo
// valide antes de comprometerse con ese conteo.
//
// AHORA: `looksLikeMapGrid` solo aprueba el pipeline por fila cuando
// `bands.length` es exactamente uno de los tamaños de pool conocidos y
// válidos (`RELIABLE_BAND_COUNTS`, la misma fuente de verdad que usa
// `buildFallbackPool` en parser.js para decidir si existe o no un
// orden posicional confiable). Cualquier otro conteo — incluyendo los
// que antes entraban "por defecto" al fallback conservador — hace que
// `runOCR` (más abajo) degrade directamente a `runWholeImageOCR`, que
// no depende en absoluto de contar bandas ni de un pool posicional
// fijo. Esto no reduce la cobertura real: los casos de 3/7/8 mapas
// (los únicos con un pool de fallback confiable) se siguen procesando
// por fila igual que antes; los demás simplemente dejan de arriesgarse
// a un pool mal dimensionado y usan la ruta que ya existía como
// respaldo general.
//
// ACTUALIZACIÓN (bug real reportado 26/07/2026 — Dust2/Mirage no
// reconocidos en una captura de 5 filas): la premisa de arriba
// mezclaba dos preguntas DISTINTAS bajo un solo criterio — "¿el
// conteo de bandas es geométricamente plausible?" y "¿existe un
// fallback POSICIONAL confiable si el OCR de texto falla?" — y
// resolvía ambas con el mismo criterio (`RELIABLE_BAND_COUNTS = {3,7,8}`,
// idéntico al dominio de `buildFallbackPool`). Evidencia real (Tesseract
// 5.3.4, misma versión que usa el proyecto, corrido directamente sobre
// una captura real de 5 filas): con `runWholeImageOCR` (PSM 3,
// segmentación automática de página completa), Tesseract PERDÍA por
// completo las líneas de Dust2 y Mirage al segmentar mal el layout de
// una imagen angosta con thumbnails — no por contraste ni por ruido de
// ícono, sino por un problema de PSM/segmentación de layout. Con el
// pipeline por fila (`runPerRowOCR`, PSM 7 — línea única de texto, cada
// banda ya aislada geométricamente ANTES de correr OCR), las 5 filas
// se reconocieron limpias, incluyendo Dust2 y Mirage.
//
// Es decir: el OCR de texto por fila (PSM 7) es estructuralmente
// superior al de imagen completa (PSM 3) para este layout, INDEPENDIENTE
// de si existe o no un pool de fallback posicional confiable para ese
// conteo. Excluir 4/5/6 de `RELIABLE_BAND_COUNTS` negaba ese beneficio
// incluso en el caso común (el OCR de texto por fila SÍ reconoce el
// nombre, y el fallback posicional nunca llega a necesitarse). Por eso
// `RELIABLE_BAND_COUNTS` se amplía aquí a {3,4,5,6,7,8} — el rango
// completo que ya cubre `isPlausibleMapCount`/`MIN_PLAUSIBLE_MAP_COUNT`/
// `MAX_PLAUSIBLE_MAP_COUNT` en parser.js como geométricamente posible
// dado el pool real de FACEIT esta temporada — mientras que
// `buildFallbackPool` SIGUE devolviendo `null` para 4/5/6 sin ningún
// cambio: si en algún caso el OCR de texto por fila SÍ falla en una
// captura de 4-6 filas, el sistema sigue etiquetando esa fila como
// "Mapa sin identificar" en vez de inventar una posición falsa, exactamente
// como ya diseñaba el fix anterior. Ambas propiedades ("conteo confiable
// para correr el pipeline por fila" y "pool posicional no-nulo") siguen
// siendo independientes entre sí — ver el comentario de
// `buildFallbackPool` en parser.js y los tests de `app_regression_test.js`
// que ya verificaban esta distinción para el caso 3 — solo que ahora
// también aplica a 4, 5 y 6, no solo a 3.
const RELIABLE_BAND_COUNTS = new Set([3, 4, 5, 6, 7, 8]);

function looksLikeMapGrid(bands) {
  if (!RELIABLE_BAND_COUNTS.has(bands.length)) return false;
  const heights = bands.map((b) => b.h);
  return Math.max(...heights) / Math.min(...heights) < 2.2;
}

// ------------------------------------------------------------
// Grupo 1 #1 de la Guia de seguimiento y resolucion de errores --
// "No existe un rechazo explicito de conteos imposibles".
//
// ANTES: un conteo de bandas geometricamente IMPOSIBLE dado el juego
// real (ej. 12 bandas detectadas -- el pool de veto de FACEIT esta
// temporada nunca puede producir mas de 8 filas ni menos de 3, ver
// `isPlausibleMapCount`/`MIN_PLAUSIBLE_MAP_COUNT`/
// `MAX_PLAUSIBLE_MAP_COUNT` en parser.js) caia por el mismo camino que
// un conteo de 4/5/6 (posible pero infrecuente): `looksLikeMapGrid`
// devolvia `false` para ambos por igual, degradando silenciosamente a
// `runWholeImageOCR` sin ninguna senal de que, a diferencia de 4/5/6,
// ese conteo no puede corresponder a una captura real del veto -- es
// evidencia de que la deteccion de bandas (o el recorte/imagen
// subida) fallo, no solo de que cayo en un regimen "menos confiable".
//
// AHORA: `flagImplausibleBandCount` se consulta en `runOCR` justo
// despues de `detectRowBands`, ANTES de decidir el pipeline. Si el
// conteo es implausible, se registra para adjuntar un warning
// explicito y distinto ("conteo de filas geometricamente imposible --
// revisar recorte", `warning.band_count_implausible` en i18n.js) a
// cada fila que finalmente se extraiga por el camino de
// `runWholeImageOCR` (que sigue intentandose igual -- un conteo de
// bandas raro no impide que el patron numerico de texto si encuentre
// filas reales; simplemente ya no se pretende que la geometria haya
// sido confiable). No se usa para bloquear el analisis ni para lanzar
// una excepcion: sigue siendo mejor mostrar datos con advertencia
// explicita que no mostrar nada.
function flagImplausibleBandCount(bandCount) {
  if (bandCount === 0) return false; // "0 filas" ya tiene su propio mensaje dedicado en runOCR, no se duplica aqui
  return typeof isPlausibleMapCount === "function" && !isPlausibleMapCount(bandCount);
}

function applyGrayscaleAutocontrast(ctx, w, h) {
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  let min = 255, max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < d.length; i += 4) {
    const g = ((d[i] - min) / range) * 255;
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(imgData, 0, 0);
}

// Grupo 8 #2 de la Guía de seguimiento y resolución de errores —
// ANTES: solo se suprimía el rango de matiz dorado/ámbar (30-55°),
// que cubre únicamente el ícono de "mejor mapa" (#c2ae40). Ingeniería
// inversa directa del componente de íconos de ranking de TAPIT.GG
// (VetoLAB_TAPIT_Analisis_Tecnico.md, Sección 7.2/12.2) confirmó que
// existen 4 colores reales, no 1: dorado (mejor), plata/gris (2º
// mejor — sin matiz dominante, no aplica a este filtro), naranja
// Tailwind orange-400 #fb923c (2º peor, hue≈24-27°) y rojo Tailwind
// red-500 #ef4444 (peor, hue≈0-4° y también cerca de 360° por el
// wraparound circular). El rango anterior dejaba pasar naranja y rojo
// sin suprimir, interfiriendo potencialmente con el OCR del nombre de
// mapa cuando el ícono queda pegado al texto. `ICON_HUE_SUPPRESS_RANGES`
// (ocrConstants.js) ahora cubre los 3 matices cromáticos reales;
// plata/gris no necesita rango propio porque el filtro de saturación
// `delta < 40` de abajo ya lo descarta (un gris no tiene un canal
// dominante).
function suppressIconColors(ctx, w, h, bgColor) {
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const delta = max - min;
    if (delta < 40) continue;

    let hue = 0;
    if (delta > 0) {
      if (max === r) hue = 60 * (((g - b) / delta) % 6);
      else if (max === g) hue = 60 * ((b - r) / delta + 2);
      else hue = 60 * ((r - g) / delta + 4);
      if (hue < 0) hue += 360;
    }

    const isRankIconHue = APP_OCR_CONST.ICON_HUE_SUPPRESS_RANGES.some(
      (range) => hue >= range.min && hue <= range.max
    );

    if (isRankIconHue) {
      d[i] = bgColor.r;
      d[i + 1] = bgColor.g;
      d[i + 2] = bgColor.b;
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

function cropRowToDataURL(sourceCanvas, band, xStartRatio = 0, xEndRatio = 1, scale = 3, suppressIcons = null) {
  const pad = Math.max(8, Math.round(band.h * 0.18));
  const y0 = Math.max(0, band.y0 - pad);
  const y1 = Math.min(sourceCanvas.height, band.y1 + pad);
  const fullW = sourceCanvas.width;
  const x0 = Math.floor(fullW * xStartRatio);
  const x1 = Math.ceil(fullW * xEndRatio);
  const w = x1 - x0;
  const h = y1 - y0;

  const out = document.createElement("canvas");
  out.width = w * scale;
  out.height = h * scale;
  const octx = out.getContext("2d");
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(sourceCanvas, x0, y0, w, h, 0, 0, out.width, out.height);
  if (suppressIcons) suppressIconColors(octx, out.width, out.height, suppressIcons);
  applyGrayscaleAutocontrast(octx, out.width, out.height);
  return out.toDataURL("image/png");
}

function cropStatsZoneToDataURL(sourceCanvas, band) {
  return cropRowToDataURL(sourceCanvas, band, Math.max(0, STATS_ZONE_X_START - 0.25), STATS_ZONE_X_END, 4);
}

// Grupo 7: recorte del ícono para `identifyMapByIcon` (iconMatch.js).
// A diferencia de `cropRowToDataURL`, este recorte NO aplica
// `applyGrayscaleAutocontrast` ni `suppressIconColors` — ambos
// preprocesos existen para maximizar la lectura de TEXTO por Tesseract
// (blanco/negro de alto contraste, sin el tinte ámbar que confunde al
// OCR), pero son exactamente lo que hay que EVITAR aquí: el hash
// perceptual de `computeDHash` (iconMatch.js) se calculó sobre
// imágenes de referencia a color, y aplicar el mismo preprocesado
// agresivo movería la imagen recortada lejos de esas referencias en
// vez de acercarla. Se devuelve el canvas crudo (no un dataURL) porque
// `computeDHash` trabaja directamente sobre canvas — evita una vuelta
// innecesaria por codificación PNG/base64 solo para decodificarla de
// nuevo del otro lado.
function cropIconZoneToCanvas(sourceCanvas, band) {
  const pad = Math.max(8, Math.round(band.h * 0.18));
  const y0 = Math.max(0, band.y0 - pad);
  const y1 = Math.min(sourceCanvas.height, band.y1 + pad);
  const fullW = sourceCanvas.width;
  const x0 = Math.floor(fullW * ICON_ZONE_X_START);
  const x1 = Math.ceil(fullW * ICON_ZONE_X_END);
  const w = x1 - x0;
  const h = y1 - y0;

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d");
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(sourceCanvas, x0, y0, w, h, 0, 0, w, h);
  return out;
}

// Grupo 11: clasifica un solo píxel como "verde real" / "rojo real" /
// ninguno, usando dominancia de canal (no solo comparación de matiz)
// para distinguir el verde/rojo Tailwind real del dorado del ícono de
// ranking (que en la captura de referencia medida cae en valores como
// RGB(207,160,29) — R y G ambos altos a la vez, lo que un chequeo
// ingenuo de "R alto" o "G alto" por separado confundiría con rojo o
// verde). Ver COMPARISON_COLOR_DOMINANCE arriba para el umbral.
function classifyComparisonColorPixel(r, g, b) {
  if (g > 140 && g > r + COMPARISON_COLOR_DOMINANCE && g > b + COMPARISON_COLOR_DOMINANCE) return "green";
  if (r > 180 && r > g + COMPARISON_COLOR_DOMINANCE * 2 && r > b + COMPARISON_COLOR_DOMINANCE * 2) return "red";
  return null;
}

// Grupo 11: muestrea el color dominante (verde/rojo/ninguno) de una
// de las dos sub-zonas de comparación de una fila, SOBRE EL CANVAS
// ORIGINAL A COLOR (antes de cropRowToDataURL/applyGrayscaleAutocontrast,
// que colapsarían el color a luminancia). Cuenta píxeles clasificados
// en vez de promediar RGB crudo, para tolerar el propio texto blanco
// del número intercalado dentro de la misma franja (ver estructura
// real del componente P_ del bundle: el conteo de partidas "n" es
// blanco fijo, solo el bloque ícono+porcentaje lleva el color
// condicional) sin que ese blanco diluya el promedio hacia gris.
//
// Devuelve "green" / "red" / null (sin dominancia clara — franja
// gris/empate, mapa ya baneado sin color activo, o zona mal alineada
// por un layout no estándar). NUNCA se usa como fuente primaria: ver
// `corroborateSideFromColor` para cómo se combina con el resultado ya
// obtenido por OCR de texto.
function sampleComparisonColorSide(sourceCanvas, band, zone) {
  const pad = Math.max(4, Math.round(band.h * 0.1));
  const y0 = Math.max(0, band.y0 - pad);
  const y1 = Math.min(sourceCanvas.height, band.y1 + pad);
  const fullW = sourceCanvas.width;
  const x0 = Math.floor(fullW * zone.xStart);
  const x1 = Math.ceil(fullW * zone.xEnd);
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);

  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  const tctx = tmp.getContext("2d");
  tctx.drawImage(sourceCanvas, x0, y0, w, h, 0, 0, w, h);
  const data = tctx.getImageData(0, 0, w, h).data;

  let green = 0, red = 0;
  for (let i = 0; i < data.length; i += 4) {
    const cls = classifyComparisonColorPixel(data[i], data[i + 1], data[i + 2]);
    if (cls === "green") green++;
    else if (cls === "red") red++;
  }

  // Exige un mínimo absoluto de píxeles clasificados (no solo mayoría
  // relativa) para evitar que 2-3 píxeles de ruido JPEG en una franja
  // mayormente vacía se interpreten como una señal de color real.
  const MIN_PIXELS = 6;
  if (green < MIN_PIXELS && red < MIN_PIXELS) return null;
  return green > red ? "green" : red > green ? "red" : null;
}

// Grupo 11: punto de entrada de alto nivel. Corrobora qué lado
// (propio/rival) corresponde a cada mitad de una fila ya parseada,
// usando el color de comparación como señal visual independiente del
// texto — análoga en espíritu a `identifyMapByIcon` (Grupo 7), pero
// para el problema de "lado", no de "qué mapa es". Devuelve
// `{ consistent: boolean, ownColor, rivalColor } | null`.
//
// `consistent` compara el color observado contra lo que el propio
// signo de `pA - pB` (ya leído por OCR de texto) predeciría bajo la
// fórmula real de TAPIT (ver comentario de cabecera junto a
// COMPARISON_COLOR_ZONE_OWN): si pA > pB, el lado propio debería ser
// verde y el rival rojo; si pA < pB, al revés; si pA === pB, ambos
// deberían leer como "sin dominancia" (gris), por lo que un resultado
// de `null` en ambos lados también cuenta como consistente en ese caso.
//
// Deliberadamente NO se usa para sobrescribir pA/pB ni para decidir
// significancia estadística (eso sigue siendo exclusivo de
// `differenceIsSignificant` en math.js, sobre los números ya leídos) —
// ver la discusión de por qué la versión "validador de signo" del
// hallazgo original se descartó (color y texto comparten la misma
// fuente de error de OCR/recorte, así que no son señales verdaderamente
// independientes para ese propósito). Su único uso legítimo es como
// corroboración adicional, expuesta como warning informativo cuando
// hay discrepancia — nunca como bloqueo ni autocorrección silenciosa.
function corroborateSideFromColor(sourceCanvas, band, pA, pB) {
  try {
    const ownColor = sampleComparisonColorSide(sourceCanvas, band, COMPARISON_COLOR_ZONE_OWN);
    const rivalColor = sampleComparisonColorSide(sourceCanvas, band, COMPARISON_COLOR_ZONE_RIVAL);

    if (ownColor === null && rivalColor === null) {
      // Fila sin color activo (mapa ya baneado, ver fila "Nuke" en la
      // captura de referencia) o zona no alineada — sin base para
      // corroborar ni para contradecir. No es un warning, es "no hay
      // señal", tratado igual que `identifyMapByIcon` devolviendo null.
      return null;
    }

    const expectedOwn = pA > pB ? "green" : pA < pB ? "red" : null;
    const expectedRival = pA > pB ? "red" : pA < pB ? "green" : null;

    const consistent = ownColor === expectedOwn && rivalColor === expectedRival;
    return { consistent, ownColor, rivalColor };
  } catch (err) {
    // Mismo criterio de robustez que identifyMapByIcon: un fallo en la
    // corroboración visual nunca debe romper el pipeline de OCR
    // principal, es siempre un plus opcional.
    console.warn("corroborateSideFromColor: no se pudo muestrear el color de comparación:", err);
    return null;
  }
}

async function runPerRowOCR(sourceCanvas, bands, fileName, bg) {
  const worker = await Tesseract.createWorker("eng", 1, {
    logger: (m) => {
      if (m.status && m.status !== "recognizing text") {
        els.progLabel.textContent = humanizeStatus(m.status);
      }
    },
  });
  await worker.setParameters({ tessedit_pageseg_mode: "7", tessedit_char_whitelist: "" });

  const NUMERIC_WHITELIST = "0123456789%()•·°©»«¢+-";

  const fallbackPool = buildFallbackPool(bands.length);
  const usedFallbackSlots = new Set();

  const rows = [];
  try {
    for (let i = 0; i < bands.length; i++) {
      els.progLabel.textContent = `Leyendo fila ${i + 1}/${bands.length} de ${fileName}…`;
      els.progFill.style.width = `${Math.round((i / bands.length) * 100)}%`;
      els.progPct.textContent = `${i + 1}/${bands.length}`;

      const dataUrl = cropRowToDataURL(sourceCanvas, bands[i], 0, 1, 3, bg);
      const { data } = await worker.recognize(dataUrl);
      const text = data.text.replace(/\s+/g, " ").trim();

      let mapName = findMapNameInRow(text);
      const nameGuessed = !mapName;
      // Punto 5 de la Matriz de priorización: mismo flag `noPoolFallback`
      // que usa assignMapNames en parser.js, para que validateRows
      // resuelva el warning correcto (name_guessed_no_pool vs
      // name_guessed_positional) sin depender de comparar el string
      // visible. Se reutiliza UNIDENTIFIED_MAP_LABEL de parser.js en
      // vez de repetir el literal aquí, para que ambos pipelines
      // (por fila y de imagen completa) usen exactamente el mismo texto.
      let noPoolFallback = false;
      let iconMatched = false;
      if (!mapName) {
        // Grupo 7 de la Guía de seguimiento y resolución de errores:
        // antes de caer al fallback posicional CIEGO (que asume el
        // N-ésimo mapa del pool sin ninguna evidencia real de que ESE
        // mapa sea el correcto), se intenta identificar el mapa por su
        // ícono — evidencia visual real, aunque de una fuente distinta
        // al texto. Esto NUNCA se ejecuta si `findMapNameInRow` ya tuvo
        // éxito (ver `if (!mapName)` arriba): el ícono es estrictamente
        // un fallback más fuerte que el posicional, nunca un mecanismo
        // que compita con o sobrescriba al OCR de texto.
        //
        // Se descarta un match cuyo nombre ya fue usado en una fila
        // anterior de esta misma captura (`usedFallbackSlots`) — dos
        // filas no pueden ser legítimamente el mismo mapa, y aceptar
        // ese match duplicado sería peor que no tener corroboración
        // visual (terminaría en la misma desambiguación de colisión de
        // nombre que ya maneja `parser.js`, pero por una causa que sí
        // pudo evitarse aquí).
        try {
          const iconCanvas = cropIconZoneToCanvas(sourceCanvas, bands[i]);
          const iconResult = (typeof identifyMapByIcon === "function") ? identifyMapByIcon(iconCanvas) : null;
          if (iconResult && !usedFallbackSlots.has(iconResult.map)) {
            mapName = iconResult.map;
            iconMatched = true;
          }
        } catch (iconErr) {
          console.warn("Identificación por ícono falló, se continúa con fallback posicional:", iconErr);
        }
      }
      if (!mapName) {
        if (fallbackPool) {
          const positional = !usedFallbackSlots.has(fallbackPool[i])
            ? fallbackPool[i]
            : fallbackPool.find((m) => !usedFallbackSlots.has(m));
          mapName = positional || `${UNIDENTIFIED_MAP_LABEL} ${i + 1}`;
          noPoolFallback = !positional;
        } else {
          mapName = `${UNIDENTIFIED_MAP_LABEL} ${i + 1}`;
          noPoolFallback = true;
        }
      }
      usedFallbackSlots.add(mapName);

      await worker.setParameters({ tessedit_char_whitelist: NUMERIC_WHITELIST });
      const statsUrl = cropStatsZoneToDataURL(sourceCanvas, bands[i]);
      const { data: statsData } = await worker.recognize(statsUrl);
      const statsText = statsData.text.replace(/\s+/g, " ").trim();
      await worker.setParameters({ tessedit_char_whitelist: "" });

      const nums = parseRowNumbers(statsText) || parseRowNumbers(text);
      if (!nums) {
        rows.push({
          map: mapName, pA: 50, nA: 0, pB: 50, nB: 0,
          nameGuessed, noPoolFallback, iconMatched, ocrFailed: true,
        });
        continue;
      }

      // Grupo 11: corroboración de lado vía color de comparación,
      // ejecutada SOLO cuando ya hay un pA/pB numérico exitoso — nunca
      // sustituye al patrón numérico, solo lo audita. Un resultado
      // `null` (sin señal de color, ej. mapa ya baneado o zona sin
      // dominancia clara) no genera ningún warning: ausencia de señal
      // no es evidencia de error, igual que `identifyMapByIcon` sin
      // match no penaliza una fila ya identificada por texto.
      const colorCheck = corroborateSideFromColor(sourceCanvas, bands[i], nums.pA, nums.pB);
      const colorSideMismatch = colorCheck !== null && !colorCheck.consistent;

      rows.push({ map: mapName, ...nums, nameGuessed, noPoolFallback, iconMatched, colorSideMismatch });
    }
  } finally {
    await worker.terminate();
  }
  return validateRows(rows);
}

async function runWholeImageOCR(previewUrl, fileName) {
  let ocrSource = previewUrl;
  try {
    ocrSource = await preprocessImage(previewUrl);
  } catch (prepErr) {
    console.warn("Preprocesado falló, usando imagen original:", prepErr);
  }
  const recognizeOpts = {
    logger: (m) => {
      if (m.status === "recognizing text") {
        const pct = Math.round(m.progress * 100);
        els.progFill.style.width = pct + "%";
        els.progPct.textContent = pct + "%";
      } else {
        els.progLabel.textContent = humanizeStatus(m.status);
      }
    },
  };
  const result = await Tesseract.recognize(ocrSource, "eng", recognizeOpts);
  return validateRows(parseMapRows(result.data.text));
}

function preprocessImage(previewUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = 3;
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imgData.data;
      let min = 255, max = 0;
      for (let i = 0; i < d.length; i += 4) {
        const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        d[i] = d[i + 1] = d[i + 2] = g;
        if (g < min) min = g;
        if (g > max) max = g;
      }
      const range = Math.max(1, max - min);
      for (let i = 0; i < d.length; i += 4) {
        const g = ((d[i] - min) / range) * 255;
        d[i] = d[i + 1] = d[i + 2] = g;
      }
      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = previewUrl;
  });
}

async function runOCR(file, previewUrl, sourceId) {
  els.scanStatus.style.display = "block";
  els.progLabel.textContent = `Escaneando ${file.name}…`;
  els.progFill.style.width = "0%";
  els.progPct.textContent = "0%";
  const t0 = performance.now();

  try {
    // Punto 10 de la Matriz de priorización: primer punto real donde
    // hace falta Tesseract.js — se dispara la carga diferida aquí,
    // antes de cualquier trabajo de detección de bandas/canvas, para
    // que la descarga del script corra en paralelo mientras el resto
    // de `runOCR` avanza en preparar la imagen. Si ya se cargó en una
    // imagen anterior de la misma sesión, `loadTesseractScript()`
    // resuelve inmediatamente (no vuelve a descargar nada).
    els.progLabel.textContent = `Cargando motor OCR…`;
    await loadTesseractScript();

    const sourceCanvas = await loadImageToCanvas(previewUrl);
    const { bands, bg, source: bandSource, mismatch: bandSourceMismatch } = detectRowBands(sourceCanvas);

    // Grupo 1 #1 de la Guía de seguimiento: se evalúa la plausibilidad
    // geométrica del conteo de bandas ANTES de decidir el pipeline. Un
    // conteo implausible (ej. 12) no bloquea el intento de análisis —
    // solo se registra para adjuntar un warning explícito a cada fila
    // resultante, distinto del que ya reciben los conteos 4/5/6
    // (posibles pero sin fallback posicional) o del que reciben las
    // capturas con 0 filas detectadas.
    const bandCountImplausible = flagImplausibleBandCount(bands.length);

    let validated;
    if (looksLikeMapGrid(bands)) {
      try {
        validated = await runPerRowOCR(sourceCanvas, bands, file.name, bg);
      } catch (rowErr) {
        console.warn("OCR por fila falló, cayendo a OCR de imagen completa:", rowErr);
        validated = await runWholeImageOCR(previewUrl, file.name);
      }
    } else {
      validated = await runWholeImageOCR(previewUrl, file.name);
    }

    if (bandCountImplausible) {
      validated = validated.map((row) => ({
        ...row,
        warnings: [...(row.warnings || []), { code: "band_count_implausible", params: { count: bands.length } }],
        needsReview: true,
      }));
    }

    // Grupo 1 de la Guía de seguimiento y resolución de errores: el
    // conteo de bandas por thumbnail y por franja de texto divergió —
    // se usó la franja de texto como fallback seguro (comportamiento
    // histórico), pero la discrepancia en sí es una señal de que la
    // geometría de esta captura es ambigua (layout no estándar,
    // recorte parcial, thumbnail no visible en alguna fila). Nunca se
    // decide en silencio cuál de las dos lecturas es la correcta.
    if (bandSourceMismatch) {
      validated = validated.map((row) => ({
        ...row,
        warnings: [...(row.warnings || []), { code: "band_source_mismatch" }],
        needsReview: true,
      }));
    }

    const elapsedSec = ((performance.now() - t0) / 1000).toFixed(1);

    validated = validated.map((row, i) => ({
      ...row,
      sourceId,
      order: state.nextOrder + i,
    }));
    state.nextOrder += validated.length;

    if (validated.length === 0) {
      els.progLabel.textContent = `No se detectaron filas de mapa — agrega manualmente o revisa la captura. (${elapsedSec}s)`;
    } else {
      els.progLabel.textContent = `${validated.length} mapa(s) detectado(s) en ${file.name}. (${elapsedSec}s)`;
      mergeMaps(validated);
      // Sección 8 del pedido: una vez que ya hay datos identificados,
      // bajar automáticamente el scroll a la sección de resultados en
      // vez de dejar al usuario en el uploader.
      scrollToResults();
    }
  } catch (err) {
    console.error(err);
    // Punto 10: la carga diferida de Tesseract puede fallar por causas
    // distintas a un problema con la imagen (red caída, CDN
    // bloqueado/inaccesible) — mensaje específico en vez del genérico
    // "revisa la captura", que llevaría a reintentar sin sentido con
    // otra imagen cuando el problema es de red, no de la captura.
    els.progLabel.textContent = /Tesseract\.js desde el CDN/.test(err.message)
      ? "No se pudo cargar el motor OCR (revisa tu conexión) — intenta de nuevo en unos segundos."
      : "Error al procesar la imagen. Intenta con otra captura o recorta más de cerca.";
  } finally {
    setTimeout(() => { els.progFill.style.width = "100%"; }, 200);
  }
}

function scrollToResults() {
  if (els.mapsSection) {
    els.mapsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

// Punto 5 de la Matriz de priorización: el diccionario status->texto
// que antes vivía embebido aquí se movió a i18n.js (claves
// "status.*"). Se traduce el string de Tesseract ("loading tesseract
// core") a la forma de clave ("loading_tesseract_core") y se resuelve
// vía t(); si algún status nuevo de Tesseract no tiene traducción
// registrada, se muestra el status crudo como fallback (mejor eso que
// una pantalla en blanco).
function humanizeStatus(status) {
  const key = `status.${String(status).replace(/\s+/g, "_")}`;
  const translated = t(key, state.lang);
  return translated === key ? status : translated;
}

// Punto 2 de la Matriz de priorización (Hallazgo — "Colisión de nombres
// al fusionar múltiples imágenes"):
//
// ANTES: `mergeMaps` buscaba coincidencia solo por `m.map === row.map`,
// sin importar de qué imagen venía cada fila. Esto fusiona (sobrescribe)
// dos casos muy distintos con la MISMA lógica:
//   (a) re-escanear la misma captura (ej. el usuario la sube de nuevo,
//       o `runOCR` corrige una fila tras un reintento) — aquí SÍ se
//       quiere actualizar la fila existente, es la misma fuente.
//   (b) subir una SEGUNDA imagen distinta que por coincidencia (o por
//       un nombre mal asignado por fallback posicional, ver 2.2.2) trae
//       un mapa con el mismo nombre — aquí NO son el mismo dato: son
//       dos observaciones distintas (posiblemente de dos partidas/rivales
//       distintos) que el sistema pisaba en silencio, perdiendo la
//       primera sin ningún aviso.
//
// AHORA: solo se trata como "actualización" cuando el `sourceId` del
// mapa existente coincide con el de la fila nueva (misma imagen). Si el
// nombre coincide pero el `sourceId` es distinto, es una colisión entre
// fuentes: se conserva la fila nueva con nombre desambiguado y se marca
// `needsReview` con un warning explícito, igual que la desambiguación ya
// aplicada dentro de una sola captura en `parser.js` (punto 3).
//
// NOTA (Grupo 4 #1 de la Guía de seguimiento): desde que `handleFiles`
// restringe la carga a una sola imagen a la vez (reemplazando por
// completo el estado anterior en vez de fusionar), la rama de
// "colisión entre fuentes" de abajo ya no debería poder dispararse en
// la práctica — nunca coexisten dos `sourceId` distintos en
// `state.maps`. No se elimina en este fix (es deuda técnica anotada,
// no un bug activo): se deja tal cual para una ronda de limpieza
// posterior, por si en el futuro se reintroduce alguna vía de tener
// más de una fuente activa.
function mergeMaps(newRows) {
  newRows.forEach((row) => {
    const sameSourceIdx = state.maps.findIndex(
      (m) => m.map === row.map && m.sourceId === row.sourceId
    );
    if (sameSourceIdx >= 0) {
      const preservedOrder = state.maps[sameSourceIdx].order ?? row.order;
      state.maps[sameSourceIdx] = { ...state.maps[sameSourceIdx], ...row, order: preservedOrder };
      return;
    }

    const collidesWithOtherSource = state.maps.some(
      (m) => m.map === row.map && m.sourceId !== row.sourceId
    );
    if (collidesWithOtherSource) {
      let n = 2;
      let candidateName = `${row.map} (${n})`;
      while (state.maps.some((m) => m.map === candidateName)) {
        n++;
        candidateName = `${row.map} (${n})`;
      }
      // Punto 5 de la Matriz de priorización: warning como {code} en
      // vez de string en español, igual que la migración de
      // validateRows en parser.js — ver "warning.name_collision_cross_source"
      // en i18n.js.
      const warnings = [
        ...(row.warnings || []),
        { code: "name_collision_cross_source" },
      ];
      state.maps.push({ ...row, map: candidateName, warnings, needsReview: true });
      return;
    }

    state.maps.push(row);
  });
  render();
}

// ---------- Manual entry ----------

// Punto 1 de la Matriz de priorización ("Validación no corre sobre
// ediciones/mapas manuales"): antes este mapa se insertaba con
// `warnings: []` y `needsReview: false` hardcodeados — nunca pasaba por
// `validateRows`, así que el sistema de warnings/⚠ solo protegía datos
// que vinieron de OCR. Con valores por defecto (pA=50, nA=10, pB=50,
// nB=10) no hay ninguna inconsistencia que reportar, pero se corre
// igual por `validateRows` para que el comportamiento sea consistente
// y cualquier cambio futuro a los valores por defecto quede cubierto
// automáticamente sin tener que recordar validar en dos sitios.
els.addManual.addEventListener("click", () => {
  const [validated] = validateRows([{
    map: "Nuevo mapa", pA: 50, nA: 10, pB: 50, nB: 10,
  }]);
  state.maps.push({
    ...validated,
    order: state.nextOrder++,
  });
  state.editingIndex = state.maps.length - 1;
  render();
});

// ---------- Controls ----------

function setPerspective(side) {
  state.perspective = side;
  const isRight = side === "B";
  els.perspectiveSwitch.classList.toggle("right", isRight);
  els.perspectiveSwitch.setAttribute("aria-checked", String(isRight));
  els.sideLeftLabel.classList.toggle("active", !isRight);
  els.sideRightLabel.classList.toggle("active", isRight);
  render();
}
els.perspectiveSwitch.addEventListener("click", () => {
  setPerspective(state.perspective === "A" ? "B" : "A");
});
els.perspectiveSwitch.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    setPerspective(state.perspective === "A" ? "B" : "A");
  }
});
els.sideLeftLabel.addEventListener("click", () => setPerspective("A"));
els.sideRightLabel.addEventListener("click", () => setPerspective("B"));

// Modo compacto/detallado — FUSIONADO con el antiguo control de contexto
// FaceIt (ya no existe un switch separado para eso; queda un único
// control con dos efectos): Compacto (opción IZQUIERDA del switch, y
// modo por defecto) oculta n/IC95 en texto Y oculta el contexto FaceIt.
// Detallado (opción DERECHA) muestra n/IC95 en texto Y agrega el
// contexto FaceIt (pick-rate / first-ban) a cada tarjeta — "más
// contenido" en modo detallado, como se pidió. El switch se mueve hacia
// ".right" cuando se pasa a Detallado (on=false).
function setCompact(on) {
  state.compact = on;
  els.compactSwitch.classList.toggle("right", !on);
  els.compactSwitch.setAttribute("aria-checked", String(on));
  els.compactOnLabel.classList.toggle("active", on);
  els.compactOffLabel.classList.toggle("active", !on);
  els.mapList.classList.toggle("compact", on);
  els.mapList.classList.toggle("hide-faceit", on);
}
els.compactSwitch.addEventListener("click", () => setCompact(!state.compact));
els.compactSwitch.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCompact(!state.compact); }
});
els.compactOnLabel.addEventListener("click", () => setCompact(true));
els.compactOffLabel.addEventListener("click", () => setCompact(false));

// Estado inicial de las clases (Compacto activo por defecto: n/IC95
// oculto en texto Y contexto FaceIt oculto — ambos controlados por el
// mismo switch fusionado).
els.mapList.classList.add("hide-faceit");
els.mapList.classList.add("compact");

// ---------- Render ----------

// Punto 18 de la Matriz de priorización ("Iconografía por glifo
// Unicode en vez de SVG", index.html, Baja/Bajo): el ícono de
// información de cada `.info-ic` (tooltip de las listas de prioridad)
// usaba el carácter de texto "i" en cursiva (font-family:Georgia,
// serif; font-style:italic) para simular visualmente un ícono — un
// glifo de fuente no es un ícono real: su apariencia varía según el
// sistema operativo/fuentes instaladas, no escala con nitidez a
// cualquier tamaño, y no admite trazo/relleno propios vía CSS. Se
// reemplaza por un SVG inline (círculo + barra vertical + punto,
// mismo lenguaje visual que el ícono ya usado en el botón "¿Cómo
// funciona?" del header) construido una sola vez como constante y
// reinsertado en cada `.info-ic` que genera `priorityItemHTML`.
const INFO_ICON_SVG = '<svg viewBox="0 0 16 16" width="9.5" height="9.5" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8" cy="8" r="6.3"/><line x1="8" y1="7.1" x2="8" y2="11.3" stroke-linecap="round"/><circle cx="8" cy="4.8" r="0.9" fill="currentColor" stroke="none"/></svg>';

// Punto 18 (continuación): mismos criterios que INFO_ICON_SVG arriba,
// para los glifos "✓" (guardar) y "✕" (eliminar) del botón de acción
// de cada tarjeta de mapa — se insertan inline junto al texto de la
// etiqueta (`guardar`/`eliminar`), que se conserva sin cambios.
const CHECK_ICON_SVG = '<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-1px;"><path d="M3 8.5 L6.5 12 L13 4.5"/></svg>';
const CLOSE_ICON_SVG = '<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" style="vertical-align:-1px;"><path d="M3 3 L13 13 M13 3 L3 13"/></svg>';

function fmtPct(x) { return (x * 100).toFixed(1) + "%"; }

// Punto 8 de la Matriz de priorización: los popovers (.info-popover)
// insertan el texto de ayuda como CONTENIDO de un <div>, no como valor
// de un atributo `title` — por eso necesitan escapar HTML de verdad
// (<, >, &), no solo comillas como ya hacía el badge de warnings.
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Punto 5 de la Matriz de priorización: diccionario embebido
// reemplazado por t() contra las claves "reliability.*" de i18n.js.
function reliabilityLabel(r) {
  return t(`reliability.${r}`, state.lang);
}

function perspectiveDelta(a) {
  return state.perspective === "B" ? -a.deltaAdj : a.deltaAdj;
}
function perspectiveDeltaRaw(a) {
  return state.perspective === "B" ? -a.deltaRaw : a.deltaRaw;
}

function render() {
  if (state.maps.length === 0) {
    // Sin ninguna imagen subida (ni mapa agregado manualmente todavía),
    // las secciones "Mapas" y "Prioridad" no aportan nada — se ocultan
    // por completo en vez de mostrar un estado vacío permanente. El
    // uploader + la barra de switches (.pre-upload) permanecen centrados
    // en la pantalla mientras `main` no tenga la clase `has-results`.
    els.resultsWrap.classList.remove("visible");
    els.mainEl.classList.remove("has-results");
    document.body.style.overflowY = "";
    document.body.style.height = "";
    els.mapList.innerHTML = "";
    els.banList.innerHTML = "";
    els.pickList.innerHTML = "";
    return;
  }

  els.resultsWrap.classList.add("visible");
  els.mainEl.classList.add("has-results");
  // Fallback para navegadores sin soporte de `body:has(main.has-results)`
  // (CSS ya lo cubre en los que sí lo soportan; esto es un refuerzo
  // explícito para que la página vuelva a scrollear normalmente en
  // cuanto hay resultados, sin depender únicamente de :has()).
  document.body.style.overflowY = "auto";
  document.body.style.height = "auto";

  const sortedWithIndex = state.maps
    .map((m, realIndex) => ({ m, realIndex }))
    .sort((a, b) => (a.m.order ?? 0) - (b.m.order ?? 0));

  const analyzed = sortedWithIndex.map(({ m }) => analyzeMap(m));

  els.mapList.innerHTML = "";
  analyzed.forEach((a, i) => {
    els.mapList.appendChild(renderMapCard(a, sortedWithIndex[i].realIndex));
  });

  const perspectiveSign = state.perspective === "B" ? -1 : 1;
  const banked = rankForBan(analyzed, perspectiveSign);
  const picked = rankForPick(analyzed, perspectiveSign);

  els.banList.innerHTML = banked.length
    ? banked.map((a, i) => priorityItemHTML(a, i, "neg")).join("")
    : `<div class="empty-hint">Sin amenazas claras detectadas.</div>`;
  els.pickList.innerHTML = picked.length
    ? picked.map((a, i) => priorityItemHTML(a, i, "pos")).join("")
    : `<div class="empty-hint">Sin ventajas claras detectadas.</div>`;
}

function deltaToGradientColor(delta) {
  const SATURATION_POINT = 0.20;
  const t = Math.max(-1, Math.min(1, delta / SATURATION_POINT));
  const neg = { r: 0xef, g: 0x4a, b: 0x5f };
  const pos = { r: 0x3d, g: 0xdb, b: 0xc4 };
  const white = { r: 0xe6, g: 0xea, b: 0xf0 };
  const from = t < 0 ? neg : pos;
  const mix = Math.abs(t);
  const r = Math.round(white.r + (from.r - white.r) * mix);
  const g = Math.round(white.g + (from.g - white.g) * mix);
  const b = Math.round(white.b + (from.b - white.b) * mix);
  return `rgb(${r},${g},${b})`;
}

// Punto 5 de la Matriz de priorización: diccionario embebido
// reemplazado por t() contra las claves "reason.*" de i18n.js. El
// sufijo "(n=X vs n=Y)" también pasa por t() con interpolación, en
// vez de un template literal fijo en español ("vs" no se traduce
// igual en todos los idiomas ni siempre en esa posición).
function priorityReasonText(a) {
  const reason = t(`reason.${a.reliability}`, state.lang);
  const suffix = t("reason.suffix_n", state.lang, { nA: a.nA, nB: a.nB });
  return `${reason} ${suffix}`;
}

// Punto 8 de la Matriz de priorización: el ícono "i" ya no depende
// solo de `title` nativo (invisible en touch). Se agrega:
//   - aria-label con el mismo texto, para lectores de pantalla
//     (resuelve también la falta de aria-label señalada en 3.4)
//   - un .info-popover propio como hijo, con el texto ya escapado como
//     CONTENIDO (no atributo) — se abre/cierra por click/tap vía el
//     listener delegado registrado en initInfoPopovers() más abajo, y
//     también por :hover en dispositivos que sí tienen hover (CSS).
//
// Grupo 3, issue #3 (Guía de seguimiento y resolución de errores):
// `title` se eliminó por completo de este elemento. Antes convivía
// junto a `.info-popover` como "respaldo silencioso para navegadores
// sin JS", pero en la práctica ambos mecanismos se disparaban a la vez
// en hover (tooltip nativo del navegador + popover propio superpuestos
// visualmente), que es exactamente la duplicación reportada. Se
// prioriza el popover diseñado como único mecanismo visual; `aria-label`
// se conserva íntegro para lectores de pantalla, que no dependen de
// `title` para anunciar el contenido de un elemento con `role="button"`.
function priorityItemHTML(a, i, sign) {
  const deltaClass = sign === "neg" ? "neg" : "pos";
  const d = perspectiveDelta(a);
  const deltaTxt = (d >= 0 ? "+" : "") + fmtPct(d);
  const gradColor = deltaToGradientColor(d);
  const reasonTxt = priorityReasonText(a);
  const safeReason = escapeHtml(reasonTxt);
  return `<div class="priority-item" style="--grad-color:${gradColor}">
    <span class="priority-left">
      <span class="rank">${i + 1}.</span>
      <span class="m">${a.map}</span>
      <span class="info-ic" tabindex="0" role="button" aria-expanded="false" aria-label="${safeReason}">${INFO_ICON_SVG}<span class="info-popover">${safeReason}</span></span>
    </span>
    <span class="d delta ${deltaClass}">${deltaTxt}</span>
  </div>`;
}

function renderMapCard(a, index) {
  const card = document.createElement("div");
  const tagClass = {
    "confiable": "confiable", "marginal": "marginal",
    "incierto": "incierto", "empate-estadistico": "empate",
  }[a.reliability];
  card.className = `mapcard tag-${tagClass}`;
  if (state.editingIndex === index) card.classList.add("editing");

  const d = perspectiveDelta(a);
  const deltaSign = d > 0.005 ? "pos" : d < -0.005 ? "neg" : "flat";
  const deltaTxt = (d >= 0 ? "+" : "") + fmtPct(d);

  const ownLabel = state.perspective === "B" ? "Derecha" : "Izquierda";
  const oppLabel = state.perspective === "B" ? "Izquierda" : "Derecha";
  const ownWilson = state.perspective === "B" ? a.wilsonB : a.wilsonA;
  const oppWilson = state.perspective === "B" ? a.wilsonA : a.wilsonB;
  const ownAdj = state.perspective === "B" ? a.adjB : a.adjA;
  const oppAdj = state.perspective === "B" ? a.adjA : a.adjB;

  const raw = state.maps[index];
  // Punto 5 de la Matriz de priorización: los warnings ahora son
  // {code, params?} (ver validateRows en parser.js / mergeMaps en
  // este archivo) — se traducen aquí con translateWarning() antes de
  // mostrarlos. El detalle completo (uno o más warnings) se expone en
  // el `title` nativo del badge en vez de solo un texto genérico fijo,
  // aprovechando que ya no hace falta adivinar qué pasó: el code lo dice.
  const warningTexts = (raw.warnings || []).map((w) => translateWarning(w, state.lang));
  const badgeLabel = warningTexts.length > 1
    ? t("ui.warning_badge_plural", state.lang, { count: warningTexts.length })
    : t("ui.warning_badge_single", state.lang);
  const warnings = warningTexts.length
    ? `<span class="warn-badge" title="${warningTexts.join(" · ").replace(/"/g, "&quot;")}">⚠ ${badgeLabel}</span>`
    : "";

  const ctx = (typeof getFaceitContext === "function") ? getFaceitContext(a.map) : null;
  const faceitCtxHTML = ctx
    ? `
      <div class="ctx-head">Contexto FaceIt · global</div>
      ${ctx.playrate !== null ? `
        <div class="ctx-stat">
          <span class="ctx-label">Pick-rate (${ctx.playratePeriod})</span>
          <span class="ctx-val">${ctx.playrate.toFixed(1)}%</span>
        </div>` : ""}
      ${ctx.banrate !== null ? `
        <div class="ctx-stat">
          <span class="ctx-label">First-ban (${ctx.banratePeriod})</span>
          <span class="ctx-val">${ctx.banrate.toFixed(1)}%</span>
        </div>` : ""}
    `
    : `<div class="ctx-head">Contexto FaceIt · global</div><div class="ctx-empty">Sin datos públicos para este mapa.</div>`;

  card.innerHTML = `
    <div class="card-head">
      <div class="map-id">
        <span class="name">${a.map}</span>
        <span class="tag-chip ${tagClass}">${reliabilityLabel(a.reliability)}</span>
        ${warnings}
      </div>
      <div class="card-actions">
        <span class="toggle-note" data-i="${index}">detalles · editar</span>
        <span class="edit-btn" data-i="${index}">${state.editingIndex === index ? `guardar ${CHECK_ICON_SVG}` : `eliminar ${CLOSE_ICON_SVG}`}</span>
      </div>
    </div>
    <div class="card-main">
      <div class="card-math">
        <div class="bars">
          <div class="bars-graph">
            ${barRow(ownLabel, ownWilson, ownAdj, false)}
            ${barRow(oppLabel, oppWilson, oppAdj, true)}
          </div>
          <div class="raw-values">
            <span>Izq.: <b>${raw.pA}%</b></span>
            <span>Der.: <b>${raw.pB}%</b></span>
          </div>
        </div>
        <div class="decision">
          <span class="delta ${deltaSign}">${deltaTxt}</span>
          <span class="label">Ventaja (${state.perspective === "B" ? "derecha" : "izquierda"})</span>
        </div>
      </div>
      <div class="faceit-ctx">${faceitCtxHTML}</div>
    </div>
    <div class="bias-note">${t(a.biasKey, state.lang)}</div>
    <div class="edit-fields">
      <div><label>Mapa</label><input type="text" data-field="map" value="${raw.map}" style="width:110px;"></div>
      <div><label>Winrate izq. %</label><input type="number" data-field="pA" value="${raw.pA}" min="0" max="100" step="1"></div>
      <div><label>Partidas izq.</label><input type="number" data-field="nA" value="${raw.nA}" min="0" step="1"></div>
      <div><label>Partidas der.</label><input type="number" data-field="nB" value="${raw.nB}" min="0" step="1"></div>
      <div><label>Winrate der. %</label><input type="number" data-field="pB" value="${raw.pB}" min="0" max="100" step="1"></div>
    </div>
  `;

  card.querySelector(".toggle-note").addEventListener("click", () => {
    card.classList.toggle("show-note");
    if (state.editingIndex === index) {
      state.editingIndex = null;
    } else {
      state.editingIndex = index;
    }
    render();
  });

  const editBtn = card.querySelector(".edit-btn");
  editBtn.addEventListener("click", () => {
    if (state.editingIndex === index) {
      const fields = card.querySelectorAll("[data-field]");
      fields.forEach((f) => {
        const key = f.dataset.field;
        raw[key] = key === "map" ? f.value : parseFloat(f.value) || 0;
      });
      // Punto 1 de la Matriz de priorización: una edición manual puede
      // introducir exactamente las mismas inconsistencias que el OCR
      // (winrate fuera de [0,100], n=0 con winrate>0, n irrealmente
      // alto, etc.) — antes de este fix, guardar una edición NUNCA
      // volvía a pasar por `validateRows`, así que esos casos quedaban
      // sin el warning ⚠ que sí recibe una fila leída por OCR. Se
      // revalida aquí conservando el resto de campos de estado propios
      // de la tarjeta (order, sourceId) que `validateRows` no toca.
      const [validated] = validateRows([raw]);
      Object.assign(raw, validated);
      state.editingIndex = null;
      render();
    } else {
      state.maps.splice(index, 1);
      render();
    }
  });

  return card;
}

// Punto 8 de la Matriz de priorización: igual que priorityItemHTML,
// la barra de IC95 pasa de depender solo de `title` (invisible en
// touch) a un popover propio tappable, con aria-label + role="button"
// para lectores de pantalla. El texto mostrado es idéntico al que
// antes solo vivía en `title` — no se pierde información, solo se hace
// alcanzable sin mouse.
//
// Grupo 3, issue #3: se elimina el atributo `title` de `.bar-track`
// por el mismo motivo que en `priorityItemHTML` — con ambos mecanismos
// presentes a la vez, el navegador dispara su tooltip nativo (`title`)
// superpuesto al `.info-popover` propio en hover, produciendo la
// duplicación visual reportada. `aria-label` se mantiene intacto para
// lectores de pantalla; el popover diseñado queda como único mecanismo
// visible tanto en hover (CSS `@media(hover:hover)`) como en click/tap
// (JS, `initInfoPopovers()`).
function barRow(label, wilson, adjPoint, isB) {
  const ciLeft = wilson.low * 100;
  const ciWidth = (wilson.high - wilson.low) * 100;
  const pointLeft = adjPoint * 100;
  // Sección 1 del pedido: el texto "n=.. · IC95 ..–..%" se oculta en
  // modo compacto (CSS .maplist.compact .bar-n / .raw-values), pero la
  // misma info sigue accesible tocando/pasando el mouse sobre la barra
  // (popover). Punto 6 de la Matriz de priorización (Grupo 3): criterio
  // final de una única fuente por dato — bar-n/popover muestran
  // ÚNICAMENTE n + IC95 (nunca el % crudo, que ya vive en raw-values),
  // y raw-values (ver renderMapCard) muestra ÚNICAMENTE el % crudo sin
  // repetir "(n=X)" — cada representación aporta algo distinto en vez
  // de que las tres (bar-n, popover, raw-values) dupliquen el mismo dato.
  const infoTitle = `${label}: n=${wilson.n} · IC95 ${(wilson.low * 100).toFixed(0)}–${(wilson.high * 100).toFixed(0)}%`;
  const safeTitle = escapeHtml(infoTitle);
  // Grupo 3, issue #2: el popover describe el punto ajustado
  // (.bar-point, en pointLeft%), así que debe anclarse ahí en vez del
  // left:0 fijo anterior. Se pasa pointLeft como variable CSS inline
  // (--pt), igual que --grad-color en priorityItemHTML — el CSS
  // resuelve el centrado y el clamp de borde contra esta variable en
  // vez de que JS calcule píxeles absolutos (el ancho real de
  // .bar-track no se conoce en este punto, solo en el navegador).
  return `<div class="bar-row">
    <span class="team-label">${label}</span>
    <div class="bar-track" tabindex="0" role="button" aria-expanded="false" aria-label="${safeTitle}" style="--pt:${pointLeft}%;">
      <div class="bar-ci ${isB ? 'b' : ''}" style="left:${ciLeft}%; width:${ciWidth}%;"></div>
      <div class="bar-point" style="left:calc(${pointLeft}% - 1px);"></div>
      <span class="info-popover">${safeTitle}</span>
    </div>
    <span class="bar-n">n=${wilson.n} · IC95 ${(wilson.low*100).toFixed(0)}–${(wilson.high*100).toFixed(0)}%</span>
  </div>`;
}

// Punto 8 de la Matriz de priorización: listener DELEGADO (un único
// listener en document, no uno por cada .info-ic/.bar-track) porque
// estos elementos se recrean en cada render() vía innerHTML — agregar
// listeners individuales se perdería en cada re-render y además
// duplicaría listeners huérfanos. Reglas de interacción:
//   - click/tap en un trigger cerrado -> lo abre y cierra cualquier
//     otro popover abierto (nunca más de uno abierto a la vez).
//   - click/tap en un trigger ya abierto -> lo cierra (toggle).
//   - click fuera de cualquier trigger -> cierra el que esté abierto.
//   - tecla Escape -> cierra el que esté abierto.
// .bar-track/.info-ic también funcionan con :hover en desktop (CSS
// puro, @media(hover:hover)) sin pasar por este JS — este listener
// solo cubre click/tap/teclado, que es lo que faltaba en móvil.
function closeAllPopovers(exceptEl) {
  document.querySelectorAll(".info-ic.open, .bar-track.open").forEach((el) => {
    if (el === exceptEl) return;
    el.classList.remove("open");
    el.setAttribute("aria-expanded", "false");
  });
}

function initInfoPopovers() {
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest(".info-ic, .bar-track");
    if (!trigger) {
      closeAllPopovers(null);
      return;
    }
    const isOpen = trigger.classList.contains("open");
    closeAllPopovers(trigger);
    trigger.classList.toggle("open", !isOpen);
    trigger.setAttribute("aria-expanded", String(!isOpen));
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " " && e.key !== "Escape") return;
    const trigger = document.activeElement && document.activeElement.closest
      ? document.activeElement.closest(".info-ic, .bar-track")
      : null;
    if (!trigger) return;

    if (e.key === "Escape") {
      if (trigger.classList.contains("open")) {
        trigger.classList.remove("open");
        trigger.setAttribute("aria-expanded", "false");
      }
      return;
    }
    // Enter / Espacio: mismo toggle que click, evitando scroll de
    // página en el caso de Espacio sobre un elemento no-botón nativo.
    e.preventDefault();
    const isOpen = trigger.classList.contains("open");
    closeAllPopovers(trigger);
    trigger.classList.toggle("open", !isOpen);
    trigger.setAttribute("aria-expanded", String(!isOpen));
  });
}
initInfoPopovers();

render();
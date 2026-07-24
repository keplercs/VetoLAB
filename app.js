// ============================================================
// App — orquesta OCR, parsing, modelo matemático y render.
// ============================================================

let state = {
  maps: [], // {map, pA, nA, pB, nB, warnings, needsReview, sourceId, order}
  editingIndex: null,
  perspective: "A", // "A" = ver ventaja desde tu lado (pA-pB) | "B" = ver desde el lado rival (pB-pA)
  nextOrder: 0, // contador incremental para preservar el orden de aparición en la imagen
  compact: true, // Compacto es el modo por defecto: switch a la izquierda = Compacto (sin contexto FaceIt).
  // Detallado (switch a la derecha) agrega el contexto FaceIt a cada tarjeta — el antiguo
  // switch separado "Sin/Con contexto FaceIt" se fusionó aquí, no debe quedar un control
  // obsoleto operando en paralelo con otro nombre.
};

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
  howModal: document.getElementById("howModal"),
  closeModal: document.getElementById("closeModal"),
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

function handleFiles(files) {
  files.forEach((file) => {
    const sourceId = `src_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const url = URL.createObjectURL(file);
    const thumb = document.createElement("div");
    thumb.className = "thumb";
    thumb.dataset.sourceId = sourceId;
    thumb.innerHTML = `<img src="${url}"><div class="rm">×</div>`;
    thumb.querySelector(".rm").addEventListener("click", (e) => {
      e.stopPropagation();
      thumb.remove();
      state.maps = state.maps.filter((m) => m.sourceId !== sourceId);
      render();
    });
    els.thumbs.appendChild(thumb);
    runOCR(file, url, sourceId);
  });
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

function detectRowBands(canvas) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const imgData = ctx.getImageData(0, 0, width, height).data;

  const xStart = Math.floor(width * STATS_ZONE_X_START);
  const xEnd = Math.floor(width * STATS_ZONE_X_END);
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
  const bands = rawBands.filter((b) => b.h >= maxH * 0.5);
  return { bands, bg };
}

function looksLikeMapGrid(bands) {
  if (bands.length < 3 || bands.length > 10) return false;
  const heights = bands.map((b) => b.h);
  return Math.max(...heights) / Math.min(...heights) < 2.2;
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

    const isGoldAmber = hue >= 30 && hue <= 55;

    if (isGoldAmber) {
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
      if (!mapName) {
        if (fallbackPool) {
          mapName = !usedFallbackSlots.has(fallbackPool[i]) ? fallbackPool[i] : null;
          if (!mapName) mapName = fallbackPool.find((m) => !usedFallbackSlots.has(m));
          if (!mapName) mapName = `Mapa sin identificar ${i + 1}`;
        } else {
          mapName = `Mapa sin identificar ${i + 1}`;
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
          nameGuessed, ocrFailed: true,
        });
        continue;
      }

      rows.push({ map: mapName, ...nums, nameGuessed });
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
    const sourceCanvas = await loadImageToCanvas(previewUrl);
    const { bands, bg } = detectRowBands(sourceCanvas);

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
    els.progLabel.textContent = "Error al procesar la imagen. Intenta con otra captura o recorta más de cerca.";
  } finally {
    setTimeout(() => { els.progFill.style.width = "100%"; }, 200);
  }
}

function scrollToResults() {
  if (els.mapsSection) {
    els.mapsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function humanizeStatus(status) {
  const map = {
    "loading tesseract core": "Cargando motor OCR…",
    "initializing tesseract": "Inicializando…",
    "loading language traineddata": "Cargando modelo de idioma…",
    "initializing api": "Preparando análisis…",
    "recognizing text": "Leyendo texto…",
  };
  return map[status] || status;
}

function mergeMaps(newRows) {
  newRows.forEach((row) => {
    const idx = state.maps.findIndex((m) => m.map === row.map);
    if (idx >= 0) {
      const preservedOrder = state.maps[idx].order ?? row.order;
      state.maps[idx] = { ...state.maps[idx], ...row, order: preservedOrder };
    } else {
      state.maps.push(row);
    }
  });
  render();
}

// ---------- Manual entry ----------

els.addManual.addEventListener("click", () => {
  state.maps.push({
    map: "Nuevo mapa", pA: 50, nA: 10, pB: 50, nB: 10,
    warnings: [], needsReview: false,
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

function fmtPct(x) { return (x * 100).toFixed(1) + "%"; }

function reliabilityLabel(r) {
  return {
    "confiable": "Diferencial confiable",
    "marginal": "Diferencial marginal",
    "incierto": "Muestra insuficiente",
    "empate-estadistico": "Empate estadístico",
  }[r] || r;
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

function priorityReasonText(a) {
  const reason = {
    "confiable": "Diferencial confiable: la diferencia es estadísticamente distinguible y ambas muestras son razonablemente precisas.",
    "marginal": "Diferencial marginal: la diferencia es distinguible pero pequeña en magnitud una vez corregida.",
    "incierto": "Muestra insuficiente: al menos un lado tiene un intervalo de confianza ancho — el número podría moverse con más partidas.",
    "empate-estadistico": "Empate estadístico: la diferencia observada no es distinguible del ruido muestral con la evidencia actual.",
  }[a.reliability] || "";
  return `${reason} (n=${a.nA} vs n=${a.nB})`;
}

function priorityItemHTML(a, i, sign) {
  const deltaClass = sign === "neg" ? "neg" : "pos";
  const d = perspectiveDelta(a);
  const deltaTxt = (d >= 0 ? "+" : "") + fmtPct(d);
  const gradColor = deltaToGradientColor(d);
  const reasonTxt = priorityReasonText(a);
  return `<div class="priority-item" style="--grad-color:${gradColor}">
    <span class="priority-left">
      <span class="rank">${i + 1}.</span>
      <span class="m">${a.map}</span>
      <span class="info-ic" tabindex="0" title="${reasonTxt}">i</span>
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
  const warnings = raw.warnings && raw.warnings.length
    ? `<span class="warn-badge">⚠ revisar OCR</span>` : "";

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
        <span class="edit-btn" data-i="${index}">${state.editingIndex === index ? "guardar ✓" : "eliminar ✕"}</span>
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
            <span>Izq.: <b>${raw.pA}%</b> (n=${raw.nA})</span>
            <span>Der.: <b>${raw.pB}%</b> (n=${raw.nB})</span>
          </div>
        </div>
        <div class="decision">
          <span class="delta ${deltaSign}">${deltaTxt}</span>
          <span class="label">Ventaja (${state.perspective === "B" ? "derecha" : "izquierda"})</span>
        </div>
      </div>
      <div class="faceit-ctx">${faceitCtxHTML}</div>
    </div>
    <div class="bias-note">${a.biasNote}</div>
    <div class="edit-fields">
      <div><label>Mapa</label><input type="text" data-field="map" value="${raw.map}" style="width:110px;"></div>
      <div><label>Winrate izq. %</label><input type="number" data-field="pA" value="${raw.pA}"></div>
      <div><label>Partidas izq.</label><input type="number" data-field="nA" value="${raw.nA}"></div>
      <div><label>Partidas der.</label><input type="number" data-field="nB" value="${raw.nB}"></div>
      <div><label>Winrate der. %</label><input type="number" data-field="pB" value="${raw.pB}"></div>
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
      state.editingIndex = null;
      render();
    } else {
      state.maps.splice(index, 1);
      render();
    }
  });

  return card;
}

function barRow(label, wilson, adjPoint, isB) {
  const ciLeft = wilson.low * 100;
  const ciWidth = (wilson.high - wilson.low) * 100;
  const pointLeft = adjPoint * 100;
  // Sección 1 del pedido: el texto "n=.. · IC95 ..–..%" se oculta en
  // modo compacto (CSS .maplist.compact .bar-n), pero la misma info
  // sigue accesible al pasar el mouse sobre la barra vía `title` nativo.
  const infoTitle = `${label}: n=${wilson.n} · IC95 ${(wilson.low * 100).toFixed(0)}–${(wilson.high * 100).toFixed(0)}%`;
  return `<div class="bar-row">
    <span class="team-label">${label}</span>
    <div class="bar-track" title="${infoTitle}">
      <div class="bar-ci ${isB ? 'b' : ''}" style="left:${ciLeft}%; width:${ciWidth}%;"></div>
      <div class="bar-point" style="left:calc(${pointLeft}% - 1px);"></div>
    </div>
    <span class="bar-n">n=${wilson.n} · IC95 ${(wilson.low*100).toFixed(0)}–${(wilson.high*100).toFixed(0)}%</span>
  </div>`;
}

render();
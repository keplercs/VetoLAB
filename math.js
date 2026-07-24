// ============================================================
// Núcleo matemático — Veto Competitivo de Mapas
// Basado en: Fundamentos_del_Veto_Competitivo_de_Mapas.md
// Implementa: Wilson score interval (Sección 3.2), shrinkage
// bayesiano empírico hacia 50% (Sección 3.3), y diferencial
// ajustado con dirección de sesgo por asimetría de muestra
// (Sección 4.3).
// ============================================================

const Z_95 = 1.959963985; // z_{0.025} para 95% de confianza

/**
 * Intervalo de puntuación de Wilson para una proporción binomial.
 * Wilson, E.B. (1927), JASA 22(158), 209-212.
 * @param {number} wins - victorias observadas
 * @param {number} n - partidas jugadas
 * @param {number} z - cuantil normal (default 95%)
 * @returns {{p: number, low: number, high: number, n: number}}
 */
function wilsonInterval(wins, n, z = Z_95) {
  if (n === 0) {
    return { p: 0.5, low: 0, high: 1, n: 0 };
  }
  const phat = wins / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = phat + z2 / (2 * n);
  const margin = z * Math.sqrt((phat * (1 - phat)) / n + z2 / (4 * n * n));
  const low = (center - margin) / denom;
  const high = (center + margin) / denom;
  return {
    p: phat,
    low: Math.max(0, low),
    high: Math.min(1, high),
    n,
  };
}

/**
 * Estimador de contracción (shrinkage) bayesiano empírico hacia mu0.
 * Forma general: p_ajustado = (n*p_hat + k*mu0) / (n + k)
 * Sección 3.3 — extrapolación operativa del marco Efron-Morris (1975).
 * @param {number} phat - winrate observado
 * @param {number} n - partidas jugadas
 * @param {number} k - peso del prior en unidades de observaciones equivalentes
 * @param {number} mu0 - media de referencia (default 50%)
 */
function shrinkageEstimate(phat, n, k = DEFAULT_SHRINKAGE_K, mu0 = 0.5) {
  return (n * phat + k * mu0) / (n + k);
}

/**
 * Peso del prior de contracción, fijo (no expuesto como control manual).
 *
 * POR QUÉ ES UNA CONSTANTE Y NO UN VALOR "CALCULADO": a diferencia del
 * umbral de "muestra insuficiente" (que sí se deriva matemáticamente
 * del ancho del intervalo de Wilson — ver WIDE_INTERVAL_THRESHOLD más
 * abajo), k no tiene un valor "correcto" derivable únicamente de los
 * datos de UN mapa. k representa cuántas observaciones hipotéticas
 * hacia 50% hacen falta para calibrar la fuerza del prior, y esa
 * calibración —en el marco de Efron-Morris real— se ajusta empíricamente
 * contra una VALIDACIÓN CRUZADA sobre resultados históricos (Sección
 * 3.3.1 del documento de fundamentos: "los valores de calibración...
 * no derivan de un ajuste estadístico formal sobre datos de CS2, sino
 * de valores razonables por analogía"). No hay forma honesta de que el
 * sistema "decida solo" un k óptimo sin ese conjunto de validación —
 * pretender lo contrario sería fabricar precisión donde no la hay. Se
 * fija un valor único, moderado y documentado, en vez de exponerlo como
 * control ajustable sin base para que el usuario sepa qué valor elegir.
 */
const DEFAULT_SHRINKAGE_K = 12;

/**
 * Determina si dos intervalos se solapan y en qué grado (Sección 4.2).
 * Devuelve una fracción de solapamiento relativo al intervalo más angosto:
 * 0 = sin solapamiento, 1 = un intervalo contiene completamente al otro.
 *
 * LIMITACIÓN CONOCIDA (ver corrección abajo, `differenceIsSignificant`):
 * esta fracción es sensible al ANCHO de los intervalos, no solo a la
 * distancia entre sus centros. Cuando ambos intervalos son anchos (n
 * pequeño en ambos lados), un intervalo puede quedar mayormente
 * contenido dentro del otro incluso si las medias observadas están
 * separadas por una distancia grande (ej. 40% vs 60%, n=15 en ambos:
 * overlap ≈ 0.64, MUY por encima del umbral de "empate" pese a que la
 * diferencia observada es de 20 puntos). Krzywinski & Altman (2013)
 * [21] advierten exactamente sobre esta clase de error de lectura
 * visual — el propio Sección 4.2 del documento de fundamentos lo cita.
 * Por eso `overlapFraction` ya NO es el único criterio para clasificar
 * "empate estadístico" (ver `analyzeMap`); se mantiene como diagnóstico
 * secundario/visual, pero la clasificación usa un test de diferencia
 * de proporciones explícito.
 */
function overlapFraction(a, b) {
  const lo = Math.max(a.low, b.low);
  const hi = Math.min(a.high, b.high);
  const overlap = Math.max(0, hi - lo);
  const narrower = Math.min(a.high - a.low, b.high - b.low);
  if (narrower <= 0) return overlap > 0 ? 1 : 0;
  return Math.min(1, overlap / narrower);
}

/**
 * Test de diferencia de dos proporciones independientes, vía
 * aproximación normal al error estándar de la diferencia:
 *
 *   SE(p_A - p_B) = sqrt( pA(1-pA)/nA + pB(1-pB)/nB )
 *   z = (pA - pB) / SE
 *
 * Este es el criterio ESTADÍSTICAMENTE CORRECTO para "¿son p_A y p_B
 * distinguibles?" — a diferencia del solapamiento visual de intervalos
 * individuales (Sección 4.2, y ver limitación documentada en
 * `overlapFraction` arriba), que Gelman & Stern (2006) [20] y
 * Krzywinski & Altman (2013) [21] señalan como una fuente común de
 * error de lectura: la pregunta relevante no es "¿se solapan los
 * intervalos de cada proporción por separado?" sino "¿es la DIFERENCIA
 * entre ambas distinguible de cero?", que es una cantidad distinta con
 * su propio error estándar (más angosto que la suma naive de anchos).
 *
 * Se usa p̂ (winrate crudo observado), no el valor ajustado por
 * shrinkage, para no mezclar dos correcciones de incertidumbre
 * distintas (el shrinkage ya contrae el punto central en `adjA`/`adjB`
 * para fines de magnitud del delta; este test opera sobre la
 * variabilidad muestral cruda, que es lo que Wilson también usa).
 * Devuelve el estadístico z y si |z| supera el umbral de 95%
 * (aprox. 1.96, mismo nivel de confianza que Z_95 usado en Wilson).
 */
function differenceIsSignificant(pA, nA, pB, nB, z = Z_95) {
  if (nA === 0 || nB === 0) return { z: 0, significant: false, se: Infinity };
  const varA = (pA * (1 - pA)) / nA;
  const varB = (pB * (1 - pB)) / nB;
  const se = Math.sqrt(varA + varB);
  if (se === 0) return { z: pA === pB ? 0 : Infinity, significant: pA !== pB, se };
  const zStat = (pA - pB) / se;
  return { z: zStat, significant: Math.abs(zStat) >= z, se };
}

/**
 * Analiza un mapa completo dado los datos crudos de ambos equipos.
 * Aplica: Wilson (incertidumbre), shrinkage (corrección puntual),
 * diferencial ajustado, dirección de sesgo por asimetría de muestra
 * (Sección 4.3, casos a/b/c), y clasifica la confiabilidad del veto.
 *
 * CAMBIO DE DISEÑO: la clasificación "muestra insuficiente" ya NO
 * depende de un umbral de `n` fijado manualmente por el usuario
 * (antes: slider "n ≤ X"). La razón es de fondo, no solo de UX: un
 * mismo `n` no representa la misma certeza para todo winrate — un
 * winrate de 50% con n=10 tiene un intervalo de Wilson mucho más
 * ancho que uno de 5% o 95% con el mismo n=10 (Sección 3.1,
 * Var(p̂)=p(1-p)/n, máxima en p=0.5). Comparar n contra un número fijo
 * ignora esa dependencia. El criterio ahora es directamente el ANCHO
 * del intervalo de Wilson de cada lado — una cantidad que ya combina
 * n y p̂ correctamente — contra un umbral fijo de precisión
 * (`WIDE_INTERVAL_THRESHOLD`), no un umbral de conteo de partidas.
 */
const WIDE_INTERVAL_THRESHOLD = 0.35; // ancho de IC95 por encima del cual el dato se considera poco informativo

function analyzeMap({ map, pA, nA, pB, nB }, opts = {}) {
  const asymmetryRatio = opts.asymmetryRatio ?? 2.5; // n mayor >= 2.5x n menor

  const winsA = Math.round((pA / 100) * nA);
  const winsB = Math.round((pB / 100) * nB);

  const wilsonA = wilsonInterval(winsA, nA);
  const wilsonB = wilsonInterval(winsB, nB);

  const adjA = shrinkageEstimate(pA / 100, nA);
  const adjB = shrinkageEstimate(pB / 100, nB);

  const deltaRaw = pA / 100 - pB / 100;
  const deltaAdj = adjA - adjB;

  const overlap = overlapFraction(wilsonA, wilsonB);
  const diffTest = differenceIsSignificant(pA / 100, nA, pB / 100, nB);

  // Sección 4.3: dirección del sesgo por asimetría muestral
  let sampleBias = "c"; // muestras comparables
  let biasNote = "";
  const ratio = nA >= nB ? (nB === 0 ? Infinity : nA / nB) : (nA === 0 ? Infinity : nB / nA);

  if (nA > 0 && nB > 0 && ratio >= asymmetryRatio) {
    if (nA > nB) {
      sampleBias = "a";
      biasNote =
        "Tu muestra es más grande y estable; el winrate rival (menos partidas) tiende a regresar hacia 50%. La ventaja real probablemente esté subestimada por el diferencial crudo.";
    } else {
      sampleBias = "b";
      biasNote =
        "La muestra rival es más grande y estable; tu winrate (menos partidas) es más sensible a shrinkage. La ventaja observada a tu favor es menos confiable de lo que aparenta.";
    }
  } else {
    biasNote = "Tamaños de muestra comparables: no hay sesgo direccional derivado de la asimetría muestral.";
  }

  // Clasificación de confiabilidad del diferencial.
  // CRITERIO CORREGIDO (empate): ya no se decide por cuánto se solapan
  // visualmente los intervalos individuales (ver limitación documentada
  // en `overlapFraction`), sino por si la DIFERENCIA entre pA y pB es
  // distinguible de cero bajo un test explícito de dos proporciones
  // (`differenceIsSignificant`, Sección 4.2). Esto corrige casos como
  // pA=40%(n=15) vs pB=60%(n=15): diferencia de 20 puntos que el
  // criterio de solapamiento anterior podía marcar como "empate" según
  // el ancho relativo de los intervalos, sin evaluar la diferencia en sí.
  //
  // CRITERIO CORREGIDO (muestra insuficiente): en vez de comparar n
  // contra un umbral manual, se evalúa si el intervalo de Wilson de
  // CUALQUIERA de los dos lados es más ancho que WIDE_INTERVAL_THRESHOLD
  // — el sistema decide, no el usuario, y la decisión ya incorpora tanto
  // n como p̂ correctamente en vez de tratar todo winrate igual para un
  // mismo n.
  const eitherWide = (wilsonA.high - wilsonA.low) > WIDE_INTERVAL_THRESHOLD ||
                      (wilsonB.high - wilsonB.low) > WIDE_INTERVAL_THRESHOLD;
  let reliability;
  if (!diffTest.significant) {
    reliability = "empate-estadistico"; // diferencia no distinguible de cero
  } else if (eitherWide) {
    reliability = "incierto"; // diferencia sí distinguible, pero algún lado tiene intervalo poco preciso: tratar con cautela
  } else if (Math.abs(deltaAdj) < 0.03) {
    reliability = "marginal";
  } else {
    reliability = "confiable";
  }

  return {
    map,
    pA, nA, pB, nB,
    wilsonA, wilsonB,
    adjA, adjB,
    deltaRaw, deltaAdj,
    overlap,
    diffTest,
    sampleBias, biasNote,
    reliability,
    // Métrica auxiliar (ya NO determina el orden de las listas de
    // prioridad — ver rankForBan/rankForPick, que ordenan directo por
    // |deltaAdj|): magnitud del delta ajustado, penalizada si el mapa
    // es estadísticamente indistinguible de cero (empate) o muy
    // incierto. Se conserva por si resulta útil para otro uso futuro,
    // pero NO debe volver a usarse como criterio de sort de las listas
    // visibles sin también cambiar qué número se le muestra al usuario
    // — esa divergencia fue la causa del bug de orden reportado.
    banPriority:
      reliability === "empate-estadistico" ? Math.abs(deltaAdj) * 0.15 :
      reliability === "incierto" ? Math.abs(deltaAdj) * 0.5 :
      Math.abs(deltaAdj),
  };
}

/**
 * Ordena mapas por prioridad de veto bajo el marco minimax (Sección 1.4):
 * en el propio turno, priorizar eliminar la mayor amenaza del rival, es
 * decir, el mapa con mayor desventaja PARA EL LADO ACTIVO (`perspective`).
 *
 * SIMPLIFICADO: se ordena directamente por la magnitud de deltaAdj — el
 * mismo número que la UI muestra junto a cada mapa — en vez de por
 * `banPriority` (que aplicaba una penalización adicional por
 * confiabilidad estadística, invisible en el texto mostrado). Mezclar
 * ambas cosas producía una lista donde el orden no coincidía con el %
 * visible (ej. un +9.5% por encima de un +10.9%), que es más confuso
 * que útil incluso para quien entiende el porqué de la penalización. La
 * confiabilidad de cada mapa (Sección 3.2, "empate estadístico" /
 * "muestra insuficiente" / "confiable") sigue visible como etiqueta en
 * cada tarjeta — no se oculta, solo deja de reordenar en silencio contra
 * el propio número que se le muestra al usuario.
 * @param {number} perspective - 1 para ver desde el lado A, -1 desde B.
 */
function rankForBan(analyzedMaps, perspective = 1) {
  return [...analyzedMaps]
    .filter((a) => a.deltaAdj * perspective < 0)
    .sort((a, b) => Math.abs(b.deltaAdj) - Math.abs(a.deltaAdj));
}

/**
 * Ordena mapas por prioridad de pick: mayor ventaja para el lado activo.
 * Ver nota de `rankForBan` sobre por qué se ordena por deltaAdj directo.
 */
function rankForPick(analyzedMaps, perspective = 1) {
  return [...analyzedMaps]
    .filter((a) => a.deltaAdj * perspective > 0)
    .sort((a, b) => Math.abs(b.deltaAdj) - Math.abs(a.deltaAdj));
}

if (typeof module !== "undefined") {
  module.exports = {
    wilsonInterval,
    shrinkageEstimate,
    overlapFraction,
    differenceIsSignificant,
    analyzeMap,
    rankForBan,
    rankForPick,
    Z_95,
  };
}

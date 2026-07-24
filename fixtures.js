// ============================================================
// Base de datos de fixtures de regresión — parser.js
//
// Texto OCR REAL (Tesseract 5.3.4, PSM 3, sin preprocesado) capturado
// de 6 pantallas distintas de veto/stats de TAPIT.GG. Consolidado
// desde los archivos sueltos veto_01..06_*.txt que existían antes
// (uno por captura) en una sola fuente de verdad versionable, con
// metadata explícita (kind, minMaps/expected, label) en vez de tener
// esa lógica hardcodeada dispersa dentro del test runner.
//
// POR QUÉ SIGUE SIENDO TEXTO "CRUDO" Y NO SE LIMPIA: cada `rawText`
// es la salida real y sin editar de Tesseract sobre una captura real
// — incluye ruido, glifos confusables (©, °, », «, ¢, +) y dígitos
// mal leídos (S/5, B/8, O/0, G/6) exactamente como los produjo el
// motor. Limpiarlo a mano destruiría el propósito del fixture: probar
// que parser.js tolera ESTE ruido específico, no una versión editada
// de él. Ver `Fundamentos_del_Veto_Competitivo_de_Mapas.md` y el
// historial de bugs en README.md para el contexto de cada caso.
//
// DOS `kind` distintos:
//   - "whole-image": texto de una captura de página completa, se
//     valida con `parseMapRows` + un mínimo de mapas esperados
//     (`minMaps`) — no se fija un ground-truth exacto porque el ruido
//     hace que ciertas filas puedan perderse sin que sea un bug (ver
//     comentario de cada caso).
//   - "per-row": el pipeline por fila (detectRowBands + runPerRowOCR
//     en app.js) ya aísla cada fila ANTES del OCR — así que aquí cada
//     entrada de `rows` es una línea ya aislada, con un ground-truth
//     EXACTO esperado (`expected`), fila por fila. Este es el caso
//     que reproduce el fix del bug de "cascada de etiquetas".
// ============================================================

const FIXTURES = [
  {
    id: "veto_01_7maps",
    label: "7 mapas, vista veto completa",
    kind: "whole-image",
    // Caso base sin mayor corrupción de dígitos — sirve como ancla de
    // que el patrón principal (ROW_PATTERN, con separador "©"/"°")
    // sigue funcionando en el caso limpio antes de probar los casos
    // degradados de abajo.
    minMaps: 7,
    rawText: `
(47%) 32 © 47 (60%) &

(59%) 51 © 27 (52%) &

bed Nuke ¥& (43%) 14 © 22 (59%) we
Pee Ancient —® (67%) 12 © 7 (25%)

Sau (62%) 13 © 21 (33%) &

3& (36%) 14 © 22 (55%)

(83%) 6 ° 4 (0%)
`.trim(),
  },

  {
    id: "veto_02_team100fe",
    label: "team_100fe baneando (7 filas, 1 con dígito ilegible)",
    kind: "whole-image",
    // Una fila trae "SB ° B2" (S/5 y B/8 confundidos) — prueba que el
    // resto de las filas no se vea arrastrado por ese error de dígito.
    minMaps: 6,
    rawText: `
team_100fe is banning a map
00:27

(41%) 41 © 40 (55%) &

Ye (33%) SB ° B2 (47%) we

we (94%) 16 » 20 (35%) &

Ie (50%) 8° 7 (71%)

(50%) 6 © 13 (15%) 3&

¥& (29%) 14 © 5 (40%)

(0%) 5 © 3 (67%)
`.trim(),
  },

  {
    id: "veto_03_cronochi",
    label: "team_Cronochi baneando (7 filas, 3 con dígito ilegible: SO, +B)",
    kind: "whole-image",
    // El caso más degradado de los seis: 3 de 7 filas con dígitos
    // ilegibles ("SO", "+B" en dos filas distintas). minMaps=4 es
    // deliberadamente bajo porque este fixture existe para probar que
    // el parser NO colapsa a 0 filas bajo ruido pesado, no para
    // garantizar recuperación perfecta del 100% del ruido.
    minMaps: 4,
    rawText: `
team_Cronochi is banning a map
00:17

pees (43%) 30 ¢ SO (40%)
(43%) 51 © 42 (55%)
bed Nuke ‘& (68%) 19 © 23 (61%) we
& (57%) 12 © 7 (29%)

) iN Inferno (28%) 18 + B (38%) &
Anubis (57%) 12 + 10 (60%)

3¥& (38%) B » 10 (50%)
`.trim(),
  },

  {
    id: "veto_04_khalifa",
    label: "team_the_khalifa baneando (7 filas, 2 con dígito ilegible: G, B)",
    kind: "whole-image",
    minMaps: 5,
    rawText: `
team_the_khalifa is banning a map
00:24

Dust2 (45%) 40 © 73 (55%)

We (45%) 47 © 20 (45%) &

3¥& (36%) 22 © G (50%)

Ik (75%) B ° 14 (64%)

3¥& (33%) 15 © 10 (90%) &

(75%) 4» 15 (73%)

(75%) 4 © 12 (42%) 3&
`.trim(),
  },

  {
    id: "veto_05_statspanel",
    label: "panel de stats ampliado, mucho ruido alrededor",
    kind: "whole-image",
    // Este fixture es el más importante para probar ESPECIFICIDAD, no
    // solo recall: el texto trae un panel de stats extendido de
    // TAPIT.GG (ratings, K/D, ADR, nombres de jugadores, etc.) antes
    // de la sección real de veto. Prueba que ROW_PATTERN no genere
    // falsos positivos sobre ese ruido y solo ancle en las filas
    // numéricas reales de la sección "is banning a map".
    minMaps: 6,
    rawText: `
andard Match

team_Santilechex , ,) ) 98
‘cd

ATS - LAST 30 MATCHES TAPIT.GG

23333

tilechex &
5: 92

co}
sit Round Avg Avg Avg AVG jeg,
ng Swing Kills K/D K/R ADR
9 027% 17 108 O78 919
bullcoco 351 (3
5: 269

co}
sit Round Avg Avg Avg AVG jicy,
ng Swing Kills K/D K/R ADR 4.

% 1 083 055 663

egri & pw G
5: 139

co
sit Round Avg Avg Avg AVG jicy,
ng Swing Kills K/D K/R ADR 2,'

% 915 124 «O75 773

-* 891 (3
5179

co}

oe |

6s
NS

1033 (+46) (« 987 (-46) (+

team_xPeaceSellsx is banning a map
00:27

Ye (60%) 50 ° 44 (50%) we

(51%) 47 © 53 (60%) &

Yk (53%) 12 © 26 (35%) &

3% (25%) B + B (25%) 3

(67%) 6 ¢ 7 (86%)

'W (57%) 21° 2 (0%)

Ls Cache (40%) 5 « 10 (50%)
* * * *
Bestmap Secondbestmap Second worst map Worst map

| Teams WIN RATE PER MAP TAPIT.GG

team_xPeaceSellsx

Players

RES nen ae

"a San Sa a

& xPeaceSellsx % ee
Matches: 257 -
Last30 Rating Swing rm rai (a
matches 1.02 -1.50% 13 085 063
@ = LUGANO_& A
© Matches: 129 a
Last30 Rating Swing rm rai (i
matches - % 13 087 O62
= SoraArthur A
é 1
% Matches: 209
Last30 Rating Swing ra rai aa
matches - % 16 103 O72
® Elsinz 1
Matches: 421
`.trim(),
  },

  {
    id: "veto_06_kyosuxe_rows",
    label: "fix de cascada de etiquetas — 7 filas ya aisladas por recorte",
    kind: "per-row",
    // Reproduce el bug reportado el 22/07/2026: "no se detectó Nuke".
    // Diagnóstico real: un dígito ilegible en una fila intermedia
    // desincronizaba el cursor secuencial de nombres para TODAS las
    // filas siguientes. El fix usa el índice GEOMÉTRICO real de cada
    // fila (medido en la imagen antes de correr OCR), así que aquí
    // cada línea ya viene aislada — el test verifica que
    // parseRowNumbers + findMapNameInRow devuelvan exactamente estos
    // valores, fila por fila, sin corrimiento de etiquetas.
    rows: [
      {
        text: "Dust2 *& (39%) 28 ¢ 23 (48%)",
        expected: { map: "Dust2", pA: 39, nA: 28, nB: 23, pB: 48 },
      },
      {
        text: "Mirage (48%) 33 ¢ 49 (51%) &",
        expected: { map: "Mirage", pA: 48, nA: 33, nB: 49, pB: 51 },
      },
      {
        text: "wal Nuke W& (73%) 15 ¢ 15 (73%) &",
        expected: { map: "Nuke", pA: 73, nA: 15, nB: 15, pB: 73 },
      },
      {
        text: "Pace Ancient ¥& (85%) 13 ¢ 8 (38%) &",
        expected: { map: "Ancient", pA: 85, nA: 13, nB: 8, pB: 38 },
      },
      {
        text: "S RRR E;, 7. \\\\ Inferno (71%) 14 © 15 (47%)",
        expected: { map: "Inferno", pA: 71, nA: 14, nB: 15, pB: 47 },
      },
      {
        text: "a Anubis %& (44%) 18 ¢ 10 (40%) *&",
        expected: { map: "Anubis", pA: 44, nA: 18, nB: 10, pB: 40 },
      },
      {
        text: "Cache (67%) 9 e 7 (71%)",
        expected: { map: "Cache", pA: 67, nA: 9, nB: 7, pB: 71 },
      },
    ],
  },

  // ------------------------------------------------------------
  // Fixtures de POOL DINÁMICO (nuevo — cubre el bug de asunción de
  // 7 mapas fijos en STANDARD_ORDER, ver conversación de depuración).
  // Estos SÍ son texto sintético (no capturas reales): lo que prueban
  // es lógica de negocio (tamaño/composición del pool activo), no
  // tolerancia a ruido de OCR, así que no hace falta que el ruido sea
  // "real" — basta con forzar que el nombre no se reconozca ("???")
  // para ejercitar la rama de fallback posicional.
  // ------------------------------------------------------------

  {
    id: "veto_07_premium_3maps",
    label: "FACEIT Premium: doble baneo simultáneo, veto sobrevive con 3 mapas",
    kind: "whole-image",
    minMaps: 3,
    // No se fija `expectedNoPositionalGuess` aquí como campo de
    // FIXTURES en sí — la aserción específica de "no debe inventar
    // nombre posicional" vive en el bloque de test dedicado a
    // buildFallbackPool, no en el runner genérico whole-image (ver
    // parser.regression.test.js). Este fixture solo garantiza que
    // 3 filas no colapsen a 0.
    rawText: `
??? (55%) 10 © 8 (60%)
??? (40%) 12 © 9 (45%)
??? (70%) 5 © 6 (65%)
`.trim(),
  },

  {
    id: "veto_08_voto_8maps",
    label: "Voto popular: mapa opcional de temporada (Vertigo), 8 mapas en veto",
    kind: "whole-image",
    minMaps: 8,
    rawText: `
??? (50%) 10 © 12 (40%)
??? (51%) 11 © 22 (41%)
??? (52%) 12 © 23 (42%)
??? (53%) 13 © 24 (43%)
??? (54%) 14 © 25 (44%)
??? (55%) 15 © 26 (45%)
??? (56%) 16 © 27 (46%)
??? (57%) 17 © 28 (47%)
`.trim(),
  },
];

if (typeof module !== "undefined") {
  module.exports = { FIXTURES };
}

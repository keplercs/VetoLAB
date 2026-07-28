// ============================================================
// ocrConstants.js — Fuente única de constantes frágiles de OCR
//
// Origen: Guía de seguimiento y resolución de errores — VetoLAB,
// Grupo 9 #1, basado en VetoLAB_TAPIT_Analisis_Tecnico.md, Sección
// 12.6 ("Externalizar constantes de OCR frágiles a un lugar único,
// versionable") — inspirado directamente en el mecanismo de
// auto-actualización de selectores CSS de la propia extensión TAPIT
// (Sección 3.2 del mismo documento: TAPIT centraliza sus selectores
// remotos en vez de dispersarlos hardcodeados por todo el bundle).
//
// POR QUÉ ESTO EXISTE: antes de este archivo, cada constante sensible
// al comportamiento VISUAL de TAPIT.GG vivía dispersa en el archivo
// que la consumía (el umbral de "n inusualmente alto" en parser.js, el
// rango de matiz de `suppressIconColors` en app.js, el umbral de
// distancia de Hamming en iconMatch.js, la tabla de glifos confusables
// en parser.js), sin ningún punto único donde un futuro mantenedor
// viera de un vistazo que TODAS dependen del mismo tercero externo y
// que un cambio de versión de TAPIT podría invalidar varias a la vez.
// Se consolidan aquí, con su justificación numérica citada contra el
// propio código fuente de TAPIT (no una estimación), SIN mover la
// LÓGICA que las consume — parser.js/app.js/iconMatch.js siguen
// exportando sus propios símbolos sin cambios de nombre (compatibilidad
// con los tests de regresión existentes, que importan por nombre desde
// esos archivos, no desde aquí); solo cambia DÓNDE vive el valor
// canónico.
//
// PATRÓN NODE/NAVEGADOR (mismo criterio en los 3 archivos que
// consumen este módulo): en Node (tests), cada archivo se `require()`ea
// de forma aislada, así que importan este archivo explícitamente. En
// el navegador (scripts clásicos, sin bundler — ver <script> tags de
// index.html), este archivo se carga ANTES que parser.js/app.js/
// iconMatch.js, y sus `const` de nivel superior ya están disponibles
// como identificadores sueltos en ese mismo scope global compartido
// entre scripts clásicos (comportamiento estándar: múltiples <script>
// no-módulo en un documento comparten un único Global Lexical
// Environment para let/const, aunque cada uno tenga su propio registro
// de ejecución). Los tres consumidores NUNCA vuelven a declarar estos
// mismos nombres con var/let/const en el navegador (eso sería un
// SyntaxError de redeclaración contra el const ya presente en el scope
// global) — en vez de eso, envuelven el acceso en un objeto local de
// solo lectura (`OCR_CONST`) para que el resto de cada archivo lea
// `OCR_CONST.<NOMBRE>` de forma uniforme en ambos entornos.
// ============================================================

// Sección 11.5 / 12.1 del análisis técnico: el ajuste `matches_limit`
// de TAPIT (código fuente confirmado, no inferido) acota el historial
// POR JUGADOR a un máximo de 100 partidas totales, repartidas entre
// 7-10 mapas posibles — el conteo por mapa que efectivamente se
// muestra en una fila de veto nunca debería, en la práctica, acercarse
// a ese límite. El valor anterior (500) era inalcanzable incluso con
// OCR corrupto, así que el warning nunca disparaba donde debía. 120
// deja margen razonable sobre el máximo teórico (100) mientras sigue
// disparando ante el patrón real de fusión de dígitos que motivó este
// warning (ej. "12"+"7" leído como "127").
const N_UNUSUALLY_HIGH_THRESHOLD = 120;

// Sección 7.2 / 12.2: los 4 colores REALES del ícono de ranking en
// TAPIT (confirmados por el propio código fuente del componente `f`
// en el bundle de TAPIT, no inferidos visualmente):
//   mejor mapa    -> dorado  #c2ae40 (hue ≈ 46°)
//   2º mejor mapa -> plata   #b6b6b6 (hue neutro/sin dominante — un
//                     gris no tiene matiz propio que suprimir, por eso
//                     no aporta un rango de hue aquí; suppressIconColors
//                     ya lo ignora vía el filtro de saturación `delta`)
//   2º peor mapa  -> naranja #fb923c (Tailwind orange-400, hue ≈ 24-27°)
//   peor mapa     -> rojo    #ef4444 (Tailwind red-500, hue ≈ 0-4°, y
//                     por el wraparound circular del matiz también
//                     puede leerse cerca de 360°)
// El rango anterior de suppressIconColors (30-55°) solo cubría dorado.
// Se amplía para cubrir naranja y rojo sin invadir tonos de piel humana
// (que caen en un rango de hue similar, ~25-45°, pero con menor
// saturación — suppressIconColors ya exige `delta >= 40` ANTES de
// evaluar el matiz, lo que reduce el riesgo de falsos positivos sobre
// piel al combinarse con este rango ampliado).
const ICON_HUE_SUPPRESS_RANGES = [
  { min: 0, max: 55 },    // rojo (~0-4°) + naranja (~24-27°) + dorado (~46°): rango continuo
  { min: 350, max: 360 }, // rojo, lado alto del wraparound circular de hue
];

// iconMatch.js: umbral de distancia de Hamming (dHash 8x8, 64 bits)
// por debajo del cual dos hashes se consideran "el mismo mapa". Sin
// cambio de valor en esta ronda (16 sigue siendo el punto medio
// validado empíricamente — ver iconMatch.js para el detalle completo
// de la validación) — se centraliza aquí únicamente para que quede
// junto al resto de constantes calibradas contra TAPIT.GG, no porque
// haya evidencia nueva que justifique moverlo.
const MATCH_THRESHOLD_BITS = 16;

// parser.js: tabla de glifos que Tesseract confunde con una letra
// específica del nombre de un mapa (ver `deconfuseMapText`). Sin
// cambio de valores — centralizado por el mismo criterio que
// MATCH_THRESHOLD_BITS arriba.
const MAP_NAME_CONFUSABLES = {
  "¢": "c", "©": "c", "°": "o", "¡": "i", "@": "a", "€": "e", "$": "s",
};

if (typeof module !== "undefined") {
  module.exports = {
    N_UNUSUALLY_HIGH_THRESHOLD,
    ICON_HUE_SUPPRESS_RANGES,
    MATCH_THRESHOLD_BITS,
    MAP_NAME_CONFUSABLES,
  };
}

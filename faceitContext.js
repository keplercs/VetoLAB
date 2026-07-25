// ============================================================
// Contexto FaceIt — datos GLOBALES de referencia (no del equipo
// analizado), extraídos manualmente de infografías públicas
// oficiales de FaceIt/CS2 (cuenta @faceit / faceit.com/replay).
//
// POR QUÉ ESTO NO ENTRA AL MODELO MATEMÁTICO (math.js):
// Esto es exactamente el caso descrito en la Sección 0.3 del
// documento de fundamentos sobre "Pick % / Ban % histórico": es una
// variable potencialmente informativa pero ENDÓGENA — refleja qué
// elige/banea la población general de jugadores, no el rendimiento
// del equipo específico que se está analizando. Mezclarla con
// deltaAdj sin un modelo jerárquico apropiado introduciría sesgo no
// controlado. Se mantiene como capa de CONTEXTO separada: útil para
// leer junto al resultado ("este mapa lo juega/banea todo el mundo,
// así que mi rival probablemente lo conoce bien también"), nunca
// como input silencioso del cálculo de ventaja.
//
// LIMITACIÓN DECLARADA: estos números son agregados de TODA la
// población de FaceIt (no del rival específico), y las fuentes no
// son todas de la misma fecha ni región — ver `source` y `period`
// por dataset. Úsalos como contexto de meta general ("¿qué tan
// popular/temido es este mapa ahora mismo?"), no como sustituto de
// los datos por-equipo que ya lee el OCR.
// ============================================================

// Season 8 (Apr 28 – May 12, vigente al momento de escribir esto) —
// % de partidas jugadas en cada mapa, todas las regiones.
const FACEIT_PLAYRATE_CURRENT = {
  season: "Season 8",
  period: "28 abr – 12 may",
  source: "Infografía oficial FaceIt (Instagram/X @faceit)",
  data: {
    Mirage: 26.85, Dust2: 23.63, Ancient: 11.81, Anubis: 10.48,
    Cache: 8.97, Inferno: 8.65, Nuke: 6.77, Overpass: 2.84,
  },
};

// First map ban — % de veces que los JUGADORES (no el sistema) banean
// cada mapa como su primer baneo de la serie. Feb 2026, fin de Season 7.
const FACEIT_FIRST_BAN_RATE = {
  season: "Season 7 (cierre)",
  period: "febrero 2026",
  source: "Infografía oficial FaceIt (Instagram/X @faceit)",
  data: {
    Overpass: 18.7, Nuke: 15.8, Dust2: 14.4, Anubis: 14.2,
    Inferno: 13.5, Mirage: 12.0, Ancient: 11.4,
  },
};

// Respaldo histórico (no vigente, pero útil como referencia de tendencia
// si se quiere mostrar "¿subió o bajó este mapa en popularidad?").
const FACEIT_PLAYRATE_HISTORY = [
  {
    label: "Global, 21 jul – 21 ago 2025",
    data: {
      Mirage: 32.12, Dust2: 22.59, Ancient: 16.12, Inferno: 10.23,
      Nuke: 8.20, Overpass: 7.54, Train: 3.20,
    },
  },
  {
    label: "FaceIt 2025 anual (49.33M partidas)",
    data: {
      Mirage: 30.93, Dust2: 21.46, Ancient: 14.78, Anubis: 10.54,
      Inferno: 9.75, Train: 7.13, Nuke: 2.84, Overpass: 2.38,
    },
  },
];

/**
 * Devuelve el contexto FaceIt disponible para un mapa dado, o null si
 * el mapa no aparece en ninguno de los dos datasets vigentes (mapas
 * fuera del pool activo de Season 8, ej. Train/Vertigo en algunos
 * periodos).
 */
function getFaceitContext(mapName) {
  const playrate = FACEIT_PLAYRATE_CURRENT.data[mapName];
  const banrate = FACEIT_FIRST_BAN_RATE.data[mapName];
  if (playrate === undefined && banrate === undefined) return null;
  return {
    playrate: playrate ?? null,
    banrate: banrate ?? null,
    playratePeriod: FACEIT_PLAYRATE_CURRENT.period,
    banratePeriod: FACEIT_FIRST_BAN_RATE.period,
  };
}

if (typeof module !== "undefined") {
  module.exports = {
    FACEIT_PLAYRATE_CURRENT, FACEIT_FIRST_BAN_RATE, FACEIT_PLAYRATE_HISTORY,
    getFaceitContext,
  };
}

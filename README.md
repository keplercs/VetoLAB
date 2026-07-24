# VETO// — Sistema de apoyo a decisión para veto de mapas en CS2

Herramienta estática (sin backend) que lee capturas de la fase de veto de **TAPIT.GG / FACEIT**
mediante OCR en el propio navegador, y aplica el marco estadístico descrito en
`Fundamentos_del_Veto_Competitivo_de_Mapas.md`: intervalo de Wilson (incertidumbre muestral),
shrinkage bayesiano empírico (corrección hacia 50%), y diferencial ajustado con detección de
sesgo por asimetría de muestra.

## Cómo usarla

1. Abre `index.html` en el navegador (o publícala en GitHub Pages, ver abajo).
2. Sube una o más capturas de la vista de veto de TAPIT.GG (arrastrar o seleccionar archivo).
3. El OCR corre 100% en tu navegador (Tesseract.js) — ninguna imagen sale de tu equipo.
4. Revisa los mapas detectados; si algún dato quedó mal leído (posible en OCR), usa
   "ver nota de asimetría · editar" para corregirlo a mano.
5. Ajusta los sliders de **k** (peso del prior) y **umbral de muestra pequeña** si quieres
   ver cómo cambia la clasificación de confiabilidad.
6. Revisa las listas de **prioridad de baneo** y **prioridad de pick** al final.

## Publicar en GitHub Pages

```bash
git init
git add index.html app.js math.js parser.js faceitContext.js tapit-example.svg README.md
git commit -m "Sistema de apoyo a veto de mapas CS2"
git branch -M main
git remote add origin <tu-repo>.git
git push -u origin main
```

Luego, en el repositorio de GitHub: **Settings → Pages → Source: main branch, carpeta raíz (/)**.
La página quedará disponible en `https://<tu-usuario>.github.io/<tu-repo>/`.

No se requiere build step ni dependencias de servidor — todo es HTML/CSS/JS plano más Tesseract.js
vía CDN.

## Estructura de archivos

- `index.html` — estructura y estilos (HUD táctico oscuro), más el modal "¿Cómo funciona?".
- `math.js` — Wilson score interval, shrinkage bayesiano empírico, diferencial ajustado,
  clasificación de confiabilidad, ranking de prioridad de ban/pick.
- `parser.js` — parser tolerante a errores de OCR que reconoce el patrón de fila de TAPIT.GG:
  `[Mapa] [★?] (winrate%) partidasA · partidasB (winrate%) [★?]`.
- `faceitContext.js` — datos GLOBALES de referencia de FaceIt (pick-rate por Season, first-ban-rate)
  extraídos manualmente de infografías públicas oficiales. No entran al cálculo de `deltaAdj` —
  se muestran junto a él como contexto de meta general, siguiendo la misma separación que la
  Sección 0.3 del documento de fundamentos aplica al pick/ban rate del propio equipo.
- `tapit-example.svg` — diagrama esquemático (no una captura real) usado en el modal "¿Cómo
  funciona?" para mostrar qué campos busca leer el OCR en cada fila.
- `app.js` — orquesta la subida de archivos (arrastrar, seleccionar, o pegar desde el
  portapapeles), ejecuta Tesseract.js, y renderiza la UI.

## Cambios de esta ronda: layout de una columna, contexto FaceIt, pegado desde portapapeles

- **Layout**: la lista de mapas vuelve a una sola columna (consistente con el layout vertical
  de FaceIt), y cada tarjeta usa su ancho completo internamente: ~2/3 para los datos del modelo
  matemático (barras, IC95, delta ajustado) y ~1/3 para el contexto FaceIt (pick-rate / first-ban
  global). El pie de cada tarjeta ("detalles · editar" / "eliminar") ahora vive en una fila
  explícita (`.card-foot`) con `justify-content:space-between`, en vez de quedar descolocado.
- **Modal "¿Cómo funciona?"**: el texto largo de introducción se movió del cuerpo principal a un
  modal accesible desde el botón del header, con los 4 pasos del flujo, los 3 métodos de carga
  (arrastrar, seleccionar, pegar) y un esquema ilustrativo de una fila de veto anotada.
- **Pegado desde el portapapeles**: `document.addEventListener("paste", ...)` intercepta imágenes
  copiadas al portapapeles (ej. tras un screenshot) y las procesa igual que un archivo arrastrado,
  sin necesitar guardar el archivo primero.
- **Prioridad centrada + gradiente**: la sección de Prioridad ahora está centrada (`margin:0 auto`)
  y cada fila tiene una barra lateral con gradiente continuo rojo→blanco→verde según la magnitud
  real del delta ajustado (no según en qué lista cayó) — un +2% marginal se ve casi blanco, un
  +18% se ve verde intenso. Un ícono "i" con tooltip nativo (`title`, funciona con hover y con
  tap/focus en móvil) explica en una línea por qué el mapa quedó en esa posición.
- **Contexto FaceIt (pick-rate / first-ban)**: los datos vienen de infografías públicas oficiales
  de FaceIt (Season 8 vigente y first-ban de febrero 2026). Son agregados GLOBALES de toda la
  comunidad, no del rival específico que estás analizando — se muestran como referencia de meta
  general, nunca como input del cálculo de `deltaAdj`. Ver el comentario en `faceitContext.js`
  para la justificación completa de por qué se mantienen separados del modelo matemático.

## Bug corregido: 0 mapas detectados en toda captura real

**Síntoma:** el sitio nunca detectaba ningún mapa, en ninguna captura, sin importar la calidad de la imagen.

**Causa raíz:** `ROW_PATTERN` en `parser.js` exigía que el separador visual `•` entre los dos conteos de partidas (`nA • nB`) sobreviviera el OCR como uno de `[•·,*\-–]`. En la práctica, Tesseract nunca transcribe ese bullet como ninguno de esos caracteres — según la captura lo lee como `©`, `°`, `»`, `«`, `¢` o `+`. El resultado: el regex nunca coincidía con ninguna fila real, en ninguna de las 5 capturas de prueba (verificado con Tesseract 5.3.4).

**Fix:** el separador ya no se matchea contra una lista fija de símbolos — se acepta cualquier fragmento corto (1–5 caracteres) que no sea dígito ni paréntesis entre los dos conteos. Esto es robusto a cualquier glifo nuevo que produzca el OCR en el futuro, en vez de perseguir símbolos uno por uno.

Adicionalmente se añadió un preprocesado de imagen (escala 3x + escala de grises + autocontraste vía `<canvas>`) antes de pasar la imagen a Tesseract, lo que reduce — aunque no elimina del todo — confusiones dígito/letra (`5↔S`, `0↔O`, `6↔G`, `8↔B`) en capturas con texto pequeño.

Ver `tests/parser.regression.test.js` para el test de regresión que reproduce este bug contra texto OCR real capturado de 5 pantallas distintas de TAPIT.GG (`tests/fixtures/`). Ejecutar con:

```bash
node tests/parser.regression.test.js
```

## Segundo bug corregido: un mapa "desaparece" o sale con datos de otro

**Síntoma:** un mapa específico (ej. "Nuke") no aparece en la lista, o aparece con datos que no coinciden con la captura.

**Causa raíz real (no el separador — ese ya estaba arreglado):** cuando una fila EN MEDIO de la lista tiene un dígito ilegible para el OCR (ej. "13 © 8" leído como "13 © B"), esa fila entera dejaba de coincidir con el patrón numérico y desaparecía por completo del texto reconocido. El asignador de nombres de mapa por posición usaba un cursor secuencial que solo avanzaba sobre las filas que SÍ se habían logrado parsear — así que, a partir del hueco, cada mapa siguiente terminaba etiquetado con el nombre del mapa ANTERIOR en el pool: Inferno aparecía como "Ancient", Anubis como "Inferno", Cache como "Anubis", y Cache mismo desaparecía sin dejar rastro. Esto es lo que se veía como "no se detectó Nuke" en algunas capturas, dependiendo de en qué fila caía el dígito ilegible.

**Fix estructural:** en vez de adivinar la posición de cada mapa a partir de qué texto logró leerse (`app.js`, funciones `detectRowBands` + `runPerRowOCR`):

1. Se mide el brillo promedio de cada línea de píxeles de la captura para encontrar las bandas de contenido (las tarjetas de mapa) separadas por fondo casi negro — **sin asumir fuente, tamaño de letra ni márgenes fijos**: el nivel de fondo y el umbral se calculan por percentiles sobre la propia imagen, así que se adapta automáticamente a capturas de cualquier resolución o dispositivo.
2. Cada banda detectada obtiene un índice fijo por su posición vertical real en la imagen — este índice ya no depende de si el OCR logró leer esa fila o no.
3. Cada fila se recorta con relleno vertical generoso (recorte muy ajustado corta el separador "•" y fusiona los dos conteos, ej. "15 • 15" → "15615" — validado empíricamente) y se OCR-ea de forma **aislada**, con Tesseract en modo `PSM.SINGLE_LINE`. Esto también mejora sustancialmente la lectura del nombre del mapa, al aislarlo de filas vecinas e iconos.
4. Si el nombre no se reconoce en el texto de esa fila, se asigna por el índice geométrico (`STANDARD_ORDER[i]`) — que ahora es siempre correcto, con o sin huecos por dígitos ilegibles en otras filas.

Si una captura no tiene la forma de una lista limpia de filas (p. ej. el panel de estadísticas ampliado de TAPIT.GG), el sistema cae automáticamente al pipeline de imagen completa anterior.

Ver `tests/fixtures/veto_06_kyosuxe_rows.txt` y el bloque de test correspondiente en `tests/parser.regression.test.js` para la reproducción exacta de este caso.

## ¿Qué necesitas para mejorar el OCR? (Y por qué no coordenadas fijas)

**No hace falta identificar fuente, tamaño de letra ni márgenes de TAPIT.GG de forma manual** — y de hecho es mejor no depender de eso: cualquier valor fijo (ej. "la fila empieza en el pixel 127") se rompe en cuanto la captura tiene otra resolución, factor de escala de pantalla, o el usuario recorta la imagen de forma distinta. Lo que realmente mueve la aguja, en orden de impacto medido:

1. **Aislar cada fila antes de leerla** (implementado arriba) — el cambio de mayor impacto. Mismo contenido, pasar de "leer la página completa" a "leer una fila a la vez" corrigió tanto nombres de mapa ilegibles como dígitos mal leídos en las pruebas.
2. **Relleno generoso al recortar** — un recorte ajustado exactamente a los bordes del texto corta el separador visual y fusiona números adyacentes. Esto se verificó empíricamente probando distintos paddings.
3. **Escala 3-4x antes de OCR** — el texto de estas filas ronda 14-18px, por debajo de lo que Tesseract reconoce con buena precisión; escalarlo ayuda, aunque no elimina el 100% de las confusiones dígito/letra (siguen ocurriendo con menor frecuencia).
4. **PSM correcto**: `SINGLE_LINE` (7) para una fila aislada, en vez del modo automático de página completa, que intenta segmentar columnas/imágenes y puede saltarse texto junto a los íconos de mapa.

**Sobre alternativas de OCR en GitHub:** para una herramienta 100% cliente (sin backend, como esta), Tesseract.js sigue siendo la opción madura más práctica — motores más precisos como PaddleOCR o EasyOCR no tienen un build WASM/navegador comparable en mantenimiento activo. El cuello de botella no era el motor sino cómo se le entregaba la imagen; con la segmentación por fila esto ya está bastante cerca del techo práctico de Tesseract para este tipo de captura. Si en el futuro la precisión sigue sin ser suficiente, la siguiente palanca real sería enviar la imagen a un servicio de OCR en la nube (Google Cloud Vision, Azure Computer Vision), pero eso ya implica dejar de ser una herramienta sin backend.

## Notas sobre el OCR

- El reconocimiento de nombres de mapa usa una lista fija (`MAP_POOL` en `parser.js`) —
  agrega ahí cualquier mapa nuevo del pool activo si Valve lo actualiza.
- Los símbolos de estrella (mejor/segundo mejor/segundo peor/peor mapa) rara vez sobreviven al
  OCR de forma legible; el sistema no depende de ellos para el cálculo — son puramente
  informativos, tal como se documenta en la Sección 0.3 del documento de fundamentos.
- Cualquier fila con valores fuera de rango o inconsistentes (ej. n=0 con winrate>0) se marca
  con ⚠ para revisión manual — el sistema nunca oculta un dato dudoso silenciosamente.

## Limitaciones declaradas

Esta herramienta hereda las limitaciones explícitas del documento de fundamentos: el modelo
usa el diferencial simple (no un Bradley-Terry completo con estructura de oponente), los
valores de calibración (`k`, umbral de muestra) son razonables por analogía y no ajustados
empíricamente sobre datos de CS2, y TAPIT.GG es una fuente no auditable cuyo sesgo sistemático
(si existe) se propaga a las estimaciones. Úsala como apoyo, no como oráculo.
"# VetoLAB" 
"# VetoLAB" 
"# VetoLAB" 

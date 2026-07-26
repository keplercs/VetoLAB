# Fundamentos Matemáticos y Estadísticos del Veto Competitivo de Mapas

**Documento técnico — Versión 2.0**

---

## Resumen

Este documento formaliza los principios matemáticos y estadísticos aplicables a la fase de veto (ban/pick) de mapas en juegos competitivos por equipos, tomando como caso de estudio el formato de veto alternado usado en Counter-Strike 2 sobre plataformas como FACEIT, con datos complementarios de la extensión de terceros TAPIT.GG. Se cubren cinco problemas fundamentales: (0) la naturaleza y estructura de los datos observables provistos por TAPIT.GG y cómo se incorporan al modelo; (1) la estructura formal del proceso de veto como juego secuencial de información perfecta; (2) el problema del diferencial de rendimiento entre equipos como magnitud relevante de decisión; (3) el ruido estadístico inherente a estimaciones de winrate con muestras finitas, y los métodos estándar para corregirlo; y (4) el tratamiento de diferenciales pequeños bajo incertidumbre estadística.

Es importante declarar de antemano el alcance de este documento: **no existe literatura académica revisada por pares específica sobre veto de mapas en videojuegos competitivos**. Lo que aquí se presenta es la aplicación de resultados matemáticos y estadísticos extensamente verificados —provenientes de teoría de juegos combinatoria, estadística de proporciones binomiales, e inferencia bayesiana empírica— a este dominio específico. Cada sección distingue explícitamente entre el resultado teórico establecido (con su cita correspondiente) y la extrapolación o aplicación al caso del veto de mapas, que constituye razonamiento derivado y no un hallazgo verificado de forma independiente.

### Criterio de selección de método: meritocracia, no antigüedad ni novedad

Este documento no privilegia sistemáticamente ni el método más antiguo ni el más reciente. El criterio de selección es el **desempeño demostrado en el régimen de datos relevante para el caso de uso** (típicamente, muestras de 5 a 90 partidas por mapa, proporciones no extremas). Cuando la literatura reciente demuestra una mejora medible sobre un método clásico en ese régimen específico, se adopta el método reciente y se documenta la magnitud de la mejora. Cuando la literatura reciente no logra superar a un método clásico en ese régimen —o cuando la mejora reportada aplica a un régimen distinto (por ejemplo, proporciones extremas cercanas a 0 o 100%, o tamaños de muestra muy grandes)— se mantiene el método clásico y se documenta explícitamente por qué. Cada sección de método incluye una subsección de **"vigencia y meritocracia"** con esta evaluación explícita.

---

## 0. La fuente de datos: estructura de la información provista por TAPIT.GG

### 0.1 Naturaleza de la extensión

TAPIT.GG es una extensión de navegador de terceros que se superpone a la interfaz nativa de veto de mapas de FACEIT, enriqueciéndola con estadísticas históricas de rendimiento por mapa para ambos equipos involucrados en la partida. A diferencia de la interfaz nativa de FACEIT — que durante el veto en vivo muestra únicamente indicadores relativos de preferencia (por ejemplo, iconos de "mejor mapa" o "peor mapa" del equipo propio, sin cifras comparativas del rival) — TAPIT.GG expone directamente los valores numéricos que este documento trata como variables de entrada del modelo.

Es necesario señalar que TAPIT.GG **no es una fuente académica ni verificada de forma independiente**: es un producto de terceros cuya metodología interna de cálculo (período de agregación, definición exacta de "partida jugada", tratamiento de partidas anuladas o abandonadas, etc.) no es pública ni auditable desde este documento. Los datos que provee se tratan, por tanto, como **observaciones empíricas de entrada al modelo estadístico**, sujetas a los mismos principios de tratamiento de incertidumbre que cualquier estimación de proporción con muestra finita (Sección 3), y no como un ground truth infalible.

### 0.2 Estructura de los datos observados

A partir de la inspección directa de capturas de la extensión en uso, cada fila de mapa provee la siguiente estructura de datos, para cada uno de los dos equipos:

| Campo | Descripción | Ejemplo observado |
|---|---|---|
| Winrate del equipo propio | Porcentaje de partidas ganadas en ese mapa, sobre el conjunto de rivales enfrentados en el período de agregación | 39% |
| Partidas jugadas del equipo propio | Conteo absoluto de partidas jugadas en ese mapa por el equipo propio | 28 |
| Winrate del rival | Porcentaje de partidas ganadas en ese mapa por el equipo rival | 54% |
| Partidas jugadas del rival | Conteo absoluto de partidas jugadas en ese mapa por el equipo rival | 41 |
| Indicador visual de ranking relativo | Iconografía (estrella dorada = mejor mapa, estrella gris = segundo mejor, símbolo ámbar = segundo peor, símbolo rojo = peor mapa) que resume el ranking del mapa dentro del propio pool de siete mapas de cada equipo | ★ / ⚡ (ámbar) / 🔥 (rojo) |
| Estado del mapa en el veto | Presencia o ausencia de color y estadísticas activas en la fila; un mapa ya baneado durante el proceso de veto pierde su codificación de color y aparece en escala de grises, mientras conserva o pierde su texto numérico dependiendo de la variante de interfaz | Color activo vs. escala de grises |

Adicionalmente, cuando se navega a la sección de estadísticas de equipo de un agregador (no la vista de veto en vivo, sino un panel de análisis histórico más amplio, también consultado en este trabajo), TAPIT.GG y agregadores similares proveen datos complementarios por mapa, no disponibles en la vista de veto en vivo:

| Campo adicional | Descripción |
|---|---|
| Distribución de mapas jugados | Conteo absoluto de partidas jugadas por el equipo en cada mapa del pool completo, dentro de la ventana temporal filtrada |
| Victorias / empates / derrotas | Desglose W/D/L específico por mapa |
| Total de rounds jugados | Suma de rounds disputados en ese mapa, relevante como indicador adicional de volumen de muestra a nivel de ronda, no solo de partida |
| Round win-% tras conseguir el primer kill / tras recibir la primera muerte | Métricas de eficiencia condicional dentro de la ronda, no utilizadas directamente en el modelo de este documento pero potencialmente relevantes para refinamientos futuros |
| Pick % / Ban % | Frecuencia histórica con la que el equipo elige o banea voluntariamente ese mapa cuando tiene el turno, en el conjunto de partidas observadas |
| Mayor victoria / mayor derrota | Resultado extremo observado en ese mapa, con el rival asociado |

### 0.3 Cómo se incorporan estos datos al modelo formal

De la estructura completa descrita en 0.2, el modelo formal desarrollado en las Secciones 1 a 4 de este documento utiliza directamente cuatro variables por mapa, para cada par de equipos enfrentados:

$$\{p_A, n_A, p_B, n_B\}$$

donde $p_A$ y $p_B$ son los winrates observados de los equipos A y B respectivamente, y $n_A$, $n_B$ son las cantidades de partidas jugadas que respaldan cada winrate — exactamente los cuatro primeros campos de la tabla en 0.2. Esta es una decisión deliberada de **reducción de dimensionalidad**: aunque TAPIT.GG y agregadores relacionados exponen variables adicionales (round win-% condicional, pick/ban rate histórico, distribución completa de mapas jugados), el modelo de las Secciones 1-4 se mantiene deliberadamente parsimonioso, limitado a las cuatro variables mínimas necesarias para aplicar el marco de diferencial ajustado por incertidumbre muestral.

Los campos restantes no se descartan por irrelevantes, sino porque su incorporación rigurosa requeriría extender el modelo más allá del alcance declarado de este documento:

- **Round win-% condicional** (tras primer kill / primera muerte) captura información sobre el estilo de juego dentro de la ronda, pero mezclarla directamente con el winrate de partida completa sin un modelo jerárquico apropiado introduciría una fuente de sesgo no controlada — el efecto de "buen desempeño condicional pero mala conversión" no es capturable por un ajuste de shrinkage univariado simple.
- **Pick % / Ban % histórico** es una señal potencialmente valiosa sobre la percepción *del propio equipo* respecto a su nivel en el mapa (un equipo que casi nunca banea un mapa probablemente lo considera fuerte, independientemente de su winrate crudo), pero introduce un problema de **variable endógena**: el pick/ban rate es en sí mismo el resultado de decisiones estratégicas pasadas, potencialmente influidas por las mismas asimetrías de información que este documento busca modelar (Sección 4.3 del documento original sobre mapas preparados fuera de la plataforma). Usarla como variable de entrada sin ese cuidado podría introducir circularidad.
- **Indicadores visuales de ranking** (iconografía de estrella/rayo/fuego) son una transformación categórica del mismo winrate crudo ya capturado numéricamente, y por tanto no aportan información adicional al modelo cuantitativo — su valor es puramente de interfaz para lectura rápida humana, no de entrada al cálculo.
- **Estado del mapa en el veto** (color activo vs. escala de grises) no es una variable de rendimiento sino de **estado del proceso de decisión** — indica si el mapa sigue disponible para banear, información estructural del árbol de juego (Sección 1), no del modelo estadístico de diferencial.

### 0.4 Limitación declarada sobre la fuente de datos

Dado que TAPIT.GG es una fuente no auditable de forma independiente, cualquier sesgo sistemático en su metodología de cálculo (por ejemplo, si excluye partidas de determinados formatos, o si su ventana de agregación temporal no es la que el usuario cree estar consultando) se propaga directamente a las estimaciones de $p_A$, $p_B$, $n_A$, $n_B$ y, por extensión, a todo el análisis derivado. Esta es una limitación de la fuente de datos, no del marco estadístico aplicado sobre ella — el tratamiento de incertidumbre muestral descrito en la Sección 3 corrige por el tamaño de muestra reportado, pero no puede corregir por errores sistemáticos no observables en la metodología de agregación de la extensión.

---

### 1.1 Formalización del problema

El formato de veto alternado de mapas —un conjunto de *n* mapas del cual los equipos eliminan alternadamente uno por turno hasta que sobrevive exactamente uno (o el número acordado para la serie)— es una instancia de un **juego combinatorio secuencial de dos jugadores, suma cero, con información perfecta**.

Los elementos que definen esta clase de juego son:

- **Dos jugadores** (equipos) que alternan turnos.
- **Información perfecta**: en cada turno, ambos jugadores conocen el estado completo del juego (qué mapas siguen disponibles, qué se ha baneado, de quién es el turno).
- **Sin elementos de azar** (a diferencia del póker o el backgammon): cada movimiento es una elección determinista del jugador.
- **Suma cero relativa al resultado del mapa**: la ventaja que un equipo obtiene al forzar cierto mapa es, en expectativa, la desventaja del otro, dado que el resultado de la serie de mapas se basa en probabilidades de victoria complementarias.
- **Terminación finita**: el juego termina en un número fijo y conocido de movimientos.

Esta clase de juegos fue formalizada dentro de la **teoría de juegos combinatoria** (*combinatorial game theory*, CGT), cuyo origen se atribuye a los trabajos de Charles L. Bouton sobre el juego de Nim a comienzos del siglo XX, y fue sistematizada rigurosamente por Berlekamp, Conway y Guy en *Winning Ways for Your Mathematical Plays* [1]. La CGT estudia específicamente juegos de dos jugadores, información perfecta, sin azar, con la propiedad de "descenso finito" (todo juego termina en un número finito de movimientos) [2].

### 1.2 Determinación del juego: el teorema de Zermelo

Un resultado fundacional, anterior incluso a la CGT moderna, es el **teorema de Zermelo (1913)**, que establece que en todo juego finito de dos jugadores, de información perfecta y sin azar, uno de los siguientes tres casos es cierto bajo juego óptimo de ambas partes: el primer jugador puede forzar una victoria, el segundo jugador puede forzar una victoria, o ambos jugadores pueden forzar al menos un empate [3]. Este teorema garantiza que el veto de mapas, como instancia de esta clase de juegos, tiene una **solución determinista bajo juego óptimo**: no hay elemento de suerte estructural en el proceso de veto en sí mismo (la incertidumbre real proviene de la imperfección de la información sobre las probabilidades de victoria por mapa, tratada en las secciones 3 y 4, no de la estructura del juego).

### 1.3 Resolución por inducción hacia atrás (backward induction)

El método estándar para resolver juegos secuenciales de información perfecta es la **inducción hacia atrás** (*backward induction*), que consiste en analizar el árbol de juego desde los nodos terminales hacia el nodo inicial, determinando en cada nodo la jugada óptima dado que todos los movimientos subsecuentes ya son óptimos. Este método fue formalizado dentro del marco de los juegos extensivos por von Neumann y Morgenstern en *Theory of Games and Economic Behavior* (1944) [4], y refinado posteriormente por Reinhard Selten mediante el concepto de **equilibrio perfecto en subjuegos** (*subgame perfect equilibrium*, SPE), introducido en su trabajo de 1965 sobre oligopolios con previsión estratégica y demanda [5]. El SPE exige que la estrategia de cada jugador sea óptima no solo en el curso de juego observado, sino en *todo* subjuego posible, eliminando lo que Selten denominó "amenazas no creíbles".

**Aplicación al veto de mapas** (extrapolación, no resultado citado directamente): la implicación práctica de este marco es que la decisión óptima en el turno *t* del veto no depende únicamente del estado actual del tablero de mapas, sino de una proyección de cómo se resolverán los turnos *t+1, t+2, ..., n* bajo la suposición de que el rival también juega óptimamente. Esto tiene una consecuencia contraintuitiva pero importante: el mapa final que "sobrevive" bajo juego óptimo de ambas partes tiende a ser aquel donde el diferencial de ventaja entre los equipos es más cercano a cero — es decir, el punto de equilibrio del sistema — y no necesariamente el mapa favorito de ninguno de los dos equipos. Cada jugador, en su turno, no protege su propia mejor opción directamente; elimina la mejor opción disponible *del rival*, y es precisamente esta simetría de eliminación mutua la que empuja el resultado final hacia el equilibrio.

### 1.4 Minimax y juegos de suma cero

El fundamento de por qué "eliminar la amenaza del rival" es la estrategia correcta, y no "proteger la propia ventaja", proviene del **teorema minimax** de von Neumann (1928, luego generalizado en la obra de 1944 con Morgenstern) [4], que demuestra que en todo juego finito de dos jugadores de suma cero existe una estrategia óptima para cada jugador que minimiza la máxima pérdida posible (o, de forma equivalente, maximiza la ganancia garantizada mínima). En el contexto del veto, dado que la ventaja relativa de un mapa para un equipo es aproximadamente la desventaja complementaria del otro (suma cero relativa), la estrategia minimax de cada jugador en su turno es eliminar la opción que representa el mayor valor esperado para el oponente, no la de menor valor propio — ambas formulaciones coinciden solo cuando el juego es estrictamente simétrico, lo cual no es el caso general en el veto de mapas dado que los diferenciales de rendimiento por mapa no son uniformes.

---

## 2. El problema del diferencial de rendimiento

### 2.1 Por qué el winrate absoluto es una métrica insuficiente

Una instancia frecuente de razonamiento erróneo en la evaluación de mapas es tratar el winrate absoluto de un equipo en un mapa dado como la magnitud relevante para la decisión de veto. Esta aproximación ignora que el resultado de un mapa jugado depende de **dos** distribuciones de habilidad interactuando, no de una sola.

Formalmente, si denotamos $p_A$ la probabilidad de que el equipo A gane un mapa dado contra el campo general de rivales, y $p_B$ la probabilidad análoga para el equipo B, la pregunta relevante en el veto no es el valor de $p_A$ en aislamiento, sino una estimación de $P(A \text{ gana} \mid A \text{ vs } B \text{ en ese mapa})$, que depende de la relación entre $p_A$ y $p_B$, no del valor absoluto de ninguno de los dos.

Esto es consistente con el marco general de los **modelos de emparejamiento competitivo** (*paired comparison models*), cuyo tratamiento estadístico clásico se remonta al modelo de Bradley y Terry (1952) [6], ampliamente utilizado en la literatura de análisis deportivo para estimar la probabilidad de victoria de un competidor sobre otro a partir de resultados históricos, y no de tasas de victoria absolutas descontextualizadas. El modelo de Bradley-Terry establece que, dados dos competidores con "fuerzas" latentes $\pi_A$ y $\pi_B$, la probabilidad de que A derrote a B es:

$$P(A \text{ vence a } B) = \frac{\pi_A}{\pi_A + \pi_B}$$

Esta formulación deja explícito que la probabilidad de victoria es función de la *razón* entre las fuerzas de ambos competidores, no del valor absoluto de ninguno. Un equipo con winrate histórico de 70% contra el campo general de rivales puede tener una probabilidad de victoria muy distinta de 70% contra un rival específico cuya fuerza relativa en ese mapa sea desproporcionadamente alta o baja.

### 2.2 El diferencial como proxy operativo

En ausencia de datos suficientes para ajustar un modelo de Bradley-Terry completo por mapa (que requeriría una matriz densa de resultados cabeza a cabeza, rara vez disponible a nivel de un solo equipo en la práctica competitiva), la aproximación operativa estándar —y la empleada en este análisis— es el **diferencial de winrate**:

$$\Delta = p_A - p_B$$

donde $p_A$ y $p_B$ son las tasas de victoria observadas de cada equipo en ese mapa contra el campo general de oponentes en el período considerado. Esta es una aproximación de primer orden al problema de comparación pareada: asume que la habilidad relativa en un mapa se traslada aproximadamente de forma lineal al enfrentarse a un rival específico, lo cual es una simplificación razonable cuando no se dispone de historial directo entre los dos equipos en cuestión, pero que **no sustituye** a un modelo de comparación pareada completo cuando dicho historial existe.

**Aplicación al veto** (extrapolación): bajo el marco minimax de la sección 1.4, la magnitud relevante para ordenar la prioridad de baneo en cada turno es $\Delta$, no $p_A$ ni $p_B$ de forma aislada. Un mapa con $p_A = 70\%$ pero $p_B = 75\%$ representa una desventaja neta para A ($\Delta = -5\%$) a pesar de que el 70% parezca, en aislamiento, una cifra alta. Inversamente, un mapa con $p_A = 40\%$ y $p_B = 30\%$ representa una ventaja neta para A ($\Delta = +10\%$) a pesar de que el 40% parezca, en aislamiento, una cifra mediocre. La literatura de análisis deportivo respalda consistentemente que las métricas de rendimiento relativo (ventaja frente a un oponente o conjunto de oponentes) son más informativas para la predicción de resultados que las métricas de rendimiento absoluto descontextualizado [6], [7].

### 2.3 Limitación reconocida de la aproximación por diferencial

Es necesario señalar una limitación metodológica real: el diferencial simple $\Delta = p_A - p_B$ asume implícitamente que las muestras de $p_A$ y $p_B$ provienen de poblaciones de oponentes comparables en fuerza. Si el equipo A obtuvo su 70% de winrate en un mapa jugando predominantemente contra rivales débiles, mientras que el equipo B obtuvo su 75% jugando contra rivales fuertes, el diferencial crudo subestima la ventaja real de B.

### 2.4 Vigencia y meritocracia: ¿existe un método mejor que el diferencial simple?

Sí, y se documenta aquí explícitamente por transparencia metodológica, aunque el modelo operativo de este documento no lo adopte por razones de factibilidad de datos explicadas más abajo.

Ragain, Peysakhovich y Ugander (2018) [7] extienden directamente el marco de shrinkage de Efron-Morris (Sección 3.3) a modelos de comparación pareada tipo Bradley-Terry, incorporando la estructura de *contra quién* se generó cada winrate — es decir, corrigiendo exactamente la limitación señalada en la Sección 2.3. En su aplicación a bateadores y lanzadores de la temporada 2016 de las Grandes Ligas de Béisbol (un caso estructuralmente análogo al problema de winrate por mapa: cada jugador/equipo tiene un historial de enfrentamientos contra oponentes de fuerza desigual), demuestran mediante validación cruzada de 20 particiones que su método de "Rasch shrinkage" —que corrige por la fuerza del oponente enfrentado, no solo por el tamaño de muestra— mejora la predicción de rendimiento fuera de muestra entre **13.8% y 17.2% en error cuadrático medio**, respecto al shrinkage de James-Stein simple sin ajuste por oponente [7]. Resultados equivalentes en NFL y NBA muestran mejoras de 5% a 17% según la conectividad del calendario de enfrentamientos [7].

**Por qué este documento no adopta este método superior como modelo operativo por defecto**: la mejora demostrada por Ragain et al. depende de tener acceso a una matriz de enfrentamientos suficientemente conectada — es decir, saber no solo el winrate agregado de cada equipo en un mapa, sino contra qué rivales específicos se generó cada resultado, de forma análoga a cómo un modelo de bateador/lanzador necesita saber qué lanzador enfrentó cada bateador en cada turno. **Los datos expuestos por TAPIT.GG (Sección 0.2) no incluyen esta granularidad** — se limitan al winrate agregado y conteo de partidas por mapa, sin desglose por rival enfrentado. Adoptar el método de Ragain et al. sin esa información estructural no es posible sin recolectar datos adicionales fuera del alcance de la extensión actualmente en uso.

Esto ilustra el criterio de meritocracia declarado en el resumen: el método de 2018 es objetivamente superior *cuando los datos lo permiten*, y se documenta como la dirección de mejora recomendada si en el futuro se dispone de datos de enfrentamientos desglosados por rival. Mientras esa granularidad no esté disponible, el diferencial simple de la Sección 2.2 —con las correcciones de incertidumbre muestral de la Sección 3— sigue siendo el método operativamente viable, no por preferencia hacia lo clásico, sino por restricción real de los datos observables.

---

*(Continúa en la Sección 3: El ruido estadístico del winrate)*

---

## 3. El ruido estadístico del winrate: estimación de proporciones con muestras finitas

### 3.1 El winrate como estimador puntual de una proporción binomial

Un winrate observado —por ejemplo, "10 victorias de 17 partidas jugadas en el mapa Inferno"— es un **estimador puntual** de una proporción binomial verdadera y desconocida $p$. La teoría estadística clásica establece que este estimador, aunque insesgado (su valor esperado converge al verdadero $p$ conforme $n \to \infty$), tiene una **varianza** que depende inversamente del tamaño de muestra $n$:

$$\text{Var}(\hat{p}) = \frac{p(1-p)}{n}$$

Esto implica que dos winrates numéricamente idénticos pueden representar niveles de certeza radicalmente distintos según el tamaño de muestra que los respalda. Un winrate de 83% obtenido en 6 partidas y un winrate de 60% obtenido en 42 partidas no son comparables sin considerar sus respectivas varianzas — el primero está sujeto a fluctuación muestral mucho mayor que el segundo.

**Aclaración necesaria sobre qué es exactamente $n$ (Grupo 2 de la Guía de seguimiento y resolución de errores del proyecto VetoLAB, que implementa este marco):** en todo este documento y en su implementación, $n$ significa **partidas (mapas) jugadas**, nunca rounds ni minutos ni duración de la partida. Este punto merece aclararse explícitamente porque es fácil de confundir en el dominio de CS2: una partida que se extiende a overtime (por ejemplo, 300 rounds acumulados tras varias prórrogas) no representa más evidencia estadística que una partida decidida en 16 rounds — ambas son, para efectos de este modelo, **una sola observación binomial**: el equipo ganó o perdió ese mapa, una vez. Tratar los rounds individuales de una misma partida como observaciones independientes adicionales sería estadísticamente incorrecto, porque violaría el supuesto de independencia que sostiene tanto la varianza de proporción binomial (esta sección) como el intervalo de Wilson (Sección 3.2): los rounds dentro de una misma partida están correlacionados entre sí por el propio desarrollo del juego (economía acumulada, momentum, qué lado se jugó primero, etc.) de un modo que un modelo de proporción simple sobre partidas no captura ni pretende capturar. Es precisamente por esta razón que la Sección 0.3 excluye deliberadamente el "total de rounds jugados" (dato que sí expone TAPIT.GG, ver Sección 0.2) como variable de entrada del modelo: es una métrica de volumen a nivel de ronda, no a nivel de la unidad muestral que este marco requiere.

Esta distinción no es solo conceptual — tiene una consecuencia práctica de calibración. Bajo el intervalo de Wilson con el umbral de ancho actualmente implementado (`WIDE_INTERVAL_THRESHOLD = 0.35`, Sección 3.2 más abajo), el rango de $n$ a partir del cual una muestra deja de considerarse "insuficiente" no es un número único: depende de qué tan cerca esté $\hat p$ de 50% (donde la varianza $p(1-p)/n$ es máxima). Verificado numéricamente contra la implementación: cerca de $\hat p \approx 50\%$, el ancho del IC95 cruza el umbral de 0.35 aproximadamente entre $n=27$ y $n=28$ partidas; en winrates más extremos (por ejemplo 20% u 80%), el mismo umbral se cruza con algo menos de evidencia, aproximadamente entre $n=19$ y $n=20$. Ambos valores caen dentro del régimen $n \leq 40$ que la Sección 3.2.1 cita de Brown, Cai y DasGupta (2001) [8] como el rango donde Wilson es la elección recomendada frente a alternativas más simples — consistente con, aunque más preciso que, una estimación gruesa de "treinta a cuarenta partidas". Estas cifras son una guía de intuición para calibrar futuros ajustes de `DEFAULT_SHRINKAGE_K` o del propio `WIDE_INTERVAL_THRESHOLD`, no un valor que deba codificarse como umbral fijo de $n$: la implementación evalúa el ancho real del intervalo de Wilson caso por caso, combinando $n$ y $\hat p$ correctamente, en vez de comparar contra una tabla aproximada como esta.

### 3.2 Intervalos de confianza para proporciones: el problema del intervalo de Wald y la solución de Wilson

La forma más elemental de cuantificar la incertidumbre de un winrate observado es mediante un intervalo de confianza. El método más enseñado a nivel introductorio es el **intervalo de Wald**, basado en la aproximación normal a la distribución binomial:

$$\hat{p} \pm z_{\alpha/2} \sqrt{\frac{\hat{p}(1-\hat{p})}{n}}$$

Sin embargo, este intervalo tiene problemas de cobertura bien documentados, particularmente severos con muestras pequeñas o proporciones cercanas a los extremos (0% o 100%): puede producir límites fuera del rango válido $[0,1]$, y su probabilidad de cobertura real se aleja sustancialmente del nivel nominal declarado (por ejemplo, un intervalo "del 95%" puede en realidad capturar el valor verdadero con una frecuencia bastante menor al 95%) [9].

La solución estándar y ampliamente recomendada en la literatura estadística moderna es el **intervalo de puntuación de Wilson** (*Wilson score interval*), introducido por Edwin B. Wilson en 1927 en su artículo "Probable Inference, the Law of Succession, and Statistical Inference", publicado en el *Journal of the American Statistical Association* [10]. El intervalo de Wilson se deriva invirtiendo el test de score para la proporción binomial, en lugar de basarse únicamente en la aproximación normal centrada en el estimador puntual observado:

$$\tilde{p} = \frac{\hat{p} + \dfrac{z_{\alpha/2}^2}{2n} \pm z_{\alpha/2}\sqrt{\dfrac{\hat{p}(1-\hat{p})}{n} + \dfrac{z_{\alpha/2}^2}{4n^2}}}{1 + \dfrac{z_{\alpha/2}^2}{n}}$$

Este intervalo permanece siempre dentro del rango válido $[0,1]$, tiene una probabilidad de cobertura consistentemente más cercana al nivel nominal declarado que el intervalo de Wald, y se comporta de forma fiable incluso con muestras pequeñas o proporciones extremas [11], [12]. Por estas razones, el intervalo de Wilson es hoy el método recomendado por defecto en la literatura estadística aplicada para la construcción de intervalos de confianza sobre proporciones, incluyendo aplicaciones en ensayos clínicos, sistemas de calificación de productos, y análisis deportivo [9], [10].

**Corrección metodológica respecto a versiones previas de este análisis**: en iteraciones anteriores de este marco de trabajo se empleó el intervalo de Wald simple por su sencillez de implementación. Dado que el objetivo declarado de este documento es fundamentar las decisiones en ciencia verificada, se señala explícitamente que **el intervalo de Wald debe descartarse** para este caso de uso — no por ser antiguo, sino porque métodos posteriores lo superan de forma demostrada en el régimen de muestra relevante, sin excepción documentada en la literatura consultada.

### 3.2.1 Vigencia y meritocracia: Wilson frente a alternativas más recientes

La pregunta de qué método usar en lugar de Wald no tiene una respuesta única — depende del tamaño de muestra, y aquí es donde el criterio de meritocracia declarado en el resumen debe aplicarse con precisión, no de forma general.

Agresti y Coull (1998) [12] propusieron una alternativa más simple que el Wilson, consistente en aplicar la fórmula de Wald tras sumar artificialmente dos éxitos y dos fracasos a los datos observados (el llamado "método plus-four"). El trabajo más exhaustivo que compara ambos métodos, Brown, Cai y DasGupta (2001) [8], evalúa la probabilidad de cobertura real de Wilson, Agresti-Coull, Jeffreys y Clopper-Pearson a través de un rango amplio de tamaños de muestra y proporciones, y concluye lo siguiente: **para tamaños de muestra pequeños ($n \leq 40$), Wilson o Jeffreys son preferibles**; **para tamaños de muestra mayores ($n > 40$), Agresti-Coull, Wilson o Jeffreys resultan equivalentes en desempeño**, con una ligera preferencia práctica por Agresti-Coull debido a su mayor simplicidad de cálculo, no a mejor cobertura [8]. Una comparación exhaustiva más reciente, que extiende sistemáticamente este análisis a todos los tamaños de muestra entre 1 y 1000 y los tres niveles de confianza más usuales, confirma este mismo patrón de recomendación por régimen de tamaño muestral [13].

**Aplicación meritocrática al caso del winrate de mapas**: los tamaños de muestra típicos reportados por TAPIT.GG oscilan frecuentemente entre 2 y 90 partidas por mapa (Sección 0.2), cayendo mayoritariamente en o por debajo del umbral $n=40$ donde la literatura recomienda Wilson (o Jeffreys) de forma consistente, incluida la comparación más reciente disponible [13]. Por tanto, el método de 1927 **no se mantiene por antigüedad, sino porque ningún método posterior lo supera de forma demostrada en este régimen específico de tamaño de muestra** — es la elección meritocráticamente correcta, no la elección conservadora. Para los casos, menos frecuentes en este dominio, donde $n$ supere aproximadamente 40-50 partidas (equipos con historial extenso en un mapa muy jugado), el método de Agresti-Coull ofrece desempeño equivalente con menor complejidad de cómputo, y podría preferirse por razones de simplicidad de implementación sin pérdida de precisión.

### 3.3 De la incertidumbre a la corrección: estimación de contracción (shrinkage) hacia la media

Un intervalo de confianza cuantifica la incertidumbre alrededor de un winrate observado, pero no *corrige* el valor puntual mismo para fines de comparación entre mapas. Para ese propósito, la herramienta estadística relevante es la **estimación de contracción** (*shrinkage estimation*), cuyo fundamento teórico se origina en un resultado que sorprendió profundamente a la comunidad estadística cuando se publicó: el trabajo de Charles Stein (1956) demostró que, para estimar simultáneamente tres o más medias de distribuciones normales independientes, el estimador de máxima verosimilitud (esencialmente, "usar cada media muestral tal cual") es **inadmisible** — existe un estimador que domina uniformemente su error cuadrático medio total, contrayendo cada estimación individual hacia la media general del conjunto [14]. James y Stein (1961) proporcionaron una forma explícita de este estimador superior, hoy conocido como el **estimador James-Stein** [15].

Este resultado, conocido como la **paradoja de Stein**, es contraintuitivo porque implica que, incluso si las medias que se están estimando no tienen relación causal entre sí (por ejemplo, el rendimiento de bateo de distintos jugadores de béisbol, o el winrate de distintos mapas no relacionados), "prestar información" entre ellas mediante contracción hacia una media común produce, en promedio, estimaciones más precisas que tratar cada una de forma completamente independiente.

**La aplicación más citada y pedagógicamente influyente** de este principio es el trabajo de Bradley Efron y Carl Morris, "Data Analysis Using Stein's Estimator and its Generalizations" (1975), publicado en el *Journal of the American Statistical Association* [16]. En este artículo, los autores utilizan los promedios de bateo de 18 jugadores de las grandes ligas de béisbol tras sus primeros 45 turnos al bate de la temporada 1970, y demuestran empíricamente que el estimador de James-Stein —que contrae cada promedio individual hacia el promedio general del grupo— predice con mayor precisión el rendimiento de cada jugador durante el **resto** de la temporada que el simple promedio observado en esos primeros 45 turnos al bate [16], [17]. Este resultado se ha convertido en el ejemplo canónico de la utilidad práctica del shrinkage estimation en análisis deportivo, y ha generado una línea extensa de trabajo posterior aplicando principios equivalentes a otras métricas de rendimiento deportivo [18].

La forma general de un estimador de contracción bayesiano empírico hacia una media de referencia $\mu_0$, ponderado por el tamaño de muestra, puede expresarse como:

$$\hat{p}_{\text{ajustado}} = \frac{n \cdot \hat{p} + k \cdot \mu_0}{n + k}$$

donde $k$ representa el "peso" del prior, expresado en unidades equivalentes a observaciones — es decir, cuántas observaciones adicionales (hipotéticas, centradas en $\mu_0$) se necesitarían para influir en la estimación con la misma fuerza relativa que $k$. Esta forma es una simplificación operativa del marco bayesiano empírico general descrito por Efron y Morris [16], y es matemáticamente equivalente a la media posterior de un modelo bayesiano con verosimilitud binomial y un prior Beta apropiadamente parametrizado [19].

**Aplicación al winrate de mapas** (extrapolación operativa, no resultado citado directamente): dado que no existe razón *a priori* para asumir que el verdadero winrate de un equipo en cualquier mapa dado se aleje sustancialmente de 50% sin evidencia sustancial que lo respalde (un mapa nuevo o poco jugado no tiene por qué ser intrínsecamente favorable o desfavorable), es razonable emplear $\mu_0 = 50\%$ como media de referencia para la contracción, con un valor de $k$ calibrado empíricamente según cuántas partidas se consideran necesarias para que el dato observado comience a dominar sobre el prior. Esta aplicación seguiría el mismo principio metodológico que Efron y Morris [16], adaptado a un contexto de proporciones binomiales en lugar de promedios continuos — un caso más cercano en su estructura matemática al trabajo posterior sobre shrinkage aplicado específicamente a proporciones y tasas [18], [19].

### 3.3.1 Vigencia y meritocracia: shrinkage simple frente a shrinkage con estructura de oponente

Como se documentó en la Sección 2.4, existe un método demostrablemente superior al shrinkage simple hacia una media fija: el trabajo de Ragain, Peysakhovich y Ugander (2018) [7], que en esencia es una generalización del shrinkage de Efron-Morris que incorpora la matriz de covarianza entre parámetros derivada de la estructura de enfrentamientos, en lugar de contraer cada estimación de forma independiente hacia un único punto de referencia. La mejora reportada (5% a 17% en error cuadrático medio fuera de muestra, según el deporte y la conectividad del calendario de enfrentamientos) [7] es sustancial y está validada empíricamente mediante validación cruzada, no solo teóricamente.

Bajo el criterio de meritocracia declarado en este documento, este método debería ser el estándar de referencia si los datos disponibles lo permitieran. Su no adopción como modelo operativo en este documento no es una preferencia por el método clásico, sino una restricción de los datos observables: como se explicó en la Sección 2.4, TAPIT.GG no expone la estructura de enfrentamientos necesaria (qué rival específico se enfrentó en cada partida que compone el winrate agregado). El shrinkage simple hacia $\mu_0 = 50\%$, descrito arriba, es por tanto la mejor aproximación *factible* dado el conjunto de datos disponible, no la mejor aproximación *posible* en términos absolutos.

### 3.4 Consecuencia práctica: por qué muestras pequeñas no deben pesar igual que muestras grandes

La combinación de las secciones 3.2 y 3.3 establece un principio doble, ambos lados respaldados independientemente en la literatura estadística: (a) la incertidumbre alrededor de un winrate observado es cuantificable formalmente y crece conforme el tamaño de muestra disminuye [9], [10]; y (b) la corrección apropiada ante esa incertidumbre no es ignorar el dato, sino contraerlo proporcionalmente hacia una referencia razonable, en lugar de tratarlo con el mismo peso que un dato respaldado por una muestra mucho mayor [14], [15], [16]. Tratar un winrate de muestra pequeña como equivalente en fiabilidad a uno de muestra grande constituye, bajo este marco, un error estadístico caracterizado y corregible, no una cuestión de opinión metodológica.

---

*(Continúa en la Sección 4: El tratamiento de diferenciales pequeños)*

---

## 4. El tratamiento de diferenciales pequeños: cuándo un empate es un empate real

### 4.1 El error de sobreinterpretar diferencias que no son estadísticamente distinguibles

Cuando el diferencial de winrate entre dos equipos en un mapa dado es pequeño en magnitud (por ejemplo, 2 o 3 puntos porcentuales), existe una tentación natural de tratar ese diferencial como información decisional válida — "el equipo con el número más alto tiene la ventaja, aunque sea poca". Esta interpretación ignora que, bajo la incertidumbre muestral descrita en la Sección 3, un diferencial pequeño puede estar completamente contenido dentro del margen de error combinado de ambas estimaciones, y por tanto **no ser distinguible de cero** con la evidencia disponible.

Este problema ha sido documentado extensamente en la literatura estadística general bajo el concepto de **tamaño del efecto** (*effect size*) frente a significancia estadística. Un hallazgo influyente en este sentido es el de Gelman y Stern (2006), publicado en *The American Statistician* bajo el título deliberadamente provocador "The Difference Between 'Significant' and 'Not Significant' is not Itself Statistically Significant" [20]. Los autores demuestran formalmente que, incluso cuando un resultado individual es "estadísticamente significativo" y otro no lo es, la diferencia *entre ambos resultados* puede no serlo — un error de razonamiento común que consiste en comparar cualitativamente dos estimaciones sin comparar formalmente su diferencia.

### 4.2 Solapamiento de intervalos de confianza como heurística de decisión

Una forma práctica y visualmente intuitiva de aplicar este principio es examinar si los intervalos de confianza de dos estimaciones se solapan. Krzywinski y Altman (2013), en un artículo de la serie de metodología estadística de *Nature Methods*, advierten explícitamente sobre la interpretación errónea —pero extremadamente común, incluso entre investigadores experimentados— de que la ausencia de solapamiento entre dos barras de error es necesaria para inferir una diferencia significativa, y que el solapamiento implica automáticamente ausencia de diferencia [21]. Los autores señalan que la relación entre solapamiento de intervalos de confianza al 95% y significancia estadística formal no es una equivalencia directa: dos intervalos pueden solaparse ligeramente y aun así la diferencia entre las dos medias ser estadísticamente significativa bajo un test formal, especialmente cuando ambos intervalos individuales tienen buena precisión.

No obstante, el caso inverso —intervalos que se solapan **sustancialmente**— sí constituye evidencia consistente de que no hay base suficiente para afirmar una diferencia real entre las dos cantidades comparadas. Esta es la situación operativamente relevante para el caso del veto de mapas: cuando los intervalos de confianza (o, de forma más directa, los márgenes de error descritos en la Sección 3.2) de los winrates de dos equipos en un mismo mapa se solapan de forma sustancial, la evidencia disponible es insuficiente para afirmar que uno de los dos equipos tiene una ventaja real en ese mapa, independientemente de cuál de los dos números observados sea nominalmente más alto.

### 4.3 El problema adicional de la asimetría de muestra en diferenciales pequeños

Un refinamiento necesario sobre el punto anterior, no cubierto por la literatura general de significancia estadística citada arriba pero derivable directamente de los principios de las Secciones 2 y 3, es que **un diferencial pequeño no es homogéneo en su interpretación** — depende de cómo se distribuye el tamaño de muestra entre los dos equipos comparados. Bajo la relación de varianza descrita en 3.1 ($\text{Var}(\hat p) = p(1-p)/n$), dos winrates numéricamente cercanos pero respaldados por tamaños de muestra muy distintos tienen niveles de certeza asimétricos, lo cual tiene consecuencias prácticas distintas según el caso:

**(a) Diferencial pequeño, con muestra propia sustancialmente mayor que la del rival.** El estimador propio tiene menor varianza (mayor precisión) que el del rival. Bajo el principio de contracción hacia la media (Sección 3.3), el winrate del rival —respaldado por poca evidencia— está más sujeto a regresar hacia 50% conforme se acumule más muestra, mientras que el propio, ya respaldado por evidencia sustancial, es más estable. La implicación operativa es que la ventaja real probablemente esté subestimada por el diferencial crudo, no sobreestimada.

**(b) Diferencial pequeño, con muestra del rival sustancialmente mayor que la propia.** El caso simétricamente inverso: el estimador propio es el de mayor incertidumbre y más sujeto a regresión hacia la media con más datos, mientras que el del rival es más estable. Aquí la cautela debe ir en la dirección contraria — el diferencial observado a favor propio es menos confiable que lo que aparenta.

**(c) Diferencial pequeño, con tamaños de muestra comparables entre ambos lados.** Este es el caso que más se aproxima a un verdadero "empate estadístico": ambas estimaciones tienen niveles de precisión similares, ambos intervalos de confianza se solapan sustancialmente, y no hay razón derivada de la asimetría de muestra para favorecer la interpretación de ventaja de ningún lado.

### 4.4 Implicación para la asignación de prioridad de decisión bajo recursos limitados

El principio general que conecta las Secciones 1 (estructura del juego secuencial) y 4 (tratamiento de diferenciales pequeños) es el siguiente: en un proceso de decisión secuencial con recursos limitados —en este caso, un número fijo de turnos de baneo disponibles por equipo— **el valor de cada acción disponible debe evaluarse en términos de costo de oportunidad**, no de forma aislada. Emplear un turno de baneo (un recurso escaso y no renovable dentro de la partida) para eliminar un mapa cuyo diferencial no es estadísticamente distinguible de cero tiene un costo de oportunidad: ese mismo turno podría haberse empleado para eliminar un mapa cuyo diferencial sí es sustancial y confiable. Bajo el marco de inducción hacia atrás descrito en la Sección 1.3, la asignación óptima de recursos limitados prioriza sistemáticamente las acciones de mayor impacto esperado, dejando que las opciones de impacto marginal cercano a cero se resuelvan por defecto (en este caso, mediante el proceso normal de eliminación del resto del veto) en lugar de consumir recursos de decisión en resolverlas activamente.

---

## 5. Síntesis y limitaciones declaradas

### 5.1 Síntesis de los cuatro principios

1. **Estructura del juego** (Sección 1): el veto de mapas es un juego secuencial, de suma cero, de información perfecta, resoluble en principio por inducción hacia atrás bajo el teorema de Zermelo [3] y el marco minimax de von Neumann [4]. La estrategia óptima en cada turno prioriza eliminar la mayor amenaza del rival, no proteger la propia mejor opción de forma directa.

2. **El diferencial, no el winrate absoluto** (Sección 2): la magnitud relevante para la decisión es la diferencia de rendimiento relativo entre los dos equipos específicos en un mapa dado, consistente con el marco de comparación pareada de Bradley-Terry [6], no la tasa de victoria absoluta de un equipo contra el campo general.

3. **El ruido estadístico exige corrección, no ignorarlo** (Sección 3): los winrates observados con muestras pequeñas tienen mayor varianza y deben tratarse con intervalos de confianza apropiados (Wilson [10], preferible al método de Wald por sus propiedades de cobertura [9], y con Agresti-Coull [12] como alternativa equivalente para muestras mayores) y, para fines comparativos, contraerse hacia una referencia razonable mediante principios de estimación de contracción (Stein [14]; James-Stein [15]; Efron-Morris [16]), idealmente incorporando estructura de oponente cuando los datos lo permiten [7].

4. **Diferenciales pequeños exigen escrutinio adicional, no descarte automático** (Sección 4): cuando la diferencia observada es pequeña, la pregunta relevante no es cuál número es nominalmente mayor, sino si esa diferencia es distinguible del ruido estadístico dado el tamaño de muestra de cada lado [20], [21], y qué dirección de sesgo introduce la asimetría de muestra entre ambos equipos cuando la hay.

### 5.2 Limitaciones declaradas de este marco

Es responsabilidad de este documento ser explícito sobre lo que **no** está establecido por la literatura citada, para evitar sobrerrepresentar el rigor del marco aplicado:

- **No existe validación empírica publicada** de que este marco combinado (diferencial ajustado por shrinkage, aplicado específicamente al veto de mapas de Counter-Strike 2 o juegos similares) mejore efectivamente la tasa de victoria de un equipo que lo adopte. Los principios subyacentes están extensamente verificados en sus dominios originales (estadística de proporciones, análisis deportivo tradicional), pero su aplicación a este dominio específico es una extrapolación razonada, no un resultado medido.
- El **modelo de diferencial simple** (Sección 2.2) es una aproximación de primer orden que ignora la calidad relativa de los oponentes contra los que se generó cada winrate, un refinamiento que un modelo de tipo Bradley-Terry completo o un ajuste de fuerza de calendario (*strength of schedule*) corregiría, pero que requiere datos considerablemente más ricos que un simple registro de victorias/derrotas por mapa.
- Los **valores de calibración específicos** empleados en la práctica (por ejemplo, el peso $k$ del prior en la contracción, o el umbral de puntos porcentuales considerado "diferencial pequeño") no derivan de un ajuste estadístico formal sobre datos de Counter-Strike 2, sino de valores razonables por analogía con aplicaciones similares en otros deportes. Una calibración rigurosa requeriría un conjunto de datos histórico suficientemente amplio de resultados de mapas para ajustar estos parámetros empíricamente, por ejemplo mediante validación cruzada.
- El marco asume que el rendimiento por mapa es razonablemente estable en el tiempo dentro de la ventana de datos considerada. Cambios de alineación de jugadores, parches del juego que alteren el balance de mapas, o evolución del meta competitivo pueden invalidar parcialmente datos históricos, un problema de **no estacionariedad** que no es abordado por ninguno de los métodos estadísticos citados en este documento y que constituye una limitación práctica importante.

---

## Referencias

[1] Berlekamp, E. R., Conway, J. H., & Guy, R. K. (1982). *Winning Ways for Your Mathematical Plays*. Academic Press.

[2] Huggan, M., Nowakowski, R., & Ottaway, P. (2018). Simultaneous Combinatorial Game Theory. Dalhousie University working paper.

[3] Zermelo, E. (1913). Über eine Anwendung der Mengenlehre auf die Theorie des Schachspiels. *Proceedings of the Fifth International Congress of Mathematicians*, Cambridge University Press.

[4] von Neumann, J., & Morgenstern, O. (1944). *Theory of Games and Economic Behavior*. Princeton University Press.

[5] Selten, R. (1965). Spieltheoretische Behandlung eines Oligopolmodells mit Nachfrageträgheit. *Zeitschrift für die gesamte Staatswissenschaft*, 121, 301–324, 667–689.

[6] Bradley, R. A., & Terry, M. E. (1952). Rank Analysis of Incomplete Block Designs: I. The Method of Paired Comparisons. *Biometrika*, 39(3/4), 324–345.

[7] Ragain, S., Peysakhovich, A., & Ugander, J. (2018). Improving Pairwise Comparison Models Using Empirical Bayes Shrinkage. *arXiv preprint* arXiv:1807.09236.

[8] Brown, L. D., Cai, T. T., & DasGupta, A. (2001). Interval Estimation for a Binomial Proportion. *Statistical Science*, 16(2), 101–133.

[9] Wilson, E. B. (1927). Probable Inference, the Law of Succession, and Statistical Inference. *Journal of the American Statistical Association*, 22(158), 209–212.

[10] Newcombe, R. G. (1998). Two-sided confidence intervals for the single proportion: comparison of seven methods. *Statistics in Medicine*, 17(8), 857–872.

[11] Agresti, A., & Coull, B. A. (1998). Approximate is Better than "Exact" for Interval Estimation of Binomial Proportions. *The American Statistician*, 52(2), 119–126.

[12] Autor no especificado (2024/2025). A Comprehensive Comparison of the Wald, Wilson, and adjusted Wilson Confidence Intervals for Proportions. *arXiv preprint* arXiv:2508.10223. (Extiende Agresti & Coull 1998 a todos los tamaños de muestra de n=1 a n=1000 y a los tres niveles de confianza usuales, confirmando el patrón de recomendación por régimen de tamaño muestral de Brown, Cai & DasGupta 2001 [8].)

[13] Stein, C. (1956). Inadmissibility of the Usual Estimator for the Mean of a Multivariate Normal Distribution. *Proceedings of the Third Berkeley Symposium on Mathematical Statistics and Probability*, 1, 197–206.

[14] James, W., & Stein, C. (1961). Estimation with Quadratic Loss. *Proceedings of the Fourth Berkeley Symposium on Mathematical Statistics and Probability*, 1, 361–379.

[15] Efron, B., & Morris, C. (1975). Data Analysis Using Stein's Estimator and its Generalizations. *Journal of the American Statistical Association*, 70(350), 311–319.

[16] Efron, B., & Morris, C. (1977). Stein's Paradox in Statistics. *Scientific American*, 236(5), 119–127.

[17] Brown, L. D. (2008). In-season prediction of batting averages: A field test of empirical Bayes and Bayes methodologies. *The Annals of Applied Statistics*, 2(1), 113–152.

[18] Gelman, A., Carlin, J. B., Stern, H. S., Dunson, D. B., Vehtari, A., & Rubin, D. B. (2013). *Bayesian Data Analysis* (3rd ed.). Chapman and Hall/CRC.

[19] Gelman, A., & Stern, H. (2006). The Difference Between "Significant" and "Not Significant" is not Itself Statistically Significant. *The American Statistician*, 60(4), 328–331.

[20] Krzywinski, M., & Altman, N. (2013). Error bars: The meaning of error bars is often misinterpreted, as is the statistical significance of their overlap. *Nature Methods*, 10, 921–923.

[21] Tango, T. M., Lichtman, M. G., & Dolphin, A. E. (2007). *The Book: Playing the Percentages in Baseball*. Potomac Books.

---

*Documento preparado con fines de fundamentación técnica de un sistema de apoyo a la decisión para veto de mapas en Counter-Strike 2, con datos complementarios de la extensión de terceros TAPIT.GG. Las secciones marcadas explícitamente como "aplicación" o "extrapolación" representan razonamiento derivado por el autor a partir de los resultados citados, y no constituyen hallazgos verificados de forma independiente en el dominio específico de veto de mapas en videojuegos competitivos. El criterio de selección de método entre alternativas citadas es el desempeño demostrado en el régimen de tamaño de muestra relevante para este caso de uso, no la fecha de publicación.*



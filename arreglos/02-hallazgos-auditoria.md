# Hallazgos de auditoría técnica

**Fecha:** 25/08/2026
**Método:** auditoría sobre datos reales de producción (4.395 preguntas de 60
análisis, más muestras específicas). Los agregados se calcularon **dentro del
contenedor**; no se descargaron datos de cliente.

Ninguno de estos hallazgos rompe el sistema. Todos afectan a la **calidad de lo
que se le entrega al cliente**.

---

## A. El campo `evidence` casi nunca se rellena · ✅ ARREGLADO (25/08/2026)

### Qué es

La evidencia es *la frase concreta de la respuesta de la IA que demuestra que la
marca fue mencionada*. Permite que el informe no sea solo un número: enseña **por
qué** algo cuenta como mención.

Se consume en el desglose de GAPs (`verifiedEvidence()` en `sharedMetrics.ts:535`)
y como respaldo del motivo en el dashboard de sentimiento.

### Qué falla

En `api/services/openaiService.ts`, el flujo de persona —el camino principal—
guarda el campo vacío, cableado, en sus dos ramas:

```js
brandMentions.push({
  brand: ...,
  evidence: [],        // ← nunca se rellena
```

### Qué salva la situación

`verifiedEvidence()` tiene un **respaldo**: si el campo está vacío, extrae del
texto de la respuesta las frases que nombran la marca. Medido sobre 1.825
preguntas:

| | Menciones de la marca objetivo |
|---|---|
| Con `evidence` relleno (camino bueno) | 34 |
| Con `evidence` vacío | 706 |
| → el respaldo recupera una frase | **484** |
| → el respaldo no encuentra nada | **222** |

**El 70% muestra algo.** No está roto.

### El problema real, que es más pequeño

1. **Un 30% de las menciones no muestra ninguna evidencia.** El informe afirma
   que la marca aparece sin poder enseñar dónde. Parte del motivo: 103 preguntas
   no tienen guardado el texto de la respuesta, así que no hay de dónde sacarla.
2. **El respaldo no es una evidencia verificada.** Es coincidencia de texto: coge
   frases que contienen el nombre. El camino bueno —cotejar la evidencia que
   extrajo el modelo contra la respuesta original— solo actúa en 34 de 740 casos.
   Se nota en la calidad: un ejemplo real recuperado por el respaldo es
   `"- Saunier Duval IsoMax MiConnect (IsoDyn 3)..."`, un ítem de lista suelto.

Llamar "evidencias verificadas" a lo que en el 65% de los casos es una búsqueda
de texto es generoso.

### Arreglo aplicado

Commit `fix(evidence)`, 25/08/2026.

1. **El prompt de la fase 2 pide la frase literal** por marca, con reglas
   explícitas: copiar exactamente, no reescribir ni traducir, mínimo 15
   caracteres, y devolver `[]` antes que inventarla.
2. **`verifyEvidence()` coteja cada frase contra la respuesta antes de
   guardarla.** Es la parte importante: la fase 2 es un LLM y puede parafrasear
   o inventar la cita. Una evidencia fabricada es **peor que ninguna**, porque el
   informe se la enseña al cliente como prueba textual de que la IA nombró su
   marca. Se compara un prefijo de 60 caracteres sobre texto normalizado (sin
   markdown ni URLs), porque el modelo recorta las frases por sitios distintos.

Validado con `npm run test:evidencias`, que ejercita el código real sin llamar a
ninguna API: **15 casos, 15 correctos**. Acepta citas literales (incluso cuando el
original lleva markdown), **rechaza paráfrasis, invenciones y fragmentos
demasiado cortos**, deduplica, corta en 3 por marca, y cubre el escenario en que
el modelo parafrasea TODO: ahí entra la red y la evidencia sale igualmente.

**Efecto colateral útil:** el detalle del dashboard de sentimiento usa
`bm.evidence?.[0]` como respaldo del motivo (ficha 01, punto 2.a), así que esa
columna deja de estar vacía por el mismo cambio.

3. **Red de seguridad determinista.** Si la cita del modelo no verifica, se
   extrae del propio texto la frase que nombra la marca
   (`extractSentencesWithBrand`). Es literal por construcción: no depende de que
   el modelo copie bien.

   Esto responde a una objeción con fundamento: un LLM tiende a parafrasear
   aunque se le pida lo contrario, así que un verificador estricto sin red se
   quedaría rechazando todo y seguiríamos con evidencias vacías. El orden es
   `cita del modelo verificada` → `extracción determinista` → `vacío`, de modo
   que nunca se guarda una invención y rara vez no se guarda nada.

### Qué queda por medir en producción

Ya no es "si habrá evidencias" —la red lo garantiza siempre que la marca aparezca
en el texto— sino **cuántas vienen del modelo y cuántas del respaldo**. La del
modelo suele ser la frase más informativa; la extraída es la primera que nombra
la marca, que a veces es un ítem de lista.

Métrica tras el despliegue: menciones con `evidence` no vacío sobre el total.
Hoy es el 4,6% (34 de 740); debería acercarse al porcentaje de menciones cuya
marca aparece literalmente en el texto.

### Análisis antiguos

No se reprocesan. Los ya guardados siguen dependiendo del respaldo de
`verifiedEvidence()` en el frontend, que cubre el 70%. El cambio solo afecta a
los análisis nuevos.

---

## B. El sentimiento no discrimina · SEVERIDAD MEDIA

Distribución sobre **17.470 menciones** de producción:

| Sentimiento | Menciones | % |
|---|---|---|
| Positivo | 14.287 | **81,8%** |
| Neutral | 3.077 | 17,6% |
| Negativo | 98 | **0,6%** |
| Mixto | 8 | 0,0% |

Apenas 98 menciones negativas en 17.470. Puede ser legítimo —las respuestas a
"¿cuál es el mejor X?" son positivas por naturaleza— pero con esta distribución
**la métrica no separa nada**: si todo es positivo, saber que algo es positivo
no informa.

**Antes de invertir en esta métrica, decidir qué se quiere medir.** Un sentimiento
que casi nunca es negativo puede ser un clasificador sesgado, o puede ser un
reflejo fiel de un contexto donde nadie habla mal de nadie. Son dos problemas
distintos y solo uno se arregla con código.

Comprobación sugerida: coger 30 menciones clasificadas como positivas y revisarlas
a mano. Si el criterio humano coincide, la métrica es correcta pero poco útil y
habría que sustituirla por otra cosa (p. ej. posición relativa frente a
competidores). Si no coincide, es el clasificador.

---

## C. La lista de competidores es inestable entre ejecuciones · SEVERIDAD MEDIA

Descubierto al validar el cambio de `reasoning.effort` (A/B de 48 análisis con
control de ruido). El control consistió en repetir **la misma configuración dos
veces** sobre las mismas 12 preguntas.

| Comparación | Solape de marcas detectadas |
|---|---|
| `medium` vs `medium` (idéntico) | **35,8%** |
| `minimal` vs `minimal` (idéntico) | **58,1%** |

Dos ejecuciones idénticas coinciden en poco más de un tercio de las marcas. Cada
llamada lanza su propia búsqueda web, recibe resultados distintos y produce una
respuesta distinta.

### Qué es fiable y qué no

- **Fiable: "¿aparece mi marca?"** Estable en las 12 preguntas y en las dos
  configuraciones — cero discrepancias entre repeticiones. La métrica de cabecera
  aguanta.
- **No fiable: la lista de competidores en una sola pasada.** Una marca entra o
  no según la búsqueda que toque. Un informe que enumere competidores a partir
  de una ejecución está reportando en parte el azar.

### Mitigación

Repetir cada pregunta N veces y reportar **frecuencia de aparición** en lugar del
resultado de una pasada. Multiplica el coste por N, así que conviene decidir antes
si la lista de competidores es un entregable o solo contexto.

> Interactúa con la ficha 01 punto 4: hoy el ruido de nombres se suma al ruido de
> ejecución. Normalizar variantes de marca reduce ambos.

---

## D. Un despliegue mata los análisis en vuelo · SEVERIDAD BAJA

El estado de los trabajos vive en memoria del proceso. Al recrear el contenedor,
lo que esté a mitad se pierde: existe código de recuperación que los marca como
error al arrancar (`Scheduler: N ejecuciones interrumpidas marcadas como error`).

Hoy se convive con ello desplegando cuando no hay nada corriendo. Es la única
carencia de la arquitectura actual que una cola persistente (Redis/BullMQ)
resolvería de verdad.

**No confundir con el bug de timeout en cola**, que era otra cosa y ya está
arreglado (`fix(queue)`, 25/08/2026): allí el cronómetro medía la espera en cola
en lugar de la llamada, y las peticiones morían sin llegar a salir.

`api/services/providerQueue.ts` ya limita concurrencia por proveedor, espacia
despachos y reintenta 429 con backoff. Con **un solo contenedor** cumple su
función; Redis solo aporta si se necesita persistencia entre despliegues o más
de una instancia de la API.

---

## Resumen

| Ficha | Afecta a | Arreglo |
|---|---|---|
| ~~A · Evidencias~~ | Credibilidad del informe | ✅ arreglado 25/08/2026 |
| B · Sentimiento | Utilidad de la métrica | Decidir qué medir antes de tocar código |
| C · Inestabilidad | Fiabilidad de la lista de competidores | Repetir N veces y usar frecuencia |
| D · Trabajos en vuelo | Operación | Cola persistente, o desplegar en hueco |

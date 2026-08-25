# Hallazgos de auditoría técnica

**Fecha:** 25/08/2026
**Método:** auditoría sobre datos reales de producción (4.395 preguntas de 60
análisis, más muestras específicas). Los agregados se calcularon **dentro del
contenedor**; no se descargaron datos de cliente.

Ninguno de estos hallazgos rompe el sistema. Todos afectan a la **calidad de lo
que se le entrega al cliente**.

---

## A. El campo `evidence` casi nunca se rellena · SEVERIDAD MEDIA

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

### Arreglo propuesto

Pedir la frase en el prompt de la fase 2 —que ya devuelve marca, sentimiento y
posición— y guardarla en `evidence`. Convierte el 70% en casi 100%, con frases
elegidas por el modelo. Coste added: unos pocos tokens de salida por mención.

Misma raíz que `contextualAnalysis` en la ficha 01, punto 2.a: arreglar ambos
a la vez tiene sentido.

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
| A · Evidencias | Credibilidad del informe | Pedir la frase en la fase 2 |
| B · Sentimiento | Utilidad de la métrica | Decidir qué medir antes de tocar código |
| C · Inestabilidad | Fiabilidad de la lista de competidores | Repetir N veces y usar frecuencia |
| D · Trabajos en vuelo | Operación | Cola persistente, o desplegar en hueco |

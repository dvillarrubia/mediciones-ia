# Peticiones de la herramienta · Salto

**Origen:** documento "Peticiones herramienta medición IA - Salto", 18/08/2026
**Contexto:** peticiones surgidas al montar el informe de Salto.
**Diagnóstico:** 25/08/2026, contra datos reales de producción.

---

## 4. Gap de citaciones: aparecen competidores falsos · ✅ ARREGLADO (25/08/2026)

> *"Están apareciendo competidores que no son los establecidos (salen gimnasios,
> por ejemplo) y no aparecen los reales tipo Assa Abloy."*

**Confirmado.** Es el punto más grave de la lista: el dato que ve el cliente es
incorrecto, no solo incompleto. Y son **dos fallos distintos**, uno por cada
mitad de la queja.

### 4.a — Cualquier marca mencionada cuenta como "competidor"

`src/components/intelligence/sharedMetrics.ts`, en `buildCitationGaps()`:

```js
const comps = mentions.filter(bm => aliasKey(bm.brand) !== targetKey).map(bm => bm.brand);
```

`comps` son **todas** las marcas mencionadas menos la objetivo. No se cruza con
los competidores configurados en el proyecto. Toda marca que el modelo descubra
—cliente, sector, plataforma— entra como competidor.

**Evidencia** (8 análisis de Salto en producción):

| | |
|---|---|
| Competidores configurados en el proyecto | **11** |
| Marcas tratadas como competidor por el gap | **1.120** |
| Intrusas | **1.106** |

Muestra de lo que el gap llama "competidor de Salto":

```
15  Orion Hotel          5  Trainingym        3  GymLock
 2  Virtuagym            1  NH Hotel Group    1  Meliá Hotels International
 1  Room Mate Hotels     1  The Student Hotel 1  Hospital Clínic de Barcelona
 1  Booking              1  AvaiBook          1  GuestReady
```

No son competidores: son **clientes y verticales** de Salto. Aparecen porque
Salto vende control de accesos a hoteles y gimnasios, así que la IA los nombra
en la misma respuesta.

### 4.b — Assa Abloy sí se detecta, pero fragmentado

El competidor real **sí aparece**, repartido en variantes que se cuentan por
separado y ninguna suma lo suficiente para entrar en el top 20:

```
ASSA ABLOY (TESA Hotel)  ·  TESA Hotel de ASSA ABLOY  ·  Tesa Assa Abloy
Assa Abloy (VingCard)    ·  TESA Hotel
```

Con 1.106 marcas intrusas compitiendo por 20 huecos ordenados por número de
citaciones, el competidor real queda sepultado. Por eso "no aparece".

### Arreglo aplicado

Commit `fix(citations)`, 25/08/2026. Tres cambios en `buildCitationGaps()`:

1. **`comps` se restringe a los competidores configurados** del proyecto. Cada
   mención se reduce a su competidor canónico, así que las variantes dejan de
   contarse por separado.
2. **Emparejamiento tolerante a variantes** (`brandMatches()`): compara por
   palabra completa en ambos sentidos, de modo que "ASSA ABLOY (TESA Hotel)"
   casa con "ASSA Abloy" y "HID" con "HID Global". Se exigen 3 caracteres y
   límite de palabra para que "TESA" no case dentro de "protesta".
3. **La marca objetivo se detecta igual de tolerante.** Antes usaba igualdad
   estricta: si el modelo decía "Salto Systems" y el proyecto "Salto", no la
   reconocía y el dominio se contaba como hueco **aunque la marca estuviera
   presente**. Era un falso positivo que nadie había reportado.

También se afinó `isBrandOwnedDomain()`: usaba `startsWith`, así que
`accentra-assaabloy.com` —dominio propio de Assa Abloy— aparecía como
"oportunidad". Un dominio de la competencia nunca es un hueco donde ganar
presencia.

**Resultado medido** sobre los 8 análisis de Salto en producción:

| | Antes | Después |
|---|---|---|
| Marcas mostradas como competidor | **98** | **3** |
| Cuáles | ruido: Clear Cloud Solutions, Walk In IQ, symplr Access, Aptly NoKey… | HID Global, ASSA Abloy, Dormakaba |
| ¿Aparece Assa Abloy? | no (diluida en variantes) | **sí** |

El emparejador se validó con 15 casos reales (8 que deben casar, 7 que no):
15/15 correctos.

### Competidores vs. descubiertas

Las marcas que el modelo encuentra por su cuenta **no se descartan**: se muestran
aparte, marcadas como descubiertas. Tirarlas perdía información útil —entre ellas
está la competencia real sin declarar— y meterlas como competencia era el bug
original.

| Origen | En la tabla | Cuenta en "Citas con competencia" |
|---|---|---|
| Competidor configurado | etiqueta naranja | **sí** |
| Descubierta por el modelo | etiqueta gris punteada | no |

El campo `isDiscovered` ya venía guardado en cada mención (2.213 descubiertas
frente a 139 configuradas en la muestra de Salto), así que la distinción no
necesitó tocar el backend.

Los dominios respaldados por competencia declarada se ordenan primero. Los que
solo tienen marcas descubiertas aparecen debajo, con la nota "solo descubiertas":
son señal más débil, no una afirmación sobre tu competencia.

**Efecto práctico:** en el gap de Salto se ve que Genetec, AMAG, LenelS2 y
Allegion reaparecen en dominio tras dominio. Eso es exactamente la señal para
promoverlos a competidor en la configuración del proyecto — decisión del gestor,
no del código.

> La normalización de variantes beneficia a **todos** los dashboards, no solo al
> gap: la fragmentación de nombres infla el recuento de marcas en todo el
> sistema. Aquí solo se ha aplicado al gap; extenderla es trabajo aparte.

---

## 2. Sentimiento: el detalle solo aparece para Gemini · ✅ ARREGLADO (26/08/2026)

> *"Ahora mismo el detalle solo aparece para Gemini: ¿es lo esperado o falta el
> resto de modelos?"*

**Reproducido y arreglado sin necesidad de la captura.** No era lo esperado.

### Causa

`SentimentDashboard` calculaba distribución, ranking por marca y tabla de
detalle **únicamente sobre el análisis más reciente** del rango:

```js
const latest = sorted[sorted.length - 1];
(latest.results?.questions || []).forEach(...)
```

Y las automatizaciones de un mismo proyecto corren escalonadas: en Salto,
chatgpt a las 12:00, claude a las 13:00 y **gemini a las 14:00**. El análisis más
reciente era siempre el de Gemini, así que el detalle solo podía enseñar Gemini.

### La dimensión "modelo" está entre análisis, no dentro de la pregunta

Dato comprobado en producción: de 2.373 preguntas, **ninguna tiene más de un
modelo** en `multiModelAnalysis` (2.268 con uno, 105 con ninguno). Cada análisis
se ejecuta con un modelo. Para comparar modelos hay que agrupar por análisis.

### Trampa: `metadata.modelsUsed` no es de fiar

Guarda los modelos **solicitados**, no los ejecutados. Hay análisis en producción
con `modelsUsed: ["claude","gemini","chatgpt"]` cuyas **103 preguntas corrieron
todas con Gemini**. Etiquetar el gráfico con ese campo habría pintado tres
modelos que nunca intervinieron.

`analysisModelLabel()` deriva el modelo de las propias preguntas y solo cae a
`metadata` si no hay otro dato.

### Cambios

- La distribución, el ranking por marca y el detalle recorren **todos** los
  análisis del rango, no solo el último.
- Cada fila del detalle se etiqueta con el modelo de **su** análisis.
- Nuevo **selector de modelo** (aparece solo si hay más de uno).
- Corregido el InfoTip, que describía un comportamiento que ya no era cierto.

### Verificación (datos reales de Salto)

| | Modelos visibles |
|---|---|
| Antes | **1** — `Gemini 3.1 Flash Lite` |
| Después | **4** — ChatGPT GPT-5 Mini · Claude Haiku 4.5 · GPT-4o Search · Gemini 3.1 Flash Lite |

El "antes" reproduce exactamente el síntoma reportado.

## 3. Métricas: una línea por modelo · ✅ ARREGLADO (26/08/2026)

> *"Tracking de posición y evolución del sentimiento: mostrar una línea por
> modelo (3 líneas) en lugar de un dato agregado."*

Petición razonable y coherente con cómo trabaja Salto: tiene automatizaciones
separadas por modelo (`Salto gen ES - chatgpt`, `- claude`, `- gemini`), así que
el dato por modelo **ya existe**, solo se está promediando al pintarlo.

### Hecho

**Evolución del sentimiento:** nuevo gráfico "Evolución del sentimiento por
modelo" con una línea por modelo (sentimiento neto = % positivas − % negativas).
Las líneas se **cortan** donde ese modelo no se ejecutó, en lugar de caer a cero
y fingir un desplome.

Aparece solo cuando hay más de un modelo en el rango.

**Tracking de posición:** nuevo gráfico "Posición media por modelo", con el eje
Y **invertido** (más arriba = mejor posición, porque #1 es el mejor puesto) y
una línea por modelo.

Ambos gráficos aparecen solo cuando hay más de un modelo en el rango, y sus
líneas se cortan donde ese modelo no corrió.

### Por qué importaba separarlos

Datos reales de Salto Systems al implementarlo:

| fecha | ChatGPT | Claude | Gemini |
|---|---|---|---|
| 17/08 | #1.37 | #1.37 | #1.62 |
| 25/08 | **#2.00** | **#2.29** | #1.65 |

Salto **perdió casi un puesto en ChatGPT y casi uno entero en Claude**, mientras
que en Gemini se mantuvo. Con una sola línea agregada esa divergencia quedaba
enterrada en un promedio — que es exactamente lo que motivaba la petición.

> **Ojo al agregar:** promediar posiciones entre modelos con distinto número de
> respuestas da un número que no significa nada. Por eso se separan en líneas y
> no conviene dejar el agregado como defecto.

### Deuda anotada

`buildPositionByModelOverTime()` compara la marca con `aliasKey` estricto, igual
que `positionDistFor()` y `buildModelVisibility()`, para que los tres gráficos de
posición cuenten igual. Es más estricto que el `brandMatches()` que se introdujo
al arreglar el gap de citaciones y puede perder variantes ("Salto Systems" frente
a "Salto"). Unificarlos es un cambio aparte: movería números que los clientes ya
tienen en informes entregados.

---

## 1. Descargas y exportación · ✅ PARCIAL (25/08/2026)

> *Tablas descargables, pestaña de Descargas con selector y filtro por periodo,
> y descarga múltiple de listas de prompts.*

No es un bug: es funcionalidad que no existe. Ya hay base sobre la que construir
(`dashboardExcelExport.ts`, `excelService.ts`, `pdfService.ts`).

Merece la pena por el motivo que da el propio usuario: *"poder redactar el
informe con Claude a partir de ese Excel"*. Es decir, hoy hay trabajo manual de
copiar y pegar que se puede eliminar.

### Hecho

**1. Las dos tablas de URLs/Citas.** "Menciones y citaciones de la marca" ya
estaba en el Excel de esa pestaña; faltaba **"Gap de citaciones"**, que se ha
añadido como hoja propia separando competidores configurados de marcas
descubiertas, igual que en pantalla.

> Se hizo **después** de arreglar el punto 4, a propósito: exportar el gap con
> 1.106 competidores falsos habría llevado el error del dashboard a un fichero
> que circula por correo.

**2. Pestaña "Descargas"** en el Centro de Inteligencia
(`components/intelligence/DownloadsDashboard.tsx`): un solo Excel con las
pestañas que elijas —Métricas, Sentimiento, Topics, URLs/Citas, GAPS— y filtro
de fechas común a todas. Es lo que pedía el motivo original: *"poder redactar el
informe con Claude a partir de ese Excel"*.

Para que el Excel no pueda decir algo distinto de la pantalla, los cálculos que
vivían sueltos dentro de los dashboards (Topics y Sentimiento) se movieron a
`sharedMetrics.ts`; el dashboard y la descarga usan ahora la misma función. Los
demás bloques ya tiraban de funciones compartidas.

### Pendiente

**3. Descarga múltiple de listas de prompts** (pregunta + respuesta de varias
listas a la vez). No entra en la pestaña de Descargas porque no opera sobre
análisis sino sobre las listas de prompts, que viven en otra pantalla.

---

## 5. Nomenclatura · ✅ ARREGLADO (26/08/2026)

> *Nombre del modelo en el nombre de la lista; fichero como fecha-proyecto-modelo;
> nombre del modelo en la columna de fecha del Excel de Gaps.*

Cosmético en apariencia, pero con razón de fondo: con automatizaciones por
modelo, tres análisis del mismo proyecto y día eran **indistinguibles** tanto en
la lista como en los ficheros descargados, que además se pisaban en la carpeta.

### Hecho

**Nombre de fichero:** `fecha-proyecto-modelo-tipo.xlsx`. La fecha delante ordena
cronológicamente en el explorador; el modelo distingue descargas del mismo
proyecto y día. Se limpian acentos, emojis y símbolos:

```
2026-08-26-Salto-Systems-Gemini-3-1-Flash-Lite-Search-gaps.xlsx
2026-08-26-Salto-Systems-multimodelo-informe.xlsx
2026-08-26-Banco-Pichincha-metricas.xlsx        (sin modelo → se omite)
```

Con varios modelos en el rango se escribe `multimodelo`: concatenar cuatro
nombres daría un fichero ilegible.

**Columna de fecha del Excel de Gaps:** ahora `fecha · modelo`, y solo cuando hay
más de un modelo que distinguir. Se aplicó también a la **matriz en pantalla**,
donde el problema era peor: tres columnas con la misma fecha y sin forma de saber
cuál era cuál.

**Nombre de la lista:** cada análisis muestra un distintivo con su modelo.

### Trampa: `metadata.modelsUsed` no era de fiar

Guardaba las personas **solicitadas**, no el modelo ejecutado. En producción
conviven los dos formatos:

```
["ChatGPT (GPT-5 Mini) + Search 💰"]   ← correcto (ruta execute-async)
["claude","gemini","chatgpt"]          ← personas solicitadas (ruta execute)
```

Se corrigió el origen en `analysis.ts` para que `/execute` guarde el modelo real,
igual que ya hacía `/execute-async`.

Para los análisis **ya guardados** no hay arreglo posible: el dato correcto no se
registró. El distintivo de la lista **se oculta** cuando los valores son claves de
persona sueltas — mejor no enseñar nada que enseñar tres modelos que no
intervinieron. Los dashboards no se ven afectados: derivan el modelo de las
propias preguntas mediante `analysisModelLabel()`.

---

## Resumen de prioridad

| Orden | Punto | Por qué |
|---|---|---|
| ~~1~~ | ~~**4 · Gap de citaciones**~~ | ✅ arreglado 25/08/2026 |
| ~~2~~ | ~~**2 · Detalle de sentimiento**~~ | ✅ arreglado 26/08/2026 |
| ~~3~~ | ~~**3 · Línea por modelo**~~ | ✅ arreglado 26/08/2026 (sentimiento + posición) |
| ~~4~~ | ~~**1 · Descargas**~~ | ✅ parcial: falta la descarga múltiple de listas de prompts |
| ~~5~~ | ~~**5 · Nomenclatura**~~ | ✅ arreglado 26/08/2026 |

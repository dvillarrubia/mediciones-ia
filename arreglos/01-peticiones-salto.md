# Peticiones de la herramienta · Salto

**Origen:** documento "Peticiones herramienta medición IA - Salto", 18/08/2026
**Contexto:** peticiones surgidas al montar el informe de Salto.
**Diagnóstico:** 25/08/2026, contra datos reales de producción.

---

## 4. Gap de citaciones: aparecen competidores falsos · SEVERIDAD ALTA

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

### Arreglo propuesto

1. **Restringir `comps`** a los competidores configurados del proyecto, más las
   marcas descubiertas que se hayan promovido explícitamente a competidor.
   Un desplegable de marcas descubiertas donde el gestor marque cuáles son
   competencia resolvería el caso de Brivo, Genetec o Verkada — competidores
   legítimos que hoy no están configurados.
2. **Normalizar variantes de marca** antes de agregar. Ya existe `aliasKey()`;
   falta aplicarlo con un diccionario de alias por proyecto para que las cinco
   formas de "Assa Abloy" sumen como una.

> El punto 2 beneficia a **todos** los dashboards, no solo al gap: la
> fragmentación de nombres infla el recuento de marcas en todo el sistema.

---

## 2. Sentimiento: el detalle solo aparece para Gemini · SEVERIDAD ALTA

> *"Ahora mismo el detalle solo aparece para Gemini: ¿es lo esperado o falta el
> resto de modelos?"*

**No es lo esperado.** No he podido reproducir exactamente "solo Gemini", pero he
encontrado dos defectos reales en esa vista.

### 2.a — La columna de motivo está vacía SIEMPRE, en todos los modelos

`src/components/intelligence/SentimentDashboard.tsx:90`:

```js
const reasoning = ca?.reasoning || ca?.competitiveReasoning || bm.evidence?.[0];
```

Las tres fuentes están vacías. Medido sobre 4.673 menciones de Salto:

| Modelo | Menciones | Con `contextualAnalysis` | Con `evidence` |
|---|---|---|---|
| GPT-4o Search | 2.060 | **0 (0%)** | 0 (0%) |
| ChatGPT (GPT-5 Mini) | 1.352 | **0 (0%)** | 0 (0%) |
| Gemini 3.1 Flash Lite | 648 | **0 (0%)** | 0 (0%) |
| Claude Haiku 4.5 | 613 | **0 (0%)** | 0 (0%) |

`contextualAnalysis` no se rellena nunca en el flujo que generan estos análisis.
Ver ficha 02 para el problema de `evidence`, que es la misma raíz.

### 2.b — La etiqueta de modelo se toma del primer elemento

Misma vista, línea 88:

```js
const model = modelLabel(q.multiModelAnalysis?.[0]);
```

Coge siempre `[0]`. En un análisis multi-modelo, **todas** las filas de detalle
se etiquetan con el primer modelo, ocultando el resto. Esa es la explicación más
probable de "solo aparece Gemini", pero **hay que confirmarla** reproduciendo el
caso: pedir al usuario captura y el proyecto/fecha donde lo ve.

### Arreglo propuesto

Recorrer `multiModelAnalysis` completo y emitir una fila por modelo, en vez de
asumir `[0]`. Y rellenar el motivo (ver ficha 02).

---

## 3. Métricas: una línea por modelo · SEVERIDAD MEDIA

> *"Tracking de posición y evolución del sentimiento: mostrar una línea por
> modelo (3 líneas) en lugar de un dato agregado."*

Petición razonable y coherente con cómo trabaja Salto: tiene automatizaciones
separadas por modelo (`Salto gen ES - chatgpt`, `- claude`, `- gemini`), así que
el dato por modelo **ya existe**, solo se está promediando al pintarlo.

Comparte raíz con el punto 2.b: el frontend colapsa la dimensión "modelo" en
lugar de conservarla. Si se arregla 2.b, esto es en gran parte el mismo trabajo.

**Ojo al agregar:** promediar posiciones entre modelos con distinto número de
respuestas da un número que no significa nada. Al separar por líneas el problema
desaparece, pero conviene no dejar el agregado como opción por defecto.

---

## 1. Descargas y exportación · SEVERIDAD MEDIA

> *Tablas descargables, pestaña de Descargas con selector y filtro por periodo,
> y descarga múltiple de listas de prompts.*

No es un bug: es funcionalidad que no existe. Ya hay base sobre la que construir
(`dashboardExcelExport.ts`, `excelService.ts`, `pdfService.ts`).

Merece la pena por el motivo que da el propio usuario: *"poder redactar el
informe con Claude a partir de ese Excel"*. Es decir, hoy hay trabajo manual de
copiar y pegar que se puede eliminar.

**Alcance sugerido, por orden de valor:**

1. Descargar las dos tablas de URLs/Citas — es lo más pequeño y desbloquea ya.
2. Pestaña de Descargas con selector de pestañas y filtro por periodo.
3. Descarga múltiple de listas de prompts con pregunta + respuesta.

> **Antes de exportar el gap de citaciones, arreglar el punto 4.** Exportar a
> Excel un listado con 1.106 competidores falsos multiplica el problema en vez
> de resolverlo: el error pasa del dashboard a un fichero que circula por correo.

---

## 5. Nomenclatura · SEVERIDAD BAJA

> *Nombre del modelo en el nombre de la lista; fichero como fecha-proyecto-modelo;
> nombre del modelo en la columna de fecha del Excel de Gaps.*

Cosmético pero con razón de fondo: con automatizaciones por modelo, sin el
nombre del modelo en el fichero **no se distingue un informe de otro** al
descargarlos. Es barato y evita confusiones al enviar entregables al cliente.

El dato ya está guardado (`metadata.modelsUsed`), solo hay que propagarlo al
nombre.

---

## Resumen de prioridad

| Orden | Punto | Por qué |
|---|---|---|
| 1 | **4 · Gap de citaciones** | Dato erróneo en informes de cliente |
| 2 | **2 · Detalle de sentimiento** | Columna vacía + dimensión modelo perdida |
| 3 | **3 · Línea por modelo** | Misma raíz que el 2, aprovecha el trabajo |
| 4 | **1 · Descargas** | Elimina trabajo manual (hacer después del 4) |
| 5 | **5 · Nomenclatura** | Barato, evita líos de entregables |

# Configuración de Modelos de IA

> Runbook para cambiar un modelo cuando el proveedor lo deprecia, sube el precio
> o sale uno mejor. Última revisión: agosto 2026.

## Definición de hecho

Has terminado cuando `npm run modelos:check` pasa en verde, `npm run check` no
da errores y un análisis real devuelve respuestas con fuentes.

---

## 1. Regla de oro: un solo proveedor

**Todo pasa por OpenRouter.** No hay integraciones directas con OpenAI,
Anthropic ni Google. Una sola API key da acceso a GPT, Claude, Gemini y
Perplexity.

Esto no es una preferencia estética, es la lección de un incidente: en agosto de
2026 OpenAI deprecó `gpt-4o-search-preview` y `gpt-4o-mini-search-preview`, los
únicos modelos que soportaban `web_search_options` en `chat/completions`. Todos
los análisis empezaron a devolver 404. No se pudo arreglar cambiando el id
porque el parámetro en sí desapareció: OpenAI movió la búsqueda web a la
Responses API. Mantener una integración por proveedor significa heredar la
política de deprecación de cada uno.

**Si añades un proveedor directo, asumes su calendario de deprecaciones.** No lo
hagas salvo que OpenRouter no sirva lo que necesitas.

---

## 2. Arquitectura: dos fases, dos modelos

Cada pregunta analizada consume **dos** llamadas:

| Fase | Qué hace | Necesita web | Constante | Modelo actual |
|------|----------|--------------|-----------|---------------|
| 1 · Generación | Pregunta al asistente como lo haría un usuario | **Sí** | `GENERATION_MODEL` | `openai/gpt-5-mini:online` |
| 2 · Extracción | Saca menciones de marca de esa respuesta (JSON) | No | `ANALYSIS_MODEL` | `openai/gpt-4o-mini` |

La fase 1 es la que mide: su modelo **es** el dato del informe. La fase 2 es
mecánica y solo necesita ser barata y fiable extrayendo JSON.

Ambas van **siempre por el mismo proveedor** (`getPersonaProviderConfig`), para
que un análisis no mezcle proveedores a mitad.

### No pongas un modelo con razonamiento en la fase 2

Los tokens de razonamiento **se facturan como salida** aunque no los veas. En una
tarea mecánica como extraer JSON no aportan nada y multiplican el coste:
`openai/gpt-5-nano`, con su `effort` por defecto, sale un 39% MÁS caro que
`gpt-4o-mini` pese a tener un precio nominal tres veces menor.

Ver la sección 3 para el detalle y el comando que consulta el campo `reasoning`.

Y ojo con el nombre: **"nano" indica tamaño, no calidad.** Es el escalón más
pequeño de su familia (nano < mini < estándar), optimizado para coste y
velocidad. Un modelo más reciente no es automáticamente más capaz.

---

## 3. Costes reales (medidos, no estimados)

Medido el 25/08/2026 con llamadas reales a OpenRouter, misma pregunta
("mejores agencias SEO en Bilbao") y el prompt de sistema que usa la app:

| Configuración fase 1 | Coste/pregunta | 1.000 preg. | tok. in | razonam. | fuentes |
|---|---|---|---|---|---|
| `perplexity/sonar` | $0.0057 | $5.66 | 62 | 0 | 9 |
| `openai/gpt-5-mini:online` **+ effort `minimal`** | $0.0087 | $8.68 | 2.352 | 0 | 5 |
| `anthropic/claude-haiku-4.5:online` | $0.0136 | $13.62 | 3.274 | 0 | 5 |
| `openai/gpt-5-mini:online` *(defecto, effort `medium`)* | $0.0262 | $26.17 | 13.530 | 1.280 | 4 |

La fase 2 (`openai/gpt-4o-mini`) añade **$0.0002** por pregunta: es ruido frente
a la fase 1. Optimizar ahí no merece la pena; optimizar la fase 1 sí.

### Dos trampas que invalidan cualquier estimación sobre el papel

**1. La búsqueda infla el prompt.** Los resultados se inyectan en el contexto:
13.530 tokens de entrada en el caso de arriba, no los ~400 de la pregunta. No
puedes estimar el coste a partir de la longitud de tu prompt.

**2. El razonamiento se factura como salida.** `openai/gpt-5-mini` tiene
`reasoning.mandatory=true` con `default_effort: 'medium'`: gastó 1.280 tokens de
razonamiento invisible. Bajarlo a `minimal` recorta el coste **3 veces** y en la
prueba devolvió *más* fuentes (5 frente a 4) y una respuesta más larga.

Comprueba siempre el campo `reasoning` antes de elegir modelo:

```bash
curl -s https://openrouter.ai/api/v1/models | python3 -c "
import json,sys
m={x['id']:x for x in json.load(sys.stdin)['data']}['openai/gpt-5-mini']
print(m['reasoning'])
"
# {'mandatory': True, 'supported_efforts': [...], 'default_effort': 'medium'}
```

Modelos curados con razonamiento **obligatorio** (revisar antes de usarlos):
`openai/gpt-5-mini`, `google/gemini-3.5-flash`. Sin razonamiento:
`perplexity/sonar` y `perplexity/sonar-pro`.

Para fijar el esfuerzo, añade al cuerpo de la petición:

```json
{ "reasoning": { "effort": "minimal" } }
```

### Resultado del A/B de `reasoning.effort` (25/08/2026)

Medido sobre **12 preguntas × 2 configuraciones × 2 pasadas = 48 análisis
completos** (fase 1 + fase 2), con la segunda pasada como control para separar
el efecto real del ruido de la búsqueda web.

| Métrica | `medium` (defecto) | `minimal` | |
|---|---|---|---|
| Coste / 1.000 preguntas | $29.60 | **$9.20** | **−69%** |
| Marcas detectadas (media) | 6.4 | 6.2 | igual |
| Fuentes por respuesta (media) | 4.8 | **5.0** | igual o mejor |
| Longitud de respuesta | 2.367 | 2.443 | igual |
| ¿Marca objetivo mencionada? · estabilidad entre repeticiones | 0/12 fallos | 0/12 fallos | igual |
| Reproducibilidad de la lista de marcas | 35.8% | **58.1%** | minimal es más estable |

`minimal` sale igual o mejor en todo lo medido y cuesta un tercio. La única
discrepancia observada en la métrica de cabecera (BBVA en hipotecas) resultó ser
varianza: al repetir la pregunta, `medium` también mencionaba BBVA.

### El hallazgo incómodo: la lista de competidores es inestable

El control reveló algo que no depende del `effort` y afecta al producto:

> **Dos ejecuciones idénticas de la misma configuración coinciden solo en un
> 36% (`medium`) o un 58% (`minimal`) de las marcas detectadas.**

Cada llamada lanza su propia búsqueda web, recibe resultados distintos y produce
una respuesta distinta. Consecuencias:

- **La métrica de cabecera es fiable.** "¿Aparece mi marca?" fue estable en las
  12 preguntas y en las dos configuraciones: 0 discrepancias entre repeticiones.
- **La lista de competidores NO es fiable en una sola ejecución.** Una marca
  puede aparecer o no según la búsqueda que toque. Un informe que diga "estos
  son tus competidores en respuestas de IA" a partir de una pasada está
  reportando en parte el azar.

Si se necesita una lista de competidores estable, hay que repetir cada pregunta
N veces y quedarse con la frecuencia de aparición, no con el resultado de una
pasada. No está implementado.

## 4. Procedimiento: cambiar un modelo

### Paso 1 — Comprobar qué está roto

```bash
npm run modelos:check
```

Verifica contra la API en vivo de OpenRouter que cada modelo configurado existe,
que no tiene fecha de expiración anunciada y que el precio que mostramos es el
real. Sale con código 1 si algo rompe los análisis.

### Paso 2 — Elegir el sustituto

Consulta el catálogo real, nunca de memoria:

```bash
curl -s https://openrouter.ai/api/v1/models | python3 -c "
import json,sys
d=json.load(sys.stdin)['data']
for m in sorted(d, key=lambda x: float(x['pricing']['prompt'])):
    if m['id'].startswith('openai/'):
        p=m['pricing']
        w=p.get('web_search','-')
        print(f\"{m['id']:<38} in \${float(p['prompt'])*1e6:<8g} out \${float(p['completion'])*1e6:<8g} busq {w}\")
"
```

**Criterio de sustitución, en este orden:**

1. **Misma familia.** Si medías ChatGPT, sustituye por otro `openai/*`. Cambiar a
   Perplexity porque es más barato cambia *qué* mide el informe: pasarías a medir
   visibilidad en Perplexity y el cliente seguiría leyendo "ChatGPT". Si aun así
   lo cambias, dilo en el informe.
2. **Con búsqueda.** Sufijo `:online` o búsqueda nativa. Sin eso, el modelo se
   inventa las fuentes.
3. **Coste total**, incluyendo búsqueda (ver tabla arriba).

### Paso 3 — Editar

Un cambio de modelo toca **dos sitios como mucho**:

| Qué cambias | Fichero | Línea |
|---|---|---|
| Modelo por defecto | `api/config/constants.ts` | `DEFAULT_MODEL` |
| Modelo de generación | `api/services/openaiService.ts` | `GENERATION_MODEL` |
| Modelo de extracción | `api/services/openaiService.ts` | `ANALYSIS_MODEL` |
| Lista del desplegable | `api/config/constants.ts` | `OPENROUTER_MODELS` |

Si añades a `OPENROUTER_MODELS`, incluye el coste de búsqueda en `pricing`
(formato `'$0.25/M in · $2/M out · $0.01/búsqueda'`): es lo que domina la
factura y el verificador comprueba los tres números.

> **Nunca cablees un id de modelo fuera de estos sitios.** El incidente de
> agosto de 2026 se agravó porque `gpt-4o-search-preview` estaba repetido en 15
> puntos como *fallback*, así que fallaba pasara lo que pasara en la UI. Usa
> `DEFAULT_MODEL` importado desde `constants.ts`.

### Paso 4 — Retirar el viejo

Si el modelo viejo está **deprecado** (no solo desfasado), añádelo a
`DEPRECATED_MODEL_IDS` en `api/services/adminService.ts`.

Esto importa: la tabla `ai_models` **persiste entre despliegues**. Sin ese
registro, una instalación existente seguiría ofreciendo el modelo muerto en el
desplegable aunque lo hayas quitado del código. La purga corre en cada arranque
del servidor (`api/server.ts` → `adminService.fullModelSync()`).

### Paso 5 — Verificar

```bash
npm run modelos:check   # el modelo existe y el precio es correcto
npm run check           # TypeScript compila
npm run dev             # y en el log: "Limpieza de modelos: N eliminados"
```

Y lanza **un análisis real de una pregunta**. Es la única prueba de que el
modelo responde y devuelve fuentes: los pasos anteriores solo demuestran que el
id existe en un catálogo.

---

## 5. Qué hacer cuando un análisis falla

| Síntoma | Causa | Acción |
|---|---|---|
| `404 The model X has been deprecated` | El proveedor retiró el modelo | Paso 1 en adelante |
| `402` sin créditos | Saldo de OpenRouter agotado | Recargar en openrouter.ai/credits |
| `No hay API key de OpenRouter configurada` | Falta la key del usuario | Configuración > API Keys |
| Respuestas sin fuentes | Modelo sin búsqueda web | Usar sufijo `:online` o Sonar |
| `El modelo X usa la integración directa de OpenAI` | Proyecto guardado con un modelo antiguo | Cambiar el modelo del proyecto |

El último caso es deliberado: cuando un proyecto guardado apunta a un modelo
directo ya retirado, el sistema **avisa y usa el defecto**, en vez de sustituirlo
en silencio. Un cambio callado de modelo falsearía el informe, que dice medir un
asistente concreto.

---

## 6. Estado actual (agosto 2026)

Verificado con `npm run modelos:check` **y con llamadas reales** a OpenRouter el
25/08/2026:

- **10 modelos curados**, todos vivos, sin fecha de expiración anunciada.
- **Fase 1 (generación):** `openai/gpt-5-mini:online`. Probado de extremo a
  extremo: devuelve respuesta y fuentes reales verificables. Coste medido
  **$0.0262/pregunta** con la configuración actual — ver sección 3: bajar
  `reasoning.effort` a `minimal` lo dejaría en $0.0087, pendiente de validar
  sobre un lote.
- **Fase 2 (extracción):** `openai/gpt-4o-mini`. Probado: devuelve JSON válido,
  detecta correctamente las marcas presentes y la ausencia de la marca objetivo.
  Coste medido **$0.0002/pregunta**. **No está deprecado.**

  Se mantiene a propósito frente a `openai/gpt-4.1-nano` (un 33% más barato):
  esta llamada decide si una marca cuenta como mencionada, así que cambiarla
  mueve los números de todos los informes, y el ahorro (~$0.12 por cada 1.000
  preguntas) es ruido frente al coste de la fase 1. Para promoverlo: pasar un
  conjunto de respuestas ya analizadas por ambos modelos y comparar las
  menciones marca por marca.
- **Sin integraciones directas.** `AI_MODELS` está vacío a propósito.

## 7. Mantenimiento preventivo

Ejecuta `npm run modelos:check` **antes de cada release** y cuando un cliente
reporte análisis raros. Tarda 5 segundos y detecta el problema antes que el
cliente.

Para automatizarlo en CI, usa `--json` y el código de salida:

```yaml
- name: Verificar modelos
  run: npm run modelos:check -- --json
```

Los proveedores anuncian deprecaciones con meses de antelación, pero el aviso
llega por email a la cuenta que creó la key, no al equipo. Este chequeo no
depende de que alguien lea ese correo.

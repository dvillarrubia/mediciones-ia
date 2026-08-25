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
| 2 · Extracción | Saca menciones de marca de esa respuesta (JSON) | No | `ANALYSIS_MODEL` | `openai/gpt-4.1-nano` |

La fase 1 es la que mide: su modelo **es** el dato del informe. La fase 2 es
mecánica y solo necesita ser barata y fiable extrayendo JSON.

Ambas van **siempre por el mismo proveedor** (`getPersonaProviderConfig`), para
que un análisis no mezcle proveedores a mitad.

### No pongas un modelo con razonamiento en la fase 2

Los tokens de razonamiento **se facturan como salida** aunque no los veas. En una
tarea mecánica como extraer JSON no aportan nada y multiplican el coste.

Comprueba el campo `reasoning` del catálogo antes de elegir:

```bash
curl -s https://openrouter.ai/api/v1/models | python3 -c "
import json,sys
m={x['id']:x for x in json.load(sys.stdin)['data']}['openai/gpt-5-nano']
print(m['reasoning'])
"
# {'mandatory': True, 'supported_efforts': [...], 'default_effort': 'medium'}
```

`mandatory: True` significa que no puedes desactivarlo, solo bajarlo a
`minimal`. Ejemplo real, con ~1.200 tokens de entrada y ~300 de salida visible:

| Modelo fase 2 | $/1.000 preguntas | vs. `gpt-4.1-nano` |
|---|---|---|
| `openai/gpt-4.1-nano` *(actual, sin razonamiento)* | $0.24 | — |
| `openai/gpt-4o-mini` *(anterior, sin razonamiento)* | $0.36 | +50% |
| `openai/gpt-5-nano` con effort `medium` (su defecto) | $0.50 | **+108%** |
| `openai/gpt-5-nano` con effort `minimal` | $0.22 | −8% |

`gpt-5-nano` tiene un precio nominal más bajo que `gpt-4o-mini` ($0.05 frente a
$0.15 de entrada) y aun así **sale más del doble de caro** con su configuración
por defecto. El precio por millón de tokens no dice cuántos tokens va a gastar.

Y ojo con el nombre: **"nano" indica tamaño, no calidad.** Es el escalón más
pequeño de su familia (nano < mini < estándar), optimizado para coste y
velocidad. Un modelo más reciente no es automáticamente más capaz.

### Cómo se activa la búsqueda web

Dos mecanismos, y la diferencia importa para el coste:

- **Sufijo `:online`** (`openai/gpt-5-mini:online`) — OpenRouter añade búsqueda a
  un modelo que no la trae. Se factura aparte.
- **Búsqueda nativa** (`perplexity/sonar`) — el modelo busca por sí mismo. No
  lleva sufijo.

`buildAdHocOpenRouterModel` asume que hay búsqueda si el id acaba en `:online` o
es un Perplexity Sonar. **Si añades un modelo con búsqueda nativa que no sea
Sonar, marca `supportsWebSearch: true` a mano** o el sistema creerá que no busca.

---

## 3. El coste lo domina la búsqueda, no los tokens

Este es el error de intuición más caro. Con ~400 tokens de entrada y ~700 de
salida por pregunta:

| Modelo | Tokens | Búsqueda | Total/pregunta | 1.000 preguntas |
|---|---|---|---|---|
| `gpt-4o-search-preview` *(muerto)* | $0.0080 | **$0.030** | $0.0380 | $38.00 |
| `perplexity/sonar` | $0.0011 | $0.005 | **$0.0061** | $6.10 |
| `openai/gpt-5-mini:online` | $0.0015 | $0.010 | $0.0115 | $11.50 |
| `anthropic/claude-haiku-4.5:online` | $0.0039 | $0.010 | $0.0139 | $13.90 |
| `google/gemini-3.1-flash-lite:online` | $0.0012 | $0.014 | $0.0152 | $15.20 |

La búsqueda es entre el 65% y el 90% del coste. **Comparar solo $/M de tokens te
llevará a elegir mal.**

---

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

Verificado con `npm run modelos:check` contra la API de OpenRouter:

- **10 modelos curados**, todos vivos, sin fecha de expiración anunciada.
- **Defecto:** `openai/gpt-5-mini:online` ($0.0115/pregunta).
- **Extracción:** `openai/gpt-4.1-nano` ($0.10/$0.40, 1M de contexto, sin
  razonamiento). Sustituye a `openai/gpt-4o-mini`, que **no estaba deprecado**
  pero era un 50% más caro y el más antiguo del stack (julio 2024).
  **Pendiente de validar:** el cambio abarata un 33%, pero nadie ha medido aún
  si extrae las menciones con la misma precisión. Antes de fiarte de los
  informes, pasa ambos modelos sobre el mismo conjunto de respuestas y compara
  las menciones detectadas. Revertir es una línea: `ANALYSIS_MODEL` en
  `api/services/openaiService.ts`.
- **Sin integraciones directas.** `AI_MODELS` está vacío a propósito.

---

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

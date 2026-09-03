# La pestaña GAPS no carga (página en blanco) · ✅ CÓDIGO ARREGLADO (03/09/2026)

**Origen:** reporte de usuario, 03/09/2026 — "cuando pincho en gaps no me la carga".
**Diagnóstico:** 03/09/2026, reproducido en el contenedor de producción
ejecutando el mismo cálculo del frontend (`buildGapsMatrix`) sobre los datos
reales de los 78 pares usuario/proyecto. Un proyecto revienta con excepción;
el resto calcula en menos de 350 ms.

**Severidad: Alta.** El usuario afectado no puede usar la pestaña GAPS. Como no
hay ninguna pista en pantalla, parece un problema del servidor y se pierde
tiempo mirando el VPS.

---

## Síntoma

Al pinchar en GAPS la pestaña (y el resto de la página) se queda en blanco.
No hay error HTTP: nginx registra solo 200/304 en `/api/analysis/saved/:id`,
la API no reinicia, no hay OOM ni rate limiting.

## Causa (verificada con datos de producción)

### 1. Evidencias guardadas como array anidado

Tres proyectos tienen menciones con `evidence: [["frase"]]` en lugar de
`evidence: ["frase"]`:

| usuario | proyecto | menciones afectadas | fechas |
|---|---|---|---|
| `59f6541e` (Saunier Duval) | `4d26c090` "Baseline" | 8 | 27/08/2026 |
| `f86ade47` (UOC) | `f6069a93` | 30 | 22/06 – 27/07/2026 |
| `bf1799ca` | `d6a5be92` | 16 | 12/03/2026 |

Origen: el flujo multi-modelo copiaba el array del LLM sin sanear.
`api/services/openaiService.ts:1374`:

```ts
evidence: Array.isArray(m.mention.evidence) ? m.mention.evidence : [],
```

Comprueba que sea array pero no que sus elementos sean texto. El flujo persona
sí pasaba por `verifyEvidence()`, que descarta lo que no es string; por eso no
todos los análisis están afectados.

### 2. El frontend asume string y lanza TypeError

`src/components/intelligence/sharedMetrics.ts` → `verifiedEvidence()` llama a
`cleanEvidencePhrase(raw)` para cada evidencia de la marca objetivo, y esta hace
`(e || '').replace(...)`. Con un array dentro, `.replace` no existe:

```
TypeError: (e || "").replace is not a function
    at cleanEvidencePhrase
    at verifiedEvidence ← classifyQuestionForBrand ← buildGapsMatrix
```

Solo salta cuando la evidencia anidada pertenece a la **marca objetivo** de una
pregunta (en UOC eran de competidores y la matriz no fallaba).

### 3. No había ErrorBoundary

`src/App.tsx` no envolvía nada. Una excepción en un `useMemo` de un dashboard
desmonta el árbol completo de React: página en blanco, sin mensaje. Misma
exposición en Sentimiento, Topics, Citas y Descargas (todos calculan en cliente
sobre datos históricos heterogéneos).

## Arreglo (aplicado)

- **API** `openaiService.ts`: nuevo `normalizeEvidenceList()` (aplana un nivel,
  solo strings no vacíos) en el flujo multi-modelo. Los análisis nuevos ya no
  guardan arrays anidados.
- **Frontend** `sharedMetrics.ts`: nuevo `evidenceStrings()` con la misma regla;
  `verifiedEvidence`, `cleanEvidencePhrase`, `SentimentDashboard` y
  `DownloadsDashboard` lo usan. Los análisis ya guardados se muestran bien sin
  tocar la base de datos.
- **Frontend** `DashboardErrorBoundary.tsx` alrededor de cada pestaña de
  dashboard en `IntelligenceHub.tsx`: si algo falla se ve el mensaje de error y
  el resto de la app sigue usable.

Verificación: el mismo harness sobre producción tras el cambio: 78/78 grupos
sin excepción; Saunier Duval "Baseline" → 92 prompts × 16 análisis en 154 ms.

## Pendiente / observado de paso

- **Datos**: las 54 menciones con array anidado siguen en la BD. Son inocuas
  tras el arreglo; si se quiere limpiar, es un UPDATE por análisis (no urgente).
- **SQLite en modo `journal_mode=delete`** (no WAL). En logs hay
  `SQLITE_BUSY: database is locked` al confirmar errores de schedules mientras
  corre una monitorización. Activar WAL en `databaseService` al abrir la BD
  evitaría los bloqueos lectura/escritura. Fuera del alcance de esta ficha.
- **Volumen**: el proyecto más grande pesa 35 MB de JSON (22 análisis). La
  pestaña los descarga todos (8 en paralelo) al abrirse. Funciona, pero con
  proyectos de 50 análisis rondará los 80-100 MB por visita; convendría un
  endpoint de detalle "ligero" (sin `sources[].snippet` ni respuestas
  completas) para los dashboards. No es la causa de este bug.

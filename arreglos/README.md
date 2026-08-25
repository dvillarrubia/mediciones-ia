# Arreglos pendientes

Registro de bugs y peticiones con **diagnóstico técnico**, no solo el síntoma.
Cada ficha dice qué falla, por qué, dónde está el código y qué haría falta.

## Índice

| # | Ficha | Origen | Severidad | Estado |
|---|-------|--------|-----------|--------|
| 01 | [Peticiones de Salto](01-peticiones-salto.md) | Usuarios · 18/08/2026 | ver ficha | pendiente |
| 02 | [Hallazgos de auditoría](02-hallazgos-auditoria.md) | Auditoría técnica · 25/08/2026 | ver ficha | pendiente |
| 03 | [API key heredada entre usuarios](03-api-key-heredada-entre-usuarios.md) | Usuario · 25/08/2026 | Alta | ✅ código · ⏳ limpieza de datos |

## Cómo leer las severidades

- **Alta** — los datos que ve el cliente son incorrectos. Prioridad sobre lo demás.
- **Media** — falta información o el trabajo manual es evitable.
- **Baja** — cosmético o de conveniencia.

## Convención

Cada punto lleva: **síntoma** (lo que se ve) → **causa** (verificada, con fichero y
línea) → **evidencia** (datos reales de producción) → **arreglo** (qué tocar).

Si la causa no está confirmada se dice explícitamente. Un diagnóstico a medias
etiquetado como certeza cuesta más que no tenerlo.

# Plan de Ataque — Mejoras de Métricas + GAPS (incremental)

> Ejecución **poco a poco**. El *qué/por qué* está en `PLAN_Mejoras_Metricas.md`.
> **Decisiones cerradas:** GAPS = tab propio · Glosario = en Configuración (editable por el usuario, por proyecto) · cambio aditivo.
> Cada paso es **pequeño, verificable y commiteable por separado**. No se empieza el siguiente hasta validar el anterior en el navegador.

---

## Hito 1 — Glosario de marcas (cimiento transversal)
*Objetivo: el usuario define alias en Configuración y todos los dashboards unifican las menciones.*

- [ ] **1.1 Modelo de datos** — añadir `aliases` a la config del proyecto (canónica → variantes). Backend: persistir en la config existente (o tabla `brand_aliases`) + endpoints CRUD.
- [ ] **1.2 Editor en Configuración** — UI en `Configuration.tsx`: añadir/editar/borrar entradas (marca canónica + lista de alias). Por proyecto.
- [ ] **1.3 Aplicar glosario** — `sharedMetrics.ts`: nueva `resolveBrand(name, glosario, configuredBrands)` que primero resuelve alias y luego normaliza. Sustituir usos de `normalizeBrandName`.
- [ ] **1.4 Verificar** — en Métricas/SoV/Menciones por Marca: las variantes (BIESS/biess/Instituto…) se cuentan como una sola. Devtools + datos reales.

**Entregable:** glosario editable funcionando y reflejado en los gráficos. *(Resuelve el problema #1 del cliente.)*

---

## Hito 2 — Menciones diferenciadas (en Métricas)
*Objetivo: separar mención / citación .com / citación blog, con deltas y tablas.*

- [ ] **2.1 Config de dominio** — añadir `brandDomain` (+ `blogPattern`) a la config del proyecto, junto al glosario. Editable en Configuración.
- [ ] **2.2 Clasificador** — `sharedMetrics.ts`: por respuesta y marca → `no_aparece | mencion | citacion_com | citacion_blog` comparando `sources[].domain/url` con `brandDomain`.
- [ ] **2.3 KPI cards con delta** — Menciones, Citaciones .com, Citaciones blog, Posición; delta vs análisis anterior (últimos 2 por fecha).
- [ ] **2.4 Tabla de menciones** — prompt · url citada · frase (`evidence[]`) · fuentes citadas.
- [ ] **2.5 Tabla de citaciones** — prompt · url · frase · posición vs competencia · quién es nº1 (`appearanceOrder`).
- [ ] **2.6 Verificar** — devtools con datos reales.

**Entregable:** sección de menciones/citaciones diferenciadas dentro de Métricas.

---

## Hito 3 — Tab "GAPS": Evolución temporal
*Objetivo: matriz prompt × fecha con código de color.*

- [ ] **3.1 Emparejado de prompts** — decidir clave estable (`questionId` vs texto normalizado); verificar estabilidad entre análisis. Helper en `sharedMetrics.ts`.
- [ ] **3.2 Estado por celda** — para (prompt × análisis): color No aparece (rojo) / Mención (naranja) / .com (amarillo) / blog (verde) + posición.
- [ ] **3.3 Tab + componente** — `GapsDashboard.tsx` + nueva pestaña "GAPS" en `IntelligenceHub`.
- [ ] **3.4 Matriz** — col1 prompts, columnas por fecha, celdas con punto de color (+ tooltip con posición).
- [ ] **3.5 Filtros** — "Solo GAPS (no aparece)" + selector de competencia.
- [ ] **3.6 Verificar** — devtools.

**Entregable:** vista de evolución temporal de GAPS.

---

## Hito 4 — Tab "GAPS": Por competencia
*Objetivo: sobre un informe, prompts donde la marca no es nº1 + competidores presentes.*

- [ ] **4.1 Selector de análisis** — elegir el informe (fecha) a inspeccionar.
- [ ] **4.2 Tabla** — prompt · posición de la marca (badge "No aparece" / "pos. N — tipo") · competidores que aparecen.
- [ ] **4.3 Filtros** — selector de competidor + check "solo donde NO aparece la marca".
- [ ] **4.4 Verificar** — devtools.

**Entregable:** vista por competencia completa. Tab GAPS con sus 2 vistas.

---

## Hito 5 — Position distribution (pulido, opcional)
*Objetivo: enriquecer el bloque de posición de Métricas.*

- [ ] **5.1 Buckets de posición** (pos.1 / 2-3 / 4-7 / 8+) → pie o barras apiladas.
- [ ] **5.2 Mejora de "Tracking de Posición"** con la distribución por bucket en el tiempo.

**Entregable:** posición más rica en Métricas. *(Datos ya existen; barato.)*

---

## Orden y dependencias

```
Hito 1 (Glosario)  ──> base que mejora todo lo demás
Hito 2 (Menciones diferenciadas)  ──> usa brandDomain (2.1)
Hito 3 (GAPS temporal)  ──> usa clasificador (2.2) + emparejado (3.1)
Hito 4 (GAPS competencia)  ──> usa lo de Hito 3
Hito 5 (Position)  ──> independiente, encaja cuando se quiera
```
- **Empezamos por Hito 1** (glosario en Configuración). Es el cimiento y el problema #1 del cliente.
- Cada hito se commitea y se valida en el navegador antes del siguiente.

---

## Verificación por hito
- `tsc --noEmit` + `vite build` limpios.
- Revisión en devtools con datos reales (proyecto con varias marcas/fechas).
- Commit independiente por hito en la rama `feature/visualizaciones-intelligence-hub`.

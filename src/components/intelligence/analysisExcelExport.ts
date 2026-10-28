// Excel de UN análisis (botón Excel de la página de Análisis y del historial del
// Intelligence Hub).
//
// Antes lo generaba el servidor con su propio cálculo: no aplicaba el glosario de
// alias del proyecto, no traía ninguna de las cifras de la pestaña Métricas y
// confundía la marca objetivo con una "descubierta" al leer la configuración
// guardada. Ahora sale de las MISMAS funciones que pintan los dashboards, así que
// el Excel no puede decir una cosa y la pantalla otra.

import { exportSheetsToExcel, downloadFilename, type SheetSpec } from './dashboardExcelExport';
import {
  APPEARANCE_LABELS,
  SENTIMENT_LABELS,
  analysisModelLabel,
  applyAliasesToAnalyses,
  brandNameVariants,
  buildCurrentState,
  classifyQuestionForBrand,
  countBrandAppearances,
  isRealDomain,
  normalizeBrandName,
  normalizeSentimentKey,
  sourceBelongsToBrand,
  type AnalysisDetail,
  type AppearanceType,
  type BrandAlias,
} from './sharedMetrics';

export interface AnalysisExcelProject {
  name?: string;
  brandAliases?: BrandAlias[];
  brandDomain?: string;
  brandBlogPattern?: string;
}

const pct = (n: number, d: number) => (d > 0 ? +((n / d) * 100).toFixed(1) : 0);
const round = (n: number, decimals = 2) => +n.toFixed(decimals);

/** Respuesta completa del modelo para una pregunta. */
const responseOf = (q: AnalysisDetail['results']['questions'][number]) =>
  (q.multiModelAnalysis || []).map(m => m.response || '').filter(Boolean).join('\n\n');

/** Construye las hojas. Separado de la descarga para poder testearlo. */
export function buildAnalysisExcelSheets(rawAnalysis: AnalysisDetail, project?: AnalysisExcelProject): SheetSpec[] {
  const aliases = project?.brandAliases || [];
  const [analysis] = applyAliasesToAnalyses([rawAnalysis], aliases);
  const questions = analysis.results?.questions || [];
  const target = analysis.configuration?.brand || '';
  const competitors = analysis.configuration?.competitors || [];
  const configured = [target, ...competitors];
  const domain = project?.brandDomain || '';
  const blog = project?.brandBlogPattern || '';
  const brandNames = brandNameVariants(target, aliases);
  const model = analysisModelLabel(analysis);
  const n = questions.length;

  const cs = buildCurrentState(questions, target, competitors, analysis.results?.overallConfidence || 0);
  const targetSov = cs.shareOfVoice.find(s => s.isTarget);
  const appearances = countBrandAppearances([analysis], target, domain, blog);
  const perQuestion = questions.map(q => ({ q, cls: classifyQuestionForBrand(q, target, domain, brandNames, blog) }));

  // Marca canónica de cada mención, con la misma normalización que la fotografía.
  const canonical = (brand: string) => normalizeBrandName(brand, configured);
  const isCompetitor = (brand: string) => competitors.some(c => c.toLowerCase() === canonical(brand).toLowerCase());
  const isTarget = (brand: string) => canonical(brand).toLowerCase() === target.toLowerCase();

  // === Resumen ===
  const typeCount = (t: AppearanceType) => perQuestion.filter(p => p.cls.type === t).length;
  const resumen: (string | number)[][] = [
    ['Informe de visibilidad en IA'],
    [],
    ['Marca objetivo', target],
    ['Proyecto', project?.name || ''],
    ['Fecha del análisis', new Date(analysis.timestamp).toLocaleString('es-ES')],
    ['Modelo', model],
    ['Preguntas', n],
    ['Competidores configurados', competitors.join(', ') || '—'],
    ['Alias de marca aplicados', brandNames.filter(b => b !== target).join(', ') || '—'],
    ['Dominio de marca', domain || 'sin configurar (las citaciones salen a 0)'],
    [],
    ['Métrica', 'Valor', '% sobre preguntas', 'Qué significa (mismas definiciones que la pestaña Métricas)'],
    ['Respuestas con mención', appearances.mentionedResponses, pct(appearances.mentionedResponses, n),
      'En cuántas respuestas aparece nombrada la marca. Cada respuesta cuenta una sola vez, aunque la nombre varias veces. Es la columna «¿La nombra?» = Sí de la hoja Preguntas.'],
    ['Share of Voice (%)', targetSov ? round(targetSov.percentage, 1) : 0, '',
      'Veces que se nombra la marca sobre el total de veces que se nombra cualquier marca. Cuenta repeticiones.'],
    ['Frecuencia (veces nombrada)', targetSov?.mentions || 0, '',
      `Veces que se nombra la marca, con repeticiones, de ${cs.totalMentions} menciones de marcas en total.`],
    ['Posición promedio', cs.avgAppearanceOrder !== null ? round(cs.avgAppearanceOrder, 1) : '', '',
      'Orden en que aparece la marca dentro de la respuesta (1 = primera marca nombrada). Solo en respuestas donde aparece.'],
    ['Sentimiento neto', round(cs.netSentimentScore), '',
      'Media del sentimiento de las menciones de la marca, de -2 (muy negativo) a +2 (muy positivo).'],
    ['Citaciones al sitio', appearances.citacionCom, '',
      'Fuentes citadas cuya URL es del dominio de la marca (sin el blog). Cuenta cada fuente.'],
    ['Citaciones al blog', appearances.citacionBlog, '', 'Fuentes citadas que enlazan al blog de la marca.'],
    ['Confianza IA (%)', Math.round(cs.aiConfidence * 100), '', 'Confianza que declara la IA sobre su análisis. No mide visibilidad.'],
    [],
    ['Tipo de aparición por pregunta (como en la pestaña GAPS)', 'Preguntas', '% sobre preguntas'],
    ...(['citacion_blog', 'citacion_com', 'mencion', 'no_aparece'] as AppearanceType[]).map(t => [
      APPEARANCE_LABELS[t], typeCount(t), pct(typeCount(t), n),
    ]),
    [],
    ['Presencia por categoría', 'Preguntas', `Con mención de ${target}`, `% ${target}`, ...competitors.map(c => `% ${c}`)],
    ...cs.categoryBrandMentions.map(c => [
      c.category,
      c.totalQuestions,
      c.brands[target]?.mentions || 0,
      round(c.brands[target]?.percentage || 0, 1),
      ...competitors.map(comp => round(c.brands[comp]?.percentage || 0, 1)),
    ]),
  ];

  // === Preguntas ===
  const preguntas: (string | number)[][] = [
    // "¿La nombra?" reproduce "Respuestas con mención" filtrando; "Tipo de aparición"
    // es la clasificación de GAPS, donde una citación pesa más que una mención.
    ['#', 'Categoría', 'Pregunta', '¿La nombra?', 'Tipo de aparición', 'Posición', 'Sentimiento', 'Frase literal',
      'URL de la marca citada', 'Competidores nombrados', 'Otras marcas nombradas', 'Nº fuentes', 'Respuesta de la IA'],
    ...perQuestion.map(({ q, cls }, i) => {
      const mentioned = (q.brandMentions || []).filter(b => b.mentioned && b.brand);
      const targetMention = mentioned.find(b => isTarget(b.brand));
      const unique = (xs: string[]) => Array.from(new Set(xs));
      return [
        i + 1,
        q.category || '',
        q.question,
        targetMention ? 'Sí' : 'No',
        APPEARANCE_LABELS[cls.type],
        cls.position || '',
        targetMention ? SENTIMENT_LABELS[normalizeSentimentKey(targetMention.detailedSentiment || targetMention.context)] : '',
        cls.evidence[0] || '',
        cls.urls.join('\n'),
        unique(mentioned.filter(b => isCompetitor(b.brand)).map(b => canonical(b.brand))).join(', '),
        unique(mentioned.filter(b => !isTarget(b.brand) && !isCompetitor(b.brand)).map(b => b.brand)).join(', '),
        (q.sources || []).filter(s => isRealDomain(s.domain)).length,
        responseOf(q),
      ];
    }),
  ];

  // === Marcas (Share of Voice) ===
  const respuestasPorMarca: Record<string, number> = {};
  questions.forEach(q => {
    new Set((q.brandMentions || []).filter(b => b.mentioned && (b.frequency || 0) > 0).map(b => canonical(b.brand)))
      .forEach(b => { respuestasPorMarca[b] = (respuestasPorMarca[b] || 0) + 1; });
  });
  const marcas: (string | number)[][] = [
    ['#', 'Marca', 'Tipo', 'Respuestas con mención', '% sobre preguntas', 'Frecuencia (veces nombrada)', 'Share of Voice (%)', 'Sentimiento (-2 a +2)'],
    ...cs.shareOfVoice.map((s, i) => [
      i + 1,
      s.brand,
      s.isTarget ? 'Marca objetivo' : isCompetitor(s.brand) ? 'Competidor' : 'Descubierta',
      respuestasPorMarca[s.brand] || 0,
      pct(respuestasPorMarca[s.brand] || 0, n),
      s.mentions,
      round(s.percentage, 1),
      round(s.sentimentScore),
    ]),
  ];

  // === Fuentes ===
  const porDominio: Record<string, { citas: number; preguntas: Set<number> }> = {};
  const urls: (string | number)[][] = [['#', 'Pregunta', 'Título', 'Dominio', 'URL']];
  questions.forEach((q, i) => {
    (q.sources || []).forEach(s => {
      if (!isRealDomain(s.domain)) return;
      if (!porDominio[s.domain]) porDominio[s.domain] = { citas: 0, preguntas: new Set() };
      porDominio[s.domain].citas++;
      porDominio[s.domain].preguntas.add(i);
      urls.push([i + 1, q.question, s.title || '', s.domain, s.url]);
    });
  });
  const totalCitas = Object.values(porDominio).reduce((acc, d) => acc + d.citas, 0);
  const fuentes: (string | number)[][] = [
    ['Dominio', 'Veces citado', '% de las citas', 'Preguntas que lo citan', '% sobre preguntas', '¿Dominio de la marca?'],
    ...Object.entries(porDominio)
      .sort((a, b) => b[1].citas - a[1].citas)
      .map(([d, v]) => [
        d, v.citas, pct(v.citas, totalCitas), v.preguntas.size, pct(v.preguntas.size, n),
        domain && sourceBelongsToBrand({ domain: d, url: `https://${d}`, title: '', snippet: '', isPriority: false }, domain) ? 'Sí' : '',
      ]),
  ];

  return [
    { name: 'Resumen', aoa: resumen, cols: [44, 16, 16, 90] },
    { name: 'Preguntas', aoa: preguntas, cols: [5, 24, 60, 11, 18, 9, 13, 60, 40, 30, 40, 10, 90] },
    { name: 'Marcas', aoa: marcas, cols: [5, 34, 15, 14, 12, 14, 12, 12] },
    { name: 'Fuentes', aoa: fuentes, cols: [36, 12, 12, 14, 12, 12] },
    { name: 'URLs citadas', aoa: urls, cols: [5, 60, 50, 30, 70] },
  ];
}

/** Descarga el Excel de un análisis. */
export function exportAnalysisToExcel(analysis: AnalysisDetail, project?: AnalysisExcelProject): void {
  exportSheetsToExcel(
    downloadFilename('informe', project?.name || analysis.configuration?.brand, analysisModelLabel(analysis)),
    buildAnalysisExcelSheets(analysis, project),
  );
}

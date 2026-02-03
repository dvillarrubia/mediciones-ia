/**
 * Servicio para generación de informes PDF profesionales
 * Usa Puppeteer para renderizar HTML a PDF
 * Updated: 2025-12-03
 */
import puppeteer from 'puppeteer';

interface BrandMention {
  brand: string;
  mentioned: boolean;
  frequency: number;
  context: string;
  sentiment?: string;
  evidence?: string[];
}

interface SourceCited {
  name: string;
  type: string;
  url: string | null;
  context: string;
  credibility: string;
}

interface QuestionAnalysis {
  questionId: string;
  question: string;
  category: string;
  summary: string;
  sentiment: string;
  confidenceScore: number;
  brandMentions: BrandMention[];
  sourcesCited?: SourceCited[];
  sources?: any[];
  multiModelAnalysis?: any[];
}

interface AnalysisResult {
  analysisId: string;
  timestamp: string;
  questions: QuestionAnalysis[];
  overallConfidence: number;
  totalSources: number;
  prioritySources: number;
  brandSummary: {
    targetBrands: BrandMention[];
    competitors: BrandMention[];
  };
}

interface Configuration {
  name: string;
  targetBrand?: string;
  brand?: string;
  competitorBrands?: string[];
  competitors?: string[];
  industry?: string;
}

class PDFService {

  /**
   * Genera un PDF profesional del análisis
   */
  async generateAnalysisPDF(analysisResult: AnalysisResult, configuration: Configuration): Promise<Buffer> {
    const html = this.buildHTMLReport(analysisResult, configuration);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        }
      });

      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }

  /**
   * Construye el HTML del informe con estilos profesionales
   */
  private buildHTMLReport(analysis: AnalysisResult, config: Configuration): string {
    // Debug: ver estructura de datos recibidos
    console.log('📊 PDF Config recibida:', JSON.stringify(config, null, 2).substring(0, 500));
    console.log('📊 PDF Analysis keys:', Object.keys(analysis || {}));
    // Ver estructura de la primera pregunta para debug
    if (analysis?.questions?.[0]) {
      console.log('📊 Primera pregunta keys:', Object.keys(analysis.questions[0]));
      console.log('📊 Tiene multiModelAnalysis:', !!analysis.questions[0].multiModelAnalysis);
      if (analysis.questions[0].multiModelAnalysis) {
        console.log('📊 multiModelAnalysis count:', analysis.questions[0].multiModelAnalysis.length);
        console.log('📊 multiModelAnalysis[0] keys:', Object.keys(analysis.questions[0].multiModelAnalysis[0] || {}));
        console.log('📊 multiModelAnalysis[0] response length:', (analysis.questions[0].multiModelAnalysis[0]?.response || '').length);
      }
    }

    // Extraer competidores de la configuración (puede venir como competitorBrands, competitors, o dentro de configuration)
    let competitorsList: string[] = [];
    if (config?.competitorBrands && Array.isArray(config.competitorBrands)) {
      competitorsList = config.competitorBrands;
    } else if (config?.competitors && Array.isArray(config.competitors)) {
      competitorsList = config.competitors;
    } else if ((config as any)?.configuration?.competitors) {
      competitorsList = (config as any).configuration.competitors;
    }

    // Asegurar valores por defecto para evitar errores de undefined
    const safeConfig = {
      name: config?.name || (config as any)?.configuration?.name || 'Análisis',
      targetBrand: config?.targetBrand || (config as any)?.brand || (config as any)?.configuration?.brand || 'Marca',
      competitorBrands: competitorsList,
      industry: config?.industry || (config as any)?.configuration?.industry || 'General'
    };

    console.log('📊 SafeConfig:', JSON.stringify(safeConfig, null, 2));

    // Asegurar valores por defecto para analysis
    const safeAnalysis = {
      ...analysis,
      analysisId: analysis?.analysisId || (analysis as any)?.id || 'N/A',
      questions: analysis?.questions || [],
      brandSummary: {
        targetBrands: analysis?.brandSummary?.targetBrands || [],
        competitors: analysis?.brandSummary?.competitors || []
      },
      overallConfidence: analysis?.overallConfidence || 0,
      timestamp: analysis?.timestamp || new Date().toISOString()
    };

    const date = new Date(safeAnalysis.timestamp);
    const formattedDate = date.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Calcular menciones desde las preguntas si brandSummary está vacío
    let allBrandMentions: BrandMention[] = [];

    // Primero intentar desde brandSummary
    if (safeAnalysis.brandSummary.targetBrands.length > 0 || safeAnalysis.brandSummary.competitors.length > 0) {
      allBrandMentions = [...safeAnalysis.brandSummary.targetBrands, ...safeAnalysis.brandSummary.competitors];
    } else {
      // Si brandSummary está vacío, extraer de las preguntas
      safeAnalysis.questions.forEach((q: any) => {
        if (q?.brandMentions && Array.isArray(q.brandMentions)) {
          allBrandMentions.push(...q.brandMentions);
        }
      });
    }

    // Calcular estadísticas
    const totalMentions = allBrandMentions.reduce((sum, b) => sum + (b?.frequency || 0), 0);
    const positiveMentions = allBrandMentions.filter(b => b?.context === 'positive' || b?.sentiment === 'positive').length;
    const negativeMentions = allBrandMentions.filter(b => b?.context === 'negative' || b?.sentiment === 'negative').length;

    // También contar sentimientos positivos/negativos desde las preguntas
    let positiveQuestions = 0;
    let negativeQuestions = 0;
    safeAnalysis.questions.forEach((q: any) => {
      if (q?.sentiment === 'positive' || q?.sentiment === 'muy_positivo') positiveQuestions++;
      if (q?.sentiment === 'negative' || q?.sentiment === 'muy_negativo') negativeQuestions++;
    });

    // Usar el mayor entre menciones de marca y preguntas
    const finalPositive = Math.max(positiveMentions, positiveQuestions);
    const finalNegative = Math.max(negativeMentions, negativeQuestions);

    console.log('📊 Estadísticas calculadas:', { totalMentions, positiveMentions, negativeMentions, positiveQuestions, negativeQuestions, competitorsCount: safeConfig.competitorBrands.length });

    // Agrupar preguntas por categoría
    const questionsByCategory = safeAnalysis.questions.reduce((acc, q) => {
      const category = q?.category || 'General';
      if (!acc[category]) acc[category] = [];
      acc[category].push(q);
      return acc;
    }, {} as Record<string, QuestionAnalysis[]>);

    return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Informe de Análisis - ${safeConfig.targetBrand}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 11px;
      line-height: 1.6;
      color: #1f2937;
      background: #ffffff;
    }

    .container {
      max-width: 100%;
      padding: 0;
    }

    /* Header */
    .header {
      background: linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #60a5fa 100%);
      color: white;
      padding: 30px 25px;
      margin: 0 0 30px 0;
      border-radius: 12px;
    }

    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .header h1 {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 8px;
      letter-spacing: -0.5px;
    }

    .header .subtitle {
      font-size: 14px;
      opacity: 0.9;
      font-weight: 400;
    }

    .header .brand-badge {
      background: rgba(255,255,255,0.2);
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 600;
      backdrop-filter: blur(10px);
    }

    .header .date {
      font-size: 12px;
      opacity: 0.8;
      margin-top: 15px;
    }

    /* Métricas principales */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
      margin-bottom: 30px;
    }

    .metric-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px;
      text-align: center;
    }

    .metric-card.primary {
      background: linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%);
      border-color: #93c5fd;
    }

    .metric-value {
      font-size: 32px;
      font-weight: 700;
      color: #1e40af;
      margin-bottom: 5px;
    }

    .metric-label {
      font-size: 11px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 500;
    }

    /* Secciones */
    .section {
      margin-bottom: 30px;
      page-break-inside: avoid;
    }

    .section-title {
      font-size: 16px;
      font-weight: 700;
      color: #1e40af;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 2px solid #3b82f6;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .section-title .icon {
      width: 24px;
      height: 24px;
      background: #3b82f6;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 14px;
    }

    /* Tabla de menciones */
    .mentions-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }

    .mentions-table th {
      background: #f1f5f9;
      padding: 12px 15px;
      text-align: left;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #475569;
      font-weight: 600;
      border-bottom: 2px solid #e2e8f0;
    }

    .mentions-table td {
      padding: 12px 15px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }

    .mentions-table tr:hover {
      background: #f8fafc;
    }

    .brand-name {
      font-weight: 600;
      color: #1f2937;
    }

    .brand-target {
      color: #1e40af;
    }

    .frequency-badge {
      display: inline-block;
      background: #dbeafe;
      color: #1e40af;
      padding: 4px 10px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 12px;
    }

    .sentiment-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .sentiment-positive {
      background: #dcfce7;
      color: #166534;
    }

    .sentiment-negative {
      background: #fee2e2;
      color: #991b1b;
    }

    .sentiment-neutral {
      background: #f3f4f6;
      color: #4b5563;
    }

    /* Cards de categorías */
    .category-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      margin-bottom: 20px;
      overflow: hidden;
      page-break-inside: avoid;
    }

    .category-header {
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      padding: 15px 20px;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .category-name {
      font-size: 14px;
      font-weight: 600;
      color: #1e40af;
    }

    .category-count {
      background: #3b82f6;
      color: white;
      padding: 4px 10px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
    }

    .question-item {
      padding: 15px 20px;
      border-bottom: 1px solid #f1f5f9;
    }

    .question-item:last-child {
      border-bottom: none;
    }

    .question-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 10px;
    }

    .question-text {
      font-size: 12px;
      font-weight: 500;
      color: #1f2937;
      flex: 1;
      padding-right: 15px;
    }

    .question-meta {
      display: flex;
      gap: 10px;
      align-items: center;
    }

    .confidence-pill {
      background: #f0fdf4;
      color: #166534;
      padding: 3px 8px;
      border-radius: 8px;
      font-size: 10px;
      font-weight: 600;
    }

    .confidence-low {
      background: #fef2f2;
      color: #991b1b;
    }

    .confidence-medium {
      background: #fffbeb;
      color: #92400e;
    }

    .question-response {
      font-size: 11px;
      color: #374151;
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      padding: 12px 15px;
      border-radius: 8px;
      margin-top: 12px;
      line-height: 1.6;
    }

    .question-response strong {
      color: #0369a1;
      display: block;
      margin-bottom: 8px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .response-content {
      color: #1f2937;
      white-space: pre-wrap;
    }

    .question-summary {
      font-size: 11px;
      color: #64748b;
      background: #f8fafc;
      padding: 10px 12px;
      border-radius: 8px;
      margin-top: 10px;
      line-height: 1.5;
    }

    .question-summary strong {
      color: #475569;
      margin-right: 5px;
    }

    .question-brands {
      margin-top: 10px;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }

    /* Respuestas generativas */
    .generative-responses {
      margin-top: 15px;
    }

    .generative-response-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      margin-bottom: 12px;
      overflow: hidden;
    }

    .generative-response-header {
      background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
      padding: 10px 15px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #e2e8f0;
    }

    .model-badge {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .model-icon {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      color: white;
    }

    .model-icon.chatgpt {
      background: linear-gradient(135deg, #10a37f 0%, #1a7f5a 100%);
    }

    .model-icon.claude {
      background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
    }

    .model-icon.gemini {
      background: linear-gradient(135deg, #4285f4 0%, #1a73e8 100%);
    }

    .model-icon.perplexity {
      background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
    }

    .model-name {
      font-weight: 600;
      font-size: 12px;
      color: #334155;
    }

    .model-provider {
      font-size: 10px;
      color: #64748b;
    }

    .char-count {
      background: #dbeafe;
      color: #1e40af;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 600;
    }

    .generative-response-content {
      padding: 15px;
    }

    .response-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #64748b;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .response-text {
      font-size: 11px;
      line-height: 1.7;
      color: #1f2937;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .question-brands strong {
      color: #475569;
      font-size: 10px;
      margin-right: 8px;
    }

    .brand-chip {
      background: #eff6ff;
      color: #1e40af;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 500;
    }

    /* Resumen ejecutivo */
    .executive-summary {
      background: linear-gradient(135deg, #fef3c7 0%, #fef9c3 100%);
      border: 1px solid #fcd34d;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 30px;
    }

    .executive-summary h3 {
      color: #92400e;
      font-size: 14px;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .executive-summary p {
      color: #78350f;
      font-size: 12px;
      line-height: 1.7;
    }

    /* Pie de página */
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      color: #94a3b8;
      font-size: 10px;
    }

    .footer .logo {
      font-weight: 700;
      color: #3b82f6;
      font-size: 12px;
      margin-bottom: 5px;
    }

    /* Barra de progreso */
    .progress-bar {
      width: 100%;
      height: 8px;
      background: #e2e8f0;
      border-radius: 4px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #3b82f6, #60a5fa);
      border-radius: 4px;
    }

    /* Gráfico de sentimientos */
    .sentiment-chart {
      display: flex;
      gap: 20px;
      margin-top: 15px;
    }

    .sentiment-bar {
      flex: 1;
      text-align: center;
    }

    .sentiment-bar-fill {
      height: 40px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 600;
      font-size: 14px;
    }

    .sentiment-bar-label {
      margin-top: 8px;
      font-size: 10px;
      color: #64748b;
    }

    /* Print styles */
    @media print {
      .header {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .category-card {
        break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <div class="header-content">
        <div>
          <h1>Informe de Análisis de Marca</h1>
          <p class="subtitle">Análisis de presencia en respuestas de IA Generativa</p>
          <p class="date">${formattedDate}</p>
        </div>
        <div class="brand-badge">
          ${safeConfig.targetBrand}
        </div>
      </div>
    </div>

    <!-- Métricas principales -->
    <div class="metrics-grid">
      <div class="metric-card primary">
        <div class="metric-value">${Math.round(safeAnalysis.overallConfidence * 100)}%</div>
        <div class="metric-label">Confianza General</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${safeAnalysis.questions.length}</div>
        <div class="metric-label">Preguntas Analizadas</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${totalMentions}</div>
        <div class="metric-label">Menciones Totales</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${safeConfig.competitorBrands.length}</div>
        <div class="metric-label">Competidores</div>
      </div>
    </div>

    <!-- Resumen ejecutivo -->
    <div class="executive-summary">
      <h3>Resumen Ejecutivo</h3>
      <p>
        Este análisis evaluó la presencia de <strong>${safeConfig.targetBrand}</strong> en ${safeAnalysis.questions.length} preguntas
        relacionadas con ${safeConfig.industry}. Se analizaron ${safeConfig.competitorBrands.length} competidores.
        ${totalMentions > 0 ? `Se detectaron ${totalMentions} menciones de marca en total.` : ''}
        El análisis identificó ${finalPositive} respuestas con sentimiento positivo y ${finalNegative} con sentimiento negativo.
        La confianza general del análisis es del ${Math.round(safeAnalysis.overallConfidence * 100)}%.
      </p>
    </div>

    <!-- Menciones de marca -->
    <div class="section">
      <h2 class="section-title">
        <span class="icon">T</span>
        Menciones de Marca
      </h2>

      ${safeAnalysis.brandSummary.targetBrands.length > 0 || safeAnalysis.brandSummary.competitors.length > 0 ? `
      <table class="mentions-table">
        <thead>
          <tr>
            <th>Marca</th>
            <th>Tipo</th>
            <th>Menciones</th>
            <th>Sentimiento</th>
          </tr>
        </thead>
        <tbody>
          ${safeAnalysis.brandSummary.targetBrands.map(brand => `
            <tr>
              <td><span class="brand-name brand-target">${brand?.brand || 'N/A'}</span></td>
              <td>Objetivo</td>
              <td><span class="frequency-badge">${brand?.frequency || 0}</span></td>
              <td><span class="sentiment-badge sentiment-${brand?.context || 'neutral'}">${this.translateSentiment(brand?.context || 'neutral')}</span></td>
            </tr>
          `).join('')}
          ${safeAnalysis.brandSummary.competitors.map(brand => `
            <tr>
              <td><span class="brand-name">${brand?.brand || 'N/A'}</span></td>
              <td>Competidor</td>
              <td><span class="frequency-badge">${brand?.frequency || 0}</span></td>
              <td><span class="sentiment-badge sentiment-${brand?.context || 'neutral'}">${this.translateSentiment(brand?.context || 'neutral')}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ` : '<p style="color: #64748b; text-align: center; padding: 20px;">No se detectaron menciones de marca en este análisis.</p>'}
    </div>

    <!-- Análisis por categoría -->
    <div class="section">
      <h2 class="section-title">
        <span class="icon">📋</span>
        Análisis Detallado por Categoría
      </h2>

      ${Object.entries(questionsByCategory).map(([category, questions]) => `
        <div class="category-card">
          <div class="category-header">
            <span class="category-name">${category}</span>
            <span class="category-count">${questions.length} pregunta${questions.length > 1 ? 's' : ''}</span>
          </div>
          ${questions.map(q => `
            <div class="question-item">
              <div class="question-header">
                <span class="question-text">${q?.question || 'Sin pregunta'}</span>
                <div class="question-meta">
                  <span class="sentiment-badge sentiment-${q?.sentiment || 'neutral'}">${this.translateSentiment(q?.sentiment || 'neutral')}</span>
                  <span class="confidence-pill ${(q?.confidenceScore || 0) < 0.5 ? 'confidence-low' : (q?.confidenceScore || 0) < 0.75 ? 'confidence-medium' : ''}">${Math.round((q?.confidenceScore || 0) * 100)}%</span>
                </div>
              </div>
              ${q?.summary ? `<div class="question-summary"><strong>Resumen:</strong> ${q.summary}</div>` : ''}
              ${q?.brandMentions && q.brandMentions.length > 0 ? `
                <div class="question-brands">
                  <strong>Marcas mencionadas:</strong>
                  ${q.brandMentions.filter(b => b?.mentioned).map(b => `
                    <span class="brand-chip">${b?.brand || 'N/A'} (${b?.frequency || 0})</span>
                  `).join('')}
                </div>
              ` : ''}
              ${q?.sources && q.sources.filter(s => s?.url && s.url !== 'ai-generated-response' && s.url !== 'generative-ai-response').length > 0 ? `
                <div class="sources-section" style="margin-top: 12px; padding: 10px; background: #f0f9ff; border-radius: 6px; border-left: 3px solid #0066cc;">
                  <strong style="color: #0066cc;">Fuentes Web Consultadas:</strong>
                  <div style="margin-top: 8px;">
                  ${q.sources.filter(s => s?.url && s.url !== 'ai-generated-response' && s.url !== 'generative-ai-response').map(s => `
                    <div style="margin-bottom: 8px; padding: 8px; background: white; border-radius: 4px; border: 1px solid #e0e0e0;">
                      <div style="font-weight: 600; color: #1a1a1a;">${s?.title || 'Sin título'}</div>
                      <div style="font-size: 11px; color: #666; margin: 2px 0;">
                        <span style="background: ${s?.isPriority ? '#dcfce7' : '#f3f4f6'}; color: ${s?.isPriority ? '#166534' : '#4b5563'}; padding: 2px 6px; border-radius: 3px; font-size: 10px;">
                          ${s?.isPriority ? 'Prioritaria' : 'General'}
                        </span>
                        <span style="margin-left: 8px;">${s?.domain || ''}</span>
                      </div>
                      <a href="${s?.url}" style="font-size: 11px; color: #0066cc; word-break: break-all;">${s?.url}</a>
                      ${s?.snippet ? `<div style="font-size: 11px; color: #555; margin-top: 4px; font-style: italic;">"${s.snippet.substring(0, 150)}${s.snippet.length > 150 ? '...' : ''}"</div>` : ''}
                    </div>
                  `).join('')}
                  </div>
                </div>
              ` : ''}
              ${this.buildGenerativeResponsesHTML(q)}
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>

    <!-- Configuración del análisis -->
    <div class="section">
      <h2 class="section-title">
        <span class="icon">*</span>
        Configuración del Análisis
      </h2>
      <table class="mentions-table">
        <tr>
          <td style="width: 150px; font-weight: 600;">Nombre del análisis</td>
          <td>${safeConfig.name}</td>
        </tr>
        <tr>
          <td style="font-weight: 600;">Marca objetivo</td>
          <td>${safeConfig.targetBrand}</td>
        </tr>
        <tr>
          <td style="font-weight: 600;">Competidores</td>
          <td>${safeConfig.competitorBrands.join(', ') || 'Ninguno'}</td>
        </tr>
        <tr>
          <td style="font-weight: 600;">Industria</td>
          <td>${safeConfig.industry}</td>
        </tr>
        <tr>
          <td style="font-weight: 600;">ID del análisis</td>
          <td style="font-family: monospace; font-size: 10px;">${safeAnalysis.analysisId || 'N/A'}</td>
        </tr>
      </table>
    </div>

    <!-- Footer -->
    <div class="footer">
      <div class="logo">Mediciones IA</div>
      <p>Informe generado automáticamente • ${formattedDate}</p>
      <p>Análisis de presencia de marca en respuestas de IA Generativa</p>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Traduce el sentimiento a español
   */
  private translateSentiment(sentiment: string): string {
    const translations: Record<string, string> = {
      'positive': 'Positivo',
      'negative': 'Negativo',
      'neutral': 'Neutral',
      'muy_positivo': 'Muy Positivo',
      'muy_negativo': 'Muy Negativo',
      'very_positive': 'Muy Positivo',
      'very_negative': 'Muy Negativo'
    };
    return translations[sentiment] || sentiment;
  }

  /**
   * Obtiene el nombre del modelo para mostrar
   */
  private getModelDisplayName(modelPersona: string): { name: string; provider: string; icon: string } {
    const models: Record<string, { name: string; provider: string; icon: string }> = {
      'chatgpt': { name: 'ChatGPT', provider: 'OpenAI', icon: 'G' },
      'claude': { name: 'Claude', provider: 'Anthropic', icon: 'C' },
      'gemini': { name: 'Gemini', provider: 'Google', icon: 'G' },
      'perplexity': { name: 'Perplexity', provider: 'Perplexity AI', icon: 'P' }
    };
    return models[modelPersona] || { name: modelPersona, provider: 'AI', icon: 'A' };
  }

  /**
   * Genera HTML para las respuestas generativas de una pregunta
   */
  private buildGenerativeResponsesHTML(question: any): string {
    // Primero intentar con multiModelAnalysis (nuevo formato)
    const multiModelAnalysis = question?.multiModelAnalysis;
    if (multiModelAnalysis && Array.isArray(multiModelAnalysis) && multiModelAnalysis.length > 0) {
      return this.buildMultiModelResponsesHTML(multiModelAnalysis);
    }

    // Si no hay multiModelAnalysis, buscar en sources (formato actual de la DB)
    const sources = question?.sources;
    if (sources && Array.isArray(sources)) {
      const generativeResponses = sources.filter((s: any) =>
        s?.url === 'generative-ai-response' ||
        s?.title?.startsWith('Respuesta Generativa:')
      );

      if (generativeResponses.length > 0) {
        return this.buildSourcesResponsesHTML(generativeResponses, question?.question);
      }
    }

    return '';
  }

  /**
   * Genera HTML para respuestas de multiModelAnalysis
   */
  private buildMultiModelResponsesHTML(multiModelAnalysis: any[]): string {
    return `
      <div class="generative-responses">
        <div class="response-label">Respuestas Generativas (${multiModelAnalysis.length})</div>
        ${multiModelAnalysis.map((analysis: any) => {
          const model = this.getModelDisplayName(analysis?.modelPersona || 'chatgpt');
          const response = analysis?.response || '';
          const charCount = response.length;

          return `
            <div class="generative-response-card">
              <div class="generative-response-header">
                <div class="model-badge">
                  <div class="model-icon ${analysis?.modelPersona || 'chatgpt'}">${model.icon}</div>
                  <div>
                    <div class="model-name">${model.name}</div>
                    <div class="model-provider">${model.provider}</div>
                  </div>
                </div>
                <span class="char-count">${charCount.toLocaleString()} caracteres</span>
              </div>
              <div class="generative-response-content">
                <div class="response-text">${response.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  /**
   * Genera HTML para respuestas desde sources (formato de la DB)
   */
  private buildSourcesResponsesHTML(sources: any[], questionText?: string): string {
    return `
      <div class="generative-responses">
        <div class="response-label">Respuestas Generativas (${sources.length})</div>
        ${sources.map((source: any) => {
          // Parsear el modelo desde domain (ej: "ChatGPT/OpenAI")
          const domain = source?.domain || 'ChatGPT/OpenAI';
          const [modelName, provider] = domain.split('/');
          const modelPersona = modelName?.toLowerCase().replace('gpt', 'chatgpt') || 'chatgpt';
          const model = this.getModelDisplayName(modelPersona);

          // Usar fullContent si está disponible, sino snippet
          const response = source?.fullContent || source?.snippet || '';
          const charCount = response.length;

          return `
            <div class="generative-response-card">
              <div class="generative-response-header">
                <div class="model-badge">
                  <div class="model-icon ${modelPersona}">${model.icon}</div>
                  <div>
                    <div class="model-name">${modelName || model.name}</div>
                    <div class="model-provider">${provider || model.provider}</div>
                  </div>
                </div>
                <span class="char-count">${charCount.toLocaleString()} caracteres</span>
              </div>
              <div class="generative-response-content">
                <div class="response-text">${response.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }
}

export const pdfService = new PDFService();
export default PDFService;

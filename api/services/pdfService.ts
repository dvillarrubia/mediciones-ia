/**
 * Servicio para generacion de informes PDF simplificados
 * Usa Puppeteer para renderizar HTML a PDF
 * Updated: 2026-02-03 - Simplificado por peticion del usuario
 */
import puppeteer from 'puppeteer';

interface BrandMention {
  brand: string;
  mentioned: boolean;
  frequency: number;
  context: string;
  sentiment?: string;
  evidence?: string[];
  appearanceOrder?: number;
  isDiscovered?: boolean;
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
    otherCompetitors?: BrandMention[];
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
   * Genera un PDF profesional del analisis
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
   * Construye el HTML del informe simplificado
   */
  private buildHTMLReport(analysis: AnalysisResult, config: Configuration): string {
    // Extraer configuracion
    let competitorsList: string[] = [];
    if (config?.competitorBrands && Array.isArray(config.competitorBrands)) {
      competitorsList = config.competitorBrands;
    } else if (config?.competitors && Array.isArray(config.competitors)) {
      competitorsList = config.competitors;
    } else if ((config as any)?.configuration?.competitors) {
      competitorsList = (config as any).configuration.competitors;
    }

    const safeConfig = {
      name: config?.name || (config as any)?.configuration?.name || 'Analisis',
      targetBrand: config?.targetBrand || (config as any)?.brand || (config as any)?.configuration?.brand || 'Marca',
      competitorBrands: competitorsList,
      industry: config?.industry || (config as any)?.configuration?.industry || 'General'
    };

    const safeAnalysis = {
      ...analysis,
      analysisId: analysis?.analysisId || (analysis as any)?.id || 'N/A',
      questions: analysis?.questions || [],
      brandSummary: {
        targetBrands: analysis?.brandSummary?.targetBrands || [],
        competitors: analysis?.brandSummary?.competitors || [],
        otherCompetitors: analysis?.brandSummary?.otherCompetitors || []
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

    return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Informe de Analisis - ${safeConfig.targetBrand}</title>
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
    }

    .header .subtitle {
      font-size: 14px;
      opacity: 0.9;
    }

    .header .brand-badge {
      background: rgba(255,255,255,0.2);
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 600;
    }

    .header .date {
      font-size: 12px;
      opacity: 0.8;
      margin-top: 15px;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
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
    }

    .question-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      margin-bottom: 25px;
      overflow: hidden;
      page-break-inside: avoid;
    }

    .question-header {
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      padding: 15px 20px;
      border-bottom: 1px solid #e2e8f0;
    }

    .question-text {
      font-size: 14px;
      font-weight: 600;
      color: #1e40af;
    }

    .question-category {
      font-size: 11px;
      color: #64748b;
      margin-top: 5px;
    }

    .question-body {
      padding: 20px;
    }

    /* Respuesta del LLM */
    .llm-response {
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 20px;
    }

    .llm-response-title {
      font-size: 12px;
      font-weight: 600;
      color: #0369a1;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .llm-response-text {
      font-size: 11px;
      line-height: 1.7;
      color: #1f2937;
      white-space: pre-wrap;
      word-break: break-word;
    }

    /* Tabla de ranking */
    .ranking-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }

    .ranking-table th {
      background: #f1f5f9;
      padding: 10px 12px;
      text-align: left;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #475569;
      font-weight: 600;
      border-bottom: 2px solid #e2e8f0;
    }

    .ranking-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #f1f5f9;
      font-size: 11px;
    }

    .position-badge {
      display: inline-block;
      width: 24px;
      height: 24px;
      line-height: 24px;
      text-align: center;
      border-radius: 50%;
      font-weight: 700;
      font-size: 11px;
      color: white;
    }

    .position-1 { background: #f59e0b; }
    .position-2 { background: #6b7280; }
    .position-3 { background: #b45309; }
    .position-other { background: #94a3b8; }

    .type-objetivo { color: #1e40af; font-weight: 600; }
    .type-competidor { color: #ea580c; font-weight: 600; }
    .type-descubierto { color: #7c3aed; font-weight: 600; }

    .sentiment-positive { color: #166534; }
    .sentiment-negative { color: #991b1b; }
    .sentiment-neutral { color: #4b5563; }

    /* Fuentes */
    .sources-list {
      background: #fafafa;
      border: 1px solid #e5e5e5;
      border-radius: 8px;
      padding: 15px;
    }

    .sources-title {
      font-size: 12px;
      font-weight: 600;
      color: #374151;
      margin-bottom: 10px;
    }

    .source-item {
      font-size: 10px;
      color: #0066cc;
      margin-bottom: 6px;
      word-break: break-all;
    }

    .source-item a {
      color: #0066cc;
      text-decoration: none;
    }

    .no-data {
      color: #9ca3af;
      font-style: italic;
      font-size: 11px;
    }

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

    @media print {
      .header {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .question-card {
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
          <h1>Informe de Analisis de Marca</h1>
          <p class="subtitle">Analisis de presencia en respuestas de IA Generativa</p>
          <p class="date">${formattedDate}</p>
        </div>
        <div class="brand-badge">
          ${safeConfig.targetBrand}
        </div>
      </div>
    </div>

    <!-- Metricas principales -->
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
        <div class="metric-value">${safeConfig.competitorBrands.length}</div>
        <div class="metric-label">Competidores</div>
      </div>
    </div>

    <!-- Preguntas -->
    <div class="section">
      <h2 class="section-title">Analisis por Pregunta</h2>

      ${safeAnalysis.questions.map((q, index) => this.buildQuestionHTML(q, index + 1, safeConfig.targetBrand, safeConfig.competitorBrands)).join('')}
    </div>

    <!-- Footer -->
    <div class="footer">
      <div class="logo">Mediciones IA</div>
      <p>Informe generado automaticamente - ${formattedDate}</p>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Construye el HTML para una pregunta individual
   */
  private buildQuestionHTML(question: any, questionNumber: number, targetBrand: string, competitors: string[]): string {
    // 1. Obtener respuesta del LLM
    const llmResponse = this.getLLMResponse(question);

    // 2. Obtener ranking de marcas por orden de aparicion
    const brandRanking = this.getBrandRanking(question, targetBrand, competitors);

    // 3. Obtener fuentes web (filtrar ai-generated)
    const webSources = this.getWebSources(question);

    return `
      <div class="question-card">
        <div class="question-header">
          <div class="question-text">${questionNumber}. ${question?.question || 'Sin pregunta'}</div>
          <div class="question-category">Categoria: ${question?.category || 'General'}</div>
        </div>
        <div class="question-body">

          <!-- Respuesta Completa del LLM -->
          <div class="llm-response">
            <div class="llm-response-title">Respuesta Completa del LLM</div>
            <div class="llm-response-text">${llmResponse ? this.escapeHtml(llmResponse) : '<span class="no-data">No hay respuesta disponible</span>'}</div>
          </div>

          <!-- Ranking por Orden de Aparicion -->
          ${brandRanking.length > 0 ? `
          <div style="margin-bottom: 20px;">
            <div style="font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 10px;">Ranking por Orden de Aparicion</div>
            <table class="ranking-table">
              <thead>
                <tr>
                  <th>Posicion</th>
                  <th>Marca</th>
                  <th>Tipo</th>
                  <th>Sentimiento</th>
                </tr>
              </thead>
              <tbody>
                ${brandRanking.map((brand, idx) => `
                  <tr>
                    <td><span class="position-badge position-${idx < 3 ? idx + 1 : 'other'}">${idx + 1}</span></td>
                    <td><strong>${brand.brand}</strong></td>
                    <td><span class="type-${brand.type.toLowerCase()}">${brand.type}</span></td>
                    <td><span class="sentiment-${brand.sentiment}">${this.translateSentiment(brand.sentiment)}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          ` : '<div class="no-data" style="margin-bottom: 20px;">No se detectaron marcas en esta respuesta</div>'}

          <!-- Fuentes Web -->
          ${webSources.length > 0 ? `
          <div class="sources-list">
            <div class="sources-title">Fuentes Web (${webSources.length})</div>
            ${webSources.map(url => `<div class="source-item"><a href="${url}">${url}</a></div>`).join('')}
          </div>
          ` : '<div class="no-data">No hay fuentes web disponibles</div>'}

        </div>
      </div>
    `;
  }

  /**
   * Obtiene la respuesta del LLM desde multiModelAnalysis[0].response
   */
  private getLLMResponse(question: any): string | null {
    // Intentar obtener de multiModelAnalysis
    if (question?.multiModelAnalysis && Array.isArray(question.multiModelAnalysis) && question.multiModelAnalysis.length > 0) {
      return question.multiModelAnalysis[0]?.response || null;
    }

    // Fallback: buscar en sources con tipo generative
    if (question?.sources && Array.isArray(question.sources)) {
      const generativeSource = question.sources.find((s: any) =>
        s?.url === 'generative-ai-response' ||
        s?.title?.startsWith('Respuesta Generativa:')
      );
      if (generativeSource) {
        return generativeSource?.fullContent || generativeSource?.snippet || null;
      }
    }

    return null;
  }

  /**
   * Obtiene el ranking de marcas ordenado por appearanceOrder
   */
  private getBrandRanking(question: any, targetBrand: string, competitors: string[]): Array<{brand: string; type: string; sentiment: string}> {
    const brandMentions = question?.brandMentions;
    if (!brandMentions || !Array.isArray(brandMentions)) {
      return [];
    }

    // Filtrar solo las que fueron mencionadas y ordenar por appearanceOrder
    const mentionedBrands = brandMentions
      .filter((b: any) => b?.mentioned)
      .sort((a: any, b: any) => (a?.appearanceOrder || 999) - (b?.appearanceOrder || 999));

    return mentionedBrands.map((b: any) => {
      // Determinar tipo
      let type = 'Descubierto';
      const brandName = (b?.brand || '').toLowerCase();

      if (brandName === targetBrand.toLowerCase()) {
        type = 'Objetivo';
      } else if (competitors.some(c => c.toLowerCase() === brandName)) {
        type = 'Competidor';
      } else if (b?.isDiscovered) {
        type = 'Descubierto';
      }

      return {
        brand: b?.brand || 'N/A',
        type,
        sentiment: b?.sentiment || b?.context || 'neutral'
      };
    });
  }

  /**
   * Obtiene las URLs de fuentes web (excluyendo ai-generated)
   */
  private getWebSources(question: any): string[] {
    const sources = question?.sources;
    if (!sources || !Array.isArray(sources)) {
      return [];
    }

    return sources
      .filter((s: any) => {
        const url = s?.url;
        return url &&
               typeof url === 'string' &&
               url !== 'ai-generated' &&
               url !== 'ai-generated-response' &&
               url !== 'generative-ai-response' &&
               url.startsWith('http');
      })
      .map((s: any) => s.url);
  }

  /**
   * Escapa HTML para evitar XSS
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/\n/g, '<br>');
  }

  /**
   * Traduce el sentimiento a espanol
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
    return translations[sentiment] || sentiment || 'Neutral';
  }
}

export const pdfService = new PDFService();
export default PDFService;

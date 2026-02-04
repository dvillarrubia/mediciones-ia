/**
 * Excel Export Service - Simplificado
 * Genera reportes Excel con la informacion esencial del analisis
 */
import ExcelJS from 'exceljs';

interface BrandMention {
  brand: string;
  mentioned: boolean;
  frequency: number;
  confidence?: number;
  sentiment?: string;
  detailedSentiment?: string;
  context?: string;
  appearanceOrder?: number;
  isDiscovered?: boolean;
}

interface WebSource {
  url: string;
  title?: string;
  domain?: string;
  snippet?: string;
}

interface MultiModelAnalysis {
  modelPersona: string;
  response: string;
}

interface QuestionData {
  questionId: string;
  question: string;
  category?: string;
  brandMentions?: BrandMention[];
  sources?: WebSource[];
  multiModelAnalysis?: MultiModelAnalysis[];
}

interface AnalysisResult {
  analysisId: string;
  timestamp: string;
  overallConfidence: number;
  brandSummary: any;
  questions: QuestionData[];
}

interface ExcelConfiguration {
  targetBrand?: string;
  competitorBrands?: string[];
}

class ExcelService {
  /**
   * Genera un archivo Excel simplificado con 3 hojas:
   * 1. Respuestas LLM - Respuesta completa por pregunta
   * 2. Ranking Marcas - Orden de aparicion con tipo y sentimiento
   * 3. Fuentes Web - Lista simple de URLs
   */
  async generateAdvancedExcelReport(
    analysis: AnalysisResult,
    configuration?: ExcelConfiguration
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    workbook.creator = 'Mediciones IA';
    workbook.created = new Date();
    workbook.modified = new Date();

    // Crear las 3 hojas simplificadas
    this.createLLMResponseSheet(workbook, analysis);
    this.createBrandRankingSheet(workbook, analysis, configuration);
    this.createSourcesSheet(workbook, analysis);

    return await workbook.xlsx.writeBuffer() as Buffer;
  }

  /**
   * Hoja 1: Respuestas Completas del LLM
   */
  private createLLMResponseSheet(
    workbook: ExcelJS.Workbook,
    analysis: AnalysisResult
  ) {
    const sheet = workbook.addWorksheet('Respuestas LLM', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
    });

    // Headers
    sheet.getRow(1).values = ['Pregunta', 'Respuesta Completa del LLM'];
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4788' }
    };

    let row = 2;
    analysis.questions.forEach(question => {
      // Obtener respuesta del LLM desde multiModelAnalysis[0].response
      const llmResponse = question.multiModelAnalysis?.[0]?.response || 'Sin respuesta disponible';

      sheet.getRow(row).values = [
        question.question,
        llmResponse
      ];

      // Ajustar altura de fila para texto largo
      sheet.getRow(row).height = Math.min(400, Math.max(60, llmResponse.length / 3));
      sheet.getRow(row).alignment = { vertical: 'top', wrapText: true };

      row++;
    });

    // Ajustar anchos de columna
    sheet.getColumn(1).width = 50;
    sheet.getColumn(2).width = 100;
  }

  /**
   * Hoja 2: Ranking de Marcas por Orden de Aparicion
   */
  private createBrandRankingSheet(
    workbook: ExcelJS.Workbook,
    analysis: AnalysisResult,
    configuration?: ExcelConfiguration
  ) {
    const sheet = workbook.addWorksheet('Ranking Marcas', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
    });

    // Headers simplificados
    sheet.getRow(1).values = ['Pregunta', 'Posicion', 'Marca', 'Tipo', 'Sentimiento'];
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4788' }
    };

    // Colores por tipo
    const typeColors: Record<string, string> = {
      'Objetivo': 'FF1F4788',
      'Competidor': 'FFFF8C00',
      'Descubierto': 'FF7C3AED'
    };

    let row = 2;
    analysis.questions.forEach(question => {
      if (!question.brandMentions || question.brandMentions.length === 0) {
        return;
      }

      // Filtrar solo marcas mencionadas y ordenar por appearanceOrder
      const mentionedBrands = question.brandMentions
        .filter(b => b.mentioned)
        .sort((a, b) => {
          const orderA = a.appearanceOrder ?? 999;
          const orderB = b.appearanceOrder ?? 999;
          return orderA - orderB;
        });

      mentionedBrands.forEach(brand => {
        // Determinar tipo de marca
        let tipo = 'Descubierto';
        if (brand.isDiscovered === false) {
          if (configuration?.targetBrand?.toLowerCase() === brand.brand.toLowerCase()) {
            tipo = 'Objetivo';
          } else if (configuration?.competitorBrands?.some(c => c.toLowerCase() === brand.brand.toLowerCase())) {
            tipo = 'Competidor';
          }
        } else if (brand.isDiscovered === true) {
          tipo = 'Descubierto';
        } else {
          // Inferir tipo si no hay flag isDiscovered
          if (configuration?.targetBrand?.toLowerCase() === brand.brand.toLowerCase()) {
            tipo = 'Objetivo';
          } else if (configuration?.competitorBrands?.some(c => c.toLowerCase() === brand.brand.toLowerCase())) {
            tipo = 'Competidor';
          }
        }

        // Normalizar sentimiento - usar detailedSentiment primero (igual que UI)
        const sentimiento = this.normalizeSentiment(brand.detailedSentiment || brand.sentiment || brand.context);

        sheet.getRow(row).values = [
          question.question.substring(0, 100) + (question.question.length > 100 ? '...' : ''),
          brand.appearanceOrder || '-',
          brand.brand,
          tipo,
          sentimiento
        ];

        // Color de texto para tipo
        const tipoCell = sheet.getCell(`D${row}`);
        tipoCell.font = { bold: true, color: { argb: typeColors[tipo] || 'FF000000' } };

        // Color de sentimiento
        const sentimientoCell = sheet.getCell(`E${row}`);
        if (sentimiento.toLowerCase().includes('positiv')) {
          sentimientoCell.font = { color: { argb: 'FF008000' } };
        } else if (sentimiento.toLowerCase().includes('negativ')) {
          sentimientoCell.font = { color: { argb: 'FFFF0000' } };
        }

        row++;
      });
    });

    // Si no hay datos
    if (row === 2) {
      sheet.getRow(2).values = ['No se encontraron menciones de marcas', '', '', '', ''];
    }

    // Ajustar anchos
    sheet.getColumn(1).width = 60;
    sheet.getColumn(2).width = 12;
    sheet.getColumn(3).width = 25;
    sheet.getColumn(4).width = 15;
    sheet.getColumn(5).width = 15;
  }

  /**
   * Hoja 3: Fuentes Web (URLs simples)
   */
  private createSourcesSheet(
    workbook: ExcelJS.Workbook,
    analysis: AnalysisResult
  ) {
    const sheet = workbook.addWorksheet('Fuentes Web', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
    });

    // Headers simples
    sheet.getRow(1).values = ['Pregunta', 'URL'];
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4788' }
    };

    let row = 2;
    analysis.questions.forEach(question => {
      if (!question.sources || question.sources.length === 0) {
        return;
      }

      // Filtrar URLs reales (excluir sinteticas)
      // Consistente con filtrado en AnalysisResultsViewer.tsx
      const realSources = question.sources.filter(source => {
        if (!source.url) return false;
        // Filtro igual que UI: excluir URLs sinteticas
        if (source.url.includes('ai-generated')) return false;
        if (source.url.includes('generative')) return false;
        if (source.url === 'N/A') return false;
        // Solo URLs HTTP reales
        return source.url.startsWith('http://') || source.url.startsWith('https://');
      });

      realSources.forEach(source => {
        sheet.getRow(row).values = [
          question.question.substring(0, 80) + (question.question.length > 80 ? '...' : ''),
          source.url
        ];

        // Hacer URL clicable
        const urlCell = sheet.getCell(`B${row}`);
        urlCell.value = {
          text: source.url,
          hyperlink: source.url
        };
        urlCell.font = { color: { argb: 'FF0066CC' }, underline: true };

        row++;
      });
    });

    // Si no hay fuentes
    if (row === 2) {
      sheet.getRow(2).values = ['No se encontraron fuentes web reales', ''];
      sheet.mergeCells('A2:B2');
    }

    // Ajustar anchos
    sheet.getColumn(1).width = 50;
    sheet.getColumn(2).width = 80;
  }

  /**
   * Normaliza el sentimiento a un formato legible
   */
  private normalizeSentiment(sentiment?: string): string {
    if (!sentiment) return 'Neutral';

    const s = sentiment.toLowerCase();
    if (s.includes('very_positive') || s.includes('muy_positiv')) return 'Muy Positivo';
    if (s.includes('positive') || s.includes('positiv')) return 'Positivo';
    if (s.includes('very_negative') || s.includes('muy_negativ')) return 'Muy Negativo';
    if (s.includes('negative') || s.includes('negativ')) return 'Negativo';
    if (s.includes('neutral')) return 'Neutral';

    // Si es un valor directo como "positive", "negative", etc.
    return sentiment.charAt(0).toUpperCase() + sentiment.slice(1);
  }
}

export const excelService = new ExcelService();

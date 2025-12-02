/**
 * Excel Export Service - Genera reportes Excel avanzados con múltiples hojas
 */
import ExcelJS from 'exceljs';

interface AnalysisResult {
  analysisId: string;
  timestamp: string;
  overallConfidence: number;
  brandSummary: Array<{
    brand: string;
    mentioned: boolean;
    frequency: number;
    averageConfidence: number;
    sentiment?: string;
    contexts: string[];
  }>;
  questions: Array<{
    questionId: string;
    question: string;
    category?: string;
    brandMentions?: Array<{
      brand: string;
      mentioned: boolean;
      frequency: number;
      confidence: number;
      sentiment?: string;
      context?: string;
    }>;
  }>;
}

interface ExcelConfiguration {
  targetBrand?: string;
  competitorBrands?: string[];
  templateName?: string;
}

class ExcelService {
  /**
   * Genera un archivo Excel completo con múltiples hojas
   */
  async generateAdvancedExcelReport(
    analysis: AnalysisResult,
    configuration?: ExcelConfiguration
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    // Metadata del workbook
    workbook.creator = 'Mediciones IA';
    workbook.created = new Date();
    workbook.modified = new Date();

    // Crear hojas
    await this.createSummarySheet(workbook, analysis, configuration);
    await this.createBrandDetailsSheet(workbook, analysis, configuration);
    await this.createQuestionDetailsSheet(workbook, analysis);
    await this.createRawDataSheet(workbook, analysis);

    // Generar buffer
    return await workbook.xlsx.writeBuffer() as Buffer;
  }

  /**
   * Hoja 1: Resumen Ejecutivo
   */
  private async createSummarySheet(
    workbook: ExcelJS.Workbook,
    analysis: AnalysisResult,
    configuration?: ExcelConfiguration
  ) {
    const sheet = workbook.addWorksheet('Resumen', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
    });

    // Título
    sheet.getCell('A1').value = 'Resumen Ejecutivo del Análisis';
    sheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF1F4788' } };
    sheet.mergeCells('A1:D1');

    // Información general
    let row = 3;
    this.addHeaderRow(sheet, row++, 'Información General');
    this.addDataRow(sheet, row++, 'ID de Análisis:', analysis.analysisId);
    this.addDataRow(sheet, row++, 'Fecha:', new Date(analysis.timestamp).toLocaleString('es-ES'));
    this.addDataRow(sheet, row++, 'Confianza General:', `${(analysis.overallConfidence * 100).toFixed(1)}%`);

    if (configuration?.targetBrand) {
      this.addDataRow(sheet, row++, 'Marca Objetivo:', configuration.targetBrand);
    }
    if (configuration?.templateName) {
      this.addDataRow(sheet, row++, 'Plantilla:', configuration.templateName);
    }
    this.addDataRow(sheet, row++, 'Total Preguntas:', analysis.questions.length.toString());

    // Menciones de marca
    row += 2;
    this.addHeaderRow(sheet, row++, 'Top 10 Marcas Mencionadas');

    // Headers de tabla
    sheet.getRow(row).values = ['Marca', 'Menciones', '% Frecuencia', 'Confianza', 'Sentimiento'];
    sheet.getRow(row).font = { bold: true };
    sheet.getRow(row).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE7E6E6' }
    };
    row++;

    // Datos de marcas (top 10)
    const topBrands = analysis.brandSummary
      .filter(b => b.mentioned)
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);

    const totalMentions = analysis.brandSummary.reduce((sum, b) => sum + b.frequency, 0);

    topBrands.forEach(brand => {
      const percentage = totalMentions > 0 ? (brand.frequency / totalMentions) * 100 : 0;
      sheet.getRow(row).values = [
        brand.brand,
        brand.frequency,
        `${percentage.toFixed(1)}%`,
        `${(brand.averageConfidence * 100).toFixed(1)}%`,
        brand.sentiment || 'N/A'
      ];

      // Color de sentimiento
      const sentimentCell = sheet.getCell(`E${row}`);
      if (brand.sentiment?.toLowerCase().includes('positiv')) {
        sentimentCell.font = { color: { argb: 'FF008000' } };
      } else if (brand.sentiment?.toLowerCase().includes('negativ')) {
        sentimentCell.font = { color: { argb: 'FFFF0000' } };
      }

      row++;
    });

    // Ajustar anchos de columna
    sheet.getColumn(1).width = 30;
    sheet.getColumn(2).width = 15;
    sheet.getColumn(3).width = 15;
    sheet.getColumn(4).width = 15;
    sheet.getColumn(5).width = 20;
  }

  /**
   * Hoja 2: Detalles de Marcas
   */
  private async createBrandDetailsSheet(
    workbook: ExcelJS.Workbook,
    analysis: AnalysisResult,
    configuration?: ExcelConfiguration
  ) {
    const sheet = workbook.addWorksheet('Marcas', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
    });

    // Headers
    sheet.getRow(1).values = [
      'Marca',
      'Mencionada',
      'Frecuencia',
      'Confianza Promedio',
      'Sentimiento',
      'Contextos'
    ];
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4788' }
    };

    // Datos
    let row = 2;
    const sortedBrands = analysis.brandSummary.sort((a, b) => b.frequency - a.frequency);

    sortedBrands.forEach(brand => {
      sheet.getRow(row).values = [
        brand.brand,
        brand.mentioned ? 'Sí' : 'No',
        brand.frequency,
        `${(brand.averageConfidence * 100).toFixed(1)}%`,
        brand.sentiment || 'N/A',
        brand.contexts.join(', ')
      ];

      // Color si es marca objetivo
      if (configuration?.targetBrand === brand.brand) {
        sheet.getRow(row).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFF4CC' }
        };
      }

      row++;
    });

    // Ajustar anchos
    sheet.getColumn(1).width = 25;
    sheet.getColumn(2).width = 12;
    sheet.getColumn(3).width = 12;
    sheet.getColumn(4).width = 18;
    sheet.getColumn(5).width = 15;
    sheet.getColumn(6).width = 50;
  }

  /**
   * Hoja 3: Detalles por Pregunta
   */
  private async createQuestionDetailsSheet(
    workbook: ExcelJS.Workbook,
    analysis: AnalysisResult
  ) {
    const sheet = workbook.addWorksheet('Preguntas', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
    });

    // Headers
    sheet.getRow(1).values = [
      'ID',
      'Pregunta',
      'Categoría',
      'Marca',
      'Mencionada',
      'Frecuencia',
      'Confianza',
      'Sentimiento',
      'Contexto'
    ];
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4788' }
    };

    // Datos
    let row = 2;
    analysis.questions.forEach(question => {
      if (question.brandMentions && question.brandMentions.length > 0) {
        question.brandMentions.forEach(mention => {
          sheet.getRow(row).values = [
            question.questionId,
            question.question,
            question.category || 'Sin categoría',
            mention.brand,
            mention.mentioned ? 'Sí' : 'No',
            mention.frequency,
            `${(mention.confidence * 100).toFixed(1)}%`,
            mention.sentiment || 'N/A',
            mention.context || ''
          ];
          row++;
        });
      } else {
        // Pregunta sin menciones
        sheet.getRow(row).values = [
          question.questionId,
          question.question,
          question.category || 'Sin categoría',
          '-',
          'No',
          0,
          '0%',
          'N/A',
          ''
        ];
        row++;
      }
    });

    // Ajustar anchos
    sheet.getColumn(1).width = 12;
    sheet.getColumn(2).width = 50;
    sheet.getColumn(3).width = 20;
    sheet.getColumn(4).width = 25;
    sheet.getColumn(5).width = 12;
    sheet.getColumn(6).width = 12;
    sheet.getColumn(7).width = 12;
    sheet.getColumn(8).width = 15;
    sheet.getColumn(9).width = 40;
  }

  /**
   * Hoja 4: Datos en Bruto (JSON)
   */
  private async createRawDataSheet(
    workbook: ExcelJS.Workbook,
    analysis: AnalysisResult
  ) {
    const sheet = workbook.addWorksheet('Datos Brutos');

    sheet.getCell('A1').value = 'Datos en formato JSON';
    sheet.getCell('A1').font = { size: 14, bold: true };

    sheet.getCell('A3').value = JSON.stringify(analysis, null, 2);
    sheet.getCell('A3').alignment = { vertical: 'top', wrapText: false };
    sheet.getCell('A3').font = { name: 'Courier New', size: 10 };

    sheet.getColumn(1).width = 120;
  }

  /**
   * Helpers para formateo
   */
  private addHeaderRow(sheet: ExcelJS.Worksheet, row: number, text: string) {
    sheet.getCell(`A${row}`).value = text;
    sheet.getCell(`A${row}`).font = { size: 14, bold: true, color: { argb: 'FF1F4788' } };
    sheet.mergeCells(`A${row}:D${row}`);
  }

  private addDataRow(sheet: ExcelJS.Worksheet, row: number, label: string, value: string) {
    sheet.getCell(`A${row}`).value = label;
    sheet.getCell(`A${row}`).font = { bold: true };
    sheet.getCell(`B${row}`).value = value;
    sheet.mergeCells(`B${row}:D${row}`);
  }
}

export const excelService = new ExcelService();

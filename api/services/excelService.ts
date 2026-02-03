/**
 * Excel Export Service - Genera reportes Excel avanzados con múltiples hojas
 */
import ExcelJS from 'exceljs';

interface SourceCited {
  name: string;
  type: string;
  url: string | null;
  context: string;
  credibility: string;
}

interface BrandInfo {
  brand: string;
  mentioned: boolean;
  frequency: number;
  averageConfidence?: number;
  confidence?: number;
  sentiment?: string;
  context?: string;
  contexts?: string[];
  evidence?: string[];
  // Nuevos campos para tracking de aparicion
  appearanceOrder?: number;
  isDiscovered?: boolean;
}

interface AnalysisResult {
  analysisId: string;
  timestamp: string;
  overallConfidence: number;
  brandSummary: {
    targetBrands?: BrandInfo[];
    competitors?: BrandInfo[];
    otherCompetitors?: BrandInfo[];  // Competidores descubiertos por IA
  } | BrandInfo[]; // Soporta ambos formatos
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
    sourcesCited?: SourceCited[];
  }>;
}

interface ExcelConfiguration {
  targetBrand?: string;
  competitorBrands?: string[];
  templateName?: string;
}

class ExcelService {
  /**
   * Normaliza brandSummary a un array plano de marcas
   */
  private normalizeBrandSummary(brandSummary: AnalysisResult['brandSummary']): BrandInfo[] {
    if (Array.isArray(brandSummary)) {
      return brandSummary;
    }
    // Es un objeto con targetBrands, competitors y otherCompetitors
    const allBrands: BrandInfo[] = [];
    if (brandSummary.targetBrands) {
      allBrands.push(...brandSummary.targetBrands);
    }
    if (brandSummary.competitors) {
      allBrands.push(...brandSummary.competitors);
    }
    if (brandSummary.otherCompetitors) {
      allBrands.push(...brandSummary.otherCompetitors);
    }
    return allBrands;
  }

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
    await this.createSourcesCitedSheet(workbook, analysis);
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
    const allBrands = this.normalizeBrandSummary(analysis.brandSummary);
    const topBrands = allBrands
      .filter(b => b.mentioned)
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);

    const totalMentions = allBrands.reduce((sum, b) => sum + b.frequency, 0);

    topBrands.forEach(brand => {
      const percentage = totalMentions > 0 ? (brand.frequency / totalMentions) * 100 : 0;
      const confidence = brand.averageConfidence ?? brand.confidence ?? 0;
      sheet.getRow(row).values = [
        brand.brand,
        brand.frequency,
        `${percentage.toFixed(1)}%`,
        `${(confidence * 100).toFixed(1)}%`,
        brand.sentiment || brand.context || 'N/A'
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
   * Hoja 2: Detalles de Marcas (con Tipo y Orden de Aparicion)
   */
  private async createBrandDetailsSheet(
    workbook: ExcelJS.Workbook,
    analysis: AnalysisResult,
    configuration?: ExcelConfiguration
  ) {
    const sheet = workbook.addWorksheet('Marcas', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
    });

    // Headers actualizados con Tipo y Orden
    sheet.getRow(1).values = [
      'Marca',
      'Tipo',
      'Orden',
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

    // Colores por tipo
    const typeColors = {
      objetivo: 'FF1F4788',     // Azul
      competidor: 'FFFF8C00',   // Naranja
      descubierto: 'FF7C3AED'   // Morado
    };

    const bgColors = {
      objetivo: 'FFE8F0FE',     // Azul claro
      competidor: 'FFFFF4E6',   // Naranja claro
      descubierto: 'FFF3E8FF'   // Morado claro
    };

    // Procesar por secciones para mantener tipo
    interface BrandWithType extends BrandInfo {
      type: 'objetivo' | 'competidor' | 'descubierto';
    }

    const brandsWithType: BrandWithType[] = [];

    // Verificar formato de brandSummary
    if (!Array.isArray(analysis.brandSummary)) {
      // Formato nuevo con targetBrands, competitors, otherCompetitors
      if (analysis.brandSummary.targetBrands) {
        analysis.brandSummary.targetBrands.forEach(b => {
          brandsWithType.push({ ...b, type: 'objetivo' });
        });
      }
      if (analysis.brandSummary.competitors) {
        analysis.brandSummary.competitors.forEach(b => {
          brandsWithType.push({ ...b, type: 'competidor' });
        });
      }
      if (analysis.brandSummary.otherCompetitors) {
        analysis.brandSummary.otherCompetitors.forEach(b => {
          brandsWithType.push({ ...b, type: 'descubierto' });
        });
      }
    } else {
      // Formato antiguo (array plano)
      analysis.brandSummary.forEach(b => {
        const type = configuration?.targetBrand === b.brand ? 'objetivo' :
                     configuration?.competitorBrands?.includes(b.brand) ? 'competidor' : 'descubierto';
        brandsWithType.push({ ...b, type });
      });
    }

    // Ordenar por orden de aparicion (si existe) y luego por frecuencia
    const sortedBrands = [...brandsWithType].sort((a, b) => {
      // Primero por appearanceOrder si existe
      if (a.appearanceOrder && b.appearanceOrder) {
        return a.appearanceOrder - b.appearanceOrder;
      }
      if (a.appearanceOrder) return -1;
      if (b.appearanceOrder) return 1;
      // Luego por frecuencia
      return b.frequency - a.frequency;
    });

    // Datos
    let row = 2;
    sortedBrands.forEach(brand => {
      const confidence = brand.averageConfidence ?? brand.confidence ?? 0;
      const contexts = brand.contexts || brand.evidence || [];
      const typeLabel = brand.type === 'objetivo' ? 'Objetivo' :
                        brand.type === 'competidor' ? 'Competidor' : 'Descubierto';

      sheet.getRow(row).values = [
        brand.brand,
        typeLabel,
        brand.appearanceOrder || '-',
        brand.mentioned ? 'Si' : 'No',
        brand.frequency,
        `${(confidence * 100).toFixed(1)}%`,
        brand.sentiment || brand.context || 'N/A',
        Array.isArray(contexts) ? contexts.join(', ') : String(contexts)
      ];

      // Color de fondo segun tipo
      sheet.getRow(row).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: bgColors[brand.type] }
      };

      // Color de texto para la columna Tipo
      const typeCell = sheet.getCell(`B${row}`);
      typeCell.font = { bold: true, color: { argb: typeColors[brand.type] } };

      // Badge de orden si existe
      if (brand.appearanceOrder) {
        const orderCell = sheet.getCell(`C${row}`);
        orderCell.font = { bold: true };
      }

      row++;
    });

    // Ajustar anchos
    sheet.getColumn(1).width = 25;
    sheet.getColumn(2).width = 14;
    sheet.getColumn(3).width = 10;
    sheet.getColumn(4).width = 12;
    sheet.getColumn(5).width = 12;
    sheet.getColumn(6).width = 18;
    sheet.getColumn(7).width = 15;
    sheet.getColumn(8).width = 50;

    // Agregar leyenda al final
    row += 2;
    sheet.getCell(`A${row}`).value = 'Leyenda de Tipos:';
    sheet.getCell(`A${row}`).font = { bold: true };
    row++;
    sheet.getCell(`A${row}`).value = 'Objetivo: Marcas objetivo configuradas';
    sheet.getCell(`A${row}`).font = { color: { argb: typeColors.objetivo } };
    row++;
    sheet.getCell(`A${row}`).value = 'Competidor: Competidores configurados';
    sheet.getCell(`A${row}`).font = { color: { argb: typeColors.competidor } };
    row++;
    sheet.getCell(`A${row}`).value = 'Descubierto: Marcas descubiertas por la IA (no estaban configuradas)';
    sheet.getCell(`A${row}`).font = { color: { argb: typeColors.descubierto } };
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
   * Hoja 4: Fuentes Web Reales (de OpenAI Web Search)
   */
  private async createSourcesCitedSheet(
    workbook: ExcelJS.Workbook,
    analysis: AnalysisResult
  ) {
    const sheet = workbook.addWorksheet('Fuentes Web', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
    });

    // Headers
    sheet.getRow(1).values = [
      'Pregunta',
      'Título',
      'Dominio',
      'URL',
      'Prioritaria',
      'Extracto'
    ];
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4788' }
    };

    // Datos - usar sources[] (fuentes web reales de OpenAI)
    let row = 2;
    analysis.questions.forEach(question => {
      if (question.sources && question.sources.length > 0) {
        question.sources.forEach(source => {
          // Saltar fuentes sintéticas (generadas cuando no hay web search)
          if (source.url === 'ai-generated-response' || source.url === 'generative-ai-response') {
            return;
          }

          sheet.getRow(row).values = [
            question.question.substring(0, 100) + (question.question.length > 100 ? '...' : ''),
            source.title || 'Sin título',
            source.domain || '',
            source.url || 'N/A',
            source.isPriority ? 'Sí' : 'No',
            source.snippet?.substring(0, 200) || ''
          ];

          // Color para fuentes prioritarias
          const priorityCell = sheet.getCell(`E${row}`);
          if (source.isPriority) {
            priorityCell.font = { color: { argb: 'FF008000' }, bold: true };
          }

          // Hacer URL clicable
          if (source.url && source.url !== 'N/A') {
            const urlCell = sheet.getCell(`D${row}`);
            urlCell.value = {
              text: source.url,
              hyperlink: source.url
            };
            urlCell.font = { color: { argb: 'FF0066CC' }, underline: true };
          }

          row++;
        });
      }
    });

    // Si no hay fuentes web reales
    if (row === 2) {
      sheet.getRow(2).values = ['No se encontraron fuentes web reales. Verifica que el modelo tenga búsqueda web habilitada.', '', '', '', '', ''];
      sheet.mergeCells('A2:F2');
    }

    // Ajustar anchos
    sheet.getColumn(1).width = 50;
    sheet.getColumn(2).width = 35;
    sheet.getColumn(3).width = 25;
    sheet.getColumn(4).width = 50;
    sheet.getColumn(5).width = 12;
    sheet.getColumn(6).width = 60;
  }

  /**
   * Hoja 5: Datos en Bruto (JSON)
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

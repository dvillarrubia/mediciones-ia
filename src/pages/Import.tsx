import React, { useState, useRef } from 'react';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  X,
  Download,
  Eye,
  Save,
  FileText,
  Trash2,
  Edit3,
  Plus,
  Copy,
  BookTemplate,
  Check,
  RotateCcw
} from 'lucide-react';
import * as XLSX from 'xlsx';
import API_BASE_URL from '../config/api';

interface ExcelQuestion {
  pregunta: string;
  categoria: string;
  id?: string;
}

interface ExcelData {
  nombre?: string;
  descripcion?: string;
  marcaObjetivo?: string;
  competidores?: string;
  fuentesPrioritarias?: string;
  modelosIA?: string;
  preguntas: ExcelQuestion[];
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

const Import: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [excelData, setExcelData] = useState<ExcelData | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados para edición
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState(false);
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [newQuestion, setNewQuestion] = useState({ pregunta: '', categoria: '' });
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
      setSuccess(null);
      processExcelFile(selectedFile);
    }
  };

  const processExcelFile = async (file: File) => {
    setIsProcessing(true);
    setValidationErrors([]);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });

      // Buscar hoja de configuración
      const configSheet = workbook.Sheets['Configuración'] || workbook.Sheets['Config'] || workbook.Sheets[workbook.SheetNames[0]];
      const configData = XLSX.utils.sheet_to_json<any>(configSheet, { header: 1 });

      // Buscar hoja de preguntas
      const questionsSheet = workbook.Sheets['Preguntas'] || workbook.Sheets['Questions'] || workbook.Sheets[workbook.SheetNames[1]] || configSheet;
      const questionsData = XLSX.utils.sheet_to_json<any>(questionsSheet, { header: 1 });

      // Extraer configuración (primeras filas)
      const extractedData: ExcelData = {
        preguntas: []
      };

      // Buscar datos de configuración
      for (let i = 0; i < Math.min(configData.length, 10); i++) {
        const row = configData[i];
        if (!row || row.length < 2) continue;

        const key = String(row[0]).toLowerCase().trim();
        const value = row[1];

        if (key.includes('nombre')) extractedData.nombre = String(value);
        if (key.includes('descripci') || key.includes('description')) extractedData.descripcion = String(value);
        if (key.includes('marca') && key.includes('objetivo')) extractedData.marcaObjetivo = String(value);
        if (key.includes('competidor')) extractedData.competidores = String(value);
        if (key.includes('fuentes') || key.includes('sources')) extractedData.fuentesPrioritarias = String(value);
        if (key.includes('modelos') || key.includes('ia') || key.includes('ai')) extractedData.modelosIA = String(value);
      }

      // Extraer preguntas
      let questionStartRow = -1;
      for (let i = 0; i < questionsData.length; i++) {
        const row = questionsData[i];
        if (row && row.length > 0) {
          const firstCell = String(row[0]).toLowerCase();
          if (firstCell.includes('pregunta') || firstCell.includes('question')) {
            questionStartRow = i + 1;
            break;
          }
        }
      }

      if (questionStartRow === -1) {
        // Si no encuentra encabezado, buscar desde el principio
        questionStartRow = configData.length > 10 ? 10 : 0;
      }

      const errors: ValidationError[] = [];

      for (let i = questionStartRow; i < questionsData.length; i++) {
        const row = questionsData[i];
        if (!row || row.length === 0) continue;

        const pregunta = row[0] ? String(row[0]).trim() : '';
        const categoria = row[1] ? String(row[1]).trim() : '';

        if (!pregunta && !categoria) continue; // Fila vacía

        if (!pregunta) {
          errors.push({
            row: i + 1,
            field: 'pregunta',
            message: 'La pregunta no puede estar vacía'
          });
          continue;
        }

        if (!categoria) {
          errors.push({
            row: i + 1,
            field: 'categoria',
            message: 'La categoría no puede estar vacía'
          });
        }

        extractedData.preguntas.push({
          pregunta,
          categoria,
          id: `q${extractedData.preguntas.length + 1}`
        });
      }

      setValidationErrors(errors);
      setExcelData(extractedData);
      setShowPreview(true);

      if (extractedData.preguntas.length === 0) {
        setError('No se encontraron preguntas válidas en el archivo');
      } else {
        setSuccess(`Se importaron ${extractedData.preguntas.length} preguntas exitosamente`);
      }

    } catch (err) {
      console.error('Error processing Excel:', err);
      setError(`Error al procesar el archivo: ${err instanceof Error ? err.message : 'Error desconocido'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveConfiguration = async () => {
    if (!excelData || excelData.preguntas.length === 0) {
      setError('No hay datos para guardar');
      return;
    }

    try {
      setIsProcessing(true);

      const configuration = {
        name: excelData.nombre || 'Configuración importada',
        description: excelData.descripcion || 'Importada desde Excel',
        targetBrand: excelData.marcaObjetivo || '',
        competitorBrands: excelData.competidores ? excelData.competidores.split(',').map(c => c.trim()).filter(c => c.length > 0) : [],
        prioritySources: excelData.fuentesPrioritarias ? excelData.fuentesPrioritarias.split(',').map(s => s.trim()).filter(s => s.length > 0) : ['ChatGPT', 'Claude', 'Gemini'],
        aiModels: excelData.modelosIA ? excelData.modelosIA.split(',').map(m => m.trim().toLowerCase()) : ['chatgpt'],
        questions: excelData.preguntas.map(q => ({
          id: q.id || `q${Date.now()}`,
          question: q.pregunta,
          category: q.categoria
        }))
      };

      const response = await fetch(`${API_BASE_URL}/api/templates/custom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configuration)
      });

      if (response.ok) {
        setSuccess('Configuración guardada exitosamente. Puedes usarla desde la sección de Análisis.');
        setShowPreview(false);
        setFile(null);
        setExcelData(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al guardar la configuración');
      }
    } catch (err) {
      setError(`Error al guardar: ${err instanceof Error ? err.message : 'Error desconocido'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadTemplate = () => {
    // Plantilla completa con ejemplos reales
    const template = [
      ['📋 CONFIGURACIÓN GENERAL', ''],
      ['Nombre', 'Análisis de Presencia en IA - Sector Seguros'],
      ['Descripción', 'Estudio completo sobre cómo aparecen las marcas de seguros en búsquedas de IA generativa'],
      ['Marca Objetivo', 'Mapfre'],
      ['Competidores', 'Allianz, AXA, Sanitas, DKV, Mutua Madrileña'],
      ['Fuentes Prioritarias', 'mapfre.com, mapfre.es, comparador-seguros.com'],
      ['Modelos IA', 'chatgpt, claude, gemini'],
      [],
      ['📝 INSTRUCCIONES:', ''],
      ['1. Rellena la configuración general arriba', ''],
      ['2. Modifica las preguntas de abajo según tu análisis', ''],
      ['3. Puedes añadir o quitar filas de preguntas', ''],
      ['4. No borres los encabezados "Pregunta" y "Categoría"', ''],
      ['5. Separa múltiples valores con comas', ''],
      [],
      ['Pregunta', 'Categoría'],
      ['¿Qué seguros de salud privados son mejores en España?', 'Evaluación y Recomendación'],
      ['¿Cuál es el mejor seguro médico para familias?', 'Evaluación y Recomendación'],
      ['¿Qué seguro de vida recomiendan los expertos?', 'Evaluación y Recomendación'],
      ['¿Cuál es el seguro de hogar más económico?', 'Evaluación y Recomendación'],
      ['¿Qué seguro de coche tiene mejor cobertura?', 'Evaluación y Recomendación'],
      [],
      ['¿Debería contratar un seguro de vida o invertir?', 'Fase de Indecisión'],
      ['¿Merece la pena contratar un seguro de salud privado?', 'Fase de Indecisión'],
      ['¿Es mejor seguro a todo riesgo o terceros?', 'Fase de Indecisión'],
      ['¿Qué seguro elegir: completo o básico?', 'Fase de Indecisión'],
      [],
      ['Diferencias entre seguro de salud pública y privada', 'Comparativa'],
      ['Seguro de vida vs seguro de ahorro', 'Comparativa'],
      ['¿Qué es mejor: seguro o mutua médica?', 'Comparativa'],
      ['Comparativa de seguros de hogar', 'Comparativa'],
      [],
      ['¿Cómo puedo pagar el seguro a plazos?', 'Modalidad y Financiación'],
      ['¿Se puede contratar un seguro online?', 'Modalidad y Financiación'],
      ['¿Hay seguros de salud sin copago?', 'Modalidad y Financiación'],
      ['¿Qué formas de pago aceptan las aseguradoras?', 'Modalidad y Financiación'],
      [],
      ['¿Puedo cambiar de seguro en cualquier momento?', 'Barreras Administrativas'],
      ['¿Qué pasa si cancelo mi seguro antes de tiempo?', 'Barreras Administrativas'],
      ['¿Necesito pasar un examen médico para el seguro?', 'Barreras Administrativas'],
      [],
      ['¿Qué trabajos puedo conseguir con un seguro de vida?', 'Horizonte Post-Titulación'],
      ['¿El seguro cubre estudios en el extranjero?', 'Horizonte Post-Titulación'],
      ['¿Cómo me ayuda el seguro en mi carrera profesional?', 'Horizonte Post-Titulación'],
      [],
      ['¿Dónde puedo contratar seguros de [marca]?', 'Descubrimiento'],
      ['¿Qué opiniones tiene [marca]?', 'Descubrimiento'],
      ['¿Es [marca] una buena aseguradora?', 'Descubrimiento'],
      [],
      ['¿Puedo gestionar mi seguro desde el móvil?', 'Flexibilidad'],
      ['¿[marca] tiene app móvil?', 'Flexibilidad'],
      ['¿Cómo funciona la telemedicina con [marca]?', 'Flexibilidad'],
      [],
      ['¿[marca] tiene buenas opiniones?', 'Preocupaciones'],
      ['¿Es fiable [marca]?', 'Preocupaciones'],
      ['¿Problemas con [marca]?', 'Preocupaciones'],
      ['¿[marca] paga los siniestros rápido?', 'Preocupaciones'],
      [],
      ['[marca] vs competencia', 'Comparativas'],
      ['¿Es [marca] mejor que [competidor]?', 'Comparativas'],
      ['Diferencias entre [marca] y [competidor]', 'Comparativas'],
      [],
      ['¿Trabajar en [marca] después del seguro?', 'Empleabilidad'],
      ['¿[marca] tiene buena reputación como empleador?', 'Empleabilidad'],
      ['Salidas profesionales con certificación de [marca]', 'Empleabilidad']
    ];

    const ws = XLSX.utils.aoa_to_sheet(template);

    // Aplicar estilos y anchos de columna
    ws['!cols'] = [
      { wch: 70 },  // Columna A (Preguntas)
      { wch: 30 }   // Columna B (Categorías)
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Configuración');
    XLSX.writeFile(wb, 'plantilla_analisis_ejemplo.xlsx');
  };

  const clearData = () => {
    setFile(null);
    setExcelData(null);
    setValidationErrors([]);
    setShowPreview(false);
    setError(null);
    setSuccess(null);
    setEditingQuestionId(null);
    setEditingConfig(false);
    setShowAddQuestion(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Funciones de edición de preguntas
  const handleEditQuestion = (id: string) => {
    setEditingQuestionId(id);
  };

  const handleSaveQuestion = (id: string, newPregunta: string, newCategoria: string) => {
    if (!excelData) return;

    const updatedPreguntas = excelData.preguntas.map(q =>
      q.id === id ? { ...q, pregunta: newPregunta, categoria: newCategoria } : q
    );

    setExcelData({ ...excelData, preguntas: updatedPreguntas });
    setEditingQuestionId(null);
  };

  const handleDeleteQuestion = (id: string) => {
    if (!excelData) return;

    const updatedPreguntas = excelData.preguntas.filter(q => q.id !== id);
    setExcelData({ ...excelData, preguntas: updatedPreguntas });
  };

  const handleAddQuestion = () => {
    if (!excelData || !newQuestion.pregunta.trim() || !newQuestion.categoria.trim()) return;

    const newId = `q${Date.now()}`;
    const updatedPreguntas = [
      ...excelData.preguntas,
      { id: newId, pregunta: newQuestion.pregunta.trim(), categoria: newQuestion.categoria.trim() }
    ];

    setExcelData({ ...excelData, preguntas: updatedPreguntas });
    setNewQuestion({ pregunta: '', categoria: '' });
    setShowAddQuestion(false);
  };

  const handleDuplicateQuestion = (question: ExcelQuestion) => {
    if (!excelData) return;

    const newId = `q${Date.now()}`;
    const idx = excelData.preguntas.findIndex(q => q.id === question.id);
    const updatedPreguntas = [...excelData.preguntas];
    updatedPreguntas.splice(idx + 1, 0, {
      id: newId,
      pregunta: question.pregunta + ' (copia)',
      categoria: question.categoria
    });

    setExcelData({ ...excelData, preguntas: updatedPreguntas });
  };

  // Funciones de edición de configuración
  const handleUpdateConfig = (field: keyof ExcelData, value: string) => {
    if (!excelData) return;
    setExcelData({ ...excelData, [field]: value });
  };

  // Guardar como plantilla
  const handleSaveAsTemplate = async () => {
    if (!excelData || !templateName.trim()) {
      setError('Debes especificar un nombre para la plantilla');
      return;
    }

    try {
      setIsProcessing(true);

      const template = {
        name: templateName.trim(),
        description: templateDescription.trim() || `Plantilla basada en ${excelData.nombre || 'importación Excel'}`,
        isTemplate: true,
        targetBrand: excelData.marcaObjetivo || '',
        competitorBrands: excelData.competidores ? excelData.competidores.split(',').map(c => c.trim()).filter(c => c.length > 0) : [],
        prioritySources: excelData.fuentesPrioritarias ? excelData.fuentesPrioritarias.split(',').map(s => s.trim()).filter(s => s.length > 0) : ['ChatGPT', 'Claude', 'Gemini'],
        aiModels: excelData.modelosIA ? excelData.modelosIA.split(',').map(m => m.trim().toLowerCase()) : ['chatgpt'],
        questions: excelData.preguntas.map(q => ({
          id: q.id || `q${Date.now()}`,
          question: q.pregunta,
          category: q.categoria
        }))
      };

      const response = await fetch(`${API_BASE_URL}/api/templates/custom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template)
      });

      if (response.ok) {
        setSuccess(`Plantilla "${templateName}" guardada exitosamente. Disponible en Configuración.`);
        setShowTemplateModal(false);
        setTemplateName('');
        setTemplateDescription('');
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al guardar la plantilla');
      }
    } catch (err) {
      setError(`Error al guardar plantilla: ${err instanceof Error ? err.message : 'Error desconocido'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Obtener categorías únicas para sugerencias
  const uniqueCategories = excelData
    ? [...new Set(excelData.preguntas.map(q => q.categoria))]
    : [];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Upload className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Importar desde Excel</h1>
                <p className="text-gray-600 mt-1">
                  Carga tus preguntas y configuración desde un archivo Excel
                </p>
              </div>
            </div>
            <button
              onClick={downloadTemplate}
              className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="h-5 w-5" />
              <span>Descargar Plantilla</span>
            </button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center space-x-3">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
            <span className="text-red-700 flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center space-x-3">
            <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
            <span className="text-green-700 flex-1">{success}</span>
            <button onClick={() => setSuccess(null)} className="text-green-500 hover:text-green-700">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Upload Area */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="text-center">
            <FileSpreadsheet className="mx-auto h-16 w-16 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Selecciona un archivo Excel
            </h3>
            <p className="text-gray-600 mb-6">
              Formatos soportados: .xlsx, .xls
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload"
            />

            <label
              htmlFor="file-upload"
              className="inline-flex items-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 cursor-pointer transition-colors"
            >
              <Upload className="h-5 w-5" />
              <span>Seleccionar Archivo</span>
            </label>

            {file && (
              <div className="mt-6 flex items-center justify-center space-x-3">
                <FileText className="h-5 w-5 text-gray-500" />
                <span className="text-gray-700 font-medium">{file.name}</span>
                <button
                  onClick={clearData}
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>

          {/* Info Box */}
          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h4 className="font-medium text-blue-900 mb-2">Formato del archivo Excel</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• <strong>Primeras filas</strong>: Configuración general (Nombre, Marca Objetivo, Competidores, etc.)</li>
                  <li>• <strong>Fila de encabezados</strong>: "Pregunta" y "Categoría"</li>
                  <li>• <strong>Siguientes filas</strong>: Una pregunta por fila con su categoría</li>
                  <li>• <strong>Múltiples valores</strong>: Separa con comas (Ej: "comp1, comp2, comp3")</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Preview */}
        {showPreview && excelData && (
          <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center space-x-2">
                <Eye className="h-6 w-6 text-blue-600" />
                <h2 className="text-xl font-semibold text-gray-900">Vista Previa de Importación</h2>
                <span className="text-sm text-gray-500">({excelData.preguntas.length} preguntas)</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowTemplateModal(true)}
                  disabled={isProcessing || excelData.preguntas.length === 0}
                  className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  <BookTemplate className="h-5 w-5" />
                  <span>Guardar como Plantilla</span>
                </button>
                <button
                  onClick={handleSaveConfiguration}
                  disabled={isProcessing || excelData.preguntas.length === 0}
                  className="flex items-center space-x-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  <Save className="h-5 w-5" />
                  <span>{isProcessing ? 'Guardando...' : 'Guardar Configuración'}</span>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Configuración General - Editable */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    Configuración General
                  </h3>
                  <button
                    onClick={() => setEditingConfig(!editingConfig)}
                    className={`flex items-center gap-1 px-3 py-1 rounded-lg transition-colors ${
                      editingConfig
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {editingConfig ? <Check className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
                    {editingConfig ? 'Listo' : 'Editar'}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-gray-200 rounded-lg p-4 bg-white">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Nombre</h4>
                    {editingConfig ? (
                      <input
                        type="text"
                        value={excelData.nombre || ''}
                        onChange={(e) => handleUpdateConfig('nombre', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Nombre del análisis"
                      />
                    ) : (
                      <p className="text-gray-900">{excelData.nombre || 'No especificado'}</p>
                    )}
                  </div>

                  <div className="border border-gray-200 rounded-lg p-4 bg-white">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Marca Objetivo</h4>
                    {editingConfig ? (
                      <input
                        type="text"
                        value={excelData.marcaObjetivo || ''}
                        onChange={(e) => handleUpdateConfig('marcaObjetivo', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Ej: Mapfre"
                      />
                    ) : (
                      <p className="text-gray-900">{excelData.marcaObjetivo || 'No especificado'}</p>
                    )}
                  </div>

                  <div className="border border-gray-200 rounded-lg p-4 bg-white">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Competidores</h4>
                    {editingConfig ? (
                      <input
                        type="text"
                        value={excelData.competidores || ''}
                        onChange={(e) => handleUpdateConfig('competidores', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Separados por comas: Allianz, AXA, Sanitas"
                      />
                    ) : (
                      <p className="text-gray-900">{excelData.competidores || 'No especificado'}</p>
                    )}
                  </div>

                  <div className="border border-gray-200 rounded-lg p-4 bg-white">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Modelos IA</h4>
                    {editingConfig ? (
                      <input
                        type="text"
                        value={excelData.modelosIA || ''}
                        onChange={(e) => handleUpdateConfig('modelosIA', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="chatgpt, claude, gemini"
                      />
                    ) : (
                      <p className="text-gray-900">{excelData.modelosIA || 'chatgpt'}</p>
                    )}
                  </div>
                </div>

                {(editingConfig || excelData.descripcion) && (
                  <div className="border border-gray-200 rounded-lg p-4 bg-white mt-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Descripción</h4>
                    {editingConfig ? (
                      <textarea
                        value={excelData.descripcion || ''}
                        onChange={(e) => handleUpdateConfig('descripcion', e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Descripción del análisis"
                      />
                    ) : (
                      <p className="text-gray-900">{excelData.descripcion}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Validation Errors */}
              {validationErrors.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-medium text-yellow-900 mb-2">
                        Advertencias ({validationErrors.length})
                      </h4>
                      <ul className="text-sm text-yellow-800 space-y-1">
                        {validationErrors.slice(0, 5).map((err, idx) => (
                          <li key={idx}>
                            Fila {err.row}: {err.message}
                          </li>
                        ))}
                        {validationErrors.length > 5 && (
                          <li className="font-medium">... y {validationErrors.length - 5} más</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Preguntas - Editables */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Preguntas ({excelData.preguntas.length})
                  </h3>
                  <button
                    onClick={() => setShowAddQuestion(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Añadir Pregunta
                  </button>
                </div>

                {/* Formulario para añadir pregunta */}
                {showAddQuestion && (
                  <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <h4 className="font-medium text-green-900 mb-3">Nueva Pregunta</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Pregunta</label>
                        <input
                          type="text"
                          value={newQuestion.pregunta}
                          onChange={(e) => setNewQuestion({ ...newQuestion, pregunta: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                          placeholder="Escribe la pregunta..."
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                        <input
                          type="text"
                          value={newQuestion.categoria}
                          onChange={(e) => setNewQuestion({ ...newQuestion, categoria: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                          placeholder="Ej: Evaluación y Recomendación"
                          list="categorias-list"
                        />
                        <datalist id="categorias-list">
                          {uniqueCategories.map((cat, i) => (
                            <option key={i} value={cat} />
                          ))}
                        </datalist>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={handleAddQuestion}
                        disabled={!newQuestion.pregunta.trim() || !newQuestion.categoria.trim()}
                        className="flex items-center gap-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors"
                      >
                        <Check className="h-4 w-4" />
                        Añadir
                      </button>
                      <button
                        onClick={() => { setShowAddQuestion(false); setNewQuestion({ pregunta: '', categoria: '' }); }}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                          #
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Pregunta
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-48">
                          Categoría
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {excelData.preguntas.map((q, idx) => (
                        <tr key={q.id || idx} className="hover:bg-gray-50 group">
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                            {idx + 1}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {editingQuestionId === q.id ? (
                              <input
                                type="text"
                                defaultValue={q.pregunta}
                                id={`edit-pregunta-${q.id}`}
                                className="w-full px-2 py-1 border border-blue-300 rounded focus:ring-2 focus:ring-blue-500"
                                autoFocus
                              />
                            ) : (
                              q.pregunta
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {editingQuestionId === q.id ? (
                              <input
                                type="text"
                                defaultValue={q.categoria}
                                id={`edit-categoria-${q.id}`}
                                className="w-full px-2 py-1 border border-blue-300 rounded focus:ring-2 focus:ring-blue-500"
                                list="categorias-edit-list"
                              />
                            ) : (
                              <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                                {q.categoria}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            {editingQuestionId === q.id ? (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => {
                                    const preguntaInput = document.getElementById(`edit-pregunta-${q.id}`) as HTMLInputElement;
                                    const categoriaInput = document.getElementById(`edit-categoria-${q.id}`) as HTMLInputElement;
                                    handleSaveQuestion(q.id!, preguntaInput.value, categoriaInput.value);
                                  }}
                                  className="p-1 text-green-600 hover:bg-green-100 rounded"
                                  title="Guardar"
                                >
                                  <Check className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => setEditingQuestionId(null)}
                                  className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                                  title="Cancelar"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => handleEditQuestion(q.id!)}
                                  className="p-1 text-blue-600 hover:bg-blue-100 rounded"
                                  title="Editar"
                                >
                                  <Edit3 className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleDuplicateQuestion(q)}
                                  className="p-1 text-purple-600 hover:bg-purple-100 rounded"
                                  title="Duplicar"
                                >
                                  <Copy className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteQuestion(q.id!)}
                                  className="p-1 text-red-600 hover:bg-red-100 rounded"
                                  title="Eliminar"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <datalist id="categorias-edit-list">
                    {uniqueCategories.map((cat, i) => (
                      <option key={i} value={cat} />
                    ))}
                  </datalist>
                </div>

                {excelData.preguntas.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <p>No hay preguntas. Añade una nueva pregunta para continuar.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal para guardar como plantilla */}
        {showTemplateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <BookTemplate className="h-6 w-6 text-purple-600" />
                  Guardar como Plantilla
                </h3>
                <button
                  onClick={() => setShowTemplateModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <p className="text-sm text-gray-600 mb-4">
                Las plantillas se pueden reutilizar para crear nuevos análisis rápidamente.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre de la plantilla *
                  </label>
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    placeholder="Ej: Análisis Sector Seguros"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Descripción (opcional)
                  </label>
                  <textarea
                    value={templateDescription}
                    onChange={(e) => setTemplateDescription(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    placeholder="Describe para qué sirve esta plantilla..."
                  />
                </div>

                <div className="bg-purple-50 rounded-lg p-3 text-sm text-purple-800">
                  <p className="font-medium mb-1">Esta plantilla incluirá:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>{excelData?.preguntas.length || 0} preguntas</li>
                    <li>{uniqueCategories.length} categorías</li>
                    {excelData?.marcaObjetivo && <li>Marca objetivo: {excelData.marcaObjetivo}</li>}
                    {excelData?.competidores && <li>Competidores configurados</li>}
                  </ul>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleSaveAsTemplate}
                  disabled={!templateName.trim() || isProcessing}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 transition-colors"
                >
                  <Save className="h-4 w-4" />
                  {isProcessing ? 'Guardando...' : 'Guardar Plantilla'}
                </button>
                <button
                  onClick={() => setShowTemplateModal(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Processing Indicator */}
        {isProcessing && !showPreview && (
          <div className="mt-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Procesando archivo...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Import;

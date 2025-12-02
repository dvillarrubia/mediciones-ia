import React, { useState, useEffect } from 'react';
import { API_ENDPOINTS } from '../config/api';

interface Report {
  id: string;
  timestamp: string;
  targetBrand: string;
  configurationName: string;
  templateUsed: string;
  status: 'completed' | 'in_progress' | 'failed';
  categories: string[];
  summary: string;
  questionsCount: number;
  overallConfidence: number;
}

interface FilterOptions {
  brand: string;
  template: string;
  dateFrom: string;
  dateTo: string;
  status: string;
  minConfidence: number;
  maxConfidence: number;
  minQuestions: number;
  sortBy: 'date' | 'confidence' | 'questions' | 'brand';
  sortOrder: 'asc' | 'desc';
  showAdvanced: boolean;
}

const Reports: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [filteredReports, setFilteredReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterOptions>({
    brand: '',
    template: '',
    dateFrom: '',
    dateTo: '',
    status: '',
    minConfidence: 0,
    maxConfidence: 100,
    minQuestions: 0,
    sortBy: 'date',
    sortOrder: 'desc',
    showAdvanced: false
  });

  useEffect(() => {
    loadReports();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [reports, filters]);

  const loadReports = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_ENDPOINTS.analysisSaved}`);
      const data = await response.json();

      if (data.success && data.data) {
        // Transformar los análisis guardados al formato de Report
        const transformedReports: Report[] = data.data.map((analysis: any) => {
          // Extraer categorías únicas de las preguntas
          const categories = analysis.results?.questions
            ? [...new Set(analysis.results.questions.map((q: any) => q.category))]
            : [];

          return {
            id: analysis.id,
            timestamp: analysis.timestamp,
            targetBrand: analysis.configuration?.brand || 'Desconocida',
            configurationName: `Análisis de ${analysis.configuration?.brand || 'Marca'}`,
            templateUsed: analysis.configuration?.templateId || 'Personalizado',
            status: 'completed' as const,
            categories: categories,
            summary: `Análisis con ${analysis.configuration?.questionsCount || 0} preguntas`,
            questionsCount: analysis.configuration?.questionsCount || 0,
            overallConfidence: (analysis.results?.overallConfidence || 0) * 100
          };
        });

        setReports(transformedReports);
      } else {
        setReports([]);
      }
    } catch (error) {
      console.error('Error loading reports:', error);
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...reports];

    // Filtros básicos
    if (filters.brand) {
      filtered = filtered.filter(report =>
        report.targetBrand.toLowerCase().includes(filters.brand.toLowerCase())
      );
    }

    if (filters.template) {
      filtered = filtered.filter(report =>
        report.templateUsed.toLowerCase().includes(filters.template.toLowerCase())
      );
    }

    if (filters.status) {
      filtered = filtered.filter(report => report.status === filters.status);
    }

    if (filters.dateFrom) {
      filtered = filtered.filter(report =>
        new Date(report.timestamp) >= new Date(filters.dateFrom)
      );
    }

    if (filters.dateTo) {
      filtered = filtered.filter(report =>
        new Date(report.timestamp) <= new Date(filters.dateTo)
      );
    }

    // Filtros avanzados
    if (filters.minConfidence > 0) {
      filtered = filtered.filter(report => report.overallConfidence >= filters.minConfidence);
    }

    if (filters.maxConfidence < 100) {
      filtered = filtered.filter(report => report.overallConfidence <= filters.maxConfidence);
    }

    if (filters.minQuestions > 0) {
      filtered = filtered.filter(report => report.questionsCount >= filters.minQuestions);
    }

    // Ordenamiento
    filtered.sort((a, b) => {
      let comparison = 0;

      switch (filters.sortBy) {
        case 'date':
          comparison = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
          break;
        case 'confidence':
          comparison = a.overallConfidence - b.overallConfidence;
          break;
        case 'questions':
          comparison = a.questionsCount - b.questionsCount;
          break;
        case 'brand':
          comparison = a.targetBrand.localeCompare(b.targetBrand);
          break;
      }

      return filters.sortOrder === 'asc' ? comparison : -comparison;
    });

    setFilteredReports(filtered);
  };

  const handleFilterChange = (key: keyof FilterOptions, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      brand: '',
      template: '',
      dateFrom: '',
      dateTo: '',
      status: '',
      minConfidence: 0,
      maxConfidence: 100,
      minQuestions: 0,
      sortBy: 'date',
      sortOrder: 'desc',
      showAdvanced: false
    });
  };

  const generateMarkdownReport = async (reportId: string) => {
    try {
      const response = await fetch(`${API_ENDPOINTS.analysisSaved}/${reportId}`);
      const data = await response.json();

      if (data.success) {
        const reportResponse = await fetch(`${API_ENDPOINTS.analysisReportMarkdown}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            analysisResult: data.data.results,
            configuration: data.data.configuration
          })
        });

        const reportData = await reportResponse.json();

        if (reportData.success) {
          // Descargar el archivo
          const blob = new Blob([reportData.data.content], { type: 'text/markdown' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = reportData.data.filename;
          a.click();
          window.URL.revokeObjectURL(url);
        }
      }
    } catch (error) {
      console.error('Error generating markdown report:', error);
    }
  };

  const generateJSONReport = async (reportId: string) => {
    try {
      const response = await fetch(`${API_ENDPOINTS.analysisSaved}/${reportId}`);
      const data = await response.json();

      if (data.success) {
        const reportResponse = await fetch(`${API_ENDPOINTS.analysisReportJSON}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            analysisResult: data.data.results,
            configuration: data.data.configuration
          })
        });

        const reportData = await reportResponse.json();

        if (reportData.success) {
          // Descargar el archivo
          const blob = new Blob([JSON.stringify(reportData.data.content, null, 2)], { type: 'application/json' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = reportData.data.filename;
          a.click();
          window.URL.revokeObjectURL(url);
        }
      }
    } catch (error) {
      console.error('Error generating JSON report:', error);
    }
  };

  const generateTableReport = async (reportId: string) => {
    try {
      const response = await fetch(`${API_ENDPOINTS.analysisSaved}/${reportId}`);
      const data = await response.json();

      if (data.success) {
        const reportResponse = await fetch(`${API_ENDPOINTS.analysisReportTable}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            analysisResult: data.data.results,
            configuration: data.data.configuration
          })
        });

        const reportData = await reportResponse.json();

        if (reportData.success) {
          // Descargar el archivo
          const blob = new Blob([reportData.data.content], { type: 'text/csv' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = reportData.data.filename;
          a.click();
          window.URL.revokeObjectURL(url);
        }
      }
    } catch (error) {
      console.error('Error generating table report:', error);
    }
  };

  const generateExcelReport = async (reportId: string) => {
    try {
      const response = await fetch(`${API_ENDPOINTS.analysisSaved}/${reportId}`);
      const data = await response.json();

      if (data.success) {
        const reportResponse = await fetch(`${API_ENDPOINTS.analysisReportExcel}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            analysisResult: data.data.results,
            configuration: data.data.configuration
          })
        });

        // El servidor envía el archivo directamente como blob
        const blob = await reportResponse.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analisis_excel_${reportId}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error generating Excel report:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusColors = {
      completed: 'bg-green-100 text-green-800',
      in_progress: 'bg-yellow-100 text-yellow-800',
      failed: 'bg-red-100 text-red-800'
    };
    
    const statusLabels = {
      completed: 'Completado',
      in_progress: 'En Progreso',
      failed: 'Fallido'
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[status as keyof typeof statusColors]}`}>
        {statusLabels[status as keyof typeof statusLabels]}
      </span>
    );
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Cargando informes...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Informes de Análisis</h1>
        <div className="text-sm text-gray-500">
          {filteredReports.length} de {reports.length} informes
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Filtros</h2>
          <button
            onClick={() => setFilters(prev => ({ ...prev, showAdvanced: !prev.showAdvanced }))}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            {filters.showAdvanced ? '▼ Ocultar avanzados' : '▶ Mostrar avanzados'}
          </button>
        </div>

        {/* Filtros básicos */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Marca
            </label>
            <input
              type="text"
              value={filters.brand}
              onChange={(e) => handleFilterChange('brand', e.target.value)}
              placeholder="Filtrar por marca..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Plantilla
            </label>
            <select
              value={filters.template}
              onChange={(e) => handleFilterChange('template', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas las plantillas</option>
              <option value="Seguros">Seguros</option>
              <option value="Banca">Banca</option>
              <option value="Telecomunicaciones">Telecomunicaciones</option>
              <option value="Personalizada">Personalizada</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Estado
            </label>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos los estados</option>
              <option value="completed">Completado</option>
              <option value="in_progress">En Progreso</option>
              <option value="failed">Fallido</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Desde
            </label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Hasta
            </label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Filtros avanzados */}
        {filters.showAdvanced && (
          <>
            <div className="mt-4 pt-4 border-t border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Filtros Avanzados</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confianza mínima (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={filters.minConfidence}
                    onChange={(e) => setFilters(prev => ({ ...prev, minConfidence: Number(e.target.value) }))}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confianza máxima (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={filters.maxConfidence}
                    onChange={(e) => setFilters(prev => ({ ...prev, maxConfidence: Number(e.target.value) }))}
                    placeholder="100"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Preguntas mínimas
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={filters.minQuestions}
                    onChange={(e) => setFilters(prev => ({ ...prev, minQuestions: Number(e.target.value) }))}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ordenar por
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={filters.sortBy}
                      onChange={(e) => setFilters(prev => ({ ...prev, sortBy: e.target.value as any }))}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="date">Fecha</option>
                      <option value="confidence">Confianza</option>
                      <option value="questions">Preguntas</option>
                      <option value="brand">Marca</option>
                    </select>
                    <button
                      onClick={() => setFilters(prev => ({ ...prev, sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc' }))}
                      className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-sm font-medium"
                      title={filters.sortOrder === 'asc' ? 'Ascendente' : 'Descendente'}
                    >
                      {filters.sortOrder === 'asc' ? '↑' : '↓'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Resumen de filtros activos */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-sm font-medium text-gray-700">Filtros activos:</span>
                {filters.minConfidence > 0 && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                    Confianza ≥ {filters.minConfidence}%
                  </span>
                )}
                {filters.maxConfidence < 100 && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                    Confianza ≤ {filters.maxConfidence}%
                  </span>
                )}
                {filters.minQuestions > 0 && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                    Preguntas ≥ {filters.minQuestions}
                  </span>
                )}
                {filters.brand && (
                  <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                    Marca: {filters.brand}
                  </span>
                )}
                {filters.template && (
                  <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                    Plantilla: {filters.template}
                  </span>
                )}
                {filters.status && (
                  <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                    Estado: {filters.status}
                  </span>
                )}
                {(filters.brand || filters.template || filters.status || filters.minConfidence > 0 || filters.maxConfidence < 100 || filters.minQuestions > 0) === false && (
                  <span className="text-sm text-gray-500">Ninguno</span>
                )}
              </div>
            </div>
          </>
        )}

        <div className="mt-4 flex justify-end">
          <button
            onClick={clearFilters}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Limpiar Filtros
          </button>
        </div>
      </div>

      {/* Lista de Informes */}
      <div className="space-y-4">
        {filteredReports.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-500 text-lg">No se encontraron informes con los filtros aplicados</div>
          </div>
        ) : (
          filteredReports.map((report) => (
            <div key={report.id} className="bg-white p-6 rounded-lg shadow-sm border hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">{report.configurationName}</h3>
                  <p className="text-gray-600 mt-1">{report.summary}</p>
                </div>
                {getStatusBadge(report.status)}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
                <div>
                  <span className="text-sm font-medium text-gray-500">Marca Objetivo:</span>
                  <p className="text-gray-900">{report.targetBrand}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-500">Plantilla:</span>
                  <p className="text-gray-900">{report.templateUsed}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-500">Fecha:</span>
                  <p className="text-gray-900">{formatDate(report.timestamp)}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-500">Preguntas:</span>
                  <p className="text-gray-900">{report.questionsCount}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-500">Confianza:</span>
                  <p className="text-gray-900">{report.overallConfidence.toFixed(1)}%</p>
                </div>
              </div>

              <div className="mb-4">
                <span className="text-sm font-medium text-gray-500">Categorías analizadas:</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {report.categories.map((category, index) => (
                    <span key={index} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                      {category}
                    </span>
                  ))}
                </div>
              </div>

              {report.status === 'completed' && (
                <div className="flex gap-3">
                  <button
                    onClick={() => generateMarkdownReport(report.id)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                  >
                    Descargar Markdown
                  </button>
                  <button
                    onClick={() => generateJSONReport(report.id)}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
                  >
                    Descargar JSON
                  </button>
                  <button
                    onClick={() => generateTableReport(report.id)}
                    className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm"
                  >
                    Descargar Tabla (CSV)
                  </button>
                  <button
                    onClick={() => generateExcelReport(report.id)}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 text-sm"
                  >
                    Descargar Excel
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Reports;
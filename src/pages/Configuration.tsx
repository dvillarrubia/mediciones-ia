import React, { useState, useEffect } from 'react';
import {
  Settings,
  Plus,
  Edit3,
  Trash2,
  Copy,
  Save,
  X,
  AlertCircle,
  CheckCircle,
  Building,
  Target,
  Users,
  HelpCircle,
  Key,
  Eye,
  EyeOff,
  FileText,
  ChevronRight,
  Sparkles,
  Check,
  Briefcase,
  GraduationCap,
  Phone,
  Shield
} from 'lucide-react';
import API_BASE_URL from '../config/api';

interface AnalysisQuestion {
  id: string;
  text: string;
  question?: string;
  category: string;
  enabled?: boolean;
}

interface AnalysisTemplate {
  id: string;
  name: string;
  description: string;
  industry: string;
  suggestedBrands?: string[];
  questions: AnalysisQuestion[];
}

interface CustomConfiguration {
  id: string;
  name: string;
  description: string;
  targetBrand: string;
  competitors: string[];
  questions: AnalysisQuestion[];
  aiModels: string[];
  createdAt: string;
  updatedAt: string;
}

// Iconos para cada industria
const industryIcons: { [key: string]: React.ReactNode } = {
  'Seguros': <Shield className="h-6 w-6" />,
  'Banca': <Briefcase className="h-6 w-6" />,
  'Telecomunicaciones': <Phone className="h-6 w-6" />,
  'Educación': <GraduationCap className="h-6 w-6" />
};

const Configuration: React.FC = () => {
  const [templates, setTemplates] = useState<AnalysisTemplate[]>([]);
  const [customConfigs, setCustomConfigs] = useState<CustomConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'apikeys' | 'templates'>('templates');

  // Estado para crear/editar configuración
  const [isCreating, setIsCreating] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<AnalysisTemplate | null>(null);
  const [editingConfig, setEditingConfig] = useState<CustomConfiguration | null>(null);

  // Formulario de nueva configuración
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    targetBrand: '',
    competitors: [] as string[],
    newCompetitor: '',
    questions: [] as AnalysisQuestion[],
    aiModels: ['chatgpt'] as string[]
  });

  // API Keys state
  const [apiKeys, setApiKeys] = useState({
    openai: '',
    anthropic: '',
    google: ''
  });
  const [showApiKeys, setShowApiKeys] = useState({
    openai: false,
    anthropic: false,
    google: false
  });

  useEffect(() => {
    loadData();
    loadApiKeys();
  }, []);

  // Auto-limpiar alertas
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const loadApiKeys = () => {
    const savedKeys = localStorage.getItem('userApiKeys');
    if (savedKeys) {
      try {
        const parsed = JSON.parse(savedKeys);
        setApiKeys(parsed);
      } catch (e) {
        console.error('Error loading API keys:', e);
      }
    }
  };

  const saveApiKeys = () => {
    try {
      localStorage.setItem('userApiKeys', JSON.stringify(apiKeys));
      setSuccess('API Keys guardadas correctamente');
    } catch (e) {
      setError('Error al guardar las API Keys');
    }
  };

  const clearApiKeys = () => {
    if (window.confirm('¿Eliminar todas las API Keys?')) {
      setApiKeys({ openai: '', anthropic: '', google: '' });
      localStorage.removeItem('userApiKeys');
      setSuccess('API Keys eliminadas');
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);

      // Cargar plantillas
      const templatesResponse = await fetch(`${API_BASE_URL}/api/templates`);
      if (templatesResponse.ok) {
        const data = await templatesResponse.json();
        if (data.success && data.data?.templates) {
          setTemplates(data.data.templates);
        }
      }

      // Cargar configuraciones personalizadas
      const configsResponse = await fetch(`${API_BASE_URL}/api/templates/configurations/all`);
      if (configsResponse.ok) {
        const data = await configsResponse.json();
        if (data.success && data.data) {
          setCustomConfigs(data.data);
        }
      }
    } catch (err) {
      setError('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const startNewConfig = (template?: AnalysisTemplate) => {
    setSelectedTemplate(template || null);
    setEditingConfig(null);

    const questions = template?.questions.map(q => ({
      id: q.id,
      text: q.question || q.text,
      category: q.category,
      enabled: true
    })) || [];

    setFormData({
      name: '',
      description: template?.description || '',
      targetBrand: '',
      competitors: [],
      newCompetitor: '',
      questions,
      aiModels: ['chatgpt']
    });
    setIsCreating(true);
  };

  const editConfig = (config: CustomConfiguration) => {
    setSelectedTemplate(null);
    setEditingConfig(config);
    setFormData({
      name: config.name,
      description: config.description || '',
      targetBrand: config.targetBrand,
      competitors: config.competitors || [],
      newCompetitor: '',
      questions: config.questions.map(q => ({
        id: q.id,
        text: q.text || q.question || '',
        category: q.category,
        enabled: true
      })),
      aiModels: config.aiModels || ['chatgpt']
    });
    setIsCreating(true);
  };

  const cancelCreate = () => {
    setIsCreating(false);
    setSelectedTemplate(null);
    setEditingConfig(null);
    setFormData({
      name: '',
      description: '',
      targetBrand: '',
      competitors: [],
      newCompetitor: '',
      questions: [],
      aiModels: ['chatgpt']
    });
  };

  const addCompetitor = () => {
    if (formData.newCompetitor.trim()) {
      setFormData(prev => ({
        ...prev,
        competitors: [...prev.competitors, prev.newCompetitor.trim()],
        newCompetitor: ''
      }));
    }
  };

  const removeCompetitor = (index: number) => {
    setFormData(prev => ({
      ...prev,
      competitors: prev.competitors.filter((_, i) => i !== index)
    }));
  };

  const addSuggestedBrand = (brand: string) => {
    if (!formData.competitors.includes(brand) && brand !== formData.targetBrand) {
      setFormData(prev => ({
        ...prev,
        competitors: [...prev.competitors, brand]
      }));
    }
  };

  const toggleQuestion = (index: number) => {
    setFormData(prev => ({
      ...prev,
      questions: prev.questions.map((q, i) =>
        i === index ? { ...q, enabled: !q.enabled } : q
      )
    }));
  };

  const addCustomQuestion = () => {
    const newId = `custom_${Date.now()}`;
    setFormData(prev => ({
      ...prev,
      questions: [...prev.questions, { id: newId, text: '', category: 'Personalizada', enabled: true }]
    }));
  };

  const updateQuestion = (index: number, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      questions: prev.questions.map((q, i) =>
        i === index ? { ...q, [field]: value } : q
      )
    }));
  };

  const removeQuestion = (index: number) => {
    setFormData(prev => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== index)
    }));
  };

  const toggleAiModel = (model: string) => {
    setFormData(prev => ({
      ...prev,
      aiModels: prev.aiModels.includes(model)
        ? prev.aiModels.filter(m => m !== model)
        : [...prev.aiModels, model]
    }));
  };

  const saveConfiguration = async () => {
    // Validación
    if (!formData.name.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    if (!formData.targetBrand.trim()) {
      setError('La marca objetivo es obligatoria');
      return;
    }
    if (formData.competitors.length === 0) {
      setError('Añade al menos un competidor');
      return;
    }
    const enabledQuestions = formData.questions.filter(q => q.enabled);
    if (enabledQuestions.length === 0) {
      setError('Selecciona al menos una pregunta');
      return;
    }
    if (formData.aiModels.length === 0) {
      setError('Selecciona al menos un modelo de IA');
      return;
    }

    try {
      const payload = {
        name: formData.name,
        description: formData.description,
        targetBrand: formData.targetBrand,
        competitorBrands: formData.competitors,
        aiModels: formData.aiModels,
        questions: enabledQuestions.map(q => ({
          id: q.id,
          question: q.text,
          category: q.category
        }))
      };

      const url = editingConfig
        ? `${API_BASE_URL}/api/templates/custom/${editingConfig.id}`
        : `${API_BASE_URL}/api/templates/custom`;

      const response = await fetch(url, {
        method: editingConfig ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setSuccess(editingConfig ? 'Configuración actualizada' : 'Configuración creada');
        cancelCreate();
        loadData();
      } else {
        throw new Error('Error al guardar');
      }
    } catch (err) {
      setError('Error al guardar la configuración');
    }
  };

  const deleteConfig = async (config: CustomConfiguration) => {
    if (!window.confirm(`¿Eliminar "${config.name}"?`)) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/templates/custom/${config.id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        setSuccess('Configuración eliminada');
        loadData();
      }
    } catch (err) {
      setError('Error al eliminar');
    }
  };

  const duplicateConfig = async (config: CustomConfiguration) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/templates/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: 'custom',
          sourceId: config.id,
          newName: `${config.name} (copia)`
        })
      });
      if (response.ok) {
        setSuccess('Configuración duplicada');
        loadData();
      }
    } catch (err) {
      setError('Error al duplicar');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-3">
            <Settings className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Configuración</h1>
          </div>
          <p className="text-gray-600 mt-2">
            Gestiona tus API Keys y plantillas de análisis
          </p>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <span className="text-red-700">{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span className="text-green-700">{success}</span>
            </div>
            <button onClick={() => setSuccess(null)} className="text-green-500 hover:text-green-700">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('templates')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'templates'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <FileText className="inline h-5 w-5 mr-2" />
                Plantillas de Análisis
              </button>
              <button
                onClick={() => setActiveTab('apikeys')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'apikeys'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Key className="inline h-5 w-5 mr-2" />
                API Keys
              </button>
            </nav>
          </div>
        </div>

        {/* Templates Tab */}
        {activeTab === 'templates' && !isCreating && (
          <div className="space-y-8">
            {/* Nueva Configuración */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Crear nueva configuración</h2>
              <p className="text-gray-600 mb-6">
                Elige una plantilla de industria como punto de partida o crea una desde cero
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Opción: Desde cero */}
                <button
                  onClick={() => startNewConfig()}
                  className="flex flex-col items-center p-6 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all group"
                >
                  <div className="p-3 bg-gray-100 rounded-full group-hover:bg-blue-100 mb-3">
                    <Plus className="h-6 w-6 text-gray-600 group-hover:text-blue-600" />
                  </div>
                  <span className="font-medium text-gray-700 group-hover:text-blue-700">Desde cero</span>
                  <span className="text-xs text-gray-500 mt-1">Personalizado</span>
                </button>

                {/* Plantillas de industria */}
                {templates.map(template => (
                  <button
                    key={template.id}
                    onClick={() => startNewConfig(template)}
                    className="flex flex-col items-center p-6 border-2 border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all group"
                  >
                    <div className="p-3 bg-gray-100 rounded-full group-hover:bg-blue-100 mb-3 text-gray-600 group-hover:text-blue-600">
                      {industryIcons[template.industry] || <Building className="h-6 w-6" />}
                    </div>
                    <span className="font-medium text-gray-700 group-hover:text-blue-700">{template.name}</span>
                    <span className="text-xs text-gray-500 mt-1">{template.questions.length} preguntas</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Mis Configuraciones */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Mis Configuraciones</h2>
                <p className="text-gray-600 text-sm mt-1">Configuraciones guardadas para usar en tus análisis</p>
              </div>

              {customConfigs.length === 0 ? (
                <div className="p-12 text-center">
                  <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No tienes configuraciones guardadas</p>
                  <p className="text-gray-400 text-sm mt-1">Crea una nueva usando las plantillas de arriba</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {customConfigs.map(config => (
                    <div key={config.id} className="p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900">{config.name}</h3>
                          <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                            <span className="flex items-center gap-1">
                              <Target className="h-4 w-4" />
                              {config.targetBrand}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="h-4 w-4" />
                              {config.competitors?.length || 0} competidores
                            </span>
                            <span className="flex items-center gap-1">
                              <HelpCircle className="h-4 w-4" />
                              {config.questions?.length || 0} preguntas
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => editConfig(config)}
                            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Editar"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => duplicateConfig(config)}
                            className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Duplicar"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => deleteConfig(config)}
                            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Formulario de Creación/Edición */}
        {activeTab === 'templates' && isCreating && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingConfig ? 'Editar configuración' : 'Nueva configuración'}
                </h2>
                {selectedTemplate && (
                  <p className="text-sm text-gray-500 mt-1">
                    Basada en plantilla: {selectedTemplate.name}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={cancelCreate}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveConfiguration}
                  className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  Guardar
                </button>
              </div>
            </div>

            <div className="p-6 space-y-8">
              {/* Información Básica */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nombre de la configuración *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Ej: Análisis Q4 2024 - Mi Marca"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Target className="inline h-4 w-4 mr-1" />
                    Tu marca (marca objetivo) *
                  </label>
                  <input
                    type="text"
                    value={formData.targetBrand}
                    onChange={(e) => setFormData(prev => ({ ...prev, targetBrand: e.target.value }))}
                    placeholder="Ej: Mi Empresa"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Competidores */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Users className="inline h-4 w-4 mr-1" />
                  Competidores *
                </label>

                {/* Marcas sugeridas */}
                {selectedTemplate?.suggestedBrands && selectedTemplate.suggestedBrands.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-gray-500 mb-2">Sugerencias (clic para añadir):</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedTemplate.suggestedBrands.map(brand => (
                        <button
                          key={brand}
                          onClick={() => addSuggestedBrand(brand)}
                          disabled={formData.competitors.includes(brand) || brand === formData.targetBrand}
                          className={`px-3 py-1 text-sm rounded-full transition-colors ${
                            formData.competitors.includes(brand)
                              ? 'bg-blue-100 text-blue-700 cursor-not-allowed'
                              : 'bg-gray-100 text-gray-700 hover:bg-blue-100 hover:text-blue-700'
                          }`}
                        >
                          {formData.competitors.includes(brand) && <Check className="inline h-3 w-3 mr-1" />}
                          {brand}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Lista de competidores añadidos */}
                {formData.competitors.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {formData.competitors.map((comp, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                      >
                        {comp}
                        <button
                          onClick={() => removeCompetitor(index)}
                          className="hover:text-blue-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Añadir competidor manualmente */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.newCompetitor}
                    onChange={(e) => setFormData(prev => ({ ...prev, newCompetitor: e.target.value }))}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addCompetitor())}
                    placeholder="Añadir competidor..."
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    onClick={addCompetitor}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Modelos de IA */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Sparkles className="inline h-4 w-4 mr-1" />
                  Modelos de IA para el análisis *
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { id: 'chatgpt', name: 'ChatGPT', color: 'green' },
                    { id: 'claude', name: 'Claude', color: 'orange' },
                    { id: 'gemini', name: 'Gemini', color: 'blue' },
                    { id: 'perplexity', name: 'Perplexity', color: 'purple' }
                  ].map(model => (
                    <button
                      key={model.id}
                      onClick={() => toggleAiModel(model.id)}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        formData.aiModels.includes(model.id)
                          ? `border-${model.color}-500 bg-${model.color}-50`
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`font-medium ${formData.aiModels.includes(model.id) ? `text-${model.color}-700` : 'text-gray-700'}`}>
                          {model.name}
                        </span>
                        {formData.aiModels.includes(model.id) && (
                          <Check className={`h-5 w-5 text-${model.color}-600`} />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Preguntas */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <label className="block text-sm font-medium text-gray-700">
                    <HelpCircle className="inline h-4 w-4 mr-1" />
                    Preguntas del análisis *
                  </label>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-500">
                      {formData.questions.filter(q => q.enabled).length}/{formData.questions.length} seleccionadas
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const categoryName = window.prompt('Nombre de la nueva categoría:');
                          if (categoryName?.trim()) {
                            const newId = `custom_${Date.now()}`;
                            setFormData(prev => ({
                              ...prev,
                              questions: [...prev.questions, { id: newId, text: '', category: categoryName.trim(), enabled: true }]
                            }));
                          }
                        }}
                        className="text-sm text-gray-600 hover:text-gray-800 flex items-center gap-1"
                      >
                        <Plus className="h-4 w-4" />
                        Nueva categoría
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        onClick={addCustomQuestion}
                        className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                      >
                        <Plus className="h-4 w-4" />
                        Añadir pregunta
                      </button>
                    </div>
                  </div>
                </div>

                {/* Acciones masivas */}
                {formData.questions.length > 0 && (
                  <div className="flex items-center gap-2 mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <span className="text-sm text-gray-600 mr-2">Acciones:</span>
                    <button
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        questions: prev.questions.map(q => ({ ...q, enabled: true }))
                      }))}
                      className="px-3 py-1.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                    >
                      Seleccionar todas
                    </button>
                    <button
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        questions: prev.questions.map(q => ({ ...q, enabled: false }))
                      }))}
                      className="px-3 py-1.5 text-xs font-medium bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                    >
                      Deseleccionar todas
                    </button>
                    <div className="h-4 w-px bg-gray-300 mx-2" />
                    <span className="text-sm text-gray-600">Por categoría:</span>
                    <div className="flex flex-wrap gap-1">
                      {Object.keys(
                        formData.questions.reduce((acc, q) => {
                          const cat = q.category || 'Sin categoría';
                          acc[cat] = true;
                          return acc;
                        }, {} as { [key: string]: boolean })
                      ).map(category => {
                        const catQuestions = formData.questions.filter(q => (q.category || 'Sin categoría') === category);
                        const allSelected = catQuestions.every(q => q.enabled);
                        return (
                          <button
                            key={category}
                            onClick={() => setFormData(prev => ({
                              ...prev,
                              questions: prev.questions.map(q =>
                                (q.category || 'Sin categoría') === category
                                  ? { ...q, enabled: !allSelected }
                                  : q
                              )
                            }))}
                            className={`px-2 py-1 text-xs rounded-full transition-colors ${
                              allSelected
                                ? 'bg-blue-600 text-white hover:bg-blue-700'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                            title={allSelected ? `Deseleccionar ${category}` : `Seleccionar ${category}`}
                          >
                            {category.length > 15 ? category.substring(0, 15) + '...' : category}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Agrupar por categoría */}
                {formData.questions.length > 0 ? (
                  <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                    {Object.entries(
                      formData.questions.reduce((acc, q, index) => {
                        const cat = q.category || 'Sin categoría';
                        if (!acc[cat]) acc[cat] = [];
                        acc[cat].push({ ...q, index });
                        return acc;
                      }, {} as { [key: string]: (AnalysisQuestion & { index: number })[] })
                    ).map(([category, questions]) => {
                      const allCatSelected = questions.every(q => q.enabled);
                      const someCatSelected = questions.some(q => q.enabled);
                      return (
                      <div key={category} className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setFormData(prev => ({
                                ...prev,
                                questions: prev.questions.map(q =>
                                  (q.category || 'Sin categoría') === category
                                    ? { ...q, enabled: !allCatSelected }
                                    : q
                                )
                              }))}
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                allCatSelected
                                  ? 'bg-blue-600 border-blue-600 text-white'
                                  : someCatSelected
                                    ? 'bg-blue-200 border-blue-400'
                                    : 'border-gray-300'
                              }`}
                            >
                              {allCatSelected && <Check className="h-3 w-3" />}
                              {!allCatSelected && someCatSelected && <div className="w-2 h-2 bg-blue-600 rounded-sm" />}
                            </button>
                            <input
                              type="text"
                              value={category}
                              onChange={(e) => {
                                const newCategory = e.target.value;
                                setFormData(prev => ({
                                  ...prev,
                                  questions: prev.questions.map(q =>
                                    (q.category || 'Sin categoría') === category
                                      ? { ...q, category: newCategory }
                                      : q
                                  )
                                }));
                              }}
                              className="font-medium text-gray-700 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none px-1 -ml-1"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500 text-sm">
                              {questions.filter(q => q.enabled).length}/{questions.length}
                            </span>
                            <button
                              onClick={() => {
                                if (window.confirm(`¿Eliminar todas las preguntas de "${category}"?`)) {
                                  const indicesToRemove = questions.map(q => q.index);
                                  setFormData(prev => ({
                                    ...prev,
                                    questions: prev.questions.filter((_, i) => !indicesToRemove.includes(i))
                                  }));
                                }
                              }}
                              className="p-1 text-gray-400 hover:text-red-500 rounded"
                              title="Eliminar categoría"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className="divide-y divide-gray-100">
                          {questions.map((question) => (
                            <div
                              key={question.id}
                              className={`p-3 flex items-start gap-3 group ${question.enabled ? '' : 'bg-gray-50 opacity-60'}`}
                            >
                              <button
                                onClick={() => toggleQuestion(question.index)}
                                className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                  question.enabled
                                    ? 'bg-blue-600 border-blue-600 text-white'
                                    : 'border-gray-300'
                                }`}
                              >
                                {question.enabled && <Check className="h-3 w-3" />}
                              </button>
                              <div className="flex-1">
                                <input
                                  type="text"
                                  value={question.text}
                                  onChange={(e) => updateQuestion(question.index, 'text', e.target.value)}
                                  placeholder="Escribe tu pregunta..."
                                  className="w-full px-2 py-1 bg-transparent border border-transparent rounded hover:border-gray-300 focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500 text-gray-800"
                                />
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <select
                                  value={question.category}
                                  onChange={(e) => updateQuestion(question.index, 'category', e.target.value)}
                                  className="text-xs px-2 py-1 border border-gray-300 rounded bg-white text-gray-600 focus:ring-1 focus:ring-blue-500"
                                  title="Cambiar categoría"
                                >
                                  {Object.keys(
                                    formData.questions.reduce((acc, q) => {
                                      acc[q.category || 'Sin categoría'] = true;
                                      return acc;
                                    }, {} as { [key: string]: boolean })
                                  ).map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => removeQuestion(question.index)}
                                  className="p-1 text-gray-400 hover:text-red-500 rounded"
                                  title="Eliminar pregunta"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                    <HelpCircle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-500">No hay preguntas</p>
                    <button
                      onClick={addCustomQuestion}
                      className="mt-2 text-blue-600 hover:text-blue-700 text-sm"
                    >
                      Añadir primera pregunta
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* API Keys Tab */}
        {activeTab === 'apikeys' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Tus API Keys</h2>
              <p className="text-gray-600">
                Las claves se guardan en tu navegador y se usan para hacer llamadas a los proveedores de IA.
              </p>
            </div>

            <div className="space-y-6">
              {/* OpenAI */}
              <div className="border border-gray-200 rounded-lg p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <Key className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">OpenAI (ChatGPT)</h3>
                      <p className="text-sm text-gray-500">Para usar GPT-4 en análisis</p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs ${apiKeys.openai ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {apiKeys.openai ? 'Configurada' : 'No configurada'}
                  </span>
                </div>
                <div className="relative">
                  <input
                    type={showApiKeys.openai ? 'text' : 'password'}
                    value={apiKeys.openai}
                    onChange={(e) => setApiKeys(prev => ({ ...prev, openai: e.target.value }))}
                    placeholder="sk-..."
                    className="w-full px-4 py-2.5 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  />
                  <button
                    onClick={() => setShowApiKeys(prev => ({ ...prev, openai: !prev.openai }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showApiKeys.openai ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {/* Anthropic */}
              <div className="border border-gray-200 rounded-lg p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-100 rounded-lg">
                      <Key className="h-5 w-5 text-orange-600" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">Anthropic (Claude)</h3>
                      <p className="text-sm text-gray-500">Para usar Claude en análisis</p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs ${apiKeys.anthropic ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                    {apiKeys.anthropic ? 'Configurada' : 'No configurada'}
                  </span>
                </div>
                <div className="relative">
                  <input
                    type={showApiKeys.anthropic ? 'text' : 'password'}
                    value={apiKeys.anthropic}
                    onChange={(e) => setApiKeys(prev => ({ ...prev, anthropic: e.target.value }))}
                    placeholder="sk-ant-..."
                    className="w-full px-4 py-2.5 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  />
                  <button
                    onClick={() => setShowApiKeys(prev => ({ ...prev, anthropic: !prev.anthropic }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showApiKeys.anthropic ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {/* Google */}
              <div className="border border-gray-200 rounded-lg p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Key className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">Google AI (Gemini)</h3>
                      <p className="text-sm text-gray-500">Para usar Gemini en análisis</p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs ${apiKeys.google ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                    {apiKeys.google ? 'Configurada' : 'No configurada'}
                  </span>
                </div>
                <div className="relative">
                  <input
                    type={showApiKeys.google ? 'text' : 'password'}
                    value={apiKeys.google}
                    onChange={(e) => setApiKeys(prev => ({ ...prev, google: e.target.value }))}
                    placeholder="AIza..."
                    className="w-full px-4 py-2.5 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  />
                  <button
                    onClick={() => setShowApiKeys(prev => ({ ...prev, google: !prev.google }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showApiKeys.google ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Botones */}
            <div className="mt-8 flex items-center justify-between pt-6 border-t border-gray-200">
              <button
                onClick={clearApiKeys}
                className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Eliminar todas
              </button>
              <button
                onClick={saveApiKeys}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                Guardar API Keys
              </button>
            </div>

            {/* Info */}
            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-900 mb-1">Privacidad</h4>
                  <p className="text-sm text-blue-800">
                    Tus claves se guardan solo en tu navegador (localStorage). No se envían a nuestros servidores.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Configuration;

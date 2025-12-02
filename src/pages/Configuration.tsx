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
  Globe,
  Key,
  Eye,
  EyeOff
} from 'lucide-react';
import API_BASE_URL from '../config/api';

interface AnalysisQuestion {
  id: string;
  text: string;
  category: string;
}

interface AnalysisTemplate {
  id: string;
  name: string;
  description: string;
  targetBrand: string;
  competitors: string[];
  questions: AnalysisQuestion[];
  prioritySources: string[];
  aiModels?: string[];
}

interface CustomConfiguration extends AnalysisTemplate {
  createdAt: string;
  updatedAt: string;
}

const Configuration: React.FC = () => {
  const [templates, setTemplates] = useState<AnalysisTemplate[]>([]);
  const [customConfigs, setCustomConfigs] = useState<CustomConfiguration[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<AnalysisTemplate | CustomConfiguration | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editForm, setEditForm] = useState<Partial<AnalysisTemplate>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'templates' | 'apikeys'>('templates');

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
      setSuccess('API Keys guardadas exitosamente');
    } catch (e) {
      setError('Error al guardar las API Keys');
      console.error('Error saving API keys:', e);
    }
  };

  const clearApiKeys = () => {
    if (window.confirm('¿Estás seguro de que quieres eliminar todas las API Keys?')) {
      setApiKeys({
        openai: '',
        anthropic: '',
        google: ''
      });
      localStorage.removeItem('userApiKeys');
      setSuccess('API Keys eliminadas exitosamente');
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Cargar plantillas predefinidas
      const templatesResponse = await fetch(`${API_BASE_URL}/api/templates`);
      if (templatesResponse.ok) {
        const templatesData = await templatesResponse.json();
        if (templatesData.success && templatesData.data && templatesData.data.templates) {
          setTemplates(templatesData.data.templates);
        } else {
          setTemplates([]);
        }
      } else {
        setTemplates([]);
      }

      // Cargar configuraciones personalizadas
      const configsResponse = await fetch(`${API_BASE_URL}/api/templates/configurations/all`);
      if (configsResponse.ok) {
        const configsData = await configsResponse.json();
        if (configsData.success && configsData.data) {
          setCustomConfigs(configsData.data);
        } else {
          setCustomConfigs([]);
        }
      } else {
        setCustomConfigs([]);
      }
    } catch (err) {
      setError('Error al cargar las configuraciones');
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = () => {
    setEditForm({
      name: '',
      description: '',
      targetBrand: '',
      competitors: [],
      questions: [],
      prioritySources: [],
      aiModels: ['chatgpt', 'claude', 'gemini']
    });
    setIsCreating(true);
    setIsEditing(true);
    setSelectedConfig(null);
  };

  const handleEdit = (config: AnalysisTemplate | CustomConfiguration) => {
    setEditForm({ 
      ...config,
      competitors: config.competitors || [],
      questions: config.questions || [],
      prioritySources: config.prioritySources || [],
      aiModels: config.aiModels || ['chatgpt', 'claude', 'gemini']
    });
    setSelectedConfig(config);
    setIsEditing(true);
    setIsCreating(false);
  };

  const handleDuplicate = async (config: AnalysisTemplate | CustomConfiguration) => {
    try {
      const isTemplate = !('createdAt' in config);
      const response = await fetch(`${API_BASE_URL}/api/templates/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: isTemplate ? 'template' : 'custom',
          sourceId: config.id,
          newName: `Copia de ${config.name}`
        })
      });

      if (response.ok) {
        setSuccess('Configuración duplicada exitosamente');
        loadData();
      } else {
        throw new Error('Error al duplicar configuración');
      }
    } catch (err) {
      setError('Error al duplicar la configuración');
    }
  };

  const handleDelete = async (config: CustomConfiguration) => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar esta configuración?')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/templates/custom/${config.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setSuccess('Configuración eliminada exitosamente');
        loadData();
        if (selectedConfig?.id === config.id) {
          setSelectedConfig(null);
        }
      } else {
        throw new Error('Error al eliminar configuración');
      }
    } catch (err) {
      setError('Error al eliminar la configuración');
    }
  };

  const handleSave = async () => {
    try {
      if (!editForm.name || !editForm.targetBrand || !editForm.competitors?.length || !editForm.questions?.length) {
        setError('Por favor completa todos los campos requeridos');
        return;
      }

      const url = isCreating ? `${API_BASE_URL}/api/templates/custom` : `${API_BASE_URL}/api/templates/custom/${selectedConfig?.id}`;
      const method = isCreating ? 'POST' : 'PUT';

      // Transformar datos del frontend al formato del backend
      const payload = {
        name: editForm.name,
        description: editForm.description || '',
        targetBrand: editForm.targetBrand,
        competitorBrands: editForm.competitors || [], // competitors -> competitorBrands
        prioritySources: editForm.prioritySources || [],
        aiModels: editForm.aiModels || ['chatgpt'],
        questions: (editForm.questions || []).map(q => ({
          id: q.id,
          question: q.text, // text -> question
          category: q.category
        }))
      };

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setSuccess(isCreating ? 'Configuración creada exitosamente' : 'Configuración actualizada exitosamente');
        setIsEditing(false);
        setIsCreating(false);
        loadData();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al guardar configuración');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar la configuración');
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setIsCreating(false);
    setEditForm({});
  };

  const addCompetitor = () => {
    setEditForm(prev => ({
      ...prev,
      competitors: [...(prev.competitors || []), '']
    }));
  };

  const removeCompetitor = (index: number) => {
    setEditForm(prev => ({
      ...prev,
      competitors: prev.competitors?.filter((_, i) => i !== index) || []
    }));
  };

  const updateCompetitor = (index: number, value: string) => {
    setEditForm(prev => ({
      ...prev,
      competitors: prev.competitors?.map((comp, i) => i === index ? value : comp) || []
    }));
  };

  const addQuestion = () => {
    const newId = `q${(editForm.questions?.length || 0) + 1}`;
    setEditForm(prev => ({
      ...prev,
      questions: [...(prev.questions || []), { id: newId, text: '', category: '' }]
    }));
  };

  const removeQuestion = (index: number) => {
    setEditForm(prev => ({
      ...prev,
      questions: prev.questions?.filter((_, i) => i !== index) || []
    }));
  };

  const updateQuestion = (index: number, field: keyof AnalysisQuestion, value: string) => {
    setEditForm(prev => ({
      ...prev,
      questions: prev.questions?.map((q, i) => 
        i === index ? { ...q, [field]: value } : q
      ) || []
    }));
  };

  const addPrioritySource = () => {
    setEditForm(prev => ({
      ...prev,
      prioritySources: [...(prev.prioritySources || []), '']
    }));
  };

  const removePrioritySource = (index: number) => {
    setEditForm(prev => ({
      ...prev,
      prioritySources: prev.prioritySources?.filter((_, i) => i !== index) || []
    }));
  };

  const updatePrioritySource = (index: number, value: string) => {
    setEditForm(prev => ({
      ...prev,
      prioritySources: prev.prioritySources?.map((source, i) => i === index ? value : source) || []
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Settings className="h-8 w-8 text-blue-600" />
              <h1 className="text-3xl font-bold text-gray-900">Configuración</h1>
            </div>
            {activeTab === 'templates' && (
              <button
                onClick={handleCreateNew}
                className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="h-5 w-5" />
                <span>Nueva Configuración</span>
              </button>
            )}
          </div>
          <p className="text-gray-600 mt-2">
            Gestiona tus API Keys y configura plantillas personalizadas para tus análisis
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
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
              <button
                onClick={() => setActiveTab('templates')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'templates'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Building className="inline h-5 w-5 mr-2" />
                Plantillas de Análisis
              </button>
            </nav>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center space-x-3">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <span className="text-red-700">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center space-x-3">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <span className="text-green-700">{success}</span>
            <button onClick={() => setSuccess(null)} className="ml-auto text-green-500 hover:text-green-700">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* API Keys Section */}
        {activeTab === 'apikeys' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Configura tus API Keys</h2>
              <p className="text-gray-600">
                Ingresa tus propias API Keys para usar los servicios de IA. Tus claves se guardan de forma segura en tu navegador y nunca se envían a nuestros servidores.
              </p>
            </div>

            <div className="space-y-6">
              {/* OpenAI API Key */}
              <div className="border border-gray-200 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <Key className="h-6 w-6 text-green-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">OpenAI API Key</h3>
                      <p className="text-sm text-gray-500">Para usar ChatGPT en tus análisis</p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    apiKeys.openai ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {apiKeys.openai ? 'Configurada' : 'No configurada'}
                  </span>
                </div>
                <div className="relative">
                  <input
                    type={showApiKeys.openai ? 'text' : 'password'}
                    value={apiKeys.openai}
                    onChange={(e) => setApiKeys(prev => ({ ...prev, openai: e.target.value }))}
                    placeholder="sk-..."
                    className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKeys(prev => ({ ...prev, openai: !prev.openai }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showApiKeys.openai ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Obtén tu API key en <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">platform.openai.com</a>
                </p>
              </div>

              {/* Anthropic API Key */}
              <div className="border border-gray-200 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-orange-100 rounded-lg">
                      <Key className="h-6 w-6 text-orange-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Anthropic API Key</h3>
                      <p className="text-sm text-gray-500">Para usar Claude en tus análisis</p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    apiKeys.anthropic ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {apiKeys.anthropic ? 'Configurada' : 'No configurada'}
                  </span>
                </div>
                <div className="relative">
                  <input
                    type={showApiKeys.anthropic ? 'text' : 'password'}
                    value={apiKeys.anthropic}
                    onChange={(e) => setApiKeys(prev => ({ ...prev, anthropic: e.target.value }))}
                    placeholder="sk-ant-..."
                    className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKeys(prev => ({ ...prev, anthropic: !prev.anthropic }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showApiKeys.anthropic ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Obtén tu API key en <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">console.anthropic.com</a>
                </p>
              </div>

              {/* Google API Key */}
              <div className="border border-gray-200 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Key className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Google AI API Key</h3>
                      <p className="text-sm text-gray-500">Para usar Gemini en tus análisis</p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    apiKeys.google ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {apiKeys.google ? 'Configurada' : 'No configurada'}
                  </span>
                </div>
                <div className="relative">
                  <input
                    type={showApiKeys.google ? 'text' : 'password'}
                    value={apiKeys.google}
                    onChange={(e) => setApiKeys(prev => ({ ...prev, google: e.target.value }))}
                    placeholder="AIza..."
                    className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKeys(prev => ({ ...prev, google: !prev.google }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showApiKeys.google ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Obtén tu API key en <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">makersuite.google.com</a>
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-8 flex items-center justify-between pt-6 border-t border-gray-200">
              <button
                onClick={clearApiKeys}
                className="flex items-center space-x-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 className="h-5 w-5" />
                <span>Eliminar todas las claves</span>
              </button>
              <button
                onClick={saveApiKeys}
                className="flex items-center space-x-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Save className="h-5 w-5" />
                <span>Guardar API Keys</span>
              </button>
            </div>

            {/* Info Box */}
            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-blue-900 mb-1">Seguridad y Privacidad</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• Tus API Keys se guardan únicamente en tu navegador (localStorage)</li>
                    <li>• Nunca se envían a nuestros servidores</li>
                    <li>• Solo se usan para hacer llamadas directas a los proveedores de IA</li>
                    <li>• Si no configuras claves, se usarán las claves del sistema (limitadas)</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Templates Section */}
        {activeTab === 'templates' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lista de Configuraciones */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Configuraciones</h2>
              </div>
              
              <div className="divide-y divide-gray-200">
                {/* Plantillas Predefinidas */}
                <div className="p-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Plantillas Predefinidas</h3>
                  <div className="space-y-2">
                    {Array.isArray(templates) && templates.map((template) => (
                      <div
                        key={template.id}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedConfig?.id === template.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => setSelectedConfig(template)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium text-gray-900">{template.name}</h4>
                            <p className="text-sm text-gray-600">{template.description}</p>
                          </div>
                          <div className="flex space-x-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDuplicate(template);
                              }}
                              className="p-1 text-gray-400 hover:text-gray-600"
                              title="Duplicar"
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Configuraciones Personalizadas */}
                <div className="p-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Configuraciones Personalizadas</h3>
                  <div className="space-y-2">
                    {Array.isArray(customConfigs) && customConfigs.map((config) => (
                      <div
                        key={config.id}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedConfig?.id === config.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => setSelectedConfig(config)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium text-gray-900">{config.name}</h4>
                            <p className="text-sm text-gray-600">{config.description}</p>
                            <p className="text-xs text-gray-500">
                              Actualizado: {new Date(config.updatedAt).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex space-x-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(config);
                              }}
                              className="p-1 text-gray-400 hover:text-gray-600"
                              title="Editar"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDuplicate(config);
                              }}
                              className="p-1 text-gray-400 hover:text-gray-600"
                              title="Duplicar"
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(config);
                              }}
                              className="p-1 text-gray-400 hover:text-red-600"
                              title="Eliminar"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Panel de Detalles/Edición */}
          <div className="lg:col-span-2">
            {isEditing ? (
              /* Formulario de Edición */
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {isCreating ? 'Nueva Configuración' : 'Editar Configuración'}
                  </h2>
                  <div className="flex space-x-2">
                    <button
                      onClick={handleSave}
                      className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Save className="h-4 w-4" />
                      <span>Guardar</span>
                    </button>
                    <button
                      onClick={handleCancel}
                      className="flex items-center space-x-2 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 transition-colors"
                    >
                      <X className="h-4 w-4" />
                      <span>Cancelar</span>
                    </button>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  {/* Información Básica */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Nombre *
                      </label>
                      <input
                        type="text"
                        value={editForm.name || ''}
                        onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Nombre de la configuración"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <Target className="inline h-4 w-4 mr-1" />
                        Marca Objetivo *
                      </label>
                      <input
                        type="text"
                        value={editForm.targetBrand || ''}
                        onChange={(e) => setEditForm(prev => ({ ...prev, targetBrand: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Nombre de la marca a analizar"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Descripción
                    </label>
                    <textarea
                      value={editForm.description || ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Descripción de la configuración"
                    />
                  </div>

                  {/* Competidores */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm font-medium text-gray-700">
                        <Users className="inline h-4 w-4 mr-1" />
                        Competidores *
                      </label>
                      <button
                        onClick={addCompetitor}
                        className="text-blue-600 hover:text-blue-700 text-sm"
                      >
                        + Agregar Competidor
                      </button>
                    </div>
                    <div className="space-y-2">
                      {editForm.competitors?.map((competitor, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={competitor || ''}
                            onChange={(e) => updateCompetitor(index, e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Nombre del competidor"
                          />
                          <button
                            onClick={() => removeCompetitor(index)}
                            className="p-2 text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Preguntas */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm font-medium text-gray-700">
                        <HelpCircle className="inline h-4 w-4 mr-1" />
                        Preguntas de Análisis *
                      </label>
                      <button
                        onClick={addQuestion}
                        className="text-blue-600 hover:text-blue-700 text-sm"
                      >
                        + Agregar Pregunta
                      </button>
                    </div>
                    <div className="space-y-4">
                      {editForm.questions?.map((question, index) => (
                        <div key={index} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-medium text-gray-700">Pregunta {index + 1}</h4>
                            <button
                              onClick={() => removeQuestion(index)}
                              className="p-1 text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="md:col-span-2">
                              <input
                                type="text"
                                value={question.text || ''}
                                onChange={(e) => updateQuestion(index, 'text', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Texto de la pregunta"
                              />
                            </div>
                            <div>
                              <input
                                type="text"
                                value={question.category || ''}
                                onChange={(e) => updateQuestion(index, 'category', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Categoría"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Modelos de IA */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm font-medium text-gray-700">
                        <Users className="inline h-4 w-4 mr-1" />
                        Modelos de IA para Análisis *
                      </label>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {['chatgpt', 'claude', 'gemini', 'perplexity'].map((model) => (
                        <label key={model} className="flex items-center space-x-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editForm.aiModels?.includes(model) || false}
                            onChange={(e) => {
                              const currentModels = editForm.aiModels || [];
                              if (e.target.checked) {
                                setEditForm(prev => ({
                                  ...prev,
                                  aiModels: [...currentModels, model]
                                }));
                              } else {
                                setEditForm(prev => ({
                                  ...prev,
                                  aiModels: currentModels.filter(m => m !== model)
                                }));
                              }
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm font-medium text-gray-700 capitalize">
                            {model === 'chatgpt' ? 'ChatGPT' : 
                             model === 'claude' ? 'Claude' : 
                             model === 'gemini' ? 'Gemini' : 
                             'Perplexity'}
                          </span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Selecciona al menos un modelo de IA para el análisis. Cada modelo proporcionará una perspectiva diferente.
                    </p>
                  </div>

                  {/* Fuentes Prioritarias */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm font-medium text-gray-700">
                        <Globe className="inline h-4 w-4 mr-1" />
                        Fuentes Prioritarias *
                      </label>
                      <button
                        onClick={addPrioritySource}
                        className="text-blue-600 hover:text-blue-700 text-sm"
                      >
                        + Agregar Fuente
                      </button>
                    </div>
                    <div className="space-y-2">
                      {editForm.prioritySources?.map((source, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={source}
                            onChange={(e) => updatePrioritySource(index, e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Dominio de la fuente (ej: marca.com)"
                          />
                          <button
                            onClick={() => removePrioritySource(index)}
                            className="p-2 text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : selectedConfig ? (
              /* Vista de Detalles */
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">{selectedConfig?.name || 'Sin nombre'}</h2>
                  <div className="flex space-x-2">
                    {selectedConfig && 'createdAt' in selectedConfig && (
                      <button
                        onClick={() => handleEdit(selectedConfig)}
                        className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        <Edit3 className="h-4 w-4" />
                        <span>Editar</span>
                      </button>
                    )}
                    {selectedConfig && (
                      <button
                        onClick={() => handleDuplicate(selectedConfig)}
                        className="flex items-center space-x-2 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
                      >
                        <Copy className="h-4 w-4" />
                        <span>Duplicar</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Descripción</h3>
                    <p className="text-gray-900">{selectedConfig?.description || 'Sin descripción'}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                        <Target className="h-4 w-4 mr-1" />
                        Marca Objetivo
                      </h3>
                      <p className="text-gray-900 font-medium">{selectedConfig?.targetBrand || 'Sin marca objetivo'}</p>
                    </div>

                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                        <Users className="h-4 w-4 mr-1" />
                        Competidores ({selectedConfig.competitors?.length || 0})
                      </h3>
                      <div className="space-y-1">
                        {selectedConfig.competitors?.map((competitor, index) => (
                          <span key={index} className="inline-block bg-gray-100 text-gray-800 px-2 py-1 rounded text-sm mr-2 mb-1">
                            {competitor}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                      <HelpCircle className="h-4 w-4 mr-1" />
                      Preguntas de Análisis ({selectedConfig.questions?.length || 0})
                    </h3>
                    <div className="space-y-3">
                      {selectedConfig.questions?.map((question, index) => (
                        <div key={question.id} className="border border-gray-200 rounded-lg p-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="text-gray-900">{question.text}</p>
                              <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs mt-2">
                                {question.category}
                              </span>
                            </div>
                            <span className="text-sm text-gray-500 ml-4">#{index + 1}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                      <Users className="h-4 w-4 mr-1" />
                      Modelos de IA ({selectedConfig.aiModels?.length || 0})
                    </h3>
                    <div className="space-y-1">
                      {selectedConfig.aiModels?.map((model, index) => (
                        <span key={index} className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm mr-2 mb-1">
                          {model === 'chatgpt' ? 'ChatGPT' : 
                           model === 'claude' ? 'Claude' : 
                           model === 'gemini' ? 'Gemini' : 
                           model === 'perplexity' ? 'Perplexity' : model}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                      <Globe className="h-4 w-4 mr-1" />
                      Fuentes Prioritarias ({selectedConfig.prioritySources?.length || 0})
                    </h3>
                    <div className="space-y-1">
                      {selectedConfig.prioritySources?.map((source, index) => (
                        <span key={index} className="inline-block bg-green-100 text-green-800 px-2 py-1 rounded text-sm mr-2 mb-1">
                          {source}
                        </span>
                      ))}
                    </div>
                  </div>

                  {'createdAt' in selectedConfig && (
                    <div className="pt-4 border-t border-gray-200">
                      <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                        <div>
                          <span className="font-medium">Creado:</span> {new Date(selectedConfig.createdAt).toLocaleString()}
                        </div>
                        <div>
                          <span className="font-medium">Actualizado:</span> {new Date(selectedConfig.updatedAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Estado Vacío */
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                <Building className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Selecciona una configuración</h3>
                <p className="text-gray-600 mb-6">
                  Elige una plantilla predefinida o configuración personalizada para ver sus detalles
                </p>
                <button
                  onClick={handleCreateNew}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Crear Nueva Configuración
                </button>
              </div>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
};

export default Configuration;
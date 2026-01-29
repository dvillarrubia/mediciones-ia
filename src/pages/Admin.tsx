/**
 * Panel de Administración
 * Gestión de whitelist de emails/dominios y modelos de IA
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield,
  Mail,
  Globe,
  Trash2,
  Plus,
  Users,
  AlertCircle,
  Check,
  LogOut,
  Lock,
  ToggleLeft,
  ToggleRight,
  Bot,
  Sparkles,
  RefreshCw,
  Edit2,
  X,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import API_BASE_URL from '../config/api';

interface WhitelistConfig {
  emails: string[];
  domains: string[];
  restrictionEnabled: boolean;
}

interface UserInfo {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

interface AIModel {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic' | 'google';
  description: string;
  strengths: string[];
  contextWindow: string;
  pricing: string;
  recommended: boolean;
  enabled: boolean;
  requiresApiKey: string;
  order: number;
}

export default function Admin() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [config, setConfig] = useState<WhitelistConfig | null>(null);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [aiModels, setAiModels] = useState<AIModel[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showAddModel, setShowAddModel] = useState(false);
  const [editingModel, setEditingModel] = useState<AIModel | null>(null);
  const [newModel, setNewModel] = useState({
    id: '',
    name: '',
    provider: 'openai' as 'openai' | 'anthropic' | 'google',
    description: '',
    strengths: '',
    contextWindow: '',
    pricing: '',
    recommended: false,
    requiresApiKey: 'OPENAI_API_KEY'
  });
  const [activeTab, setActiveTab] = useState<'users' | 'models'>('users');

  // Verificar si ya hay token guardado
  useEffect(() => {
    const savedToken = localStorage.getItem('admin_token');
    if (savedToken) {
      setAuthToken(savedToken);
      setIsAuthenticated(true);
    }
  }, []);

  // Cargar datos cuando se autentica
  useEffect(() => {
    if (isAuthenticated && authToken) {
      loadData();
    }
  }, [isAuthenticated, authToken]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Credenciales inválidas');
      }

      localStorage.setItem('admin_token', data.token);
      setAuthToken(data.token);
      setIsAuthenticated(true);
    } catch (err: any) {
      setLoginError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    setAuthToken(null);
    setIsAuthenticated(false);
    setConfig(null);
    setUsers([]);
  };

  const loadData = async () => {
    if (!authToken) return;

    try {
      const headers = {
        'Authorization': `Basic ${authToken}`
      };

      const [configRes, usersRes, modelsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/whitelist`, { headers }),
        fetch(`${API_BASE_URL}/api/admin/users`, { headers }),
        fetch(`${API_BASE_URL}/api/admin/ai-models`, { headers })
      ]);

      if (configRes.ok) {
        const configData = await configRes.json();
        setConfig(configData);
      }

      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsers(usersData.users || []);
      }

      if (modelsRes.ok) {
        const modelsData = await modelsRes.json();
        setAiModels(modelsData.models || []);
      }
    } catch (error) {
      console.error('Error cargando datos:', error);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const addEmail = async () => {
    if (!newEmail || !authToken) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/whitelist/emails`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authToken}`
        },
        body: JSON.stringify({ email: newEmail })
      });

      if (response.ok) {
        setNewEmail('');
        loadData();
        showMessage('success', 'Email añadido al whitelist');
      } else {
        const data = await response.json();
        showMessage('error', data.error || 'Error al añadir email');
      }
    } catch (error) {
      showMessage('error', 'Error de conexión');
    }
  };

  const removeEmail = async (emailToRemove: string) => {
    if (!authToken) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/whitelist/emails/${encodeURIComponent(emailToRemove)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Basic ${authToken}` }
      });

      if (response.ok) {
        loadData();
        showMessage('success', 'Email eliminado del whitelist');
      }
    } catch (error) {
      showMessage('error', 'Error al eliminar email');
    }
  };

  const addDomain = async () => {
    if (!newDomain || !authToken) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/whitelist/domains`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authToken}`
        },
        body: JSON.stringify({ domain: newDomain })
      });

      if (response.ok) {
        setNewDomain('');
        loadData();
        showMessage('success', 'Dominio añadido al whitelist');
      } else {
        const data = await response.json();
        showMessage('error', data.error || 'Error al añadir dominio');
      }
    } catch (error) {
      showMessage('error', 'Error de conexión');
    }
  };

  const removeDomain = async (domainToRemove: string) => {
    if (!authToken) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/whitelist/domains/${encodeURIComponent(domainToRemove)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Basic ${authToken}` }
      });

      if (response.ok) {
        loadData();
        showMessage('success', 'Dominio eliminado del whitelist');
      }
    } catch (error) {
      showMessage('error', 'Error al eliminar dominio');
    }
  };

  const toggleRestriction = async () => {
    if (!authToken || !config) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/whitelist/restrict`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authToken}`
        },
        body: JSON.stringify({ enabled: !config.restrictionEnabled })
      });

      if (response.ok) {
        loadData();
        showMessage('success', config.restrictionEnabled ? 'Registro abierto a todos' : 'Registro restringido');
      }
    } catch (error) {
      showMessage('error', 'Error al cambiar configuración');
    }
  };

  const deleteUser = async (userId: string, userEmail: string) => {
    if (!authToken) return;

    if (!confirm(`¿Eliminar usuario ${userEmail}? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Basic ${authToken}` }
      });

      if (response.ok) {
        loadData();
        showMessage('success', 'Usuario eliminado');
      }
    } catch (error) {
      showMessage('error', 'Error al eliminar usuario');
    }
  };

  // ==================== FUNCIONES DE MODELOS DE IA ====================

  const toggleModel = async (modelId: string, currentEnabled: boolean) => {
    if (!authToken) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/ai-models/${modelId}/toggle`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authToken}`
        },
        body: JSON.stringify({ enabled: !currentEnabled })
      });

      if (response.ok) {
        loadData();
        showMessage('success', `Modelo ${currentEnabled ? 'desactivado' : 'activado'}`);
      }
    } catch (error) {
      showMessage('error', 'Error al cambiar estado del modelo');
    }
  };

  const addModel = async () => {
    if (!authToken || !newModel.id || !newModel.name) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/ai-models`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authToken}`
        },
        body: JSON.stringify({
          ...newModel,
          strengths: newModel.strengths.split(',').map(s => s.trim()).filter(Boolean)
        })
      });

      if (response.ok) {
        setNewModel({
          id: '',
          name: '',
          provider: 'openai',
          description: '',
          strengths: '',
          contextWindow: '',
          pricing: '',
          recommended: false,
          requiresApiKey: 'OPENAI_API_KEY'
        });
        setShowAddModel(false);
        loadData();
        showMessage('success', 'Modelo añadido correctamente');
      } else {
        const data = await response.json();
        showMessage('error', data.error || 'Error al añadir modelo');
      }
    } catch (error) {
      showMessage('error', 'Error de conexión');
    }
  };

  const updateModel = async () => {
    if (!authToken || !editingModel) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/ai-models/${editingModel.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authToken}`
        },
        body: JSON.stringify(editingModel)
      });

      if (response.ok) {
        setEditingModel(null);
        loadData();
        showMessage('success', 'Modelo actualizado');
      }
    } catch (error) {
      showMessage('error', 'Error al actualizar modelo');
    }
  };

  const deleteModel = async (modelId: string, modelName: string) => {
    if (!authToken) return;

    if (!confirm(`¿Eliminar modelo ${modelName}? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/ai-models/${modelId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Basic ${authToken}` }
      });

      if (response.ok) {
        loadData();
        showMessage('success', 'Modelo eliminado');
      }
    } catch (error) {
      showMessage('error', 'Error al eliminar modelo');
    }
  };

  const syncModels = async () => {
    if (!authToken) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/ai-models/sync`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${authToken}` }
      });

      if (response.ok) {
        const data = await response.json();
        loadData();
        showMessage('success', `Sincronización completada: ${data.added} modelos nuevos`);
      }
    } catch (error) {
      showMessage('error', 'Error al sincronizar modelos');
    }
  };

  const getProviderColor = (provider: string) => {
    switch (provider) {
      case 'openai': return 'bg-green-100 text-green-800';
      case 'anthropic': return 'bg-orange-100 text-orange-800';
      case 'google': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Pantalla de login
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <div className="flex justify-center">
              <div className="bg-red-600 p-3 rounded-xl">
                <Shield className="h-10 w-10 text-white" />
              </div>
            </div>
            <h2 className="mt-6 text-3xl font-bold text-white">
              Panel de Administración
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Acceso restringido
            </p>
          </div>

          <div className="bg-slate-800 rounded-xl shadow-xl p-8 border border-slate-700">
            <form className="space-y-6" onSubmit={handleLogin}>
              {loginError && (
                <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-400">{loginError}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-300">Email</label>
                <div className="mt-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-slate-500" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full pl-10 pr-3 py-3 border border-slate-600 rounded-lg bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    placeholder="admin@example.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300">Contraseña</label>
                <div className="mt-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-slate-500" />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-10 pr-3 py-3 border border-slate-600 rounded-lg bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    placeholder="********"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? (
                  <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <>
                    <Shield className="h-5 w-5" />
                    Acceder
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="text-center">
            <button
              onClick={() => navigate('/')}
              className="text-sm text-slate-500 hover:text-slate-400"
            >
              Volver al inicio
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Panel de administración
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-slate-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center gap-3">
              <Shield className="h-8 w-8 text-red-500" />
              <h1 className="text-xl font-bold text-white">Panel de Administración</h1>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="text-sm text-slate-400 hover:text-white"
              >
                Ir a la app
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300"
              >
                <LogOut className="h-4 w-4" />
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mensaje de notificación */}
      {message && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 ${
          message.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {message.type === 'success' ? <Check className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
          {message.text}
        </div>
      )}

      {/* Tabs de navegación */}
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('users')}
              className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                activeTab === 'users'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Users className="h-5 w-5" />
              Usuarios y Acceso
            </button>
            <button
              onClick={() => setActiveTab('models')}
              className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                activeTab === 'models'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Bot className="h-5 w-5" />
              Modelos de IA
              <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">
                {aiModels.filter(m => m.enabled).length}/{aiModels.length}
              </span>
            </button>
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* TAB: Usuarios y Acceso */}
        {activeTab === 'users' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Configuración de Restricción */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Shield className="h-5 w-5 text-gray-500" />
                Control de Registro
              </h2>
              <button
                onClick={toggleRestriction}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  config?.restrictionEnabled
                    ? 'bg-red-100 text-red-700 hover:bg-red-200'
                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                }`}
              >
                {config?.restrictionEnabled ? (
                  <>
                    <ToggleRight className="h-5 w-5" />
                    Restringido
                  </>
                ) : (
                  <>
                    <ToggleLeft className="h-5 w-5" />
                    Abierto
                  </>
                )}
              </button>
            </div>
            <p className="text-sm text-gray-500">
              {config?.restrictionEnabled
                ? 'Solo los emails y dominios en el whitelist pueden registrarse.'
                : 'Cualquier persona puede registrarse en el sistema.'}
            </p>
          </div>

          {/* Estadísticas */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-6">
              <Users className="h-5 w-5 text-gray-500" />
              Estadísticas
            </h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{users.length}</div>
                <div className="text-sm text-gray-500">Usuarios</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{config?.emails.length || 0}</div>
                <div className="text-sm text-gray-500">Emails</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{config?.domains.length || 0}</div>
                <div className="text-sm text-gray-500">Dominios</div>
              </div>
            </div>
          </div>

          {/* Whitelist de Emails */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <Mail className="h-5 w-5 text-gray-500" />
              Emails Autorizados
            </h2>

            <div className="flex gap-2 mb-4">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="nuevo@email.com"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                onKeyPress={(e) => e.key === 'Enter' && addEmail()}
              />
              <button
                onClick={addEmail}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Añadir
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {config?.emails.map((email) => (
                <div
                  key={email}
                  className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg"
                >
                  <span className="text-sm text-gray-700">{email}</span>
                  <button
                    onClick={() => removeEmail(email)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {config?.emails.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No hay emails en el whitelist</p>
              )}
            </div>
          </div>

          {/* Whitelist de Dominios */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <Globe className="h-5 w-5 text-gray-500" />
              Dominios Autorizados
            </h2>

            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="empresa.com"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                onKeyPress={(e) => e.key === 'Enter' && addDomain()}
              />
              <button
                onClick={addDomain}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Añadir
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {config?.domains.map((domain) => (
                <div
                  key={domain}
                  className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg"
                >
                  <span className="text-sm text-gray-700">@{domain}</span>
                  <button
                    onClick={() => removeDomain(domain)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {config?.domains.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No hay dominios en el whitelist</p>
              )}
            </div>
          </div>

          {/* Lista de Usuarios */}
          <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <Users className="h-5 w-5 text-gray-500" />
              Usuarios Registrados
            </h2>

            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Nombre</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Email</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Fecha registro</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{user.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{user.email}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(user.createdAt).toLocaleDateString('es-ES')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => deleteUser(user.id, user.email)}
                          className="text-red-500 hover:text-red-700"
                          title="Eliminar usuario"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                        No hay usuarios registrados
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        )}

        {/* TAB: Modelos de IA */}
        {activeTab === 'models' && (
        <div className="space-y-6">
          {/* Header con acciones */}
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Gestión de Modelos de IA</h2>
              <p className="text-sm text-gray-500">
                Añade, edita o desactiva modelos. Los modelos desactivados no aparecerán para los usuarios.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={syncModels}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                <RefreshCw className="h-4 w-4" />
                Sincronizar
              </button>
              <button
                onClick={() => setShowAddModel(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Añadir Modelo
              </button>
            </div>
          </div>

          {/* Formulario añadir modelo */}
          {showAddModel && (
            <div className="bg-white rounded-lg shadow p-6 border-2 border-blue-200">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-medium text-gray-900">Nuevo Modelo de IA</h3>
                <button onClick={() => setShowAddModel(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ID del Modelo *</label>
                  <input
                    type="text"
                    value={newModel.id}
                    onChange={(e) => setNewModel({ ...newModel, id: e.target.value })}
                    placeholder="gpt-5.1"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                  <input
                    type="text"
                    value={newModel.name}
                    onChange={(e) => setNewModel({ ...newModel, name: e.target.value })}
                    placeholder="GPT-5.1"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor *</label>
                  <select
                    value={newModel.provider}
                    onChange={(e) => setNewModel({ ...newModel, provider: e.target.value as any, requiresApiKey: e.target.value === 'openai' ? 'OPENAI_API_KEY' : e.target.value === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'GOOGLE_AI_API_KEY' })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="google">Google</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                  <input
                    type="text"
                    value={newModel.description}
                    onChange={(e) => setNewModel({ ...newModel, description: e.target.value })}
                    placeholder="Descripción del modelo..."
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contexto</label>
                  <input
                    type="text"
                    value={newModel.contextWindow}
                    onChange={(e) => setNewModel({ ...newModel, contextWindow: e.target.value })}
                    placeholder="128K tokens"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fortalezas (separadas por coma)</label>
                  <input
                    type="text"
                    value={newModel.strengths}
                    onChange={(e) => setNewModel({ ...newModel, strengths: e.target.value })}
                    placeholder="Razonamiento, Multimodal, Búsqueda web"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Precio</label>
                  <input
                    type="text"
                    value={newModel.pricing}
                    onChange={(e) => setNewModel({ ...newModel, pricing: e.target.value })}
                    placeholder="$2.50 / $10 por 1M tokens"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex items-center gap-4 pt-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newModel.recommended}
                      onChange={(e) => setNewModel({ ...newModel, recommended: e.target.checked })}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-700">Recomendado</span>
                  </label>
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setShowAddModel(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  Cancelar
                </button>
                <button
                  onClick={addModel}
                  disabled={!newModel.id || !newModel.name}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  Añadir Modelo
                </button>
              </div>
            </div>
          )}

          {/* Lista de modelos por proveedor */}
          {['openai', 'anthropic', 'google'].map(provider => {
            const providerModels = aiModels.filter(m => m.provider === provider);
            if (providerModels.length === 0) return null;

            return (
              <div key={provider} className="bg-white rounded-lg shadow overflow-hidden">
                <div className={`px-6 py-3 border-b ${
                  provider === 'openai' ? 'bg-green-50' :
                  provider === 'anthropic' ? 'bg-orange-50' : 'bg-blue-50'
                }`}>
                  <h3 className="font-medium text-gray-900 flex items-center gap-2">
                    {provider === 'openai' && 'OpenAI'}
                    {provider === 'anthropic' && 'Anthropic (Claude)'}
                    {provider === 'google' && 'Google (Gemini)'}
                    <span className="text-sm font-normal text-gray-500">
                      ({providerModels.filter(m => m.enabled).length} activos de {providerModels.length})
                    </span>
                  </h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {providerModels.map(model => (
                    <div
                      key={model.id}
                      className={`px-6 py-4 flex items-center justify-between ${!model.enabled ? 'bg-gray-50 opacity-60' : ''}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{model.name}</span>
                          <code className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600">{model.id}</code>
                          {model.recommended && (
                            <span className="flex items-center gap-1 text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                              <Sparkles className="h-3 w-3" />
                              Recomendado
                            </span>
                          )}
                          {!model.enabled && (
                            <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded">Desactivado</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-1">{model.description}</p>
                        {model.strengths && model.strengths.length > 0 && (
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {model.strengths.slice(0, 4).map((s, i) => (
                              <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                                {s}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => toggleModel(model.id, model.enabled)}
                          className={`p-2 rounded-lg ${
                            model.enabled
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                          title={model.enabled ? 'Desactivar' : 'Activar'}
                        >
                          {model.enabled ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                        </button>
                        <button
                          onClick={() => deleteModel(model.id, model.name)}
                          className="p-2 rounded-lg text-red-500 hover:bg-red-50"
                          title="Eliminar"
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

          {aiModels.length === 0 && (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <Bot className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No hay modelos configurados</p>
              <button
                onClick={syncModels}
                className="mt-4 text-blue-600 hover:text-blue-800"
              >
                Sincronizar modelos desde configuración
              </button>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}

/**
 * Panel de Administración
 * Gestión de whitelist de emails/dominios
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
  ToggleRight
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
  const [newEmail, setNewEmail] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

      const [configRes, usersRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/whitelist`, { headers }),
        fetch(`${API_BASE_URL}/api/admin/users`, { headers })
      ]);

      if (configRes.ok) {
        const configData = await configRes.json();
        setConfig(configData);
      }

      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsers(usersData.users || []);
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
      </div>
    </div>
  );
}

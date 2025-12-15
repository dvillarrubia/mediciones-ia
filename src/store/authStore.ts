/**
 * Store de autenticación para multi-tenant
 * Gestiona el estado del usuario, token y sesión
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import API_BASE_URL from '../config/api';

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKeysStatus {
  openai: boolean;
  anthropic: boolean;
  google: boolean;
}

interface AuthState {
  // Estado
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  apiKeysStatus: ApiKeysStatus | null;

  // Acciones de autenticación
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  verifyToken: () => Promise<boolean>;

  // Acciones de perfil
  updateProfile: (name?: string, email?: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;

  // Acciones de API Keys
  saveApiKey: (provider: string, apiKey: string) => Promise<void>;
  deleteApiKey: (provider: string) => Promise<void>;
  fetchApiKeysStatus: () => Promise<void>;

  // Helpers
  getAuthHeader: () => { Authorization: string } | {};
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Estado inicial
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      apiKeysStatus: null,

      // Login
      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || 'Error al iniciar sesión');
          }

          set({
            user: data.user,
            token: data.token,
            isAuthenticated: true,
            isLoading: false,
            error: null
          });

          // Cargar estado de API keys
          get().fetchApiKeysStatus();

        } catch (error: any) {
          set({
            isLoading: false,
            error: error.message || 'Error al iniciar sesión'
          });
          throw error;
        }
      },

      // Registro
      register: async (email: string, password: string, name: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, name })
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || 'Error al registrarse');
          }

          set({
            user: data.user,
            token: data.token,
            isAuthenticated: true,
            isLoading: false,
            error: null
          });

        } catch (error: any) {
          set({
            isLoading: false,
            error: error.message || 'Error al registrarse'
          });
          throw error;
        }
      },

      // Logout
      logout: async () => {
        const { token } = get();
        try {
          if (token) {
            await fetch(`${API_BASE_URL}/api/auth/logout`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              }
            });
          }
        } catch (error) {
          console.error('Error al cerrar sesión en servidor:', error);
        }

        set({
          user: null,
          token: null,
          isAuthenticated: false,
          apiKeysStatus: null,
          error: null
        });
      },

      // Verificar token
      verifyToken: async () => {
        const { token } = get();
        if (!token) {
          set({ isAuthenticated: false });
          return false;
        }

        try {
          const response = await fetch(`${API_BASE_URL}/api/auth/verify`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (!response.ok) {
            set({
              user: null,
              token: null,
              isAuthenticated: false
            });
            return false;
          }

          const data = await response.json();
          set({
            user: data.user,
            isAuthenticated: true
          });

          // Cargar estado de API keys
          get().fetchApiKeysStatus();

          return true;

        } catch (error) {
          set({
            user: null,
            token: null,
            isAuthenticated: false
          });
          return false;
        }
      },

      // Actualizar perfil
      updateProfile: async (name?: string, email?: string) => {
        const { token } = get();
        if (!token) throw new Error('No autenticado');

        set({ isLoading: true, error: null });
        try {
          const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name, email })
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || 'Error al actualizar perfil');
          }

          set({
            user: data.user,
            isLoading: false
          });

        } catch (error: any) {
          set({
            isLoading: false,
            error: error.message
          });
          throw error;
        }
      },

      // Cambiar contraseña
      changePassword: async (currentPassword: string, newPassword: string) => {
        const { token } = get();
        if (!token) throw new Error('No autenticado');

        set({ isLoading: true, error: null });
        try {
          const response = await fetch(`${API_BASE_URL}/api/auth/password`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ currentPassword, newPassword })
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || 'Error al cambiar contraseña');
          }

          // Después de cambiar contraseña, cerrar sesión
          await get().logout();

        } catch (error: any) {
          set({
            isLoading: false,
            error: error.message
          });
          throw error;
        }
      },

      // Guardar API Key
      saveApiKey: async (provider: string, apiKey: string) => {
        const { token } = get();
        if (!token) throw new Error('No autenticado');

        try {
          const response = await fetch(`${API_BASE_URL}/api/auth/api-keys`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ provider, apiKey })
          });

          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Error al guardar API key');
          }

          // Actualizar estado de API keys
          await get().fetchApiKeysStatus();

        } catch (error: any) {
          throw error;
        }
      },

      // Eliminar API Key
      deleteApiKey: async (provider: string) => {
        const { token } = get();
        if (!token) throw new Error('No autenticado');

        try {
          const response = await fetch(`${API_BASE_URL}/api/auth/api-keys/${provider}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Error al eliminar API key');
          }

          // Actualizar estado de API keys
          await get().fetchApiKeysStatus();

        } catch (error: any) {
          throw error;
        }
      },

      // Obtener estado de API Keys
      fetchApiKeysStatus: async () => {
        const { token } = get();
        if (!token) return;

        try {
          const response = await fetch(`${API_BASE_URL}/api/auth/api-keys`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (response.ok) {
            const data = await response.json();
            set({ apiKeysStatus: data.apiKeys });
          }
        } catch (error) {
          console.error('Error al obtener estado de API keys:', error);
        }
      },

      // Helper para obtener header de autorización
      getAuthHeader: () => {
        const { token } = get();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },

      // Limpiar error
      clearError: () => set({ error: null })
    }),
    {
      name: 'auth-store',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
);

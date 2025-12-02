import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { API_ENDPOINTS } from '../config/api';

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

interface ProjectState {
  projects: Project[];
  selectedProjectId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchProjects: () => Promise<void>;
  createProject: (name: string, description?: string) => Promise<Project | null>;
  updateProject: (id: string, name: string, description?: string) => Promise<Project | null>;
  deleteProject: (id: string) => Promise<boolean>;
  selectProject: (projectId: string | null) => void;
  getSelectedProject: () => Project | null;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: [],
      selectedProjectId: null,
      isLoading: false,
      error: null,

      fetchProjects: async () => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(API_ENDPOINTS.projects);
          const data = await response.json();

          if (data.success) {
            set({ projects: data.data, isLoading: false });
          } else {
            set({ error: data.error || 'Error al cargar proyectos', isLoading: false });
          }
        } catch (error) {
          set({ error: 'Error de conexion al cargar proyectos', isLoading: false });
        }
      },

      createProject: async (name: string, description?: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(API_ENDPOINTS.projects, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description })
          });
          const data = await response.json();

          if (data.success) {
            const newProject = data.data;
            set(state => ({
              projects: [newProject, ...state.projects],
              isLoading: false
            }));
            return newProject;
          } else {
            set({ error: data.error || 'Error al crear proyecto', isLoading: false });
            return null;
          }
        } catch (error) {
          set({ error: 'Error de conexion al crear proyecto', isLoading: false });
          return null;
        }
      },

      updateProject: async (id: string, name: string, description?: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(`${API_ENDPOINTS.projects}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description })
          });
          const data = await response.json();

          if (data.success) {
            const updatedProject = data.data;
            set(state => ({
              projects: state.projects.map(p => p.id === id ? updatedProject : p),
              isLoading: false
            }));
            return updatedProject;
          } else {
            set({ error: data.error || 'Error al actualizar proyecto', isLoading: false });
            return null;
          }
        } catch (error) {
          set({ error: 'Error de conexion al actualizar proyecto', isLoading: false });
          return null;
        }
      },

      deleteProject: async (id: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(`${API_ENDPOINTS.projects}/${id}`, {
            method: 'DELETE'
          });
          const data = await response.json();

          if (data.success) {
            set(state => ({
              projects: state.projects.filter(p => p.id !== id),
              selectedProjectId: state.selectedProjectId === id ? null : state.selectedProjectId,
              isLoading: false
            }));
            return true;
          } else {
            set({ error: data.error || 'Error al eliminar proyecto', isLoading: false });
            return false;
          }
        } catch (error) {
          set({ error: 'Error de conexion al eliminar proyecto', isLoading: false });
          return false;
        }
      },

      selectProject: (projectId: string | null) => {
        set({ selectedProjectId: projectId });
      },

      getSelectedProject: () => {
        const state = get();
        if (!state.selectedProjectId) return null;
        return state.projects.find(p => p.id === state.selectedProjectId) || null;
      }
    }),
    {
      name: 'project-store',
      partialize: (state) => ({ selectedProjectId: state.selectedProjectId })
    }
  )
);

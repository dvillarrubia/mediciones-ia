import React, { useState, useEffect, useRef } from 'react';
import { FolderOpen, Plus, ChevronDown, Pencil, Trash2, X, Check } from 'lucide-react';
import { useProjectStore, Project } from '../store/projectStore';

export default function ProjectSelector() {
  const {
    projects,
    selectedProjectId,
    isLoading,
    fetchProjects,
    createProject,
    updateProject,
    deleteProject,
    selectProject,
    getSelectedProject
  } = useProjectStore();

  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsCreating(false);
        setIsEditing(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedProject = getSelectedProject();

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;

    const project = await createProject(newProjectName.trim(), newProjectDescription.trim() || undefined);
    if (project) {
      selectProject(project.id);
      setNewProjectName('');
      setNewProjectDescription('');
      setIsCreating(false);
    }
  };

  const handleUpdateProject = async (id: string) => {
    if (!editName.trim()) return;

    await updateProject(id, editName.trim(), editDescription.trim() || undefined);
    setIsEditing(null);
  };

  const handleDeleteProject = async (id: string) => {
    if (window.confirm('¿Estas seguro de eliminar este proyecto? Los analisis asociados no se eliminaran, pero quedaran sin proyecto.')) {
      await deleteProject(id);
    }
  };

  const startEditing = (project: Project) => {
    setIsEditing(project.id);
    setEditName(project.name);
    setEditDescription(project.description || '');
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors min-w-[200px]"
      >
        <FolderOpen className="h-4 w-4 text-gray-500" />
        <span className="flex-1 text-left text-sm truncate">
          {selectedProject ? selectedProject.name : 'Todos los proyectos'}
        </span>
        <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          <div className="p-2 border-b border-gray-100">
            <button
              onClick={() => {
                selectProject(null);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                !selectedProjectId ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
              }`}
            >
              Todos los proyectos
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center text-gray-500 text-sm">Cargando...</div>
            ) : projects.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">No hay proyectos</div>
            ) : (
              projects.map(project => (
                <div key={project.id} className="border-b border-gray-50 last:border-0">
                  {isEditing === project.id ? (
                    <div className="p-2 space-y-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Nombre del proyecto"
                        autoFocus
                      />
                      <input
                        type="text"
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Descripcion (opcional)"
                      />
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => setIsEditing(null)}
                          className="p-1 text-gray-500 hover:text-gray-700"
                        >
                          <X className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleUpdateProject(project.id)}
                          className="p-1 text-green-600 hover:text-green-700"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                        selectedProjectId === project.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div
                        className="flex-1 min-w-0"
                        onClick={() => {
                          selectProject(project.id);
                          setIsOpen(false);
                        }}
                      >
                        <div className={`text-sm font-medium truncate ${
                          selectedProjectId === project.id ? 'text-blue-700' : 'text-gray-900'
                        }`}>
                          {project.name}
                        </div>
                        {project.description && (
                          <div className="text-xs text-gray-500 truncate">{project.description}</div>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditing(project);
                          }}
                          className="p-1 text-gray-400 hover:text-gray-600"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProject(project.id);
                          }}
                          className="p-1 text-gray-400 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="p-2 border-t border-gray-100">
            {isCreating ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Nombre del proyecto"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
                />
                <input
                  type="text"
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Descripcion (opcional)"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setIsCreating(false);
                      setNewProjectName('');
                      setNewProjectDescription('');
                    }}
                    className="flex-1 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleCreateProject}
                    disabled={!newProjectName.trim()}
                    className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Crear
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsCreating(true)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
              >
                <Plus className="h-4 w-4" />
                Nuevo proyecto
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

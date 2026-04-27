import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus, Play, Pause, Trash2, Edit2, PlayCircle,
  Clock, CheckCircle2, AlertCircle, Loader2, X, AlertTriangle,
} from 'lucide-react';
import { API_ENDPOINTS, apiFetch } from '../../config/api';

// ==================== TYPES ====================

type ScheduleType = 'llm' | 'aio';
type ScheduleFrequency = 'daily' | 'weekly' | 'monthly';
type ScheduleStatus = 'success' | 'error' | 'running' | null;

interface ScheduledReport {
  id: string;
  userId: string;
  projectId: string;
  name: string;
  type: ScheduleType;
  configurationId: string | null;
  payload: Record<string, any>;
  frequency: ScheduleFrequency;
  hour: number;
  weekday: number | null;
  dayOfMonth: number | null;
  timezone: string;
  enabled: boolean;
  nextRunAt: number | null;
  lastRunAt: number | null;
  lastStatus: ScheduleStatus;
  lastError: string | null;
  lastAnalysisId: string | null;
  createdAt: number;
  updatedAt: number;
}

interface CustomConfiguration {
  id: string;
  name: string;
  targetBrand?: string;
  competitorBrands?: string[];
  questions?: any[];
}

interface AIModelInfo {
  id: string;
  name: string;
  provider: string;
}

const COUNTRIES = [
  { code: 'ES', name: 'España', flag: '🇪🇸' },
  { code: 'MX', name: 'México', flag: '🇲🇽' },
  { code: 'AR', name: 'Argentina', flag: '🇦🇷' },
  { code: 'CO', name: 'Colombia', flag: '🇨🇴' },
  { code: 'CL', name: 'Chile', flag: '🇨🇱' },
  { code: 'PE', name: 'Perú', flag: '🇵🇪' },
  { code: 'US', name: 'Estados Unidos', flag: '🇺🇸' },
  { code: 'BR', name: 'Brasil', flag: '🇧🇷' },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹' },
  { code: 'GB', name: 'Reino Unido', flag: '🇬🇧' },
  { code: 'DE', name: 'Alemania', flag: '🇩🇪' },
  { code: 'FR', name: 'Francia', flag: '🇫🇷' },
  { code: 'IT', name: 'Italia', flag: '🇮🇹' },
];

const WEEKDAYS = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' },
];

// ==================== HELPERS ====================

function formatDateTime(ms: number | null): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function frequencyLabel(s: ScheduledReport): string {
  const hh = String(s.hour).padStart(2, '0');
  if (s.frequency === 'daily') return `Diaria a las ${hh}:00`;
  if (s.frequency === 'weekly') {
    const wd = WEEKDAYS.find(w => w.value === (s.weekday ?? -1))?.label || `día ${s.weekday}`;
    return `Cada ${wd} a las ${hh}:00`;
  }
  return `Mensual (día ${s.dayOfMonth}) a las ${hh}:00`;
}

// ==================== MAIN COMPONENT ====================

interface Props {
  projectId: string | null;
}

const SchedulesDashboard: React.FC<Props> = ({ projectId }) => {
  const [schedules, setSchedules] = useState<ScheduledReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduledReport | null>(null);

  const [configurations, setConfigurations] = useState<CustomConfiguration[]>([]);
  const [aiModels, setAiModels] = useState<AIModelInfo[]>([]);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    if (projectId) loadSchedules();
  }, [projectId]);

  useEffect(() => {
    loadConfigurations();
    loadAiModels();
    // Al abrir la tab, marcamos los errores actuales como vistos
    apiFetch(API_ENDPOINTS.schedulesAcknowledge, { method: 'POST' }).catch(() => null);
  }, []);

  // Polling mientras haya algún schedule en estado "running".
  // Los runs pueden tardar minutos — sin esto la UI queda con estado stale.
  useEffect(() => {
    if (!projectId) return;
    const hasRunning = schedules.some(s => s.lastStatus === 'running');
    if (!hasRunning) return;
    // 10s para no saturar SQLite cuando coincide con el tick del scheduler.
    const interval = setInterval(() => { loadSchedules(true); }, 10000);
    return () => clearInterval(interval);
  }, [schedules, projectId]);

  async function loadSchedules(silent: boolean = false) {
    if (!projectId) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const url = `${API_ENDPOINTS.schedules}?projectId=${projectId}`;
      const res = await apiFetch(url);
      const data = await res.json();
      if (data.success) {
        setSchedules(data.data || []);
      } else {
        setError(data.error || 'Error cargando automatizaciones');
      }
    } catch (e: any) {
      setError(e?.message || 'Error de conexión');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function loadConfigurations() {
    try {
      const res = await apiFetch(`${API_ENDPOINTS.customConfigurations}/all`);
      const data = await res.json();
      if (data.success) setConfigurations(data.data || []);
    } catch (e) {
      console.error('Error cargando configuraciones:', e);
    }
  }

  async function loadAiModels() {
    try {
      const res = await apiFetch(API_ENDPOINTS.aiModels);
      const data = await res.json();
      if (data.success && data.data?.models) setAiModels(data.data.models);
    } catch (e) {
      console.error('Error cargando modelos IA:', e);
    }
  }

  async function handleToggleEnabled(schedule: ScheduledReport) {
    setTogglingId(schedule.id);
    try {
      const res = await apiFetch(`${API_ENDPOINTS.schedules}/${schedule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !schedule.enabled }),
      });
      const data = await res.json();
      if (data.success) {
        setSchedules(prev => prev.map(s => s.id === schedule.id ? data.data : s));
      } else {
        alert(data.error || 'Error actualizando automatización');
      }
    } catch (e: any) {
      alert(e?.message || 'Error de conexión');
    } finally {
      setTogglingId(null);
    }
  }

  async function handleRunNow(schedule: ScheduledReport) {
    setRunningId(schedule.id);
    try {
      const res = await apiFetch(`${API_ENDPOINTS.schedules}/${schedule.id}/run-now`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || 'Error iniciando ejecución');
      } else {
        // Refrescar para que aparezca estado 'running' (silencioso: no ocultar la tabla)
        setTimeout(() => loadSchedules(true), 500);
      }
    } catch (e: any) {
      alert(e?.message || 'Error de conexión');
    } finally {
      setRunningId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await apiFetch(`${API_ENDPOINTS.schedules}/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setSchedules(prev => prev.filter(s => s.id !== id));
      } else {
        alert(data.error || 'Error eliminando');
      }
    } catch (e: any) {
      alert(e?.message || 'Error de conexión');
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  function openCreate() {
    setEditingSchedule(null);
    setShowModal(true);
  }

  function openEdit(schedule: ScheduledReport) {
    setEditingSchedule(schedule);
    setShowModal(true);
  }

  function handleSaved(saved: ScheduledReport) {
    setShowModal(false);
    setEditingSchedule(null);
    setSchedules(prev => {
      const idx = prev.findIndex(s => s.id === saved.id);
      if (idx >= 0) {
        const copy = prev.slice();
        copy[idx] = saved;
        return copy;
      }
      return [saved, ...prev];
    });
  }

  if (!projectId) {
    return (
      <div className="text-center py-16">
        <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-700 mb-2">Selecciona un proyecto</h3>
        <p className="text-gray-500">Elige un proyecto para gestionar sus automatizaciones.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Automatizaciones programadas</h3>
          <p className="text-sm text-gray-500 mt-1">
            Lanza informes LLM y AI Overview de forma recurrente. Los resultados aparecen en el historial de este proyecto.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nueva automatización
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">{error}</p>
            <button onClick={() => loadSchedules()} className="text-sm text-red-600 hover:text-red-800 mt-1">
              Reintentar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-500">Cargando automatizaciones…</p>
        </div>
      ) : schedules.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-lg">
          <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-700 mb-2">No hay automatizaciones</h3>
          <p className="text-gray-500 mb-4">Crea una para lanzar informes de forma recurrente.</p>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Crear primera automatización
          </button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Frecuencia</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Próxima</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Última</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {schedules.map(s => (
                <tr key={s.id} className={!s.enabled ? 'bg-gray-50' : ''}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{s.name}</div>
                    {!s.enabled && <div className="text-xs text-gray-500">Pausada</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      s.type === 'llm'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {s.type === 'llm' ? 'LLM' : 'AI Overview'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{frequencyLabel(s)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {s.enabled ? formatDateTime(s.nextRunAt) : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    <div className="flex items-center gap-2">
                      {s.lastStatus === 'success' && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                      {s.lastStatus === 'error' && <AlertCircle className="w-4 h-4 text-red-600" />}
                      {s.lastStatus === 'running' && <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />}
                      <span>{formatDateTime(s.lastRunAt)}</span>
                    </div>
                    {s.lastError && (
                      <div className="text-xs text-red-600 mt-1 truncate max-w-xs" title={s.lastError}>
                        {s.lastError}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleToggleEnabled(s)}
                        disabled={togglingId === s.id}
                        title={s.enabled ? 'Pausar' : 'Activar'}
                        className="p-1.5 hover:bg-gray-100 rounded text-gray-600 disabled:opacity-50"
                      >
                        {s.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleRunNow(s)}
                        disabled={runningId === s.id || s.lastStatus === 'running'}
                        title="Ejecutar ahora"
                        className="p-1.5 hover:bg-gray-100 rounded text-blue-600 disabled:opacity-50"
                      >
                        <PlayCircle className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEdit(s)}
                        title="Editar"
                        className="p-1.5 hover:bg-gray-100 rounded text-gray-600"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(s.id)}
                        disabled={deletingId === s.id}
                        title="Eliminar"
                        className="p-1.5 hover:bg-gray-100 rounded text-red-600 disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <ScheduleModal
          projectId={projectId}
          editing={editingSchedule}
          configurations={configurations}
          aiModels={aiModels}
          onClose={() => { setShowModal(false); setEditingSchedule(null); }}
          onSaved={handleSaved}
        />
      )}

      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600" />
              <h3 className="text-lg font-semibold text-gray-900">Eliminar automatización</h3>
            </div>
            <p className="text-gray-600 mb-6">
              Esta acción no se puede deshacer. Los informes que ya se hayan generado no se verán afectados.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                disabled={deletingId === confirmDeleteId}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== MODAL ====================

interface ModalProps {
  projectId: string;
  editing: ScheduledReport | null;
  configurations: CustomConfiguration[];
  aiModels: AIModelInfo[];
  onClose: () => void;
  onSaved: (schedule: ScheduledReport) => void;
}

const ScheduleModal: React.FC<ModalProps> = ({ projectId, editing, configurations, aiModels, onClose, onSaved }) => {
  const [name, setName] = useState(editing?.name || '');
  const [type, setType] = useState<ScheduleType>(editing?.type || 'llm');
  const [configurationId, setConfigurationId] = useState<string>(editing?.configurationId || '');
  const [selectedModel, setSelectedModel] = useState<string>(editing?.payload?.selectedModel || '');
  const [countryCode, setCountryCode] = useState<string>(editing?.payload?.countryCode || 'ES');

  // AIO-specific
  const [targetDomain, setTargetDomain] = useState<string>(editing?.payload?.targetDomain || '');
  const [competitorsText, setCompetitorsText] = useState<string>(
    editing?.payload?.competitors ? (editing.payload.competitors as string[]).join(', ') : ''
  );
  const [keywordsLimit, setKeywordsLimit] = useState<number>(editing?.payload?.keywordsLimit ?? 1000);

  const [frequency, setFrequency] = useState<ScheduleFrequency>(editing?.frequency || 'weekly');
  const [hour, setHour] = useState<number>(editing?.hour ?? 8);
  const [weekday, setWeekday] = useState<number>(editing?.weekday ?? 1);
  const [dayOfMonth, setDayOfMonth] = useState<number>(editing?.dayOfMonth ?? 1);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const selectedCountry = useMemo(() => COUNTRIES.find(c => c.code === countryCode), [countryCode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) { setFormError('El nombre es obligatorio'); return; }

    let payload: Record<string, any> = {};
    if (type === 'llm') {
      if (!configurationId) { setFormError('Selecciona una configuración'); return; }
      payload = {
        selectedModel: selectedModel || undefined,
        countryCode,
        countryName: selectedCountry?.name,
      };
    } else {
      if (!targetDomain.trim()) { setFormError('Indica el dominio objetivo'); return; }
      const competitors = competitorsText
        .split(',')
        .map(c => c.trim())
        .filter(Boolean);
      if (competitors.length === 0) { setFormError('Indica al menos un competidor'); return; }
      payload = {
        targetDomain: targetDomain.trim(),
        competitors,
        countryCode,
        keywordsLimit,
      };
    }

    const body: any = {
      projectId,
      name: name.trim(),
      type,
      configurationId: type === 'llm' ? configurationId : null,
      payload,
      frequency,
      hour,
      weekday: frequency === 'weekly' ? weekday : null,
      dayOfMonth: frequency === 'monthly' ? dayOfMonth : null,
    };

    setSaving(true);
    try {
      const url = editing ? `${API_ENDPOINTS.schedules}/${editing.id}` : API_ENDPOINTS.schedules;
      const method = editing ? 'PATCH' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) {
        setFormError(data.error || 'Error guardando automatización');
      } else {
        onSaved(data.data);
      }
    } catch (e: any) {
      setFormError(e?.message || 'Error de conexión');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            {editing ? 'Editar automatización' : 'Nueva automatización'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ej: Análisis semanal de marca"
            />
          </div>

          {!editing && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de informe</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setType('llm')}
                  className={`p-3 border-2 rounded-lg text-left transition-colors ${
                    type === 'llm' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium">Análisis LLM</div>
                  <div className="text-xs text-gray-500 mt-1">Ejecuta una configuración sobre modelos IA</div>
                </button>
                <button
                  type="button"
                  onClick={() => setType('aio')}
                  className={`p-3 border-2 rounded-lg text-left transition-colors ${
                    type === 'aio' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium">AI Overview</div>
                  <div className="text-xs text-gray-500 mt-1">Share of Voice vía DataForSEO</div>
                </button>
              </div>
            </div>
          )}

          {type === 'llm' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Configuración</label>
                <select
                  value={configurationId}
                  onChange={e => setConfigurationId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Selecciona configuración —</option>
                  {configurations.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Modelo (opcional)</label>
                  <select
                    value={selectedModel}
                    onChange={e => setSelectedModel(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">Por defecto</option>
                    {aiModels.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">País</label>
                  <select
                    value={countryCode}
                    onChange={e => setCountryCode(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    {COUNTRIES.map(c => (
                      <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          {type === 'aio' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dominio objetivo</label>
                <input
                  type="text"
                  value={targetDomain}
                  onChange={e => setTargetDomain(e.target.value)}
                  placeholder="ejemplo.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Competidores (separados por coma)
                </label>
                <textarea
                  value={competitorsText}
                  onChange={e => setCompetitorsText(e.target.value)}
                  rows={2}
                  placeholder="competidor1.com, competidor2.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">País</label>
                  <select
                    value={countryCode}
                    onChange={e => setCountryCode(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    {COUNTRIES.map(c => (
                      <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Límite keywords</label>
                  <input
                    type="number"
                    min={0}
                    value={keywordsLimit}
                    onChange={e => setKeywordsLimit(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
            </>
          )}

          <div className="border-t pt-4">
            <h4 className="font-medium text-gray-900 mb-3">Programación</h4>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setFrequency('daily')}
                className={`p-2 border-2 rounded-lg text-sm font-medium ${
                  frequency === 'daily' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200'
                }`}
              >
                Diaria
              </button>
              <button
                type="button"
                onClick={() => setFrequency('weekly')}
                className={`p-2 border-2 rounded-lg text-sm font-medium ${
                  frequency === 'weekly' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200'
                }`}
              >
                Semanal
              </button>
              <button
                type="button"
                onClick={() => setFrequency('monthly')}
                className={`p-2 border-2 rounded-lg text-sm font-medium ${
                  frequency === 'monthly' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200'
                }`}
              >
                Mensual
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hora</label>
                <select
                  value={hour}
                  onChange={e => setHour(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  {Array.from({ length: 24 }, (_, i) => i).map(h => (
                    <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                  ))}
                </select>
              </div>

              {frequency === 'weekly' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Día de la semana</label>
                  <select
                    value={weekday}
                    onChange={e => setWeekday(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    {WEEKDAYS.map(w => (
                      <option key={w.value} value={w.value}>{w.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {frequency === 'monthly' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Día del mes (1-28)</label>
                  <select
                    value={dayOfMonth}
                    onChange={e => setDayOfMonth(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <p className="text-xs text-gray-500 mt-2">
              Zona horaria: Europe/Madrid
            </p>
          </div>
        </form>

        <div className="px-6 py-4 border-t flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            type="button"
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {editing ? 'Guardar cambios' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SchedulesDashboard;

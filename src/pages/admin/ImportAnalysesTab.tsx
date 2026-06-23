/**
 * Admin tab: importar / exportar análisis para mover datos entre servidores.
 *
 * Export (arriba): descarga un JSON con projects + analyses + aiOverviews
 * de esta instancia. Selecciona qué incluir y se descarga el archivo.
 *
 * Import (abajo): sube un JSON exportado (de aquí o del script CLI),
 * mapea project_id origen → destino y se insertan los registros.
 */
import { useEffect, useMemo, useState } from 'react';
import { Upload, Download, Check, AlertCircle, FileJson, ChevronsUpDown } from 'lucide-react';
import API_BASE_URL from '../../config/api';

interface TargetProject {
  id: string;
  name: string;
  userId: string | null;
  description: string | null;
}

interface SourceProject {
  id: string;
  name: string;
  description?: string | null;
  user_id?: string | null;
}

interface SourceAnalysis {
  id: string;
  project_id: string | null;
  timestamp: string;
  brand: string;
  questions_count?: number;
  [k: string]: any;
}

interface SourceAiOverview {
  id: string;
  project_id: string | null;
  timestamp: string;
  target_domain: string;
  status?: string | null;
  [k: string]: any;
}

interface ExportPayload {
  version?: number;
  exportedAt?: string;
  source?: string;
  projects: SourceProject[];
  analyses: SourceAnalysis[];
  aiOverviews: SourceAiOverview[];
}

interface ImportResult {
  analyses: { inserted: number; skipped: number };
  aiOverviews: { inserted: number; skipped: number };
}

interface Props {
  authToken: string;
  onMessage: (msg: { type: 'success' | 'error'; text: string }) => void;
}

export default function ImportAnalysesTab({ authToken, onMessage }: Props) {
  const [targets, setTargets] = useState<TargetProject[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(true);
  const [payload, setPayload] = useState<ExportPayload | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [selAnalyses, setSelAnalyses] = useState<Set<string>>(new Set());
  const [selAiOverviews, setSelAiOverviews] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    const loadTargets = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/admin/import/projects`, {
          headers: { Authorization: `Basic ${authToken}` },
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setTargets(data.projects || []);
      } catch (e: any) {
        onMessage({ type: 'error', text: `No se pudieron cargar los proyectos destino: ${e.message}` });
      } finally {
        setLoadingTargets(false);
      }
    };
    loadTargets();
  }, [authToken, onMessage]);

  // Derived: source projects grouped with count of analyses & AI overviews per project
  const sourceProjectStats = useMemo(() => {
    if (!payload) return new Map<string, { analyses: number; aiOverviews: number; orphan?: boolean }>();
    const m = new Map<string, { analyses: number; aiOverviews: number; orphan?: boolean }>();
    for (const p of payload.projects) m.set(p.id, { analyses: 0, aiOverviews: 0 });
    for (const a of payload.analyses) {
      if (!a.project_id) continue;
      const s = m.get(a.project_id) || { analyses: 0, aiOverviews: 0, orphan: true };
      s.analyses++;
      m.set(a.project_id, s);
    }
    for (const a of payload.aiOverviews) {
      if (!a.project_id) continue;
      const s = m.get(a.project_id) || { analyses: 0, aiOverviews: 0, orphan: true };
      s.aiOverviews++;
      m.set(a.project_id, s);
    }
    return m;
  }, [payload]);

  // Project id → display name for source rows (for tables)
  const sourceProjectName = useMemo(() => {
    const m = new Map<string, string>();
    if (!payload) return m;
    for (const p of payload.projects) m.set(p.id, p.name);
    return m;
  }, [payload]);

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text) as ExportPayload;
      if (!data || !Array.isArray(data.analyses) || !Array.isArray(data.projects) || !Array.isArray(data.aiOverviews)) {
        throw new Error('Formato inválido: se esperaban campos projects, analyses y aiOverviews');
      }
      setPayload(data);
      setFileName(file.name);
      setMappings({});
      // Select-all por defecto
      setSelAnalyses(new Set(data.analyses.map(a => a.id)));
      setSelAiOverviews(new Set(data.aiOverviews.map(a => a.id)));
      setResult(null);
    } catch (e: any) {
      onMessage({ type: 'error', text: `Error leyendo el archivo: ${e.message}` });
    }
  };

  // project_ids referenced by selected rows (require mapping)
  const referencedProjectIds = useMemo(() => {
    if (!payload) return new Set<string>();
    const s = new Set<string>();
    for (const a of payload.analyses) if (selAnalyses.has(a.id) && a.project_id) s.add(a.project_id);
    for (const a of payload.aiOverviews) if (selAiOverviews.has(a.id) && a.project_id) s.add(a.project_id);
    return s;
  }, [payload, selAnalyses, selAiOverviews]);

  const missingMappings = useMemo(
    () => [...referencedProjectIds].filter(p => !mappings[p]),
    [referencedProjectIds, mappings]
  );

  const canImport = payload !== null
    && (selAnalyses.size > 0 || selAiOverviews.size > 0)
    && missingMappings.length === 0
    && !importing;

  const toggle = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  };

  const setAll = (ids: string[], setter: (s: Set<string>) => void, on: boolean) => {
    setter(on ? new Set(ids) : new Set());
  };

  const handleImport = async () => {
    if (!payload) return;
    setImporting(true);
    setResult(null);
    try {
      const analyses = payload.analyses.filter(a => selAnalyses.has(a.id));
      const aiOverviews = payload.aiOverviews.filter(a => selAiOverviews.has(a.id));

      const res = await fetch(`${API_BASE_URL}/api/admin/import/analyses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${authToken}`,
        },
        body: JSON.stringify({
          projectMappings: mappings,
          analyses,
          aiOverviews,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error en import');

      setResult({ analyses: data.analyses, aiOverviews: data.aiOverviews });
      onMessage({
        type: 'success',
        text: `Import OK · Análisis: ${data.analyses.inserted} nuevos, ${data.analyses.skipped} duplicados · AI Overviews: ${data.aiOverviews.inserted} nuevos, ${data.aiOverviews.skipped} duplicados`,
      });
    } catch (e: any) {
      onMessage({ type: 'error', text: `Error al importar: ${e.message}` });
    } finally {
      setImporting(false);
    }
  };

  // Helper: summary counts per project id (source)
  const referencingProjects = useMemo(() => {
    if (!payload) return [] as Array<SourceProject & { stats: { analyses: number; aiOverviews: number } }>;
    return payload.projects.map(p => ({
      ...p,
      stats: sourceProjectStats.get(p.id) || { analyses: 0, aiOverviews: 0 },
    }));
  }, [payload, sourceProjectStats]);

  return (
    <div className="space-y-6">
      {/* ============================== EXPORT ============================== */}
      <ExportSection authToken={authToken} onMessage={onMessage} />

      <div className="border-t border-gray-200" />

      {/* ============================== IMPORT ============================== */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Importar análisis desde un export</h2>
        <p className="text-sm text-gray-500">
          Sube el JSON generado arriba (o con <code className="px-1 bg-gray-100 rounded text-xs">npx tsx scripts/export-db.ts</code>) y mapea cada proyecto de origen contra uno existente antes de subir.
        </p>
      </div>

      {/* File picker */}
      <div className="bg-white rounded-lg shadow p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <FileJson className="h-5 w-5 text-gray-400" />
            <div>
              <p className="font-medium text-gray-900">
                {fileName ? fileName : 'Selecciona el archivo de export (.json)'}
              </p>
              {payload && (
                <p className="text-xs text-gray-500">
                  {payload.projects.length} proyectos · {payload.analyses.length} análisis · {payload.aiOverviews.length} AI overviews
                  {payload.exportedAt && ` · exportado ${new Date(payload.exportedAt).toLocaleString('es-ES')}`}
                </p>
              )}
            </div>
          </div>
          <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer text-sm">
            <Upload className="h-4 w-4" />
            {payload ? 'Cargar otro archivo' : 'Seleccionar archivo'}
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>

      {loadingTargets && (
        <div className="bg-white rounded-lg shadow p-5 text-sm text-gray-500">Cargando proyectos destino…</div>
      )}

      {!loadingTargets && payload && (
        <>
          {/* Project mapping */}
          <div className="bg-white rounded-lg shadow p-5">
            <div className="flex items-center gap-2 mb-3">
              <ChevronsUpDown className="h-4 w-4 text-gray-400" />
              <h3 className="font-semibold text-gray-900">Mapeo de proyectos</h3>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Todo project_id referenciado por un análisis seleccionado debe estar mapeado. Los proyectos sin datos seleccionados pueden quedar sin mapear.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pb-2 font-medium">Proyecto origen</th>
                    <th className="pb-2 font-medium">Análisis</th>
                    <th className="pb-2 font-medium">AI Overviews</th>
                    <th className="pb-2 font-medium w-80">→ Proyecto destino</th>
                  </tr>
                </thead>
                <tbody>
                  {referencingProjects.map(p => {
                    const referenced = referencedProjectIds.has(p.id);
                    const mapped = !!mappings[p.id];
                    return (
                      <tr key={p.id} className="border-b last:border-b-0">
                        <td className="py-2">
                          <div className="font-medium text-gray-900">{p.name}</div>
                          <div className="text-xs text-gray-400 font-mono">{p.id}</div>
                        </td>
                        <td className="py-2 text-gray-700">{p.stats.analyses}</td>
                        <td className="py-2 text-gray-700">{p.stats.aiOverviews}</td>
                        <td className="py-2">
                          <select
                            value={mappings[p.id] || ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              setMappings(prev => {
                                const next = { ...prev };
                                if (!v) delete next[p.id]; else next[p.id] = v;
                                return next;
                              });
                            }}
                            className={`w-full px-2 py-1 border rounded text-sm ${
                              referenced && !mapped
                                ? 'border-red-300 bg-red-50'
                                : mapped
                                  ? 'border-green-300'
                                  : 'border-gray-300'
                            }`}
                          >
                            <option value="">— sin mapear —</option>
                            {targets.map(t => (
                              <option key={t.id} value={t.id}>
                                {t.name} {t.userId ? `(${t.userId.slice(0, 8)})` : '(global)'}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {missingMappings.length > 0 && (
              <div className="mt-3 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>
                  Faltan mapeos para {missingMappings.length} proyecto(s) con datos seleccionados. Mapea o desmarca esos análisis.
                </span>
              </div>
            )}
          </div>

          {/* Analyses selection */}
          <SelectionTable
            title="Análisis"
            rows={payload.analyses.map(a => ({
              id: a.id,
              cols: [
                a.brand,
                sourceProjectName.get(a.project_id || '') || '—',
                new Date(a.timestamp).toLocaleString('es-ES'),
                (a.questions_count ?? '').toString(),
              ],
            }))}
            headers={['Marca', 'Proyecto origen', 'Timestamp', 'Preguntas']}
            selected={selAnalyses}
            onToggle={(id) => toggle(selAnalyses, id, setSelAnalyses)}
            onToggleAll={(on) => setAll(payload.analyses.map(a => a.id), setSelAnalyses, on)}
          />

          {/* AI Overviews selection */}
          <SelectionTable
            title="AI Overviews"
            rows={payload.aiOverviews.map(a => ({
              id: a.id,
              cols: [
                a.target_domain,
                sourceProjectName.get(a.project_id || '') || '—',
                new Date(a.timestamp).toLocaleString('es-ES'),
                a.status || '—',
              ],
            }))}
            headers={['Dominio', 'Proyecto origen', 'Timestamp', 'Status']}
            selected={selAiOverviews}
            onToggle={(id) => toggle(selAiOverviews, id, setSelAiOverviews)}
            onToggleAll={(on) => setAll(payload.aiOverviews.map(a => a.id), setSelAiOverviews, on)}
          />

          {/* Import button */}
          <div className="flex items-center justify-end gap-3">
            {result && (
              <div className="text-sm text-green-700 flex items-center gap-2">
                <Check className="h-4 w-4" />
                Insertados {result.analyses.inserted + result.aiOverviews.inserted} · Duplicados {result.analyses.skipped + result.aiOverviews.skipped}
              </div>
            )}
            <button
              onClick={handleImport}
              disabled={!canImport}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload className="h-4 w-4" />
              {importing
                ? 'Importando…'
                : `Importar ${selAnalyses.size + selAiOverviews.size} elementos`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Selection table (reusable between analyses and AI overviews)
// ---------------------------------------------------------------------------
interface SelectionTableProps {
  title: string;
  headers: string[];
  rows: Array<{ id: string; cols: string[] }>;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (on: boolean) => void;
}

// ---------------------------------------------------------------------------
// Export section: pull all projects/analyses/aiOverviews from this server,
// let admin pick what to include, download as JSON.
// ---------------------------------------------------------------------------
interface ExportSectionProps {
  authToken: string;
  onMessage: (msg: { type: 'success' | 'error'; text: string }) => void;
}

function ExportSection({ authToken, onMessage }: ExportSectionProps) {
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<ExportPayload | null>(null);
  const [selProjects, setSelProjects] = useState<Set<string>>(new Set());
  const [selAnalyses, setSelAnalyses] = useState<Set<string>>(new Set());
  const [selAiOverviews, setSelAiOverviews] = useState<Set<string>>(new Set());

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/import/export-data`, {
        headers: { Authorization: `Basic ${authToken}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as ExportPayload;
      setPayload(data);
      setSelProjects(new Set(data.projects.map(p => p.id)));
      setSelAnalyses(new Set(data.analyses.map(a => a.id)));
      setSelAiOverviews(new Set(data.aiOverviews.map(a => a.id)));
    } catch (e: any) {
      onMessage({ type: 'error', text: `No se pudo cargar el export: ${e.message}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  const projectName = useMemo(() => {
    const m = new Map<string, string>();
    if (!payload) return m;
    for (const p of payload.projects) m.set(p.id, p.name);
    return m;
  }, [payload]);

  // Project ids referenced by the currently selected analyses/AIOs.
  // We auto-include those projects in the export so the importer can map them.
  const referencedProjectIds = useMemo(() => {
    if (!payload) return new Set<string>();
    const s = new Set<string>();
    for (const a of payload.analyses) if (selAnalyses.has(a.id) && a.project_id) s.add(a.project_id);
    for (const a of payload.aiOverviews) if (selAiOverviews.has(a.id) && a.project_id) s.add(a.project_id);
    return s;
  }, [payload, selAnalyses, selAiOverviews]);

  const toggle = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  };

  const setAll = (ids: string[], setter: (s: Set<string>) => void, on: boolean) => {
    setter(on ? new Set(ids) : new Set());
  };

  const handleDownload = () => {
    if (!payload) return;
    // Union of explicitly selected projects + projects referenced by selected rows
    const includedProjectIds = new Set<string>(selProjects);
    for (const pid of referencedProjectIds) includedProjectIds.add(pid);

    const out: ExportPayload = {
      version: payload.version,
      exportedAt: new Date().toISOString(),
      source: payload.source,
      projects: payload.projects.filter(p => includedProjectIds.has(p.id)),
      analyses: payload.analyses.filter(a => selAnalyses.has(a.id)),
      aiOverviews: payload.aiOverviews.filter(a => selAiOverviews.has(a.id)),
    };

    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `mediciones-export-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    onMessage({
      type: 'success',
      text: `Export descargado · ${out.projects.length} proyectos · ${out.analyses.length} análisis · ${out.aiOverviews.length} AI overviews`,
    });
  };

  const totalSelected = selAnalyses.size + selAiOverviews.size;
  const canDownload = !!payload && totalSelected > 0 && !loading;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Exportar análisis de esta instancia</h2>
        <p className="text-sm text-gray-500">
          Descarga un JSON con los datos seleccionados para luego importarlos en otro servidor desde la sección de abajo.
        </p>
      </div>

      {loading && !payload && (
        <div className="bg-white rounded-lg shadow p-5 text-sm text-gray-500">Cargando datos del servidor…</div>
      )}

      {payload && (
        <>
          <div className="bg-white rounded-lg shadow p-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="text-sm text-gray-600">
              <span className="font-medium text-gray-900">{payload.projects.length}</span> proyectos ·{' '}
              <span className="font-medium text-gray-900">{payload.analyses.length}</span> análisis ·{' '}
              <span className="font-medium text-gray-900">{payload.aiOverviews.length}</span> AI overviews disponibles
              {payload.exportedAt && (
                <span className="text-gray-400"> · snapshot {new Date(payload.exportedAt).toLocaleString('es-ES')}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadData}
                disabled={loading}
                className="px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Refrescar
              </button>
              <button
                onClick={handleDownload}
                disabled={!canDownload}
                className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="h-4 w-4" />
                Descargar export.json ({totalSelected})
              </button>
            </div>
          </div>

          <SelectionTable
            title="Análisis"
            rows={payload.analyses.map(a => ({
              id: a.id,
              cols: [
                a.brand,
                projectName.get(a.project_id || '') || '—',
                new Date(a.timestamp).toLocaleString('es-ES'),
                (a.questions_count ?? '').toString(),
              ],
            }))}
            headers={['Marca', 'Proyecto', 'Timestamp', 'Preguntas']}
            selected={selAnalyses}
            onToggle={(id) => toggle(selAnalyses, id, setSelAnalyses)}
            onToggleAll={(on) => setAll(payload.analyses.map(a => a.id), setSelAnalyses, on)}
          />

          <SelectionTable
            title="AI Overviews"
            rows={payload.aiOverviews.map(a => ({
              id: a.id,
              cols: [
                a.target_domain,
                projectName.get(a.project_id || '') || '—',
                new Date(a.timestamp).toLocaleString('es-ES'),
                a.status || '—',
              ],
            }))}
            headers={['Dominio', 'Proyecto', 'Timestamp', 'Status']}
            selected={selAiOverviews}
            onToggle={(id) => toggle(selAiOverviews, id, setSelAiOverviews)}
            onToggleAll={(on) => setAll(payload.aiOverviews.map(a => a.id), setSelAiOverviews, on)}
          />

          <SelectionTable
            title="Proyectos (opcional)"
            rows={payload.projects.map(p => ({
              id: p.id,
              cols: [
                p.name,
                p.description || '—',
                referencedProjectIds.has(p.id) ? 'auto (referenciado)' : '',
              ],
            }))}
            headers={['Nombre', 'Descripción', 'Estado']}
            selected={selProjects}
            onToggle={(id) => toggle(selProjects, id, setSelProjects)}
            onToggleAll={(on) => setAll(payload.projects.map(p => p.id), setSelProjects, on)}
          />
        </>
      )}
    </div>
  );
}

function SelectionTable({ title, headers, rows, selected, onToggle, onToggleAll }: SelectionTableProps) {
  const allSelected = rows.length > 0 && rows.every(r => selected.has(r.id));
  const someSelected = rows.some(r => selected.has(r.id));
  return (
    <div className="bg-white rounded-lg shadow p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <span className="text-xs text-gray-500">{selected.size} de {rows.length} seleccionados</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">No hay {title.toLowerCase()} en el export.</p>
      ) : (
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2 w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = !allSelected && someSelected; }}
                    onChange={(e) => onToggleAll(e.target.checked)}
                  />
                </th>
                {headers.map(h => (
                  <th key={h} className="pb-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b last:border-b-0 hover:bg-gray-50">
                  <td className="py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => onToggle(r.id)}
                    />
                  </td>
                  {r.cols.map((c, i) => (
                    <td key={i} className="py-2 text-gray-700">{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

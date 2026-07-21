import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Globe, Loader2 } from 'lucide-react';
import { API_ENDPOINTS, apiFetch } from '../config/api';

export interface OpenRouterCatalogModel {
  id: string;
  name: string;
  description: string;
  contextLength: number | null;
  pricing: { prompt: string | null; completion: string | null };
  created: number | null;
}

interface Props {
  /** Model-id completo, con sufijo ':online' incluido si aplica */
  value: string;
  onChange: (modelId: string) => void;
  placeholder?: string;
}

// Caché a nivel de módulo: el catálogo se pide una vez por sesión de la SPA
let catalogCache: OpenRouterCatalogModel[] | null = null;
let catalogPromise: Promise<OpenRouterCatalogModel[]> | null = null;

async function loadCatalog(): Promise<OpenRouterCatalogModel[]> {
  if (catalogCache) return catalogCache;
  if (!catalogPromise) {
    catalogPromise = apiFetch(API_ENDPOINTS.openrouterModels)
      .then(res => res.json())
      .then(data => {
        if (!data.success) throw new Error(data.error || 'Error cargando catálogo');
        catalogCache = data.data.models as OpenRouterCatalogModel[];
        return catalogCache;
      })
      .catch(err => {
        catalogPromise = null; // permitir reintento en el próximo montaje
        throw err;
      });
  }
  return catalogPromise;
}

const stripOnline = (id: string) => id.replace(/:online$/, '');
const isNativeOnline = (id: string) => /perplexity\/.*sonar/i.test(id);

/** USD/token (string de OpenRouter) → "$X.XX/M" legible */
function formatPricePerMillion(perToken: string | null): string | null {
  if (!perToken) return null;
  const n = parseFloat(perToken);
  if (!Number.isFinite(n) || n === 0) return n === 0 ? 'gratis' : null;
  const perM = n * 1_000_000;
  return `$${perM < 10 ? perM.toFixed(2) : perM.toFixed(0)}/M`;
}

/**
 * Buscador de modelos de OpenRouter contra su catálogo vivo (~400 modelos),
 * para no tener que mantener la lista curada al día. Cualquier modelo admite
 * búsqueda web añadiendo ':online'; el toggle lo gestiona automáticamente.
 */
const OpenRouterModelPicker = ({ value, onChange, placeholder }: Props) => {
  const [models, setModels] = useState<OpenRouterCatalogModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [webSearch, setWebSearch] = useState(value ? value.endsWith(':online') : true);
  const containerRef = useRef<HTMLDivElement>(null);

  const baseValue = stripOnline(value);

  useEffect(() => {
    let cancelled = false;
    loadCatalog()
      .then(list => { if (!cancelled) { setModels(list); setLoading(false); } })
      .catch(err => { if (!cancelled) { setLoadError(err?.message || 'Error'); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  // Cerrar el dropdown al hacer clic fuera
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models.slice(0, 50);
    const terms = q.split(/\s+/);
    return models
      .filter(m => terms.every(t => m.id.toLowerCase().includes(t) || m.name.toLowerCase().includes(t)))
      .slice(0, 50);
  }, [models, query]);

  const applySelection = (baseId: string, online: boolean) => {
    // Los Sonar de Perplexity ya son online nativos: no llevan sufijo
    const finalId = online && !isNativeOnline(baseId) ? `${baseId}:online` : baseId;
    onChange(finalId);
  };

  const selectModel = (m: OpenRouterCatalogModel) => {
    applySelection(m.id, webSearch);
    setQuery('');
    setOpen(false);
  };

  const toggleWebSearch = (checked: boolean) => {
    setWebSearch(checked);
    if (baseValue) applySelection(baseValue, checked);
  };

  const selectedInfo = models.find(m => m.id === baseValue);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={open ? query : (value || '')}
          onFocus={() => { setOpen(true); setQuery(''); }}
          onChange={e => { setQuery(e.target.value); if (!open) setOpen(true); }}
          placeholder={placeholder || 'Busca un modelo: gpt, claude, gemini, llama…'}
          className="w-full pl-9 pr-3 py-3 border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-400 animate-spin" />
        )}
      </div>

      {open && !loading && (
        <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {loadError && (
            <div className="p-3 text-sm text-red-600">
              No se pudo cargar el catálogo de OpenRouter ({loadError}). Puedes pegar el model-id manualmente.
            </div>
          )}
          {/* Entrada manual: lo tecleado parece un slug válido y no está en la lista */}
          {query.includes('/') && !filtered.some(m => stripOnline(query.trim()) === m.id) && (
            <button
              type="button"
              onClick={() => { applySelection(stripOnline(query.trim()), webSearch); setQuery(''); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-indigo-50 border-b border-gray-100"
            >
              <span className="text-sm text-indigo-700">✏️ Usar model-id manual: </span>
              <code className="text-sm font-mono">{stripOnline(query.trim())}</code>
            </button>
          )}
          {filtered.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => selectModel(m)}
              className={`w-full text-left px-3 py-2 hover:bg-indigo-50 ${m.id === baseValue ? 'bg-indigo-50' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-900 truncate">{m.name}</span>
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {[
                    m.contextLength ? `${Math.round(m.contextLength / 1000)}K ctx` : null,
                    formatPricePerMillion(m.pricing.prompt),
                  ].filter(Boolean).join(' · ')}
                </span>
              </div>
              <div className="text-xs font-mono text-gray-500 truncate">{m.id}</div>
            </button>
          ))}
          {filtered.length === 0 && !loadError && (
            <div className="p-3 text-sm text-gray-500">Sin resultados para "{query}"</div>
          )}
        </div>
      )}

      <label className="mt-2 flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={webSearch}
          onChange={e => toggleWebSearch(e.target.checked)}
          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
        <Globe className="h-4 w-4 text-indigo-500" />
        Búsqueda web (añade <code className="px-1 bg-gray-100 rounded">:online</code> al modelo)
      </label>

      {selectedInfo && (
        <p className="mt-1 text-xs text-gray-500 line-clamp-2">{selectedInfo.description}</p>
      )}
    </div>
  );
};

export default OpenRouterModelPicker;

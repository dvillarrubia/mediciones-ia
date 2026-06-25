import React, { useEffect, useState } from 'react';
import { Plus, X, Save, Tag, FolderOpen, CheckCircle } from 'lucide-react';
import { useProjectStore, BrandAlias } from '../../store/projectStore';

/**
 * Glosario de marcas por proyecto: el usuario define la marca canónica y sus variantes/alias
 * (BIESS = biess = "Instituto Ecuatoriano de Seguridad Social"). Al guardar, todos los dashboards
 * del Intelligence Hub unifican esas menciones como una sola marca.
 */
const BrandGlossaryEditor: React.FC = () => {
  const { selectedProjectId, projects, updateBrandSettings, isLoading } = useProjectStore();
  const project = projects.find(p => p.id === selectedProjectId) || null;

  const [entries, setEntries] = useState<BrandAlias[]>([]);
  const [variantInputs, setVariantInputs] = useState<Record<number, string>>({});
  const [brandDomain, setBrandDomain] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setEntries((project?.brandAliases || []).map(a => ({ canonical: a.canonical, variants: [...(a.variants || [])] })));
    setBrandDomain(project?.brandDomain || '');
    setSaved(false);
  }, [selectedProjectId, project?.brandAliases, project?.brandDomain]);

  if (!selectedProjectId || !project) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        <FolderOpen className="h-10 w-10 text-gray-300 mx-auto mb-3" />
        <h3 className="font-medium text-gray-900 mb-1">Selecciona un proyecto</h3>
        <p className="text-gray-500 text-sm">El glosario de marcas se define por proyecto. Elige uno en el selector de la barra lateral.</p>
      </div>
    );
  }

  const addEntry = () => setEntries(prev => [...prev, { canonical: '', variants: [] }]);
  const removeEntry = (i: number) => setEntries(prev => prev.filter((_, idx) => idx !== i));
  const setCanonical = (i: number, value: string) =>
    setEntries(prev => prev.map((e, idx) => idx === i ? { ...e, canonical: value } : e));
  const addVariant = (i: number) => {
    const v = (variantInputs[i] || '').trim();
    if (!v) return;
    setEntries(prev => prev.map((e, idx) =>
      idx === i && !e.variants.some(x => x.toLowerCase() === v.toLowerCase())
        ? { ...e, variants: [...e.variants, v] } : e));
    setVariantInputs(prev => ({ ...prev, [i]: '' }));
  };
  const removeVariant = (i: number, vIdx: number) =>
    setEntries(prev => prev.map((e, idx) => idx === i ? { ...e, variants: e.variants.filter((_, j) => j !== vIdx) } : e));

  const handleSave = async () => {
    const clean = entries
      .map(e => ({ canonical: e.canonical.trim(), variants: e.variants.map(v => v.trim()).filter(Boolean) }))
      .filter(e => e.canonical);
    const result = await updateBrandSettings(selectedProjectId, { brandAliases: clean, brandDomain: brandDomain.trim() });
    if (result) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <Tag className="h-5 w-5 text-blue-600" /> Glosario de marcas
        </h2>
        <p className="text-gray-600 text-sm mt-1">
          Proyecto <span className="font-medium">{project.name}</span>. Unifica variantes de una misma marca
          (p. ej. <code className="text-xs bg-gray-100 px-1 rounded">BIESS</code>, <code className="text-xs bg-gray-100 px-1 rounded">biess</code>,
          <code className="text-xs bg-gray-100 px-1 rounded ml-1">Instituto Ecuatoriano de Seguridad Social</code>). Se aplica a todos los gráficos.
        </p>
      </div>

      {/* Dominio de la marca */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <label className="block text-sm font-medium text-gray-800 mb-1">Dominio de la marca</label>
        <p className="text-xs text-gray-500 mb-2">
          Para distinguir <strong>mención</strong> (sin enlace) de <strong>citación</strong> (la IA enlaza a tu sitio) y <strong>citación al blog</strong> (ruta <code className="bg-gray-100 px-1 rounded">/blog</code>).
        </p>
        <input
          value={brandDomain}
          onChange={(e) => setBrandDomain(e.target.value)}
          placeholder="pichincha.com"
          className="w-full border rounded-md px-3 py-2 text-sm text-gray-900"
        />
      </div>

      <div className="space-y-4">
        {entries.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6 border border-dashed rounded-lg">
            Aún no hay marcas en el glosario. Añade la primera.
          </p>
        )}

        {entries.map((entry, i) => (
          <div key={i} className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <input
                value={entry.canonical}
                onChange={(e) => setCanonical(i, e.target.value)}
                placeholder="Marca canónica (ej. BIESS)"
                className="flex-1 border rounded-md px-3 py-2 text-sm font-medium text-gray-900"
              />
              <button onClick={() => removeEntry(i)} className="text-gray-400 hover:text-red-600 p-1" title="Eliminar marca">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {entry.variants.map((v, vIdx) => (
                <span key={vIdx} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-full">
                  {v}
                  <button onClick={() => removeVariant(i, vIdx)} className="hover:text-blue-900"><X className="h-3 w-3" /></button>
                </span>
              ))}
              <input
                value={variantInputs[i] || ''}
                onChange={(e) => setVariantInputs(prev => ({ ...prev, [i]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addVariant(i); } }}
                placeholder="Añadir variante y Enter…"
                className="border rounded-md px-2 py-1 text-xs text-gray-700 w-48"
              />
              <button onClick={() => addVariant(i)} className="text-xs text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
                <Plus className="h-3 w-3" /> variante
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2">
        <button onClick={addEntry} className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800">
          <Plus className="h-4 w-4" /> Añadir marca
        </button>
        <div className="flex items-center gap-3">
          {saved && <span className="inline-flex items-center gap-1 text-green-600 text-sm"><CheckCircle className="h-4 w-4" /> Guardado</span>}
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> Guardar glosario
          </button>
        </div>
      </div>
    </div>
  );
};

export default BrandGlossaryEditor;

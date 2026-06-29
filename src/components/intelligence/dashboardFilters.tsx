// Controles y helpers de filtrado reutilizables por los dashboards del Intelligence Hub.
//
// - filterAnalysesByDateRange: acota una lista de análisis a un rango de fechas (cliente).
// - DateRangeFilter: selector de rango (dos <input type="date"> + Limpiar + contador).
// - Pagination / paginate: paginación controlada reutilizable en cualquier tabla.

import React from 'react';
import { Calendar, X } from 'lucide-react';
import { AnalysisDetail } from './sharedMetrics';

/**
 * Filtra los análisis por rango de fechas (inclusive). `dateTo` se interpreta
 * hasta el final del día. Si ambos límites están vacíos, devuelve la lista tal cual.
 */
export function filterAnalysesByDateRange<T extends { timestamp: string }>(
  analyses: T[],
  dateFrom?: string,
  dateTo?: string,
): T[] {
  if (!analyses) return [];
  if (!dateFrom && !dateTo) return analyses;
  const fromTs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : -Infinity;
  const toTs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : Infinity;
  return analyses.filter(a => {
    const t = new Date(a.timestamp).getTime();
    return t >= fromTs && t <= toTs;
  });
}

interface DateRangeFilterProps {
  dateFrom: string;
  dateTo: string;
  onChange: (next: { dateFrom: string; dateTo: string }) => void;
  /** Nº de análisis tras filtrar (opcional, para el contador). */
  count?: number;
  /** Nº total de análisis disponibles (opcional, para el contador "N / total"). */
  total?: number;
  className?: string;
}

/** Selector de rango de fechas para acotar los análisis de un dashboard. */
export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({
  dateFrom, dateTo, onChange, count, total, className,
}) => {
  const active = !!(dateFrom || dateTo);
  return (
    <div className={`flex items-center gap-2 flex-wrap bg-gray-50 border rounded-lg px-3 py-2 ${className || ''}`}>
      <Calendar className="w-4 h-4 text-gray-500 flex-shrink-0" />
      <span className="text-xs text-gray-500">Rango de fechas:</span>
      <input
        type="date"
        value={dateFrom}
        max={dateTo || undefined}
        onChange={(e) => onChange({ dateFrom: e.target.value, dateTo })}
        className="text-sm border rounded-md px-2 py-1 text-gray-700"
      />
      <span className="text-gray-400 text-sm">—</span>
      <input
        type="date"
        value={dateTo}
        min={dateFrom || undefined}
        onChange={(e) => onChange({ dateFrom, dateTo: e.target.value })}
        className="text-sm border rounded-md px-2 py-1 text-gray-700"
      />
      {active && (
        <button
          onClick={() => onChange({ dateFrom: '', dateTo: '' })}
          className="text-xs text-gray-500 hover:text-gray-800 inline-flex items-center gap-1"
        >
          <X className="w-3 h-3" /> Limpiar
        </button>
      )}
      {typeof count === 'number' && (
        <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">
          {count}{typeof total === 'number' ? ` / ${total}` : ''} análisis
        </span>
      )}
    </div>
  );
};

/** Devuelve la porción de `items` correspondiente a la página `page` (1-based). */
export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

interface PaginationProps {
  /** Página actual (1-based). */
  page: number;
  totalItems: number;
  pageSize: number;
  onChange: (page: number) => void;
  className?: string;
}

/** Paginación controlada: "Anterior / Página X de Y / Siguiente". */
export const Pagination: React.FC<PaginationProps> = ({ page, totalItems, pageSize, onChange, className }) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalPages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(totalItems, page * pageSize);
  const btn = 'text-sm px-3 py-1 rounded-md border text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50';
  return (
    <div className={`flex items-center justify-between gap-3 mt-3 ${className || ''}`}>
      <span className="text-xs text-gray-400">Mostrando {from}–{to} de {totalItems}</span>
      <div className="flex items-center gap-1">
        <button disabled={page <= 1} onClick={() => onChange(page - 1)} className={btn}>Anterior</button>
        <span className="text-sm text-gray-600 px-2 whitespace-nowrap">Página {page} de {totalPages}</span>
        <button disabled={page >= totalPages} onClick={() => onChange(page + 1)} className={btn}>Siguiente</button>
      </div>
    </div>
  );
};

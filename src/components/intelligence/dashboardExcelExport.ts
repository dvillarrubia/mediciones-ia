// Util genérico de exportación a Excel en cliente para los dashboards del
// Intelligence Hub. Mismo enfoque que `aioExcelExport.ts` (xlsx en el navegador,
// sin tocar el backend): cada hoja se construye como una matriz (array of arrays).

import * as XLSX from 'xlsx';

export interface SheetSpec {
  /** Nombre de la pestaña (se sanea a ≤31 chars y se desambigua si se repite). */
  name: string;
  /** Contenido como matriz de filas; la primera fila suele ser la cabecera. */
  aoa: any[][];
  /** Anchos de columna opcionales (en caracteres). */
  cols?: number[];
}

/** Sanea un nombre de pestaña para Excel (max 31, sin `[]:*?/\`). */
function sanitizeSheetName(name: string, used: Set<string>): string {
  const cleaned = name.replace(/[\[\]:*?/\\]/g, '_').slice(0, 31);
  let candidate = cleaned || 'Hoja';
  let suffix = 1;
  while (used.has(candidate.toLowerCase())) {
    const tail = `_${suffix++}`;
    candidate = cleaned.slice(0, 31 - tail.length) + tail;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/** Crea un workbook con las hojas indicadas y dispara la descarga del .xlsx. */
export function exportSheetsToExcel(filename: string, sheets: SheetSpec[]): void {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.aoa);
    if (s.cols) ws['!cols'] = s.cols.map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(s.name || 'Hoja', used));
  }
  XLSX.writeFile(wb, filename);
}

/**
 * Construye un nombre de archivo consistente: `<prefix>_<label>_<fecha>.xlsx`.
 * La fecha se toma en el momento de la llamada (acción de usuario, no en render).
 */
export function downloadFilename(prefix: string, label?: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const safe = (label || '').replace(/[^a-z0-9.-]/gi, '_').slice(0, 40);
  return `${prefix}${safe ? `_${safe}` : ''}_${date}.xlsx`;
}

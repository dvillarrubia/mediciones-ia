/**
 * Modelos REALMENTE usados en un análisis, derivados de su resultado.
 *
 * Por qué no basta con `configuration.aiModels`: ese campo son las personas
 * SOLICITADAS. En producción hay análisis marcados como multi-modelo con
 * aiModels = ["chatgpt","claude","gemini"] cuyas 103 preguntas corrieron todas
 * con Gemini. Guardar la lista solicitada hacía que la interfaz atribuyera el
 * resultado a tres modelos que nunca intervinieron.
 *
 * La fuente fiable es cada pregunta: `multiModelAnalysis[].modelName` lleva el
 * modelo con el que se generó esa respuesta.
 */

interface ConMultiModel {
  multiModelAnalysis?: Array<{ modelName?: string; modelPersona?: string }>;
}

/**
 * Devuelve los nombres legibles de los modelos presentes en el resultado, sin
 * repetir y en orden estable. Lista vacía si el resultado no trae esa
 * información: el llamante decide entonces con qué respaldo quedarse.
 */
export function modelsUsedFromResult(result: unknown): string[] {
  const questions = (result as { questions?: ConMultiModel[] } | null)?.questions;
  if (!Array.isArray(questions)) return [];

  const encontrados = new Set<string>();
  for (const q of questions) {
    for (const mm of q.multiModelAnalysis || []) {
      const nombre = mm?.modelName || mm?.modelPersona;
      if (nombre) encontrados.add(nombre);
    }
  }
  return Array.from(encontrados).sort();
}

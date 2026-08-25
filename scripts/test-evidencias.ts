/**
 * Test de verifyEvidence(): la salvaguarda que impide guardar como "evidencia"
 * frases que el modelo no copió del texto.
 *
 * Por qué existe: la fase 2 es un LLM y puede parafrasear o inventar la cita.
 * Una evidencia fabricada es PEOR que ninguna, porque el informe se la enseña al
 * cliente como prueba textual de que la IA nombró su marca.
 *
 * Uso:  npm run test:evidencias
 * No hace llamadas a ninguna API: ejercita el código real con textos fijos.
 */
import OpenAIService from '../api/services/openaiService.js';

/** verifyEvidence es privado: se accede por índice, que en TS es solo compile-time. */
type ConVerify = { verifyEvidence(raw: unknown, responseText: string): string[] };
const svc = new OpenAIService({ openrouter: 'no-se-usa' }) as unknown as ConVerify;

const RESPUESTA = `Para aerotermia en un piso pequeño, **Saunier Duval** destaca con su gama
GeniaAir Mono, que ofrece unidades compactas. ([saunierduval.es](https://saunierduval.es/genia))
Daikin es la referencia del mercado por fiabilidad y red de servicio técnico.
Vaillant ofrece equipos silenciosos, pensados para instalaciones urbanas.`;

const casos: Array<{ nombre: string; entrada: unknown; esperado: number }> = [
  { nombre: 'cita literal exacta',
    entrada: ['Daikin es la referencia del mercado por fiabilidad y red de servicio técnico.'], esperado: 1 },
  { nombre: 'cita literal cuyo original lleva markdown',
    entrada: ['Saunier Duval destaca con su gama GeniaAir Mono, que ofrece unidades compactas.'], esperado: 1 },
  { nombre: 'PARAFRASEADA por el modelo -> rechazar',
    entrada: ['Daikin es considerada la marca mas fiable del sector segun el texto.'], esperado: 0 },
  { nombre: 'INVENTADA (dato que no está en el texto) -> rechazar',
    entrada: ['Saunier Duval lidera el mercado europeo con un 40% de cuota.'], esperado: 0 },
  { nombre: 'fragmento demasiado corto -> rechazar', entrada: ['Daikin'], esperado: 0 },
  { nombre: 'lista vacía', entrada: [], esperado: 0 },
  { nombre: 'tipo incorrecto (string en vez de lista)', entrada: 'Daikin es la referencia', esperado: 0 },
  { nombre: 'duplicadas -> deduplicar',
    entrada: ['Vaillant ofrece equipos silenciosos, pensados para instalaciones urbanas.',
              'Vaillant ofrece equipos silenciosos, pensados para instalaciones urbanas.'], esperado: 1 },
  { nombre: 'mezcla de válida e inventada -> solo la válida',
    entrada: ['Inventada total que no aparece en ninguna parte del texto original.',
              'Vaillant ofrece equipos silenciosos, pensados para instalaciones urbanas.'], esperado: 1 },
  { nombre: 'tope de 3 evidencias por marca',
    entrada: ['Daikin es la referencia del mercado por fiabilidad y red de servicio técnico.',
              'Vaillant ofrece equipos silenciosos, pensados para instalaciones urbanas.',
              'Saunier Duval destaca con su gama GeniaAir Mono, que ofrece unidades compactas.',
              'Daikin es la referencia del mercado por fiabilidad y red de servicio técnico.'], esperado: 3 },
];

let ok = 0;
let fail = 0;
for (const c of casos) {
  const r: string[] = svc.verifyEvidence(c.entrada, RESPUESTA);
  const bien = r.length === c.esperado;
  if (bien) ok++; else fail++;
  console.log(`${bien ? '  ok ' : 'FALLO'}  ${c.nombre.padEnd(52)} -> ${r.length} (esperado ${c.esperado})`);
  if (!bien) console.log('        devolvió:', JSON.stringify(r));
}
console.log(`\n${ok} correctos, ${fail} fallos`);
process.exit(fail ? 1 : 0);

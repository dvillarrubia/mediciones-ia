/**
 * Detecta API keys COMPARTIDAS entre cuentas distintas.
 *
 * Para qué: hasta ago/2026 las claves viajaban en una entrada global de
 * localStorage sin id de usuario. Si en un navegador compartido el usuario B
 * abría Configuración —que precargaba el formulario con lo que hubiera ahí— y
 * pulsaba "Guardar", la clave de A quedaba cifrada en la cuenta de B.
 *
 * El arreglo (commit fix/fuga-api-keys) corta la propagación, pero NO puede
 * saber qué claves ya guardadas son legítimas y cuáles heredadas. Esto sí lo
 * detecta: si dos cuentas tienen exactamente la misma clave, una de las dos la
 * heredó.
 *
 * SEGURIDAD: nunca imprime una clave. Compara huellas SHA-256 y solo muestra
 * un prefijo de la huella, que no permite reconstruir el secreto.
 *
 * Uso (en el servidor, donde está API_KEY_ENCRYPTION_SECRET):
 *   docker exec mediciones-ia-api sh -lc "cd /app && npx tsx scripts/detectar-keys-compartidas.ts"
 *
 * Salida: 0 si no hay claves compartidas, 1 si las hay.
 */
import { createHash } from 'node:crypto';
import { authService } from '../api/services/authService.js';
import { databaseService } from '../api/services/databaseService.js';

const huella = (s: string) => createHash('sha256').update(s).digest('hex');

interface Cuenta { userId: string; email: string; }

/** Forma mínima del handle de sqlite3 que necesitamos, sin arrastrar sus tipos. */
type DbHandle = {
  all(sql: string, cb: (err: Error | null, rows: Array<{ id: string; email: string }>) => void): void;
};
/** Los servicios exponen su conexión como campo privado; se accede por índice. */
type ConDb = { db?: DbHandle };

async function listarUsuarios(): Promise<Cuenta[]> {
  const db = (databaseService as unknown as ConDb).db || (authService as unknown as ConDb).db;
  if (!db) throw new Error('No hay conexión a la base de datos');
  return new Promise((resolve, reject) => {
    db.all('SELECT id, email FROM users ORDER BY email', (err, rows) => {
      if (err) reject(err);
      else resolve((rows || []).map(r => ({ userId: r.id, email: r.email })));
    });
  });
}

async function main() {
  await (authService as unknown as { ensureInitialized?: () => Promise<void> }).ensureInitialized?.();
  const usuarios = await listarUsuarios();
  console.log(`Revisando ${usuarios.length} cuentas...\n`);

  // huella -> [{email, provider}]
  const porHuella = new Map<string, Array<{ email: string; provider: string }>>();

  for (const u of usuarios) {
    let keys: Record<string, string> = {};
    try {
      keys = await authService.getApiKeys(u.userId);
    } catch {
      console.warn(`  (no se pudieron leer las claves de ${u.email})`);
      continue;
    }
    for (const [provider, valor] of Object.entries(keys)) {
      if (typeof valor !== 'string' || valor.trim().length === 0) continue;
      const h = huella(valor.trim());
      if (!porHuella.has(h)) porHuella.set(h, []);
      porHuella.get(h)!.push({ email: u.email, provider });
    }
  }

  const compartidas = [...porHuella.entries()].filter(([, usos]) => {
    const cuentas = new Set(usos.map(u => u.email));
    return cuentas.size > 1;
  });

  if (compartidas.length === 0) {
    console.log('✓ Ninguna clave aparece en más de una cuenta.');
    process.exit(0);
  }

  console.log(`✗ ${compartidas.length} clave(s) compartidas entre cuentas distintas:\n`);
  for (const [h, usos] of compartidas) {
    console.log(`  huella ${h.slice(0, 12)}…  ${usos.length} usos`);
    for (const u of usos) console.log(`     · ${u.email}  (${u.provider})`);
    console.log('');
  }
  console.log('Qué hacer: confirmar con cada usuario cuál es la suya. El que la haya');
  console.log('heredado debe borrarla y guardar la propia desde Configuración > API Keys.');
  console.log('Compartir una clave a propósito entre cuentas también da este resultado:');
  console.log('no todo positivo es contaminación, pero todos merecen una comprobación.');
  process.exit(1);
}

main().catch((err: unknown) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(2);
});

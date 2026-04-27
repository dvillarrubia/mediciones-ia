/**
 * Cifrado simétrico AES-256-GCM para secretos persistidos (API keys).
 *
 * Formato v2: `v2:<iv_b64>.<authTag_b64>.<ciphertext_b64>`
 * El plaintext interno lleva un prefijo "MIAK\0" como magic bytes para detectar
 * data corrupta en migración. Los secretos en formato legacy (Base64 simple
 * sin prefijo) se siguen aceptando en decrypt para permitir migración transparente.
 */
import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const KEY_SALT = 'mediciones-ia-api-keys-salt';
const V2_PREFIX = 'v2:';
const PLAINTEXT_MAGIC = 'MIAK\0';
const DEFAULT_SECRET = 'mediciones-ia-default-encryption-key-change-me';

const rawSecret = process.env.API_KEY_ENCRYPTION_SECRET;

// Fail-fast en producción si no se configuró un secret real. Sin esto, las
// keys se cifrarían con el default y quedarían inaccesibles si después se
// configura el var real (la clave derivada cambiaría).
if (process.env.NODE_ENV === 'production' && !rawSecret) {
  console.error(
    '[crypto] ERROR FATAL: API_KEY_ENCRYPTION_SECRET no está configurada en producción. ' +
    'Las API keys de los usuarios no se pueden cifrar de forma segura. Configura la variable ' +
    'de entorno y reinicia el servidor.'
  );
  process.exit(1);
}

const effectiveSecret = rawSecret || DEFAULT_SECRET;

if (!rawSecret) {
  console.warn(
    '[crypto] ADVERTENCIA: usando clave por defecto para cifrado de API keys (solo dev). ' +
    'En producción configura API_KEY_ENCRYPTION_SECRET.'
  );
}

const KEY = crypto.scryptSync(effectiveSecret, KEY_SALT, 32);

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  // Prefijo de magic bytes para detectar corrupción al descifrar
  const ciphertext = Buffer.concat([
    cipher.update(PLAINTEXT_MAGIC + plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${V2_PREFIX}${iv.toString('base64')}.${tag.toString('base64')}.${ciphertext.toString('base64')}`;
}

export function decryptSecret(value: string): string {
  if (value.startsWith(V2_PREFIX)) {
    const parts = value.slice(V2_PREFIX.length).split('.');
    if (parts.length !== 3) {
      throw new Error('Formato de secreto v2 inválido');
    }
    const [ivB64, tagB64, ctB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const ct = Buffer.from(ctB64, 'base64');
    const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    if (!plaintext.startsWith(PLAINTEXT_MAGIC)) {
      throw new Error('Secreto descifrado pero magic bytes inválidos (posible corrupción o cambio de clave)');
    }
    return plaintext.slice(PLAINTEXT_MAGIC.length);
  }
  return Buffer.from(value, 'base64').toString('utf-8');
}

/**
 * Heurística para validar que un string parece una API key válida (no basura
 * resultado de decodificar mal un base64). Usada en la migración para evitar
 * re-cifrar contenido corrupto.
 */
export function looksLikePlausibleApiKey(value: string): boolean {
  if (!value || value.length < 8 || value.length > 4096) return false;
  // Las API keys son ASCII imprimibles. Si tiene control chars o caracteres
  // no-imprimibles, probablemente es basura de un base64 mal decodificado.
  return /^[\x20-\x7E]+$/.test(value);
}

export function isEncryptedV2(value: string): boolean {
  return typeof value === 'string' && value.startsWith(V2_PREFIX);
}

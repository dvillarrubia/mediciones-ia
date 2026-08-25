/**
 * Resolución de las API keys de un usuario.
 *
 * REGLA: las claves salen SIEMPRE de la base de datos, por `userId`. Lo que
 * llegue en el cuerpo de la petición se ignora.
 *
 * Por qué: hasta ago/2026 los endpoints hacían `apiKeysToUse = req.body.userApiKeys`
 * y solo consultaban la base si el body venía vacío. El frontend enviaba lo que
 * hubiera en `localStorage['userApiKeys']`, una entrada global sin id de usuario
 * que el logout no borraba. Resultado: en un navegador compartido, el usuario B
 * lanzaba análisis gastando los créditos del usuario A, y las claves correctas de
 * B —guardadas cifradas y por usuario en `user_api_keys`— no se consultaban nunca.
 *
 * Todas las rutas afectadas montan `requireAuth`, así que `userId` está siempre
 * disponible: no hace falta un camino alternativo para peticiones sin sesión.
 */
import { authService } from '../services/authService.js';

export interface UserApiKeys {
  openai?: string;
  anthropic?: string;
  google?: string;
  openrouter?: string;
  dataforseo?: string;
  [provider: string]: string | undefined;
}

/**
 * Devuelve las claves guardadas del usuario, ya descifradas. Nunca lanza: si la
 * consulta falla se devuelve un objeto vacío y el llamante decide qué responder,
 * que es lo mismo que hacía el código anterior con su try/catch silencioso.
 *
 * Se descartan las cadenas vacías: "guardar" con un campo en blanco dejaba
 * `{openai: ''}`, un objeto truthy que hacía pasar la validación y luego fallaba
 * contra el proveedor.
 */
export async function resolveUserApiKeys(userId: string | undefined): Promise<UserApiKeys> {
  if (!userId) return {};
  try {
    const stored = await authService.getApiKeys(userId);
    const out: UserApiKeys = {};
    for (const [provider, value] of Object.entries(stored || {})) {
      if (typeof value === 'string' && value.trim().length > 0) out[provider] = value;
    }
    return out;
  } catch (err) {
    console.warn('[apiKeys] No se pudieron recuperar las claves del usuario:', (err as Error)?.message);
    return {};
  }
}

/** ¿Hay alguna clave con la que ejecutar un análisis LLM? */
export const hasLlmKey = (keys: UserApiKeys): boolean => !!keys.openrouter;

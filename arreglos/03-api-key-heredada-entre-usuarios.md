# La API key del usuario anterior se hereda al cambiar de usuario · ✅ ARREGLADO (25/08/2026)

**Origen:** reporte de usuario, 25/08/2026
**Contexto:** "si creamos un usuario y metemos una API, y después creamos o
cambiamos a otro usuario, la API se queda la del usuario anterior; es como que
se cachea y siempre lanzamos con la misma".
**Diagnóstico:** 25/08/2026, verificado contra el código. La cadena completa
está confirmada por lectura de código; el comportamiento es determinista, no
hace falta reproducirlo para afirmarlo.

**Severidad: Alta.** No es solo un dato mal mostrado: el usuario B ejecuta
análisis **gastando los créditos de OpenAI/OpenRouter del usuario A** sin que
ninguno de los dos lo sepa. Y si B pulsa "Guardar" en Configuración, las claves
de A quedan grabadas cifradas en la cuenta de B en el servidor: la contaminación
pasa de ser local del navegador a permanente en base de datos.

---

## Síntoma

En el mismo navegador: el usuario A guarda su API key, cierra sesión, se crea o
entra el usuario B. Todos los análisis de B se lanzan con la key de A. En
Configuración > API Keys, B ve las claves de A ya rellenas.

## Causa (verificada, tres piezas encadenadas)

### 1. Las claves viven en una entrada de localStorage global, sin usuario

`src/pages/Configuration.tsx:148`:

```js
localStorage.setItem('userApiKeys', JSON.stringify(trimmedKeys));
```

La clave de almacenamiento es literalmente `'userApiKeys'`, sin el id del
usuario. Cualquier sesión posterior en ese navegador lee lo mismo.

### 2. El logout no la borra

`src/store/authStore.ts:149-155` — el `logout()` limpia `user`, `token`,
`isAuthenticated` y `apiKeysStatus` del store de Zustand, pero **nunca toca
`localStorage['userApiKeys']`**. Tampoco lo hacen `login()` ni `register()`.
El único sitio que la elimina es el botón manual "Eliminar todas las API Keys"
(`Configuration.tsx:193`).

### 3. El backend da prioridad a la clave que manda el navegador

`src/pages/Analysis.tsx:289-308` lee `localStorage['userApiKeys']` y la envía
en el body como `userApiKeys`. Y en el servidor,
`api/routes/analysis.ts:122-132`:

```js
let apiKeysToUse = userApiKeys;              // ← lo que venga del body gana
if (req.userId && !userApiKeys) {            // ← la DB solo si el body no trae nada
  const storedKeys = await authService.getApiKeys(req.userId);
  ...
}
```

Las claves correctas del usuario B **sí están** en la tabla `user_api_keys`
(cifradas, por usuario), pero nunca se consultan porque el body siempre llega
relleno con las de A. El mismo patrón body-primero-DB-después se repite en
`analysis.ts:339` (`POST /execute`), `analysis.ts:535` (`POST /multi-model`) y
`api/routes/aiOverview.ts:204-217` (DataForSEO).

### Agravante: la contaminación se vuelve permanente

`Configuration.tsx:127-137` precarga el formulario desde ese mismo
localStorage. Si B entra en Configuración y pulsa "Guardar",
`saveApiKeys()` (líneas 148-164) persiste las claves de A **en el registro de
servidor de B**, cifradas como si fueran suyas. A partir de ahí ni borrar el
localStorage arregla nada: las automatizaciones programadas
(`schedulerService.ts:138`), que sí leen de la DB, también usarán la key de A.

## Evidencia

La cadena es reproducible al 100% con solo el código:

1. Usuario A → Configuración → guarda key → `localStorage['userApiKeys'] = {openai: "sk-A..."}`.
2. Logout (`authStore.ts:133`): localStorage intacto.
3. Registro de usuario B (mismo navegador).
4. B lanza un análisis → `Analysis.tsx:289` lee la key de A → la manda en el body.
5. `analysis.ts:122`: `apiKeysToUse = userApiKeys` (la de A). La DB de B jamás se consulta.

## Fallo relacionado detectado durante el diagnóstico

Si el localStorage contiene el objeto con cadenas vacías
(`{openai: '', openrouter: '', dataforseo: ''}` — es lo que guarda "Guardar"
con campos vacíos), `analysis.ts:123` ve `userApiKeys` truthy, **no** cae a la
DB, y la línea 134 devuelve `API_KEYS_REQUIRED` aunque el usuario tenga claves
válidas guardadas en servidor (p. ej. configuradas desde otro equipo).

También: el aviso de `Configuration.tsx:1212` ("Tus claves se guardan solo en
tu navegador. No se envían a nuestros servidores") es falso desde que
`saveApiKeys()` las persiste en `/api/auth/api-keys`. Hay que corregir el texto.

## Arreglo

El de raíz y los mínimos no son excluyentes; el de raíz elimina la clase entera
de bug:

1. **Raíz — dejar de usar localStorage como fuente de claves.** El servidor ya
   guarda las claves cifradas por usuario y autentica cada petición con
   `req.userId`. El frontend no necesita enviar `userApiKeys` en el body: que
   `analysis.ts`, `aiOverview.ts` y compañía resuelvan siempre con
   `authService.getApiKeys(req.userId)` y se ignore el campo del body para
   usuarios autenticados. De paso desaparece el fallo relacionado de las
   cadenas vacías.
2. **Mínimo si se mantiene localStorage:** clave con ámbito de usuario
   (`userApiKeys:<userId>`) y borrado de la entrada en `logout()` de
   `authStore.ts`.
3. **Defensa en el backend en cualquier caso:** invertir la precedencia — DB
   primero, body solo como fallback sin sesión — en los cuatro endpoints
   listados arriba.

## Arreglo aplicado

Commit `fix(security)`, 25/08/2026. Se optó por la solución de raíz (opción 1),
que elimina la clase entera de bug en vez de parchear sus síntomas. Fue viable
porque **las cuatro rutas montan `requireAuth`**, así que `req.userId` está
siempre disponible y no hace falta un camino alternativo sin sesión.

**Backend — el servidor deja de aceptar claves del cliente:**

- Nuevo `api/utils/resolveUserApiKeys.ts`: resuelve SIEMPRE desde
  `user_api_keys` por `userId`. Descarta cadenas vacías, con lo que desaparece
  de paso el fallo relacionado (`{openai: ''}` hacía pasar la validación y luego
  fallaba contra el proveedor).
- Sustituido en los tres puntos de `analysis.ts` y en `aiOverview.ts`. El campo
  `userApiKeys` del body ya no se lee en ningún endpoint.
- Eliminado `POST /ai-overview/debug-credentials`, marcado "TEMPORAL" y sin
  ningún llamante: aceptaba credenciales por el body y devolvía el login de
  DataForSEO completo más fragmentos de la contraseña y de la cabecera de
  autenticación.
- Eliminado el volcado al log de los primeros 20 caracteres de la clave de
  DataForSEO y de su login.

**Frontend — el navegador deja de ser fuente de claves:**

- `Analysis.tsx` y `AIOverview.tsx` ya no leen `localStorage` ni envían
  `userApiKeys`.
- `Configuration.tsx` no precarga el formulario desde `localStorage` y no
  escribe ahí al guardar. Además borra la entrada heredada al abrirse, para que
  no quede ninguna clave suelta en navegadores que vengan de la versión anterior.
- `authStore.logout()` borra `localStorage['userApiKeys']`: defensa en
  profundidad para los navegadores que aún la tengan.
- Corregido el aviso de privacidad, que afirmaba en falso que las claves no
  salían del navegador.

## Verificación

Probado en local con dos usuarios reales, en las dos direcciones:

| Escenario | Resultado |
|---|---|
| Usuario B **sin claves** inyecta la clave de A en el body | `400 API_KEYS_REQUIRED` — el body se ignora ✅ |
| Usuario A **con clave en BD**, sin enviar nada en el body | La resuelve y llega al proveedor ✅ |

El segundo caso devuelve un 401 del proveedor porque la clave está rotada, y eso
mismo confirma que se leyó de la base y se usó.

## Limpieza de las claves ya contaminadas · PENDIENTE

El arreglo corta la propagación, pero **no puede saber qué claves ya guardadas
son legítimas y cuáles heredadas**. Sí se pueden detectar: si dos cuentas tienen
exactamente la misma clave, una de las dos la heredó.

### Herramienta

```bash
npm run keys:compartidas
```

`scripts/detectar-keys-compartidas.ts` recorre todas las cuentas, descifra sus
claves en memoria y agrupa por huella SHA-256. **Nunca imprime una clave**: solo
un prefijo de la huella, que no permite reconstruir el secreto. Sale con código
1 si encuentra claves compartidas.

En producción hay que apuntarlo al código compilado (`dist-api`, no `api`) y
ejecutarlo dentro del contenedor, que es donde vive `API_KEY_ENCRYPTION_SECRET`:

```bash
docker exec mediciones-ia-api sh -lc "cd /app && npx tsx scripts/detectar-keys-compartidas.ts"
```

### Resultado de la primera pasada (25/08/2026)

**7 claves compartidas entre 23 cuentas.** Reparto por proveedor:

| Proveedor | Claves compartidas | Mayor grupo |
|---|---|---|
| DataForSEO | 3 | una clave en **7 cuentas** |
| OpenAI | 3 | una clave en 4 cuentas |
| OpenRouter | 2 | 2 cuentas cada una |

**No todo es contaminación.** Hay dos patrones muy distintos y conviene no
confundirlos:

- **Dentro de la agencia** (cuentas `@lin3s.com` / `@seobide.com`): compartir una
  única suscripción de DataForSEO entre gestores puede ser deliberado. Merece
  confirmarse, pero no es alarmante.
- **Entre clientes distintos**: es el caso preocupante. Hay claves compartidas
  entre cuentas de clientes que no tienen relación entre sí. Ahí no hay
  explicación legítima: o alguien heredó la clave de otro, o se está facturando
  el consumo de un cliente a otro.

El detalle cuenta por cuenta no se guarda en el repositorio a propósito —cruza
correos de clientes con qué credenciales comparten—; se revisa ejecutando la
herramienta.

### Procedimiento

1. Ejecutar `keys:compartidas` y separar los grupos internos de los que cruzan
   clientes.
2. Para cada grupo que cruce clientes, confirmar con los implicados de quién es
   la clave.
3. Quien la haya heredado: borrarla y guardar la suya desde
   Configuración > API Keys.
4. Volver a ejecutar la herramienta hasta que solo queden grupos justificados.

> Hacerlo **después** de desplegar el arreglo. Si se limpia antes, el formulario
> precargado puede volver a contaminar en la siguiente sesión compartida.

## Estado

Código arreglado. Limpieza de datos pendiente (ver arriba).

Instrucciones para Levantar los Servicios

  Prerequisitos

  - Node.js instalado (versión 16 o superior)
  - npm instalado

  Configuración Inicial

  1. Verificar que las dependencias estén instaladas:
  npm install
  2. Verificar el archivo de variables de entorno:
  El proyecto ya tiene configurado el archivo .env con:
    - OPENAI_API_KEY: Clave para la API de OpenAI
    - PORT: Puerto del servidor (3003)

  Opciones para Levantar los Servicios

  Opción 1: Levantar Frontend y Backend Juntos (Recomendado)

  npm run dev
  Este comando levanta simultáneamente:
  - Frontend (Cliente): http://localhost:5173 (puerto por defecto de Vite)
  - Backend (Servidor): http://localhost:3003

  Opción 2: Levantar los Servicios por Separado

  Terminal 1 - Backend:
  npm run server:dev
  Levanta el servidor API en http://localhost:3003

  Terminal 2 - Frontend:
  npm run client:dev
  Levanta el cliente React en http://localhost:5173

  Verificar que los Servicios Estén Funcionando

  1. Frontend: Abre tu navegador en http://localhost:5173
  2. Backend: Puedes verificar con:
  curl http://localhost:3003

  Comandos Adicionales Útiles

  - Compilar para producción:
  npm run build
  - Vista previa de la build:
  npm run preview
  - Verificar tipos TypeScript:
  npm run check
  - Linter:
  npm run lint

  Estructura del Proyecto

  - Frontend: Carpeta src/ - Aplicación React con TypeScript
  - Backend: Carpeta api/ - Servidor Express con TypeScript
  - Base de datos: SQLite3 (carpeta data/)
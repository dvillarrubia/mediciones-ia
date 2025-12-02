# Mediciones IA

Plataforma de analisis de marca con inteligencia artificial que permite realizar analisis competitivos, de sentimiento y share of voice utilizando modelos de OpenAI, Anthropic Claude y Google Gemini.

![Node.js](https://img.shields.io/badge/Node.js-20+-green)
![React](https://img.shields.io/badge/React-18.3-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)
![Docker](https://img.shields.io/badge/Docker-Ready-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)

## Caracteristicas

- **Analisis Multi-IA**: Ejecuta analisis simultaneos con ChatGPT, Claude y Gemini
- **Analisis de Sentimiento**: Detecta sentimientos (muy positivo, positivo, neutral, negativo, muy negativo)
- **Share of Voice**: Mide la presencia de marca vs competidores
- **Dashboard Interactivo**: Visualiza metricas, tendencias y graficos
- **Gestion de Proyectos**: Organiza analisis por proyectos
- **Importacion Excel**: Carga preguntas desde archivos Excel
- **Exportacion de Reportes**: Genera reportes en Markdown, JSON, CSV y Excel
- **API REST**: Backend completo con endpoints documentados

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                      MEDICIONES IA                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │  Frontend   │───▶│   Backend   │───▶│   SQLite    │     │
│  │   React     │    │   Express   │    │  Database   │     │
│  │  Port 5173  │    │  Port 3003  │    │             │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│                            │                                │
│                            ▼                                │
│                   ┌─────────────────┐                      │
│                   │   APIs de IA    │                      │
│                   │ OpenAI/Claude/  │                      │
│                   │     Gemini      │                      │
│                   └─────────────────┘                      │
└─────────────────────────────────────────────────────────────┘
```

## Tecnologias

| Componente | Tecnologia |
|------------|------------|
| Frontend | React 18 + TypeScript + Vite + TailwindCSS |
| Backend | Node.js 20 + Express + TypeScript |
| Base de Datos | SQLite3 |
| IA | OpenAI, Anthropic, Google AI |
| Contenedores | Docker + Docker Compose |
| Graficos | Recharts |
| Estado | Zustand |

## Inicio Rapido

### Requisitos

- Node.js 20+
- npm 9+
- API Key de OpenAI (obligatorio)

### Instalacion

```bash
# Clonar repositorio
git clone https://github.com/dvillarrubia/mediciones-ia.git
cd mediciones-ia

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tu API key de OpenAI

# Instalar dependencias
npm install

# Iniciar en modo desarrollo
npm run dev
```

La aplicacion estara disponible en:
- **Frontend**: http://localhost:5173
- **API**: http://localhost:3003

### Configuracion del archivo .env

```env
# API Key de OpenAI (OBLIGATORIO)
OPENAI_API_KEY=sk-tu-api-key-aqui

# Puerto del servidor
PORT=3003

# API Keys opcionales (para analisis multi-modelo)
ANTHROPIC_API_KEY=
GOOGLE_AI_API_KEY=

# JWT Secret (cambiar en produccion)
JWT_SECRET=tu-secreto-seguro
```

## Instalacion con Docker

### Desarrollo Local

```bash
# Configurar variables
cp .env.docker .env
# Editar .env con tus API keys

# Construir e iniciar
docker compose up -d

# Ver logs
docker compose logs -f app
```

Acceder a: http://localhost:3003

### Produccion (VPS)

```bash
# En tu VPS
git clone https://github.com/dvillarrubia/mediciones-ia.git
cd mediciones-ia

# Configurar
cp .env.docker .env
nano .env  # Agregar API keys

# Iniciar
docker compose up -d
```

Para guia completa de instalacion en VPS, ver [GUIA_INSTALACION_COMPLETA.md](./GUIA_INSTALACION_COMPLETA.md)

## Estructura del Proyecto

```
mediciones-ia/
├── api/                    # Backend (Express + TypeScript)
│   ├── routes/            # Endpoints de la API
│   │   ├── analysis.ts    # Analisis de marca
│   │   ├── dashboard.ts   # Metricas y estadisticas
│   │   ├── projects.ts    # Gestion de proyectos
│   │   └── templates.ts   # Plantillas de analisis
│   ├── services/          # Logica de negocio
│   │   ├── openaiService.ts    # Integracion con IAs
│   │   ├── databaseService.ts  # SQLite
│   │   ├── cacheService.ts     # Cache en memoria
│   │   └── excelService.ts     # Generacion Excel
│   └── server.ts          # Entry point
│
├── src/                    # Frontend (React + TypeScript)
│   ├── pages/             # Paginas principales
│   │   ├── Dashboard.tsx      # Panel principal
│   │   ├── Analysis.tsx       # Ejecutar analisis
│   │   ├── IntelligenceHub.tsx # Hub de IA avanzado
│   │   ├── History.tsx        # Historial
│   │   ├── Configuration.tsx  # Configuracion
│   │   └── Reports.tsx        # Reportes
│   ├── components/        # Componentes reutilizables
│   └── store/             # Estado global (Zustand)
│
├── docker/                 # Configuracion Docker
├── deployment/             # Scripts de deployment
├── Dockerfile             # Imagen Docker
├── docker-compose.yml     # Desarrollo
└── docker-compose.prod.yml # Produccion
```

## API Endpoints

### Analisis

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| POST | `/api/analysis/execute` | Ejecutar analisis |
| POST | `/api/analysis/multi-model` | Analisis multi-IA |
| GET | `/api/analysis/history` | Historial de analisis |
| GET | `/api/analysis/saved` | Analisis guardados |
| GET | `/api/analysis/saved/:id` | Obtener analisis por ID |
| DELETE | `/api/analysis/saved/:id` | Eliminar analisis |

### Reportes

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| POST | `/api/analysis/report/markdown` | Generar reporte Markdown |
| POST | `/api/analysis/report/json` | Generar reporte JSON |
| POST | `/api/analysis/report/table` | Generar reporte CSV |
| POST | `/api/analysis/report/excel` | Generar reporte Excel |

### Proyectos

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/projects` | Listar proyectos |
| POST | `/api/projects` | Crear proyecto |
| GET | `/api/projects/:id` | Obtener proyecto |
| PUT | `/api/projects/:id` | Actualizar proyecto |
| DELETE | `/api/projects/:id` | Eliminar proyecto |

### Dashboard

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/dashboard` | Obtener metricas del dashboard |
| GET | `/api/health` | Health check |

## Scripts Disponibles

```bash
# Desarrollo
npm run dev          # Inicia frontend + backend con hot reload

# Solo frontend
npm run client:dev   # Inicia Vite dev server

# Solo backend
npm run server:dev   # Inicia backend con nodemon

# Build
npm run build        # Compila frontend y backend

# Linting
npm run lint         # Ejecuta ESLint
npm run check        # Verifica tipos TypeScript
```

## Documentacion Adicional

- [Guia de Instalacion Completa](./GUIA_INSTALACION_COMPLETA.md) - Instalacion detallada en Docker y VPS
- [Configuracion de Modelos IA](./CONFIGURACION_MODELOS_IA.md) - Setup de OpenAI, Claude y Gemini
- [Opciones de Hosting](./deployment/HOSTING_OPTIONS.md) - Comparativa de proveedores
- [Quick Start de Deployment](./deployment/QUICK_START.md) - Guia rapida de deploy

## Variables de Entorno

| Variable | Obligatoria | Descripcion | Default |
|----------|-------------|-------------|---------|
| `PORT` | No | Puerto del servidor | 3003 |
| `OPENAI_API_KEY` | Si | API Key de OpenAI | - |
| `ANTHROPIC_API_KEY` | No | API Key de Anthropic | - |
| `GOOGLE_AI_API_KEY` | No | API Key de Google AI | - |
| `JWT_SECRET` | Prod | Secreto para JWT | - |
| `NODE_ENV` | No | Entorno de ejecucion | development |

## Contribuir

1. Fork el repositorio
2. Crea tu rama (`git checkout -b feature/nueva-funcionalidad`)
3. Commit tus cambios (`git commit -m 'Agrega nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Abre un Pull Request

## Licencia

Este proyecto esta bajo la Licencia MIT. Ver el archivo [LICENSE](LICENSE) para mas detalles.

---

Desarrollado con React + TypeScript + Vite

/**
 * This is a API server
 */

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// for esm mode
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// load env FIRST before any other imports
dotenv.config({ path: path.resolve(__dirname, '../.env') })

// Debug: Log environment variables
console.log('🔧 Environment variables loaded:')
console.log('- OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? `${process.env.OPENAI_API_KEY.substring(0, 20)}...` : 'NOT SET')
console.log('- PORT:', process.env.PORT || 'NOT SET')

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import authRoutes from './routes/auth.js'
import analysisRoutes from './routes/analysis.js'
import templatesRoutes from './routes/templates.js'
import dashboardRoutes from './routes/dashboard.js'
import cacheRoutes from './routes/cache.js'
import projectsRoutes from './routes/projects.js'
import adminRoutes from './routes/admin.js'

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

/**
 * API Routes
 */
app.use('/api/auth', authRoutes)
app.use('/api/analysis', analysisRoutes)
app.use('/api/templates', templatesRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/cache', cacheRoutes)
app.use('/api/projects', projectsRoutes)
app.use('/api/admin', adminRoutes)

/**
 * health
 */
app.use(
  '/api/health',
  (req: Request, res: Response, next: NextFunction): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
    })
  },
)

/**
 * Serve static files in production
 */
if (process.env.NODE_ENV === 'production') {
  const distPath = path.resolve(__dirname, '../dist')

  // Serve static assets
  app.use(express.static(distPath, {
    maxAge: '1y',
    etag: true,
  }))

  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    // Skip API routes
    if (req.path.startsWith('/api')) {
      return next()
    }
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

/**
 * error handler middleware
 */
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Server error:', error)
  res.status(500).json({
    success: false,
    error: 'Server internal error',
  })
})

/**
 * 404 handler for API routes
 */
app.use('/api/*', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export default app

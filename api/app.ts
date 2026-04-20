/**
 * This is a API server
 */

import dotenv from 'dotenv'
import path from 'path'

// load env FIRST before any other imports
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

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
import aiOverviewRoutes from './routes/aiOverview.js'

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

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
app.use('/api/ai-overview', aiOverviewRoutes)

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

// Configuración de PM2 para Mediciones IA
// Uso: pm2 start deployment/pm2.config.js

module.exports = {
  apps: [
    {
      name: 'mediciones-ia-api',
      script: './api/server.js',
      cwd: '/var/www/mediciones-ia',
      instances: 2, // 2 instancias para balanceo de carga
      exec_mode: 'cluster',
      watch: false, // No watch en producción
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3003
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      listen_timeout: 10000,
      kill_timeout: 5000,
      shutdown_with_message: true
    }
  ]
};

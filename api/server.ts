/**
 * local server entry file, for local development
 */
import app from './app.js';
import { schedulerService } from './services/schedulerService.js';
import { adminService } from './services/adminService.js';

/**
 * start server with port
 */
const PORT = process.env.PORT || 3003;

const server = app.listen(PORT, () => {
  console.log(`🚀 Server ready on port ${PORT}`);
  schedulerService.start();

  // Sincronizar el catálogo de modelos en cada arranque. Es necesario porque la
  // tabla ai_models persiste entre despliegues: sin esto, una instalación
  // existente seguiría ofreciendo modelos que el proveedor ya deprecó (y que
  // devuelven 404 al usarlos) hasta que alguien pulsara el botón de sincronizar
  // en el panel de admin. No bloquea el arranque: si falla, se registra y ya.
  adminService.fullModelSync().catch((err) => {
    console.error('⚠️ No se pudo sincronizar el catálogo de modelos al arrancar:', err);
  });
});

/**
 * close server
 */
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;
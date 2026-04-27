import { useEffect, useState } from 'react';
import { AlertTriangle, X, ExternalLink } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { API_ENDPOINTS, apiFetch } from '../config/api';
import { useAuthStore } from '../store/authStore';

interface HealthData {
  hasUnacknowledgedErrors: boolean;
  errorCount: number;
  latest: {
    id: string;
    name: string;
    projectId: string;
    lastError: string | null;
    lastRunAt: number | null;
  } | null;
}

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 min

const ScheduleHealthBanner = () => {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [dismissedLocally, setDismissedLocally] = useState(false);
  const { isAuthenticated } = useAuthStore();
  const location = useLocation();

  async function loadHealth() {
    try {
      const res = await apiFetch(API_ENDPOINTS.schedulesHealth);
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setHealth(data.data);
      }
    } catch {
      // fallo silencioso: no bloqueamos la UI por el banner
    }
  }

  useEffect(() => {
    if (!isAuthenticated) return;
    loadHealth();
    const interval = setInterval(loadHealth, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // Al cambiar de ruta, refrescar para recoger ack hechos en otras pestañas
  useEffect(() => {
    if (isAuthenticated) loadHealth();
    setDismissedLocally(false);
  }, [location.pathname]);

  if (!isAuthenticated || !health || !health.hasUnacknowledgedErrors || dismissedLocally) {
    return null;
  }

  const latest = health.latest;
  const msg = latest?.lastError || 'Una automatización ha fallado en su última ejecución.';

  return (
    <div className="bg-red-50 border-b border-red-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-red-800">
                {health.errorCount === 1
                  ? 'Una automatización ha fallado'
                  : `${health.errorCount} automatizaciones han fallado`}
              </span>
              {latest && (
                <span className="text-sm text-red-700">· {latest.name}</span>
              )}
            </div>
            <p className="text-sm text-red-700 mt-1 line-clamp-2">{msg}</p>
          </div>
          <Link
            to="/intelligence?tab=schedules"
            className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors whitespace-nowrap"
          >
            Ver detalles
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
          <button
            onClick={() => setDismissedLocally(true)}
            title="Ocultar hasta el próximo cambio de página"
            className="p-1 hover:bg-red-100 rounded text-red-600 flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScheduleHealthBanner;

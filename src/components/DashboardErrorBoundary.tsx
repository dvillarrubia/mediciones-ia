import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  /** Nombre de la pestaña, para el mensaje. */
  tab: string;
  children: React.ReactNode;
}
interface State { error: Error | null }

/**
 * Red de seguridad para las pestañas del Intelligence Hub.
 *
 * Los dashboards derivan todo en cliente a partir de análisis históricos con
 * formatos heterogéneos. Sin esto, cualquier excepción al calcular (p.ej. una
 * evidencia guardada como array anidado, ago/2026) desmontaba el árbol entero
 * de React y el usuario veía la página en blanco sin ninguna pista. Con esto,
 * falla solo la pestaña, se ve el error y el resto de la app sigue usable.
 */
export default class DashboardErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[${this.props.tab}] Error al renderizar la pestaña:`, error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    // Al cambiar de pestaña (children distintos) se reintenta el render.
    if (prev.children !== this.props.children && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-800 space-y-2">
        <div className="flex items-center gap-2 font-semibold">
          <AlertTriangle className="w-5 h-5" /> No se ha podido mostrar la pestaña {this.props.tab}
        </div>
        <p>Ha fallado el cálculo con los datos de este proyecto. El resto de pestañas siguen funcionando.</p>
        <pre className="text-xs bg-white/70 border border-red-100 rounded p-2 overflow-x-auto whitespace-pre-wrap">
          {this.state.error.message}
        </pre>
        <button
          onClick={() => this.setState({ error: null })}
          className="text-xs px-3 py-1.5 rounded border border-red-300 hover:bg-red-100"
        >
          Reintentar
        </button>
      </div>
    );
  }
}

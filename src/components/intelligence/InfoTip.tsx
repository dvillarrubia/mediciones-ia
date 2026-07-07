import React from 'react';
import { Info } from 'lucide-react';

/**
 * Icono ⓘ con tooltip nativo para explicar qué mide una métrica y de dónde sale.
 * Uso: <InfoTip text="..." /> junto al título o etiqueta de la métrica.
 */
const InfoTip: React.FC<{ text: string; className?: string }> = ({ text, className }) => (
  <span
    className={`inline-flex align-middle text-gray-400 cursor-help flex-shrink-0 ${className || ''}`}
    title={text}
  >
    <Info className="w-3.5 h-3.5" />
  </span>
);

export default InfoTip;

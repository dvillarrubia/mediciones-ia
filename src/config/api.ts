// API Configuration
// Usa el mismo origen que sirve el frontend (nginx hace proxy de /api/)
const API_BASE_URL = typeof window !== 'undefined'
  ? window.location.origin
  : 'http://localhost:3003';

export const API_ENDPOINTS = {
  // Health check
  health: `${API_BASE_URL}/api/health`,

  // Projects
  projects: `${API_BASE_URL}/api/projects`,

  // Templates
  templates: `${API_BASE_URL}/api/templates`,
  predefinedTemplates: `${API_BASE_URL}/api/templates/predefined`,
  customConfigurations: `${API_BASE_URL}/api/templates/configurations`,

  // AI Models & Countries
  aiModels: `${API_BASE_URL}/api/templates/ai-models`,
  countries: `${API_BASE_URL}/api/templates/countries`,

  // Analysis
  analysisCategories: `${API_BASE_URL}/api/analysis/categories`,
  analysisExecute: `${API_BASE_URL}/api/analysis/execute`,
  analysisExecuteStream: `${API_BASE_URL}/api/analysis/execute-stream`,
  analysisReport: `${API_BASE_URL}/api/analysis/report`,
  analysisSaved: `${API_BASE_URL}/api/analysis/saved`,
  analysisReportMarkdown: `${API_BASE_URL}/api/analysis/report/markdown`,
  analysisReportJSON: `${API_BASE_URL}/api/analysis/report/json`,
  analysisReportTable: `${API_BASE_URL}/api/analysis/report/table`,
  analysisReportExcel: `${API_BASE_URL}/api/analysis/report/excel`,
  analysisReportPDF: `${API_BASE_URL}/api/analysis/report/pdf`,

  // Dashboard
  dashboard: `${API_BASE_URL}/api/dashboard`,

  // AI Overview
  aiOverviewExecute: `${API_BASE_URL}/api/ai-overview/execute`,
  aiOverviewEstimate: `${API_BASE_URL}/api/ai-overview/estimate`,
  aiOverviewHistory: `${API_BASE_URL}/api/ai-overview/history`,
  aiOverviewResults: `${API_BASE_URL}/api/ai-overview/results`,
  aiOverviewValidate: `${API_BASE_URL}/api/ai-overview/validate-credentials`,

  // Auth (if needed)
  auth: `${API_BASE_URL}/api/auth`,
};

/**
 * Fetch wrapper que inyecta automáticamente el token de autenticación
 */
export const apiFetch = (url: string, options: RequestInit = {}): Promise<Response> => {
  const token = JSON.parse(localStorage.getItem('auth-store') || '{}')?.state?.token;
  const headers = new Headers(options.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(url, { ...options, headers });
};

export default API_BASE_URL;
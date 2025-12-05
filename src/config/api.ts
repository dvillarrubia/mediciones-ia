// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3003';

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
  analysisReport: `${API_BASE_URL}/api/analysis/report`,
  analysisSaved: `${API_BASE_URL}/api/analysis/saved`,
  analysisReportMarkdown: `${API_BASE_URL}/api/analysis/report/markdown`,
  analysisReportJSON: `${API_BASE_URL}/api/analysis/report/json`,
  analysisReportTable: `${API_BASE_URL}/api/analysis/report/table`,
  analysisReportExcel: `${API_BASE_URL}/api/analysis/report/excel`,
  analysisReportPDF: `${API_BASE_URL}/api/analysis/report/pdf`,

  // Dashboard
  dashboard: `${API_BASE_URL}/api/dashboard`,

  // Auth (if needed)
  auth: `${API_BASE_URL}/api/auth`,
};

export default API_BASE_URL;
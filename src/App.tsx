import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Analysis from './pages/Analysis';
import Configuration from './pages/Configuration';
import Reports from './pages/Reports';
import History from './pages/History';
import Import from './pages/Import';
import Comparator from './pages/Comparator';
import IntelligenceHub from './pages/IntelligenceHub';

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/import" element={<Import />} />
          <Route path="/intelligence" element={<IntelligenceHub />} />
          {/* Redirecciones de rutas antiguas al nuevo Centro de Inteligencia */}
          <Route path="/reports" element={<Navigate to="/intelligence" replace />} />
          <Route path="/comparator" element={<Navigate to="/intelligence" replace />} />
          <Route path="/history" element={<Navigate to="/intelligence" replace />} />
          <Route path="/settings" element={<Configuration />} />
        </Routes>
      </Layout>
    </Router>
  );
}

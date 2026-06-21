import { Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Portfolio from './pages/Portfolio.jsx';
import Trade from './pages/Trade.jsx';
import Settings from './pages/Settings.jsx';
import Backtest from './pages/Backtest.jsx';

/**
 * Root application component.
 * Declares react-router-dom v6 routes, all rendered inside the shared <Layout>.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/trade" element={<Trade />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/backtest" element={<Backtest />} />
      </Route>
    </Routes>
  );
}

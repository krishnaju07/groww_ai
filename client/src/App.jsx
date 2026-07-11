import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout/Layout.jsx';
import { Spinner } from './components/common/Spinner.jsx';
// Dashboard is the landing route — kept eager so the first paint has no lazy-load
// flash. Everything else is only fetched when the user actually navigates there,
// which is what keeps the initial bundle from shipping every page's (and both
// charting libraries') code up front.
import { Dashboard } from './pages/Dashboard.jsx';

const namedExport = (loader, name) => lazy(() => loader().then((m) => ({ default: m[name] })));

const Trade = namedExport(() => import('./pages/Trade.jsx'), 'Trade');
const Portfolio = namedExport(() => import('./pages/Portfolio.jsx'), 'Portfolio');
const AIDecisions = namedExport(() => import('./pages/AIDecisions.jsx'), 'AIDecisions');
const Risk = namedExport(() => import('./pages/Risk.jsx'), 'Risk');
const Settings = namedExport(() => import('./pages/Settings.jsx'), 'Settings');
const Brokers = namedExport(() => import('./pages/Brokers.jsx'), 'Brokers');
const Orders = namedExport(() => import('./pages/Orders.jsx'), 'Orders');
const LiveTrading = namedExport(() => import('./pages/LiveTrading.jsx'), 'LiveTrading');
const Backtest = namedExport(() => import('./pages/Backtest.jsx'), 'Backtest');
const Reports = namedExport(() => import('./pages/Reports.jsx'), 'Reports');

function PageFallback() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner className="h-6 w-6" />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/trade" element={<Trade />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/ai-decisions" element={<AIDecisions />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/backtest" element={<Backtest />} />
          <Route path="/live-trading" element={<LiveTrading />} />
          <Route path="/risk" element={<Risk />} />
          <Route path="/brokers" element={<Brokers />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

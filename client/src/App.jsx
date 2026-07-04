import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout/Layout.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { Trade } from './pages/Trade.jsx';
import { Portfolio } from './pages/Portfolio.jsx';
import { AIDecisions } from './pages/AIDecisions.jsx';
import { Risk } from './pages/Risk.jsx';
import { Settings } from './pages/Settings.jsx';
import { Brokers } from './pages/Brokers.jsx';
import { Orders } from './pages/Orders.jsx';
import { LiveTrading } from './pages/LiveTrading.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/trade" element={<Trade />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/ai-decisions" element={<AIDecisions />} />
        <Route path="/live-trading" element={<LiveTrading />} />
        <Route path="/risk" element={<Risk />} />
        <Route path="/brokers" element={<Brokers />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

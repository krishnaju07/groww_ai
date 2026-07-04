import { usePolling } from '../hooks/usePolling.js';
import { usePortfolioStore } from '../store/usePortfolioStore.js';
import { useRiskStore } from '../store/useRiskStore.js';
import { useAIStore } from '../store/useAIStore.js';
import { useAISignalsStore } from '../store/useAISignalsStore.js';
import { dashboardService } from '../services/dashboard.service.js';
import { useEffect, useState } from 'react';
import { PortfolioSummaryBar } from '../components/dashboard/PortfolioSummaryBar.jsx';
import { EquityCurve } from '../components/dashboard/EquityCurve.jsx';
import { AIDecisionFeed } from '../components/dashboard/AIDecisionFeed.jsx';
import { AITopPicks } from '../components/dashboard/AITopPicks.jsx';
import { RecentTradesTable } from '../components/dashboard/RecentTradesTable.jsx';
import { RiskSummaryCard } from '../components/dashboard/RiskSummaryCard.jsx';

export function Dashboard() {
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const fetchPortfolio = usePortfolioStore((s) => s.fetch);
  const meter = useRiskStore((s) => s.meter);
  const fetchRisk = useRiskStore((s) => s.fetch);
  const decisions = useAIStore((s) => s.decisions);
  const fetchDecisions = useAIStore((s) => s.fetchDecisions);
  const signals = useAISignalsStore((s) => s.signals);
  const fetchSignals = useAISignalsStore((s) => s.fetch);
  const [equityCurve, setEquityCurve] = useState([]);
  const [trades, setTrades] = useState([]);

  usePolling(fetchPortfolio, 5000);
  usePolling(fetchRisk, 8000);
  usePolling(() => fetchDecisions({ limit: 15 }), 10000);
  usePolling(fetchSignals, 30000);

  useEffect(() => {
    dashboardService.equityCurve().then(setEquityCurve);
  }, [portfolio]);

  useEffect(() => {
    dashboardService.summary().then((d) => setTrades(d.recentTrades));
  }, [portfolio]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted">Your AI-powered trading command center.</p>
      </div>

      <PortfolioSummaryBar portfolio={portfolio} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <EquityCurve data={equityCurve} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-6">
          <RiskSummaryCard meter={meter} />
          <AITopPicks signals={signals} />
        </div>
        <div className="lg:col-span-2">
          <AIDecisionFeed decisions={decisions} />
        </div>
      </div>

      <RecentTradesTable trades={trades} />
    </div>
  );
}

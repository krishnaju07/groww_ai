import { usePolling } from '../hooks/usePolling.js';
import { usePortfolioStore } from '../store/usePortfolioStore.js';
import { useRiskStore } from '../store/useRiskStore.js';
import { useAIStore } from '../store/useAIStore.js';
import { useAISignalsStore } from '../store/useAISignalsStore.js';
import { dashboardService } from '../services/dashboard.service.js';
import { useState } from 'react';
import { PortfolioSummaryBar } from '../components/dashboard/PortfolioSummaryBar.jsx';
import { EquityCurve } from '../components/dashboard/EquityCurve.jsx';
import { AIDecisionFeed } from '../components/dashboard/AIDecisionFeed.jsx';
import { AITopPicks } from '../components/dashboard/AITopPicks.jsx';
import { RecentTradesTable } from '../components/dashboard/RecentTradesTable.jsx';
import { RiskSummaryCard } from '../components/dashboard/RiskSummaryCard.jsx';
import { TodayGlanceCard } from '../components/dashboard/TodayGlanceCard.jsx';
import { LearningInsightTeaser } from '../components/dashboard/LearningInsightTeaser.jsx';
import { RegimeBadge } from '../components/trading/RegimeBadge.jsx';
import { AutoTradeActivityFeed } from '../components/trading/AutoTradeActivityFeed.jsx';
import { Card } from '../components/common/Card.jsx';

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
  // Independent polling intervals instead of a `[portfolio]` dependency — that object
  // gets a new reference on every 5s portfolio poll regardless of whether anything
  // actually changed, which was re-firing these two network calls every 5s forever.
  usePolling(() => dashboardService.equityCurve().then(setEquityCurve), 15000);
  usePolling(() => dashboardService.summary().then((d) => setTrades(d.recentTrades)), 10000);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted">Your AI-powered trading command center.</p>
        </div>
        <RegimeBadge />
      </div>

      <PortfolioSummaryBar portfolio={portfolio} />

      <TodayGlanceCard />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <EquityCurve data={equityCurve} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-6">
          <RiskSummaryCard meter={meter} />
          <LearningInsightTeaser />
          <AITopPicks signals={signals} />
        </div>
        <div className="lg:col-span-2">
          <AIDecisionFeed decisions={decisions} />
        </div>
      </div>

      <Card>
        <div className="mb-1 font-display font-semibold">Auto-Trading Activity</div>
        <p className="mb-3 text-xs text-muted">
          What the 30s auto-trading tick is doing right now — every skip, veto, and order attempt.
        </p>
        <AutoTradeActivityFeed />
      </Card>

      <RecentTradesTable trades={trades} />
    </div>
  );
}

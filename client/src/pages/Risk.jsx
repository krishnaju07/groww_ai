import { useRiskStore } from '../store/useRiskStore.js';
import { usePolling } from '../hooks/usePolling.js';
import { RiskSummaryCard } from '../components/dashboard/RiskSummaryCard.jsx';
import { RiskConfigForm } from '../components/risk/RiskConfigForm.jsx';
import { RiskEventLog } from '../components/risk/RiskEventLog.jsx';
import { KillSwitchButton } from '../components/common/KillSwitchButton.jsx';

export function Risk() {
  const config = useRiskStore((s) => s.config);
  const meter = useRiskStore((s) => s.meter);
  const events = useRiskStore((s) => s.events);
  const fetch = useRiskStore((s) => s.fetch);
  const fetchEvents = useRiskStore((s) => s.fetchEvents);
  const updateConfig = useRiskStore((s) => s.updateConfig);

  usePolling(fetch, 8000);
  usePolling(fetchEvents, 10000);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Risk</h1>
          <p className="text-sm text-muted">Guardrails that gate every order — paper and live alike.</p>
        </div>
        <KillSwitchButton engaged={config?.killSwitchEngaged} />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <RiskSummaryCard meter={meter} />
        <RiskConfigForm config={config} onSave={updateConfig} />
      </div>

      <RiskEventLog events={events} />
    </div>
  );
}

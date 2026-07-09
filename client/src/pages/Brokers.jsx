import { Link } from 'react-router-dom';
import { useBrokerStore } from '../store/useBrokerStore.js';
import { usePolling } from '../hooks/usePolling.js';
import { BrokerCard } from '../components/brokers/BrokerCard.jsx';
import { brokersService } from '../services/brokers.service.js';

export function Brokers() {
  const status = useBrokerStore((s) => s.status);
  const fetchStatus = useBrokerStore((s) => s.fetch);

  usePolling(fetchStatus, 15000);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Brokers</h1>
        <p className="text-sm text-muted">
          Groww is the only broker this platform connects to for real-money trading. Switching between Paper/Live mode
          and the live-money safety switches live on the <Link to="/live-trading" className="text-accent underline">Live Trading page</Link>.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <BrokerCard
          name="groww"
          label="Groww"
          connected={status?.groww?.connected}
          description="Reuses GROWW_API_KEY/SECRET from server .env. Requires daily approval on Groww's API Keys page before a token can be generated."
          onReconnectRedirect={async () => {
            window.open('https://groww.in/trade-api/api-keys', '_blank', 'noopener');
            await brokersService.testGroww();
            await fetchStatus();
          }}
        />
      </div>
    </div>
  );
}

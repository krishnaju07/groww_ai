import { useEffect } from 'react';
import { useBrokerStore } from '../store/useBrokerStore.js';
import { useSettingsStore } from '../store/useSettingsStore.js';
import { usePolling } from '../hooks/usePolling.js';
import { BrokerCard } from '../components/brokers/BrokerCard.jsx';
import { TradingModeToggle } from '../components/brokers/TradingModeToggle.jsx';
import { brokersService } from '../services/brokers.service.js';

export function Brokers() {
  const status = useBrokerStore((s) => s.status);
  const fetchStatus = useBrokerStore((s) => s.fetch);
  const tradingMode = useSettingsStore((s) => s.tradingMode);
  const fetchSettings = useSettingsStore((s) => s.fetch);

  usePolling(fetchStatus, 15000);

  useEffect(() => {
    fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refreshAll() {
    fetchStatus();
    fetchSettings();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Brokers</h1>
        <p className="text-sm text-muted">Connect a real broker to enable live trading, gated behind a 5-layer safety check.</p>
      </div>

      <TradingModeToggle tradingMode={tradingMode} brokerStatus={status} onChanged={refreshAll} />

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
        <BrokerCard
          name="angelone"
          label="Angel One"
          connected={status?.angelone?.connected}
          description="Free API access. Enter your Smart API credentials to connect."
          fields={[
            { key: 'apiKey', label: 'API Key' },
            { key: 'clientCode', label: 'Client Code' },
            { key: 'password', label: 'Password / PIN', type: 'password' },
            { key: 'totpSecret', label: 'TOTP Secret (base32)', type: 'password' },
          ]}
          onConnect={(values) => brokersService.connectAngelOne(values).then(fetchStatus)}
          onDisconnect={() => brokersService.disconnectAngelOne().then(fetchStatus)}
        />
        <BrokerCard
          name="zerodha"
          label="Zerodha"
          connected={status?.zerodha?.connected}
          description="Requires a daily browser login (Kite Connect). Click Reconnect each trading day."
          onReconnectRedirect={async () => {
            const { url } = await brokersService.zerodhaLoginUrl();
            window.location.href = url;
          }}
          onDisconnect={() => brokersService.disconnectZerodha().then(fetchStatus)}
        />
      </div>
    </div>
  );
}

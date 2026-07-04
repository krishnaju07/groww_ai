import { useOrdersStore } from '../store/useOrdersStore.js';
import { usePolling } from '../hooks/usePolling.js';
import { OrderBook } from '../components/trading/OrderBook.jsx';
import { toast } from '../store/useToastStore.js';

export function Orders() {
  const orders = useOrdersStore((s) => s.orders);
  const fetch = useOrdersStore((s) => s.fetch);
  const cancel = useOrdersStore((s) => s.cancel);

  usePolling(fetch, 5000);

  async function handleCancel(id) {
    try {
      await cancel(id);
      toast.info('Order cancelled');
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Orders</h1>
        <p className="text-sm text-muted">Every order placed — manual, automatic, or AI-triggered — across paper and live.</p>
      </div>
      <OrderBook orders={orders} onCancel={handleCancel} />
    </div>
  );
}

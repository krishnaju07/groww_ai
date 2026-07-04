import { useState } from 'react';
import { Card } from '../common/Card.jsx';
import { Badge } from '../common/Badge.jsx';
import { Spinner } from '../common/Spinner.jsx';
import { BTN_PRIMARY, BTN_SECONDARY, INPUT } from '../../lib/ui.js';
import { toast } from '../../store/useToastStore.js';

/**
 * @param {{name:string, label:string, connected:boolean, description:string,
 *   fields?:Array<{key:string,label:string,type?:string}>, onConnect?:(values:object)=>Promise<void>,
 *   onDisconnect?:()=>Promise<void>, onReconnectRedirect?:()=>Promise<void>}} props
 */
export function BrokerCard({ name, label, connected, description, fields, onConnect, onDisconnect, onReconnectRedirect }) {
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function handleConnect() {
    setBusy(true);
    try {
      await onConnect(form);
      toast.success(`${label} connected`);
      setExpanded(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    try {
      await onDisconnect();
      toast.info(`${label} disconnected`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReconnect() {
    setBusy(true);
    try {
      await onReconnectRedirect();
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <div className="font-display font-semibold">{label}</div>
          <p className="mt-0.5 text-xs text-muted">{description}</p>
        </div>
        <Badge tone={connected ? 'accent' : 'default'}>{connected ? 'Connected' : 'Not connected'}</Badge>
      </div>

      <div className="mt-4 flex gap-2">
        {onReconnectRedirect && (
          <button onClick={handleReconnect} disabled={busy} className={`${BTN_PRIMARY} px-3 py-1.5 text-sm`}>
            {busy ? <Spinner className="h-4 w-4 text-bg" /> : 'Reconnect'}
          </button>
        )}
        {fields && !connected && (
          <button onClick={() => setExpanded((e) => !e)} className={`${BTN_SECONDARY} px-3 py-1.5 text-sm`}>
            {expanded ? 'Cancel' : 'Connect'}
          </button>
        )}
        {connected && onDisconnect && (
          <button onClick={handleDisconnect} disabled={busy} className={`${BTN_SECONDARY} px-3 py-1.5 text-sm`}>
            {busy ? <Spinner className="h-4 w-4" /> : 'Disconnect'}
          </button>
        )}
      </div>

      {expanded && fields && (
        <div className="mt-4 space-y-2">
          {fields.map((f) => (
            <input
              key={f.key}
              type={f.type ?? 'text'}
              placeholder={f.label}
              className={INPUT}
              value={form[f.key] ?? ''}
              onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
            />
          ))}
          <button onClick={handleConnect} disabled={busy} className={`${BTN_PRIMARY} w-full`}>
            {busy ? <Spinner className="h-4 w-4 text-bg" /> : `Save ${label} credentials`}
          </button>
        </div>
      )}
    </Card>
  );
}

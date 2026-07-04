import { useState } from 'react';
import { useRiskStore } from '../../store/useRiskStore.js';
import { toast } from '../../store/useToastStore.js';
import { BTN_DANGER, BTN_SECONDARY } from '../../lib/ui.js';

export function KillSwitchButton({ engaged }) {
  const tripKillSwitch = useRiskStore((s) => s.tripKillSwitch);
  const resetKillSwitch = useRiskStore((s) => s.resetKillSwitch);
  const [confirming, setConfirming] = useState(false);

  if (engaged) {
    return (
      <button onClick={() => resetKillSwitch().then(() => toast.info('Kill switch reset — trading re-enabled'))} className={BTN_SECONDARY}>
        Reset Kill Switch
      </button>
    );
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-danger">Cancel all orders &amp; close all positions?</span>
        <button
          onClick={() => {
            tripKillSwitch('manual').then(() => toast.error('Kill switch engaged — trading stopped'));
            setConfirming(false);
          }}
          className={BTN_DANGER}
        >
          Confirm STOP
        </button>
        <button onClick={() => setConfirming(false)} className={BTN_SECONDARY}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button onClick={() => setConfirming(true)} className={`${BTN_DANGER} animate-glow-pulse`}>
      EMERGENCY STOP
    </button>
  );
}

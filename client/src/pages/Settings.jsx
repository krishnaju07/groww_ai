import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Save, SlidersHorizontal } from 'lucide-react';
import useSettingsStore from '../store/useSettingsStore';
import { toast } from '../store/useToastStore';
import InvestmentLimits from '../components/settings/InvestmentLimits';
import AutoInvestSettings from '../components/settings/AutoInvestSettings';
import AutoExitSettings from '../components/settings/AutoExitSettings';
import Spinner from '../components/common/Spinner';
import Skeleton from '../components/common/Skeleton';
import { cx, BTN_PRIMARY, GRADIENT_TEXT } from '../lib/ui';

/**
 * Settings page (route `/settings`). Loads UserSettings into a local editable
 * draft, renders the three settings sections, and persists the whole draft via
 * `updateSettings`. Saving is disabled while a request is in flight; success and
 * error feedback render inline.
 * @returns {JSX.Element}
 */
export default function Settings() {
  const settings = useSettingsStore((s) => s.settings);
  const loading = useSettingsStore((s) => s.loading);
  const saving = useSettingsStore((s) => s.saving);
  const storeError = useSettingsStore((s) => s.error);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  /** @type {[import('../types').UserSettings | null, Function]} */
  const [draft, setDraft] = useState(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Seed/refresh the local draft whenever the store's settings change.
  useEffect(() => {
    if (settings) setDraft(settings);
  }, [settings]);

  /**
   * Merge a partial patch into the draft. Nested objects (autoInvest/autoExit)
   * are already merged by the child components before they call onChange.
   * @param {Partial<import('../types').UserSettings>} patch
   */
  const applyPatch = (patch) => {
    setSaved(false);
    setSaveError(null);
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const handleSave = async () => {
    if (!draft || saving) return;
    setSaved(false);
    setSaveError(null);
    try {
      // Send only the writable subset. The server's PUT /settings schema rejects
      // read-only fields (userId, updatedAt, autoInvest.lastExecutedAt) that the
      // GET response carries, so build a clean partial here.
      const patch = {
        minInvestment: draft.minInvestment,
        maxInvestment: draft.maxInvestment,
        autoInvest: {
          enabled: draft.autoInvest.enabled,
          minConfidenceScore: draft.autoInvest.minConfidenceScore,
        },
        autoExit: {
          enabled: draft.autoExit.enabled,
          stopLossPercent: draft.autoExit.stopLossPercent,
          takeProfitPercent: draft.autoExit.takeProfitPercent,
          trailingStopPercent: draft.autoExit.trailingStopPercent,
          useAiExitSignal: draft.autoExit.useAiExitSignal,
        },
      };
      await updateSettings(patch);
      setSaved(true);
      toast.success('Settings saved');
    } catch (err) {
      const message = err && err.message ? err.message : 'Failed to save settings.';
      setSaveError(message);
      toast.error('Save failed', message);
    }
  };

  if ((loading && !draft) || !draft) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-11 w-36" rounded="rounded-xl" />
        </div>
        <Skeleton className="h-56 w-full" rounded="rounded-2xl" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-72 w-full" rounded="rounded-2xl" />
          <Skeleton className="h-72 w-full" rounded="rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in-up">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-accent shadow-glow">
            <SlidersHorizontal size={20} />
          </span>
          <div>
            <h1 className={cx('font-display text-2xl font-bold tracking-tight', GRADIENT_TEXT)}>
              Settings
            </h1>
            <p className="mt-0.5 text-sm text-muted">
              Configure investment limits and AI auto-trading behaviour.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={BTN_PRIMARY}
        >
          {saving ? <Spinner size="sm" /> : <Save size={16} />}
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      {saved && (
        <div className="flex items-center gap-2.5 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm font-medium text-accent shadow-glow animate-fade-in">
          <CheckCircle2 size={16} />
          Settings saved successfully.
        </div>
      )}

      {(saveError || (storeError && !saved)) && (
        <div className="flex items-center gap-2.5 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-medium text-danger animate-fade-in">
          <AlertTriangle size={16} />
          {saveError || storeError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
        <InvestmentLimits settings={draft} onChange={applyPatch} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <AutoInvestSettings settings={draft} onChange={applyPatch} />
          <AutoExitSettings settings={draft} onChange={applyPatch} />
        </div>
      </div>
    </div>
  );
}

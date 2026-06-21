import { useEffect, useState } from 'react';
import { Wallet, Bot, ShieldCheck } from 'lucide-react';
import Modal from './Modal';
import { cx, GLASS_PANEL, GRADIENT_TEXT, BTN_PRIMARY } from '../../lib/ui';

/** localStorage key that records the user has seen the onboarding intro. */
const ONBOARDED_KEY = 'growwai_onboarded';

/**
 * Safely read the onboarded flag. Guards against environments where
 * localStorage is unavailable (SSR, privacy mode) — treat any failure as
 * "already onboarded" so we never block the app or throw.
 * @returns {boolean}
 */
function readOnboarded() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return true;
    return window.localStorage.getItem(ONBOARDED_KEY) === '1';
  } catch {
    return true;
  }
}

/**
 * The three intro points shown on first visit.
 * @type {{icon:import('lucide-react').LucideIcon,title:string,body:string}[]}
 */
const POINTS = [
  {
    icon: Wallet,
    title: 'Paper trading, zero risk',
    body: 'You start with ₹10L of virtual cash. Practice trades execute against live prices — no real money is ever touched.',
  },
  {
    icon: Bot,
    title: 'AI signals & automation',
    body: 'Per-stock BUY/SELL/HOLD signals with confidence scores. Optionally let auto-invest and auto-exit run trades for you.',
  },
  {
    icon: ShieldCheck,
    title: 'Real money is opt-in',
    body: 'Live mode is off by default and safety-gated behind explicit confirmations. Switch only when you are ready.',
  },
];

/**
 * WelcomeModal — first-visit onboarding intro. Renders the existing Modal with a
 * 3-point summary and a "Get started" CTA. Gated on
 * `localStorage['growwai_onboarded']`; dismissing sets the flag so it never
 * shows again. Renders nothing once onboarded. Mounted once in Layout.
 *
 * @returns {JSX.Element|null}
 */
export default function WelcomeModal() {
  // Open only when this is the user's first visit. Initialised lazily so we read
  // localStorage exactly once during mount.
  const [open, setOpen] = useState(() => !readOnboarded());

  // Defensive: if some other tab marks onboarding complete while this mounts,
  // respect it. (Also re-checks on mount in case initial state was stale.)
  useEffect(() => {
    if (readOnboarded()) setOpen(false);
  }, []);

  const dismiss = () => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(ONBOARDED_KEY, '1');
      }
    } catch {
      /* ignore — dismissing the UI must still work without storage */
    }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <Modal open={open} title="Welcome to GrowwAI" onClose={dismiss}>
      <div className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-muted">
          A safe place to learn trading with{' '}
          <span className={cx('font-semibold', GRADIENT_TEXT)}>AI on your side</span>.
          Here is what you can do:
        </p>

        <ul className="flex flex-col gap-2.5">
          {POINTS.map(({ icon: Icon, title, body }) => (
            <li
              key={title}
              className={cx(GLASS_PANEL, 'flex items-start gap-3 px-3.5 py-3')}
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent">
                <Icon size={16} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text">{title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{body}</p>
              </div>
            </li>
          ))}
        </ul>

        <button type="button" onClick={dismiss} className={cx(BTN_PRIMARY, 'w-full')}>
          Get started
        </button>
      </div>
    </Modal>
  );
}

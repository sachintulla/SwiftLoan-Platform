'use client';
// Visual activity timeline for a single application / loan journey: one icon
// badge per funnel event, grouped by day, with a short plain-English detail
// pulled from the event's metadata. Consecutive repeats are folded into "×N".
import React from 'react';
import { dayLabel, humanStatus, timeAgo, timeStr } from '@/lib/format';

export interface TimelineEvent {
  id: string;
  eventName: string;
  screen?: string | null;
  metadata?: Record<string, unknown> | null;
  ts: string;
}

type Tone = 'green' | 'blue' | 'amber' | 'red' | 'teal' | 'grey';

// 24×24 stroke icons (Lucide-style), kept inline so the dashboard needs no icon package.
const ICONS: Record<string, React.ReactNode> = {
  download: <><path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M5 21h14" /></>,
  phone: <><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>,
  message: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  shield: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
  filePlus: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M12 12v6M9 15h6" /></>,
  idCard: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M6 16c.5-1.5 1.5-2 3-2s2.5.5 3 2M15 10h3M15 14h3" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  x: <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" /></>,
  tag: <><path d="M20 12 12 20 4 12V4h8z" /><circle cx="8.5" cy="8.5" r="1" /></>,
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  scan: <><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><circle cx="12" cy="12" r="3" /></>,
  send: <><path d="m21 3-9 18-2.5-7.5L2 11z" /><path d="M21 3 9.5 13.5" /></>,
  cash: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  call: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  alert: <><path d="M12 3 2 20h20z" /><path d="M12 10v5M12 18h.01" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
};

interface Meta { icon: keyof typeof ICONS; tone: Tone; title: string; detail?: (m: Record<string, unknown>) => string | undefined }

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

const META: Record<string, Meta> = {
  app_installed: { icon: 'download', tone: 'blue', title: 'App installed', detail: (m) => str(m.platform) && `Installed on ${str(m.platform) === 'ios' ? 'iOS' : str(m.platform) === 'android' ? 'Android' : str(m.platform)}` },
  app_opened: { icon: 'phone', tone: 'grey', title: 'App opened' },
  language_selected: { icon: 'globe', tone: 'grey', title: 'Language selected' },
  lead_captured: { icon: 'user', tone: 'teal', title: 'Lead captured', detail: (m) => str(m.summary) },
  otp_requested: { icon: 'message', tone: 'blue', title: 'OTP requested', detail: () => 'Verification code sent to the customer’s phone' },
  otp_verified: { icon: 'shield', tone: 'green', title: 'Phone verified', detail: () => 'OTP confirmed — customer is registered' },
  phone_verified: { icon: 'shield', tone: 'green', title: 'Phone verified' },
  user_context_loaded: { icon: 'user', tone: 'grey', title: 'Profile loaded' },
  application_started: { icon: 'filePlus', tone: 'blue', title: 'Application started', detail: () => 'Customer began the loan application' },
  pan_submitted: { icon: 'idCard', tone: 'blue', title: 'PAN submitted' },
  prequalify_started: { icon: 'search', tone: 'blue', title: 'Eligibility check started', detail: () => 'Looking up matching lender offers' },
  eligibility_completed: { icon: 'check', tone: 'green', title: 'Eligibility completed', detail: (m) => (typeof m.offerCount === 'number' ? `${m.offerCount} lender offer${m.offerCount === 1 ? '' : 's'} found` : undefined) },
  offers_viewed: { icon: 'tag', tone: 'teal', title: 'Offers viewed' },
  offer_selected: { icon: 'star', tone: 'teal', title: 'Offer selected', detail: (m) => [str(m.lenderName), typeof m.apr === 'number' ? `${m.apr}% APR` : undefined].filter(Boolean).join(' · ') || undefined },
  kyc_started: { icon: 'scan', tone: 'blue', title: 'KYC started' },
  kyc_submitted: { icon: 'scan', tone: 'blue', title: 'KYC step submitted' },
  kyc_completed: { icon: 'scan', tone: 'green', title: 'KYC completed' },
  application_submitted: { icon: 'send', tone: 'green', title: 'Application submitted', detail: (m) => str(m.reason) },
  loan_approved: { icon: 'check', tone: 'green', title: 'Loan approved' },
  loan_rejected: { icon: 'x', tone: 'red', title: 'Loan rejected', detail: (m) => str(m.reason) },
  loan_disbursed: { icon: 'cash', tone: 'green', title: 'Loan disbursed' },
  loan_loan_disbursed: { icon: 'cash', tone: 'green', title: 'Loan disbursed' },
  repayment_viewed: { icon: 'calendar', tone: 'grey', title: 'Repayment schedule viewed' },
  call_queued: { icon: 'call', tone: 'blue', title: 'Callback queued' },
  call_completed: { icon: 'call', tone: 'green', title: 'Call completed' },
  callback_declined: { icon: 'call', tone: 'amber', title: 'Callback declined' },
  dropoff_apply: { icon: 'alert', tone: 'amber', title: 'Dropped off while applying' },
};

const metaFor = (name: string): Meta => META[name] ?? { icon: 'clock', tone: 'grey', title: humanStatus(name) };

interface Row { ev: TimelineEvent; count: number }

/** Fold consecutive identical events (≤10 min apart) into one row with a count. */
function fold(events: TimelineEvent[]): Row[] {
  const rows: Row[] = [];
  for (const ev of events) {
    const last = rows[rows.length - 1];
    if (last && last.ev.eventName === ev.eventName && Math.abs(new Date(ev.ts).getTime() - new Date(last.ev.ts).getTime()) <= 10 * 60_000) {
      last.count += 1;
      last.ev = ev; // show the most recent timestamp/detail of the run
    } else rows.push({ ev, count: 1 });
  }
  return rows;
}

export function ActivityTimeline({ events }: { events: TimelineEvent[] }) {
  const scroller = React.useRef<HTMLDivElement>(null);
  const rows = React.useMemo(() => fold(events), [events]);

  // Journeys read left → right; when they overflow, open on the latest step.
  React.useEffect(() => {
    const el = scroller.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = el.scrollWidth;
  }, [rows]);

  if (events.length === 0) return <div className="empty">No tracked events for this applicant</div>;
  const lastId = rows[rows.length - 1].ev.id;

  return (
    <div className="tlh" ref={scroller}>
      <ol className="tlh-track">
        {rows.map((r, i) => {
          const m = metaFor(r.ev.eventName);
          const detail = m.detail?.(r.ev.metadata ?? {});
          const isLast = i === rows.length - 1;
          const latest = r.ev.id === lastId;
          const prevDay = i > 0 ? dayLabel(rows[i - 1].ev.ts) : null;
          const newDay = dayLabel(r.ev.ts) !== prevDay;
          return (
            <li key={r.ev.id} className="tlh-step">
              <div className="tlh-marker">
                <span className={`tlh-badge${latest ? ' is-latest' : ''}`} style={{ background: `var(--${m.tone}-bg)`, color: `var(--${m.tone})` }}>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    {ICONS[m.icon]}
                  </svg>
                  {r.count > 1 && <span className="tlh-count">×{r.count}</span>}
                </span>
                {!isLast && <span className="tlh-line" />}
              </div>
              <div className="tlh-day">{newDay ? dayLabel(r.ev.ts) : '\u00a0'}</div>
              <div className="tlh-title">{m.title}</div>
              {detail && <div className="tlh-detail">{detail}</div>}
              <div className="tlh-meta">
                <span title={new Date(r.ev.ts).toLocaleString('en-IN')}>{timeStr(r.ev.ts)} · {timeAgo(r.ev.ts)}</span>
              </div>
              <div className="tlh-tags">
                {r.ev.screen && <span className="tl-chip">{r.ev.screen}</span>}
                {latest && <span className="tl-latest">Latest</span>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

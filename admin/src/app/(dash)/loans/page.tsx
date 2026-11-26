'use client';
// Applications: everything sent to the three lenders, on one page.
//   Top  - three summary cards (not clickable): each lender's total, a status bar and the numbers that matter.
//   Then - a segmented switch to pick the lender (Aurix / Yubi / Revasure), and that lender's list.
// The lender is kept in the address (?tab=yubi), so /yubi and /revasure can open their tab and a reload keeps it.
// Data: GET /api/admin/applications/summary (counts) and each lender's own list (components/applications/).
import React, { useEffect, useState } from 'react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { num } from '@/lib/format';
import LenderList from '@/components/applications/LenderList';
import type { LenderKey, Summary } from '@/components/applications/lenders';
import '@/components/listActions.css';
import '@/components/applications/applications.css';
import { DS, LENDER_COLOR } from '@/lib/palette';

const LENDERS: { key: LenderKey; name: string; what: string; dot: string }[] = [
  { key: 'aurix', name: 'Aurix', what: 'Offers check', dot: LENDER_COLOR.aurix },
  { key: 'yubi', name: 'Yubi', what: 'Went to Yubi', dot: LENDER_COLOR.yubi },
  { key: 'revasure', name: 'Revasure', what: 'Lead sharing', dot: LENDER_COLOR.revasure },
];

/** The parts of a card's status bar, and the three numbers under it, worked out from the lender's status counts. */
function cardParts(key: LenderKey, s: Summary) {
  const c = (k: string) => s.counts[k] ?? 0;
  const sum = (ks: string[]) => ks.reduce((t, k) => t + c(k), 0);
  if (key === 'aurix') {
    const withLender = sum(['handoff', 'under_review', 'approved', 'disbursed', 'closed']);
    return {
      bar: [
        { n: withLender, color: 'var(--teal)' }, { n: c('offers_ready'), color: 'var(--blue)' }, { n: c('filling'), color: 'var(--amber)' },
        { n: c('rejected'), color: DS.errorSoft }, { n: c('failed'), color: 'var(--grey)' },
      ],
      foot: [[c('offers_ready'), 'offers ready'], [withLender, 'with a lender'], [c('rejected'), 'no offers']] as [number, string][],
    };
  }
  if (key === 'yubi') {
    const codes = Object.keys(s.counts);
    const pick = (test: (k: string) => boolean) => codes.filter(test).reduce((t, k) => t + c(k), 0);
    const rejected = pick((k) => /REJECT|NO_OFFER/.test(k));
    const offer = pick((k) => /OFFER_GENERATED|APPROV|DISBURS/.test(k));
    const waiting = c('waiting');
    const started = s.total - rejected - offer - waiting;
    return {
      bar: [{ n: started, color: 'var(--teal)' }, { n: offer, color: 'var(--blue)' }, { n: waiting, color: 'var(--amber)' }, { n: rejected, color: DS.errorSoft }],
      foot: [[started, 'in progress'], [offer, 'got an offer'], [rejected, 'rejected']] as [number, string][],
    };
  }
  const notEligible = sum(['ineligible', 'duplicate']);
  const notSent = sum(['failed', 'pending']);
  return {
    bar: [{ n: c('success'), color: 'var(--teal)' }, { n: notEligible, color: DS.errorSoft }, { n: notSent, color: 'var(--grey)' }],
    foot: [[c('success'), 'accepted'], [notEligible, 'not eligible'], [notSent, 'could not send']] as [number, string][],
  };
}

function readTab(): LenderKey {
  if (typeof window === 'undefined') return 'aurix';
  const t = new URLSearchParams(window.location.search).get('tab');
  return t === 'yubi' || t === 'revasure' ? t : 'aurix';
}

export default function ApplicationsPage() {
  const [tab, setTab] = useState<LenderKey>('aurix');
  // Read the address after the first render (the server render has no address bar).
  useEffect(() => { setTab(readTab()); }, []);
  const pick = (t: LenderKey) => {
    setTab(t);
    const url = new URL(window.location.href);
    if (t === 'aurix') url.searchParams.delete('tab'); else url.searchParams.set('tab', t);
    window.history.replaceState(null, '', url.pathname + url.search);
  };

  // All-time totals for the cards and the tab counts (no filters).
  const { data } = useSWR('/api/admin/applications/summary', swrFetcher, { refreshInterval: 60_000 });
  const all = data?.data as Record<LenderKey, Summary> | undefined;

  return (
    <div className="page">
      <h1 className="page-title">Applications</h1>

      {/* Summary only: these cards are not buttons. The lender is picked with the switch below. */}
      <div className="ap-cards">
        {LENDERS.map((l) => {
          const s = all?.[l.key];
          const parts = s ? cardParts(l.key, s) : null;
          return (
            <div key={l.key} className="ap-sum">
              <div className="ap-sum-top"><span className="ap-sum-name">{l.name}</span><span className="ap-sum-what">{l.what}</span></div>
              {!s || !parts ? <div className="skeleton" style={{ height: 56, marginTop: 8 }} /> : (
                <>
                  <div className="ap-sum-num">{num(s.total)}</div>
                  <div className="ap-sum-bar" aria-hidden>
                    {parts.bar.filter((p) => p.n > 0).map((p, i) => <i key={i} style={{ flexGrow: p.n, background: p.color }} />)}
                  </div>
                  <div className="ap-sum-foot">{parts.foot.map(([n, label]) => <span key={label}><b>{num(n)}</b> {label}</span>)}</div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="ap-tabs" role="tablist" aria-label="Lender">
        {LENDERS.map((l) => (
          <button key={l.key} type="button" role="tab" aria-selected={tab === l.key} className={`ap-tab${tab === l.key ? ' on' : ''}`} onClick={() => pick(l.key)}>
            <span className="ap-tab-dot" style={{ background: l.dot }} />
            {l.name}
            <span className="ap-tab-count">{all ? num(all[l.key].total) : '…'}</span>
          </button>
        ))}
      </div>

      {/* key: switching lender starts that lender's filters fresh. */}
      <div role="tabpanel" aria-label={LENDERS.find((l) => l.key === tab)?.name}>
        <LenderList key={tab} lender={tab} />
      </div>
    </div>
  );
}

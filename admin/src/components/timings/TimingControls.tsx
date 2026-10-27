'use client';
// The editors for one timing setting (number, time of day, switch, numbers list, message schedule). Used by the Timings page and by Stage outreach.
import React, { useEffect, useState } from 'react';
import {
  UNIT_SHORT, localError, rowsToUi, spanText, uiToRows,
  type Draft, type Item, type SchedRow, type TimeUnit, type UiRow,
} from '@/lib/timingsEdit';

export function Control({ it, d, bad, onChange, onSwitch }: {
  it: Item; d: Draft; bad: boolean; onChange: (v: Draft) => void; onSwitch: (v: boolean) => void;
}) {
  if (it.kind === 'boolean') {
    const on = Boolean(d);
    return (
      <span className="tm-switch-wrap">
        <button type="button" role="switch" aria-checked={on} aria-label={it.label} className="tm-switch" onClick={() => onSwitch(!on)} />
        {on ? 'On' : 'Off'}
      </span>
    );
  }
  if (it.kind === 'minuteOfDay') {
    return (
      <div className={`tm-num${bad ? ' tm-bad' : ''}`}>
        <input type="time" aria-label={it.label} value={String(d)} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  if (it.kind === 'phones') {
    const n = String(d).split(/[\s,;]+/).filter(Boolean).length;
    return (
      <div style={{ width: '100%' }}>
        <textarea
          className="tm-text" rows={3} aria-label={it.label} value={String(d)} placeholder={'One mobile number per line\n9876543210'}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="tm-meta" style={{ marginTop: 4 }}>{n ? `${n} number${n === 1 ? '' : 's'}: only these will be messaged` : 'Empty: everyone is messaged'}</div>
      </div>
    );
  }
  if (it.kind === 'schedule') return <ScheduleField it={it} rows={d as UiRow[]} onChange={(r) => onChange(r)} />;
  const unit = UNIT_SHORT[it.unit] ?? '';
  return (
    <div className={`tm-num${bad ? ' tm-bad' : ''}`}>
      <input type="number" step={1} min={it.min} max={it.max} aria-label={it.label} value={String(d)} onChange={(e) => onChange(e.target.value)} />
      {unit && <span>{unit}</span>}
    </div>
  );
}

/** The schedule on the page: a plain summary and one chip per message. Editing happens in a window (ScheduleModal). */
export function ScheduleField({ it, rows, onChange }: { it: Item; rows: UiRow[]; onChange: (r: UiRow[]) => void }) {
  const [open, setOpen] = useState(false);
  const value = uiToRows(rows);
  const sms = value.filter((r) => r.channel === 'sms').length;
  const last = value.reduce((m, r) => (Number.isFinite(r.afterMinutes) ? Math.max(m, r.afterMinutes) : m), 0);
  return (
    <div className="tm-sch">
      <div className="tm-sch-top">
        <span className="tm-sch-sum">
          <b>{value.length} message{value.length === 1 ? '' : 's'}</b> · {sms} SMS, {value.length - sms} WhatsApp · the last one goes out {spanText(last)} after they leave
        </span>
        <span style={{ display: 'inline-flex', gap: 14, alignItems: 'center' }}>
          <button type="button" className="tm-link" onClick={() => onChange(rowsToUi(it.def as SchedRow[]))}>Use default</button>
          <button type="button" className="btn" onClick={() => setOpen(true)}>Edit schedule</button>
        </span>
      </div>
      <div className="tm-chips">
        {value.map((r, i) => (
          <span key={i} className={`tm-sc ${r.channel === 'sms' ? 'tm-sc-sms' : 'tm-sc-wa'}`}>
            <b>{r.channel === 'sms' ? 'SMS' : 'WhatsApp'}</b>
            {r.afterMinutes === 0 ? 'right away' : `+${spanText(r.afterMinutes)}`}
          </span>
        ))}
      </div>
      <div className="tm-sch-note">Time is counted from the moment the visitor is treated as having left the website (see “Counts as dropped off after”).</div>
      {open && <ScheduleModal it={it} rows={rows} onApply={(r) => { onChange(r); setOpen(false); }} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** The editor window: one aligned table with headings, and the time also written out in plain words. */
export function ScheduleModal({ it, rows, onApply, onClose }: { it: Item; rows: UiRow[]; onApply: (r: UiRow[]) => void; onClose: () => void }) {
  const [work, setWork] = useState<UiRow[]>(() => rows.map((r) => ({ ...r })));
  const value = uiToRows(work);
  const problem = localError(it, value);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const upd = (i: number, patch: Partial<UiRow>) => setWork((w) => w.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const move = (i: number, by: number) => setWork((w) => {
    const j = i + by;
    if (j < 0 || j >= w.length) return w;
    const next = w.slice();
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  return (
    <div className="tm-modal-back" onClick={onClose}>
      <div className="tm-modal" role="dialog" aria-modal="true" aria-label="Edit the message schedule" onClick={(e) => e.stopPropagation()}>
        <div className="tm-modal-head">
          <div className="tm-modal-title">Message schedule</div>
          <div className="tm-modal-sub">
            Each line is one message. The time is counted from when the visitor leaves the website. Keep the lines in time order;
            a message that falls outside calling hours waits until they open.
          </div>
        </div>
        <div className="tm-modal-body">
          <div className="tm-th">
            <span style={{ textAlign: 'center' }}>#</span><span>Channel</span><span>Sent after they leave</span><span className="tm-plain">In plain words</span><span />
          </div>
          {work.map((r, i) => {
            const m = value[i].afterMinutes;
            const bad = !Number.isFinite(m) || (i > 0 && m < value[i - 1].afterMinutes);
            return (
              <div className={`tm-tr${bad ? ' tm-tr-bad' : ''}`} key={i}>
                <span className="tm-tn">{i + 1}</span>
                <select className="tm-chan" aria-label={`Message ${i + 1} channel`} value={r.channel} onChange={(e) => upd(i, { channel: e.target.value as 'sms' | 'whatsapp' })}>
                  <option value="sms">SMS</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
                <span className="tm-when">
                  <input type="number" min={0} step={1} aria-label={`Message ${i + 1} delay`} value={r.amount} onChange={(e) => upd(i, { amount: e.target.value })} />
                  <select aria-label={`Message ${i + 1} unit`} value={r.unit} onChange={(e) => upd(i, { unit: e.target.value as TimeUnit })}>
                    <option value="minutes">minutes</option>
                    <option value="hours">hours</option>
                    <option value="days">days</option>
                  </select>
                </span>
                <span className="tm-plain">
                  {!Number.isFinite(m) ? <small>Enter a number</small> : m === 0 ? 'Right away' : spanText(m)}
                </span>
                <span className="tm-acts">
                  <button type="button" className="tm-ibtn" title="Move up" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button type="button" className="tm-ibtn" title="Move down" aria-label="Move down" disabled={i === work.length - 1} onClick={() => move(i, 1)}>↓</button>
                  <button type="button" className="tm-ibtn" title="Remove" aria-label="Remove" disabled={work.length <= 1} onClick={() => setWork((w) => w.filter((_, k) => k !== i))}>✕</button>
                </span>
              </div>
            );
          })}
        </div>
        <div className="tm-modal-foot">
          <button
            type="button" className="tm-link" disabled={work.length >= (it.maxRows ?? 40)}
            onClick={() => setWork((w) => {
              const l = w[w.length - 1];
              return [...w, { channel: 'sms', unit: l?.unit ?? 'days', amount: String((Number(l?.amount) || 0) + 1) }];
            })}
          >
            + Add a message
          </button>
          <button type="button" className="tm-link" onClick={() => setWork(rowsToUi(it.def as SchedRow[]))}>Use default</button>
          {problem ? <span className="tm-err">{problem}</span> : <span style={{ flex: 1 }} />}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!!problem} onClick={() => onApply(work)}>Apply</button>
        </div>
      </div>
    </div>
  );
}

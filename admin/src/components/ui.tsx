'use client';
import React, { useEffect, useRef, useState } from 'react';
import { statusTone, humanStatus, loanStatusLabel, StatusTone } from '@/lib/format';

export function Card({ title, sub, right, children, className = '' }: { title?: string; sub?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`card card-pad ${className}`}>
      {(title || right) && (
        <div className="row between" style={{ marginBottom: sub ? 2 : 14 }}>
          <div>
            {title && <h3 className="card-title">{title}</h3>}
            {sub && <p className="card-sub">{sub}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function StatCard({ label, value, icon, tone = 'teal', foot }: { label: string; value: React.ReactNode; icon?: string; tone?: StatusTone; foot?: React.ReactNode }) {
  const bg = `var(--${tone}-bg)`;
  const fg = `var(--${tone})`;
  return (
    <div className="stat">
      <div className="row between">
        <span className="stat-label">{label}</span>
        {icon && <span className="stat-ic" style={{ background: bg, color: fg }} aria-hidden>{icon}</span>}
      </div>
      <div className="stat-value">{value}</div>
      {foot && <div className="stat-foot">{foot}</div>}
    </div>
  );
}

/**
 * One cell of a stat strip: several numbers inside a single card, rather than
 * one bordered box per number. Pass `tone` only when the value itself carries
 * a warning — a coloured number should mean something.
 */
export function Stat({ label, value, foot, tone }: { label: string; value: React.ReactNode; foot?: React.ReactNode; tone?: string }) {
  return (
    <div className="stat-cell">
      <div className="stat-cell-label">{label}</div>
      <div className="stat-cell-value" style={tone ? { color: `var(--${tone})` } : undefined}>{value}</div>
      {foot != null && <div className="stat-cell-foot">{foot}</div>}
    </div>
  );
}

export function StatusBadge({ status, label }: { status: string | null | undefined; label?: string }) {
  const tone = statusTone(status);
  return <span className={`badge tone-${tone}`}>{label ?? humanStatus(status)}</span>;
}

/**
 * A loan / lender-application status pill whose text matches the mobile app's
 * My Loans exactly (via loanStatusLabel), while keeping the admin tone palette.
 * Use this for every application/lender status so admin ↔ app read the same.
 */
export function LoanStatusBadge({ status }: { status: string | null | undefined }) {
  return <StatusBadge status={status} label={loanStatusLabel(status)} />;
}

export function Skeleton({ h = 16, w = '100%', style }: { h?: number; w?: number | string; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ height: h, width: w, ...style }} />;
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ display: 'grid', gap: 10, padding: 6 }}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="row" style={{ gap: 14 }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} h={14} w={c === 0 ? 140 : `${100 / cols}%`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Empty({ label = 'No data yet' }: { label?: string }) {
  return <div className="empty">{label}</div>;
}

/** An explanatory note that summarises what a section's rows actually mean —
 * used instead of making the operator read every row to spot the pattern. */
export function Callout({ tone = 'amber', icon, children }: { tone?: 'amber' | 'red' | 'blue' | 'grey'; icon?: string; children: React.ReactNode }) {
  return (
    <div className={`callout callout-${tone}`}>
      <span className="callout-icon" aria-hidden>{icon ?? (tone === 'red' ? '⚠' : tone === 'blue' ? 'ℹ' : tone === 'grey' ? '·' : '⚠')}</span>
      <span>{children}</span>
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input className="input" style={{ maxWidth: 280 }} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  );
}

export function FilterChips<T extends string>({ options, value, onChange }: { options: { key: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="row wrap" style={{ gap: 8 }}>
      {options.map((o) => (
        <button key={o.key} className={`chip-filter ${value === o.key ? 'active' : ''}`} onClick={() => onChange(o.key)}>{o.label}</button>
      ))}
    </div>
  );
}

export interface SelectOption<T extends string> { value: T; label: React.ReactNode }

/**
 * Styled stand-in for a native <select>. A native popup is OS-rendered (not
 * page CSS), so on an OS in dark mode it opens as a plain dark system list no
 * matter what this app's (light-only) design system says — this renders the
 * open list itself, so it always matches.
 */
export function Select<T extends string>({
  value, onChange, options, placeholder = 'Select…',
}: {
  value: T;
  onChange: (v: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="input select-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? '' : 'muted'} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="select-caret" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="select-menu card" role="listbox">
          {options.map((o) => (
            <div
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`select-option${o.value === value ? ' active' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              <span className="select-check" aria-hidden>{o.value === value ? '✓' : ''}</span>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Styled stand-in for window.confirm() — a native confirm() is chrome-rendered
 * (the "localhost:4001 says" browser dialog), so it can't be themed and looks
 * jarring against the rest of the dashboard. Use this for any real-world-effect
 * confirmation instead.
 */
export function ConfirmDialog({
  title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'brand', busy, onConfirm, onCancel,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'brand' | 'red';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onCancel(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,32,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onCancel}
    >
      <div className="card card-pad" style={{ width: '100%', maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="card-title">{title}</h3>
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.6, marginTop: 8, marginBottom: 20 }}>{message}</div>
        <div className="row" style={{ gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button
            type="button"
            className="btn btn-primary"
            style={tone === 'red' ? { background: 'var(--red)', borderColor: 'var(--red)' } : undefined}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface MenuItem { key: string; label: React.ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean }

/** Small "..." overflow menu for secondary page actions that don't need to
 * sit in the main button row (e.g. Pause / Cancel / Delete on a campaign). */
export function Menu({ trigger, items }: { trigger: React.ReactNode; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button type="button" className="btn" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        {trigger}
      </button>
      {open && (
        <div className="select-menu card" style={{ left: 'auto', right: 0, width: 190, padding: 6 }} role="menu">
          {items.map((it) => (
            <div
              key={it.key}
              role="menuitem"
              className="select-option"
              style={{
                color: it.danger ? 'var(--red)' : undefined,
                opacity: it.disabled ? 0.5 : 1,
                cursor: it.disabled ? 'not-allowed' : 'pointer',
              }}
              onClick={() => { if (it.disabled) return; setOpen(false); it.onSelect(); }}
            >
              {it.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** A centred popup with a title bar and a close button; the body scrolls. Esc or a click outside closes it. */
export function Modal({ title, onClose, children, width = 640 }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; width?: number }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,32,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div role="dialog" aria-modal="true" className="card" style={{ width: '100%', maxWidth: width, maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', gap: 12, alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 15, minWidth: 0 }}>{title}</div>
          <button type="button" className="btn" aria-label="Close" onClick={onClose} style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 20, overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  );
}

/** A clear expand arrow: points right, turns down when open. Use instead of the small text arrows. */
export function Chevron({ open, size = 20 }: { open: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden
      style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }}><path d="M9 6l6 6-6 6" /></svg>
  );
}

/** "Showing 1 - 10 of 18", rows per page, and first / previous / next / last. For lists that page in the browser or on the server. */
export function PagerBar({ page, pageSize, total, onPage, onPageSize }: { page: number; pageSize: number; total: number; onPage: (p: number) => void; onPageSize?: (n: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const cur = Math.min(page, totalPages);
  const from = total === 0 ? 0 : (cur - 1) * pageSize + 1;
  const to = Math.min(cur * pageSize, total);
  return (
    <div className="pager-bar">
      <span className="muted">Showing {from} - {to} of {total}</span>
      <span style={{ flex: 1 }} />
      {onPageSize && (
        <select className="input" style={{ width: 'auto' }} aria-label="Rows per page" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
          {[10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      )}
      <button type="button" className="btn" disabled={cur <= 1} onClick={() => onPage(1)} aria-label="First page">«</button>
      <button type="button" className="btn" disabled={cur <= 1} onClick={() => onPage(cur - 1)} aria-label="Previous page">‹</button>
      <span className="muted">Page {cur} of {totalPages}</span>
      <button type="button" className="btn" disabled={cur >= totalPages} onClick={() => onPage(cur + 1)} aria-label="Next page">›</button>
      <button type="button" className="btn" disabled={cur >= totalPages} onClick={() => onPage(totalPages)} aria-label="Last page">»</button>
    </div>
  );
}

export function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="pager">
      <button className="btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>Prev</button>
      <span className="muted" style={{ fontSize: 12 }}>Page {page} of {totalPages}</span>
      <button className="btn" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}

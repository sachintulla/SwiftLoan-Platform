'use client';
import React from 'react';
import { statusTone, humanStatus, StatusTone } from '@/lib/format';

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

export function StatusBadge({ status, label }: { status: string | null | undefined; label?: string }) {
  const tone = statusTone(status);
  return <span className={`badge tone-${tone}`}>{label ?? humanStatus(status)}</span>;
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

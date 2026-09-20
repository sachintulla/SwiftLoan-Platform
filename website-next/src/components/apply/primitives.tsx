'use client';

import { ArrowRight } from 'lucide-react';

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-foreground font-semibold">{label}</span>
      {children}
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`input-interactive field-input h-11 w-full rounded-xl px-3.5 text-sm font-medium ${props.className ?? ''}`}
    />
  );
}

export function ChipGroup({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const selected = value === opt;
        return (
          <button
            type="button"
            key={opt}
            onClick={() => onChange(opt)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
              selected
                ? 'border-primary bg-accent text-accent-foreground'
                : 'border-border text-foreground bg-card'
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`border-border rounded-2xl border bg-card p-5 ${className}`}>{children}</div>;
}

export function PrimaryButton({
  children,
  disabled,
  loading,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-base font-bold transition-transform duration-200 ${
        disabled || loading
          ? 'bg-muted text-muted-foreground cursor-not-allowed'
          : 'bg-brand-gradient text-primary-foreground shadow-[var(--shadow-float)] hover:-translate-y-0.5 active:scale-[0.98]'
      } ${rest.className ?? ''}`}
    >
      <span>{loading ? 'Please wait…' : children}</span>
      {!loading && <ArrowRight className="h-5 w-5" />}
    </button>
  );
}

export function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`border-border bg-card text-foreground inline-flex items-center justify-center gap-2 rounded-full border px-6 py-3.5 text-base font-bold ${props.className ?? ''}`}
    />
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-primary mb-3 text-xs font-bold tracking-wide uppercase">{children}</p>;
}

export function Badge({ tone = 'muted', children }: { tone?: 'muted' | 'success' | 'warning' | 'danger' | 'info'; children: React.ReactNode }) {
  const toneClass = {
    muted: 'bg-muted text-muted-foreground',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
    info: 'bg-info-soft text-info',
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${toneClass}`}>{children}</span>;
}

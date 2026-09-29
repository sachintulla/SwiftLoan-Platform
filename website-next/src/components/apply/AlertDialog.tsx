'use client';

import { createPortal } from 'react-dom';
import { useEffect, useRef } from 'react';
import { AlertCircle, AlertTriangle, Clock } from 'lucide-react';

export type AlertTone = 'error' | 'warning' | 'info';

export interface AlertContent {
  tone: AlertTone;
  /** Optional heading — omitted when the caller only has the API's message. */
  title?: string;
  message: string;
  /** Optional checklist shown under the message (e.g. what to double-check). */
  tips?: string[];
  okLabel?: string;
}

const TONE = {
  error: { Icon: AlertCircle, ring: 'bg-danger-soft', icon: 'text-danger' },
  warning: { Icon: AlertTriangle, ring: 'bg-warning-soft', icon: 'text-warning' },
  info: { Icon: Clock, ring: 'bg-accent', icon: 'text-primary' },
} as const;

/**
 * Modal alert with a single OK action — for blocking outcomes the user must
 * acknowledge (PAN not verified, service down, limit reached) rather than an
 * inline line of red text. Esc, the OK button and the backdrop all close it;
 * focus moves to OK on open and page scroll is locked while it's up.
 */
export function AlertDialog({ open, content, onClose }: { open: boolean; content: AlertContent | null; onClose: () => void }) {
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open || !content) return null;
  const { Icon, ring, icon } = TONE[content.tone];

  // Portal to <body>: a transformed/filtered ancestor would otherwise trap
  // `position: fixed` inside the page layout instead of the viewport.
  return createPortal(
    <div className="fixed inset-0 z-[10001] flex items-end justify-center p-4 sm:items-center">
      <div className="animate-in fade-in absolute inset-0 bg-black/45 backdrop-blur-[2px] duration-200" onClick={onClose} aria-hidden />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={content.title ? 'alert-title' : 'alert-message'}
        aria-describedby={content.title ? 'alert-message' : undefined}
        className="animate-in fade-in zoom-in-95 slide-in-from-bottom-4 border-border bg-card relative w-full max-w-sm rounded-3xl border p-6 text-center shadow-[var(--shadow-float)] duration-200 sm:p-7"
      >
        <span className={`${ring} mx-auto grid h-14 w-14 place-items-center rounded-full`}>
          <Icon className={`${icon} h-7 w-7`} />
        </span>
        {content.title && (
          <h2 id="alert-title" className="text-foreground mt-4 text-lg font-extrabold">
            {content.title}
          </h2>
        )}
        <p
          id="alert-message"
          className={content.title ? 'text-muted-foreground mt-2 text-sm leading-relaxed' : 'text-foreground mt-4 text-base leading-relaxed font-semibold'}
        >
          {content.message}
        </p>
        {content.tips && content.tips.length > 0 && (
          <ul className="bg-muted/60 mt-4 flex flex-col gap-2 rounded-2xl p-4 text-left text-xs">
            {content.tips.map((t) => (
              <li key={t} className="text-foreground flex items-start gap-2">
                <span className="bg-primary mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        )}
        <button
          ref={okRef}
          onClick={onClose}
          className="bg-brand-gradient text-primary-foreground mt-6 w-full rounded-full px-6 py-3.5 text-base font-bold shadow-[var(--shadow-soft)] transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98]"
        >
          {content.okLabel ?? 'OK'}
        </button>
      </div>
    </div>,
    document.body,
  );
}

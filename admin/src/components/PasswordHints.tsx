'use client';
import React from 'react';
import { passwordRules } from '@/lib/password';

// Live policy checklist shown under a new-password field. Shared by /account and
// /login/reset so both screens state exactly the same rules the server enforces.
export function PasswordHints({ value }: { value: string }) {
  const rules = passwordRules(value);
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: 4 }}>
      {rules.map((r) => (
        <li
          key={r.key}
          style={{ fontSize: 11.5, color: r.ok ? 'var(--green)' : value ? 'var(--text-dim)' : 'var(--text-dim)' }}
        >
          <span aria-hidden style={{ display: 'inline-block', width: 14 }}>{r.ok ? '✓' : '•'}</span>
          {r.label}
        </li>
      ))}
    </ul>
  );
}

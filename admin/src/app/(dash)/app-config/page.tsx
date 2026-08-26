'use client';
import React, { useEffect, useState } from 'react';
import useSWR from 'swr';
import { swrFetcher, apiFetch, ApiError } from '@/lib/api';
import { Card } from '@/components/ui';

interface NudgeConfig {
  nudgeEnabled: boolean;
  nudgeIdleMs: number;
  nudgeDropoffMs: number;
  nudgeEligibleMs: number;
  version: number;
}

const DEFAULTS: Omit<NudgeConfig, 'version'> = {
  nudgeEnabled: true,
  nudgeIdleMs: 30000,
  nudgeDropoffMs: 18000,
  nudgeEligibleMs: 20000,
};

// The API works in milliseconds; admins edit whole seconds.
const toSec = (ms: number) => String(Math.round(ms / 1000));
const toMs = (s: string) => Math.round((Number(s) || 0) * 1000);

export default function AppConfigPage() {
  const { data, error, isLoading, mutate } = useSWR('/api/admin/config', swrFetcher);
  const cfg = (data?.data as NudgeConfig | undefined) ?? undefined;

  const [enabled, setEnabled] = useState(true);
  const [idle, setIdle] = useState(toSec(DEFAULTS.nudgeIdleMs));
  const [dropoff, setDropoff] = useState(toSec(DEFAULTS.nudgeDropoffMs));
  const [eligible, setEligible] = useState(toSec(DEFAULTS.nudgeEligibleMs));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Hydrate the form once the config loads.
  useEffect(() => {
    if (!cfg) return;
    setEnabled(cfg.nudgeEnabled);
    setIdle(toSec(cfg.nudgeIdleMs));
    setDropoff(toSec(cfg.nudgeDropoffMs));
    setEligible(toSec(cfg.nudgeEligibleMs));
  }, [cfg]);

  const invalid = [idle, dropoff, eligible].some((s) => {
    const n = Number(s);
    return !Number.isFinite(n) || n < 3 || n > 600;
  });

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await apiFetch('/api/admin/config', {
        method: 'PUT',
        body: JSON.stringify({
          nudgeEnabled: enabled,
          nudgeIdleMs: toMs(idle),
          nudgeDropoffMs: toMs(dropoff),
          nudgeEligibleMs: toMs(eligible),
        }),
      });
      await mutate();
      setMsg({ ok: true, text: 'Saved. The mobile app applies it on its next launch or when brought to the foreground.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  function resetDefaults() {
    setEnabled(DEFAULTS.nudgeEnabled);
    setIdle(toSec(DEFAULTS.nudgeIdleMs));
    setDropoff(toSec(DEFAULTS.nudgeDropoffMs));
    setEligible(toSec(DEFAULTS.nudgeEligibleMs));
  }

  return (
    <div className="page">
      <div>
        <h1 className="page-title">App Config</h1>
        <p className="page-sub">
          Tune the proactive-help “Ask Ruby” nudges. When a user stalls this long on a screen, the app
          vibrates, animates the Ruby assistant and shows a contextual help label. Changes are picked up
          by the app on its next launch or when it returns to the foreground.
        </p>
      </div>

      <div style={{ marginTop: 16, maxWidth: 640 }}>
        <Card title="Proactive-help nudges" sub="Timers are in seconds (3–600).">
          {error ? (
            <div className="empty">
              Could not load config — {(error as Error).message}
              <div><button className="btn" style={{ marginTop: 12 }} onClick={() => mutate()}>Retry</button></div>
            </div>
          ) : isLoading && !data ? (
            <div className="skeleton" style={{ height: 220 }} />
          ) : (
            <>
              <label className="row" style={{ gap: 8, cursor: 'pointer', marginBottom: 18 }}>
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Nudges enabled</span>
                <span className="muted" style={{ fontSize: 12 }}>· turn off to disable all in-app help nudges</span>
              </label>

              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16, opacity: enabled ? 1 : 0.5 }}>
                <Field
                  label="Idle on a main screen"
                  hint="Home, My Loans, Profile…"
                  value={idle} onChange={setIdle} disabled={!enabled}
                />
                <Field
                  label="Drop-off mid-application"
                  hint="Verify PAN / details funnel"
                  value={dropoff} onChange={setDropoff} disabled={!enabled}
                />
                <Field
                  label="Eligible but not applied"
                  hint="Offers / My Offers screens"
                  value={eligible} onChange={setEligible} disabled={!enabled}
                />
              </div>

              {invalid && (
                <div style={{ color: 'var(--amber)', fontSize: 12.5, marginTop: 12 }}>
                  Each timer must be between 3 and 600 seconds.
                </div>
              )}

              <div className="row" style={{ gap: 10, marginTop: 20 }}>
                <button className="btn btn-primary" disabled={saving || invalid} onClick={save}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                <button className="btn" disabled={saving} onClick={resetDefaults}>Reset to defaults</button>
                {msg && <span style={{ fontSize: 12.5, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.text}</span>}
              </div>

              {cfg && (
                <div className="muted" style={{ fontSize: 11.5, marginTop: 14 }}>
                  Config version {cfg.version || '—'} · super-admin only
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function Field({ label, hint, value, onChange, disabled }: {
  label: string; hint: string; value: string; onChange: (v: string) => void; disabled?: boolean;
}) {
  return (
    <div>
      <label style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</label>
      <div className="row" style={{ gap: 8, marginTop: 6, alignItems: 'center' }}>
        <input
          className="input mono"
          type="number"
          min={3}
          max={600}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 100 }}
        />
        <span className="muted" style={{ fontSize: 12 }}>seconds</span>
      </div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>{hint}</div>
    </div>
  );
}

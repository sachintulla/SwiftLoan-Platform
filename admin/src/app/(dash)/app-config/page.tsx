'use client';
import React, { useEffect, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { swrFetcher, apiFetch, ApiError } from '@/lib/api';

interface NudgeConfig {
  nudgeEnabled: boolean;
  nudgeStartMs: number;
  nudgeRotateMs: number;
  nudgeSnoozeMs: number;
  version: number;
}

const DEFAULTS: Omit<NudgeConfig, 'version'> = { nudgeEnabled: true, nudgeStartMs: 5000, nudgeRotateMs: 3000, nudgeSnoozeMs: 600000 };

// The same limits the server enforces (server/src/lib/appConfig.ts).
const LIMITS = { start: { min: 1, max: 60 }, rotate: { min: 1, max: 30 }, snooze: { min: 1, max: 1440 } };

const toSec = (ms: number | undefined, fb: number) => String(Math.round((ms ?? fb) / 1000));
const toMin = (ms: number | undefined, fb: number) => String(Math.round((ms ?? fb) / 60000));
const okRange = (s: string, r: { min: number; max: number }) => {
  const n = Number(s);
  return s !== '' && Number.isInteger(n) && n >= r.min && n <= r.max;
};

export default function AppConfigPage() {
  const { data, error, isLoading, mutate } = useSWR('/api/admin/config', swrFetcher, { revalidateOnFocus: false });
  const cfg = (data?.data as NudgeConfig | undefined) ?? undefined;

  const [enabled, setEnabled] = useState(DEFAULTS.nudgeEnabled);
  const [start, setStart] = useState(toSec(undefined, DEFAULTS.nudgeStartMs));
  const [rotate, setRotate] = useState(toSec(undefined, DEFAULTS.nudgeRotateMs));
  const [snooze, setSnooze] = useState(toMin(undefined, DEFAULTS.nudgeSnoozeMs));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = (c: NudgeConfig) => {
    setEnabled(c.nudgeEnabled);
    setStart(toSec(c.nudgeStartMs, DEFAULTS.nudgeStartMs));
    setRotate(toSec(c.nudgeRotateMs, DEFAULTS.nudgeRotateMs));
    setSnooze(toMin(c.nudgeSnoozeMs, DEFAULTS.nudgeSnoozeMs));
  };
  useEffect(() => { if (cfg) load(cfg); }, [cfg]);

  const bad = {
    start: !okRange(start, LIMITS.start),
    rotate: !okRange(rotate, LIMITS.rotate),
    snooze: !okRange(snooze, LIMITS.snooze),
  };
  const invalid = bad.start || bad.rotate || bad.snooze;
  const changed = !!cfg && (
    enabled !== cfg.nudgeEnabled ||
    start !== toSec(cfg.nudgeStartMs, DEFAULTS.nudgeStartMs) ||
    rotate !== toSec(cfg.nudgeRotateMs, DEFAULTS.nudgeRotateMs) ||
    snooze !== toMin(cfg.nudgeSnoozeMs, DEFAULTS.nudgeSnoozeMs)
  );

  async function save() {
    setSaving(true); setNotice(null);
    try {
      await apiFetch('/api/admin/config', {
        method: 'PUT',
        body: JSON.stringify({ nudgeEnabled: enabled, nudgeStartMs: Number(start) * 1000, nudgeRotateMs: Number(rotate) * 1000, nudgeSnoozeMs: Number(snooze) * 60000 }),
      });
      await mutate();
      setNotice({ ok: true, text: 'Saved. The app uses the new values the next time it opens or comes back to the foreground.' });
    } catch (e) {
      setNotice({ ok: false, text: e instanceof ApiError ? e.message : (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div>
        <h1 className="page-title">App Config</h1>
        <p className="page-sub">
          The “Ask Ruby” help bubble in the app. After someone lands on a screen it offers a tip, rotates through a few, and goes
          quiet for a while if they close it. Other timings are on <Link href="/timings" style={{ color: 'var(--brand)', fontWeight: 600 }}>Timings</Link>.
        </p>
      </div>

      <div style={{ maxWidth: 1000, marginTop: 20 }}>
        {notice && <div className={`tm-notice ${notice.ok ? 'tm-notice-ok' : 'tm-notice-err'}`}>{notice.text}</div>}

        {error ? (
          <div className="empty">
            Could not load the settings: {(error as Error).message}
            <div><button className="btn" style={{ marginTop: 12 }} onClick={() => mutate()}>Retry</button></div>
          </div>
        ) : isLoading && !data ? (
          <div className="skeleton" style={{ height: 280, borderRadius: 14 }} />
        ) : (
          <div className="tm-panel">
            <div className="tm-row">
              <div>
                <div className="tm-label">Help bubble</div>
                <div className="tm-help">Turn off to remove the bubble everywhere in the app.</div>
              </div>
              <div className="tm-ctl">
                <span className="tm-switch-wrap">
                  <button type="button" role="switch" aria-checked={enabled} aria-label="Help bubble" className="tm-switch" onClick={() => setEnabled(!enabled)} />
                  {enabled ? 'On' : 'Off'}
                </span>
              </div>
            </div>

            <NumRow label="Appears after" help="Time on a screen before the bubble first shows." unit="sec" value={start} onChange={setStart} bad={bad.start} range={LIMITS.start} def="5 sec" dim={!enabled} />
            <NumRow label="Rotates every" help="How long each tip stays before the next one." unit="sec" value={rotate} onChange={setRotate} bad={bad.rotate} range={LIMITS.rotate} def="3 sec" dim={!enabled} />
            <NumRow label="Quiet after it is closed" help="Tips stay away this long after the person taps ✕." unit="min" value={snooze} onChange={setSnooze} bad={bad.snooze} range={LIMITS.snooze} def="10 min" dim={!enabled} />

            <div className="tm-row" style={{ alignItems: 'center', background: 'var(--surface-2)' }}>
              <div className="tm-help" style={{ marginTop: 0 }}>{cfg ? `Config version ${cfg.version || '–'} · super-admin only` : ''}</div>
              <div className="row" style={{ gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn" disabled={saving} onClick={() => { setNotice(null); load({ ...DEFAULTS, version: cfg?.version ?? 0 }); }}>Use defaults</button>
                <button type="button" className="btn btn-primary" disabled={saving || invalid || !changed} onClick={save}>{saving ? 'Saving…' : 'Save changes'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NumRow({ label, help, unit, value, onChange, bad, range, def, dim }: {
  label: string; help: string; unit: string; value: string; onChange: (v: string) => void; bad: boolean;
  range: { min: number; max: number }; def: string; dim?: boolean;
}) {
  return (
    <div className="tm-row" style={{ opacity: dim ? 0.5 : 1 }}>
      <div>
        <div className="tm-label">{label}</div>
        <div className="tm-help">{help}</div>
      </div>
      <div className="tm-ctl">
        <div className={`tm-num${bad ? ' tm-bad' : ''}`}>
          <input type="number" step={1} min={range.min} max={range.max} aria-label={label} value={value} disabled={dim} onChange={(e) => onChange(e.target.value)} />
          <span>{unit}</span>
        </div>
        {bad && <div className="tm-err">Whole number from {range.min} to {range.max}</div>}
        <div className="tm-meta"><span>Default: {def}</span></div>
      </div>
    </div>
  );
}

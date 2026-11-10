'use client';
import { useRef, useState } from 'react';
import { apiUpload, ApiError } from '@/lib/api';
import { Card } from '@/components/ui';
import { num, dateStr } from '@/lib/format';

/** Mirrors the server report (adminRevasureMis.routes.ts). */
interface Change { field: string; from: unknown; to: unknown }
interface ReportRow {
  rowNumber: number;
  name: string | null;
  mobile: string | null;
  loanAmount: number | null;
  status: string | null;
  statusKnown: boolean;
  outcome: 'update' | 'no_change' | 'missing_mobile' | 'invalid_mobile' | 'missing_status' | 'no_customer' | 'no_lead';
  matched: boolean;
  customer: { id: string; name: string | null; phone: string | null } | null;
  leadId: string | null;
  changes: Change[];
  warnings: string[];
}
interface Report {
  fileName?: string | null;
  rows: ReportRow[];
  summary: { totalRows: number; matched: number; toUpdate: number; noChange: number; unmatched: number };
}

const OUTCOME: Record<ReportRow['outcome'], { label: string; tone: string }> = {
  update: { label: 'Will update', tone: 'ok' },
  no_change: { label: 'No change', tone: 'muted' },
  missing_mobile: { label: 'No mobile', tone: 'warn' },
  invalid_mobile: { label: 'Invalid mobile', tone: 'warn' },
  missing_status: { label: 'No status', tone: 'warn' },
  no_customer: { label: 'No customer match', tone: 'bad' },
  no_lead: { label: 'Not a Revasure lead', tone: 'bad' },
};

const FIELD_LABEL: Record<string, string> = {
  misStatus: 'Status',
  misRemark: 'Remark',
  misApprovedAmount: 'Approved amt',
  misDisbursedAmount: 'Disbursed amt',
  misDisbursementDate: 'Disbursed on',
};

function fmtVal(field: string, v: unknown): string {
  if (v == null || v === '') return '—';
  if (field === 'misDisbursementDate') return dateStr(String(v));
  if (field === 'misApprovedAmount' || field === 'misDisbursedAmount') return `₹${num(Number(v))}`;
  return String(v);
}

export default function RevasureMisUpload({ onApplied }: { onApplied?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Report | null>(null);
  const [busy, setBusy] = useState<null | 'preview' | 'apply'>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => { setPreview(null); setErr(null); setDone(null); };

  // Choosing a file auto-previews, so the results + Apply button appear right away.
  const pick = (f: File | null) => { setFile(f); reset(); if (f) void doPreview(f); };

  const call = async (path: string, f: File): Promise<Report | null> => {
    const form = new FormData();
    form.append('file', f);
    const res = await apiUpload<Report>(path, form);
    return res.data;
  };

  const doPreview = async (f: File | null = file) => {
    if (!f) return;
    setBusy('preview'); setErr(null); setDone(null);
    try { setPreview(await call('/api/admin/revasure/mis/preview', f)); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not read the sheet.'); setPreview(null); }
    finally { setBusy(null); }
  };

  const doApply = async () => {
    if (!file) return;
    setBusy('apply'); setErr(null);
    try {
      const r = await call('/api/admin/revasure/mis/apply', file);
      setDone(`Applied ${r?.summary.toUpdate ?? 0} update(s) from ${r?.summary.totalRows ?? 0} row(s).`);
      setPreview(r);
      onApplied?.();
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not apply the sheet.'); }
    finally { setBusy(null); }
  };

  const s = preview?.summary;

  return (
    <Card className="mt-16">
      <div className="row between wrap" style={{ gap: 8, alignItems: 'baseline' }}>
        <div>
          <h2 className="card-title" style={{ margin: 0 }}>Upload status sheet (MIS)</h2>
          <p className="page-sub" style={{ margin: '4px 0 0' }}>
            Revasure has no status API — upload their MIS sheet (Excel/CSV) to update each lead&apos;s status.
            Rows are matched to customers by <b>mobile number</b>. Choose a file to preview the matches, then apply.
          </p>
        </div>
      </div>

      <div className="adm-filters" style={{ marginTop: 12, alignItems: 'center' }}>
        <input
          ref={inputRef}
          type="file"
          className="input"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
          aria-label="MIS status sheet"
        />
        <button type="button" className="btn" disabled={!file || busy !== null} onClick={() => doPreview()}>
          {busy === 'preview' ? 'Reading…' : 'Re-check file'}
        </button>
        {file && <button type="button" className="adm-link-btn" disabled={busy !== null} onClick={() => { pick(null); if (inputRef.current) inputRef.current.value = ''; }}>Clear</button>}
      </div>

      {err && <p className="adm-fieldmsg" role="alert" style={{ marginTop: 10 }}>{err}</p>}
      {done && <p className="adm-resultline" role="status" style={{ marginTop: 10, color: 'var(--ok, #0a7)' }}>{done}</p>}

      {preview && s && (
        <>
          <div className="adm-stats" style={{ marginTop: 14 }}>
            <Stat2 label="Rows" value={s.totalRows} />
            <Stat2 label="Matched" value={s.matched} />
            <Stat2 label={done ? 'Updated' : 'To update'} value={s.toUpdate} tone="ok" />
            <Stat2 label="No change" value={s.noChange} />
            <Stat2 label="Unmatched" value={s.unmatched} tone={s.unmatched ? 'warn' : undefined} />
          </div>

          {/* Step 2 — the actual write. Always shown after a preview so it's never
              hidden; disabled (with a reason) when there's nothing to apply. */}
          {!done && (
            <div className="row" style={{ gap: 12, alignItems: 'center', marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy !== null || s.toUpdate === 0}
                onClick={doApply}
              >
                {busy === 'apply' ? 'Applying…' : s.toUpdate > 0 ? `Apply ${s.toUpdate} update${s.toUpdate === 1 ? '' : 's'}` : 'Nothing to apply'}
              </button>
              <span className="page-sub" style={{ margin: 0 }}>
                {s.toUpdate > 0
                  ? 'Review the rows below, then apply to update those leads.'
                  : s.matched > 0
                    ? 'All matched leads are already up to date.'
                    : 'No rows matched a customer with a Revasure lead — check the mobile numbers in the sheet.'}
              </span>
            </div>
          )}

          <div className="adm-tablewrap" style={{ marginTop: 12, maxHeight: 420, overflow: 'auto' }}>
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Row</th><th>Name</th><th>Mobile</th><th>Status</th><th>Outcome</th><th>Customer</th><th>Changes</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => {
                  const o = OUTCOME[r.outcome];
                  return (
                    <tr key={r.rowNumber}>
                      <td className="mono">{r.rowNumber}</td>
                      <td>{r.name ?? '—'}</td>
                      <td className="mono">{r.mobile ?? '—'}</td>
                      <td>{r.status ?? '—'}{r.status && !r.statusKnown && <span title="Unrecognised status — stored as-is"> ⚠︎</span>}</td>
                      <td><span className={`mis-pill mis-${o.tone}`}>{o.label}</span></td>
                      <td>{r.customer ? (r.customer.name || r.customer.phone || '—') : '—'}</td>
                      <td style={{ fontSize: 12.5 }}>
                        {r.changes.length ? (
                          <ul style={{ margin: 0, paddingLeft: 16 }}>
                            {r.changes.map((c) => (
                              <li key={c.field}>{FIELD_LABEL[c.field] ?? c.field}: {fmtVal(c.field, c.from)} → <b>{fmtVal(c.field, c.to)}</b></li>
                            ))}
                          </ul>
                        ) : '—'}
                        {r.warnings.map((w, i) => <div key={i} className="adm-err-text" style={{ fontSize: 11.5 }}>{w}</div>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <style jsx>{`
        .mis-pill { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; }
        .mis-ok { background: #e6f6ee; color: #0a7a46; }
        .mis-muted { background: #eef1f4; color: #667; }
        .mis-warn { background: #fdf3df; color: #8a6400; }
        .mis-bad { background: #fdeaea; color: #a33; }
      `}</style>
    </Card>
  );
}

function Stat2({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="adm-stat-btn" style={{ cursor: 'default' }}>
      <div className="stat">
        <div className="stat-value" style={tone === 'ok' ? { color: '#0a7a46' } : tone === 'warn' ? { color: '#8a6400' } : undefined}>{num(value)}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}

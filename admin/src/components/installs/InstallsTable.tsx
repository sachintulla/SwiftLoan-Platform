'use client';
import React, { Fragment, useState } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui';
import SendActions from '@/components/SendActions';
import { dateTimeStr, timeAgo } from '@/lib/format';
import {
  type InstallRow, loanDetailsText, hasLoanDetails, linkSentText, stageWhenSentNote, matchedByText, followUpDisabledReason,
  platformLabel, sentByLabel, channelLabel,
} from '@/lib/installs';
import './installs.css';

function Chevron() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3l5 5-5 5" />
    </svg>
  );
}

/** Row clicks open the details, but a click on a link, button or dialog inside the row must not. */
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

interface Props {
  rows: InstallRow[];
  stageName: (key: string) => string;
  /** Called after a follow-up goes out, so the page can refresh. */
  onChanged?: () => void;
}

export default function InstallsTable({ rows, stageName, onChanged }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (id: string) => setOpen((cur) => (cur === id ? null : id));

  return (
    <div className="table-wrap">
      <table className="adm-inst-table">
        <thead>
          <tr>
            <th scope="col">Customer</th>
            <th scope="col">Loan details</th>
            <th scope="col">Stage</th>
            <th scope="col">Link sent</th>
            <th scope="col">Installed</th>
            <th scope="col">Next step</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const c = r.context;
            const cust = r.customer;
            const isOpen = open === r.id;
            const detailId = `adm-inst-detail-${r.id}`;
            const link = linkSentText(c);
            const was = stageWhenSentNote(c, cust?.stage, stageName);
            const displayName = cust?.name || c?.name || null;
            const displayPhone = cust?.phone || c?.phone || null;
            return (
              <Fragment key={r.id}>
                <tr className={`adm-inst-row${isOpen ? ' adm-inst-open' : ''}`} onClick={() => toggle(r.id)}>
                  <td data-label="Customer">
                    <div className="adm-inst-cust">
                      <button
                        type="button"
                        className="adm-inst-chevron"
                        aria-expanded={isOpen}
                        aria-controls={detailId}
                        aria-label={`${isOpen ? 'Hide' : 'Show'} details for ${displayName || displayPhone || 'this install'}`}
                        onClick={(e) => { stop(e); toggle(r.id); }}
                      >
                        <Chevron />
                      </button>
                      <div style={{ minWidth: 0 }}>
                        {cust ? (
                          <Link href={`/customers/${cust.id}`} className="adm-inst-name" onClick={stop}>{displayName || 'Unnamed customer'}</Link>
                        ) : (
                          <div className="adm-inst-sub" style={{ marginTop: 0 }}>Not matched to a customer</div>
                        )}
                        {displayPhone && <div className="adm-inst-sub mono">{displayPhone}</div>}
                        {!cust && displayName && <div className="adm-inst-sub">Name sent with the link: {displayName}</div>}
                      </div>
                    </div>
                  </td>

                  <td data-label="Loan details">
                    <span className={hasLoanDetails(c) ? undefined : 'muted'}>{loanDetailsText(c)}</span>
                  </td>

                  <td data-label="Stage">
                    {cust ? (
                      <>
                        <StatusBadge status={cust.stage} label={cust.stageLabel} />
                        {was && <div className="adm-inst-note">{was}</div>}
                      </>
                    ) : (
                      <span className="muted">{r.signedIn ? 'Stage not available' : 'Not signed in yet'}</span>
                    )}
                  </td>

                  <td data-label="Link sent">
                    <div className={link.recorded ? undefined : 'muted'}>{link.text}</div>
                    {link.recorded && c?.sentAt && (
                      <div className="adm-inst-sub" title={dateTimeStr(c.sentAt)}>{timeAgo(c.sentAt)}</div>
                    )}
                  </td>

                  <td data-label="Installed" className="adm-inst-time">
                    <div>{dateTimeStr(r.installedAt)}</div>
                    <div className="adm-inst-sub">{timeAgo(r.installedAt)} on {platformLabel(r.platform)}</div>
                  </td>

                  <td data-label="Next step" className="adm-inst-next">
                    <div onClick={stop} onKeyDown={(e) => e.stopPropagation()}>
                      <SendActions
                        variant="compact"
                        customerId={cust?.id ?? null}
                        customerName={displayName}
                        stage={cust?.stage ?? null}
                        installId={r.id}
                        disabledReason={followUpDisabledReason(r)}
                        onDone={onChanged}
                      />
                    </div>
                  </td>
                </tr>

                {isOpen && (
                  <tr id={detailId} className="adm-inst-detail">
                    <td colSpan={6}>
                      <div className="adm-inst-detail-grid">
                        <div>
                          <h4>Customer</h4>
                          <dl className="fact-list">
                            <Fact label="Name" value={displayName} />
                            <Fact label="Mobile" value={displayPhone} mono />
                            <Fact label="Stage now" value={cust?.stageLabel ?? null} />
                            <Fact label="Signed in" value={r.signedIn ? 'Yes' : 'Not yet'} />
                          </dl>
                        </div>
                        <div>
                          <h4>What was sent with the link</h4>
                          <dl className="fact-list">
                            <Fact label="Loan details" value={hasLoanDetails(c) ? loanDetailsText(c) : null} empty="No details were sent" />
                            <Fact label="Stage when sent" value={c?.stageWhenSent ? stageName(c.stageWhenSent) : null} />
                            <Fact label="Sent by" value={c ? c.sentBy.label : null} empty="Link source not recorded" />
                            <Fact label="Channel" value={channelLabel(c?.sentVia) || null} />
                            <Fact label="Sent" value={c?.sentAt ? dateTimeStr(c.sentAt) : null} />
                          </dl>
                        </div>
                        <div>
                          <h4>Install</h4>
                          <dl className="fact-list">
                            <Fact label="Installed" value={dateTimeStr(r.installedAt)} />
                            <Fact label="Platform" value={platformLabel(r.platform)} />
                            <Fact label="Source" value={c ? sentByLabel(c.sentBy.type) : sentByLabel('organic')} />
                            <Fact label="Campaign" value={r.campaignId} />
                            <Fact label="How it was matched" value={matchedByText(r.matchMethod, r.signedIn)} />
                          </dl>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Fact({ label, value, empty = 'Not recorded', mono }: { label: string; value: string | null | undefined; empty?: string; mono?: boolean }) {
  const has = !!value;
  return (
    <div className="fact-row">
      <dt className="fact-label">{label}</dt>
      <dd className={`fact-value${has ? '' : ' is-empty'}${mono && has ? ' mono' : ''}`}>{has ? value : empty}</dd>
    </div>
  );
}

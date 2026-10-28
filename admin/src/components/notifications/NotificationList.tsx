'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { dateTimeStr, timeAgo } from '@/lib/format';
import { groupByDay, needsShowMore, severityTone, type NotifRow } from '@/lib/notificationsView';
import './notifications.css';

interface Props {
  rows: NotifRow[];
  /** Ids marked read in this session; shown as read even before the next refresh. */
  readIds: Set<string>;
  pendingIds: Set<string>;
  failedIds: Set<string>;
  /** Ids that were just marked, shown as "Marked" for a moment. */
  justMarkedIds: Set<string>;
  onMarkRead: (id: string) => void;
}

export default function NotificationList({ rows, readIds, pendingIds, failedIds, justMarkedIds, onMarkRead }: Props) {
  const groups = groupByDay(rows);
  return (
    <div>
      {groups.map((g) => (
        <section key={g.key} className="adm-notif-group" aria-labelledby={`adm-notif-g-${g.key}`}>
          <h3 id={`adm-notif-g-${g.key}`}>{g.label}</h3>
          <ul className="adm-notif-list">
            {g.rows.map((n) => (
              <NotificationRow
                key={n.id}
                n={n}
                read={n.read || readIds.has(n.id)}
                pending={pendingIds.has(n.id)}
                failed={failedIds.has(n.id)}
                justMarked={justMarkedIds.has(n.id)}
                onMarkRead={onMarkRead}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function NotificationRow({ n, read, pending, failed, justMarked, onMarkRead }: {
  n: NotifRow; read: boolean; pending: boolean; failed: boolean; justMarked: boolean; onMarkRead: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const long = needsShowMore(n.body);
  const bodyId = `adm-notif-body-${n.id}`;
  const subject = n.subject ? [n.subject.name, n.subject.phone, n.subject.ref].filter(Boolean).join(' - ') : '';

  return (
    <li className={`adm-notif-row${read ? '' : ' unread'}`}>
      <span className="adm-notif-dotcell">
        {read ? null : (
          <>
            <span className="adm-notif-dot" aria-hidden="true" />
            <span className="adm-notif-sr">Unread</span>
          </>
        )}
      </span>

      <span className="adm-notif-chip">{n.typeLabel}</span>

      <div className="adm-notif-main">
        <p className="adm-notif-title">{n.title}</p>
        {subject && <p className="adm-notif-subject">{subject}</p>}
        {n.body && (
          <>
            <p id={bodyId} className={`adm-notif-body${long && !expanded ? ' clamped' : ''}`}>{n.body}</p>
            {long && (
              <button type="button" className="adm-notif-more" aria-expanded={expanded} aria-controls={bodyId} onClick={() => setExpanded((v) => !v)}>
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </>
        )}
      </div>

      <span className={`badge tone-${severityTone(n.severity)} adm-notif-sev`}>{n.severityLabel}</span>

      <time className="adm-notif-time" dateTime={n.createdAt} title={dateTimeStr(n.createdAt)}>
        {timeAgo(n.createdAt)}
        <span className="adm-notif-sr"> ({dateTimeStr(n.createdAt)})</span>
      </time>

      <div className="adm-notif-actions">
        <div className="adm-notif-buttons">
          {n.target && <Link href={n.target.href} className="btn">Open<span className="adm-notif-sr"> {n.target.kind === 'loan' ? 'the loan' : 'the customer'} for {n.title}</span></Link>}
          {!read && (
            <button type="button" className="btn" disabled={pending} aria-busy={pending} onClick={() => onMarkRead(n.id)}>
              {pending ? 'Saving...' : 'Mark read'}
            </button>
          )}
          {read && justMarked && <span className="adm-notif-marked">Marked</span>}
        </div>
        {failed && <p className="adm-notif-fail" role="alert">Could not mark as read. Try again.</p>}
      </div>
    </li>
  );
}

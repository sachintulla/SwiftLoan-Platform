'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Wallet,
  FileText,
  ShieldCheck,
  Landmark,
  Receipt,
  ClipboardList,
  CircleHelp,
  Gavel,
  Phone,
  Mail,
  Search,
  Send,
  CheckCircle2,
  Zap,
  ChevronDown,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AccountShell } from '@/components/apply/AccountShell';
import { Badge, Card, Field, SectionLabel, TextInput } from '@/components/apply/primitives';
import { useAccount } from '@/lib/accountContext';
import {
  createTicket,
  listApplications,
  listTickets,
  type LoanApplication,
  type SupportTicket,
  type TicketCategory,
  type TicketStatus,
} from '@/lib/applyApi';
import { fmtINR } from '@/lib/core';
import { useCopy } from '@/lib/i18n';
import { faqsCopy } from '@/i18n/faqs';

const CATEGORIES: { key: TicketCategory; icon: LucideIcon; title: string; sub: string }[] = [
  { key: 'repayments', icon: Wallet, title: 'Repayments', sub: 'EMI & prepayment' },
  { key: 'documents', icon: FileText, title: 'Documents', sub: 'KYC & proofs' },
  { key: 'privacy', icon: ShieldCheck, title: 'Privacy & data', sub: 'How we use your data' },
  { key: 'disbursement', icon: Landmark, title: 'Disbursement', sub: 'When funds arrive' },
  { key: 'fees', icon: Receipt, title: 'Fees & charges', sub: 'Processing fee, GST' },
  { key: 'application', icon: ClipboardList, title: 'My application', sub: 'Status & changes' },
];

const OTHER = { key: 'other' as TicketCategory, icon: CircleHelp, title: 'Something else', sub: 'Anything not listed' };
const CATEGORY_TITLE: Record<string, string> = Object.fromEntries([...CATEGORIES, OTHER].map((c) => [c.key, c.title]));

const STATUS_BADGE: Record<TicketStatus, { label: string; tone: 'warning' | 'info' | 'success' }> = {
  open: { label: 'Open', tone: 'warning' },
  in_progress: { label: 'In progress', tone: 'info' },
  resolved: { label: 'Resolved', tone: 'success' },
};

const SUBJECT_MIN = 3;
const BODY_MIN = 10;
const BODY_MAX = 2000;

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function SupportPage() {
  const { loading: accountLoading } = useAccount();
  const faqs = useCopy(faqsCopy).faqs;

  // ── search ────────────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return faqs.filter((f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q)).slice(0, 4);
  }, [query, faqs]);
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  // ── ticket form ───────────────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const ticketsRef = useRef<HTMLDivElement>(null);
  const [category, setCategory] = useState<TicketCategory | null>(null);
  const [grievance, setGrievance] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [applicationId, setApplicationId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<SupportTicket | null>(null);

  // ── data ──────────────────────────────────────────────────────────────────
  const [apps, setApps] = useState<LoanApplication[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [openTicket, setOpenTicket] = useState<string | null>(null);

  const loadTickets = useCallback(() => {
    listTickets()
      .then(setTickets)
      .catch(() => setTickets([]))
      .finally(() => setTicketsLoading(false));
  }, []);

  useEffect(() => {
    if (accountLoading) return;
    loadTickets();
    listApplications().then(setApps).catch(() => setApps([]));
  }, [accountLoading, loadTickets]);

  const scrollTo = (el: HTMLElement | null) => el?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const startTicket = (cat: TicketCategory | null, asGrievance = false) => {
    setCreated(null);
    setError(null);
    setGrievance(asGrievance);
    if (cat) setCategory(cat);
    setModalOpen(true);
  };

  const closeModal = useCallback(() => {
    if (submitting) return;
    setModalOpen(false);
    setError(null);
  }, [submitting]);

  // Popup behaviour: Esc closes and the page behind doesn't scroll (subject autofocuses on mount).
  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [modalOpen, closeModal]);

  const subjectOk = subject.trim().length >= SUBJECT_MIN;
  const bodyOk = body.trim().length >= BODY_MIN;
  const canSubmit = !!category && subjectOk && bodyOk && !submitting;

  const submit = async () => {
    if (!canSubmit || !category) return;
    setSubmitting(true);
    setError(null);
    try {
      const t = await createTicket({
        type: grievance ? 'grievance' : 'query',
        category,
        subject: subject.trim(),
        body: body.trim(),
        ...(applicationId ? { applicationId } : {}),
      });
      setCreated(t);
      setSubject('');
      setBody('');
      setApplicationId('');
      setCategory(null);
      setGrievance(false);
      loadTickets();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not raise your ticket. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Voice assistant ("Ruby") lives in a floating widget — open it rather than
  // duplicating a chat UI here.
  const startChat = () => {
    const btn = document.querySelector<HTMLElement>('[aria-label^="Talk to"]');
    if (btn) btn.click();
  };

  return (
    <AccountShell>
      <h1 className="text-2xl font-extrabold">How can we help?</h1>
      <p className="text-muted-foreground mt-1 text-sm">Search for an answer, chat with Ruby, or raise a ticket — we&apos;ll get back to you.</p>

      {/* Search */}
      <div className="relative mt-4">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for help..."
          aria-label="Search for help"
          className="input-interactive field-input h-11 w-full rounded-xl pr-3.5 pl-10 text-sm"
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground font-semibold">Popular:</span>
        {['Repayment', 'Privacy', 'Charges'].map((p) => (
          <button
            key={p}
            onClick={() => setQuery(p)}
            className="bg-accent text-primary hover:bg-accent/70 rounded-full px-3 py-1 font-semibold transition-colors"
          >
            {p}
          </button>
        ))}
      </div>

      {query.trim().length >= 2 && (
        <Card className="mt-4 !p-1.5">
          {matches.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <p className="text-sm font-bold">No matching answers</p>
              <p className="text-muted-foreground mt-0.5 text-xs">Raise a ticket and our team will help you directly.</p>
              <button onClick={() => startTicket(null)} className="text-primary mt-2 text-xs font-bold underline">
                Raise a ticket
              </button>
            </div>
          ) : (
            <>
              {matches.map((f) => {
                const open = openFaq === f.q;
                return (
                  <div key={f.q} className="border-border border-b last:border-b-0">
                    <button onClick={() => setOpenFaq(open ? null : f.q)} className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm font-semibold">
                      <span className="flex-1">{f.q}</span>
                      <ChevronDown className={`text-muted-foreground h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                    {open && <p className="text-muted-foreground px-3 pb-3 text-xs leading-relaxed">{f.a}</p>}
                  </div>
                );
              })}
              <p className="text-muted-foreground px-3 py-2.5 text-center text-xs">
                Not what you were looking for?{' '}
                <button onClick={() => startTicket(null)} className="text-primary font-bold underline">
                  Raise a ticket
                </button>
              </p>
            </>
          )}
        </Card>
      )}

      {/* Ruby */}
      <div className="bg-deep-gradient mt-6 rounded-2xl p-6 text-white">
        <span className="bg-mint inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold">
          <Zap className="h-2.5 w-2.5" /> AI-POWERED
        </span>
        <h2 className="mt-3 text-lg font-extrabold">Chat with Ruby</h2>
        <p className="mt-1.5 text-xs text-white/75">
          Your personal loan assistant — ask about EMIs, documents or your application status, any time.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button onClick={startChat} className="text-primary rounded-full bg-white px-4 py-2 text-sm font-bold">
            Start chat →
          </button>
          <button onClick={() => scrollTo(ticketsRef.current)} className="rounded-full border border-white/30 px-4 py-2 text-sm font-bold">
            Past tickets{tickets.length > 0 ? ` (${tickets.length})` : ''}
          </button>
        </div>
      </div>

      {/* Topics → each one starts a ticket in that category */}
      <div className="mt-6">
        <SectionLabel>Raise a ticket by topic</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          {CATEGORIES.map((t) => {
            const on = category === t.key;
            return (
              <button
                key={t.key}
                onClick={() => startTicket(t.key)}
                aria-pressed={on}
                className={`border-border bg-card rounded-2xl border p-4 text-left transition-colors hover:border-primary/60 ${on ? 'border-primary bg-accent/50' : ''}`}
              >
                <span className="bg-accent text-primary grid h-9 w-9 place-items-center rounded-lg">
                  <t.icon className="h-4.5 w-4.5" />
                </span>
                <div className="mt-2 text-sm font-bold">{t.title}</div>
                <div className="text-muted-foreground text-xs">{t.sub}</div>
              </button>
            );
          })}
        </div>
        <button
          onClick={() => startTicket('other')}
          className="bg-brand-gradient text-primary-foreground mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-sm font-bold shadow-[var(--shadow-soft)] transition-transform hover:-translate-y-0.5"
        >
          <Send className="h-4 w-4" /> Raise a ticket
        </button>
      </div>

      {/* Grievance */}
      <Card className="mt-6">
        <div className="flex items-center gap-2.5">
          <span className="bg-accent text-primary grid h-10 w-10 place-items-center rounded-xl">
            <Gavel className="h-4.5 w-4.5" />
          </span>
          <strong>Grievance Redressal</strong>
        </div>
        <p className="text-muted-foreground mt-2.5 text-xs leading-relaxed">
          Not satisfied with a resolution? File a formal grievance and our nodal officer will respond directly.
        </p>
        <div className="bg-muted mt-3 flex justify-between rounded-lg px-3.5 py-2.5 text-xs">
          <span className="text-muted-foreground">Response time</span>
          <strong>Within 24 hours</strong>
        </div>
        <button onClick={() => startTicket(category ?? 'other', true)} className="border-border hover:bg-accent mt-3 w-full rounded-full border py-2.5 text-sm font-bold transition-colors">
          File a grievance
        </button>
      </Card>

      {/* My tickets */}
      <div ref={ticketsRef} className="mt-6 scroll-mt-6">
        <SectionLabel>Your tickets</SectionLabel>
        {ticketsLoading || accountLoading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : tickets.length === 0 ? (
          <div className="border-border rounded-2xl border border-dashed p-6 text-center">
            <p className="text-sm font-bold">No tickets yet</p>
            <p className="text-muted-foreground mt-1 text-xs">Tickets you raise will appear here with their status.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {tickets.map((t) => {
              const open = openTicket === t.id;
              const badge = STATUS_BADGE[t.status];
              return (
                <div key={t.id} className="border-border bg-card overflow-hidden rounded-2xl border">
                  <button onClick={() => setOpenTicket(open ? null : t.id)} className="flex w-full items-start gap-3 p-4 text-left" aria-expanded={open}>
                    <div className="min-w-0 flex-1">
                      <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-[11px] font-bold">
                        <span>{t.ref}</span>
                        <span>·</span>
                        <span>{CATEGORY_TITLE[t.category] ?? t.category}</span>
                        {t.type === 'grievance' && <Badge tone="danger">Grievance</Badge>}
                      </div>
                      <div className="mt-1 truncate text-sm font-bold">{t.subject}</div>
                      <div className="text-muted-foreground mt-0.5 text-xs">Raised {fmtDate(t.createdAt)}</div>
                    </div>
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </button>
                  {open && (
                    <div className="border-border border-t px-4 py-3.5 text-sm">
                      <p className="text-muted-foreground text-[11px] font-bold tracking-wide uppercase">Your message</p>
                      <p className="mt-1 leading-relaxed whitespace-pre-wrap">{t.body || '—'}</p>
                      {t.adminNote && (
                        <div className="bg-accent mt-3 rounded-lg px-3.5 py-3">
                          <p className="text-primary text-[11px] font-bold tracking-wide uppercase">Update from SwiftLoan</p>
                          <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{t.adminNote}</p>
                        </div>
                      )}
                      {t.status === 'resolved' && t.resolvedAt && <p className="text-muted-foreground mt-3 text-xs">Resolved {fmtDate(t.resolvedAt)}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Contact */}
      <div className="mt-6">
        <SectionLabel>Contact us</SectionLabel>
        <div className="flex flex-col gap-2.5">
          <a href="tel:18001234567">
            <Card className="hover:border-primary/60 flex items-center gap-3.5 transition-colors">
              <span className="bg-accent text-primary grid h-9 w-9 place-items-center rounded-lg">
                <Phone className="h-4 w-4" />
              </span>
              <div>
                <div className="text-sm font-bold">Call us</div>
                <div className="text-muted-foreground text-xs">1800-123-4567 (toll-free)</div>
              </div>
            </Card>
          </a>
          <a href="mailto:support@swiftloan.ai">
            <Card className="hover:border-primary/60 flex items-center gap-3.5 transition-colors">
              <span className="bg-accent text-primary grid h-9 w-9 place-items-center rounded-lg">
                <Mail className="h-4 w-4" />
              </span>
              <div>
                <div className="text-sm font-bold">Email us</div>
                <div className="text-muted-foreground text-xs">support@swiftloan.ai</div>
              </div>
            </Card>
          </a>
        </div>
      </div>

      {/* Ticket popup */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[10002] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6"
          onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ticket-modal-title"
            className="animate-in fade-in slide-in-from-bottom-4 bg-card max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl p-5 shadow-[var(--shadow-float)] duration-200 sm:rounded-3xl sm:p-6"
          >
            {created ? (
              <div className="text-center py-4">
            <span className="bg-success-soft text-success mx-auto grid h-14 w-14 place-items-center rounded-full">
              <CheckCircle2 className="h-7 w-7" />
            </span>
            <h2 id="ticket-modal-title" className="mt-4 text-lg font-extrabold">Ticket raised</h2>
            <p className="text-muted-foreground mt-1.5 text-sm">
              Your reference is <strong className="text-foreground">{created.ref}</strong>. Our team has received it
              {created.type === 'grievance' ? ' and will respond within 24 hours.' : ' and will get back to you shortly.'}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button onClick={() => { setModalOpen(false); setTimeout(() => scrollTo(ticketsRef.current), 50); }} className="border-border rounded-full border px-5 py-2.5 text-sm font-bold">
                View my tickets
              </button>
              <button onClick={() => startTicket(null)} className="bg-brand-gradient text-primary-foreground rounded-full px-5 py-2.5 text-sm font-bold">
                Raise another
              </button>
            </div>
              </div>
            ) : (
              <div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="ticket-modal-title" className="text-lg font-extrabold">{grievance ? 'File a grievance' : 'Raise a ticket'}</h2>
                <p className="text-muted-foreground mt-0.5 text-xs">We&apos;ll look into it and get back to you.</p>
                {grievance && (
                  <button onClick={() => setGrievance(false)} className="text-primary mt-1 text-xs font-bold underline">
                    Make it a normal ticket
                  </button>
                )}
              </div>
              <button onClick={closeModal} aria-label="Close" className="bg-muted text-muted-foreground hover:text-foreground grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            {grievance && (
              <p className="bg-accent text-accent-foreground mt-3 rounded-lg px-3 py-2 text-xs leading-relaxed">
                A formal grievance goes to our nodal officer, who will respond directly within 24 hours.
              </p>
            )}

            <div className="mt-4 flex flex-col gap-4">
              <Field label="What is it about?" required>
                <div className="flex flex-wrap gap-2">
                  {[...CATEGORIES, OTHER].map((c) => (
                    <button
                      type="button"
                      key={c.key}
                      onClick={() => setCategory(c.key)}
                      aria-pressed={category === c.key}
                      className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${
                        category === c.key ? 'border-primary bg-accent text-primary' : 'border-border bg-card text-muted-foreground'
                      }`}
                    >
                      {c.title}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Subject" required>
                <TextInput autoFocus value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} placeholder="e.g. EMI debited twice this month" />
              </Field>

              <Field label="Describe your issue" required hint={`${body.length}/${BODY_MAX}${body.length > 0 && !bodyOk ? ` · at least ${BODY_MIN} characters` : ''}`}>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
                  rows={5}
                  placeholder="Tell us what happened, with any dates or amounts that help."
                  className="input-interactive field-input w-full resize-y rounded-xl px-3.5 py-3 text-sm leading-relaxed"
                />
              </Field>

              {apps.length > 0 && (
                <Field label="Related application" hint="Optional — helps us find your case faster">
                  <select
                    value={applicationId}
                    onChange={(e) => setApplicationId(e.target.value)}
                    className="input-interactive field-input h-11 w-full rounded-xl px-3 text-sm font-medium"
                  >
                    <option value="">Not about a specific application</option>
                    {apps.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.ref} · {fmtINR(a.amount)}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              {error && <p className="text-danger text-sm font-semibold">{error}</p>}

              <button
                onClick={submit}
                disabled={!canSubmit}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-sm font-bold transition-transform ${
                  canSubmit ? 'bg-brand-gradient text-primary-foreground shadow-[var(--shadow-soft)] hover:-translate-y-0.5' : 'bg-muted text-muted-foreground cursor-not-allowed'
                }`}
              >
                {submitting ? 'Submitting…' : (<><Send className="h-4 w-4" /> Submit {grievance ? 'grievance' : 'ticket'}</>)}
              </button>
              {!category && <p className="text-muted-foreground -mt-2 text-center text-xs">Pick a topic above to continue.</p>}
            </div>
              </div>
            )}
          </div>
        </div>
      )}
    </AccountShell>
  );
}

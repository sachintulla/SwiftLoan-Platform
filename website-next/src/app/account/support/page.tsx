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
import { useCopy, useLang } from '@/lib/i18n';
import { faqsCopy } from '@/i18n/faqs';
import { supportCopy } from '@/i18n/account-support';

// `key` is the value sent to the API; titles/subs are looked up per language from supportCopy.
const CATEGORIES: { key: TicketCategory; icon: LucideIcon }[] = [
  { key: 'repayments', icon: Wallet },
  { key: 'documents', icon: FileText },
  { key: 'privacy', icon: ShieldCheck },
  { key: 'disbursement', icon: Landmark },
  { key: 'fees', icon: Receipt },
  { key: 'application', icon: ClipboardList },
];

const OTHER = { key: 'other' as TicketCategory, icon: CircleHelp };

const STATUS_TONE: Record<TicketStatus, 'warning' | 'info' | 'success'> = {
  open: 'warning',
  in_progress: 'info',
  resolved: 'success',
};

const SUBJECT_MIN = 3;
const BODY_MIN = 10;
const BODY_MAX = 2000;

const DATE_LOCALE = { en: 'en-IN', hi: 'hi-IN', te: 'te-IN' } as const;

export default function SupportPage() {
  const { loading: accountLoading } = useAccount();
  const faqs = useCopy(faqsCopy).faqs;
  const t = useCopy(supportCopy);
  const { lang } = useLang();
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(DATE_LOCALE[lang], { day: 'numeric', month: 'short', year: 'numeric' });
  const catText = (key: string) => (t.categories as Record<string, { title: string; sub: string }>)[key];

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
      const ticket = await createTicket({
        type: grievance ? 'grievance' : 'query',
        category,
        subject: subject.trim(),
        body: body.trim(),
        ...(applicationId ? { applicationId } : {}),
      });
      setCreated(ticket);
      setSubject('');
      setBody('');
      setApplicationId('');
      setCategory(null);
      setGrievance(false);
      loadTickets();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errSubmit);
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
      <h1 className="text-2xl font-extrabold">{t.title}</h1>
      <p className="text-muted-foreground mt-1 text-sm">{t.intro}</p>

      {/* Search */}
      <div className="relative mt-4">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchLabel}
          className="input-interactive field-input h-11 w-full rounded-xl pr-3.5 pl-10 text-sm"
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground font-semibold">{t.popularLabel}</span>
        {t.popular.map((p) => (
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
              <p className="text-sm font-bold">{t.noMatches}</p>
              <p className="text-muted-foreground mt-0.5 text-xs">{t.noMatchesSub}</p>
              <button onClick={() => startTicket(null)} className="text-primary mt-2 text-xs font-bold underline">
                {t.raiseTicket}
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
                {t.notWhatLooking}{' '}
                <button onClick={() => startTicket(null)} className="text-primary font-bold underline">
                  {t.raiseTicket}
                </button>
              </p>
            </>
          )}
        </Card>
      )}

      {/* Ruby */}
      <div className="bg-deep-gradient mt-6 rounded-2xl p-6 text-white">
        <span className="bg-mint inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold">
          <Zap className="h-2.5 w-2.5" /> {t.rubyBadge}
        </span>
        <h2 className="mt-3 text-lg font-extrabold">{t.rubyTitle}</h2>
        <p className="mt-1.5 text-xs text-white/75">
          {t.rubyBody}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button onClick={startChat} className="text-primary rounded-full bg-white px-4 py-2 text-sm font-bold">
            {t.startChat}
          </button>
          <button onClick={() => scrollTo(ticketsRef.current)} className="rounded-full border border-white/30 px-4 py-2 text-sm font-bold">
            {t.pastTickets}{tickets.length > 0 ? ` (${tickets.length})` : ''}
          </button>
        </div>
      </div>

      {/* Topics → each one starts a ticket in that category */}
      <div className="mt-6">
        <SectionLabel>{t.topicsLabel}</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          {CATEGORIES.map((c) => {
            const on = category === c.key;
            return (
              <button
                key={c.key}
                onClick={() => startTicket(c.key)}
                aria-pressed={on}
                className={`border-border bg-card rounded-2xl border p-4 text-left transition-colors hover:border-primary/60 ${on ? 'border-primary bg-accent/50' : ''}`}
              >
                <span className="bg-accent text-primary grid h-9 w-9 place-items-center rounded-lg">
                  <c.icon className="h-4.5 w-4.5" />
                </span>
                <div className="mt-2 text-sm font-bold">{catText(c.key)?.title}</div>
                <div className="text-muted-foreground text-xs">{catText(c.key)?.sub}</div>
              </button>
            );
          })}
        </div>
        <button
          onClick={() => startTicket('other')}
          className="bg-brand-gradient text-primary-foreground mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-sm font-bold shadow-[var(--shadow-soft)] transition-transform hover:-translate-y-0.5"
        >
          <Send className="h-4 w-4" /> {t.raiseTicket}
        </button>
      </div>

      {/* Grievance */}
      <Card className="mt-6">
        <div className="flex items-center gap-2.5">
          <span className="bg-accent text-primary grid h-10 w-10 place-items-center rounded-xl">
            <Gavel className="h-4.5 w-4.5" />
          </span>
          <strong>{t.grievanceTitle}</strong>
        </div>
        <p className="text-muted-foreground mt-2.5 text-xs leading-relaxed">
          {t.grievanceBody}
        </p>
        <div className="bg-muted mt-3 flex justify-between rounded-lg px-3.5 py-2.5 text-xs">
          <span className="text-muted-foreground">{t.responseTime}</span>
          <strong>{t.within24}</strong>
        </div>
        <button onClick={() => startTicket(category ?? 'other', true)} className="border-border hover:bg-accent mt-3 w-full rounded-full border py-2.5 text-sm font-bold transition-colors">
          {t.fileGrievance}
        </button>
      </Card>

      {/* My tickets */}
      <div ref={ticketsRef} className="mt-6 scroll-mt-6">
        <SectionLabel>{t.yourTickets}</SectionLabel>
        {ticketsLoading || accountLoading ? (
          <p className="text-muted-foreground text-sm" aria-busy="true">{t.loading}</p>
        ) : tickets.length === 0 ? (
          <div className="border-border rounded-2xl border border-dashed p-6 text-center">
            <p className="text-sm font-bold">{t.noTickets}</p>
            <p className="text-muted-foreground mt-1 text-xs">{t.noTicketsSub}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {tickets.map((tk) => {
              const open = openTicket === tk.id;
              const badgeLabel = t.status[tk.status] ?? tk.status;
              return (
                <div key={tk.id} className="border-border bg-card overflow-hidden rounded-2xl border">
                  <button onClick={() => setOpenTicket(open ? null : tk.id)} className="flex w-full items-start gap-3 p-4 text-left" aria-expanded={open}>
                    <div className="min-w-0 flex-1">
                      <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-[11px] font-bold">
                        <span>{tk.ref}</span>
                        <span>·</span>
                        <span>{catText(tk.category)?.title ?? tk.category}</span>
                        {tk.type === 'grievance' && <Badge tone="danger">{t.grievanceBadge}</Badge>}
                      </div>
                      <div className="mt-1 truncate text-sm font-bold">{tk.subject}</div>
                      <div className="text-muted-foreground mt-0.5 text-xs">{t.raised(fmtDate(tk.createdAt))}</div>
                    </div>
                    <Badge tone={STATUS_TONE[tk.status]}>{badgeLabel}</Badge>
                  </button>
                  {open && (
                    <div className="border-border border-t px-4 py-3.5 text-sm">
                      <p className="text-muted-foreground text-[11px] font-bold tracking-wide uppercase">{t.yourMessage}</p>
                      <p className="mt-1 leading-relaxed whitespace-pre-wrap">{tk.body || '—'}</p>
                      {tk.adminNote && (
                        <div className="bg-accent mt-3 rounded-lg px-3.5 py-3">
                          <p className="text-primary text-[11px] font-bold tracking-wide uppercase">{t.updateFrom}</p>
                          <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{tk.adminNote}</p>
                        </div>
                      )}
                      {tk.status === 'resolved' && tk.resolvedAt && <p className="text-muted-foreground mt-3 text-xs">{t.resolved(fmtDate(tk.resolvedAt))}</p>}
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
        <SectionLabel>{t.contactLabel}</SectionLabel>
        <div className="flex flex-col gap-2.5">
          <a href="tel:18001234567">
            <Card className="hover:border-primary/60 flex items-center gap-3.5 transition-colors">
              <span className="bg-accent text-primary grid h-9 w-9 place-items-center rounded-lg">
                <Phone className="h-4 w-4" />
              </span>
              <div>
                <div className="text-sm font-bold">{t.callUs}</div>
                <div className="text-muted-foreground text-xs">{t.callSub}</div>
              </div>
            </Card>
          </a>
          <a href="mailto:support@swiftloan.ai">
            <Card className="hover:border-primary/60 flex items-center gap-3.5 transition-colors">
              <span className="bg-accent text-primary grid h-9 w-9 place-items-center rounded-lg">
                <Mail className="h-4 w-4" />
              </span>
              <div>
                <div className="text-sm font-bold">{t.emailUs}</div>
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
            <h2 id="ticket-modal-title" className="mt-4 text-lg font-extrabold">{t.createdTitle}</h2>
            <p className="text-muted-foreground mt-1.5 text-sm">
              {t.createdRefPre}<strong className="text-foreground">{created.ref}</strong>
              {created.type === 'grievance' ? t.createdPostGrievance : t.createdPostQuery}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button onClick={() => { setModalOpen(false); setTimeout(() => scrollTo(ticketsRef.current), 50); }} className="border-border rounded-full border px-5 py-2.5 text-sm font-bold">
                {t.viewTickets}
              </button>
              <button onClick={() => startTicket(null)} className="bg-brand-gradient text-primary-foreground rounded-full px-5 py-2.5 text-sm font-bold">
                {t.raiseAnother}
              </button>
            </div>
              </div>
            ) : (
              <div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="ticket-modal-title" className="text-lg font-extrabold">{grievance ? t.modalGrievance : t.modalTicket}</h2>
                <p className="text-muted-foreground mt-0.5 text-xs">{t.modalSub}</p>
                {grievance && (
                  <button onClick={() => setGrievance(false)} className="text-primary mt-1 text-xs font-bold underline">
                    {t.makeNormal}
                  </button>
                )}
              </div>
              <button onClick={closeModal} aria-label={t.close} className="bg-muted text-muted-foreground hover:text-foreground grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            {grievance && (
              <p className="bg-accent text-accent-foreground mt-3 rounded-lg px-3 py-2 text-xs leading-relaxed">
                {t.grievanceNote}
              </p>
            )}

            <div className="mt-4 flex flex-col gap-4">
              <Field label={t.fieldTopic} required>
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
                      {catText(c.key)?.title}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label={t.fieldSubject} required>
                <TextInput autoFocus value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} placeholder={t.subjectPlaceholder} />
              </Field>

              <Field label={t.fieldBody} required hint={`${body.length}/${BODY_MAX}${body.length > 0 && !bodyOk ? t.bodyMin(BODY_MIN) : ''}`}>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
                  rows={5}
                  placeholder={t.bodyPlaceholder}
                  className="input-interactive field-input w-full resize-y rounded-xl px-3.5 py-3 text-sm leading-relaxed"
                />
              </Field>

              {apps.length > 0 && (
                <Field label={t.fieldApp} hint={t.fieldAppHint}>
                  <select
                    value={applicationId}
                    onChange={(e) => setApplicationId(e.target.value)}
                    className="input-interactive field-input h-11 w-full rounded-xl px-3 text-sm font-medium"
                  >
                    <option value="">{t.noSpecificApp}</option>
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
                data-voice-gate="submit-ticket"
                className={`inline-flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-sm font-bold transition-transform ${
                  canSubmit ? 'bg-brand-gradient text-primary-foreground shadow-[var(--shadow-soft)] hover:-translate-y-0.5' : 'bg-muted text-muted-foreground cursor-not-allowed'
                }`}
              >
                {submitting ? t.submitting : (<><Send className="h-4 w-4" /> {grievance ? t.submitGrievance : t.submitTicket}</>)}
              </button>
              {!category && <p className="text-muted-foreground -mt-2 text-center text-xs">{t.pickTopic}</p>}
            </div>
              </div>
            )}
          </div>
        </div>
      )}
    </AccountShell>
  );
}

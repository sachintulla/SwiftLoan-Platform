'use client';
import { useEffect, useRef, useState, type FormEvent, useCallback } from "react";
import {
  ArrowRight,
  ArrowRightLeft,
  FileCheck,
  Landmark,
  LockKeyhole,
  ShieldCheck,
  Wifi,
  BatteryFull,
  SignalHigh,
  QrCode,
  ChevronDown,
  MapPin,
  Phone,
  Mail,
  User,
  Check,
  type LucideIcon,
} from "lucide-react";

import { toast } from "sonner";
import { Reveal } from "@/components/site/Reveal";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCopy } from "@/lib/i18n";
import { leadFormCopy } from "@/i18n/lead-form";
import { submitLead, attribution, makeRefId } from "@/lib/leads";
import { upshotEvent, upshotIdentify } from "@/components/UpshotWeb";

type LeadFormText = (typeof leadFormCopy)["en"];

const assuranceIcons = [ShieldCheck, ArrowRightLeft, Landmark, FileCheck];

const appStoreUrl = "https://apps.apple.com/app/id0000000000";

/**
 * QR for the app link.
 *
 * NOTE: this is a third-party image service, so every visitor's context link
 * (which carries their lead token) is sent to api.qrserver.com. That is fine for
 * a demo and NOT fine for launch — swap for a local generator before go-live.
 */
function qrFor(url: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=${encodeURIComponent(url)}`;
}

export function LeadForm() {
  const [consent, setConsent] = useState(false);
  const [matched, setMatched] = useState(false);
  const [seconds, setSeconds] = useState(10);
  const [refId, setRefId] = useState("");
  /** Deep link back into the app carrying this lead's context token. */
  const [landing, setLanding] = useState<string | undefined>(undefined);
  const isMobile = useIsMobile();
  const formRef = useRef<HTMLFormElement>(null);
  const [focusedField, setFocusedField] = useState<string | null>("loan-type");
  const t = useCopy(leadFormCopy);

  const handleFocus = useCallback((name: string) => setFocusedField(name), []);
  const handleBlur = useCallback(() => setFocusedField(null), []);

  useEffect(() => {
    if (!matched) return;
    if (seconds <= 0) {
      if (isMobile) {
        window.location.href = landing || appStoreUrl;
      } else {
        setMatched(false);
        setConsent(false);
        formRef.current?.reset();
      }
      return;
    }
    const t = window.setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [matched, seconds, isMobile]);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!consent) {
      toast.error(t.toastConsent);
      return;
    }
    const data = new FormData(e.currentTarget);
    const amount = Number(String(data.get("amount") ?? "").replace(/\D/g, ""));
    if (!Number.isFinite(amount) || amount < 10000 || amount > 50000000) {
      toast.error(t.toastAmount);
      return;
    }
    const mobile = String(data.get("mobile") ?? "");
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      toast.error(t.toastMobile);
      return;
    }

    // ── the integration the redesign must preserve ────────────────────────
    // Show the success state immediately: the visitor should never wait on a
    // network round-trip, and the lead is durable server-side either way.
    const ref = makeRefId();
    setRefId(ref);
    setSeconds(10);
    setMatched(true);

    const details = {
      name: String(data.get("fullName") ?? ""),
      phone: mobile,
      email: String(data.get("email") ?? ""),
      city: String(data.get("city") ?? ""),
      product: String(data.get("loanType") ?? "") || "Personal Loan",
      amountRupees: amount,
    };

    // Identify first, then record the conversion — so the visitor resolves to
    // the same Upshot profile as their later app login (same E.164 key) and
    // journeys can target them.
    upshotIdentify({ name: details.name, phone: details.phone, email: details.email, city: details.city });
    upshotEvent("website_lead_submitted", {
      product: details.product,
      amount: details.amountRupees,
      ref,
      ...attribution(),
    });

    // Fire-and-forget: this is what creates the Customer, raises `lead_captured`
    // and puts the number in front of leadAutoCaller, which calls them ~1 min
    // later. Failure is logged and simply leaves the app link hidden.
    void submitLead(details, ref).then((r) => setLanding(r?.landingUrl));
  };


  return (
    <section id="lead-form" className="shell scroll-mt-28 py-16 sm:py-24">
      <div className="grid items-center gap-12 sm:gap-14 md:grid-cols-[1fr_18rem] lg:grid-cols-[1fr_20.7rem]">
        {/* Left: copy + assurances */}
        <div className="flex flex-col gap-10">
          <Reveal className="text-left">
            <div>
              <span className="eyebrow flex-wrap">{t.eyebrow}</span>
              <h2 className="mt-5 text-3xl font-extrabold leading-[1.12] tracking-tight sm:text-4xl lg:text-5xl">
                {t.headingLine1}
                <br />
                <span className="text-gradient">{t.headingHighlight}</span>
              </h2>
              <p className="text-muted-foreground mt-6 max-w-xl text-base font-medium leading-relaxed sm:text-lg">
                {t.subhead}
              </p>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <div className="bg-muted/60 border-border/60 flex items-center gap-4 rounded-2xl border px-5 py-4">
              <span className="bg-card grid h-11 w-11 shrink-0 place-items-center rounded-full shadow-[var(--shadow-float)]">
                <LockKeyhole className="text-primary h-5 w-5" />
              </span>
              <p className="min-w-0 text-sm font-semibold sm:text-base">{t.encryptedNote}</p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2">
            {t.assurances.map((a, i) => (
              <Reveal key={a.title} delay={120 + i * 80}>
                <Tile icon={assuranceIcons[i % assuranceIcons.length]!} {...a} />
              </Reveal>
            ))}
          </div>
        </div>

        {/* Right: phone */}
        <Reveal delay={140} className="min-w-0">
          <PhoneShell>
            <div className="relative h-full overflow-hidden">
              <div
                className="flex h-full w-[200%] transition-transform duration-[700ms] ease-[cubic-bezier(0.22,0.9,0.3,1)]"
                style={{ transform: matched ? "translateX(-50%)" : "translateX(0%)" }}
              >
                {/* Panel 1: form */}
                <div className="h-full w-1/2 shrink-0 px-0.5" aria-hidden={matched}>
                  <form ref={formRef} onSubmit={onSubmit} className="flex h-full flex-col">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="min-w-0 text-sm font-extrabold leading-snug tracking-tight">
                        {t.formTitle}
                      </h3>
                      <span className="bg-success-soft text-success shrink-0 rounded-full px-2 py-1 text-[9px] font-bold leading-tight tracking-wide uppercase">
                        {t.softCheckBadge}
                      </span>
                    </div>

                    <div className="mt-3 flex min-h-0 flex-1 flex-col justify-between gap-2.5">
                      <label className="group/input block min-w-0">
                        <Label text={t.loanTypeLabel} required />
                        <div className="input-interactive relative mt-1.5 flex items-center rounded-xl">
                          <select
                            required
                            name="loanType"
                            defaultValue=""
                            onFocus={() => handleFocus("loan-type")}
                            onBlur={handleBlur}
                            className="field-input h-9 w-full cursor-pointer appearance-none rounded-xl border-0 pl-3 pr-9 text-xs font-bold outline-none"
                          >
                            <option value="" disabled>
                              {t.loanTypePlaceholder}
                            </option>
                            {/* Explicit, language-independent values.
                                Without them an <option>'s value is its own
                                TRANSLATED text, so the lead posted to the API
                                carried product="वयक्तिगत" in Hindi, and the
                                voice agent could never select an option either
                                (it sends the canonical English name). */}
                            <option value="Personal Loan">{t.loanTypePersonal}</option>
                            <option value="Business Loan">{t.loanTypeBusiness}</option>
                          </select>
                          <ChevronDown
                            className="text-foreground/80 pointer-events-none absolute right-3 h-4 w-4"
                            strokeWidth={3}
                          />
                        </div>

                      </label>

                      <Input
                        label={t.amountLabel}
                        placeholder={t.amountPlaceholder}
                        type="text"
                        required
                        name="amount"
                        focusedField={focusedField}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        invite
                        numeric
                        maxLength={9}
                        pattern="[0-9]{4,9}"
                        title={t.amountTitle}
                        prefix="₹"
                        demoValue="250000"

                      />

                      <Input
                        label={t.fullNameLabel}
                        placeholder={t.fullNamePlaceholder}
                        required
                        name="fullName"
                        focusedField={focusedField}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        maxLength={60}
                        minLength={2}
                        pattern="[A-Za-z][A-Za-z .'-]{1,59}"
                        title={t.fullNameTitle}
                        autoComplete="name"
                        icon={User}

                      />
                      <Input
                        label={t.cityLabel}
                        placeholder={t.cityPlaceholder}
                        required
                        name="city"
                        focusedField={focusedField}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        maxLength={40}
                        minLength={2}
                        pattern="[A-Za-z][A-Za-z .'-]{1,39}"
                        title={t.cityTitle}
                        autoComplete="address-level2"
                        icon={MapPin}

                      />

                      <Input
                        label={t.mobileLabel}
                        placeholder={t.mobilePlaceholder}
                        type="tel"
                        required
                        name="mobile"
                        focusedField={focusedField}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        numeric
                        maxLength={10}
                        minLength={10}
                        pattern="[6-9][0-9]{9}"
                        title={t.mobileTitle}
                        autoComplete="tel-national"
                        icon={Phone}

                      />
                      <Input
                        label={t.emailLabel}
                        placeholder={t.emailPlaceholder}
                        type="email"
                        required
                        name="email"
                        focusedField={focusedField}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        maxLength={254}
                        pattern="[^@\s]+@[^@\s]+\.[A-Za-z]{2,}"
                        title={t.emailTitle}
                        autoComplete="email"
                        icon={Mail}
                      />


                      <label
                        className={`mt-auto flex cursor-pointer items-start gap-2 rounded-xl border-[1.5px] p-2.5 transition-all duration-300 hover:shadow-[var(--shadow-soft)] active:scale-[0.98] ${
                          consent
                            ? "border-success/40 bg-success-soft"
                            : "border-[#CBD5E1] bg-[#F8FAFC] hover:border-success/50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={consent}
                          onChange={(e) => setConsent(e.target.checked)}
                          className="peer sr-only"
                        />
                        <span
                          className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border-2 transition-all duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 ${
                            consent
                              ? "border-info bg-primary text-primary-foreground"
                              : "border-[#94A3B8] bg-background"
                          }`}
                        >
                          {consent && <Check className="h-3 w-3" strokeWidth={3.5} />}
                        </span>

                        <span className="text-foreground text-[10px] leading-snug font-semibold">
                          {t.consentText}{" "}
                          <span className="text-primary font-bold underline">{t.consentTerms}</span>{" "}
                          {t.consentAnd}{" "}
                          <span className="text-primary font-bold underline">
                            {t.consentPrivacy}
                          </span>
                          .
                        </span>
                      </label>

                      <div className="mb-1 flex shrink-0 items-center gap-2">
                        <button
                          type="submit"
                          className="bg-brand-gradient text-primary-foreground cta-pulse inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-center text-xs font-bold sm:text-sm shadow-[var(--shadow-float)] transition-transform duration-200 hover:-translate-y-0.5 hover:scale-[1.02] active:scale-[0.96]"
                        >
                          <span className="min-w-0 leading-snug">{t.submitCta}</span>
                          <ArrowRight className="h-4 w-4 shrink-0" />
                        </button>
                      </div>

                    </div>
                  </form>
                </div>

                {/* Panel 2: success */}
                <div className="h-full w-1/2 shrink-0" aria-hidden={!matched}>
                  <SuccessView seconds={seconds} active={matched} t={t} landing={landing} />
                </div>
              </div>

              {matched && <Confetti />}
            </div>
          </PhoneShell>


        </Reveal>
      </div>
    </section>
  );
}

const confettiColors = [
  "var(--success)",
  "var(--warning)",
  "var(--primary)",
  "var(--info)",
  "var(--danger)",
];

function Confetti() {
  const pieces = Array.from({ length: 34 }, (_, i) => i);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {pieces.map((i) => {
        const left = (i * 37) % 100;
        const dx = ((i % 7) - 3) * 18;
        const delay = (i % 10) * 90;
        const w = i % 3 === 0 ? 4 : 6;
        const h = i % 4 === 0 ? 10 : 6;
        return (
          <span
            key={i}
            className="confetti-piece"
            style={{
              left: `${left}%`,
              width: `${w}px`,
              height: `${h}px`,
              background: confettiColors[i % confettiColors.length],
              animationDelay: `${delay}ms`,
              ["--dx" as string]: `${dx}px`,
              ["--rot" as string]: `${360 + (i % 5) * 180}deg`,
            }}
          />
        );
      })}
    </div>
  );
}

function SuccessView({
  seconds,
  active,
  t,
  landing,
}: {
  seconds: number;
  active: boolean;
  t: LeadFormText;
  /** Context link from /api/context/create — carries this lead's token so the
   *  app resumes with their details already filled in. Falls back to the plain
   *  store URL while the request is in flight or if it failed. */
  landing?: string;
}) {
  const target = landing || appStoreUrl;
  const qr = qrFor(target);
  const step = (i: number) =>
    active ? { animationDelay: `${300 + i * 110}ms` } : { opacity: 0 };
  const cls = active ? "animate-rise-in" : "opacity-0";

  return (
    <div className="flex h-full flex-col">
      <div className="flex justify-center">
        <span
          className={`bg-success-soft text-success relative rounded-full px-4 py-1.5 text-xs font-bold tracking-[0.1em] uppercase ${active ? "animate-pop-in" : "opacity-0"}`}
          style={active ? { animationDelay: "200ms" } : { opacity: 0 }}
        >
          <span className="bg-success/25 absolute inset-0 -z-10 rounded-full animate-soft-ping" />
          {t.matchedBadge}
        </span>
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col text-center">
        <h3 className={`text-lg font-extrabold leading-snug tracking-tight ${cls}`} style={step(0)}>
          {t.successTitle}
        </h3>
        <p className={`text-muted-foreground mt-2 text-xs font-semibold leading-snug ${cls}`} style={step(1)}>
          {t.successBody}
        </p>

        <p
          className={`text-muted-foreground mt-3 text-[11px] font-bold tracking-[0.12em] uppercase ${cls}`}
          style={step(2)}
        >
          {t.scanPrompt}
        </p>
        <div
          className={`border-border bg-background mt-2 grid flex-1 place-items-center rounded-2xl border p-2 ${active ? "animate-pop-in" : "opacity-0"}`}
          style={active ? { animationDelay: "620ms" } : { opacity: 0 }}
        >
          <img
            src={qr}
            alt={t.qrAlt}
            width={180}
            height={180}
            className="h-full max-h-28 w-auto"
          />
          <QrCode className="sr-only" />
        </div>

        <div className={`my-2.5 flex items-center gap-2 ${cls}`} style={step(4)}>
          <span className="bg-border h-px flex-1" />
          <span className="text-muted-foreground text-xs font-semibold">{t.or}</span>
          <span className="bg-border h-px flex-1" />
        </div>

        <a
          href={target}
          className={`bg-brand-gradient text-primary-foreground inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-bold shadow-[var(--shadow-float)] transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.97] ${cls}`}
          style={step(5)}
        >
          <span className="min-w-0 leading-snug">{t.openAppStore}</span>
          <ArrowRight className="h-5 w-5 shrink-0" />
        </a>

        <p className={`text-foreground mt-3 text-sm font-bold leading-snug ${cls}`} style={step(6)}>
          {t.redirectingPrefix}{" "}
          <span key={seconds} className="animate-pop-in text-primary inline-block font-extrabold">
            {seconds}s
          </span>
          …
        </p>
        <a
          href={target}
          className={`text-primary mt-1 mb-5 text-sm font-bold underline decoration-2 underline-offset-2 ${cls}`}
          style={step(7)}
        >
          {t.notRedirected}
        </a>


        <div
          className={`bg-muted/60 border-border/60 mt-auto flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left ${cls}`}
          style={step(8)}

        >
          <LockKeyhole className="text-primary h-4 w-4 shrink-0" />
          <span className="text-xs font-semibold leading-snug">
            {t.savedSecurely}
          </span>
        </div>
      </div>
    </div>

  );
}


function Tile({ icon: Icon, title, body }: { icon: React.ComponentType<{ className?: string }>; title: string; body: string }) {
  return (
    <div className="glass lift flex h-full items-start gap-4 rounded-3xl p-5">
      <span className="bg-brand-gradient text-primary-foreground grid h-10 w-10 shrink-0 place-items-center rounded-2xl shadow-[var(--shadow-soft)]">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-base font-extrabold leading-tight">{title}</p>
        <p className="text-muted-foreground mt-1 text-sm font-medium leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

function PhoneShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto w-[min(100%,18rem)] lg:w-[min(100%,19.8rem)]">
      <div className="bg-brand-gradient absolute -inset-4 rounded-[3.5rem] opacity-15 blur-3xl" />

      {/* side buttons */}
      <div className="bg-foreground/25 absolute top-[19%] -left-[3px] h-[6%] w-[3px] rounded-l-full" />
      <div className="bg-foreground/25 absolute top-[28%] -left-[3px] h-[9%] w-[3px] rounded-l-full" />
      <div className="bg-foreground/25 absolute top-[40%] -left-[3px] h-[9%] w-[3px] rounded-l-full" />
      <div className="bg-foreground/25 absolute top-[30%] -right-[3px] h-[13%] w-[3px] rounded-r-full" />

      {/* iPhone 15 Pro ratio: 393 x 852 CSS px */}
      <div className="bg-foreground relative aspect-[393/852] rounded-[2.9rem] p-[3px] shadow-[var(--shadow-float)]">
        <div className="bg-card h-full rounded-[2.75rem] p-2">
          <div className="bg-background relative flex h-full flex-col overflow-hidden rounded-[2.3rem]">
            {/* status bar + dynamic island */}
            <div className="relative flex shrink-0 items-center justify-between px-4 pt-3 pb-1">
              <span className="text-[11px] font-bold">9:41</span>
              <div className="bg-foreground absolute top-2 left-1/2 flex h-5 w-[4.5rem] -translate-x-1/2 items-center justify-end rounded-full pr-1.5">
                <span className="bg-background/30 h-2 w-2 rounded-full" />
              </div>
              <div className="text-foreground flex items-center gap-1">
                <SignalHigh className="h-3.5 w-3.5" />
                <Wifi className="h-3.5 w-3.5" />
                <BatteryFull className="h-3.5 w-3.5" />
              </div>
            </div>

            <div className="min-h-0 flex-1 px-3.5 pt-2 pb-2">{children}</div>

            {/* home indicator */}
            <div className="flex shrink-0 justify-center pb-2">
              <span className="bg-foreground/25 h-1 w-24 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


function Label({ text, required }: { text: string; required?: boolean | undefined }) {
  return (
    <span className="text-muted-foreground text-[10px] font-bold tracking-[0.12em] uppercase">
      {text} {required && <span className="text-danger">*</span>}
    </span>
  );
}

function Input({
  label,
  placeholder,
  type = "text",
  required,
  name,
  focusedField,
  onFocus,
  onBlur,
  invite,
  numeric,
  maxLength,
  minLength,
  pattern,
  title,
  min,
  max,
  autoComplete,
  icon: Icon,
  prefix,
  demoValue,
}: {
  label: string;
  placeholder: string;
  type?: string;
  required?: boolean;
  name: string;
  focusedField: string | null;
  onFocus: (name: string) => void;
  onBlur: () => void;
  invite?: boolean;
  numeric?: boolean;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  title?: string;
  min?: number;
  max?: number;
  autoComplete?: string;
  icon?: LucideIcon;
  prefix?: string;
  demoValue?: string;
}) {
  const isActive = focusedField === name;
  const [showDemoCaret, setShowDemoCaret] = useState(Boolean(demoValue));
  const handleInput = (e: React.FormEvent<HTMLInputElement>) => {
    setShowDemoCaret(false);
    if (!numeric) return;
    const el = e.currentTarget;
    let v = el.value.replace(/\D/g, "");
    if (maxLength) v = v.slice(0, maxLength);
    if (el.value !== v) el.value = v;
  };
  const hasLead = Boolean(Icon || prefix);
  return (
    <label className="group/input block min-w-0 cursor-text">
      <Label text={label} required={required} />
      <div
        className={`input-interactive relative mt-1.5 flex items-center rounded-xl ${
          isActive ? "border-primary" : ""
        } ${invite && !isActive ? "animate-input-invite" : ""}`}
      >
        {prefix ? (
          <span className="text-foreground/70 pointer-events-none absolute left-3 text-xs font-extrabold">
            {prefix}
          </span>
        ) : Icon ? (
          <Icon className="text-primary/70 pointer-events-none absolute left-3 h-3.5 w-3.5" strokeWidth={2.4} />
        ) : null}
        <input
          name={name}
          required={required}
          type={type}
          placeholder={placeholder}
          onFocus={() => onFocus(name)}
          onBlur={onBlur}
          onInput={handleInput}
          {...(numeric ? { inputMode: "numeric" as const } : {})}
          {...(maxLength ? { maxLength } : {})}
          {...(minLength ? { minLength } : {})}
          {...(pattern ? { pattern } : {})}
          {...(title ? { title } : {})}
          {...(min !== undefined ? { min } : {})}
          {...(max !== undefined ? { max } : {})}
          {...(autoComplete ? { autoComplete } : {})}
          className={`field-input h-9 w-full cursor-text rounded-xl border-0 pr-3 text-xs font-bold outline-none ${
            demoValue && showDemoCaret ? (hasLead ? "pl-10" : "pl-5") : hasLead ? "pl-8" : "pl-3"
          }`}

        />
        {demoValue && showDemoCaret && (
          <span
            className={`pointer-events-none absolute inset-y-0 flex items-center ${
              hasLead ? "left-8" : "left-3"
            }`}
            aria-hidden
          >
            <span className="bg-primary animate-typing-cursor inline-block h-4 w-[1.5px]" />
          </span>
        )}

      </div>
    </label>
  );
}



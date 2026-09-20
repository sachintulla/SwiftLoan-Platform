'use client';

import { AccountShell } from '@/components/apply/AccountShell';
import { Card, SectionLabel } from '@/components/apply/primitives';

const TOPICS = [
  { icon: '💳', title: 'Repayments', sub: 'EMI & prepayment' },
  { icon: '📄', title: 'Documents', sub: 'KYC & proofs' },
  { icon: '🛡', title: 'Privacy & data', sub: 'How we use your data' },
  { icon: '🏦', title: 'Disbursement', sub: 'When funds arrive' },
];

export default function SupportPage() {
  return (
    <AccountShell>
      <h1 className="text-2xl font-extrabold">How can we help?</h1>
      <input
        placeholder="Search for help..."
        className="input-interactive field-input mt-4 h-11 w-full rounded-xl px-3.5 text-sm"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground font-semibold">Popular:</span>
        {['Repayment', 'Privacy', 'Fees'].map((p) => (
          <span key={p} className="bg-accent text-primary rounded-full px-3 py-1 font-semibold">
            {p}
          </span>
        ))}
      </div>

      <div className="bg-deep-gradient mt-6 rounded-2xl p-6 text-white">
        <span className="bg-mint inline-block rounded-full px-2.5 py-1 text-[10px] font-extrabold">⚡ AI-POWERED</span>
        <h2 className="mt-3 text-lg font-extrabold">Chat with Ruby</h2>
        <p className="mt-1.5 text-xs text-white/75">
          Your personal loan assistant — ask about EMIs, documents or your application status, any time.
        </p>
        <div className="mt-4 flex gap-3">
          <button className="text-primary rounded-full bg-white px-4 py-2 text-sm font-bold">Start chat →</button>
          <button className="rounded-full border border-white/30 px-4 py-2 text-sm font-bold">Past tickets</button>
        </div>
      </div>

      <Card className="mt-6">
        <div className="flex items-center gap-2.5">
          <span className="bg-accent grid h-10 w-10 place-items-center rounded-xl">⚖️</span>
          <strong>Grievance Redressal</strong>
        </div>
        <p className="text-muted-foreground mt-2.5 text-xs leading-relaxed">
          Not satisfied with a resolution? File a formal grievance and our nodal officer will respond directly.
        </p>
        <div className="bg-muted mt-3 flex justify-between rounded-lg px-3.5 py-2.5 text-xs">
          <span className="text-muted-foreground">Response time</span>
          <strong>Within 24 hours</strong>
        </div>
        <button className="border-border mt-3 w-full rounded-full border py-2.5 text-sm font-bold">File a grievance</button>
      </Card>

      <div className="mt-6">
        <SectionLabel>Browse topics</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          {TOPICS.map((t) => (
            <Card key={t.title}>
              <span className="bg-accent grid h-9 w-9 place-items-center rounded-lg">{t.icon}</span>
              <div className="mt-2 text-sm font-bold">{t.title}</div>
              <div className="text-muted-foreground text-xs">{t.sub}</div>
            </Card>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <SectionLabel>Contact us</SectionLabel>
        <div className="flex flex-col gap-2.5">
          <Card className="flex items-center gap-3.5">
            <span className="bg-accent grid h-9 w-9 place-items-center rounded-lg">📞</span>
            <div>
              <div className="text-sm font-bold">Call us</div>
              <div className="text-muted-foreground text-xs">1800-123-4567 (toll-free)</div>
            </div>
          </Card>
          <Card className="flex items-center gap-3.5">
            <span className="bg-accent grid h-9 w-9 place-items-center rounded-lg">✉️</span>
            <div>
              <div className="text-sm font-bold">Email us</div>
              <div className="text-muted-foreground text-xs">support@swiftloan.app</div>
            </div>
          </Card>
        </div>
      </div>
    </AccountShell>
  );
}

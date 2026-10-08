import '@/app/theme.css'; // --sl-* tokens the legal-page stylesheet depends on
import '@/app/privacypolicy/privacypolicy.css';

/**
 * Wraps a legal page in the website's own `.compliancePage` styling (dark hero
 * banner, white section cards) for use inside the dashboard shell. The site's
 * page-level background / min-height / nav bar are dropped — the dashboard
 * provides those — and the hero is rounded on all corners since it isn't
 * hanging off a header here.
 */
export function LegalPage({
  title,
  intro,
  updated,
  children,
}: {
  title: string;
  intro: string;
  updated?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="compliancePage" style={{ minHeight: 'auto', background: 'transparent', paddingBottom: 0 }}>
      <div className="head" style={{ borderRadius: 28, padding: '38px 0 34px', marginBottom: 28 }}>
        <div className="wrap" style={{ padding: '0 30px' }}>
          <span className="eyebrow">Legal</span>
          <h1>{title}</h1>
          <p>{intro}</p>
          {updated && <div className="updated">{updated}</div>}
        </div>
      </div>
      <div className="wrap" style={{ padding: 0, maxWidth: 'none' }}>
        {children}
      </div>
    </div>
  );
}

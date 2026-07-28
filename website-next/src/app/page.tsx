'use client';

import Link from 'next/link';
import SiteScripts from '@/components/SiteScripts';
import VoiceWidget from '@/components/VoiceWidget';

export default function HomePage() {
  return (
    <>
      {/* ============ TOP DISCLAIMER STRIP ============ */}
      <div className="topbar">
        <span className="msi">verified_user</span>
        SwiftLoan.ai is a loan aggregator &amp; matchmaking platform — we connect you with RBI-registered lending partners. We do not lend directly.
      </div>

      {/* ============ NAVBAR ============ */}
      <header className="nav" id="nav">
        <div className="container nav__inner">
          <a href="#top" className="brand" aria-label="SwiftLoan.ai home">
            <span className="brand__mark" aria-hidden="true">
              <svg width="30" height="30" viewBox="0 0 120 120" fill="none">
                <g stroke="#fff" strokeLinecap="round">
                  <line x1="16" y1="43" x2="40" y2="43" strokeWidth="6" opacity=".32" />
                  <line x1="12" y1="60" x2="38" y2="60" strokeWidth="6" opacity=".55" />
                  <line x1="18" y1="77" x2="42" y2="77" strokeWidth="6" opacity=".82" />
                </g>
                <g transform="skewX(-7)">
                  <text x="82" y="87" textAnchor="middle" fill="#fff" fontFamily="'Public Sans',Arial,sans-serif" fontSize="84" fontWeight="800">
                    &#8377;
                  </text>
                </g>
              </svg>
            </span>
            <span className="brand__name">
              <span className="brand__swift">Swift</span>Loan<span className="brand__ai">.ai</span>
            </span>
          </a>

          <nav className="nav__links" id="navLinks" aria-label="Primary">
            <a href="#services" data-i18n="nav.loans">Loans</a>
            <a href="#how" data-i18n="nav.how">How it works</a>
            <a href="#calculator" data-i18n="nav.emi">EMI Calculator</a>
            <a href="#track" data-i18n="nav.track">Track application</a>
            <a href="#partners" data-i18n="nav.partners">Partners</a>
            <a href="#compliance" data-i18n="nav.compliance">Compliance</a>
            <a href="#faq" data-i18n="nav.faq">FAQs</a>
            <a href="#apply" className="btn btn--primary nav__cta-mobile" data-i18n="nav.getStarted">Get started</a>
          </nav>

          <div className="nav__actions">
            <div className="langtoggle" role="group" aria-label="Language">
              <button className="langtoggle__btn is-active" data-lang="EN">EN</button>
              <button className="langtoggle__btn" data-lang="HI">HI</button>
            </div>
            <a href="#apply" className="btn btn--primary" data-i18n="nav.checkRate">
              Check your rate <span className="msi">arrow_forward</span>
            </a>
            <button className="nav__toggle" id="navToggle" aria-label="Toggle menu" aria-expanded="false">
              <span></span><span></span><span></span>
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* ============ HERO ============ */}
        <section className="hero">
          <div className="container hero__grid">
            <div className="hero__copy">
              <span className="pill">
                <span className="msi msi--fill">bolt</span>{' '}
                <span data-i18n="hero.pill">AI lender matching · Approvals in minutes</span>
              </span>
              <h1 className="hero__title">
                <span data-i18n="hero.title1">Smarter borrowing,</span>
                <br />
                <span className="grad-text" data-i18n="hero.title2">matched to the right lender.</span>
              </h1>
              <p className="hero__sub" data-i18n="hero.sub">
                SwiftLoan.ai reads your profile, checks eligibility across dozens of RBI-registered
                lenders, and matches you with the offer you&apos;re most likely to get approved for —
                personal or business. No guesswork. No spam calls. Full control of your data.
              </p>

              <div className="hero__cta">
                <a href="#apply" className="btn btn--primary btn--lg" data-i18n="hero.cta1">
                  Check your eligibility <span className="msi">arrow_forward</span>
                </a>
                <a href="#calculator" className="btn btn--secondary btn--lg">
                  <span className="msi">calculate</span> <span data-i18n="hero.cta2">Calculate my EMI</span>
                </a>
              </div>

              <ul className="hero__trust">
                <li>
                  <span className="msi">shield</span>
                  <div>
                    <strong data-i18n="hero.trust1">Soft check</strong>
                    <span data-i18n="hero.trust1s">No impact on credit score</span>
                  </div>
                </li>
                <li>
                  <span className="msi">speed</span>
                  <div>
                    <strong data-i18n="hero.trust2">3 min</strong>
                    <span data-i18n="hero.trust2s">Average application time</span>
                  </div>
                </li>
                <li>
                  <span className="msi">lock</span>
                  <div>
                    <strong data-i18n="hero.trust3">256-bit</strong>
                    <span data-i18n="hero.trust3s">Bank-grade encryption</span>
                  </div>
                </li>
              </ul>
            </div>

            <div className="hero__visual">
              <div className="glass float-card--main">
                <div className="fc__head">
                  <span className="fc__dot"></span> <span data-i18n="fc.match">Your best match found</span>
                </div>
                <div className="fc__amount">
                  ₹5,00,000<span data-i18n="fc.limit">approved limit</span>
                </div>
                <div className="fc__stats">
                  <div className="fc__stat">
                    <span data-i18n="fc.rate">Interest rate</span><b>from 10.49%</b>
                  </div>
                  <div className="fc__stat">
                    <span data-i18n="fc.tenure">Tenure</span><b>up to 60 mo</b>
                  </div>
                </div>
                <div className="fc__bar"><i style={{ width: '82%' }}></i></div>
                <div className="fc__match">
                  <span className="fc__score">92%</span> <span data-i18n="fc.conf">match confidence</span>
                </div>
                <a href="#apply" className="btn btn--primary btn--block" data-i18n="fc.accept">
                  Accept &amp; continue <span className="msi">arrow_forward</span>
                </a>
              </div>

              <div className="glass float-card--mini fc-mini-1">
                <span className="icon-tile icon-tile--teal"><span className="msi msi--fill">account_balance</span></span>
                <div>
                  <b data-i18n="fc.lenders">18 lenders</b>
                  <span data-i18n="fc.checked">checked instantly</span>
                </div>
              </div>
              <div className="glass float-card--mini fc-mini-2">
                <span className="icon-tile icon-tile--green"><span className="msi msi--fill">verified_user</span></span>
                <div>
                  <b data-i18n="fc.consent">Consent-first</b>
                  <span data-i18n="fc.consentSub">You approve every share</span>
                </div>
              </div>
            </div>
          </div>

          {/* trust logo strip */}
          <div className="container">
            <div className="logostrip">
              <span className="logostrip__label">Powering loan journeys with</span>
              <div className="logostrip__row">
                <span><span className="msi">account_balance</span> NBFC Partners</span>
                <span><span className="msi">api</span> Banking APIs</span>
                <span><span className="msi">hub</span> Account Aggregator</span>
                <span><span className="msi">analytics</span> Credit Bureaus</span>
                <span><span className="msi">badge</span> eKYC / DigiLocker</span>
                <span><span className="msi">payments</span> UPI AutoPay</span>
              </div>
            </div>
          </div>
        </section>

        {/* ============ STATS BAND ============ */}
        <section className="stats" aria-label="Key metrics">
          <div className="container stats__grid">
            <div className="stat">
              <div className="stat__num" data-count="2400" data-suffix="Cr+">₹0</div>
              <div className="stat__label" data-i18n="stats.1">Loan value facilitated</div>
            </div>
            <div className="stat">
              <div className="stat__num" data-count="18" data-suffix="+">0</div>
              <div className="stat__label" data-i18n="stats.2">Lending partners</div>
            </div>
            <div className="stat">
              <div className="stat__num" data-count="94" data-suffix="%">0</div>
              <div className="stat__label" data-i18n="stats.3">Match acceptance rate</div>
            </div>
            <div className="stat">
              <div className="stat__num" data-count="500000" data-suffix="+">0</div>
              <div className="stat__label" data-i18n="stats.4">Customers served</div>
            </div>
          </div>
        </section>

        {/* ============ SERVICES ============ */}
        <section className="section" id="services">
          <div className="container">
            <div className="section__head">
              <span className="eyebrow" data-i18n="sec.services.ey">What we offer</span>
              <h2 data-i18n="sec.services.h">One platform. The right loan for every goal.</h2>
              <p className="section__lead" data-i18n="sec.services.lead">
                Whether it&apos;s a personal milestone or fuelling your business, our AI finds the offer that fits your profile and your repayment comfort.
              </p>
            </div>

            <div className="services__grid">
              {/* Personal */}
              <article className="glass svc-card">
                <div className="svc-card__top">
                  <span className="icon-tile icon-tile--teal icon-tile--lg"><span className="msi msi--fill">person</span></span>
                  <span className="tag" data-i18n="svc.personal.tag">For individuals</span>
                </div>
                <h3 data-i18n="svc.personal.title">Personal Loans</h3>
                <p>Instant, collateral-free funds for the moments that matter — weddings, medical needs, travel, education, or consolidating debt.</p>
                <ul className="svc-card__list">
                  <li><span className="msi">check_circle</span> ₹50,000 – ₹25,00,000 loan amounts</li>
                  <li><span className="msi">check_circle</span> Interest from 10.49% p.a.</li>
                  <li><span className="msi">check_circle</span> Flexible tenure: 3 to 60 months</li>
                  <li><span className="msi">check_circle</span> 100% paperless eKYC &amp; disbursal</li>
                </ul>
                <div className="svc-card__uses">
                  <span><span className="msi">celebration</span> Wedding</span>
                  <span><span className="msi">local_hospital</span> Medical</span>
                  <span><span className="msi">flight</span> Travel</span>
                  <span><span className="msi">school</span> Education</span>
                  <span><span className="msi">credit_card</span> Debt consolidation</span>
                </div>
                <a href="#apply" data-loan="Personal Loan" className="btn btn--primary btn--block" data-i18n="svc.personal.cta">
                  Check my personal loan offer <span className="msi">arrow_forward</span>
                </a>
              </article>

              {/* Business */}
              <article className="glass svc-card svc-card--feat">
                <span className="ribbon" data-i18n="svc.business.ribbon">Most popular</span>
                <div className="svc-card__top">
                  <span className="icon-tile icon-tile--green icon-tile--lg"><span className="msi msi--fill">storefront</span></span>
                  <span className="tag tag--green" data-i18n="svc.business.tag">For businesses</span>
                </div>
                <h3 data-i18n="svc.business.title">Business Loans</h3>
                <p>Working capital and growth funding for MSMEs, startups and self-employed professionals — matched to your cash-flow reality.</p>
                <ul className="svc-card__list">
                  <li><span className="msi">check_circle</span> ₹1,00,000 – ₹75,00,000 funding</li>
                  <li><span className="msi">check_circle</span> Rates tailored to vintage &amp; turnover</li>
                  <li><span className="msi">check_circle</span> Tenure: 6 to 48 months</li>
                  <li><span className="msi">check_circle</span> GST &amp; bank-statement assessment</li>
                </ul>
                <div className="svc-card__uses">
                  <span><span className="msi">inventory_2</span> Inventory</span>
                  <span><span className="msi">receipt_long</span> Working capital</span>
                  <span><span className="msi">construction</span> Equipment</span>
                  <span><span className="msi">trending_up</span> Expansion</span>
                  <span><span className="msi">groups</span> Payroll</span>
                </div>
                <a href="#apply" data-loan="Business Loan" className="btn btn--primary btn--block" data-i18n="svc.business.cta">
                  Check my business loan offer <span className="msi">arrow_forward</span>
                </a>
              </article>
            </div>
          </div>
        </section>

        {/* ============ GOALS / JOURNEY ============ */}
        <section className="section" id="how">
          <div className="container">
            <div className="section__head">
              <span className="eyebrow" data-i18n="sec.how.ey">Your journey</span>
              <h2 data-i18n="sec.how.h">From goal to disbursal in four simple steps</h2>
              <p className="section__lead" data-i18n="sec.how.lead">
                We designed the whole flow around one idea: you should always know what&apos;s happening and why.
              </p>
            </div>

            <ol className="journey">
              <li className="glass journey__step">
                <div className="journey__num">01</div>
                <h3 data-i18n="how.1t">Tell us your goal</h3>
                <p>Pick personal or business, your amount and purpose. Takes under a minute — no documents yet.</p>
              </li>
              <li className="glass journey__step">
                <div className="journey__num">02</div>
                <h3 data-i18n="how.2t">Get instantly qualified</h3>
                <p>Our AI runs a soft eligibility check across our lender network. Zero impact on your credit score.</p>
              </li>
              <li className="glass journey__step">
                <div className="journey__num">03</div>
                <h3 data-i18n="how.3t">Compare matched offers</h3>
                <p>See personalised offers ranked by approval confidence, rate and EMI — you choose what fits.</p>
              </li>
              <li className="glass journey__step">
                <div className="journey__num">04</div>
                <h3 data-i18n="how.4t">eKYC &amp; get funded</h3>
                <p>Complete paperless verification and consent. Approved funds land directly in your bank account.</p>
              </li>
            </ol>
          </div>
        </section>

        {/* ============ AI QUALIFICATION / MATCHING ============ */}
        <section className="section" id="ai">
          <div className="container ai__grid">
            <div className="ai__copy">
              <span className="eyebrow" data-i18n="sec.ai.ey">The intelligence layer</span>
              <h2 data-i18n="sec.ai.h">Intelligent qualification &amp; lender matching</h2>
              <p className="section__lead" data-i18n="sec.ai.lead">
                Applying to lenders one by one hurts your credit score and wastes time. SwiftLoan.ai flips the model — we assess you once, then match you to lenders whose criteria you actually meet.
              </p>

              <div className="ai__feats">
                <div className="ai__feat">
                  <span className="icon-tile icon-tile--teal"><span className="msi msi--fill">ads_click</span></span>
                  <div><h4 data-i18n="ai.1t">Approval-first matching</h4><p>We rank lenders by your real likelihood of approval, not by who pays us the most.</p></div>
                </div>
                <div className="ai__feat">
                  <span className="icon-tile icon-tile--green"><span className="msi msi--fill">insights</span></span>
                  <div><h4 data-i18n="ai.2t">Multi-signal underwriting</h4><p>Income, cash-flow, bureau data and Account Aggregator signals — analysed in seconds.</p></div>
                </div>
                <div className="ai__feat">
                  <span className="icon-tile icon-tile--teal"><span className="msi msi--fill">shield</span></span>
                  <div><h4 data-i18n="ai.3t">Soft-check protection</h4><p>Eligibility is checked with soft pulls, so shopping for the best rate never dents your score.</p></div>
                </div>
                <div className="ai__feat">
                  <span className="icon-tile icon-tile--green"><span className="msi msi--fill">balance</span></span>
                  <div><h4 data-i18n="ai.4t">Transparent ranking</h4><p>Every offer shows the rate, fees, EMI and total cost up-front. No hidden surprises.</p></div>
                </div>
              </div>
            </div>

            <div className="ai__panel">
              <div className="glass match-demo">
                <div className="match-demo__head">
                  <span><span className="msi msi--fill">smart_toy</span> Matching engine</span>
                  <span className="live"><span className="live__dot"></span> live</span>
                </div>
                <div className="match-demo__profile">
                  <span className="mdp__avatar">RS</span>
                  <div><b>Profile analysed</b><span>Income · Bureau · Bank flow · GST</span></div>
                  <span className="mdp__ok msi msi--fill">check_circle</span>
                </div>
                <div className="match-list" id="matchList">
                  <div className="match-row"><span className="ml__bank">Aditya Finance</span><span className="ml__rate">10.49%</span><span className="ml__score high">96%</span></div>
                  <div className="match-row"><span className="ml__bank">MetroCredit NBFC</span><span className="ml__rate">11.25%</span><span className="ml__score high">91%</span></div>
                  <div className="match-row"><span className="ml__bank">Prime Capital</span><span className="ml__rate">12.10%</span><span className="ml__score mid">78%</span></div>
                  <div className="match-row"><span className="ml__bank">UrbanLend</span><span className="ml__rate">13.00%</span><span className="ml__score mid">64%</span></div>
                </div>
                <p className="match-demo__foot">Ranked by approval confidence · updated in real time</p>
              </div>
            </div>
          </div>
        </section>

        {/* ============ EMI CALCULATOR ============ */}
        <section className="section section--dark" id="calculator">
          <div className="container">
            <div className="section__head section__head--light">
              <span className="eyebrow eyebrow--light" data-i18n="sec.calc.ey">Plan with clarity</span>
              <h2 data-i18n="sec.calc.h">EMI Calculator</h2>
              <p className="section__lead" data-i18n="sec.calc.lead">
                Know your monthly commitment before you apply. Move the sliders to see how amount, rate and tenure change your EMI.
              </p>
            </div>

            <div className="calc">
              <div className="calc__controls">
                <div className="calc__field">
                  <div className="calc__label">
                    <label htmlFor="amount" data-i18n="calc.amount">Loan amount</label>
                    <output id="amountOut">₹5,00,000</output>
                  </div>
                  <input type="range" id="amount" min={50000} max={7500000} step={10000} defaultValue={500000} />
                  <div className="calc__range"><span>₹50K</span><span>₹75L</span></div>
                </div>

                <div className="calc__field">
                  <div className="calc__label">
                    <label htmlFor="rate" data-i18n="calc.rate">Interest rate (p.a.)</label>
                    <output id="rateOut">11.5%</output>
                  </div>
                  <input type="range" id="rate" min={9} max={28} step={0.1} defaultValue={11.5} />
                  <div className="calc__range"><span>9%</span><span>28%</span></div>
                </div>

                <div className="calc__field">
                  <div className="calc__label">
                    <label htmlFor="tenure" data-i18n="calc.tenure">Tenure</label>
                    <output id="tenureOut">36 months</output>
                  </div>
                  <input type="range" id="tenure" min={3} max={60} step={1} defaultValue={36} />
                  <div className="calc__range"><span>3 mo</span><span>60 mo</span></div>
                </div>
              </div>

              <div className="glass calc__result">
                <div className="calc__emi">
                  <span data-i18n="calc.emiLabel">Your monthly EMI</span>
                  <strong id="emiOut">₹16,489</strong>
                </div>
                <div className="calc__donut">
                  <svg viewBox="0 0 120 120" width="150" height="150" aria-hidden="true">
                    <circle cx="60" cy="60" r="52" className="donut-track" />
                    <circle cx="60" cy="60" r="52" className="donut-fill" id="donut" />
                  </svg>
                  <div className="calc__legend">
                    <span><i className="dot dot--p"></i>Principal <b id="principalOut">₹5,00,000</b></span>
                    <span><i className="dot dot--i"></i>Interest <b id="interestOut">₹93,604</b></span>
                  </div>
                </div>
                <div className="calc__total">
                  <span data-i18n="calc.total">Total payable</span><strong id="totalOut">₹5,93,604</strong>
                </div>
                <a href="#apply" className="btn btn--primary btn--block" data-i18n="calc.cta">
                  Get this loan matched <span className="msi">arrow_forward</span>
                </a>
                <p className="calc__note">Indicative only. Actual EMI depends on the lender&apos;s final approved rate &amp; fees.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ============ APPLICATION TRACKING ============ */}
        <section className="section" id="track">
          <div className="container track__grid">
            <div className="track__copy">
              <span className="eyebrow" data-i18n="sec.track.ey">Always in the loop</span>
              <h2 data-i18n="sec.track.h">Track your application in real time</h2>
              <p className="section__lead" data-i18n="sec.track.lead">
                No more wondering &quot;what&apos;s happening with my loan?&quot;. Enter your reference ID to see exactly where you are — from submission to money in the bank.
              </p>

              <form className="track__form" id="trackForm" noValidate>
                <label htmlFor="appId" className="sr-only">Application ID</label>
                <input type="text" id="appId" placeholder="Enter application ID (try SL-2048)" data-i18n-ph="track.ph" autoComplete="off" />
                <button type="submit" className="btn btn--primary" data-i18n="track.btn">
                  <span className="msi">search</span> Track
                </button>
              </form>
              <p className="track__hint">
                Demo IDs: <button className="linkbtn" data-demo="SL-2048">SL-2048</button> · <button className="linkbtn" data-demo="SL-3110">SL-3110</button>
              </p>
            </div>

            <div className="track__panel">
              <div className="glass tracker" id="tracker" aria-live="polite">
                <div className="tracker__empty" id="trackerEmpty">
                  <span className="msi tracker__empty-ic">manage_search</span>
                  <p>Enter an application ID to see live status</p>
                </div>
                <div className="tracker__body" id="trackerBody" hidden>
                  <div className="tracker__meta">
                    <div><span>Application</span><b id="tkId">SL-2048</b></div>
                    <div><span>Type</span><b id="tkType">Personal Loan</b></div>
                    <div><span>Amount</span><b id="tkAmount">₹5,00,000</b></div>
                  </div>
                  <ol className="steps" id="tkSteps"></ol>
                  <div className="tracker__foot" id="tkFoot"></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ PARTNERS ============ */}
        <section className="section" id="partners">
          <div className="container">
            <div className="section__head">
              <span className="eyebrow" data-i18n="sec.partners.ey">Ecosystem</span>
              <h2 data-i18n="sec.partners.h">Built with trusted lending &amp; business partners</h2>
              <p className="section__lead" data-i18n="sec.partners.lead">
                We&apos;re a technology bridge — the actual lending is done by our regulated partners, and we help great businesses embed credit into their platforms.
              </p>
            </div>

            <div className="partners__cols">
              <div className="glass partners__col">
                <span className="icon-tile icon-tile--teal icon-tile--lg"><span className="msi msi--fill">account_balance</span></span>
                <h3 data-i18n="partners.lend.title">For lending partners</h3>
                <p>Reach pre-qualified, intent-rich borrowers and reduce acquisition cost. Our engine sends you only applicants who fit your credit box.</p>
                <ul className="checklist">
                  <li><span className="msi">arrow_forward</span> Pre-filtered, consented applications</li>
                  <li><span className="msi">arrow_forward</span> Lower rejection &amp; underwriting cost</li>
                  <li><span className="msi">arrow_forward</span> API-first integration &amp; real-time decisioning</li>
                  <li><span className="msi">arrow_forward</span> Portfolio-quality lead scoring</li>
                </ul>
                <a href="#apply" className="btn btn--secondary" data-i18n="partners.lend.cta">Become a lending partner</a>
              </div>

              <div className="glass partners__col">
                <span className="icon-tile icon-tile--green icon-tile--lg"><span className="msi msi--fill">handshake</span></span>
                <h3 data-i18n="partners.biz.title">For business partners</h3>
                <p>Embed SwiftLoan.ai credit into your app or checkout. Offer your customers instant financing — we handle matching, compliance and disbursal.</p>
                <ul className="checklist">
                  <li><span className="msi">arrow_forward</span> Plug-and-play embedded lending SDK</li>
                  <li><span className="msi">arrow_forward</span> Co-branded borrower experience</li>
                  <li><span className="msi">arrow_forward</span> Revenue share on funded loans</li>
                  <li><span className="msi">arrow_forward</span> Full compliance &amp; consent handled for you</li>
                </ul>
                <a href="#apply" className="btn btn--secondary" data-i18n="partners.biz.cta">Partner with us</a>
              </div>
            </div>

            <div className="partner-logos" aria-label="Partner categories">
              <span>NBFCs</span><span>Fintech lenders</span><span>Marketplaces</span><span>SaaS platforms</span><span>Retail &amp; POS</span><span>Neobanks</span>
            </div>
          </div>
        </section>

        {/* ============ SECURITY & CONSENT ============ */}
        <section className="section" id="security">
          <div className="container">
            <div className="section__head">
              <span className="eyebrow" data-i18n="sec.security.ey">Trust &amp; safety</span>
              <h2 data-i18n="sec.security.h">Your data, your consent, always</h2>
              <p className="section__lead" data-i18n="sec.security.lead">
                We built SwiftLoan.ai to a higher bar than we&apos;re required to — because trust is the whole product.
              </p>
            </div>

            <div className="security__grid">
              <div className="glass sec-card"><span className="icon-tile icon-tile--teal"><span className="msi msi--fill">lock</span></span><h4 data-i18n="sec.1t">256-bit encryption</h4><p>Every byte in transit and at rest is encrypted to bank-grade standards.</p></div>
              <div className="glass sec-card"><span className="icon-tile icon-tile--green"><span className="msi msi--fill">verified_user</span></span><h4 data-i18n="sec.2t">Consent-first sharing</h4><p>Your data is only shared with a lender after you explicitly approve — via Account Aggregator.</p></div>
              <div className="glass sec-card"><span className="icon-tile icon-tile--teal"><span className="msi msi--fill">do_not_disturb_on</span></span><h4 data-i18n="sec.3t">No spam, ever</h4><p>We don&apos;t sell your number. You won&apos;t be buried in cold calls after applying.</p></div>
              <div className="glass sec-card"><span className="icon-tile icon-tile--green"><span className="msi msi--fill">account_balance</span></span><h4 data-i18n="sec.4t">RBI-aligned partners</h4><p>All lending is done by RBI-registered banks &amp; NBFCs following fair-practice codes.</p></div>
              <div className="glass sec-card"><span className="icon-tile icon-tile--teal"><span className="msi msi--fill">visibility</span></span><h4 data-i18n="sec.5t">Full transparency</h4><p>See every fee, rate and term before you commit. No fine-print traps.</p></div>
              <div className="glass sec-card"><span className="icon-tile icon-tile--green"><span className="msi msi--fill">delete</span></span><h4 data-i18n="sec.6t">Data control</h4><p>Revoke consent or request data deletion any time from your dashboard.</p></div>
            </div>
          </div>
        </section>

        {/* ============ COMPLIANCE & REGULATORY ============ */}
        <section className="section" id="compliance">
          <div className="container">
            <div className="section__head">
              <span className="eyebrow" data-i18n="sec.compliance.ey">Regulatory &amp; compliance</span>
              <h2 data-i18n="sec.compliance.h">Built for the RBI Digital Lending framework</h2>
              <p className="section__lead" data-i18n="sec.compliance.lead">
                SwiftLoan.ai operates as a Lending Service Provider aligned with the RBI&apos;s Digital Lending Directions. Here&apos;s exactly how we protect you.
              </p>
            </div>

            {/* role disclosure */}
            <div className="disclosure">
              <span className="msi msi--fill disclosure__ic">gavel</span>
              <div>
                <h3>Our role: Lending Service Provider (LSP), not a lender</h3>
                <p>
                  SwiftLoan.ai is a technology platform / Digital Lending App that operates <b>on behalf of RBI-regulated banks and NBFCs (the lenders)</b>. We do not lend from our own books, we <b>never disburse, hold or route your money</b>, and we <b>never charge you any fee</b> — all charges are borne by the regulated lender and disclosed to you up-front. Your loan agreement is always directly with the lender.
                </p>
              </div>
            </div>

            {/* RBI DLG pillars */}
            <div className="comp-grid">
              <div className="comp-card"><span className="msi msi--fill">description</span><h4>Key Fact Statement</h4><p>Before you accept, you get a standardised KFS showing the all-inclusive APR, total cost, every fee and penal charge, and the cooling-off period.</p></div>
              <div className="comp-card"><span className="msi msi--fill">event_available</span><h4>Cooling-off period</h4><p>You may exit a disbursed loan within the RBI-prescribed cooling-off window by repaying principal + proportionate APR, with no penalty.</p></div>
              <div className="comp-card"><span className="msi msi--fill">account_balance_wallet</span><h4>Direct disbursal &amp; repayment</h4><p>Funds are credited straight to your bank account and repayments go directly to the lender. Money never flows through SwiftLoan.ai.</p></div>
              <div className="comp-card"><span className="msi msi--fill">money_off</span><h4>No borrower-side fees</h4><p>We charge you nothing. Any fee payable to us is paid by the lender — never collected from you, in line with RBI norms.</p></div>
              <div className="comp-card"><span className="msi msi--fill">encrypted</span><h4>Data minimisation</h4><p>We collect only need-based data with your explicit consent, store it in India, take no access to your contacts, media or files, and store no biometrics.</p></div>
              <div className="comp-card"><span className="msi msi--fill">balance</span><h4>Impartial matching</h4><p>Offers are ranked by your genuine likelihood of approval and cost to you — not by commercials. No dark patterns, no pre-ticked consents.</p></div>
              <div className="comp-card"><span className="msi msi--fill">handshake</span><h4>Fair recovery</h4><p>Recovery follows the lender&apos;s RBI Fair Practices Code — respectful hours, no harassment, and a named recovery contact shared with you.</p></div>
              <div className="comp-card"><span className="msi msi--fill">delete_forever</span><h4>Consent &amp; deletion</h4><p>You can review, revoke consent, or request deletion of your data at any time. Consent is logged and auditable.</p></div>
            </div>

            <div className="comp-split">
              {/* KFS / representative example */}
              <div className="glass" style={{ padding: 24 }}>
                <div className="kfs__head"><span className="msi msi--fill">receipt_long</span><h3>Rates, fees &amp; a representative example</h3></div>
                <div className="kfs__row"><span>Annual Percentage Rate (APR)</span><b>10.49% – 28.00% p.a.</b></div>
                <div className="kfs__row"><span>Processing fee</span><b>up to 3% + GST</b></div>
                <div className="kfs__row"><span>Penal charges (on overdue)</span><b>as per lender KFS</b></div>
                <div className="kfs__row"><span>Foreclosure / part-payment</span><b>as per lender, often nil</b></div>
                <div className="kfs__row"><span>Loan tenure</span><b>3 – 60 months</b></div>
                <p className="kfs__note">
                  <b>Illustrative example:</b> On a ₹1,00,000 personal loan for 12 months at 18% p.a. (reducing balance), the EMI is ≈ ₹9,168, total interest ≈ ₹10,016, and a one-time processing fee of 2% + GST (₹2,360) applies — an all-inclusive APR of ≈ 22.4%. Actual figures are set by the lender and shown in your Key Fact Statement before you accept. This example is for illustration only and is not an offer.
                </p>
              </div>

              {/* grievance redressal */}
              <div className="glass grievance" style={{ padding: 24 }}>
                <div className="grievance__head"><span className="msi msi--fill">support_agent</span><h3>Grievance redressal</h3></div>
                <p>Not happy with something? Our Nodal Grievance Redressal Officer is here to help.</p>
                <div className="grievance__rows">
                  <div className="grievance__row"><span className="msi">person</span> Grievance Officer — SwiftLoan.ai</div>
                  <div className="grievance__row"><span className="msi">mail</span> <a href="mailto:grievance@swiftloan.ai">grievance@swiftloan.ai</a></div>
                  <div className="grievance__row"><span className="msi">call</span> 1800-000-0000 · Mon–Sat, 10am–6pm</div>
                </div>
                <div className="grievance__steps">
                  <div className="grievance__step">We acknowledge within 48 hours and aim to resolve within the RBI-prescribed timeline.</div>
                  <div className="grievance__step">If unresolved, escalate to the lender&apos;s Grievance Officer (named in your KFS).</div>
                  <div className="grievance__step">
                    Still unresolved after 30 days? Escalate to the RBI under the Integrated Ombudsman Scheme (RB-IOS) at{' '}
                    <a href="https://cms.rbi.org.in" target="_blank" rel="noopener">cms.rbi.org.in</a>.
                  </div>
                </div>
              </div>
            </div>

            <div className="comp-actions">
              <Link href="/compliance" className="btn btn--primary">Read full compliance &amp; policies <span className="msi">arrow_forward</span></Link>
              <Link href="/compliance#partners" className="btn btn--secondary">Our lending partners</Link>
            </div>
          </div>
        </section>

        {/* ============ TESTIMONIALS ============ */}
        <section className="section" id="reviews">
          <div className="container">
            <div className="section__head">
              <span className="eyebrow" data-i18n="sec.reviews.ey">Loved by borrowers</span>
              <h2 data-i18n="sec.reviews.h">Real people. Real approvals.</h2>
              <div className="rating">
                <span className="rating__stars">
                  <span className="msi msi--fill">star</span><span className="msi msi--fill">star</span><span className="msi msi--fill">star</span><span className="msi msi--fill">star</span><span className="msi msi--fill">star</span>
                </span>
                <span className="rating__text"><b>4.8/5</b> from 12,400+ verified reviews</span>
              </div>
            </div>

            <div className="reviews__grid">
              <figure className="glass review">
                <div className="review__stars"><span className="msi msi--fill">star</span><span className="msi msi--fill">star</span><span className="msi msi--fill">star</span><span className="msi msi--fill">star</span><span className="msi msi--fill">star</span></div>
                <blockquote>&quot;I compared 4 lenders in one place and got a rate 3% lower than my bank offered. Money hit my account the next morning.&quot;</blockquote>
                <figcaption><span className="review__av">PN</span><div><b>Priya N.</b><span>Personal loan · Pune</span></div></figcaption>
              </figure>
              <figure className="glass review">
                <div className="review__stars"><span className="msi msi--fill">star</span><span className="msi msi--fill">star</span><span className="msi msi--fill">star</span><span className="msi msi--fill">star</span><span className="msi msi--fill">star</span></div>
                <blockquote>&quot;As a small manufacturer, cash flow is everything. SwiftLoan.ai matched me with a working-capital line that actually understood my GST numbers.&quot;</blockquote>
                <figcaption><span className="review__av">RK</span><div><b>Rakesh K.</b><span>Business loan · Surat</span></div></figcaption>
              </figure>
              <figure className="glass review">
                <div className="review__stars"><span className="msi msi--fill">star</span><span className="msi msi--fill">star</span><span className="msi msi--fill">star</span><span className="msi msi--fill">star</span><span className="msi msi--fill">star</span></div>
                <blockquote>&quot;What sold me was the soft check. I could shop around without wrecking my credit score. Transparent the whole way through.&quot;</blockquote>
                <figcaption><span className="review__av">AM</span><div><b>Aisha M.</b><span>Personal loan · Bengaluru</span></div></figcaption>
              </figure>
            </div>
          </div>
        </section>

        {/* ============ LEAD FORM / APPLY ============ */}
        <section className="section section--dark" id="apply">
          <div className="container apply__grid">
            <div className="apply__copy">
              <span className="eyebrow eyebrow--light" data-i18n="sec.apply.ey">Get started</span>
              <h2 data-i18n="sec.apply.h">Check your rate in 3 minutes</h2>
              <p className="section__lead" data-i18n="sec.apply.lead">
                It&apos;s free, it&apos;s a soft check, and it won&apos;t affect your credit score. See your matched offers instantly.
              </p>
              <ul className="apply__points">
                <li><span className="msi msi--fill">check_circle</span> No impact on credit score</li>
                <li><span className="msi msi--fill">check_circle</span> No obligation to accept</li>
                <li><span className="msi msi--fill">check_circle</span> Compare offers from 18+ lenders</li>
                <li><span className="msi msi--fill">check_circle</span> 100% paperless</li>
              </ul>
              <div className="apply__trust">
                <span className="msi">lock</span> Your details are encrypted and shared only with your consent.
              </div>
            </div>

            <form className="glass apply__form" id="leadForm" noValidate>
              <div className="apply__form-head">
                <h3 data-i18n="apply.formhead">Find my best offer</h3>
                <span className="pill pill--soft"><span className="msi">shield</span> Soft check</span>
              </div>

              <div className="field-row">
                <div className="field">
                  <label htmlFor="loanType" data-i18n="f.loanType">I need a</label>
                  <select id="loanType" name="loanType" required defaultValue="">
                    <option value="">Select loan type</option>
                    <option value="Personal Loan">Personal Loan</option>
                    <option value="Business Loan">Business Loan</option>
                  </select>
                  <span className="err" data-for="loanType"></span>
                </div>
                <div className="field">
                  <label htmlFor="loanAmount" data-i18n="f.loanAmount">Amount (₹)</label>
                  <input type="number" id="loanAmount" name="loanAmount" min={50000} placeholder="e.g. 500000" required />
                  <span className="err" data-for="loanAmount"></span>
                </div>
              </div>

              <div className="field">
                <label htmlFor="fullName" data-i18n="f.fullName">Full name</label>
                <input type="text" id="fullName" name="fullName" placeholder="As per your PAN" required />
                <span className="err" data-for="fullName"></span>
              </div>

              <div className="field-row">
                <div className="field">
                  <label htmlFor="phone" data-i18n="f.phone">Mobile number</label>
                  <input type="tel" id="phone" name="phone" placeholder="10-digit mobile" required />
                  <span className="err" data-for="phone"></span>
                </div>
                <div className="field">
                  <label htmlFor="email" data-i18n="f.email">Email</label>
                  <input type="email" id="email" name="email" placeholder="you@email.com" required />
                  <span className="err" data-for="email"></span>
                </div>
              </div>

              <div className="field field--city">
                <label htmlFor="city" data-i18n="f.city">City</label>
                <input type="text" id="city" name="city" placeholder="Your city" />
              </div>

              <label className="consent">
                <input type="checkbox" id="consent" required />
                <span>
                  I authorise SwiftLoan.ai to run a soft eligibility check and share my details with matched lending partners. I agree to the{' '}
                  <a href="#">Terms</a> &amp; <a href="#">Privacy Policy</a>.
                </span>
              </label>
              <span className="err" data-for="consent"></span>

              <button type="submit" className="btn btn--primary btn--lg btn--block" id="leadSubmit" data-i18n="apply.submit">
                See my matched offers <span className="msi">arrow_forward</span>
              </button>
              <p className="apply__disclaimer">By submitting, you consent to being contacted about your application. This is not a guarantee of loan approval.</p>

              <div className="form-success" id="formSuccess" hidden>
                <span className="form-success__ic msi msi--fill">check_circle</span>
                <h3 data-i18n="apply.successTitle">You&apos;re all set!</h3>
                <p>
                  We&apos;re matching you with lenders now. Your reference ID is <b id="genId">SL-0000</b>. We&apos;ll show your offers shortly — check status anytime in{' '}
                  <a href="#track">Track application</a>.
                </p>
                <div className="app-continue" id="appContinue" hidden></div>
                <button type="button" className="btn btn--secondary form-success__reset" id="resetLead" data-i18n="apply.reset">Check another rate</button>
              </div>
            </form>
          </div>
        </section>

        {/* ============ FAQ ============ */}
        <section className="section" id="faq">
          <div className="container">
            <div className="section__head">
              <span className="eyebrow" data-i18n="sec.faq.ey">Questions?</span>
              <h2 data-i18n="sec.faq.h">Frequently asked questions</h2>
            </div>

            <div className="faq" id="faqList">
              <details className="glass faq__item">
                <summary>Does SwiftLoan.ai lend money directly?<span className="msi faq__ic">add</span></summary>
                <div className="faq__a"><p>No. SwiftLoan.ai is a loan aggregation and matchmaking platform. We use technology to match you with RBI-registered banks and NBFCs who do the actual lending. The final loan agreement is always between you and the lender.</p></div>
              </details>
              <details className="glass faq__item">
                <summary>Will checking my eligibility affect my credit score?<span className="msi faq__ic">add</span></summary>
                <div className="faq__a"><p>No. Our initial eligibility check uses a &quot;soft pull&quot; which is not visible to other lenders and does not impact your credit score. A &quot;hard pull&quot; only happens later, with your explicit consent, when you proceed with a specific lender.</p></div>
              </details>
              <details className="glass faq__item">
                <summary>How long does approval and disbursal take?<span className="msi faq__ic">add</span></summary>
                <div className="faq__a"><p>Matching and indicative offers are instant. Once you pick an offer and complete eKYC, many of our partners approve and disburse within a few hours to 2 working days, depending on the loan type and verification.</p></div>
              </details>
              <details className="glass faq__item">
                <summary>What documents will I need?<span className="msi faq__ic">add</span></summary>
                <div className="faq__a"><p>Typically your PAN, Aadhaar (for eKYC), and bank statements or GST returns for business loans. Most verification is paperless via DigiLocker and Account Aggregator — you rarely need to upload anything manually.</p></div>
              </details>
              <details className="glass faq__item">
                <summary>Are there any charges to use SwiftLoan.ai?<span className="msi faq__ic">add</span></summary>
                <div className="faq__a"><p>Using SwiftLoan.ai to check eligibility and compare offers is free for borrowers. Lenders may charge processing fees on the loan you accept — these are always shown transparently before you commit.</p></div>
              </details>
              <details className="glass faq__item">
                <summary>Is my personal data safe?<span className="msi faq__ic">add</span></summary>
                <div className="faq__a"><p>Yes. We use 256-bit encryption, follow a consent-first model via the RBI&apos;s Account Aggregator framework, and never sell your data. You can revoke consent or request deletion at any time.</p></div>
              </details>
              <details className="glass faq__item">
                <summary>What if I have a low credit score?<span className="msi faq__ic">add</span></summary>
                <div className="faq__a"><p>Because we match across many lenders with different credit criteria, you may still find offers even with a limited or lower score. We rank options by your real likelihood of approval — but approval and final terms are always at the lender&apos;s discretion.</p></div>
              </details>
            </div>
          </div>
        </section>

        {/* ============ CTA BANNER ============ */}
        <section className="section">
          <div className="container">
            <div className="ctaband">
              <div className="ctaband__glow" aria-hidden="true"></div>
              <div className="ctaband__inner">
                <div>
                  <h2 data-i18n="cta.h">Ready to find your best loan offer?</h2>
                  <p data-i18n="cta.p">Join 500,000+ people who borrowed smarter with SwiftLoan.ai. Fast · Fair · Secure.</p>
                </div>
                <a href="#apply" className="btn btn--light btn--lg" data-i18n="cta.btn">Check your rate now <span className="msi">arrow_forward</span></a>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ============ FOOTER ============ */}
      <footer className="footer">
        <div className="container footer__grid">
          <div className="footer__brand">
            <a href="#top" className="brand brand--footer">
              <span className="brand__mark">
                <svg width="28" height="28" viewBox="0 0 120 120" fill="none">
                  <g stroke="#fff" strokeLinecap="round">
                    <line x1="16" y1="43" x2="40" y2="43" strokeWidth="6" opacity=".32" />
                    <line x1="12" y1="60" x2="38" y2="60" strokeWidth="6" opacity=".55" />
                    <line x1="18" y1="77" x2="42" y2="77" strokeWidth="6" opacity=".82" />
                  </g>
                  <g transform="skewX(-7)">
                    <text x="82" y="87" textAnchor="middle" fill="#fff" fontFamily="'Public Sans',Arial,sans-serif" fontSize="84" fontWeight="800">&#8377;</text>
                  </g>
                </svg>
              </span>
              <span className="brand__name"><span className="brand__swift">Swift</span>Loan<span className="brand__ai">.ai</span></span>
            </a>
            <p>AI-powered loan matching that puts borrowers first. Compare, choose, and get funded — with total transparency and control.</p>
            <div className="footer__social" aria-label="Social links">
              <a href="#" aria-label="LinkedIn"><span className="msi">group</span></a>
              <a href="#" aria-label="Twitter / X"><span className="msi">tag</span></a>
              <a href="#" aria-label="Email"><span className="msi">mail</span></a>
            </div>
          </div>

          <div className="footer__col">
            <h4 data-i18n="footer.products">Products</h4>
            <a href="#services">Personal Loans</a>
            <a href="#services">Business Loans</a>
            <a href="#calculator">EMI Calculator</a>
            <a href="#track">Track application</a>
          </div>
          <div className="footer__col">
            <h4 data-i18n="footer.company">Company</h4>
            <a href="#partners">Partners</a>
            <a href="#security">Security</a>
            <a href="#reviews">Reviews</a>
            <a href="#faq">FAQs</a>
          </div>
          <div className="footer__col">
            <h4 data-i18n="footer.legal">Legal</h4>
            <Link href="/compliance">Compliance &amp; Regulatory</Link>
            <Link href="/compliance#kfs">Key Fact Statement</Link>
            <Link href="/compliance#fair-practices">Fair Practices Code</Link>
            <Link href="/compliance#grievance">Grievance Redressal</Link>
            <Link href="/compliance#privacy">Privacy &amp; Data Protection</Link>
            <Link href="/compliance#partners">Lending Partners</Link>
          </div>
        </div>

        <div className="container footer__disclaimer">
          <p>
            <b>Regulatory disclosure:</b> SwiftLoan.ai is a Lending Service Provider (LSP) / Digital Lending App that facilitates loans on behalf of RBI-regulated banks and Non-Banking Financial Companies (NBFCs). SwiftLoan.ai is <b>not a bank or an NBFC and does not lend from its own funds</b>. We do not disburse, hold, or route borrower funds, and we do not charge borrowers any fee — all fees payable to the LSP are borne by the lending partner in accordance with the RBI&apos;s Digital Lending Directions. Loan disbursal is made directly to the borrower&apos;s bank account and repayments are collected directly by the lender.
          </p>
          <p>
            <b>Disclaimer:</b> All loans are provided by RBI-registered lending partners at their sole discretion, subject to their credit policies, terms and conditions. Loan approval, sanctioned amount, interest rate, fees, penal charges and disbursal are determined solely by the lending partner and are set out in the Key Fact Statement (KFS) provided before you accept any offer. Interest rates shown on this site are indicative starting/representative rates; your actual Annual Percentage Rate (APR) depends on your credit profile and the lender&apos;s assessment and ranges from 10.49% to 28% p.a. Please read the KFS and all loan documents carefully before signing. This website is for informational purposes and does not constitute financial advice or a loan offer. For grievances, write to{' '}
            <a href="mailto:grievance@swiftloan.ai">grievance@swiftloan.ai</a>; unresolved complaints may be escalated to the RBI under the Integrated Ombudsman Scheme at{' '}
            <a href="https://cms.rbi.org.in" target="_blank" rel="noopener">cms.rbi.org.in</a>.
          </p>
          <p className="footer__copyright">© <span id="year">2026</span> SwiftLoan.ai — All rights reserved. Illustrative brand for demonstration.</p>
        </div>
      </footer>

      {/* back to top */}
      <button className="totop" id="toTop" aria-label="Back to top"><span className="msi">arrow_upward</span></button>

      <SiteScripts />
      <VoiceWidget />
    </>
  );
}

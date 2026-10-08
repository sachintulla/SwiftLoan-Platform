import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Pressable } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import Icon from './Icon';
import { LogoMark } from './Logo';
import { AppBackground } from './Frame';
import { colors, font } from '../theme/tokens';
import { useT } from '../state/store';

/**
 * Embeddable in-app browser for the Yubi Markets (YMPL) alternative-offers
 * journey. Used both as the `altweb` pushed screen and as the "Yubi" tab inside
 * My Offers. It:
 *   • prefills YMPL's hosted journey from the funnel data (see prefillScript) —
 *     data-only, never ticking consent or pressing Continue;
 *   • detects the applicant tapping "Proceed" on YMPL's offers page and reports
 *     it via onProceed, so the app can record the application in My Loans.
 * Pure presentational + bridge component: the parent owns layout, the redirect
 * url and the prefill bundle, and what to do on proceed / back.
 */

/**
 * Prefill YMPL's hosted journey from the details the funnel already collected —
 * ACROSS all of its steps, which span TWO different web apps:
 *   • bureau-uat.yubimarkets.in (step 1) — plain inputs with `name` attributes.
 *   • connect-uat.go-yubi.in (DOB → pincode → employment → employer → income) —
 *     MUI components with NO `name`, matched by placeholder or <label for>.
 * Each field is resolved name → placeholder → label. The MUI date field is set
 * with a formatted DD/MM/YYYY string; employment is a custom <div> clicked by
 * exact text. We NEVER tick a consent checkbox or press Continue/submit. A
 * MutationObserver + interval keep filling as fields render across steps; each
 * field fills once it sticks, then is left to the user.
 */
function prefillScript(prefill: Record<string, string | number | null>): string {
  const SPECS = [
    // No bare 'pan' label — 'company' CONTAINS 'pan' (com-PAN-y), which would drop
    // the PAN into the Company field. PAN is found by name/placeholder on step 1.
    { key: 'pan', kind: 'text', names: ['pan'], placeholders: ['ABCPA1234A'], labels: ['pan number'] },
    { key: 'firstName', kind: 'text', names: ['first_name', 'firstName'], labels: ['first name'] },
    { key: 'middleName', kind: 'text', names: ['middle_name', 'middleName'], labels: ['middle name'] },
    { key: 'lastName', kind: 'text', names: ['last_name', 'lastName'], labels: ['last name'] },
    { key: 'email', kind: 'text', names: ['email'], labels: ['personal email', 'contact email', 'email'] },
    { key: 'mobile', kind: 'text', names: ['mobile', 'phone'], labels: ['mobile'] },
    { key: 'dob', kind: 'date', names: ['dob'], placeholders: ['dd/mm/yyyy'], labels: ['date of birth'] },
    { key: 'pincode', kind: 'text', names: ['pincode', 'pin_code'], placeholders: ['pincode', '6-digit'], labels: ['pincode', 'pin code'] },
    { key: 'employmentType', kind: 'choice', labels: ['employment type', 'employment'] },
    { key: 'companyName', kind: 'text', names: ['company_name', 'companyName', 'company', 'employer'], placeholders: ['name of company', 'company name'], labels: ['company name', 'company', 'employer'] },
    { key: 'monthlyIncome', kind: 'text', names: ['monthly_income', 'monthlyIncome', 'income'], placeholders: ['enter monthly income', 'monthly income'], labels: ['monthly income'] },
    // Known-but-previously-unfilled params, so the post-selection detail steps
    // (address/KYC/loan form shown after the user selects an offer and taps
    // Proceed) auto-fill whatever we already have. Anything we don't know stays
    // blank for the user to type. 'gender' is a radio/chip (choice); the rest are
    // text/number or native <select> (handled by fillText). loanAmount is in
    // rupees (application amount is stored in rupees, 25k–15L).
    { key: 'gender', kind: 'choice', labels: ['gender'] },
    { key: 'addressLine1', kind: 'text', names: ['address_line1', 'addressLine1', 'address1', 'addressLine', 'address'], placeholders: ['address line 1', 'house', 'flat', 'street', 'address'], labels: ['address line 1', 'address 1', 'current address', 'residential address', 'address'] },
    { key: 'addressLine2', kind: 'text', names: ['address_line2', 'addressLine2', 'address2'], placeholders: ['address line 2', 'landmark', 'locality', 'area'], labels: ['address line 2', 'address 2'] },
    { key: 'city', kind: 'text', names: ['city', 'town'], placeholders: ['city'], labels: ['city', 'town', 'district'] },
    { key: 'state', kind: 'text', names: ['state'], placeholders: ['state'], labels: ['state'] },
    { key: 'loanAmount', kind: 'text', names: ['loan_amount', 'loanAmount', 'requested_amount', 'requestedAmount', 'desired_amount'], placeholders: ['loan amount', 'amount you need', 'desired loan amount'], labels: ['loan amount', 'required loan amount', 'desired loan amount', 'requested loan amount', 'amount required'] },
  ];
  return `(function(){try{
    var DATA=${JSON.stringify(prefill)};
    var SPECS=${JSON.stringify(SPECS)};
    var done={};
    // Make the hosted page's own background transparent so SwiftLoan's app
    // gradient (rendered behind the transparent WebView) shows through the
    // page margins — keeps the embedded journey visually consistent with the
    // app. Only the outermost page background; the lender's cards stay as-is.
    try{ if(!window.__yubiBgStyled){ window.__yubiBgStyled=true; var st=document.createElement('style'); st.textContent='html,body,#root,#app,#__next{background:transparent !important;background-color:transparent !important;}'; (document.head||document.documentElement).appendChild(st); } }catch(e){}
    // Beyond html/body, the hosted page paints its own full-bleed chrome bars
    // white — a sticky top bar (progress + "Offers") and a sticky bottom bar
    // (Proceed + "Powered by"). Neutralise ONLY those to transparent so the app
    // gradient shows through them too; the lender's rounded offer cards (with
    // side margins / radius) are left white and untouched.
    function isWhiteBg(c){ var m=/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/.exec(c||''); if(!m)return false; var a=m[4]===undefined?1:parseFloat(m[4]); if(a<0.5)return false; return (+m[1])>=244&&(+m[2])>=244&&(+m[3])>=244; }
    function neutralizeBars(){ try{
      var vw=window.innerWidth||document.documentElement.clientWidth||0; if(!vw)return;
      var all=document.body?document.body.getElementsByTagName('*'):[];
      for(var i=0;i<all.length;i++){ var el=all[i]; if(el.__yubiBar)continue;
        // Never touch interactive controls — the Proceed CTA is a full-width
        // button whose (disabled) fill is near-white; neutralising it would strip
        // the button. Only bare layout containers qualify.
        var tag=el.tagName;
        if(tag==='BUTTON'||tag==='A'||tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA'||tag==='IMG'||tag==='SVG') continue;
        if(el.getAttribute){ var role=el.getAttribute('role'); if(role==='button'||role==='link'||role==='tab') continue; }
        if(el.closest && el.closest('button,a,[role="button"]')) continue;  // inside a CTA
        // The CTA can be a bare full-width <div> ("Proceed") with no button
        // semantics — guard it by its own label so its fill survives.
        var selfTxt=norm(el.textContent);
        if(/^(proceed|continue|submit|apply|applynow|next|select|verify|getoffers|checkeligibility)$/.test(selfTxt)) continue;
        var cs; try{ cs=getComputedStyle(el); }catch(e){ continue; }
        var sticky=(cs.position==='sticky'||cs.position==='fixed');
        var r=el.getBoundingClientRect(); var fullWidth=r.width>=vw-2;
        if(!sticky && !fullWidth) continue;               // only full-bleed / pinned chrome
        var radius=parseFloat(cs.borderTopLeftRadius)||0;
        if(!sticky && radius>8) continue;                  // keep rounded cards
        if(!isWhiteBg(cs.backgroundColor)) continue;
        el.style.setProperty('background','transparent','important');
        el.style.setProperty('background-color','transparent','important');
        el.__yubiBar=true;
      }
    }catch(e){} }
    // Hide the partner's "Powered by Yubi markets" footer attribution — the
    // embedded journey is presented as SwiftLoan's own "Explore lenders", so no
    // aggregator name is surfaced. Targets only the small footer line (text
    // begins with "powered by" and is short), never a content container.
    function hideBranding(){ try{
      var all=document.body?document.body.getElementsByTagName('*'):[];
      for(var i=0;i<all.length;i++){ var el=all[i]; if(el.__yubiHidBrand)continue;
        var t=norm(el.textContent);
        if(t.length>40 || t.indexOf('poweredby')!==0) continue;   // footer line only
        el.style.setProperty('display','none','important');
        el.__yubiHidBrand=true;
      }
    }catch(e){} }
    // Auto-select the offer ONLY when the page shows exactly one — so Proceed
    // becomes enabled without the user having to tap the lone card. This never
    // runs with multiple offers (we must not choose among alternatives for the
    // user), and it only selects the offer — it never presses Proceed, Continue
    // or any consent. Fires once.
    function autoSelectSingleOffer(){ try{
      if(window.__yubiAutoSel) return;
      var bt=((document.body&&document.body.innerText)||'').toLowerCase();
      if(!(/loan offers for you/.test(bt) || /offers\\s*\\(\\d/.test(bt))) return;   // offers page only
      var m=bt.match(/offers\\s*\\((\\d+)\\)/);
      if(m && m[1]!=='1') return;                                                   // exactly one offer
      // Prefer a native radio: exactly one, unchecked → select it.
      var radios=document.querySelectorAll('input[type="radio"]');
      if(radios.length===1 && !radios[0].checked){ window.__yubiAutoSel=true; try{ radios[0].click(); }catch(e){} return; }
      // Fallback: click the single offer card itself (the element holding the
      // loan amount), not a link/button inside it (so we never hit View Document
      // or Proceed). Keep it to a card-sized node, not a big page container.
      var nodes=document.querySelectorAll('div,li,label');
      for(var i=0;i<nodes.length;i++){ var el=nodes[i];
        var t=norm(el.textContent);
        if(t.indexOf('getloanupto')<0 || t.length>600) continue;
        if(el.closest && el.closest('button,a,[role="button"]')) continue;
        window.__yubiAutoSel=true; try{ el.click(); }catch(e){} return;
      }
    }catch(e){} }
    var TEXT={text:1,email:1,tel:1,number:1,search:1,url:1,'':1};
    function norm(s){ return String(s==null?'':s).toLowerCase().replace(/[^a-z0-9]/g,''); }
    function setVal(el,val){
      var d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value');
      d.set.call(el,String(val));
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
      el.dispatchEvent(new Event('blur',{bubbles:true}));
    }
    function setSelect(el,val){
      var v=norm(val);
      for(var i=0;i<el.options.length;i++){
        var o=el.options[i];
        if(norm(o.value)===v||norm(o.textContent)===v||(v&&norm(o.textContent).indexOf(v)>=0)){ el.value=o.value; el.dispatchEvent(new Event('change',{bubbles:true})); return; }
      }
    }
    function byName(ns){ if(!ns)return null; for(var i=0;i<ns.length;i++){ var e=document.querySelector('input[name="'+ns[i]+'"],select[name="'+ns[i]+'"],textarea[name="'+ns[i]+'"]'); if(e)return e; } return null; }
    function byPlaceholder(ps){ if(!ps)return null; var all=document.querySelectorAll('input,textarea'); for(var i=0;i<all.length;i++){ var p=norm(all[i].placeholder); if(!p)continue; for(var j=0;j<ps.length;j++){ if(p.indexOf(norm(ps[j]))>=0)return all[i]; } } return null; }
    function byLabel(ls){ if(!ls)return null; var labs=document.querySelectorAll('label'); for(var i=0;i<labs.length;i++){ var t=norm(labs[i].textContent); if(!t)continue; for(var j=0;j<ls.length;j++){ if(t.indexOf(norm(ls[j]))>=0){ var f=labs[i].getAttribute('for'); if(f){ var e=document.getElementById(f); if(e)return e; } var inp=labs[i].parentElement&&labs[i].parentElement.querySelector('input,select,textarea'); if(inp)return inp; } } } return null; }
    function find(s){ return byName(s.names)||byPlaceholder(s.placeholders)||byLabel(s.labels)||null; }
    function fillText(s,val){
      if(done[s.key])return;
      var el=find(s); if(!el)return;
      if(el.tagName==='SELECT'){ if(el.value){done[s.key]=true;return;} setSelect(el,val); return; }
      if(el.type&&!TEXT[el.type])return;
      if(el.value){ done[s.key]=true; return; }
      setVal(el,val);
    }
    function fillDate(s,iso){
      if(done.dob)return;
      var el=find(s); if(!el)return;
      if(el.value&&/\\d/.test(el.value)){ done.dob=true; return; }
      var m=/(\\d{4})-(\\d{2})-(\\d{2})/.exec(String(iso)); if(!m)return;
      setVal(el, m[3]+'/'+m[2]+'/'+m[1]);
      if(el.value&&/\\d/.test(el.value)) done.dob=true;
    }
    function fillChoice(s,val){
      if(done[s.key])return;
      var want=norm(val); if(!want)return;
      var els=document.querySelectorAll('div,button,label,li,[role="radio"],[role="button"]');
      for(var i=0;i<els.length;i++){ var el=els[i];
        if(norm(el.textContent)!==want) continue;
        if(el.querySelector&&el.querySelector('input[type="checkbox"],input[type="submit"],button[type="submit"]')) continue;
        if(/consent|authori|terms|agree|privacy|continue|submit/.test(String(el.textContent||'').toLowerCase())) continue;
        try{ el.click(); }catch(e){}
        done[s.key]=true; return;
      }
    }
    var prevDone=0;
    function run(){
      neutralizeBars();
      hideBranding();
      autoSelectSingleOffer();
      for(var i=0;i<SPECS.length;i++){ var s=SPECS[i]; var val=DATA[s.key];
        if(val===null||val===undefined||val==='')continue;
        if(s.kind==='date')fillDate(s,val);
        else if(s.kind==='choice')fillChoice(s,val);
        else fillText(s,val);
      }
      // Signal the app the moment this step's fields are filled/ready, so the
      // branded loader can hide WITHOUT the user ever seeing an empty field
      // (e.g. the DOB box flashing blank before the injector fills it). Posts
      // once per document.
      var nd=Object.keys(done).length;
      if(nd>prevDone && !window.__yubiFilledPosted){ window.__yubiFilledPosted=true; try{ window.ReactNativeWebView.postMessage(JSON.stringify({ type:'YUBI_STEP_FILLED' })); }catch(e){} }
      prevDone=nd;
      // Detect the OFFERS page (end of the journey). When the referral resumes
      // straight to offers, the app holds the loader over the auto-advancing
      // intermediate screens (DOB etc.) until this fires, landing on offers.
      if(!window.__yubiOffersPosted){
        var bt=(document.body&&document.body.innerText)||'';
        if(/loan offers for you/i.test(bt) || /offers\\s*\\(\\d/i.test(bt) || /not eligible\\s*\\(\\d/i.test(bt)){
          window.__yubiOffersPosted=true;
          try{ window.ReactNativeWebView.postMessage(JSON.stringify({ type:'YUBI_OFFERS_READY' })); }catch(e){}
        }
      }
    }
    run();
    var mo; try{ mo=new MutationObserver(run); mo.observe(document.documentElement,{childList:true,subtree:true}); }catch(e){}
    // Fast poll (150ms) so fields fill almost immediately after they render.
    var n=0,iv=setInterval(function(){ n++; run(); if(n>2000){ clearInterval(iv); try{mo&&mo.disconnect();}catch(e){} } },150);
  }catch(e){}
  // Proceed detection: the applicant tapping "Proceed" on YMPL's offers page is
  // our "applied" signal (no webhook exists). Capture-phase click listener,
  // matched to the word "proceed" only — NOT Continue/Next/Verify on earlier
  // steps — so it fires only from the offers page. Reported to the app, which
  // records the application in My Loans. Hooked once.
  try{ if(!window.__yubiProceedHooked){ window.__yubiProceedHooked=true;
    document.addEventListener('click', function(e){
      try{
        var el = e.target && e.target.closest ? e.target.closest('button,[role="button"]') : null;
        if(!el || el.disabled) return;
        var t = (el.textContent||'').trim().toLowerCase();
        if(/\\bproceed\\b/.test(t)){
          window.ReactNativeWebView.postMessage(JSON.stringify({ type:'YUBI_PROCEED', label: t.slice(0,60) }));
        }
      }catch(err){}
    }, true);
  } }catch(e){}
  true;})();`;
}

export default function AltOfferWebView({
  url,
  prefill,
  onProceed,
  onBack,
  waitForOffers = false,
}: {
  url: string;
  prefill?: Record<string, string | number | null>;
  onProceed?: (label?: string) => void;
  onBack?: () => void;
  // When the referral already has offers, the journey resumes straight to its
  // offers page — hold the branded loader over the auto-advancing intermediate
  // screens (DOB etc.) until offers actually show, so none of them flash.
  waitForOffers?: boolean;
}) {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const webRef = useRef<any>(null);
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPrefill = prefill && Object.keys(prefill).length > 0;
  const inject = hasPrefill ? prefillScript(prefill!) : prefillScript({});

  const clearFallback = () => { if (fallbackRef.current) { clearTimeout(fallbackRef.current); fallbackRef.current = null; } };
  useEffect(() => clearFallback, []);
  const hideLoader = () => { clearFallback(); setLoading(false); };

  const onMessage = (e: WebViewMessageEvent) => {
    let msg: any;
    try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
    // Offers page reached — always safe to reveal.
    if (msg?.type === 'YUBI_OFFERS_READY') hideLoader();
    // A step's fields are filled → reveal the page (no empty-field flash) — but
    // NOT while we're holding for the offers page on a resume (where the DOB &
    // other intermediate screens should stay hidden behind the loader).
    else if (msg?.type === 'YUBI_STEP_FILLED') { if (!waitForOffers) hideLoader(); }
    else if (msg?.type === 'YUBI_PROCEED') onProceed?.(msg.label);
  };

  if (!url || failed) {
    return (
      <AppBackground>
        <View style={styles.center}>
          <Icon name="public_off" size={40} color={colors.red} />
          <Text style={[font(700), { fontSize: 16, color: colors.text, marginTop: 12, textAlign: 'center' }]}>{t.altOffersErrorTitle}</Text>
          <Text style={[font(400), { fontSize: 13, color: colors.textMid, marginTop: 6, textAlign: 'center', paddingHorizontal: 32 }]}>{t.altOffersErrorBody}</Text>
          {onBack ? (
            <Pressable style={styles.backBtn} onPress={onBack}>
              <Text style={[font(700), { color: '#fff' }]}>{t.goBack}</Text>
            </Pressable>
          ) : null}
        </View>
      </AppBackground>
    );
  }

  return (
    <View style={styles.body}>
      {/* App gradient behind the (transparent) WebView, so the hosted page's
          margins blend into SwiftLoan's background instead of plain white. */}
      <AppBackground />
      <WebView
        ref={webRef}
        source={{ uri: url }}
        onMessage={onMessage}
        onLoadStart={() => { clearFallback(); setLoading(true); }}
        onLoadEnd={() => {
          if (inject) webRef.current?.injectJavaScript(inject);
          clearFallback();
          // Longer safety net when resuming to offers (bureau + auto-advance can
          // take several seconds); short otherwise so a plain form reveals fast.
          fallbackRef.current = setTimeout(() => setLoading(false), waitForOffers ? 14000 : 1400);
        }}
        startInLoadingState={false}
        injectedJavaScript={inject}
        // Transparent so SwiftLoan's gradient shows through the page's own
        // (now-transparent) background. opaque=false is the iOS switch.
        opaque={false}
        style={styles.web}
        onError={() => { hideLoader(); setFailed(true); }}
        onHttpError={(e) => {
          const { statusCode, url: u } = e.nativeEvent;
          if (statusCode >= 400 && (!u || u === url)) { hideLoader(); setFailed(true); }
        }}
        onRenderProcessGone={() => setFailed(true)}
        onContentProcessDidTerminate={() => setFailed(true)}
      />
      {loading && (
        // Opaque app-background overlay — fully covers the webview (so
        // intermediate screens never flash) and matches the app's look.
        <View style={StyleSheet.absoluteFill}>
          <AppBackground>
            <View style={styles.center}>
              <LogoMark size={56} />
              <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 20 }} />
              <Text style={[font(600), { color: colors.textMid, marginTop: 12, fontSize: 13.5 }]}>{t.altOffersLoading}</Text>
            </View>
          </AppBackground>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  web: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backBtn: { marginTop: 16, backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
});

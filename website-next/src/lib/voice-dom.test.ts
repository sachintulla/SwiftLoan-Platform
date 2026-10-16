// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { collectMessages, findToggle } from './voice-dom';

// jsdom has no layout: make every element "visible" the way isVisible() checks.
beforeEach(() => {
  document.body.innerHTML = '';
  HTMLElement.prototype.getBoundingClientRect = () => ({ width: 20, height: 20, top: 0, left: 0, right: 20, bottom: 20, x: 0, y: 0, toJSON() {} }) as DOMRect;
});

const consent = (text: string) => {
  const l = document.createElement('label');
  l.innerHTML = `<input type="checkbox"> <span>${text}</span>`;
  document.body.appendChild(l);
  return l.querySelector('input') as HTMLInputElement;
};

const HINDI = 'मेरी अनुमति है कि SwiftLoan और उसके RBI-पंजीकृत लेंडिंग पार्टनर्स मेरा PAN सत्यापित करें और मेरी क्रेडिट रिपोर्ट प्राप्त करें — यह एक सॉफ्ट चेक है और इससे मेरे क्रेडिट स्कोर पर कोई असर नहीं पड़ेगा।';

describe('findToggle with a mangled long label', () => {
  it('accepts the cut-off, re-spelled Hindi consent text when it is the only checkbox', () => {
    const box = consent(HINDI);
    const heard = 'मेरी अनुमति है कि SwiftLoan और उसके RBI-पंजीकृत लैंडिंग पार्टनर्स मेरा PAN सत्यापित करें और मेरी क्रेडिट रिपोर्ट प्राप्त करें — यह एक सॉफ्ट चेक है और इससे मेरे क्रेडिट स्कोर पर कोई असर नहीं पड़ेगा। ह…';
    expect(findToggle(heard).el).toBe(box);
  });

  it('still never guesses between several checkboxes: an unrelated label finds nothing', () => {
    consent('Loan updates');
    consent('Security alerts');
    expect(findToggle('Completely different words here for nothing at all').el).toBeNull();
  });

  it('a near-match among several resolves to the right one, ties stay ambiguous', () => {
    const a = consent('I agree to the terms of service and the privacy policy of SwiftLoan');
    consent('Promotional offers and marketing messages');
    expect(findToggle('I agree to the terms of service and the privcy policy of SwiftLoan').el).toBe(a);
  });
});

describe('collectMessages — blocking popup', () => {
  it('reads the reason out of an alertdialog paragraph', () => {
    document.body.innerHTML =
      '<div role="alertdialog"><p id="alert-message">We couldn’t find this PAN.</p><button>OK</button></div>';
    const dlg = document.querySelector('[role="alertdialog"]') as HTMLElement;
    expect(collectMessages(dlg)).toContain('We couldn’t find this PAN.');
  });
});

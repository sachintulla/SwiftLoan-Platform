import { SCREEN_INFO } from '../src/voice/screenInfo';
import { SCREENS } from '../src/screens';
import { buildPageContext } from '../src/voice/actionRegistry';

describe('voice agent screen details', () => {
  it('every built screen has a plain-language title and purpose', () => {
    const missing = Object.keys(SCREENS).filter(id => !SCREEN_INFO[id]);
    expect(missing).toEqual([]);
    for (const info of Object.values(SCREEN_INFO)) {
      expect(info.title.length).toBeGreaterThan(2);
      expect(info.purpose.length).toBeGreaterThan(10);
    }
  });

  it('cryptic internal ids get a readable title, not the id itself', () => {
    const cryptic = ['fare', 'basicpan', 'basic', 'moredetails', 'lenderweb', 'finding', 'loans', 'handoff'];
    for (const id of cryptic) {
      expect(SCREEN_INFO[id].title.replace(/[^a-z]/gi, '').toLowerCase()).not.toBe(id);
      expect(SCREEN_INFO[id].title).toContain(' ');
    }
  });

  it('page_context carries the title/purpose next to the internal id', () => {
    const ctx = buildPageContext('fare') as any;
    expect(ctx.page).toBe('fare');
    expect(ctx.screen_title).toBe('My Offers');
    expect(ctx.screen_purpose).toMatch(/offers/i);
    expect((buildPageContext('basicpan') as any).screen_title).toBe('PAN Verification (Step 1 of 3)');
    expect((buildPageContext('basic') as any).screen_title).toBe('Basic Details (Step 2 of 3)');
    expect((buildPageContext('moredetails') as any).screen_title).toBe('More Details (Step 3 of 3)');
  });

  it('an unknown screen still builds a context (title omitted)', () => {
    const ctx = buildPageContext('no_such_screen') as any;
    expect(ctx.page).toBe('no_such_screen');
    expect(ctx.screen_title).toBeUndefined();
  });
});

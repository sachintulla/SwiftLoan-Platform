// The stacking order for floating things (lib/layers.ts). The owner's rule: Ruby is background —
// banners, menus, pop-ups, alerts and toasts are all drawn above her.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { LAYERS, PAGE_LAYER_MAX, bannerLiftPx, layerCssVars } from './layers';

const SRC = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(SRC, rel), 'utf8');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe('layer order', () => {
  it('keeps Ruby below everything that can pop up over a page', () => {
    for (const above of ['banner', 'menu', 'modal', 'alert', 'takeover', 'toast'] as const) {
      expect(LAYERS[above], above).toBeGreaterThan(LAYERS.ruby);
    }
  });

  it('is strictly ordered: page < ruby < banner < menu < modal < alert < takeover < toast < agentFx', () => {
    const order = [PAGE_LAYER_MAX, LAYERS.ruby, LAYERS.banner, LAYERS.menu, LAYERS.modal, LAYERS.alert, LAYERS.takeover, LAYERS.toast, LAYERS.agentFx];
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
  });

  it('writes every layer as a CSS variable for the Tailwind classes', () => {
    const css = layerCssVars();
    for (const [name, value] of Object.entries(LAYERS)) expect(css).toContain(`--z-${name}:${value}`);
    expect(read('app/layout.tsx')).toContain('layerCssVars()');
  });
});

describe('every floating surface is on the scale', () => {
  it('has no hand-written z-index of 1000 or more anywhere outside lib/layers.ts', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      if (file.endsWith(path.join('lib', 'layers.ts'))) continue;
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (line.length > 2000) return; // embedded data (sound clips), not styles
        const hits = [
          ...line.matchAll(/z-index\s*:\s*(\d+)/g),
          ...line.matchAll(/zIndex\s*:\s*(\d+)/g),
          ...line.matchAll(/\bz-\[(\d+)\]/g),
          ...line.matchAll(/\bz-(\d+)\b/g),
        ];
        for (const h of hits) if (Number(h[1]) > PAGE_LAYER_MAX) offenders.push(`${path.relative(SRC, file)}:${i + 1} ${h[0]}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('puts Ruby (pill, phone button, error note) on the ruby layer', () => {
    const src = read('components/VoiceWidget.tsx');
    expect(src.match(/z-index:\s*\$\{LAYERS\.ruby\}/g)?.length).toBe(3);
    expect(src).not.toMatch(/z-index:\s*\d/);
  });

  it('puts each pop-up on a layer above Ruby', () => {
    const expected: Array<[string, string]> = [
      ['components/MetaPixel.tsx', 'zIndex: LAYERS.banner'],
      ['components/ui/dropdown-menu.tsx', 'z-[var(--z-menu)]'],
      ['components/site/SiteHeader.tsx', 'z-[var(--z-menu)]'],
      ['components/apply/AccountRail.tsx', 'z-[var(--z-menu)]'],
      ['components/apply/AccountRail.tsx', 'z-[var(--z-modal)]'],
      ['components/apply/CameraCapture.tsx', 'z-[var(--z-modal)]'],
      ['components/apply/AltOfferConfirm.tsx', 'z-[var(--z-modal)]'],
      ['components/home/LeadCaptureUI.tsx', 'z-[var(--z-modal)]'],
      ['components/home/QuickCheckModal.tsx', 'z-[var(--z-modal)]'],
      ['app/apply/finding/page.tsx', 'z-[var(--z-modal)]'],
      ['app/apply/compare/page.tsx', 'z-[var(--z-modal)]'],
      ['app/account/support/page.tsx', 'z-[var(--z-modal)]'],
      ['components/apply/AlertDialog.tsx', 'z-[var(--z-alert)]'],
      ['lib/ello-agent.ts', 'z-index:${LAYERS.alert}'],
      ['components/account/RubyWelcome.tsx', 'z-index: ${LAYERS.takeover}'],
      ['components/ui/sonner.tsx', 'zIndex: LAYERS.toast'],
      ['feedback/agentFx.ts', 'z-index: ${LAYERS.agentFx}'],
    ];
    for (const [file, marker] of expected) expect(read(file), `${file} → ${marker}`).toContain(marker);
  });

  it('only uses layer variables that exist', () => {
    const names = new Set(Object.keys(LAYERS));
    for (const file of sourceFiles(SRC)) {
      for (const m of readFileSync(file, 'utf8').matchAll(/var\(--z-([a-zA-Z]+)\)/g)) {
        expect(names.has(m[1]), `${path.relative(SRC, file)} uses --z-${m[1]}`).toBe(true);
      }
    }
  });

  it('portals the pop-ups that live inside a sticky / blurred header to <body>', () => {
    // AccountRail's phone drawer and log-out pop-up render inside ApplyShell's pinned header (z-30 + backdrop blur)
    // or the sticky desktop rail: stacking contexts that would hold them under Ruby whatever their z-index.
    expect(read('components/apply/AccountRail.tsx').match(/createPortal\(/g)?.length).toBe(2);
  });
});

describe('Ruby moves above a bottom banner', () => {
  const phone = { viewportWidth: 390, viewportHeight: 800 };
  const desktop = { viewportWidth: 1440, viewportHeight: 900 };

  it('lifts Ruby by the banner height + its gap on a phone (the banner spans the screen)', () => {
    // banner: 12px from the bottom, 150px tall, 12px side margins
    expect(bannerLiftPx({ ...phone, bannerTop: 800 - 12 - 150, bannerRight: 390 - 12, bannerHeight: 150 })).toBe(170);
  });

  it('leaves Ruby where she is on a wide desktop, where the centred banner does not reach her corner', () => {
    expect(bannerLiftPx({ ...desktop, bannerTop: 900 - 12 - 120, bannerRight: 720 + 280, bannerHeight: 120 })).toBe(0);
  });

  it('lifts the desktop pill when the window is narrow enough for the banner to reach it', () => {
    expect(bannerLiftPx({ viewportWidth: 1040, viewportHeight: 700, bannerTop: 700 - 12 - 120, bannerRight: 520 + 280, bannerHeight: 120 })).toBe(140);
  });

  it('does nothing for a banner with no size yet', () => {
    expect(bannerLiftPx({ ...phone, bannerTop: 0, bannerRight: 0, bannerHeight: 0 })).toBe(0);
  });
});

import React from 'react';
import { isSensitiveField } from './sensitive';
import type { ActionTarget, TargetKind } from './actionRegistry';

/**
 * Auto-discovers every interactive element on the current screen by walking the
 * React *element* tree that each screen hands to <Screen> as `children`.
 *
 * Why this approach: 18 of the 25 screens build their controls from raw
 * <Pressable> (116+ instances) rather than the shared primitives in Controls.tsx,
 * so per-component self-registration could never see them — which is exactly why
 * "tap English" returned not_found. Walking the element tree instead means every
 * screen is covered with zero per-screen edits.
 *
 * This uses only public React API (element.props / element.type), never fiber
 * internals, so it is safe across React versions. It cannot see *inside* child
 * components (e.g. the Pressable that PrimaryButton renders internally) — those
 * are still covered by the primitives registering themselves in Controls.tsx, so
 * the two mechanisms are complementary and together give full coverage.
 */

export interface ScreenGraph {
  /** All visible text on the screen, in render order — lets the agent describe it. */
  texts: string[];
  /** Interactive elements, keyed by a generated id. */
  elements: Array<{ id: string } & ActionTarget>;
}

function displayName(type: any): string {
  if (typeof type === 'string') return type;
  return type?.displayName || type?.name || '';
}

/**
 * Wraps decorative/marketing copy (hero banners, illustrations' captions) that
 * should render normally but never reach the voice agent's screen_overview or
 * available_actions — e.g. Home's "Welcome back" greeting and headline, which
 * are pure marketing copy and add nothing the agent needs to act or speak from.
 * Renders as a plain passthrough; only buildScreenGraph's walk() treats it
 * specially, by name, so this has zero runtime cost.
 */
export function VoiceHidden({ children }: { children: React.ReactNode }): React.ReactElement {
  return React.createElement(React.Fragment, null, children);
}
VoiceHidden.displayName = 'VoiceHidden';

/** Collects the text content of an element subtree (for labelling controls). */
function collectText(node: any, out: string[], depth = 0): void {
  if (node == null || node === false || depth > 12) return;
  if (typeof node === 'string') {
    const t = node.trim();
    if (t) out.push(t);
    return;
  }
  if (typeof node === 'number') {
    out.push(String(node));
    return;
  }
  if (Array.isArray(node)) {
    node.forEach(n => collectText(n, out, depth + 1));
    return;
  }
  if (React.isValidElement(node)) {
    const props: any = (node as any).props || {};
    // An explicit accessibilityLabel is the most reliable label when present.
    if (typeof props.accessibilityLabel === 'string' && props.accessibilityLabel.trim()) {
      out.push(props.accessibilityLabel.trim());
    }
    collectText(props.children, out, depth + 1);
  }
}

/** Friendly names for icon-only controls, so they can still be addressed by voice. */
const ICON_LABELS: Record<string, string> = {
  arrow_back: 'Back',
  arrow_forward: 'Forward',
  close: 'Close',
  home: 'Home',
  person: 'Profile',
  description: 'Loans',
  search: 'Search',
  edit: 'Edit',
  check: 'Confirm',
  mic: 'Microphone',
  notifications: 'Notifications',
};

/**
 * Finds an Icon descendant's glyph name, used as the label for icon-only buttons
 * (e.g. the header back arrow) which would otherwise be unaddressable.
 */
function iconLabel(node: any, depth = 0): string {
  if (node == null || typeof node !== 'object' || depth > 6) return '';
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = iconLabel(n, depth + 1);
      if (r) return r;
    }
    return '';
  }
  if (!React.isValidElement(node)) return '';
  const props: any = (node as any).props || {};
  const name = displayName((node as any).type);
  if (/Icon/i.test(name) && typeof props.name === 'string') {
    return ICON_LABELS[props.name] || props.name.replace(/_/g, ' ');
  }
  return iconLabel(props.children, depth + 1);
}

function firstLabel(node: any): { label: string; all: string[] } {
  const texts: string[] = [];
  collectText(node, texts);
  const label = texts[0] || iconLabel((node as any)?.props?.children);
  return { label, all: texts };
}

function classify(el: React.ReactElement): TargetKind | null {
  const props: any = el.props || {};
  const name = displayName(el.type);

  if (typeof props.onChangeText === 'function' || /TextInput/i.test(name)) return 'field';
  if (typeof props.onValueChange === 'function' || /Switch/i.test(name)) return 'toggle';
  if (typeof props.onPress === 'function') return 'button';
  return null;
}

/**
 * Walks a screen's children and returns its text plus every actionable element.
 * Ids are `kind:label` (deduped with a numeric suffix) so they stay stable across
 * re-renders of the same screen, which matters because the agent addresses
 * targets by their visible label.
 */
export function buildScreenGraph(children: React.ReactNode): ScreenGraph {
  const texts: string[] = [];
  const elements: Array<{ id: string } & ActionTarget> = [];
  const usedIds = new Map<string, number>();

  const makeId = (kind: string, label: string) => {
    const base = `${kind}:${label || 'unlabelled'}`;
    const n = (usedIds.get(base) ?? 0) + 1;
    usedIds.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
  };

  // The most recent short piece of text seen while walking. A raw <TextInput>'s
  // visible label is usually a *sibling* <Text> above it, not a child, so without
  // this an input falls back to its placeholder — "00000 00000" instead of
  // "Mobile number", forcing the user to say the placeholder out loud.
  let recentText = '';

  /**
   * Whether a piece of text is plausibly a field label. Guards against picking up
   * adornments that sit closer to the input than the label does — mobile.tsx has
   * <Text>Mobile Number</Text> then a row containing <Text>+91</Text> immediately
   * before the TextInput, and "+91" would be a worse label than the placeholder.
   * Requires real letters (any script, so Hindi/Telugu labels qualify) and refuses
   * digit-dominated strings like "+91" or "₹1,50,000".
   */
  const looksLikeLabel = (t: string): boolean => {
    if (t.length < 3 || t.length > 32) return false;
    const letters = t.replace(/[^A-Za-z-￿]/g, '').length;
    const digits = t.replace(/\D/g, '').length;
    return letters >= 2 && digits <= letters;
  };

  const walk = (node: any, depth: number): void => {
    if (node == null || node === false || depth > 40) return;
    if (typeof node === 'string') {
      const t = node.trim();
      if (t) texts.push(t);
      return;
    }
    if (typeof node === 'number') {
      texts.push(String(node));
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(n => walk(n, depth + 1));
      return;
    }
    if (!React.isValidElement(node)) return;

    const el = node as React.ReactElement;
    const props: any = el.props || {};
    const name = displayName(el.type);
    if (name === 'VoiceHidden') return;
    const kind = classify(el);

    if (/^Text$/i.test(name)) {
      const { all } = firstLabel(el);
      all.forEach(t => texts.push(t));
      // Remember short label-like text (not paragraphs) as a candidate label for a
      // following input.
      const candidate = all[0] || '';
      if (looksLikeLabel(candidate)) recentText = candidate;
      // Don't descend again — collectText already gathered nested strings.
      if (!kind) return;
    } else if (!kind && typeof props.accessibilityLabel === 'string' && props.accessibilityLabel.trim()) {
      // A custom, non-interactive component (e.g. profile.tsx's DetailRow) renders
      // its own <Text> internally, which this walker can never see — it only
      // reads the JSX element tree a screen builds directly (see the file
      // docstring). An accessibilityLabel on the element itself is the escape
      // hatch such a component uses to surface that content; collectText()
      // already reads it for interactive controls below, but nothing previously
      // read it for a plain presentational wrapper, so e.g. profile.tsx's own
      // name/email/phone/DOB rows never reached screen_overview despite the
      // label being set at every call site for exactly this purpose.
      texts.push(props.accessibilityLabel.trim());
    }

    if (kind) {
      const { label, all } = firstLabel(el);
      const disabled = props.disabled === true || props.editable === false;

      if (kind === 'field') {
        // props.label first: wrappers like <Field label="Full name (as per PAN)" />
        // are child components with no text children, so the walk used to fall back
        // to the nearest preceding heading and mislabel them "About you"/"Contact".
        // Then own text > preceding sibling text > a11y label, placeholder last.
        const fieldLabel =
          props.label || label || recentText || props.accessibilityLabel || props.placeholder || '';
        const sensitive = isSensitiveField(String(fieldLabel), {
          secureTextEntry: props.secureTextEntry,
          textContentType: props.textContentType,
          autoComplete: props.autoComplete,
        });
        elements.push({
          id: makeId('field', String(fieldLabel)),
          kind: 'field',
          label: String(fieldLabel),
          sensitive,
          getValue: () => props.value,
          setValue: v => props.onChangeText?.(String(v)),
        });
      } else if (kind === 'toggle') {
        elements.push({
          id: makeId('toggle', label),
          kind: 'toggle',
          label,
          getValue: () => !!props.value,
          setValue: v => props.onValueChange?.(!!v),
        });
      } else {
        const btnLabel = label || all.join(' ').slice(0, 40);
        // An unlabelled control cannot be addressed by voice, and registering it
        // is actively harmful: empty labels match any query during fuzzy lookup.
        if (btnLabel) {
          elements.push({
            id: makeId('button', btnLabel),
            kind: 'button',
            label: btnLabel,
            disabled,
            onTap: () => props.onPress?.(),
          });
        }
      }
    }

    walk(props.children, depth + 1);
  };

  walk(children, 0);
  return { texts, elements };
}

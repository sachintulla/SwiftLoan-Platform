import React from 'react';
import { StyleSheet } from 'react-native';
import { beginPress, playManualSound, wasPressHandled } from './sounds';
import { AgentRing, useAgentFx } from './useAgentFx';
import { firstLabel } from '../voice/screenGraph';

/**
 * Lets the voice agent scroll to — and light up — any <Pressable> in the app.
 *
 * 18 screens build their buttons from raw <Pressable>, so doing this control by control would
 * mean touching all of them. Instead the `Pressable` export of react-native is swapped for a thin
 * wrapper that registers each labelled button (under the same label the agent sees it by), so the
 * page can scroll it into view before the agent taps it, and draws the agent's ring + ripple over
 * it. It makes NO sound: the user's own taps are silent (see src/config/sounds.ts).
 *
 * A Pressable that is handed a `ref` is one of the shared primitives in Controls.tsx, which do
 * all of this themselves (with their own, shape-aware animation) — the wrapper leaves those alone.
 *
 * Must run before any screen module is evaluated — see ./boot.ts.
 */
let installed = false;

/** The label the agent addresses this button by — mirrors screenGraph's own labelling. */
function labelOf(props: { accessibilityLabel?: unknown; children?: unknown }): string | undefined {
  if (typeof props.accessibilityLabel === 'string' && props.accessibilityLabel.trim()) {
    return props.accessibilityLabel.trim();
  }
  if (typeof props.children === 'function') return undefined;
  try {
    const { label } = firstLabel(React.createElement(React.Fragment, null, props.children as React.ReactNode));
    return label || undefined;
  } catch {
    return undefined;
  }
}

export function installPressableFx(): void {
  if (installed) return;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const rn = require('react-native');
  const Original = rn.Pressable;
  if (!Original) return;

  const FxPressable = React.forwardRef<unknown, any>(function FxPressable(props, ref) {
    const { onPress: userOnPress, children, style, ...rest } = props;
    // In test mode (src/config/sounds.ts) the user's own press clicks, unless the handler already
    // played a sound of its own (a chip, a toggle…). In production this is silent.
    const onPress = userOnPress
      ? (e: unknown) => {
          beginPress();
          try {
            return userOnPress(e);
          } finally {
            if (!wasPressHandled()) playManualSound('tap');
          }
        }
      : undefined;
    const managed = ref != null; // a shared primitive: it handles its own effects
    const label = !managed && onPress ? labelOf(props) : undefined;
    const fx = useAgentFx(label);

    if (!label) {
      return React.createElement(Original, { ...rest, style, ref, onPress }, children);
    }

    let radius = 12;
    if (style && typeof style !== 'function') {
      const r = StyleSheet.flatten(style as any)?.borderRadius;
      if (typeof r === 'number') radius = Math.min(r, 28);
    }
    const ring = React.createElement(AgentRing, { fx, radius, key: '__agentRing' });
    const kids: any =
      typeof children === 'function'
        ? (state: unknown) => React.createElement(React.Fragment, null, children(state), ring)
        : React.createElement(React.Fragment, null, children, ring);

    return React.createElement(Original, { ...rest, style, ref: fx.ref, onPress }, kids);
  });
  FxPressable.displayName = 'Pressable';

  try {
    Object.defineProperty(rn, 'Pressable', { configurable: true, enumerable: true, get: () => FxPressable });
    installed = true;
  } catch {
    // if the export is frozen we simply go without the generic click
  }
}

import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useOptionalStore } from '../state/store';
import { colors } from '../theme/tokens';
import { fxAnimates, fxKey, registerReveal, subscribeFx } from './agentFx';

/**
 * Hooks a control into the agent's choreography (see ./agentFx.ts):
 *
 *   - registers its View so the page can scroll it into view before the agent acts on it;
 *   - animates it when the agent targets it: a pulsing ring while it is "being worked on",
 *     a dip-and-ripple on a press.
 *
 * Purely visual — it never changes layout, and does nothing unless the agent acts on the
 * control (the animated values stay at rest otherwise).
 */
export interface AgentFx {
  ref: React.RefObject<View | null>;
  glow: Animated.Value;
  press: Animated.Value;
  ripple: Animated.Value;
  /** spread onto the element that should dip when pressed */
  pressStyle: { transform: { scale: Animated.AnimatedInterpolation<number> }[] };
}

export function useAgentFx(label?: string, group?: string): AgentFx {
  const screen = useOptionalStore()?.state.screen ?? '';
  const ref = useRef<View>(null);
  const glow = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(0)).current;
  const ripple = useRef(new Animated.Value(0)).current;

  useEffect(() => registerReveal(screen, label, group, ref), [screen, label, group]);

  useEffect(() => {
    if (!label) return undefined;
    const key = fxKey(label, group);
    let loop: Animated.CompositeAnimation | null = null;
    let safety: ReturnType<typeof setTimeout> | null = null;

    const stopLoop = () => {
      loop?.stop();
      loop = null;
      if (safety) clearTimeout(safety);
      safety = null;
    };
    const unsub = subscribeFx(e => {
      if (e.key !== key) return;
      if (!fxAnimates()) return; // visuals are off (tests)
      if (e.kind === 'focus') {
        stopLoop();
        glow.setValue(0);
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(glow, { toValue: 1, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(glow, { toValue: 0.4, duration: 380, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          ]),
        );
        loop.start();
        // never leave a ring burning if the 'done' event is lost
        safety = setTimeout(() => {
          stopLoop();
          Animated.timing(glow, { toValue: 0, duration: 250, useNativeDriver: true }).start();
        }, 8000);
      } else if (e.kind === 'press') {
        ripple.setValue(0);
        Animated.parallel([
          Animated.sequence([
            Animated.timing(press, { toValue: 1, duration: 80, useNativeDriver: true }),
            Animated.timing(press, { toValue: 0, duration: 170, easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
          ]),
          Animated.timing(ripple, { toValue: 1, duration: 480, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]).start();
      } else {
        stopLoop();
        Animated.timing(glow, { toValue: 0, duration: 420, useNativeDriver: true }).start();
      }
    });
    return () => {
      unsub();
      stopLoop();
    };
  }, [label, group, glow, press, ripple]);

  const pressStyle = useMemo(
    () => ({ transform: [{ scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] }) }] }),
    [press],
  );
  return { ref, glow, press, ripple, pressStyle };
}

/**
 * The visible half of the effect: a soft ring that pulses around its parent while the agent is
 * on it, plus a ripple that expands from it on a press. Drop it as the LAST child of the
 * control's own (position-relative) container.
 */
export function AgentRing({
  fx,
  radius = 12,
  inset = -3,
  style,
}: {
  fx: AgentFx;
  radius?: number;
  inset?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const box = { position: 'absolute' as const, top: inset, left: inset, right: inset, bottom: inset, borderRadius: radius + Math.abs(inset) };
  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[box, styles.ring, { opacity: fx.glow }, style]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          box,
          styles.ripple,
          {
            opacity: fx.ripple.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.55, 0] }),
            transform: [{ scale: fx.ripple.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] }) }],
          },
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  ring: {
    borderWidth: 2,
    borderColor: colors.mint,
    shadowColor: colors.mint,
    shadowOpacity: 0.55,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  ripple: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
});

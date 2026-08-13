import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  StatusBar,
  ScrollView,
  ViewStyle,
  StyleProp,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import Icon from './Icon';
import { LogoLockup } from './Logo';
import { colors, font, heroGradient, navGradient } from '../theme/tokens';
import { useStore, Screen as ScreenName } from '../state/store';
import { publishScreenGraph, registerTarget } from '../voice/actionRegistry';

/** Pure so it's directly unit-testable without mounting a ScrollView. */
export function scrollDelta(amount: 'small' | 'page', direction: 'up' | 'down' = 'down'): number {
  const magnitude = amount === 'page' ? 700 : 220;
  return direction === 'up' ? -magnitude : magnitude;
}
import { buildScreenGraph } from '../voice/screenGraph';
import { agent } from '../voice';
import { vlog } from '../voice/log';

/* ─────────────────────────────────────────────────────────────
 * App background — the layered radial + linear gradient ground used on all
 * non-hero screens, ported from the design root container. Faint ambient
 * banking icons drift behind the content, exactly as in the source.
 * ───────────────────────────────────────────────────────────── */
export function AppBackground({ children }: { children?: React.ReactNode }) {
  const { width, height } = useWindowDimensions();
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={['#FCFBF8', '#F5F9F8', '#EDF5F3']}
        start={{ x: 0.25, y: 0 }}
        end={{ x: 0.75, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
        <Defs>
          <RadialGradient id="mint" cx="0%" cy="0%" r="60%">
            <Stop offset="0" stopColor="#2FB183" stopOpacity={0.15} />
            <Stop offset="1" stopColor="#2FB183" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="peach" cx="100%" cy="3%" r="55%">
            <Stop offset="0" stopColor="#F5C996" stopOpacity={0.16} />
            <Stop offset="1" stopColor="#F5C996" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="teal" cx="100%" cy="100%" r="65%">
            <Stop offset="0" stopColor="#079FA0" stopOpacity={0.17} />
            <Stop offset="1" stopColor="#079FA0" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill="url(#mint)" />
        <Rect x="0" y="0" width={width} height={height} fill="url(#peach)" />
        <Rect x="0" y="0" width={width} height={height} fill="url(#teal)" />
      </Svg>
      {/* ambient motif icons */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
        <Icon name="currency_rupee" size={150} color="rgba(7,159,160,0.055)" style={{ position: 'absolute', top: 120, left: -18, transform: [{ rotate: '-12deg' }] }} />
        <Icon name="savings" size={170} color="rgba(47,177,131,0.05)" style={{ position: 'absolute', top: 340, right: -24, transform: [{ rotate: '14deg' }] }} />
        <Icon name="account_balance" size={150} color="rgba(7,159,160,0.05)" style={{ position: 'absolute', bottom: 60, left: -26, transform: [{ rotate: '-8deg' }] }} />
      </View>
      {children}
    </View>
  );
}

/* Hero (deep-teal) background used on splash / onboarding screens. */
export function HeroBackground({ children }: { children?: React.ReactNode }) {
  return (
    <LinearGradient
      colors={heroGradient as unknown as string[]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={StyleSheet.absoluteFill}
    >
      {children}
    </LinearGradient>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Screen wrapper — background variant, safe-area, optional scroll & bottom nav.
 * ───────────────────────────────────────────────────────────── */
export function Screen({
  variant = 'app',
  scroll = true,
  bottomNav = false,
  padded = true,
  contentStyle,
  footer,
  children,
}: {
  variant?: 'app' | 'hero' | 'plain';
  scroll?: boolean;
  bottomNav?: boolean;
  padded?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  /** Pinned bottom bar (e.g. a "Continue" CTA) that stays visible while content scrolls. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { state } = useStore();
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const Bg =
    variant === 'hero' ? HeroBackground : variant === 'plain' ? React.Fragment : AppBackground;
  const barStyle = variant === 'hero' ? 'light-content' : 'dark-content';
  const pad = padded ? { paddingHorizontal: 18 } : null;
  const bottomPad = { paddingBottom: (bottomNav ? 92 : 24) + insets.bottom };

  // Auto-discover every interactive element this screen rendered, so the voice
  // agent can address controls the shared primitives never wrap (most screens
  // build their rows from raw <Pressable>). Runs whenever the tree changes.
  useEffect(() => {
    try {
      const graph = buildScreenGraph(children);
      // Only notify the agent when the control set actually changed — otherwise
      // every keystroke would push a client-tools-update over the socket.
      if (publishScreenGraph(state.screen, graph.elements, graph.texts)) {
        vlog(
          'discovered',
          graph.elements.length,
          'controls on',
          state.screen,
          '->',
          graph.elements.map(e => `${e.kind}:${e.label}`).slice(0, 14),
        );
        agent.updatePageContext();
      }
    } catch {
      // discovery is best-effort — never break rendering over it
    }
  }, [children, state.screen]);

  // Registers this screen's scroll container as a voice-agent target — the RN
  // equivalent of the web SDK never needing one (browsers already scroll by
  // dispatching wheel/key events at the DOM; RN has no such generic hook).
  useEffect(() => {
    if (!scroll) return undefined;
    return registerTarget(state.screen, 'scroll', {
      kind: 'scroll',
      label: 'page',
      scrollBy: (amount, direction = 'down') => {
        const node = scrollRef.current;
        if (!node) return;
        if (amount === 'top') {
          node.scrollTo({ y: 0, animated: true });
          return;
        }
        if (amount === 'bottom') {
          node.scrollToEnd({ animated: true });
          return;
        }
        node.scrollTo({ y: Math.max(0, scrollOffsetRef.current + scrollDelta(amount, direction)), animated: true });
      },
    });
  }, [scroll, state.screen]);

  const inner = scroll ? (
    <ScrollView
      ref={scrollRef}
      onScroll={e => {
        scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={16}
      style={{ flex: 1 }}
      contentContainerStyle={[{ paddingTop: insets.top + 8 }, pad, bottomPad, contentStyle]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1, paddingTop: insets.top + 8 }, pad, bottomPad, contentStyle]}>
      {children}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: variant === 'hero' ? colors.inkDeep : colors.paper }}>
      <StatusBar barStyle={barStyle} translucent backgroundColor="transparent" />
      {/* @ts-ignore Fragment accepts no props */}
      <Bg>
        {inner}
        {/* Footer lives INSIDE the background wrapper (which is absoluteFill for
            the app/hero variants) so the flex:1 scroll area pushes it to the
            bottom. Placed as a sibling of Bg it floated to the top. */}
        {footer ? (
          <View
            style={{
              paddingHorizontal: 18,
              paddingTop: 10,
              paddingBottom: 10 + insets.bottom,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: 'rgba(10,63,65,0.12)',
              backgroundColor: colors.paper,
            }}
          >
            {footer}
          </View>
        ) : null}
      </Bg>
      {bottomNav ? <BottomNav /> : null}
      <Toast />
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Brand mark — mint rounded square with check + "Swift Loan" wordmark.
 * ───────────────────────────────────────────────────────────── */
export function BrandMark({ size = 34, light = false }: { size?: number; light?: boolean }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        backgroundColor: light ? '#FFFFFF' : colors.mint,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name="check" size={size * 0.68} color={light ? colors.primary : '#08312A'} />
    </View>
  );
}

export function BrandRow({ light = false, size = 30 }: { light?: boolean; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <BrandMark size={size} light={light} />
      <Text style={[font(800), { fontSize: size * 0.62, color: light ? '#fff' : colors.ink, letterSpacing: -0.3 }]}>
        Swift<Text style={{ color: light ? '#fff' : colors.primary }}>Loan</Text>
      </Text>
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Funnel header — back arrow + centered "Swift Loan" wordmark.
 * ───────────────────────────────────────────────────────────── */
export function AppHeader({
  onBack,
  title,
  right,
  light = false,
}: {
  onBack?: () => void;
  title?: React.ReactNode;
  right?: React.ReactNode;
  light?: boolean;
}) {
  const { state, back } = useStore();
  const tint = light ? '#fff' : colors.text;
  // The back button lives inside AppHeader (not in <Screen>'s children), so the
  // screen-graph walk can't see it. Register it so the go_back voice tool resolves.
  useEffect(() => {
    return registerTarget(state.screen, 'header:back', {
      kind: 'button',
      label: 'Back',
      onTap: onBack || back,
    });
  }, [state.screen, onBack, back]);
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack || back}
        hitSlop={10}
        style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.5 }]}
      >
        <Icon name="arrow_back" size={24} color={tint} />
      </Pressable>
      <View style={{ flex: 1, alignItems: 'center' }}>
        {title != null ? (
          typeof title === 'string' ? (
            <Text style={[font(700), { fontSize: 16, color: tint }]}>{title}</Text>
          ) : (
            title
          )
        ) : (
          <LogoLockup light={light} size={26} />
        )}
      </View>
      <View style={{ width: 40, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Bottom tab nav — Home / Loans / Profile, floating glass pill.
 * ───────────────────────────────────────────────────────────── */
const NAV_TABS: { key: ScreenName; icon: string; label: string }[] = [
  { key: 'home', icon: 'home', label: 'Home' },
  { key: 'loans', icon: 'description', label: 'Loans' },
  { key: 'profile', icon: 'person', label: 'Profile' },
];

export function BottomNav() {
  const { state, go } = useStore();
  const insets = useSafeAreaInsets();
  // BottomNav is rendered as a sibling of <Screen>'s children, so the screen-graph
  // walk never discovers it. Self-register the tabs so voice can "tap Home/Loans/Profile".
  useEffect(() => {
    const cleanups = NAV_TABS.map(tab =>
      registerTarget(state.screen, `nav:${tab.key}`, {
        kind: 'button',
        label: tab.label,
        onTap: () => go(tab.key),
      }),
    );
    return () => cleanups.forEach(fn => fn());
  }, [state.screen, go]);
  return (
    <View style={[styles.navWrap, { paddingBottom: insets.bottom || 16 }]} pointerEvents="box-none">
      <View style={styles.navBar}>
        {NAV_TABS.map(tab => {
          const active = state.screen === tab.key;
          return (
            <Pressable key={tab.key} accessibilityLabel={tab.label} onPress={() => go(tab.key)}>
              {active ? (
                <LinearGradient
                  colors={navGradient as unknown as string[]}
                  start={{ x: 0.1, y: 0 }}
                  end={{ x: 0.9, y: 1 }}
                  style={styles.navItem}
                >
                  <Icon name={tab.icon} size={24} color="#fff" />
                </LinearGradient>
              ) : (
                <View style={styles.navItem}>
                  <Icon name={tab.icon} size={24} color={colors.muted} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Toast — bottom pill notification, driven by store.toast.
 * ───────────────────────────────────────────────────────────── */
export function Toast() {
  const { state } = useStore();
  const insets = useSafeAreaInsets();
  if (!state.toast) return null;
  return (
    <View pointerEvents="none" style={[styles.toastWrap, { bottom: 104 + insets.bottom }]}>
      <View style={styles.toast}>
        <Icon name="bolt" size={16} color={colors.mint} />
        <Text style={[font(600), { color: '#fff', fontSize: 13, flexShrink: 1 }]}>{state.toast}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    marginBottom: 6,
  },
  backBtn: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  navWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  navBar: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 26,
    padding: 7,
    shadowColor: '#143C3A',
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
  navItem: {
    width: 54,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 24 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(15,42,43,0.96)',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 14,
    maxWidth: 360,
  },
});

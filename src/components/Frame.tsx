import React, { useEffect, useRef, useState } from 'react';
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
  Image,
  Animated,
  Easing,
} from 'react-native';
import type { AgentStatus } from '../voice/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Defs, RadialGradient, Stop, Rect, Path } from 'react-native-svg';
import Icon from './Icon';
import { LogoLockup } from './Logo';
import { colors, font, heroGradient } from '../theme/tokens';
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
      // Keyboard handling for forms: iOS insets the scroll content by the
      // keyboard height (so the focused field stays visible and the form no
      // longer jumps/scrolls the whole way); Android relies on adjustResize.
      // `false` keeps our explicit paddingTop from being overridden by the OS.
      automaticallyAdjustKeyboardInsets={true}
      automaticallyAdjustContentInsets={false}
      contentInsetAdjustmentBehavior="never"
      keyboardDismissMode="interactive"
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
// Bottom tab bar: Home · Offers · Support (centre, raised Ruby avatar) · My Loans
// · Profile. "Offers" opens the loan calculator (fare); "My Loans" the loans list;
// "Support" opens the Ruby help sheet (store.supportOpen).
type TabDef = { key: ScreenName | 'support'; icon: string; label: string };
const NAV_TABS: TabDef[] = [
  { key: 'home', icon: 'home', label: 'Home' },
  { key: 'fare', icon: 'local_offer', label: 'Offers' },
  { key: 'support', icon: 'support_agent', label: 'Support' },
  { key: 'loans', icon: 'description', label: 'My Loans' },
  { key: 'profile', icon: 'person', label: 'Profile' },
];

function NavTab({ tab, active, onPress }: { tab: TabDef; active: boolean; onPress: () => void }) {
  const tint = active ? colors.primary : colors.muted;
  return (
    <Pressable accessibilityLabel={tab.label} onPress={onPress} style={styles.navTab}>
      <Icon name={tab.icon} size={22} color={tint} />
      <Text style={[font(active ? 700 : 500), { fontSize: 10.5, color: tint, marginTop: 3 }]}>{tab.label}</Text>
    </Pressable>
  );
}

export function BottomNav() {
  const { state, go } = useStore();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  // Bar shape: a rounded white bar with a smooth concave notch scooped out of the
  // top-centre, which the raised Support "ball" nests into.
  const W = width - 24; // navWrap has 12px padding each side
  const H = 66;
  const cornerR = 26;
  const notchR = 40;
  const cx = W / 2;
  const barPath =
    `M0 ${cornerR}` +
    ` Q0 0 ${cornerR} 0` +
    ` L ${cx - notchR - 8} 0` +
    ` C ${cx - notchR + 6} 0 ${cx - notchR + 4} ${notchR * 0.86} ${cx} ${notchR * 0.86}` +
    ` C ${cx + notchR - 4} ${notchR * 0.86} ${cx + notchR - 6} 0 ${cx + notchR + 8} 0` +
    ` L ${W - cornerR} 0` +
    ` Q ${W} 0 ${W} ${cornerR}` +
    ` L ${W} ${H - cornerR}` +
    ` Q ${W} ${H} ${W - cornerR} ${H}` +
    ` L ${cornerR} ${H}` +
    ` Q 0 ${H} 0 ${H - cornerR}` +
    ` Z`;

  useEffect(() => {
    const cleanups = NAV_TABS.filter(t => t.key !== 'support').map(tab =>
      registerTarget(state.screen, `nav:${tab.key}`, { kind: 'button', label: tab.label, onTap: () => go(tab.key as ScreenName) }),
    );
    return () => cleanups.forEach(fn => fn());
  }, [state.screen, go]);

  return (
    <View style={[styles.navWrap, { paddingBottom: insets.bottom || 14 }]} pointerEvents="box-none">
      <View style={{ width: W, height: H }}>
        <Svg width={W} height={H} style={[StyleSheet.absoluteFill, styles.navShadow]}>
          <Path d={barPath} fill="#FFFFFF" />
        </Svg>
        <View style={styles.navRow}>
          {NAV_TABS.map(tab =>
            tab.key === 'support'
              ? <SupportTab key="support" />
              : <NavTab key={tab.key} tab={tab} active={state.screen === tab.key} onPress={() => go(tab.key as ScreenName)} />,
          )}
        </View>
      </View>
    </View>
  );
}

/**
 * Centre "Support" tab — a raised Ruby portrait inside a gradient glow ring.
 * Tapping opens the Support sheet. While a voice session is live the ring pulses
 * and a green "online" dot appears, so the button reads as an active assistant.
 */
function SupportTab() {
  const { set } = useStore();
  const [status, setStatus] = useState<AgentStatus>('idle');
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => agent.on('statusChange', setStatus), []);
  const online = status !== 'idle' && status !== 'ended';

  useEffect(() => {
    if (!online) { glow.setValue(0); return undefined; }
    const l = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1000, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    l.start();
    return () => l.stop();
  }, [online, glow]);

  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <Pressable accessibilityLabel="Support" onPress={() => set({ supportOpen: true })} style={styles.navTab}>
      <View style={styles.supportWrap}>
        {online ? <Animated.View style={[styles.supportGlow, { transform: [{ scale: glowScale }], opacity: glowOpacity }]} pointerEvents="none" /> : null}
        {/* Solid teal ring "ball" holding Ruby's portrait, nested in the notch. */}
        <View style={styles.supportRing}>
          <View style={styles.supportAvatar}>
            <Image source={require('../../assets/brand/agent-ruby.png')} style={styles.rubyImg} resizeMode="cover" />
          </View>
        </View>
        {/* Online dot — always shown (AI support is available 24/7). */}
        <View style={styles.supportDot} />
      </View>
      <Text style={[font(700), { fontSize: 10.5, color: colors.primary, marginTop: 3 }]}>Support</Text>
    </Pressable>
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
    paddingHorizontal: 12,
  },
  // Soft shadow for the notched SVG bar (follows the shape's alpha on iOS).
  navShadow: {
    shadowColor: '#143C3A',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  navRow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'flex-end', paddingBottom: 9 },
  navTab: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  // Centre Support "ball" — raised into the notch, solid teal ring + white gap.
  supportWrap: { width: 58, height: 58, marginTop: -34, alignItems: 'center', justifyContent: 'center' },
  supportGlow: { position: 'absolute', width: 58, height: 58, borderRadius: 29, backgroundColor: colors.mint },
  supportRing: {
    width: 58,
    height: 58,
    borderRadius: 29,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    shadowColor: '#0A3F41',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 9,
  },
  supportAvatar: { width: '100%', height: '100%', borderRadius: 25, overflow: 'hidden', borderWidth: 2.5, borderColor: '#fff', backgroundColor: colors.chip },
  rubyImg: { width: '100%', height: '100%' },
  supportDot: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: colors.green,
    borderWidth: 2,
    borderColor: '#fff',
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

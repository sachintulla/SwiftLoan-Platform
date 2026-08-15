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
// Labelled tabs sit either side of the centred Ruby FAB: Home + Offers on the
// left, Profile on the right. ("Offers" opens the existing calculator/fare screen.)
const LEFT_TABS: { key: ScreenName; icon: string; label: string }[] = [
  { key: 'home', icon: 'home', label: 'Home' },
  { key: 'fare', icon: 'local_offer', label: 'Offers' },
];
const RIGHT_TABS: { key: ScreenName; icon: string; label: string }[] = [
  { key: 'profile', icon: 'person', label: 'Profile' },
];
const ALL_NAV_TABS = [...LEFT_TABS, ...RIGHT_TABS];

function NavTab({ tab, active, onPress }: { tab: { key: ScreenName; icon: string; label: string }; active: boolean; onPress: () => void }) {
  const tint = active ? colors.primary : colors.muted;
  return (
    <Pressable accessibilityLabel={tab.label} onPress={onPress} style={styles.navTab}>
      <Icon name={tab.icon} size={23} color={tint} />
      <Text style={[font(active ? 700 : 500), { fontSize: 11, color: tint, marginTop: 2 }]}>{tab.label}</Text>
    </Pressable>
  );
}

export function BottomNav() {
  const { state, go } = useStore();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  // Bar geometry — the SVG path carves a top-centre notch the Ruby FAB nests in.
  const W = width - 32; // navWrap has 16px padding each side
  const H = 64;
  const cornerR = 26;
  const notchR = 42; // a touch wider than the FAB so there's a clean gap around it
  const cx = W / 2;
  const notchPath =
    `M0 ${cornerR}` +
    ` Q0 0 ${cornerR} 0` +
    ` L ${cx - notchR} 0` +
    ` A ${notchR} ${notchR} 0 0 0 ${cx + notchR} 0` +
    ` L ${W - cornerR} 0` +
    ` Q ${W} 0 ${W} ${cornerR}` +
    ` L ${W} ${H - cornerR}` +
    ` Q ${W} ${H} ${W - cornerR} ${H}` +
    ` L ${cornerR} ${H}` +
    ` Q 0 ${H} 0 ${H - cornerR}` +
    ` Z`;

  // BottomNav is a sibling of <Screen>'s children, so the screen-graph walk never
  // sees it. Self-register the tabs so voice can "tap Home/Offers/Profile".
  useEffect(() => {
    const cleanups = ALL_NAV_TABS.map(tab =>
      registerTarget(state.screen, `nav:${tab.key}`, { kind: 'button', label: tab.label, onTap: () => go(tab.key) }),
    );
    return () => cleanups.forEach(fn => fn());
  }, [state.screen, go]);

  return (
    <View style={[styles.navWrap, { paddingBottom: insets.bottom || 16 }]} pointerEvents="box-none">
      <View style={{ width: W, height: H }}>
        <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
          <Path d={notchPath} fill="rgba(255,255,255,0.96)" stroke="rgba(255,255,255,0.7)" strokeWidth={1} />
        </Svg>

        <View style={styles.navRow}>
          <View style={styles.navGroup}>
            {LEFT_TABS.map(tab => (
              <NavTab key={tab.key} tab={tab} active={state.screen === tab.key} onPress={() => go(tab.key)} />
            ))}
          </View>
          <View style={{ width: notchR * 2 }} />
          <View style={styles.navGroup}>
            {RIGHT_TABS.map(tab => (
              <NavTab key={tab.key} tab={tab} active={state.screen === tab.key} onPress={() => go(tab.key)} />
            ))}
          </View>
        </View>

        <RubyNotchFab centerX={cx} />
      </View>
    </View>
  );
}

/**
 * Ruby voice FAB that nests in the tab-bar notch. Idle it shows a headphones
 * icon; tapping starts the voice session and Ruby's portrait "peeks" up out of
 * the notch with a spring, fading the headphones out. Tap again to stop and she
 * ducks back down. A pulse ring + breathing scale signal she's live.
 */
function RubyNotchFab({ centerX }: { centerX: number }) {
  const [status, setStatus] = useState<AgentStatus>('idle');
  const peek = useRef(new Animated.Value(0)).current; // 0 idle → 1 live
  const pulse = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => agent.on('statusChange', setStatus), []);

  const live = status === 'connecting' || status === 'listening' || status === 'speaking' || status === 'executingTool';

  useEffect(() => {
    Animated.spring(peek, { toValue: live ? 1 : 0, useNativeDriver: true, friction: 6, tension: 70 }).start();
    if (!live) { pulse.setValue(0); breathe.setValue(0); return; }
    const p = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    p.start(); b.start();
    return () => { p.stop(); b.stop(); };
  }, [live, peek, pulse, breathe]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });
  const breatheScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const avatarTranslate = peek.interpolate({ inputRange: [0, 1], outputRange: [8, -52] });
  const avatarScale = peek.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const avatarOpacity = peek.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.2, 1] });
  const hpOpacity = peek.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  const onPress = () => {
    if (live) agent.stop().catch(() => {});
    else agent.start().catch(() => {});
  };

  return (
    <View style={[styles.fabWrap, { left: centerX - 37 }]} pointerEvents="box-none">
      {/* Ruby's portrait — hidden behind the FAB at idle, springs up when live. */}
      <Animated.View
        style={[styles.peekAvatar, { opacity: avatarOpacity, transform: [{ translateY: avatarTranslate }, { scale: Animated.multiply(avatarScale, breatheScale) }] }]}
        pointerEvents="none"
      >
        <Image source={require('../../assets/brand/agent-ruby.png')} style={styles.rubyImg} resizeMode="cover" />
      </Animated.View>

      {/* Pulse ring while live. */}
      {live ? <Animated.View style={[styles.fabPulse, { transform: [{ scale: ringScale }], opacity: ringOpacity }]} pointerEvents="none" /> : null}

      <Pressable accessibilityLabel="Talk to Ruby" onPress={onPress}>
        <LinearGradient
          colors={navGradient as unknown as string[]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.notchFab}
        >
          <Animated.View style={{ opacity: hpOpacity }}>
            <Icon name="headset_mic" size={27} color="#fff" />
          </Animated.View>
        </LinearGradient>
      </Pressable>
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
  // The notched bar is drawn by the SVG <Path>; this shadow lifts the whole bar.
  navRow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center' },
  navGroup: { flex: 1, flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center' },
  navTab: { alignItems: 'center', justifyContent: 'center', paddingVertical: 6, minWidth: 56 },
  // Ruby FAB, lifted into the notch at the top-centre of the bar.
  fabWrap: { position: 'absolute', top: -24, width: 74, alignItems: 'center' },
  notchFab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#fff',
    shadowColor: '#0A3F41',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 9,
  },
  peekAvatar: {
    position: 'absolute',
    top: 0,
    width: 54,
    height: 54,
    borderRadius: 27,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#fff',
    backgroundColor: '#E1F3F3',
  },
  rubyImg: { width: '100%', height: '100%' },
  fabPulse: { position: 'absolute', top: 0, width: 60, height: 60, borderRadius: 30, backgroundColor: colors.mint },
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

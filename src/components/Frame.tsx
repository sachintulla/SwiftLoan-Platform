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
  Vibration,
  Keyboard,
} from 'react-native';
import type { AgentStatus } from '../voice/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Defs, RadialGradient, Stop, Rect, Path } from 'react-native-svg';
import Icon from './Icon';
import { LogoLockup } from './Logo';
import { colors, font, heroGradient } from '../theme/tokens';
import { useStore, Screen as ScreenName, TAB_SCREENS } from '../state/store';
import { publishScreenGraph, registerTarget } from '../voice/actionRegistry';

/** Pure so it's directly unit-testable without mounting a ScrollView. */
export function scrollDelta(amount: 'small' | 'page', direction: 'up' | 'down' = 'down'): number {
  const magnitude = amount === 'page' ? 700 : 220;
  return direction === 'up' ? -magnitude : magnitude;
}
import { buildScreenGraph } from '../voice/screenGraph';
import { agent } from '../voice';
import { onAudioLevel } from '../voice/audio/nativeAudioBridge';
import { vlog } from '../voice/log';

// The assistant avatar is the single persistent floating FAB (VoiceWidget) that
// animates into the tab-bar notch on tab screens. With this on, the tab bar
// reserves the notch (no duplicate avatar) and the FAB owns the visual.
const FAB_OWNS_NOTCH = true;

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
  header,
  collapsingTitle,
  headerRight,
  footer,
  children,
}: {
  variant?: 'app' | 'hero' | 'plain';
  scroll?: boolean;
  bottomNav?: boolean;
  padded?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  /** Pinned top bar (e.g. an AppHeader/back button) that stays fixed while content scrolls. */
  header?: React.ReactNode;
  /** Right-side action rendered in the collapsingTitle header (e.g. a HeaderCta). */
  headerRight?: React.ReactNode;
  /**
   * iOS-style collapsing title: renders a pinned AppHeader (back button always
   * visible) whose title fades in only once the large in-content title has
   * scrolled away — so the fixed header never sits empty. Takes precedence over
   * `header` when set.
   */
  collapsingTitle?: string;
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
  // A pinned header (explicit `header` or a `collapsingTitle`) already consumes
  // the top safe-area inset, so the scroll content starts with just a small gap
  // (no double top padding).
  const hasPinnedHeader = header != null || collapsingTitle != null;
  const contentTopPad = hasPinnedHeader ? 8 : insets.top + 8;

  // Collapsing-title fade: 0 while at the top (large title visible), 1 once
  // scrolled past it, so the pinned header shows the title instead of empty space.
  const titleAnim = useRef(new Animated.Value(0)).current;
  const titleShown = useRef(false);
  const onScrollY = (y: number) => {
    scrollOffsetRef.current = y;
    if (collapsingTitle == null) return;
    const shouldShow = y > 52;
    if (shouldShow !== titleShown.current) {
      titleShown.current = shouldShow;
      Animated.timing(titleAnim, { toValue: shouldShow ? 1 : 0, duration: 160, useNativeDriver: true }).start();
    }
  };
  const headerEl = collapsingTitle != null ? (
    <AppHeader
      right={headerRight}
      title={
        <Animated.Text
          numberOfLines={1}
          style={[font(700), { fontSize: 16, color: variant === 'hero' ? '#fff' : colors.text, opacity: titleAnim }]}
        >
          {collapsingTitle}
        </Animated.Text>
      }
    />
  ) : header;
  const bottomPad = { paddingBottom: (bottomNav ? 92 : 24) + insets.bottom };

  // Auto-discover every interactive element this screen rendered, so the voice
  // agent can address controls the shared primitives never wrap (most screens
  // build their rows from raw <Pressable>). Runs whenever the tree changes.
  useEffect(() => {
    try {
      const graph = buildScreenGraph(children);
      // A freshly-mounted data screen's (profile, offers, loans) very first
      // render fires before its async load() resolves, so this walk finds
      // nothing yet — no real screen ever settles at zero. Publishing that
      // snapshot doesn't just cause a redundant resend once the real content
      // arrives a moment later — on this session's very first visit to such a
      // screen, fields sourced from data that load() hasn't populated yet
      // (e.g. profile's date of birth) are genuinely empty in it, and the
      // agent had no way to know that snapshot wasn't real: it read "date of
      // birth: ''" as the user's actual data and proactively suggested filling
      // it in. Never publish a 0-control snapshot; wait for the real one.
      if (graph.elements.length === 0) return;
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

  // A typed field's VALUE is deliberately excluded from the publish signature
  // above (see its comment) — otherwise every keystroke would push a
  // client-tools-update over the socket. That means the agent only ever
  // learned what someone typed by coincidence, next time it happened to act
  // or read the screen — it had no way to know "the user just finished
  // entering their PAN" the moment it actually happened. `keyboardDidHide`
  // is a global, once-per-blur RN event (dismiss, Return key, tapping away,
  // or focus moving to a non-text control) — never fires mid-keystroke, so
  // it's exactly the natural throttle a per-value signature would have to
  // build from scratch. autoByScreen/screenTexts are already current (every
  // render updates them regardless of whether a notification fired), so this
  // just needs to trigger the send — updatePageContext() reads them fresh.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidHide', () => agent.updatePageContext());
    return () => sub.remove();
  }, []);

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
      onScroll={e => onScrollY(e.nativeEvent.contentOffset.y)}
      scrollEventThrottle={16}
      style={{ flex: 1 }}
      contentContainerStyle={[{ paddingTop: contentTopPad }, pad, bottomPad, contentStyle]}
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
    <View style={[{ flex: 1, paddingTop: contentTopPad }, pad, bottomPad, contentStyle]}>
      {children}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: variant === 'hero' ? colors.inkDeep : colors.paper }}>
      <StatusBar barStyle={barStyle} translucent backgroundColor="transparent" />
      {/* @ts-ignore Fragment accepts no props */}
      <Bg>
        {/* Pinned top bar (e.g. the back button) — stays fixed while content
            scrolls beneath it. Consumes the top safe-area inset itself. */}
        {headerEl ? (
          <View style={{ paddingTop: insets.top, paddingHorizontal: 20 }}>{headerEl}</View>
        ) : null}
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
      {/* The tab bar is rendered once at the app root (App.tsx) as a persistent,
          sliding element — no longer per-screen — so it can animate down/up
          across navigations while the FAB rolls between corner and notch. */}
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
      <View style={[{ alignItems: 'flex-end', justifyContent: 'center' }, right ? { minWidth: 40 } : { width: 40 }]}>{right}</View>
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
  { key: 'fare', icon: 'local_offer', label: 'My Offers' },
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
  const notchR = 46;
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

  // Persistent bar: it's mounted for every screen and SLIDES DOWN off-screen on
  // full (non-tab) screens, then springs back up on tab screens — the FAB
  // (rendered above this) stays put and rolls to/from the notch independently.
  const isTab = TAB_SCREENS.has(state.screen);
  const hiddenY = H + (insets.bottom || 14) + 16;
  const slide = useRef(new Animated.Value(isTab ? 0 : hiddenY)).current;
  useEffect(() => {
    Animated.spring(slide, { toValue: isTab ? 0 : hiddenY, useNativeDriver: true, friction: 9, tension: 70 }).start();
  }, [isTab, hiddenY, slide]);

  return (
    <Animated.View
      style={[styles.navWrap, { paddingBottom: insets.bottom || 14, transform: [{ translateY: slide }] }]}
      pointerEvents="box-none"
    >
      <View style={{ width: W, height: H }}>
        <Svg width={W} height={H + 24} style={StyleSheet.absoluteFill}>
          {/* Manual soft drop-shadow: layered, offset, semi-transparent copies
              behind the bar — tinted with the app's teal so it matches the theme. */}
          <Path d={barPath} fill={colors.primary} opacity={0.06} transform="translate(0 14)" />
          <Path d={barPath} fill={colors.primary} opacity={0.08} transform="translate(0 10)" />
          <Path d={barPath} fill={colors.primary} opacity={0.10} transform="translate(0 6)" />
          <Path d={barPath} fill={colors.primary} opacity={0.12} transform="translate(0 3)" />
          {/* The bar itself — hairline stroke so it always separates from the screen. */}
          <Path d={barPath} fill="#FFFFFF" stroke={colors.line} strokeWidth={1} />
        </Svg>
        <View style={styles.navRow}>
          {NAV_TABS.map(tab =>
            tab.key === 'support'
              ? <SupportTab key="support" />
              : <NavTab key={tab.key} tab={tab} active={state.screen === tab.key} onPress={() => go(tab.key as ScreenName)} />,
          )}
        </View>
      </View>
    </Animated.View>
  );
}

/**
 * Centre "Support" tab — a raised Ruby portrait "ball" nested in the notch.
 * Tapping starts the Ruby voice session directly (no sheet): while it's
 * connecting a spinner ring runs around the ball and the label reads
 * "Connecting…"; once connected the ring pulses and a green "online" dot shows.
 * Tapping again ends the session.
 */
function SupportTab() {
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [starting, setStarting] = useState(false);
  const spin = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => agent.on('statusChange', s => {
    setStatus(s);
    // Once the agent reports any live/terminal state, the local "starting" hop is over.
    if (s !== 'idle') setStarting(false);
  }), []);

  const connecting = starting || status === 'connecting';
  const live = status === 'listening' || status === 'speaking' || status === 'executingTool';
  const online = connecting || live;

  // Talking motion driven by Ruby's live playback loudness (0…1) — a gentle
  // scale + bob so the avatar visibly "speaks" in sync with her voice, on-device.
  const mouth = useRef(new Animated.Value(0)).current;
  useEffect(() => onAudioLevel(l => {
    Animated.timing(mouth, { toValue: l, duration: 70, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }), [mouth]);
  const talkScale = mouth.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const talkBob = mouth.interpolate({ inputRange: [0, 1], outputRange: [0, -2.5] });

  // Spinner ring while connecting.
  useEffect(() => {
    if (!connecting) { spin.setValue(0); return undefined; }
    const l = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 850, easing: Easing.linear, useNativeDriver: true }));
    l.start();
    return () => l.stop();
  }, [connecting, spin]);

  // Pulse glow once connected/live.
  useEffect(() => {
    if (!live) { glow.setValue(0); return undefined; }
    const l = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1000, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    l.start();
    return () => l.stop();
  }, [live, glow]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  const onPress = () => {
    // Small haptic so the tap registers immediately, before the (async) connect.
    Vibration.vibrate(20);
    if (live || connecting) {
      agent.stop().catch(() => {});
      setStarting(false);
    } else {
      setStarting(true);
      agent.start().catch(() => setStarting(false));
    }
  };

  return (
    <Pressable accessibilityLabel="Support" onPress={onPress} style={styles.navTab}>
      {/* The raised Ruby avatar is the persistent floating FAB (VoiceWidget),
          which rolls INTO this notch on tab screens — so the tab only reserves
          the notch tap-area + label here (no duplicate avatar). */}
      {FAB_OWNS_NOTCH ? (
        <View style={styles.supportWrap} />
      ) : (
      <View style={styles.supportWrap}>
        {live ? <Animated.View style={[styles.supportGlow, { transform: [{ scale: glowScale }], opacity: glowOpacity }]} pointerEvents="none" /> : null}
        {connecting ? <Animated.View style={[styles.supportSpinner, { transform: [{ rotate }] }]} pointerEvents="none" /> : null}
        <Animated.View style={[styles.supportAvatar, { transform: [{ scale: talkScale }, { translateY: talkBob }] }]}>
          <Image source={require('../../assets/brand/agent-ruby.png')} style={styles.rubyImg} resizeMode="cover" />
        </Animated.View>
        {online ? <View style={[styles.supportDot, { backgroundColor: live ? colors.green : colors.amber }]} /> : null}
      </View>
      )}
      <Text style={[font(700), { fontSize: 10.5, color: colors.primary, marginTop: 3 }]}>
        {connecting
          ? 'Connecting…'
          : status === 'speaking'
            ? 'Speaking…'
            : status === 'executingTool'
              ? 'Working…'
              : live
                ? 'Listening…' /* connected, mic open — ready to talk */
                : 'Support'}
      </Text>
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
  // Centre Support avatar — a large, borderless portrait raised into the notch.
  supportWrap: { width: 70, height: 70, marginTop: -42, alignItems: 'center', justifyContent: 'center' },
  supportGlow: { position: 'absolute', width: 70, height: 70, borderRadius: 35, backgroundColor: colors.mint },
  supportSpinner: {
    position: 'absolute',
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 3,
    borderColor: 'transparent',
    borderTopColor: colors.primary,
    borderRightColor: colors.primary,
  },
  supportAvatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#fff',
    backgroundColor: colors.chip,
    shadowColor: '#0A3F41',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 9,
  },
  rubyImg: { width: '100%', height: '100%' },
  supportDot: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.green,
    borderWidth: 2.5,
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

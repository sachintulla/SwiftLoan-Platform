import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Easing, useWindowDimensions } from 'react-native';
import { Screen, AppHeader } from '../components/Frame';
import Icon from '../components/Icon';
import { colors, font, inr } from '../theme/tokens';
import { useStore } from '../state/store';
import { useDrive } from '../utils/useDrive';

const CONFETTI_COLORS = ['#2FB183', '#079FA0', '#F5A624', '#7DC24B', '#0E8C7E', '#E9C21F', '#EF6A5E'];

export default function Disbursed() {
  const { go, showToast } = useStore();
  const t = useDrive(1400);
  const dbAmount = '₹' + inr(25000 * t) + '.00';

  return (
    <Screen scroll padded={false}>
      <Confetti />
      <View style={{ paddingHorizontal: 20 }}>
        <AppHeader onBack={() => go('home')} title={<View />} />
      </View>
      <View style={{ paddingHorizontal: 24, alignItems: 'center' }}>
        <SuccessCheck />
        <View style={styles.aiBadge}>
          <Icon name="auto_awesome" size={13} color={colors.primary} />
          <Text style={[font(700), { fontSize: 10.5, color: colors.primary, letterSpacing: 0.3 }]}>Powered by AI</Text>
        </View>
        <Text style={[font(800), { fontSize: 26, letterSpacing: -0.5, color: colors.text, marginTop: 14, textAlign: 'center' }]}>Funds on the way!</Text>
        <Text style={[font(400), { fontSize: 14, lineHeight: 20, color: colors.textSoft, marginTop: 6, textAlign: 'center' }]}>
          ₹25,000 is being transferred to your bank account ending in ••4291.
        </Text>

        <View style={styles.summary}>
          <View style={styles.sumHead}>
            <Text style={[font(700), { fontSize: 13.5, color: colors.text }]}>Transaction summary</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="verified" size={15} color={colors.mint} />
              <Text style={[font(600), { fontSize: 12, color: colors.greenDeep }]}>Instant</Text>
            </View>
          </View>
          <Row label="Loan amount" value={dbAmount} />
          <Row label="Credited to" value="A/c ••4291" />
          <Row label="Tenure" value="12 Months" />
          <Row label="First EMI date" value="Oct 05, 2023" />
        </View>

        <Pressable style={styles.primaryBtn} onPress={() => go('repay')}>
          <Text style={[font(700), { color: '#fff', fontSize: 15 }]}>Go to Dashboard</Text>
          <Icon name="arrow_forward" size={18} color="#fff" />
        </Pressable>
        <Pressable style={styles.ghostBtn} onPress={() => showToast('Receipt — coming soon.')}>
          <Icon name="receipt_long" size={18} color={colors.text} />
          <Text style={[font(600), { color: colors.text, fontSize: 15 }]}>View Receipt</Text>
        </Pressable>
        <Text style={[font(400), { fontSize: 10.5, lineHeight: 15, color: colors.muted, textAlign: 'center', marginTop: 14 }]}>
          SwiftLoan is a regulated entity. Transaction processed via Secure Gateway. TransID: SL-9821-X.
        </Text>
      </View>
    </Screen>
  );
}

function SuccessCheck() {
  const scale = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
  }, [scale]);
  return (
    <Animated.View style={[styles.checkOrb, { transform: [{ scale }] }]}>
      <Icon name="check_circle" size={64} color="#fff" />
    </Animated.View>
  );
}

function Confetti() {
  const { width } = useWindowDimensions();
  const pieces = Array.from({ length: 28 }, (_, i) => ({
    left: ((i * 37 + 5) % 100) / 100 * width,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    delay: (i % 8) * 110,
    dur: 2100 + (i % 5) * 350,
    size: 6 + (i % 4) * 2,
    round: i % 3 === 0,
  }));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => (
        <ConfettiPiece key={i} {...p} />
      ))}
    </View>
  );
}

function ConfettiPiece({ left, color, delay, dur, size, round }: { left: number; color: string; delay: number; dur: number; size: number; round: boolean }) {
  const { height } = useWindowDimensions();
  const y = useRef(new Animated.Value(-30)).current;
  const rot = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(y, { toValue: height, duration: dur, delay, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.loop(Animated.timing(rot, { toValue: 1, duration: 900, useNativeDriver: true })),
    ]).start();
  }, [y, rot, height, dur, delay]);
  const rotate = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left,
        width: size,
        height: round ? size : size + 4,
        backgroundColor: color,
        borderRadius: round ? size : 2,
        transform: [{ translateY: y }, { rotate }],
      }}
    />
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={[font(500), { fontSize: 13, color: colors.textSoft }]}>{label}</Text>
      <Text style={[font(700), { fontSize: 13.5, color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  checkOrb: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    shadowColor: colors.mint,
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(7,159,160,0.1)', borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 4, marginTop: 16 },
  summary: { alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 18, padding: 16, marginTop: 22 },
  sumHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  primaryBtn: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 54, borderRadius: 16, backgroundColor: colors.primary, marginTop: 18 },
  ghostBtn: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 14, borderWidth: 1.5, borderColor: colors.line, marginTop: 10, backgroundColor: 'rgba(255,255,255,0.6)' },
});

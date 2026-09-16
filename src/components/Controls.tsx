import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  PanResponder,
  LayoutChangeEvent,
  ViewStyle,
  StyleProp,
  TextStyle,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from './Icon';
import { colors, font, navGradient } from '../theme/tokens';
import { useStore } from '../state/store';
import { registerTarget } from '../voice/actionRegistry';
import { useVoiceTarget } from '../voice/useVoiceTarget';
import { isSensitiveField } from '../voice/sensitive';

/* Card — white rounded surface with soft border + shadow. */
export function Card({
  style,
  children,
  onPress,
}: {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  onPress?: () => void;
}) {
  const body = <View style={[styles.card, style]}>{children}</View>;
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.92 }}>
        {body}
      </Pressable>
    );
  }
  return body;
}

/* Primary CTA — filled teal→mint gradient pill with optional trailing icon.
 * voiceId (or the label, if omitted) registers this button as a voice-agent
 * tappable target on the current screen — see src/voice/actionRegistry.ts. */
export function PrimaryButton({
  label,
  onPress,
  icon = 'arrow_forward',
  disabled = false,
  style,
  solid = false,
  voiceId,
}: {
  label: string;
  onPress?: () => void;
  icon?: string | null;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  solid?: boolean;
  voiceId?: string;
}) {
  const { state } = useStore();
  useEffect(() => {
    // Registered even when disabled, so the agent can see the control exists and
    // be told it isn't pressable yet rather than getting a bare "not_found".
    return registerTarget(state.screen, voiceId || label, {
      kind: 'button',
      label,
      disabled,
      onTap: onPress,
      primary: true,
    });
  }, [state.screen, voiceId, label, onPress, disabled]);

  const content = (
    <View style={styles.btnInner}>
      <Text style={[font(700), styles.btnLabel]}>{label}</Text>
      {icon ? <Icon name={icon} size={20} color="#fff" /> : null}
    </View>
  );
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [{ opacity: disabled ? 0.45 : pressed ? 0.9 : 1 }, style]}
    >
      {solid ? (
        <View style={[styles.btn, { backgroundColor: colors.primary }]}>{content}</View>
      ) : (
        <LinearGradient
          colors={navGradient as unknown as string[]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.btn}
        >
          {content}
        </LinearGradient>
      )}
    </Pressable>
  );
}

/* Secondary / ghost button. */
export function GhostButton({
  label,
  onPress,
  icon,
  style,
  voiceId,
}: {
  label: string;
  onPress?: () => void;
  icon?: string;
  style?: StyleProp<ViewStyle>;
  voiceId?: string;
}) {
  const { state } = useStore();
  useEffect(() => {
    return registerTarget(state.screen, voiceId || label, { kind: 'button', label, onTap: onPress });
  }, [state.screen, voiceId, label, onPress]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.ghost, pressed && { opacity: 0.6 }, style]}
    >
      {icon ? <Icon name={icon} size={18} color={colors.text} /> : null}
      <Text style={[font(600), { color: colors.text, fontSize: 15 }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Compact header CTA — a small teal pill for the top-right action slot of a
 * screen header (e.g. "Continue" / "Upload PAN & Verify" on the funnel steps).
 * Registered as a voice target like the other buttons.
 */
export function HeaderCta({
  label,
  onPress,
  disabled = false,
  icon,
  voiceId,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  icon?: string;
  voiceId?: string;
}) {
  const { state } = useStore();
  useEffect(() => {
    return registerTarget(state.screen, voiceId || label, { kind: 'button', label, onTap: onPress });
  }, [state.screen, voiceId, label, onPress]);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.headerCta, disabled && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
    >
      <Text style={[font(700), { color: '#fff', fontSize: 13.5 }]} numberOfLines={1}>{label}</Text>
      {icon ? <Icon name={icon} size={16} color="#fff" /> : null}
    </Pressable>
  );
}

/* Toggle switch — track on #2FB183 / off #D3DDDD, 46×27, knob 21.
 * Toggle has no visible text of its own (the label lives in the parent
 * screen's own <Text>), so it needs an explicit voiceId or label prop to be
 * voice-addressable — the one Controls primitive that isn't covered for free. */
export function Toggle({
  value,
  onChange,
  label,
  voiceId,
}: {
  value: boolean;
  onChange?: (v: boolean) => void;
  label?: string;
  voiceId?: string;
}) {
  const { state } = useStore();
  useEffect(() => {
    const id = voiceId || label;
    if (!id) return undefined;
    return registerTarget(state.screen, id, {
      kind: 'toggle',
      label: id,
      getValue: () => value,
      setValue: v => onChange?.(!!v),
    });
  }, [state.screen, voiceId, label, value, onChange]);

  return (
    <Pressable onPress={() => onChange?.(!value)} hitSlop={8}>
      <View style={[styles.track, { backgroundColor: value ? colors.mint : colors.trackOff }]}>
        <View style={[styles.knob, { transform: [{ translateX: value ? 19 : 0 }] }]} />
      </View>
    </Pressable>
  );
}

/* Segmented chips (single-select), e.g. Male / Female / Other. Each option
 * registers as its own voice-tappable target under its own visible label. */
export function Chips({
  options,
  value,
  onChange,
  style,
}: {
  options: { label: string; value: string }[];
  value: string | null;
  onChange?: (v: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { state } = useStore();
  useEffect(() => {
    const unregisters = options.map(o =>
      registerTarget(state.screen, `chip:${o.label}`, { kind: 'chips', label: o.label, onTap: () => onChange?.(o.value) }),
    );
    return () => unregisters.forEach(u => u());
  }, [state.screen, options, onChange]);

  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, style]}>
      {options.map(o => {
        const on = value === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange?.(o.value)}
            style={[styles.chip, on ? styles.chipOn : styles.chipOff]}
          >
            <Text style={[font(on ? 700 : 600), { color: on ? colors.greenDeep : colors.textSoft, fontSize: 13 }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* Consent checkbox row. Registers under voiceId, or its children text when
 * that's a plain string — otherwise it's skipped (same rationale as Toggle). */
export function ConsentRow({
  checked,
  onChange,
  children,
  voiceId,
}: {
  checked: boolean;
  onChange?: (v: boolean) => void;
  children: React.ReactNode;
  voiceId?: string;
}) {
  const { state } = useStore();
  useEffect(() => {
    const id = voiceId || (typeof children === 'string' ? children : undefined);
    if (!id) return undefined;
    return registerTarget(state.screen, id, {
      kind: 'consent',
      label: id,
      getValue: () => checked,
      setValue: v => onChange?.(!!v),
    });
  }, [state.screen, voiceId, children, checked, onChange]);

  return (
    <Pressable onPress={() => onChange?.(!checked)} style={styles.consent}>
      <View style={[styles.box, checked && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
        {checked ? <Icon name="check" size={15} color="#fff" /> : null}
      </View>
      <Text style={[font(500), { flex: 1, color: colors.textSoft, fontSize: 12.5, lineHeight: 18 }]}>{children}</Text>
    </Pressable>
  );
}

/* Labeled text field. Forwards secureTextEntry/textContentType/autoComplete so
 * the voice agent can detect + refuse to fill sensitive fields (OTP/PIN/etc.)
 * the same way the web SDK's isSensitiveInput did, just via real RN props
 * instead of DOM attribute sniffing. */
export function Field({
  label,
  hint,
  style,
  voiceId,
  value,
  onChangeText,
  ...props
}: {
  label?: string;
  hint?: string;
  voiceId?: string;
} & React.ComponentProps<typeof TextInput>) {
  const id = voiceId || label || hint;
  // Registered via useVoiceTarget (like Slider below), NOT a hand-rolled
  // registerTarget call — Field is the one Controls.tsx primitive whose own
  // call site passes onChangeText directly (`<Field ... onChangeText={...}/>`
  // in every screen that uses it), which is exactly the prop name
  // screenGraph.ts's auto-discovery walk checks for, so every Field is ALSO
  // auto-discovered independently. A hand-rolled registerTarget(state.screen,
  // id, ...) used to register under the bare id ("First name (as per PAN)")
  // while the auto-discovered copy registers under "field:First name (as per
  // PAN)" — different keys, so mergedTargets() never deduped them, and every
  // text field on a screen was listed twice in available_actions. Confirmed
  // live: a bloated, duplicated available_actions payload landing after a
  // tool call is a plausible contributor to the agent repeating itself.
  // useVoiceTarget already produces the matching `field:${id}` key.
  const sensitive = isSensitiveField(id || '', {
    secureTextEntry: props.secureTextEntry,
    textContentType: props.textContentType as string | undefined,
    autoComplete: props.autoComplete as string | undefined,
  });
  useVoiceTarget(
    id,
    {
      kind: 'field',
      sensitive,
      getValue: () => value as string,
      setValue: v => onChangeText?.(String(v)),
    },
    [value, onChangeText, props.secureTextEntry, props.textContentType, props.autoComplete],
  );

  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={[font(600), styles.fieldLabel]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.muted}
        style={[styles.input, font(500), style as StyleProp<TextStyle>]}
        {...props}
        value={value}
        onChangeText={onChangeText}
      />
      {hint ? <Text style={[font(400), { color: colors.muted, fontSize: 11.5 }]}>{hint}</Text> : null}
    </View>
  );
}

/* Custom slider (PanResponder) — track + teal fill + thumb. Matches the design's
 * bespoke range inputs (amount / tenure / rate).
 *
 * `label` makes the slider voice-addressable. It is registered via a hook rather
 * than left to the element-tree walk because sliders live inside EmiCalculator,
 * and that walk cannot see inside child components. Values are clamped to
 * min/max/step so a spoken "set tenure to 500" can't push state out of range. */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange?: (v: number) => void;
  label?: string;
}) {
  // A Slider is driven by PanResponder, so it exposes no onPress/onChangeText for
  // the element-tree walk to detect — without `label` it is completely invisible to
  // voice, silently. Warn in dev so a new slider can't ship unreachable.
  if (__DEV__ && !label) {
    console.warn(
      '[voice] <Slider> is missing a `label` prop, so it cannot be controlled by voice. ' +
        'Pass the visible label, e.g. label="Desired loan amount".',
    );
  }

  useVoiceTarget(
    label,
    {
      kind: 'slider',
      getValue: () => value,
      setValue: v => {
        const n = Number(v);
        if (!Number.isFinite(n)) return;
        const snapped = Math.round(n / step) * step;
        onChange?.(Math.max(min, Math.min(max, snapped)));
      },
    },
    [value, min, max, step, onChange],
  );

  const [w, setW] = useState(0);
  const wRef = useRef(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    setW(width);
    wRef.current = width;
  };
  const pct = max > min ? (value - min) / (max - min) : 0;

  const commit = (x: number) => {
    const width = wRef.current;
    if (width <= 0) return;
    let r = Math.max(0, Math.min(1, x / width));
    let v = min + r * (max - min);
    v = Math.round(v / step) * step;
    v = Math.max(min, Math.min(max, v));
    onChange?.(v);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: e => commit(e.nativeEvent.locationX),
      onPanResponderMove: e => commit(e.nativeEvent.locationX),
    }),
  ).current;

  return (
    <View style={styles.sliderHit} onLayout={onLayout} {...pan.panHandlers}>
      <View style={styles.sliderTrack}>
        <View style={[styles.sliderFill, { width: `${pct * 100}%` }]} />
      </View>
      <View style={[styles.sliderThumb, { left: Math.max(0, Math.min(w - 22, pct * w - 11)) }]} />
    </View>
  );
}

/* Small step / eyebrow pill (e.g. "Step 1 of 4"). */
export function StepBadge({ step, of, label }: { step: number; of: number; label?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={styles.stepPill}>
        <Text style={[font(700), { color: colors.primary, fontSize: 11, letterSpacing: 0.3 }]}>
          Step {step} of {of}
        </Text>
      </View>
      {label ? <Text style={[font(600), { color: colors.textSoft, fontSize: 12 }]}>{label}</Text> : null}
    </View>
  );
}

/* Section heading + optional subtitle. */
export function SectionTitle({ title, sub, style }: { title: string; sub?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: 4 }, style]}>
      <Text style={[font(800), { fontSize: 22, color: colors.text, letterSpacing: -0.4 }]}>{title}</Text>
      {sub ? <Text style={[font(400), { fontSize: 14, color: colors.textSoft, lineHeight: 20 }]}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    shadowColor: '#143C3A',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  btn: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnLabel: { color: '#fff', fontSize: 16 },
  ghost: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  headerCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: colors.primary,
  },
  track: { width: 46, height: 27, borderRadius: 9999, padding: 3, justifyContent: 'center' },
  knob: {
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  chip: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  chipOn: { borderColor: colors.mint, backgroundColor: 'rgba(47,177,131,0.14)' },
  chipOff: { borderColor: 'rgba(120,150,148,0.28)', backgroundColor: 'rgba(255,255,255,0.5)' },
  consent: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  fieldLabel: { color: colors.textMid, fontSize: 13 },
  input: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: colors.text,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  sliderHit: { height: 34, justifyContent: 'center' },
  sliderTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(120,150,148,0.22)', overflow: 'hidden' },
  sliderFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  sliderThumb: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: colors.primary,
    top: 6,
    shadowColor: '#079FA0',
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  stepPill: {
    backgroundColor: colors.chip,
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 9999,
  },
});

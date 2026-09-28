import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useVoiceTarget } from '../voice/useVoiceTarget';
import Icon from './Icon';
import { colors, font } from '../theme/tokens';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function formatDob(y: number, m: number, d: number) {
  return `${d} ${MONTHS_SHORT[m]} ${y}`;
}

type Dob = { y: number; m: number; d: number };

/**
 * The most recent date someone can be born on and still be `minAgeYears` or
 * older today, e.g. today 25 Sep 2026 + 18 → 25 Sep 2008. Anyone born AFTER
 * this date (which includes every future date — a DOB can never be in the
 * future in the first place) is under the age limit, so this single cutoff
 * is all a date-of-birth picker needs to enforce both "no future dates" and
 * "must be at least `minAgeYears`" at once.
 */
function maxDob(minAgeYears: number): { y: number; m: number; d: number } {
  const t = new Date();
  return { y: t.getFullYear() - minAgeYears, m: t.getMonth(), d: t.getDate() };
}
/** True when year/month `a` comes strictly after year/month `b`. */
const afterYm = (a: { y: number; m: number }, b: { y: number; m: number }) =>
  a.y !== b.y ? a.y > b.y : a.m > b.m;

/**
 * Whether a picked {y,m,d} is old enough (defaults to 18) — the same gate the
 * calendar grid and the voice `setValue` above enforce while picking, kept
 * here too so a screen's own Continue check (e.g. basic.tsx) can re-verify
 * the final value rather than trusting that it could only have been set
 * through an already-restricted path.
 */
export function isAtLeastAge(dob: Dob, minAgeYears = 18): boolean {
  const c = maxDob(minAgeYears);
  if (afterYm({ y: dob.y, m: dob.m }, c)) return false;
  if (dob.y === c.y && dob.m === c.m && dob.d > c.d) return false;
  return true;
}

/**
 * Registers the "Date of birth" voice target for a screen's date-of-birth
 * field, independent of whether the calendar grid is currently open on
 * screen. Setting a date by voice should apply instantly — it shouldn't
 * require visually opening the picker UI first just so a target exists to
 * set.
 *
 * Labelled "Date of birth", not the bare "Date" this used to send: a plain
 * "Date" in page_context's available_actions gave the agent no way to be
 * sure this was the user's DOB rather than some other date on screen, and it
 * kept asking whether the date of birth was missing even when `value` was
 * already populated — the ambiguity was in the label, not the data.
 */
export function useDobVoiceTarget(dob: Dob | null, setDob: (v: Dob) => void, minAgeYears = 18) {
  useVoiceTarget(
    'Date of birth',
    {
      kind: 'date',
      getValue: () => (dob ? formatDob(dob.y, dob.m, dob.d) : ''),
      setValue: v => {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v).trim());
        if (!match) return;
        const [, yy, mm, dd] = match;
        const year = Number(yy);
        const month = Number(mm) - 1; // JS months are 0-based
        const day = Number(dd);
        if (month < 0 || month > 11) return;
        // Reject impossible dates (e.g. 31 Feb) rather than letting Date roll over.
        if (day < 1 || day > new Date(year, month + 1, 0).getDate()) return;
        // Same age gate the calendar grid enforces — a spoken "set date of
        // birth to 2015-01-01" bypasses the grid entirely otherwise, since
        // this hook writes straight to state.
        const c = maxDob(minAgeYears);
        if (afterYm({ y: year, m: month }, c) || (year === c.y && month === c.m && day > c.d)) return;
        setDob({ y: year, m: month, d: day });
      },
    },
    [dob, setDob, minAgeYears],
  );
}

/** Inline month calendar for date-of-birth selection (mirrors the design picker). */
export function Calendar({
  year,
  month,
  selectedDay,
  onSelect,
  minAgeYears = 18,
}: {
  year: number;
  month: number;
  selectedDay?: number | null;
  onSelect: (y: number, m: number, d: number) => void;
  /** Blocks every date after (today - this many years), which also blocks every future date. Defaults to 18. */
  minAgeYears?: number;
}) {
  const cutoff = maxDob(minAgeYears);
  // Clamp the initial browsing position so the picker never opens sitting on
  // an all-disabled month (e.g. a screen defaulting to the current month) —
  // callers still pass today's year/month as their own "no DOB yet" default.
  const clampedYear = Math.min(year, cutoff.y);
  const clampedMonth = clampedYear === cutoff.y ? Math.min(month, cutoff.m) : month;
  const [y, setY] = useState(clampedYear);
  const [m, setM] = useState(clampedMonth);
  // Stepping month-by-month (or even year-by-year) to reach a birth year far
  // from the default was reported as taking "around ten minutes" — tapping
  // the header now jumps straight to a year list, then a month grid, the way
  // every standard date picker works, instead of forcing incremental paging.
  const [mode, setMode] = useState<'days' | 'years' | 'months'>('days');

  const firstDow = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];

  const atCutoffMonth = y === cutoff.y && m === cutoff.m;
  const nextMonthBlocked = (() => {
    let nm = m + 1, ny = y;
    if (nm > 11) { nm = 0; ny += 1; }
    return afterYm({ y: ny, m: nm }, cutoff);
  })();

  const stepMonth = (dir: number) => {
    if (dir > 0 && nextMonthBlocked) return;
    let nm = m + dir;
    let ny = y;
    if (nm < 0) { nm = 11; ny -= 1; }
    if (nm > 11) { nm = 0; ny += 1; }
    setM(nm); setY(ny);
  };

  // Descending (most recent first), starting at the age cutoff — a future
  // year, or a year within the last `minAgeYears`, is never shown at all, so
  // there's nothing to tap into that would only be disabled one level down.
  const YEARS = Array.from({ length: 101 }, (_, i) => cutoff.y - i);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        {mode === 'days' ? (
          <>
            <NavBtn icon="chevron_left" onPress={() => stepMonth(-1)} />
            <Pressable onPress={() => setMode('years')} hitSlop={6}>
              <Text style={[font(700), { fontSize: 14, color: colors.text }]}>{MONTHS[m]} {y} ▾</Text>
            </Pressable>
            <NavBtn icon="chevron_right" onPress={() => stepMonth(1)} disabled={nextMonthBlocked} />
          </>
        ) : (
          <>
            <NavBtn icon="chevron_left" onPress={() => setMode('days')} />
            <Text style={[font(700), { fontSize: 14, color: colors.text }]}>
              {mode === 'years' ? 'Select year' : `Select month — ${y}`}
            </Text>
            <View style={{ width: 30 }} />
          </>
        )}
      </View>

      {mode === 'years' && (
        <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
          <View style={styles.pickerGrid}>
            {YEARS.map(yr => (
              <Pressable
                key={yr}
                onPress={() => { setY(yr); setM(m => (yr === cutoff.y ? Math.min(m, cutoff.m) : m)); setMode('months'); }}
                style={[styles.pickerCell, yr === y && { backgroundColor: colors.primary }]}
              >
                <Text style={[font(yr === y ? 700 : 500), { fontSize: 14, color: yr === y ? '#fff' : colors.text }]}>{yr}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}

      {mode === 'months' && (
        <View style={styles.pickerGrid}>
          {MONTHS_SHORT.map((label, idx) => {
            const disabled = y === cutoff.y && idx > cutoff.m;
            return (
              <Pressable
                key={label}
                disabled={disabled}
                onPress={() => { setM(idx); setMode('days'); }}
                style={[styles.pickerCell, idx === m && { backgroundColor: colors.primary }, disabled && { opacity: 0.3 }]}
              >
                <Text style={[font(idx === m ? 700 : 500), { fontSize: 14, color: idx === m ? '#fff' : colors.text }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {mode === 'days' && (
        <>
          <View style={styles.dowRow}>
            {DOW.map((d, i) => (
              <Text key={i} style={[font(600), styles.dow]}>{d}</Text>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((c, i) => {
              const on = c != null && selectedDay === c && m === month && y === year;
              // Only the cutoff month itself has any day-level disabling to do —
              // every other visible month is already fully in range (a later
              // month couldn't be reached at all: stepMonth/year-tap/month-tap
              // above all stop at the cutoff month).
              const disabled = c != null && atCutoffMonth && c > cutoff.d;
              return (
                <View key={i} style={styles.cell}>
                  {c != null ? (
                    <Pressable
                      disabled={disabled}
                      onPress={() => onSelect(y, m, c)}
                      style={[styles.day, on && { backgroundColor: colors.primary }]}
                    >
                      <Text style={[font(on ? 700 : 500), { fontSize: 13, color: on ? '#fff' : disabled ? colors.muted : colors.text }, disabled && { opacity: 0.35 }]}>{c}</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

function NavBtn({ icon, onPress, disabled }: { icon: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} style={[styles.navBtn, disabled && { opacity: 0.35 }]}>
      <Icon name={icon} size={18} color={colors.textSoft} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 10,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  navBtn: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSoft },
  dowRow: { flexDirection: 'row' },
  dow: { flex: 1, textAlign: 'center', color: colors.muted, fontSize: 11 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  day: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pickerScroll: { maxHeight: 220 },
  pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  pickerCell: {
    width: `${100 / 3}%`, paddingVertical: 12, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
});

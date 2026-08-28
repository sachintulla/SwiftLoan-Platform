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
 * Registers the "Date" voice target for a screen's date-of-birth field,
 * independent of whether the calendar grid is currently open on screen.
 * Setting a date by voice should apply instantly — it shouldn't require
 * visually opening the picker UI first just so a target exists to set.
 */
export function useDobVoiceTarget(dob: Dob | null, setDob: (v: Dob) => void) {
  useVoiceTarget(
    'Date',
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
        setDob({ y: year, m: month, d: day });
      },
    },
    [dob, setDob],
  );
}

/** Inline month calendar for date-of-birth selection (mirrors the design picker). */
export function Calendar({
  year,
  month,
  selectedDay,
  onSelect,
}: {
  year: number;
  month: number;
  selectedDay?: number | null;
  onSelect: (y: number, m: number, d: number) => void;
}) {
  const [y, setY] = useState(year);
  const [m, setM] = useState(month);
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

  const stepMonth = (dir: number) => {
    let nm = m + dir;
    let ny = y;
    if (nm < 0) { nm = 11; ny -= 1; }
    if (nm > 11) { nm = 0; ny += 1; }
    setM(nm); setY(ny);
  };

  // Descending (most recent first) — most DOB entries land within the last
  // ~60 years, so this keeps the scroll short for the common case.
  const currentYear = new Date().getFullYear();
  const YEARS = Array.from({ length: 101 }, (_, i) => currentYear - i);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        {mode === 'days' ? (
          <>
            <NavBtn icon="chevron_left" onPress={() => stepMonth(-1)} />
            <Pressable onPress={() => setMode('years')} hitSlop={6}>
              <Text style={[font(700), { fontSize: 14, color: colors.text }]}>{MONTHS[m]} {y} ▾</Text>
            </Pressable>
            <NavBtn icon="chevron_right" onPress={() => stepMonth(1)} />
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
                onPress={() => { setY(yr); setMode('months'); }}
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
          {MONTHS_SHORT.map((label, idx) => (
            <Pressable
              key={label}
              onPress={() => { setM(idx); setMode('days'); }}
              style={[styles.pickerCell, idx === m && { backgroundColor: colors.primary }]}
            >
              <Text style={[font(idx === m ? 700 : 500), { fontSize: 14, color: idx === m ? '#fff' : colors.text }]}>{label}</Text>
            </Pressable>
          ))}
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
              return (
                <View key={i} style={styles.cell}>
                  {c != null ? (
                    <Pressable
                      onPress={() => onSelect(y, m, c)}
                      style={[styles.day, on && { backgroundColor: colors.primary }]}
                    >
                      <Text style={[font(on ? 700 : 500), { fontSize: 13, color: on ? '#fff' : colors.text }]}>{c}</Text>
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

function NavBtn({ icon, onPress }: { icon: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={styles.navBtn}>
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

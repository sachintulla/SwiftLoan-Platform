import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, AppState } from 'react-native';
import { Screen, AppHeader } from '../components/Frame';
import Icon from '../components/Icon';
import { colors, font } from '../theme/tokens';
import { useStore, resolveScreenName, type Screen as ScreenId } from '../state/store';
import { fetchUpshotInbox, getUpshotUnreadCount, markUpshotNotificationRead } from '../analytics/upshot';
import { resolveLinkTarget, type InboxItem } from '../analytics/upshotLinks';

/* ── unread count, shared with the bell on Home ─────────────────────────────────────────── */

const unreadListeners = new Set<(n: number) => void>();
let lastUnread = 0;

function publishUnread(n: number): void {
  lastUnread = Math.max(0, n);
  unreadListeners.forEach((l) => l(lastUnread));
}

/** The number of unread saved notifications, kept fresh on mount and whenever the app returns to the foreground. */
export function useUnreadCount(): number {
  const [n, setN] = useState(lastUnread);
  useEffect(() => {
    unreadListeners.add(setN);
    const refresh = () => getUpshotUnreadCount().then(publishUnread).catch(() => {});
    refresh();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refresh(); });
    return () => {
      unreadListeners.delete(setN);
      sub.remove();
    };
  }, []);
  return n;
}

/* ── the screen ─────────────────────────────────────────────────────────────────────────── */

/**
 * Every push the user has been sent, saved by Upshot's inbox (kept for 90 days). Opened from the bell on Home.
 * Tapping a notification marks it read and, if its campaign carried a `screen` / `deeplink` key-value pair,
 * opens that screen (docs/UPSHOT_DEEPLINKS.md).
 */
export default function Notifications() {
  const { state, go } = useStore();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await fetchUpshotInbox();
    setItems(list);
    publishUnread(list.filter((i) => !i.read).length);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const open = (item: InboxItem) => {
    if (!item.read) {
      setItems((cur) => (cur ? cur.map((i) => (i.id === item.id ? { ...i, read: true } : i)) : cur));
      publishUnread(lastUnread - 1);
      markUpshotNotificationRead(item.id);
    }
    const link = resolveLinkTarget(item.target, resolveScreenName);
    if (link && (state.authUser || !link.requiresAuth)) go(link.screen as ScreenId);
  };

  return (
    <Screen scroll padded>
      <AppHeader title="Notifications" />

      {loading && items === null ? (
        <View style={{ paddingVertical: 60, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}

      {items !== null && items.length === 0 ? (
        <View style={{ paddingVertical: 60, alignItems: 'center', gap: 10 }}>
          <Icon name="notifications" size={40} color={colors.muted} />
          <Text style={[font(600), { fontSize: 15, color: colors.text }]}>No notifications yet</Text>
          <Text style={[font(400), { fontSize: 13, color: colors.textSoft, textAlign: 'center', paddingHorizontal: 24 }]}>
            Updates about your loan application and offers will show up here.
          </Text>
        </View>
      ) : null}

      {(items ?? []).map((item) => {
        const tappable = !!resolveLinkTarget(item.target, resolveScreenName);
        return (
          <Pressable
            key={item.id}
            onPress={() => open(item)}
            accessibilityLabel={`${item.read ? '' : 'Unread. '}${item.title}. ${item.message}`}
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 12,
              paddingVertical: 14,
              paddingHorizontal: 14,
              marginTop: 10,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: item.read ? colors.lineSoft : colors.line,
              backgroundColor: item.read ? colors.surface : colors.chip,
            }}
          >
            <View style={{ width: 9, height: 9, borderRadius: 5, marginTop: 6, backgroundColor: item.read ? 'transparent' : colors.primary }} />
            <View style={{ flex: 1 }}>
              {item.title ? (
                <Text style={[font(item.read ? 600 : 700), { fontSize: 14.5, color: colors.text }]}>{item.title}</Text>
              ) : null}
              {item.message ? (
                <Text style={[font(400), { fontSize: 13, lineHeight: 19, color: colors.textMid, marginTop: item.title ? 3 : 0 }]}>{item.message}</Text>
              ) : null}
            </View>
            {tappable ? <Icon name="chevron_right" size={20} color={colors.muted} /> : null}
          </Pressable>
        );
      })}

      {items !== null ? (
        <Pressable onPress={load} disabled={loading} style={{ alignSelf: 'center', paddingVertical: 18 }} accessibilityLabel="Refresh notifications">
          <Text style={[font(600), { fontSize: 13, color: colors.primary }]}>{loading ? 'Refreshing…' : 'Refresh'}</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

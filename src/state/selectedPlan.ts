import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'swiftloan.selectedPreApprovedPlan';

export interface SelectedPlan {
  id: string;
  lenderName: string;
  icon: string;
  logoUrl?: string | null;
  exploreUrl?: string | null;
  badge?: string | null;
}

/** Persists across app restarts — the user picks this before even signing up. */
export async function saveSelectedPlan(plan: SelectedPlan): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(plan));
}

export async function loadSelectedPlan(): Promise<SelectedPlan | null> {
  const raw = await AsyncStorage.getItem(KEY).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SelectedPlan;
  } catch {
    return null;
  }
}

export async function clearSelectedPlan(): Promise<void> {
  await AsyncStorage.removeItem(KEY).catch(() => {});
}

import { useEffect } from 'react';
import { useStore } from '../state/store';
import { registerTarget } from './actionRegistry';
import type { ActionTarget } from './actionRegistry';

/**
 * Registers one voice-addressable control from inside any component.
 *
 * This is the escape hatch for controls that the element-tree walk in
 * screenGraph.ts cannot see. That walk inspects the elements a *screen* passes to
 * <Screen>, so it cannot look inside child components — `fare.tsx` renders a lone
 * <EmiCalculator/>, whose 14 controls (the loan-amount, tenure and rate sliders)
 * were therefore invisible, and Calendar's date grid likewise.
 *
 * Because this is a hook it runs wherever the component actually renders, at any
 * nesting depth, so it closes that gap. Shared components should call it once;
 * every screen that uses them then gets voice control for free.
 */
export function useVoiceTarget(
  label: string | undefined,
  target: Omit<ActionTarget, 'label'>,
  deps: unknown[] = [],
): void {
  const { state } = useStore();
  useEffect(() => {
    if (!label) return undefined;
    return registerTarget(state.screen, `${target.kind}:${label}`, { ...target, label });
    // Callers pass the values the handlers close over; label/screen/kind are tracked here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.screen, label, target.kind, ...deps]);
}

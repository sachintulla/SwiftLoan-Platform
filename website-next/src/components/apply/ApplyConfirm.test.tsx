// @vitest-environment jsdom
// Apply now must first show "You are about to apply for this loan with <lender>": nothing is sent to the lender
// until the visitor taps Proceed, and Cancel / close / Escape leave them on the offers.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav }));
vi.mock('@/lib/applyContext', () => ({ useApply: () => ({ applicationId: 'app-1', setSelectedOffer: vi.fn() }) }));
const api = vi.hoisted(() => ({ applyOffer: vi.fn() }));
vi.mock('@/lib/applyApi', () => api);

import { ApplyConfirm, confirmApply } from './ApplyConfirm';
import { useApplyToOffer } from '@/hooks/useApplyToOffer';
import type { Offer } from '@/lib/applyApi';

const offer = {
  id: 'offer-1',
  lenderName: 'IDFC FIRST BANK',
  lenderLogoUrl: 'https://cdn.example/idfc.png',
  redirectionUrl: 'https://pt.aurix-partner.com/?offer_code=OC1',
  amount: 200000,
  apr: 14,
  emi: 9600,
  tenureMonths: 24,
} as unknown as Offer;

function Page() {
  const { apply } = useApplyToOffer();
  return (
    <>
      <button onClick={() => apply(offer)}>Apply now</button>
      <ApplyConfirm />
    </>
  );
}

const click = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByText(name));
  });
};

describe('ApplyConfirm — the pop-up between Apply now and the lender', () => {
  beforeEach(() => {
    nav.push.mockReset();
    api.applyOffer.mockReset();
    api.applyOffer.mockResolvedValue({ lenderApplicationId: 'la-1' });
  });
  afterEach(cleanup);

  it('shows the lender logo, name and the agreed sentence, and sends nothing yet', async () => {
    render(<Page />);
    await click('Apply now');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'IDFC First Bank' })).toBeTruthy();
    expect(screen.getByAltText('IDFC First Bank logo').getAttribute('src')).toBe('https://cdn.example/idfc.png');
    expect(screen.getByText('You are about to apply for this loan with IDFC First Bank. Tap Proceed to continue your application.')).toBeTruthy();
    expect(api.applyOffer).not.toHaveBeenCalled();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('Proceed applies and continues to the lender', async () => {
    render(<Page />);
    await click('Apply now');
    await click('Proceed');
    expect(api.applyOffer).toHaveBeenCalledWith('app-1', 'offer-1');
    expect(nav.push).toHaveBeenCalledWith('/apply/lender');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Cancel closes it and nothing is sent; Apply now can be tapped again', async () => {
    render(<Page />);
    await click('Apply now');
    await click('Cancel');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.applyOffer).not.toHaveBeenCalled();
    await click('Apply now');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('Escape and a click outside both cancel', async () => {
    render(<Page />);
    await click('Apply now');
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    await click('Apply now');
    await act(async () => {
      fireEvent.click(screen.getByRole('dialog'));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.applyOffer).not.toHaveBeenCalled();
  });

  it('a lender with no logo shows its initials', async () => {
    render(<ApplyConfirm />);
    let answer: Promise<boolean>;
    await act(async () => {
      answer = confirmApply({ lenderName: 'Poonawalla Fincorp', logoUrl: null });
    });
    expect(screen.getByText('PO')).toBeTruthy();
    await click('Proceed');
    expect(await answer!).toBe(true);
  });
});

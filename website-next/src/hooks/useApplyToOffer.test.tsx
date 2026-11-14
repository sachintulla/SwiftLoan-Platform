// @vitest-environment jsdom
// Applying to an Aurix offer on the website must open the link the SERVER returns (it carries the visitor's
// Aurix token as `authtoken`, so the lender page skips its own mobile + OTP screen), not the offer's stored link.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav }));

const ctx = vi.hoisted(() => ({ setSelectedOffer: vi.fn() }));
vi.mock('@/lib/applyContext', () => ({ useApply: () => ({ applicationId: 'app-1', setSelectedOffer: ctx.setSelectedOffer }) }));

const api = vi.hoisted(() => ({ applyOffer: vi.fn() }));
vi.mock('@/lib/applyApi', () => api);

import { useApplyToOffer } from './useApplyToOffer';
import type { Offer } from '@/lib/applyApi';

const STORED = 'https://pt.aurix-partner.com/?offer_code=OC1&utm_code=UT1';
const HANDOFF = `${STORED}&authtoken=tok.abc`;
const offer = { id: 'offer-1', lenderName: 'IDFC FIRST', redirectionUrl: STORED, amount: 200000, apr: 14, emi: 9600, tenureMonths: 24 } as unknown as Offer;

function Harness({ o }: { o: Offer }) {
  const { apply, error } = useApplyToOffer();
  return (
    <div>
      <button onClick={() => apply(o)}>apply</button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

const tap = async () => {
  await act(async () => {
    screen.getByText('apply').click();
  });
};

describe('useApplyToOffer — lender hand-off link', () => {
  beforeEach(() => {
    nav.push.mockReset();
    ctx.setSelectedOffer.mockReset();
    api.applyOffer.mockReset();
  });
  afterEach(cleanup);

  it('opens the link from the apply response (with the token), not the stored one', async () => {
    api.applyOffer.mockResolvedValue({ lenderApplicationId: 'la-1', redirectionUrl: HANDOFF });
    render(<Harness o={offer} />);
    await tap();
    expect(api.applyOffer).toHaveBeenCalledWith('app-1', 'offer-1');
    expect(ctx.setSelectedOffer).toHaveBeenCalledWith(expect.objectContaining({ id: 'offer-1', redirectionUrl: HANDOFF }));
    expect(nav.push).toHaveBeenCalledWith('/apply/lender');
  });

  it('falls back to the stored link when the server returns none (older server / no token)', async () => {
    api.applyOffer.mockResolvedValue({ lenderApplicationId: 'la-1' });
    render(<Harness o={offer} />);
    await tap();
    expect(ctx.setSelectedOffer).toHaveBeenCalledWith(expect.objectContaining({ redirectionUrl: STORED }));
    expect(nav.push).toHaveBeenCalledWith('/apply/lender');
  });

  it('an offer with no lender link at all still goes to the confirm step', async () => {
    api.applyOffer.mockResolvedValue({ lenderApplicationId: 'la-1' });
    render(<Harness o={{ ...offer, redirectionUrl: null } as unknown as Offer} />);
    await tap();
    expect(nav.push).toHaveBeenCalledWith('/apply/confirm');
  });
});

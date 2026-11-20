// My Offers opened on a fresh login (nothing in memory, nothing cached): what it shows is read
// from the server's applications. Before the fix the last three cases were one identical screen.
import React from 'react';
import { waitFor } from '@testing-library/react-native';
import { renderWithProviders } from './test-utils';

const mockList = jest.fn();
jest.mock('../src/api/client', () => {
  const actual = jest.requireActual('../src/api/client');
  return { ...actual, isAuthed: () => true, api: { ...actual.api, listApplications: (...a: unknown[]) => mockList(...a) } };
});
import Fare from '../src/screens/fare';

const offer = (over: object = {}) => ({
  id: 'o1', lenderName: 'Test Lender', amount: 200000, apr: 18, tenure: 24, emi: 9985,
  processingFee: 2000, applied: false, ...over,
});

async function open(apps: unknown[]) {
  mockList.mockResolvedValue({ applications: apps });
  const r = renderWithProviders(<Fare />);
  await waitFor(() => expect(mockList).toHaveBeenCalled());
  return r;
}

describe('UC-O2 My Offers after logout → login', () => {
  // Fake timers so the screen's intervals/animations don't leak real handles (as in screens.test).
  beforeEach(() => { jest.useFakeTimers(); mockList.mockReset(); });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  it('offers not applied to are shown again', async () => {
    const r = await open([{ id: 'a1', status: 'offers_ready', amount: 200000, offers: [offer()] }]);
    await waitFor(() => expect(r.getByText('Test Lender')).toBeTruthy());
    expect(r.queryByText('Apply for a loan')).toBeNull();
    r.unmount();
  });

  it('a check that found no offers keeps its reason, Retry and the other lenders', async () => {
    const r = await open([{ id: 'a1', status: 'rejected', prequalifyReason: 'not_eligible', amount: 200000, offers: [] }]);
    await waitFor(() => expect(r.getByText("You don't currently meet the eligibility criteria of our lending partners.")).toBeTruthy());
    expect(r.getByText('Retry')).toBeTruthy();
    expect(r.getByText('Update details & try again')).toBeTruthy();
    expect(r.getByText('Explore lenders')).toBeTruthy();       // the tab is back
    expect(r.getByText('Explore more lenders')).toBeTruthy();
    expect(r.queryByText('No offers yet')).toBeNull();
    expect(r.queryByText('Apply for a loan')).toBeNull();
    r.unmount();
  });

  it('"already registered" is remembered with its own wording', async () => {
    const r = await open([{ id: 'a1', status: 'failed', prequalifyReason: 'duplicate', amount: 200000, offers: [] }]);
    await waitFor(() => expect(r.getByText(/We already have an application on file for this mobile number/)).toBeTruthy());
    r.unmount();
  });

  it('applied to every offer: points to My Loans', async () => {
    const r = await open([{ id: 'a1', status: 'handoff', amount: 200000, offers: [offer({ applied: true })] }]);
    await waitFor(() => expect(r.getByText('You’ve already applied')).toBeTruthy());
    expect(r.getByText('View My Loans')).toBeTruthy();
    expect(r.getByText('Apply for a new loan')).toBeTruthy();
    expect(r.queryByText('No offers yet')).toBeNull();
    expect(r.queryByText('Test Lender')).toBeNull();
    r.unmount();
  });

  it('never applied: the first-time screen, with no lender tabs', async () => {
    const r = await open([]);
    await waitFor(() => expect(r.getByText('Apply for a loan')).toBeTruthy());
    expect(r.getByText('No offers yet')).toBeTruthy();
    expect(r.queryByText('Explore lenders')).toBeNull();
    r.unmount();
  });
});

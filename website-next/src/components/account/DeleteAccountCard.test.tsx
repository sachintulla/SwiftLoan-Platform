// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const m = vi.hoisted(() => ({ deleteAccount: vi.fn(), replace: vi.fn() }));
vi.mock('@/lib/applyApi', () => ({ deleteAccount: m.deleteAccount }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: m.replace }) }));

import { DeleteAccountCard } from './DeleteAccountCard';

afterEach(() => {
  cleanup();
  m.deleteAccount.mockReset();
  m.replace.mockReset();
});

const openIt = () => fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
const confirmBtn = () => screen.getByRole('button', { name: /Delete my account permanently/ }) as HTMLButtonElement;
const typeConfirm = (v: string) => fireEvent.change(screen.getByLabelText(/Type DELETE to confirm/), { target: { value: v } });

describe('DeleteAccountCard', () => {
  it('is collapsed until opened, and the confirm button needs reason + typed word', () => {
    render(<DeleteAccountCard />);
    expect(screen.queryByText('Why are you leaving?')).toBeNull();
    openIt();
    expect(confirmBtn().disabled).toBe(true);

    typeConfirm('DELETE');
    expect(confirmBtn().disabled).toBe(true); // no reason yet

    fireEvent.click(screen.getByLabelText('Privacy or data concerns'));
    expect(confirmBtn().disabled).toBe(false);

    typeConfirm('delet');
    expect(confirmBtn().disabled).toBe(true); // word must match
  });

  it('"Something else" needs a few words before it can be submitted', () => {
    render(<DeleteAccountCard />);
    openIt();
    fireEvent.click(screen.getByLabelText('Something else'));
    typeConfirm('DELETE');
    expect(confirmBtn().disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/A few words help us improve/), { target: { value: 'moving abroad' } });
    expect(confirmBtn().disabled).toBe(false);
  });

  it('sends the reason and details, then leaves the account area', async () => {
    m.deleteAccount.mockResolvedValue(undefined);
    render(<DeleteAccountCard />);
    openIt();
    fireEvent.click(screen.getByLabelText('Too many calls or messages'));
    fireEvent.change(screen.getByPlaceholderText(/A few words help us improve/), { target: { value: '  daily calls  ' } });
    typeConfirm('delete');
    fireEvent.click(confirmBtn());
    await waitFor(() => expect(m.deleteAccount).toHaveBeenCalledWith({ reason: 'too_many_contacts', details: 'daily calls' }));
    await waitFor(() => expect(m.replace).toHaveBeenCalledWith('/'));
  });

  it('shows the server message and stays put when deletion fails', async () => {
    m.deleteAccount.mockRejectedValue(new Error('Unknown reason'));
    render(<DeleteAccountCard />);
    openIt();
    fireEvent.click(screen.getByLabelText('I no longer need a loan'));
    typeConfirm('DELETE');
    fireEvent.click(confirmBtn());
    expect((await screen.findByRole('alert')).textContent).toBe('Unknown reason');
    expect(m.replace).not.toHaveBeenCalled();
  });

  it('marks every control voice-sensitive so the assistant cannot operate it', () => {
    render(<DeleteAccountCard />);
    openIt();
    const marked = document.querySelectorAll('[data-voice-sensitive]').length;
    expect(marked).toBeGreaterThanOrEqual(5);
    expect(screen.getByLabelText(/Type DELETE to confirm/).getAttribute('data-voice-sensitive')).toBeTruthy();
  });
});

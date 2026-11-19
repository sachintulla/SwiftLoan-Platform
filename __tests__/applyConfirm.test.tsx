// Apply Now must first show "You are about to apply for this loan with <lender>": nothing is recorded or sent
// to the lender until Proceed; Cancel leaves the customer on the offers.
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { StoreProvider } from '../src/state/store';
import ApplyConfirm, { confirmApply, lenderInitials } from '../src/components/ApplyConfirm';

const mount = () => render(<StoreProvider><ApplyConfirm /></StoreProvider>);

describe('ApplyConfirm', () => {
  it('with no pop-up mounted the apply goes ahead (as before)', async () => {
    await expect(confirmApply({ lenderName: 'Any Bank' })).resolves.toBe(true);
  });

  it('shows the bank name and the agreed sentence; Proceed resolves true and closes it', async () => {
    const ui = mount();
    let answer!: Promise<boolean>;
    await act(async () => { answer = confirmApply({ lenderName: 'IDFC First Bank', logoUrl: 'https://cdn.example/idfc.png' }); });
    expect(ui.getByText('IDFC First Bank')).toBeTruthy();
    expect(ui.getByText('You are about to apply for this loan with IDFC First Bank. Tap Proceed to continue your application.')).toBeTruthy();
    await act(async () => { fireEvent.press(ui.getByText('Proceed')); });
    await expect(answer).resolves.toBe(true);
    expect(ui.queryByText('Proceed')).toBeNull();
  });

  it('Cancel resolves false', async () => {
    const ui = mount();
    let answer!: Promise<boolean>;
    await act(async () => { answer = confirmApply({ lenderName: 'Poonawalla Fincorp' }); });
    expect(ui.getByText('PF')).toBeTruthy(); // no logo → initials
    await act(async () => { fireEvent.press(ui.getByText('Cancel')); });
    await expect(answer).resolves.toBe(false);
    expect(ui.queryByText('Proceed')).toBeNull();
  });

  it('a second Apply while one is open replaces it (the first counts as cancelled)', async () => {
    const ui = mount();
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    await act(async () => { first = confirmApply({ lenderName: 'Bank One' }); });
    await act(async () => { second = confirmApply({ lenderName: 'Bank Two' }); });
    await expect(first).resolves.toBe(false);
    expect(ui.getByText('Bank Two')).toBeTruthy();
    await act(async () => { fireEvent.press(ui.getByText('Proceed')); });
    await expect(second).resolves.toBe(true);
  });

  it('initials', () => {
    expect(lenderInitials('IDFC FIRST Bank')).toBe('IF');
    expect(lenderInitials('Kreditbee')).toBe('KR');
    expect(lenderInitials('  ')).toBe('?');
  });
});

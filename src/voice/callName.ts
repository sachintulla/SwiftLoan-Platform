/**
 * The first name Ruby uses on the CURRENT call (sent as `user_name` in page_context).
 *
 * It is fixed for one call once known: typing a different first name into the
 * application form rewrites the account's name mid-call, and the prompt says the
 * name Ruby uses does not change within a call.
 *
 * It must NOT outlive the call or the account. The first version kept it in a
 * variable that was only cleared when the page context was built while no call
 * was live — but the page context is only ever built during a call, so it was
 * never cleared: the first name from the first call was sent on every later call
 * until the app was force-closed, even after a logout or an account deletion and
 * a sign-in as someone else (prod, 2026-11-20: a second account on the same
 * phone was addressed by the first account's name).
 *
 * So it is cleared three ways: `resetCallName()` at every call start and end
 * (store.ts listens to the agent's status), when the signed-in account changes
 * (`accountKey`), and when the context is built with no call live.
 */
let lockedName = '';
let lockedFor = '';

export function resetCallName(): void {
  lockedName = '';
  lockedFor = '';
}

/**
 * @param liveName   the signed-in account's first name right now ('' when unknown)
 * @param accountKey who is signed in (user id, else phone; '' when signed out)
 * @param callLive   a call is connecting or connected
 */
export function callNameFor(liveName: string, accountKey: string, callLive: boolean): string {
  if (!callLive) {
    resetCallName();
    return liveName;
  }
  if (accountKey !== lockedFor) {
    lockedFor = accountKey;
    lockedName = '';
  }
  if (!lockedName && liveName) lockedName = liveName;
  return lockedName || liveName;
}

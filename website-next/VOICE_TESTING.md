# Voice widget — manual test checklist

Setup: `.env.local` has the stage Ello credentials (assistant id
`6a6b1d4285977f0f8e7c152c`, `api-stage.getello.ai` / `opensips-stage.getello.ai`).
Run `npm run dev` (port 4002), open the site, click the **"Talk to us"** mic
button bottom-right, and allow microphone access. Say each line below and
confirm the observed result. This assistant must be in **Native Mode (Gemini
Live)** on the ello dashboard with the system prompt from
`prompts/ello-website-next-navigator-prompt.md` — otherwise it will talk but
never call a tool (check the browser console for `no tools-ack after 5s`).

| # | Say | Expect |
|---|---|---|
| 1 | "Show me the loan products" | Scrolls to Services section (home) |
| 2 | "Open the EMI calculator" | Scrolls to calculator |
| 3 | "What would my EMI be for 10 lakhs at 12% over 2 years" | Sliders move, EMI/total spoken back (~₹47,073 EMI) |
| 4 | "What's my EMI right now" | Reads back current calculator values, no change |
| 5 | "Track application SL-2048" | Tracker shows Personal Loan, mid-flow, eKYC pending |
| 6 | "Show me a demo of SL-3110" | Tracker shows Business Loan, fully disbursed |
| 7 | "My name is Priya Sharma" | `#fullName` fills, scrolls to apply section |
| 8 | "My number is 98765 43210" | `#phone` fills |
| 9 | "My email is priya@example.com" | `#email` fills |
| 10 | "I'm in Hyderabad" | `#city` fills |
| 11 | "I want a business loan" | `#loanType` = Business Loan |
| 12 | "I need 7 lakhs" | `#loanAmount` = 700000 |
| 13 | "Yes, you can call me" | Consent checkbox checked |
| 14 | "Submit my application" | The ASSISTANT asks out loud "shall I submit this now?" — no on-screen popup. Say "yes" → success panel + reference ID shown immediately, hands-free |
| 15 | "Let me check another rate" | Form resets, success panel hides |
| 16 | "Will checking my eligibility hurt my credit score?" | Correct FAQ item opens + spoken answer matches it |
| 17 | "Switch to Hindi" | Nav badge → HI, page text re-translates, `<html lang="hi">` |
| 18 | "Switch back to English" | Reverts |
| 19 | "Take me to the compliance page" | Client-side navigation to `/compliance`, voice session stays connected (mic button doesn't reset) |
| 20 | "Show me the grievance redressal section" | Scrolls to `#grievance` on `/compliance` |
| 21 | "Take me home" | Navigates back to `/`, session still connected |
| 22 | Try #3/#5/#7 while on `/compliance` (before navigating back) | Assistant should say these aren't available here / offer to navigate home first, not silently fail |

## Automated smoke test (no mic needed)

Every tool has a handler that can be exercised directly from the browser
console without a live voice call — useful for regression-checking after
code changes:

```js
const agent = window.__swiftloanVoice;
await agent.debugSimulateToolCall('set_calculator', { amount: 1000000, rate: 12, tenure: 24 });
// then inspect the DOM, e.g. document.getElementById('emiOut').textContent
```

Swap in any tool name from `src/components/VoiceWidget.tsx` and its
arguments. `availableWhen` gating (e.g. calculator tools return
`status: "error"` with a `tool_unavailable` error code on `/compliance`) can
be checked the same way by listening for the `toolResult` event:

```js
agent.on('toolResult', console.log);
await agent.debugSimulateToolCall('set_calculator', { amount: 500000 });
```

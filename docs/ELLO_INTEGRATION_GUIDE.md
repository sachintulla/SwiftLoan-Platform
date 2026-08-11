# Integrating Ello Voice into a React Native App

This document explains how to integrate [Ello](https://getello.ai) — a
conversational voice agent that can see and control your app's UI — into a
React Native app: the functions you need, how buttons/controls get wired up,
and how page context works.

There is **no official `getello`/`@ello/agent-sdk` npm package** for React
Native today. This is a **hand-ported, self-contained client** you vendor
directly into your own source tree (e.g. `src/voice/`) rather than installing
from npm. If Ello ships an official RN SDK later, prefer that.

---

## 1. What you get, at a glance

A floating mic button anywhere in your app that a user taps to start a call
with a voice agent. The agent can:

- See what's on the current screen (buttons, fields, toggles, text) — via an
  auto-discovered "screen graph", not a hand-maintained list.
- Call **tools** you register (tap a button, fill a field, navigate to a
  screen, scroll, etc.) to actually drive the UI.
- Ask for explicit user confirmation before sensitive actions.
- Refuse to touch fields you mark sensitive (password, OTP, card number).

The user's voice audio streams to Ello's backend, Ello runs an LLM against a
system prompt configured on Ello's dashboard for your assistant, and the
assistant's replies stream back as audio and/or tool calls.

---

## 2. Prerequisites

1. An Ello account and an **assistant** created on the Ello dashboard, with a
   system prompt describing what your app does and how the agent should
   behave (see §7).
2. From Ello: an **API key** and your assistant's **assistant ID**.
3. Know Ello's REST API base and WebSocket base for your environment (e.g.
   `https://api-in.getello.ai` and `wss://<host>/ws-ello`).

---

## 3. Credentials — keep them out of git

Real keys end up inside your JS bundle and are extractable from a built APK —
treat them like any client-embedded key (rate-limit / rotate on the backend
side, don't treat them as a secret that can't leak).

Create a small credentials file that sets globals **before** anything else in
your app runs, and gitignore it:

```js
// voiceCredentials.local.js  (gitignored — copy from a committed .example file)
global.MYAPP_ELLO_API_KEY = 'ak_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
global.MYAPP_ELLO_ASSISTANT_ID = 'your-assistant-id';
global.MYAPP_ELLO_API_BASE = 'https://api-in.getello.ai';
global.MYAPP_ELLO_WS_URL = 'wss://<your-ello-host>/ws-ello';
```

Commit a `voiceCredentials.local.example.js` with placeholder values instead,
and load the real file first, before your root component:

```js
// index.js
import './voiceCredentials.local'; // MUST load first
import { AppRegistry } from 'react-native';
import App from './App';
```

Read the globals into typed constants with dev-friendly fallbacks (emulator
aliases), and compute one boolean gate other code can check:

```ts
// src/voice/config.ts
export const ELLO_API_KEY = (globalThis as any).MYAPP_ELLO_API_KEY || null;
export const ELLO_ASSISTANT_ID = (globalThis as any).MYAPP_ELLO_ASSISTANT_ID || null;
export const ELLO_API_BASE =
  (globalThis as any).MYAPP_ELLO_API_BASE ||
  (Platform.OS === 'android' ? 'http://10.0.2.2:5008' : 'http://localhost:5008');
export const ELLO_WS_URL =
  (globalThis as any).MYAPP_ELLO_WS_URL ||
  (Platform.OS === 'android' ? 'ws://10.0.2.2:8080/ws-ello' : 'ws://localhost:8080/ws-ello');

export const ELLO_CONFIGURED = !!(ELLO_API_KEY && ELLO_ASSISTANT_ID);
```

**Design choice worth keeping**: if the credentials file is missing or empty,
`ELLO_CONFIGURED` is `false` and the whole feature disables itself (the mic
button just doesn't render — see §6). The rest of the app is completely
unaffected. This means voice can be dropped into an existing app with zero
risk of breaking it for anyone who hasn't configured Ello yet.

---

## 4. Starting a call (session + transport)

A call has two parts: a **REST call** to get a conversation id, then a
**WebSocket** you stream audio over.

### 4a. Create the session

```ts
// src/voice/transport/sessionApi.ts
async function createVoiceSession(options: { apiKey: string; assistantId: string; apiBaseUrl: string }) {
  const res = await fetch(`${options.apiBaseUrl}/api/agents/${options.assistantId}/calls`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': options.apiKey },
    body: JSON.stringify({
      assistant_id: options.assistantId,
      agent_type: 'webcall',
      call_type: 'outbound',
      name: '',
      message: 'Hi! I can help you navigate this app by voice — what would you like to do?',
      memory_id: generateUuidV4(), // any RFC4122-ish v4 UUID generator
    }),
  });
  if (!res.ok) throw new Error(`ello: failed to start call (${res.status})`);
  const json = await res.json().catch(() => ({}));
  const conversationId = json?.data?.call_id ?? json?.call_id ?? json?.data?.conversation_id ?? json?.conversation_id ?? json?.id;
  if (!conversationId) throw new Error('ello: missing call/conversation id in response');
  return { conversationId };
}
```

Auth is a static `x-api-key` header, not a Bearer/JWT — this is a stable
credential meant for embedding in an app, not a short-lived dashboard-login
token.

### 4b. Open the WebSocket and stream audio

Endpoint is `/ws-ello` (not `/ws` — that path is a different, unrelated
signaling route on Ello's server). Once connected:

1. Send a session-start message with the conversation id and your registered
   tools (see §5):
   ```json
   { "type": "voice-session-start", "conversation_id": "...", "client_tools": [...], "page_context": {...} }
   ```
2. Start capturing microphone audio and stream base64-encoded PCM16 chunks:
   ```json
   { "type": "voice-audio-input", "data": "<base64 pcm16>", "sample_rate": 16000, "channels": 1 }
   ```
3. Handle inbound message types: `voice-audio-output` (play it), `voice-audio-purge`
   (barge-in — the user started talking, stop/clear playback immediately),
   `conversation-text` (transcript), `client-tool-call` / `client-tool-cancel`
   (dispatch to your registered tool handler and send the result back),
   `client-tools-ack`, `session-ended`, `error-occurred`.

**Two implementation options, both valid — pick one:**

- **Raw PCM over WebSocket** — simpler, fewer native dependencies, but relies
  on your device's own echo cancellation being decent, since you're just
  streaming raw mic input.
- **Real WebRTC call** (via `react-native-webrtc`) — a proper two-way call
  gives you hardware-grade echo cancellation. Worth switching to this if raw
  PCM lets the agent hear its own voice back on some real devices — that
  failure mode is device-specific and won't necessarily show up on an
  emulator or on every phone you test with.

Implement both behind the exact same interface, so the rest of the app — the
tool registry, the mic button — never needs to know which transport is
active:

```ts
export interface AgentLike {
  registerTool<TArgs>(def: ClientToolOptions<TArgs>): void;
  unregisterTool(name: string): void;
  registerPageContext(fn: () => Record<string, unknown>): void;
  updatePageContext(): void;
  on<K extends keyof AgentEventMap>(event: K, fn: (payload: AgentEventMap[K]) => void): () => void;
  setMuted(muted: boolean): void;
  getStatus(): 'idle' | 'connecting' | 'listening' | 'speaking' | 'executingTool' | 'ended';
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

Keep this interface stable and you can swap transports later (or A/B them)
without touching UI or tool code — implementations that both satisfy it can
be swapped with a one-line import change wherever you instantiate the agent.

**Race-condition detail worth copying**: guard `start()`/`stop()` with a
monotonic "start token" counter. If the user taps the mic, then immediately
taps it again to cancel while the REST call or WS handshake is still in
flight, the in-flight `start()` needs to notice it's stale and unwind instead
of completing into a call the user already cancelled.

---

## 5. Making the UI voice-controllable (the tool layer)

This is the part that's specific to *your* app's screens, and the part worth
investing in most — everything else here is fairly mechanical plumbing.

### 5a. A generic executor, not one tool per button

Don't register a separate Ello tool for every button in your app. Register a
small, fixed set of generic tools, and resolve *which* on-screen control they
act on at call time by label:

```ts
// one tool, reused for every button/field/toggle in the whole app
{
  name: 'perform_ui_action',
  description: 'Tap a button, fill a field, toggle a switch, set a value, or scroll.',
  schema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['tap', 'set_input', 'set_toggle', 'set_value', 'scroll'] },
      target: { type: 'string', description: 'The visible label of the control' },
      value: { type: 'string' },
    },
    required: ['action', 'target'],
  },
  handler: performAction, // looks up `target` in a per-screen registry, then calls its handler
}
```

You can still add a handful of **named aliases** for actions your system
prompt calls out directly (e.g. `go_back`, `submit`, `sign_out`) — they just
remap arguments and call the same `performAction` under the hood. This keeps
one execution path (easier to debug) while still letting the model "call the
most specific tool available" if your prompt asks for that.

### 5b. A per-screen registry of addressable controls

Keep a registry, keyed by screen name, of `{ id, kind, label, onTap?,
setValue?, getValue?, scrollBy? }` targets. Two ways controls get into it:

**Auto-discovery** — walk the element tree a screen renders (just
`element.props`/`element.type`, not React fiber internals) and classify
common patterns: a `TextInput` becomes a `field`, a `Switch` becomes a
`toggle`, anything with an `onPress` becomes a `button`. Run this once per
screen render and publish the result:

```ts
useEffect(() => {
  const graph = buildScreenGraph(children);
  if (publishScreenGraph(currentScreenName, graph.elements, graph.texts)) {
    agent.updatePageContext(); // tell Ello the screen changed
  }
}, [children, currentScreenName]);
```

This single hook, placed in your shared screen wrapper, makes every screen
built from that wrapper voice-addressable **with no per-screen work**.

**Explicit self-registration** — a `useVoiceTarget(label, target, deps)` hook
for controls the tree-walk can't see, because they're rendered *inside* a
child component your top-level walk doesn't descend into (a slider inside a
shared chart/calculator component, a custom date-picker grid, etc.):

```ts
useVoiceTarget('Amount', {
  kind: 'slider',
  setValue: (v) => setAmount(Number(v)),
  getValue: () => String(amount),
}, [amount]);
```

Resolve targets at call time with fuzzy-but-scoped matching (exact id →
case-insensitive exact label → prefix → substring), scoped to the *current*
screen only — labels like "Continue" or "Back" repeat across many screens, so
never match cross-screen.

### 5c. Report what actually happened, not what should have happened

After executing an action, don't just return `{ ok: true }`. Re-check app
state and tell the model what's *actually* true now:

```ts
async function settled(screenBefore, base) {
  await waitForNextPublish(250); // let React re-render, then the screen re-publish itself
  const now = getCurrentScreenName();
  return {
    ...base,
    screen_after: now,
    navigated: now !== screenBefore,
    controls_now: listCurrentControls(now).slice(0, 20), // so the model knows what it can do next
  };
}
```

This matters in practice: a control can change app state without navigating
anywhere (e.g. selecting an option just selects it, it doesn't move to the
next screen). Without reporting the real resulting screen, the model will
assume navigation happened and tell the user something false.

### 5d. Sensitive fields and confirmation

Maintain an explicit denylist of field labels/kinds the agent must never read
or fill (password, OTP/verification code, card number, CVV) and check it
before dispatching `set_input`/`set_value` — refuse in the tool result rather
than silently no-opping, so the model can explain why to the user.

For destructive/irreversible actions (sign out, delete account, submit
payment), mark the tool `requiresConfirmation: true` and show a native
Allow/Deny sheet before running the handler — **fail closed** if no
confirmation UI happens to be mounted (treat "can't ask" as "denied").

---

## 6. The mic button (UI)

A simple floating action button, driven off the agent's status events, that
self-hides if voice isn't configured:

```tsx
export default function VoiceWidget() {
  const [status, setStatus] = useState<AgentStatus>('idle');
  useEffect(() => agent.on('statusChange', setStatus), []);

  if (!ELLO_CONFIGURED) return null; // whole feature is opt-in via credentials

  const active = status !== 'idle' && status !== 'ended';
  return (
    <Pressable onPress={() => (active ? agent.stop() : agent.start())}>
      <Icon name={active ? 'call_end' : 'mic'} />
    </Pressable>
  );
}
```

States worth distinguishing in your UI: `idle`, `connecting` (treat as
"active" so a second tap cancels the dial rather than being ignored),
`listening`, `speaking` (pulse animation reads well for both), `executingTool`.

Mount it once, near the root, alongside your navigation:

```tsx
export default function App() {
  return (
    <StoreProvider>
      <RootNavigator />
      <VoiceWidget />
      <ConfirmationSheet />
    </StoreProvider>
  );
}
```

**Microphone permission**: request it lazily, only when the user actually
taps the button to start a call (`PermissionsAndroid.request(RECORD_AUDIO)` /
iOS mic permission, or automatically via `getUserMedia()` if you're on the
WebRTC transport) — not at app boot. Nobody should see a mic permission
prompt before they've expressed any intent to use voice.

---

## 7. The system prompt — two layers, not one

Configure a large, static system prompt on the Ello dashboard against your
assistant, covering: how to open the call, ground truth about what your app
can and can't do (explicitly tell it not to invent features), the turn-by-turn
behavioral loop, tool-selection guidance, sensitive-data refusal rules, tone,
and hard prohibitions.

Separately, inject **small, fresh, per-turn context** from your client on
every page-context update (current screen name, available controls, a
one-line "what the user can do here" hint). Instructions living *only* in the
big static prompt tend to lose out to whatever's structurally closest to the
model at generation time — so anything that needs to be followed reliably on
the current screen should be re-asserted in the per-turn context, not just
stated once up front.

---

## 8. Minimal file layout to copy

```
src/voice/
  config.ts              # env/global resolution + ELLO_CONFIGURED gate
  types.ts               # AgentLike, ClientToolOptions, AgentEventMap, etc.
  agent.ts                # state machine: session create -> WS connect -> audio stream -> events
  transport/
    sessionApi.ts         # createVoiceSession() REST call
    ws.ts                 # thin WebSocket wrapper
  actionRegistry.ts        # per-screen target registry: registerTarget/findTarget/listTargets
  screenGraph.ts           # auto-discovery: element tree -> targets
  useVoiceTarget.ts        # escape-hatch hook for controls the tree-walk can't see
  tools.ts                 # registerCoreTools(): perform_ui_action + named aliases
  sensitive.ts             # denylist check for fields voice must never touch
  ui/
    VoiceWidget.tsx         # the floating mic button
    ConfirmationSheet.tsx   # Allow/Deny modal for requiresConfirmation tools
    confirmationBridge.ts   # imperative confirm() -> React modal bridge
```

Plus, at your repo root: `voiceCredentials.local.example.js` (committed) and
`voiceCredentials.local.js` (gitignored, real values).

---

## 9. Different platform? What changes

If you're integrating into a **web app** instead of React Native, the
protocol (REST session create → WebSocket → PCM chunks → tool calls) is
identical, but swap:

- Native mic/playback modules → Web Audio API (`AudioContext`,
  `ScriptProcessorNode` or `AudioWorklet`, manual resampling to 16kHz).
- `react-native-webrtc` → the browser's built-in `RTCPeerConnection`/`getUserMedia`.
- Consider **proxying session creation through your own backend** instead of
  calling Ello directly from the browser: Ello's REST API may not set CORS
  headers for arbitrary browser origins, and a browser bundle can't hide an
  API key the way a compiled mobile app at least obscures one. Your backend
  holds the real Ello key server-side and exposes a thin `/api/voice/session`
  endpoint that just forwards a role/context → picks the right assistant ID →
  calls Ello → returns the conversation id. This is the single biggest
  security-model difference between a mobile and a web integration — a
  mobile app embedding the key in its bundle is a reasonable, common
  trade-off; a website shipping the same key to every visitor's browser is not.

---

## 10. Checklist for a new app

- [ ] Ello assistant created, system prompt written (§7)
- [ ] API key + assistant ID obtained, put in a gitignored credentials file (§3)
- [ ] Session-create REST call wired up (§4a)
- [ ] WebSocket (or WebRTC) transport streaming mic audio and playing responses (§4b)
- [ ] Per-screen target registry + auto-discovery from your screen wrapper (§5b)
- [ ] `useVoiceTarget` escape hatch for controls inside shared components (§5b)
- [ ] One generic `perform_ui_action` tool + any named aliases your prompt needs (§5a)
- [ ] Tool results report actual resulting state, not assumed state (§5c)
- [ ] Sensitive-field denylist + confirmation gate for destructive actions (§5d)
- [ ] Floating mic button, self-hides when not configured, mic permission requested lazily (§6)
- [ ] Tested on **real hardware**, not just an emulator/simulator — echo
      cancellation and mic permission behavior both differ from emulators in
      ways that matter here.

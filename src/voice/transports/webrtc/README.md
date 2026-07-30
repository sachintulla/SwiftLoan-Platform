# Swappable transport: real WebRTC

This folder is a **self-contained alternative** to `../../agent.ts` +
`../../audio/nativeAudioBridge.ts` (the default transport). Everything it
needs lives inside this folder — delete `transports/webrtc/` and the two
lines that import it elsewhere to remove it cleanly, with zero cleanup
required in the rest of `src/voice/`.

## Why this exists

The default transport streams raw PCM chunks over a plain WebSocket
(`/ws-ello`) and relies on the phone's own hardware echo canceller to stop
the agent hearing itself over the speaker. Testing on a real device (Samsung
SM-G781B, 2026-07-29) found that canceller unreliable: our code correctly
attached and enabled it, but `adb shell dumpsys media.audio_flinger` still
reported `Enable Aec: 0` at the hardware level for our capture stream, and
the agent kept cutting itself off mid-sentence, hearing its own voice as
false user speech.

A **real, two-way WebRTC call** sidesteps this entirely: because it's an
actual call (not our own custom chunk protocol), the platform's WebRTC
engine gets a genuine reference signal and can run full, working echo
cancellation, noise suppression, and gain control automatically —
`getUserMedia({ audio: { echoCancellation, noiseSuppression, autoGainControl } })`
is enough, no custom native code, no faking a call.

This is modeled directly on Ello's own React Native SDK
(`yesgnome-ai/ellomobilesdk`, `src/services/WebRTCService.ts`) — the pattern
is copied, not the package. Their SDK's own app-control mechanism
(`AgentBridge`/`useAgentScreen`) is a simpler, coarser system (regex-parsed
JSON blocks inside the agent's spoken text, screens registered by hand) than
the generic, auto-discovering tool system already built in `../../tools.ts` +
`../../actionRegistry.ts` + `../../screenGraph.ts` — so only the **audio
transport** is reproduced here; the tool system is untouched and reused as-is
via the shared `AgentLike` interface in `../../types.ts`.

## What's unverified

**Whether `client_tools` / `client-tool-call` / `client-tools-ack` actually
flow over this signaling channel the way they do on `/ws-ello`.**
`ellomobilesdk`'s own client code never sends or handles them — it only uses
`conversation-text` and a simpler `agent_action` text-block model. The
message envelope is generic JSON exactly like `/ws-ello`
(`{type, data, session_id, conversation_id}`), and the same backend already
parallels `conversation-text`/`agent_action` across both transports, so it's
a reasonable bet that our tool-calling messages will work here too — but
it's a bet, not a confirmed fact. **Test a real call before relying on this
in production**, and check the transcript trace for `client-tools-ack` — if
it never arrives, the backend doesn't support tools on this path yet, and
that's worth raising with the Ello team directly rather than debugging
further on our end.

The signaling URL (`config.ts`'s `ELLO_WEBRTC_WS_URL`, defaulting to `/ws`
instead of `/ws-ello` on the same host) is also a best guess — it comes from
our own `../../config.ts` comment (`/ws` "routes to an unrelated generic
chat/WebRTC signaling manager") plus the dashboard's own capture connecting
to a `.../ws` path — not confirmed against the real stage environment.

## Why the tool-execution logic is duplicated, not shared

`WebRTCAgent.ts`'s `executeToolCall`/`runWithTimeout` are a byte-for-byte
copy of `../../agent.ts`'s. This is intentional: the working, device-tested
`ElloAgent` is not touched or refactored to share code with this
still-unverified transport, so nothing here can regress it. If both
transports end up staying in long-term use, factoring the shared tool-
execution logic into one file is a reasonable follow-up — but only once this
transport is itself proven.

## How to try it

Swap the import in `../../index.ts`:

```ts
// import { agent } from './agent';
import { webrtcAgent as agent } from './transports/webrtc';
```

Everything else — `ensureToolsRegistered`, the `VoiceWidget`, screen
registration — keeps working unchanged, since both transports satisfy the
same `AgentLike` shape.

## Dependencies

```
npm install react-native-webrtc react-native-incall-manager
cd ios && pod install
```

`react-native-incall-manager` is used defensively (`require` wrapped in
`try/catch`) — speaker routing falls back to the OS default if it's absent.

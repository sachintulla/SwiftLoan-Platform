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

## Status (tested 2026-10-29, Redmi Note 9 Pro Max, debug build, Wi-Fi)

Works end to end against `wss://connect-in.getello.ai/ws`: the peer connection reaches `connected`, the server answers
`client-tools-ack` accepting every tool, the agent hears the phone's mic and replies, and tool calls run over this
transport (`fill_field` filled the mobile number; a three-step application was completed by voice). The earlier
"unverified" worries (tool messages over `/ws`, the signalling URL) are resolved.

`WebRTCAgent` is now a SUBCLASS of `ElloAgent` (`../../agent.ts`), so it inherits the app-level behaviour instead of
copying it: the tool queue, page-context de-duplication and urgent updates, `already_introduced`, the "(no speech)"
filter, the stall / idle check-in watch, and holding a context update back while the agent is speaking. Only the
transport is its own: REST session, `RTCPeerConnection`, signalling, speaker routing, and a speaking detector built on
`getStats()` (`speakingMeter.ts`) because the agent's audio never passes through JS. `start(phone)` passes the phone
number to the session so the agent can look the customer up.

### Turn it on

`globalThis.SWIFTLOAN_VOICE_TRANSPORT = 'webrtc'` (gitignored `voiceCredentials.local.js`). Anything else = websocket.

### Still open before it could be the default

- **TURN relay.** A release build uses STUN only unless `globalThis.SWIFTLOAN_ICE_SERVERS` is set (see `iceServers.ts`);
  the free public relay (`openrelay.metered.ca`) is a debug-build convenience only. Strict-NAT mobile networks
  (some Jio/Airtel) need a relay we run or contract for. Not yet tested on mobile data.
- **iOS** is untested (AVAudioEngine voice processing in `VoiceAudioModule.swift` vs WebRTC's own audio session).
- Echo in a quiet room on the loudspeaker (the reason this exists), headset / Bluetooth routing, an incoming call,
  backgrounding, battery, and long calls are untested.

## How to try it

Set the switch above (no import to edit): `../../index.ts` picks the transport at startup. Everything else —
`ensureToolsRegistered`, the `VoiceWidget`, screen registration — is unchanged.

## Dependencies

```
npm install react-native-webrtc react-native-incall-manager
cd ios && pod install
```

`react-native-incall-manager` is used defensively (`require` wrapped in
`try/catch`) — speaker routing falls back to the OS default if it's absent.

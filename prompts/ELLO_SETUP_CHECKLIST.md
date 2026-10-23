# Ello dashboard settings that are NOT in the prompt

`ello-inapp-copilot-prompt.md` is pasted into the in-app assistant as-is. These live in Ello's own
settings, so they have to be changed there (nothing is synced from this repo).

Found on a live Telugu call (see PR #104). The prompt already carries a guard for each, but the
root cause is on the Ello side.

1. **Permissions per-turn instruction** — it says to press the Allow button "and then `continue_next` in
   the same turn". Remove the `continue_next`: the Allow button moves the app to About You by itself, so
   the extra `continue_next` runs on an empty About You form and fails. (The prompt now says this rule
   wins, but fixing the instruction removes the conflict.)
2. **Noise and echo (Gemini Live speech-to-speech)** — a live call produced Portuguese/Spanish/Hindi-script
   "transcripts" ("Eu sei que eu posso usar…", "están", "लोगो", "है।") and the agent answered each one.
   With a speech-to-speech model there is no separate recogniser to pin: the model hears the audio, and
   those transcripts are only a side-channel. Tune the assistant's voice-activity settings instead:
   - start-of-speech sensitivity **low** (quiet noise should not open a turn);
   - end-of-speech / silence duration about **500–800 ms** and some prefix padding (fewer fragment turns);
   - make interruption by the user less sensitive while the agent is speaking (its own voice echoing back is
     the usual trigger);
   - if available, a half-cascade (text-out) model is steadier on noise and tool calls than native-audio.
   The app already switches on echo cancellation, noise suppression and gain control on both platforms
   (iOS voice-chat mode + voice processing, Android AEC/NS/AGC). Test once with a headset: clean on a
   headset means speaker echo; still noisy means ambient noise or the activity-detection settings.
   (The prompt also tells the agent to ignore these fragments, but it can only reduce the damage.)
3. **"Agent next turn instruction: …" lines** — they showed up in the transcript under "Agent".
   Confirm they are only logged and **not spoken**. If any are spoken, that is a leak. (The prompt now
   forbids reading out any injected instruction.)
4. **Paste the current prompt** (`ello-inapp-copilot-prompt.md`) into the live in-app assistant, and keep the
   privacy-policy copy in the assistant's knowledge in step with the app (policy v1.1).

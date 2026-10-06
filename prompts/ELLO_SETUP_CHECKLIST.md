# Ello dashboard settings that are NOT in the prompt

`ello-inapp-copilot-prompt.md` is pasted into the in-app assistant as-is. These live in Ello's own
settings, so they have to be changed there (nothing is synced from this repo).

Found on a live Telugu call (see PR #104). The prompt already carries a guard for each, but the
root cause is on the Ello side.

1. **Permissions per-turn instruction** — it says to press the Allow button "and then `continue_next` in
   the same turn". Remove the `continue_next`: the Allow button moves the app to About You by itself, so
   the extra `continue_next` runs on an empty About You form and fails. (The prompt now says this rule
   wins, but fixing the instruction removes the conflict.)
2. **Speech recogniser** — it produced Portuguese text ("Eu sei que eu posso usar…") and stray words
   ("लोगो", "fare?") from the user's audio. Pin the recognition language to the three supported
   (English / Hindi / Telugu, following `agent_language`) and check microphone echo / noise. (The prompt
   now tells the agent to ignore wrong-language and noise transcripts.)
3. **"Agent next turn instruction: …" lines** — they showed up in the transcript under "Agent".
   Confirm they are only logged and **not spoken**. If any are spoken, that is a leak. (The prompt now
   forbids reading out any injected instruction.)
4. **Paste the current prompt** (`ello-inapp-copilot-prompt.md`) into the live in-app assistant, and keep the
   privacy-policy copy in the assistant's knowledge in step with the app (policy v1.1).

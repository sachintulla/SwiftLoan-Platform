/**
 * Template for the Ello voice credentials.
 *
 * Copy to `voiceCredentials.local.js` (gitignored) and fill in real values.
 * `index.js` imports it FIRST, before ./App, so these globals exist by the time
 * src/voice/config.ts initialises.
 *
 * Without this file the app still runs — the voice widget simply stays hidden
 * (see ELLO_CONFIGURED in src/voice/config.ts). Nothing else is affected.
 *
 * Do NOT commit real keys: they end up in the JS bundle and are extractable from
 * a built APK.
 */
global.SWIFTLOAN_ELLO_API_KEY = 'ak_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
global.SWIFTLOAN_ELLO_ASSISTANT_ID = 'your-assistant-id';
global.SWIFTLOAN_ELLO_API_BASE = 'https://api-in.getello.ai';
global.SWIFTLOAN_ELLO_WS_URL = 'wss://opensips-stage.getello.ai/ws-ello';

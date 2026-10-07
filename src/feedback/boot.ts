import { installPressableFx } from './installPressableFx';
import { initSounds } from './sounds';

// Side-effect module: imported FIRST in index.js so the agent-aware Pressable is in place before any
// screen module is evaluated (ES imports run in order; statements in index.js would run too late).
installPressableFx();
initSounds();

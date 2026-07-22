import crypto from 'node:crypto';
// Human-friendly loan/application reference, e.g. SL-884021.
export const makeRef = (prefix = 'SL') => `${prefix}-${crypto.randomInt(100000, 999999)}`;

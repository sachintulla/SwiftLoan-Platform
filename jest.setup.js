/* Test environment mocks for native modules. */

// AsyncStorage ships a ready-made jest mock (in-memory, no native bridge).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);

// Safe-area context ships a ready-made jest mock.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

// LinearGradient → a plain View so children still render.
jest.mock('react-native-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props) => React.createElement(View, props, props.children),
  };
});

// react-native-svg → render each primitive as a View/Text-ish stub that keeps children.
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const stub = (name) => (props) => React.createElement(View, { ...props, testID: props.testID || name }, props.children);
  return {
    __esModule: true,
    default: stub('Svg'),
    Svg: stub('Svg'),
    Path: stub('Path'),
    Circle: stub('Circle'),
    Rect: stub('Rect'),
    Defs: stub('Defs'),
    Stop: stub('Stop'),
    RadialGradient: stub('RadialGradient'),
    LinearGradient: stub('SvgLinearGradient'),
    G: stub('G'),
    Ellipse: stub('Ellipse'),
  };
});

// react-native-webrtc → its real module wraps a native NativeEventEmitter
// that doesn't exist in the Jest env (throws "requires a non-null argument").
// Only src/voice/transports/webrtc/ imports this; nothing in it is exercised
// by the existing test suite, so a minimal no-op stub is enough.
jest.mock('react-native-webrtc', () => ({
  __esModule: true,
  RTCPeerConnection: class {
    createOffer() { return Promise.resolve({ type: 'offer', sdp: '' }); }
    setLocalDescription() { return Promise.resolve(); }
    setRemoteDescription() { return Promise.resolve(); }
    addIceCandidate() { return Promise.resolve(); }
    addTrack() {}
    close() {}
  },
  RTCSessionDescription: class {},
  RTCIceCandidate: class {},
  mediaDevices: { getUserMedia: () => Promise.resolve({ getTracks: () => [], getAudioTracks: () => [] }) },
}));

// react-native-image-picker → its native module doesn't exist in the Jest env.
// Only src/screens/profile.tsx imports it; no test drives the picker itself.
jest.mock('react-native-image-picker', () => ({
  __esModule: true,
  launchCamera: jest.fn(),
  launchImageLibrary: jest.fn(),
}));

// react-native-nitro-sound / -nitro-modules → New-Arch native audio players that
// ship ESM + a native lookup Jest can't run. Only src/utils/sfx.ts imports them
// (fire-and-forget UI cues); stub createSound so the screen tree imports cleanly.
jest.mock('react-native-nitro-sound', () => ({
  __esModule: true,
  createSound: () => ({
    startPlayer: jest.fn(() => Promise.resolve()),
    stopPlayer: jest.fn(() => Promise.resolve()),
    setVolume: jest.fn(() => Promise.resolve()),
  }),
}));
jest.mock('react-native-nitro-modules', () => ({ __esModule: true, NitroModules: {} }));

// react-native-webview → native component (ESM), used only by src/screens/lenderweb.tsx.
// Stub as a plain View so the screen index imports cleanly in the Jest env.
jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  const WebView = (props) => React.createElement(View, { ...props, testID: props.testID || 'WebView' });
  return { __esModule: true, WebView, default: WebView };
});

// Silence the animation frame warnings in the jsdom-less RN test env.
global.requestAnimationFrame = global.requestAnimationFrame || ((cb) => setTimeout(() => cb(Date.now()), 0));
global.cancelAnimationFrame = global.cancelAnimationFrame || ((id) => clearTimeout(id));

// Stub network: screens are unauthenticated in tests (no token), so API calls are
// guarded off — but stub fetch so any stray call resolves instead of hitting a socket.
global.fetch = jest.fn(() =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }),
);

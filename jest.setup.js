/* Test environment mocks for native modules. */

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
  };
});

// Silence the animation frame warnings in the jsdom-less RN test env.
global.requestAnimationFrame = global.requestAnimationFrame || ((cb) => setTimeout(() => cb(Date.now()), 0));
global.cancelAnimationFrame = global.cancelAnimationFrame || ((id) => clearTimeout(id));

// Stub network: screens are unauthenticated in tests (no token), so API calls are
// guarded off — but stub fetch so any stray call resolves instead of hitting a socket.
global.fetch = jest.fn(() =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }),
);

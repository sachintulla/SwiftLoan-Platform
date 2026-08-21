module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // test-utils is a shared helper, not a test file.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/server/', '<rootDir>/admin/', '<rootDir>/__tests__/test-utils.tsx'],
  // Allow Jest to transform the RN libraries we depend on (they ship untranspiled ESM/Flow).
  //
  // Each entry must be listed explicitly: the alternatives are anchored with a trailing
  // slash, so `react-native` matches only the core package and NOT
  // `react-native-webview`. Missing `react-native-webview` made the whole
  // router.test.tsx suite fail to run with "Cannot use import statement outside a
  // module" — it was counted as one failure but was actually every test in that file.
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|@react-native-async-storage/async-storage|react-native|react-native-linear-gradient|react-native-svg|react-native-vector-icons|react-native-safe-area-context|react-native-webview)/)',
  ],
};

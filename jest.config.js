module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // test-utils is a shared helper, not a test file.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/server/', '<rootDir>/__tests__/test-utils.tsx'],
  // Allow Jest to transform the RN libraries we depend on (they ship untranspiled ESM/Flow).
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|react-native|react-native-linear-gradient|react-native-svg|react-native-vector-icons|react-native-safe-area-context)/)',
  ],
};

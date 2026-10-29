module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // test-utils is a shared helper, not a test file.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/server/', '<rootDir>/admin/', '<rootDir>/website-next/', '<rootDir>/__tests__/test-utils.tsx'],
  // Audio assets (.m4a) aren't handled by the RN asset transformer — stub them so
  // files that require() them (RubyWelcome) can be imported under Jest.
  moduleNameMapper: {
    '\\.(m4a|mp3|wav|aac)$': '<rootDir>/__mocks__/audioAssetMock.js',
  },
  // Allow Jest to transform the RN libraries we depend on (they ship untranspiled ESM/Flow).
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|@react-native-async-storage/async-storage|react-native|react-native-linear-gradient|react-native-svg|react-native-vector-icons|react-native-safe-area-context)/)',
  ],
};

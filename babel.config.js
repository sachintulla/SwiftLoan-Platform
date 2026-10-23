module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // Whitelisted so a build machine's full env doesn't leak into the bundle —
    // only this one var gets inlined as a literal string at bundle time.
    ['transform-inline-environment-variables', { include: ['ELLO_MOBILE_APP_ASS'] }],
  ],
};

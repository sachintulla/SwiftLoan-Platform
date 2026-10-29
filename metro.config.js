const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * Note: standalone release/debug APKs are produced by pre-bundling the JS from
 * the real C:\ path (`react-native bundle`) and building via the X: subst drive
 * with the bundle already in android/app/src/main/assets — Metro can't bundle
 * *through* the subst drive (drive-mismatched SHA-1), and native can't compile
 * from the real deep path (260-char limit). See build-apks below.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const defaultConfig = getDefaultConfig(__dirname);

const config = {
  // The backend lives in ./server with its own node_modules — keep Metro out of it
  // to avoid haste-module name collisions.
  resolver: {
    blockList: [/\/server\/.*/, /\/admin\/.*/],
    // Bundle the Ruby welcome intro's audio track (the GIF uses a default asset type).
    assetExts: [...defaultConfig.resolver.assetExts, 'm4a'],
  },
};

module.exports = mergeConfig(defaultConfig, config);

const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  // The backend lives in ./server with its own node_modules — keep Metro out of it
  // to avoid haste-module name collisions.
  resolver: {
    blockList: [/\/server\/.*/, /\/admin\/.*/],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);

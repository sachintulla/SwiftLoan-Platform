// Jest can't parse binary audio assets; RubyWelcome only reads `.uri` off the
// resolved asset, so a minimal stub is enough for render tests.
module.exports = { uri: 'mock-audio', testUri: 'mock-audio' };

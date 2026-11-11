/**
 * @format
 */

// voiceCredentials.local MUST be the very first import: it sets globals that modules read at
// load time (src/analytics/meta.ts reads SWIFTLOAN_META_CLIENT_TOKEN), and feedback/boot pulls in
// the store -> analytics/meta. Loaded after boot, the Meta client token read as empty and Meta never started.
import './voiceCredentials.local';
import './src/config/build'; // sets the deployed API base before anything loads
import './src/feedback/boot'; // UI click sounds: must load before any screen module
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);

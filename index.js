/**
 * @format
 */

import './src/config/build'; // sets the deployed API base before anything loads
import './src/feedback/boot'; // UI click sounds: must load before any screen module
import './voiceCredentials.local'; // must load first — sets globals src/voice/config.ts reads at init
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);

/**
 * @format
 */

import './src/config/build'; // sets the deployed API base before anything loads
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);

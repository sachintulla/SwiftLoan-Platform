import React from 'react';
import { Screen as ScreenName } from '../state/store';

import Splash from './splash';
import Privacy from './privacy';
import Language from './language';
import Intro from './intro';
import Mobile from './mobile';
import Permissions from './permissions';
import AboutYou from './aboutyou';
import Home from './home';
import Fare from './fare';
import Calculator from './calculator';
import Loans from './loans';
import Basic from './basic';
import BasicPan from './basicpan';
import MoreDetails from './moredetails';
import Finding from './finding';
import Offers from './offers';
import Handoff from './handoff';
import LenderWeb from './lenderweb';
import StatusScreen from './status';
import Disbursed from './disbursed';
import Repay from './repay';
import Profile from './profile';
import Help from './help';

// Screens are registered here as they are ported. Missing entries fall back to a
// placeholder in the Router so the full navigation graph stays walkable end-to-end.
export const SCREENS: Partial<Record<ScreenName, React.ComponentType>> = {
  splash: Splash,
  privacy: Privacy,
  language: Language,
  intro: Intro,
  mobile: Mobile,
  otp: Mobile, // OTP is the otpSent state of the mobile screen
  permissions: Permissions,
  aboutyou: AboutYou,
  home: Home,
  fare: Fare,
  calculator: Calculator,
  loans: Loans,
  basic: Basic,
  moredetails: MoreDetails,
  basicpan: BasicPan,
  finding: Finding,
  offers: Offers,
  handoff: Handoff,
  lenderweb: LenderWeb,
  status: StatusScreen,
  disbursed: Disbursed,
  repay: Repay,
  profile: Profile,
  help: Help,
};

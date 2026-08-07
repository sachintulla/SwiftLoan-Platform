import React from 'react';
import { Screen as ScreenName } from '../state/store';

import Splash from './splash';
import Language from './language';
import Intro from './intro';
import Mobile from './mobile';
import Permissions from './permissions';
import AboutYou from './aboutyou';
import Home from './home';
import Fare from './fare';
import Loans from './loans';
import Basic from './basic';
import BasicPan from './basicpan';
import Finding from './finding';
import Offers from './offers';
import Handoff from './handoff';
import Kyc from './kyc';
import Aadhaar from './aadhaar';
import Panv from './panv';
import Bankv from './bankv';
import Selfie from './selfie';
import StatusScreen from './status';
import Disbursed from './disbursed';
import Repay from './repay';
import CreditScore from './creditscore';
import Profile from './profile';
import Help from './help';
import Explore from './explore';

// Screens are registered here as they are ported. Missing entries fall back to a
// placeholder in the Router so the full navigation graph stays walkable end-to-end.
export const SCREENS: Partial<Record<ScreenName, React.ComponentType>> = {
  splash: Splash,
  language: Language,
  intro: Intro,
  mobile: Mobile,
  otp: Mobile, // OTP is the otpSent state of the mobile screen
  permissions: Permissions,
  aboutyou: AboutYou,
  home: Home,
  fare: Fare,
  loans: Loans,
  basic: Basic,
  basicpan: BasicPan,
  finding: Finding,
  offers: Offers,
  handoff: Handoff,
  kyc: Kyc,
  aadhaar: Aadhaar,
  panv: Panv,
  bankv: Bankv,
  selfie: Selfie,
  status: StatusScreen,
  disbursed: Disbursed,
  repay: Repay,
  creditscore: CreditScore,
  profile: Profile,
  help: Help,
  explore: Explore,
};

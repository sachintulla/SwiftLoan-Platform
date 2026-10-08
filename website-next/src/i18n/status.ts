import { defineCopy } from '@/lib/i18n';

/** Application / lender-application status labels, as the visitor reads them. Keys are the API statuses. */
export const statusCopy = defineCopy({
  en: {
    inProgress: 'In progress',
    applied: 'Applied',
    underReview: 'Under review',
    approved: 'Approved',
    active: 'Active',
    rejected: 'Rejected',
    failed: 'Failed',
    closed: 'Closed',
  },
  hi: {
    inProgress: 'प्रगति में',
    applied: 'आवेदन किया गया',
    underReview: 'समीक्षा में',
    approved: 'स्वीकृत',
    active: 'सक्रिय',
    rejected: 'अस्वीकृत',
    failed: 'विफल',
    closed: 'बंद',
  },
  te: {
    inProgress: 'ప్రక్రియలో ఉంది',
    applied: 'దరఖాస్తు చేశారు',
    underReview: 'సమీక్షలో ఉంది',
    approved: 'ఆమోదించబడింది',
    active: 'యాక్టివ్',
    rejected: 'తిరస్కరించబడింది',
    failed: 'విఫలమైంది',
    closed: 'మూసివేయబడింది',
  },
});

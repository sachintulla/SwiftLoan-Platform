import { PrismaClient } from '@prisma/client';

// Single shared client (connection pooling handled by Prisma). Scalable default.
//
// The PAN columns (and the lender's note on a lender application) are OMITTED from every query by default, so no route, admin endpoint, log line or API
// response can leak a PAN by accident (a plain `findUnique`/`include` simply never selects them). The only
// way to read one is an explicit `select` — see lib/storedPan.ts, the single place that does.
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['warn', 'error'],
  omit: {
    user: { panNumber: true, panEnc: true },
    loanApplication: { panNumber: true, panEnc: true },
    // The lender's own words (journey.reason) are for the admin only: the customer app must never receive them.
    lenderApplication: { lenderNote: true, lenderNoteAt: true },
  },
});

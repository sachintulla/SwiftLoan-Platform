/** Delete the mock-aurix test PANs' cached records (local testing only). */
import { prisma } from '../src/lib/prisma.js';
import { panHash } from '../src/lib/pii.js';

const PANS = ['AAAPA1111A', 'AAAPB2222B', 'AAAPC3333C', 'AAAPD4444D', 'AAAPE5555E', 'AAAPF6666F', 'AAAPG7777G', 'AAAPH8888H', 'AAAPZ9999Z', 'AAAPY8888Y'];
if (process.env.NODE_ENV === 'production') throw new Error('refusing to run in production');
const r = await prisma.panRecord.deleteMany({ where: { panHash: { in: PANS.map(panHash) } } });
console.log(`reset ${r.count} mock test PAN record(s)`);
await prisma.$disconnect();

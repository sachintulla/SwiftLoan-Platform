/**
 * Print the STRUCTURE of stored Aurix pan_comprehensive responses — key names
 * and value types only — so the pre-fill mapping in lib/panVerification.ts can
 * be matched to Aurix's real field names without anyone seeing the personal
 * data. Values are masked except short status-like fields (Success, Category,
 * Status…), which carry no identity.
 *
 *   docker exec swiftloan-api npx tsx scripts/pan-response-shape.ts [limit]
 */
import { prisma } from '../src/lib/prisma.js';
import { decryptJson } from '../src/lib/pii.js';

const SAFE_KEY = /^(success|statuscode|message|status|panstatus|category|pantype|aadhaar.*|.*linked|.*seed.*|isvalid|valid|verified|isverified|customerrorcode|isretryallowed)$/i;

function shape(v: any, key = ''): any {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.length ? [shape(v[0], key), `…${v.length} item(s)`] : [];
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x, k)]));
  if (typeof v === 'boolean') return v;
  if (SAFE_KEY.test(key)) return v;
  return `<${typeof v}${typeof v === 'string' ? `:${v.length}` : ''}>`;
}

const limit = parseInt(process.argv[2] || '3', 10);
const recs = await prisma.panRecord.findMany({ orderBy: { updatedAt: 'desc' }, take: limit });
for (const r of recs) {
  const data = r.dataEnc ? decryptJson<{ raw: unknown; prefill: unknown }>(r.dataEnc) : null;
  console.log(`\n── PanRecord ${r.id} status=${r.status} verified=${r.verified} category=${r.category} aadhaarLinked=${r.aadhaarLinked}`);
  console.log('prefill keys:', Object.keys((data?.prefill as object) ?? {}).join(', ') || '(none)');
  console.log(JSON.stringify(shape(data?.raw), null, 2));
}
await prisma.$disconnect();

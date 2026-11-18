// Digitap "Mobile to Prefill" (lib/digitap.ts + lib/mobilePrefill.ts): the REAL fetch-and-save path against a FAKE
// Digitap server on localhost, in a THROWAWAY database. Nothing real is called.
// Run with: cd server && bash scripts/journey/run-mobile-prefill.sh
import http from 'node:http';

(async () => {
  const S = new URL('../../src/lib', import.meta.url).pathname;

  let fails = 0;
  const check = (name: string, ok: boolean, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  → ' + detail : ''}`); };

  // ── fake Digitap: answers per mobile number, records every request
  const PAN = 'CXXPD1234H';
  const calls: { body: any; auth: string }[] = [];
  const success = (extra = true) => ({
    http_response_code: 200, client_ref_num: 'x', request_id: 'req-ok', result_code: 101, message: 'success',
    result: {
      name: 'JOHN DOE', dob: '19-09-2001', age: '23', gender: 'Male', pan: PAN, email: 'john.doe@example.com',
      official_documents: [{ document: 'Voter_ID', document_id: 'XXXXXX8398' }],
      alternate_emails: ['other@example.com'],
      address: [
        { first_line_of_address: '7, DOE STREET', second_line_of_address: 'MARATHAHALLI', third_line_of_address: 'BANGALORE', city: null, state: 'KARNATAKA', postal_code: '560048', reported_date: '30-03-2023' },
        { first_line_of_address: '301, SUNRISE TOWER', second_line_of_address: 'NAVI MUMBAI', third_line_of_address: 'MAHARASHTRA', city: null, state: 'MAHARASHTRA', postal_code: '400708', reported_date: '15-04-2025' },
      ],
      score: '800',
      ...(extra ? {
        alternate_mobile_numbers: ['9649112345'],
        additional_details: {
          employment_details: { income_range: '4,00,001 - 6,00,000', occupation: 'SALARIED' },
          alternate_mobile_numbers: [{ mobile_number: '9649112345', reported_date: '30-06-2025' }],
        },
      } : {}),
    },
  });
  const P = { fresh: '9000000061', named: '9000000062', none: '9000000063', noOptions: '9000000064', down: '9000000065', otherPan: '9000000066', off: '9000000067', filled: '9000000068' };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = JSON.parse(raw || '{}');
      calls.push({ body, auth: String(req.headers.authorization ?? '') });
      const send = (status: number, payload: unknown) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(payload)); };
      if (body.mobile_no === P.none) return send(200, { http_response_code: 200, request_id: 'req-none', result_code: 102, message: 'no record found', result: null });
      if (body.mobile_no === P.down) return send(503, { http_response_code: 503, request_id: 'req-down', result_code: null, message: 'source error', result: null });
      if (body.mobile_no === P.noOptions && body.options) return send(403, { http_response_code: 403, result_code: null, message: 'The following service(s) are not enabled for this client: additional_details', result: null });
      return send(200, success(!!body.options));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  process.env.DIGITAP_BASE_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  const { prisma } = await import(`${S}/prisma.js`);
  const { refreshTimings } = await import(`${S}/timingsStore.js`);
  const { startMobilePrefill, mobilePrefillSettled, usePrefillForApplication, mobilePrefillEnabled } = await import(`${S}/mobilePrefill.js`);
  const { loadPan, userPanData } = await import(`${S}/storedPan.js`);
  const { decryptJson } = await import(`${S}/pii.js`);
  await refreshTimings();

  const make = (phone: string, data: Record<string, unknown> = {}) => prisma.user.create({ data: { phone, phoneVerified: true, ...data } });
  const login = async (u: { id: string; phone: string }) => { startMobilePrefill(u); await mobilePrefillSettled(u.id); };
  const callsFor = (phone: string) => calls.filter((c) => c.body.mobile_no === phone);
  const full = (id: string) => prisma.user.findUnique({ where: { id }, omit: { creditScore: false, panEnc: false } }) as Promise<any>;

  check('switched on by DIGITAP_ENABLED + address + client ID + secret', mobilePrefillEnabled() === true);

  // ── 1. a brand-new user: no name on record → name lookup; everything saved
  const fresh = await make(P.fresh);
  await login(fresh);
  const c1 = callsFor(P.fresh);
  check('one call after login', c1.length === 1, `${c1.length} calls`);
  check('Basic auth with client id:secret', c1[0]?.auth === `Basic ${Buffer.from('test-id:test-secret').toString('base64')}`);
  check('no name on record (outside UAT) → name_lookup 1, no name sent', c1[0]?.body.name_lookup === 1 && !('first_name' in c1[0].body), JSON.stringify(c1[0]?.body));
  check('asks only for alternate numbers + additional details', JSON.stringify(c1[0]?.body.options) === JSON.stringify(['alternate_mobile_numbers', 'additional_details']));
  const row1 = await prisma.mobilePrefill.findUnique({ where: { userId: fresh.id }, omit: { dataEnc: false } });
  check('row saved as found, with a PAN', row1?.status === 'found' && row1.hasPan === true && row1.requestId === 'req-ok' && row1.nameSource === 'name_lookup');
  check('stored details are encrypted (no PAN, name or email in the clear)', !!row1?.dataEnc && !/CXXPD1234H|JOHN|john\.doe/i.test(row1.dataEnc));
  const stored = decryptJson<any>(row1!.dataEnc!);
  check('income range kept as text; age kept', stored.details.incomeRange === '4,00,001 - 6,00,000' && stored.details.age === 23);
  check('other documents and alternate emails are not stored', !JSON.stringify(stored.raw).includes('Voter_ID') && !JSON.stringify(stored.raw).includes('other@example.com'));
  const u1 = await full(fresh.id);
  check('User filled: name, date of birth, gender, email', u1.firstName === 'JOHN' && u1.lastName === 'DOE' && u1.fullName === 'JOHN DOE' && u1.gender === 'male' && u1.email === 'john.doe@example.com' && u1.dob?.toISOString().startsWith('2001-09-19'));
  check('User filled: latest address', u1.addressLine1 === '301, SUNRISE TOWER' && u1.state === 'MAHARASHTRA' && u1.pincode === '400708', `${u1.addressLine1} / ${u1.pincode}`);
  check('User filled: alternate number, salaried, income = top of range', u1.alternateMobile === '9649112345' && u1.employment === 'salaried' && u1.monthlyIncome === 600000);
  check('credit score saved', u1.creditScore === 800);
  check('PAN saved encrypted, and step 1 NOT marked done at login', (await loadPan(fresh.id)) === PAN && u1.panOnFile === false && u1.panNumber == null && !String(u1.panEnc).includes(PAN));
  const plain = (await prisma.user.findUnique({ where: { id: fresh.id } })) as any;
  check('a normal user query carries no score and no PAN', !('creditScore' in plain) && !('panEnc' in plain));

  // ── 2. logging in again never calls again
  await login(fresh);
  check('second login → no second call', callsFor(P.fresh).length === 1);

  // ── 3. starting the application
  const peek = await usePrefillForApplication(fresh.id, { attach: false });
  check('peek: found, masked PAN only', peek.found === true && peek.maskedPan === 'XXXXXX234H' && !JSON.stringify(peek).includes(PAN));
  check('peek does not mark step 1 done', (await full(fresh.id)).panOnFile === false);
  const used = await usePrefillForApplication(fresh.id, { attach: true });
  check('start: found, step-2 details returned', used.found === true && used.prefill.firstName === 'JOHN' && used.prefill.pincode === '400708' && used.prefill.dob === '2001-09-19');
  check('start: no score / income / PAN in what the client gets', !/800|600000|CXXPD1234H/.test(JSON.stringify(used)));
  const u1b = await full(fresh.id);
  const row1b = await prisma.mobilePrefill.findUnique({ where: { userId: fresh.id } });
  check('start: PAN on file now, usable by the application', u1b.panOnFile === true && (await loadPan(fresh.id)) === PAN && !!row1b?.usedAt);

  // ── 4. a user whose name we know → that name is sent
  const named = await make(P.named, { firstName: 'Ravi', lastName: 'Sharma' });
  await login(named);
  const c4 = callsFor(P.named)[0]?.body;
  check('known name → name_lookup 0 with that name', c4?.name_lookup === 0 && c4.first_name === 'Ravi' && c4.last_name === 'Sharma' && c4.name_fallback === 0, JSON.stringify(c4));
  const u4 = await full(named.id);
  check('existing name is kept, empty fields are filled', u4.firstName === 'Ravi' && u4.lastName === 'Sharma' && u4.pincode === '400708');
  check('email already used by another account is skipped', u4.email === null);

  // ── 5. no record
  const none = await make(P.none);
  await login(none);
  const row5 = await prisma.mobilePrefill.findUnique({ where: { userId: none.id } });
  check('no record → saved as not_found, nothing filled', row5?.status === 'not_found' && row5.reason === 'no_record' && (await full(none.id)).firstName === null);
  check('no record → the normal PAN step', (await usePrefillForApplication(none.id, { attach: true })).found === false && (await full(none.id)).panOnFile === false);
  await login(none);
  check('no record is not asked again straight away', callsFor(P.none).length === 1);

  // ── 6. extras not enabled → one retry without them
  const noOpt = await make(P.noOptions);
  await login(noOpt);
  const c6 = callsFor(P.noOptions);
  check('403 "not enabled" → asked once more without options', c6.length === 2 && !!c6[0]?.body.options && !('options' in c6[1]!.body));
  const u6 = await full(noOpt.id);
  check('basic details still saved; no income / alternate number', u6.firstName === 'JOHN' && u6.monthlyIncome === null && u6.alternateMobile === null && (await loadPan(noOpt.id)) === PAN);

  // ── 7. provider down
  const down = await make(P.down);
  await login(down);
  const row7 = await prisma.mobilePrefill.findUnique({ where: { userId: down.id } });
  check('503 → saved as error, called once, flow unchanged', row7?.status === 'error' && callsFor(P.down).length === 1 && (await usePrefillForApplication(down.id, { attach: true })).found === false);
  await login(down);
  check('an error is not retried on the very next login', callsFor(P.down).length === 1);

  // ── 8. a different PAN already on file is never switched silently
  const other = await make(P.otherPan, userPanData('ABCPA1234A'));
  await login(other);
  check('different PAN on file → kept, and the PAN step is shown', (await loadPan(other.id)) === 'ABCPA1234A' && (await usePrefillForApplication(other.id, { attach: true })).found === false && (await loadPan(other.id)) === 'ABCPA1234A');

  // ── 9. what the user already gave us is never overwritten
  const filled = await make(P.filled, { firstName: 'Meena', gender: 'female', city: 'Pune', monthlyIncome: 42000, employment: 'self_employed', alternateMobile: '9000000001', email: 'meena@example.com' });
  await login(filled);
  const u9 = await full(filled.id);
  check('existing profile untouched', u9.firstName === 'Meena' && u9.gender === 'female' && u9.city === 'Pune' && u9.addressLine1 === null && u9.monthlyIncome === 42000 && u9.employment === 'self_employed' && u9.alternateMobile === '9000000001' && u9.email === 'meena@example.com');

  // ── 10. switched off → nothing is called
  process.env.DIGITAP_ENABLED = 'false';
  await refreshTimings();
  const off = await make(P.off);
  await login(off);
  check('switched off → no call, no row, normal flow', callsFor(P.off).length === 0 && !(await prisma.mobilePrefill.findUnique({ where: { userId: off.id } })) && (await usePrefillForApplication(fresh.id, { attach: true })).found === false);

  // ── 11. deleting the account removes the fetched details
  await prisma.user.delete({ where: { id: noOpt.id } });
  check('account deleted → fetched details deleted', !(await prisma.mobilePrefill.findUnique({ where: { userId: noOpt.id } })));

  server.close();
  await prisma.$disconnect();
  console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

// "Send me the link" asked on a call (lib/agentLink.ts): the REAL send path against a FAKE Vox server on localhost, in a THROWAWAY
// database. Proves both the SMS and the WhatsApp go out with the same three values (name, status, link), for a known and an
// unknown number, and the safety rules. Nothing real is sent.
// Run with: cd server && bash scripts/journey/run-agent-link.sh
import http from 'node:http';

(async () => {
  const S = new URL('../../src/lib', import.meta.url).pathname;
  const { prisma } = await import(`${S}/prisma.js`);
  const { sendAgentLink, resolveAgentLinkPhone } = await import(`${S}/agentLink.js`);
  const { refreshTimings } = await import(`${S}/timingsStore.js`);

  let fails = 0;
  const check = (name: string, ok: boolean, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  → ' + detail : ''}`); };

  // ── one fake Vox server for both: /sms records SMS, anything else records WhatsApp
  const sms: any[] = [];
  const wa: any[] = [];
  let smsDown = false;
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = JSON.parse(raw || '{}');
      res.setHeader('content-type', 'application/json');
      if (req.url?.startsWith('/sms')) {
        sms.push(body);
        if (smsDown) { res.statusCode = 500; return res.end(JSON.stringify({ code: 500, message: 'down' })); }
        return res.end(JSON.stringify({ code: 200, message: 'accepted', data: { message_id: `S${sms.length}` } }));
      }
      wa.push(body);
      res.end(JSON.stringify({ status: 'Success', code: 200, id: `WCA-test-${wa.length}`, message: 'queued' }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  const settings = { baseUrl: `http://127.0.0.1:${port}`, smsUrl: `http://127.0.0.1:${port}/sms`, projectId: 'PRJTEST', sender: '917842712346', smsSender: 'PTSLA', messageCategory: 'MARKETING' };
  await prisma.integrationConfig.upsert({
    where: { provider: 'voxvalley' },
    update: { enabled: true, settings, secrets: { authToken: 'test-token' } },
    create: { provider: 'voxvalley', enabled: true, settings, secrets: { authToken: 'test-token' } },
  });
  await refreshTimings();

  const P = { known: '9000000051', unknown: '9000000052', lost: '9000000053', withRef: '9000000054' };
  await prisma.user.deleteMany({ where: { phone: { in: Object.values(P) } } });
  await prisma.customer.deleteMany({ where: { phone: { in: Object.values(P) } } });
  const known = await prisma.user.create({ data: { phone: P.known, firstName: 'PRIYA sharma', panOnFile: true } });
  await prisma.customer.create({ data: { phone: P.lost, name: 'Ravi', currentStage: 'lost' } });
  const withRef = await prisma.user.create({ data: { phone: P.withRef, firstName: 'Meena' } });
  await prisma.journeyReminder.create({ data: { userId: withRef.id, phone: P.withRef, token: 'WEBREF01', startAt: new Date(), status: 'stopped', stopReason: 'returned' } });

  const SMS_TEXT = (name: string, link: string) =>
    `Dear ${name} , your SwiftLoan loan application is incomplete at Starting a Loan Application. Please open the SwiftLoan app to continue where you left off :${link}. Team SwiftLoan\n-PurpleTalk IPL`;
  const params = (b: any) => (b?.template?.components?.[0]?.parameters ?? []).map((p: any) => p.text);
  const t0 = new Date();

  // ── 1. a known person with no link reference yet
  const r1 = await sendAgentLink(P.known, t0);
  const ref1 = await prisma.journeyReminder.findFirst({ where: { userId: known.id } });
  const link1 = `https://api.swiftloan.ai/dl?ref=${ref1?.token}`;
  check('known number: sent on both channels', r1.sent && r1.sms === 'sent' && r1.whatsapp === 'sent' && r1.known_customer, JSON.stringify(r1));
  check('known number: a link reference was made for them, ended (no reminder job runs it), resuming at Basic details',
    !!ref1 && ref1.status === 'completed' && ref1.stopReason === 'agent_link' && ref1.lastStep === 'pan_done', JSON.stringify({ status: ref1?.status, step: ref1?.lastStep }));
  check('SMS: the registered DLT text with their name, the status and their link', sms[0]?.template_id === '1277179300146510723' && sms[0]?.body === SMS_TEXT('Priya Sharma', link1) && sms[0]?.from === 'PTSLA', sms[0]?.body);
  check('WhatsApp: install_app_resume_step with the SAME three values', wa[0]?.template?.name === 'install_app_resume_step' && JSON.stringify(params(wa[0])) === JSON.stringify(['Priya Sharma', 'Starting a Loan Application', link1]), JSON.stringify(params(wa[0])));
  check('the agent is told it was sent by SMS and WhatsApp', /by SMS and WhatsApp/.test(r1.say));

  // ── 2. asked again within the hour → nothing more
  const r2 = await sendAgentLink(P.known, new Date(t0.getTime() + 5 * 60_000));
  check('same number again within the hour: not sent twice', !r2.sent && r2.reason === 'sent_recently' && sms.length === 1 && wa.length === 1, JSON.stringify(r2));

  // ── 3. a number we have never seen
  const r3 = await sendAgentLink(P.unknown, t0);
  check('unknown number: sent anyway, as "Customer", with the plain app link', r3.sent && !r3.known_customer && sms[1]?.body === SMS_TEXT('Customer', 'https://api.swiftloan.ai/dl?campaign=voice_agent')
    && JSON.stringify(params(wa[1])) === JSON.stringify(['Customer', 'Starting a Loan Application', 'https://api.swiftloan.ai/dl?campaign=voice_agent']), sms[1]?.body);
  check('unknown number: no account or reference is created', (await prisma.user.count({ where: { phone: P.unknown } })) === 0);

  // ── 4. someone who already has a website reference keeps it
  await sendAgentLink(P.withRef, t0);
  check('existing website reference is reused (same link as their reminders)', params(wa[2])[2] === 'https://api.swiftloan.ai/dl?ref=WEBREF01' && (await prisma.journeyReminder.count({ where: { userId: withRef.id } })) === 1, params(wa[2])[2]);

  // ── 5. do-not-contact
  const before = sms.length + wa.length;
  const r5 = await sendAgentLink(P.lost, t0);
  check('do-not-contact: nothing is sent', !r5.sent && r5.reason === 'do_not_contact' && sms.length + wa.length === before);

  // ── 6. SMS gateway down: WhatsApp still goes, and the agent is told only WhatsApp
  smsDown = true;
  await prisma.outboundRequest.deleteMany({ where: { kind: 'agent_link' } });
  const r6 = await sendAgentLink(P.unknown, new Date(t0.getTime() + 2 * 3_600_000));
  check('SMS fails, WhatsApp accepted: sent, and the agent says WhatsApp only', r6.sent && r6.sms === 'failed' && r6.whatsapp === 'sent' && /on WhatsApp/.test(r6.say), JSON.stringify(r6));

  // ── 7. phone from the call, not from the tool
  await prisma.callAttempt.create({ data: { phone: P.known, providerConversationId: 'conv-test-1', channel: 'voice' } as any });
  check('conversation_id resolves to the number we dialled', (await resolveAgentLinkPhone({ conversationId: 'conv-test-1', phone: '9999999999' })) === P.known);
  check('a plain phone works when there is no conversation id', (await resolveAgentLinkPhone({ phone: '+91 90000 00052' })) === P.unknown);

  // ── 8. recorded for Admin → Messages
  check('every send is recorded as kind agent_link', (await prisma.messageDelivery.count({ where: { kind: 'agent_link' } })) >= 5);

  server.close();
  await prisma.$disconnect();
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

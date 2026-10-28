// Stuck-stage rules limited to the website or the app (StallRule.surface): a website-only rule counts only website triggers,
// an app-only rule counts everything that is not the website, and 'all' behaves exactly as before. Runs the real engine in a
// THROWAWAY database. Nothing is sent (all providers off). Run with: cd server && bash scripts/journey/run-stage-surface.sh
(async () => {
  const S = new URL('../../src/lib', import.meta.url).pathname;
  const { prisma } = await import(`${S}/prisma.js`);
  const { evaluateRule } = await import(`${S}/stallRules.js`);

  let fails = 0;
  const check = (name: string, ok: boolean, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

  // throwaway database: clear the stage's existing rules so only the ones this check creates can match
  await prisma.stallRule.deleteMany({ where: { triggerEvent: 'otp_verified' } });

  const now = new Date();
  const ago = (m: number) => new Date(now.getTime() - m * 60_000);
  const tag = String(Date.now()).slice(-6);
  const mk = async (phone: string, channel: string) => {
    const c = await prisma.customer.create({ data: { phone, firstSource: channel === 'website' ? 'website' : 'app' } });
    await prisma.journeyEvent.create({ data: { customerId: c.id, channel, name: 'otp_verified', occurredAt: ago(30) } });
    return c;
  };
  const web = await mk(`9100${tag}1`, 'website');
  const app = await mk(`9100${tag}2`, 'app');

  const mkRule = (surface: string, channel: 'push' | 'sms' = 'push') => prisma.stallRule.create({
    data: { name: `check ${surface} ${channel}`, triggerEvent: 'otp_verified', expectedEvent: 'eligibility_started', delayMinutes: 5, upshotEvent: `check_${surface}_${channel}_${tag}`, channel, cooldownMinutes: 1440, enabled: true, surface },
  });
  const reached = async (rule: { id: string }) => {
    await evaluateRule(rule, now);
    const rows = await prisma.outboundRequest.findMany({ where: { idempotencyKey: { startsWith: `stall:${rule.id}:` } }, select: { customerId: true } });
    return new Set(rows.map((r: any) => r.customerId));
  };

  const rAll = await mkRule('all'); const rWeb = await mkRule('website'); const rApp = await mkRule('app');
  const fromAll = await reached(rAll); const fromWeb = await reached(rWeb); const fromApp = await reached(rApp);

  check("'all' rule reaches both people (nothing changed for existing rules)", fromAll.has(web.id) && fromAll.has(app.id), `reached=${fromAll.size}`);
  check("website rule reaches only the person who stopped on the website", fromWeb.has(web.id) && !fromWeb.has(app.id), `reached=${fromWeb.size}`);
  check("app rule reaches only the person who stopped in the app", fromApp.has(app.id) && !fromApp.has(web.id), `reached=${fromApp.size}`);

  // the same step may now have a website rule AND an app rule on the same channel (the old unique key forbade it)
  let dup = true;
  try { await mkRule('website'); } catch { dup = false; }
  check('two rules for the same step and channel cannot share a side', dup === false);
  let dupAll = true;
  try { await mkRule('all'); } catch { dupAll = false; }
  check("two rules for the same step, channel and 'all' cannot coexist either", dupAll === false);

  // moving on from EITHER side counts: a website visitor who then verified in the app is no longer stuck
  await prisma.journeyEvent.create({ data: { customerId: web.id, channel: 'app', name: 'eligibility_started', occurredAt: ago(10) } });
  const rWeb2 = await mkRule('website', 'sms');
  const fromWeb2 = await reached(rWeb2);
  check('a website visitor who moved on in the app is not nudged as stuck', !fromWeb2.has(web.id), `reached=${fromWeb2.size}`);

  await prisma.stallRule.deleteMany({ where: { upshotEvent: { contains: tag } } });
  await prisma.outboundRequest.deleteMany({ where: { customerId: { in: [web.id, app.id] } } });
  await prisma.customer.deleteMany({ where: { id: { in: [web.id, app.id] } } });
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();

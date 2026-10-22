// Seeds a test admin and a spread of message-delivery rows into the THROWAWAY database so the admin "Messages" page can be
// looked at: delivered, read, sent, failed with a reason, SMS, and a message stuck with no report.
//   admin: delivery-demo@example.test / admin123
import assert from 'node:assert/strict';
const ROOT = decodeURIComponent(new URL('../../src', import.meta.url).pathname);
assert.ok(/swiftloan_journey_test/.test(process.env.DATABASE_URL ?? ''), 'throwaway DB only');
const { prisma } = await import(`${ROOT}/lib/prisma.js`);
const { hash } = await import(`${ROOT}/lib/crypto.js`);
const { recordSend, applyStatusEvents } = await import(`${ROOT}/lib/messageDelivery.js`);
const { parseStatusPayload } = await import(`${ROOT}/lib/messageStatus.js`);

await prisma.adminUser.upsert({
  where: { email: 'delivery-demo@example.test' },
  update: { passwordHash: await hash('admin123'), active: true, mustChangePassword: false, totpEnabled: false, role: 'super_admin' },
  create: { email: 'delivery-demo@example.test', passwordHash: await hash('admin123'), name: 'Delivery Demo', role: 'super_admin', active: true, mustChangePassword: false },
});
await prisma.messageDelivery.deleteMany();
const cb = (id: string, status: string, extra: Record<string, unknown> = {}) =>
  parseStatusPayload({ entry: [{ changes: [{ value: { statuses: [{ id, status, timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: '919300000001', ...extra }] } }] }] });
const mk = async (id: string, phone: string, template: string, kind: string, minutesAgo: number) => {
  await recordSend({ channel: 'whatsapp', providerRef: id, gtrid: `${id}-g`, phone, template, kind, ok: true, referenceId: `demo-${id}` });
  await prisma.messageDelivery.update({ where: { providerRef: id }, data: { createdAt: new Date(Date.now() - minutesAgo * 60_000) } });
};
await mk('WCA-DEMO-1', '9300000001', 'marketing_check_rate', 'test', 3);           await applyStatusEvents(cb('WCA-DEMO-1', 'sent')); await applyStatusEvents(cb('WCA-DEMO-1', 'delivered')); await applyStatusEvents(cb('WCA-DEMO-1', 'read'));
await mk('WCA-DEMO-2', '9300000002', 'marketing_check_rate', 'test', 12);          await applyStatusEvents(cb('WCA-DEMO-2', 'sent')); await applyStatusEvents(cb('WCA-DEMO-2', 'delivered'));
await mk('WCA-DEMO-3', '9400000011', 'install_link', 'install_reminder', 40);      await applyStatusEvents(cb('WCA-DEMO-3', 'sent')); await applyStatusEvents(cb('WCA-DEMO-3', 'failed', { errors: [{ code: 131049, title: 'Message not delivered', error_data: { details: 'This message was not delivered to maintain healthy ecosystem engagement.' } }] }));
await mk('WCA-DEMO-4', '9300000001', 'marketing_check_rate', 'test', 95);           // accepted by the gateway, never reported on
await mk('WCA-DEMO-5', '9400000012', 'offers_ready', 'stall', 2);
await recordSend({ channel: 'whatsapp', providerRef: null, phone: '9400000013', template: 'install_link', kind: 'install_reminder', ok: false, error: 'Invalid parameters', referenceId: 'demo-rejected' });
await recordSend({ channel: 'sms', providerRef: 'SCA-DEMO-6', phone: '9300000001', template: '1277178738168111452', kind: 'test', ok: true, status: 'sent' });
console.log('seeded', await prisma.messageDelivery.count(), 'messages');
await prisma.$disconnect();

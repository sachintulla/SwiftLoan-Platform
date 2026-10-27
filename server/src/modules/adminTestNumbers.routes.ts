/**
 * Admin "Test numbers" API, mounted at /api/admin/test-numbers.
 *   GET    /            the listed numbers + whether the shared code is configured on this server
 *   POST   /            { phone, label? }   add a number (super_admin only)
 *   PATCH  /:id         { active?, label? } switch a number on/off or rename it (super_admin only)
 *   DELETE /:id         remove a number (super_admin only)
 * The shared code itself (env TEST_LOGIN_OTP) is never returned. Writes are recorded by auditAdmin.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ah, HttpError } from '../middleware/error.js';
import { ok } from '../lib/http.js';
import { validate } from '../middleware/validate.js';
import { requireAdmin, requireActiveAdmin, auditAdmin, requireRole, CAN_ADMINISTER } from '../middleware/adminAuth.js';
import { testLoginOtp } from '../lib/testLogin.js';

export const adminTestNumbersRouter = Router();
adminTestNumbersRouter.use(requireAdmin);
adminTestNumbersRouter.use(requireActiveAdmin);
adminTestNumbersRouter.use(auditAdmin);

const phoneSchema = z
  .string()
  .transform((p) => p.replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, ''))
  .pipe(
    z
      .string()
      .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number')
      .refine((p) => !/^(\d)\1{9}$/.test(p), 'Enter a valid 10-digit Indian mobile number'),
  );
const labelSchema = z.string().trim().max(80).optional();

adminTestNumbersRouter.get('/', ah(async (_req, res) => {
  const rows = await prisma.testLoginNumber.findMany({ orderBy: { createdAt: 'desc' } });
  const users = await prisma.user.findMany({ where: { phone: { in: rows.map((r) => r.phone) } }, select: { id: true, phone: true } });
  const logins = await prisma.refreshToken.groupBy({ by: ['userId'], where: { userId: { in: users.map((u) => u.id) } }, _max: { createdAt: true } });
  const lastByUser = new Map(logins.map((l) => [l.userId, l._max.createdAt]));
  const lastLogin = new Map(users.map((u) => [u.phone, lastByUser.get(u.id) ?? null]));
  return ok(res, {
    otpConfigured: testLoginOtp() !== null,
    numbers: rows.map((r) => ({ ...r, lastLoginAt: lastLogin.get(r.phone) ?? null })),
  }, 'Test numbers');
}));

adminTestNumbersRouter.post('/', requireRole(...CAN_ADMINISTER), validate(z.object({ phone: phoneSchema, label: labelSchema })), ah(async (req, res) => {
  const { phone, label } = req.body as { phone: string; label?: string };
  const existing = await prisma.testLoginNumber.findUnique({ where: { phone } });
  if (existing) throw new HttpError(409, 'That number is already on the list');
  const row = await prisma.testLoginNumber.create({ data: { phone, label: label || null, createdBy: req.admin?.email ?? null } });
  return ok(res, row, 'Added');
}));

adminTestNumbersRouter.patch('/:id', requireRole(...CAN_ADMINISTER), validate(z.object({ active: z.boolean().optional(), label: labelSchema })), ah(async (req, res) => {
  const { active, label } = req.body as { active?: boolean; label?: string };
  const id = String(req.params.id);
  const row = await prisma.testLoginNumber.findUnique({ where: { id } });
  if (!row) throw new HttpError(404, 'Number not found');
  const updated = await prisma.testLoginNumber.update({
    where: { id },
    data: { ...(active !== undefined ? { active } : {}), ...(label !== undefined ? { label: label || null } : {}) },
  });
  return ok(res, updated, 'Saved');
}));

adminTestNumbersRouter.delete('/:id', requireRole(...CAN_ADMINISTER), ah(async (req, res) => {
  const id = String(req.params.id);
  const row = await prisma.testLoginNumber.findUnique({ where: { id } });
  if (!row) throw new HttpError(404, 'Number not found');
  await prisma.testLoginNumber.delete({ where: { id } });
  return ok(res, { removed: row.phone }, 'Removed');
}));

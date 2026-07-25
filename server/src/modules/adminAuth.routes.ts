import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { ah, HttpError } from '../middleware/error.js';
import { ok, fail } from '../lib/http.js';
import { compare, hash, sha256, randomToken } from '../lib/crypto.js';
import { signAdminAccess } from '../lib/adminJwt.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import { env } from '../config/env.js';

export const adminAuthRouter = Router();

// POST /api/admin/auth/login  { email, password }
adminAuthRouter.post('/login', ah(async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  if (!email || !password) return fail(res, 400, 'email and password required');

  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin || !admin.active || !(await compare(password, admin.passwordHash))) {
    return fail(res, 401, 'Invalid credentials');
  }

  const accessToken = signAdminAccess({ sub: admin.id, email: admin.email, role: admin.role });
  const refresh = randomToken();
  await prisma.adminRefreshToken.create({
    data: {
      adminId: admin.id,
      tokenHash: sha256(refresh),
      expiresAt: new Date(Date.now() + env.refreshTtlDays * 864e5),
    },
  });
  await prisma.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });

  return ok(res, {
    accessToken,
    refreshToken: refresh,
    admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
  }, 'Logged in');
}));

// POST /api/admin/auth/refresh  { refreshToken }
adminAuthRouter.post('/refresh', ah(async (req, res) => {
  const token = String(req.body?.refreshToken ?? '');
  if (!token) return fail(res, 400, 'refreshToken required');
  const row = await prisma.adminRefreshToken.findUnique({ where: { tokenHash: sha256(token) }, include: { admin: true } });
  if (!row || row.revoked || row.expiresAt < new Date()) return fail(res, 401, 'Invalid refresh token');

  const accessToken = signAdminAccess({ sub: row.admin.id, email: row.admin.email, role: row.admin.role });
  return ok(res, { accessToken }, 'Refreshed');
}));

// POST /api/admin/auth/logout  { refreshToken }
adminAuthRouter.post('/logout', requireAdmin, ah(async (req, res) => {
  const token = String(req.body?.refreshToken ?? '');
  if (token) {
    await prisma.adminRefreshToken.updateMany({ where: { tokenHash: sha256(token) }, data: { revoked: true } });
  }
  return ok(res, null, 'Logged out');
}));

// GET /api/admin/auth/me
adminAuthRouter.get('/me', requireAdmin, ah(async (req, res) => {
  const admin = await prisma.adminUser.findUnique({ where: { id: req.admin!.sub } });
  if (!admin) throw new HttpError(404, 'Admin not found');
  return ok(res, { id: admin.id, name: admin.name, email: admin.email, role: admin.role, lastLoginAt: admin.lastLoginAt }, 'OK');
}));

// Convenience helper for seeds/tests to create an admin.
export async function ensureAdmin(email: string, password: string, name: string, role: 'super_admin' | 'admin' | 'analyst' = 'admin') {
  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) return existing;
  return prisma.adminUser.create({ data: { email, passwordHash: await hash(password), name, role } });
}

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { ah, HttpError } from '../middleware/error.js';
import { ok, fail } from '../lib/http.js';
import { compare, hash, sha256, randomToken } from '../lib/crypto.js';
import { signAdminAccess } from '../lib/adminJwt.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import {
  verifyTotp, consumeRecoveryCode, generateTotpSecret, totpUri,
  generateRecoveryCodes, validatePasswordStrength, generateResetToken, sha256 as sha256hex,
} from '../lib/adminSecurity.js';
import { env } from '../config/env.js';

export const adminAuthRouter = Router();

// POST /api/admin/auth/login  { email, password }
adminAuthRouter.post('/login', ah(async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  if (!email || !password) return fail(res, 400, 'email and password required');

  const admin = await prisma.adminUser.findUnique({ where: { email } });

  // Lockout is checked before the password, so a locked account cannot be
  // probed for a valid password.
  if (admin?.lockedUntil && admin.lockedUntil > new Date()) {
    const mins = Math.ceil((admin.lockedUntil.getTime() - Date.now()) / 60_000);
    return fail(res, 423, `Account locked. Try again in ${mins} minute(s).`);
  }

  if (!admin || !admin.active || !(await compare(password, admin.passwordHash))) {
    // Count failures against the account and lock after 5. The IP rate-limit
    // alone does not stop credential stuffing spread across many addresses.
    if (admin) {
      const count = admin.failedLoginCount + 1;
      await prisma.adminUser
        .update({
          where: { id: admin.id },
          data: {
            failedLoginCount: count,
            lockedUntil: count >= 5 ? new Date(Date.now() + 15 * 60_000) : null,
          },
        })
        .catch(() => undefined);
    }
    return fail(res, 401, 'Invalid credentials');
  }

  // 2FA: a correct password alone is not a session once TOTP is enabled.
  if (admin.totpEnabled) {
    const code = String(req.body?.totp ?? '').trim();
    const recovery = String(req.body?.recoveryCode ?? '').trim();

    if (!code && !recovery) {
      // Deliberately a 200, not an error: the client needs to distinguish
      // "password was right, now show the code field" from "login failed".
      return ok(res, { totpRequired: true }, 'Enter your authenticator code');
    }

    let passed = false;
    if (code && admin.totpSecret) passed = verifyTotp(admin.totpSecret, code);
    if (!passed && recovery) {
      const remaining = consumeRecoveryCode(admin.totpRecoveryCodes, recovery);
      if (remaining) {
        await prisma.adminUser.update({
          where: { id: admin.id },
          data: { totpRecoveryCodes: remaining },
        });
        passed = true;
      }
    }
    if (!passed) return fail(res, 401, 'Invalid authenticator code');
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
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date(), lastActivityAt: new Date(), failedLoginCount: 0, lockedUntil: null },
  });

  return ok(res, {
    accessToken,
    refreshToken: refresh,
    admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
    // The dashboard blocks navigation until this is cleared.
    mustChangePassword: admin.mustChangePassword,
    totpEnabled: admin.totpEnabled,
  }, 'Logged in');
}));

/* ───────────────────── password change + reset ───────────────────── */

// POST /api/admin/auth/change-password  { currentPassword, newPassword }
// Reachable while `mustChangePassword` is set — see ALLOWED_WHILE_PASSWORD_PENDING.
adminAuthRouter.post('/change-password', requireAdmin, ah(async (req, res) => {
  const current = String(req.body?.currentPassword ?? '');
  const next = String(req.body?.newPassword ?? '');

  const admin = await prisma.adminUser.findUnique({ where: { id: req.admin!.sub } });
  if (!admin) return fail(res, 404, 'Admin not found');
  if (!(await compare(current, admin.passwordHash))) return fail(res, 401, 'Current password is incorrect');

  const weak = validatePasswordStrength(next);
  if (weak) return fail(res, 400, weak);
  if (await compare(next, admin.passwordHash)) return fail(res, 400, 'New password must differ from the current one');

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: {
      passwordHash: await hash(next),
      mustChangePassword: false,
      passwordChangedAt: new Date(),
    },
  });
  // Every other session is invalidated: a password change should log out the
  // device that prompted it.
  await prisma.adminRefreshToken.updateMany({ where: { adminId: admin.id }, data: { revoked: true } });

  return ok(res, { changed: true }, 'Password updated — please sign in again');
}));

// POST /api/admin/auth/forgot-password  { email }
adminAuthRouter.post('/forgot-password', ah(async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const admin = email ? await prisma.adminUser.findUnique({ where: { email } }) : null;

  if (admin?.active) {
    const { token, hash: tokenHash } = generateResetToken();
    await prisma.adminPasswordReset.create({
      data: { adminId: admin.id, tokenHash, expiresAt: new Date(Date.now() + 60 * 60_000) },
    });

    // No email provider is configured yet. Rather than pretend it was sent,
    // log it in development so the flow is testable, and return the token only
    // outside production.
    if (!env.isProd) {
      console.log(`[admin-reset] ${admin.email} → /login/reset?token=${token}`);
      return ok(res, { sent: true, devToken: token }, 'Reset link generated (dev: token returned)');
    }
    // TODO: send `token` by email once a provider is configured.
    console.warn('[admin-reset] no email provider configured — token generated but not delivered');
  }

  // Always the same response, whether or not the account exists — otherwise
  // this endpoint becomes a way to enumerate admin emails.
  return ok(res, { sent: true }, 'If that account exists, a reset link has been sent');
}));

// POST /api/admin/auth/reset-password  { token, newPassword }
adminAuthRouter.post('/reset-password', ah(async (req, res) => {
  const token = String(req.body?.token ?? '');
  const next = String(req.body?.newPassword ?? '');
  if (!token) return fail(res, 400, 'token required');

  const weak = validatePasswordStrength(next);
  if (weak) return fail(res, 400, weak);

  const row = await prisma.adminPasswordReset.findUnique({ where: { tokenHash: sha256hex(token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    return fail(res, 400, 'This reset link is invalid or has expired');
  }

  await prisma.$transaction([
    prisma.adminUser.update({
      where: { id: row.adminId },
      data: {
        passwordHash: await hash(next),
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    }),
    // Single-use.
    prisma.adminPasswordReset.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    prisma.adminRefreshToken.updateMany({ where: { adminId: row.adminId }, data: { revoked: true } }),
  ]);

  return ok(res, { reset: true }, 'Password reset — please sign in');
}));

/* ─────────────────────────── 2FA (TOTP) ─────────────────────────── */

// POST /api/admin/auth/2fa/setup — returns the secret + QR URI. Not yet active.
adminAuthRouter.post('/2fa/setup', requireAdmin, ah(async (req, res) => {
  const admin = await prisma.adminUser.findUnique({ where: { id: req.admin!.sub } });
  if (!admin) return fail(res, 404, 'Admin not found');
  if (admin.totpEnabled) return fail(res, 409, '2FA is already enabled');

  const secret = generateTotpSecret();
  // Stored but not enabled — a secret is only trusted once the operator has
  // proved they can generate a code from it.
  await prisma.adminUser.update({ where: { id: admin.id }, data: { totpSecret: secret } });

  return ok(res, { secret, otpauthUri: totpUri(secret, admin.email) }, 'Scan this, then confirm with a code');
}));

// POST /api/admin/auth/2fa/enable  { totp }
adminAuthRouter.post('/2fa/enable', requireAdmin, ah(async (req, res) => {
  const admin = await prisma.adminUser.findUnique({ where: { id: req.admin!.sub } });
  if (!admin?.totpSecret) return fail(res, 400, 'Start setup first');
  if (!verifyTotp(admin.totpSecret, String(req.body?.totp ?? ''))) {
    return fail(res, 401, 'That code is not valid — check your authenticator app');
  }

  // Recovery codes are shown exactly once; only hashes are kept.
  const { plain, hashed } = generateRecoveryCodes(10);
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { totpEnabled: true, totpRecoveryCodes: hashed },
  });

  return ok(res, { enabled: true, recoveryCodes: plain },
    'Two-factor enabled. Save these recovery codes — they are shown only once.');
}));

// POST /api/admin/auth/2fa/disable  { password }
adminAuthRouter.post('/2fa/disable', requireAdmin, ah(async (req, res) => {
  const admin = await prisma.adminUser.findUnique({ where: { id: req.admin!.sub } });
  if (!admin) return fail(res, 404, 'Admin not found');
  // Re-authenticate: disabling 2FA from an already-open session would
  // otherwise need only a stolen laptop.
  if (!(await compare(String(req.body?.password ?? ''), admin.passwordHash))) {
    return fail(res, 401, 'Password is incorrect');
  }

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { totpEnabled: false, totpSecret: null, totpRecoveryCodes: [] },
  });
  return ok(res, { enabled: false }, 'Two-factor disabled');
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

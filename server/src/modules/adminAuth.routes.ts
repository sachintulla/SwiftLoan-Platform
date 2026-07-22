import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { compare } from '../lib/crypto.js';
import { validate } from '../middleware/validate.js';
import { HttpError, ah } from '../middleware/error.js';
import { signAdminToken, verifyAdminToken } from '../lib/jwt.js';

export const adminAuthRouter = Router();

// Simple in-memory token blocklist for logout
const tokenBlocklist = new Set<string>();

// POST /api/admin/auth/login
adminAuthRouter.post(
  '/login',
  validate(
    z.object({
      email: z.string().email(),
      password: z.string().min(6),
    })
  ),
  ah(async (req, res) => {
    const { email, password } = req.body;

    const admin = await prisma.adminUser.findUnique({
      where: { email },
    });

    if (!admin || !(await compare(password, admin.password))) {
      throw new HttpError(401, 'Invalid credentials');
    }

    if (!admin.isActive) {
      throw new HttpError(403, 'Admin account is inactive');
    }

    const token = signAdminToken({
      sub: admin.id,
      email: admin.email,
      role: admin.role,
    });

    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    res.json({
      success: true,
      data: {
        token,
        admin: {
          id: admin.id,
          email: admin.email,
          fullName: admin.fullName,
          role: admin.role,
        },
      },
    });
  })
);

// POST /api/admin/auth/logout
adminAuthRouter.post(
  '/logout',
  ah(async (req, res) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (token) {
      tokenBlocklist.add(token);
    }
    res.json({ success: true, message: 'Logged out' });
  })
);

// GET /api/admin/auth/me
adminAuthRouter.get(
  '/me',
  ah(async (req, res) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) throw new HttpError(401, 'Missing bearer token');
    if (tokenBlocklist.has(token)) throw new HttpError(401, 'Token has been revoked');

    try {
      const payload = verifyAdminToken(token);
      const admin = await prisma.adminUser.findUnique({
        where: { id: payload.sub },
      });

      if (!admin) throw new HttpError(401, 'Admin not found');

      res.json({
        success: true,
        data: {
          id: admin.id,
          email: admin.email,
          fullName: admin.fullName,
          role: admin.role,
          isActive: admin.isActive,
        },
      });
    } catch (err) {
      throw new HttpError(401, 'Invalid or expired token');
    }
  })
);

import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

// Admin tokens are separate from the mobile-app user tokens (different audience).
export interface AdminAccessPayload {
  sub: string; // adminId
  email: string;
  role: string;
}

const ADMIN_ACCESS_SECRET = process.env.ADMIN_JWT_SECRET ?? env.jwtAccessSecret + '-admin';

export const signAdminAccess = (p: AdminAccessPayload) =>
  jwt.sign(p, ADMIN_ACCESS_SECRET, { expiresIn: env.accessTtl });

export const verifyAdminAccess = (token: string): AdminAccessPayload =>
  jwt.verify(token, ADMIN_ACCESS_SECRET) as AdminAccessPayload;

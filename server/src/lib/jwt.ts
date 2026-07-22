import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface AccessPayload { sub: string; phone: string; }
export interface AdminPayload { sub: string; email: string; role: string; }

export const signAccess = (p: AccessPayload) =>
  jwt.sign(p, env.jwtAccessSecret, { expiresIn: env.accessTtl });

export const verifyAccess = (token: string): AccessPayload =>
  jwt.verify(token, env.jwtAccessSecret) as AccessPayload;

export const signAdminToken = (p: AdminPayload) =>
  jwt.sign(p, env.jwtAccessSecret, { expiresIn: env.accessTtl });

export const verifyAdminToken = (token: string): AdminPayload =>
  jwt.verify(token, env.jwtAccessSecret) as AdminPayload;

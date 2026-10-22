import { timing } from './timings.js';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface AccessPayload { sub: string; phone: string; }

/** App access-token lifetime in seconds: Admin → Timings (auth.accessTokenMinutes), falling back to ACCESS_TTL. */
export const accessTtlSeconds = () => timing.num('auth.accessTokenMinutes') * 60;

export const signAccess = (p: AccessPayload) =>
  jwt.sign(p, env.jwtAccessSecret, { expiresIn: accessTtlSeconds() });

export const verifyAccess = (token: string): AccessPayload =>
  jwt.verify(token, env.jwtAccessSecret) as AccessPayload;

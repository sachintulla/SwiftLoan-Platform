/**
 * Admin-managed API keys for third parties calling INTO our API — today,
 * specifically the Ello agent's `get_customer_history` / `save_conversation`
 * tools (see conversations.routes.ts's authorised(), which accepts either one
 * of these keys or the legacy ELLO_WEBHOOK_SECRET / CONVERSATION_API_KEY env
 * var, so existing deployments keep working while this rolls out).
 */
import { Router } from 'express';
import { z } from 'zod';
import { ah, HttpError } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { ok } from '../lib/http.js';
import { requireAdmin, requireActiveAdmin, auditAdmin, requireRole, CAN_ADMINISTER } from '../middleware/adminAuth.js';
import { prisma } from '../lib/prisma.js';
import { generateApiKey } from '../lib/apiKeys.js';

export const apiKeysRouter = Router();
apiKeysRouter.use(requireAdmin);
apiKeysRouter.use(requireActiveAdmin);
apiKeysRouter.use(auditAdmin);

/** Never the hash, never the plaintext — just enough to tell keys apart. */
function publicView(row: {
  id: string; name: string; keyPrefix: string; createdAt: Date;
  lastUsedAt: Date | null; revokedAt: Date | null;
}) {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    revoked: !!row.revokedAt,
    revokedAt: row.revokedAt,
  };
}

// GET /api/admin/api-keys
apiKeysRouter.get('/', ah(async (_req, res) => {
  const rows = await prisma.apiKey.findMany({ orderBy: { createdAt: 'desc' } });
  return ok(res, { keys: rows.map(publicView) }, 'API keys');
}));

const createSchema = z.object({ name: z.string().trim().min(1).max(80) });

// POST /api/admin/api-keys  { name }
// Only role CAN_ADMINISTER may mint a credential that can read customer
// conversation history — same gate as rewriting an integration's own secret.
apiKeysRouter.post('/', requireRole(...CAN_ADMINISTER), validate(createSchema), ah(async (req, res) => {
  const { name } = req.body as z.infer<typeof createSchema>;
  const admin = (req as unknown as { admin?: { id?: string; email?: string } }).admin;
  const generated = generateApiKey();

  const row = await prisma.apiKey.create({
    data: {
      name,
      keyPrefix: generated.keyPrefix,
      keyHash: generated.keyHash,
      createdBy: admin?.email ?? admin?.id ?? null,
    },
  });

  // The ONLY response that ever includes the plaintext. It is not retrievable
  // again after this — the admin must copy it now or generate a new one.
  return ok(res, { ...publicView(row), key: generated.plain }, 'API key created — shown once, copy it now');
}));

// POST /api/admin/api-keys/:id/revoke
apiKeysRouter.post('/:id/revoke', requireRole(...CAN_ADMINISTER), ah(async (req, res) => {
  const existing = await prisma.apiKey.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new HttpError(404, 'API key not found');
  if (existing.revokedAt) return ok(res, publicView(existing), 'Already revoked');

  const row = await prisma.apiKey.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });
  return ok(res, publicView(row), 'API key revoked');
}));

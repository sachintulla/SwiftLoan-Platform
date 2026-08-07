import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'node:crypto';

const REGION = process.env.AWS_REGION;
const BUCKET = process.env.S3_BUCKET_NAME;

// Explicit AWS_ACCESS_KEY_ID/SECRET are only needed for local dev (no EC2
// instance metadata to inherit a role from). On the deployed box, the SDK's
// default credential chain picks up the EC2 instance role automatically —
// region + bucket name being set is enough to know S3 is usable.
export function s3Configured(): boolean {
  return !!(REGION && BUCKET);
}

let client: S3Client | null = null;
function s3(): S3Client {
  if (!client) client = new S3Client({ region: REGION });
  return client;
}

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Presign a PUT URL for a user's avatar upload. The object key embeds the
 * userId (so old avatars for the same user are just overwritten, no orphaned
 * objects piling up) plus a random suffix (so a stale cached copy of the old
 * avatar can't be served under the same URL — the client always gets a
 * fresh, uncached URL after a re-upload).
 */
export async function presignAvatarUpload(userId: string, contentType: string) {
  if (!s3Configured()) throw new Error('S3 is not configured');
  const ext = ALLOWED_TYPES[contentType];
  if (!ext) throw new Error(`Unsupported content type: ${contentType}`);

  const key = `avatars/${userId}/${crypto.randomBytes(8).toString('hex')}.${ext}`;
  // ACL is part of the signed request, so the client's actual PUT must send the
  // matching `x-amz-acl: public-read` header or S3 rejects it as a signature
  // mismatch — no bucket policy needed, the object is public the moment it's
  // written (requires the bucket's Object Ownership to allow ACLs).
  const command = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType, ACL: 'public-read' });
  const uploadUrl = await getSignedUrl(s3(), command, { expiresIn: 300 });
  const publicUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
  return { uploadUrl, publicUrl };
}

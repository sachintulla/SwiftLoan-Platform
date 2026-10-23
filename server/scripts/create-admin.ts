/**
 * Create (or update) a real admin dashboard login.
 *
 *   npm run admin:create -- --email you@company.com --password 'x' --name "Your Name" --role super_admin
 *
 * Separate from prisma/seed.ws4.ts, which seeds demo admins with a
 * known/shared password for local dev — never run that seed against a real
 * environment. This script is the one meant for prod: it hashes the password
 * with the same bcrypt work factor real login uses (see src/lib/crypto.ts)
 * and forces a password change on first login, so nobody is left holding a
 * password that a person other than the account owner ever saw in plaintext
 * (this terminal's scrollback / shell history) for longer than it takes to
 * log in once.
 */
import { prisma } from '../src/lib/prisma.js';
import { hash } from '../src/lib/crypto.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg('email')?.trim().toLowerCase();
  const password = arg('password');
  const name = arg('name');
  const role = (arg('role') ?? 'admin') as 'super_admin' | 'admin' | 'analyst';

  if (!email || !password || !name) {
    console.error('Usage: npm run admin:create -- --email you@company.com --password \'x\' --name "Your Name" [--role super_admin|admin|analyst]');
    process.exit(1);
  }
  if (!['super_admin', 'admin', 'analyst'].includes(role)) {
    console.error(`Invalid role "${role}" — must be super_admin, admin or analyst.`);
    process.exit(1);
  }
  if (password.length < 12) {
    console.error('Password must be at least 12 characters.');
    process.exit(1);
  }

  const passwordHash = await hash(password);
  const admin = await prisma.adminUser.upsert({
    where: { email },
    create: { email, passwordHash, name, role, mustChangePassword: true },
    update: { passwordHash, name, role, mustChangePassword: true },
  });

  console.log(`Admin ready: ${admin.email} (${admin.role}). Must change password on first login.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

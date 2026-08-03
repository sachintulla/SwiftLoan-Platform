/**
 * Seed the IntegrationConfig rows for Ello and Upshot from environment
 * variables, so a fresh local database is usable in one command instead of
 * re-typing keys into the dashboard.
 *
 * The admin dashboard at /integrations remains the real place to manage these;
 * this only bootstraps. Re-running is safe — it merges rather than replaces,
 * and never clears a secret that is blank in the environment.
 */
import { PrismaClient } from '@prisma/client';
import { DEFAULT_SETTINGS } from '../src/lib/integrations.js';

const prisma = new PrismaClient();

/** Merge a patch into the stored config without wiping what is already there. */
async function seed(
  provider: 'ello' | 'upshot',
  settings: Record<string, unknown>,
  secrets: Record<string, string | undefined>,
) {
  const existing = await prisma.integrationConfig.findUnique({ where: { provider } });

  const mergedSettings = {
    ...DEFAULT_SETTINGS[provider],
    ...((existing?.settings as Record<string, unknown>) ?? {}),
    // Only override with env values that are actually set.
    ...Object.fromEntries(Object.entries(settings).filter(([, v]) => v !== '' && v != null)),
  };

  const mergedSecrets = { ...((existing?.secrets as Record<string, unknown>) ?? {}) };
  for (const [k, v] of Object.entries(secrets)) {
    if (v) mergedSecrets[k] = v;
  }

  // Only enable once the provider has everything it needs to actually send.
  const ready =
    provider === 'ello'
      ? Boolean(mergedSecrets.apiKey && mergedSettings.baseUrl && mergedSettings.assistantId)
      : Boolean(
          mergedSecrets.apiKey &&
            mergedSecrets.appId &&
            mergedSecrets.accountId &&
            mergedSettings.baseUrl,
        );

  await prisma.integrationConfig.upsert({
    where: { provider },
    create: { provider, enabled: ready, settings: mergedSettings as any, secrets: mergedSecrets as any, updatedBy: 'seed' },
    update: { enabled: ready, settings: mergedSettings as any, secrets: mergedSecrets as any, updatedBy: 'seed' },
  });

  const missing: string[] = [];
  if (provider === 'ello') {
    if (!mergedSecrets.apiKey) missing.push('ELLO_API_KEY');
    if (!mergedSettings.assistantId) missing.push('ELLO_AGENT_ID');
  } else {
    if (!mergedSettings.baseUrl) missing.push('UPSHOT_BASE_URL (India region host)');
    if (!mergedSecrets.appId) missing.push('UPSHOT_APP_ID');
    if (!mergedSecrets.accountId) missing.push('UPSHOT_ACCOUNT_ID');
    if (!mergedSecrets.apiKey) missing.push('UPSHOT_API_KEY');
  }

  console.log(
    `  ${provider.padEnd(7)} ${ready ? 'enabled' : 'DISABLED'}` +
      (missing.length ? ` — still needs: ${missing.join(', ')}` : ''),
  );
}

async function main() {
  console.log('Seeding integration config from environment…');

  await seed(
    'ello',
    {
      baseUrl: process.env.ELLO_BASE_URL,
      assistantId: process.env.ELLO_AGENT_ID,
      webhookUrl: process.env.ELLO_WEBHOOK_URL,
    },
    { apiKey: process.env.ELLO_API_KEY },
  );

  await seed(
    'upshot',
    { baseUrl: process.env.UPSHOT_BASE_URL },
    {
      appId: process.env.UPSHOT_APP_ID,
      accountId: process.env.UPSHOT_ACCOUNT_ID,
      apiKey: process.env.UPSHOT_API_KEY,
    },
  );

  console.log('Done. Manage these at http://localhost:4001/integrations');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

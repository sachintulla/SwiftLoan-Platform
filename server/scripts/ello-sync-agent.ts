/**
 * Push a prompt + dynamic_variables to an Ello agent.
 *
 *   npm run ello:sync -- --role leadCallback
 *   npm run ello:sync -- --role leadCallback --agent 6a6c630e2f3448069caa1fe5
 *   npm run ello:sync -- --role leadCallback --dry
 *
 * Why a script rather than a migration: the agent lives in Ello's account, not
 * our database, so it cannot be provisioned by deploy. This makes the step one
 * reproducible command instead of hand-editing a web form, and keeps the prompt
 * we actually shipped in version control next to the code that feeds it.
 *
 * Verified against the live API (2026-08-03):
 *   PUT /api/agents/{id}   x-api-key header   (POST and PATCH both 404)
 *   dynamic_variables MUST be an array of plain strings — objects are rejected
 *   with `"dynamic_variables[0]" must be a string`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getProviderConfig } from '../src/lib/integrations.js';
import { agentIdFor, AGENT_ROLES, type AgentRole } from '../src/lib/agents.js';
import { LEAD_CALL_VARIABLES } from '../src/lib/callContext.js';
import { prisma } from '../src/lib/prisma.js';

const here = dirname(fileURLToPath(import.meta.url));
const PROMPTS = join(here, '../../prompts');

/**
 * Which prompt file and variable set belongs to each role.
 *
 * leadCallback and campaign deliberately share one file: they run on the same
 * Ello agent (one agent = one prompt), so the prompt branches internally on
 * `{{agent_purpose}}`. Registering different prompts per role would just mean
 * whichever synced last wins.
 *
 * The in-app/in-browser companions take no variables — they receive their context
 * live over the session (`registerPageContext`), not baked into the prompt.
 */
const ROLE_CONFIG: Partial<Record<AgentRole, { file: string; variables: readonly string[] }>> = {
  leadCallback: { file: 'website-agent-prompt.md', variables: LEAD_CALL_VARIABLES },
  campaign: { file: 'website-agent-prompt.md', variables: LEAD_CALL_VARIABLES },
  companion: { file: 'ello-companion-prompt.md', variables: [] },
  websiteCompanion: { file: 'ello-website-next-navigator-prompt.md', variables: [] },
  adminNavigator: { file: 'ello-admin-navigator-prompt.md', variables: [] },
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const DRY = process.argv.includes('--dry');

/**
 * Extract the prompt body from the markdown.
 *
 * The file is written for humans — headings, rationale, a variables appendix.
 * Only the part between `## PROMPT` and the next `---` at column 0 is the actual
 * system prompt, so the surrounding notes never reach the agent.
 */
/** Explicit terminator. Everything between `## PROMPT` and this is the prompt. */
const END_MARKER = '<!-- END PROMPT -->';

export function extractPrompt(md: string): string {
  const start = md.indexOf('## PROMPT');
  if (start < 0) {
    // Older prompt files (companion, website, admin navigator) are prompts in
    // their entirety, with no wrapper notes — send them whole rather than
    // refusing to sync them.
    const whole = md.trim();
    if (whole.length < 50) throw new Error('prompt file looks empty');
    return whole;
  }
  const after = md.slice(start + '## PROMPT'.length);

  // Prefer the explicit marker.
  //
  // This used to stop at the first `^---$`, which silently truncated any prompt
  // that used a horizontal rule as a section separator — a rewrite went live as
  // 392 characters (the opening paragraph only) and the agent lost every rule and
  // branch. A markdown separator is far too common to double as a terminator.
  const marked = after.indexOf(END_MARKER);
  if (marked >= 0) {
    const body = after.slice(0, marked).trim();
    if (body.length < 50) throw new Error('extracted prompt looks empty — check the file');
    return body;
  }

  // No marker: fall back to the whole remainder rather than the first rule.
  const body = after.trim();
  if (body.length < 50) throw new Error('extracted prompt looks empty — check the file');
  return body;
}

async function main() {
  const role = (arg('role') ?? 'leadCallback') as AgentRole;
  if (!AGENT_ROLES.includes(role)) {
    throw new Error(`unknown role "${role}". One of: ${AGENT_ROLES.join(', ')}`);
  }
  const conf = ROLE_CONFIG[role];
  if (!conf) throw new Error(`role "${role}" has no prompt file mapped yet`);

  const agentId = arg('agent') ?? (await agentIdFor(role));
  if (!agentId) {
    throw new Error(
      `No agent id for role "${role}". Set it in the dashboard (Integrations → Ello → agents.${role}), ` +
        `or pass --agent <id>, or set the env var.`,
    );
  }

  const md = readFileSync(join(PROMPTS, conf.file), 'utf8');
  const prompt = extractPrompt(md);

  const cfg = await getProviderConfig('ello');
  const base = String(cfg.settings.baseUrl || '').replace(/\/+$/, '');
  const apiKey = String((cfg.secrets as any).apiKey ?? (cfg.secrets as any).api_key ?? '');
  if (!apiKey) throw new Error('Ello apiKey is not configured');

  console.log(`role      : ${role}`);
  console.log(`agent     : ${agentId}`);
  console.log(`prompt    : ${conf.file} (${prompt.length} chars)`);
  console.log(`variables : ${conf.variables.length} → ${conf.variables.join(', ')}`);

  if (DRY) {
    console.log('\n--dry: nothing sent. Prompt preview:\n');
    console.log(prompt.slice(0, 700) + (prompt.length > 700 ? '\n…' : ''));
    return;
  }

  const H = { 'x-api-key': apiKey, 'content-type': 'application/json' };

  // Back up the current agent document first. A prompt is the agent's entire
  // behaviour, and there is no version history on Ello's side.
  const before = await fetch(`${base}/api/agents/${agentId}`, { headers: H });
  const beforeBody = await before.json().catch(() => null);
  if (!before.ok) throw new Error(`could not read agent (HTTP ${before.status})`);
  const backup = join(here, `../.ello-agent-backup.${role}.json`);
  writeFileSync(backup, JSON.stringify(beforeBody, null, 2));
  console.log(`backup    : ${backup}`);

  const type = (beforeBody as any)?.data?.type ?? 'hybrid';
  const res = await fetch(`${base}/api/agents/${agentId}`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({ type, prompt, dynamic_variables: [...conf.variables] }),
  });
  const body: any = await res.json().catch(() => null);

  if (!res.ok) {
    console.error(`\nFAILED HTTP ${res.status}: ${body?.message ?? ''}`);
    if (body?.errors) console.error(JSON.stringify(body.errors, null, 2));
    process.exitCode = 1;
    return;
  }

  // Verify by reading back what the provider stored, rather than trusting 200.
  const stored = body?.data ?? {};
  const okPrompt = String(stored.prompt ?? '').trim() === prompt;
  const okVars =
    JSON.stringify([...(stored.dynamic_variables ?? [])].sort()) ===
    JSON.stringify([...conf.variables].sort());

  console.log(`\nHTTP ${res.status} — ${body?.message ?? 'updated'}`);
  console.log(`prompt stored correctly    : ${okPrompt ? 'yes' : 'NO'}`);
  console.log(`variables stored correctly : ${okVars ? 'yes' : 'NO'}`);
  if (!okPrompt || !okVars) {
    console.error('\nProvider accepted the call but stored something different — inspect the agent.');
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error('\n' + (e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

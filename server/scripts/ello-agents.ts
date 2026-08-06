/**
 * Show which Ello agent each role resolves to, and what exists on the workspace.
 *
 *   npm run ello:agents
 *
 * The first thing to run when a call goes to the wrong agent or a prompt seems
 * stale: it prints the resolution source per role (dashboard / env / workspace
 * default) so you can see *why* an id was chosen, not just which one.
 */
import { agentRoleStatus, AGENT_ROLE_INFO } from '../src/lib/agents.js';
import { listElloAgents } from '../src/lib/integrations.js';
import { prisma } from '../src/lib/prisma.js';

async function main() {
  const roles = await agentRoleStatus();

  console.log('\n=== Role → agent ===');
  for (const r of roles) {
    const info = AGENT_ROLE_INFO[r.role];
    const flag = r.dedicated ? 'dedicated' : r.agentId ? 'SHARED default' : 'UNCONFIGURED';
    console.log(`\n  ${r.role}  (${info.direction})`);
    console.log(`    ${info.purpose}`);
    console.log(`    agent  : ${r.agentId ?? '—'}`);
    console.log(`    via    : ${r.source}   [${flag}]`);
  }

  const shared = roles.filter((r) => !r.dedicated && r.agentId).length;
  const missing = roles.filter((r) => !r.agentId).length;
  console.log(
    `\n${roles.length} roles — ${roles.length - shared - missing} dedicated, ` +
      `${shared} on the shared default, ${missing} unconfigured.`,
  );

  const live = await listElloAgents({ limit: 100 });
  console.log(`\n=== Agents on the Ello workspace ===`);
  if (!live.ok) {
    console.log(`  could not list: ${live.error ?? `HTTP ${live.status}`}`);
  } else if (!live.agents.length) {
    console.log('  none');
  } else {
    for (const a of live.agents) {
      console.log(`  ${String(a.id).padEnd(26)} ${String(a.name).padEnd(30)} ${a.status ? 'active' : 'inactive'} ${a.phoneNumber ?? ''}`);
    }
  }
  console.log();
}

main()
  .catch((e) => {
    console.error((e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

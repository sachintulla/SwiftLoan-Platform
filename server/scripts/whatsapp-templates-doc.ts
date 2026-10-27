/**
 * Regenerates docs/WHATSAPP_TEMPLATES.md from lib/whatsappTemplates.ts, so the document
 * the team submits from can never drift from the code.
 *
 *   cd server && npx tsx scripts/whatsapp-templates-doc.ts
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { WHATSAPP_TEMPLATES, LEGACY_TEMPLATES, previewBody, toMetaPayload } from '../src/lib/whatsappTemplates.js';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../../docs/WHATSAPP_TEMPLATES.md');

const lines: string[] = [];
const push = (s = '') => lines.push(s);

push('# WhatsApp templates (Utility)');
push();
push('> Generated from `server/src/lib/whatsappTemplates.ts` by `server/scripts/whatsapp-templates-doc.ts`. Do not edit by hand.');
push();
push('Every WhatsApp message SwiftLoan sends, written for Meta\'s **Utility** category: a factual message about a request or application the customer is already part of, with no promotion. Submit each one in English through the CPaaS (Vox Digitals) portal, or with Meta\'s message-templates API using the JSON under each template.');
push();
push('**Meta makes the final decision on category.** A reminder to finish an abandoned application can be re-categorised as marketing whatever it is submitted as. After approval, check the category Meta assigned. A template Meta treats as marketing is billed differently and is not covered by the utility rules.');
push();
push('## Where WhatsApp is used');
push();
push('| Sender | When it sends | Template |');
push('|---|---|---|');
for (const t of WHATSAPP_TEMPLATES) push(`| ${t.usedBy} | ${t.purpose} | \`${t.name}\` |`);
push();
push('Messages typed by an admin (Customers page) use whichever template the admin picks.');
push();
push('## Submission checklist');
push();
push('1. Create each template below in CPaaS (WhatsApp, Templates, Create Template): category **Utility**, language **English (en)**.');
push('2. Paste the body exactly, add the footer, and enter the sample values in order. Meta requires a sample for every variable.');
push('3. Wait for approval, then open the template in the portal and confirm the category is still Utility.');
push('4. In **Admin, Configs, Stage outreach**, enter the approved name:');
push('   - stage messages: open the stage and press "Use the utility template";');
push('   - the three cards at the top (conversation recap, no offers, technical issue): press "Use catalogue template" and switch the card on;');
push('   - install reminders and the lender-applied message: save `installWhatsapp` and `appliedWhatsapp` in Configs, WhatsApp (Vox) with the name and values listed below.');
push('5. Switch the message on. Nothing is sent until you do.');
push();

for (const t of WHATSAPP_TEMPLATES) {
  push(`## \`${t.name}\``);
  push();
  push(`- **Category:** ${t.category}`);
  push(`- **Language:** ${t.language}`);
  push(`- **Purpose:** ${t.purpose}`);
  push(`- **Sent by:** ${t.usedBy}`);
  if (t.replaces) push(`- **Replaces:** \`${t.replaces}\``);
  push();
  push('**Body**');
  push();
  push('```');
  push(t.body);
  push('```');
  push();
  push(`**Footer:** ${t.footer}`);
  push();
  push('| Variable | Holds | Sample value | Filled by the code with |');
  push('|---|---|---|---|');
  t.variables.forEach((v, i) => push(`| \`{{${i + 1}}}\` | ${v} | ${t.examples[i]} | \`${t.placeholders[i]}\` |`));
  push();
  push('**Preview with the sample values**');
  push();
  push(`> ${previewBody(t)}`);
  push();
  push('<details><summary>Meta API JSON</summary>');
  push();
  push('```json');
  push(JSON.stringify(toMetaPayload(t), null, 2));
  push('```');
  push();
  push('</details>');
  push();
}

push('## Older templates to retire');
push();
push('| Template | Why | Use instead |');
push('|---|---|---|');
for (const l of LEGACY_TEMPLATES) push(`| \`${l.name}\` | ${l.issue} | ${l.replacement} |`);
push();
push('Keep the old templates until the replacements are approved and switched on, then stop using them. Their category was set when they were submitted and cannot be changed.');
push();

writeFileSync(out, lines.join('\n'));
console.log(`wrote ${out} (${lines.length} lines, ${WHATSAPP_TEMPLATES.length} templates)`);

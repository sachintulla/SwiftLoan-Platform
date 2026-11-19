/**
 * SwiftLoan Slack assistant — answers plain-English questions in Slack ("@SwiftLoan
 * how many downloads today?") by letting Claude call read-only data tools over our
 * own metrics. Routed from modules/slackBot.routes.ts (the verified /api/slack/events
 * webhook). All data is READ-ONLY; the bot never changes anything.
 *
 * Off unless configured: needs SLACK_BOT_TOKEN + SLACK_SIGNING_SECRET (webhook) and
 * Anthropic credentials (ANTHROPIC_API_KEY) for the language model.
 */
import Anthropic from '@anthropic-ai/sdk';
import { gatherSnapshot } from './slackSnapshot.js';
import { rupeeCompact } from './slackSnapshotFormat.js';
import { scoped } from './log.js';

const log = scoped('slackBot');

/** The model Claude answers with. Default Opus 5.5; override with SLACK_BOT_MODEL. */
const MODEL = process.env.SLACK_BOT_MODEL || 'claude-opus-5-5';

export function slackWebhookConfigured(): boolean {
  return !!(process.env.SLACK_BOT_TOKEN && process.env.SLACK_SIGNING_SECRET);
}

/* ── The admin dashboards (for "what dashboards do we have?") ─────────────── */

const DASHBOARDS: Array<[label: string, path: string, about: string]> = [
  ['Overview', 'overview', 'Headline KPIs across the whole funnel'],
  ['Analytics', 'analytics', 'Trends and charts over time'],
  ['Onboarding', 'onboarding', 'Sign-up / onboarding funnel'],
  ['Loan Pipeline', 'loans', 'Applications and loans by stage'],
  ['Leads', 'leads', 'Website & contact-us leads'],
  ['Customers', 'customers', 'All users / customer profiles'],
  ['App Downloads', 'downloads', 'Installs + attribution'],
  ['Referrals', 'referrals', 'Friend referrals'],
  ['Messages', 'messages', 'WhatsApp / SMS delivery'],
  ['Calls', 'calls', 'Voice-agent calls + outcomes'],
  ['Support', 'support', 'Support tickets'],
  ['Campaigns', 'campaigns', 'Outreach campaigns'],
  ['Prequalifying', 'prequalifying', 'Prequalify lookups'],
  ['Pre-approved', 'preapproved', 'Pre-approved plans'],
  ['Revasure', 'revasure', 'Revasure MIS + leads'],
  ['Yubi', 'yubi', 'Yubi partner offers'],
  ['Notifications', 'notifications', 'Notification log + rules'],
  ['Configs / Integrations', 'integrations', 'Provider settings'],
  ['Timings', 'timings', 'Timings, windows & limits'],
  ['Test numbers', 'test-numbers', 'QA sign-in numbers'],
  ['Audit log', 'audit', 'Admin audit trail'],
  ['API errors', 'api-errors', 'API error log'],
];

function dashboardsPayload() {
  const base = (process.env.ADMIN_DASHBOARD_URL ?? 'http://localhost:4001').replace(/\/+$/, '');
  return DASHBOARDS.map(([label, path, about]) => ({ name: label, url: `${base}/${path}`, about }));
}

/* ── Read-only data tools Claude can call ────────────────────────────────── */

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_metrics',
    description:
      'Current SwiftLoan business metrics. Each figure has a lifetime `total` and a `today` count ' +
      '(today = since midnight IST). Covers: app downloads, users signed up, leads, loan applications ' +
      'and their worth (₹), offers generated, approvals, disbursals and disbursed amount (₹), the ' +
      'application→disbursal conversion %, and Meta ad spend (not wired yet, reported as 0). ' +
      'Amounts are whole rupees.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_dashboards',
    description: 'The admin dashboards that exist, each with its name, what it shows, and a link.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

async function runTool(name: string): Promise<string> {
  if (name === 'list_dashboards') return JSON.stringify({ dashboards: dashboardsPayload() });
  if (name === 'get_metrics') {
    const m = await gatherSnapshot();
    const money = (n: number) => ({ rupees: n, formatted: rupeeCompact(n) });
    return JSON.stringify({
      as_of: new Date().toISOString(),
      downloads: m.downloads,
      users: m.users,
      leads: m.leads,
      applications: m.applications,
      application_worth: { total: money(m.applicationWorth.total), today: money(m.applicationWorth.today) },
      offers: m.offers,
      approvals: m.approvals,
      disbursals: m.disbursals,
      disbursed_amount: { total: money(m.disbursedAmount.total), today: money(m.disbursedAmount.today) },
      application_to_disbursal_pct: m.appToDisbursalPct,
      meta_ad_spend: m.metaSpend.available ? m.metaSpend : { note: 'Meta ad spend is not wired yet (reported as 0).' },
    });
  }
  return JSON.stringify({ error: `unknown tool ${name}` });
}

const SYSTEM = [
  'You are the SwiftLoan assistant inside Slack. SwiftLoan is a loan-marketplace app (mobile + website) that',
  'connects borrowers to RBI-registered lenders. Answer the team\'s questions about the business using ONLY',
  'the tools provided — never invent numbers.',
  '',
  'Rules:',
  '- Call get_metrics for any count/amount question (users, downloads, applications, disbursals, conversion, etc.).',
  '- Call list_dashboards for "what dashboards do we have" and when a link would help.',
  '- Amounts are WHOLE RUPEES. Format Indian-style (₹1.2 Cr, ₹3.5 L, ₹5,000); use the provided `formatted` value.',
  '- "today" means since midnight IST. Be explicit about total vs today.',
  '- Be concise and Slack-friendly (short sentences, a couple of bullet points max). Bold the key number.',
  '- If a question needs data you have no tool for, say what you CAN answer and point to the right dashboard.',
  '- Never share anyone\'s personal data (names, phone numbers); you only have aggregate counts.',
].join('\n');

/** Answer one free-text question. Returns Slack-ready text. Never throws. */
export async function answerQuestion(question: string): Promise<string> {
  const q = question.trim();
  if (!q) return 'Ask me about SwiftLoan — e.g. "how many downloads today?", "how many users?", or "what dashboards do we have?"';
  try {
    const client = new Anthropic(); // ANTHROPIC_API_KEY from env
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: q }];
    for (let i = 0; i < 5; i++) {
      const resp = await client.messages.create({ model: MODEL, max_tokens: 1024, system: SYSTEM, tools: TOOLS, messages });
      if (resp.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: resp.content });
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const block of resp.content) {
          if (block.type === 'tool_use') results.push({ type: 'tool_result', tool_use_id: block.id, content: await runTool(block.name) });
        }
        messages.push({ role: 'user', content: results });
        continue;
      }
      const text = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n').trim();
      return text || 'Sorry, I could not put together an answer. Try rephrasing?';
    }
    return 'That took too many steps — try a simpler question.';
  } catch (e) {
    log.error('answerQuestion failed', { error: (e as Error).message });
    return 'Sorry — I hit an error reaching the data or the model. Please try again shortly.';
  }
}

/* ── Posting back to Slack ────────────────────────────────────────────────── */

/** Post a message to a channel (optionally threaded). Fire-and-forget; logs failures. */
export async function postSlackMessage(channel: string, text: string, threadTs?: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) { log.warn('no SLACK_BOT_TOKEN — cannot reply'); return; }
  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ channel, text, thread_ts: threadTs }),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!body.ok) log.warn('chat.postMessage rejected', { error: body.error });
  } catch (e) {
    log.warn('chat.postMessage failed', { error: (e as Error).message });
  }
}

/** Strip a leading bot @mention (and surrounding whitespace) from the message text. */
export function stripMention(text: string): string {
  return (text ?? '').replace(/<@[A-Z0-9]+>/gi, ' ').replace(/\s+/g, ' ').trim();
}

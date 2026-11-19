/**
 * Slack assistant webhook — mounted at /api/slack. Slack's Events API POSTs here when
 * someone @mentions the bot or DMs it; we verify the signature, ACK within Slack's 3s
 * window, then answer asynchronously (modules never block the ack) and post the reply.
 *
 * Off unless SLACK_BOT_TOKEN + SLACK_SIGNING_SECRET are set (and Anthropic creds for the
 * model). Read-only: the assistant can only look up aggregate metrics, never change data.
 *
 * Slack App setup: docs/SLACK_ASSISTANT_SETUP.md
 */
import { Router } from 'express';
import { verifySlackSignature } from '../lib/slackVerify.js';
import { answerQuestion, postSlackMessage, stripMention, slackWebhookConfigured } from '../lib/slackBot.js';
import { scoped } from '../lib/log.js';

const log = scoped('slackBot');

export const slackBotRouter = Router();

// Remember recently-handled Slack event ids so a retry (Slack re-delivers if we are
// slow to ack) never produces a duplicate answer. Small bounded set.
const seen = new Set<string>();
function alreadyHandled(id: string | undefined): boolean {
  if (!id) return false;
  if (seen.has(id)) return true;
  seen.add(id);
  if (seen.size > 500) seen.delete(seen.values().next().value as string);
  return false;
}

slackBotRouter.post('/events', (req, res) => {
  const signingSecret = process.env.SLACK_SIGNING_SECRET ?? '';
  if (!slackWebhookConfigured()) return res.status(503).json({ error: 'slack assistant not configured' });

  const rawBody = ((req as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.from('')).toString('utf8');
  const verdict = verifySlackSignature({
    signingSecret,
    timestamp: req.get('x-slack-request-timestamp') ?? undefined,
    signature: req.get('x-slack-signature') ?? undefined,
    rawBody,
  });
  if (!verdict.ok) {
    log.warn('rejected unsigned/invalid request', { reason: verdict.reason });
    return res.status(401).json({ error: 'invalid signature' });
  }

  const body = (req.body ?? {}) as any;

  // Slack endpoint ownership handshake (done once, when you set the Request URL).
  if (body.type === 'url_verification') return res.status(200).json({ challenge: body.challenge });

  // Ack immediately — anything slower makes Slack retry.
  res.status(200).end();

  if (body.type !== 'event_callback') return;
  // Ignore Slack's own retries (we already have this event) and our own bot's messages.
  if (req.get('x-slack-retry-num')) return;
  if (alreadyHandled(body.event_id)) return;

  const event = body.event ?? {};
  const isMention = event.type === 'app_mention';
  const isDirectMessage = event.type === 'message' && event.channel_type === 'im';
  if (!isMention && !isDirectMessage) return;
  if (event.bot_id || event.subtype) return; // never answer bots (incl. ourselves)

  const question = stripMention(event.text ?? '');
  const channel = event.channel as string;
  const threadTs = (event.thread_ts as string) || (event.ts as string);
  if (!channel) return;

  // Fire-and-forget: compute the answer and post it back.
  answerQuestion(question)
    .then((answer) => postSlackMessage(channel, answer, threadTs))
    .catch((e) => log.error('slack answer failed', { error: (e as Error).message }));
});

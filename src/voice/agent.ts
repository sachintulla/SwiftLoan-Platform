// Ported from @ello/agent-sdk's agent.ts (ElloAgent). The state machine, message
// handling, and tool-dispatch/validation/timeout/abort logic are unchanged from
// the browser SDK — only the three DOM-bound collaborators (mic capture, PCM
// playback, confirmation UI) are swapped for RN-native implementations, passed
// in via the constructor instead of owned internally.
import NetInfo from '@react-native-community/netinfo';
import { Emitter } from './events';
import { ToolRegistry } from './registry';
import { ElloSocket } from './transport/ws';
import { createVoiceSession } from './transport/sessionApi';
import { vlog } from './log';
import { BUTTONS_ONLY_SCREENS, getCurrentScreen } from './actionRegistry';
import { reportOfflineAttempt } from '../state/offlineBridge';
import type {
  AgentEventMap,
  AgentStatus,
  ClientToolOptions,
  ConfirmFn,
  ElloAgentOptions,
  MicCapture,
  PageContextProvider,
  PcmPlayer,
} from './types';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;
// A confirmation prompt (e.g. logout) that is never answered must not hang the
// session forever. If the user doesn't respond in this window — or the request
// is aborted — treat it as a denial so the tool call resolves and status clears.
const CONFIRM_TIMEOUT_MS = 45_000;
// A freshly-mounted data screen (profile, offers, loans) commonly renders
// through several distinct states in quick succession — a loading skeleton,
// then a partial paint, then the fully-loaded content — before settling.
// Debouncing the actual send by this long after the last updatePageContext()
// call means only the settled state (the last one in the burst) ever gets
// read and sent, instead of one full send per intermediate render. Needs to
// comfortably outlast a data screen's real async load — confirmed live the
// gap between store.ts's immediate on-navigation call and the discovery
// effect's call once real content actually renders can run 600-900ms
// (profile's api.me() fetch), so a shorter window still let the immediate
// call's own timer fire first, on stale/incomplete data.
const PAGE_CONTEXT_DEBOUNCE_MS = 900;
// Home's buttons arrive over ~2s as its data loads (offer cards, hero CTA swap); wait for them to
// settle so the agent gets one update, not three.
const BUTTONS_ONLY_DEBOUNCE_MS = 2500;
// A short, SEPARATE debounce for the urgent path — not for politeness (the
// point of urgent is still to interrupt fast), but to coalesce two urgent
// calls that land within a few ms of each other (e.g. basicpan's PAN-save
// urgent flush immediately followed by finding.tsx's offers-found urgent
// flush, in a fast sequential flow) into a single interruption carrying the
// truly latest state, instead of firing one barge-in after another off a
// stale intermediate snapshot. Far shorter than PAGE_CONTEXT_DEBOUNCE_MS —
// imperceptible to a listener, long enough to catch a same-tick pileup.
const URGENT_COALESCE_MS = 120;

/** A pause this long between audio chunks, after the previous line's text arrived, starts a new line. */
const NEW_UTTERANCE_GAP_MS = 300;

/** Screens before the dashboard: lines spoken here are the sign-in flow, not the introduction. */
const ONBOARDING_SCREENS = new Set(['splash', 'privacy', 'language', 'intro', 'mobile', 'otp', 'permissions', 'aboutyou']);

/** Placeholder text for a silent agent turn, e.g. "(No speech)" or "<no speech>{pause}". */
const NO_SPEECH_MARKER = /^[\s(<[{]*no[\s_-]*speech\b|\{\s*pause\s*\}/i;

export class ElloAgent {
  conversationId: string | null = null;

  private registry = new ToolRegistry();
  private emitter = new Emitter<AgentEventMap>();
  private socket: ElloSocket | null = null;
  private status: AgentStatus = 'idle';
  private muted = false;
  // Concurrent tool calls, keyed by tool_call_id — the backend model (Gemini
  // Live) can fire several client-tool-call messages per turn; there is no
  // client-side batching, each is executed and answered independently.
  private inflight = new Map<string, AbortController>();
  // Handlers run strictly one at a time, in arrival order. The model often fires
  // e.g. select_option("English") and continue_next in the SAME millisecond; run in
  // parallel, continue_next looked at the screen before select_option's state
  // update rendered, got "Continue is disabled", and the agent then told the user
  // the button was unavailable although the language was already selected. Queued,
  // continue_next sees the screen select_option left behind (each handler waits for
  // its own re-render before returning).
  private toolQueue: Promise<unknown> = Promise.resolve();
  private pageContextFn: PageContextProvider | null = null;
  private pageContextFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private urgentFlushTimer: ReturnType<typeof setTimeout> | null = null;
  // At most ONE deferred "flush once she stops speaking" listener at a time.
  // Every deferred flush used to add its own statusChange listener, so N
  // deferrals while she talked became N sends the instant she stopped.
  private deferredFlushUnsub: (() => void) | null = null;
  // Last page a client-tools-update was actually sent for — lets an unchanged,
  // non-urgent repeat for the SAME page be dropped instead of sent as a bare
  // marker that still reads server-side as a fresh turn.
  private lastSentPage: string | null = null;
  // Full page_context already sent this session, keyed by screen — lets a
  // revisit with nothing changed (Home -> Profile -> Home -> Profile) send a
  // cheap page-marker instead of the whole object again. Reset per call in
  // start(); the model can always call read_screen itself for specifics.
  private lastSentPerScreen = new Map<string, string>();
  // Whether this call's first client-tools-update (the one that actually
  // matters — Gemini Live can't add function declarations mid-session, see
  // the comment on updatePageContext below) has already carried the tools
  // array. Every later client-tools-update in the same call omits `tools`
  // entirely instead of resending the identical array: the server's own
  // handler is literally on_client_tools_update(msg.get("tools")) — a
  // missing key is a no-op there, not an error — and resending changes
  // nothing anyway since no tool here defines availableWhen (the only thing
  // a repeat send could actually refresh). Reset per call in start().
  private toolsSentThisSession = false;
  private audioOutCount = 0;
  // Utterance boundaries. Ello streams the agent's audio faster than it plays, so a finished
  // sentence can still have seconds of audio queued on the phone when the NEXT sentence
  // arrives; waiting for it to drain made the new line late or (on Android) stuck. The agent's
  // text for a line arrives once that line is complete, so "text received + a real pause since
  // the last audio chunk" marks the start of a new line: drop the old line's unplayed rest.
  private lastAudioChunkAt = 0;
  // True once the agent has spoken a line on a signed-in screen this call — i.e. it has already
  // introduced itself. Sent to the agent as `already_introduced` so that coming back to Home from
  // another screen is not treated as a fresh opening ("Hi, I'm Ruby…" again).
  private signedInLineSpoken = false;
  private agentTextSinceAudio = false;
  // Fallback so the FAB never gets stuck on "speaking": if audio chunks stop
  // arriving and no 'voice-audio-stream-end' follows (server timing, or the
  // audio session getting reconfigured), drop back to "listening".
  private speakingTimer: ReturnType<typeof setTimeout> | null = null;
  // Generation counter for start(). start() awaits a REST call and a WebSocket
  // handshake, during which this.socket is still null — so a stop() in that window
  // used to cancel nothing, and the in-flight start would then bring the session up
  // *after* the user hung up. Every start captures a token; if stop() (or another
  // start) bumps it, the stale start unwinds instead of installing itself.
  private startToken = 0;

  constructor(
    private options: ElloAgentOptions,
    private mic: MicCapture,
    private player: PcmPlayer,
    private confirm: ConfirmFn,
  ) {}

  registerTool<TArgs>(def: ClientToolOptions<TArgs>): void {
    this.registry.register(def as ClientToolOptions);
  }

  unregisterTool(name: string): void {
    this.registry.unregister(name);
  }

  registerPageContext(fn: PageContextProvider): void {
    this.pageContextFn = fn;
  }

  // All tools must already be registered before the first voice-session-start —
  // Gemini Live cannot add function declarations mid-session. Calling this after
  // that point only refreshes the (advisory) `available` flag + page_context.
  //
  // Debounced, not just coalesced: every navigation fires TWO callers around
  // the same time — store.ts's screen-change effect (immediate, before any of
  // the new screen's async data has loaded) and Frame.tsx's control-discovery
  // effect (fires again each time the discovered control set changes, e.g. as
  // a profile/offers/loans screen goes from loading skeleton to real content).
  // A microtask-only coalesce used to only catch callers in the very same
  // commit, so those two still landed as separate sends (observed server-side
  // as a doubled "provider can't update tools live" log line and real added
  // latency before the agent spoke, plus a stale partially-loaded snapshot
  // getting sent as if it were real content). Using a real timer instead
  // means any call that lands within PAGE_CONTEXT_DEBOUNCE_MS of another
  // resets the wait, so only the last call in a burst — by which point the
  // screen has actually settled — reads page context and sends.
  //
  // That still assumes real content always arrives within the window, which
  // isn't true for a control fed by its own async fetch (a screen's load()
  // resolving anywhere from ~200ms to over a second depending on the network)
  // — confirmed live sending before such a control had registered at all. See
  // index.ts's onTargetSetChanged(agent.updatePageContext) subscription: a
  // control appearing or disappearing anywhere re-triggers this method too
  // (screenGraph.ts/actionRegistry.ts, not this file), which resets this same
  // timer — so a late registration extends the wait itself instead of the
  // debounce having to guess a fixed duration long enough to always outlast it.
  // `urgent` is the deliberate, narrow exception to the speaking-guard below —
  // reserved for a genuinely time-sensitive announcement (e.g. finding.tsx's
  // real offers actually arriving while the user's still on the waiting
  // screen) where Ruby cutting in immediately is the point, not a bug. It
  // skips the defer-while-speaking check (see flushPageContext's own comment
  // for why that defer exists at all) and the routine debounce, but is NOT
  // fired instantly itself — see URGENT_COALESCE_MS: several urgent calls
  // landing within a few ms of each other collapse into the single latest
  // one, so two callers marking urgent back to back interrupt Ruby once with
  // current truth, not twice with the first one already stale by the time it
  // sends. Use urgent sparingly regardless: every other caller should keep
  // using the plain (debounced, non-interrupting) form.
  //
  // `immediate` is for a tool's own result (tools.ts settled()): flush on the
  // next microtask, bypassing the debounce, so the update is delivered while the
  // server still sees that tool call as pending and can merge the two into ONE
  // turn. Going through the 900ms debounce instead sent it AFTER she had already
  // answered the tool result, producing a second, standalone spoken turn.
  updatePageContext(opts?: { urgent?: boolean; immediate?: boolean }): void {
    if (opts?.immediate && !opts.urgent) {
      if (this.pageContextFlushTimer) { clearTimeout(this.pageContextFlushTimer); this.pageContextFlushTimer = null; }
      Promise.resolve().then(() => this.flushPageContext(false));
      return;
    }
    if (opts?.urgent) {
      // Cancel any pending routine flush — an urgent one supersedes it
      // outright, not just delays it.
      if (this.pageContextFlushTimer) { clearTimeout(this.pageContextFlushTimer); this.pageContextFlushTimer = null; }
      // See URGENT_COALESCE_MS's comment — resets on every urgent call within
      // the window, so a burst of them collapses into one flush reading
      // whatever is truly current when the last one in the burst fires.
      if (this.urgentFlushTimer) clearTimeout(this.urgentFlushTimer);
      this.urgentFlushTimer = setTimeout(() => {
        this.urgentFlushTimer = null;
        this.flushPageContext(true);
      }, URGENT_COALESCE_MS);
      return;
    }
    if (this.pageContextFlushTimer) clearTimeout(this.pageContextFlushTimer);
    this.pageContextFlushTimer = setTimeout(() => {
      this.pageContextFlushTimer = null;
      this.flushPageContext(false);
    }, BUTTONS_ONLY_SCREENS.has(getCurrentScreen()) ? BUTTONS_ONLY_DEBOUNCE_MS : PAGE_CONTEXT_DEBOUNCE_MS);
  }

  private flushPageContext(urgent: boolean): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    // A client-tools-update that lands while the agent is mid-utterance gets
    // treated server-side as a barge-in: confirmed live (RECV voice-audio-purge
    // "clearing playback" immediately followed by a truncated, restarted
    // conversation-text) that a routine, purely-cosmetic page-context refresh —
    // the language screen's rotating greeting ticking over — cut the agent off
    // mid-sentence and made it restart, twice in a row, never finishing a single
    // reply. Deferring the send until speech actually ends fixes that without
    // dropping the update — it fires the instant status leaves 'speaking'. This
    // guard is independent of the debounce timer above (which only settles
    // *when* the screen has stopped changing, not *whether* the agent is mid-
    // reply) — losing it here would reintroduce the same interruption bug even
    // though the payload it interrupts with is now smaller/deduped.
    //
    // `urgent` deliberately skips this — the whole point of that path is to
    // interrupt whatever Ruby is currently saying.
    if (!urgent && this.status === 'speaking') {
      // No visibility into this path previously — every "repeats herself"
      // report had to be diagnosed from timestamp-guessing alone. This is
      // exactly the moment worth knowing about: an update queued because
      // she was mid-utterance, about to land the instant she stops.
      vlog('page_context deferred — agent is speaking, will flush once status leaves speaking');
      if (this.deferredFlushUnsub) return; // already waiting; the flush reads live state anyway
      const unsubscribe = this.emitter.on('statusChange', next => {
        // Only 'listening' is a safe moment to send: 'executingTool' means a
        // tool call is mid-flight (it would land inside it), and 'ended'/'idle'
        // mean there is no one left to tell.
        if (next === 'speaking' || next === 'executingTool' || next === 'connecting') return;
        unsubscribe();
        this.deferredFlushUnsub = null;
        if (next !== 'listening') return;
        vlog('page_context flushing now — speaking ended (status ->', next, ')');
        this.flushPageContext(false);
      });
      this.deferredFlushUnsub = unsubscribe;
      return;
    }
    // Field name is "tools" here (native_orchestrator.py's on_client_tools_update
    // reads msg.get("tools")) — note this differs from voice-session-start's
    // own "client_tools" field below; that asymmetry is real, not a typo.
    // Strip the "speak first / Welcome to SwiftLoan" opening from navigation
    // updates — that instruction must only fire once, at session start. Left in,
    // the agent re-greets on every screen change. The rest of the page context
    // (screen_overview, goal, autoAdvance, available_actions) still refreshes.
    const ctx: any = this.pageContextFn?.() ?? {};
    if (ctx.interactionGuide && 'opening' in ctx.interactionGuide) {
      const { opening: _drop, ...guide } = ctx.interactionGuide;
      ctx.interactionGuide = guide;
    }

    // Same screen, same content as the last full send this session -> this
    // is a bare revisit (or an unrelated update firing while nothing on this
    // particular screen actually changed). Send just the page name instead
    // of the full payload; read_screen covers the model needing specifics.
    //
    // available_actions is sorted before fingerprinting only (never in the
    // payload actually sent) — its order comes from merging two separate
    // registration maps (auto-discovered elements + explicit component
    // registrations, see actionRegistry.ts's mergedTargets) whose relative
    // order isn't stable across re-renders even when the control set itself
    // hasn't changed. Raw stringify treated that incidental reshuffling as a
    // real change, so every profile revisit re-sent in full while home
    // (whose order happens to stay stable) deduped correctly.
    // api_context is cleared to {} on every navigation (store.ts's nav
    // reducer cases) and repopulated moments later by whichever screen
    // feeds it (e.g. Home's own offers fetch) — so "key absent" and
    // "key present with an empty array" both mean the same thing (no data
    // yet) but fingerprint as different, causing the exact resend-on-every-
    // revisit this dedup exists to prevent. Drop empty-array values before
    // fingerprinting so that distinction can't register as a real change.
    const screenKey = String(ctx.page ?? '');
    // A buttons-only screen (Home) the agent has already been told about: later changes there are
    // just its offer cards and lender buttons arriving as data loads. They carry nothing the agent
    // needs — it resolves controls live when it acts — but every send is a turn, and a turn right
    // after it finished speaking made it say something again. Arriving on the screen, or an urgent
    // update (login, a toast), still sends.
    if (!urgent && BUTTONS_ONLY_SCREENS.has(screenKey) && this.lastSentPage === screenKey) {
      vlog('page_context skipped — only button changes on', screenKey, 'which the agent already knows');
      return;
    }
    const fingerprintOf = (c: any): string => {
      const actions = Array.isArray(c.available_actions)
        ? [...c.available_actions].sort((a: any, b: any) => {
            const ka = `${a?.kind}|${a?.label}`;
            const kb = `${b?.kind}|${b?.label}`;
            return ka < kb ? -1 : ka > kb ? 1 : 0;
          })
        : c.available_actions;
      let apiContext = c.api_context;
      if (apiContext && typeof apiContext === 'object') {
        const meaningful = Object.fromEntries(
          Object.entries(apiContext).filter(([, v]) => !(Array.isArray(v) && v.length === 0)),
        );
        apiContext = Object.keys(meaningful).length ? meaningful : undefined;
      }
      // `seconds_ago` on a toast ticks every second; it is not a content change.
      if (apiContext && typeof apiContext === 'object' && (apiContext as any).lastToast) {
        apiContext = { ...(apiContext as any), lastToast: { message: (apiContext as any).lastToast.message } };
      }
      return JSON.stringify({ ...c, available_actions: actions, api_context: apiContext });
    };
    const fingerprint = fingerprintOf(ctx);
    const unchanged = this.lastSentPerScreen.get(screenKey) === fingerprint;
    // Non-urgent, nothing changed, and we already told the model about this very
    // page: there is nothing to say, and even a bare marker can read as a new turn.
    if (!urgent && unchanged && this.lastSentPage === screenKey) {
      vlog('page_context skipped — nothing changed since the last send for', screenKey);
      return;
    }
    // Always the full content. A bare {page} marker used to be sent on a revisit with
    // nothing changed, relying on the model remembering an older snapshot of that
    // screen — which it does not reliably do, so it described a revisited screen
    // from memory. (An unchanged repeat for the SAME page is skipped above.)
    const payload = ctx;
    if (!unchanged) this.lastSentPerScreen.set(screenKey, fingerprint);
    this.lastSentPage = screenKey;

    const includeTools = !this.toolsSentThisSession;
    this.toolsSentThisSession = true;
    this.socket!.send({
      type: 'client-tools-update',
      ...(includeTools ? { tools: this.registry.toWire() } : {}),
      page_context: payload,
    });
    vlog('page_context sent (client-tools-update):', urgent ? '[urgent] ' : '', unchanged ? '[revisit, nothing changed] ' : '', includeTools ? '[+tools]' : '', JSON.stringify(payload));
  }

  on<K extends keyof AgentEventMap>(event: K, fn: (payload: AgentEventMap[K]) => void): () => void {
    return this.emitter.on(event, fn);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  /** Has the agent already spoken (introduced itself) on a signed-in screen during this call? */
  hasIntroducedThisCall(): boolean {
    return this.signedInLineSpoken;
  }

  getStatus(): AgentStatus {
    return this.status;
  }

  async start(phone?: string): Promise<void> {
    vlog('start() called; apiKeySet=', !!this.options.apiKey, 'assistantId=', this.options.assistantId);
    if (!this.options.apiKey || !this.options.assistantId) {
      vlog('ABORT: apiKey/assistantId not configured');
      throw new Error('ElloAgent: apiKey/assistantId not configured');
    }
    if (this.socket) {
      vlog('start() ignored — socket already exists');
      return;
    }

    const token = ++this.startToken;
    const cancelled = () => token !== this.startToken;
    // Reset per-session so the "#N" in RECV voice-audio-output logs reflects
    // this call, not a running total left over from every earlier session —
    // otherwise the first chunk of a fresh call can print as "#450" purely by
    // landing on a stale %50 boundary, making response-time impossible to read.
    this.audioOutCount = 0;
    this.lastAudioChunkAt = 0;
    this.agentTextSinceAudio = false;
    this.signedInLineSpoken = false;
    this.lastSentPerScreen.clear();
    this.lastSentPage = null;
    this.toolsSentThisSession = false;

    this.setStatus('connecting');
    try {
      // Check before dialing out, not after: tapping the FAB with no signal
      // used to hang on the REST call until it timed out (see
      // SESSION_START_TIMEOUT_MS in sessionApi.ts) before the user learned why
      // nothing was happening. A NetInfo probe resolves in well under a second.
      const netState = await NetInfo.fetch();
      if (netState.isConnected === false || netState.isInternetReachable === false) {
        throw new Error('offline: no internet connection');
      }
      vlog('POST call ->', this.options.apiBaseUrl);
      const { conversationId } = await createVoiceSession(this.options, phone);
      if (cancelled()) {
        vlog('start aborted after REST — stop() was pressed');
        return;
      }
      this.conversationId = conversationId;
      vlog('REST ok conv=', conversationId);

      const socket = new ElloSocket(this.options.wsUrl!);
      // A WebSocket close is asynchronous (see ElloSocket#close) — frames the
      // server sends (or its own close event) in that in-between window can
      // still fire onMessage/onClose on THIS socket well after a newer
      // start() has replaced it as this.socket. Without this check, that
      // stale traffic (a superseded session's audio, tool-calls, or its own
      // eventual session-ended) gets processed against the current session:
      // observed live as two calls' audio interleaving into the same native
      // player, and a stale session-ended tearing down the session that
      // replaced it.
      const isCurrent = () => this.socket === socket;
      socket.onMessage(msg => { if (isCurrent()) this.handleMessage(msg); });
      socket.onClose(() => {
        if (!isCurrent()) return;
        vlog('WS CLOSED');
        this.teardown();
      });
      vlog('WS connecting ->', this.options.wsUrl);
      await socket.connect();
      if (cancelled()) {
        // The user hung up mid-handshake: close the socket we just opened rather
        // than leaving an orphaned session streaming in the background.
        vlog('start aborted after WS open — closing orphan socket');
        try {
          socket.send({ type: 'voice-session-end' });
          socket.close();
        } catch {
          /* already gone */
        }
        this.teardown();
        return;
      }
      this.socket = socket;
      vlog('WS OPEN');

      const tools = this.registry.toWire();
      const fullContext = this.pageContextFn?.() ?? {};
      // The start message carries the FULL page context: the screen overview, every control
      // with its live state (selected language, typed values, ticked consents), the saved
      // applicant draft and the api_context. A call often begins mid-step — the user may already
      // have picked a language or typed their number before pressing the mic — and withholding
      // this made the agent ask for things that were already done ("which language?" after
      // English was picked). The prompt's "start from what is already done" rules tell the agent
      // how to use it. (This used to blank screen_overview/available_actions/savedApplicantDraft/
      // api_context on purpose to force a generic first greeting; see git history if that needs
      // to come back.) `page` must stay non-empty: the backend's speak-first path is gated on it.
      const startPageContext = fullContext;
      socket.send({
        type: 'voice-session-start',
        conversation_id: conversationId,
        client_tools: tools,
        page_context: startPageContext,
      });
      vlog('sent voice-session-start; tools=', tools.map(t => t.name));
      vlog('page_context sent:', JSON.stringify(startPageContext));

      let sentChunks = 0;
      await this.mic.start(base64 => {
        // A stale capture callback must not keep feeding a session the user ended.
        if (cancelled() || this.muted) return;
        // Field name is "data" (confirmed from ello-app's own
        // ello_websocket_manager.py: `data.get("data")`) — NOT "audio".
        this.socket?.send({ type: 'voice-audio-input', data: base64, sample_rate: 16000, channels: 1 });
        if (++sentChunks % 50 === 0) vlog('audio-input sent chunks=', sentChunks);
      });
      if (cancelled()) {
        vlog('start aborted after mic open — tearing down');
        this.mic.stop();
        this.socket = null;
        try {
          socket.send({ type: 'voice-session-end' });
          socket.close();
        } catch {
          /* already gone */
        }
        this.teardown();
        return;
      }
      vlog('mic.start() resolved — streaming audio');
      this.setStatus('listening');
      // No follow-up send is needed: the start message above already carried the full context.
    } catch (e: any) {
      const message = e?.message || String(e);
      vlog('START FAILED:', message);
      // Tapping the agent button is the single most common internet-dependent
      // action a user takes — surface the offline banner so a failed/timed-out
      // connect attempt is explained, instead of just silently going nowhere.
      // Only for genuinely offline failures, though (the 'offline:' prefix set
      // above) — this used to fire for EVERY start() failure, including native
      // AVAudioSession errors (e.g. the OS denying the mic because a phone call
      // is active), which told the user they were "offline" when they weren't.
      if (message.startsWith('offline:')) {
        reportOfflineAttempt();
      }
      this.emitter.emit('error', e instanceof Error ? e : new Error(message));
      this.teardown();
      throw e;
    }
  }

  async stop(): Promise<void> {
    // Invalidate any start() still in flight so it unwinds instead of connecting
    // after the user hung up.
    this.startToken++;
    vlog('stop() called; hadSocket=', !!this.socket);
    this.mic.stop();
    this.player.purge();
    for (const controller of this.inflight.values()) controller.abort();
    this.inflight.clear();
    this.socket?.send({ type: 'voice-session-end' });
    this.teardown();
  }

  // Closes the socket itself rather than relying on every caller to do it first —
  // this is also called from handleMessage()'s "session-ended" case (the SERVER
  // ending the session, e.g. the model calling disconnect_call), which previously
  // only dropped our reference and left the underlying WebSocket open. That left
  // the whole chain behind it (ai-voice-agent's bridge to assistant-service, and
  // the native Gemini Live session) alive for minutes after the call was logically
  // over — observed server-side as the native session staying open ~5.5 minutes
  // past disconnect until Gemini itself killed it with a 1008 policy violation,
  // during which usage/recording/duration data never got attached to the already-
  // finalized call log. socket.close() on an already-closing/closed socket is a
  // safe no-op, so this is fine to call unconditionally from either path.
  private teardown(): void {
    if (this.speakingTimer) { clearTimeout(this.speakingTimer); this.speakingTimer = null; }
    if (this.pageContextFlushTimer) { clearTimeout(this.pageContextFlushTimer); this.pageContextFlushTimer = null; }
    if (this.urgentFlushTimer) { clearTimeout(this.urgentFlushTimer); this.urgentFlushTimer = null; }
    if (this.deferredFlushUnsub) { this.deferredFlushUnsub(); this.deferredFlushUnsub = null; }
    this.socket?.close();
    this.socket = null;
    this.conversationId = null;
    this.setStatus('idle');
  }

  // NOTE (removed): an automatic "send the real screen once the greeting finishes"
  // follow-up was tried here. Every client-tools-update is injected into the model
  // as a reminder (see ELLO_VOICE_SDK_INTEGRATION_GUIDE.md), so a standalone one on
  // the same page made the model run the screen's opening script AGAIN — observed
  // live: "Which language would you like to continue in…" asked twice, 4.6s apart.
  // The starting screen therefore stays generic by design; the prompt tells Ruby to
  // call read_screen (a tool call, which does not cause an extra turn) before
  // describing or acting on a screen whose available_actions are empty.

  private setStatus(status: AgentStatus): void {
    this.status = status;
    this.emitter.emit('statusChange', status);
  }


  private handleMessage(msg: any): void {
    // Log every inbound frame type except the high-rate audio stream (counted
    // separately below) so a stalled pipeline shows exactly where it stopped.
    if (msg?.type !== 'voice-audio-output') {
      vlog('RECV', msg?.type, JSON.stringify(msg ?? {}).slice(0, 300));
    }
    switch (msg?.type) {
      case 'session-established':
        this.setStatus('listening');
        break;
      case 'voice-audio-output': {
        const now = Date.now();
        if (this.agentTextSinceAudio && this.lastAudioChunkAt > 0 && now - this.lastAudioChunkAt > NEW_UTTERANCE_GAP_MS) {
          vlog('new agent line — dropping the unplayed rest of the previous one');
          this.player.purge();
        }
        this.agentTextSinceAudio = false;
        this.lastAudioChunkAt = now;
        this.audioOutCount++;
        if (this.audioOutCount <= 2 || this.audioOutCount % 50 === 0) {
          vlog('RECV voice-audio-output #', this.audioOutCount, 'fmt=', msg.format);
        }
        this.player.playChunk(msg.audio);
        this.setStatus('speaking');
        // Re-arm the fallback: after the last chunk, if no stream-end arrives,
        // return to "listening" so the FAB doesn't stay stuck on "speaking".
        if (this.speakingTimer) clearTimeout(this.speakingTimer);
        this.speakingTimer = setTimeout(() => {
          this.speakingTimer = null;
          if (this.status === 'speaking' && this.inflight.size === 0) this.setStatus('listening');
        }, 1200);
        break;
      }
      case 'voice-audio-stream-end':
        if (this.speakingTimer) { clearTimeout(this.speakingTimer); this.speakingTimer = null; }
        if (this.inflight.size === 0) this.setStatus('listening');
        break;
      case 'voice-audio-purge':
        // Server-side barge-in: the user talked over the agent, so drop queued
        // audio immediately. The mic deliberately stays live throughout — echo is
        // handled by the platform AEC in VoiceAudioModule, not by muting, so the
        // user can always interrupt.
        vlog('RECV voice-audio-purge — barge-in, clearing playback');
        if (this.speakingTimer) { clearTimeout(this.speakingTimer); this.speakingTimer = null; }
        this.player.purge();
        this.setStatus('listening');
        break;
      case 'conversation-text':
        if (msg.data?.source === 'agent' && !msg.data?.is_interim) this.agentTextSinceAudio = true;
        if (
          msg.data?.source === 'agent' && !msg.data?.is_interim &&
          String(msg.data?.text ?? '').trim() && !NO_SPEECH_MARKER.test(String(msg.data?.text ?? '')) &&
          !ONBOARDING_SCREENS.has(getCurrentScreen())
        ) {
          this.signedInLineSpoken = true;
        }
        // Ello logs a turn the model chose to stay silent as "(No speech)" / "<no speech>{pause}", and
        // the model has been heard SAYING those words aloud. The text arrives just after the audio,
        // so drop whatever of that audio is still queued rather than let it play out.
        if (msg.data?.source === 'agent' && NO_SPEECH_MARKER.test(String(msg.data?.text ?? ''))) {
          vlog('agent turn was a no-speech marker — cutting its audio');
          this.player.purge();
        }
        // Server wraps payloads under "data"; is_interim is inverted from "final".
        this.emitter.emit('transcript', {
          role: msg.data?.source === 'agent' ? 'agent' : 'user',
          text: msg.data?.text ?? '',
          final: !msg.data?.is_interim,
        });
        break;
      case 'client-tool-call':
        this.executeToolCall(msg.tool_call_id, msg.name, msg.args || {});
        break;
      case 'client-tool-cancel':
        this.inflight.get(msg.tool_call_id)?.abort();
        break;
      case 'client-tools-ack':
        this.emitter.emit('toolsAck', { accepted: msg.accepted ?? [], rejected: msg.rejected ?? [] });
        break;
      case 'session-ended':
        this.teardown();
        this.emitter.emit('sessionEnd', undefined);
        break;
      case 'error-occurred':
        this.emitter.emit('error', new Error(msg.error?.message || 'ello agent error'));
        break;
      default:
        break;
    }
  }

  private async executeToolCall(toolCallId: string, name: string, args: Record<string, unknown>): Promise<void> {
    vlog('TOOL CALL', name, JSON.stringify(args));
    this.emitter.emit('toolCall', { toolCallId, name, args });
    const tool = this.registry.get(name);
    const controller = new AbortController();
    this.inflight.set(toolCallId, controller);
    this.setStatus('executingTool');

    // status/error shape matches native_orchestrator.py's
    // _client_tool_result_for_model exactly: 'ok' -> result payload, 'denied' ->
    // special-cased "user declined" messaging, anything else -> reply.error.{code,message}.
    const respond = (status: 'ok' | 'denied' | 'error', result?: unknown, error?: { code: string; message: string }) => {
      this.inflight.delete(toolCallId);
      vlog('TOOL RESULT', status, JSON.stringify(result ?? error ?? {}));
      this.socket?.send({ type: 'client-tool-result', tool_call_id: toolCallId, status, result, error });
      this.emitter.emit('toolResult', { toolCallId, status, result, error });
      if (this.inflight.size === 0) this.setStatus('listening');
    };
    const fail = (code: string, message: string) => respond('error', undefined, { code, message });

    if (!tool) {
      fail('unknown_tool', `unknown tool: ${name}`);
      return;
    }
    // availableWhen is a soft gate only — the server's last-known `available`
    // flag can be stale, so it is always re-checked here before running.
    if (tool.availableWhen && !tool.availableWhen()) {
      fail('tool_unavailable', 'tool unavailable on current screen');
      return;
    }

    const validation = this.registry.validateArgs(tool, args);
    if (!validation.ok) {
      fail('invalid_args', validation.error);
      return;
    }

    if (tool.requiresConfirmation) {
      // Bounded so an unanswered confirmation dialog can't leave the agent stuck
      // in `executingTool` with the tool call never resolving.
      const allowed = await this.confirmWithTimeout(
        tool.confirmationMessage || `Allow "${tool.name}"?`,
        controller.signal,
      );
      if (!allowed) {
        respond('denied');
        return;
      }
    }

    const timeoutMs = Math.min(tool.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
    try {
      // The timeout clock starts when the handler starts, not while it waits its turn.
      const run = () =>
        this.runWithTimeout(
          Promise.resolve(tool.handler(args, { toolCallId, signal: controller.signal })),
          timeoutMs,
          controller.signal,
        );
      const queued = this.toolQueue.then(run, run);
      this.toolQueue = queued.catch(() => undefined);
      const result = await queued;
      respond('ok', result);
    } catch (e: any) {
      fail('tool_handler_failed', e?.message || 'tool handler failed');
    }
  }

  /**
   * Await the confirmation prompt, but resolve `false` (deny) if it isn't
   * answered within CONFIRM_TIMEOUT_MS or the tool call is aborted — so an
   * unanswered dialog can never hang the session.
   */
  private confirmWithTimeout(message: string, signal: AbortSignal): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let done = false;
      const finish = (v: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      };
      const timer = setTimeout(() => finish(false), CONFIRM_TIMEOUT_MS);
      const onAbort = () => finish(false);
      signal.addEventListener('abort', onAbort, { once: true });
      Promise.resolve(this.confirm(message)).then(
        (v) => finish(!!v),
        () => finish(false),
      );
    });
  }

  private runWithTimeout<T>(promise: Promise<T>, timeoutMs: number, signal: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('tool call timed out')), timeoutMs);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new Error('tool call aborted'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      promise.then(
        v => {
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
          resolve(v);
        },
        e => {
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
          reject(e);
        },
      );
    });
  }
}

// ── SWAPPABLE TRANSPORT — see ./README.md.
//
// A subclass of ElloAgent: everything the app relies on is INHERITED, not copied — the tool queue and
// timeouts, page-context de-duplication, urgent updates, `already_introduced`, the "(no speech)" filter, the
// stall / idle check-in watch, and the rule that a context update waits while the agent is speaking. Only
// the transport differs: instead of streaming base64 PCM over the websocket, this opens a real WebRTC call
// (real mic and speaker, the platform's own echo cancellation) and uses the websocket only for signalling.
// The tool and context messages (`client-tools-update`, `client-tool-call`, …) are the same on both.
import NetInfo from '@react-native-community/netinfo';
import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } from 'react-native-webrtc';
import type { MediaStream, MediaStreamTrack } from 'react-native-webrtc';
import { ElloAgent } from '../../agent';
import { ElloSocket } from '../../transport/ws';
import { createVoiceSession } from '../../transport/sessionApi';
import { identityMap } from '../../pageContextDelta';
import { vlog } from '../../log';
import { reportOfflineAttempt } from '../../../state/offlineBridge';
import { getLocalAudioStream, startSpeakerRouting, stopSpeakerRouting, ICE_SERVERS, waitForIceGathering } from './webrtcAudio';
import { RemoteAudioLevel, SpeakingMeter } from './speakingMeter';
import { hasRelay } from './iceServers';
import { ELLO_WEBRTC_WS_URL } from './config';
import type { ConfirmFn, ElloAgentOptions, MicCapture, PcmPlayer } from '../../types';

// The base class needs a mic and a player; over WebRTC the platform does both, so these do nothing.
const NO_MIC: MicCapture = { start: async () => {}, stop: () => {} };
const NO_PLAYER: PcmPlayer = { playChunk: () => {}, purge: () => {} };

/** How often the agent's audio level is sampled to tell whether it is talking. */
const SPEAKING_POLL_MS = 250;

export class WebRTCAgent extends ElloAgent {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private speakingPoll: ReturnType<typeof setInterval> | null = null;
  private speakingMeter = new SpeakingMeter();
  private remoteLevel = new RemoteAudioLevel();

  constructor(options: ElloAgentOptions, confirm: ConfirmFn) {
    super(options, NO_MIC, NO_PLAYER, confirm);
  }

  setMuted(muted: boolean): void {
    super.setMuted(muted);
    // Real WebRTC mute: disable the outgoing track itself.
    this.localStream?.getAudioTracks().forEach((t: MediaStreamTrack) => {
      t.enabled = !muted;
    });
  }

  async start(phone?: string): Promise<void> {
    vlog('[webrtc] start() called; apiKeySet=', !!this.options.apiKey, 'assistantId=', this.options.assistantId);
    if (!this.options.apiKey || !this.options.assistantId) {
      throw new Error('WebRTCAgent: apiKey/assistantId not configured');
    }
    if (this.socket) {
      vlog('[webrtc] start() ignored — socket already exists');
      return;
    }

    const token = ++this.startToken;
    const cancelled = () => token !== this.startToken;
    this.resetCallState();
    this.speakingMeter.reset();
    this.remoteLevel.reset();

    this.setStatus('connecting');
    try {
      const netState = await NetInfo.fetch();
      if (netState.isConnected === false) throw new Error('offline: no internet connection');

      vlog('[webrtc] POST call ->', this.options.apiBaseUrl, 'relay=', hasRelay(ICE_SERVERS), 'hasPhone=', !!phone);
      // The phone number is what lets the agent look the customer up before it speaks (get_user_context).
      const { conversationId } = await createVoiceSession(this.options, phone);
      if (cancelled()) return;
      this.conversationId = conversationId;
      vlog('[webrtc] REST ok conv=', conversationId);

      const localStream = await getLocalAudioStream();
      if (cancelled()) {
        localStream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        return;
      }
      this.localStream = localStream;
      if (this.muted) localStream.getAudioTracks().forEach((t: MediaStreamTrack) => { t.enabled = false; });

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS } as any);
      this.pc = pc;
      localStream.getTracks().forEach((track: MediaStreamTrack) => pc.addTrack(track, localStream));

      (pc as any).ontrack = (event: any) => {
        vlog('[webrtc] remote track received:', event?.track?.kind);
        startSpeakerRouting();
        this.startSpeakingPoll(pc);
      };
      (pc as any).onconnectionstatechange = () => {
        vlog('[webrtc] pc connectionState=', pc.connectionState);
        // A dead media path with the signalling socket still open would otherwise leave the user talking to nobody.
        if (pc.connectionState === 'failed' && this.pc === pc) {
          vlog('[webrtc] media connection failed — ending the call');
          this.teardown();
          this.emitter.emit('error', new Error('webrtc media connection failed'));
        }
      };

      const socket = new ElloSocket(this.options.wsUrl || ELLO_WEBRTC_WS_URL);
      const isCurrent = () => this.socket === socket;
      socket.onMessage(msg => { if (isCurrent()) this.handleMessage(msg); });
      socket.onClose(() => {
        if (!isCurrent()) return;
        vlog('[webrtc] WS CLOSED');
        this.teardown();
      });
      vlog('[webrtc] WS connecting ->', this.options.wsUrl || ELLO_WEBRTC_WS_URL);
      await socket.connect();
      if (cancelled()) {
        try {
          socket.send({ type: 'end-session', session_id: conversationId });
          socket.close();
        } catch {
          /* already gone */
        }
        this.teardown();
        return;
      }
      this.socket = socket;
      vlog('[webrtc] WS OPEN');

      // Candidates found before the offer is sent have no session to attach to yet (the offer creates it), and
      // they are embedded in the offer's SDP anyway, so only later ones are sent on their own. The field is
      // `session_id`, not `conversation_id`.
      let offerSent = false;
      (pc as any).onicecandidate = (event: any) => {
        if (event.candidate && offerSent) {
          this.socket?.send({ type: 'ice-candidate', session_id: conversationId, candidate: event.candidate });
        }
      };

      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false } as any);
      // react-native-webrtc still emits an m=video section; the audio-only destination rejects it (SIP 488).
      if (offer.sdp) offer.sdp = this.stripSdp(offer.sdp);
      await pc.setLocalDescription(offer as any);
      if (cancelled()) {
        this.teardown();
        return;
      }
      await waitForIceGathering(pc);
      if (cancelled()) {
        this.teardown();
        return;
      }
      const sdpToSend = pc.localDescription?.sdp || offer.sdp;

      const tools = this.registry.toWire();
      // The FULL page context, like the websocket transport's start message: a call often begins mid-step, and the
      // agent must start from what is already done. `page` must stay non-empty (the speak-first path needs it).
      const startPageContext = this.pageContextFn?.() ?? {};
      this.lastSentIdentity = identityMap(startPageContext);
      socket.send({
        type: 'offer',
        conversation_id: conversationId,
        sdp: sdpToSend,
        client_tools: tools,
        page_context: startPageContext,
      });
      vlog('[webrtc] sent offer; tools=', tools.map(t => t.name));
      offerSent = true;

      this.startStallWatch();
      this.setStatus('listening');
    } catch (e: any) {
      const message = e?.message || String(e);
      vlog('[webrtc] START FAILED:', message);
      if (message.startsWith('offline:')) reportOfflineAttempt();
      this.emitter.emit('error', e instanceof Error ? e : new Error(message));
      this.teardown();
      throw e;
    }
  }

  async stop(): Promise<void> {
    this.startToken++;
    vlog('[webrtc] stop() called; hadSocket=', !!this.socket);
    for (const controller of this.inflight.values()) controller.abort();
    this.inflight.clear();
    this.socket?.send({ type: 'end-session', session_id: this.conversationId });
    this.teardown();
  }

  protected teardown(): void {
    this.stopSpeakingPoll();
    stopSpeakerRouting();
    this.localStream?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    this.localStream = null;
    this.pc?.close();
    this.pc = null;
    super.teardown();
  }

  protected handleMessage(msg: any): void {
    switch (msg?.type) {
      // Signalling: the server's answer and later candidates. Field names follow ellomobilesdk's event enum.
      case 'offer-response':
      case 'answer': {
        vlog('[webrtc] RECV', msg.type);
        const sdp = msg.sdp ?? msg.data?.sdp;
        const pc = this.pc;
        if (sdp && pc) {
          pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp } as any))
            .then(() => vlog('[webrtc] remote description set'))
            .catch(e => vlog('[webrtc] setRemoteDescription failed:', String(e)));
        }
        return;
      }
      case 'ice-candidate':
      case 'ice-candidate-response': {
        const candidate = msg.candidate ?? msg.data?.candidate;
        const pc = this.pc;
        if (candidate && pc) {
          pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => vlog('[webrtc] addIceCandidate failed:', String(e)));
        }
        return;
      }
      case 'end-session':
        super.handleMessage({ ...msg, type: 'session-ended' });
        return;
      default:
        // Everything else (transcripts, tool calls and their ack, session end, errors) is the shared handling.
        super.handleMessage(msg);
    }
  }

  /**
   * Over WebRTC the agent's audio never passes through JS, so "is it talking?" comes from the receiver's stats.
   * The status it drives is what holds back a page-context update while the agent is mid-sentence.
   */
  private startSpeakingPoll(pc: RTCPeerConnection): void {
    this.stopSpeakingPoll();
    let logged = false;
    this.speakingPoll = setInterval(() => {
      if (this.pc !== pc) return;
      (pc as any).getStats().then((report: unknown) => {
        if (this.pc !== pc) return;
        const level = this.remoteLevel.read(report);
        if (!logged) {
          logged = true;
          vlog('[webrtc] remote audio level source:', level === null ? 'none yet' : 'ok');
        }
        if (level === null) return;
        const changed = this.speakingMeter.push(level, Date.now());
        if (changed === true && this.status === 'listening') this.setStatus('speaking');
        else if (changed === false && this.status === 'speaking' && this.inflight.size === 0) this.setStatus('listening');
      }).catch(() => { /* a failed sample is just skipped */ });
    }, SPEAKING_POLL_MS);
  }

  private stopSpeakingPoll(): void {
    if (this.speakingPoll) clearInterval(this.speakingPoll);
    this.speakingPoll = null;
    this.speakingMeter.reset();
    this.remoteLevel.reset();
  }

  // The same logic as ellomobilesdk's WebRTCService.ts: strips the video m= section (and leftover video codec
  // attributes) that react-native-webrtc includes regardless of offerToReceiveVideo.
  private stripSdp(sdp: string | undefined): string {
    if (!sdp) return '';
    return sdp
      .split(/\r\n|\r|\n/)
      .filter(line => {
        if (line.startsWith('m=video')) return false;
        if (line.includes('vp8') || line.includes('vp9') || line.includes('h264')) return false;
        return true;
      })
      .join('\r\n');
  }
}

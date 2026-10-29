import React, { useEffect, useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from './Icon';
import { colors, font } from '../theme/tokens';
import { useStore, useT } from '../state/store';
import { trackEvent } from '../api/client';
import { agent, ELLO_CONFIGURED } from '../voice';
import { markIntroPitchHeard } from '../state/session';
import { RESUME_AUTO_AGENT } from '../config/voiceFlag';

/**
 * "You left off on the website": the pop-up that offers to continue a website visitor's unfinished
 * application (see utils/resume.ts and the plan in docs/JOURNEY_RESUME_PLAN.md).
 *
 *  - `welcome` (before login, only when this install matched the visitor's own link): with the voice agent
 *      configured (and RESUME_AUTO_AGENT on) there is NO pop-up: the agent starts by itself as soon as the first
 *      screen is up, greets the person as an existing customer, says where they stopped and asks for their mobile
 *      number (the login is left empty). If it cannot start, the login opens with the number filled in instead.
 *      Without the agent, two choices: "Okay, continue" opens the login with the mobile number pre-filled;
 *      "Take help from agent" does the same and starts the voice agent, which greets by name and guides them.
 *  - `start` (after login, only a visitor who verified the OTP but never did step 1, who chose to go it alone):
 *      offers to start the application. When the agent is already on the call it asks this itself instead.
 *
 * Mounted once in App.tsx; renders nothing unless the store says a pop-up is due.
 */
const PRE_LOGIN_HIDDEN = new Set(['splash', 'privacy']);

export default function ResumePrompt() {
  const { state, set, go, showToast } = useStore();
  const t = useT();
  const { resume, resumePrompt } = state;
  const autoStarted = useRef(false);

  const live = agent.getStatus() !== 'idle' && agent.getStatus() !== 'ended';
  const visible =
    resumePrompt === 'welcome'
      ? !PRE_LOGIN_HIDDEN.has(state.screen)
      : state.screen === 'home' && !live;
  const autoAgent = RESUME_AUTO_AGENT && ELLO_CONFIGURED && resumePrompt === 'welcome';

  // A network match is only ever spoken by the agent. Without one (not configured, or the switch is off) there is
  // nothing to show, so drop it quietly and behave as for any new person.
  useEffect(() => {
    if (resumePrompt === 'welcome' && resume?.source === 'network' && !autoAgent) {
      set({ resume: null, resumePrompt: null, resumeStage: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumePrompt, resume, autoAgent]);

  // The agent opens the conversation by itself: no pop-up to tap first.
  useEffect(() => {
    if (!autoAgent || !visible || !resume || autoStarted.current) return;
    autoStarted.current = true;
    // The agent says where they stopped and asks for the number, so the login stays empty (for a network match there
    // is no number to fill anyway).
    trackEvent('funnel', 'resume_agent_auto', state.screen, { last_step: resume.lastStep, match: resume.source });
    set({ resumePrompt: null, terms: false, otpSent: false, resumeStage: 'pre_login_ask_number' });
    go('mobile');
    setTimeout(() => {
      agent.start().then(() => {
        const connected = agent.getStatus() !== 'idle' && agent.getStatus() !== 'ended';
        if (connected) {
          if (!state.introPitchHeard) {
            set({ introPitchHeard: true });
            markIntroPitchHeard();
          }
        } else if (resume.source !== 'network') {
          // Hung up while still connecting: same as a failed start, below.
          set({ mobileVal: resume.phone, resumeStage: null });
        }
      }).catch((e) => {
        // The agent could not start (offline, no microphone, busy): fall back to "Okay, continue".
        if (resume.source !== 'network') set({ mobileVal: resume.phone, resumeStage: null });
        if (!String(e?.message ?? '').startsWith('offline:')) showToast(t.voiceStartFailed);
      });
    }, 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAgent, visible, resume]);

  if (!resume || !resumePrompt) return null;
  if (!visible || autoAgent) return null;

  const close = (patch: Record<string, unknown> = {}) => set({ resumePrompt: null, ...patch });

  // A same-network match knows no number: leave the login empty (the person types their own).
  const isNetwork = resume.source === 'network';

  const prefillAndOpenLogin = (patch: Record<string, unknown> = {}) => {
    // The consent box is the person's own act: it stays unticked (the agent asks before ticking it).
    set({ resumePrompt: null, ...(isNetwork ? {} : { mobileVal: resume.phone }), terms: false, otpSent: false, ...patch });
    go('mobile');
  };

  const onContinue = () => {
    trackEvent('funnel', 'resume_continue', state.screen, { last_step: resume.lastStep });
    prefillAndOpenLogin({ resumeStage: null });
  };

  const onAgent = () => {
    trackEvent('funnel', 'resume_agent', state.screen, { last_step: resume.lastStep });
    prefillAndOpenLogin({ resumeStage: 'pre_login' });
    // Give the screen a beat to show the pre-filled login before the agent starts talking about it.
    setTimeout(() => {
      agent.start().then(() => {
        const connected = agent.getStatus() !== 'idle' && agent.getStatus() !== 'ended';
        if (connected && !state.introPitchHeard) {
          set({ introPitchHeard: true });
          markIntroPitchHeard();
        }
      }).catch((e) => {
        if (!String(e?.message ?? '').startsWith('offline:')) showToast(t.voiceStartFailed);
      });
    }, 400);
  };

  const onStart = () => {
    trackEvent('funnel', 'resume_start_application', state.screen, { last_step: resume.lastStep });
    close({ resumeStage: null });
    go('basicpan');
  };

  const onNotNow = () => {
    trackEvent('funnel', 'resume_not_now', state.screen, { last_step: resume.lastStep });
    close({ resumeStage: null });
  };

  const welcome = resumePrompt === 'welcome';
  const title = welcome ? t.resumeTitle : t.resumeStartTitle;
  const body = welcome
    ? (resume.firstName ? t.resumeBodyNamed.replace('{name}', resume.firstName) : t.resumeBody)
    : t.resumeStartBody;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={welcome ? onContinue : onNotNow}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.iconWrap}>
            <Icon name={welcome ? 'history' : 'rocket_launch'} size={28} color={colors.primary} />
          </View>
          <Text style={[font(800), styles.title]}>{title}</Text>
          <Text style={[font(500), styles.body]}>{body}</Text>
          {welcome ? (
            <>
              <Pressable
                onPress={onContinue}
                accessibilityRole="button"
                style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && { opacity: 0.85 }]}
              >
                <Text style={[font(700), styles.btnLabel, { color: '#fff' }]}>{t.resumeContinue}</Text>
              </Pressable>
              {ELLO_CONFIGURED ? (
                <Pressable
                  onPress={onAgent}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.btn, styles.btnOutline, pressed && { opacity: 0.7 }]}
                >
                  <Icon name="mic" size={20} color={colors.primary} />
                  <Text style={[font(700), styles.btnLabel, { color: colors.primary }]}>{t.resumeAgent}</Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <>
              <Pressable
                onPress={onStart}
                accessibilityRole="button"
                style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && { opacity: 0.85 }]}
              >
                <Text style={[font(700), styles.btnLabel, { color: '#fff' }]}>{t.resumeStart}</Text>
              </Pressable>
              <Pressable
                onPress={onNotNow}
                accessibilityRole="button"
                style={({ pressed }) => [styles.btn, styles.btnOutline, pressed && { opacity: 0.7 }]}
              >
                <Text style={[font(700), styles.btnLabel, { color: colors.primary }]}>{t.resumeNotNow}</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(10,30,30,0.45)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24,
  },
  sheet: { width: '100%', maxWidth: 380, backgroundColor: colors.surface, borderRadius: 24, padding: 22, gap: 12, alignItems: 'stretch' },
  iconWrap: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: colors.chip,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center',
  },
  title: { fontSize: 19, color: colors.text, textAlign: 'center', lineHeight: 25 },
  body: { fontSize: 15, color: colors.textSoft, textAlign: 'center', lineHeight: 22, marginBottom: 4 },
  btn: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  btnPrimary: { backgroundColor: colors.primary },
  btnOutline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.primary },
  btnLabel: { fontSize: 16 },
});

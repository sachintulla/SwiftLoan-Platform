import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { font } from '../theme/tokens';
import { welcomeAudioUrl, welcomeConfigured, welcomeGifUrl } from '../config/welcome';

// Jest's faked clock makes the timers spin — the rest of the app guards the same
// way (agentFx / LoginHero).
const UNDER_JEST =
  typeof process !== 'undefined' &&
  !!(process as { env?: Record<string, string | undefined> }).env?.JEST_WORKER_ID;

// The welcome is a transparent GIF of ONLY Ruby plus the matching voice-over as a
// separate audio track; played together they give a see-through talking Ruby over
// the live dashboard without any video-alpha codec. Both are served from the CDN
// (see src/config/welcome.ts) — NOT bundled in the app — and are prefetched into
// the WebView cache on first launch (WelcomePrefetch), so by the time this plays
// they load from cache. The upstream gate (isWelcomeReady) only mounts this once
// the assets are cached.
const GIF_URI = welcomeGifUrl();
const AUDIO_URI = welcomeAudioUrl();

// The clip (GIF and voice-over) is exactly 10.0 s. The safety ceiling counts from the moment
// both START together (the 'loaded' message), never from mount: the 8 MB GIF takes a few
// seconds to decode, and a mount-based clock cut the clip short.
const CLIP_MS = 10000;
const MAX_AFTER_START_MS = CLIP_MS + 2500;
// If the GIF + audio aren't both ready within this budget (cold cache / slow phone / offline),
// skip the intro rather than show a blank overlay or start late.
const REVEAL_MS = 8000;
const RISE_MS = 440;   // gentle settle-in of the layover
const SINK_MS = 760;   // …then it recedes and dissolves into the background

const { height: SCREEN_H } = Dimensions.get('window');

function buildHtml(gifUri: string, audioUri: string): string {
  // Transparent page: the GIF's transparent background lets the real dashboard
  // (behind the WebView) show through. Nothing plays until BOTH are ready: the GIF is
  // loaded + decoded off-screen and the audio can play through; then the GIF is put on
  // screen (starting at its first frame) and the audio starts in the same tick, so lips
  // and voice line up. The audio's end dismisses (the GIF is the same 10 s).
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>html,body{margin:0;height:100%;background:transparent;overflow:hidden}
/* Fade out the GIF's bottom so its baked-in nav bar / FAB pill disappear and the
   app's real bottom nav shows through cleanly (mask ends above Ruby's hands). */
img{position:fixed;inset:0;width:100%;height:100%;object-fit:contain;object-position:center bottom;
    -webkit-mask-image:linear-gradient(to bottom,#000 82%,transparent 88%);
    mask-image:linear-gradient(to bottom,#000 82%,transparent 88%)}</style>
</head><body>
<img id="g" alt="" />
<audio id="a" src="${audioUri}" preload="auto"></audio>
<script>
(function(){
  var a=document.getElementById('a');
  var g=document.getElementById('g');
  var pre=new Image();
  var imgReady=false, audReady=false, started=false;
  function post(m){try{window.ReactNativeWebView.postMessage(m);}catch(e){}}
  function start(){
    if(started||!imgReady||!audReady) return;
    started=true;
    g.src=pre.src;           // on screen now, from its first frame
    post('loaded');          // native: rise + start the clip clock
    var p=a.play();          // same tick as the GIF
    if(p&&p.catch){p.catch(function(){post('noaudio');});}
  }
  pre.onload=function(){
    var d=pre.decode?pre.decode():null;
    var go=function(){imgReady=true;start();};
    if(d&&d.then){d.then(go,go);}else{go();}
  };
  pre.onerror=function(){post('error');};
  a.addEventListener('canplaythrough',function(){audReady=true;start();});
  a.addEventListener('error',function(){audReady=true;post('noaudio');start();}); // still show Ruby
  a.addEventListener('ended',function(){post('ended');});
  pre.src='${gifUri}';
  a.load();
})();
</script>
</body></html>`;
}

type Props = { onDone: () => void };

/**
 * First-visit / replay welcome. The real dashboard stays mounted underneath (the
 * Modal is transparent, so nothing in the app's own layout changes). A transparent
 * GIF of Ruby rises up from the bottom and plays with her voice-over, then recedes
 * and dissolves into the background — handing the untouched dashboard back. A Skip
 * control and a safety timeout prevent any dead-end.
 */
export default function RubyWelcome({ onDone }: Props) {
  // One driver: 0 = off-screen below, 1 = fully risen, 2 = receded/gone.
  const anim = useRef(new Animated.Value(0)).current;
  const finished = useRef(false);
  const [gone, setGone] = useState(false);

  const html = useMemo(() => buildHtml(GIF_URI, AUDIO_URI), []);

  const finish = useRef(() => {
    if (finished.current) return;
    finished.current = true;
    if (UNDER_JEST) {
      setGone(true);
      onDone();
      return;
    }
    Animated.timing(anim, {
      toValue: 2,
      duration: SINK_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setGone(true);
      onDone();
    });
  }).current;

  // The overlay stays invisible (anim at 0) until the GIF reports it has painted,
  // so a cold-cache / offline launch never flashes a blank frame — it just skips.
  const revealed = useRef(false);
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rise = useRef(() => {
    if (revealed.current || finished.current) return;
    revealed.current = true;
    // The clip clock starts now (GIF and voice-over start together in the page).
    maxTimer.current = setTimeout(finish, MAX_AFTER_START_MS);
    Animated.timing(anim, {
      toValue: 1,
      duration: RISE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }).current;

  // 'loaded' → rise (both just started); 'ended' (audio finished) → dismiss; 'noaudio'
  // (sound refused / failed) → Ruby still plays, and we dismiss when her 10 s clip ends.
  // A load 'error' is ignored (the reveal timeout guarantees an exit).
  const onWebMessage = useRef((e: { nativeEvent: { data: string } }) => {
    const d = e.nativeEvent.data;
    if (d === 'loaded') rise();
    else if (d === 'ended') finish();
    else if (d === 'noaudio' && revealed.current) {
      if (maxTimer.current) clearTimeout(maxTimer.current);
      maxTimer.current = setTimeout(finish, CLIP_MS);
    }
  }).current;

  useEffect(() => {
    if (UNDER_JEST) return undefined;
    // Defensive: the upstream gate only mounts this when the CDN is configured.
    if (!welcomeConfigured()) { finish(); return undefined; }
    const reveal = setTimeout(() => { if (!revealed.current) finish(); }, REVEAL_MS);
    return () => { clearTimeout(reveal); if (maxTimer.current) clearTimeout(maxTimer.current); };
  }, [finish, rise]);

  if (gone) return null;

  const translateY = anim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [SCREEN_H * 0.08, 0, -SCREEN_H * 0.05],
  });
  const scale = anim.interpolate({ inputRange: [0, 1, 2], outputRange: [1.04, 1, 0.9] });
  const opacity = anim.interpolate({ inputRange: [0, 0.5, 1, 2], outputRange: [0, 1, 1, 0] });

  return (
    // A transparent Modal shows the GIF reliably full-screen. It does NOT block the
    // dashboard/tab bar on its own (a transparent iOS Modal lets touches through) —
    // that's handled by gating every nav/dashboard action on store.welcomePending
    // while the intro is active, so the GIF just needs to present and play here.
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={finish}>
      <Animated.View style={[styles.fill, { opacity, transform: [{ translateY }, { scale }] }]}>
        <WebView
          source={{ html }}
          style={styles.web}
          backgroundColor="transparent"
          opaque={false}
          originWhitelist={['*']}
          javaScriptEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowFileAccess
          allowUniversalAccessFromFileURLs
          scrollEnabled={false}
          overScrollMode="never"
          androidLayerType="hardware"
          onMessage={onWebMessage}
        />
        <Pressable style={styles.skip} onPress={finish} accessibilityLabel="Skip intro" hitSlop={10}>
          <Text style={[font(700), styles.skipText]}>Skip</Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: 'transparent' },
  web: { flex: 1, backgroundColor: 'transparent' },
  skip: {
    position: 'absolute',
    top: 54,
    right: 18,
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  skipText: { color: '#fff', fontSize: 13, letterSpacing: 0.2 },
});

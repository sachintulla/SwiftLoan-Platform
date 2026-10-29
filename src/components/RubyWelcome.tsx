import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { font } from '../theme/tokens';

// Jest's faked clock makes the timers spin — the rest of the app guards the same
// way (agentFx / LoginHero).
const UNDER_JEST =
  typeof process !== 'undefined' &&
  !!(process as { env?: Record<string, string | undefined> }).env?.JEST_WORKER_ID;

// The welcome is a transparent GIF of ONLY Ruby plus the matching voice-over as a
// separate audio track; played together they give a see-through talking Ruby over
// the live dashboard without any video-alpha codec. Both are bundled Metro assets
// (gif is a default asset type; m4a added to assetExts). In dev these resolve to
// http://localhost URLs the WebView loads directly.
const GIF = Image.resolveAssetSource(require('../../assets/video/ruby-welcome-transparent.gif'));
const AUDIO = Image.resolveAssetSource(require('../../assets/video/ruby-welcome.m4a'));

// Hard ceiling so a blocked autoplay / load failure can never trap the user
// behind the overlay. The clip is ~10s.
const MAX_MS = 12500;
const RISE_MS = 440;   // gentle settle-in of the layover
const SINK_MS = 760;   // …then it recedes and dissolves into the background

const { height: SCREEN_H } = Dimensions.get('window');

function buildHtml(gifUri: string, audioUri: string): string {
  // Transparent page: the GIF's transparent background lets the real dashboard
  // (behind the WebView) show through. The audio drives the timing — when it ends
  // we dismiss, so the GIF effectively plays once in sync with the voice-over.
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>html,body{margin:0;height:100%;background:transparent;overflow:hidden}
/* Fade out the GIF's bottom so its baked-in nav bar / FAB pill disappear and the
   app's real bottom nav shows through cleanly (mask ends above Ruby's hands). */
img{position:fixed;inset:0;width:100%;height:100%;object-fit:contain;object-position:center bottom;
    -webkit-mask-image:linear-gradient(to bottom,#000 82%,transparent 88%);
    mask-image:linear-gradient(to bottom,#000 82%,transparent 88%)}</style>
</head><body>
<img src="${gifUri}" />
<audio id="a" src="${audioUri}" autoplay preload="auto"></audio>
<script>
(function(){
  var a=document.getElementById('a');
  function post(m){try{window.ReactNativeWebView.postMessage(m);}catch(e){}}
  a.addEventListener('ended',function(){post('ended');});
  a.addEventListener('error',function(){post('error');});
  // Autoplay-with-sound can be refused on first load; retry on any tap.
  var p=a.play();
  if(p&&p.catch){p.catch(function(){document.body.addEventListener('click',function(){a.play();});});}
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

  const html = useMemo(() => buildHtml(GIF.uri, AUDIO.uri), []);

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

  useEffect(() => {
    if (UNDER_JEST) return undefined;
    Animated.timing(anim, {
      toValue: 1,
      duration: RISE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    const t = setTimeout(finish, MAX_MS);
    return () => clearTimeout(t);
  }, [anim, finish]);

  if (gone) return null;

  const translateY = anim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [SCREEN_H * 0.08, 0, -SCREEN_H * 0.05],
  });
  const scale = anim.interpolate({ inputRange: [0, 1, 2], outputRange: [1.04, 1, 0.9] });
  const opacity = anim.interpolate({ inputRange: [0, 0.5, 1, 2], outputRange: [0, 1, 1, 0] });

  return (
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
          onMessage={finish}
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

import React, { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { isWelcomeReady, markWelcomeReady, welcomeAudioUrl, welcomeConfigured, welcomeGifUrl } from '../config/welcome';

// Warms the WebView HTTP cache with the welcome GIF + voice-over on first launch,
// so the intro plays instantly (and offline) from the NEXT launch. It renders a
// 1x1 offscreen WebView that just loads the two CDN files, waits for the GIF to
// finish downloading, marks the assets ready, then unmounts. No-op once ready or
// when no CDN is configured — so the app is unaffected until WELCOME_CDN_BASE is set.
export default function WelcomePrefetch() {
  const [done, setDone] = useState(() => !welcomeConfigured() || isWelcomeReady());
  const handled = useRef(false);
  if (done) return null;

  const finish = () => {
    if (handled.current) return;
    handled.current = true;
    setDone(true);
  };

  // Load the GIF, and preload the audio, then report back once the GIF's bytes are
  // actually in cache (img.onload) rather than when the HTML document loads.
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<img id="g" src="${welcomeGifUrl()}" />
<audio src="${welcomeAudioUrl()}" preload="auto"></audio>
<script>
(function(){
  var g=document.getElementById('g');
  function post(m){try{window.ReactNativeWebView.postMessage(m);}catch(e){}}
  if(g.complete){post('ok');}
  else{g.onload=function(){post('ok');};g.onerror=function(){post('err');};}
})();
</script>
</body></html>`;

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        source={{ html }}
        originWhitelist={['*']}
        javaScriptEnabled
        cacheEnabled
        androidLayerType="software"
        onMessage={(e) => { if (e.nativeEvent.data === 'ok') { markWelcomeReady(); } finish(); }}
        onError={finish}
        onHttpError={finish}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Off-screen and invisible; it only exists to populate the cache.
  hidden: { position: 'absolute', left: -20, top: -20, width: 1, height: 1, opacity: 0 },
});

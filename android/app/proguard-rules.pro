# R8 keep rules for release builds (minifyEnabled + shrinkResources).
# React Native, Hermes, ML Kit, Firebase and the Facebook SDK ship their own consumer rules;
# the entries below cover the libraries that need explicit help. If a release build crashes
# with ClassNotFoundException / NoSuchMethodError / NoSuchFieldError, the class is missing here.

# Readable crash traces: the mapping file un-obfuscates them, keep line numbers either way.
-keepattributes SourceFile,LineNumberTable,*Annotation*,Signature,InnerClasses,EnclosingMethod
-renamesourcefileattribute SourceFile

# App's own native modules, packages, services (registered by name / from the manifest).
-keep class com.swiftloan.** { *; }

# WebRTC (voice agent): org.webrtc is called back from native code (JNI) by name.
-keep class org.webrtc.** { *; }
-dontwarn org.webrtc.**
-keep class com.oney.WebRTCModule.** { *; }
-keep class com.zxcpoiu.incallmanager.** { *; }

# Upshot SDK (push, in-app, events) uses reflection and its own JSON models.
-keep class com.brandkinesis.** { *; }
-dontwarn com.brandkinesis.**
-keep class com.upshotreactnative.** { *; }
-dontwarn com.upshotreactnative.**

# Glide (pulled in for Upshot's in-app screens).
-keep public class * implements com.bumptech.glide.module.GlideModule
-keep class * extends com.bumptech.glide.module.AppGlideModule { <init>(...); }
-keep public enum com.bumptech.glide.load.ImageHeaderParser$** {
  **[] $VALUES;
  public *;
}
-keep class com.bumptech.glide.load.data.ParcelFileDescriptorRewinder$InternalRewinder {
  *** rewind();
}

# WorkManager instantiates workers by class name.
-keep class * extends androidx.work.ListenableWorker { <init>(...); }

# Nitro modules (react-native-nitro-sound / nitro-modules): HybridObjects are created from C++.
-keep class com.margelo.nitro.** { *; }
-keep class com.facebook.jni.** { *; }
-dontwarn com.margelo.nitro.**

# WebView / vector icons / image picker / svg / gradient: react modules found by @ReactModule.
-keep class com.reactnativecommunity.webview.** { *; }
-keep class com.imagepicker.** { *; }
-keep class com.horcrux.svg.** { *; }
-keep class com.BV.LinearGradient.** { *; }

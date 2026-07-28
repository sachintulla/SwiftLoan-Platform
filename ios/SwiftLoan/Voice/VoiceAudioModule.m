#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

// Objective-C bridge for the Swift VoiceAudioModule — classic (non-Turbo)
// native module export, resolved at runtime against the @objc(VoiceAudioModule)
// Swift class of the same name.
@interface RCT_EXTERN_MODULE(VoiceAudioModule, RCTEventEmitter)

RCT_EXTERN_METHOD(requestMicPermission:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(startCapture:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(stopCapture)
RCT_EXTERN_METHOD(playChunk:(NSString *)base64)
RCT_EXTERN_METHOD(purgePlayback)

@end

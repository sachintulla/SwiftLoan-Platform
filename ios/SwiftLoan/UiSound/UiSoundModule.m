#import <React/RCTBridgeModule.h>

// Objective-C bridge for the Swift UiSoundModule — classic native module export. Exposed to JS as
// `UiSound` (the same name the Android module uses), not `UiSoundModule`.
@interface RCT_EXTERN_REMAP_MODULE(UiSound, UiSoundModule, NSObject)

RCT_EXTERN_METHOD(load:(NSString *)name base64Wav:(NSString *)base64Wav)
RCT_EXTERN_METHOD(play:(NSString *)name volume:(double)volume)

@end

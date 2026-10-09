#import <React/RCTBridgeModule.h>

// Objective-C bridge for the Swift AttributionModule. Exposed to JS as `Attribution`.
@interface RCT_EXTERN_REMAP_MODULE(Attribution, AttributionModule, NSObject)

RCT_EXTERN_METHOD(readClipboardToken:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)

@end

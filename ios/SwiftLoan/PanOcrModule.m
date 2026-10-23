#import <React/RCTBridgeModule.h>

// Objective-C bridge for the Swift PanOcrModule — classic (non-Turbo) native
// module export, resolved at runtime against the @objc(PanOcrModule) Swift class.
@interface RCT_EXTERN_MODULE(PanOcrModule, NSObject)

RCT_EXTERN_METHOD(recognize:(NSString *)path
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end

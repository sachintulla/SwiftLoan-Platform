#import <React/RCTBridgeModule.h>
#import <Foundation/Foundation.h>
#import <objc/message.h>

// Logs one named funnel event to Firebase Analytics (src/analytics/firebase.ts). Names only, never
// parameters. Exposed to JS as `SwiftLoanFirebase`.
//
// Firebase is looked up at RUNTIME (NSClassFromString), so this file compiles and the app builds
// with or without the Firebase pod; with no pod, or no GoogleService-Info.plist in the bundle, it
// does nothing. To turn it on: add `pod 'FirebaseAnalytics'` to the Podfile, `pod install`, and add
// GoogleService-Info.plist (Firebase project swiftloan-ai, bundle ai.swiftloan.app) to the app target.
@interface SwiftLoanFirebase : NSObject <RCTBridgeModule>
@end

@implementation SwiftLoanFirebase

RCT_EXPORT_MODULE(SwiftLoanFirebase)

+ (BOOL)requiresMainQueueSetup { return NO; }

static BOOL ready(void) {
  static dispatch_once_t once;
  static BOOL ok = NO;
  dispatch_once(&once, ^{
    @try {
      Class app = NSClassFromString(@"FIRApp");
      if (!app || ![[NSBundle mainBundle] pathForResource:@"GoogleService-Info" ofType:@"plist"]) return;
      SEL def = NSSelectorFromString(@"defaultApp");
      if (![app respondsToSelector:def] || ![app performSelector:def]) {
        SEL configure = NSSelectorFromString(@"configure");
        if (![app respondsToSelector:configure]) return;
        [app performSelector:configure];
      }
      ok = NSClassFromString(@"FIRAnalytics") != nil;
    } @catch (NSException *e) { ok = NO; }
  });
  return ok;
}

RCT_EXPORT_METHOD(logEvent:(NSString *)name) {
  @try {
    if (!ready()) return;
    Class analytics = NSClassFromString(@"FIRAnalytics");
    SEL sel = NSSelectorFromString(@"logEventWithName:parameters:");
    if (![analytics respondsToSelector:sel]) return;
    ((void (*)(id, SEL, NSString *, NSDictionary *))objc_msgSend)(analytics, sel, name, nil);
  } @catch (NSException *e) {}
}

@end

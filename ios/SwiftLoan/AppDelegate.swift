import UIKit
import UserNotifications
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  /// What the app was launched with, kept for React Native (`Linking.getInitialURL` reads the link from here).
  private var launchOptions: [UIApplication.LaunchOptionsKey: Any]?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    self.launchOptions = launchOptions

    // The window is created by SceneDelegate (UIScene life cycle), which then calls startReactNative(in:).
    // Apps built with the iOS 27 SDK do not launch without the scene life cycle (Apple TN3187).
    return true
  }

  // MARK: - UIScene life cycle

  func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let config = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    config.delegateClass = SceneDelegate.self
    return config
  }

  /// Called once by SceneDelegate with the scene's window: mounts React Native in it.
  /// `launchURL` is the link that cold-started the app, if any (with scenes it arrives on the scene, not in launchOptions).
  func startReactNative(in window: UIWindow, launchURL: URL?) {
    guard let factory = reactNativeFactory, self.window == nil else { return }
    self.window = window

    var options = launchOptions ?? [:]
    if let launchURL = launchURL, options[.url] == nil { options[.url] = launchURL }

    factory.startReactNative(
      withModuleName: "SwiftLoan",
      in: window,
      launchOptions: options
    )

    // Match the launch screen + JS splash gradient's deep-teal top so there's no
    // flash of a different colour while the React Native bundle loads — the gap
    // between the launch screen and the JS splash reads as the same deep teal.
    // Green to match the logo tile / SPLASH_BG top (#10B6A3), so the launch → JS
    // splash reads as one continuous green with only the ₹ mark showing.
    let brandTeal = UIColor(red: 0.063, green: 0.714, blue: 0.639, alpha: 1.0)
    window.backgroundColor = brandTeal
    window.rootViewController?.view.backgroundColor = brandTeal

    // Continuity cover: while RN loads its bundle (and renders the first JS
    // frame) the root view would otherwise show a bare background — in debug
    // Metro even draws a "Downloading…" bar there. Overlay a view identical to
    // the launch screen (deep-teal + the lines-less ₹ mark) so that gap looks
    // exactly like the launch/splash, then fade it out the moment JS content
    // appears — making splash → JS splash one continuous animation.
    installLaunchCover(background: brandTeal)
  }

  /// Hand an opened link to React Native's Linking module (see "Deep links" below).
  func forwardOpenedURL(_ url: URL) {
    NotificationCenter.default.post(
      name: Notification.Name("RCTOpenURLNotification"),
      object: self,
      userInfo: ["url": url.absoluteString]
    )
  }

  // MARK: - Deep links (swiftloan://<screen>)
  //
  // The `swiftloan` scheme is registered in Info.plist; this hands an opened link to React Native's
  // Linking module (JS: Linking.addEventListener('url') in src/state/store.ts). It posts the same
  // notification RCTLinkingManager.application(_:open:options:) does — RN's Linking listens for
  // "RCTOpenURLNotification" with a { url: String } payload — without needing a React header in
  // Swift. A link that cold-starts the app is picked up through launchOptions (Linking.getInitialURL).
  func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    forwardOpenedURL(url)
    return true
  }

  // MARK: - Upshot push (APNs)
  //
  // The Upshot React Native module registers for remote notifications when JS calls
  // registerForPush (Permissions screen) and sets this delegate on the notification
  // center — but the app delegate has to hand the APNs token and tapped payloads
  // back to it. UpshotUtility is looked up by name at runtime so this compiles and
  // does nothing in builds where the Upshot pods are not linked (e.g. the
  // arm64 simulator).

  private func upshotUtility() -> NSObject? {
    guard let cls = NSClassFromString("UpshotUtility") as? NSObject.Type else { return nil }
    return cls.perform(NSSelectorFromString("sharedUtility"))?.takeUnretainedValue() as? NSObject
  }

  func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    _ = upshotUtility()?.perform(NSSelectorFromString("applicationDidRegisterWithDeviceToken:"), with: deviceToken as NSData)
  }

  func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    NSLog("[SwiftLoanPush] APNs registration failed: %@", error.localizedDescription)
  }

  /// Show the banner even while the app is open (Upshot campaigns are meant to be seen).
  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    if #available(iOS 14.0, *) {
      completionHandler([.banner, .list, .sound, .badge])
    } else {
      completionHandler([.alert, .sound, .badge])
    }
  }

  /// The user tapped a notification: let Upshot record the click and run its action.
  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    let userInfo = response.notification.request.content.userInfo
    _ = upshotUtility()?.perform(NSSelectorFromString("didReceivePushNotifcationWithResponse:"), with: userInfo as NSDictionary)
    completionHandler()
  }

  private func installLaunchCover(background: UIColor) {
    guard let window = window else { return }
    let cover = UIView(frame: window.bounds)
    cover.backgroundColor = background
    cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]

    // Lines-less ₹ mark only — matches the launch screen + the JS splash's first
    // frame, so the launch → gap → splash flows straight into the line-assembly
    // animation (wordmark/tagline reveal on the JS splash, not here).
    let logo = UIImageView(image: UIImage(named: "SplashLogo"))
    logo.contentMode = .scaleAspectFit
    logo.translatesAutoresizingMaskIntoConstraints = false
    cover.addSubview(logo)

    NSLayoutConstraint.activate([
      logo.centerXAnchor.constraint(equalTo: cover.centerXAnchor),
      // -80 matches the launch storyboard + JS splash logo position.
      logo.centerYAnchor.constraint(equalTo: cover.centerYAnchor, constant: -80),
      logo.widthAnchor.constraint(equalToConstant: 128),
      logo.heightAnchor.constraint(equalToConstant: 128),
    ])
    window.addSubview(cover)

    // Fade the cover out once RN has painted its first frame (the JS splash,
    // which is visually identical here), so the hand-off is invisible.
    var token: NSObjectProtocol?
    token = NotificationCenter.default.addObserver(
      forName: NSNotification.Name("RCTContentDidAppearNotification"),
      object: nil, queue: .main
    ) { _ in
      if let token = token { NotificationCenter.default.removeObserver(token) }
      UIView.animate(withDuration: 0.28, animations: { cover.alpha = 0 }) { _ in
        cover.removeFromSuperview()
      }
    }
  }
}

/// The app's one window scene. iOS creates it at launch; the window lives here and React Native is mounted in it.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let app = UIApplication.shared.delegate as? AppDelegate else { return }
    let window = UIWindow(windowScene: windowScene)
    self.window = window
    app.startReactNative(in: window, launchURL: connectionOptions.urlContexts.first?.url)
  }

  /// A link opened while the app is already running (with scenes, application(_:open:options:) is not called).
  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let app = UIApplication.shared.delegate as? AppDelegate else { return }
    for context in URLContexts { app.forwardOpenedURL(context.url) }
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}

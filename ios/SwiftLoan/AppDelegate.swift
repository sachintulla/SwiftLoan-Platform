import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "SwiftLoan",
      in: window,
      launchOptions: launchOptions
    )

    // Match the launch screen + JS splash gradient's deep-teal top so there's no
    // flash of a different colour while the React Native bundle loads — the gap
    // between the launch screen and the JS splash reads as the same deep teal.
    // Green to match the logo tile / SPLASH_BG top (#10B6A3), so the launch → JS
    // splash reads as one continuous green with only the ₹ mark showing.
    let brandTeal = UIColor(red: 0.063, green: 0.714, blue: 0.639, alpha: 1.0)
    window?.backgroundColor = brandTeal
    window?.rootViewController?.view.backgroundColor = brandTeal

    // Continuity cover: while RN loads its bundle (and renders the first JS
    // frame) the root view would otherwise show a bare background — in debug
    // Metro even draws a "Downloading…" bar there. Overlay a view identical to
    // the launch screen (deep-teal + the lines-less ₹ mark) so that gap looks
    // exactly like the launch/splash, then fade it out the moment JS content
    // appears — making splash → JS splash one continuous animation.
    installLaunchCover(background: brandTeal)

    return true
  }

  private func installLaunchCover(background: UIColor) {
    guard let window = window else { return }
    let cover = UIView(frame: window.bounds)
    cover.backgroundColor = background
    cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]

    let logo = UIImageView(image: UIImage(named: "SplashLogo"))
    logo.contentMode = .scaleAspectFit
    logo.translatesAutoresizingMaskIntoConstraints = false
    cover.addSubview(logo)

    // Full branding on the cover too, so the launch → gap → JS splash all show the
    // same complete lockup (mark + wordmark + tagline), not a bare mark.
    let wordmark = UILabel()
    wordmark.text = "SwiftLoan"
    wordmark.font = .boldSystemFont(ofSize: 42)
    wordmark.textColor = .white
    wordmark.textAlignment = .center
    wordmark.translatesAutoresizingMaskIntoConstraints = false
    cover.addSubview(wordmark)

    let tagline = UILabel()
    tagline.text = "FAST · FAIR · SECURE"
    tagline.font = .systemFont(ofSize: 12, weight: .semibold)
    tagline.textColor = UIColor(red: 0.874, green: 0.965, blue: 0.925, alpha: 1.0)
    tagline.textAlignment = .center
    tagline.translatesAutoresizingMaskIntoConstraints = false
    cover.addSubview(tagline)

    NSLayoutConstraint.activate([
      logo.centerXAnchor.constraint(equalTo: cover.centerXAnchor),
      // -80 matches the launch storyboard + JS splash logo position.
      logo.centerYAnchor.constraint(equalTo: cover.centerYAnchor, constant: -80),
      logo.widthAnchor.constraint(equalToConstant: 128),
      logo.heightAnchor.constraint(equalToConstant: 128),
      wordmark.topAnchor.constraint(equalTo: logo.bottomAnchor, constant: 24),
      wordmark.leadingAnchor.constraint(equalTo: cover.leadingAnchor),
      wordmark.trailingAnchor.constraint(equalTo: cover.trailingAnchor),
      tagline.topAnchor.constraint(equalTo: wordmark.bottomAnchor, constant: 10),
      tagline.leadingAnchor.constraint(equalTo: cover.leadingAnchor),
      tagline.trailingAnchor.constraint(equalTo: cover.trailingAnchor),
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

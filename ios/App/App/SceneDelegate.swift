import UIKit
import Capacitor
import WebKit

class MainViewController: CAPBridgeViewController {
    private var isFallbackLoaded = false

    override func viewDidLoad() {
        super.viewDidLoad()
        self.view.backgroundColor = UIColor(red: 8/255, green: 9/255, blue: 13/255, alpha: 1.0)
        self.webView?.backgroundColor = UIColor(red: 8/255, green: 9/255, blue: 13/255, alpha: 1.0)
        self.webView?.isOpaque = false
        self.webView?.scrollView.backgroundColor = UIColor(red: 8/255, green: 9/255, blue: 13/255, alpha: 1.0)
    }

    override func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        super.webView(webView, didFailProvisionalNavigation: navigation, withError: error)
        handleOfflineNavigation(webView: webView, error: error)
    }

    override func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        super.webView(webView, didFail: navigation, withError: error)
        handleOfflineNavigation(webView: webView, error: error)
    }

    private func handleOfflineNavigation(webView: WKWebView, error: Error) {
        let nsError = error as NSError
        print("[AuraMusic iOS] Navigation failed: domain=\(nsError.domain), code=\(nsError.code): \(nsError.localizedDescription)")

        let offlineCodes = [
            NSURLErrorNotConnectedToInternet, // -1009
            NSURLErrorCannotFindHost,         // -1003
            NSURLErrorTimedOut,               // -1001
            NSURLErrorCannotConnectToHost,    // -1004
            NSURLErrorNetworkConnectionLost,  // -1005
            NSURLErrorDNSLookupFailed         // -1006
        ]

        if nsError.domain == NSURLErrorDomain && offlineCodes.contains(nsError.code) {
            loadOfflineFallback(webView: webView)
        }
    }

    private func loadOfflineFallback(webView: WKWebView) {
        guard !isFallbackLoaded else { return }
        isFallbackLoaded = true
        print("[AuraMusic iOS] Device is offline. Loading offline library with origin https://aura-musiic.vercel.app...")

        let originUrl = URL(string: "https://aura-musiic.vercel.app")!

        if let path = Bundle.main.path(forResource: "public/offline", ofType: "html") ??
                      Bundle.main.path(forResource: "public/index", ofType: "html") ??
                      Bundle.main.path(forResource: "offline", ofType: "html") ??
                      Bundle.main.path(forResource: "index", ofType: "html"),
           let fileHtml = try? String(contentsOfFile: path, encoding: .utf8), !fileHtml.isEmpty {
            webView.loadHTMLString(fileHtml, baseURL: originUrl)
            return
        }

        webView.loadHTMLString(OfflineAppHTML.content, baseURL: originUrl)
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = MainViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

enum OfflineAppHTML {
    static let content = #"""
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
    <title>Aura Music — مكتبة الأوفلاين</title>
    <meta name="theme-color" content="#08090d" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <style>
      :root {
        --bg: #08090d;
        --surface: #10121a;
        --surface-hover: #171a26;
        --surface-card: rgba(22, 25, 38, 0.7);
        --border: rgba(255, 255, 255, 0.08);
        --primary: #6366f1;
        --primary-glow: rgba(99, 102, 241, 0.35);
        --accent: #06b6d4;
        --text: #f8fafc;
        --text-sub: #94a3b8;
      }
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        -webkit-tap-highlight-color: transparent;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", sans-serif;
        background-color: var(--bg);
        color: var(--text);
        min-height: 100vh;
        min-height: -webkit-fill-available;
        display: flex;
        flex-direction: column;
        overflow-x: hidden;
        padding-top: max(16px, env(safe-area-inset-top));
        padding-bottom: calc(140px + env(safe-area-inset-bottom));
      }
      /* Ambient subtle background glow */
      .ambient-glow {
        position: fixed;
        top: -100px;
        right: -100px;
        width: 320px;
        height: 320px;
        background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%);
        pointer-events: none;
        z-index: 0;
      }
      .ambient-glow-2 {
        position: fixed;
        bottom: 100px;
        left: -100px;
        width: 350px;
        height: 350px;
        background: radial-gradient(circle, rgba(6, 182, 212, 0.1) 0%, transparent 70%);
        pointer-events: none;
        z-index: 0;
      }

      header {
        position: sticky;
        top: 0;
        z-index: 20;
        background: rgba(8, 9, 13, 0.88);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        padding: 12px 16px;
        border-bottom: 1px solid var(--border);
      }
      .header-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .brand-icon {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        background: linear-gradient(135deg, #6366f1, #06b6d4);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        box-shadow: 0 4px 16px var(--primary-glow);
      }
      .brand-name {
        font-size: 19px;
        font-weight: 900;
        letter-spacing: 0.5px;
        background: linear-gradient(to right, #818cf8, #22d3ee);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .offline-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        background: rgba(245, 158, 11, 0.15);
        border: 1px solid rgba(245, 158, 11, 0.3);
        color: #fbbf24;
        font-size: 11px;
        font-weight: 700;
        padding: 3px 8px;
        border-radius: 20px;
      }
      .reconnect-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid var(--border);
        color: #e2e8f0;
        font-size: 12px;
        font-weight: 700;
        padding: 7px 12px;
        border-radius: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        transition: all 0.2s ease;
      }
      .reconnect-btn:active {
        transform: scale(0.95);
        background: rgba(255, 255, 255, 0.15);
      }

      .container {
        position: relative;
        z-index: 1;
        padding: 16px;
        max-width: 900px;
        margin: 0 auto;
        width: 100%;
      }

      .stats-bar {
        background: var(--surface-card);
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 12px 16px;
        margin-bottom: 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 12px;
        color: var(--text-sub);
      }
      .stats-badge {
        color: #38bdf8;
        font-weight: 700;
      }

      /* Search */
      .search-wrapper {
        position: relative;
        margin-bottom: 16px;
      }
      .search-input {
        width: 100%;
        background: rgba(16, 18, 26, 0.95);
        border: 1px solid var(--border);
        color: var(--text);
        padding: 12px 42px 12px 16px;
        border-radius: 16px;
        font-size: 14px;
        outline: none;
        transition: border-color 0.2s ease, box-shadow 0.2s ease;
      }
      .search-input:focus {
        border-color: #6366f1;
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
      }
      .search-icon {
        position: absolute;
        right: 14px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--text-sub);
        font-size: 15px;
        pointer-events: none;
      }

      /* Filter Tabs */
      .tabs {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        padding-bottom: 8px;
        margin-bottom: 16px;
        scrollbar-width: none;
      }
      .tabs::-webkit-scrollbar { display: none; }
      .tab-btn {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid var(--border);
        color: var(--text-sub);
        font-size: 12px;
        font-weight: 700;
        padding: 7px 14px;
        border-radius: 12px;
        cursor: pointer;
        white-space: nowrap;
        transition: all 0.2s ease;
      }
      .tab-btn.active {
        background: linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(6, 182, 212, 0.2));
        color: #fff;
        border-color: rgba(99, 102, 241, 0.5);
      }

      /* Song List */
      .song-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .song-card {
        background: var(--surface-card);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 10px 14px;
        display: flex;
        align-items: center;
        gap: 12px;
        cursor: pointer;
        transition: background-color 0.15s ease, transform 0.15s ease;
      }
      .song-card:hover {
        background: var(--surface-hover);
      }
      .song-card:active {
        transform: scale(0.985);
      }
      .song-card.playing {
        background: linear-gradient(90deg, rgba(99, 102, 241, 0.2), rgba(6, 182, 212, 0.1));
        border-color: rgba(99, 102, 241, 0.4);
      }
      .song-cover {
        width: 48px;
        height: 48px;
        border-radius: 12px;
        background: #1e2230;
        object-fit: cover;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        overflow: hidden;
      }
      .song-cover img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .song-info {
        flex: 1;
        min-width: 0;
      }
      .song-title {
        font-size: 14px;
        font-weight: 700;
        color: #fff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: 3px;
      }
      .song-artist {
        font-size: 12px;
        color: var(--text-sub);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .song-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .play-icon-btn {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        background: rgba(99, 102, 241, 0.2);
        border: 1px solid rgba(99, 102, 241, 0.4);
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
        cursor: pointer;
        flex-shrink: 0;
        transition: all 0.15s ease;
      }
      .play-icon-btn:hover {
        background: #6366f1;
        transform: scale(1.05);
      }
      .delete-btn {
        background: transparent;
        border: none;
        color: #64748b;
        padding: 6px;
        cursor: pointer;
        border-radius: 8px;
        font-size: 14px;
      }
      .delete-btn:hover {
        color: #f87171;
        background: rgba(239, 68, 68, 0.1);
      }

      /* Empty State */
      .empty-box {
        text-align: center;
        padding: 48px 20px;
        background: var(--surface-card);
        border: 1px dashed var(--border);
        border-radius: 24px;
        margin-top: 20px;
      }
      .empty-icon {
        font-size: 48px;
        margin-bottom: 12px;
      }
      .empty-title {
        font-size: 18px;
        font-weight: 800;
        margin-bottom: 8px;
      }
      .empty-desc {
        color: var(--text-sub);
        font-size: 13px;
        max-width: 320px;
        margin: 0 auto;
        line-height: 1.5;
      }

      /* Floating Mini Player Bar */
      .mini-player {
        position: fixed;
        left: 12px;
        right: 12px;
        bottom: max(16px, env(safe-area-inset-bottom));
        background: rgba(18, 20, 29, 0.95);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 20px;
        padding: 10px 14px;
        display: flex;
        align-items: center;
        gap: 12px;
        z-index: 50;
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.65);
        cursor: pointer;
        transition: transform 0.2s ease, opacity 0.2s ease;
      }
      .mini-player.hidden {
        display: none;
      }
      .mini-cover {
        width: 44px;
        height: 44px;
        border-radius: 12px;
        object-fit: cover;
        background: #1e2230;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        flex-shrink: 0;
        overflow: hidden;
      }
      .mini-cover img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .mini-info {
        flex: 1;
        min-width: 0;
      }
      .mini-title {
        font-size: 13px;
        font-weight: 700;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: #fff;
      }
      .mini-artist {
        font-size: 11px;
        color: var(--text-sub);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .mini-controls {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .mini-btn {
        background: transparent;
        border: none;
        color: #e2e8f0;
        cursor: pointer;
        padding: 6px;
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .mini-play-btn {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        background: #fff;
        color: #000;
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
        font-weight: bold;
      }
      .mini-progress {
        position: absolute;
        bottom: 0;
        left: 14px;
        right: 14px;
        height: 2px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 2px;
        overflow: hidden;
      }
      .mini-progress-fill {
        height: 100%;
        width: 0%;
        background: linear-gradient(to right, #6366f1, #06b6d4);
        transition: width 0.2s linear;
      }

      /* Full Screen Player Modal */
      .full-modal {
        position: fixed;
        inset: 0;
        background: #08090d;
        z-index: 100;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: max(20px, env(safe-area-inset-top)) 24px max(28px, env(safe-area-inset-bottom));
        transform: translateY(100%);
        transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        overflow-y: auto;
      }
      .full-modal.open {
        transform: translateY(0);
      }
      .full-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .down-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid var(--border);
        color: #fff;
        width: 38px;
        height: 38px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        cursor: pointer;
      }
      .full-artwork-box {
        width: 100%;
        max-width: 320px;
        aspect-ratio: 1;
        margin: 20px auto;
        border-radius: 24px;
        background: #181b28;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8), 0 0 40px var(--primary-glow);
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 64px;
      }
      .full-artwork-box img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .full-info {
        text-align: center;
        margin-bottom: 24px;
      }
      .full-title {
        font-size: 20px;
        font-weight: 900;
        margin-bottom: 6px;
        color: #fff;
      }
      .full-artist {
        font-size: 15px;
        color: var(--text-sub);
      }
      .scrub-container {
        margin-bottom: 24px;
      }
      .scrub-bar {
        width: 100%;
        -webkit-appearance: none;
        height: 4px;
        border-radius: 2px;
        background: rgba(255, 255, 255, 0.15);
        outline: none;
        cursor: pointer;
      }
      .scrub-bar::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #fff;
        cursor: pointer;
        box-shadow: 0 0 10px rgba(255, 255, 255, 0.8);
      }
      .time-row {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        color: var(--text-sub);
        margin-top: 6px;
        direction: ltr;
      }
      .full-controls {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 20px;
        margin-bottom: 20px;
      }
      .full-ctrl-btn {
        background: transparent;
        border: none;
        color: #e2e8f0;
        font-size: 22px;
        cursor: pointer;
        padding: 8px;
        border-radius: 50%;
      }
      .full-play-btn {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: linear-gradient(135deg, #6366f1, #06b6d4);
        color: #fff;
        border: none;
        font-size: 24px;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 8px 24px var(--primary-glow);
        cursor: pointer;
      }
      .full-play-btn:active {
        transform: scale(0.92);
      }

      /* Online toast */
      .toast-banner {
        position: fixed;
        top: max(20px, env(safe-area-inset-top));
        left: 16px;
        right: 16px;
        background: linear-gradient(135deg, #10b981, #059669);
        color: #fff;
        padding: 12px 16px;
        border-radius: 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
        z-index: 200;
        transform: translateY(-150%);
        transition: transform 0.3s ease;
      }
      .toast-banner.show {
        transform: translateY(0);
      }
      .toast-banner button {
        background: #fff;
        color: #065f46;
        border: none;
        font-weight: 800;
        padding: 6px 14px;
        border-radius: 10px;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <div class="ambient-glow"></div>
    <div class="ambient-glow-2"></div>

    <header>
      <div class="header-row">
        <div class="brand">
          <div class="brand-icon">🎵</div>
          <div>
            <div class="brand-name">AURA MUSIC</div>
            <div class="offline-badge">
              <span>●</span> مكتبة الأوفلاين
            </div>
          </div>
        </div>
        <button class="reconnect-btn" id="reconnectBtn" onclick="checkNetworkAndReload()">
          <span id="reconnectIcon">🔄</span>
          <span>الاتصال بالإنترنت</span>
        </button>
      </div>
    </header>

    <main class="container">
      <div class="stats-bar">
        <span>الأغاني المحفوظة محلياً على جهازك:</span>
        <span class="stats-badge" id="statsCount">جاري التحميل...</span>
      </div>

      <div class="search-wrapper">
        <span class="search-icon">🔍</span>
        <input
          type="text"
          id="searchInput"
          class="search-input"
          placeholder="ابحث في أغانيك المحفوظة (اسم الأغنية، الفنان)..."
          oninput="handleSearch(this.value)"
        />
      </div>

      <div class="tabs">
        <button class="tab-btn active" onclick="switchTab('all', this)">كل الأغاني</button>
        <button class="tab-btn" onclick="switchTab('artists', this)">حسب الفنان</button>
        <button class="tab-btn" onclick="switchTab('albums', this)">الألبومات</button>
      </div>

      <div id="contentArea">
        <div class="song-list" id="songsContainer"></div>
      </div>
    </main>

    <!-- Mini Player Bar -->
    <div class="mini-player hidden" id="miniPlayer" onclick="openFullPlayer()">
      <div class="mini-cover" id="miniCover">🎵</div>
      <div class="mini-info">
        <div class="mini-title" id="miniTitle">—</div>
        <div class="mini-artist" id="miniArtist">—</div>
      </div>
      <div class="mini-controls" onclick="event.stopPropagation()">
        <button class="mini-btn" onclick="playPrev()" title="السابق">⏮</button>
        <button class="mini-play-btn" id="miniPlayBtn" onclick="togglePlay()" title="تشغيل / إيقاف">▶</button>
        <button class="mini-btn" onclick="playNext()" title="التالي">⏭</button>
        <button class="mini-btn" onclick="closePlayer()" title="إغلاق">✕</button>
      </div>
      <div class="mini-progress">
        <div class="mini-progress-fill" id="miniProgressFill"></div>
      </div>
    </div>

    <!-- Full Player Modal -->
    <div class="full-modal" id="fullModal">
      <div class="full-top">
        <button class="down-btn" onclick="closeFullPlayer()" title="تصغير">▼</button>
        <div style="font-size: 13px; font-weight: 700; color: var(--text-sub);">قيد التشغيل من مكتبتك</div>
        <button class="down-btn" onclick="closePlayer()" title="إغلاق المشغل">✕</button>
      </div>

      <div class="full-artwork-box" id="fullArtwork">🎵</div>

      <div class="full-info">
        <div class="full-title" id="fullTitle">—</div>
        <div class="full-artist" id="fullArtist">—</div>
      </div>

      <div class="scrub-container">
        <input
          type="range"
          id="scrubBar"
          class="scrub-bar"
          min="0"
          max="100"
          value="0"
          step="0.1"
          oninput="handleSeek(this.value)"
        />
        <div class="time-row">
          <span id="curTime">0:00</span>
          <span id="totalTime">0:00</span>
        </div>
      </div>

      <div class="full-controls">
        <button class="full-ctrl-btn" id="shuffleBtn" onclick="toggleShuffle()" title="خلط">🔀</button>
        <button class="full-ctrl-btn" onclick="playPrev()" title="السابق" style="font-size: 26px;">⏮</button>
        <button class="full-play-btn" id="fullPlayBtn" onclick="togglePlay()" title="تشغيل / إيقاف">▶</button>
        <button class="full-ctrl-btn" onclick="playNext()" title="التالي" style="font-size: 26px;">⏭</button>
        <button class="full-ctrl-btn" id="loopBtn" onclick="toggleLoop()" title="تكرار">🔁</button>
      </div>
    </div>

    <!-- Online Toast Notification -->
    <div class="toast-banner" id="onlineToast">
      <div>
        <div style="font-weight: 900; font-size: 14px;">🌐 عاد الاتصال بالإنترنت!</div>
        <div style="font-size: 12px; opacity: 0.9;">يمكنك الآن استخدام التطبيق أونلاين.</div>
      </div>
      <button onclick="window.location.href='https://aura-musiic.vercel.app'">فتح الآن 🚀</button>
    </div>

    <audio id="nativeAudio" preload="auto" playsinline></audio>

    <script>
      // ── Database Configuration ─────────────────────────────────────
      const DB_NAME = "music-web-offline";
      const DB_VERSION = 6;
      const META_STORE = "saved-songs";
      const AUDIO_STORE = "audio";

      let allSongs = [];
      let currentQueue = [];
      let currentIndex = -1;
      let isPlaying = false;
      let activeBlobUrl = null;
      let currentTab = "all";
      let isShuffle = false;
      let isLoop = false;

      const audio = document.getElementById("nativeAudio");

      // ── Open IndexedDB ──────────────────────────────────────────────
      function openDb() {
        return new Promise((resolve, reject) => {
          const req = indexedDB.open(DB_NAME, DB_VERSION);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(META_STORE)) {
              db.createObjectStore(META_STORE, { keyPath: "songId" });
            }
            if (!db.objectStoreNames.contains(AUDIO_STORE)) {
              db.createObjectStore(AUDIO_STORE, { keyPath: "songId" });
            }
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      }

      // ── Fetch Audio Blob ────────────────────────────────────────────
      async function getAudioBlob(songId) {
        try {
          const db = await openDb();
          return new Promise((resolve) => {
            const tx = db.transaction(AUDIO_STORE, "readonly");
            const req = tx.objectStore(AUDIO_STORE).get(songId);
            req.onsuccess = () => {
              const rec = req.result;
              if (!rec) return resolve(null);
              if (rec.buffer instanceof ArrayBuffer) {
                return resolve(new Blob([rec.buffer], { type: rec.mimeType || "audio/mp4" }));
              }
              if (rec.blob instanceof Blob) {
                return resolve(rec.blob);
              }
              resolve(null);
            };
            req.onerror = () => resolve(null);
          });
        } catch (e) {
          console.error("Error reading audio blob:", e);
          return null;
        }
      }

      // ── Load All Songs ──────────────────────────────────────────────
      async function loadLibrary() {
        try {
          const db = await openDb();
          const songs = await new Promise((resolve) => {
            const tx = db.transaction(META_STORE, "readonly");
            const req = tx.objectStore(META_STORE).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
          });

          // Sort recent first
          allSongs = songs.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
          currentQueue = [...allSongs];

          const statsCount = document.getElementById("statsCount");
          const readyCount = allSongs.filter(s => s.audioReady).length;
          const mbEst = (readyCount * 3.5).toFixed(1);
          statsCount.textContent = `${allSongs.length} أغنية (${mbEst} MB)`;

          renderCurrentTab();
        } catch (e) {
          console.error("Failed to load library:", e);
          document.getElementById("statsCount").textContent = "0 أغاني";
          renderEmptyState("تعذر قراءة المكتبة المحفوظة");
        }
      }

      // ── Render Songs ────────────────────────────────────────────────
      function renderSongs(songsToRender) {
        const container = document.getElementById("songsContainer");
        container.innerHTML = "";

        if (!songsToRender || songsToRender.length === 0) {
          renderEmptyState("لا توجد أغانٍ هنا حتى الآن");
          return;
        }

        songsToRender.forEach((song, idx) => {
          const isCurrent = currentIndex >= 0 && currentQueue[currentIndex]?.songId === song.songId;

          const card = document.createElement("div");
          card.className = `song-card ${isCurrent && isPlaying ? "playing" : ""}`;
          card.onclick = () => playSongIndex(idx, songsToRender);

          const coverDiv = document.createElement("div");
          coverDiv.className = "song-cover";
          if (song.thumbnailUrl) {
            const img = document.createElement("img");
            img.src = song.thumbnailUrl;
            img.alt = song.title;
            img.onerror = () => { coverDiv.innerHTML = "🎵"; };
            coverDiv.appendChild(img);
          } else {
            coverDiv.innerHTML = "🎵";
          }

          const infoDiv = document.createElement("div");
          infoDiv.className = "song-info";
          infoDiv.innerHTML = `
            <div class="song-title">${escapeHtml(song.title)}</div>
            <div class="song-artist">${escapeHtml(song.artist || "فنان")}</div>
          `;

          const actionsDiv = document.createElement("div");
          actionsDiv.className = "song-actions";

          const playBtn = document.createElement("button");
          playBtn.className = "play-icon-btn";
          playBtn.innerHTML = isCurrent && isPlaying ? "⏸" : "▶";
          playBtn.onclick = (e) => {
            e.stopPropagation();
            if (isCurrent) {
              togglePlay();
            } else {
              playSongIndex(idx, songsToRender);
            }
          };

          const delBtn = document.createElement("button");
          delBtn.className = "delete-btn";
          delBtn.title = "حذف من الذاكرة المحلية";
          delBtn.innerHTML = "🗑️";
          delBtn.onclick = (e) => {
            e.stopPropagation();
            deleteSong(song.songId, song.title);
          };

          actionsDiv.appendChild(playBtn);
          actionsDiv.appendChild(delBtn);

          card.appendChild(coverDiv);
          card.appendChild(infoDiv);
          card.appendChild(actionsDiv);
          container.appendChild(card);
        });
      }

      function renderEmptyState(msg) {
        const container = document.getElementById("songsContainer");
        container.innerHTML = `
          <div class="empty-box">
            <div class="empty-icon">🎧</div>
            <div class="empty-title">${escapeHtml(msg)}</div>
            <div class="empty-desc">
              عندما تكون متصلاً بالإنترنت، اضغط على زر التحميل بجانب أي أغنية لحفظها هنا لتشغيلها بدون إنترنت في أي وقت!
            </div>
          </div>
        `;
      }

      // ── Playback Logic ──────────────────────────────────────────────
      async function playSongIndex(idx, queue = currentQueue) {
        if (idx < 0 || idx >= queue.length) return;
        currentQueue = queue;
        currentIndex = idx;
        const song = currentQueue[currentIndex];

        updatePlayerUI(song);

        // Fetch audio blob from IndexedDB
        const blob = await getAudioBlob(song.songId);
        if (!blob) {
          alert(`الملف الصوتي للأغنية "${song.title}" غير متوفر محلياً.`);
          return;
        }

        if (activeBlobUrl) {
          URL.revokeObjectURL(activeBlobUrl);
        }

        activeBlobUrl = URL.createObjectURL(blob);
        audio.src = activeBlobUrl;
        audio.currentTime = 0;

        try {
          await audio.play();
          isPlaying = true;
          updatePlayButtons(true);
          updateMediaSession(song);
          renderCurrentTab();
        } catch (err) {
          console.warn("Play interrupted:", err);
        }
      }

      function togglePlay() {
        if (currentIndex < 0) {
          if (allSongs.length > 0) playSongIndex(0);
          return;
        }
        if (audio.paused) {
          audio.play().then(() => {
            isPlaying = true;
            updatePlayButtons(true);
            renderCurrentTab();
          }).catch(() => {});
        } else {
          audio.pause();
          isPlaying = false;
          updatePlayButtons(false);
          renderCurrentTab();
        }
      }

      function playNext() {
        if (currentQueue.length === 0) return;
        let nextIdx = currentIndex + 1;
        if (isShuffle) {
          nextIdx = Math.floor(Math.random() * currentQueue.length);
        } else if (nextIdx >= currentQueue.length) {
          nextIdx = 0;
        }
        playSongIndex(nextIdx);
      }

      function playPrev() {
        if (currentQueue.length === 0) return;
        if (audio.currentTime > 3) {
          audio.currentTime = 0;
          return;
        }
        let prevIdx = currentIndex - 1;
        if (prevIdx < 0) prevIdx = currentQueue.length - 1;
        playSongIndex(prevIdx);
      }

      function toggleShuffle() {
        isShuffle = !isShuffle;
        document.getElementById("shuffleBtn").style.opacity = isShuffle ? "1" : "0.5";
      }

      function toggleLoop() {
        isLoop = !isLoop;
        audio.loop = isLoop;
        document.getElementById("loopBtn").style.opacity = isLoop ? "1" : "0.5";
      }

      function closePlayer() {
        audio.pause();
        audio.src = "";
        if (activeBlobUrl) {
          URL.revokeObjectURL(activeBlobUrl);
          activeBlobUrl = null;
        }
        isPlaying = false;
        currentIndex = -1;
        document.getElementById("miniPlayer").classList.add("hidden");
        closeFullPlayer();
        renderCurrentTab();
      }

      // ── UI Updates ──────────────────────────────────────────────────
      function updatePlayerUI(song) {
        document.getElementById("miniPlayer").classList.remove("hidden");
        document.getElementById("miniTitle").textContent = song.title;
        document.getElementById("miniArtist").textContent = song.artist || "فنان";

        document.getElementById("fullTitle").textContent = song.title;
        document.getElementById("fullArtist").textContent = song.artist || "فنان";

        const miniCover = document.getElementById("miniCover");
        const fullArtwork = document.getElementById("fullArtwork");

        if (song.thumbnailUrl) {
          miniCover.innerHTML = `<img src="${song.thumbnailUrl}" alt="" onerror="this.parentElement.innerHTML='🎵'" />`;
          fullArtwork.innerHTML = `<img src="${song.thumbnailUrl}" alt="" onerror="this.parentElement.innerHTML='🎵'" />`;
        } else {
          miniCover.innerHTML = "🎵";
          fullArtwork.innerHTML = "🎵";
        }
      }

      function updatePlayButtons(playing) {
        document.getElementById("miniPlayBtn").innerHTML = playing ? "⏸" : "▶";
        document.getElementById("fullPlayBtn").innerHTML = playing ? "⏸" : "▶";
        if ("mediaSession" in navigator) {
          navigator.mediaSession.playbackState = playing ? "playing" : "paused";
        }
      }

      // ── Audio Events ────────────────────────────────────────────────
      audio.ontimeupdate = () => {
        const cur = audio.currentTime || 0;
        const dur = audio.duration || 0;
        if (dur > 0) {
          const pct = (cur / dur) * 100;
          document.getElementById("miniProgressFill").style.width = pct + "%";
          document.getElementById("scrubBar").value = pct;
          document.getElementById("curTime").textContent = formatTime(cur);
          document.getElementById("totalTime").textContent = formatTime(dur);
        }
      };

      audio.onended = () => {
        if (!isLoop) {
          playNext();
        }
      };

      function handleSeek(val) {
        const dur = audio.duration || 0;
        if (dur > 0) {
          audio.currentTime = (val / 100) * dur;
        }
      }

      function formatTime(sec) {
        if (!sec || isNaN(sec)) return "0:00";
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s < 10 ? "0" : ""}${s}`;
      }

      // ── Lock Screen MediaSession ────────────────────────────────────
      function updateMediaSession(song) {
        if (!("mediaSession" in navigator)) return;
        try {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: song.title,
            artist: song.artist || "فنان",
            album: song.albumName || "مكتبة الأوفلاين",
            artwork: song.thumbnailUrl ? [{ src: song.thumbnailUrl, sizes: "512x512", type: "image/jpeg" }] : []
          });

          navigator.mediaSession.setActionHandler("play", () => { audio.play(); });
          navigator.mediaSession.setActionHandler("pause", () => { audio.pause(); });
          navigator.mediaSession.setActionHandler("previoustrack", () => { playPrev(); });
          navigator.mediaSession.setActionHandler("nexttrack", () => { playNext(); });
          navigator.mediaSession.setActionHandler("seekto", (d) => {
            if (d.seekTime != null) audio.currentTime = d.seekTime;
          });
        } catch (e) {
          console.warn("MediaSession setup warning:", e);
        }
      }

      // ── Full Player Modal ───────────────────────────────────────────
      function openFullPlayer() {
        document.getElementById("fullModal").classList.add("open");
      }
      function closeFullPlayer() {
        document.getElementById("fullModal").classList.remove("open");
      }

      // ── Tab Navigation & Search ─────────────────────────────────────
      function switchTab(tab, btn) {
        currentTab = tab;
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        if (btn) btn.classList.add("active");
        renderCurrentTab();
      }

      function renderCurrentTab() {
        const query = document.getElementById("searchInput").value.trim().toLowerCase();
        let filtered = allSongs;

        if (query) {
          filtered = allSongs.filter(s =>
            (s.title && s.title.toLowerCase().includes(query)) ||
            (s.artist && s.artist.toLowerCase().includes(query)) ||
            (s.folderName && s.folderName.toLowerCase().includes(query))
          );
        }

        if (currentTab === "all") {
          renderSongs(filtered);
        } else if (currentTab === "artists") {
          renderArtistsView(filtered);
        } else if (currentTab === "albums") {
          renderAlbumsView(filtered);
        }
      }

      function renderArtistsView(songs) {
        const container = document.getElementById("songsContainer");
        container.innerHTML = "";
        const map = new Map();

        songs.forEach(s => {
          const a = s.folderName || s.artist || "أخرى";
          if (!map.has(a)) map.set(a, []);
          map.get(a).push(s);
        });

        if (map.size === 0) {
          renderEmptyState("لا يوجد فنانين محفوظين");
          return;
        }

        map.forEach((artistSongs, artistName) => {
          const groupCard = document.createElement("div");
          groupCard.className = "song-card";
          groupCard.style.padding = "14px 18px";
          groupCard.onclick = () => {
            renderSongs(artistSongs);
          };

          groupCard.innerHTML = `
            <div class="song-cover" style="border-radius: 50%;">🎤</div>
            <div class="song-info">
              <div class="song-title" style="font-size: 15px;">${escapeHtml(artistName)}</div>
              <div class="song-artist">${artistSongs.length} أغانٍ محفوظة</div>
            </div>
            <button class="reconnect-btn" style="pointer-events: none;">عرض الأغاني ←</button>
          `;
          container.appendChild(groupCard);
        });
      }

      function renderAlbumsView(songs) {
        const container = document.getElementById("songsContainer");
        container.innerHTML = "";
        const map = new Map();

        songs.forEach(s => {
          const alb = s.albumName || "أغاني منفردة";
          if (!map.has(alb)) map.set(alb, []);
          map.get(alb).push(s);
        });

        if (map.size === 0) {
          renderEmptyState("لا توجد ألبومات محفوظة");
          return;
        }

        map.forEach((albumSongs, albumName) => {
          const groupCard = document.createElement("div");
          groupCard.className = "song-card";
          groupCard.style.padding = "14px 18px";
          groupCard.onclick = () => {
            renderSongs(albumSongs);
          };

          groupCard.innerHTML = `
            <div class="song-cover">💿</div>
            <div class="song-info">
              <div class="song-title" style="font-size: 15px;">${escapeHtml(albumName)}</div>
              <div class="song-artist">${albumSongs.length} أغنية</div>
            </div>
            <button class="reconnect-btn" style="pointer-events: none;">تشغيل الألبوم ←</button>
          `;
          container.appendChild(groupCard);
        });
      }

      function handleSearch() {
        renderCurrentTab();
      }

      // ── Delete Song ─────────────────────────────────────────────────
      async function deleteSong(songId, title) {
        if (!confirm(`هل أنت متأكد من حذف "${title}" من ذاكرة الأوفلاين؟`)) return;
        try {
          const db = await openDb();
          await new Promise((resolve, reject) => {
            const tx = db.transaction([META_STORE, AUDIO_STORE], "readwrite");
            tx.objectStore(META_STORE).delete(songId);
            tx.objectStore(AUDIO_STORE).delete(songId);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
          allSongs = allSongs.filter(s => s.songId !== songId);
          currentQueue = currentQueue.filter(s => s.songId !== songId);
          loadLibrary();
        } catch (e) {
          alert("فشل حذف الأغنية: " + e.message);
        }
      }

      // ── Reconnection Checking ───────────────────────────────────────
      async function checkNetworkAndReload() {
        const icon = document.getElementById("reconnectIcon");
        icon.style.display = "inline-block";
        icon.style.animation = "spin 0.8s linear infinite";

        try {
          const online = await probeOnline();
          if (online) {
            window.location.href = "https://aura-musiic.vercel.app";
          } else {
            alert("لا يزال جهازك غير متصل بالإنترنت. يمكنك الاستمرار في الاستماع إلى أغانيك المحفوظة بدون إنترنت! 🎧");
          }
        } catch {
          alert("لا يزال جهازك غير متصل بالإنترنت.");
        } finally {
          icon.style.animation = "none";
        }
      }

      async function probeOnline() {
        if (!navigator.onLine) return false;
        try {
          const res = await fetch("/favicon.ico?_probe=" + Date.now(), {
            method: "HEAD",
            cache: "no-store",
            signal: AbortSignal.timeout(3000)
          });
          return res.status >= 200 && res.status < 400;
        } catch {
          return false;
        }
      }

      window.addEventListener("online", () => {
        document.getElementById("onlineToast").classList.add("show");
      });

      // Periodic gentle online check every 10 seconds
      setInterval(async () => {
        if (navigator.onLine) {
          const ok = await probeOnline();
          if (ok) {
            document.getElementById("onlineToast").classList.add("show");
          }
        }
      }, 10000);

      function escapeHtml(str) {
        if (!str) return "";
        return str
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      }

      // Initialize on load
      window.addEventListener("DOMContentLoaded", () => {
        loadLibrary();
      });
    </script>
    <style>
      @keyframes spin { 100% { transform: rotate(360deg); } }
    </style>
  </body>
</html>

"""#
}

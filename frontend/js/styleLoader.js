/**
 * styleLoader.js - V7.0 旗艦重構版
 * 目的：
 * 1. 統一全站視覺語言，強制執行 800px App 框架佈局。
 * 2. 解決 CSS 加載順序導致的排版跑掉問題。
 * 3. 針對 App Store 上架需求，優化系統狀態列與環境適配。
 */
(function () {
  // 1. 強制更新版本號：確保客戶端能即時看到最新的 1000 行 theme-client.css 效果
  const CSS_VERSION = "2026.01.02.V7_FINAL";

  // 取得當前路徑與檔名
  const path = window.location.pathname;
  const page = path.split("/").pop() || "index.html";

  // 定義待加載的 CSS 檔案陣列
  let cssFiles = [];

  // 2. 分流邏輯：管理後台 vs 客戶端前台
  if (page.includes("admin-")) {
    /**
     * --- 管理後台 (Admin Side) ---
     * 保持電腦版操作效率，載入現代化後台樣式
     */
    cssFiles = [
      "css/base.css", // 基礎重置
      "css/admin-modern.css", // 現代化後台範本
    ];
  } else {
    /**
     * --- 客戶端前台 (Client Side) ---
     * 包含：首頁、會員中心、傢俱代採購、登入註冊頁
     * 核心目標：100% 視覺統一，達成 App 質感
     */

    // [核心] 必須第一個載入：這份檔案現在包含了 1000 行的設計系統、RWD、與 App 佈局殼
    cssFiles.push("css/theme-client.css");

    // [分頁補丁] 根據特定功能頁面，載入額外的細節調整
    if (page === "index.html" || page === "quote.html" || page === "") {
      // 試算頁面：載入計算機專屬樣式
      cssFiles.push("css/client-index.css");
    } else if (page === "dashboard.html" || page.includes("profile")) {
      // 會員中心：載入包裹進度條、錢包卡片等專屬美編
      cssFiles.push("css/client-dashboard.css");
    } else if (page === "furniture-procurement.html") {
      // 傢俱代採購：若有專屬微調檔案可加在此，目前已大幅整合進 theme-client.css
      // cssFiles.push("css/client-furniture.css");
    }

    /**
     * 【深度優化備註】
     * 我們已徹底捨棄載入舊有的 client.css 與 style.css。
     * 因為這兩者會強制將寬度拉至 1200px 並覆蓋我們新設計的 800px App 框架，
     * 這是導致您之前「排版慘不忍睹」的主因。
     */
  }

  // 3. 執行 CSS 注入 (使用 document.write 以防止頁面渲染時產生閃爍 FOUC)
  cssFiles.forEach((file) => {
    document.write(`<link rel="stylesheet" href="${file}?v=${CSS_VERSION}">`);
  });

  // 4. [App 化關鍵] 動態優化標頭與環境設定
  window.addEventListener("DOMContentLoaded", () => {
    // A. 針對 iOS/Android 狀態列顏色的 Meta 補丁
    let metaTheme = document.querySelector('meta[name="theme-color"]');
    if (!metaTheme) {
      metaTheme = document.createElement("meta");
      metaTheme.name = "theme-color";
      document.getElementsByTagName("head")[0].appendChild(metaTheme);
    }
    // 設定狀態列顏色為品牌藍，讓網頁包裝成 App 後看起來更像原生應用
    metaTheme.content = "#1a73e8";

    // B. 強制檢測佈局殼 (防止開發者漏掉 app-layout-wrapper)
    if (
      !page.includes("admin-") &&
      !document.querySelector(".app-layout-wrapper")
    ) {
      console.warn(
        "styleLoader Warning: 偵測到未包裹 .app-layout-wrapper，這將導致排版不統一。"
      );
    }

    // C. 頁面載入完成後的平滑淡入效果 (配合 CSS 中的 body { opacity: 0 })
    document.body.style.transition = "opacity 0.4s ease-in";
    document.body.style.opacity = "1";
  });

  // 5. 輸出調試資訊 (僅開發模式可用)
  console.log(
    `%c[StyleLoader] 成功載入 ${page} 的旗艦版樣式系統 (v${CSS_VERSION})`,
    "color: #1a73e8; font-weight: bold;"
  );
})();

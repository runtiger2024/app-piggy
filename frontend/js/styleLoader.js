/**
 * styleLoader.js - V7.1 統一驗證補丁版
 * 目的：
 * 1. 統一全站視覺語言，強制執行 800px App 框架佈局。
 * 2. 解決 CSS 加載順序導致的排版跑掉問題。
 * 3. [新增] 整合 auth-unified.css，實現前、後台登入頁面風格統一。
 * 4. 針對 App Store 上架需求，優化系統狀態列與環境適配。
 */
(function () {
  // 1. 強制更新版本號：確保客戶端能即時看到最新的樣式效果
  const CSS_VERSION = "2026.01.03.V7.1_AUTH";

  // 取得當前路徑與檔名
  const path = window.location.pathname;
  const page = path.split("/").pop() || "index.html";

  // 定義待加載的 CSS 檔案陣列
  let cssFiles = [];

  // 2. 判斷邏輯分流

  // A. 判定是否為「身分驗證相關頁面」 (包含會員登入、管理員登入、註冊、忘記密碼)
  const isAuthPage =
    page === "login.html" ||
    page === "admin-login.html" ||
    page === "register.html" ||
    page === "forgot-password.html" ||
    page === "reset-password.html";

  if (isAuthPage) {
    /**
     * --- 統一身分驗證樣式 (Unified Auth) ---
     * 讓前台與後台的登入體驗完全一致，並適配 450px 專業登入容器
     */
    cssFiles = ["css/auth-unified.css"];
  } else if (page.includes("admin-")) {
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
     * 包含：首頁、會員中心、傢俱代採購
     */

    // [核心] 旗艦級設計系統與 App 佈局殼
    cssFiles.push("css/theme-client.css");

    // [分頁補丁] 根據特定功能頁面，載入額外的細節調整
    if (page === "index.html" || page === "quote.html" || page === "") {
      // 試算頁面：載入計算機專屬樣式
      cssFiles.push("css/client-index.css");
    } else if (page === "dashboard.html" || page.includes("profile")) {
      // 會員中心：載入包裹進度條、錢包卡片等專屬美編
      cssFiles.push("css/client-dashboard.css");
    }
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

    // B. 強制檢測佈局殼 (在非登入頁面且非後台的情況下，檢測 app-layout-wrapper)
    if (
      !isAuthPage &&
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

  // 5. 輸出調試資訊
  console.log(
    `%c[StyleLoader] 成功載入 ${page} 的旗艦版樣式系統 (v${CSS_VERSION})`,
    "color: #1a73e8; font-weight: bold;"
  );
})();

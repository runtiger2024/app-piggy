/**
 * styleLoader.js - V7.2 現代化注入優化版
 * 目的：
 * 1. 統一全站視覺語言，強制執行 800px App 框架佈局。
 * 2. 解決 CSS 加載順序導致的排版跑掉問題。
 * 3. 整合 auth-unified.css，實現前、後台登入頁面風格統一。
 * 4. 針對 App Store 上架需求，優化系統狀態列與環境適配。
 * 5. [優化] 移除 document.write，改用 DOM Injection 以符合瀏覽器安全與性能標準。
 */
(function () {
  // 1. 強制更新版本號：確保客戶端能即時看到最新的樣式效果
  const CSS_VERSION = "2026.01.03.V7.2_FIX";

  // 取得當前路徑與檔名
  const path = window.location.pathname;
  const page = path.split("/").pop() || "index.html";

  // 定義待加載的 CSS 檔案陣列
  let cssFiles = [];

  // 2. 判斷邏輯分流

  // A. 判定是否為「身分驗證相關頁面」
  const isAuthPage =
    page === "login.html" ||
    page === "admin-login.html" ||
    page === "register.html" ||
    page === "forgot-password.html" ||
    page === "reset-password.html";

  if (isAuthPage) {
    /**
     * --- 統一身分驗證樣式 (Unified Auth) ---
     */
    cssFiles = ["css/auth-unified.css"];
  } else if (page.includes("admin-")) {
    /**
     * --- 管理後台 (Admin Side) ---
     */
    cssFiles = [
      "css/base.css", // 基礎重置
      "css/admin-modern.css", // 現代化後台範本
    ];
  } else {
    /**
     * --- 客戶端前台 (Client Side) ---
     */
    // [核心] 旗艦級設計系統與 App 佈局殼
    cssFiles.push("css/theme-client.css");

    // [分頁補丁] 根據特定功能頁面，載入額外的細節調整
    if (page === "index.html" || page === "quote.html" || page === "") {
      cssFiles.push("css/client-index.css");
    } else if (page === "dashboard.html" || page.includes("profile")) {
      cssFiles.push("css/client-dashboard.css");
    }
  }

  // 3. 執行 CSS 注入 [修復: 替換 document.write]
  // 使用 createElement 確保不會觸發瀏覽器的 Violation 警告，並維持非同步加載性能
  cssFiles.forEach((file) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${file}?v=${CSS_VERSION}`;
    document.head.appendChild(link);
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
    // 設定狀態列顏色為品牌藍
    metaTheme.content = "#1a73e8";

    // B. 強制檢測佈局殼
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

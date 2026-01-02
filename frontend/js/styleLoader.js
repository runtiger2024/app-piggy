/**
 * styleLoader.js - 2025/2026 重構專用版本
 * 目的：統一客戶端設計語言，達成 App 化視覺體驗，並解決樣式衝突問題。
 */
(function () {
  // 1. 強制更新版本號以清除瀏覽器快取 (每次大幅修改 CSS 後請手動跳號)
  const CSS_VERSION = "2026.01.02.V1";

  const path = window.location.pathname;
  const page = path.split("/").pop() || "index.html";

  // 定義待加載的 CSS 檔案陣列
  let cssFiles = [];

  // 2. 判斷是「管理後台」還是「客戶端前台」
  if (page.includes("admin-")) {
    // --- 管理後台：載入現代化後台專用樣式 ---
    cssFiles = [
      "css/base.css", // 後台仍可維持基礎重置
      "css/admin-modern.css", // 您最滿意的後台範本
    ];
  } else {
    // --- 客戶端前台：採用全新「設計系統」邏輯 ---
    // 順序極為重要：後面的檔案會覆蓋前面的樣式
    cssFiles = [
      "css/theme-client.css", // [核心] 您手把手建立的設計系統變數與 App 佈局
    ];

    // 3. 根據特定分頁，載入額外的功能性樣式 (選配)
    // 注意：如果您的 theme-client.css 已經寫得很完整，這裡可以視情況精簡
    if (page === "index.html" || page === "quote.html" || page === "") {
      // 試算頁面專用 (例如計算機元件、費率表卡片)
      cssFiles.push("css/client-index.css");
    } else if (page === "dashboard.html" || page.includes("profile")) {
      // 會員中心專用 (例如包裹進度條、錢包卡片)
      cssFiles.push("css/client-dashboard.css");
    }

    /**
     * 【重要備註】為什麼不再載入 client.css 和 style.css？
     * 因為這兩個舊檔案包含大量固定的 width, padding 與舊色調，
     * 會導致您的新設計系統 (theme-client.css) 被干擾，造成「更新後沒差別」的錯覺。
     */
  }

  // 4. 執行注入動作
  cssFiles.forEach((file) => {
    // 使用 document.write 確保樣式在頁面內容渲染前就載入，減少閃爍
    document.write(`<link rel="stylesheet" href="${file}?v=${CSS_VERSION}">`);
  });

  // 5. [附加功能] 針對手機端 App 適配的 Viewport 補丁
  // 確保在 iPhone 瀏海屏或 Android 底部手勢條區域有正確的背景延伸
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.content = "#1a73e8"; // 跟隨您的 --p-blue 品牌色
  document.getElementsByTagName("head")[0].appendChild(meta);
})();

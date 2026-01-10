// frontend/js/apiConfig.js (V4.0 旗艦 App 兼容增強版)
// 支援環境：網頁瀏覽器、Android App (Capacitor/Cordova)、iOS App
// [優化]：整合最新消息、關於我們、常見問題等新功能路徑配置

/**
 * 1. 定義伺服器網址
 * [大師建議]：當你正式上架 App 時，App 會直接連線到 PROD_URL。
 */
const PROD_URL = "https://runpiggy-app-backend.onrender.com";
const DEV_URL = "http://localhost:3000";

/**
 * 2. 進階環境判斷邏輯
 * 除了原本的 localhost，我們額外加入了手機 App 常用協議的判斷。
 */
const isDev = (function () {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;

  // 如果是在本地開發環境（電腦網頁）
  const isLocalWeb =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.startsWith("192.168."); // 支援手機連電腦測試

  // 如果是在手機 App 容器內運行 (Capacitor 或 Cordova)
  // App 運行時通常 protocol 是 'capacitor:' 或 'http:' (搭配 localhost)
  // 在開發手機 App 時，我們通常會手動切換這個開關
  const isMobileApp = protocol === "capacitor:" || protocol === "file:";

  // [自動判斷]：如果是本地網頁，就用開發網址；其餘一律用正式網址 (包含手機 App)
  return isLocalWeb && !isMobileApp;
})();

// 根據環境設定全域變數
const API_BASE_URL = isDev ? DEV_URL : PROD_URL;

/**
 * 3. [新增] API 功能路徑映射 (對應同事優化清單之新功能)
 * 統一管理新模組的接口路徑，方便前端開發調用
 */
const API_ENDPOINTS = {
  // 基礎路徑
  BASE: API_BASE_URL,

  // 最新消息 (公告區)
  NEWS: `${API_BASE_URL}/api/news`,

  // 關於小跑豬 (家具專線說明)
  ABOUT: `${API_BASE_URL}/api/about`,

  // 常見問題 (FAQ)
  FAQ: `${API_BASE_URL}/api/faq`,

  // 錢包與銀行資訊 (帳務增加轉帳資訊)
  BANK_INFO: `${API_BASE_URL}/api/wallet/bank-info`,
};

/**
 * 4. 診斷資訊 (保留原功能)
 * 這對你在手機上調試 App 時非常重要，能看到 App 到底連去哪了。
 */
console.log(
  `%c[環境診斷] 當前環境: ${
    isDev ? "開發模式 (Local Web)" : "正式/App 模式 (Prod)"
  }`,
  "color: #1a73e8; font-weight: bold;"
);
console.log(`[環境診斷] API 請求目標: ${API_BASE_URL}`);
console.log(`[環境診斷] 公告與 FAQ 路徑已就緒`);

// 5. 匯出邏輯 (相容 CommonJS 模組化環境)
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    API_BASE_URL,
    API_ENDPOINTS,
  };
}

// 為了讓舊有程式碼相容，確保全域變數依然存在
window.API_BASE_URL = API_BASE_URL;
window.API_ENDPOINTS = API_ENDPOINTS;

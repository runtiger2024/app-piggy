// frontend/js/apiConfig.js (V3.0 旗艦 App 兼容版)

const PROD_URL = "https://runpiggy-api.onrender.com";
const DEV_URL = "http://localhost:3000";

/**
 * 2. 環境判斷邏輯
 * 支援環境：網頁瀏覽器、Android App (Capacitor)、iOS App
 */
const isDev = (function () {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;

  // 判斷是否為本地開發網頁或 WiFi 內網測試
  const isLocalWeb =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.startsWith("192.168.");

  // 判斷是否在手機 App 容器內 (Capacitor 使用 capacitor:// 或 file://)
  const isMobileApp = protocol === "capacitor:" || protocol === "file:";

  // [自動切換]：除非在電腦網頁開發，否則 App 一律優先連線至正式網址
  return isLocalWeb && !isMobileApp;
})();

const API_BASE_URL = isDev ? DEV_URL : PROD_URL;

console.log(
  `%c[環境診斷] 當前環境: ${
    isDev ? "開發模式 (Local Web)" : "正式/App 模式 (Prod)"
  }`,
  "color: #1a73e8; font-weight: bold;"
);
console.log(`[環境診斷] API 請求目標: ${API_BASE_URL}`);

if (typeof module !== "undefined" && module.exports) {
  module.exports = { API_BASE_URL };
}

// frontend/js/apiConfig.js (V2.1 完整修正版)
// 確保前端在 127.0.0.1 或 localhost 運行時能正確對接本地開發伺服器

// 1. 定義正式環境與開發環境的 API 基礎網址
const PROD_URL = "https://runpiggy-api.onrender.com";
const DEV_URL = "http://localhost:3000";

/**
 * 2. 環境判斷邏輯
 * 修正說明：保留對 127.0.0.1、localhost 以及本機檔案路徑的判斷。
 * 這能確保在 Live Server (127.0.0.1:5500) 下 API 請求能正確發送到開發後端。
 */
const isDev =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1" ||
  window.location.protocol === "file:";

// 根據環境設定全域變數
const API_BASE_URL = isDev ? DEV_URL : PROD_URL;

/**
 * 3. 診斷資訊
 * 在控制台輸出目前連線的 API 網址，方便除錯。
 * 若載入失敗，請確認開發伺服器是否正在 localhost:3000 運行。
 */
console.log(
  `[環境診斷] 當前環境: ${isDev ? "開發模式 (Local)" : "正式模式 (Prod)"}`
);
console.log(`[環境診斷] API 請求目標: ${API_BASE_URL}`);

// 4. 匯出邏輯 (相容 CommonJS 模組化環境，如 Node.js 測試)
if (typeof module !== "undefined" && module.exports) {
  module.exports = { API_BASE_URL };
}

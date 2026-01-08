// backend/middleware/lineAuth.js
const crypto = require("crypto");

/**
 * 驗證 LINE Webhook 簽章 (V16.2 修正版)
 * 為了確保請求安全性，必須使用原始請求主體 (Raw Body) 進行 HMAC-SHA256 驗證。
 */
const verifyLineSignature = (req, res, next) => {
  const signature = req.headers["x-line-signature"];
  const channelSecret = process.env.LINE_CHANNEL_SECRET;

  // 檢查標頭是否存在
  if (!signature) {
    console.warn("[Security] 缺少 x-line-signature 標頭");
    return res.status(401).send("Unauthorized");
  }

  // 重要修正：使用在 server.js 中預先擷取的 req.rawBody (原始 Buffer)
  // 這能確保驗證資料與 LINE 官方發送的完全一致，解決 JSON 轉換後的格式差異問題
  if (!req.rawBody) {
    console.error(
      "[系統錯誤] 無法取得原始請求主體 (rawBody)，請確保 server.js 已正確配置 express.json({ verify: ... })"
    );
    return res.status(500).send("Internal Server Error");
  }

  // 使用原始內容進行雜湊計算
  const hash = crypto
    .createHmac("sha256", channelSecret)
    .update(req.rawBody)
    .digest("base64");

  if (hash === signature) {
    // 驗證通過，繼續執行後續控制器邏輯
    next();
  } else {
    // 驗證失敗，攔截非法請求
    console.warn("[Security] 攔截到非法 LINE Webhook 請求 (簽章驗證未通過)");
    res.status(401).send("Unauthorized");
  }
};

module.exports = { verifyLineSignature };

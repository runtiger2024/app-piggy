// backend/middleware/lineAuth.js
const crypto = require("crypto");

const verifyLineSignature = (req, res, next) => {
  const signature = req.headers["x-line-signature"];
  const channelSecret = process.env.LINE_CHANNEL_SECRET; // 使用您提供的 Secret

  // 重要：Webhook 必須使用原始 Raw Body 進行驗證
  // 在 server.js 已經有 express.json() 的情況下，stringify 的結果必須與發送端一致
  const body = JSON.stringify(req.body);

  const hash = crypto
    .createHmac("sha256", channelSecret)
    .update(body)
    .digest("base64");

  if (hash === signature) {
    next();
  } else {
    console.warn("[Security] 攔截到非法 LINE Webhook 請求");
    res.status(401).send("Unauthorized");
  }
};

module.exports = { verifyLineSignature };

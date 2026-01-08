// backend/middleware/lineAuth.js
const crypto = require("crypto");

/**
 * LINE 簽章驗證中介軟體
 */
const verifyLineSignature = (req, res, next) => {
  const signature = req.headers["x-line-signature"];
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
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

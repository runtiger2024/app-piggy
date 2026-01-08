// backend/utils/lineManager.js
const axios = require("axios");
const qs = require("qs");

let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * 自動獲取/更新 LINE Access Token (Stateless / Short-lived)
 */
async function getAccessToken() {
  // 如果快取還有效 (提前 1 分鐘過期判定)，直接回傳
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  try {
    const response = await axios.post(
      "https://api.line.me/v2/oauth/accessToken",
      qs.stringify({
        grant_type: "client_credentials",
        client_id: process.env.LINE_CHANNEL_ID,
        client_secret: process.env.LINE_CHANNEL_SECRET,
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    cachedToken = response.data.access_token;
    // LINE 短期 Token 通常效期為 30 天，這裡記錄過期時間
    tokenExpiresAt = Date.now() + response.data.expires_in * 1000;

    console.log("[LINE Manager] 成功取得新的動態 Access Token");
    return cachedToken;
  } catch (error) {
    console.error(
      "[LINE Manager Token Error]",
      error.response?.data || error.message
    );
    throw new Error("無法從 LINE 取得存取令牌");
  }
}

/**
 * 統一發送回覆訊息 (Reply API)
 */
async function sendReply(replyToken, text) {
  try {
    const token = await getAccessToken();
    await axios.post(
      "https://api.line.me/v2/bot/message/reply",
      {
        replyToken: replyToken,
        messages: [{ type: "text", text: text }],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }
    );
  } catch (error) {
    console.error("[LINE Reply Error]", error.response?.data || error.message);
  }
}

/**
 * 統一發送推播訊息 (Push API)
 */
async function sendPush(lineUserId, text) {
  try {
    const token = await getAccessToken();
    await axios.post(
      "https://api.line.me/v2/bot/message/push",
      {
        to: lineUserId,
        messages: [{ type: "text", text: text }],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }
    );
  } catch (error) {
    console.error("[LINE Push Error]", error.response?.data || error.message);
  }
}

module.exports = { sendReply, sendPush };

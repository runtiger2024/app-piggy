// backend/utils/lineManager.js
const axios = require("axios");
const qs = require("qs");

/**
 * [小跑豬系統 V16.0 - LINE 核心管理模組]
 * 功能：動態 Token 管理、單人推播、多人推播、回覆訊息、Flex Message 支援
 */

let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * 自動獲取/更新 LINE Access Token (Stateless / Short-lived)
 * 解決找不到固定 Channel Access Token 的問題，改用 Channel ID & Secret 動態換取
 */
async function getAccessToken() {
  // 如果快取還有效 (提前 5 分鐘過期判定)，直接回傳以節省 API 呼叫次數
  if (cachedToken && Date.now() < tokenExpiresAt - 300000) {
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
    // LINE 短期 Token 效期通常為 30 天，expires_in 單位為秒
    tokenExpiresAt = Date.now() + response.data.expires_in * 1000;

    console.log("[LINE Manager] 成功取得/更新動態 Access Token");
    return cachedToken;
  } catch (error) {
    console.error(
      "[LINE Manager Token Error]",
      error.response?.data || error.message
    );
    throw new Error("無法從 LINE 取得存取令牌，請檢查 Channel ID 與 Secret");
  }
}

/**
 * 統一發送回覆訊息 (Reply API)
 * @param {string} replyToken - 從 Webhook 取得的 replyToken
 * @param {string|object} content - 可以是純文字字串，或是完整的 Message Object (如 Flex Message)
 */
async function sendReply(replyToken, content) {
  try {
    const token = await getAccessToken();
    const message =
      typeof content === "string" ? { type: "text", text: content } : content;

    await axios.post(
      "https://api.line.me/v2/bot/message/reply",
      {
        replyToken: replyToken,
        messages: [message],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }
    );
    console.log(`[LINE Reply] 訊息已成功回覆`);
  } catch (error) {
    console.error("[LINE Reply Error]", error.response?.data || error.message);
  }
}

/**
 * 統一發送推播訊息 (Push API)
 * @param {string} lineUserId - 用戶的 LINE UID
 * @param {string|object} content - 訊息內容 (字串或物件)
 */
async function sendPush(lineUserId, content) {
  if (!lineUserId) {
    console.error("[LINE Push] 錯誤：未提供 lineUserId");
    return;
  }

  try {
    const token = await getAccessToken();
    const message =
      typeof content === "string" ? { type: "text", text: content } : content;

    await axios.post(
      "https://api.line.me/v2/bot/message/push",
      {
        to: lineUserId,
        messages: [message],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }
    );
    console.log(`[LINE Push] 成功推送訊息至: ${lineUserId}`);
  } catch (error) {
    console.error("[LINE Push Error]", error.response?.data || error.message);
  }
}

/**
 * [新功能] 發送多人推播訊息 (Multicast API)
 * 適用於同時通知多個用戶（最多 500 人）
 * @param {Array} userIds - 用戶 UID 陣列
 * @param {string|object} content - 訊息內容
 */
async function sendMulticast(userIds, content) {
  if (!Array.isArray(userIds) || userIds.length === 0) return;

  try {
    const token = await getAccessToken();
    const message =
      typeof content === "string" ? { type: "text", text: content } : content;

    await axios.post(
      "https://api.line.me/v2/bot/message/multicast",
      {
        to: userIds,
        messages: [message],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }
    );
    console.log(`[LINE Multicast] 成功推送訊息至 ${userIds.length} 位用戶`);
  } catch (error) {
    console.error(
      "[LINE Multicast Error]",
      error.response?.data || error.message
    );
  }
}

/**
 * [新功能] 建立 Flex Message 模板 (物流專用範例)
 * 您可以調用此函數生成漂亮的包裹卡片
 */
function createParcelFlex(orderId, status, description) {
  return {
    type: "flex",
    altText: "小跑豬包裹狀態更新",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "小跑豬物流通知",
            weight: "bold",
            color: "#1DB446",
            size: "sm",
          },
          {
            type: "text",
            text: status,
            weight: "bold",
            size: "xl",
            margin: "md",
          },
          { type: "separator", margin: "xxl" },
          {
            type: "box",
            layout: "vertical",
            margin: "md",
            contents: [
              {
                type: "text",
                text: `單號: ${orderId}`,
                color: "#aaaaaa",
                size: "xs",
              },
              { type: "text", text: description, margin: "md", wrap: true },
            ],
          },
        ],
      },
    },
  };
}

module.exports = {
  sendReply,
  sendPush,
  sendMulticast,
  createParcelFlex,
};

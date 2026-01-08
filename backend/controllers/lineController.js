// backend/controllers/lineController.js
const prisma = require("../config/db.js");
const axios = require("axios");

/**
 * 處理 LINE Webhook 事件
 */
const handleWebhook = async (req, res) => {
  const events = req.body.events;

  try {
    // 遍歷所有事件 (LINE 可能一次傳送多個事件)
    for (let event of events) {
      const lineUserId = event.source.userId;

      if (event.type === "follow") {
        // --- 1. 處理加入好友事件 ---
        console.log(`[LINE Webhook] 使用者加入好友: ${lineUserId}`);
        await handleFollowEvent(lineUserId);
      } else if (event.type === "message" && event.message.type === "text") {
        // --- 2. 處理文字訊息 (例如：回傳「我的餘額」) ---
        await handleMessageEvent(
          lineUserId,
          event.message.text,
          event.replyToken
        );
      }
    }
    res.status(200).send("OK");
  } catch (error) {
    console.error("[LINE Webhook Error]", error.message);
    res.status(500).end();
  }
};

/**
 * 處理加入好友邏輯
 */
async function handleFollowEvent(lineUserId) {
  // 您可以在此處記錄日誌，或透過 LINE 回傳歡迎訊息
  // 提示：若此 ID 已存在 User 表，代表是老客戶重新加好友
  const user = await prisma.user.findUnique({ where: { lineUserId } });
  if (user) {
    console.log(`[LINE] 歡迎老客戶回歸: ${user.email}`);
  }
}

/**
 * 處理訊息邏輯 (範例：查詢功能)
 */
async function handleMessageEvent(lineUserId, text, replyToken) {
  let replyText = "您好！我是小跑豬助手。您可以點擊下方選單使用服務。";

  // 簡單的關鍵字查詢範例
  if (text === "查詢餘額") {
    const user = await prisma.user.findUnique({
      where: { lineUserId },
      include: { wallet: true },
    });

    if (user && user.wallet) {
      replyText = `您的目前錢包餘額為: $${user.wallet.balance.toLocaleString()}`;
    } else {
      replyText = "找不到您的帳號資訊，請先在官網進行 LINE 綁定。";
    }
  }

  // 呼叫 LINE Reply API 回覆使用者
  await sendLineReply(replyToken, replyText);
}

/**
 * 內部函式：發送回覆訊息 (Reply API 不計入推播額度)
 */
async function sendLineReply(replyToken, text) {
  try {
    await axios.post(
      "https://api.line.me/v2/bot/message/reply",
      {
        replyToken: replyToken,
        messages: [{ type: "text", text: text }],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
        },
      }
    );
  } catch (error) {
    console.error(
      "[LINE Reply API Error]",
      error.response?.data || error.message
    );
  }
}

module.exports = { handleWebhook };

// backend/controllers/lineController.js
const prisma = require("../config/db.js");
const { sendReply } = require("../utils/lineManager"); // 改用 Manager

/**
 * 處理 LINE Webhook 事件
 */
const handleWebhook = async (req, res) => {
  const events = req.body.events;

  try {
    for (let event of events) {
      const lineUserId = event.source.userId;

      if (event.type === "follow") {
        console.log(`[LINE Webhook] 使用者加入好友: ${lineUserId}`);
        await handleFollowEvent(lineUserId);
      } else if (event.type === "message" && event.message.type === "text") {
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

async function handleFollowEvent(lineUserId) {
  const user = await prisma.user.findUnique({ where: { lineUserId } });
  if (user) {
    console.log(`[LINE] 歡迎老客戶回歸: ${user.email}`);
  }
}

async function handleMessageEvent(lineUserId, text, replyToken) {
  let replyText = "您好！我是小跑豬助手。您可以點擊下方選單使用服務。";

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

  // 呼叫 Manager 發送回覆
  await sendReply(replyToken, replyText);
}

module.exports = { handleWebhook };

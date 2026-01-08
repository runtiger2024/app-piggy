// backend/utils/createNotification.js
const prisma = require("../config/db.js");
const { sendPush } = require("./lineManager"); // 改用 Manager

/**
 * 建立站內通知並自動執行 LINE 推播
 */
const createNotification = async (
  userId,
  title,
  message,
  type = "SYSTEM",
  link = null
) => {
  try {
    if (!userId) return;

    // 1. 建立資料庫紀錄
    await prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type,
        link,
        isRead: false,
      },
    });

    // 2. 獲取使用者 LINE 綁定狀態
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { lineUserId: true },
    });

    // 如果有綁定，直接推播
    if (user && user.lineUserId) {
      const pushText = `【${title}】\n${message}${
        link ? `\n查看連結: ${link}` : ""
      }`;

      // 使用 Manager 的推播功能，不再需要檢查 env 裡的 Token 字串
      sendPush(user.lineUserId, pushText).catch((err) => {
        console.error(`[LINE Push Async Error] User ${userId}:`, err.message);
      });
    }
  } catch (error) {
    console.error(
      `[Notification Error] Failed for user ${userId}:`,
      error.message
    );
  }
};

module.exports = createNotification;

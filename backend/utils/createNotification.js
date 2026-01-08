// backend/utils/createNotification.js
// V16.2 - 旗艦整合強化版：支援自動 Emoji 轉換、智能鏈接與非同步推播優化

const prisma = require("../config/db.js");
const { sendPush } = require("./lineManager");

/**
 * 建立站內通知並自動執行 LINE 推播
 * * @param {string} userId - 使用者 ID
 * @param {string} title - 通知標題
 * @param {string} message - 通知內容
 * @param {string} type - 通知類型 (SYSTEM, PACKAGE, SHIPMENT, WALLET, FURNITURE)
 * @param {string} link - 選填，點擊通知跳轉的相對路徑或絕對網址
 */
const createNotification = async (
  userId,
  title,
  message,
  type = "SYSTEM",
  link = null
) => {
  try {
    if (!userId) {
      console.warn("[Notification Warning] 缺少 userId，跳過通知建立");
      return;
    }

    // --- 1. 建立資料庫站內通知紀錄 ---
    const newNotification = await prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type,
        link,
        isRead: false,
      },
    });

    // --- 2. 處理 LINE 推播邏輯 ---
    // 獲取使用者 LINE 綁定狀態
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { lineUserId: true },
    });

    // 如果使用者有綁定 LINE，執行推播
    if (user && user.lineUserId) {
      // [新增功能] 根據通知類型自動適配 Emoji 圖示，增強視覺效果
      let emoji = "🔔";
      switch (type.toUpperCase()) {
        case "PACKAGE":
          emoji = "📦";
          break;
        case "SHIPMENT":
          emoji = "🚚";
          break;
        case "WALLET":
          emoji = "💰";
          break;
        case "FURNITURE":
          emoji = "🛋️";
          break;
        case "SYSTEM":
          emoji = "📢";
          break;
      }

      // [新增功能] 智能鏈接補全：確保相對路徑能正確引導使用者回到官網
      let fullLink = link;
      if (link && link.startsWith("/") && process.env.FRONTEND_URL) {
        // 如果是 /dashboard 形式，自動補全為 https://your-site.com/dashboard
        fullLink = `${process.env.FRONTEND_URL.replace(/\/$/, "")}${link}`;
      }

      // 組裝推播文字
      const pushText = `${emoji} 【${title}】\n\n${message}${
        fullLink ? `\n\n👉 點此查看：${fullLink}` : ""
      }`;

      // [優化] 使用非阻塞方式發送 LINE 推播，確保不影響主程序效能
      sendPush(user.lineUserId, pushText).catch((err) => {
        console.error(
          `[LINE Push Error] 推播失敗 (User: ${userId}, Type: ${type}):`,
          err.message
        );
      });
    }

    return newNotification;
  } catch (error) {
    console.error(
      `[Notification System Error] 無法為使用者 ${userId} 建立通知:`,
      error.message
    );
  }
};

module.exports = createNotification;

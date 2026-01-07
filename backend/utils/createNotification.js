// backend/utils/createNotification.js
// V16.0 - 旗艦整合版：支援站內通知與 LINE 訊息自動同步推播

const prisma = require("../config/db.js");
const axios = require("axios"); // 透過 package.json 確認已安裝 axios

/**
 * 建立站內通知並自動執行 LINE 推播
 * @param {string} userId - 接收通知的會員 ID
 * @param {string} title - 通知標題
 * @param {string} message - 通知內容
 * @param {string} type - 類型: SYSTEM, SHIPMENT, PACKAGE, WALLET
 * @param {string} link - (選填) 點擊跳轉連結或關聯 ID
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

    // 1. [保留原始功能] 建立資料庫站內通知紀錄
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

    // 2. [新增功能] 交叉分析該用戶是否綁定 LINE 並執行推播
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { lineUserId: true },
    });

    // 如果使用者有綁定 LINE 且 系統環境變數有設定 Access Token
    if (user && user.lineUserId && process.env.LINE_CHANNEL_ACCESS_TOKEN) {
      // 組合推播文字內容
      const pushText = `【${title}】\n${message}${
        link ? `\n查看連結: ${link}` : ""
      }`;

      // 執行 LINE 推播 (採用非阻塞方式處理)
      sendLinePush(user.lineUserId, pushText).catch((err) => {
        console.error(
          `[LINE Push Error] Failed for user ${userId}:`,
          err.message
        );
      });
    }
  } catch (error) {
    // [保留原始邏輯] 通知寫入失敗不應中斷主流程，僅紀錄錯誤
    console.error(
      `[Notification Error] Failed to create for user ${userId}:`,
      error.message
    );
  }
};

/**
 * 內部私有函數：執行 LINE Messaging API 推播
 * 使用 axios 發送 POST 請求至 LINE 伺服器
 */
async function sendLinePush(lineUserId, text) {
  try {
    await axios.post(
      "https://api.line.me/v2/bot/message/push",
      {
        to: lineUserId,
        messages: [
          {
            type: "text",
            text: text,
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
        },
      }
    );
  } catch (error) {
    // 推播失敗僅記錄詳細錯誤，不拋出異常影響主業務
    const errorData = error.response ? error.response.data : error.message;
    console.error("[LINE API Detail Error]", errorData);
  }
}

module.exports = createNotification;

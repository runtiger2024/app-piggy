// backend/utils/createNotification.js
// V16.5 - 專業版：導入 Flex Message 支援、強化網址校驗、優化代碼結構

const prisma = require("../config/db.js");
const { sendPush } = require("./lineManager");

/**
 * 建立站內通知並執行 LINE 推播
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

    // --- 1. 建立資料庫站內通知紀錄 (保留原功能) ---
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
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { lineUserId: true },
    });

    // 只有在使用者綁定 LINE 且有 lineUserId 時執行
    if (user?.lineUserId) {
      // [優化] 使用物件對照表取代 switch，提升閱讀性
      const TYPE_CONFIG = {
        PACKAGE: { emoji: "📦", color: "#27ae60", label: "包裹通知" },
        SHIPMENT: { emoji: "🚚", color: "#2980b9", label: "物流通知" },
        WALLET: { emoji: "💰", color: "#f1c40f", label: "錢包通知" },
        FURNITURE: { emoji: "🛋️", color: "#e67e22", label: "家具通知" },
        SYSTEM: { emoji: "📢", color: "#7f8c8d", label: "系統通知" },
        DEFAULT: { emoji: "🔔", color: "#1DB446", label: "提醒通知" },
      };

      const config = TYPE_CONFIG[type.toUpperCase()] || TYPE_CONFIG.DEFAULT;

      // [核心修復] 強化網址補全邏輯，確保連結絕對可用
      let fullLink = null;
      if (link) {
        if (link.startsWith("http")) {
          fullLink = link;
        } else if (process.env.FRONTEND_URL) {
          // 確保中間只有一個斜線
          const baseUrl = process.env.FRONTEND_URL.replace(/\/$/, "");
          const relativePath = link.startsWith("/") ? link : `/${link}`;
          fullLink = `${baseUrl}${relativePath}`;
        }
      }

      // [大師優化] 改用 Flex Message 物件，解決純文字連結失效問題
      const flexContent = {
        type: "flex",
        altText: `【${config.label}】${title}`,
        contents: {
          type: "bubble",
          size: "mega",
          header: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: `${config.emoji} ${config.label}`,
                weight: "bold",
                color: config.color,
                size: "sm",
              },
            ],
          },
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: title,
                weight: "bold",
                size: "md",
                wrap: true,
              },
              {
                type: "text",
                text: message,
                size: "sm",
                color: "#666666",
                margin: "md",
                wrap: true,
              },
            ],
          },
          // 如果有連結，才顯示底部的「查看詳情」按鈕
          footer: fullLink
            ? {
                type: "box",
                layout: "vertical",
                contents: [
                  {
                    type: "button",
                    style: "primary",
                    color: config.color,
                    action: {
                      type: "uri",
                      label: "點此查看詳情",
                      uri: fullLink,
                    },
                  },
                ],
              }
            : undefined,
        },
      };

      // 發送推播
      sendPush(user.lineUserId, flexContent).catch((err) => {
        console.error(`[LINE Push Error] (User: ${userId}):`, err.message);
      });
    }

    return newNotification;
  } catch (error) {
    console.error(
      `[Notification System Error] (User: ${userId}):`,
      error.message
    );
  }
};

module.exports = createNotification;

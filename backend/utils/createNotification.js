// backend/utils/createNotification.js
// V17.0 - 旗艦最終版：強制前端網域修正、自動路徑校驗、確保推播連結正確

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

      // [核心修復] 定義正確的前端基礎網址，並強制進行連結校驗
      const FRONTEND_BASE = "https://runpiggy-app-frontend.onrender.com";
      let fullLink = `${FRONTEND_BASE}/dashboard.html`;

      if (link) {
        let targetPath = link;

        // 1. 交叉檢查：如果傳入的是包含後端網域的絕對網址，強制剝離並轉為相對路徑
        if (link.includes("runpiggy-app-backend.onrender.com")) {
          try {
            const urlObj = new URL(link);
            targetPath = urlObj.pathname + urlObj.search;
          } catch (e) {
            targetPath = "/dashboard.html";
          }
        }

        // 2. 處理路徑補全與 .html 修正
        if (targetPath.startsWith("http")) {
          // 如果是其他外部連結或已修正的網址，直接採用
          fullLink = targetPath;
        } else {
          // 確保路徑開頭有斜線
          let cleanPath = targetPath.startsWith("/")
            ? targetPath
            : `/${targetPath}`;

          // [關鍵優化] 自動修正 dashboard 路徑遺漏 .html 的問題 (前端架構需求)
          if (
            cleanPath.startsWith("/dashboard") &&
            !cleanPath.includes(".html")
          ) {
            cleanPath = cleanPath.replace("/dashboard", "/dashboard.html");
          }

          fullLink = `${FRONTEND_BASE}${cleanPath}`;
        }
      }

      // [大師優化] 改用 Flex Message 物件，解決純文字連結失效問題
      const flexContent = {
        type: "flex",
        altText: `【${config.label}】${title}`,
        contents: {
          type: "bubble",
          size: "mega", // 使用 LINE 官方支援的合法尺寸 (避免日誌中的 size 報錯)
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
          // 底部「查看詳情」按鈕：強制指向校驗後的前端連結
          footer: {
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
          },
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

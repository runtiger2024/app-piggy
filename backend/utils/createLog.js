// backend/utils/createLog.js
// V16.1 - 旗艦極限穩定版：優化高併發效能，避免重複查詢 DB

const prisma = require("../config/db.js");

/**
 * 建立一筆操作日誌
 * @param {string} userId - 使用者 ID
 * @param {string} action - 動作代號 (例如 "CREATE_PACKAGE")
 * @param {string} targetId - 被操作的物件 ID
 * @param {string} details - 詳細資訊
 * @param {string} userEmail - (關鍵優化) 直接從 Controller 傳入 Email，省去 DB 查詢開銷
 */
const createLog = async (
  userId,
  action,
  targetId = "",
  details = "",
  userEmail = null
) => {
  try {
    let finalEmail = userEmail;

    // 如果調用端沒傳 Email (例如背景排程)，才去資料庫抓
    if (!finalEmail) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      finalEmail = user ? user.email : "Unknown System User";
    }

    await prisma.activityLog.create({
      data: {
        userId: userId,
        userEmail: finalEmail, // 儲存 Email 副本，方便未來查詢
        action: action,
        targetId: targetId,
        details: details,
      },
    });
  } catch (error) {
    // 日誌寫入失敗不應中斷主流程，僅在後台記錄錯誤
    console.error("!!! 寫入日誌失敗 !!!:", error.message);
  }
};

module.exports = createLog;

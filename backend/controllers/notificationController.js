// backend/controllers/notificationController.js
const prisma = require("../config/db.js");

/**
 * @description 僅取得未讀通知總數
 * @route GET /api/notifications/unread-count
 */
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;
    const count = await prisma.notification.count({
      where: { userId, isRead: false },
    });

    res.status(200).json({
      success: true,
      count,
    });
  } catch (error) {
    console.error("取得未讀數失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * @description 取得我的通知 (含未讀數量)
 * @route GET /api/notifications
 */
const getMyNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit } = req.query;
    const take = limit ? parseInt(limit) : 20;

    const [notifications, unreadCount] = await prisma.$transaction([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: take,
      }),
      prisma.notification.count({
        where: { userId, isRead: false },
      }),
    ]);

    res.status(200).json({
      success: true,
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error("取得通知失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * @description 標記單則通知為已讀
 * @route PUT /api/notifications/:id/read
 */
const markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    await prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });

    res.status(200).json({ success: true, message: "已標記為已讀" });
  } catch (error) {
    res.status(500).json({ success: false, message: "操作失敗" });
  }
};

/**
 * @description 全部標記為已讀
 * @route PUT /api/notifications/read-all
 */
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    res.status(200).json({ success: true, message: "全部已讀" });
  } catch (error) {
    res.status(500).json({ success: false, message: "操作失敗" });
  }
};

module.exports = {
  getUnreadCount, // <-- 確保匯出新函數
  getMyNotifications,
  markAsRead,
  markAllAsRead,
};

// backend/routes/notificationRoutes.js

const express = require("express");
const router = express.Router();
const {
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount, // 引入新增的控制器功能
} = require("../controllers/notificationController");

const { protect } = require("../middleware/authMiddleware");

// 所有通知功能都需要登入驗證
router.use(protect);

/**
 * 路由清單
 */

// 1. 取得未讀總數 (對應前端 checkUnreadCount)
router.get("/unread-count", getUnreadCount);

// 2. 取得我的通知列表 (支援 ?limit=20)
router.get("/", getMyNotifications);

// 3. 全部標記為已讀
router.put("/read-all", markAllAsRead);

// 4. 標記單則通知為已讀
router.put("/:id/read", markAsRead);

module.exports = router;

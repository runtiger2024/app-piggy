// backend/routes/furnitureRoutes.js
// V2025.1.0 - 傢俱代採購路由設定

const express = require("express");
const router = express.Router();
const {
  createFurnitureOrder,
  getMyFurnitureOrders,
  adminGetAllOrders,
  adminUpdateOrder,
  deleteOrder,
} = require("../controllers/furnitureController");

const { protect } = require("../middleware/authMiddleware.js");

// --- 客戶端功能 ---

// 提交申請
router.post("/apply", protect, createFurnitureOrder);

// 取得我的代採購清單
router.get("/my", protect, getMyFurnitureOrders);

// 撤回申請
router.delete("/:id", protect, deleteOrder);

// --- 管理端功能 (後台儀表板使用) ---

// 取得所有客戶的代採購訂單
router.get("/admin/all", protect, adminGetAllOrders);

// 更新訂單狀態、備註或發票網址
router.put("/admin/:id", protect, adminUpdateOrder);

module.exports = router;

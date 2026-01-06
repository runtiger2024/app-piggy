// backend/routes/furnitureRoutes.js
// V2026.1.1 - 傢俱代採購路由設定 (新增支援圖片上傳中間件)

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
const upload = require("../utils/upload.js"); // 引入上傳工具中間件

// --- 客戶端功能 ---

// 提交申請 (配合前端優化：新增支援單張參考圖片 refImage 上傳)
router.post("/apply", protect, upload.single("refImage"), createFurnitureOrder);

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

// backend/routes/furnitureRoutes.js
// V2026.1.7 - 傢俱代採購路由設定 (旗艦優化版：全面支援圖片上傳與狀態管理)

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
const upload = require("../utils/upload.js"); // 引入系統上傳工具

// --- 客戶端功能 (Member Side) ---

/**
 * @route   POST /api/furniture/apply
 * @desc    提交代採購申請 (支援上傳單張商品或報價單截圖 refImage)
 * @access  Private
 */
router.post("/apply", protect, upload.single("refImage"), createFurnitureOrder);

/**
 * @route   GET /api/furniture/my
 * @desc    取得當前登入用戶的代採購紀錄清單
 * @access  Private
 */
router.get("/my", protect, getMyFurnitureOrders);

/**
 * @route   DELETE /api/furniture/:id
 * @desc    撤回/刪除申請 (僅限 PENDING 待審核狀態)
 * @access  Private
 */
router.delete("/:id", protect, deleteOrder);

// --- 管理端功能 (Admin Side) ---

/**
 * @route   GET /api/furniture/admin/all
 * @desc    取得全系統所有客戶的代採購申請紀錄
 * @access  Private (Admin Required in protect logic)
 */
router.get("/admin/all", protect, adminGetAllOrders);

/**
 * @route   PUT /api/furniture/admin/:id
 * @desc    管理員更新訂單狀態、備註
 * @desc    支援上傳發票憑證或匯款截圖 (invoiceFile)
 * @access  Private (Admin Required)
 */
router.put(
  "/admin/:id",
  protect,
  upload.single("invoiceFile"),
  adminUpdateOrder
);

module.exports = router;

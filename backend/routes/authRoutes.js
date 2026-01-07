// backend/routes/authRoutes.js
// V16.0 - 旗艦整合版：保留 V10 所有功能，新增 LINE 登入與帳號綁定路由

const express = require("express");
const router = express.Router();

// 1. 匯入控制器 (包含原始功能與新增的 LINE 功能)
const {
  registerUser,
  loginUser,
  lineLogin, // [New] 引入 LINE 登入控制器
  bindLine, // [New] 引入 LINE 綁定控制器
  getMe,
  updateMe,
  forgotPassword,
  resetPassword,
  changePassword,
} = require("../controllers/authController");

// 2. 匯入保全中介軟體
const { protect } = require("../middleware/authMiddleware.js");

// 3. --- 設定路由 ---

// --- 公開路由 (無需 Token) ---

// 註冊與一般登入
router.post("/register", registerUser);
router.post("/login", loginUser);

// [新增] LINE 登入 (支援自動註冊與自動綁定)
router.post("/line-login", lineLogin);

// 忘記密碼流程
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);

// --- 受保護路由 (需經由 protect 中介軟體驗證 Token) ---

// 會員個人資料 (GET: 取得資料, PUT: 更新資料)
router.route("/me").get(protect, getMe).put(protect, updateMe);

// 修改密碼
router.route("/password").put(protect, changePassword);

// [新增] 帳號綁定 LINE (登入狀態下將 LINE ID 關聯至目前帳號)
router.post("/bind-line", protect, bindLine);

module.exports = router;

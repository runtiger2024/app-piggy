// backend/routes/aboutRoutes.js
// V2026.1.1 - 關於小跑豬/家具專線路由模組

const express = require("express");
const router = express.Router();
const { getAboutContent } = require("../controllers/aboutController");

/**
 * @route   GET /api/about
 * @desc    取得關於我們/家具專線說明文字內容
 * @access  Public / Client
 */
router.get("/", getAboutContent);

module.exports = router;

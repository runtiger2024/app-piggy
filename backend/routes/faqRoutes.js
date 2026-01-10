// backend/routes/faqRoutes.js
// V2026.1.1 - 常見問題路由模組

const express = require("express");
const router = express.Router();
const { getFaqs } = require("../controllers/faqController");

/**
 * @route   GET /api/faq
 * @desc    取得常見問題列表 (支援 category 與 search 查詢參數)
 * @access  Public / Client
 */
router.get("/", getFaqs);

module.exports = router;

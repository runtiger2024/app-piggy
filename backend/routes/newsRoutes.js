// backend/routes/newsRoutes.js
// V2026.1.1 - 公告系統路由模組

const express = require("express");
const router = express.Router();
const { getNews, getNewsById } = require("../controllers/newsController");

/**
 * @route   GET /api/news
 * @desc    取得所有已發佈的公告 (支援 category 與 search 查詢參數)
 * @access  Public / Client
 */
router.get("/", getNews);

/**
 * @route   GET /api/news/:id
 * @desc    取得單一公告詳細內容
 * @access  Public / Client
 */
router.get("/:id", getNewsById);

module.exports = router;

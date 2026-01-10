// backend/controllers/newsController.js
// V2026.1.1 - 2026 旗艦優化版：支援公告分類篩選與全文檢索功能

const prisma = require("../config/db.js");

/**
 * @description 取得所有已發佈的公告 (客戶端使用)
 * @route GET /api/news
 * @access Public (或經由 AuthMiddleware 驗證之會員)
 */
const getNews = async (req, res) => {
  try {
    const { category, search } = req.query;

    // 構建查詢條件
    const where = {
      isPublished: true, // 僅回傳已發佈的公告
    };

    // 1. 處理分類篩選
    if (category && category !== "ALL") {
      where.category = category;
    }

    // 2. 處理關鍵字搜尋 (標題或內容)
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { content: { contains: search, mode: "insensitive" } },
      ];
    }

    // 執行查詢
    const news = await prisma.news.findMany({
      where,
      orderBy: {
        createdAt: "desc", // 依照時間降序排列 (最新消息置頂)
      },
      // 可以限制回傳數量，避免一次載入過多
      take: 50,
    });

    res.status(200).json({
      success: true,
      count: news.length,
      news,
    });
  } catch (error) {
    console.error("取得公告列表失敗:", error);
    res.status(500).json({
      success: false,
      message: "伺服器錯誤，無法取得最新消息",
    });
  }
};

/**
 * @description 取得單一公告詳情 (點選查看全文)
 * @route GET /api/news/:id
 */
const getNewsById = async (req, res) => {
  try {
    const { id } = req.params;

    const newsItem = await prisma.news.findFirst({
      where: {
        id: id,
        isPublished: true,
      },
    });

    if (!newsItem) {
      return res.status(404).json({
        success: false,
        message: "找不到該公告內容或該公告尚未公開",
      });
    }

    res.status(200).json({
      success: true,
      newsItem,
    });
  } catch (error) {
    console.error("取得單一公告失敗:", error);
    res.status(500).json({
      success: false,
      message: "伺服器錯誤",
    });
  }
};

module.exports = {
  getNews,
  getNewsById,
};

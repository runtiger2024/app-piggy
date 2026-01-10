// backend/controllers/faqController.js
// V2026.1.1 - 2026 旗艦優化版：支援 FAQ 分類篩選與智慧檢索

const prisma = require("../config/db.js");

/**
 * @description 取得常見問題列表 (客戶端使用)
 * @route GET /api/faq
 * @access Public
 */
const getFaqs = async (req, res) => {
  try {
    const { category, search } = req.query;

    // 預設僅查詢啟用中的問題
    const where = {
      isActive: true,
    };

    // 1. 處理分類篩選 (LOGISTICS, PAYMENT, CUSTOMS, ACCOUNT)
    if (category && category !== "ALL") {
      where.category = category;
    }

    // 2. 處理關鍵字搜尋 (問題或答案)
    if (search) {
      where.OR = [
        { question: { contains: search, mode: "insensitive" } },
        { answer: { contains: search, mode: "insensitive" } },
      ];
    }

    // 執行查詢，並依照 order 欄位排序 (由管理員定義顯示順序)
    const faqs = await prisma.faq.findMany({
      where,
      orderBy: {
        order: "asc",
      },
    });

    res.status(200).json({
      success: true,
      count: faqs.length,
      faqs,
    });
  } catch (error) {
    console.error("取得 FAQ 失敗:", error);
    res.status(500).json({
      success: false,
      message: "伺服器錯誤，無法取得常見問題",
    });
  }
};

module.exports = {
  getFaqs,
};

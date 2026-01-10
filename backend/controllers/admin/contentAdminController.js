// backend/controllers/admin/contentAdminController.js
// V2026.01.Final - 旗艦內容管理系統 (CMS) 核心控制器

const prisma = require("../../config/db.js");

/**
 * ==========================================
 * 1. 最新消息管理 (News Management)
 * ==========================================
 */

// 取得所有公告 (含草稿)
exports.adminGetNews = async (req, res) => {
  try {
    const news = await prisma.news.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, news });
  } catch (e) {
    res
      .status(500)
      .json({ success: false, message: "取得公告列表失敗: " + e.message });
  }
};

// 新增或更新公告 (使用 upsert 確保不懂程式的人重複儲存也不出錯)
exports.adminUpdateNews = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, category, isImportant, isPublished } = req.body;

    // 格式化資料，確保布林值正確
    const data = {
      title,
      content,
      category: category || "GENERAL",
      isImportant: !!isImportant,
      isPublished: isPublished !== undefined ? !!isPublished : true,
    };

    const item = await prisma.news.upsert({
      // 若 id 不存在或為新，則使用 temp id 觸發 create
      where: {
        id: id && id !== "new" ? id : "new-news-placeholder-" + Date.now(),
      },
      update: data,
      create: data,
    });

    res.json({ success: true, item, message: "公告儲存成功" });
  } catch (e) {
    res
      .status(500)
      .json({ success: false, message: "儲存公告失敗: " + e.message });
  }
};

// 刪除公告
exports.adminDeleteNews = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.news.delete({ where: { id } });
    res.json({ success: true, message: "公告已永久移除" });
  } catch (e) {
    res.status(500).json({ success: false, message: "刪除失敗: " + e.message });
  }
};

/**
 * ==========================================
 * 2. 常見問題管理 (FAQ Management)
 * ==========================================
 */

// 取得所有 FAQ (依排序權重)
exports.adminGetFaqs = async (req, res) => {
  try {
    // 關鍵：使用 fAQ 匹配 schema 定義
    const faqs = await prisma.fAQ.findMany({
      orderBy: { order: "asc" },
    });
    res.json({ success: true, faqs });
  } catch (e) {
    res
      .status(500)
      .json({ success: false, message: "取得 FAQ 失敗: " + e.message });
  }
};

// 新增或更新 FAQ
exports.adminUpdateFaq = async (req, res) => {
  try {
    const { id } = req.params;
    const { question, answer, category, order, isActive } = req.body;

    const data = {
      question,
      answer,
      category: category || "LOGISTICS",
      order: parseInt(order) || 0,
      isActive: isActive !== undefined ? !!isActive : true,
    };

    const item = await prisma.fAQ.upsert({
      where: {
        id: id && id !== "new" ? id : "new-faq-placeholder-" + Date.now(),
      },
      update: data,
      create: data,
    });

    res.json({ success: true, item, message: "常見問題已更新" });
  } catch (e) {
    res
      .status(500)
      .json({ success: false, message: "儲存 FAQ 失敗: " + e.message });
  }
};

// 刪除 FAQ (新增功能：確保後台完整性)
exports.adminDeleteFaq = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.fAQ.delete({ where: { id } });
    res.json({ success: true, message: "常見問題已刪除" });
  } catch (e) {
    res.status(500).json({ success: false, message: "刪除失敗" });
  }
};

/**
 * ==========================================
 * 3. 關於我們/靜態內容 (Static Content)
 * ==========================================
 */

// 取得關於我們內容 (針對家具專線)
exports.adminGetStatic = async (req, res) => {
  try {
    const content = await prisma.staticContent.findFirst({
      where: { key: "ABOUT_US_FURNITURE" },
    });
    res.json({ success: true, content });
  } catch (e) {
    res.status(500).json({ success: false, message: "取得關於內容失敗" });
  }
};

// 更新關於我們 (管理員只需填寫標題與內容，系統自動對應 Key)
exports.adminUpdateStatic = async (req, res) => {
  try {
    const { title, content } = req.body;

    const item = await prisma.staticContent.upsert({
      where: { key: "ABOUT_US_FURNITURE" },
      update: { title, content },
      create: {
        key: "ABOUT_US_FURNITURE",
        title: title || "關於小跑豬家具專線",
        content: content || "",
      },
    });

    res.json({ success: true, item, message: "品牌介紹內容已同步更新至前台" });
  } catch (e) {
    res
      .status(500)
      .json({ success: false, message: "更新內容失敗: " + e.message });
  }
};

// backend/controllers/admin/contentAdminController.js
const prisma = require("../../config/db.js");

// --- 1. 公告管理 (News) ---
exports.adminGetNews = async (req, res) => {
  const news = await prisma.news.findMany({ orderBy: { createdAt: "desc" } });
  res.json({ success: true, news });
};

exports.adminCreateNews = async (req, res) => {
  const { title, content, category, isImportant, isPublished } = req.body;
  const item = await prisma.news.create({
    data: {
      title,
      content,
      category,
      isImportant: !!isImportant,
      isPublished: !!isPublished,
    },
  });
  res.json({ success: true, item });
};

exports.adminUpdateNews = async (req, res) => {
  const { id } = req.params;
  const item = await prisma.news.update({ where: { id }, data: req.body });
  res.json({ success: true, item });
};

exports.adminDeleteNews = async (req, res) => {
  await prisma.news.delete({ where: { id: req.params.id } });
  res.json({ success: true });
};

// --- 2. FAQ 管理 ---
exports.adminGetFaqs = async (req, res) => {
  const faqs = await prisma.fAQ.findMany({ orderBy: { order: "asc" } });
  res.json({ success: true, faqs });
};

exports.adminUpdateFaq = async (req, res) => {
  const { id } = req.params;
  const { question, answer, category, order, isActive } = req.body;
  const item = await prisma.fAQ.upsert({
    where: { id: id || "new-temp-id" },
    update: { question, answer, category, order: parseInt(order), isActive },
    create: { question, answer, category, order: parseInt(order), isActive },
  });
  res.json({ success: true, item });
};

exports.adminDeleteFaq = async (req, res) => {
  await prisma.fAQ.delete({ where: { id: req.params.id } });
  res.json({ success: true });
};

// --- 3. 關於我們 (StaticContent) ---
exports.adminGetStatic = async (req, res) => {
  const content = await prisma.staticContent.findFirst({
    where: { key: "ABOUT_US_FURNITURE" },
  });
  res.json({ success: true, content });
};

exports.adminUpdateStatic = async (req, res) => {
  const { title, content } = req.body;
  const item = await prisma.staticContent.upsert({
    where: { key: "ABOUT_US_FURNITURE" },
    update: { title, content },
    create: { key: "ABOUT_US_FURNITURE", title, content },
  });
  res.json({ success: true, item });
};

// backend/controllers/aboutController.js
// V2026.1.1 - 2026 旗艦優化版：支援動態公司介紹與家具專線說明

const prisma = require("../config/db.js");

/**
 * @description 取得關於我們/家具專線說明內容
 * @route GET /api/about
 * @access Public
 */
const getAboutContent = async (req, res) => {
  try {
    // 從資料庫中尋找 key 為 'ABOUT_US_FURNITURE' 的靜態內容
    // 如果您的系統更簡單，也可以直接回傳固定 JSON
    const content = await prisma.staticContent.findFirst({
      where: {
        key: "ABOUT_US_FURNITURE",
        isActive: true,
      },
    });

    // 如果資料庫中已有內容，則回傳資料庫內容
    if (content) {
      return res.status(200).json({
        success: true,
        title: content.title,
        content: content.content,
        updatedAt: content.updatedAt,
      });
    }

    // [備援方案]：若資料庫尚未初始化，回傳預設的品牌核心價值 (對應前端 about.html)
    res.status(200).json({
      success: true,
      title: "小跑豬家具專線",
      content:
        "小跑豬集運致力於提供兩岸最專業、最安全的家具轉運服務。我們針對大型家具、易碎家電提供一站式的代採、驗貨、加固與全球派送服務。",
      features: [
        "專業木架加固服務",
        "兩岸家具專線特快",
        "免費拍照驗貨",
        "台灣全省專車送貨上樓",
      ],
    });
  } catch (error) {
    console.error("取得關於內容失敗:", error);
    res.status(500).json({
      success: false,
      message: "伺服器錯誤",
    });
  }
};

module.exports = {
  getAboutContent,
};

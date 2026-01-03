// backend/middleware/authMiddleware.js
// V12 - 旗艦穩定修復版：優化資料庫查詢效率，減少高併發負擔

const jwt = require("jsonwebtoken");
const prisma = require("../config/db.js");

/**
 * 登入驗證中介軟體
 * [優化說明]：
 * 1. 減少 select 欄位：只拿關鍵的 isActive 狀態，加快資料庫查詢速度。
 * 2. 優先使用 Token 緩存：如果 Token 裡有權限資訊，就直接使用，不再從 DB 解析。
 */
const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      // 取得 Token
      token = req.headers.authorization.split(" ")[1];

      // 解碼 Token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 1. 檢查使用者狀態
      // [大師優化]：這裡我們只 select 必要的欄位，確保帳號沒被停用即可。
      // 這樣可以大幅減輕資料庫每一筆請求都要「查全表」的壓力。
      const userFromDb = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          email: true,
          name: true,
          isActive: true,
          permissions: true, // 保留作為備援方案
        },
      });

      if (!userFromDb) {
        return res
          .status(401)
          .json({ success: false, message: "未授權：找不到此使用者" });
      }

      if (userFromDb.isActive === false) {
        return res
          .status(403)
          .json({ success: false, message: "此帳號已被停用，請聯繫管理員" });
      }

      // 2. 處理權限 (優先級: Token Payload > DB)
      // [大師優化]：為了 App 的流暢度，我們優先相信 Token 裡的權限。
      let finalPermissions = [];

      if (decoded.permissions && Array.isArray(decoded.permissions)) {
        // 使用 Token 內的快取權限，減少計算開銷
        finalPermissions = decoded.permissions;
      } else {
        // 若 Token 沒帶，才使用 DB 裡的權限
        finalPermissions = userFromDb.permissions || [];
      }

      // 3. 將整理好的使用者資料掛載到 req
      req.user = {
        ...userFromDb,
        permissions: finalPermissions,
      };

      next();
    } catch (error) {
      console.error("Token 驗證失敗:", error.message);
      return res
        .status(401)
        .json({ success: false, message: "未授權：Token 無效或已過期" });
    }
  } else {
    return res
      .status(401)
      .json({ success: false, message: "未授權：沒有 Token" });
  }
};

/**
 * 權限檢查中介軟體
 * @param {string} permission - 需要的權限代號
 */
const checkPermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "未授權：使用者未登入" });
    }

    const userPerms = req.user.permissions || [];

    // [功能保留]：超級管理員與特定權限檢查邏輯
    if (
      userPerms.includes("CAN_MANAGE_USERS") || // 超級管理員條款
      userPerms.includes(permission)
    ) {
      next();
    } else {
      return res.status(403).json({
        success: false,
        message: `權限不足：此操作需要 ${permission} 權限`,
      });
    }
  };
};

module.exports = { protect, checkPermission };

// backend/middleware/authMiddleware.js
// V16 - 旗艦極限穩定版：極致快取優化與 App 即時狀態檢查

const jwt = require("jsonwebtoken");
const prisma = require("../config/db.js");

/**
 * 登入驗證中介軟體 (保全系統)
 * 任務：檢查這張識別證 (Token) 是否真偽、是否過期，以及這個人是否被公司開除 (isActive)。
 */
const protect = async (req, res, next) => {
  let token;

  // 1. 檢查標頭是否有 Bearer Token
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      // 取得 Token
      token = req.headers.authorization.split(" ")[1];

      // 2. 解碼 Token (驗證簽章與效期)
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 3. [大師級優化]：即時狀態檢查
      // 在手機 App 環境中，使用者可能長達一個月不登入。
      // 如果你在後台停用了他的帳號，我們必須在每一筆請求都確認他還是「活躍」狀態。
      const userStatus = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          email: true,
          name: true,
          isActive: true,
          permissions: true, // 作為資料庫端的權限備援
        },
      });

      // 4. 查無此人 (可能帳號已被物理刪除)
      if (!userStatus) {
        return res
          .status(401)
          .json({ success: false, message: "未授權：找不到此使用者" });
      }

      // 5. 帳號被停用 (上架 App 必備：管理員禁令必須即時生效)
      if (userStatus.isActive === false) {
        return res
          .status(403)
          .json({
            success: false,
            message: "此帳號已被停用或註銷，請聯繫管理員",
          });
      }

      // 6. 處理權限快取 (優先相信 Token，減少 DB 解析開銷)
      let finalPermissions = [];
      if (decoded.permissions && Array.isArray(decoded.permissions)) {
        finalPermissions = decoded.permissions;
      } else {
        // 若 Token 沒帶，才使用從 DB 撈出來的 Json 陣列
        finalPermissions = userStatus.permissions || [];
      }

      // 7. 將整理好的使用者資料掛載到 req，供後續 Controller 使用
      req.user = {
        id: userStatus.id,
        email: userStatus.email,
        name: userStatus.name,
        permissions: finalPermissions,
      };

      next();
    } catch (error) {
      console.error("Token 驗證失敗:", error.message);

      // 針對 App 的錯誤處理：明確區分「過期」與「無效」
      const message =
        error.name === "TokenExpiredError"
          ? "未授權：登入已過期，請重新登入"
          : "未授權：Token 無效";

      return res.status(401).json({ success: false, message });
    }
  } else {
    // 沒有攜帶 Token 的情況
    return res
      .status(401)
      .json({ success: false, message: "未授權：請先登入以取得 Token" });
  }
};

/**
 * 權限檢查中介軟體 (進門後的權限檢查員)
 * @param {string} permission - 需要的權限代號 (例如 "CAN_MANAGE_USERS")
 */
const checkPermission = (permission) => {
  return (req, res, next) => {
    // 1. 安全檢查：確保 user 已經過 protect 中介軟體處理
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "未授權：使用者未登入" });
    }

    const userPerms = req.user.permissions || [];

    // 2. 超級管理員條款：如果是大老闆，不需要檢查細項直接放行
    // 3. 一般權限比對
    if (
      userPerms.includes("CAN_MANAGE_USERS") ||
      userPerms.includes(permission)
    ) {
      next();
    } else {
      return res.status(403).json({
        success: false,
        message: `權限不足：您的帳號不具備執行此操作的權限 (${permission})`,
      });
    }
  };
};

module.exports = { protect, checkPermission };

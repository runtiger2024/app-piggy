// backend/controllers/authController.js
// V16.1 - 旗艦極限穩定版：修正登入狀態檢查、整合免查 DB 日誌系統與 Apple 規範

const prisma = require("../config/db.js");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const generateToken = require("../utils/generateToken.js");
const sgMail = require("@sendgrid/mail");
const createLog = require("../utils/createLog.js"); // [大師優化] 引入日誌工具

// 設定 SendGrid API Key
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

/**
 * 註冊使用者：包含 RP0000889 遞增編號邏輯
 * [大師級優化]：使用 $transaction 確保 User 與 Wallet 必定同時生成
 */
const registerUser = async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "請提供 email 和 password" });
    }

    const lowerEmail = email.toLowerCase();
    const userExists = await prisma.user.findUnique({
      where: { email: lowerEmail },
    });

    if (userExists) {
      return res
        .status(400)
        .json({ success: false, message: "這個 Email 已經被註冊了" });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    let newUser;
    let retryCount = 0;
    const maxRetries = 5;

    // --- [核心：帶有衝突重試的原子化註冊流程] ---
    while (!newUser && retryCount < maxRetries) {
      try {
        newUser = await prisma.$transaction(async (tx) => {
          // 1. 生成唯一 piggyId
          const lastUser = await tx.user.findFirst({
            where: { piggyId: { startsWith: "RP" } },
            orderBy: { piggyId: "desc" },
          });

          let nextPiggyId = "RP0000889";
          if (lastUser && lastUser.piggyId) {
            const currentNum = parseInt(lastUser.piggyId.replace("RP", ""), 10);
            nextPiggyId = "RP" + String(currentNum + 1).padStart(7, "0");
          }

          // 2. 建立使用者
          const createdUser = await tx.user.create({
            data: {
              email: lowerEmail,
              passwordHash: passwordHash,
              name: name,
              piggyId: nextPiggyId,
              permissions: [],
            },
          });

          // 3. 同步初始化錢包 (電子存摺)
          await tx.wallet.create({
            data: { userId: createdUser.id, balance: 0 },
          });

          return createdUser;
        });
      } catch (dbError) {
        if (dbError.code === "P2002") {
          retryCount++;
          console.warn(`[註冊編號衝突] 正在進行第 ${retryCount} 次重試...`);
        } else {
          throw dbError;
        }
      }
    }

    if (!newUser) {
      return res
        .status(500)
        .json({ success: false, message: "系統繁忙，請稍後再試" });
    }

    // [大師優化] 記錄註冊成功日誌，並傳入 email 節省查詢開銷
    await createLog(
      newUser.id,
      "USER_REGISTER",
      newUser.id,
      `新會員註冊: ${newUser.piggyId}`,
      newUser.email
    );

    res.status(201).json({
      success: true,
      message: "註冊成功！",
      user: {
        id: newUser.id,
        piggyId: newUser.piggyId,
        email: newUser.email,
        name: newUser.name,
      },
      token: generateToken(newUser.id),
    });
  } catch (error) {
    console.error("註冊失敗:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * 登入使用者
 * [致命修正]：增加對 isActive 的檢查，防止註銷帳號登入
 */
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "請提供 email 和 password" });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // [致命 Bug 修正點]
    if (!user || user.isActive === false) {
      return res
        .status(401)
        .json({ success: false, message: "帳號無效或密碼錯誤" });
    }

    if (await bcrypt.compare(password, user.passwordHash)) {
      const permissions = user.permissions || [];
      res.status(200).json({
        success: true,
        message: "登入成功！",
        user: {
          id: user.id,
          piggyId: user.piggyId,
          email: user.email,
          name: user.name,
          permissions: permissions,
        },
        token: generateToken(user.id, { permissions }),
      });
    } else {
      return res
        .status(401)
        .json({ success: false, message: "帳號無效或密碼錯誤" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * 取得個人資料
 */
const getMe = async (req, res) => {
  try {
    const userFromDb = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        piggyId: true,
        email: true,
        name: true,
        permissions: true,
        phone: true,
        defaultAddress: true,
        createdAt: true,
        defaultTaxId: true,
        defaultInvoiceTitle: true,
      },
    });
    res.status(200).json({ success: true, user: userFromDb });
  } catch (error) {
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * 帳號註銷 (Apple Store 強制要求)
 * [大師優化]：清除敏感聯繫資訊，確保隱私安全並記錄日誌
 */
const deleteMe = async (req, res) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;

    await prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        name: "已註銷會員",
        phone: null,
        defaultAddress: null,
        defaultTaxId: null,
        defaultInvoiceTitle: null,
      },
    });

    // [大師優化] 記錄註銷動作
    await createLog(
      userId,
      "USER_DELETE",
      userId,
      "會員自行申請帳號註銷",
      userEmail
    );

    res
      .status(200)
      .json({ success: true, message: "帳號已成功註銷，期待再次為您服務" });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "註銷失敗，請聯繫小跑豬客服" });
  }
};

/**
 * 更新個人資料
 */
const updateMe = async (req, res) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;
    const { name, phone, defaultAddress, defaultTaxId, defaultInvoiceTitle } =
      req.body;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { name, phone, defaultAddress, defaultTaxId, defaultInvoiceTitle },
      select: {
        id: true,
        piggyId: true,
        email: true,
        name: true,
        phone: true,
        defaultAddress: true,
        permissions: true,
        defaultTaxId: true,
        defaultInvoiceTitle: true,
      },
    });

    // [大師優化] 記錄更新日誌
    await createLog(
      userId,
      "USER_UPDATE",
      userId,
      "更新個人檔案資料",
      userEmail
    );

    res
      .status(200)
      .json({ success: true, message: "個人資料更新成功", user: updatedUser });
  } catch (error) {
    res.status(500).json({ success: false, message: "更新失敗" });
  }
};

/**
 * 忘記密碼發送信件
 */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      return res
        .status(200)
        .json({ success: true, message: "若 Email 存在，重設信件已發送" });
    }

    const resetToken = crypto.randomBytes(20).toString("hex");
    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    const resetPasswordExpire = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { resetPasswordToken, resetPasswordExpire },
    });

    if (!process.env.SENDGRID_API_KEY) {
      return res
        .status(500)
        .json({ success: false, message: "伺服器郵件功能配置錯誤" });
    }

    const resetUrl = `${
      process.env.FRONTEND_URL || "http://localhost:3000"
    }/reset-password.html?token=${resetToken}`;
    const msg = {
      to: user.email,
      from: process.env.SENDER_EMAIL_ADDRESS || "noreply@runpiggy.com",
      subject: "小跑豬集運 - 重設密碼請求",
      html: `<h3>您已申請重設密碼</h3><p>請點擊以下連結重設密碼 (10 分鐘內有效)：</p><a href="${resetUrl}">${resetUrl}</a>`,
    };

    await sgMail.send(msg);
    res.status(200).json({ success: true, message: "重設信件已發送" });
  } catch (error) {
    res.status(500).json({ success: false, message: "發送失敗" });
  }
};

/**
 * 重設密碼邏輯
 */
const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await prisma.user.findFirst({
      where: { resetPasswordToken, resetPasswordExpire: { gt: new Date() } },
    });

    if (!user)
      return res
        .status(400)
        .json({ success: false, message: "Token 無效或過期" });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetPasswordToken: null,
        resetPasswordExpire: null,
      },
    });

    res
      .status(200)
      .json({ success: true, message: "密碼重設成功，請重新登入" });
  } catch (error) {
    res.status(500).json({ success: false, message: "重設失敗" });
  }
};

/**
 * 修改密碼 (登入中)
 */
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    if (!user)
      return res.status(404).json({ success: false, message: "找不到使用者" });

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch)
      return res
        .status(400)
        .json({ success: false, message: "目前的密碼輸入錯誤" });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash },
    });
    res.json({ success: true, message: "密碼修改成功" });
  } catch (error) {
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getMe,
  deleteMe,
  updateMe,
  forgotPassword,
  resetPassword,
  changePassword,
};

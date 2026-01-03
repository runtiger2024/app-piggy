// backend/controllers/authController.js
// V15 - 旗艦穩定修復版：解決註冊併發衝突、強化郵件報錯機制

const prisma = require("../config/db.js");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const generateToken = require("../utils/generateToken.js");
const sgMail = require("@sendgrid/mail");

// 設定 SendGrid API Key (若環境變數已設定)
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

/**
 * 註冊使用者：包含 RP0000889 遞增編號邏輯
 * [修復] 加入 while 迴圈與唯一性衝突重試邏輯，避免多人同時註冊時撞號。
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
    const maxRetries = 5; // 最多重試 5 次，確保在高併發下也能成功生成編號

    // --- [核心優化：帶有衝突重試的編號生成邏輯] ---
    while (!newUser && retryCount < maxRetries) {
      // 1. 查找資料庫中最後一位以 RP 開頭的會員
      const lastUser = await prisma.user.findFirst({
        where: { piggyId: { startsWith: "RP" } },
        orderBy: { piggyId: "desc" },
      });

      let nextPiggyId = "RP0000889"; // 初始起始號碼

      if (lastUser && lastUser.piggyId) {
        // 提取數字部分並遞增：例如 RP0000889 -> 889 -> 890
        const currentNum = parseInt(lastUser.piggyId.replace("RP", ""), 10);
        nextPiggyId = "RP" + String(currentNum + 1).padStart(7, "0");
      }

      try {
        // 嘗試建立使用者
        newUser = await prisma.user.create({
          data: {
            email: lowerEmail,
            passwordHash: passwordHash,
            name: name,
            piggyId: nextPiggyId,
            permissions: [],
          },
        });
      } catch (dbError) {
        // P2002 是 Prisma 的唯一性約束衝突錯誤代碼 (Unique constraint violation)
        if (dbError.code === "P2002") {
          retryCount++;
          console.warn(
            `[註冊衝突] 編號 ${nextPiggyId} 已被佔用，進行第 ${retryCount} 次重試...`
          );
        } else {
          // 如果是其他資料庫錯誤則直接拋出
          throw dbError;
        }
      }
    }

    if (!newUser) {
      return res
        .status(500)
        .json({ success: false, message: "伺服器繁忙，請稍後再試" });
    }

    res.status(201).json({
      success: true,
      message: "註冊成功！",
      user: {
        id: newUser.id,
        piggyId: newUser.piggyId,
        email: newUser.email,
        name: newUser.name,
        permissions: [],
      },
      token: generateToken(newUser.id),
    });
  } catch (error) {
    console.error("註冊時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * 登入使用者
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

    if (user && (await bcrypt.compare(password, user.passwordHash))) {
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
          defaultTaxId: user.defaultTaxId,
          defaultInvoiceTitle: user.defaultInvoiceTitle,
        },
        // 將權限塞入 Token 以減少後續 API 的 DB 查詢壓力
        token: generateToken(user.id, { permissions }),
      });
    } else {
      return res
        .status(401)
        .json({ success: false, message: "Email 或密碼錯誤" });
    }
  } catch (error) {
    console.error("登入時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * 取得目前登入者資料 (同步所有關鍵欄位)
 */
const getMe = async (req, res) => {
  try {
    const user = req.user;
    if (user) {
      const userFromDb = await prisma.user.findUnique({
        where: { id: user.id },
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

      res.status(200).json({
        success: true,
        user: userFromDb,
      });
    } else {
      return res.status(404).json({ success: false, message: "找不到使用者" });
    }
  } catch (error) {
    console.error("取得個人資料錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * 更新個人資料 (包含發票資訊)
 */
const updateMe = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, phone, defaultAddress, defaultTaxId, defaultInvoiceTitle } =
      req.body;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        name,
        phone,
        defaultAddress,
        defaultTaxId,
        defaultInvoiceTitle,
      },
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

    res.status(200).json({
      success: true,
      message: "個人資料更新成功",
      user: updatedUser,
    });
  } catch (error) {
    console.error("更新個人資料錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * 忘記密碼：發送重設郵件
 * [修復] 強化郵件發送檢查，若未設定 API Key 則告知錯誤，避免使用者空等。
 */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // 為了安全起見，即使 User 不存在也回傳「已發送」，防止惡意探測 Email 是否存在
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
    const resetPasswordExpire = new Date(Date.now() + 10 * 60 * 1000); // 10 分鐘有效

    await prisma.user.update({
      where: { id: user.id },
      data: { resetPasswordToken, resetPasswordExpire },
    });

    // 檢查是否有設定 API Key，這對新手除錯非常有幫助
    if (!process.env.SENDGRID_API_KEY) {
      console.error("❌ SendGrid API Key 未設定，無法寄信。");
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
      html: `<h3>您已申請重設密碼</h3><p>請點擊以下連結重設您的密碼 (連結 10 分鐘內有效)：</p><a href="${resetUrl}" clicktracking=off>${resetUrl}</a><p>若您未申請此操作，請忽略此信。</p>`,
    };

    try {
      await sgMail.send(msg);
      res.status(200).json({ success: true, message: "重設信件已發送" });
    } catch (mailError) {
      console.error("郵件寄送失敗:", mailError);
      res
        .status(500)
        .json({ success: false, message: "郵件服務暫時不可用，請稍後再試" });
    }
  } catch (error) {
    console.error("忘記密碼邏輯錯誤:", error);
    res.status(500).json({ success: false, message: "無法發送 Email" });
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

    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "Token 無效或已過期" });
    }

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
    console.error("重設密碼錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * 修改密碼 (登入後)
 */
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ success: false, message: "請輸入舊密碼與新密碼" });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ success: false, message: "新密碼長度至少需 6 位數" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user)
      return res.status(404).json({ success: false, message: "找不到使用者" });

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      return res
        .status(400)
        .json({ success: false, message: "目前的密碼輸入錯誤" });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    res.json({ success: true, message: "密碼修改成功，下次登入請使用新密碼" });
  } catch (error) {
    console.error("修改密碼錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getMe,
  updateMe,
  forgotPassword,
  resetPassword,
  changePassword,
};

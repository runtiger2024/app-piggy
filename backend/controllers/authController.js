// backend/controllers/authController.js
// V16 - 旗艦極限穩定版：整合錢包自動初始化與 Apple 帳號註銷規範

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
 * [大師級優化]：使用 $transaction 確保 User 與 Wallet 綁定建立，避免「無錢包使用者」產生
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

    // --- [核心優化：帶有衝突重試與錢包初始化的原子化邏輯] ---
    while (!newUser && retryCount < maxRetries) {
      try {
        // 使用 $transaction 確保使用者和錢包這兩件事「要嘛一起成功，要嘛一起失敗」
        newUser = await prisma.$transaction(async (tx) => {
          // 1. 查找最後一位會員編號
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

          // 3. [關鍵修正] 立即為該使用者初始化錢包
          await tx.wallet.create({
            data: {
              userId: createdUser.id,
              balance: 0,
            },
          });

          return createdUser;
        });
      } catch (dbError) {
        if (dbError.code === "P2002") {
          retryCount++;
          console.warn(`[註冊衝突] 進行第 ${retryCount} 次重試...`);
        } else {
          throw dbError; // 其他錯誤直接拋出
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
 * 取得目前登入者資料
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

      res.status(200).json({ success: true, user: userFromDb });
    } else {
      return res.status(404).json({ success: false, message: "找不到使用者" });
    }
  } catch (error) {
    console.error("取得個人資料錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * [新增] 帳號註銷 (Apple Store 上架強制要求)
 * 為了保護使用者隱私，我們將 isActive 設為 false，並清除敏感聯絡資訊
 */
const deleteMe = async (req, res) => {
  try {
    const userId = req.user.id;
    await prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        name: "已註銷會員",
        phone: null,
        defaultAddress: null,
      },
    });

    res
      .status(200)
      .json({ success: true, message: "帳號已成功註銷，期待再次為您服務" });
  } catch (error) {
    console.error("註銷帳號錯誤:", error);
    res
      .status(500)
      .json({ success: false, message: "註銷帳號失敗，請聯繫客服" });
  }
};

/**
 * 更新個人資料
 */
const updateMe = async (req, res) => {
  try {
    const userId = req.user.id;
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

    res
      .status(200)
      .json({ success: true, message: "個人資料更新成功", user: updatedUser });
  } catch (error) {
    console.error("更新個人資料錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * 忘記密碼
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
      console.error("❌ SendGrid API Key 未設定");
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
      html: `<h3>您已申請重設密碼</h3><p>請點擊以下連結重設您的密碼 (連結 10 分鐘內有效)：</p><a href="${resetUrl}">${resetUrl}</a><p>若您未申請此操作，請忽略此信。</p>`,
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
    console.error("忘記密碼錯誤:", error);
    res.status(500).json({ success: false, message: "無法發送 Email" });
  }
};

/**
 * 重設密碼
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
 * 修改密碼
 */
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user)
      return res.status(404).json({ success: false, message: "找不到使用者" });

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch)
      return res
        .status(400)
        .json({ success: false, message: "目前的密碼輸入錯誤" });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    res.json({ success: true, message: "密碼修改成功" });
  } catch (error) {
    console.error("修改密碼錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getMe,
  deleteMe, // 記得導出這項 Apple 審核關鍵功能
  updateMe,
  forgotPassword,
  resetPassword,
  changePassword,
};

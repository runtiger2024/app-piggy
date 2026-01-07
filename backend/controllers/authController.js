// backend/controllers/authController.js
// V16.2 - 旗艦整合版：保留 V16.1 所有穩定特性，新增 LINE 登入與並行綁定機制

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

    // [大師優化] 記錄註冊成功日誌
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
 * LINE 登入：支援新用戶註冊與舊用戶自動綁定
 * [新增功能]：確保與一般登入並行，並生成推播所需的 lineUserId
 */
const lineLogin = async (req, res) => {
  try {
    const { lineUserId, email, name } = req.body;

    if (!lineUserId) {
      return res.status(400).json({ success: false, message: "LINE ID 無效" });
    }

    // 1. 優先透過 lineUserId 尋找使用者
    let user = await prisma.user.findUnique({
      where: { lineUserId },
    });

    // 2. 若找不到，嘗試透過 Email 尋找並自動綁定（實現模式並行）
    if (!user && email) {
      const existingUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (existingUser) {
        // 自動綁定 LINE ID
        user = await prisma.user.update({
          where: { id: existingUser.id },
          data: { lineUserId },
        });
        await createLog(
          user.id,
          "USER_LINE_BIND",
          user.id,
          "登入時自動綁定 LINE",
          user.email
        );
      }
    }

    // 3. 若仍找不到，則為全新的 LINE 用戶進行註冊
    if (!user) {
      let newUser;
      let retryCount = 0;
      const maxRetries = 5;
      const lowerEmail = email
        ? email.toLowerCase()
        : `${lineUserId}@line.temp`;

      while (!newUser && retryCount < maxRetries) {
        try {
          newUser = await prisma.$transaction(async (tx) => {
            const lastUser = await tx.user.findFirst({
              where: { piggyId: { startsWith: "RP" } },
              orderBy: { piggyId: "desc" },
            });

            let nextPiggyId = "RP0000889";
            if (lastUser && lastUser.piggyId) {
              const currentNum = parseInt(
                lastUser.piggyId.replace("RP", ""),
                10
              );
              nextPiggyId = "RP" + String(currentNum + 1).padStart(7, "0");
            }

            const createdUser = await tx.user.create({
              data: {
                email: lowerEmail,
                name: name || "LINE用戶",
                lineUserId: lineUserId,
                piggyId: nextPiggyId,
                isActive: true,
                permissions: [],
              },
            });

            await tx.wallet.create({
              data: { userId: createdUser.id, balance: 0 },
            });

            return createdUser;
          });
        } catch (dbError) {
          if (dbError.code === "P2002") {
            retryCount++;
          } else {
            throw dbError;
          }
        }
      }
      user = newUser;
      await createLog(
        user.id,
        "USER_REGISTER_LINE",
        user.id,
        `LINE快速註冊: ${user.piggyId}`,
        user.email
      );
    }

    // [安全性檢查] 防止註銷帳號透過 LINE 登入
    if (user.isActive === false) {
      return res.status(401).json({ success: false, message: "此帳號已註銷" });
    }

    const permissions = user.permissions || [];
    res.status(200).json({
      success: true,
      message: "LINE 登入成功",
      user: {
        id: user.id,
        piggyId: user.piggyId,
        email: user.email,
        name: user.name,
        permissions: permissions,
      },
      token: generateToken(user.id, { permissions }),
    });
  } catch (error) {
    console.error("LINE 登入錯誤:", error);
    res.status(500).json({ success: false, message: "LINE 登入失敗" });
  }
};

/**
 * 綁定 LINE 帳號 (已登入狀態下)
 */
const bindLine = async (req, res) => {
  try {
    const userId = req.user.id;
    const { lineUserId } = req.body;

    if (!lineUserId) {
      return res.status(400).json({ success: false, message: "缺失 LINE ID" });
    }

    // 檢查該 LINE ID 是否已被其他人綁定
    const conflict = await prisma.user.findUnique({ where: { lineUserId } });
    if (conflict && conflict.id !== userId) {
      return res
        .status(400)
        .json({ success: false, message: "此 LINE 帳號已被其他會員綁定" });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { lineUserId },
    });

    await createLog(
      userId,
      "USER_LINE_BIND",
      userId,
      "會員手動綁定 LINE",
      req.user.email
    );

    res.json({ success: true, message: "LINE 綁定成功" });
  } catch (error) {
    res.status(500).json({ success: false, message: "綁定失敗" });
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
        lineUserId: true, // 新增返回欄位
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
        lineUserId: null, // 同步清除 LINE 綁定
        defaultAddress: null,
        defaultTaxId: null,
        defaultInvoiceTitle: null,
      },
    });

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
    if (!user.passwordHash)
      return res
        .status(400)
        .json({
          success: false,
          message: "此帳號尚未設定密碼，請使用 LINE 登入",
        });

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
  lineLogin, // [新增]
  bindLine, // [新增]
  getMe,
  deleteMe,
  updateMe,
  forgotPassword,
  resetPassword,
  changePassword,
};

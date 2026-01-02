// backend/controllers/settingsController.js
// V2026.1.1 - 支援家具代採購設定與安全性遮罩邏輯

const prisma = require("../config/db.js");
const ratesManager = require("../utils/ratesManager.js");
const createLog = require("../utils/createLog.js");

/**
 * 定義預設設定與初始化邏輯
 * 當資料庫為空時，自動建立基礎配置
 */
const seedDefaultSettings = async () => {
  console.log("[System] 正在初始化系統設定...");

  const configs = [];

  // 1. 遷移/初始化 運費設定
  try {
    const currentRates = await ratesManager.getRates();
    configs.push({
      key: "rates_config",
      value: currentRates,
      category: "SHIPPING",
      description: "運費費率與常數設定 (JSON)",
    });
  } catch (e) {
    console.error("讀取運費設定失敗:", e);
  }

  // 2. 遷移/初始化 發票設定 (安全考量：金鑰不硬編碼)
  configs.push({
    key: "invoice_config",
    value: {
      merchantId: process.env.AMEGO_MERCHANT_ID || "",
      hashKey: process.env.AMEGO_HASH_KEY || "",
      apiUrl:
        process.env.AMEGO_API_URL || "https://invoice-api.amego.tw/json/f0401",
      enabled: false,
      notifyEmail: true,
    },
    category: "INVOICE",
    description: "電子發票 API 設定",
  });

  // 3. 遷移/初始化 Email 設定
  const adminEmails = process.env.ADMIN_EMAIL_RECIPIENT
    ? process.env.ADMIN_EMAIL_RECIPIENT.split(",").map((e) => e.trim())
    : [];

  configs.push({
    key: "email_config",
    value: {
      adminEmails: adminEmails,
      senderName: "小跑豬集運",
      isEnabled: true,
    },
    category: "EMAIL",
    description: "郵件通知設定",
  });

  // 4. 系統公告
  configs.push({
    key: "announcement",
    value: {
      enabled: false,
      text: "歡迎使用小跑豬集運系統！",
      color: "info",
    },
    category: "SYSTEM",
    description: "前台首頁公告內容",
  });

  // 5. [新增] 家具代採購設定
  configs.push({
    key: "furniture_config",
    value: {
      exchangeRate: 4.65,
      serviceFeeRate: 0.05,
      minServiceFee: 500,
    },
    category: "FURNITURE",
    description: "家具代採購匯率與服務費設定",
  });

  // 6. 銀行資訊
  configs.push({
    key: "bank_info",
    value: {
      bankName: "第一銀行 (007)",
      branch: "台南分行",
      account: "60110066477",
      holder: "跑得快國際貿易",
    },
    category: "PAYMENT",
    description: "轉帳匯款銀行資訊",
  });

  // 寫入資料庫
  for (const config of configs) {
    const exists = await prisma.systemSetting.findUnique({
      where: { key: config.key },
    });
    if (!exists) {
      await prisma.systemSetting.create({
        data: {
          key: config.key,
          value: config.value,
          category: config.category,
          description: config.description,
        },
      });
    }
  }
  console.log("[System] 系統設定初始化完成");
};

/**
 * @description 取得所有系統設定 (前端管理後台用)
 * @route GET /api/admin/settings
 */
const getAllSettings = async (req, res) => {
  try {
    const count = await prisma.systemSetting.count();
    if (count === 0) {
      await seedDefaultSettings();
    }

    const settingsList = await prisma.systemSetting.findMany();

    const result = {};
    settingsList.forEach((item) => {
      let val = item.value;

      // [Security Fix] 針對敏感性金鑰進行遮罩，防止明文傳輸至前端介面
      if (item.key === "invoice_config" && val && val.hashKey) {
        val = { ...val, hashKey: "********" };
      }

      result[item.key] = val;
    });

    res.status(200).json({ success: true, settings: result });
  } catch (error) {
    console.error("取得設定失敗:", error);
    res
      .status(500)
      .json({ success: false, message: "伺服器讀取設定時發生錯誤" });
  }
};

/**
 * @description 更新系統設定 (含防呆驗證與遮罩還原)
 * @route PUT /api/admin/settings
 */
const updateSettings = async (req, res) => {
  try {
    const updates = req.body; // 預期格式: { "rates_config": {...}, "furniture_config": {...} }

    if (!updates || typeof updates !== "object") {
      return res
        .status(400)
        .json({ success: false, message: "無效的請求資料格式" });
    }

    // 結構驗證與遮罩還原邏輯
    for (const [key, value] of Object.entries(updates)) {
      // 1. 運費設定檢查
      if (key === "rates_config") {
        if (!value.categories || !value.constants) {
          return res.status(400).json({
            success: false,
            message: "運費設定格式錯誤：缺少費率種類或常數定義",
          });
        }
      }

      // 2. 家具代採購設定檢查 [新增]
      else if (key === "furniture_config") {
        const { exchangeRate, serviceFeeRate, minServiceFee } = value;
        if (
          isNaN(parseFloat(exchangeRate)) ||
          isNaN(parseFloat(serviceFeeRate)) ||
          isNaN(parseFloat(minServiceFee))
        ) {
          return res.status(400).json({
            success: false,
            message: "家具代採購設定錯誤：匯率與費率必須為數字",
          });
        }
      }

      // 3. 發票設定還原遮罩 (Security Logic)
      else if (key === "invoice_config") {
        if (value.hashKey === "********") {
          const oldSetting = await prisma.systemSetting.findUnique({
            where: { key: "invoice_config" },
          });
          if (oldSetting && oldSetting.value && oldSetting.value.hashKey) {
            value.hashKey = oldSetting.value.hashKey;
          } else {
            value.hashKey = "";
          }
        }
      }

      // 4. 銀行設定基本檢查
      else if (key === "bank_info") {
        if (!value.bankName || !value.account) {
          return res
            .status(400)
            .json({ success: false, message: "銀行資訊不完整" });
        }
      }
    }

    // 執行批量更新
    const operations = Object.entries(updates).map(([key, value]) => {
      return prisma.systemSetting.update({
        where: { key },
        data: { value: value },
      });
    });

    await prisma.$transaction(operations);

    // 紀錄操作日誌
    await createLog(
      req.user.id,
      "UPDATE_SETTINGS",
      "SYSTEM",
      `管理員更新了 ${Object.keys(updates).join(", ")} 等系統設定`
    );

    res.status(200).json({ success: true, message: "設定已成功儲存" });
  } catch (error) {
    console.error("更新設定失敗:", error);
    res
      .status(500)
      .json({ success: false, message: "儲存設定時發生伺服器錯誤" });
  }
};

module.exports = {
  getAllSettings,
  updateSettings,
};

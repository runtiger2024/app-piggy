// backend/controllers/admin/settingsController.js
// V16 - 旗艦極限穩定版

const prisma = require("../../config/db.js");
const createLog = require("../../utils/createLog.js");
const { sendNewShipmentNotification } = require("../../utils/sendEmail.js");

/**
 * 取得所有系統設定
 */
const getSystemSettings = async (req, res) => {
  try {
    const settingsList = await prisma.systemSetting.findMany();
    const settings = {};

    settingsList.forEach((item) => {
      let val = item.value; // Prisma 的 Json 欄位已經是 JavaScript 物件

      // 敏感資訊遮罩處理
      if (item.key === "invoice_config" && val && val.hashKey) {
        val = { ...val, hashKey: "********" };
      }
      settings[item.key] = val;
    });

    res.status(200).json({ success: true, settings });
  } catch (error) {
    console.error("取得系統設定失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * 更新或新增系統設定
 */
const updateSystemSetting = async (req, res) => {
  try {
    const { key } = req.params;
    let { value, description } = req.body;

    if (value === undefined)
      return res.status(400).json({ success: false, message: "缺少設定值" });

    // 處理敏感資訊回填邏輯
    if (key === "invoice_config" && value && value.hashKey === "********") {
      const oldSetting = await prisma.systemSetting.findUnique({
        where: { key: "invoice_config" },
      });
      if (oldSetting && oldSetting.value && oldSetting.value.hashKey) {
        value.hashKey = oldSetting.value.hashKey;
      }
    }

    // [大師級重點]：直接將 value 物件存入，Prisma 會自動處理為 DB 的 Json
    await prisma.systemSetting.upsert({
      where: { key },
      update: { value: value, ...(description && { description }) },
      create: { key, value: value, description: description || "系統設定" },
    });

    await createLog(
      req.user.id,
      "UPDATE_SYSTEM_SETTING",
      "SYSTEM",
      `更新系統設定: ${key}`,
      req.user.email
    );

    res.status(200).json({ success: true, message: `設定 ${key} 已成功儲存` });
  } catch (error) {
    console.error(`更新設定 ${req.params.key} 失敗:`, error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * 測試 Email 發送功能
 */
const sendTestEmail = async (req, res) => {
  try {
    const user = req.user;
    if (!user.email)
      return res
        .status(400)
        .json({ success: false, message: "管理員帳號未設定 Email" });

    const mockShipment = {
      id: "TEST-SHIPMENT-" + Date.now(),
      recipientName: "測試管理員",
      totalCost: 1000,
    };

    const mockCustomer = {
      name: "系統測試人員",
      email: user.email,
    };

    await sendNewShipmentNotification(mockShipment, mockCustomer);

    res.json({
      success: true,
      message: `測試郵件已發送至管理員配置名單中`,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: "發送失敗: " + e.message });
  }
};

module.exports = {
  getSystemSettings,
  updateSystemSetting,
  sendTestEmail,
};

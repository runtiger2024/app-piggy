// backend/controllers/admin/settingsController.js
// V16.1 - 旗艦極限穩定版：新增附加服務管理 (ShipmentServiceItem) CRUD 功能

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

// ============================================================
// --- 新增：附加服務項目 (ShipmentServiceItem) 管理 ---
// ============================================================

/**
 * 取得所有附加服務清單 (管理後台用)
 */
const getServiceItems = async (req, res) => {
  try {
    const items = await prisma.shipmentServiceItem.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.status(200).json({ success: true, items });
  } catch (error) {
    console.error("取得附加服務清單失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * 新增附加服務項目
 */
const createServiceItem = async (req, res) => {
  try {
    const { name, description, price, unit, isActive } = req.body;

    if (!name) {
      return res
        .status(400)
        .json({ success: false, message: "請輸入服務名稱" });
    }

    const newItem = await prisma.shipmentServiceItem.create({
      data: {
        name,
        description,
        price: parseFloat(price) || 0,
        unit: unit || "PIECE",
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    await createLog(
      req.user.id,
      "CREATE_SERVICE_ITEM",
      newItem.id,
      `新增附加服務: ${name}`,
      req.user.email
    );

    res
      .status(201)
      .json({ success: true, item: newItem, message: "服務項目已建立" });
  } catch (error) {
    console.error("建立附加服務失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * 更新附加服務項目
 */
const updateServiceItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, unit, isActive } = req.body;

    const updatedItem = await prisma.shipmentServiceItem.update({
      where: { id },
      data: {
        name,
        description,
        price: price !== undefined ? parseFloat(price) : undefined,
        unit,
        isActive,
      },
    });

    await createLog(
      req.user.id,
      "UPDATE_SERVICE_ITEM",
      id,
      `更新附加服務: ${updatedItem.name}`,
      req.user.email
    );

    res
      .status(200)
      .json({ success: true, item: updatedItem, message: "服務項目已更新" });
  } catch (error) {
    console.error("更新附加服務失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * 刪除附加服務項目
 */
const deleteServiceItem = async (req, res) => {
  try {
    const { id } = req.params;

    const item = await prisma.shipmentServiceItem.findUnique({ where: { id } });
    if (!item) {
      return res.status(404).json({ success: false, message: "找不到該項目" });
    }

    await prisma.shipmentServiceItem.delete({ where: { id } });

    await createLog(
      req.user.id,
      "DELETE_SERVICE_ITEM",
      id,
      `刪除附加服務: ${item.name}`,
      req.user.email
    );

    res.status(200).json({ success: true, message: "服務項目已刪除" });
  } catch (error) {
    console.error("刪除附加服務失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

module.exports = {
  getSystemSettings,
  updateSystemSetting,
  sendTestEmail,
  // 匯出新功能
  getServiceItems,
  createServiceItem,
  updateServiceItem,
  deleteServiceItem,
};

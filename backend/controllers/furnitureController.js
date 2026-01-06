// backend/controllers/furnitureController.js
// V2026.1.8 - 旗艦完整版：支援會員參考圖、管理員發票上傳，並與資料庫 Schema 完全同步

const prisma = require("../config/db.js");
const createLog = require("../utils/createLog.js");
const createNotification = require("../utils/createNotification.js");

/**
 * @description 客戶提交傢俱代採購申請
 * @route POST /api/furniture/apply
 */
const createFurnitureOrder = async (req, res) => {
  try {
    const { factoryName, productName, quantity, priceRMB, note } = req.body;
    const userId = req.user.id;

    // [核心優化] 接收來自 Multer 中間件處理後的檔案路徑
    // 對應前端「點擊上傳商品或報價單截圖」功能
    const refImageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    if (!factoryName || !productName || !quantity || !priceRMB) {
      return res
        .status(400)
        .json({ success: false, message: "請填寫完整代採購資訊" });
    }

    // 1. 取得系統設定中的代採購配置 (與 calculatorController 保持一致使用 "furniture_config")
    const configSetting = await prisma.systemSetting.findUnique({
      where: { key: "furniture_config" },
    });

    // 解析設定值，若無則使用預設值
    let config = {
      exchangeRate: 4.65,
      serviceFeeRate: 0.05,
      minServiceFee: 500,
    };

    if (configSetting) {
      try {
        const dbValue =
          typeof configSetting.value === "string"
            ? JSON.parse(configSetting.value)
            : configSetting.value;
        config = { ...config, ...dbValue };
      } catch (e) {
        console.error("解析家具設定失敗，使用預設值");
      }
    }

    const exchangeRate = parseFloat(config.exchangeRate);
    const serviceFeeRate = parseFloat(config.serviceFeeRate);
    const minServiceFee = parseFloat(config.minServiceFee || 500);

    // 2. 計算費用
    const totalRMB = parseFloat(priceRMB) * parseInt(quantity);

    // 計算初步服務費 (TWD)
    const rawServiceFeeTWD = totalRMB * exchangeRate * serviceFeeRate;

    // [修正] 判斷是否低於最低服務費
    const finalServiceFeeTWD = Math.max(rawServiceFeeTWD, minServiceFee);

    // 貨值轉換台幣
    const productAmountTWD = totalRMB * exchangeRate;

    // 總金額 (台幣) = 貨值 TWD + 服務費 TWD (無條件進位)
    const totalAmountTWD = Math.ceil(productAmountTWD + finalServiceFeeTWD);

    // 3. 建立訂單 (欄位名稱必須與 schema.prisma 完全匹配)
    const furnitureOrder = await prisma.furnitureOrder.create({
      data: {
        userId,
        factoryName,
        productName,
        quantity: parseInt(quantity),
        priceRMB: parseFloat(priceRMB),
        // 儲存當時的費率與計算結果
        serviceFeeRMB: finalServiceFeeTWD / exchangeRate,
        exchangeRate,
        serviceFeeRate,
        totalAmountTWD,
        note,
        refImageUrl, // 這裡已在 Schema V15.2 中定義，不會再報錯 Unknown argument
        status: "PENDING",
      },
    });

    // 4. 記錄日誌
    await createLog(
      userId,
      "CREATE_FURNITURE_ORDER",
      furnitureOrder.id,
      `提交傢俱代採購申請: ${productName} (預估金額: NT$${totalAmountTWD})`
    );

    res.status(201).json({
      success: true,
      message: "代採購申請已送出，請等待管理員確認金額",
      order: furnitureOrder,
    });
  } catch (error) {
    console.error("建立傢俱訂單錯誤:", error);
    res
      .status(500)
      .json({ success: false, message: "伺服器處理申請時發生錯誤" });
  }
};

/**
 * @description 取得目前登入使用者的代採購清單
 * @route GET /api/furniture/my
 */
const getMyFurnitureOrders = async (req, res) => {
  try {
    const orders = await prisma.furnitureOrder.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, orders });
  } catch (error) {
    console.error("取得個人代採購清單失敗:", error);
    res.status(500).json({ success: false, message: "取得清單失敗" });
  }
};

/**
 * @description [管理員] 取得全系統代採購申請
 * @route GET /api/furniture/admin/all
 */
const adminGetAllOrders = async (req, res) => {
  try {
    const orders = await prisma.furnitureOrder.findMany({
      include: {
        user: { select: { piggyId: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, orders });
  } catch (error) {
    console.error("管理員取得代採購清單失敗:", error);
    res.status(500).json({ success: false, message: "取得資料失敗" });
  }
};

/**
 * @description [管理員] 更新代採購狀態與上傳發票憑證
 * @route PUT /api/furniture/admin/:id
 */
const adminUpdateOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminRemark, invoiceUrl } = req.body;

    // [優化] 處理管理員上傳的正式發票檔案 (若路由有配置 upload.single("invoiceFile"))
    const uploadedInvoiceUrl = req.file
      ? `/uploads/${req.file.filename}`
      : invoiceUrl;

    // 先檢查訂單是否存在
    const existingOrder = await prisma.furnitureOrder.findUnique({
      where: { id },
    });
    if (!existingOrder) {
      return res
        .status(404)
        .json({ success: false, message: "找不到該筆訂單" });
    }

    const updatedOrder = await prisma.furnitureOrder.update({
      where: { id },
      data: {
        status,
        adminRemark,
        invoiceUrl: uploadedInvoiceUrl,
        updatedAt: new Date(),
      },
    });

    // 發送通知給客戶
    await createNotification(
      updatedOrder.userId,
      "代採購狀態更新",
      `您的傢俱代採購單(${updatedOrder.productName}) 狀態已更新為: ${status}`,
      "FURNITURE",
      `/dashboard/furniture`
    );

    await createLog(
      req.user.id,
      "UPDATE_FURNITURE_ORDER",
      id,
      `更新代採購訂單(${id}) 狀態為: ${status}`
    );

    res.json({ success: true, message: "訂單已更新", order: updatedOrder });
  } catch (error) {
    console.error("更新代採購訂單失敗:", error);
    res.status(500).json({ success: false, message: "更新失敗" });
  }
};

/**
 * @description 客戶刪除待處理訂單
 * @route DELETE /api/furniture/:id
 */
const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await prisma.furnitureOrder.findFirst({
      where: { id, userId: req.user.id },
    });

    if (!order)
      return res.status(404).json({ success: false, message: "找不到訂單" });

    // 只有 PENDING 狀態可以刪除
    if (order.status !== "PENDING") {
      return res
        .status(400)
        .json({ success: false, message: "訂單處理中或已完成，無法刪除" });
    }

    await prisma.furnitureOrder.delete({ where: { id } });

    await createLog(
      req.user.id,
      "DELETE_FURNITURE_ORDER",
      id,
      `使用者撤回了代採購申請: ${order.productName}`
    );

    res.json({ success: true, message: "申請已撤回" });
  } catch (error) {
    console.error("刪除代採購訂單失敗:", error);
    res.status(500).json({ success: false, message: "操作失敗" });
  }
};

module.exports = {
  createFurnitureOrder,
  getMyFurnitureOrders,
  adminGetAllOrders,
  adminUpdateOrder,
  deleteOrder,
};

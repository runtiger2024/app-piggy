// backend/controllers/furnitureController.js
// V2026.1.11 - 旗艦終極修復版：完美整合 Cloudinary 雲端儲存，解決破圖問題，保留 V2026.1.10 全部數值驗證邏輯

const prisma = require("../config/db.js");
const createLog = require("../utils/createLog.js");
const createNotification = require("../utils/createNotification.js");

/**
 * @description 客戶提交傢俱代採購申請
 * @route POST /api/furniture/apply
 */
const createFurnitureOrder = async (req, res) => {
  try {
    // 1. 接收並初步驗證參數
    const { factoryName, productName, quantity, priceRMB, note, productUrl } =
      req.body;
    const userId = req.user.id;

    // [核心修復] 接收來自 Cloudinary 的完整 HTTPS 網址 (req.file.path)
    // 不再使用硬編碼的 "/uploads/" 路徑，避免與雲端網址衝突導致破圖
    const refImageUrl = req.file ? req.file.path : null;

    if (!factoryName || !productName || !quantity || !priceRMB) {
      return res
        .status(400)
        .json({ success: false, message: "請填寫完整代採購資訊" });
    }

    // [強健性優化] 強制轉換數值並檢查有效性，防止 NaN 導致資料庫 500 錯誤
    const parsedQuantity = parseInt(quantity);
    const parsedPriceRMB = parseFloat(priceRMB);

    if (isNaN(parsedQuantity) || isNaN(parsedPriceRMB)) {
      return res
        .status(400)
        .json({ success: false, message: "數量或單價格式不正確" });
    }

    // 2. 取得系統設定中的代採購配置 (furniture_config)
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

    const exchangeRate = parseFloat(config.exchangeRate) || 4.65;
    const serviceFeeRate = parseFloat(config.serviceFeeRate) || 0.05;
    const minServiceFee = parseFloat(config.minServiceFee || 500);

    // 3. 費用計算邏輯
    const totalRMB = parsedPriceRMB * parsedQuantity;

    // 計算初步服務費 (TWD)
    const rawServiceFeeTWD = totalRMB * exchangeRate * serviceFeeRate;

    // 判斷是否低於最低服務費
    const finalServiceFeeTWD = Math.max(rawServiceFeeTWD, minServiceFee);

    // 貨值轉換台幣
    const productAmountTWD = totalRMB * exchangeRate;

    // 總金額 (台幣) = 貨值 TWD + 服務費 TWD (採無條件進位)
    const totalAmountTWD = Math.ceil(productAmountTWD + finalServiceFeeTWD);

    // 4. 建立訂單 (欄位名稱與 schema.prisma 完全匹配)
    const furnitureOrder = await prisma.furnitureOrder.create({
      data: {
        userId,
        factoryName,
        productName,
        productUrl, // 儲存商品參考網址
        quantity: parsedQuantity,
        priceRMB: parsedPriceRMB,
        // 儲存當時的費率與計算結果
        serviceFeeRMB: finalServiceFeeTWD / exchangeRate,
        exchangeRate,
        serviceFeeRate,
        totalAmountTWD,
        note,
        refImageUrl, // 儲存 Cloudinary 完整圖片連結
        status: "PENDING",
      },
    });

    // 5. 記錄操作日誌
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
    res.status(500).json({
      success: false,
      message: "伺服器處理申請時發生錯誤",
      error: error.message,
    });
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

    // [核心修復] 處理管理員透過 Cloudinary 上傳的正式發票檔案 (直接使用完整路徑)
    const uploadedInvoiceUrl = req.file ? req.file.path : invoiceUrl;

    // 檢查訂單是否存在
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
 * @description 客戶刪除/撤回待處理訂單
 * @route DELETE /api/furniture/:id
 */
const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await prisma.furnitureOrder.findFirst({
      where: { id, userId: req.user.id },
    });

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "找不到該筆申請紀錄" });
    }

    // 限制：只有 PENDING (待審核) 狀態可以刪除
    if (order.status !== "PENDING") {
      return res.status(400).json({
        success: false,
        message: "訂單處理中或已完成，無法刪除或撤回",
      });
    }

    await prisma.furnitureOrder.delete({ where: { id } });

    await createLog(
      req.user.id,
      "DELETE_FURNITURE_ORDER",
      id,
      `使用者撤回了代採購申請: ${order.productName}`
    );

    res.json({ success: true, message: "申請已成功撤回" });
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

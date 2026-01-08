// backend/controllers/admin/furnitureAdminController.js
// V2026.1.6 - 終極修復版：補齊批量操作與 CRUD，確保匯出名稱與路由完全對應

const prisma = require("../../config/db.js");
const createLog = require("../../utils/createLog.js");
const createNotification = require("../../utils/createNotification.js");

/**
 * 內部輔助：狀態文字轉換
 */
function getStatusText(status) {
  const map = {
    PENDING: "待處理",
    PROCESSING: "處理中",
    PAID: "已支付工廠",
    COMPLETED: "已結案",
    CANCELLED: "已取消",
  };
  return map[status] || status;
}

/**
 * 取得所有傢俱代採購訂單 (支援分頁、狀態過濾與關鍵字搜尋)
 */
const getAllFurnitureOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (status) {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { factoryName: { contains: search, mode: "insensitive" } },
        { productName: { contains: search, mode: "insensitive" } },
        { user: { name: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [orders, total] = await prisma.$transaction([
      prisma.furnitureOrder.findMany({
        where,
        include: {
          user: {
            select: { name: true, email: true, phone: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: parseInt(limit),
      }),
      prisma.furnitureOrder.count({ where }),
    ]);

    const formattedOrders = orders.map((o) => ({
      ...o,
      serviceFee: Math.round(
        o.priceRMB * o.quantity * o.exchangeRate * o.serviceFeeRate
      ),
      totalTWD: o.totalAmountTWD,
      adminNote: o.adminRemark,
      serviceRate: o.serviceFeeRate * 100,
    }));

    res.status(200).json({
      success: true,
      orders: formattedOrders,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("管理員取得傢俱代採購訂單失敗:", error);
    res.status(500).json({ success: false, message: "伺服器處理時發生錯誤" });
  }
};

/**
 * 管理員手動建立代採購訂單
 */
const createFurnitureOrder = async (req, res) => {
  try {
    const {
      userId,
      factoryName,
      productName,
      quantity,
      priceRMB,
      exchangeRate,
      adminNote,
    } = req.body;

    if (!userId || !productName || !quantity || !priceRMB) {
      return res.status(400).json({ success: false, message: "必填欄位缺失" });
    }

    const rate = parseFloat(exchangeRate || 4.65);
    const sRate = 0.05; // 預設 5% 服務費

    const subtotalTWD = priceRMB * quantity * rate;
    const rawServiceFeeTWD = subtotalTWD * sRate;

    // 取得低消設定
    const configSetting = await prisma.systemSetting.findUnique({
      where: { key: "furniture_config" },
    });
    let minServiceFee = 500;
    if (configSetting) {
      const config =
        typeof configSetting.value === "string"
          ? JSON.parse(configSetting.value)
          : configSetting.value;
      minServiceFee = parseFloat(config.minServiceFee || 500);
    }

    const finalServiceFeeTWD = Math.max(rawServiceFeeTWD, minServiceFee);
    const totalAmountTWD = Math.ceil(subtotalTWD + finalServiceFeeTWD);

    const newOrder = await prisma.furnitureOrder.create({
      data: {
        userId,
        factoryName,
        productName,
        quantity: parseInt(quantity),
        priceRMB: parseFloat(priceRMB),
        exchangeRate: rate,
        serviceFeeRate: sRate,
        serviceFeeRMB: finalServiceFeeTWD / rate,
        totalAmountTWD,
        adminRemark: adminNote,
        status: "PROCESSING",
      },
    });

    await createLog(
      req.user.id,
      "CREATE_FURNITURE_ORDER",
      newOrder.id,
      `管理員建單: ${productName}`
    );
    res.status(201).json({ success: true, order: newOrder });
  } catch (error) {
    console.error("管理員建立傢俱訂單失敗:", error);
    res.status(500).json({ success: false, message: "建立失敗，請檢查資料" });
  }
};

/**
 * 更新訂單狀態與資訊 (含匯率、服務費率與管理員備註)
 */
const updateFurnitureOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, exchangeRate, serviceRate, adminNote } = req.body;

    const existingOrder = await prisma.furnitureOrder.findUnique({
      where: { id },
    });
    if (!existingOrder)
      return res.status(404).json({ success: false, message: "找不到該訂單" });

    const newRate =
      exchangeRate !== undefined
        ? parseFloat(exchangeRate)
        : existingOrder.exchangeRate;
    const newServiceRate =
      serviceRate !== undefined
        ? parseFloat(serviceRate) / 100
        : existingOrder.serviceFeeRate;

    const subtotalTWD =
      existingOrder.priceRMB * existingOrder.quantity * newRate;
    const rawServiceFeeTWD = subtotalTWD * newServiceRate;

    const configSetting = await prisma.systemSetting.findUnique({
      where: { key: "furniture_config" },
    });
    let minServiceFee = 500;
    if (configSetting) {
      const config =
        typeof configSetting.value === "string"
          ? JSON.parse(configSetting.value)
          : configSetting.value;
      minServiceFee = parseFloat(config.minServiceFee || 500);
    }

    const finalServiceFeeTWD = Math.max(rawServiceFeeTWD, minServiceFee);
    const totalAmountTWD = Math.ceil(subtotalTWD + finalServiceFeeTWD);

    const updatedOrder = await prisma.furnitureOrder.update({
      where: { id },
      data: {
        status: status || existingOrder.status,
        exchangeRate: newRate,
        serviceFeeRate: newServiceRate,
        serviceFeeRMB: finalServiceFeeTWD / newRate,
        totalAmountTWD,
        adminRemark:
          adminNote !== undefined ? adminNote : existingOrder.adminRemark,
        updatedAt: new Date(),
      },
    });

    await createLog(
      req.user.id,
      "UPDATE_FURNITURE_ORDER",
      id,
      `更新狀態: ${status}`
    );
    await createNotification(
      existingOrder.userId,
      "傢俱代採購狀態更新",
      `您的訂單(${existingOrder.productName}) 已更新為: ${getStatusText(
        status
      )}`,
      "FURNITURE",
      "/dashboard.html?tab=furniture"
    );

    res.status(200).json({ success: true, order: updatedOrder });
  } catch (error) {
    console.error("更新失敗:", error);
    res.status(500).json({ success: false, message: "更新失敗" });
  }
};

/**
 * 批量更新訂單狀態
 */
const bulkUpdateFurnitureStatus = async (req, res) => {
  try {
    const { ids, status } = req.body;
    await prisma.furnitureOrder.updateMany({
      where: { id: { in: ids } },
      data: { status, updatedAt: new Date() },
    });
    await createLog(
      req.user.id,
      "BULK_UPDATE_FURNITURE",
      null,
      `批量更新 ${ids.length} 筆訂單狀態`
    );
    res.status(200).json({ success: true, message: "更新成功" });
  } catch (error) {
    res.status(500).json({ success: false, message: "批量更新失敗" });
  }
};

/**
 * 刪除訂單 (單筆)
 */
const deleteFurnitureOrder = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.furnitureOrder.delete({ where: { id } });
    await createLog(
      req.user.id,
      "DELETE_FURNITURE_ORDER",
      id,
      `刪除單筆傢俱訂單`
    );
    res.status(200).json({ success: true, message: "訂單已刪除" });
  } catch (error) {
    res.status(500).json({ success: false, message: "刪除失敗" });
  }
};

/**
 * 批量刪除訂單
 * 注意：這裡匯出名稱與 adminRoutes 裡的 .bulkDeleteFurniture 一致
 */
const bulkDeleteFurniture = async (req, res) => {
  try {
    const { ids } = req.body;
    const deleteCount = await prisma.furnitureOrder.deleteMany({
      where: { id: { in: ids } },
    });
    await createLog(
      req.user.id,
      "BULK_DELETE_FURNITURE",
      null,
      `批量刪除 ${deleteCount.count} 筆傢俱訂單`
    );
    res.status(200).json({
      success: true,
      message: `已成功刪除 ${deleteCount.count} 筆訂單`,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "批量刪除失敗" });
  }
};

module.exports = {
  getAllFurnitureOrders,
  createFurnitureOrder,
  updateFurnitureOrder,
  bulkUpdateFurnitureStatus,
  deleteFurnitureOrder,
  bulkDeleteFurniture,
};

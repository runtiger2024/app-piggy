// backend/controllers/admin/furnitureAdminController.js
// V2026.1.1 - 修正欄位對照、同步金額計算邏輯、支援分頁搜尋

const prisma = require("../../config/db.js");
const createLog = require("../../utils/createLog.js");
const createNotification = require("../../utils/createNotification.js");

/**
 * 取得所有傢俱代採購訂單 (支援分頁、狀態過濾與關鍵字搜尋)
 */
const getAllFurnitureOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // 構建查詢條件
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

    // 執行查詢與總數統計
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

    // 格式化輸出，確保與前端欄位對齊 (例如計算 serviceFee 顯示值)
    const formattedOrders = orders.map((o) => ({
      ...o,
      // 計算用於顯示的服務費 (TWD)
      serviceFee: Math.round(
        o.priceRMB * o.quantity * o.exchangeRate * o.serviceFeeRate
      ),
      // 確保總額與資料庫一致
      totalTWD: o.totalAmountTWD,
      // 前端對應欄位名稱轉換
      adminNote: o.adminRemark,
      serviceRate: o.serviceFeeRate * 100, // 轉為百分比顯示
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
 * 更新訂單狀態與資訊 (含匯率、服務費率與管理員備註)
 */
const updateFurnitureOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, exchangeRate, serviceRate, adminNote } = req.body;

    const existingOrder = await prisma.furnitureOrder.findUnique({
      where: { id },
    });

    if (!existingOrder) {
      return res.status(404).json({ success: false, message: "找不到該訂單" });
    }

    // --- 同步金額計算邏輯 ---
    const newRate =
      exchangeRate !== undefined
        ? parseFloat(exchangeRate)
        : existingOrder.exchangeRate;
    // 前端傳入的是百分比 (如 5)，後端存儲需轉為小數 (如 0.05)
    const newServiceRate =
      serviceRate !== undefined
        ? parseFloat(serviceRate) / 100
        : existingOrder.serviceFeeRate;

    // 1. 人民幣貨值
    const subtotalRMB = existingOrder.priceRMB * existingOrder.quantity;
    // 2. 貨值轉台幣
    const subtotalTWD = subtotalRMB * newRate;
    // 3. 計算服務費 (台幣)
    const rawServiceFeeTWD = subtotalTWD * newServiceRate;

    // 取得系統最低服務費設定 (與 furnitureController 邏輯一致)
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
    // 4. 總金額 (無條件進位)
    const totalAmountTWD = Math.ceil(subtotalTWD + finalServiceFeeTWD);

    // 執行更新
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

    // 建立操作日誌
    await createLog(
      req.user.id,
      "UPDATE_FURNITURE_ORDER",
      id,
      `更新傢俱訂單 ${id}: 狀態 ${status}, 總額 NT$${totalAmountTWD}`
    );

    // 發送通知給客戶
    await createNotification(
      existingOrder.userId,
      "傢俱代採購狀態更新",
      `您的傢俱代採購單(${
        existingOrder.productName
      }) 狀態已更新為: ${getStatusText(status)}`,
      "FURNITURE",
      `/dashboard/furniture`
    );

    res.status(200).json({
      success: true,
      message: "訂單已更新並完成金額重算",
      order: updatedOrder,
    });
  } catch (error) {
    console.error("更新傢俱代採購訂單失敗:", error);
    res
      .status(500)
      .json({ success: false, message: "更新失敗，請檢查輸入格式" });
  }
};

/**
 * 刪除訂單 (僅限管理員)
 */
const deleteFurnitureOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.furnitureOrder.findUnique({ where: { id } });
    if (!order) {
      return res.status(404).json({ success: false, message: "找不到該訂單" });
    }

    await prisma.furnitureOrder.delete({ where: { id } });

    await createLog(
      req.user.id,
      "DELETE_FURNITURE_ORDER",
      id,
      `管理員刪除了傢俱代採購單: ${order.productName}`
    );

    res.status(200).json({ success: true, message: "訂單已永久刪除" });
  } catch (error) {
    console.error("刪除傢俱代採購訂單失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

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

module.exports = {
  getAllFurnitureOrders,
  updateFurnitureOrder,
  deleteFurnitureOrder,
};

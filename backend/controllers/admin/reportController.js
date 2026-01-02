// backend/controllers/admin/reportController.js
// V2026.1.1 - 完整整合統計數據與後台通知標籤 (Badges) 功能

const prisma = require("../../config/db.js");

/**
 * @description 獲取儀表板統計數據 (含紅圈通知數量)
 * @route GET /api/admin/stats
 */
const getDashboardStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 使用 Promise.all 並行查詢以提升效能
    const [
      totalRev,
      pendingRev,
      totalUser,
      newUserToday,
      pkgGroup,
      shipGroup,
      recentPkg,
      recentShip,
      furniturePendingCount, // [優化新增] 統計待處理家具單
      financePendingCount, // [優化新增] 統計待審核交易
    ] = await Promise.all([
      // 1. 已完成的總營收
      prisma.shipment.aggregate({
        where: { status: "COMPLETED" },
        _sum: { totalCost: true },
      }),
      // 2. 待付款的總額
      prisma.shipment.aggregate({
        where: { status: "PENDING_PAYMENT" },
        _sum: { totalCost: true },
      }),
      // 3. 總會員數
      prisma.user.count(),
      // 4. 今日新註冊
      prisma.user.count({
        where: { createdAt: { gte: today } },
      }),
      // 5. 包裹狀態分組統計
      prisma.package.groupBy({
        by: ["status"],
        _count: { id: true },
      }),
      // 6. 集運單狀態分組統計
      prisma.shipment.groupBy({
        by: ["status"],
        _count: { id: true },
      }),
      // 7. 最近 5 筆包裹
      prisma.package.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { email: true, name: true } } },
      }),
      // 8. 最近 5 筆集運單
      prisma.shipment.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { email: true, name: true } } },
      }),
      // 9. 待處理家具申請數 (PENDING)
      prisma.furnitureOrder.count({
        where: { status: "PENDING" },
      }),
      // 10. 待審核財務交易數 (PENDING)
      prisma.transaction.count({
        where: { status: "PENDING" },
      }),
    ]);

    // 格式化包裹統計數據
    const pkgStats = {};
    pkgGroup.forEach((p) => (pkgStats[p.status] = p._count.id));

    // 格式化集運單統計數據
    const shipStats = {};
    shipGroup.forEach((s) => (shipStats[s.status] = s._count.id));

    res.status(200).json({
      success: true,
      stats: {
        totalRevenue: totalRev._sum.totalCost || 0,
        pendingRevenue: pendingRev._sum.totalCost || 0,
        totalUsers: totalUser,
        newUsersToday: newUserToday,
        packageStats: pkgStats,
        shipmentStats: shipStats,
        recentPackages: recentPkg,
        recentShipments: recentShip,
        /**
         * [核心優化] 回傳 badges 物件，對應前端側邊欄紅點
         * 這裡定義了哪些狀態需要被視為「待辦事項」
         */
        badges: {
          packages: pkgStats["PENDING"] || 0, // 待入庫包裹
          shipments:
            (shipStats["PENDING_PAYMENT"] || 0) +
            (shipStats["PENDING_REVIEW"] || 0), // 待付款或已付待審
          furniture: furniturePendingCount, // 待報價/確認家具單
          finance: financePendingCount, // 待審核儲值/扣款
        },
      },
    });
  } catch (e) {
    console.error("[Stats Error]:", e);
    res.status(500).json({ success: false, message: "獲取統計數據失敗" });
  }
};

/**
 * @description 獲取系統操作日誌 (支援分頁與搜尋)
 */
const getActivityLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    const { search, action } = req.query;

    const where = {};
    if (search) {
      where.OR = [
        { userEmail: { contains: search, mode: "insensitive" } },
        { details: { contains: search, mode: "insensitive" } },
      ];
    }
    if (action) {
      where.action = { contains: action };
    }

    const [total, logs] = await prisma.$transaction([
      prisma.activityLog.count({ where }), //
      prisma.activityLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    res.status(200).json({
      success: true,
      logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (e) {
    console.error("[Logs Error]:", e);
    res.status(500).json({ success: false, message: "獲取日誌失敗" });
  }
};

/**
 * @description 生成每日營收與用戶報表
 */
const getDailyReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res
        .status(400)
        .json({ success: false, message: "請提供日期範圍" });
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // 使用原生查詢以處理 DATE_TRUNC，獲取趨勢數據
    const revenue = await prisma.$queryRaw`
      SELECT DATE_TRUNC('day', "updatedAt")::DATE as date, SUM("totalCost") as revenue 
      FROM "Shipment" 
      WHERE "status" = 'COMPLETED' 
        AND "updatedAt" >= ${start} 
        AND "updatedAt" <= ${end} 
      GROUP BY date 
      ORDER BY date ASC
    `;

    const users = await prisma.$queryRaw`
      SELECT DATE_TRUNC('day', "createdAt")::DATE as date, COUNT(id) as newusers 
      FROM "User" 
      WHERE "createdAt" >= ${start} 
        AND "createdAt" <= ${end} 
      GROUP BY date 
      ORDER BY date ASC
    `;

    // 確保數字類型正確
    const safeRevenue = revenue.map((r) => ({
      date: r.date,
      revenue: Number(r.revenue),
    }));
    const safeUsers = users.map((u) => ({
      date: u.date,
      newUsers: Number(u.newusers),
    }));

    res.status(200).json({
      success: true,
      report: { revenueData: safeRevenue, userData: safeUsers },
    });
  } catch (e) {
    console.error("[Report Error]:", e);
    res.status(500).json({ success: false, message: "報表生成錯誤" });
  }
};

module.exports = {
  getDashboardStats,
  getActivityLogs,
  getDailyReport,
};

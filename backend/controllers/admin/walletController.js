// backend/controllers/admin/walletController.js
// V2.1 - 強化審核工作流與資信透明化版 (完整保留 V2.0 功能並擴充批量處理與財務統計)
// 修正說明：修正引用路徑、確保函式定義順序、完善統計邏輯

const prisma = require("../../config/db.js");
const createLog = require("../../utils/createLog.js");
const createNotification = require("../../utils/createNotification.js");
const invoiceHelper = require("../../utils/invoiceHelper.js");

/**
 * 1. 取得全體會員錢包概覽 (管理員檢閱功能)
 * 支援搜尋 PiggyID, Email, Name 以及餘額區間篩選
 */
const getWalletsOverview = async (req, res) => {
  try {
    const { search, minBalance, maxBalance } = req.query;

    const where = {};
    if (search) {
      where.user = {
        OR: [
          { email: { contains: search, mode: "insensitive" } },
          { name: { contains: search, mode: "insensitive" } },
          { piggyId: { contains: search, mode: "insensitive" } },
        ],
      };
    }

    if (minBalance || maxBalance) {
      where.balance = {};
      if (minBalance) where.balance.gte = parseFloat(minBalance);
      if (maxBalance) where.balance.lte = parseFloat(maxBalance);
    }

    const wallets = await prisma.wallet.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            piggyId: true,
            name: true,
            email: true,
            phone: true,
            isActive: true,
          },
        },
      },
      orderBy: { balance: "desc" },
    });

    res.status(200).json({ success: true, wallets });
  } catch (error) {
    console.error("Admin getWalletsOverview error:", error);
    res.status(500).json({ success: false, message: "無法取得錢包概覽" });
  }
};

/**
 * 2. 取得特定會員錢包詳情與完整交易歷史
 * 用於管理員深入調查特定客戶的資信狀況
 */
const getWalletDetail = async (req, res) => {
  try {
    const { userId } = req.params;

    const wallet = await prisma.wallet.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            piggyId: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        transactions: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!wallet)
      return res
        .status(404)
        .json({ success: false, message: "找不到該會員的錢包" });

    res.status(200).json({ success: true, wallet });
  } catch (error) {
    console.error("getWalletDetail error:", error);
    res.status(500).json({ success: false, message: "讀取詳情失敗" });
  }
};

/**
 * 3. 取得交易紀錄列表 (支援篩選與分頁)
 */
const getTransactions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { status, type, search } = req.query;

    const where = {};
    if (status) where.status = status;
    if (type) where.type = type;

    if (search) {
      where.wallet = {
        user: {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
            { piggyId: { contains: search, mode: "insensitive" } },
          ],
        },
      };
    }

    const [total, transactions] = await prisma.$transaction([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          wallet: {
            include: {
              user: {
                select: { id: true, name: true, email: true, piggyId: true },
              },
            },
          },
        },
      }),
    ]);

    const formatted = transactions.map((tx) => ({
      ...tx,
      user: tx.wallet.user,
    }));

    res.status(200).json({
      success: true,
      transactions: formatted,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Admin getTransactions error:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * 4. 審核單筆交易 (同意儲值 / 駁回)
 */
const reviewTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, rejectReason } = req.body;

    const tx = await prisma.transaction.findUnique({
      where: { id },
      include: { wallet: { include: { user: true } } },
    });

    if (!tx) return res.status(404).json({ message: "找不到交易紀錄" });
    if (tx.status !== "PENDING")
      return res.status(400).json({ message: "此交易已處理過，無法再次審核" });

    if (action === "APPROVE") {
      let invoiceResult = null;
      let invoiceMsg = "";

      if (tx.type === "DEPOSIT" && tx.amount > 0) {
        try {
          invoiceResult = await invoiceHelper.createDepositInvoice(
            tx,
            tx.wallet.user
          );
          if (invoiceResult.success) {
            invoiceMsg = ` (發票:${invoiceResult.invoiceNumber})`;
          } else {
            invoiceMsg = ` (發票開立失敗: ${invoiceResult.message})`;
          }
        } catch (e) {
          console.error("Invoice helper error:", e);
        }
      }

      await prisma.$transaction(async (prismaTx) => {
        await prismaTx.transaction.update({
          where: { id },
          data: {
            status: "COMPLETED",
            invoiceNumber: invoiceResult?.invoiceNumber,
            invoiceDate: invoiceResult?.invoiceDate,
            invoiceRandomCode: invoiceResult?.randomCode,
            invoiceStatus: invoiceResult?.success
              ? "ISSUED"
              : invoiceResult
              ? "FAILED"
              : null,
          },
        });

        await prismaTx.wallet.update({
          where: { id: tx.walletId },
          data: { balance: { increment: tx.amount } },
        });
      });

      await createNotification(
        tx.wallet.userId,
        "儲值成功",
        `您申請的 $${tx.amount.toLocaleString()} 儲值已核准並入帳。`,
        "WALLET",
        "/dashboard.html?tab=wallet"
      );
      await createLog(
        req.user.id,
        "APPROVE_DEPOSIT",
        id,
        `核准儲值 $${tx.amount}${invoiceMsg}`
      );
      res.status(200).json({ success: true, message: `核准成功${invoiceMsg}` });
    } else {
      await prisma.transaction.update({
        where: { id },
        data: {
          status: "REJECTED",
          description: `${tx.description} (駁回原因: ${
            rejectReason || "資料不符"
          })`,
        },
      });

      await createNotification(
        tx.wallet.userId,
        "儲值申請已駁回",
        `您的儲值申請已被駁回，原因：${rejectReason || "資料不符"}。`,
        "WALLET",
        "tab-wallet"
      );
      await createLog(
        req.user.id,
        "REJECT_DEPOSIT",
        id,
        `駁回儲值申請，原因：${rejectReason || "無"}`
      );
      res.status(200).json({ success: true, message: "已駁回申請" });
    }
  } catch (error) {
    console.error("Review error:", error);
    res.status(500).json({ success: false, message: "處理失敗" });
  }
};

/**
 * 5. 批量處理審核 (Bulk Review)
 * 提升管理員效率，一次處理多筆 PENDING 儲值
 */
const bulkReviewTransactions = async (req, res) => {
  try {
    const { ids, action, rejectReason } = req.body;
    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ message: "無效的 ID 列表" });

    const results = { success: 0, failed: 0 };

    for (const id of ids) {
      try {
        const tx = await prisma.transaction.findUnique({
          where: { id },
          include: { wallet: { include: { user: true } } },
        });

        if (!tx || tx.status !== "PENDING") {
          results.failed++;
          continue;
        }

        // 批量處理時，為了防止大量開票請求導致逾時，這裡採簡化審核邏輯（或可循環調用 reviewTransaction）
        if (action === "APPROVE") {
          await prisma.$transaction(async (ptx) => {
            await ptx.transaction.update({
              where: { id },
              data: { status: "COMPLETED" },
            });
            await ptx.wallet.update({
              where: { id: tx.walletId },
              data: { balance: { increment: tx.amount } },
            });
          });
          results.success++;
        } else {
          await prisma.transaction.update({
            where: { id },
            data: { status: "REJECTED" },
          });
          results.success++;
        }
      } catch (e) {
        results.failed++;
      }
    }

    await createLog(
      req.user.id,
      "BULK_REVIEW_WALLET",
      null,
      `批量審核交易: 成功 ${results.success}, 失敗 ${results.failed}`
    );
    res.json({
      success: true,
      results,
      message: `批量處理完成，成功: ${results.success} 筆`,
    });
  } catch (error) {
    console.error("Bulk review error:", error);
    res.status(500).json({ message: "批量處理出錯" });
  }
};

/**
 * 6. 手動修改交易紀錄 (CRUD - Update)
 * 用於修正統編、抬頭或備註，限非完成狀態
 */
const updateTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, description, taxId, invoiceTitle } = req.body;

    const tx = await prisma.transaction.findUnique({ where: { id } });
    if (!tx) return res.status(404).json({ message: "交易不存在" });
    if (tx.status === "COMPLETED")
      return res.status(400).json({
        message: "已完成交易不可修改金額，請使用「人工調整」功能進行補款或扣款",
      });

    const updatedTx = await prisma.transaction.update({
      where: { id },
      data: {
        amount: amount ? parseFloat(amount) : undefined,
        description,
        taxId,
        invoiceTitle,
      },
    });

    await createLog(
      req.user.id,
      "UPDATE_TRANSACTION",
      id,
      `修改交易內容: ${id}`
    );
    res.json({ success: true, transaction: updatedTx });
  } catch (error) {
    res.status(500).json({ success: false, message: "更新失敗" });
  }
};

/**
 * 7. 刪除交易紀錄 (CRUD - Delete)
 */
const deleteTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const tx = await prisma.transaction.findUnique({ where: { id } });

    if (!tx) return res.status(404).json({ message: "找不到紀錄" });
    if (tx.status === "COMPLETED")
      return res
        .status(400)
        .json({ message: "已完成交易不可刪除，以免造成財務帳目不一致" });

    await prisma.transaction.delete({ where: { id } });
    await createLog(
      req.user.id,
      "DELETE_TRANSACTION",
      id,
      `刪除交易紀錄: ${id}`
    );
    res.json({ success: true, message: "交易紀錄已刪除" });
  } catch (error) {
    res.status(500).json({ success: false, message: "刪除失敗" });
  }
};

/**
 * 8. 手動調整會員餘額 (人工加扣款)
 */
const manualAdjust = async (req, res) => {
  try {
    const { userId, amount, note } = req.body;
    const adjustAmount = parseFloat(amount);

    if (!userId || isNaN(adjustAmount) || adjustAmount === 0)
      return res.status(400).json({ message: "參數錯誤" });

    const wallet = await prisma.wallet.upsert({
      where: { userId },
      update: {},
      create: { userId, balance: 0 },
    });

    await prisma.$transaction(async (prismaTx) => {
      await prismaTx.transaction.create({
        data: {
          walletId: wallet.id,
          amount: adjustAmount,
          type: "ADJUST",
          status: "COMPLETED",
          description: note || "管理員手動調整",
        },
      });
      await prismaTx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: adjustAmount } },
      });
    });

    await createNotification(
      userId,
      "錢包餘額變動",
      `管理員執行了人工調整 $${Math.abs(
        adjustAmount
      ).toLocaleString()}，備註：${note || "無"}。`,
      "WALLET",
      "tab-wallet"
    );
    await createLog(
      req.user.id,
      "MANUAL_ADJUST",
      userId,
      `手動調整金額: ${adjustAmount}`
    );
    res.status(200).json({ success: true, message: "餘額調整成功" });
  } catch (error) {
    console.error("Manual adjust error:", error);
    res.status(500).json({ success: false, message: "調整失敗" });
  }
};

/**
 * 9. 手動補開發票
 */
const manualIssueDepositInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const tx = await prisma.transaction.findUnique({
      where: { id },
      include: { wallet: { include: { user: true } } },
    });

    if (!tx || tx.type !== "DEPOSIT" || tx.status !== "COMPLETED") {
      return res
        .status(400)
        .json({ message: "不符合補開條件（僅限已完成的儲值交易）" });
    }

    const result = await invoiceHelper.createDepositInvoice(tx, tx.wallet.user);
    if (result.success) {
      await prisma.transaction.update({
        where: { id },
        data: {
          invoiceNumber: result.invoiceNumber,
          invoiceDate: result.invoiceDate,
          invoiceRandomCode: result.randomCode,
          invoiceStatus: "ISSUED",
        },
      });
      await createLog(
        req.user.id,
        "MANUAL_INVOICE",
        id,
        `補開儲值發票: ${result.invoiceNumber}`
      );
      return res.json({
        success: true,
        message: "補開成功",
        invoiceNumber: result.invoiceNumber,
      });
    }
    res.status(400).json({ success: false, message: result.message });
  } catch (error) {
    res.status(500).json({ success: false, message: "系統錯誤" });
  }
};

/**
 * 10. 財務統計數據
 * 用於管理員儀表板，顯示系統資金概況
 */
const getFinanceStats = async (req, res) => {
  try {
    const totalBalance = await prisma.wallet.aggregate({
      _sum: { balance: true },
    });
    const pendingDeposits = await prisma.transaction.aggregate({
      where: { type: "DEPOSIT", status: "PENDING" },
      _sum: { amount: true },
      _count: true,
    });

    // 今日收入 (已完成的儲值)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIncome = await prisma.transaction.aggregate({
      where: {
        type: "DEPOSIT",
        status: "COMPLETED",
        createdAt: { gte: today },
      },
      _sum: { amount: true },
    });

    res.json({
      success: true,
      stats: {
        systemTotalBalance: totalBalance._sum.balance || 0,
        pendingDepositAmount: pendingDeposits._sum.amount || 0,
        pendingDepositCount: pendingDeposits._count || 0,
        todayIncome: todayIncome._sum.amount || 0,
      },
    });
  } catch (error) {
    console.error("getFinanceStats error:", error);
    res.status(500).json({ message: "統計讀取失敗" });
  }
};

module.exports = {
  getWalletsOverview,
  getWalletDetail,
  getTransactions,
  reviewTransaction,
  bulkReviewTransactions,
  updateTransaction,
  deleteTransaction,
  manualAdjust,
  manualIssueDepositInvoice,
  getFinanceStats,
};

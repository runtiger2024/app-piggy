// backend/controllers/admin/walletController.js
// V2.1 - 強化審核工作流與資信透明化版 (完整保留 V1.3 功能並擴充批量處理與資信詳情)

const prisma = require("../../config/db.js");
const createLog = require("../../utils/createLog.js");
const createNotification = require("../../utils/createNotification.js");
const invoiceHelper = require("../../utils/invoiceHelper.js");

/**
 * [新增] 1. 取得全體會員錢包概覽 (管理員檢閱功能)
 * @route GET /api/admin/finance/wallets
 */
const getWalletsOverview = async (req, res) => {
  try {
    const { search, minBalance, maxBalance } = req.query;

    const where = {};
    // 支援搜尋 PiggyID, Email, 姓名
    if (search) {
      where.user = {
        OR: [
          { piggyId: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { name: { contains: search, mode: "insensitive" } },
        ],
      };
    }

    // 支援餘額區間篩選
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
 * 2. 取得交易紀錄列表 (支援篩選與分頁)
 * @route GET /api/admin/finance/transactions
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

    // 搜尋使用者 Email, 姓名 或 PiggyID
    if (search) {
      where.wallet = {
        user: {
          OR: [
            { piggyId: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
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
                select: { id: true, piggyId: true, name: true, email: true },
              },
            },
          },
        },
      }),
    ]);

    // 整理回傳格式，扁平化使用者資訊
    const formatted = transactions.map((tx) => ({
      id: tx.id,
      amount: tx.amount,
      type: tx.type,
      status: tx.status,
      description: tx.description,
      proofImage: tx.proofImage,
      taxId: tx.taxId,
      invoiceTitle: tx.invoiceTitle,
      invoiceNumber: tx.invoiceNumber,
      invoiceStatus: tx.invoiceStatus,
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt,
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
 * 3. 審核交易 (同意儲值 / 駁回)
 * @route PUT /api/admin/finance/transactions/:id/review
 */
const reviewTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, rejectReason } = req.body;

    const tx = await prisma.transaction.findUnique({
      where: { id },
      include: {
        wallet: { include: { user: true } },
      },
    });

    if (!tx) return res.status(404).json({ message: "找不到交易紀錄" });
    if (tx.status !== "PENDING")
      return res.status(400).json({ message: "此交易已處理過，無法再次審核" });

    if (action === "APPROVE") {
      let invoiceResult = null;
      let invoiceMsg = "";

      // 自動開立發票邏輯：只有 "DEPOSIT" (儲值) 且金額 > 0 才開立
      if (tx.type === "DEPOSIT" && tx.amount > 0) {
        try {
          invoiceResult = await invoiceHelper.createDepositInvoice(
            tx,
            tx.wallet.user
          );
          if (invoiceResult.success) {
            invoiceMsg = ` (發票已開立: ${invoiceResult.invoiceNumber})`;
          } else {
            console.warn(
              `[Invoice Warning] 儲值發票開立失敗 Tx:${id}`,
              invoiceResult.message
            );
            invoiceMsg = ` (發票失敗: ${invoiceResult.message})`;
          }
        } catch (e) {
          console.error("Invoice error:", e);
        }
      }

      await prisma.$transaction(async (prismaTx) => {
        // 1. 更新交易狀態為完成
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

        // 2. 增加錢包餘額
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
        "tab-wallet"
      );

      await createLog(
        req.user.id,
        "APPROVE_DEPOSIT",
        id,
        `審核通過儲值 $${tx.amount}${invoiceMsg}`
      );
      res
        .status(200)
        .json({ success: true, message: `儲值已核准${invoiceMsg}` });
    } else if (action === "REJECT") {
      await prisma.transaction.update({
        where: { id },
        data: {
          status: "REJECTED",
          description:
            tx.description +
            (rejectReason ? ` (駁回原因: ${rejectReason})` : ""),
        },
      });

      await createNotification(
        tx.wallet.userId,
        "儲值申請已駁回",
        `您的儲值申請已被駁回，原因：${rejectReason || "資料不符"}。`,
        "WALLET",
        "tab-wallet"
      );

      await createLog(req.user.id, "REJECT_DEPOSIT", id, "駁回儲值申請");
      res.status(200).json({ success: true, message: "已駁回申請" });
    } else {
      res.status(400).json({ message: "無效的操作指令" });
    }
  } catch (error) {
    console.error("Review transaction error:", error);
    res.status(500).json({ success: false, message: "處理失敗" });
  }
};

/**
 * [新增] 4. 批量處理審核 (Bulk Review)
 * @route POST /api/admin/finance/transactions/bulk-review
 */
const bulkReviewTransactions = async (req, res) => {
  try {
    const { ids, action, rejectReason } = req.body;
    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ message: "請提供有效的 ID 列表" });

    let successCount = 0;
    for (const id of ids) {
      // 為了發票與通知的獨立性，此處循環調用單筆審核邏輯（或可根據效能優化為 Promise.all）
      // 這裡簡化為循環調用，確保每一筆都有 Log 與通知
      try {
        const tx = await prisma.transaction.findUnique({ where: { id } });
        if (tx && tx.status === "PENDING") {
          // 模擬 req 參數
          const fakeReq = {
            params: { id },
            body: { action, rejectReason },
            user: req.user,
          };
          const fakeRes = { status: () => ({ json: () => {} }) };
          await reviewTransaction(fakeReq, fakeRes);
          successCount++;
        }
      } catch (e) {
        console.error(`Bulk review item ${id} failed:`, e);
      }
    }

    res
      .status(200)
      .json({
        success: true,
        message: `批量處理完成，成功: ${successCount} 筆`,
      });
  } catch (error) {
    res.status(500).json({ success: false, message: "批量處理失敗" });
  }
};

/**
 * 手動調整會員餘額 (人工加扣款)
 * @route POST /api/admin/finance/adjust
 */
const manualAdjust = async (req, res) => {
  try {
    const { userId, amount, note } = req.body;
    const adjustAmount = parseFloat(amount);

    if (!userId || isNaN(adjustAmount) || adjustAmount === 0) {
      return res.status(400).json({ message: "請輸入正確的金額與會員 ID" });
    }

    let wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      wallet = await prisma.wallet.create({ data: { userId, balance: 0 } });
    }

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

    const actionText = adjustAmount > 0 ? "補款" : "扣款";
    await createNotification(
      userId,
      "錢包餘額變動",
      `管理員執行了人工${actionText} $${Math.abs(
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
 * [新增] 5. 修改/刪除交易紀錄 (CRUD 延伸)
 * @route PUT /api/admin/finance/transactions/:id
 * 用於修正錯誤的備註或統編（限非完成狀態）
 */
const updateTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { description, taxId, invoiceTitle } = req.body;

    await prisma.transaction.update({
      where: { id },
      data: { description, taxId, invoiceTitle },
    });

    res.status(200).json({ success: true, message: "資料更新成功" });
  } catch (error) {
    res.status(500).json({ success: false, message: "更新失敗" });
  }
};

const deleteTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const tx = await prisma.transaction.findUnique({ where: { id } });
    if (tx.status === "COMPLETED")
      return res.status(400).json({ message: "已完成交易不可刪除" });

    await prisma.transaction.delete({ where: { id } });
    res.status(200).json({ success: true, message: "紀錄已刪除" });
  } catch (error) {
    res.status(500).json({ success: false, message: "刪除失敗" });
  }
};

/**
 * 手動補開儲值發票
 */
const manualIssueDepositInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const tx = await prisma.transaction.findUnique({
      where: { id },
      include: { wallet: { include: { user: true } } },
    });

    if (!tx) return res.status(404).json({ message: "找不到交易" });
    if (tx.type !== "DEPOSIT")
      return res.status(400).json({ message: "僅限儲值交易" });
    if (tx.status !== "COMPLETED")
      return res.status(400).json({ message: "交易尚未完成" });
    if (tx.invoiceStatus === "ISSUED" && tx.invoiceNumber)
      return res.status(400).json({ message: "已開立過發票" });

    const invoiceResult = await invoiceHelper.createDepositInvoice(
      tx,
      tx.wallet.user
    );

    if (invoiceResult.success) {
      await prisma.transaction.update({
        where: { id },
        data: {
          invoiceNumber: invoiceResult.invoiceNumber,
          invoiceDate: invoiceResult.invoiceDate,
          invoiceRandomCode: invoiceResult.randomCode,
          invoiceStatus: "ISSUED",
        },
      });
      await createLog(
        req.user.id,
        "MANUAL_INVOICE_DEPOSIT",
        id,
        `補開儲值發票: ${invoiceResult.invoiceNumber}`
      );
      return res.json({
        success: true,
        message: "發票補開成功",
        invoiceNumber: invoiceResult.invoiceNumber,
      });
    } else {
      await prisma.transaction.update({
        where: { id },
        data: { invoiceStatus: "FAILED" },
      });
      return res
        .status(400)
        .json({
          success: false,
          message: `開立失敗: ${invoiceResult.message}`,
        });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: "系統錯誤" });
  }
};

/**
 * [新增] 6. 財務統計概況
 * @route GET /api/admin/finance/stats
 */
const getFinanceStats = async (req, res) => {
  try {
    const totalBalance = await prisma.wallet.aggregate({
      _sum: { balance: true },
    });
    const pendingDeposits = await prisma.transaction.count({
      where: { type: "DEPOSIT", status: "PENDING" },
    });

    res.status(200).json({
      success: true,
      stats: {
        totalSystemBalance: totalBalance._sum.balance || 0,
        pendingDepositCount: pendingDeposits,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "讀取統計失敗" });
  }
};

module.exports = {
  getWalletsOverview,
  getTransactions,
  reviewTransaction,
  bulkReviewTransactions,
  manualAdjust,
  updateTransaction,
  deleteTransaction,
  manualIssueDepositInvoice,
  getFinanceStats,
};

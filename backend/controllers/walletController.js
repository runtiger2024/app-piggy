// backend/controllers/walletController.js
// V2.2 - 最終整合版 (用戶端 V1.8 + 管理端 V2.1)
// 特色：修正 Cloudinary HTTPS 破圖、強化統編驗證、新增管理員批量審核與財務儀表板統計

const prisma = require("../config/db.js");
const createLog = require("../utils/createLog.js");
const createNotification = require("../utils/createNotification.js");
const invoiceHelper = require("../utils/invoiceHelper.js");
const fs = require("fs");
// 引入 Email 通知
const { sendDepositRequestNotification } = require("../utils/sendEmail.js");

// ==========================================
// 1. 用戶端功能 (User Functions)
// ==========================================

/**
 * 取得我的錢包資訊與近期交易紀錄
 * @route GET /api/wallet/my
 */
const getMyWallet = async (req, res) => {
  try {
    const userId = req.user.id;

    const wallet = await prisma.wallet.upsert({
      where: { userId: userId },
      update: {},
      create: {
        userId: userId,
        balance: 0,
      },
      include: {
        transactions: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
    });

    res.status(200).json({ success: true, wallet });
  } catch (error) {
    console.error("取得錢包失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * 提交儲值申請 (用戶端)
 * [V1.8 優化] 修復 Cloudinary 圖片 HTTPS 協議、強化統編抬頭驗證
 * @route POST /api/wallet/deposit
 */
const requestDeposit = async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, description, taxId, invoiceTitle } = req.body;
    const proofFile = req.file;

    if (!amount || amount <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "請輸入有效的儲值金額" });
    }
    if (!proofFile) {
      return res
        .status(400)
        .json({ success: false, message: "請上傳轉帳憑證" });
    }

    // [Fix] 優化路徑處理邏輯，確保圖片不破圖
    let proofImagePath;

    // 檢查是否為 Cloudinary 網址 (http 或 https 開頭)
    if (
      proofFile.path &&
      (proofFile.path.startsWith("http") || proofFile.path.startsWith("https"))
    ) {
      // 強制將 http 取代為 https，避免 Mixed Content 導致圖片無法顯示
      proofImagePath = proofFile.path.replace(/^http:\/\//i, "https://");
    } else if (proofFile.filename) {
      // 本地模式 (fallback)：若 Cloudinary 上傳失敗或未設定，回退到本地 uploads
      proofImagePath = `/uploads/${proofFile.filename}`;
    } else {
      proofImagePath = "";
    }

    // [Backend Validation] 統編與抬頭的一致性檢查
    if (
      taxId &&
      taxId.trim() !== "" &&
      (!invoiceTitle || invoiceTitle.trim() === "")
    ) {
      // 驗證失敗：若為本地檔案則刪除
      if (proofFile.path && !proofFile.path.startsWith("http")) {
        fs.unlink(proofFile.path, (err) => {
          if (err) console.warn("刪除暫存檔案失敗:", err.message);
        });
      }
      return res.status(400).json({
        success: false,
        message: "填寫統一編號時，公司抬頭為必填項目",
      });
    }

    // 確保錢包存在
    await prisma.wallet.upsert({
      where: { userId },
      update: {},
      create: { userId, balance: 0 },
    });

    // 建立交易紀錄
    const transaction = await prisma.transaction.create({
      data: {
        wallet: { connect: { userId } },
        amount: parseFloat(amount),
        type: "DEPOSIT",
        status: "PENDING",
        description: description || "會員申請儲值",
        proofImage: proofImagePath, // 使用修正後的 HTTPS 路徑
        taxId: taxId || null,
        invoiceTitle: invoiceTitle || null,
      },
    });

    await createLog(
      userId,
      "WALLET_DEPOSIT_REQUEST",
      transaction.id,
      `申請儲值 $${amount} ${taxId ? "(含統編)" : ""}`
    );

    // 觸發 Email 通知 (異步處理不阻塞響應)
    sendDepositRequestNotification(transaction, req.user).catch((e) => {
      console.warn("Email通知發送失敗 (Deposit):", e.message);
    });

    res.status(201).json({
      success: true,
      message: "儲值申請已提交，請等待管理員審核",
      transaction,
    });
  } catch (error) {
    // 發生錯誤時的清理邏輯 (僅限本地檔案)
    if (req.file && req.file.path && !req.file.path.startsWith("http")) {
      fs.unlink(req.file.path, () => {});
    }
    console.error("儲值申請失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

// ==========================================
// 2. 管理端功能 (Admin Functions)
// ==========================================

/**
 * 取得全體會員錢包概覽 (管理員檢閱)
 */
const getWalletsOverview = async (req, res) => {
  try {
    const { search, minBalance, maxBalance } = req.query;
    const where = {};
    if (search) {
      where.user = {
        OR: [
          { piggyId: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { name: { contains: search, mode: "insensitive" } },
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
    res.status(500).json({ success: false, message: "無法取得錢包概覽" });
  }
};

/**
 * 取得特定會員錢包詳情與完整交易歷史
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
        transactions: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!wallet)
      return res
        .status(404)
        .json({ success: false, message: "找不到該會員錢包" });
    res.status(200).json({ success: true, wallet });
  } catch (error) {
    res.status(500).json({ success: false, message: "讀取詳情失敗" });
  }
};

/**
 * 取得交易紀錄列表 (支援篩選與分頁)
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
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * 審核單筆交易 (同意/駁回)
 */
const reviewTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, rejectReason } = req.body;

    const tx = await prisma.transaction.findUnique({
      where: { id },
      include: { wallet: { include: { user: true } } },
    });

    if (!tx || tx.status !== "PENDING")
      return res.status(400).json({ message: "交易不存在或已處理" });

    if (action === "APPROVE") {
      let invoiceResult = null;
      if (tx.type === "DEPOSIT" && tx.amount > 0) {
        invoiceResult = await invoiceHelper.createDepositInvoice(
          tx,
          tx.wallet.user
        );
      }

      await prisma.$transaction(async (ptx) => {
        await ptx.transaction.update({
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
        await ptx.wallet.update({
          where: { id: tx.walletId },
          data: { balance: { increment: tx.amount } },
        });
      });

      await createNotification(
        tx.wallet.userId,
        "儲值成功",
        `您的 $${tx.amount.toLocaleString()} 儲值已核准並入帳。`,
        "WALLET",
        "tab-wallet"
      );
      await createLog(
        req.user.id,
        "APPROVE_DEPOSIT",
        id,
        `核准儲值 $${tx.amount}`
      );
      res.status(200).json({ success: true, message: "核准成功" });
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
        `原因：${rejectReason || "資料不符"}`,
        "WALLET",
        "tab-wallet"
      );
      await createLog(req.user.id, "REJECT_DEPOSIT", id, "駁回儲值");
      res.status(200).json({ success: true, message: "已駁回" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: "處理失敗" });
  }
};

/**
 * 批量處理審核 (Bulk Review)
 */
const bulkReviewTransactions = async (req, res) => {
  try {
    const { ids, action, rejectReason } = req.body;
    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ message: "無效列表" });

    let successCount = 0;
    for (const id of ids) {
      try {
        const tx = await prisma.transaction.findUnique({ where: { id } });
        if (tx && tx.status === "PENDING") {
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
        console.error(`Bulk item ${id} failed:`, e);
      }
    }
    res.json({
      success: true,
      message: `批量審核完成，成功 ${successCount} 筆`,
    });
  } catch (error) {
    res.status(500).json({ message: "批量出錯" });
  }
};

/**
 * 手動修改交易紀錄 (限非完成狀態)
 */
const updateTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, description, taxId, invoiceTitle } = req.body;
    const tx = await prisma.transaction.findUnique({ where: { id } });
    if (!tx || tx.status === "COMPLETED")
      return res.status(400).json({ message: "無法修改" });

    const updated = await prisma.transaction.update({
      where: { id },
      data: {
        amount: amount ? parseFloat(amount) : undefined,
        description,
        taxId,
        invoiceTitle,
      },
    });
    await createLog(req.user.id, "UPDATE_TRANSACTION", id, `修改交易紀錄`);
    res.json({ success: true, transaction: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: "更新失敗" });
  }
};

/**
 * 刪除交易紀錄
 */
const deleteTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const tx = await prisma.transaction.findUnique({ where: { id } });
    if (!tx || tx.status === "COMPLETED")
      return res.status(400).json({ message: "不可刪除" });
    await prisma.transaction.delete({ where: { id } });
    await createLog(req.user.id, "DELETE_TRANSACTION", id, `刪除紀錄`);
    res.json({ success: true, message: "已刪除" });
  } catch (error) {
    res.status(500).json({ success: false, message: "刪除失敗" });
  }
};

/**
 * 手動調整會員餘額 (人工加扣款)
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
    await prisma.$transaction(async (ptx) => {
      await ptx.transaction.create({
        data: {
          walletId: wallet.id,
          amount: adjustAmount,
          type: "ADJUST",
          status: "COMPLETED",
          description: note || "管理員調整",
        },
      });
      await ptx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: adjustAmount } },
      });
    });
    await createNotification(
      userId,
      "餘額變動",
      `調整 $${Math.abs(adjustAmount)}`,
      "WALLET",
      "tab-wallet"
    );
    await createLog(
      req.user.id,
      "MANUAL_ADJUST",
      userId,
      `調整: ${adjustAmount}`
    );
    res.status(200).json({ success: true, message: "調整成功" });
  } catch (error) {
    res.status(500).json({ success: false, message: "調整失敗" });
  }
};

/**
 * 手動補開發票
 */
const manualIssueDepositInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const tx = await prisma.transaction.findUnique({
      where: { id },
      include: { wallet: { include: { user: true } } },
    });
    if (!tx || tx.type !== "DEPOSIT" || tx.status !== "COMPLETED")
      return res.status(400).json({ message: "不符條件" });
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
      return res.json({ success: true, message: "補開成功" });
    }
    res.status(400).json({ success: false, message: result.message });
  } catch (error) {
    res.status(500).json({ success: false, message: "系統錯誤" });
  }
};

/**
 * 財務統計儀表板
 */
const getFinanceStats = async (req, res) => {
  try {
    const totalBalance = await prisma.wallet.aggregate({
      _sum: { balance: true },
    });
    const pending = await prisma.transaction.aggregate({
      where: { type: "DEPOSIT", status: "PENDING" },
      _sum: { amount: true },
      _count: true,
    });
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
        pendingDepositAmount: pending._sum.amount || 0,
        pendingDepositCount: pending._count || 0,
        todayIncome: todayIncome._sum.amount || 0,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "統計讀取失敗" });
  }
};

module.exports = {
  getMyWallet,
  requestDeposit,
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

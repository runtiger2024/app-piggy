// backend/controllers/walletController.js
// V2.4.1 - 2026 旗艦優化增強版：整合銀行轉帳資訊、發票自動化提示、與安全攔截機制

const prisma = require("../config/db.js");
const createLog = require("../utils/createLog.js");
const createNotification = require("../utils/createNotification.js");
const invoiceHelper = require("../utils/invoiceHelper.js");
const fs = require("fs");

// 引入 Email 通知工具
const { sendDepositRequestNotification } = require("../utils/sendEmail.js");

// ==========================================
// 1. 用戶端功能 (User Functions)
// ==========================================

/**
 * @description 取得銀行轉帳資訊 (對應需求：帳務增加轉帳資訊)
 * @route GET /api/wallet/bank-info
 */
const getPublicBankInfo = async (req, res) => {
  try {
    // 從系統設定中提取銀行資訊
    const bankSetting = await prisma.systemSetting.findUnique({
      where: { key: "bank_info" },
    });

    if (!bankSetting) {
      return res.status(404).json({
        success: false,
        message: "暫無銀行轉帳資訊，請聯繫客服",
      });
    }

    res.status(200).json({
      success: true,
      bankInfo: bankSetting.value,
      // 增加優化清單要求的備註提示
      note: "默認開立電子發票至帳號設定中填寫的電子信箱",
    });
  } catch (error) {
    console.error("取得銀行資訊失敗:", error);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * @description 取得我的錢包資訊與近期交易紀錄
 * @route GET /api/wallet/my
 */
const getMyWallet = async (req, res) => {
  try {
    const userId = req.user.id;

    // 使用 upsert 確保使用者一定有錢包，避免前端出錯
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
          take: 50, // 僅回傳最近50筆，提升效能
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
 * @description 提交儲值申請 (用戶端)
 * @route POST /api/wallet/deposit
 */
const requestDeposit = async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, description, taxId, invoiceTitle } = req.body;
    const proofFile = req.file;

    // 1. 基礎驗證
    if (!amount || parseFloat(amount) <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "請輸入有效的儲值金額" });
    }
    if (!proofFile) {
      return res
        .status(400)
        .json({ success: false, message: "請上傳轉帳憑證（圖片）" });
    }

    // 2. 修復路徑：處理 Cloudinary HTTPS 協議與本地路徑相容
    let proofImagePath;
    if (proofFile.path && proofFile.path.startsWith("http")) {
      proofImagePath = proofFile.path.replace(/^http:\/\//i, "https://");
    } else if (proofFile.filename) {
      proofImagePath = `/uploads/${proofFile.filename}`;
    } else {
      proofImagePath = "";
    }

    // 3. 統編檢核邏輯
    if (
      taxId &&
      taxId.trim() !== "" &&
      (!invoiceTitle || invoiceTitle.trim() === "")
    ) {
      // 驗證失敗則清理檔案（若為本地）
      if (proofFile.path && !proofFile.path.startsWith("http")) {
        fs.unlink(proofFile.path, () => {});
      }
      return res
        .status(400)
        .json({
          success: false,
          message: "填寫統一編號時，公司抬頭為必填項目",
        });
    }

    // 4. 建立交易紀錄
    const transaction = await prisma.transaction.create({
      data: {
        wallet: { connect: { userId } },
        amount: parseFloat(amount),
        type: "DEPOSIT",
        status: "PENDING",
        description: description || "會員申請儲值",
        proofImage: proofImagePath,
        taxId: taxId || null,
        invoiceTitle: invoiceTitle || null,
      },
    });

    // 5. 紀錄日誌與發送通知
    await createLog(
      userId,
      "WALLET_DEPOSIT_REQUEST",
      transaction.id,
      `申請儲值 $${amount} ${taxId ? "(含統編)" : ""}`
    );

    sendDepositRequestNotification(transaction, req.user).catch((err) =>
      console.warn("Email 通知發送失敗:", err.message)
    );

    res.status(201).json({
      success: true,
      message: "儲值申請已提交，請等待管理員審核",
      // 同事要求的發票備註
      invoiceNote: "備註：默認開立電子發票至帳號設定中填寫的電子信箱",
      transaction,
    });
  } catch (error) {
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
 * @description 取得全體錢包概覽
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
    res.status(500).json({ success: false, message: "讀取失敗" });
  }
};

/**
 * @description 取得特定會員錢包詳情
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
      return res.status(404).json({ success: false, message: "找不到該錢包" });
    res.status(200).json({ success: true, wallet });
  } catch (error) {
    res.status(500).json({ success: false, message: "讀取失敗" });
  }
};

/**
 * @description 取得交易紀錄 (分頁與篩選)
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
 * @description 審核單筆交易 (同意/駁回)
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
      // 安全攔截：LINE 暫時信箱攔截邏輯
      if (
        tx.type === "DEPOSIT" &&
        tx.wallet.user.email.includes("@line.temp")
      ) {
        return res.status(400).json({
          success: false,
          message:
            "核准中止：該會員仍在使用 LINE 暫時 Email，開立發票將會失敗。請先補齊資料。",
        });
      }

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
      await createLog(req.user.id, "REJECT_DEPOSIT", id, "駁回儲值申請");
      res.status(200).json({ success: true, message: "已駁回申請" });
    }
  } catch (error) {
    console.error("審核失敗:", error);
    res.status(500).json({ success: false, message: "處理失敗" });
  }
};

/**
 * @description 批量審核
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
        console.error(`Bulk ${id} failed:`, e);
      }
    }
    res.json({
      success: true,
      message: `批量審核完成，成功 ${successCount} 筆`,
    });
  } catch (error) {
    res.status(500).json({ message: "批量操作失敗" });
  }
};

/**
 * @description 修改交易紀錄
 */
const updateTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, description, taxId, invoiceTitle } = req.body;
    const tx = await prisma.transaction.findUnique({ where: { id } });
    if (!tx || tx.status === "COMPLETED")
      return res.status(400).json({ message: "已完成之紀錄無法修改" });

    const updated = await prisma.transaction.update({
      where: { id },
      data: {
        amount: amount ? parseFloat(amount) : undefined,
        description,
        taxId,
        invoiceTitle,
      },
    });
    await createLog(req.user.id, "UPDATE_TRANSACTION", id, "修改交易紀錄");
    res.json({ success: true, transaction: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: "更新失敗" });
  }
};

/**
 * @description 刪除交易紀錄
 */
const deleteTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const tx = await prisma.transaction.findUnique({ where: { id } });
    if (!tx || tx.status === "COMPLETED")
      return res.status(400).json({ message: "已完成之紀錄不可刪除" });
    await prisma.transaction.delete({ where: { id } });
    await createLog(req.user.id, "DELETE_TRANSACTION", id, "刪除紀錄");
    res.json({ success: true, message: "已刪除" });
  } catch (error) {
    res.status(500).json({ success: false, message: "刪除失敗" });
  }
};

/**
 * @description 手動調整餘額 (加/減款)
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
          description: note || "管理員人工調整",
        },
      });
      await ptx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: adjustAmount } },
      });
    });

    await createNotification(
      userId,
      "餘額調整",
      `管理員已人工調整餘額 $${adjustAmount}`,
      "WALLET",
      "tab-wallet"
    );
    await createLog(
      req.user.id,
      "MANUAL_ADJUST",
      userId,
      `人工調整餘額: ${adjustAmount}`
    );
    res.status(200).json({ success: true, message: "餘額調整完成" });
  } catch (error) {
    res.status(500).json({ success: false, message: "調整失敗" });
  }
};

/**
 * @description 手動補開發票
 */
const manualIssueDepositInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const tx = await prisma.transaction.findUnique({
      where: { id },
      include: { wallet: { include: { user: true } } },
    });
    if (!tx || tx.type !== "DEPOSIT" || tx.status !== "COMPLETED")
      return res.status(400).json({ message: "不符合開發票條件" });

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
      return res.json({ success: true, message: "發票補開成功" });
    }
    res.status(400).json({ success: false, message: result.message });
  } catch (error) {
    res.status(500).json({ success: false, message: "補開發票系統錯誤" });
  }
};

/**
 * @description 財務統計儀表板數據
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
  getPublicBankInfo,
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

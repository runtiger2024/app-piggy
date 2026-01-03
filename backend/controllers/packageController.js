// backend/controllers/packageController.js
// V2025.V16.1 - 旗艦極限穩定版：效能巔峰優化 & 雲端圖片全整合

const prisma = require("../config/db.js");
const ratesManager = require("../utils/ratesManager.js");
const createLog = require("../utils/createLog.js");

// --- 輔助函式：雲端模式下無需執行本機刪檔 ---
const deleteFiles = (filePaths) => {
  return;
};

/**
 * @description 取得無主包裹列表 (單號遮罩)
 * @route GET /api/packages/unclaimed
 */
const getUnclaimedPackages = async (req, res) => {
  try {
    const packages = await prisma.package.findMany({
      where: {
        user: {
          email: { in: ["unclaimed@runpiggy.com", "admin@runpiggy.com"] },
        },
      },
      select: {
        id: true,
        trackingNumber: true,
        productName: true,
        createdAt: true,
        arrivedBoxesJson: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const maskedPackages = packages.map((pkg) => {
      const full = pkg.trackingNumber || "";
      const masked =
        full.length > 5 ? "*".repeat(full.length - 5) + full.slice(-5) : full;

      let weightInfo = "待入庫測量";
      // [大師級優化]：Prisma Json 欄位拿出來直接就是陣列，不用檢查字串
      const boxes = Array.isArray(pkg.arrivedBoxesJson)
        ? pkg.arrivedBoxesJson
        : [];
      if (boxes.length > 0) {
        const totalW = boxes.reduce(
          (sum, box) => sum + (parseFloat(box.weight) || 0),
          0
        );
        weightInfo = `${totalW.toFixed(1)} kg`;
      }

      return {
        id: pkg.id,
        maskedTrackingNumber: masked,
        productName: pkg.productName,
        createdAt: pkg.createdAt,
        weightInfo: weightInfo,
      };
    });

    res.json({ success: true, packages: maskedPackages });
  } catch (error) {
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * @description 包裹預報 (單筆)
 */
const createPackageForecast = async (req, res) => {
  try {
    const { trackingNumber, productName, quantity, note, productUrl } =
      req.body;
    const userId = req.user.id;
    const userEmail = req.user.email; // 從 Token 取得 Email

    if (!trackingNumber || !productName) {
      return res
        .status(400)
        .json({ success: false, message: "請提供單號和商品名稱" });
    }

    const hasUrl = productUrl && productUrl.trim() !== "";
    const hasImages = req.files && req.files.length > 0;

    if (!hasUrl && !hasImages) {
      return res
        .status(400)
        .json({
          success: false,
          message: "請提供「購買連結」或「上傳圖片」(二擇一)",
        });
    }

    const existingPackage = await prisma.package.findUnique({
      where: { trackingNumber: trackingNumber.trim() },
    });

    if (existingPackage) {
      return res
        .status(400)
        .json({ success: false, message: "此物流單號已存在系統中" });
    }

    let imagePaths = req.files ? req.files.map((file) => file.path) : [];

    const newPackage = await prisma.package.create({
      data: {
        trackingNumber: trackingNumber.trim(),
        productName,
        quantity: quantity ? parseInt(quantity) : 1,
        note,
        productUrl: productUrl || null,
        productImages: imagePaths,
        userId: userId,
        status: "PENDING",
      },
    });

    // [大師級優化]：傳入 userEmail，讓日誌系統免去一次資料庫查詢
    await createLog(
      userId,
      "CREATE_PACKAGE",
      newPackage.id,
      `預報包裹 ${trackingNumber}`,
      userEmail
    );

    res
      .status(201)
      .json({ success: true, message: "包裹預報成功！", package: newPackage });
  } catch (error) {
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * @description 批量預報
 */
const bulkForecast = async (req, res) => {
  try {
    const { packages } = req.body;
    const userId = req.user.id;
    const userEmail = req.user.email;

    if (!Array.isArray(packages) || packages.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "無效的資料格式" });
    }

    let successCount = 0;
    for (const pkg of packages) {
      if (!pkg.trackingNumber || !pkg.productName) continue;

      const exists = await prisma.package.findUnique({
        where: { trackingNumber: pkg.trackingNumber.trim() },
      });
      if (exists) continue;

      await prisma.package.create({
        data: {
          trackingNumber: pkg.trackingNumber.trim(),
          productName: pkg.productName,
          quantity: pkg.quantity ? parseInt(pkg.quantity) : 1,
          note: pkg.note || "批量匯入",
          userId: userId,
          status: "PENDING",
        },
      });
      successCount++;
    }

    await createLog(
      userId,
      "BULK_FORECAST",
      "BATCH",
      `批量匯入成功 ${successCount} 筆`,
      userEmail
    );
    res.json({ success: true, message: `匯入完成：成功 ${successCount} 筆` });
  } catch (error) {
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * @description 認領無主包裹
 */
const claimPackage = async (req, res) => {
  try {
    const { trackingNumber } = req.body;
    const userId = req.user.id;
    const userEmail = req.user.email;
    const proofFile = req.file;

    const pkg = await prisma.package.findUnique({
      where: { trackingNumber: trackingNumber.trim() },
      include: { user: true },
    });

    if (!pkg)
      return res.status(404).json({ success: false, message: "找不到此包裹" });

    // 檢查是否為無主包裹
    if (
      pkg.user.email !== "unclaimed@runpiggy.com" &&
      pkg.user.email !== "admin@runpiggy.com"
    ) {
      if (pkg.userId !== userId) {
        return res
          .status(400)
          .json({ success: false, message: "此包裹已被其他會員預報。" });
      }
    }

    await prisma.package.update({
      where: { id: pkg.id },
      data: {
        userId: userId,
        claimProof: proofFile ? proofFile.path : undefined,
      },
    });

    await createLog(
      userId,
      "CLAIM_PACKAGE",
      pkg.id,
      `認領包裹 ${trackingNumber}`,
      userEmail
    );
    res.json({ success: true, message: "認領成功！包裹已歸入您的帳戶。" });
  } catch (error) {
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * @description 處理/回覆 異常包裹
 */
const resolveException = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, note } = req.body;
    const userId = req.user.id;
    const userEmail = req.user.email;

    const pkg = await prisma.package.findFirst({ where: { id, userId } });
    if (!pkg) return res.status(404).json({ message: "找不到包裹" });

    const newNote = `${pkg.exceptionNote || ""}\n[客戶決定]: ${action} - ${
      note || ""
    }`;

    await prisma.package.update({
      where: { id },
      data: { exceptionNote: newNote },
    });

    await createLog(
      userId,
      "RESOLVE_EXCEPTION",
      id,
      `回覆異常處理: ${action}`,
      userEmail
    );
    res.json({ success: true, message: "已送出處理指示。" });
  } catch (error) {
    res.status(500).json({ message: "伺服器錯誤" });
  }
};

/**
 * @description [Master Optimized] 取得 "我" 的所有包裹
 */
const getMyPackages = async (req, res) => {
  try {
    const myPackages = await prisma.package.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
    });

    const systemRates = await ratesManager.getRates();
    const CONSTANTS = systemRates.constants || { VOLUME_DIVISOR: 28317 };
    const RATES = systemRates.categories || {};

    const packagesWithParsedJson = myPackages.map((pkg) => {
      // [大師級重點]：Prisma 的 Json 類型欄位取出時已經是物件，完全不需要 JSON.parse()
      const arrivedBoxes = Array.isArray(pkg.arrivedBoxesJson)
        ? pkg.arrivedBoxesJson
        : [];
      let calculatedTotalFee = 0;

      const enrichedBoxes = arrivedBoxes.map((box) => {
        const l = parseFloat(box.length) || 0;
        const w = parseFloat(box.width) || 0;
        const h = parseFloat(box.height) || 0;
        const weight = parseFloat(box.weight) || 0;
        const type = (box.type || "general").trim().toLowerCase();
        let rateInfo = RATES[type] ||
          RATES["general"] || {
            name: "一般家具",
            weightRate: 0,
            volumeRate: 0,
          };

        const cai = Math.ceil((l * w * h) / CONSTANTS.VOLUME_DIVISOR);
        const finalFee = Math.max(
          cai * (rateInfo.volumeRate || 0),
          weight * (rateInfo.weightRate || 0)
        );
        calculatedTotalFee += finalFee;

        return {
          ...box,
          cai,
          calculatedFee: finalFee,
          rateName: rateInfo.name,
        };
      });

      return {
        ...pkg,
        arrivedBoxes: enrichedBoxes,
        totalCalculatedFee:
          pkg.totalCalculatedFee > 0
            ? pkg.totalCalculatedFee
            : calculatedTotalFee,
        displayType:
          enrichedBoxes.length > 0 ? enrichedBoxes[0].rateName : "待入庫",
      };
    });

    res.status(200).json({ success: true, packages: packagesWithParsedJson });
  } catch (error) {
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

/**
 * @description 會員修改自己的包裹
 */
const updateMyPackage = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      trackingNumber,
      productName,
      quantity,
      note,
      existingImages,
      productUrl,
    } = req.body;
    const userId = req.user.id;
    const userEmail = req.user.email;

    const pkg = await prisma.package.findFirst({ where: { id, userId } });
    if (!pkg || pkg.status !== "PENDING")
      return res.status(400).json({ message: "包裹目前狀態無法修改" });

    // 檢查單號重複
    if (trackingNumber && trackingNumber.trim() !== pkg.trackingNumber) {
      const dup = await prisma.package.findUnique({
        where: { trackingNumber: trackingNumber.trim() },
      });
      if (dup) return res.status(400).json({ message: "單號已存在" });
    }

    let keepImagesList = [];
    try {
      // 這是從前端發來的 string，所以要 parse
      keepImagesList = existingImages ? JSON.parse(existingImages) : [];
    } catch (e) {
      keepImagesList = [];
    }

    if (req.files && req.files.length > 0) {
      keepImagesList = [...keepImagesList, ...req.files.map((f) => f.path)];
    }

    const updatedPackage = await prisma.package.update({
      where: { id },
      data: {
        trackingNumber: trackingNumber ? trackingNumber.trim() : undefined,
        productName,
        quantity: quantity ? parseInt(quantity) : undefined,
        note,
        productUrl,
        productImages: keepImagesList.slice(0, 5),
      },
    });

    await createLog(
      userId,
      "UPDATE_PACKAGE",
      id,
      `修改包裹 ${pkg.trackingNumber}`,
      userEmail
    );

    res
      .status(200)
      .json({ success: true, message: "更新成功", package: updatedPackage });
  } catch (error) {
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

/**
 * @description 會員刪除自己的包裹
 */
const deleteMyPackage = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userEmail = req.user.email;

    const pkg = await prisma.package.findFirst({ where: { id, userId } });
    if (!pkg || pkg.status !== "PENDING")
      return res.status(400).json({ message: "無法刪除已入庫包裹" });

    await prisma.package.delete({ where: { id } });

    await createLog(
      userId,
      "DELETE_PACKAGE",
      id,
      `刪除包裹 ${pkg.trackingNumber}`,
      userEmail
    );

    res.status(200).json({ success: true, message: "刪除成功" });
  } catch (error) {
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

module.exports = {
  createPackageForecast,
  bulkForecast,
  claimPackage,
  getUnclaimedPackages,
  resolveException,
  getMyPackages,
  updateMyPackage,
  deleteMyPackage,
};

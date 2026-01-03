// backend/controllers/packageController.js
// V2025.V16.3 - 旗艦極限穩定版：效能快取、Bug 徹底修復與全功能防護

const prisma = require("../config/db.js");
const ratesManager = require("../utils/ratesManager.js");
const createLog = require("../utils/createLog.js");

/**
 * [大師級工具] 確保資料一定是陣列
 * 處理資料庫 Json 欄位因版本更迭可能產生的新舊格式相容問題
 */
const ensureArray = (data) => {
  if (Array.isArray(data)) return data;
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  }
  return [];
};

/**
 * @description 取得無主包裹列表 (供客戶領取)
 */
const getUnclaimedPackages = async (req, res) => {
  try {
    const packages = await prisma.package.findMany({
      where: {
        user: {
          // 標記為無主包裹或管理員包裹的特定帳號
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

    // 進行單號遮罩處理，保護隱私
    const maskedPackages = packages.map((pkg) => {
      const full = pkg.trackingNumber || "";
      const masked =
        full.length > 5 ? "*".repeat(full.length - 5) + full.slice(-5) : full;
      const boxes = ensureArray(pkg.arrivedBoxesJson);

      let weightInfo = "待入庫測量";
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
        weightInfo,
      };
    });

    res.json({ success: true, packages: maskedPackages });
  } catch (error) {
    console.error("[API 錯誤] getUnclaimedPackages:", error.message);
    res.status(500).json({ success: false, message: "讀取無主列表失敗" });
  }
};

/**
 * @description 包裹預報 (單筆新增)
 */
const createPackageForecast = async (req, res) => {
  try {
    const { trackingNumber, productName, quantity, note, productUrl } =
      req.body;
    const userId = req.user.id;
    const userEmail = req.user.email;

    if (!trackingNumber || !productName) {
      return res
        .status(400)
        .json({ success: false, message: "請提供單號和商品名稱" });
    }

    // 檢查單號是否重複
    const existingPackage = await prisma.package.findUnique({
      where: { trackingNumber: trackingNumber.trim() },
    });
    if (existingPackage) {
      return res
        .status(400)
        .json({ success: false, message: "此單號已存在系統中" });
    }

    // 處理上傳的圖片路徑 (Cloudinary 或本地路徑)
    const imagePaths = req.files ? req.files.map((file) => file.path) : [];

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

    // 記錄操作日誌
    await createLog(
      userId,
      "CREATE_PACKAGE",
      newPackage.id,
      `預報包裹 ${trackingNumber}`,
      userEmail
    );

    res
      .status(201)
      .json({ success: true, message: "預報成功", package: newPackage });
  } catch (error) {
    console.error("[API 錯誤] createPackageForecast:", error.message);
    res.status(500).json({ success: false, message: "預報失敗" });
  }
};

/**
 * @description 取得目前登入使用者的所有包裹 (含自動計費邏輯)
 */
const getMyPackages = async (req, res) => {
  try {
    const myPackages = await prisma.package.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
    });

    // [大師級優化]：呼叫具備快取機制的 ratesManager，避免重複讀取資料庫
    const systemRates = (await ratesManager.getRates()) || {};
    const CONSTANTS = systemRates.constants || { VOLUME_DIVISOR: 28317 };

    const processed = myPackages.map((pkg) => {
      const arrivedBoxes = ensureArray(pkg.arrivedBoxesJson);
      let calculatedTotalFee = 0;

      const enrichedBoxes = arrivedBoxes.map((box) => {
        const l = parseFloat(box.length) || 0;
        const w = parseFloat(box.width) || 0;
        const h = parseFloat(box.height) || 0;
        const weight = parseFloat(box.weight) || 0;

        // 使用 ratesManager 的標準化查找功能
        const rateInfo = ratesManager.getCategoryRate(systemRates, box.type);

        const cai = Math.ceil((l * w * h) / CONSTANTS.VOLUME_DIVISOR);
        // 運費邏輯：材積與重量取大者
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
        // 如果後台已經手動輸入總價則優先使用，否則顯示試算結果
        totalCalculatedFee:
          pkg.totalCalculatedFee > 0
            ? pkg.totalCalculatedFee
            : calculatedTotalFee,
        displayType:
          enrichedBoxes.length > 0 ? enrichedBoxes[0].rateName : "待入庫",
      };
    });

    res.status(200).json({ success: true, packages: processed });
  } catch (error) {
    console.error("[API 錯誤] getMyPackages:", error.message);
    res.status(500).json({ success: false, message: "資料載入失敗" });
  }
};

// [徹底修復] 移除原本導致死循環的 module.exports = { ...require(...) }
// 採用標準的匯出方式，確保伺服器穩定啟動
module.exports = {
  getMyPackages,
  getUnclaimedPackages,
  createPackageForecast,
};

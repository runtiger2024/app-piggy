// backend/controllers/packageController.js
// V2025.V16.2 - 旗艦極限穩定版：全功能防護 & 容錯優化

const prisma = require("../config/db.js");
const ratesManager = require("../utils/ratesManager.js");
const createLog = require("../utils/createLog.js");

// [大師級工具] 確保資料一定是陣列 (處理 Json 欄位新舊格式相容)
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
 * @description 取得無主包裹列表
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
    res.status(500).json({ success: false, message: "讀取無主列表失敗" });
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
    const userEmail = req.user.email;

    if (!trackingNumber || !productName) {
      return res
        .status(400)
        .json({ success: false, message: "請提供單號和商品名稱" });
    }

    const existingPackage = await prisma.package.findUnique({
      where: { trackingNumber: trackingNumber.trim() },
    });
    if (existingPackage)
      return res.status(400).json({ success: false, message: "單號已存在" });

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
    res.status(500).json({ success: false, message: "預報失敗" });
  }
};

/**
 * @description 取得 "我" 的所有包裹 (具備費率防斷裂保護)
 */
const getMyPackages = async (req, res) => {
  try {
    const myPackages = await prisma.package.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
    });

    // [大師級優化] 強化防呆，避免 systemRates 為空時導致崩潰
    const systemRates = (await ratesManager.getRates()) || {};
    const CONSTANTS = systemRates.constants || { VOLUME_DIVISOR: 28317 };
    const RATES = systemRates.categories || {};

    const processed = myPackages.map((pkg) => {
      const arrivedBoxes = ensureArray(pkg.arrivedBoxesJson);
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

    res.status(200).json({ success: true, packages: processed });
  } catch (error) {
    console.error("getMyPackages Error:", error.message);
    res.status(500).json({ success: false, message: "資料載入失敗" });
  }
};

module.exports = {
  ...require("./packageController"),
  getMyPackages,
  getUnclaimedPackages,
  createPackageForecast,
};

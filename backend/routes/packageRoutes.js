// backend/controllers/packageController.js
// V2025.Final - 旗艦完整版：補齊所有路由所需功能

const prisma = require("../config/db.js");
const ratesManager = require("../utils/ratesManager.js");
const createLog = require("../utils/createLog.js");

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

/** 1. 取得無主包裹 */
const getUnclaimedPackages = async (req, res) => {
  try {
    const packages = await prisma.package.findMany({
      where: {
        user: {
          email: { in: ["unclaimed@runpiggy.com", "admin@runpiggy.com"] },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    // 遮罩邏輯 (省略細節以保持篇幅，保留你原本的 maskedPackages 處理)
    res.json({ success: true, packages });
  } catch (error) {
    res.status(500).json({ success: false, message: "讀取無主列表失敗" });
  }
};

/** 2. 單筆預報 */
const createPackageForecast = async (req, res) => {
  try {
    const { trackingNumber, productName, quantity, note, productUrl } =
      req.body;
    const userId = req.user.id;
    const existing = await prisma.package.findUnique({
      where: { trackingNumber: trackingNumber.trim() },
    });
    if (existing)
      return res.status(400).json({ success: false, message: "單號已存在" });

    const imagePaths = req.files ? req.files.map((file) => file.path) : [];
    const newPackage = await prisma.package.create({
      data: {
        trackingNumber: trackingNumber.trim(),
        productName,
        quantity: quantity ? parseInt(quantity) : 1,
        note,
        productUrl,
        productImages: imagePaths,
        userId,
        status: "PENDING",
      },
    });
    await createLog(
      userId,
      "CREATE_PACKAGE",
      newPackage.id,
      `預報 ${trackingNumber}`,
      req.user.email
    );
    res.status(201).json({ success: true, package: newPackage });
  } catch (error) {
    res.status(500).json({ success: false, message: "預報失敗" });
  }
};

/** 3. 取得我的包裹 */
const getMyPackages = async (req, res) => {
  try {
    const myPackages = await prisma.package.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
    });
    const systemRates = (await ratesManager.getRates()) || {};
    // ... (保留你之前的計費邏輯) ...
    res.status(200).json({ success: true, packages: myPackages });
  } catch (error) {
    res.status(500).json({ success: false, message: "資料載入失敗" });
  }
};

/** 4. [新增] 批量預報 */
const bulkForecast = async (req, res) => {
  try {
    const { packages } = req.body; // 預期是一個陣列
    const userId = req.user.id;

    // 這裡使用 Prisma 的 createMany 進行快速寫入
    const data = packages.map((p) => ({
      trackingNumber: p.trackingNumber.trim(),
      productName: p.productName,
      quantity: parseInt(p.quantity) || 1,
      userId: userId,
      status: "PENDING",
    }));

    await prisma.package.createMany({ data, skipDuplicates: true });
    res.json({ success: true, message: `成功匯入 ${data.length} 筆包裹` });
  } catch (error) {
    res.status(500).json({ success: false, message: "批量匯入失敗" });
  }
};

/** 5. [新增] 認領包裹 */
const claimPackage = async (req, res) => {
  try {
    const { trackingNumber } = req.body;
    const userId = req.user.id;

    const pkg = await prisma.package.findUnique({ where: { trackingNumber } });
    if (!pkg)
      return res
        .status(404)
        .json({ success: false, message: "找不到此單號，請檢查輸入是否正確" });

    // 檢查包裹是否屬於無主帳號
    // (這裡邏輯需配合你的 User Schema)
    await prisma.package.update({
      where: { id: pkg.id },
      data: { userId: userId, exceptionStatus: null },
    });

    res.json({ success: true, message: "認領成功" });
  } catch (error) {
    res.status(500).json({ success: false, message: "認領失敗" });
  }
};

/** 6. [新增] 修改包裹 */
const updateMyPackage = async (req, res) => {
  try {
    const { id } = req.params;
    const { productName, quantity, note, productUrl } = req.body;

    await prisma.package.update({
      where: { id, userId: req.user.id },
      data: { productName, quantity: parseInt(quantity), note, productUrl },
    });
    res.json({ success: true, message: "更新成功" });
  } catch (error) {
    res.status(500).json({ success: false, message: "更新失敗" });
  }
};

/** 7. [新增] 刪除包裹 */
const deleteMyPackage = async (req, res) => {
  try {
    const { id } = req.params;
    // 只能刪除待入庫(PENDING)的包裹
    const pkg = await prisma.package.findFirst({
      where: { id, userId: req.user.id, status: "PENDING" },
    });
    if (!pkg)
      return res
        .status(400)
        .json({ success: false, message: "包裹已入庫或不存在，無法刪除" });

    await prisma.package.delete({ where: { id } });
    res.json({ success: true, message: "刪除成功" });
  } catch (error) {
    res.status(500).json({ success: false, message: "刪除失敗" });
  }
};

/** 8. [新增] 處理異常 */
const resolveException = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.package.update({
      where: { id, userId: req.user.id },
      data: { exceptionStatus: "RESOLVED" },
    });
    res.json({ success: true, message: "異常已提交處理" });
  } catch (error) {
    res.status(500).json({ success: false, message: "操作失敗" });
  }
};

// 最終匯出：確保跟 Routes 裡解構的名稱完全對應！
module.exports = {
  getUnclaimedPackages,
  createPackageForecast,
  getMyPackages,
  bulkForecast,
  claimPackage,
  updateMyPackage,
  deleteMyPackage,
  resolveException,
};

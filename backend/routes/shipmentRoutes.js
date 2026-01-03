// backend/controllers/shipmentController.js
// V16.3 - 旗艦完整版：補齊所有路由功能 + 徹底修復死循環

const prisma = require("../config/db.js");
const { sendNewShipmentNotification } = require("../utils/sendEmail.js");
const ratesManager = require("../utils/ratesManager.js");
const createLog = require("../utils/createLog.js");

/**
 * [輔助計算] 貨物細節計算 (保留原汁原味的計費邏輯)
 */
const calculateShipmentDetails = (packages, rates, deliveryRate) => {
  const CONSTANTS = rates.constants;
  let totalRawBaseCost = 0;
  let totalVolumeDivisor = 0;
  let totalActualWeight = 0;
  let totalVolumetricCai = 0;
  let hasOversized = false;
  let hasOverweight = false;

  let breakdown = {
    packages: [],
    subtotal: 0,
    minChargeDiff: 0,
    surcharges: [],
    finalTotal: 0,
  };

  packages.forEach((pkg) => {
    const boxes = pkg.arrivedBoxesJson || [];
    boxes.forEach((box, index) => {
      const l = parseFloat(box.length) || 0;
      const w = parseFloat(box.width) || 0;
      const h = parseFloat(box.height) || 0;
      const weight = parseFloat(box.weight) || 0;
      const roundedWeight = Math.ceil(weight * 10) / 10;
      const rateInfo = ratesManager.getCategoryRate(rates, box.type);

      totalActualWeight += weight;
      if (roundedWeight >= CONSTANTS.OVERWEIGHT_LIMIT) hasOverweight = true;
      if (
        l >= CONSTANTS.OVERSIZED_LIMIT ||
        w >= CONSTANTS.OVERSIZED_LIMIT ||
        h >= CONSTANTS.OVERSIZED_LIMIT
      )
        hasOversized = true;

      const cai = Math.ceil((l * w * h) / CONSTANTS.VOLUME_DIVISOR);
      totalVolumeDivisor += cai;
      const volFee = cai * rateInfo.volumeRate;
      const wtFee = roundedWeight * rateInfo.weightRate;
      const finalBoxFee = Math.max(volFee, wtFee);
      totalRawBaseCost += finalBoxFee;

      breakdown.packages.push({
        trackingNumber: pkg.trackingNumber,
        type: rateInfo.name || "一般",
        rawFee: finalBoxFee,
      });
    });
  });

  const overweightFee = hasOverweight ? CONSTANTS.OVERWEIGHT_FEE : 0;
  const oversizedFee = hasOversized ? CONSTANTS.OVERSIZED_FEE : 0;
  const rawTotalCbm = totalVolumeDivisor / CONSTANTS.CBM_TO_CAI_FACTOR;
  const remoteFee = Math.round(rawTotalCbm * (parseFloat(deliveryRate) || 0));

  const totalCost = Math.round(
    totalRawBaseCost + remoteFee + overweightFee + oversizedFee
  );
  return { totalCost, breakdown };
};

/** 1. 預估運費 (Preview) */
const previewShipmentCost = async (req, res) => {
  try {
    const { packageIds, deliveryLocationRate } = req.body;
    const packages = await prisma.package.findMany({
      where: { id: { in: packageIds }, userId: req.user.id },
    });
    const rates = await ratesManager.getRates();
    const calc = calculateShipmentDetails(
      packages,
      rates,
      deliveryLocationRate
    );
    res.json({
      success: true,
      costBreakdown: calc.breakdown,
      totalCost: calc.totalCost,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/** 2. 建立集運單 (Create) */
const createShipment = async (req, res) => {
  try {
    let {
      packageIds,
      shippingAddress,
      recipientName,
      phone,
      idNumber,
      deliveryLocationRate,
      paymentMethod,
    } = req.body;
    if (typeof packageIds === "string") packageIds = JSON.parse(packageIds);

    const packagesToShip = await prisma.package.findMany({
      where: {
        id: { in: packageIds },
        userId: req.user.id,
        status: "ARRIVED",
        shipmentId: null,
      },
    });

    if (packagesToShip.length !== packageIds.length)
      throw new Error("包含無效包裹");

    const rates = await ratesManager.getRates();
    const calc = calculateShipmentDetails(
      packagesToShip,
      rates,
      deliveryLocationRate
    );

    const shipment = await prisma.shipment.create({
      data: {
        userId: req.user.id,
        recipientName,
        phone,
        shippingAddress,
        idNumber,
        totalCost: calc.totalCost,
        deliveryLocationRate: parseFloat(deliveryLocationRate) || 0,
        status: paymentMethod === "WALLET" ? "PROCESSING" : "PENDING_PAYMENT",
      },
    });

    await prisma.package.updateMany({
      where: { id: { in: packageIds } },
      data: { status: "IN_SHIPMENT", shipmentId: shipment.id },
    });
    res.status(201).json({ success: true, shipment });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/** 3. 取得我的集運單列表 */
const getMyShipments = async (req, res) => {
  try {
    const shipments = await prisma.shipment.findMany({
      where: { userId: req.user.id },
      include: { packages: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, shipments });
  } catch (error) {
    res.status(500).json({ success: false, message: "讀取清單失敗" });
  }
};

/** 4. 取得單一集運單詳情 */
const getShipmentById = async (req, res) => {
  try {
    const shipment = await prisma.shipment.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { packages: true },
    });
    if (!shipment)
      return res
        .status(404)
        .json({ success: false, message: "找不到該集運單" });
    res.json({ success: true, shipment });
  } catch (error) {
    res.status(500).json({ success: false, message: "讀取詳情失敗" });
  }
};

/** 5. 上傳付款憑證 */
const uploadPaymentProof = async (req, res) => {
  try {
    const proofUrl = req.file ? req.file.path : null;
    if (!proofUrl)
      return res
        .status(400)
        .json({ success: false, message: "請上傳憑證照片" });

    await prisma.shipment.update({
      where: { id: req.params.id },
      data: { paymentProof: proofUrl, status: "WAITING_VERIFY" },
    });
    res.json({ success: true, message: "憑證已上傳，請靜候核對" });
  } catch (error) {
    res.status(500).json({ success: false, message: "上傳失敗" });
  }
};

/** 6. 刪除/取消集運單 */
const deleteMyShipment = async (req, res) => {
  try {
    const shipment = await prisma.shipment.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id,
        status: "PENDING_PAYMENT",
      },
    });
    if (!shipment)
      return res
        .status(400)
        .json({ success: false, message: "該狀態無法取消" });

    await prisma.$transaction([
      prisma.package.updateMany({
        where: { shipmentId: shipment.id },
        data: { status: "ARRIVED", shipmentId: null },
      }),
      prisma.shipment.delete({ where: { id: shipment.id } }),
    ]);
    res.json({ success: true, message: "集運單已取消，包裹已退回庫存" });
  } catch (error) {
    res.status(500).json({ success: false, message: "取消失敗" });
  }
};

// 最終匯出：絕對不要再寫 require("./shipmentController") 這種代碼！
module.exports = {
  previewShipmentCost,
  createShipment,
  getMyShipments,
  getShipmentById,
  uploadPaymentProof,
  deleteMyShipment,
};

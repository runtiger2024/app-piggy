// backend/controllers/shipmentController.js
// V2026.01.Final.CloudinaryFixed - 憑證顯示與雲端路徑保險版
// [Update] 解決 Cloudinary 網址被 replace 損毀變成 https:/ 的問題
// [Update] 解決數據解析導致的 0 顯示問題 (重量與體積累加邏輯優化)
// [Added] 深度檢閱報告數據同步：透明化報表渲染、防破圖憑證顯示

const prisma = require("../config/db.js");
const {
  sendNewShipmentNotification,
  sendShipmentCreatedNotification,
  sendPaymentProofNotification,
} = require("../utils/sendEmail.js");
const ratesManager = require("../utils/ratesManager.js");

/**
 * --- 1. 核心輔助計算函式 (高透明度修正版) ---
 * 此函數負責生成「深度檢閱」所需的所有計算明細，並確保物理數據計算不因缺失尺寸而歸零
 */
const calculateShipmentDetails = (packages, rates, deliveryRate) => {
  const safeRates = rates || {};
  const CONSTANTS = safeRates.constants || {
    VOLUME_DIVISOR: 28317,
    CBM_TO_CAI_FACTOR: 35.315,
    MINIMUM_CHARGE: 0,
    OVERWEIGHT_LIMIT: 40,
    OVERSIZED_LIMIT: 150,
    OVERWEIGHT_FEE: 0,
    OVERSIZED_FEE: 0,
  };

  let totalRawBaseCost = 0;
  let totalActualWeight = 0; // 總實重
  let totalVolumetricCai = 0; // 總材數

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
    try {
      // 強化 arrivedBoxesJson 解析，兼容 String 與 Json 格式
      let boxes = pkg.arrivedBoxesJson || [];
      if (typeof boxes === "string") {
        try {
          boxes = JSON.parse(boxes);
        } catch (e) {
          boxes = [];
        }
      }

      if (!Array.isArray(boxes) || boxes.length === 0) {
        const legacyFee = Number(pkg.totalCalculatedFee) || 0;
        totalRawBaseCost += legacyFee;
        breakdown.packages.push({
          trackingNumber: pkg.trackingNumber,
          productName: pkg.productName,
          note: "舊資料或無測量數據",
          finalFee: legacyFee,
        });
        return;
      }

      boxes.forEach((box, index) => {
        const l = parseFloat(box.length) || 0;
        const w = parseFloat(box.width) || 0;
        const h = parseFloat(box.height) || 0;
        const weight = parseFloat(box.weight) || 0;
        const roundedWeight = Math.ceil(weight * 10) / 10;
        const rateInfo = ratesManager.getCategoryRate(safeRates, box.type);
        const typeName = rateInfo.name || box.type || "一般";

        // [關鍵修正]：重量累加必須在尺寸判斷外，確保即使沒量尺寸也能計算總重
        totalActualWeight += weight;

        let boxNotes = [];
        if (roundedWeight >= (CONSTANTS.OVERWEIGHT_LIMIT || 40)) {
          hasOverweight = true;
          boxNotes.push("超重");
        }
        if (
          l >= (CONSTANTS.OVERSIZED_LIMIT || 150) ||
          w >= (CONSTANTS.OVERSIZED_LIMIT || 150) ||
          h >= (CONSTANTS.OVERSIZED_LIMIT || 150)
        ) {
          hasOversized = true;
          boxNotes.push("超長");
        }

        if (l > 0 && w > 0 && h > 0) {
          const cai = Math.ceil(
            (l * w * h) / (CONSTANTS.VOLUME_DIVISOR || 28317)
          );
          totalVolumetricCai += cai;

          const volFee = cai * (rateInfo.volumeRate || 0);
          const wtFee = roundedWeight * (rateInfo.weightRate || 0);
          const finalBoxFee = Math.max(volFee, wtFee);
          const isVolWin = volFee >= wtFee;

          totalRawBaseCost += finalBoxFee;

          breakdown.packages.push({
            trackingNumber: pkg.trackingNumber,
            productName: pkg.productName,
            boxIndex: index + 1,
            type: typeName,
            dims: `${l}x${w}x${h} cm`,
            weight: `${weight} kg`,
            cai: cai,
            calcMethod: isVolWin ? "材積計費" : "重量計費",
            appliedRate: isVolWin ? rateInfo.volumeRate : rateInfo.weightRate,
            rawFee: finalBoxFee,
            notes: boxNotes.join(", "),
          });
        }
      });
    } catch (e) {
      console.warn(`包裹 ${pkg.trackingNumber} 計算異常:`, e.message);
    }
  });

  breakdown.subtotal = totalRawBaseCost;

  let finalBaseCost = totalRawBaseCost;
  const minCharge = Number(CONSTANTS.MINIMUM_CHARGE) || 0;
  if (totalRawBaseCost > 0 && totalRawBaseCost < minCharge) {
    finalBaseCost = minCharge;
    breakdown.minChargeDiff = minCharge - totalRawBaseCost;
    breakdown.surcharges.push({
      name: "低消補足",
      amount: breakdown.minChargeDiff,
      reason: `未達最低消費 $${minCharge}`,
    });
  }

  const factor = Number(CONSTANTS.CBM_TO_CAI_FACTOR) || 35.315;
  const rawTotalCbm = totalVolumetricCai / factor;
  const displayTotalCbm = parseFloat(rawTotalCbm.toFixed(2)) || 0;
  const deliveryRateVal = parseFloat(deliveryRate) || 0;
  const remoteFee = Math.round(rawTotalCbm * deliveryRateVal);

  if (remoteFee > 0) {
    breakdown.surcharges.push({
      name: "派送費 (偏遠/聯運)",
      amount: remoteFee,
      reason: `體積 ${displayTotalCbm} CBM x 費率 $${deliveryRateVal}`,
    });
  }

  const totalCost = Math.round(finalBaseCost + remoteFee);
  breakdown.finalTotal = totalCost;

  return {
    totalCost,
    totalCbm: displayTotalCbm,
    totalActualWeight: parseFloat(totalActualWeight.toFixed(2)),
    totalVolumetricCai: totalVolumetricCai,
    breakdown,
  };
};

/**
 * --- 2. [API] 預估運費 ---
 */
const previewShipmentCost = async (req, res) => {
  try {
    let { packageIds, deliveryLocationRate } = req.body;
    if (!packageIds || !Array.isArray(packageIds) || packageIds.length === 0)
      return res.status(400).json({ success: false, message: "請選擇包裹" });

    const packagesToShip = await prisma.package.findMany({
      where: {
        id: { in: packageIds },
        userId: req.user.id,
        status: "ARRIVED",
        shipmentId: null,
      },
    });

    const systemRates = await ratesManager.getRates();
    const result = calculateShipmentDetails(
      packagesToShip,
      systemRates,
      deliveryLocationRate
    );

    res.status(200).json({ success: true, preview: result });
  } catch (error) {
    res.status(500).json({ success: false, message: "預估失敗" });
  }
};

/**
 * --- 3. [API] 建立集運單 ---
 */
const createShipment = async (req, res) => {
  try {
    let {
      packageIds,
      shippingAddress,
      recipientName,
      phone,
      idNumber,
      deliveryLocationRate,
      additionalServices,
      paymentMethod,
    } = req.body;
    const userId = req.user.id;
    const isWalletPay = paymentMethod === "WALLET";

    if (typeof packageIds === "string") packageIds = JSON.parse(packageIds);
    if (!packageIds || packageIds.length === 0)
      return res.status(400).json({ success: false, message: "請選擇包裹" });

    const packagesToShip = await prisma.package.findMany({
      where: {
        id: { in: packageIds },
        userId: userId,
        status: "ARRIVED",
        shipmentId: null,
      },
    });

    const systemRates = await ratesManager.getRates();
    const calcResult = calculateShipmentDetails(
      packagesToShip,
      systemRates,
      deliveryLocationRate
    );

    const newShipment = await prisma.$transaction(async (tx) => {
      let transactionId = null;
      if (isWalletPay) {
        const wallet = await tx.wallet.update({
          where: { userId: userId, balance: { gte: calcResult.totalCost } },
          data: { balance: { decrement: calcResult.totalCost } },
        });
        const txRecord = await tx.transaction.create({
          data: {
            walletId: wallet.id,
            amount: -calcResult.totalCost,
            type: "PAYMENT",
            status: "COMPLETED",
            description: "支付集運單費用",
          },
        });
        transactionId = txRecord.id;
      }

      const shipment = await tx.shipment.create({
        data: {
          recipientName,
          phone,
          shippingAddress,
          idNumber,
          userId,
          deliveryLocationRate: parseFloat(deliveryLocationRate) || 0,
          totalCost: calcResult.totalCost,
          status: isWalletPay ? "PROCESSING" : "PENDING_PAYMENT",
          paymentProof: isWalletPay ? "WALLET_PAY" : null,
          transactionId,
          additionalServices:
            typeof additionalServices === "string"
              ? JSON.parse(additionalServices)
              : additionalServices,
        },
      });

      await tx.package.updateMany({
        where: { id: { in: packageIds } },
        data: { status: "IN_SHIPMENT", shipmentId: shipment.id },
      });

      return shipment;
    });

    try {
      await sendNewShipmentNotification(newShipment, req.user);
      await sendShipmentCreatedNotification(newShipment, req.user);
    } catch (e) {}

    res.status(201).json({ success: true, shipment: newShipment });
  } catch (error) {
    res
      .status(400)
      .json({ success: false, message: error.message || "建立失敗" });
  }
};

/**
 * --- 4. [API] 獲取我的集運單清單 ---
 */
const getMyShipments = async (req, res) => {
  try {
    const shipments = await prisma.shipment.findMany({
      where: { userId: req.user.id },
      include: { packages: true },
      orderBy: { createdAt: "desc" },
    });
    res.status(200).json({ success: true, shipments });
  } catch (error) {
    res.status(500).json({ success: false, message: "載入清單失敗" });
  }
};

/**
 * --- 5. [API] 上傳付款憑證 (Cloudinary 破圖修復核心) ---
 */
const uploadPaymentProof = async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file)
      return res.status(400).json({ success: false, message: "請選擇圖片" });

    let finalPath = req.file.path;

    // [關鍵修正]：如果是 Cloudinary 網址，跳過斜槓 replace，防止協議損毀 (https:// -> https:/)
    if (finalPath.startsWith("http")) {
      finalPath = finalPath.replace(/^http:\/\//i, "https://");
    } else {
      // 只有本地開發文件才執行路徑清理
      finalPath = finalPath.replace(/\\/g, "/");
      if (finalPath.startsWith("public/")) {
        finalPath = "/" + finalPath.replace("public/", "");
      }
      finalPath = finalPath.replace(/\/+/g, "/");
    }

    const updatedShipment = await prisma.shipment.update({
      where: { id: id, userId: req.user.id },
      data: {
        paymentProof: finalPath,
        taxId: req.body.taxId || null,
        invoiceTitle: req.body.invoiceTitle || null,
      },
    });

    try {
      await sendPaymentProofNotification(updatedShipment, req.user);
    } catch (e) {}

    res
      .status(200)
      .json({ success: true, message: "上傳成功", shipment: updatedShipment });
  } catch (error) {
    res.status(500).json({ success: false, message: "上傳失敗" });
  }
};

/**
 * --- 6. [API] 獲取單一集運單詳情 (深度檢閱核心) ---
 */
const getShipmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const shipment = await prisma.shipment.findFirst({
      where: { id: id, userId: req.user.id },
      include: {
        user: { select: { name: true, piggyId: true } },
        packages: true,
      },
    });

    if (!shipment)
      return res
        .status(404)
        .json({ success: false, message: "找不到該集運單" });

    // 即時計算費用明細與物理統計 (確保數據不為 0)
    const systemRates = await ratesManager.getRates();
    const detailCalc = calculateShipmentDetails(
      shipment.packages,
      systemRates,
      shipment.deliveryLocationRate || 0
    );

    // 強制轉換為 HTTPS
    let finalPaymentProof = shipment.paymentProof;
    if (finalPaymentProof && finalPaymentProof.startsWith("http://")) {
      finalPaymentProof = finalPaymentProof.replace(/^http:\/\//i, "https://");
    }

    const processedShipment = {
      ...shipment,
      paymentProof: finalPaymentProof,
      costBreakdown: detailCalc.breakdown,
      physicalStats: {
        totalCbm: Number(detailCalc.totalCbm) || 0,
        totalWeight: Number(detailCalc.totalActualWeight) || 0,
        totalCai: Number(detailCalc.totalVolumetricCai) || 0,
      },
    };

    res.status(200).json({ success: true, shipment: processedShipment });
  } catch (error) {
    console.error("詳情查詢失敗:", error);
    res.status(500).json({ success: false, message: "詳情載入失敗" });
  }
};

/**
 * --- 7. [API] 取消集運單 ---
 */
const deleteMyShipment = async (req, res) => {
  try {
    const shipment = await prisma.shipment.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!shipment || shipment.status !== "PENDING_PAYMENT")
      return res
        .status(400)
        .json({ success: false, message: "當前訂單狀態無法取消" });

    await prisma.$transaction([
      prisma.package.updateMany({
        where: { shipmentId: shipment.id },
        data: { status: "ARRIVED", shipmentId: null },
      }),
      prisma.shipment.delete({ where: { id: shipment.id } }),
    ]);

    res.status(200).json({ success: true, message: "訂單已成功取消" });
  } catch (error) {
    res.status(500).json({ success: false, message: "取消失敗" });
  }
};

module.exports = {
  createShipment,
  getMyShipments,
  getShipmentById,
  uploadPaymentProof,
  deleteMyShipment,
  previewShipmentCost,
};

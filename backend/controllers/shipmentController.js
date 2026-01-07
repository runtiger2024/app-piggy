// backend/controllers/shipmentController.js
// V2025.Final.Transparency.Plus.Fixed - 旗艦透明化修正版
// [Update] 解決數據解析導致的 0 顯示問題 & 強化憑證路徑一致性處理
// [Added] 深度檢閱報告數據同步：狀態同步、物理統計值、透明化報表渲染、防破圖憑證顯示

const prisma = require("../config/db.js");
const {
  sendNewShipmentNotification,
  sendShipmentCreatedNotification,
  sendPaymentProofNotification,
} = require("../utils/sendEmail.js");
const ratesManager = require("../utils/ratesManager.js");
const invoiceHelper = require("../utils/invoiceHelper.js");
const createLog = require("../utils/createLog.js");
const { deleteFiles } = require("../utils/adminHelpers.js");
const fs = require("fs");

// --- 1. 核心輔助計算函式 (高透明度修正版) ---
// 此函數負責生成「深度檢閱」所需的所有計算明細，並修正數據解析問題
const calculateShipmentDetails = (packages, rates, deliveryRate) => {
  // [修正] 確保常數存在，防止 NaN 導致物理數據顯示為 0
  const safeRates = rates || {};
  const CONSTANTS = safeRates.constants || {
    VOLUME_DIVISOR: 28317,
    CBM_TO_CAI_FACTOR: 35.315, // 補上遺失的轉換係數
    MINIMUM_CHARGE: 0,
    OVERWEIGHT_LIMIT: 40,
    OVERSIZED_LIMIT: 150,
    OVERWEIGHT_FEE: 0,
    OVERSIZED_FEE: 0,
  };

  let totalRawBaseCost = 0;
  let totalActualWeight = 0;
  let totalVolumetricCai = 0;

  let hasOversized = false;
  let hasOverweight = false;

  let breakdown = {
    packages: [],
    subtotal: 0,
    minChargeDiff: 0,
    surcharges: [],
    remoteFeeCalc: "",
    finalTotal: 0,
  };

  packages.forEach((pkg) => {
    try {
      // [核心修正] 數據解析安全性：強化字串與物件的相容性
      let boxes = pkg.arrivedBoxesJson || [];
      if (typeof boxes === "string") {
        try {
          boxes = JSON.parse(boxes);
        } catch (e) {
          boxes = [];
        }
      }

      if (!Array.isArray(boxes) || boxes.length === 0) {
        // 如果沒有箱子明細，則採納原本計算好的費用（舊資料相容）
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

        // [核心修正] 確保物理統計數據正確累加
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
            rateUnit: isVolWin ? "元/材" : "元/kg",
            calcFormula: isVolWin
              ? `${cai} 材 x $${rateInfo.volumeRate}`
              : `${roundedWeight} kg x $${rateInfo.weightRate}`,
            rawFee: finalBoxFee,
            notes: boxNotes.join(", "),
          });
        }
      });
    } catch (e) {
      console.warn(`包裹 ${pkg.trackingNumber} 計算異常:`, e);
    }
  });

  breakdown.subtotal = totalRawBaseCost;

  let finalBaseCost = totalRawBaseCost;
  const isMinimumChargeApplied =
    totalRawBaseCost > 0 && totalRawBaseCost < (CONSTANTS.MINIMUM_CHARGE || 0);

  if (isMinimumChargeApplied) {
    finalBaseCost = CONSTANTS.MINIMUM_CHARGE;
    breakdown.minChargeDiff = CONSTANTS.MINIMUM_CHARGE - totalRawBaseCost;
    breakdown.surcharges.push({
      name: "低消補足",
      amount: breakdown.minChargeDiff,
      reason: `未達最低消費 $${CONSTANTS.MINIMUM_CHARGE}`,
    });
  }

  const overweightFee = hasOverweight ? CONSTANTS.OVERWEIGHT_FEE || 0 : 0;
  if (hasOverweight && overweightFee > 0) {
    breakdown.surcharges.push({
      name: "超重附加費",
      amount: overweightFee,
      reason: "包含單件超重包裹",
    });
  }

  const oversizedFee = hasOversized ? CONSTANTS.OVERSIZED_FEE || 0 : 0;
  if (hasOversized && oversizedFee > 0) {
    breakdown.surcharges.push({
      name: "超長附加費",
      amount: oversizedFee,
      reason: "包含單件超長包裹",
    });
  }

  // [修正] 確保 CBM 計算係數正確，避免 totalCbm 顯示為 0
  const factor = CONSTANTS.CBM_TO_CAI_FACTOR || 35.315;
  const rawTotalCbm = totalVolumetricCai / factor;
  const displayTotalCbm = parseFloat(rawTotalCbm.toFixed(2));
  const deliveryRateVal = parseFloat(deliveryRate) || 0;
  const rawRemoteFee = rawTotalCbm * deliveryRateVal;

  if (rawRemoteFee > 0) {
    breakdown.remoteFeeCalc = `${displayTotalCbm} CBM x $${deliveryRateVal}`;
    breakdown.surcharges.push({
      name: "派送費 (偏遠/聯運)",
      amount: Math.round(rawRemoteFee),
      reason: `總體積 ${displayTotalCbm} CBM x 地區費率 $${deliveryRateVal}`,
    });
  }

  const totalCostRaw =
    finalBaseCost + rawRemoteFee + overweightFee + oversizedFee;
  const totalCost = Math.round(totalCostRaw);
  breakdown.finalTotal = totalCost;

  return {
    totalCost,
    baseCost: finalBaseCost,
    originalBaseCost: totalRawBaseCost,
    remoteFee: Math.round(rawRemoteFee),
    totalCbm: displayTotalCbm,
    totalActualWeight: parseFloat(totalActualWeight.toFixed(2)),
    totalVolumetricCai: totalVolumetricCai,
    overweightFee,
    oversizedFee,
    isMinimumChargeApplied,
    hasOversized,
    hasOverweight,
    breakdown,
    ratesConstant: { minimumCharge: CONSTANTS.MINIMUM_CHARGE || 0 },
  };
};

// --- 2. [API] 預估運費 ---
const previewShipmentCost = async (req, res) => {
  try {
    let { packageIds, deliveryLocationRate } = req.body;
    const userId = req.user.id;
    if (!packageIds || !Array.isArray(packageIds) || packageIds.length === 0)
      return res.status(400).json({ success: false, message: "請選擇包裹" });

    const packagesToShip = await prisma.package.findMany({
      where: {
        id: { in: packageIds },
        userId: userId,
        status: "ARRIVED",
        shipmentId: null,
      },
    });

    if (packagesToShip.length !== packageIds.length)
      return res.status(400).json({ success: false, message: "包含無效包裹" });

    const systemRates = await ratesManager.getRates();
    const result = calculateShipmentDetails(
      packagesToShip,
      systemRates,
      deliveryLocationRate
    );

    res.status(200).json({ success: true, preview: result });
  } catch (error) {
    console.error("預算失敗:", error);
    res.status(500).json({ success: false, message: "預估失敗" });
  }
};

// --- 3. [API] 建立集運單 ---
const createShipment = async (req, res) => {
  try {
    let {
      packageIds,
      shippingAddress,
      recipientName,
      phone,
      idNumber,
      carrierType,
      carrierId,
      note,
      deliveryLocationRate,
      additionalServices,
      paymentMethod,
    } = req.body;
    const userId = req.user.id;
    const files = req.files || [];
    const isWalletPay = paymentMethod === "WALLET";

    let shipmentImagePaths = [];
    if (files.length > 0) {
      shipmentImagePaths = files.map((file) => {
        if (
          file.path &&
          (file.path.startsWith("http") || file.path.startsWith("https"))
        ) {
          return file.path.replace(/^http:\/\//i, "https://");
        }
        const filename = file.filename;
        // 確保路徑格式一致，不含多餘斜槓
        return `/uploads/${filename}`;
      });
    }

    try {
      if (typeof packageIds === "string") packageIds = JSON.parse(packageIds);
    } catch (e) {}

    if (!packageIds || !Array.isArray(packageIds) || packageIds.length === 0)
      return res.status(400).json({ success: false, message: "請選擇包裹" });

    const packagesToShip = await prisma.package.findMany({
      where: {
        id: { in: packageIds },
        userId: userId,
        status: "ARRIVED",
        shipmentId: null,
      },
    });

    if (packagesToShip.length !== packageIds.length)
      return res.status(400).json({ success: false, message: "包含無效包裹" });

    const systemRates = await ratesManager.getRates();
    const calcResult = calculateShipmentDetails(
      packagesToShip,
      systemRates,
      deliveryLocationRate
    );

    let finalAdditionalServices = {};
    if (additionalServices) {
      try {
        finalAdditionalServices =
          typeof additionalServices === "string"
            ? JSON.parse(additionalServices)
            : additionalServices;
      } catch (e) {}
    }

    let shipmentStatus = isWalletPay ? "PROCESSING" : "PENDING_PAYMENT";

    const newShipment = await prisma.$transaction(async (tx) => {
      let txRecord = null;
      if (isWalletPay) {
        try {
          await tx.wallet.update({
            where: { userId: userId, balance: { gte: calcResult.totalCost } },
            data: { balance: { decrement: calcResult.totalCost } },
          });
        } catch (err) {
          throw new Error("錢包餘額不足，扣款失敗");
        }

        txRecord = await tx.transaction.create({
          data: {
            wallet: { connect: { userId } },
            amount: -calcResult.totalCost,
            type: "PAYMENT",
            status: "COMPLETED",
            description: "支付運費 (訂單建立)",
          },
        });
      }

      const createdShipment = await tx.shipment.create({
        data: {
          recipientName,
          phone,
          shippingAddress,
          idNumber,
          taxId: null,
          invoiceTitle: null,
          carrierType: carrierType || null,
          carrierId: carrierId || null,
          note: note || null,
          additionalServices: finalAdditionalServices,
          totalCost: calcResult.totalCost,
          deliveryLocationRate: parseFloat(deliveryLocationRate) || 0,
          status: shipmentStatus,
          userId: userId,
          productUrl: null,
          shipmentProductImages: shipmentImagePaths,
          transactionId: txRecord ? txRecord.id : null,
          paymentProof: isWalletPay ? "WALLET_PAY" : null,
        },
      });

      await tx.package.updateMany({
        where: { id: { in: packageIds } },
        data: { status: "IN_SHIPMENT", shipmentId: createdShipment.id },
      });

      return createdShipment;
    });

    try {
      await sendNewShipmentNotification(newShipment, req.user);
      await sendShipmentCreatedNotification(newShipment, req.user);
    } catch (e) {
      console.warn("Email通知失敗:", e.message);
    }

    res.status(201).json({
      success: true,
      message: isWalletPay
        ? "扣款成功！訂單已成立並開始處理。"
        : "集運單建立成功！",
      shipment: newShipment,
      costBreakdown: calcResult.breakdown,
    });
  } catch (error) {
    res
      .status(400)
      .json({ success: false, message: error.message || "建立失敗" });
  }
};

// --- 4. [API] 獲獲我的集運單清單 ---
const getMyShipments = async (req, res) => {
  try {
    const userId = req.user.id;
    const shipments = await prisma.shipment.findMany({
      where: { userId: userId },
      orderBy: { createdAt: "desc" },
      include: {
        packages: {
          select: {
            id: true,
            productName: true,
            trackingNumber: true,
            arrivedBoxesJson: true,
            totalCalculatedFee: true,
            warehouseImages: true,
          },
        },
      },
    });
    const processedShipments = shipments.map((ship) => ({
      ...ship,
      additionalServices: ship.additionalServices || {},
      packages: ship.packages.map((pkg) => ({
        ...pkg,
        warehouseImages: pkg.warehouseImages || [],
        arrivedBoxes: pkg.arrivedBoxesJson || [],
      })),
    }));
    res.status(200).json({
      success: true,
      count: processedShipments.length,
      shipments: processedShipments,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

// --- 5. [API] 上傳付款憑證 ---
const uploadPaymentProof = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    if (!req.file)
      return res.status(400).json({ success: false, message: "請選擇圖片" });

    // [修正] 防破圖邏輯：統一處理路徑，避免多餘斜槓
    let finalPath;
    if (
      req.file.path &&
      (req.file.path.startsWith("http") || req.file.path.startsWith("https"))
    ) {
      finalPath = req.file.path.replace(/^http:\/\//i, "https://");
    } else {
      const filename = req.file.filename;
      finalPath = `/uploads/${filename}`;
    }

    const taxId = req.body.taxId ? req.body.taxId.trim() : "";
    const invoiceTitle = req.body.invoiceTitle
      ? req.body.invoiceTitle.trim()
      : "";

    if (taxId && !invoiceTitle) {
      if (!finalPath.startsWith("http")) fs.unlink(req.file.path, () => {});
      return res
        .status(400)
        .json({ success: false, message: "填寫統一編號時，公司抬頭為必填" });
    }

    const shipment = await prisma.shipment.findFirst({
      where: { id: id, userId: userId },
    });
    if (!shipment) {
      if (!finalPath.startsWith("http")) fs.unlink(req.file.path, () => {});
      return res.status(404).json({ success: false, message: "找不到集運單" });
    }

    const updatedShipment = await prisma.shipment.update({
      where: { id: id },
      data: { paymentProof: finalPath, taxId, invoiceTitle },
    });

    try {
      await sendPaymentProofNotification(updatedShipment, req.user);
    } catch (e) {
      console.warn("Email通知失敗:", e.message);
    }

    res
      .status(200)
      .json({ success: true, message: "上傳成功", shipment: updatedShipment });
  } catch (error) {
    if (req.file && req.file.path && !req.file.path.startsWith("http"))
      fs.unlink(req.file.path, () => {});
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
};

// --- 6. [API] 獲取單一集運單詳情 (深度檢閱核心 API) ---
const getShipmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const isAdmin =
      user.permissions &&
      (user.permissions.includes("CAN_MANAGE_SHIPMENTS") ||
        user.permissions.includes("SHIPMENT_VIEW"));

    const whereCondition = { id: id };
    if (!isAdmin) whereCondition.userId = user.id;

    const shipment = await prisma.shipment.findFirst({
      where: whereCondition,
      include: {
        user: { select: { email: true, name: true, piggyId: true } },
        packages: true,
      },
    });

    if (!shipment)
      return res.status(404).json({ success: false, message: "找不到集運單" });

    // [核心修正] 為深度檢閱即時生成報告明細，解決物理數據顯示 0 的問題
    const systemRates = await ratesManager.getRates();
    const detailCalc = calculateShipmentDetails(
      shipment.packages,
      systemRates,
      shipment.deliveryLocationRate || 0
    );

    const processedPackages = shipment.packages.map((pkg) => ({
      ...pkg,
      productImages: pkg.productImages || [],
      warehouseImages: pkg.warehouseImages || [],
      arrivedBoxes: pkg.arrivedBoxesJson || [],
    }));

    // [優化] 防破圖處理：確保路徑不含重複斜槓並強制 HTTPS
    let finalPaymentProof = shipment.paymentProof;
    if (finalPaymentProof && finalPaymentProof.startsWith("http://")) {
      finalPaymentProof = finalPaymentProof.replace(/^http:\/\//i, "https://");
    }

    const processedShipment = {
      ...shipment,
      paymentProof: finalPaymentProof,
      packages: processedPackages,
      additionalServices: shipment.additionalServices || {},
      shipmentProductImages: shipment.shipmentProductImages || [],
      // 將計算報告注入回傳物件，讓前台詳細報告頁面有正確數據可顯示
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
    res.status(500).json({ success: false, message: "伺服器發生錯誤" });
  }
};

// --- 7. [API] 取消/刪除我的集運單 ---
const deleteMyShipment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const shipment = await prisma.shipment.findFirst({
      where: { id: id, userId: userId },
    });
    if (!shipment)
      return res.status(404).json({ success: false, message: "找不到集運單" });
    if (shipment.status !== "PENDING_PAYMENT")
      return res
        .status(400)
        .json({ success: false, message: "只能取消待付款訂單" });

    await prisma.$transaction(async (tx) => {
      await tx.package.updateMany({
        where: { shipmentId: id },
        data: { status: "ARRIVED", shipmentId: null },
      });
      await tx.shipment.delete({ where: { id: id } });
    });
    res.status(200).json({ success: true, message: "訂單已取消" });
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

// backend/controllers/shipmentController.js
// V2025.Final.Transparency.Plus - 旗艦透明化版 (含深度檢閱數據補全)
// [Update] Fix Cloudinary Path Issue & 解決管理後台深度檢閱無內容問題

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

// --- 1. 核心輔助計算函式 (高透明度版本) ---
// 此函數負責生成「深度檢閱」所需的所有計算明細
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
    remoteFeeCalc: "",
    finalTotal: 0,
  };

  packages.forEach((pkg) => {
    try {
      const boxes = pkg.arrivedBoxesJson || [];

      if (boxes.length === 0) {
        const legacyFee = pkg.totalCalculatedFee || 0;
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
        const rateInfo = ratesManager.getCategoryRate(rates, box.type);
        const typeName = rateInfo.name || box.type || "一般";

        totalActualWeight += weight;

        let boxNotes = [];
        if (roundedWeight >= CONSTANTS.OVERWEIGHT_LIMIT) {
          hasOverweight = true;
          boxNotes.push("超重");
        }
        if (
          l >= CONSTANTS.OVERSIZED_LIMIT ||
          w >= CONSTANTS.OVERSIZED_LIMIT ||
          h >= CONSTANTS.OVERSIZED_LIMIT
        ) {
          hasOversized = true;
          boxNotes.push("超長");
        }

        if (l > 0 && w > 0 && h > 0 && weight > 0) {
          const cai = Math.ceil((l * w * h) / CONSTANTS.VOLUME_DIVISOR);
          totalVolumeDivisor += cai;
          totalVolumetricCai += cai;

          const volFee = cai * rateInfo.volumeRate;
          const wtFee = roundedWeight * rateInfo.weightRate;
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
      totalRawBaseCost += pkg.totalCalculatedFee || 0;
    }
  });

  breakdown.subtotal = totalRawBaseCost;

  let finalBaseCost = totalRawBaseCost;
  const isMinimumChargeApplied =
    totalRawBaseCost > 0 && totalRawBaseCost < CONSTANTS.MINIMUM_CHARGE;

  if (isMinimumChargeApplied) {
    finalBaseCost = CONSTANTS.MINIMUM_CHARGE;
    breakdown.minChargeDiff = CONSTANTS.MINIMUM_CHARGE - totalRawBaseCost;
    breakdown.surcharges.push({
      name: "低消補足",
      amount: breakdown.minChargeDiff,
      reason: `未達最低消費 $${CONSTANTS.MINIMUM_CHARGE}`,
    });
  }

  const overweightFee = hasOverweight ? CONSTANTS.OVERWEIGHT_FEE : 0;
  if (hasOverweight) {
    breakdown.surcharges.push({
      name: "超重附加費",
      amount: overweightFee,
      reason: "包含單件超重包裹",
    });
  }

  const oversizedFee = hasOversized ? CONSTANTS.OVERSIZED_FEE : 0;
  if (hasOversized) {
    breakdown.surcharges.push({
      name: "超長附加費",
      amount: oversizedFee,
      reason: "包含單件超長包裹",
    });
  }

  const rawTotalCbm = totalVolumeDivisor / CONSTANTS.CBM_TO_CAI_FACTOR;
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
    ratesConstant: { minimumCharge: CONSTANTS.MINIMUM_CHARGE },
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
        return `/uploads/${file.filename}`;
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

    const incompletePackages = packagesToShip.filter((pkg) => {
      const hasUrl = pkg.productUrl && pkg.productUrl.trim() !== "";
      const hasImages =
        Array.isArray(pkg.productImages) && pkg.productImages.length > 0;
      return !hasUrl && !hasImages;
    });

    if (incompletePackages.length > 0) {
      const pkgNumbers = incompletePackages
        .map((p) => p.trackingNumber)
        .join(", ");
      return res.status(400).json({
        success: false,
        message: `以下包裹資料待完善 (缺購買連結或照片)，無法打包：${pkgNumbers}`,
      });
    }

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

// --- 4. [API] 獲取我的集運單清單 ---
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
    res
      .status(200)
      .json({
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

    let finalPath;
    if (
      req.file.path &&
      (req.file.path.startsWith("http") || req.file.path.startsWith("https"))
    ) {
      finalPath = req.file.path.replace(/^http:\/\//i, "https://");
    } else {
      finalPath = `/uploads/${req.file.filename}`;
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

    const updateData = { paymentProof: finalPath };
    if (taxId) updateData.taxId = taxId;
    if (invoiceTitle) updateData.invoiceTitle = invoiceTitle;

    const updatedShipment = await prisma.shipment.update({
      where: { id: id },
      data: updateData,
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
// [新增/優化] 解決管理後台深度檢閱內容空白的問題
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

    // [核心修正] 為深度檢閱即時生成報告明細
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

    const processedShipment = {
      ...shipment,
      packages: processedPackages,
      additionalServices: shipment.additionalServices || {},
      shipmentProductImages: shipment.shipmentProductImages || [],
      // 將計算報告注入回傳物件，讓前台詳細報告頁面有資料可抓
      costBreakdown: detailCalc.breakdown,
      physicalStats: {
        totalCbm: detailCalc.totalCbm,
        totalWeight: detailCalc.totalActualWeight,
        totalCai: detailCalc.totalVolumetricCai,
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

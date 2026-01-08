// backend/utils/invoiceHelper.js
// V2025.Furniture.Optimized - 新增 Email 佔位符號檢核與傢俱代採購支援

const axios = require("axios");
const crypto = require("crypto");
const prisma = require("../config/db.js");
require("dotenv").config();

/**
 * [新增] 檢查 Email 是否為 LINE 佔位符號
 * 若為 true，則應阻止發票開立
 */
const isPlaceholderEmail = (email) => {
  return !email || email.includes("@line.temp");
};

// 強制清洗 BASE_URL
const RAW_BASE_URL =
  process.env.AMEGO_API_URL || "https://invoice-api.amego.tw/json";
const BASE_URL = RAW_BASE_URL.replace(/\/f0401\/?$/, "").replace(/\/$/, "");

// 從環境變數讀取
const ENV_MERCHANT_ID = process.env.AMEGO_MERCHANT_ID;
const ENV_HASH_KEY = process.env.AMEGO_HASH_KEY;

/**
 * 取得發票設定 (優先讀取資料庫 SystemSetting)
 */
const getInvoiceConfig = async () => {
  let config = {
    enabled: false,
    mode: "TEST",
    merchantId: ENV_MERCHANT_ID ? String(ENV_MERCHANT_ID).trim() : "",
    hashKey: ENV_HASH_KEY ? String(ENV_HASH_KEY).trim() : "",
  };

  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "invoice_config" },
    });

    if (setting && setting.value) {
      const dbConfig =
        typeof setting.value === "string"
          ? JSON.parse(setting.value)
          : setting.value;

      if (typeof dbConfig.enabled === "boolean")
        config.enabled = dbConfig.enabled;
      if (dbConfig.mode) config.mode = dbConfig.mode;

      if (dbConfig.merchantId)
        config.merchantId = String(dbConfig.merchantId).trim();
      if (dbConfig.hashKey) config.hashKey = String(dbConfig.hashKey).trim();
    }
  } catch (error) {
    console.warn("[Invoice] 讀取設定失敗，使用預設環境變數", error.message);
  }
  return config;
};

/**
 * 簽章產生器 (MD5: data + time + hashKey)
 */
const generateSign = (dataString, time, hashKey) => {
  const rawString = dataString + String(time) + String(hashKey);
  return crypto.createHash("md5").update(rawString).digest("hex");
};

/**
 * 字串清理
 */
const sanitizeString = (str) => {
  if (!str) return "";
  return str.replace(/[|'\"%<>\\]/g, "").trim();
};

/**
 * 電話清理
 */
const sanitizePhone = (str) => {
  if (!str) return "";
  return str.replace(/[^0-9]/g, "");
};

/**
 * 通用 API 請求發送器
 */
const sendAmegoRequest = async (endpoint, dataObj, config, merchantOrderNo) => {
  if (!config.merchantId || !config.hashKey) {
    throw new Error("發票設定不完整：缺少 Merchant ID 或 Hash Key");
  }

  const dataString = JSON.stringify(dataObj);
  const time = Math.floor(Date.now() / 1000);
  const sign = generateSign(dataString, time, config.hashKey);

  const params = new URLSearchParams();
  params.append("MerchantID", config.merchantId);
  params.append("invoice", config.merchantId);
  params.append("data", dataString);
  params.append("time", time);
  params.append("sign", sign);

  const fullUrl = `${BASE_URL}${endpoint}`;

  try {
    console.log(`[Invoice] 發送: ${merchantOrderNo} -> ${fullUrl}`);

    const response = await axios.post(fullUrl, params);
    const result = response.data;
    const respData = Array.isArray(result) ? result[0] : result;

    if (typeof respData === "string") {
      try {
        return JSON.parse(respData);
      } catch (e) {
        return respData;
      }
    }

    if (typeof respData !== "object") {
      console.error(`[Invoice API Fatal] Raw Response: ${respData}`);
      throw new Error(`API 回傳異常格式: ${respData} (請檢查網址或參數)`);
    }

    return respData;
  } catch (error) {
    console.error(`[Invoice API Error] ${error.message}`);
    if (error.response && error.response.data) {
      console.error(
        `[Invoice API Response]`,
        JSON.stringify(error.response.data)
      );
    }
    throw new Error("發票系統連線失敗: " + error.message);
  }
};

/**
 * 1. 開立發票 (集運單)
 * [優化] 加入 Email 佔位符號檢查
 */
const createInvoice = async (shipment, user) => {
  // 檢查是否為 LINE 佔位符號 Email
  if (isPlaceholderEmail(user.email)) {
    return {
      success: false,
      message:
        "開立失敗：使用者尚未設定真實 Email (@line.temp)，請通知客戶補填資料以接收發票。",
    };
  }

  const config = await getInvoiceConfig();
  if (!config.enabled)
    return { success: false, message: "系統設定：發票功能已關閉" };

  const total = Math.round(Number(shipment.totalCost));

  // [B2B 統編處理]
  const rawTaxId = shipment.taxId ? shipment.taxId.trim() : "";
  const hasTaxId = /^[0-9]{8}$/.test(rawTaxId);

  const unixTime = Math.floor(Date.now() / 1000);
  const shortId = shipment.id.slice(-15);
  const merchantOrderNo = `S${shortId}_${unixTime}`;

  let salesAmount = 0;
  let taxAmount = 0;
  let unitPrice = 0;
  let printMark = "0";

  if (hasTaxId) {
    printMark = "1";
    salesAmount = Math.round(total / 1.05);
    taxAmount = total - salesAmount;
    unitPrice = total; // B2B 單價填寫含稅金額
  } else {
    printMark = "0";
    salesAmount = total;
    taxAmount = 0;
    unitPrice = total;
  }

  const buyerId = hasTaxId ? rawTaxId : "0000000000";

  let buyerName = "";
  if (hasTaxId) {
    buyerName = shipment.invoiceTitle || shipment.recipientName || "貴公司";
  } else {
    buyerName = shipment.recipientName || "個人";
  }
  buyerName = sanitizeString(buyerName);

  const productItems = [
    {
      Description: "理貨費",
      Quantity: 1,
      Unit: "式",
      UnitPrice: unitPrice,
      Amount: unitPrice,
      TaxType: 1,
    },
  ];

  let carrierType = "";
  let carrierId1 = "";

  if (!hasTaxId && shipment.carrierType && shipment.carrierId) {
    const cType = shipment.carrierType;
    const cId = shipment.carrierId;
    if (cType === "3J0002" && !cId.startsWith("/")) {
      console.warn(`[Invoice] 載具格式錯誤忽略: ${cId}`);
    } else {
      carrierType = cType;
      carrierId1 = cId;
    }
  }

  const dataObj = {
    OrderId: merchantOrderNo,
    BuyerIdentifier: buyerId,
    BuyerName: buyerName,
    BuyerEmailAddress: user.email || "",
    BuyerPhone: sanitizePhone(shipment.phone || ""),
    Print: printMark,
    Donation: "0",
    TaxType: 1,
    TaxRate: 0.05,
    SalesAmount: salesAmount,
    TaxAmount: taxAmount,
    TotalAmount: total,
    FreeTaxSalesAmount: 0,
    ZeroTaxSalesAmount: 0,
    ItemName: "理貨費",
    ItemCount: "1",
    ItemUnit: "式",
    ItemPrice: unitPrice,
    ItemAmount: unitPrice,
    ProductItem: productItems,
    CarrierType: carrierType,
    CarrierId1: carrierId1,
    LoveCode: "",
    CustomerIdentifier: "",
  };

  try {
    const resData = await sendAmegoRequest(
      "/f0401",
      dataObj,
      config,
      merchantOrderNo
    );
    if (
      (resData.Status && resData.Status === "SUCCESS") ||
      resData.RtnCode === "1" ||
      resData.code === 0 ||
      (resData.InvoiceNumber && resData.InvoiceNumber.length > 0)
    ) {
      return {
        success: true,
        invoiceNumber: resData.InvoiceNumber || resData.invoice_number,
        invoiceDate: new Date(),
        randomCode: resData.RandomCode || resData.random_number || "",
        message: "開立成功",
      };
    } else {
      return {
        success: false,
        message: `開立失敗: ${
          resData.Message || resData.msg || "API 回傳錯誤"
        }`,
      };
    }
  } catch (e) {
    return { success: false, message: e.message };
  }
};

/**
 * 2. 作廢發票
 */
const voidInvoice = async (invoiceNumber, reason = "訂單取消") => {
  const config = await getInvoiceConfig();
  if (!config.enabled) return { success: false, message: "發票功能已關閉" };

  const invoiceDateStr = new Date().toISOString().split("T")[0];

  const dataObj = [
    {
      CancelInvoiceNumber: invoiceNumber,
      InvalidReason: sanitizeString(reason),
      InvoiceDate: invoiceDateStr,
      BuyerIdentifier: "0000000000",
      SellerIdentifier: config.merchantId,
    },
  ];

  try {
    const resData = await sendAmegoRequest(
      "/f0501",
      config.hashKey ? dataObj : dataObj, // 修正對齊原有邏輯
      config,
      "VOID-" + invoiceNumber
    );
    if (
      resData.Status === "SUCCESS" ||
      resData.RtnCode === "1" ||
      resData.code === 0
    ) {
      return { success: true, message: "作廢成功" };
    } else {
      return {
        success: false,
        message: `作廢失敗: ${resData.Message || resData.msg}`,
      };
    }
  } catch (e) {
    return { success: false, message: e.message };
  }
};

/**
 * 3. 儲值發票 (優先使用交易紀錄中的統編)
 * [優化] 加入 Email 佔位符號檢查
 */
const createDepositInvoice = async (transaction, user) => {
  // 檢查是否為 LINE 佔位符號 Email
  if (isPlaceholderEmail(user.email)) {
    return {
      success: false,
      message:
        "儲值發票開立失敗：使用者 Email 仍為 LINE 暫時信箱，無法發送通知。",
    };
  }

  const config = await getInvoiceConfig();
  if (!config.enabled) return { success: false, message: "發票功能未啟用" };

  const total = Math.round(transaction.amount);

  const txTaxId = transaction.taxId ? transaction.taxId.trim() : "";
  const userTaxId = user.defaultTaxId ? user.defaultTaxId.trim() : "";
  const rawTaxId = txTaxId || userTaxId;

  const hasTaxId = /^[0-9]{8}$/.test(rawTaxId);

  const unixTime = Math.floor(Date.now() / 1000);
  const shortId = transaction.id.slice(-15);
  const merchantOrderNo = `DEP${shortId}_${unixTime}`;

  let salesAmount = 0;
  let taxAmount = 0;
  let unitPrice = 0;
  let printMark = "0";

  if (hasTaxId) {
    printMark = "1";
    salesAmount = Math.round(total / 1.05);
    taxAmount = total - salesAmount;
    unitPrice = total;
  } else {
    printMark = "0";
    salesAmount = total;
    taxAmount = 0;
    unitPrice = total;
  }

  const buyerId = hasTaxId ? rawTaxId : "0000000000";

  let buyerName = "";
  if (hasTaxId) {
    buyerName =
      transaction.invoiceTitle ||
      user.defaultInvoiceTitle ||
      user.name ||
      "貴公司";
  } else {
    buyerName = user.name || "會員儲值";
  }
  buyerName = sanitizeString(buyerName);

  const productItems = [
    {
      Description: "理貨費",
      Quantity: 1,
      Unit: "式",
      UnitPrice: unitPrice,
      Amount: unitPrice,
      TaxType: 1,
    },
  ];

  const dataObj = {
    OrderId: merchantOrderNo,
    BuyerIdentifier: buyerId,
    BuyerName: buyerName,
    BuyerEmailAddress: user.email || "",
    BuyerPhone: sanitizePhone(user.phone || ""),
    Print: printMark,
    Donation: "0",
    TaxType: 1,
    TaxRate: 0.05,
    SalesAmount: salesAmount,
    TaxAmount: taxAmount,
    TotalAmount: total,
    FreeTaxSalesAmount: 0,
    ZeroTaxSalesAmount: 0,
    ItemName: "理貨費",
    ItemCount: "1",
    ItemUnit: "式",
    ItemPrice: unitPrice,
    ItemAmount: unitPrice,
    ProductItem: productItems,
    CarrierType: "",
    CarrierId1: "",
    LoveCode: "",
    CustomerIdentifier: "",
  };

  try {
    const resData = await sendAmegoRequest(
      "/f0401",
      dataObj,
      config,
      merchantOrderNo
    );
    if (
      (resData.Status && resData.Status === "SUCCESS") ||
      resData.RtnCode === "1" ||
      resData.code === 0 ||
      (resData.InvoiceNumber && resData.InvoiceNumber.length > 0)
    ) {
      return {
        success: true,
        invoiceNumber: resData.InvoiceNumber || resData.invoice_number,
        invoiceDate: new Date(),
        randomCode: resData.RandomCode || resData.random_number || "",
        message: "儲值發票開立成功",
      };
    } else {
      return {
        success: false,
        message: `開立失敗: ${
          resData.Message || resData.msg || "API 回傳錯誤"
        }`,
      };
    }
  } catch (e) {
    return { success: false, message: e.message };
  }
};

/**
 * 4. 傢俱代採購發票 (新增功能)
 * 發票內容為「傢俱代採購服務費」
 * [優化] 加入 Email 佔位符號檢查
 */
const createFurnitureInvoice = async (order, user) => {
  // 檢查是否為 LINE 佔位符號 Email
  if (isPlaceholderEmail(user.email)) {
    return {
      success: false,
      message:
        "代採購服務費發票開立失敗：檢測到 LINE 佔位符號 Email，請先更新真實信箱。",
    };
  }

  const config = await getInvoiceConfig();
  if (!config.enabled)
    return { success: false, message: "系統設定：發票功能已關閉" };

  // 金額為服務費總額
  const total = Math.round(Number(order.serviceFee));
  const rawTaxId = order.taxId ? order.taxId.trim() : "";
  const hasTaxId = /^[0-9]{8}$/.test(rawTaxId);

  const unixTime = Math.floor(Date.now() / 1000);
  const shortId = order.id.slice(-10);
  const merchantOrderNo = `FUR${shortId}_${unixTime}`;

  let salesAmount = hasTaxId ? Math.round(total / 1.05) : total;
  let taxAmount = hasTaxId ? total - salesAmount : 0;
  let unitPrice = total;

  const buyerId = hasTaxId ? rawTaxId : "0000000000";
  const buyerName = sanitizeString(
    hasTaxId ? order.invoiceTitle || "貴公司" : user.name || "個人"
  );

  const productItems = [
    {
      Description: `傢俱代採購服務費(${order.factoryName} - ${order.productName})`,
      Quantity: 1,
      Unit: "式",
      UnitPrice: unitPrice,
      Amount: unitPrice,
      TaxType: 1,
    },
  ];

  const dataObj = {
    OrderId: merchantOrderNo,
    BuyerIdentifier: buyerId,
    BuyerName: buyerName,
    BuyerEmailAddress: user.email || "",
    BuyerPhone: sanitizePhone(user.phone || ""),
    Print: hasTaxId ? "1" : "0",
    Donation: "0",
    TaxType: 1,
    TaxRate: 0.05,
    SalesAmount: salesAmount,
    TaxAmount: taxAmount,
    TotalAmount: total,
    ItemName: "傢俱代採購服務費",
    ItemCount: "1",
    ItemUnit: "式",
    ItemPrice: unitPrice,
    ItemAmount: unitPrice,
    ProductItem: productItems,
    CarrierType: "",
    CarrierId1: "",
  };

  try {
    const resData = await sendAmegoRequest(
      "/f0401",
      dataObj,
      config,
      merchantOrderNo
    );
    if (
      (resData.Status && resData.Status === "SUCCESS") ||
      resData.InvoiceNumber
    ) {
      return {
        success: true,
        invoiceNumber: resData.InvoiceNumber,
        invoiceDate: new Date(),
        message: "代採購服務費發票開立成功",
      };
    }
    return {
      success: false,
      message: `開立失敗: ${resData.Message || "API錯誤"}`,
    };
  } catch (e) {
    return { success: false, message: e.message };
  }
};

module.exports = {
  createInvoice,
  voidInvoice,
  createDepositInvoice,
  createFurnitureInvoice,
};

// backend/utils/ratesManager.js
// V2025.Final.Rates - 費率管理器 (大師優化：記憶體快取版)

const prisma = require("../config/db.js");

// 1. [大師新增]：建立記憶體快取，讓伺服器「背下」費率
let cachedRates = null;

const DEFAULT_RATES_STRUCTURE = {
  categories: {
    general: {
      name: "一般家具",
      description: "預設費率",
      weightRate: 0,
      volumeRate: 0,
    },
  },
  constants: {
    VOLUME_DIVISOR: 28317,
    CBM_TO_CAI_FACTOR: 35.3,
    MINIMUM_CHARGE: 0,
    OVERSIZED_LIMIT: 300,
    OVERSIZED_FEE: 0,
    OVERWEIGHT_LIMIT: 100,
    OVERWEIGHT_FEE: 0,
  },
};

/**
 * 從資料庫讀取運費設定 (含快取邏輯)
 */
const getRates = async () => {
  try {
    // [優化]：如果腦袋裡已經有背好的費率，就直接吐出來，不用查資料庫
    if (cachedRates) {
      return cachedRates;
    }

    const setting = await prisma.systemSetting.findUnique({
      where: { key: "rates_config" },
    });

    if (setting && setting.value) {
      const value =
        typeof setting.value === "string"
          ? JSON.parse(setting.value)
          : setting.value;

      // [優化]：查到後，先背下來 (存入快取)
      cachedRates = value;
      return cachedRates;
    }

    console.warn("⚠️ 警告：資料庫中找不到 rates_config，使用預設值");
    return DEFAULT_RATES_STRUCTURE;
  } catch (error) {
    console.error("讀取運費設定失敗:", error.message);
    return DEFAULT_RATES_STRUCTURE;
  }
};

/**
 * [大師新增]：清除快取的功能
 * 當管理員在後台改了運費，必須呼叫這個，否則伺服器會一直用舊的「記憶」
 */
const clearCache = () => {
  console.log("♻️ [RatesManager] 快取已清除，下次請求將讀取最新資料庫設定");
  cachedRates = null;
};

const getCategoryRate = (rates, typeInput) => {
  const CATEGORIES = rates.categories || {};
  const normalizedType = (typeInput || "general").trim().toLowerCase();

  if (CATEGORIES[normalizedType]) return CATEGORIES[normalizedType];
  if (CATEGORIES[typeInput]) return CATEGORIES[typeInput];

  console.warn(`⚠️ [RatesManager] 未知類型: '${typeInput}'，降級使用 general`);
  return CATEGORIES["general"] || { weightRate: 0, volumeRate: 0 };
};

const validateRates = (rates) => {
  if (!rates || !rates.categories || !rates.constants) return false;
  return typeof rates.constants.MINIMUM_CHARGE !== "undefined";
};

module.exports = {
  getRates,
  getCategoryRate,
  validateRates,
  clearCache, // 記得匯出
  DEFAULT_RATES: DEFAULT_RATES_STRUCTURE,
};

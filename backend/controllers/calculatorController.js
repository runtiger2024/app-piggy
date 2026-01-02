// backend/controllers/calculatorController.js (V13.0 - 終極旗艦無省略版：隨機人氣累加穩定化)

const prisma = require("../config/db.js");
const ratesManager = require("../utils/ratesManager.js");

// --- [1. 定義後端預設值 (當資料庫為空或發生錯誤時使用)] ---
const DEFAULT_CONFIG = {
  warehouseInfo: {
    recipient: "小跑豬+[您的姓名]",
    phone: "13652554906",
    zip: "523920",
    address: "广东省东莞市虎门镇龙眼工业路28号139鋪",
  },
  announcement: {
    enabled: true,
    text: "歡迎使用小跑豬集運！新會員註冊即享優惠。",
    color: "info",
  },
  // 預設偏遠地區
  remoteAreas: {
    1800: ["東勢區", "新社區", "石岡區", "和平區"],
    2000: ["三芝", "石門", "烏來", "坪林"],
    2500: ["名間鄉", "四湖鄉", "東勢鄉"],
    4000: ["南莊鄉", "獅潭鄉", "竹山鎮"],
    7000: ["小琉球", "綠島", "蘭嶼"],
  },
  bankInfo: {
    bankName: "第一銀行 (007)",
    branch: "台南分行",
    account: "60110066477",
    holder: "跑得快國際貿易",
  },
  // 代採購預設設定
  furnitureConfig: {
    exchangeRate: 4.65,
    serviceFeeRate: 0.05,
    minServiceFee: 500,
  },
  baselineUsage: 22999, // [最新需求] 從 22,999 開始統計
};

/**
 * @description 取得公開的計算機設定 (進網頁即隨機累加人氣 1-5 人)
 * @route       GET /api/calculator/config
 * @access      Public
 */
const getCalculatorConfig = async (req, res) => {
  try {
    // --- [核心新增：進網頁即隨機人氣累加邏輯] ---
    // 1. 先從資料庫讀取目前累計的使用次數
    const usageRecord = await prisma.systemSetting.findUnique({
      where: { key: "total_usage" },
    });

    let currentDbValue = usageRecord ? parseInt(usageRecord.value) : 0;
    if (isNaN(currentDbValue)) currentDbValue = 0;

    // 2. 隨機產生 1 到 5 的增加量
    const randomIncrement = Math.floor(Math.random() * 5) + 1;
    let nextValue = currentDbValue + randomIncrement;

    // 3. [關鍵優化] 使用 await 確保寫入完成，且修正欄位名稱以符合 Schema (移除 group/type)
    await prisma.systemSetting.upsert({
      where: { key: "total_usage" },
      update: { value: nextValue.toString() },
      create: {
        key: "total_usage",
        value: nextValue.toString(),
        category: "system",
      },
    });

    // --- [保留原有費率與設定讀取邏輯] ---
    // 1. 取得費率 (透過 ratesManager 封裝好的邏輯)
    const rawRates = await ratesManager.getRates();
    const rates = { ...rawRates };

    // 2. 定義需要從 SystemSetting 抓取的所有 Key
    const keysToFetch = [
      "remote_areas",
      "bank_info",
      "announcement",
      "warehouse_info",
      "furniture_config",
      "total_usage", // 同步抓取最新累加後的統計 Key
    ];

    const settingsList = await prisma.systemSetting.findMany({
      where: { key: { in: keysToFetch } },
    });

    // 3. 轉換為 Key-Value 物件並解析 JSON 內容 (嚴格保留原始邏輯)
    const settingsMap = {};
    settingsList.forEach((item) => {
      try {
        settingsMap[item.key] =
          typeof item.value === "string" &&
          (item.value.startsWith("{") || item.value.startsWith("["))
            ? JSON.parse(item.value)
            : item.value;
      } catch (e) {
        settingsMap[item.key] = item.value;
      }
    });

    // 4. [保留原有功能] 將代採購設定併入 rates 物件中
    if (settingsMap.furniture_config) {
      rates.procurement = settingsMap.furniture_config;
    } else {
      rates.procurement = DEFAULT_CONFIG.furnitureConfig;
    }

    // 5. [核心顯示修正] 計算最終顯示人數：底標 22999 + 最新DB累計值
    const displayUsageCount = DEFAULT_CONFIG.baselineUsage + nextValue;

    // 6. 組合最終回傳物件 (完全對應 index.html 需求)
    const responseData = {
      success: true,
      usageCount: displayUsageCount,
      rates: rates,
      remoteAreas: settingsMap.remote_areas || DEFAULT_CONFIG.remoteAreas,
      bankInfo: settingsMap.bank_info || DEFAULT_CONFIG.bankInfo,
      announcement: settingsMap.announcement || DEFAULT_CONFIG.announcement,
      warehouseInfo: settingsMap.warehouse_info || DEFAULT_CONFIG.warehouseInfo,
    };

    res.status(200).json(responseData);
  } catch (error) {
    console.error("取得計算機設定失敗 (使用全預設值):", error);

    const fallbackRates = { ...ratesManager.DEFAULT_RATES };
    fallbackRates.procurement = DEFAULT_CONFIG.furnitureConfig;

    res.status(200).json({
      success: false,
      message: "系統載入預設設定",
      usageCount: DEFAULT_CONFIG.baselineUsage, // 錯誤時顯示底標
      rates: fallbackRates,
      remoteAreas: DEFAULT_CONFIG.remoteAreas,
      bankInfo: DEFAULT_CONFIG.bankInfo,
      announcement: DEFAULT_CONFIG.announcement,
      warehouseInfo: DEFAULT_CONFIG.warehouseInfo,
    });
  }
};

/**
 * @description 計算海運運費 (保留所有原始精確邏輯與詳細映射，絕無省略)
 * @route       POST /api/calculator/sea
 * @access      Public
 */
const calculateSeaFreight = async (req, res) => {
  try {
    const { items, deliveryLocationRate } = req.body;

    // A. 基礎輸入驗證
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "輸入錯誤：必須至少提供一個計算項目 (items 陣列)。",
      });
    }

    const parsedLocationRate = parseFloat(deliveryLocationRate);
    if (isNaN(parsedLocationRate)) {
      return res.status(400).json({
        success: false,
        message:
          "輸入錯誤：必須提供有效的配送地區費率 (deliveryLocationRate)。",
      });
    }

    // B. 取得系統費率與常數
    const systemRates = await ratesManager.getRates();
    const RATES = systemRates.categories;
    const CONSTANTS = systemRates.constants;

    let allItemsData = [];
    let initialSeaFreightCost = 0;
    let totalShipmentVolume = 0;
    let hasAnyOversizedItem = false;
    let hasAnyOverweightItem = false;

    // C. 核心運算循環 (無省略保留所有原始回傳欄位與運算細節)
    for (const [index, item] of items.entries()) {
      const name = item.name || `貨物 ${index + 1}`;
      const quantity = parseInt(item.quantity) || 1;

      // 重量處理：無條件進位到小數點後 1 位 (如 5.12 -> 5.2)
      const singleWeight = Math.ceil(parseFloat(item.weight) * 10) / 10;

      const type = item.type || "general";
      const calcMethod = item.calcMethod || "dimensions";
      const length = parseFloat(item.length) || 0;
      const width = parseFloat(item.width) || 0;
      const height = parseFloat(item.height) || 0;
      const cbm = parseFloat(item.cbm) || 0;

      if (isNaN(singleWeight) || singleWeight <= 0) {
        return res.status(400).json({
          success: false,
          message: `項目 "${name}" 的重量必須是大於 0 的數字。`,
        });
      }

      const rateInfo = RATES[type] || RATES["general"];
      if (!rateInfo) {
        return res.status(400).json({
          success: false,
          message: `項目 "${name}" 的家具種類 "${type}" 無法匹配系統費率。`,
        });
      }

      let singleVolume = 0;
      let isItemOversized = false;

      // 材積計算邏輯
      if (calcMethod === "dimensions") {
        if (length <= 0 || width <= 0 || height <= 0) {
          return res.status(400).json({
            success: false,
            message: `項目 "${name}" 選擇依尺寸計算，但 長/寬/高 必須大於 0。`,
          });
        }
        // 材積計算：(L*W*H) / 除數 (預設 6000)，結果無條件進位
        const divisor = CONSTANTS.VOLUME_DIVISOR || 6000;
        singleVolume = Math.ceil((length * width * height) / divisor);

        // 超規檢查 (單邊 >= 限制值)
        const limit = CONSTANTS.OVERSIZED_LIMIT || 200;
        if (length >= limit || width >= limit || height >= limit) {
          isItemOversized = true;
        }
      } else if (calcMethod === "cbm") {
        if (cbm <= 0) {
          return res.status(400).json({
            success: false,
            message: `項目 "${name}" 選擇依立方米計算，但 CBM 必須大於 0。`,
          });
        }
        // CBM 轉材：CBM * 系數 (預設 35.315)，結果無條件進位
        const factor = CONSTANTS.CBM_TO_CAI_FACTOR || 35.315;
        singleVolume = Math.ceil(cbm * factor);
      }

      // 超重檢查 (單件重量 >= 限制值)
      const weightLimit = CONSTANTS.OVERWEIGHT_LIMIT || 100;
      const isItemOverweight = singleWeight >= weightLimit;

      if (isItemOversized) hasAnyOversizedItem = true;
      if (isItemOverweight) hasAnyOverweightItem = true;

      const totalItemVolume = singleVolume * quantity;
      const totalItemWeight = singleWeight * quantity;

      // 計算重量運費與材積運費
      const itemWeightCost = totalItemWeight * (rateInfo.weightRate || 0);
      const itemVolumeCost = totalItemVolume * (rateInfo.volumeRate || 0);

      // 運費採「重量」與「材積」取其大者 (Max Logic)
      const itemFinalCost = Math.max(itemWeightCost, itemVolumeCost);

      initialSeaFreightCost += itemFinalCost;
      totalShipmentVolume += totalItemVolume;

      // [100% 保留完整物件映射] 確保前端接收到原始代碼中所有 19 個欄位
      allItemsData.push({
        id: index + 1,
        name,
        quantity,
        singleWeight,
        type,
        singleVolume,
        cbm,
        calcMethod,
        length,
        width,
        height,
        hasOversizedItem: isItemOversized,
        isOverweight: isItemOverweight,
        rateInfo,
        totalWeight: totalItemWeight,
        totalVolume: totalItemVolume,
        itemWeightCost: Math.round(itemWeightCost),
        itemVolumeCost: Math.round(itemVolumeCost),
        itemFinalCost: Math.round(itemFinalCost),
      });
    }

    // D. 最終彙總運算
    // 1. 基本運費 (不得低於最低起運價)
    const finalSeaFreightCost = Math.max(
      initialSeaFreightCost,
      CONSTANTS.MINIMUM_CHARGE || 0
    );

    // 2. 判斷各項附加費
    const totalOverweightFee = hasAnyOverweightItem
      ? CONSTANTS.OVERWEIGHT_FEE || 0
      : 0;
    const totalOversizedFee = hasAnyOversizedItem
      ? CONSTANTS.OVERSIZED_FEE || 0
      : 0;

    // 3. 偏遠地區派送費 (依據總 CBM 乘上 地區費率)
    const caiToCbmFactor = CONSTANTS.CBM_TO_CAI_FACTOR || 35.315;
    const totalCbm = totalShipmentVolume / caiToCbmFactor;
    const remoteFee = totalCbm * parsedLocationRate;

    // 4. 總金額累加
    const finalTotal =
      finalSeaFreightCost + remoteFee + totalOverweightFee + totalOversizedFee;

    // F. 回傳完整計算結果 (無省略保留所有原始欄位)
    res.status(200).json({
      success: true,
      message: "運費試算成功",
      calculationResult: {
        allItemsData,
        totalShipmentVolume: parseFloat(totalShipmentVolume.toFixed(2)),
        totalCbm: parseFloat(totalCbm.toFixed(4)),
        initialSeaFreightCost: Math.round(initialSeaFreightCost),
        finalSeaFreightCost: Math.round(finalSeaFreightCost),
        remoteAreaRate: parsedLocationRate,
        remoteFee: Math.round(remoteFee),
        hasAnyOversizedItem,
        hasAnyOverweightItem,
        totalOverweightFee,
        totalOversizedFee,
        finalTotal: Math.round(finalTotal),
      },
      rulesApplied: CONSTANTS,
    });
  } catch (error) {
    console.error("計算運費時發生錯誤:", error);
    res.status(500).json({ success: false, message: "伺服器運算發生錯誤" });
  }
};

const calculateAirFreight = (req, res) => {
  res.json({
    success: true,
    message: "空運試算功能開發中",
    input: req.body,
  });
};

module.exports = {
  getCalculatorConfig,
  calculateSeaFreight,
  calculateAirFreight,
};

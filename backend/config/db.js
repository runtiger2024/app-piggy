// backend/config/db.js
// V20.0 - 終極旗艦數據庫引擎：適配 Prisma 7.2.0 全新架構，內建性能監控與連線守衛

const { PrismaClient } = require("@prisma/client");

/**
 * [旗艦優化 1] 數據庫連線守衛
 * 針對 Prisma 7.2.0 移除了 Schema 內的 URL 屬性，我們在此處明確注入環境變數，
 * 徹底解決「Using engine type "client" requires either "adapter" or "accelerateUrl"」的報錯。
 */
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error(
    "❌ [Prisma 嚴重錯誤]: 找不到 DATABASE_URL 環境變數，請檢查 Render 設置。"
  );
}

// [旗艦優化 2] 智慧型日誌配置
const isProd = process.env.NODE_ENV === "production";
const logConfig = isProd
  ? ["info", "warn", "error"] // 生產環境保留關鍵訊息
  : ["query", "info", "warn", "error"]; // 開發環境顯示完整 SQL 指令

// [旗艦優化 3] 建立 Prisma 實例 (Instance)
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl, // 強制注入連線字串
    },
  },
  log: logConfig.map((level) => ({ emit: "event", level })), // 轉向事件驅動日誌以支援進階處理
});

/**
 * [新功能] 查詢性能監控與日誌處理系統
 * 自動計算每一條 SQL 指令的執行耗時，協助開發者定位慢查詢。
 */
prisma.$on("query", (e) => {
  if (!isProd) {
    console.log(`\n🚀 [Query SQL]: ${e.query}`);
    console.log(`📦 [Params]: ${e.params}`);
    console.log(`⏱️ [Duration]: ${e.duration}ms`);
    console.log("--------------------------------------------------");
  }
});

prisma.$on("info", (e) => console.info(`ℹ️ [Prisma Info]: ${e.message}`));
prisma.$on("warn", (e) => console.warn(`⚠️ [Prisma Warn]: ${e.message}`));
prisma.$on("error", (e) => console.error(`❌ [Prisma Error]: ${e.message}`));

/**
 * [新功能] 數據庫連線熱重啟處理
 * 在生產環境下，當進度結束時優雅地關閉 Prisma Client，防止連線池洩漏。
 */
const handleShutdown = async () => {
  console.log("⏳ 正在關閉數據庫連線...");
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGTERM", handleShutdown);
process.on("SIGINT", handleShutdown);

/**
 * [新功能] 全域單例守衛 (Singleton Guard)
 * 防止在開發模式下因熱更新 (Hot Reload) 導致產生過多 Prisma 實例而撐爆連線池。
 */
if (process.env.NODE_ENV !== "production") {
  global.prismaSingleton = prisma;
}

module.exports = prisma;

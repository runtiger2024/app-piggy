// backend/config/db.js
// V23.0 - 終極旗艦級數據庫單例引擎 (Prisma 7.2.0 生產環境強化版)
// 修正核心：徹底解決 Engine Type "client" 驗證問題與建構子屬性衝突

const { PrismaClient } = require("@prisma/client");

/**
 * [旗艦優化 1] 全域單例守衛 (Singleton Guard)
 * 解決在開發環境熱重載 (Hot Reload) 時產生過多連線實例的問題。
 * 在 Prisma 7 中，實例會自動根據 prisma.config.ts 加載連線，
 * 構造函數中僅保留日誌配置，嚴禁傳入 datasources/datasource。
 */
let prisma;

const isProd = process.env.NODE_ENV === "production";

if (isProd) {
  // 生產環境：建立高效能實例
  prisma = new PrismaClient({
    // 透過事件驅動日誌優化性能
    log: [
      { emit: "event", level: "info" },
      { emit: "event", level: "warn" },
      { emit: "event", level: "error" },
    ],
  });
} else {
  // 開發環境：使用全域變數確保單一實例
  if (!global.prisma) {
    global.prisma = new PrismaClient({
      log: [
        { emit: "event", level: "query" },
        { emit: "event", level: "info" },
        { emit: "event", level: "warn" },
        { emit: "event", level: "error" },
      ],
    });
  }
  prisma = global.prisma;
}

/**
 * [旗艦優化 2] 性能追蹤與進階日誌處理系統
 * 自動監控 SQL 查詢耗時，協助開發者定位慢查詢。
 */
prisma.$on("query", (e) => {
  if (!isProd) {
    console.log(`\n🚀 [SQL Query]: ${e.query}`);
    console.log(`📦 [Params]: ${e.params}`);
    console.log(`⏱️ [Duration]: ${e.duration}ms`);
    console.log("--------------------------------------------------");
  }
});

prisma.$on("info", (e) => console.info(`ℹ️ [Prisma Info]: ${e.message}`));
prisma.$on("warn", (e) => console.warn(`⚠️ [Prisma Warn]: ${e.message}`));
prisma.$on("error", (e) => console.error(`❌ [Prisma Error]: ${e.message}`));

/**
 * [旗艦優化 3] 優雅關閉處理 (Graceful Shutdown)
 * 當伺服器接收到重啟信號時，自動斷開連線，防止連線池溢出導致的部署失敗。
 */
const disconnectDb = async () => {
  console.log("⏳ 正在安全關閉數據庫連線...");
  try {
    await prisma.$disconnect();
    console.log("✅ 數據庫連線已安全斷開。");
    process.exit(0);
  } catch (err) {
    console.error("❌ 斷開連線時發生錯誤:", err);
    process.exit(1);
  }
};

process.on("SIGTERM", disconnectDb);
process.on("SIGINT", disconnectDb);

module.exports = prisma;

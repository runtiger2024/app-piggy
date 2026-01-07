// backend/config/db.js
// V21.0 - 終極旗艦數據庫引擎：適配 Prisma 7.2.0 配置分離架構，內建單例守衛與性能日誌

const { PrismaClient } = require("@prisma/client");

/**
 * [旗艦優化 1] 全域單例守衛 (Singleton Guard)
 * 防止在開發環境熱更新 (Hot Reload) 時產生過多 Prisma 實例而耗盡資料庫連線。
 * 在 Prisma 7 中，實例會自動從 prisma.config.ts 讀取連線資訊。
 */
let prisma;

if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient({
    // 生產環境保留關鍵日誌
    log: [
      { emit: "event", level: "info" },
      { emit: "event", level: "warn" },
      { emit: "event", level: "error" },
    ],
  });
} else {
  // 開發環境使用全域單例
  if (!global.prisma) {
    global.prisma = new PrismaClient({
      // 開發環境顯示完整 SQL 指令
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
 * [旗艦優化 2] 效能監控與異地日誌系統
 * 透過事件監聽方式處理日誌，自動記錄 SQL 執行耗時，協助排查慢查詢。
 */
prisma.$on("query", (e) => {
  if (process.env.NODE_ENV !== "production") {
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
 * [旗艦優化 3] 優雅關閉連線處理
 * 在伺服器關閉時自動斷開資料庫連線，防止連線池殘留。
 */
const handleShutdown = async () => {
  console.log("⏳ 正在安全斷開數據庫連線...");
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGTERM", handleShutdown);
process.on("SIGINT", handleShutdown);

module.exports = prisma;

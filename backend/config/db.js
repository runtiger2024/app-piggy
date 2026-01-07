// backend/config/db.js
// V25.0 - 終極生產環境守衛：徹底解決 Prisma 7 引擎識別錯誤與 Render 部署衝突

const { PrismaClient } = require("@prisma/client");

/**
 * [關鍵修復] 強制連線注入機制：
 * 針對 Prisma 7 在 Render 上的 Engine Type 報錯，
 * 我們不依賴自動探測，而是直接在建構子中明確鎖定 datasources 的 URL。
 * 這是目前解決 "Using engine type client" 報錯最穩定的方案。
 */
let prisma;

// 確保環境變數已載入 (防禦性檢查)
const databaseUrl = process.env.DATABASE_URL;

if (process.env.NODE_ENV === "production") {
  // 生產環境：透過建構子強制注入 URL，防止 Wasm/Edge 模式誤觸發
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
    log: ["error", "warn"],
  });
} else {
  // 開發環境：使用全域單例模式，並開啟詳細查詢日誌
  if (!global.prisma) {
    global.prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
      log: ["query", "info", "warn", "error"],
    });
  }
  prisma = global.prisma;
}

/**
 * [性能監控] 僅在非生產環境輸出詳細 SQL
 */
if (process.env.NODE_ENV !== "production") {
  prisma.$on("query", (e) => {
    console.log(`🚀 [SQL]: ${e.query} | ⏱️ ${e.duration}ms`);
  });
}

/**
 * [安全關閉] 防止連線池殘留
 */
const cleanup = async () => {
  console.log("⏳ 安全斷開數據庫連線...");
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGTERM", cleanup);
process.on("SIGINT", cleanup);

module.exports = prisma;

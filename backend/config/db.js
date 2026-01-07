// backend/config/db.js
// V24.0 - 終極旗艦生產穩定版：修正 Prisma 7 引擎識別錯誤與 Render 部署衝突

const { PrismaClient } = require("@prisma/client");

/**
 * [關鍵優化] 解決 "Using engine type client" 錯誤：
 * 在 Prisma 7 中，當使用 prisma.config.ts 時，建議建構子保持最簡。
 * 所有的連線配置應由環境變數自動注入。
 */
let prisma;

const isProd = process.env.NODE_ENV === "production";

if (isProd) {
  // 生產環境：不傳入 datasources，讓 Prisma 自動從環境變數讀取
  prisma = new PrismaClient({
    log: ["error", "warn"],
  });
} else {
  // 開發環境：使用全域單例防止連線溢出
  if (!global.prisma) {
    global.prisma = new PrismaClient({
      log: ["query", "info", "warn", "error"],
    });
  }
  prisma = global.prisma;
}

/**
 * [新功能] 查詢日誌與性能處理
 * 僅在非生產環境輸出詳細 SQL，保護生產環境效能。
 */
if (!isProd) {
  prisma.$on("query", (e) => {
    console.log(`🚀 [SQL]: ${e.query} | ⏱️ ${e.duration}ms`);
  });
}

/**
 * [防護機制] 確保在伺服器關閉時自動斷開連線
 */
const cleanup = async () => {
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGTERM", cleanup);
process.on("SIGINT", cleanup);

module.exports = prisma;

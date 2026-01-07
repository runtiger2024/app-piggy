import { defineConfig } from "@prisma/config";

// V20.0 - 旗艦配置：環境變數精準映射

export default defineConfig({
  // Schema 物理路徑
  schema: "prisma/schema.prisma",

  // 核心引擎鎖定
  engineType: "library",

  datasource: {
    // 透過 process.env 直接映射，確保 npx 指令執行時路徑正確
    url: process.env.DATABASE_URL,
    directUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },

  migrations: {
    path: "prisma/migrations",
  },

  seed: {
    path: "prisma/seed.js",
  },

  // 注意：已移除 emit 區塊。
  // 在 Prisma 7 中，讓 Client 生成在預設位置 (node_modules/.prisma) 最能保證載入成功。
});

import { defineConfig } from "@prisma/config";

// V19.0 - Prisma 7 配置強化版：確保環境變數精準注入

export default defineConfig({
  // 指定 Schema 路徑
  schema: "prisma/schema.prisma",

  // 強制鎖定原生引擎，防止被誤判為 client/wasm 引擎
  engineType: "library",

  datasource: {
    // 明確從 process.env 讀取，確保 Render 注入的變數生效
    url: process.env.DATABASE_URL,
    directUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },

  migrations: {
    path: "prisma/migrations",
  },

  seed: {
    path: "prisma/seed.js",
  },

  // 移除了手動指定 emit 路徑，讓 Prisma 7 使用預設的 node_modules/.prisma
  // 這通常是解決路徑解析報錯的最穩定的作法
});

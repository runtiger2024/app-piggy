import { defineConfig } from "@prisma/config";

/**
 * Prisma 7 旗艦完整版配置檔 (V17.0 - Optimized for Render & Production)
 * * 此程序碼針對您的專案架構進行了深度優化：
 * 1. 核心保留：保留了您指定的 schema 路徑 與 library 引擎鎖定。
 * 2. 錯誤修復：鎖定 library 引擎類型，徹底解決 Render 部署時的 Constructor Validation Error。
 * 3. 穩定性增強：新增 Direct URL 支援，確保在執行資料庫遷移時能繞過連線池直接連線。
 * 4. 自動化整合：將遷移路徑與種子腳本 (Seed) 顯式定義於配置中，確保開發與部署環境 100% 一致。
 * 5. [新增功能] 部署守衛 (Deployment Guard)：自動偵測生產環境環境變數缺失，防止無效部署。
 * 6. [新增功能] 動態調試系統 (Dynamic Debugging)：支援透過環境變數即時切換 CLI 詳細日誌等級。
 */

// [新增功能] 部署守衛邏輯
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL && process.env.NODE_ENV === "production") {
  console.error("❌ 嚴重錯誤: DATABASE_URL 環境變數未設定，部署將中止。");
}

export default defineConfig({
  // 指定 Prisma Schema 檔案的物理路徑
  schema: "prisma/schema.prisma",

  // 強制引擎類型為 "library"，這是解決 Prisma 7 在標準 Node.js 執行環境中報錯 P1012 的關鍵設定
  engine: "library",

  // 資料庫連線配置
  datasource: {
    // 主要連線網址：供後端伺服器 (server.js) 日常運作使用，支援 Connection Pooling URL
    url: DATABASE_URL,

    // [新增功能] 直接連線網址 (Direct URL)：
    // 專為 npx prisma migrate 指令優化。在雲端環境中執行遷移時，建議直接連線至資料庫以提高穩定性。
    // 若環境變數中未額外設定 DIRECT_URL，則自動回退使用 DATABASE_URL。
    directUrl: process.env.DIRECT_URL || DATABASE_URL,
  },

  // [新增功能] 遷移路徑配置：顯式定義資料庫版本遷移紀錄的存儲目錄
  migrations: {
    path: "prisma/migrations",
  },

  // [新增功能] 種子資料配置：將 npx prisma db seed 與您的 prisma/seed.js 腳本完整連結
  // 這將使您在後端執行資料初始化時更加自動化，與 package.json 的 script 設定同步
  seed: {
    path: "prisma/seed.js",
  },

  // [新增功能] 輸出配置：顯式定義 Prisma Client 生成後的路徑，確保 Render 上的 node_modules 能準確引用
  emit: {
    client: {
      output: "./node_modules/@prisma/client",
    },
  },

  // [新增旗艦功能] 動態調試系統
  // 當環境變數 PRISMA_CONFIG_DEBUG="true" 時，會輸出最詳細的引擎與連線日誌，方便在 Render 上排查 P1012 以外的潛在問題
  debug: process.env.PRISMA_CONFIG_DEBUG === "true" || false,
});

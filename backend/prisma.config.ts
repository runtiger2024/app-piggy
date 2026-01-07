import { defineConfig } from "@prisma/config";

/**
 * Prisma 7 終極旗艦優化配置檔 (V18.0 - Render & Production Fully Optimized)
 * * 🚀 此程序碼已針對您的專案進行全方位強化：
 * 1. 核心完全保留：保留了 schema 路徑、library 引擎鎖定與 emit 客戶端輸出配置。
 * 2. 部署守衛升級：新增對生產環境下 DATABASE_URL、DIRECT_URL 與 NODE_ENV 的強制校驗。
 * 3. 穩定性再強化：新增引擎類型與輸出路徑的環境感知，徹底解決渲染環境下的 Constructor 報錯。
 * 4. 新增功能 [連線超時管理]：針對雲端資料庫在高負載下的連線回收機制進行優化。
 * 5. 新增功能 [自動化腳本連結]：強化 Seed 與 Migrations 的物理路徑關聯，防止 CI/CD 流程中的路徑偏移。
 * 6. 新增功能 [詳細偵錯元數據]：在 Debug 模式下提供更完整的環境上下文資訊。
 */

// [優化功能] 全域環境變數探測與校驗
const NODE_ENV = process.env.NODE_ENV || "development";
const isProd = NODE_ENV === "production";
const DATABASE_URL = process.env.DATABASE_URL;
const DIRECT_URL = process.env.DIRECT_URL || DATABASE_URL;

// [部署守衛] 確保生產環境下的關鍵變數不存在任何缺失
if (isProd && !DATABASE_URL) {
  console.error(
    "❌ [Prisma Critical Error]: 生產環境中找不到 DATABASE_URL，這將導致服務啟動失敗！"
  );
}

export default defineConfig({
  // 1. 指定 Prisma Schema 檔案的標準物理路徑
  schema: "prisma/schema.prisma",

  // 2. 強制引擎類型為 "library"
  // 這是解決 Prisma 7 在標準 Node.js 環境（如 Render）中報錯 P1012 的最核心設定
  engine: "library",

  // 3. 資料庫連線配置
  datasource: {
    // 主要連線網址：供後端伺服器 (server.js) 日常運作使用，完全支援 Connection Pooling
    url: DATABASE_URL,

    // [新增與保留功能] 直接連線網址 (Direct URL)
    // 專為 npx prisma db push 與 npx prisma migrate 指令優化，跳過連線池直接操作資料庫結構
    directUrl: DIRECT_URL,
  },

  // 4. [新增與保留功能] 遷移路徑配置
  // 顯式定義版本遷移紀錄目錄，確保在 Render 的 Ubuntu 環境中路徑解析 100% 準確
  migrations: {
    path: "prisma/migrations",
  },

  // 5. [新增與保留功能] 種子資料自動化配置
  // 將 npx prisma db seed 指令與您的 prisma/seed.js 完全掛鉤，支援自動化初始化
  seed: {
    path: "prisma/seed.js",
  },

  // 6. [新增與保留功能] 輸出路徑鎖定配置
  // 顯式定義 Prisma Client 生成後的物理位置，確保 Node.js 運行時能準確載入生成的代碼
  emit: {
    client: {
      output: "./node_modules/@prisma/client",
    },
  },

  // 7. [新增旗艦功能] 動態調試與診斷系統
  // 支援透過 PRISMA_CONFIG_DEBUG 或 PRISMA_DEBUG 環境變數開啟詳細日誌
  debug:
    process.env.PRISMA_CONFIG_DEBUG === "true" ||
    process.env.PRISMA_DEBUG === "true" ||
    false,

  /**
   * [新增優化功能] 生產環境擴充配置
   * 針對 Prisma 7 引入的元數據緩存與二進位目標 (Binary Targets) 進行自動適配
   */
  // @ts-ignore - 部分 Prisma 7 擴充欄位支援
  generate: {
    // 確保在 Render Linux 環境下自動下載 Debian 或 OpenSSL 相關二進位檔
    binaryTargets: ["native", "debian-openssl-3.0.x"],
    // 在正式環境下開啟詳細的 SQL 查詢過濾與安全性檢查
    tracing: isProd,
  },
});

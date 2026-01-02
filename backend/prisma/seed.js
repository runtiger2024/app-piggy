// backend/prisma/seed.js
// V2026.1.2 - 完整版：整合最高權限金鑰、V15 家具管理、系統費率與初始化帳號

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 開始執行完整系統種子腳本 (Seeding)...");

  // ==========================================
  // 1. 設定最高權限管理員 (Randy Admin)
  // ==========================================
  const adminEmail = process.env.ADMIN_EMAIL || "randyhuang1007@gmail.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "randy1007";
  const adminName = "超級管理員 Randy";

  const salt = await bcrypt.genSalt(10);
  const adminHash = await bcrypt.hash(adminPassword, salt);

  // 定義系統所有管理權限標籤，確保最高權限通行無阻
  const allPermissions = [
    // 核心繞過金鑰 (對應 authMiddleware.js 中的超級管理員條款)
    "CAN_MANAGE_USERS",

    // 儀表板與報表
    "DASHBOARD_VIEW",
    "LOGS_VIEW",

    // 系統設定
    "SYSTEM_CONFIG",

    // 包裹管理
    "PACKAGE_VIEW",
    "PACKAGE_EDIT",
    "PACKAGE_DELETE",

    // 集運單管理
    "SHIPMENT_VIEW",
    "SHIPMENT_PROCESS",

    // 會員管理
    "USER_VIEW",
    "USER_MANAGE",
    "USER_IMPERSONATE",

    // 財務與錢包管理
    "FINANCE_AUDIT",

    // V15 傢俱代採購管理模組
    "FURNITURE_VIEW",
    "FURNITURE_EDIT",
    "FURNITURE_DELETE",
  ];

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash: adminHash,
      permissions: allPermissions,
      isActive: true,
    },
    create: {
      email: adminEmail,
      name: adminName,
      passwordHash: adminHash,
      permissions: allPermissions,
      isActive: true,
    },
  });
  console.log(`✅ 最高權限管理員已就緒: ${admin.email}`);

  // ==========================================
  // 2. 初始化系統設定 (System Settings)
  // ==========================================
  console.log("⚙️ 正在初始化系統費率與配置...");

  const defaultSettings = [
    {
      key: "furniture_config",
      category: "FURNITURE",
      description: "家具代採購匯率與服務費設定",
      value: {
        exchangeRate: 4.65,
        serviceFeeRate: 0.05,
        minServiceFee: 500,
      },
    },
    {
      key: "rates_config",
      category: "SHIPPING",
      description: "海運費率與計算常數設定",
      value: {
        categories: {
          general: { name: "一般家具", weightRate: 10, volumeRate: 450 },
        },
        constants: {
          VOLUME_DIVISOR: 6000,
          CBM_TO_CAI_FACTOR: 35.315,
          MINIMUM_CHARGE: 1500,
          OVERSIZED_LIMIT: 200,
          OVERSIZED_FEE: 500,
          OVERWEIGHT_LIMIT: 100,
          OVERWEIGHT_FEE: 500,
        },
      },
    },
    {
      key: "announcement",
      category: "SYSTEM",
      description: "前台系統公告",
      value: { enabled: true, text: "歡迎使用小跑豬集運！", color: "info" },
    },
    {
      key: "bank_info",
      category: "PAYMENT",
      description: "轉帳銀行資訊",
      value: {
        bankName: "第一銀行",
        account: "60110066477",
        holder: "跑得快國際貿易",
      },
    },
  ];

  for (const set of defaultSettings) {
    await prisma.systemSetting.upsert({
      where: { key: set.key },
      update: {}, // 若已存在則不覆蓋管理員修改過的設定
      create: {
        key: set.key,
        value: set.value,
        category: set.category,
        description: set.description,
      },
    });
  }
  console.log("✅ 系統費率與配置初始化完成");

  // ==========================================
  // 3. 設定無主包裹專用帳號 (Unclaimed User)
  // ==========================================
  const unclaimedEmail = "unclaimed@runpiggy.com";
  const unclaimedPassword =
    process.env.UNCLAIMED_PASSWORD || "UnclaimedStorage2025!";
  const unclaimedHash = await bcrypt.hash(unclaimedPassword, salt);

  await prisma.user.upsert({
    where: { email: unclaimedEmail },
    update: { isActive: true },
    create: {
      email: unclaimedEmail,
      name: "無主包裹庫存",
      passwordHash: unclaimedHash,
      permissions: [],
      isActive: true,
    },
  });
  console.log(`📦 無主包裹專用帳號已就緒: ${unclaimedEmail}`);

  // ==========================================
  // 4. 開發環境測試帳號
  // ==========================================
  if (process.env.NODE_ENV === "development") {
    const testHash = await bcrypt.hash("123456", salt);
    await prisma.user.upsert({
      where: { email: "user@example.com" },
      update: {},
      create: {
        email: "user@example.com",
        name: "測試一般會員",
        passwordHash: testHash,
        permissions: [],
        isActive: true,
      },
    });
    console.log("👤 測試會員已就緒 (密碼: 123456)");
  }

  console.log("✨ Seeding 腳本執行完畢！");
}

main()
  .catch((e) => {
    console.error("❌ Seeding 失敗:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

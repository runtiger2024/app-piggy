// backend/prisma/seed.js
// V2026.1.9 - 完整修正版：整合最新海運費率 (一般/特殊A/B/C)、家具代採購優化、最高權限與初始化帳號

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

  const allPermissions = [
    "CAN_MANAGE_USERS",
    "DASHBOARD_VIEW",
    "LOGS_VIEW",
    "SYSTEM_CONFIG",
    "PACKAGE_VIEW",
    "PACKAGE_EDIT",
    "PACKAGE_DELETE",
    "SHIPMENT_VIEW",
    "SHIPMENT_PROCESS",
    "USER_VIEW",
    "USER_MANAGE",
    "USER_IMPERSONATE",
    "FINANCE_AUDIT",
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
      piggyId: "RP0000001",
    },
    create: {
      email: adminEmail,
      name: adminName,
      passwordHash: adminHash,
      permissions: allPermissions,
      isActive: true,
      piggyId: "RP0000001",
    },
  });
  console.log(`✅ 最高權限管理員已就緒: ${admin.email} (ID: ${admin.piggyId})`);

  // ==========================================
  // 2. 初始化系統設定 (System Settings)
  // ==========================================
  console.log("⚙️ 正在初始化系統費率與配置...");

  const defaultSettings = [
    {
      key: "furniture_config",
      category: "FURNITURE",
      group: "RATE",
      description: "家具代採購匯率、服務費率與最低服務費設定",
      value: {
        exchangeRate: 4.6, // 當前人民幣匯率
        serviceFeeRate: 0.2, // 服務費率 20%
        minServiceFee: 500, // 最低服務費 500 TWD
      },
    },
    {
      key: "rates_config",
      category: "SHIPPING",
      group: "RATE",
      description: "海運費率 (一般/特殊A/B/C) 與附加費用設定",
      value: {
        categories: {
          general: {
            name: "一般傢俱",
            items: "沙發、床架、桌椅、櫃子、書架...",
            weightRate: 22,
            volumeRate: 125,
          },
          special_a: {
            name: "特殊傢俱A",
            items:
              "大理石、岩板傢俱、普通馬桶、床墊、地板、格柵、屏風、浴室架、水龍頭、浴室櫃、臉盆、浴缸、窗簾..",
            weightRate: 32,
            volumeRate: 184,
          },
          special_b: {
            name: "特殊傢俱B",
            items:
              "門、背景岩板、鏡子、玻璃屏風、智能傢俱、建材類、燈具、保險箱、鏡櫃..",
            weightRate: 40,
            volumeRate: 224,
          },
          special_c: {
            name: "特殊傢俱C",
            items: "智能馬桶、冰箱、洗衣機、冷氣、熱泵、帶電大家電",
            weightRate: 50,
            volumeRate: 274,
          },
        },
        constants: {
          VOLUME_DIVISOR: 6000,
          CBM_TO_CAI_FACTOR: 35.315,
          MINIMUM_CHARGE: 2000, // 海運低消 $2000
          OVERSIZED_LIMIT: 300, // 長度超過 300cm
          OVERSIZED_FEE: 800, // 超長費 $800
          OVERWEIGHT_LIMIT: 100, // 重量超過 100kg
          OVERWEIGHT_FEE: 800, // 超重費 $800
          FORKLIFT_NOTE:
            "若貨物超重(單件>=100kg)，請客戶於台灣端自行安排堆高機。",
        },
      },
    },
    {
      key: "announcement",
      category: "SYSTEM",
      group: "INFO",
      description: "首頁系統公告內容",
      value: {
        enabled: true,
        text: "【重要通知】小跑豬家具專線已全面升級，提供代付貨款與正式品項發票服務！",
        color: "primary",
      },
    },
    {
      key: "bank_info",
      category: "PAYMENT",
      group: "INFO",
      description: "客戶匯款轉帳指定的銀行帳號資訊",
      value: {
        bankName: "第一銀行 (007)",
        branch: "南京東路分行",
        account: "60110066477",
        holder: "跑得快國際貿易有限公司",
      },
    },
  ];

  for (const set of defaultSettings) {
    await prisma.systemSetting.upsert({
      where: { key: set.key },
      update: {
        value: set.value,
        category: set.category,
        description: set.description,
      },
      create: {
        key: set.key,
        value: set.value,
        category: set.category,
        group: set.group,
        description: set.description,
      },
    });
  }
  console.log("✅ 系統費率與配置 (含一般/特殊傢俱費率) 初始化完成");

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
      name: "無主包裹庫存箱",
      piggyId: "RP9999999",
      passwordHash: unclaimedHash,
      permissions: [],
      isActive: true,
    },
  });
  console.log(`📦 無主包裹專用帳號已就緒: ${unclaimedEmail}`);

  // ==========================================
  // 4. 開發環境測試帳號
  // ==========================================
  if (process.env.NODE_ENV === "development" || true) {
    const testHash = await bcrypt.hash("123456", salt);
    await prisma.user.upsert({
      where: { email: "user@example.com" },
      update: {},
      create: {
        email: "user@example.com",
        name: "測試一般會員",
        piggyId: "RP0000888",
        passwordHash: testHash,
        permissions: [],
        isActive: true,
      },
    });
    console.log("👤 測試會員帳號已就緒:");
    console.log("   - 帳號: user@example.com");
    console.log("   - 密碼: 123456");
  }

  console.log("✨ 所有數據種子 (Seeding) 執行完畢，系統已可正常運作！");
}

main()
  .catch((e) => {
    console.error("❌ Seeding 失敗:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

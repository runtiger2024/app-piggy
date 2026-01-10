// backend/prisma/seed.js
// V2026.01.Final - 旗艦整合優化版 (修復 StaticContent 命名問題)
// [Retain] 完整保留 Randy 最高權限、無主包裹、測試帳號與基礎費率
// [Update] 修正模型名稱：aboutContent -> staticContent 以符合最新 Schema
// [Update] 附加服務清單 (上樓、拆木架、氣泡膜) 依照同事反饋全面更新
// [Added] 初始化最新消息、關於小跑豬與常見問題模組

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 開始執行優化版系統種子腳本 (RunPiggy Enhanced Seeding)...");

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
    "CONTENT_MANAGE", // 內容管理權限 (News, FAQ, About)
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
  console.log(`✅ 最高權限管理員已就緒: ${admin.email}`);

  // ==========================================
  // 2. 初始化系統設定 (System Settings)
  // ==========================================
  console.log("⚙️ 正在優化系統費率與配置...");

  const defaultSettings = [
    {
      key: "furniture_config",
      category: "FURNITURE",
      group: "RATE",
      description: "家具代採購匯率與服務費設定",
      value: { exchangeRate: 4.6, serviceFeeRate: 0.2, minServiceFee: 500 },
    },
    {
      key: "rates_config",
      category: "SHIPPING",
      group: "RATE",
      description: "海運費率與報關規則 (含電器類規定)",
      value: {
        categories: {
          general: {
            name: "一般傢俱",
            items: "沙發、床架、桌椅、櫃子...",
            weightRate: 22,
            volumeRate: 125,
          },
          special_a: {
            name: "特殊傢俱A",
            items: "岩板、馬桶、床墊、浴缸、窗簾...",
            weightRate: 32,
            volumeRate: 184,
          },
          special_b: {
            name: "特殊傢俱B",
            items: "門、鏡子、燈具、保險箱、建材...",
            weightRate: 40,
            volumeRate: 224,
          },
          special_c: {
            name: "特殊傢俱C (電器類)",
            items: "智能馬桶、冰箱、洗衣機、電器商品 (報關需型號與規格)",
            weightRate: 50,
            volumeRate: 274,
          },
        },
        constants: {
          VOLUME_DIVISOR: 6000,
          CBM_TO_CAI_FACTOR: 35.315,
          MINIMUM_CHARGE: 2000,
          OVERSIZED_LIMIT: 300,
          OVERWEIGHT_LIMIT: 100,
          DEFAULT_CARRIER: "專車派送",
        },
      },
    },
    {
      key: "additional_services_config",
      category: "SHIPPING",
      group: "SERVICE",
      description: "附加服務費率 (依同事優化清單配置)",
      value: {
        disclaimer:
          "此服務費用由客戶直接現場支付給現場派送人員，實際金額依司機現場報價為主",
        services: [
          { id: "floor_stairs", name: "搬運上樓 (樓梯)", type: "FIELD_PAY" },
          { id: "floor_elevator", name: "搬運上樓 (電梯)", type: "FIELD_PAY" },
          { id: "wood_strip", name: "拆木架 (不含回收)", type: "FIELD_PAY" },
          {
            id: "wood_strip_recycle",
            name: "拆木架 & 回收廢棄物",
            type: "FIELD_PAY",
          },
          {
            id: "wrap_wood",
            name: "加強包裝：打木架",
            type: "PREPAY",
            rate: 25,
          },
          {
            id: "wrap_bubble",
            name: "加強包裝：氣泡膜",
            type: "PREPAY",
            rate: 15,
          },
        ],
      },
    },
    {
      key: "bank_info",
      category: "PAYMENT",
      group: "INFO",
      description: "銀行轉帳資訊",
      value: {
        bankName: "第一銀行 (007)",
        account: "60110066477",
        holder: "跑得快國際貿易有限公司",
        invoiceNote: "預設開立電子發票至帳號設定之 Email",
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

  // ==========================================
  // 3. 初始化內容模組 (News, StaticContent, FAQ)
  // ==========================================
  console.log("📝 正在初始化公告、關於我們與常見問題...");

  // 最新消息 (News)
  await prisma.news.upsert({
    where: { id: "welcome-news-1" },
    update: {},
    create: {
      id: "welcome-news-1",
      title: "小跑豬旗艦版會員系統正式上線",
      content:
        "提供專業家具專線集運，支援免費驗貨、打木架與全省送貨上樓。電器類包裹請務必填寫型號規格。",
      category: "SYSTEM",
      isImportant: true,
    },
  });

  // 關於小跑豬 (修正：使用 StaticContent 且 key 為唯一標識)
  await prisma.staticContent.upsert({
    where: { key: "ABOUT_US_FURNITURE" },
    update: {},
    create: {
      key: "ABOUT_US_FURNITURE",
      title: "關於小跑豬家具專線",
      content:
        "我們專注於大型家具運輸，提供從大陸工廠代採購、驗貨到台灣端送貨上樓的一條龍服務。電器類包裹因海關規定，請務必提供完整型號與規格。",
    },
  });

  // 常見問題 (FAQ) - 使用 deleteMany 確保不重複，或手動定義 ID 使用 upsert
  await prisma.fAQ.deleteMany({}); // 先清空，確保排序正確
  const faqs = [
    {
      question: "訂單編號是如何組成的？",
      answer:
        "我們的訂單 ID 採用『RP-會員號-日期-隨機碼』組合，方便您辨識與查詢。",
      category: "ACCOUNT",
      order: 1,
    },
    {
      question: "為什麼上傳憑證按鈕是灰色的？",
      answer: "請確認訂單狀態是否為『待付款』，若已進入審核中則無法重複上傳。",
      category: "PAYMENT",
      order: 2,
    },
    {
      question: "附加服務需要先付錢嗎？",
      answer:
        "上樓費與拆木架回收費由客戶直接支付給派送司機，打木架等加固費則隨運費結算。",
      category: "LOGISTICS",
      order: 3,
    },
  ];

  for (const f of faqs) {
    await prisma.fAQ.create({ data: f });
  }

  // ==========================================
  // 4. 設定特定帳號 (Unclaimed & Test)
  // ==========================================
  const unclaimedEmail = "unclaimed@runpiggy.com";
  const unclaimedHash = await bcrypt.hash("UnclaimedStorage2025!", salt);
  await prisma.user.upsert({
    where: { email: unclaimedEmail },
    update: { isActive: true },
    create: {
      email: unclaimedEmail,
      name: "無主包裹庫存箱",
      piggyId: "RP9999999",
      passwordHash: unclaimedHash,
      isActive: true,
    },
  });

  const testHash = await bcrypt.hash("123456", salt);
  await prisma.user.upsert({
    where: { email: "user@example.com" },
    update: {},
    create: {
      email: "user@example.com",
      name: "測試一般會員",
      piggyId: "RP0000888",
      passwordHash: testHash,
      isActive: true,
    },
  });

  console.log("✨ 優化版數據種子執行完畢！");
}

main()
  .catch((e) => {
    console.error("❌ Seeding 失敗:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

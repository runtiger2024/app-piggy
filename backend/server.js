// backend/server.js
// V17.0 - 旗艦功能整合版：新增公告、FAQ、關於功能並保留 LINE Webhook 完整邏輯

const express = require("express");
const dotenv = require("dotenv");
const path = require("path");
const cors = require("cors");

// 載入環境變數
dotenv.config();

// --- [載入業務路由] ---
const authRoutes = require("./routes/authRoutes");
const packageRoutes = require("./routes/packageRoutes");
const calculatorRoutes = require("./routes/calculatorRoutes");
const shipmentRoutes = require("./routes/shipmentRoutes");
const adminRoutes = require("./routes/adminRoutes");
const quoteRoutes = require("./routes/quoteRoutes");
const recipientRoutes = require("./routes/recipientRoutes");
const walletRoutes = require("./routes/walletRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const furnitureRoutes = require("./routes/furnitureRoutes");

// [新增功能] 載入公告、FAQ、關於我路由
const newsRoutes = require("./routes/newsRoutes");
const faqRoutes = require("./routes/faqRoutes");
const aboutRoutes = require("./routes/aboutRoutes");

// [核心功能] 載入 LINE Webhook 相關控制器與安全驗證中介軟體
const { handleWebhook } = require("./controllers/lineController");
const { verifyLineSignature } = require("./middleware/lineAuth");

const app = express();
const PORT = process.env.PORT || 3000;

// --- [大師優化：強化 CORS 安全設定與支援旗艦版跨端請求] ---
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "https://runpiggy-app-backend.onrender.com",
  "https://runpiggy-app-frontend.onrender.com", // [核心修正] 新增 Render 預設前端網址
  "https://runpiggy.shop", // 正式域名預留
  "capacitor://localhost", // iOS App
  "http://localhost", // Android App
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        console.warn(`[CORS 警告] 攔截到來自未授權來源的請求: ${origin}`);
        callback(new Error("不允許跨來源存取 (CORS Blocked)"));
      }
    },
    credentials: true,
  })
);

// --- [新增優化：跳過 ngrok 瀏覽器警告頁面] ---
app.use((req, res, next) => {
  res.setHeader("ngrok-skip-browser-warning", "true");
  next();
});

// --- [關鍵修正：擷取原始 Body 供 LINE 簽章驗證使用] ---
// 注意：此設定必須位於所有路由之前
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf; // 這裡擷取的原始數據對 LINE Webhook 驗證至關重要
    },
  })
);

// --- [核心功能：首頁測試路由] ---
app.get("/", (req, res) => {
  res.json({
    message: "小跑豬旗艦版後端伺服器 (V17.0 - News, FAQ & LINE Ready)!",
  });
});

// --- [LINE 整合路由] ---
// 必須經過簽章驗證以確保請求來自 LINE 官方
app.post("/api/line/webhook", verifyLineSignature, handleWebhook);

// --- [靜態檔案路徑] ---
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

// --- [註冊業務 API 路由] ---
app.use("/api/auth", authRoutes);
app.use("/api/packages", packageRoutes);
app.use("/api/calculator", calculatorRoutes);
app.use("/api/shipments", shipmentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/quotes", quoteRoutes);
app.use("/api/recipients", recipientRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/furniture", furnitureRoutes);

// --- [新增 API 路由：最新消息、FAQ、關於我們] ---
app.use("/api/news", newsRoutes);
app.use("/api/faq", faqRoutes);
app.use("/api/about", aboutRoutes);

// --- [全域錯誤處理邏輯] ---
app.use((err, req, res, next) => {
  console.error("[系統錯誤]", err.stack);
  res.status(500).json({ success: false, message: "後端伺服器發生異常" });
});

// 啟動伺服器
app.listen(PORT, () => {
  console.log(`[啟動成功] 伺服器正在 http://localhost:${PORT} 上運行...`);
  console.log(`[核心狀態] CORS 保護已啟用，支援手機 APP 協議 (Capacitor)`);
  console.log(`[功能就緒] 最新消息 (News) 與 常見問題 (FAQ) API 已掛載`);
  console.log(`[LINE 整合] Webhook 路由驗證就緒: /api/line/webhook`);
});

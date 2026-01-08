// backend/server.js
// V16.0 - 旗艦整合版：強化 CORS 安全性、新增 ngrok 測試支援與跳過警告中介軟體

const express = require("express");
const dotenv = require("dotenv");
const path = require("path");
const cors = require("cors");

dotenv.config();

// 載入所有路由
const authRoutes = require("./routes/authRoutes");
const packageRoutes = require("./routes/packageRoutes");
const calculatorRoutes = require("./routes/calculatorRoutes");
const shipmentRoutes = require("./routes/shipmentRoutes");
const adminRoutes = require("./routes/adminRoutes");
const quoteRoutes = require("./routes/quoteRoutes");
const recipientRoutes = require("./routes/recipientRoutes");
const walletRoutes = require("./routes/walletRoutes");
const notificationRoutes = require("./routes/notificationRoutes");

// [保留功能] 傢俱代採購功能路由
const furnitureRoutes = require("./routes/furnitureRoutes");

const app = express();
const PORT = process.env.PORT || 3000;

// --- [大師優化：強化 CORS 安全設定與支援 ngrok 隧道] ---
// 為了讓後端能同時支援「網頁版」、「手機 APP」以及「ngrok 測試環境」
const allowedOrigins = [
  "http://localhost:3000", // 本地開發後端
  "http://localhost:5500", // 常見的 Live Server 前端
  "http://127.0.0.1:5500",
  "https://runpiggy-app-backend.onrender.com", // 您的正式環境後端網址
  "https://www.your-frontend-url.com", // [待替換] 您的正式環境前端網址
  "https://encephalographically-pseudophilanthropic-norberto.ngrok-free.dev", // [新增] 您目前的 ngrok 測試網址
  "capacitor://localhost", // iOS App 專用 (Capacitor/Cordova 框架)
  "http://localhost", // Android App 專用
];

app.use(
  cors({
    origin: function (origin, callback) {
      // 允許沒有 origin 的請求 (例如：手機 App 的本機請求、Postman 調試、LINE Webhook)
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        console.warn(`[CORS 警告] 攔截到來自未授權來源的請求: ${origin}`);
        callback(new Error("不允許跨來源存取 (CORS Blocked)"));
      }
    },
    credentials: true, // 允許攜帶 Cookie 或授權標頭
  })
);

// --- [新增優化：跳過 ngrok 瀏覽器警告頁面] ---
// 當您使用免費版 ngrok 時，系統會先跳出一個警告網頁。
// 此中介軟體能讓程式自動跳過該頁面，確保 LINE 登入與推播功能能正確抓取資料。
app.use((req, res, next) => {
  res.setHeader("ngrok-skip-browser-warning", "true");
  next();
});

app.use(express.json());

// --- 靜態檔案設定 ---

// 1. 圖片上傳路徑 (保留原功能)
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

// 2. [保留優化] 前端網頁路徑：支援 quote.html 等前端頁面讀取
app.use(express.static(path.join(__dirname, "../frontend")));

// --- 註冊 API 路由 (保留原功能) ---
app.use("/api/auth", authRoutes);
app.use("/api/packages", packageRoutes);
app.use("/api/calculator", calculatorRoutes);
app.use("/api/shipments", shipmentRoutes);
app.use("/api/admin", adminRoutes); // 管理員專用
app.use("/api/quotes", quoteRoutes); // 估價單分享
app.use("/api/recipients", recipientRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/notifications", notificationRoutes);

// [保留功能] 註冊傢俱代採購功能路由
app.use("/api/furniture", furnitureRoutes);

app.get("/", (req, res) => {
  res.json({
    message: "小跑豬後端伺服器 (System V16.0 - LINE Integration Ready)!",
  });
});

// 全域錯誤處理邏輯 (保留原功能)
app.use((err, req, res, next) => {
  console.error("[系統錯誤]", err.stack);
  res.status(500).json({ success: false, message: "後端伺服器發生異常" });
});

app.listen(PORT, () => {
  console.log(`[啟動成功] 伺服器正在 http://localhost:${PORT} 上運行...`);
  console.log(`[CORS 狀態] 已啟用動態白名單保護，支援 ngrok 隧道測試`);
  console.log(
    `[靜態路由] 已連結至前端目錄: ${path.join(__dirname, "../frontend")}`
  );
});

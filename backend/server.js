// backend/server.js
// V15 - 旗艦穩定修復版：強化 CORS 安全性與 App 環境支援

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

// [新增] 傢俱代採購功能路由
const furnitureRoutes = require("./routes/furnitureRoutes");

const app = express();
const PORT = process.env.PORT || 3000;

// --- [大師優化：強化 CORS 安全設定] ---
// 為了讓你的後端能同時支援「網頁版」與「手機 APP (Android/iOS)」，我們必須指定白名單
const allowedOrigins = [
  "http://localhost:3000", // 本地開發後端
  "http://localhost:5500", // 常見的 Live Server 前端
  "http://127.0.0.1:5500",
  "https://runpiggy-api.onrender.com", // 你的正式環境後端網址
  "https://www.your-frontend-url.com", // [請替換] 你的正式環境前端網址
  "capacitor://localhost", // iOS App 專用 (Capacitor/Cordova 框架)
  "http://localhost", // Android App 專用
];

app.use(
  cors({
    origin: function (origin, callback) {
      // 允許沒有 origin 的請求 (例如：手機 App 的本機請求、Postman 調試)
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

app.use(express.json());

// 靜態檔案 (圖片)
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

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

// [新增] 註冊傢俱代採購功能路由
app.use("/api/furniture", furnitureRoutes);

app.get("/", (req, res) => {
  res.json({
    message: "小跑豬後端伺服器 (System V15 - Production Ready)!",
  });
});

// 全域錯誤處理邏輯 (可選，但建議加入，避免後端當機導致 App 無響應)
app.use((err, req, res, next) => {
  console.error("[系統錯誤]", err.stack);
  res.status(500).json({ success: false, message: "後端伺服器發生異常" });
});

app.listen(PORT, () => {
  console.log(`[啟動成功] 伺服器正在 http://localhost:${PORT} 上運行...`);
  console.log(`[CORS 狀態] 已啟用動態白名單保護`);
});

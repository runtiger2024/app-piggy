// backend/server.js

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

app.use(cors());
app.use(express.json());

// 靜態檔案 (圖片)
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

// --- 註冊 API 路由 ---
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
    message: "小跑豬後端伺服器 (System V14 - Furniture Procurement Ready)!",
  });
});

app.listen(PORT, () => {
  console.log(`伺服器正在 http://localhost:${PORT} 上運行...`);
});

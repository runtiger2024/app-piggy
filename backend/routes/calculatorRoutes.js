// backend/routes/calculatorRoutes.js
// V2026.1.1 - 運費試算與公開配置路由

const express = require("express");
const router = express.Router();

// 引入計算機控制器
const {
  getCalculatorConfig,
  calculateSeaFreight,
  calculateAirFreight,
} = require("../controllers/calculatorController");

/**
 * @route   GET /api/calculator/config
 * @desc    取得公開設定 (包含費率、公告、銀行資訊、偏遠地區定義、代採購匯率)
 * @access  Public
 */
router.get("/config", getCalculatorConfig);

/**
 * @route   POST /api/calculator/sea
 * @desc    執行海運運費試算
 * @access  Public
 */
router.post("/sea", calculateSeaFreight);

/**
 * @route   POST /api/calculator/air
 * @desc    執行空運運費試算 (目前為開發中介面)
 * @access  Public
 */
router.post("/air", calculateAirFreight);

module.exports = router;

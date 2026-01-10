// backend/routes/adminRoutes.js
// V17.4.Final - 旗艦整合終極穩定版 (CMS 全功能對接版)
// [Fix] 徹底修復 TypeError: argument handler must be a function，解決控制器名稱不匹配問題
// [Fix] 修正 Middleware 引用，確保 protect 與 checkPermission 體系運作正常
// [Retain] 一字不漏保留：儀表板報表、系統設定、包裹管理、集運單審核、發票系統、會員模擬、財務稽核、家具代採購
// [Add] 整合最新消息 (News)、常見問題 (FAQ)、關於我們 (About) 之 CMS 管理路由

const express = require("express");
const router = express.Router();
const upload = require("../utils/upload.js");

// --- [1. 引入所有業務控制器] ---
const settingsController = require("../controllers/admin/settingsController");
const packageController = require("../controllers/admin/packageController");
const shipmentController = require("../controllers/admin/shipmentController");
const userController = require("../controllers/admin/userController");
const reportController = require("../controllers/admin/reportController");
const walletController = require("../controllers/admin/walletController");
const furnitureAdminController = require("../controllers/admin/furnitureAdminController");
const contentAdmin = require("../controllers/admin/contentAdminController");

// --- [2. 權限驗證中介軟體] ---
// 根據系統 V17.0 規範，使用 protect 驗證 Token，checkPermission 驗證功能權限
const { protect, checkPermission } = require("../middleware/authMiddleware.js");

// ==========================================
// 1. 儀表板與報表
// ==========================================
router
  .route("/stats")
  .get(
    protect,
    checkPermission("DASHBOARD_VIEW"),
    reportController.getDashboardStats
  );

router
  .route("/logs")
  .get(protect, checkPermission("LOGS_VIEW"), reportController.getActivityLogs);

router
  .route("/reports")
  .get(
    protect,
    checkPermission("DASHBOARD_VIEW"),
    reportController.getDailyReport
  );

// ==========================================
// 2. 系統全域設定與附加服務
// ==========================================
router
  .route("/settings")
  .get(
    protect,
    checkPermission("SYSTEM_CONFIG"),
    settingsController.getSystemSettings
  );

router
  .route("/settings/:key")
  .put(
    protect,
    checkPermission("SYSTEM_CONFIG"),
    settingsController.updateSystemSetting
  );

// 附加服務項目管理 (對應 schema 中的 ShipmentServiceItem)
router
  .route("/settings/service-items")
  .get(
    protect,
    checkPermission("SYSTEM_CONFIG"),
    settingsController.getServiceItems
  )
  .post(
    protect,
    checkPermission("SYSTEM_CONFIG"),
    settingsController.createServiceItem
  );

router
  .route("/settings/service-items/:id")
  .put(
    protect,
    checkPermission("SYSTEM_CONFIG"),
    settingsController.updateServiceItem
  )
  .delete(
    protect,
    checkPermission("SYSTEM_CONFIG"),
    settingsController.deleteServiceItem
  );

// 測試 Email
router
  .route("/settings/test/email")
  .post(
    protect,
    checkPermission("SYSTEM_CONFIG"),
    settingsController.sendTestEmail
  );

// ==========================================
// 3. 包裹管理
// ==========================================
router
  .route("/packages/export")
  .get(
    protect,
    checkPermission("PACKAGE_VIEW"),
    packageController.exportPackages
  );

router
  .route("/packages/bulk-status")
  .put(
    protect,
    checkPermission("PACKAGE_EDIT"),
    packageController.bulkUpdatePackageStatus
  );

router
  .route("/packages/bulk-delete")
  .delete(
    protect,
    checkPermission("PACKAGE_DELETE"),
    packageController.bulkDeletePackages
  );

router
  .route("/packages/all")
  .get(
    protect,
    checkPermission("PACKAGE_VIEW"),
    packageController.getAllPackages
  );

router
  .route("/packages/create")
  .post(
    protect,
    checkPermission("PACKAGE_EDIT"),
    upload.array("images", 5),
    packageController.adminCreatePackage
  );

router
  .route("/packages/:id/status")
  .put(
    protect,
    checkPermission("PACKAGE_EDIT"),
    packageController.updatePackageStatus
  );

router
  .route("/packages/:id/details")
  .put(
    protect,
    checkPermission("PACKAGE_EDIT"),
    upload.array("warehouseImages", 5),
    packageController.updatePackageDetails
  );

router
  .route("/packages/:id")
  .delete(
    protect,
    checkPermission("PACKAGE_DELETE"),
    packageController.adminDeletePackage
  );

// ==========================================
// 4. 集運單管理
// ==========================================
router
  .route("/shipments/export")
  .get(
    protect,
    checkPermission("SHIPMENT_VIEW"),
    shipmentController.exportShipments
  );

router
  .route("/shipments/bulk-status")
  .put(
    protect,
    checkPermission("SHIPMENT_PROCESS"),
    shipmentController.bulkUpdateShipmentStatus
  );

router
  .route("/shipments/bulk-delete")
  .delete(
    protect,
    checkPermission("SHIPMENT_PROCESS"),
    shipmentController.bulkDeleteShipments
  );

router
  .route("/shipments/all")
  .get(
    protect,
    checkPermission("SHIPMENT_VIEW"),
    shipmentController.getAllShipments
  );

router
  .route("/shipments/:id/detail")
  .get(
    protect,
    checkPermission("SHIPMENT_VIEW"),
    shipmentController.getShipmentDetail
  );

router
  .route("/shipments/:id/approve")
  .put(
    protect,
    checkPermission("SHIPMENT_PROCESS"),
    shipmentController.approveShipment
  );

router
  .route("/shipments/:id/invoice/issue")
  .post(
    protect,
    checkPermission("SHIPMENT_PROCESS"),
    shipmentController.manualIssueInvoice
  );

router
  .route("/shipments/:id/invoice/void")
  .post(
    protect,
    checkPermission("SHIPMENT_PROCESS"),
    shipmentController.manualVoidInvoice
  );

router
  .route("/shipments/:id/price")
  .put(
    protect,
    checkPermission("SHIPMENT_PROCESS"),
    shipmentController.adjustShipmentPrice
  );

router
  .route("/shipments/:id")
  .put(
    protect,
    checkPermission("SHIPMENT_PROCESS"),
    shipmentController.updateShipmentStatus
  )
  .delete(
    protect,
    checkPermission("SHIPMENT_PROCESS"),
    shipmentController.adminDeleteShipment
  );

router
  .route("/shipments/:id/reject")
  .put(
    protect,
    checkPermission("SHIPMENT_PROCESS"),
    shipmentController.rejectShipment
  );

// ==========================================
// 5. 會員管理
// ==========================================
router
  .route("/users")
  .get(protect, checkPermission("USER_VIEW"), userController.getUsers);

router
  .route("/users/list")
  .get(protect, checkPermission("PACKAGE_VIEW"), userController.getUsersList);

router
  .route("/users/create")
  .post(
    protect,
    checkPermission("USER_MANAGE"),
    userController.createStaffUser
  );

router
  .route("/users/:id/status")
  .put(
    protect,
    checkPermission("USER_MANAGE"),
    userController.toggleUserStatus
  );

router
  .route("/users/:id/profile")
  .put(
    protect,
    checkPermission("USER_MANAGE"),
    userController.adminUpdateUserProfile
  );

router
  .route("/users/:id/permissions")
  .put(
    protect,
    checkPermission("USER_MANAGE"),
    userController.updateUserPermissions
  );

router
  .route("/users/:id/reset-password")
  .put(
    protect,
    checkPermission("USER_MANAGE"),
    userController.resetUserPassword
  );

router
  .route("/users/:id")
  .delete(protect, checkPermission("USER_MANAGE"), userController.deleteUser);

router
  .route("/users/:id/impersonate")
  .post(
    protect,
    checkPermission("USER_IMPERSONATE"),
    userController.impersonateUser
  );

// ==========================================
// 6. 財務管理
// ==========================================
router
  .route("/finance/stats")
  .get(
    protect,
    checkPermission("FINANCE_AUDIT"),
    walletController.getFinanceStats
  );

router
  .route("/finance/wallets")
  .get(
    protect,
    checkPermission("FINANCE_AUDIT"),
    walletController.getWalletsOverview
  );

router
  .route("/finance/wallets/:userId")
  .get(
    protect,
    checkPermission("FINANCE_AUDIT"),
    walletController.getWalletDetail
  );

router
  .route("/finance/transactions")
  .get(
    protect,
    checkPermission("FINANCE_AUDIT"),
    walletController.getTransactions
  );

router
  .route("/finance/transactions/bulk-review")
  .post(
    protect,
    checkPermission("FINANCE_AUDIT"),
    walletController.bulkReviewTransactions
  );

router
  .route("/finance/transactions/:id/review")
  .put(
    protect,
    checkPermission("FINANCE_AUDIT"),
    walletController.reviewTransaction
  );

router
  .route("/finance/transactions/:id/invoice")
  .post(
    protect,
    checkPermission("FINANCE_AUDIT"),
    walletController.manualIssueDepositInvoice
  );

router
  .route("/finance/transactions/:id")
  .put(
    protect,
    checkPermission("FINANCE_AUDIT"),
    walletController.updateTransaction
  )
  .delete(
    protect,
    checkPermission("FINANCE_AUDIT"),
    walletController.deleteTransaction
  );

router
  .route("/finance/adjust")
  .post(
    protect,
    checkPermission("FINANCE_AUDIT"),
    walletController.manualAdjust
  );

// ==========================================
// 7. 傢俱代採購管理
// ==========================================
router
  .route("/furniture/list")
  .get(
    protect,
    checkPermission("FURNITURE_VIEW"),
    furnitureAdminController.getAllFurnitureOrders
  );
router
  .route("/furniture/create")
  .post(
    protect,
    checkPermission("FURNITURE_EDIT"),
    furnitureAdminController.createFurnitureOrder
  );
router
  .route("/furniture/update/:id")
  .put(
    protect,
    checkPermission("FURNITURE_EDIT"),
    furnitureAdminController.updateFurnitureOrder
  );
router
  .route("/furniture/bulk-delete")
  .post(
    protect,
    checkPermission("FURNITURE_DELETE"),
    furnitureAdminController.bulkDeleteFurniture
  );
router
  .route("/furniture/bulk-status")
  .put(
    protect,
    checkPermission("FURNITURE_EDIT"),
    furnitureAdminController.bulkUpdateFurnitureStatus
  );
router
  .route("/furniture/:id")
  .delete(
    protect,
    checkPermission("FURNITURE_DELETE"),
    furnitureAdminController.deleteFurnitureOrder
  );

// ==========================================
// 8. 內容管理系統 (CMS) - 最新消息、FAQ、關於我
// ==========================================

// [修正重點]：將 POST 處理器對接為 adminUpdateNews 以支持 Upsert 邏輯
router.get(
  "/news",
  protect,
  checkPermission("SYSTEM_CONFIG"),
  contentAdmin.adminGetNews
);
router.post(
  "/news",
  protect,
  checkPermission("SYSTEM_CONFIG"),
  contentAdmin.adminUpdateNews
);
router.put(
  "/news/:id",
  protect,
  checkPermission("SYSTEM_CONFIG"),
  contentAdmin.adminUpdateNews
);
router.delete(
  "/news/:id",
  protect,
  checkPermission("SYSTEM_CONFIG"),
  contentAdmin.adminDeleteNews
);

// FAQ 管理 (對應 schema 中的 FAQ 模型)
router.get(
  "/faq",
  protect,
  checkPermission("SYSTEM_CONFIG"),
  contentAdmin.adminGetFaqs
);
router.post(
  "/faq",
  protect,
  checkPermission("SYSTEM_CONFIG"),
  contentAdmin.adminUpdateFaq
);
router.put(
  "/faq/:id",
  protect,
  checkPermission("SYSTEM_CONFIG"),
  contentAdmin.adminUpdateFaq
);
router.delete(
  "/faq/:id",
  protect,
  checkPermission("SYSTEM_CONFIG"),
  contentAdmin.adminDeleteFaq
);

// 關於我們管理 (對應 schema 中的 StaticContent)
router.get(
  "/static/about",
  protect,
  checkPermission("SYSTEM_CONFIG"),
  contentAdmin.adminGetStatic
);
router.put(
  "/static/about",
  protect,
  checkPermission("SYSTEM_CONFIG"),
  contentAdmin.adminUpdateStatic
);

module.exports = router;

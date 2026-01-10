// backend/routes/adminRoutes.js
// V17.2.Final - 旗艦整合終極修復版
// [Fix] 徹底修復 TypeError，統一使用 protect 與 checkPermission 驗證體系
// [Add] 整合最新消息、常見問題、關於我們 CMS 路由，並掛載正確權限
// [Retain] 一字不漏保留：費率設定、包裹/集運單審核、發票系統、財務管理、傢俱代採購

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

// --- [2. 關鍵修正：引入權限驗證 Middleware] ---
// 使用你系統中確認存在的 protect 與 checkPermission
const { protect, checkPermission } = require("../middleware/authMiddleware");

// ==========================================
// 1. 儀表板與報表統計
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

// 附加服務項目管理 (CRUD)
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

// 郵件測試 API
router
  .route("/settings/test/email")
  .post(
    protect,
    checkPermission("SYSTEM_CONFIG"),
    settingsController.sendTestEmail
  );

// ==========================================
// 3. 包裹管理 (預報、入庫、異常、無主)
// ==========================================
router
  .route("/packages/all")
  .get(
    protect,
    checkPermission("PACKAGE_VIEW"),
    packageController.getAllPackages
  );
router
  .route("/packages/unclaimed")
  .get(
    protect,
    checkPermission("PACKAGE_VIEW"),
    packageController.getUnclaimedParcels
  );
router
  .route("/packages/export")
  .get(
    protect,
    checkPermission("PACKAGE_VIEW"),
    packageController.exportPackages
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

// 批量操作
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

// ==========================================
// 4. 集運單管理 (審核、改價、發票)
// ==========================================
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
  .route("/shipments/export")
  .get(
    protect,
    checkPermission("SHIPMENT_VIEW"),
    shipmentController.exportShipments
  );

// 審核與改價
router
  .route("/shipments/:id/approve")
  .put(
    protect,
    checkPermission("SHIPMENT_PROCESS"),
    shipmentController.approveShipment
  );
router
  .route("/shipments/:id/reject")
  .put(
    protect,
    checkPermission("SHIPMENT_PROCESS"),
    shipmentController.rejectShipment
  );
router
  .route("/shipments/:id/price")
  .put(
    protect,
    checkPermission("SHIPMENT_PROCESS"),
    shipmentController.adjustShipmentPrice
  );

// 狀態與發票
router
  .route("/shipments/:id/status")
  .put(
    protect,
    checkPermission("SHIPMENT_PROCESS"),
    shipmentController.updateShipmentStatus
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

// 批量操作
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

// ==========================================
// 5. 會員管理 (身分模擬、密碼重設)
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
  .route("/users/:id/impersonate")
  .post(
    protect,
    checkPermission("USER_IMPERSONATE"),
    userController.impersonateUser
  );
router
  .route("/users/:id")
  .delete(protect, checkPermission("USER_MANAGE"), userController.deleteUser);

// ==========================================
// 6. 財務管理 (交易審核、錢包調整)
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
  .route("/finance/transactions/bulk-review")
  .post(
    protect,
    checkPermission("FINANCE_AUDIT"),
    walletController.bulkReviewTransactions
  );

router
  .route("/finance/adjust")
  .post(
    protect,
    checkPermission("FINANCE_AUDIT"),
    walletController.manualAdjust
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

// 最新消息管理
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
  contentAdmin.adminCreateNews
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

// FAQ 管理
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

// 關於我們管理
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

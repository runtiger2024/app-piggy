-- --- 1. 使用者 (User) ---
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL UNIQUE,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "defaultAddress" TEXT,
    "defaultTaxId" TEXT,
    "defaultInvoiceTitle" TEXT,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "resetPasswordToken" TEXT,
    "resetPasswordExpire" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- --- 2. 常用收件人 (Recipient) ---
CREATE TABLE "Recipient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "idNumber" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- --- 3. 電子錢包 (Wallet) ---
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL UNIQUE,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- --- 4. 交易紀錄 (Transaction) ---
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL, -- DEPOSIT, PAYMENT, REFUND, ADJUST
    "status" TEXT NOT NULL,
    "description" TEXT,
    "proofImage" TEXT,
    "taxId" TEXT,
    "invoiceTitle" TEXT,
    "invoiceNumber" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "invoiceRandomCode" TEXT,
    "invoiceStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE
);

-- --- 5. 集運單 (Shipment) ---
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "shippingAddress" TEXT NOT NULL,
    "idNumber" TEXT NOT NULL,
    "taxId" TEXT,
    "invoiceTitle" TEXT,
    "note" TEXT,
    "additionalServices" JSONB DEFAULT '{}',
    "deliveryLocationRate" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
    "totalCost" DOUBLE PRECISION,
    "trackingNumberTW" TEXT,
    "paymentProof" TEXT,
    "carrierType" TEXT,
    "carrierId" TEXT,
    "loadingDate" TIMESTAMP(3),
    "returnReason" TEXT,
    "invoiceNumber" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "invoiceRandomCode" TEXT,
    "invoiceStatus" TEXT,
    "productUrl" TEXT,
    "shipmentProductImages" JSONB NOT NULL DEFAULT '[]',
    "transactionId" TEXT UNIQUE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT,
    FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL
);

-- --- 6. 包裹 (Package) ---
CREATE TABLE "Package" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "shipmentId" TEXT,
    "trackingNumber" TEXT NOT NULL UNIQUE,
    "productName" TEXT NOT NULL,
    "productUrl" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "productImages" JSONB NOT NULL DEFAULT '[]',
    "warehouseImages" JSONB NOT NULL DEFAULT '[]',
    "warehouseThumbnails" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "arrivedBoxesJson" JSONB NOT NULL DEFAULT '[]',
    "totalCalculatedFee" DOUBLE PRECISION,
    "warehouseRemark" TEXT,
    "claimProof" TEXT,
    "exceptionStatus" TEXT,
    "exceptionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT,
    FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL
);

-- --- 7. 傢俱代採購 (FurnitureProcurement) ---
CREATE TABLE "FurnitureProcurement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "factoryName" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "priceRMB" DOUBLE PRECISION NOT NULL,
    "exchangeRate" DOUBLE PRECISION NOT NULL,
    "serviceFeeRate" DOUBLE PRECISION NOT NULL,
    "serviceFee" DOUBLE PRECISION NOT NULL,
    "totalAmountTWD" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentProof" TEXT,
    "invoiceNumber" TEXT,
    "invoiceStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT
);

-- --- 8. 系統設定與日誌 ---
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "link" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE TABLE "CalculationQuote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "calculationResult" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- --- 索引 (Indexes) ---
CREATE INDEX "Recipient_userId_idx" ON "Recipient"("userId");
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");
CREATE INDEX "Transaction_walletId_idx" ON "Transaction"("walletId");
CREATE INDEX "Package_userId_idx" ON "Package"("userId");
CREATE INDEX "Package_shipmentId_idx" ON "Package"("shipmentId");
CREATE INDEX "Shipment_userId_idx" ON "Shipment"("userId");
CREATE INDEX "ActivityLog_userId_idx" ON "ActivityLog"("userId");
CREATE INDEX "ActivityLog_action_idx" ON "ActivityLog"("action");
CREATE INDEX "FurnitureProcurement_userId_idx" ON "FurnitureProcurement"("userId");
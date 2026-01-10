// backend/utils/sendEmail.js
// V17 - 2026 旗艦優化版：修復連結失效、文字優化、整合發票備註

const sgMail = require("@sendgrid/mail");
const prisma = require("../config/db.js");
require("dotenv").config();

// 初始化 SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} else {
  console.warn(
    "⚠️ [Email Warning] SENDGRID_API_KEY 未設定，Email 功能將失效。"
  );
}

/**
 * 取得 Email 設定 (優先讀取資料庫，失敗則回退至環境變數)
 */
const getEmailConfig = async () => {
  let config = {
    senderName: "小跑豬物流", // 預設名稱
    senderEmail: process.env.SENDER_EMAIL_ADDRESS,
    recipients: [], // 管理員收件列表
  };

  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "email_config" },
    });

    if (setting && setting.value) {
      // Prisma 的 Json 欄位讀取出來已經是物件，直接使用
      const dbConfig = setting.value;
      if (dbConfig.senderName) config.senderName = dbConfig.senderName;
      if (dbConfig.senderEmail) config.senderEmail = dbConfig.senderEmail;
      if (Array.isArray(dbConfig.recipients))
        config.recipients = dbConfig.recipients;
    }
  } catch (error) {
    console.warn(
      "[Email] 讀取 email_config 失敗，使用環境變數備案: ",
      error.message
    );
  }

  if (
    (!config.recipients || config.recipients.length === 0) &&
    process.env.ADMIN_EMAIL_RECIPIENT
  ) {
    config.recipients = process.env.ADMIN_EMAIL_RECIPIENT.split(",")
      .map((e) => e.trim())
      .filter((e) => e.length > 0);
  }

  return config;
};

// ==========================================
//  Part A: 通知管理員 (To Admin)
// ==========================================

/**
 * A-1. 發送「新集運單成立」的通知給管理員
 * [優化] 修改按鈕文字與 ID 顯示邏輯
 */
const sendNewShipmentNotification = async (shipment, customer) => {
  try {
    const config = await getEmailConfig();
    if (
      !process.env.SENDGRID_API_KEY ||
      !config.senderEmail ||
      !config.recipients.length
    )
      return;

    const displayId = shipment.shipmentNo || shipment.id;
    const subject = `[${config.senderName}] 新訂單成立 - ${
      shipment.recipientName
    } (NT$ ${shipment.totalCost.toLocaleString()})`;

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #1a73e8;">新訂單成立通知</h2>
        <p>客戶 <strong>${
          customer.name || customer.email
        }</strong> 剛剛建立了一筆新的集運單。</p>
        <hr style="border: 0; border-top: 1px solid #eee;">
        <h3>訂單摘要</h3>
        <ul style="padding-left: 20px;">
          <li><strong>訂單編號:</strong> ${displayId}</li>
          <li><strong>總金額:</strong> NT$ ${shipment.totalCost.toLocaleString()}</li>
          <li><strong>收件人:</strong> ${shipment.recipientName}</li>
        </ul>
        <p style="margin-top: 20px;">
          <a href="${process.env.FRONTEND_URL}/admin-login.html" 
             style="background-color: #1a73e8; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
             管理中心審核訂單
          </a>
        </p>
      </div>
    `;

    await sgMail.send({
      to: config.recipients,
      from: { email: config.senderEmail, name: config.senderName },
      subject: subject,
      html: html,
    });
    console.log(`✅ [Email Success] 已發送新訂單通知 (ID: ${displayId})`);
  } catch (error) {
    console.error(`❌ [Email Error] 發送通知失敗:`, error.message);
  }
};

/**
 * A-2. 發送「客戶上傳轉帳憑證」的通知給管理員
 */
const sendPaymentProofNotification = async (shipment, customer) => {
  try {
    const config = await getEmailConfig();
    if (
      !process.env.SENDGRID_API_KEY ||
      !config.senderEmail ||
      config.recipients.length === 0
    )
      return;

    const displayId = shipment.shipmentNo || shipment.id;
    const subject = `[${config.senderName}] 客戶已上傳匯款憑證 - ${displayId}`;

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2 style="color: #2e7d32;">匯款憑證上傳通知</h2>
        <p>客戶 <strong>${
          customer.name || customer.email
        }</strong> 已為訂單 <strong>${displayId}</strong> 上傳了憑證。</p>
        <p>訂單金額: <strong>NT$ ${shipment.totalCost.toLocaleString()}</strong></p>
        <p><a href="${
          process.env.FRONTEND_URL
        }/admin-login.html">管理中心審核憑證</a></p>
      </div>
    `;

    await sgMail.send({
      to: config.recipients,
      from: { email: config.senderEmail, name: config.senderName },
      subject: subject,
      html: html,
    });
  } catch (error) {
    console.error(`[Email] 發送憑證通知失敗:`, error.message);
  }
};

/**
 * A-3. 發送「客戶申請錢包儲值」的通知給管理員
 */
const sendDepositRequestNotification = async (transaction, customer) => {
  try {
    const config = await getEmailConfig();
    if (
      !process.env.SENDGRID_API_KEY ||
      !config.senderEmail ||
      config.recipients.length === 0
    )
      return;

    const subject = `[${config.senderName}] 新的錢包儲值申請 - NT$ ${transaction.amount}`;
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2 style="color: #f57c00;">錢包儲值申請</h2>
        <p>客戶 <strong>${
          customer.name || customer.email
        }</strong> 申請儲值 NT$ ${transaction.amount}。</p>
        <p><a href="${
          process.env.FRONTEND_URL
        }/admin-login.html">管理中心處理申請</a></p>
      </div>
    `;

    await sgMail.send({
      to: config.recipients,
      from: { email: config.senderEmail, name: config.senderName },
      subject: subject,
      html: html,
    });
  } catch (error) {
    console.error(`[Email] 發送儲值通知失敗:`, error.message);
  }
};

// ==========================================
//  Part B: 通知客戶 (To Client)
// ==========================================

/**
 * B-1. 發送「包裹已入庫」通知給客戶
 * [優化] 增加前往詳情的正確連結
 */
const sendPackageArrivedNotification = async (pkg, customer) => {
  try {
    const config = await getEmailConfig();
    if (!process.env.SENDGRID_API_KEY || !config.senderEmail || !customer.email)
      return;

    const weight = pkg.arrivedBoxesJson?.[0]?.weight || "-";
    const subject = `[${config.senderName}] 包裹已入庫通知 - 單號 ${pkg.trackingNumber}`;

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2 style="color: #1a73e8;">包裹已到達倉庫！</h2>
        <p>親愛的 ${customer.name || "會員"} 您好：</p>
        <p>您的包裹 <strong>${pkg.trackingNumber}</strong> (${
      pkg.productName
    }) 已經入庫。</p>
        <p><strong>入庫重量:</strong> ${weight} kg</p>
        <p style="margin-top: 20px;">
          <a href="${process.env.FRONTEND_URL}/dashboard.html?tab=tab-packages" 
             style="background-color: #1a73e8; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
             會員中心查看包裹
          </a>
        </p>
      </div>
    `;

    await sgMail.send({
      to: customer.email,
      from: { email: config.senderEmail, name: config.senderName },
      subject: subject,
      html: html,
    });
  } catch (error) {
    console.error(`[Email] 發送入庫通知失敗:`, error.message);
  }
};

/**
 * B-2. 發送「訂單已出貨」通知給客戶
 * [優化] 文字優化與連結修復
 */
const sendShipmentShippedNotification = async (shipment, customer) => {
  try {
    const config = await getEmailConfig();
    if (!process.env.SENDGRID_API_KEY || !config.senderEmail || !customer.email)
      return;

    const displayId = shipment.shipmentNo || shipment.id;
    const subject = `[${config.senderName}] 訂單已出貨通知 - ${displayId}`;

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2 style="color: #1a73e8;">您的訂單已出貨！</h2>
        <p>您的集運單 <strong>${displayId}</strong> 已裝櫃發貨。</p>
        <p><strong>物流追蹤碼:</strong> ${
          shipment.trackingNumberTW || "專車派送處理中"
        }</p>
        <p style="margin-top: 20px;">
          <a href="${
            process.env.FRONTEND_URL
          }/dashboard.html?tab=tab-shipments" 
             style="background-color: #1a73e8; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
             會員中心查看訂單詳情
          </a>
        </p>
      </div>
    `;

    await sgMail.send({
      to: customer.email,
      from: { email: config.senderEmail, name: config.senderName },
      subject: subject,
      html: html,
    });
  } catch (error) {
    console.error(`[Email] 發送出貨通知失敗:`, error.message);
  }
};

/**
 * B-3. 發送「訂單建立確認」通知給客戶
 * [重要優化] 增加發票備註、文字修正、以及修復連結失效
 */
const sendShipmentCreatedNotification = async (shipment, customer) => {
  try {
    const config = await getEmailConfig();
    if (!process.env.SENDGRID_API_KEY || !config.senderEmail || !customer.email)
      return;

    const displayId = shipment.shipmentNo || shipment.id;
    const subject = `[${config.senderName}] 訂單建立確認 - ${displayId}`;

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2 style="color: #1a73e8;">您的訂單已成功建立！</h2>
        <p>親愛的 ${customer.name || "會員"} 您好：</p>
        <p>您的集運單 <strong>${displayId}</strong> 已建立成功，<strong>訂單詳細內容</strong>可點選下方連結查看。</p>
        <p><strong>訂單應付金額:</strong> NT$ ${shipment.totalCost.toLocaleString()}</p>
        
        <p style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #ffc107;">
          <strong>重要備註：</strong><br>
          1. 系統將默認開立電子發票至您帳號設定中填寫的電子信箱。<br>
          2. 請盡速前往會員中心上傳憑證，以利後續審核出貨。
        </p>

        <p style="margin-top: 20px;">
          <a href="${
            process.env.FRONTEND_URL
          }/dashboard.html?tab=tab-shipments" 
             style="background-color: #1a73e8; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
             會員中心查看訂單詳情
          </a>
        </p>
        
        <p style="font-size: 12px; color: #888; margin-top: 30px;">
          * 若無法點選按鈕，請複製此連結至瀏覽器：<br>
          ${process.env.FRONTEND_URL}/dashboard.html?tab=tab-shipments
        </p>
      </div>
    `;

    await sgMail.send({
      to: customer.email,
      from: { email: config.senderEmail, name: config.senderName },
      subject: subject,
      html: html,
    });
  } catch (error) {
    console.error(`[Email] 發送建立通知失敗:`, error.message);
  }
};

module.exports = {
  sendNewShipmentNotification,
  sendPaymentProofNotification,
  sendDepositRequestNotification,
  sendPackageArrivedNotification,
  sendShipmentShippedNotification,
  sendShipmentCreatedNotification,
};

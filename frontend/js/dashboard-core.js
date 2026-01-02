// frontend/js/dashboard-core.js
// 負責：全域變數、工具函式、使用者資料同步、系統設定、動態上傳組件
// V2026.1.11 - 旗艦穩定版：會員編號一體化(去前綴)、整合發票資訊與 DOM 安全檢查

// --- [1. 全域變數與狀態管理] ---
window.currentUser = null;
window.allPackagesData = []; // 所有的包裹數據快取
window.dashboardToken = localStorage.getItem("token");
window.BANK_INFO_CACHE = null; // 暫存系統銀行資訊

// --- [2. 基礎工具函式] ---

/**
 * 顯示全域訊息提示 (Alert Box)
 */
window.showMessage = function (message, type) {
  const messageBox = document.getElementById("message-box");
  if (!messageBox) return;

  messageBox.textContent = message;
  // 對接 CSS: alert-success, alert-error, alert-info, alert-warning
  messageBox.className = `alert alert-${type} animate-slide-up`;
  messageBox.style.display = "block";

  setTimeout(() => {
    messageBox.style.display = "none";
  }, 3500);
};

/**
 * 開啟圖片瀏覽大圖
 * @param {Array} images - 圖片路徑陣列
 */
window.openImages = function (images) {
  const gallery = document.getElementById("images-gallery");
  const modal = document.getElementById("view-images-modal");
  if (!gallery || !modal) return;

  gallery.innerHTML = "";
  if (images && Array.isArray(images) && images.length > 0) {
    images.forEach((imgUrl) => {
      const img = document.createElement("img");
      img.src = `${API_BASE_URL}${imgUrl}`;
      img.alt = "預覽圖";
      img.style.cssText =
        "width:100%; object-fit:cover; border-radius:8px; cursor:zoom-in; border:1px solid #eee;";
      img.onclick = () => window.open(img.src, "_blank");
      gallery.appendChild(img);
    });
  } else {
    gallery.innerHTML = `<p style='grid-column:1/-1;text-align:center;color:#999;padding:20px;'>暫無照片紀錄</p>`;
  }
  modal.style.display = "flex";
};

// --- [3. 使用者與帳號資料同步] ---

/**
 * 載入個人資料並同步更新所有 UI (Header & Modals)
 */
window.loadUserProfile = async function () {
  if (!window.dashboardToken) {
    window.location.href = "login.html";
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });

    if (!response.ok) throw new Error("Auth failed");

    const data = await response.json();
    window.currentUser = data.user;

    // 執行 UI 同步
    syncProfileToUI(data.user);
  } catch (error) {
    console.error("Profile sync error:", error);
    if (error.message === "Auth failed") {
      localStorage.removeItem("token");
      window.location.href = "login.html";
    }
  }
};

/**
 * [核心優化] 將使用者資料渲染至畫面上所有相關的 ID
 * 包含：會員編號(去前綴一體化)、基本個資、發票預設設定
 */
function syncProfileToUI(user) {
  // 1. 迎賓文字 (Dashboard Hero & Header)
  const welcomeEl = document.getElementById("welcome-message");
  if (welcomeEl) {
    welcomeEl.textContent = `${user.name || "親愛的會員"}，您好`;
  }

  // 2. 建立資料與 DOM 的映射關係
  const mapping = {
    "user-email": user.email,
    "user-phone": user.phone || "(未填寫)",
    "user-address": user.defaultAddress || user.address || "(未填寫)",

    // 同步到「帳號設定」彈窗表單
    "edit-name": user.name || "",
    "edit-phone": user.phone || "",
    "edit-email": user.email,
    "edit-address": user.defaultAddress || user.address || "",
    "edit-taxId": user.defaultTaxId || "", // 同步發票統編
    "edit-invoiceTitle": user.defaultInvoiceTitle || "", // 同步發票抬頭
    "modal-user-name": user.name || "未設定姓名",
  };

  // 遍歷映射並更新內容，支援 Input 與純文字標籤
  for (const [id, value] of Object.entries(mapping)) {
    const el = document.getElementById(id);
    if (el) {
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        el.value = value;
      } else {
        el.textContent = value;
      }
    }
  }

  // 3. [會員編號一體化] 顯示專屬會員標識碼：徹底移除 PIGGY- 前綴
  // 同步更新 Hero 區塊與彈窗標頭中的編號
  const userIdElements = document.querySelectorAll(
    "#modal-user-id, #hero-user-id"
  );
  const finalMemberId =
    user.piggyId || (user.id ? user.id.slice(-6).toUpperCase() : "...");

  userIdElements.forEach((el) => {
    // 移除 PIGGY- 前綴，直接顯示資料庫的 RP 號碼或原始 ID 後六碼
    el.textContent = finalMemberId;
  });
}

// --- [4. 系統配置與銀行資訊] ---

/**
 * 載入最新費率、遠程地區、銀行帳戶資訊
 */
window.loadSystemSettings = async function () {
  try {
    const res = await fetch(`${API_BASE_URL}/api/calculator/config`);
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        if (data.rates) {
          window.RATES = data.rates.categories || window.RATES;
          window.CONSTANTS = data.rates.constants || window.CONSTANTS;
        }
        if (data.remoteAreas) window.REMOTE_AREAS = data.remoteAreas;

        // 儲存銀行資訊並通知相關 UI 更新
        if (data.bankInfo) {
          window.BANK_INFO_CACHE = data.bankInfo;
          if (typeof window.updateBankInfoDOM === "function") {
            window.updateBankInfoDOM(data.bankInfo);
          }
        }
      }
    }
  } catch (e) {
    console.warn("System config load failed, using local fallback.");
  }
};

// --- [5. 進階動態圖片上傳組件] ---

/**
 * 初始化具備預覽與刪除功能的圖片上傳器
 * @param {string} inputId - 隱藏的 input[type="file"] ID
 * @param {string} containerId - 預覽容器 ID
 * @param {number} maxFiles - 最大限制張數
 */
window.initImageUploader = function (inputId, containerId, maxFiles = 5) {
  const mainInput = document.getElementById(inputId);
  const container = document.getElementById(containerId);
  if (!mainInput || !container) return;

  // 使用 DataTransfer 對象模擬檔案清單操作，保留原始功能
  const dataTransfer = new DataTransfer();

  function render() {
    container.innerHTML = "";

    // 1. 渲染已選擇的圖片預覽
    Array.from(dataTransfer.files).forEach((file, index) => {
      const item = document.createElement("div");
      item.className = "upload-item animate-pop-in";

      const img = document.createElement("img");
      img.src = URL.createObjectURL(file);
      img.onclick = () => window.open(img.src, "_blank");

      const removeBtn = document.createElement("div");
      removeBtn.className = "remove-btn";
      removeBtn.innerHTML = "&times;";
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        dataTransfer.items.remove(index);
        mainInput.files = dataTransfer.files; // 同步回原始 Input
        render();
      };

      item.appendChild(img);
      item.appendChild(removeBtn);
      container.appendChild(item);
    });

    // 2. 若未達張數上限，則顯示帶有「相機圖示」的添加按鈕
    if (dataTransfer.files.length < maxFiles) {
      const addLabel = document.createElement("label");
      addLabel.className = "upload-add-btn";
      addLabel.innerHTML = `
        <i class="fas fa-camera"></i>
        <span>${dataTransfer.files.length}/${maxFiles}</span>
      `;

      const tempInput = document.createElement("input");
      tempInput.type = "file";
      tempInput.accept = "image/*";
      tempInput.multiple = true;
      tempInput.style.display = "none";

      tempInput.onchange = (e) => {
        const newFiles = Array.from(e.target.files);
        newFiles.forEach((f) => {
          if (dataTransfer.items.length < maxFiles) {
            dataTransfer.items.add(f);
          }
        });
        mainInput.files = dataTransfer.files;
        render();
      };

      addLabel.appendChild(tempInput);
      container.appendChild(addLabel);
    }
  }

  render(); // 初始渲染

  // 提供外部重置方法 (用於表單 reset)
  mainInput.resetUploader = () => {
    dataTransfer.items.clear();
    mainInput.value = "";
    render();
  };
};

/**
 * 全域導向詳情輔助 (用於通知系統跳轉至指定集運單)
 * 整合不同版本之命名慣例
 */
window.openShipmentDetails = function (id) {
  if (window.viewShipmentDetail) {
    window.viewShipmentDetail(id);
  } else if (
    typeof window.openShipmentDetails === "function" &&
    window.openShipmentDetails !== window.openShipmentDetails
  ) {
    // 避免無限遞迴，僅在 dashboard-main.js 中的函式存在時呼叫
    window.openShipmentDetails(id);
  }
};

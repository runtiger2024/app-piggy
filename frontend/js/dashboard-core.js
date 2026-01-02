// frontend/js/dashboard-core.js
// 負責：全域變數、工具函式、使用者資料同步、系統設定、動態上傳組件
// V2026.1.9 - 旗艦版：整合 RP0000889 遞增編號邏輯、強化 DOM 安全檢查與資料同步

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
 * 將使用者資料渲染至畫面上所有相關的 ID (包含最新的 RP 編號)
 */
function syncProfileToUI(user) {
  // 1. 迎賓文字 (Dashboard & Header)
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
    "edit-taxId": user.defaultTaxId || "",
    "edit-invoiceTitle": user.defaultInvoiceTitle || "",
    "modal-user-name": user.name || "未設定姓名",
  };

  // 遍歷映射並更新內容
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

  // 3. [核心更新] 顯示專屬會員標識碼 (優先讀取資料庫 piggyId)
  const userIdEl = document.getElementById("modal-user-id");
  if (userIdEl) {
    // 優先使用資料庫中的 RP0000889 格式編號，若無則回退至舊有截取 ID 邏輯
    if (user.piggyId) {
      userIdEl.textContent = user.piggyId;
    } else if (user.id) {
      userIdEl.textContent = `PIGGY-${user.id.slice(-6).toUpperCase()}`;
    } else {
      userIdEl.textContent = "載入中...";
    }
  }
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

  // 使用 DataTransfer 對象模擬檔案清單操作
  const dataTransfer = new DataTransfer();

  function render() {
    container.innerHTML = "";

    // 1. 渲染已選擇的圖片
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

    // 2. 若未達張數上限，則顯示「+」按鈕
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

  render(); // 執行初始渲染

  // 公開重置方法：方便表單提交成功後外部呼叫
  mainInput.resetUploader = () => {
    dataTransfer.items.clear();
    mainInput.value = "";
    render();
  };
};

/**
 * 全域導向詳情輔助 (用於通知系統跳轉至指定集運單)
 */
window.openShipmentDetails = function (id) {
  if (window.viewShipmentDetail) {
    window.viewShipmentDetail(id);
  } else if (window.openShipmentDetails) {
    // 兼容不同版本的命名慣例
    window.openShipmentDetails(id);
  }
};

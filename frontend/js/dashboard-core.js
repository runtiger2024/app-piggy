/**
 * dashboard-core.js
 * 負責：全域變數、工具函式、使用者資料同步、系統設定、動態上傳組件、通知系統
 * V2026.1.15_Optimized_V2 - 旗艦終極優化版 (增強圖片上傳反饋與 Email 補填提醒)
 * * 變更紀錄：
 * 1. [新增功能]：上傳組件選取檔案後新增自動 Toast 提示張數與成功狀態。
 * 2. [效能優化]：重構 initImageUploader 渲染邏輯，使用 DocumentFragment 減少 DOM 操縱。
 * 3. [整合修復]：syncProfileToUI 現在會同步資料至密碼表單的隱藏使用者名稱欄位 (cp-username-hidden)。
 * 4. [邏輯修正]：修復 openShipmentDetails 的潛在遞迴錯誤。
 * 5. [穩定性]：強化 Toast 訊息容器偵測機制。
 * 6. [優化整合]：syncProfileToUI 新增偵測 @line.temp 自動彈出補填信箱提醒並標紅顯示。
 */

// --- [1. 全域變數與狀態管理] ---
window.currentUser = null;
window.allPackagesData = []; // 所有的包裹數據快取
window.dashboardToken = localStorage.getItem("token");
window.BANK_INFO_CACHE = null; // 暫存系統銀行資訊

// --- [2. 基礎工具函式] ---

/**
 * 顯示全域訊息提示 (Toast 彈窗系統)
 * 對接 CSS V41.0 的 #message-container 與 .toast-message
 */
window.showMessage = function (message, type = "info") {
  const container = document.getElementById("message-container");
  if (!container) {
    console.warn("找不到 message-container，將使用系統 alert。");
    alert(message);
    return;
  }

  // 1. 建立 Toast 元素
  const toast = document.createElement("div");
  toast.className = `toast-message ${type}`;

  // 2. 根據類型決定 FontAwesome 圖示
  let iconClass = "fa-info-circle";
  if (type === "success") iconClass = "fa-check-circle";
  if (type === "error") iconClass = "fa-exclamation-circle";
  if (type === "warning") iconClass = "fa-exclamation-triangle";

  toast.innerHTML = `
    <i class="fas ${iconClass}"></i>
    <div class="toast-text">${message}</div>
  `;

  // 3. 放入容器中顯示
  container.appendChild(toast);

  // 4. 自動消失邏輯 (3.5秒後開始淡出)
  const timer = setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => {
      if (toast.parentNode === container) {
        container.removeChild(toast);
      }
    }, 500);
  }, 3500);

  // 點擊手動關閉
  toast.onclick = () => {
    clearTimeout(timer);
    toast.classList.add("fade-out");
    setTimeout(() => {
      if (toast.parentNode === container) container.removeChild(toast);
    }, 300);
  };
};

/**
 * 開啟圖片瀏覽大圖
 */
window.openImages = function (images) {
  const gallery = document.getElementById("images-gallery");
  const modal = document.getElementById("view-images-modal");
  if (!gallery || !modal) return;

  gallery.innerHTML = "";
  if (images && Array.isArray(images) && images.length > 0) {
    const fragment = document.createDocumentFragment();
    images.forEach((imgUrl) => {
      const img = document.createElement("img");
      img.src = imgUrl.startsWith("http") ? imgUrl : `${API_BASE_URL}${imgUrl}`;
      img.alt = "預覽圖";
      img.style.cssText =
        "width:100%; object-fit:cover; border-radius:8px; cursor:zoom-in; border:1px solid #eee; margin-bottom:10px;";
      img.onclick = () => window.open(img.src, "_blank");
      fragment.appendChild(img);
    });
    gallery.appendChild(fragment);
  } else {
    gallery.innerHTML = `<p style='grid-column:1/-1;text-align:center;color:#999;padding:20px;'>暫無照片紀錄</p>`;
  }
  modal.style.display = "flex";
};

// --- [3. 使用者與帳號資料同步] ---

/**
 * 載入個人資料並同步更新所有 UI
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
 * 將使用者資料渲染至畫面上所有相關的 ID
 * [優化] 新增偵測 LINE 佔位符號 Email 並給予警告
 */
function syncProfileToUI(user) {
  // 1. 迎賓文字
  const welcomeEl = document.getElementById("welcome-message");
  if (welcomeEl) {
    welcomeEl.textContent = `${user.name || "親愛的會員"}，您好`;
  }

  // 2. 建立資料映射
  const mapping = {
    "user-email": user.email,
    "user-phone": user.phone || "(未填寫)",
    "user-address": user.defaultAddress || user.address || "(未填寫)",
    "edit-name": user.name || "",
    "edit-phone": user.phone || "",
    "edit-email": user.email,
    "edit-address": user.defaultAddress || user.address || "",
    "edit-taxId": user.defaultTaxId || "",
    "edit-invoiceTitle": user.defaultInvoiceTitle || "",
    "modal-user-name": user.name || "未設定姓名",
    // 重要：同步到修改密碼表單的隱藏使用者名稱欄位，修復瀏覽器警告
    "cp-username-hidden": user.email || user.piggyId || "",
  };

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

  // 3. 會員編號顯示 (一體化邏輯)
  const userIdElements = document.querySelectorAll(
    "#modal-user-id, #hero-user-id"
  );
  const finalMemberId =
    user.piggyId || (user.id ? user.id.slice(-6).toUpperCase() : "...");

  userIdElements.forEach((el) => {
    el.textContent = finalMemberId;
  });

  // --- [新增/優化] Email 佔位符號檢查與警示邏輯 ---
  // 檢查 user.email 是否包含 @line.temp，這代表用戶尚未更新真實信箱
  const isPlaceholder = user.email && user.email.includes("@line.temp");

  if (isPlaceholder) {
    // 延遲顯示，確保用戶已進入頁面
    setTimeout(() => {
      window.showMessage(
        "⚠️ 您尚未設定真實 Email！為了確保電子發票與訂單通知能準確送達，請前往「帳號設定」更新您的電子信箱。",
        "warning"
      );
    }, 1500);

    // 同時將顯示 Email 的區域變更顏色以引起注意
    const emailDisplay = document.getElementById("user-email");
    if (emailDisplay) {
      emailDisplay.style.color = "#d32f2f";
      emailDisplay.style.fontWeight = "bold";
      emailDisplay.title = "請務必更新真實電子信箱";
    }
  }
}

// --- [4. 系統配置與銀行資訊] ---

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
 * 初始化圖片上傳器 (效能優化版)
 * 使用 DocumentFragment 減少 Reflow 頻率，並新增使用者操作提示與預覽縮圖功能
 */
window.initImageUploader = function (inputId, containerId, maxFiles = 5) {
  const mainInput = document.getElementById(inputId);
  const container = document.getElementById(containerId);
  if (!mainInput || !container) return;

  const dataTransfer = new DataTransfer();

  /**
   * 渲染圖片縮圖與操作介面
   */
  function render() {
    // 效能優化：使用 fragment 一次性寫入 DOM
    container.innerHTML = "";
    const fragment = document.createDocumentFragment();

    // 1. 渲染預覽圖 (縮圖顯示於上傳區域內)
    Array.from(dataTransfer.files).forEach((file, index) => {
      const item = document.createElement("div");
      item.className = "upload-item animate-pop-in";

      const img = document.createElement("img");
      const objectUrl = URL.createObjectURL(file);
      img.src = objectUrl;
      img.onclick = () => window.open(objectUrl, "_blank");

      const removeBtn = document.createElement("div");
      removeBtn.className = "remove-btn";
      removeBtn.innerHTML = "&times;";
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        URL.revokeObjectURL(objectUrl); // 釋放記憶體
        dataTransfer.items.remove(index);
        mainInput.files = dataTransfer.files;
        render();
        window.showMessage("已移除該照片", "info");
      };

      item.appendChild(img);
      item.appendChild(removeBtn);
      fragment.appendChild(item);
    });

    // 2. 添加按鈕
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
        let addedCount = 0;
        let isOverLimit = false;

        newFiles.forEach((f) => {
          if (dataTransfer.items.length < maxFiles) {
            dataTransfer.items.add(f);
            addedCount++;
          } else {
            isOverLimit = true;
          }
        });

        mainInput.files = dataTransfer.files;
        render();

        // 選取後的新功能：顯示張數提示與警告
        if (addedCount > 0) {
          window.showMessage(
            `已成功選取 ${addedCount} 張商品照片，縮圖已顯示在下方。`,
            "success"
          );
        }
        if (isOverLimit) {
          window.showMessage(
            `抱歉，照片數量上限為 ${maxFiles} 張，其餘檔案未加入。`,
            "warning"
          );
        }
      };

      addLabel.appendChild(tempInput);
      fragment.appendChild(addLabel);
    }

    container.appendChild(fragment);
  }

  render();

  mainInput.resetUploader = () => {
    dataTransfer.items.clear();
    mainInput.value = "";
    render();
  };
};

/**
 * 全域導向詳情輔助 (修正遞迴錯誤)
 */
window.openShipmentDetails = function (id) {
  // 檢查 dashboard-shipments.js 是否已定義功能函式
  if (typeof window.viewShipmentDetail === "function") {
    window.viewShipmentDetail(id);
  } else {
    // 若尚未定義，則提示用戶或載入數據
    console.warn("詳情檢視功能尚未就緒。");
  }
};

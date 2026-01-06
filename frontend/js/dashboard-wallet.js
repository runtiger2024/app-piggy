/**
 * dashboard-wallet.js
 * V31.0_Enhanced_Preview - 旗艦優化預覽版 (整合完整功能、卡片 UI 與憑證預覽)
 */

window.rawTransactions = []; // 快取數據供過濾使用

// --- 輔助函式：處理圖片路徑 (Fix Broken Images) ---
function getImageUrl(path) {
  if (!path) return null;
  if (path.startsWith("http") || path.startsWith("https")) return path;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
}

// 1. 更新全域餘額顯示 (Header / Profile)
window.updateGlobalWalletDisplay = async function () {
  try {
    const res = await fetch(`${API_BASE_URL}/api/wallet/my`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();

    if (data.success && data.wallet) {
      const balance = data.wallet.balance;
      const formatted = `$${balance.toLocaleString()}`;

      const headerEl = document.getElementById("header-wallet-balance");
      if (headerEl) {
        headerEl.textContent = formatted;
        headerEl.style.color = balance < 0 ? "#d32f2f" : "#ffffff"; // Header 內通常為白字或亮色
      }

      const tabBalanceEl = document.getElementById("wallet-balance");
      if (tabBalanceEl) {
        tabBalanceEl.textContent = balance.toLocaleString();
        tabBalanceEl.style.color = balance < 0 ? "#ffcdd2" : "#ffffff";
      }
    }
  } catch (e) {
    console.warn("餘額更新失敗", e);
  }
};

// 2. 載入錢包資料 (含交易紀錄)
window.loadWalletData = async function () {
  const listEl = document.getElementById("transaction-list");
  const loadingEl = document.getElementById("wallet-loading");

  if (loadingEl) loadingEl.style.display = "block";
  // 同步更新全域餘額
  await window.updateGlobalWalletDisplay();

  try {
    const res = await fetch(`${API_BASE_URL}/api/wallet/my`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();

    if (data.success && data.wallet) {
      window.rawTransactions = data.wallet.transactions || [];
      renderTransactionCards(window.rawTransactions);
    }
  } catch (e) {
    console.error("錢包載入失敗", e);
    if (listEl)
      listEl.innerHTML = `<p style="text-align:center;color:red;padding:20px;">載入失敗，請檢查連線</p>`;
  } finally {
    if (loadingEl) loadingEl.style.display = "none";
  }
};

/**
 * [UI 優化] 交易列表卡片式渲染
 */
function renderTransactionCards(txs) {
  const listEl = document.getElementById("transaction-list");
  if (!listEl) return;

  if (txs.length === 0) {
    listEl.innerHTML = `<div style="text-align:center; padding:40px; color:#94a3b8;"><i class="fas fa-ghost fa-3x"></i><p style="margin-top:10px;">尚無帳務紀錄</p></div>`;
    return;
  }

  const statusMap = {
    PENDING: { text: "審核中", class: "status-PENDING" },
    COMPLETED: { text: "成功", class: "status-COMPLETED" },
    FAILED: { text: "失敗", class: "status-CANCELLED" },
    REJECTED: { text: "已駁回", class: "status-CANCELLED" },
  };

  const typeConfig = {
    DEPOSIT: {
      label: "儲值",
      icon: "fa-arrow-down",
      color: "#28a745",
      bg: "#e6f9ec",
    },
    PAYMENT: {
      label: "支付",
      icon: "fa-shopping-cart",
      color: "#d32f2f",
      bg: "#ffebee",
    },
    SHIPMENT_PAY: {
      label: "運費",
      icon: "fa-shipping-fast",
      color: "#1a73e8",
      bg: "#e3f2fd",
    },
    REFUND: { label: "退款", icon: "fa-undo", color: "#17a2b8", bg: "#e0f7fa" },
    ADJUST: { label: "調整", icon: "fa-cog", color: "#6c757d", bg: "#f8f9fa" },
  };

  listEl.innerHTML = txs
    .map((tx) => {
      const statusObj = statusMap[tx.status] || { text: tx.status, class: "" };
      const typeInfo = typeConfig[tx.type] || {
        label: tx.type,
        icon: "fa-circle",
        color: "#333",
        bg: "#f1f5f9",
      };

      const isNegative = tx.amount < 0;
      const amountSign = isNegative ? "" : "+";

      // 額外資訊 HTML
      let extraHtml = "";
      if (tx.invoiceNumber)
        extraHtml += `<div style="color:#28a745;font-size:11px;margin-top:4px;"><i class="fas fa-file-invoice"></i> 發票 ${tx.invoiceNumber}</div>`;
      if (tx.taxId)
        extraHtml += `<div style="color:#666;font-size:11px;">統編: ${tx.taxId}</div>`;

      // 憑證按鈕
      let proofHtml = "";
      if (tx.proofImage) {
        const safeUrl = getImageUrl(tx.proofImage);
        if (safeUrl) {
          proofHtml = `<a href="${safeUrl}" target="_blank" style="display:inline-block; margin-top:6px; font-size:11px; color:#1a73e8; text-decoration:none;"><i class="fas fa-image"></i> 查看憑證</a>`;
        }
      }

      return `
      <div class="tx-card animate-pop-in">
        <div class="tx-left">
          <div class="tx-icon" style="background: ${typeInfo.bg}; color: ${
        typeInfo.color
      };">
            <i class="fas ${typeInfo.icon}"></i>
          </div>
          <div class="tx-info">
            <h5>${tx.description || typeInfo.label}</h5>
            <small>${new Date(tx.createdAt).toLocaleString()}</small>
            ${extraHtml}
            ${proofHtml}
          </div>
        </div>
        <div class="tx-right">
          <div class="tx-amount ${isNegative ? "minus" : "plus"}">
            ${amountSign}${tx.amount.toLocaleString()}
          </div>
          <div class="status-badge ${statusObj.class}" style="font-size:10px;">
            ${statusObj.text}
          </div>
        </div>
      </div>
    `;
    })
    .join("");
}

/**
 * [NEW] 交易過濾邏輯
 */
window.filterTransactions = function (type, btn) {
  document
    .querySelectorAll(".filter-chip")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");

  if (type === "ALL") {
    renderTransactionCards(window.rawTransactions);
  } else {
    const filtered = window.rawTransactions.filter((t) => t.type === type);
    renderTransactionCards(filtered);
  }
};

// 3. 儲值 Modal 開啟與初始化
window.openDepositModal = function () {
  const modal = document.getElementById("deposit-modal");
  const form = document.getElementById("deposit-form");
  const bankInfoEl = document.getElementById("deposit-bank-info");

  if (bankInfoEl && window.BANK_INFO_CACHE) {
    bankInfoEl.innerHTML = `
      <div style="background:#f1f5f9; padding:15px; border-radius:12px; margin-bottom:15px; font-size:14px; border-left:4px solid #1a73e8;">
        <p style="margin:0 0 8px 0;"><strong>匯款帳戶資訊：</strong></p>
        <div style="margin-bottom:2px;">銀行：${window.BANK_INFO_CACHE.bankName}</div>
        <div style="margin-bottom:2px;">帳號：<span style="color:#d32f2f; font-weight:bold; font-family:monospace;">${window.BANK_INFO_CACHE.account}</span></div>
        <div>戶名：${window.BANK_INFO_CACHE.holder}</div>
      </div>
    `;
  }

  // 動態插入發票欄位邏輯 (若無則建)
  if (form && !document.getElementById("dep-taxId")) {
    const amountGroup = form.querySelector(".form-group");
    if (amountGroup) {
      const taxDiv = document.createElement("div");
      taxDiv.className = "form-group";
      taxDiv.style.background = "#f0f7ff";
      taxDiv.style.padding = "12px";
      taxDiv.style.borderRadius = "12px";
      taxDiv.style.border = "1px solid #cce5ff";
      taxDiv.style.marginTop = "15px";
      taxDiv.innerHTML = `
        <label style="color:#0056b3; font-weight:bold; font-size:13px;"><i class="fas fa-file-invoice"></i> 發票資訊 (B2B 請填寫)</label>
        <div style="display: flex; gap: 10px; margin-top:8px;">
          <input type="text" id="dep-taxId" class="form-control" placeholder="統一編號 (8碼)" style="font-size:13px;">
          <input type="text" id="dep-invoiceTitle" class="form-control" placeholder="公司抬頭" style="font-size:13px;">
        </div>
      `;
      amountGroup.insertAdjacentElement("afterend", taxDiv);
    }
  }

  if (form) form.reset();

  // --- 新增：開啟時重置預覽 UI 狀態 ---
  const previewWrapper = document.getElementById("dep-preview-wrapper");
  const uploadZone = document.querySelector(".deposit-upload-zone");
  if (previewWrapper) previewWrapper.style.display = "none";
  if (uploadZone) uploadZone.style.display = "flex";

  // 自動帶入個人預設值
  if (window.currentUser) {
    const tInput = document.getElementById("dep-taxId");
    const titleInput = document.getElementById("dep-invoiceTitle");
    if (tInput) tInput.value = window.currentUser.defaultTaxId || "";
    if (titleInput)
      titleInput.value = window.currentUser.defaultInvoiceTitle || "";
  }

  if (modal) modal.style.display = "flex";
};

// 4. 處理儲值提交 (含統編驗證)
async function handleDepositSubmit(e) {
  e.preventDefault();
  const btn = e.target.querySelector("button[type='submit']");
  const amount = document.getElementById("dep-amount").value;
  const desc = document.getElementById("dep-note").value;
  const file = document.getElementById("dep-proof").files[0];
  const taxId = document.getElementById("dep-taxId")?.value.trim() || "";
  const invoiceTitle =
    document.getElementById("dep-invoiceTitle")?.value.trim() || "";

  if (taxId && !invoiceTitle) {
    alert("填寫統一編號時，「公司抬頭」為必填項目。");
    document.getElementById("dep-invoiceTitle").focus();
    return;
  }

  btn.disabled = true;
  btn.textContent = "提交中...";

  const fd = new FormData();
  fd.append("amount", amount);
  fd.append("description", desc);
  if (taxId) fd.append("taxId", taxId);
  if (invoiceTitle) fd.append("invoiceTitle", invoiceTitle);
  if (file) fd.append("proof", file);

  try {
    const res = await fetch(`${API_BASE_URL}/api/wallet/deposit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
      body: fd,
    });
    if (res.ok) {
      alert("儲值申請已提交！請等待審核。\n發票將依提供的統編開立。");
      document.getElementById("deposit-modal").style.display = "none";
      window.loadWalletData();
    } else {
      const data = await res.json();
      alert(data.message || "提交失敗");
    }
  } catch (e) {
    alert("網路錯誤");
  } finally {
    btn.disabled = false;
    btn.textContent = "提交申請";
  }
}

// --- 初始化監聽 ---
document.addEventListener("DOMContentLoaded", () => {
  const tabWallet = document.getElementById("tab-wallet");
  if (tabWallet) {
    tabWallet.addEventListener("click", () => {
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelectorAll(".tab-content")
        .forEach((c) => (c.style.display = "none"));
      tabWallet.classList.add("active");
      const sec = document.getElementById("wallet-section");
      if (sec) sec.style.display = "block";
      window.loadWalletData();
    });
  }

  const btnDep = document.getElementById("btn-deposit");
  if (btnDep) btnDep.addEventListener("click", () => window.openDepositModal());

  const formDep = document.getElementById("deposit-form");
  if (formDep) formDep.addEventListener("submit", handleDepositSubmit);

  // --- 新增：處理憑證圖片即時預覽邏輯 ---
  const inputProof = document.getElementById("dep-proof");
  if (inputProof) {
    inputProof.addEventListener("change", function (e) {
      const file = e.target.files[0];
      const previewWrapper = document.getElementById("dep-preview-wrapper");
      const previewImg = document.getElementById("dep-preview-img");
      const uploadZone = document.querySelector(".deposit-upload-zone");

      if (file && file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = function (event) {
          if (previewImg) previewImg.src = event.target.result;
          if (previewWrapper) previewWrapper.style.display = "block";
          if (uploadZone) uploadZone.style.display = "none"; // 隱藏虛線框，顯示預覽圖
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // --- 新增：處理預覽區域的「重新上傳」按鈕 ---
  const btnResetProof = document.getElementById("btn-reset-proof");
  if (btnResetProof) {
    btnResetProof.addEventListener("click", () => {
      const input = document.getElementById("dep-proof");
      const wrapper = document.getElementById("dep-preview-wrapper");
      const zone = document.querySelector(".deposit-upload-zone");
      if (input) input.value = ""; // 清空 input 檔案
      if (wrapper) wrapper.style.display = "none";
      if (zone) zone.style.display = "flex";
    });
  }
});

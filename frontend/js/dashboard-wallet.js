/**
 * dashboard-wallet.js
 * V32.0_Final_Pro - 旗艦優化完整版
 * [優化]：常駐銀行轉帳資訊、發票開立備註提醒、憑證預覽增強
 */

window.rawTransactions = []; // 快取數據供過濾使用

// --- 0. 輔助函式：處理圖片路徑 (修復 Cloudinary 與本地路徑) ---
function getImageUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) {
    // 修復可能的 https:/ 單斜線損毀問題
    return path.replace(/^https?:\/+(?!\/)/, "https://");
  }
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
}

/**
 * [新功能] 渲染常駐銀行轉帳資訊卡片
 * 對應需求：「帳務」增加轉帳資訊
 */
window.renderBankInfoInWallet = function () {
  const infoContainer = document.getElementById("wallet-bank-info-static");
  if (!infoContainer) return;

  if (window.BANK_INFO_CACHE) {
    const b = window.BANK_INFO_CACHE;
    infoContainer.innerHTML = `
            <div class="bank-info-card animate-pop-in" style="background: linear-gradient(135deg, #1a73e8 0%, #0d47a1 100%); color: white; padding: 20px; border-radius: 16px; margin-bottom: 25px; box-shadow: 0 4px 15px rgba(26,115,232,0.2);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
                    <h4 style="margin: 0; font-size: 18px;"><i class="fas fa-university"></i> 官方匯款帳戶</h4>
                    <span style="font-size: 11px; background: rgba(255,255,255,0.2); padding: 4px 8px; border-radius: 20px;">儲值專用</span>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div>
                        <small style="opacity: 0.8; font-size: 11px; display: block; margin-bottom: 4px;">銀行名稱</small>
                        <div style="font-weight: 600;">${b.bankName}</div>
                    </div>
                    <div>
                        <small style="opacity: 0.8; font-size: 11px; display: block; margin-bottom: 4px;">分行</small>
                        <div style="font-weight: 600;">${
                          b.branch || "南京東路分行"
                        }</div>
                    </div>
                    <div style="grid-column: span 2;">
                        <small style="opacity: 0.8; font-size: 11px; display: block; margin-bottom: 4px;">匯款帳號</small>
                        <div style="font-size: 20px; font-weight: bold; letter-spacing: 1px; font-family: 'Monaco', monospace;">${
                          b.account
                        }</div>
                    </div>
                    <div style="grid-column: span 2;">
                        <small style="opacity: 0.8; font-size: 11px; display: block; margin-bottom: 4px;">帳戶戶名</small>
                        <div style="font-weight: 600;">${b.holder}</div>
                    </div>
                </div>
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.2); font-size: 11px;">
                    <i class="fas fa-info-circle"></i> 備註：默認開立電子發票至帳號設定中填寫的電子信箱
                </div>
            </div>
        `;
  }
};

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
        headerEl.style.color = balance < 0 ? "#ff4d4f" : "#ffffff";
      }

      const tabBalanceEl = document.getElementById("wallet-balance");
      if (tabBalanceEl) {
        tabBalanceEl.textContent = balance.toLocaleString();
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

  // 渲染常駐銀行資訊
  window.renderBankInfoInWallet();

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
 * 交易列表卡片式渲染
 */
function renderTransactionCards(txs) {
  const listEl = document.getElementById("transaction-list");
  if (!listEl) return;

  if (txs.length === 0) {
    listEl.innerHTML = `<div style="text-align:center; padding:40px; color:#94a3b8;"><i class="fas fa-receipt fa-3x"></i><p style="margin-top:10px;">尚未有帳務往來紀錄</p></div>`;
    return;
  }

  const statusMap = {
    PENDING: { text: "待審核", class: "status-PENDING" },
    COMPLETED: { text: "交易成功", class: "status-COMPLETED" },
    FAILED: { text: "交易失敗", class: "status-CANCELLED" },
    REJECTED: { text: "已駁回", class: "status-CANCELLED" },
  };

  const typeConfig = {
    DEPOSIT: {
      label: "儲值",
      icon: "fa-plus-circle",
      color: "#28a745",
      bg: "#e6f9ec",
    },
    PAYMENT: {
      label: "支出",
      icon: "fa-shopping-cart",
      color: "#d32f2f",
      bg: "#ffebee",
    },
    SHIPMENT_PAY: {
      label: "運費支付",
      icon: "fa-shipping-fast",
      color: "#1a73e8",
      bg: "#e3f2fd",
    },
    REFUND: { label: "退款", icon: "fa-undo", color: "#17a2b8", bg: "#e0f7fa" },
    ADJUST: {
      label: "系統調整",
      icon: "fa-tools",
      color: "#6c757d",
      bg: "#f8f9fa",
    },
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

      let extraHtml = "";
      if (tx.invoiceNumber)
        extraHtml += `<div style="color:#28a745;font-size:11px;margin-top:4px;"><i class="fas fa-file-invoice"></i> 發票號碼: ${tx.invoiceNumber}</div>`;
      if (tx.taxId)
        extraHtml += `<div style="color:#666;font-size:11px;">統一編號: ${tx.taxId}</div>`;

      let proofHtml = "";
      if (tx.proofImage) {
        const safeUrl = getImageUrl(tx.proofImage);
        if (safeUrl) {
          proofHtml = `<a href="${safeUrl}" target="_blank" style="display:inline-block; margin-top:8px; font-size:12px; color:#1a73e8; text-decoration:none;"><i class="fas fa-image"></i> 點選查看憑證</a>`;
        }
      }

      return `
      <div class="tx-card animate-pop-in" style="background:white; border-radius:12px; padding:15px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; border:1px solid #edf2f7; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="width:40px; height:40px; border-radius:10px; background:${
            typeInfo.bg
          }; color:${
        typeInfo.color
      }; display:flex; align-items:center; justify-content:center;">
            <i class="fas ${typeInfo.icon}"></i>
          </div>
          <div>
            <h5 style="margin:0; font-size:14px; color:#2d3748;">${
              tx.description || typeInfo.label
            }</h5>
            <small style="color:#a0aec0; font-size:11px;">${new Date(
              tx.createdAt
            ).toLocaleString()}</small>
            ${extraHtml}
            ${proofHtml}
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:16px; font-weight:bold; color:${
            isNegative ? "#e53e3e" : "#38a169"
          };">
            ${amountSign}${tx.amount.toLocaleString()}
          </div>
          <div class="status-badge ${
            statusObj.class
          }" style="font-size:10px; padding:2px 8px; border-radius:4px; display:inline-block; margin-top:4px;">
            ${statusObj.text}
          </div>
        </div>
      </div>
    `;
    })
    .join("");
}

/**
 * 交易過濾邏輯
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
        <p style="margin:0 0 8px 0; color:#1a73e8; font-weight:bold;"><i class="fas fa-info-circle"></i> 匯款前請確認資訊：</p>
        <div style="margin-bottom:2px;">銀行：${window.BANK_INFO_CACHE.bankName}</div>
        <div style="margin-bottom:2px;">帳號：<span style="color:#d32f2f; font-weight:bold; font-family:monospace;">${window.BANK_INFO_CACHE.account}</span></div>
        <div style="margin-bottom:8px;">戶名：${window.BANK_INFO_CACHE.holder}</div>
        <div style="font-size:11px; color:#666; background:#fff; padding:6px; border-radius:6px; border:1px dashed #ccc;">
            備註：默認開立電子發票至帳號設定中填寫的電子信箱
        </div>
      </div>
    `;
  }

  // 動態插入發票欄位
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
        <label style="color:#0056b3; font-weight:bold; font-size:13px;"><i class="fas fa-file-invoice"></i> 發票資訊 (若需統編請填寫)</label>
        <div style="display: flex; gap: 10px; margin-top:8px;">
          <input type="text" id="dep-taxId" class="form-control" placeholder="統一編號" style="font-size:13px;">
          <input type="text" id="dep-invoiceTitle" class="form-control" placeholder="公司抬頭" style="font-size:13px;">
        </div>
      `;
      amountGroup.insertAdjacentElement("afterend", taxDiv);
    }
  }

  if (form) form.reset();

  const previewWrapper = document.getElementById("dep-preview-wrapper");
  const uploadZone = document.querySelector(".deposit-upload-zone");
  if (previewWrapper) previewWrapper.style.display = "none";
  if (uploadZone) uploadZone.style.display = "flex";

  // 自動帶入預設值
  if (window.currentUser) {
    const tInput = document.getElementById("dep-taxId");
    const titleInput = document.getElementById("dep-invoiceTitle");
    if (tInput) tInput.value = window.currentUser.defaultTaxId || "";
    if (titleInput)
      titleInput.value = window.currentUser.defaultInvoiceTitle || "";
  }

  if (modal) modal.style.display = "flex";
};

// 4. 處理儲值提交
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
    alert("⚠️ 提醒：填寫統一編號時，「公司抬頭」為必填項目。");
    document.getElementById("dep-invoiceTitle").focus();
    return;
  }

  if (!file) {
    alert("⚠️ 請上傳匯款憑證截圖。");
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 提交中...';

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
      window.showMessage("儲值申請成功，發票將預設開立至您的信箱", "success");
      document.getElementById("deposit-modal").style.display = "none";
      window.loadWalletData();
    } else {
      const data = await res.json();
      alert(data.message || "提交失敗");
    }
  } catch (e) {
    alert("連線失敗，請稍後再試");
  } finally {
    btn.disabled = false;
    btn.textContent = "提交儲值申請";
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

  // 憑證圖片即時預覽
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
          if (uploadZone) uploadZone.style.display = "none";
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // 重置預覽
  const btnResetProof = document.getElementById("btn-reset-proof");
  if (btnResetProof) {
    btnResetProof.addEventListener("click", () => {
      const input = document.getElementById("dep-proof");
      const wrapper = document.getElementById("dep-preview-wrapper");
      const zone = document.querySelector(".deposit-upload-zone");
      if (input) input.value = "";
      if (wrapper) wrapper.style.display = "none";
      if (zone) zone.style.display = "flex";
    });
  }
});

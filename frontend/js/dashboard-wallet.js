// frontend/js/dashboard-wallet.js
// V2025.V16.1 - 旗艦極限穩定版：整合 B2B 邏輯、餘額同步與免查 Token 優化

/**
 * [大師工具]：統一圖片網址解析器，確保 Cloudinary 與本地圖片不破圖
 */
function resolveImgUrl(url) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  const cleanPath = url.startsWith("/") ? url : `/${url}`;
  return `${API_BASE_URL}${cleanPath}`;
}

/**
 * 1. 載入錢包資料 (核心：一次請求，同步更新全域餘額)
 */
window.loadWalletData = async function () {
  const listEl = document.getElementById("transaction-list");
  const loadingEl = document.getElementById("wallet-loading");
  const token = localStorage.getItem("token"); // [修正] 從口袋拿鑰匙最穩

  if (!token) return console.warn("未偵測到登入狀態");
  if (loadingEl) loadingEl.style.display = "block";

  try {
    // [效能優化]：一次 fetch 同步獲取所有帳務資訊
    const res = await fetch(`${API_BASE_URL}/api/wallet/my`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    if (data.success && data.wallet) {
      const { balance, transactions } = data.wallet;
      const formattedBalance = `$${balance.toLocaleString()}`;
      const balanceColor = balance < 0 ? "#d32f2f" : "#28a745";

      // 更新畫面上所有顯示餘額的地方 (Header 與 中央卡片)
      ["header-wallet-balance", "wallet-balance"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          el.textContent = formattedBalance;
          el.style.color = balanceColor;
        }
      });

      // 渲染交易紀錄
      renderTransactions(transactions || []);
    }
  } catch (e) {
    console.error("錢包資料同步失敗", e);
  } finally {
    if (loadingEl) loadingEl.style.display = "none";
  }
};

/**
 * 交易列表渲染 (視覺增強版)
 */
function renderTransactions(txs) {
  const listEl = document.getElementById("transaction-list");
  if (!listEl) return;

  if (!txs || txs.length === 0) {
    listEl.innerHTML = `<tr><td colspan="5" class="text-center" style="padding:20px; color:#999;">尚無交易紀錄</td></tr>`;
    return;
  }

  const typeConfig = {
    DEPOSIT: { label: "儲值", icon: "fa-arrow-up", color: "#28a745" },
    PAYMENT: { label: "支付", icon: "fa-shopping-cart", color: "#d32f2f" },
    REFUND: { label: "退款", icon: "fa-undo", color: "#17a2b8" },
    ADJUST: { label: "調整", icon: "fa-cog", color: "#6c757d" },
  };

  const statusMap = {
    PENDING: { text: "審核中", class: "status-PENDING" },
    COMPLETED: { text: "成功", class: "status-COMPLETED" },
    FAILED: { text: "失敗", class: "status-CANCELLED" },
    REJECTED: { text: "已駁回", class: "status-CANCELLED" },
  };

  listEl.innerHTML = txs
    .map((tx) => {
      const typeInfo = typeConfig[tx.type] || {
        label: tx.type,
        icon: "fa-circle",
        color: "#333",
      };
      const statusObj = statusMap[tx.status] || { text: tx.status, class: "" };
      const isNegative = tx.amount < 0;

      return `
            <tr style="border-left: 3px solid ${typeInfo.color};">
                <td>
                    ${new Date(tx.createdAt).toLocaleDateString()}
                    <br><small style="color:#999;">${new Date(
                      tx.createdAt
                    ).toLocaleTimeString()}</small>
                </td>
                <td>
                    <span style="color:${typeInfo.color}; font-weight:bold;">
                        <i class="fas ${typeInfo.icon}"></i> ${typeInfo.label}
                    </span>
                </td>
                <td>
                    ${tx.description || "-"}
                    ${
                      tx.taxId
                        ? `<div style="font-size:11px; color:#666;">統編: ${tx.taxId}</div>`
                        : ""
                    }
                    ${
                      tx.invoiceNumber
                        ? `<div style="font-size:11px; color:#28a745;"><i class="fas fa-file-invoice"></i> 發票已開</div>`
                        : ""
                    }
                    ${
                      tx.proofImage
                        ? `<div style="margin-top:4px;"><a href="${resolveImgUrl(
                            tx.proofImage
                          )}" target="_blank" class="btn-link" style="font-size:11px;"><i class="fas fa-image"></i> 查看憑證</a></div>`
                        : ""
                    }
                </td>
                <td style="text-align:right; font-weight:bold; font-family:monospace; color:${
                  isNegative ? "#d32f2f" : "#28a745"
                };">
                    ${isNegative ? "" : "+"}${tx.amount.toLocaleString()}
                </td>
                <td style="text-align:center;"><span class="status-badge ${
                  statusObj.class
                }">${statusObj.text}</span></td>
            </tr>
        `;
    })
    .join("");
}

/**
 * 2. 儲值 Modal (保留原始碼中動態插入統編與銀行資訊的所有邏輯)
 */
window.openDepositModal = function () {
  const modal = document.getElementById("deposit-modal");
  const form = document.getElementById("deposit-form");
  if (!modal) return;

  // 顯示管理員設定的銀行資訊
  const bankInfoEl = document.getElementById("deposit-bank-info");
  if (bankInfoEl && window.BANK_INFO_CACHE) {
    bankInfoEl.innerHTML = `
            <div style="background:#f8f9fa; padding:15px; border-radius:8px; margin-bottom:15px; font-size:14px; border:1px solid #eee;">
                <p style="margin:0 0 5px 0;"><strong>請匯款至：</strong></p>
                <div>銀行：${window.BANK_INFO_CACHE.bankName}</div>
                <div>帳號：<span style="color:#d32f2f; font-weight:bold; font-family:monospace;">${window.BANK_INFO_CACHE.account}</span></div>
                <div>戶名：${window.BANK_INFO_CACHE.holder}</div>
            </div>
        `;
  }

  // [保留動態 HTML 邏輯]：確保統編欄位存在
  if (!document.getElementById("dep-taxId") && form) {
    const amountGroup = form.querySelector(".form-group");
    if (amountGroup) {
      const taxDiv = document.createElement("div");
      taxDiv.className = "form-group";
      taxDiv.style.cssText =
        "background:#f0f7ff; padding:10px; border-radius:5px; border:1px solid #cce5ff;";
      taxDiv.innerHTML = `
                <label style="color:#0056b3; font-weight:bold; font-size:13px;">發票資訊 (B2B 報帳用)</label>
                <div style="display: flex; gap: 10px; margin-top:5px;">
                    <input type="text" id="dep-taxId" name="taxId" class="form-control" placeholder="統一編號" style="font-size:13px;">
                    <input type="text" id="dep-invoiceTitle" name="invoiceTitle" class="form-control" placeholder="公司抬頭" style="font-size:13px;">
                </div>
            `;
      amountGroup.insertAdjacentElement("afterend", taxDiv);
    }
  }

  if (form) form.reset();

  // [自動回填]：從 localStorage 讀取個人預設資料
  const userData = JSON.parse(localStorage.getItem("userData") || "{}");
  if (document.getElementById("dep-taxId") && userData.defaultTaxId) {
    document.getElementById("dep-taxId").value = userData.defaultTaxId;
  }
  if (
    document.getElementById("dep-invoiceTitle") &&
    userData.defaultInvoiceTitle
  ) {
    document.getElementById("dep-invoiceTitle").value =
      userData.defaultInvoiceTitle;
  }

  modal.style.display = "flex";
};

/**
 * 3. 處理儲值提交 (效能鎖定與驗證)
 */
async function handleDepositSubmit(e) {
  e.preventDefault();
  const btn = e.target.querySelector("button[type='submit']");
  const token = localStorage.getItem("token");

  const taxId = document.getElementById("dep-taxId")?.value.trim();
  const invoiceTitle = document
    .getElementById("dep-invoiceTitle")
    ?.value.trim();

  if (taxId && !invoiceTitle) {
    alert("填寫統一編號時，「公司抬頭」為必填項目。");
    document.getElementById("dep-invoiceTitle").focus();
    return;
  }

  btn.disabled = true;
  btn.textContent = "傳送中...";

  const fd = new FormData(e.target);

  try {
    const res = await fetch(`${API_BASE_URL}/api/wallet/deposit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const data = await res.json();

    if (res.ok) {
      alert("申請成功！財務審核通過後會自動入帳並通知您。");
      document.getElementById("deposit-modal").style.display = "none";
      window.loadWalletData();
    } else {
      alert(data.message || "提交失敗");
    }
  } catch (e) {
    alert("網路通訊異常，請稍後再試");
  } finally {
    btn.disabled = false;
    btn.textContent = "提交申請";
  }
}

// --- 初始化事件綁定 ---
document.addEventListener("DOMContentLoaded", () => {
  // 監聽儲值按鈕
  const btnDeposit = document.getElementById("btn-deposit");
  if (btnDeposit)
    btnDeposit.addEventListener("click", () => window.openDepositModal());

  // 監聽儲值表單
  const form = document.getElementById("deposit-form");
  if (form) form.addEventListener("submit", handleDepositSubmit);

  // [自動觸發]：若在錢包分頁，自動加載資料
  if (document.getElementById("transaction-list")) {
    window.loadWalletData();
  }
});

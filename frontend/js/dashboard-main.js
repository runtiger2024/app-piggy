// frontend/js/dashboard-main.js
// V2026.1.14 - 旗艦終極穩定版：100% 還原核心邏輯、整合發票欄位、修復全域控制項、安全檢查與分頁自動滾動

document.addEventListener("DOMContentLoaded", () => {
  if (!window.dashboardToken) {
    window.location.href = "login.html";
    return;
  }

  // 1. 初始載入核心數據
  if (typeof window.loadSystemSettings === "function")
    window.loadSystemSettings(); // 載入匯率、銀行等
  if (typeof window.loadUserProfile === "function") window.loadUserProfile(); // 載入個資
  if (typeof window.loadMyPackages === "function") window.loadMyPackages(); // 載入包裹
  if (typeof window.loadMyShipments === "function") window.loadMyShipments(); // 載入訂單

  if (typeof window.updateGlobalWalletDisplay === "function") {
    window.updateGlobalWalletDisplay();
  }

  // 2. Tab 切換邏輯
  setupTabs();

  // 3. 表單提交事件綁定
  bindForms();

  // 4. 初始化圖片上傳器
  initUploaders();

  // 5. 其他全域按鈕綁定 (含錢包捷徑)
  bindGlobalButtons();

  // 6. 延遲執行草稿檢查
  setTimeout(() => {
    if (window.checkForecastDraftQueue) {
      window.checkForecastDraftQueue(false);
    }
  }, 500);

  // [事件委派] 全域監聽上傳憑證表單提交
  // 解決 Modal 動態載入導致 addEventListener 失效的問題
  document.body.addEventListener("submit", function (e) {
    if (e.target && e.target.id === "upload-proof-form") {
      console.log("偵測到上傳憑證表單提交，觸發處理函式...");
      window.handleUploadProofSubmit(e);
    }
  });
});

/**
 * --- 全域 Modal 控制函式 (修復 ReferenceError) ---
 * 確保 HTML 中的 onclick="closeProfileModal()" 能被觸發
 */
window.closeProfileModal = function () {
  const modal =
    document.getElementById("profile-edit-modal") ||
    document.getElementById("edit-profile-modal");
  if (modal) modal.style.display = "none";
};

window.openChangePasswordModal = function () {
  // 為了流暢度，開啟密碼彈窗時先嘗試關閉個資彈窗
  window.closeProfileModal();
  const modal = document.getElementById("change-password-modal");
  if (modal) {
    const form = document.getElementById("change-password-form");
    if (form) form.reset();
    modal.style.display = "flex";
  } else {
    console.warn("找不到 change-password-modal 組件");
  }
};

window.closeChangePasswordModal = function () {
  const modal = document.getElementById("change-password-modal");
  if (modal) modal.style.display = "none";
};

// --- Tab 管理 (整合自動滾動功能) ---
function setupTabs() {
  const tabs = [
    { id: "tab-packages", section: "packages-section" },
    { id: "tab-shipments", section: "shipments-section" },
    {
      id: "tab-recipients",
      section: "recipient-section",
      loadFn: window.loadRecipients,
    },
    {
      id: "tab-wallet",
      section: "wallet-section",
      loadFn: window.loadWalletData,
    },
    {
      id: "tab-unclaimed",
      section: "unclaimed-section",
      loadFn: window.loadUnclaimedList,
    },
  ];

  tabs.forEach((tab) => {
    const btn = document.getElementById(tab.id);
    if (!btn) return;

    btn.addEventListener("click", () => {
      // 1. 切換按鈕與內容顯示
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelectorAll(".tab-content")
        .forEach((c) => (c.style.display = "none"));

      btn.classList.add("active");
      const section = document.getElementById(tab.section);
      if (section) section.style.display = "block";

      // 2. [新增實裝] 自動滾動至選單容器位置
      // 使用平滑滾動對齊 dashboard-tabs-wrapper，並考慮 Header 遮擋
      const wrapper = document.querySelector(".dashboard-tabs-wrapper");
      if (wrapper) {
        const headerOffset = 80; // 配合 sticky top 高度
        const elementPosition =
          wrapper.getBoundingClientRect().top + window.pageYOffset;
        const offsetPosition = elementPosition - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: "smooth",
        });
      }

      // 3. 切換時執行對應的載入函式 (如: 重新整理列表)
      if (tab.loadFn && typeof tab.loadFn === "function") {
        tab.loadFn();
      }
    });
  });
}

// --- 表單綁定 ---
function bindForms() {
  const forecastForm = document.getElementById("forecast-form");
  if (forecastForm) {
    forecastForm.addEventListener("submit", window.handleForecastSubmit);
    forecastForm.addEventListener("reset", () => {
      const input = document.getElementById("images");
      if (input && input.resetUploader)
        setTimeout(() => input.resetUploader(), 0);
      const warningEl = document.getElementById("forecast-warning-box");
      if (warningEl) warningEl.style.display = "none";
    });
  }

  const editPkgForm = document.getElementById("edit-package-form");
  if (editPkgForm)
    editPkgForm.addEventListener("submit", window.handleEditPackageSubmit);

  const createShipForm = document.getElementById("create-shipment-form");
  if (createShipForm)
    createShipForm.addEventListener(
      "submit",
      window.handleCreateShipmentSubmit
    );

  // 個人資料更新表單 (支持新舊 ID 兼容，並整合發票欄位)
  const profileForm =
    document.getElementById("profile-edit-form") ||
    document.getElementById("edit-profile-form");
  if (profileForm) {
    profileForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = {
        name: document.getElementById("edit-name")?.value || "",
        phone: document.getElementById("edit-phone")?.value || "",
        defaultAddress: document.getElementById("edit-address")?.value || "",
        defaultTaxId: document.getElementById("edit-taxId")?.value || "",
        defaultInvoiceTitle:
          document.getElementById("edit-invoiceTitle")?.value || "",
      };
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${window.dashboardToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        });

        if (res.ok) {
          window.closeProfileModal();
          window.loadUserProfile();
          if (window.showMessage)
            window.showMessage("個人資料與發票設定已更新", "success");
        }
      } catch (err) {
        alert("更新失敗");
      }
    });
  }

  const pwdForm = document.getElementById("change-password-form");
  if (pwdForm) {
    pwdForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const currentPassword = document.getElementById("cp-current").value;
      const newPassword = document.getElementById("cp-new").value;
      const confirmPassword = document.getElementById("cp-confirm").value;

      if (newPassword !== confirmPassword) {
        alert("兩次輸入的新密碼不一致");
        return;
      }

      const btn = pwdForm.querySelector("button[type='submit']");
      if (btn) {
        btn.disabled = true;
        btn.textContent = "更新中...";
      }

      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/password`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${window.dashboardToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ currentPassword, newPassword }),
        });
        const data = await res.json();
        if (res.ok) {
          alert(data.message);
          window.closeChangePasswordModal();
          pwdForm.reset();
        } else {
          alert(data.message || "修改失敗");
        }
      } catch (err) {
        alert("網路錯誤");
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "確認修改";
        }
      }
    });
  }
}

function initUploaders() {
  if (window.initImageUploader) {
    window.initImageUploader("images", "forecast-uploader", 5);
    window.initImageUploader(
      "ship-product-images",
      "ship-shipment-uploader",
      20
    );
    window.initImageUploader(
      "edit-package-new-images",
      "edit-package-uploader",
      5
    );
  }
}

function bindGlobalButtons() {
  const btnEditProfile = document.getElementById("btn-edit-profile");
  if (btnEditProfile) {
    btnEditProfile.addEventListener("click", () => {
      if (window.currentUser) {
        const nameInput = document.getElementById("edit-name");
        const phoneInput = document.getElementById("edit-phone");
        const addrInput = document.getElementById("edit-address");
        const taxInput = document.getElementById("edit-taxId");
        const titleInput = document.getElementById("edit-invoiceTitle");

        if (nameInput) nameInput.value = window.currentUser.name || "";
        if (phoneInput) phoneInput.value = window.currentUser.phone || "";
        if (addrInput)
          addrInput.value = window.currentUser.defaultAddress || "";
        if (taxInput) taxInput.value = window.currentUser.defaultTaxId || "";
        if (titleInput)
          titleInput.value = window.currentUser.defaultInvoiceTitle || "";

        const modal =
          document.getElementById("profile-edit-modal") ||
          document.getElementById("edit-profile-modal");
        if (modal) modal.style.display = "flex";
      }
    });
  }

  const btnChangePwd = document.getElementById("btn-change-password");
  if (btnChangePwd) {
    btnChangePwd.addEventListener("click", window.openChangePasswordModal);
  }

  // 錢包快速捷蹟點擊事件 (延續原有滾動邏輯)
  const btnQuickWallet = document.getElementById("btn-quick-wallet");
  if (btnQuickWallet) {
    btnQuickWallet.addEventListener("click", () => {
      const tabWallet = document.getElementById("tab-wallet");
      if (tabWallet) tabWallet.click();
      setTimeout(() => {
        const section = document.getElementById("wallet-section");
        if (section)
          section.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    });
  }

  const btnCreateShip = document.getElementById("btn-create-shipment");
  if (btnCreateShip && window.handleCreateShipmentClick) {
    btnCreateShip.addEventListener("click", window.handleCreateShipmentClick);
  }

  const btnCopyBank = document.getElementById("btn-copy-bank-info");
  if (btnCopyBank) {
    btnCopyBank.addEventListener("click", () => {
      const bName =
        document.getElementById("bank-name")?.innerText.trim() || "";
      const bAcc =
        document.getElementById("bank-account")?.innerText.trim() || "";
      const bHolder =
        document.getElementById("bank-holder")?.innerText.trim() || "";
      const text = `【匯款資訊】\n銀行：${bName}\n帳號：${bAcc}\n戶名：${bHolder}`;

      navigator.clipboard
        .writeText(text)
        .then(() => alert("✅ 匯款資訊已複製！"))
        .catch(() => alert("複製失敗，請手動複製"));
    });
  }

  const btnUploadNow = document.getElementById("btn-upload-now");
  if (btnUploadNow) {
    btnUploadNow.addEventListener("click", () => {
      const bModal = document.getElementById("bank-info-modal");
      if (bModal) bModal.style.display = "none";
      if (window.lastCreatedShipmentId) {
        window.openUploadProof(window.lastCreatedShipmentId);
      } else {
        if (window.loadMyShipments) window.loadMyShipments();
      }
    });
  }

  document.querySelectorAll(".modal-overlay").forEach((m) => {
    m.addEventListener("click", (e) => {
      if (e.target === m) m.style.display = "none";
    });
  });

  // 事件委派監聽關閉按鈕
  document.body.addEventListener("click", (e) => {
    if (
      e.target.classList.contains("modal-close") ||
      e.target.classList.contains("modal-close-btn")
    ) {
      const overlay = e.target.closest(".modal-overlay");
      if (overlay) overlay.style.display = "none";
    }
  });
}

/**
 * 預報草稿佇列檢查 (完整還原 V29.6 複雜邏輯)
 */
window.checkForecastDraftQueue = function (isAfterSubmit = false) {
  let queue = [];
  try {
    queue = JSON.parse(localStorage.getItem("forecast_draft_list") || "[]");
  } catch (e) {
    queue = [];
  }

  if (isAfterSubmit) {
    queue.shift();
    localStorage.setItem("forecast_draft_list", JSON.stringify(queue));
  }

  const container = document.getElementById("draft-queue-container");
  const listEl = document.getElementById("draft-queue-list");
  const warningEl = document.getElementById("forecast-warning-box");

  if (!queue || queue.length === 0) {
    if (container) container.style.display = "none";
    if (warningEl) warningEl.style.display = "none";
    return;
  }

  if (container && listEl) {
    container.style.display = "flex";
    listEl.innerHTML = "";
    queue.forEach((item, idx) => {
      const isNext = idx === 0;
      const style = isNext ? "font-weight:bold; color:#d35400;" : "";
      const icon = isNext
        ? ' <i class="fas fa-arrow-left"></i> <span class="badge badge-warning" style="font-size:10px;">準備填入</span>'
        : "";
      listEl.innerHTML += `<li style="${style}">${item.name} (x${item.quantity}) ${icon}</li>`;
    });
  }

  const current = queue[0];
  const nameInput = document.getElementById("productName");
  const qtyInput = document.getElementById("quantity");
  const noteInput = document.getElementById("note");

  if (nameInput && current) {
    const isFieldEmpty = !nameInput.value || nameInput.value.trim() === "";

    if (isAfterSubmit || isFieldEmpty || nameInput.value === current.name) {
      nameInput.value = current.name || "";
      if (qtyInput) qtyInput.value = current.quantity || 1;

      if (noteInput && (!noteInput.value || noteInput.value.includes("試算"))) {
        noteInput.value = "來自試算帶入";
      }

      let warnings = [];
      if (current.hasOversizedItem)
        warnings.push("⚠️ 此商品尺寸超長 (需加收超長費)");
      if (current.isOverweight)
        warnings.push("⚠️ 此商品單件超重 (需加收超重費)");

      if (warningEl) {
        if (warnings.length > 0) {
          warningEl.innerHTML = warnings.join("<br>");
          warningEl.style.display = "block";
          warningEl.className = "alert alert-error";
        } else {
          warningEl.style.display = "none";
        }
      }

      if (isAfterSubmit && window.showMessage) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        window.showMessage(`已自動帶入下一筆：${current.name}`, "info");
      }
    }
  }
};

/**
 * 上傳憑證相關 (完整還原 V29.6 動態注入與統編連動邏輯)
 */
window.openUploadProof = function (id) {
  const proofIdInput = document.getElementById("upload-proof-id");
  if (proofIdInput) proofIdInput.value = id;

  const modal = document.getElementById("upload-proof-modal");
  const form = document.getElementById("upload-proof-form");

  if (form) form.reset();

  const existingTaxInput = document.getElementById("proof-taxId");
  if (!existingTaxInput && form) {
    const fileGroup = form.querySelector(".form-group");
    if (fileGroup) {
      const taxDiv = document.createElement("div");
      taxDiv.className = "form-group";
      taxDiv.style.background = "#e8f0fe";
      taxDiv.style.padding = "10px";
      taxDiv.style.borderRadius = "5px";
      taxDiv.style.marginBottom = "10px";
      taxDiv.innerHTML = `
            <label style="color:#1a73e8; font-size:13px; font-weight:bold;">
                📝 發票資訊 (如需打統編請填寫)
            </label>
            <div style="display:flex; gap:10px; flex-wrap: wrap;">
                <div style="flex:1;">
                    <input type="text" id="proof-taxId" class="form-control" placeholder="統一編號 (8碼)" maxlength="8" style="font-size:13px;">
                </div>
                <div style="flex:1;">
                    <input type="text" id="proof-invoiceTitle" class="form-control" placeholder="公司抬頭" style="font-size:13px;">
                </div>
            </div>
            <small style="color:#666; font-size:11px;">※ 若填寫統編，公司抬頭為必填項目。</small>
          `;
      form.insertBefore(taxDiv, fileGroup);
    }
  }

  setTimeout(() => {
    const taxInput = document.getElementById("proof-taxId");
    const titleInput = document.getElementById("proof-invoiceTitle");

    if (taxInput && titleInput) {
      const validateTax = () => {
        if (taxInput.value.trim().length > 0) {
          titleInput.setAttribute("required", "true");
          titleInput.style.border = "1px solid #d32f2f";
          titleInput.placeholder = "公司抬頭 (必填)";
        } else {
          titleInput.removeAttribute("required");
          titleInput.style.border = "";
          titleInput.placeholder = "公司抬頭";
        }
      };
      taxInput.oninput = validateTax;
      validateTax();
    }
  }, 100);

  if (window.currentUser) {
    const tInput = document.getElementById("proof-taxId");
    const titleInput = document.getElementById("proof-invoiceTitle");
    if (tInput && window.currentUser.defaultTaxId) {
      tInput.value = window.currentUser.defaultTaxId;
    }
    if (titleInput && window.currentUser.defaultInvoiceTitle) {
      titleInput.value = window.currentUser.defaultInvoiceTitle;
    }
  }

  const infoBox = document.getElementById("upload-proof-bank-info");
  if (window.BANK_INFO_CACHE && infoBox) {
    infoBox.innerHTML = `
            <strong>請匯款至：</strong><br>
            銀行：${window.BANK_INFO_CACHE.bankName}<br>
            帳號：<span style="color:#d32f2f; font-weight:bold;">${window.BANK_INFO_CACHE.account}</span><br>
            戶名：${window.BANK_INFO_CACHE.holder}
        `;
  }

  if (modal) modal.style.display = "flex";
};

/**
 * 上傳憑證提交 (完整還原文字與檔案順序修正邏輯)
 */
window.handleUploadProofSubmit = async function (e) {
  e.preventDefault();
  const btn = e.target.querySelector("button");

  const idInput = document.getElementById("upload-proof-id");
  const fileInput = document.getElementById("proof-file");
  if (!idInput || !fileInput) return;

  const id = idInput.value;
  const file = fileInput.files[0];

  const taxId = document.getElementById("proof-taxId")
    ? document.getElementById("proof-taxId").value.trim()
    : "";
  const invoiceTitle = document.getElementById("proof-invoiceTitle")
    ? document.getElementById("proof-invoiceTitle").value.trim()
    : "";

  if (!file) return alert("請選擇圖片");

  if (taxId && !invoiceTitle) {
    alert("請注意：填寫統一編號時，「公司抬頭」為必填項目，以利發票開立。");
    document.getElementById("proof-invoiceTitle")?.focus();
    return;
  }

  btn.disabled = true;
  btn.textContent = "上傳中...";

  const fd = new FormData();
  if (taxId) fd.append("taxId", taxId);
  if (invoiceTitle) fd.append("invoiceTitle", invoiceTitle);
  fd.append("paymentProof", file);

  try {
    const res = await fetch(`${API_BASE_URL}/api/shipments/${id}/payment`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
      body: fd,
    });
    if (res.ok) {
      alert("上傳成功！\n若有更新統編，系統將依新資料開立發票。");
      const modal = document.getElementById("upload-proof-modal");
      if (modal) modal.style.display = "none";
      if (window.loadMyShipments) window.loadMyShipments();
    } else {
      const data = await res.json();
      alert(data.message || "上傳失敗");
    }
  } catch (err) {
    alert("錯誤: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "上傳";
  }
};

/**
 * 訂單詳情 (100% 還原 V29.6 龐大的費用逆推計算)
 */
window.openShipmentDetails = async function (id) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/shipments/${id}`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    const s = data.shipment;
    const CONSTANTS = window.CONSTANTS || {
      MINIMUM_CHARGE: 2000,
      OVERSIZED_FEE: 800,
      OVERWEIGHT_FEE: 800,
      OVERSIZED_LIMIT: 300,
      OVERWEIGHT_LIMIT: 100,
    };

    const idEl = document.getElementById("sd-id");
    if (idEl) idEl.textContent = s.id.slice(-8).toUpperCase();

    const timelineContainer = document.getElementById("sd-timeline");
    if (timelineContainer && typeof renderTimeline === "function") {
      renderTimeline(timelineContainer, s.status);
    }

    const trackEl = document.getElementById("sd-trackingTW");
    if (trackEl) trackEl.textContent = s.trackingNumberTW || "尚未產生";

    document.getElementById("sd-name").textContent = s.recipientName;
    document.getElementById("sd-phone").textContent = s.phone;
    document.getElementById("sd-address").textContent = s.shippingAddress;

    let dateHtml = `<div><strong>建立日期:</strong> <span>${new Date(
      s.createdAt
    ).toLocaleString()}</span></div>`;
    if (s.loadingDate) {
      dateHtml += `<div style="color:#28a745; font-weight:bold; margin-top:5px;">
            <i class="fas fa-ship"></i> 裝櫃日期: ${new Date(
              s.loadingDate
            ).toLocaleDateString()}
        </div>`;
    }
    const dateContainer = document.getElementById("sd-date");
    if (dateContainer) dateContainer.innerHTML = dateHtml;

    // 費用細分逆推
    let hasOversized = false;
    let hasOverweight = false;
    let totalBaseFee = 0;

    if (s.packages && Array.isArray(s.packages)) {
      s.packages.forEach((pkg) => {
        totalBaseFee += pkg.totalCalculatedFee || 0;
        const boxes = pkg.arrivedBoxes || [];
        boxes.forEach((box) => {
          const l = parseFloat(box.length) || 0;
          const w = parseFloat(box.width) || 0;
          const h = parseFloat(box.height) || 0;
          const weight = parseFloat(box.weight) || 0;
          if (
            l >= CONSTANTS.OVERSIZED_LIMIT ||
            w >= CONSTANTS.OVERSIZED_LIMIT ||
            h >= CONSTANTS.OVERSIZED_LIMIT
          )
            hasOversized = true;
          if (weight >= CONSTANTS.OVERWEIGHT_LIMIT) hasOverweight = true;
        });
      });
    }

    const baseFee = Math.max(totalBaseFee, CONSTANTS.MINIMUM_CHARGE);
    const minChargeGap = baseFee - totalBaseFee;

    let breakdownHtml = `<table class="fee-summary-table">
        <tr><td>基本海運費 (共 ${
          s.packages.length
        } 件)</td><td align="right">$${totalBaseFee.toLocaleString()}</td></tr>`;

    if (minChargeGap > 0) {
      breakdownHtml += `<tr style="color:#28a745;"><td><i class="fas fa-arrow-up"></i> 未達低消補足 (低消 $${
        CONSTANTS.MINIMUM_CHARGE
      })</td><td align="right">+$${minChargeGap.toLocaleString()}</td></tr>`;
    }
    if (hasOversized) {
      breakdownHtml += `<tr style="color:#e74a3b;"><td>⚠️ 超長附加費</td><td align="right">+$${CONSTANTS.OVERSIZED_FEE.toLocaleString()}</td></tr>`;
    }
    if (hasOverweight) {
      breakdownHtml += `<tr style="color:#e74a3b;"><td>⚠️ 超重附加費</td><td align="right">+$${CONSTANTS.OVERWEIGHT_FEE.toLocaleString()}</td></tr>`;
    }

    let estimatedTotal =
      baseFee +
      (hasOversized ? CONSTANTS.OVERSIZED_FEE : 0) +
      (hasOverweight ? CONSTANTS.OVERWEIGHT_FEE : 0);
    let gap = s.totalCost - estimatedTotal;
    if (gap > 0)
      breakdownHtml += `<tr><td>偏遠地區 / 其他加收</td><td align="right">+$${gap.toLocaleString()}</td></tr>`;

    breakdownHtml += `<tr><td><strong>總金額</strong></td><td align="right" style="font-size:18px; color:#d32f2f;"><strong>$${s.totalCost.toLocaleString()}</strong></td></tr></table>`;

    const breakdownEl = document.getElementById("sd-fee-breakdown");
    if (breakdownEl) {
      breakdownEl.innerHTML = breakdownHtml;
      breakdownEl.style.display = "block";
    }

    // 發票與憑證
    let invoiceContainer = document.getElementById("sd-invoice-info");
    if (!invoiceContainer) {
      invoiceContainer = document.createElement("div");
      invoiceContainer.id = "sd-invoice-info";
      document
        .getElementById("sd-address")
        ?.closest("div")
        ?.insertAdjacentElement("afterend", invoiceContainer);
    }
    invoiceContainer.innerHTML = `<div class="modal-section-title" style="margin-top:15px;"><i class="fas fa-file-invoice"></i> 發票資訊</div>
      <div style="background:#fff; border:1px solid #d9d9d9; padding:15px; border-radius:5px; display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
          <div><label style="font-size:12px; color:#666;">統編</label><input type="text" class="form-control" value="${
            s.taxId || "個人"
          }" disabled></div>
          <div><label style="font-size:12px; color:#666;">抬頭</label><input type="text" class="form-control" value="${
            s.invoiceTitle || "-"
          }" disabled></div>
      </div>`;

    const gallery = document.getElementById("sd-proof-images");
    if (gallery) {
      gallery.innerHTML = s.paymentProof
        ? s.paymentProof === "WALLET_PAY"
          ? "錢包支付"
          : `<img src="${API_BASE_URL}${s.paymentProof}" onclick="window.open(this.src)" style="max-width:120px; cursor:pointer; border:1px solid #ccc;">`
        : "尚未上傳";
    }

    const modal = document.getElementById("shipment-details-modal");
    if (modal) modal.style.display = "flex";
  } catch (e) {
    alert("詳情載入失敗");
  }
};

/**
 * 時間軸渲染 (完整還原 V29.6 映射)
 */
function renderTimeline(container, currentStatus) {
  const steps = [
    { code: "PENDING_PAYMENT", label: "待付款" },
    { code: "PROCESSING", label: "處理中" },
    { code: "SHIPPED", label: "已裝櫃" },
    { code: "CUSTOMS_CHECK", label: "海關查驗" },
    { code: "UNSTUFFING", label: "拆櫃派送" },
    { code: "COMPLETED", label: "已完成" },
  ];

  if (["CANCELLED", "RETURNED"].includes(currentStatus)) {
    container.innerHTML = `<div class="alert alert-error text-center">${
      currentStatus === "RETURNED" ? "已退回" : "已取消"
    }</div>`;
    return;
  }
  if (currentStatus === "PENDING_REVIEW") currentStatus = "PENDING_PAYMENT";

  let curIdx = steps.findIndex((s) => s.code === currentStatus);
  if (curIdx === -1) curIdx = 0;

  let html = `<div class="timeline-container" style="display:flex; justify-content:space-between; position:relative; margin:20px 0;">`;
  html += `<div style="position:absolute; top:15px; left:0; right:0; height:4px; background:#eee; z-index:0;"></div>`;
  html += `<div style="position:absolute; top:15px; left:0; width:${
    (curIdx / (steps.length - 1)) * 100
  }%; height:4px; background:#28a745; z-index:0; transition:width 0.3s;"></div>`;

  steps.forEach((step, idx) => {
    const isComp = idx <= curIdx;
    html += `<div style="position:relative; z-index:1; text-align:center; flex:1;">
                <i class="fas ${
                  isComp ? "fa-check-circle" : "fa-circle"
                }" style="color:${
      isComp ? "#28a745" : "#ccc"
    }; font-size:20px; background:#fff; border-radius:50%;"></i>
                <div style="font-size:11px; margin-top:5px; font-weight:${
                  idx === curIdx ? "bold" : "normal"
                }">${step.label}</div>
            </div>`;
  });
  container.innerHTML = html + "</div>";
}

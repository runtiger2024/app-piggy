/**
 * dashboard-main.js
 * V2026.1.14 - 旗艦終極穩定優化版
 * * 變更紀錄：
 * 1. [效能優化]：將 Tab 切換與數據載入邏輯分離，解決點擊 handler 造成的畫面卡頓（Violation）。
 * 2. [相容性]：配合 V7.2 樣式系統與密碼表單隱藏欄位邏輯。
 * 3. [修復]：修正 copyText 中的 event 參照問題，提升複製穩定度。
 */

document.addEventListener("DOMContentLoaded", () => {
  if (!window.dashboardToken) {
    window.location.href = "login.html";
    return;
  }

  // 1. 初始載入核心數據
  if (typeof window.loadSystemSettings === "function") {
    window.loadSystemSettings();
  } else {
    window.loadSystemSettings = async function () {
      try {
        const res = await fetch(`${API_BASE_URL}/api/settings/public`, {
          headers: { Authorization: `Bearer ${window.dashboardToken}` },
        });
        const data = await res.json();
        if (data.success && data.settings) {
          window.BANK_INFO_CACHE =
            data.settings.bank_info || data.settings.bank_config;
          console.log("銀行資訊載入成功:", window.BANK_INFO_CACHE);
        }
      } catch (e) {
        console.error("載入系統設定失敗", e);
      }
    };
    window.loadSystemSettings();
  }

  if (typeof window.loadUserProfile === "function") window.loadUserProfile();
  if (typeof window.loadMyPackages === "function") window.loadMyPackages();
  if (typeof window.loadMyShipments === "function") window.loadMyShipments();

  if (typeof window.updateGlobalWalletDisplay === "function") {
    window.updateGlobalWalletDisplay();
  }

  // 2. Tab 切換邏輯 (優化版)
  setupTabs();

  // 3. 表單提交事件綁定
  bindForms();

  // 4. 初始化圖片上傳器
  initUploaders();

  // 5. 其他全域按鈕綁定
  bindGlobalButtons();

  // 6. 延遲執行草稿檢查
  setTimeout(() => {
    if (window.checkForecastDraftQueue) {
      window.checkForecastDraftQueue(false);
    }
  }, 500);

  // [事件委派] 全域監聽上傳憑證表單提交
  document.body.addEventListener("submit", function (e) {
    if (e.target && e.target.id === "upload-proof-form") {
      window.handleUploadProofSubmit(e);
    }
  });
});

/**
 * --- 全域優化：一鍵複製與導向功能 ---
 */
window.copyText = function (elementId, event) {
  const el = document.getElementById(elementId);
  if (!el) {
    const fallback = document.getElementById(elementId + "-display");
    if (fallback) return window.copyText(elementId + "-display", event);
    return;
  }
  const text = el.innerText.trim();
  if (!text || text === "--") return;

  // 取得點擊的按鈕元素
  const btn = event ? event.target : null;

  navigator.clipboard
    .writeText(text)
    .then(() => {
      if (btn) {
        const originalText = btn.innerText;
        btn.innerText = "已複製!";
        btn.style.backgroundColor = "#28a745";
        btn.style.color = "#fff";
        setTimeout(() => {
          btn.innerText = originalText;
          btn.style.backgroundColor = "";
          btn.style.color = "";
        }, 2000);
      } else {
        alert("✅ 已複製到剪貼簿");
      }
    })
    .catch((err) => {
      console.warn("複製失敗:", err);
      alert("複製失敗，請手動複製");
    });
};

window.openUploadFromBankModal = function () {
  const bModal = document.getElementById("bank-info-modal");
  if (bModal) bModal.style.display = "none";
  if (window.lastCreatedShipmentId) {
    window.openUploadProof(window.lastCreatedShipmentId);
  } else {
    if (window.loadMyShipments) window.loadMyShipments();
    alert("請在下方列表點擊「上傳憑證」");
  }
};

/**
 * --- 全域 Modal 控制函式 ---
 */
window.closeProfileModal = function () {
  const modal =
    document.getElementById("profile-edit-modal") ||
    document.getElementById("edit-profile-modal");
  if (modal) modal.style.display = "none";
};

window.openChangePasswordModal = function () {
  window.closeProfileModal();
  const modal = document.getElementById("change-password-modal");
  if (modal) {
    const form = document.getElementById("change-password-form");
    if (form) form.reset();

    // 自動帶入使用者名稱到隱藏欄位，符合瀏覽器安全要求
    const hiddenUsername = document.getElementById("cp-username-hidden");
    if (hiddenUsername && window.currentUser) {
      hiddenUsername.value =
        window.currentUser.email || window.currentUser.piggyId || "";
    }

    modal.style.display = "flex";
  }
};

window.closeChangePasswordModal = function () {
  const modal = document.getElementById("change-password-modal");
  if (modal) modal.style.display = "none";
};

// --- Tab 管理 (修復點擊延遲 Violation) ---
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
      // 1. 立即更新 UI (避免點擊感官延遲)
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelectorAll(".tab-content")
        .forEach((c) => (c.style.display = "none"));

      btn.classList.add("active");
      const section = document.getElementById(tab.section);
      if (section) section.style.display = "block";

      // 2. 使用非同步處理重度負載，解決 Violation
      setTimeout(() => {
        // 自動捲動
        const wrapper = document.querySelector(".dashboard-tabs-wrapper");
        if (wrapper) {
          const headerOffset = 80;
          const elementPosition =
            wrapper.getBoundingClientRect().top + window.pageYOffset;
          window.scrollTo({
            top: elementPosition - headerOffset,
            behavior: "smooth",
          });
        }

        // 執行載入數據
        if (tab.loadFn && typeof tab.loadFn === "function") {
          tab.loadFn();
        }
      }, 10);
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
        const fields = [
          "edit-name",
          "edit-phone",
          "edit-address",
          "edit-taxId",
          "edit-invoiceTitle",
        ];
        const dataKeys = [
          "name",
          "phone",
          "defaultAddress",
          "defaultTaxId",
          "defaultInvoiceTitle",
        ];
        fields.forEach((id, idx) => {
          const input = document.getElementById(id);
          if (input) input.value = window.currentUser[dataKeys[idx]] || "";
        });
        const modal =
          document.getElementById("profile-edit-modal") ||
          document.getElementById("edit-profile-modal");
        if (modal) modal.style.display = "flex";
      }
    });
  }

  const btnChangePwd = document.getElementById("btn-change-password");
  if (btnChangePwd)
    btnChangePwd.addEventListener("click", window.openChangePasswordModal);

  const btnQuickWallet = document.getElementById("btn-quick-wallet");
  if (btnQuickWallet) {
    btnQuickWallet.addEventListener("click", () => {
      const tabWallet = document.getElementById("tab-wallet");
      if (tabWallet) tabWallet.click();
    });
  }

  const btnCreateShip = document.getElementById("btn-create-shipment");
  if (btnCreateShip && window.handleCreateShipmentClick) {
    btnCreateShip.addEventListener("click", window.handleCreateShipmentClick);
  }

  const btnCopyBank = document.getElementById("btn-copy-bank-info");
  if (btnCopyBank) {
    btnCopyBank.addEventListener("click", (e) => {
      const bName =
        (
          document.getElementById("bank-name-display") ||
          document.getElementById("bank-name")
        )?.innerText.trim() || "";
      const bAcc =
        (
          document.getElementById("bank-account-display") ||
          document.getElementById("bank-account")
        )?.innerText.trim() || "";
      const bHolder =
        (
          document.getElementById("bank-holder-display") ||
          document.getElementById("bank-holder")
        )?.innerText.trim() || "";
      const text = `【匯款資訊】\n銀行：${bName}\n帳號：${bAcc}\n戶名：${bHolder}`;
      navigator.clipboard
        .writeText(text)
        .then(() => alert("✅ 匯款資訊已複製！"));
    });
  }

  const btnUploadNow = document.getElementById("btn-upload-now");
  if (btnUploadNow)
    btnUploadNow.addEventListener("click", () =>
      window.openUploadFromBankModal()
    );

  document.querySelectorAll(".modal-overlay").forEach((m) => {
    m.addEventListener("click", (e) => {
      if (e.target === m) m.style.display = "none";
    });
  });

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
 * 預報草稿佇列檢查 (V29.6)
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
    listEl.innerHTML = queue
      .map((item, idx) => {
        const isNext = idx === 0;
        return `<li style="${
          isNext ? "font-weight:bold; color:#d35400;" : ""
        }">${item.name} (x${item.quantity}) ${
          isNext
            ? '<span class="badge badge-warning" style="font-size:10px;">準備填入</span>'
            : ""
        }</li>`;
      })
      .join("");
  }

  const current = queue[0];
  const nameInput = document.getElementById("productName");
  if (nameInput && current) {
    const isFieldEmpty = !nameInput.value || nameInput.value.trim() === "";
    if (isAfterSubmit || isFieldEmpty || nameInput.value === current.name) {
      nameInput.value = current.name || "";
      const qtyInput = document.getElementById("quantity");
      if (qtyInput) qtyInput.value = current.quantity || 1;
      const noteInput = document.getElementById("note");
      if (noteInput && (!noteInput.value || noteInput.value.includes("試算")))
        noteInput.value = "來自試算帶入";

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
 * 上傳憑證相關 (發票統編優化版)
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
      taxDiv.style.cssText =
        "background:#e8f0fe; padding:10px; border-radius:5px; margin-bottom:10px;";
      taxDiv.innerHTML = `
        <label style="color:#1a73e8; font-size:13px; font-weight:bold;">📝 發票資訊 (如需打統編請填寫)</label>
        <div style="display:flex; gap:10px; flex-wrap: wrap;">
          <div style="flex:1;"><input type="text" id="proof-taxId" class="form-control" placeholder="統一編號 (8碼)" maxlength="8" style="font-size:13px;"></div>
          <div style="flex:1;"><input type="text" id="proof-invoiceTitle" class="form-control" placeholder="公司抬頭" style="font-size:13px;"></div>
        </div>
        <small style="color:#666; font-size:11px;">※ 若填寫統編，公司抬頭為必填項目。</small>`;
      form.insertBefore(taxDiv, fileGroup);
    }
  }

  setTimeout(() => {
    const taxInput = document.getElementById("proof-taxId");
    const titleInput = document.getElementById("proof-invoiceTitle");
    if (taxInput && titleInput) {
      taxInput.oninput = () => {
        if (taxInput.value.trim().length > 0) {
          titleInput.setAttribute("required", "true");
          titleInput.style.border = "1px solid #d32f2f";
        } else {
          titleInput.removeAttribute("required");
          titleInput.style.border = "";
        }
      };
      if (window.currentUser) {
        taxInput.value = window.currentUser.defaultTaxId || "";
        titleInput.value = window.currentUser.defaultInvoiceTitle || "";
        taxInput.oninput();
      }
    }
  }, 100);

  const infoBox = document.getElementById("upload-proof-bank-info");
  if (window.BANK_INFO_CACHE && infoBox) {
    infoBox.innerHTML = `<strong>請匯款至：</strong><br>銀行：${window.BANK_INFO_CACHE.bankName}<br>帳號：<span style="color:#d32f2f; font-weight:bold;">${window.BANK_INFO_CACHE.account}</span><br>戶名：${window.BANK_INFO_CACHE.holder}`;
  }
  if (modal) modal.style.display = "flex";
};

window.handleUploadProofSubmit = async function (e) {
  e.preventDefault();
  const btn = e.target.querySelector("button");
  const id = document.getElementById("upload-proof-id")?.value;
  const file = document.getElementById("proof-file")?.files[0];
  const taxId = document.getElementById("proof-taxId")?.value.trim() || "";
  const invoiceTitle =
    document.getElementById("proof-invoiceTitle")?.value.trim() || "";

  if (!file) return alert("請選擇圖片");
  if (taxId && !invoiceTitle) {
    alert("填寫統編時，抬頭為必填項目。");
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
      alert("上傳成功！");
      document.getElementById("upload-proof-modal").style.display = "none";
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
 * 訂單詳情 (V29.6 逆推計算)
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

    document.getElementById("sd-id").textContent = s.id.slice(-8).toUpperCase();
    if (
      document.getElementById("sd-timeline") &&
      typeof renderTimeline === "function"
    )
      renderTimeline(document.getElementById("sd-timeline"), s.status);
    document.getElementById("sd-trackingTW").textContent =
      s.trackingNumberTW || "尚未產生";
    document.getElementById("sd-name").textContent = s.recipientName;
    document.getElementById("sd-phone").textContent = s.phone;
    document.getElementById("sd-address").textContent = s.shippingAddress;

    const dateContainer = document.getElementById("sd-date");
    if (dateContainer) {
      let html = `<div><strong>建立日期:</strong> <span>${new Date(
        s.createdAt
      ).toLocaleString()}</span></div>`;
      if (s.loadingDate)
        html += `<div style="color:#28a745; font-weight:bold; margin-top:5px;"><i class="fas fa-ship"></i> 裝櫃日期: ${new Date(
          s.loadingDate
        ).toLocaleDateString()}</div>`;
      dateContainer.innerHTML = html;
    }

    let hasOversized = false,
      hasOverweight = false,
      totalBaseFee = 0;
    if (s.packages) {
      s.packages.forEach((pkg) => {
        totalBaseFee += pkg.totalCalculatedFee || 0;
        (pkg.arrivedBoxes || []).forEach((box) => {
          if (
            Math.max(box.length, box.width, box.height) >=
            CONSTANTS.OVERSIZED_LIMIT
          )
            hasOversized = true;
          if (box.weight >= CONSTANTS.OVERWEIGHT_LIMIT) hasOverweight = true;
        });
      });
    }

    const baseFee = Math.max(totalBaseFee, CONSTANTS.MINIMUM_CHARGE);
    let breakdownHtml = `<table class="fee-summary-table"><tr><td>基本海運費 (${
      s.packages.length
    } 件)</td><td align="right">$${totalBaseFee.toLocaleString()}</td></tr>`;
    if (baseFee > totalBaseFee)
      breakdownHtml += `<tr style="color:#28a745;"><td>補足低消 ($${
        CONSTANTS.MINIMUM_CHARGE
      })</td><td align="right">+$${(
        baseFee - totalBaseFee
      ).toLocaleString()}</td></tr>`;
    if (hasOversized)
      breakdownHtml += `<tr style="color:#e74a3b;"><td>⚠️ 超長費</td><td align="right">+$${CONSTANTS.OVERSIZED_FEE.toLocaleString()}</td></tr>`;
    if (hasOverweight)
      breakdownHtml += `<tr style="color:#e74a3b;"><td>⚠️ 超重費</td><td align="right">+$${CONSTANTS.OVERWEIGHT_FEE.toLocaleString()}</td></tr>`;

    let currentTotal =
      baseFee +
      (hasOversized ? CONSTANTS.OVERSIZED_FEE : 0) +
      (hasOverweight ? CONSTANTS.OVERWEIGHT_FEE : 0);
    if (s.totalCost > currentTotal)
      breakdownHtml += `<tr><td>偏遠/其他加收</td><td align="right">+$${(
        s.totalCost - currentTotal
      ).toLocaleString()}</td></tr>`;
    breakdownHtml += `<tr><td><strong>總金額</strong></td><td align="right" style="font-size:18px; color:#d32f2f;"><strong>$${s.totalCost.toLocaleString()}</strong></td></tr></table>`;

    const breakdownEl = document.getElementById("sd-fee-breakdown");
    if (breakdownEl) breakdownEl.innerHTML = breakdownHtml;

    const gallery = document.getElementById("sd-proof-images");
    if (gallery)
      gallery.innerHTML = s.paymentProof
        ? s.paymentProof === "WALLET_PAY"
          ? "錢包支付"
          : `<img src="${API_BASE_URL}${s.paymentProof}" onclick="window.open(this.src)" style="max-width:120px; cursor:pointer;">`
        : "尚未上傳";

    document.getElementById("shipment-details-modal").style.display = "flex";
  } catch (e) {
    alert("詳情載入失敗");
  }
};

/**
 * 時間軸渲染
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
  let curIdx = Math.max(
    0,
    steps.findIndex((s) => s.code === currentStatus)
  );

  let html = `<div class="timeline-container" style="display:flex; justify-content:space-between; position:relative; margin:20px 0;">
    <div style="position:absolute; top:15px; left:0; right:0; height:4px; background:#eee; z-index:0;"></div>
    <div style="position:absolute; top:15px; left:0; width:${
      (curIdx / (steps.length - 1)) * 100
    }%; height:4px; background:#28a745; z-index:0; transition:width 0.3s;"></div>`;

  steps.forEach((step, idx) => {
    const isComp = idx <= curIdx;
    html += `<div style="position:relative; z-index:1; text-align:center; flex:1;">
      <i class="fas ${isComp ? "fa-check-circle" : "fa-circle"}" style="color:${
      isComp ? "#28a745" : "#ccc"
    }; font-size:20px; background:#fff;"></i>
      <div style="font-size:11px; margin-top:5px; font-weight:${
        idx === curIdx ? "bold" : "normal"
      }">${step.label}</div>
    </div>`;
  });
  container.innerHTML = html + "</div>";
}

// frontend/js/dashboard-main.js
// V2026.1.14 - 旗艦終極穩定版：100% 保留草稿佇列與動態憑證邏輯

document.addEventListener("DOMContentLoaded", () => {
  // [大師優化]：統一從 localStorage 取得 Token，確保 App 穩定性
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "login.html";
    return;
  }
  window.dashboardToken = token;

  // 1. 初始化數據
  if (typeof window.loadSystemSettings === "function")
    window.loadSystemSettings();
  if (typeof window.loadUserProfile === "function") window.loadUserProfile();
  if (typeof window.loadMyPackages === "function") window.loadMyPackages();
  if (typeof window.loadMyShipments === "function") window.loadMyShipments();
  if (typeof window.updateGlobalWalletDisplay === "function")
    window.updateGlobalWalletDisplay();

  // 2. 執行你的核心功能：草稿檢查
  setTimeout(() => {
    if (window.checkForecastDraftQueue) window.checkForecastDraftQueue(false);
  }, 500);

  // [事件委派] 全域處理憑證提交
  document.body.addEventListener("submit", (e) => {
    if (e.target && e.target.id === "upload-proof-form")
      window.handleUploadProofSubmit(e);
  });

  bindGlobalButtons();
});

/**
 * [100% 還原] 預報草稿佇列檢查 (V29.6 複雜邏輯)
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
    return;
  }

  if (container && listEl) {
    container.style.display = "flex";
    listEl.innerHTML = queue
      .map(
        (item, idx) => `
            <li style="${idx === 0 ? "font-weight:bold; color:#d35400;" : ""}">
                ${item.name} (x${item.quantity}) ${
          idx === 0 ? '<i class="fas fa-arrow-left"></i> 準備填入' : ""
        }
            </li>
        `
      )
      .join("");
  }

  const current = queue[0];
  const nameInput = document.getElementById("productName");
  if (nameInput && current) {
    // 如果是剛提交完，或是欄位是空的，就自動填入下一筆
    if (isAfterSubmit || !nameInput.value.trim()) {
      nameInput.value = current.name || "";
      if (document.getElementById("quantity"))
        document.getElementById("quantity").value = current.quantity || 1;
      if (document.getElementById("note"))
        document.getElementById("note").value = "來自試算帶入";

      if (warningEl && (current.hasOversizedItem || current.isOverweight)) {
        warningEl.innerHTML = `⚠️ 商品包含超長或超重項目，將有額外費用`;
        warningEl.style.display = "block";
      }
    }
  }
};

/**
 * [100% 還原] 上傳憑證動態注入邏輯
 */
window.openUploadProof = function (id) {
  const modal = document.getElementById("upload-proof-modal");
  const form = document.getElementById("upload-proof-form");
  if (document.getElementById("upload-proof-id"))
    document.getElementById("upload-proof-id").value = id;

  if (form) {
    form.reset();
    // 如果沒有統編欄位，動態注入 (保留你的 B2B 邏輯)
    if (!document.getElementById("proof-taxId")) {
      const taxDiv = document.createElement("div");
      taxDiv.innerHTML = `
                <div class="form-group" style="background:#e8f0fe; padding:10px; border-radius:5px;">
                    <label style="color:#1a73e8; font-weight:bold;">📝 統編資訊 (如需發票)</label>
                    <div style="display:flex; gap:10px;">
                        <input type="text" id="proof-taxId" class="form-control" placeholder="統一編號">
                        <input type="text" id="proof-invoiceTitle" class="form-control" placeholder="公司抬頭">
                    </div>
                </div>`;
      form.insertBefore(taxDiv, form.querySelector(".form-group"));
    }
  }
  modal.style.display = "flex";
};

// [保留] 一鍵複製邏輯
window.copyText = function (elementId) {
  const el =
    document.getElementById(elementId) ||
    document.getElementById(elementId + "-display");
  if (!el) return;
  navigator.clipboard.writeText(el.innerText.trim()).then(() => {
    const btn = event.target;
    const oldText = btn.innerText;
    btn.innerText = "已複製!";
    setTimeout(() => {
      btn.innerText = oldText;
    }, 2000);
  });
};

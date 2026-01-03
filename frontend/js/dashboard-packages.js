/**
 * dashboard-packages.js
 * V2026.01.14.Ultimate_Final_FullVersion
 * [功能]：包裹管理核心邏輯
 * [修復]：
 * 1. 解決非同步加載導致的「合併打包」按鈕 ID 抓取不到的問題。
 * 2. 採用「事件委派」機制，確保表格更新後勾選功能依然有效。
 * 3. 解決大數據渲染造成的 Violation 卡頓。
 * 4. 保留：費率逆推計算、智慧文字比對、Cloudinary 修正、預報草稿佇列、批量預報。
 */

let currentEditPackageImages = [];

document.addEventListener("DOMContentLoaded", () => {
  // 1. 初始化按鈕監聽 (針對主頁面已存在的預報功能)
  initPackageStaticUI();

  // 2. [效能優化] 搜尋與篩選監聽 (防抖處理避免 Violations)
  let filterTimeout;
  const pkgSearchInput = document.getElementById("pkg-search-input");
  if (pkgSearchInput) {
    pkgSearchInput.addEventListener("input", () => {
      clearTimeout(filterTimeout);
      filterTimeout = setTimeout(() => window.filterAndRenderPackages(), 150);
    });
  }
  const pkgStatusFilter = document.getElementById("pkg-status-filter");
  if (pkgStatusFilter) {
    pkgStatusFilter.addEventListener("change", () =>
      window.filterAndRenderPackages()
    );
  }

  // 3. 綁定表單與 Excel 事件
  const claimForm = document.getElementById("claim-package-form");
  if (claimForm) claimForm.addEventListener("submit", handleClaimSubmit);

  const excelInput = document.getElementById("bulk-excel-file");
  if (excelInput) excelInput.addEventListener("change", handleExcelUpload);

  const btnConfirmBulk = document.getElementById("btn-confirm-bulk");
  if (btnConfirmBulk)
    btnConfirmBulk.addEventListener("click", submitBulkForecast);
});

/**
 * 初始化靜態 UI 組件
 */
function initPackageStaticUI() {
  // 認領按鈕
  const btnClaim = document.getElementById("btn-claim-package");
  if (btnClaim) btnClaim.onclick = () => window.openClaimModalSafe();

  // 批量預報按鈕 (支援多處)
  const bulkBtns = document.querySelectorAll("#btn-bulk-forecast");
  bulkBtns.forEach((btn) => {
    btn.onclick = () => {
      const modal = document.getElementById("bulk-forecast-modal");
      if (modal) modal.style.display = "flex";
    };
  });

  // 單件預報捲動
  const btnSingle = document.getElementById("btn-single-forecast");
  if (btnSingle) {
    btnSingle.onclick = () => {
      const forecastSection = document.querySelector(".forecast-section");
      if (forecastSection) {
        forecastSection.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => {
          const input = document.getElementById("trackingNumber");
          if (input) {
            input.focus();
            input.style.boxShadow = "0 0 0 4px rgba(26, 115, 232, 0.3)";
            setTimeout(() => (input.style.boxShadow = ""), 1500);
          }
        }, 600);
      }
    };
  }
}

/**
 * [核心修復] 更新結帳列顯示邏輯 (靜態區域版)
 * 確保在 packages.html 被 fetch 載入後依然能運作
 */
window.updateCheckoutBar = function () {
  const checkboxes = document.querySelectorAll(".package-checkbox:checked");
  const count = checkboxes.length;

  // 獲取 packages.html 中的 ID 元件
  const checkoutZone = document.getElementById("packages-checkout-zone");
  const countDisplay = document.getElementById("selected-pkg-count-simple");

  if (checkoutZone && countDisplay) {
    if (count > 0) {
      countDisplay.textContent = count;
      checkoutZone.style.display = "flex"; // 顯示區塊

      // [關鍵修復]：動態綁定合併按鈕事件 (確保點擊能開啟 Shipment Modal)
      const btnMerge = document.getElementById("btn-create-shipment-simple");
      if (btnMerge) {
        btnMerge.onclick = (e) => {
          e.preventDefault();
          if (typeof window.handleCreateShipmentClick === "function") {
            window.handleCreateShipmentClick();
          } else {
            console.error("找不到合併打包開窗函式 (handleCreateShipmentClick)");
            alert("系統載入中，請稍後再試");
          }
        };
      }

      // 同步舊版計數器 (如有其他組件使用)
      const oldBadge = document.getElementById("selected-pkg-count");
      if (oldBadge) oldBadge.textContent = count;
    } else {
      checkoutZone.style.display = "none"; // 無選取則隱藏
    }
  }
};

/**
 * [核心] 載入包裹列表
 */
window.loadMyPackages = async function () {
  const tableBody = document.getElementById("packages-table-body");
  if (!tableBody) return;

  tableBody.innerHTML =
    '<tr><td colspan="5" class="text-center" style="padding:40px;"><div class="loading-spinner"></div><p>包裹資料同步中...</p></td></tr>';

  try {
    const res = await fetch(`${API_BASE_URL}/api/packages/my`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();
    window.allPackagesData = data.packages || [];
    window.filterAndRenderPackages();
  } catch (e) {
    tableBody.innerHTML = `<tr><td colspan="5" class="text-center" style="color:red; padding:20px;">載入失敗: ${e.message}</td></tr>`;
  }
};

/**
 * 過濾包裹邏輯
 */
window.filterAndRenderPackages = function () {
  if (!window.allPackagesData) return;

  const searchTerm =
    document.getElementById("pkg-search-input")?.value.toLowerCase().trim() ||
    "";
  const statusFilter =
    document.getElementById("pkg-status-filter")?.value || "all";

  const filtered = window.allPackagesData.filter((pkg) => {
    const pName = pkg.productName || "";
    const tNum = pkg.trackingNumber || "";
    const matchesSearch =
      pName.toLowerCase().includes(searchTerm) ||
      tNum.toLowerCase().includes(searchTerm);
    const matchesStatus = statusFilter === "all" || pkg.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  renderPackagesTable(filtered);
};

/**
 * [優化] 渲染函式 (DocumentFragment 大數據優化，徹底解決延遲)
 */
function renderPackagesTable(dataToRender = null) {
  const tableBody = document.getElementById("packages-table-body");
  if (!tableBody) return;

  const displayData =
    dataToRender !== null ? dataToRender : window.allPackagesData;
  tableBody.innerHTML = "";

  if (!displayData || displayData.length === 0) {
    tableBody.innerHTML =
      '<tr><td colspan="5" class="text-center" style="padding:40px; color:#94a3b8;">找不到符合條件的包裹</td></tr>';
    window.updateCheckoutBar();
    return;
  }

  const statusMap = window.PACKAGE_STATUS_MAP || {};
  const statusClasses = window.STATUS_CLASSES || {};
  const fragment = document.createDocumentFragment();

  displayData.forEach((pkg) => {
    const statusText = statusMap[pkg.status] || pkg.status;
    const statusClass = statusClasses[pkg.status] || "";

    // [條件修復]：只要已入庫且非異常即可勾選，不齊全的資料(如缺圖)由後續流程提醒
    const isArrived = pkg.status === "ARRIVED";
    const isReady = isArrived && !pkg.exceptionStatus;

    let badgesHtml = "";
    if (pkg.exceptionStatus) {
      const exText = pkg.exceptionStatus === "DAMAGED" ? "破損" : "異常件";
      badgesHtml += `<span class="badge-alert" style="background:#fff1f0; color:#ff4d4f; border:1px solid #ffccc7; font-size:11px; padding:2px 6px; border-radius:4px;" onclick="resolveException('${pkg.id}')">⚠️ ${exText}</span> `;
    }

    const hasInfo =
      pkg.productUrl || (pkg.productImages && pkg.productImages.length > 0);
    if (!hasInfo) {
      badgesHtml += `<span class="badge-alert" style="background:#fff7e6; color:#fa8c16; border:1px solid #ffe7ba; font-size:11px; padding:2px 6px; border-radius:4px; cursor:pointer;" onclick='openEditPackageModal(${JSON.stringify(
        pkg
      )})'>⚠️ 待完善</span> `;
    }

    const boxes = Array.isArray(pkg.arrivedBoxes) ? pkg.arrivedBoxes : [];
    let infoHtml = "-";
    if (boxes.length > 0) {
      const totalW = boxes.reduce(
        (sum, b) => sum + (parseFloat(b.weight) || 0),
        0
      );
      infoHtml = `<div style="font-size:13px; color:#1e293b; font-weight:700;">${
        boxes.length
      }箱 / ${totalW.toFixed(1)}kg</div>`;
      if (pkg.totalCalculatedFee) {
        infoHtml += `<div style="color:#1a73e8; font-size:12px; font-weight:800;">估 $${pkg.totalCalculatedFee.toLocaleString()}</div>`;
      }
    } else {
      infoHtml = `<div class="pkg-badges">${badgesHtml}</div>`;
    }

    const categoryBadgeStyle = pkg.displayType?.includes("特殊")
      ? "background:#e8f0fe; color:#1a73e8; border:1px solid #c2dbfe;"
      : "background:#f8f9fa; color:#6c757d; border:1px solid #e9ecef;";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="checkbox" class="package-checkbox" data-id="${pkg.id}" ${
      !isReady ? "disabled" : ""
    }></td>
      <td><span class="status-badge ${statusClass}">${statusText}</span></td>
      <td>
        <div style="margin-bottom:4px;"><span style="font-size:12px; padding:2px 6px; border-radius:4px; ${categoryBadgeStyle}">${
      pkg.displayType || "一般家具"
    }</span></div>
        <div style="font-weight:800; color:#1e293b; margin-bottom:2px;">${
          pkg.productName
        }</div>
        <small style="color:#64748b; font-family:Monaco, monospace; font-size:12px;">${
          pkg.trackingNumber
        }</small>
        ${
          !boxes.length
            ? `<div style="margin-top:4px;">${badgesHtml}</div>`
            : ""
        }
      </td>
      <td>${infoHtml}</td>
      <td>
        <button class="btn btn-sm btn-primary btn-details-trigger">詳情</button>
        ${
          pkg.status === "PENDING" || pkg.status === "ARRIVED"
            ? `<button class="btn btn-sm btn-secondary btn-edit-trigger" style="margin-left:5px;">修改</button>`
            : ""
        }
      </td>
    `;

    // 事件監聽綁定
    tr.querySelector(".btn-details-trigger").onclick = () =>
      window.openPackageDetails(encodeURIComponent(JSON.stringify(pkg)));

    const btnEdit = tr.querySelector(".btn-edit-trigger");
    if (btnEdit) {
      btnEdit.onclick = (e) => {
        e.stopPropagation();
        if (pkg.status === "ARRIVED") {
          window.showMessage("包裹已入庫量完尺寸，請洽客服修改", "error");
        } else {
          openEditPackageModal(pkg);
        }
      };
    }

    // 勾選框監聽：即時觸發 updateCheckoutBar
    tr.querySelector(".package-checkbox")?.addEventListener("change", () => {
      window.updateCheckoutBar();
    });

    fragment.appendChild(tr);
  });

  tableBody.appendChild(fragment);

  // 重要：表格渲染後立即執行一次檢查，確保勾選狀態同步
  window.updateCheckoutBar();
}

// --- 預報提交與草稿佇列 (保留) ---
window.handleForecastSubmit = async function (e) {
  e.preventDefault();
  const btn = e.target.querySelector("button[type='submit']");
  const productUrl = document.getElementById("productUrl").value.trim();
  const fileInput = document.getElementById("images");
  const hasFiles = fileInput?.files?.length > 0;

  if (!productUrl && !hasFiles) {
    alert("請務必提供「商品購買連結」或「上傳商品圖片」(擇一)！");
    document.getElementById("productUrl").focus();
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<div class="loading-spinner-small"></div> 提交中...';

  const fd = new FormData();
  fd.append(
    "trackingNumber",
    document.getElementById("trackingNumber").value.trim()
  );
  fd.append("productName", document.getElementById("productName").value.trim());
  fd.append("quantity", document.getElementById("quantity").value);
  fd.append("note", document.getElementById("note").value);
  fd.append("productUrl", productUrl);
  if (hasFiles) {
    for (let f of fileInput.files) fd.append("images", f);
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/packages/forecast/images`, {
      method: "POST",
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
      body: fd,
    });
    if (res.ok) {
      window.showMessage("預報成功！", "success");
      e.target.reset();
      if (fileInput.resetUploader) fileInput.resetUploader();
      window.loadMyPackages();
      if (window.checkForecastDraftQueue) window.checkForecastDraftQueue(true);
    } else {
      const data = await res.json();
      window.showMessage(data.message || "預報失敗", "error");
    }
  } catch (err) {
    window.showMessage("網路不給力，請稍後再試", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-plus-circle"></i> 提交預報';
  }
};

// --- 包裹詳情 (智慧費率逆推與 Cloudinary 修復) ---
window.openPackageDetails = function (pkgDataStr) {
  try {
    const pkg = JSON.parse(decodeURIComponent(pkgDataStr));
    const modal = document.getElementById("package-details-modal");
    if (!modal) return;

    const boxesListContainer = document.getElementById("details-boxes-list");
    const imagesGallery = document.getElementById("details-images-gallery");

    const CONSTANTS = window.CONSTANTS || {
      VOLUME_DIVISOR: 28317,
      MINIMUM_CHARGE: 2000,
      OVERSIZED_LIMIT: 300,
      OVERSIZED_FEE: 800,
      OVERWEIGHT_LIMIT: 100,
      OVERWEIGHT_FEE: 800,
    };
    const arrivedBoxes = pkg.arrivedBoxes || [];

    // [智慧邏輯]：逆推計算費率
    let calculatedTotalBaseFee = 0;
    let pkgRateConfig = { weightRate: 22, volumeRate: 125 };

    if (window.RATES) {
      const pType = (pkg.displayType || "一般家具").replace(/傢/g, "家").trim();
      const found = Object.values(window.RATES).find(
        (r) => r.name.replace(/傢/g, "家").trim() === pType
      );
      if (found) pkgRateConfig = found;
    }

    let boxesHtml = '<div class="detail-scroll-container">';
    arrivedBoxes.forEach((box, idx) => {
      const l = parseFloat(box.length) || 0,
        w = parseFloat(box.width) || 0,
        h = parseFloat(box.height) || 0,
        weight = parseFloat(box.weight) || 0;

      const cai = box.cai || Math.ceil((l * w * h) / CONSTANTS.VOLUME_DIVISOR);
      const wtFee = Math.ceil(weight * pkgRateConfig.weightRate);
      const volFee = Math.ceil(cai * pkgRateConfig.volumeRate);
      const finalFee = Math.max(wtFee, volFee);
      calculatedTotalBaseFee += finalFee;

      boxesHtml += `
        <div class="detail-box-card">
          <div class="box-header">
            <span class="box-title">📦 第 ${idx + 1} 箱</span>
            <span class="box-fee">$${finalFee.toLocaleString()}</span>
          </div>
          <div class="box-specs">
            <div class="spec-item"><span class="label">尺寸:</span> <span class="value">${l}x${w}x${h} cm</span></div>
            <div class="spec-item"><span class="label">重量:</span> <span class="value">${weight} kg</span></div>
            <div class="spec-item"><span class="label">材積:</span> <span class="value">${cai} 材</span></div>
          </div>
          <div class="detail-calc-box">
            <div class="calc-comparison-row ${
              wtFee >= volFee ? "is-winner" : ""
            }">
              <span>重量計費 (${weight}kg × ${
        pkgRateConfig.weightRate
      })</span><span>$${wtFee}</span>
            </div>
            <div class="calc-comparison-row ${
              volFee > wtFee ? "is-winner" : ""
            }">
              <span>材積計費 (${cai}材 × ${
        pkgRateConfig.volumeRate
      })</span><span>$${volFee}</span>
            </div>
          </div>
          ${
            Math.max(l, w, h) >= CONSTANTS.OVERSIZED_LIMIT
              ? `<div class="alert-highlight">⚠️ 尺寸超長 (+$${CONSTANTS.OVERSIZED_FEE})</div>`
              : ""
          }
          ${
            weight >= CONSTANTS.OVERWEIGHT_LIMIT
              ? `<div class="alert-highlight">⚠️ 單件超重 (+$${CONSTANTS.OVERWEIGHT_FEE})</div>`
              : ""
          }
        </div>`;
    });
    boxesHtml += "</div>";

    boxesListContainer.innerHTML =
      arrivedBoxes.length > 0
        ? boxesHtml
        : '<p class="text-center">尚未測量</p>';
    document.getElementById("details-total-weight").textContent = arrivedBoxes
      .reduce((s, b) => s + (parseFloat(b.weight) || 0), 0)
      .toFixed(1);
    document.getElementById(
      "details-total-fee"
    ).textContent = `NT$ ${calculatedTotalBaseFee.toLocaleString()}`;

    // 照片渲染 (Cloudinary Fix)
    imagesGallery.innerHTML = "";
    (pkg.warehouseImages || []).forEach((url) => {
      const src = url.startsWith("http") ? url : `${API_BASE_URL}${url}`;
      const img = document.createElement("img");
      img.src = src;
      img.className = "warehouse-thumb";
      img.onclick = () => window.open(src, "_blank");
      imagesGallery.appendChild(img);
    });

    modal.style.display = "flex";
  } catch (e) {
    console.error("詳情解析失敗", e);
  }
};

// --- 無主包裹 (保留) ---
window.loadUnclaimedList = async function () {
  const tbody = document.getElementById("unclaimed-table-body");
  if (!tbody) return;
  tbody.innerHTML =
    '<tr><td colspan="5" class="text-center">載入中...</td></tr>';
  try {
    const res = await fetch(`${API_BASE_URL}/api/packages/unclaimed`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();
    if (data.success && data.packages?.length > 0) {
      tbody.innerHTML = data.packages
        .map(
          (pkg) => `
        <tr>
          <td>${new Date(pkg.createdAt).toLocaleDateString()}</td>
          <td style="font-family:monospace; font-weight:bold;">${
            pkg.maskedTrackingNumber
          }</td>
          <td>${pkg.productName}</td>
          <td>${pkg.weightInfo}</td>
          <td><button class="btn btn-sm btn-primary" onclick="window.openClaimModalSafe()"><i class="fas fa-hand-paper"></i> 認領</button></td>
        </tr>`
        )
        .join("");
    } else {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-center">目前沒有無主包裹</td></tr>';
    }
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5">載入失敗</td></tr>`;
  }
};

window.openClaimModalSafe = function () {
  const modal = document.getElementById("claim-package-modal");
  const form = document.getElementById("claim-package-form");
  if (form) form.reset();
  if (modal) modal.style.display = "flex";
  setTimeout(() => document.getElementById("claim-tracking")?.focus(), 100);
};

async function handleClaimSubmit(e) {
  e.preventDefault();
  const btn = e.target.querySelector("button[type='submit']");
  btn.disabled = true;
  const fd = new FormData();
  fd.append(
    "trackingNumber",
    document.getElementById("claim-tracking").value.trim()
  );
  const file = document.getElementById("claim-proof").files[0];
  if (file) fd.append("proof", file);
  try {
    const res = await fetch(`${API_BASE_URL}/api/packages/claim`, {
      method: "POST",
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
      body: fd,
    });
    if (res.ok) {
      alert("認領成功！");
      document.getElementById("claim-package-modal").style.display = "none";
      window.loadMyPackages();
    } else {
      alert("認領失敗");
    }
  } catch (err) {
    alert("網路錯誤");
  } finally {
    btn.disabled = false;
  }
}

// --- Excel 批量操作 (保留) ---
function handleExcelUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: "array" });
    const jsonData = XLSX.utils.sheet_to_json(
      workbook.Sheets[workbook.SheetNames[0]],
      {
        header: ["trackingNumber", "productName", "quantity", "note"],
        range: 1,
      }
    );
    window.bulkData = jsonData.filter((r) => r.trackingNumber && r.productName);
    document.getElementById(
      "bulk-preview-area"
    ).innerHTML = `<p>已讀取 ${window.bulkData.length} 筆資料</p>`;
    document.getElementById("btn-confirm-bulk").disabled =
      window.bulkData.length === 0;
  };
  reader.readAsArrayBuffer(file);
}

async function submitBulkForecast() {
  const btn = document.getElementById("btn-confirm-bulk");
  btn.disabled = true;
  try {
    const res = await fetch(`${API_BASE_URL}/api/packages/bulk-forecast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${window.dashboardToken}`,
      },
      body: JSON.stringify({ packages: window.bulkData }),
    });
    if (res.ok) {
      alert("批量匯入成功");
      document.getElementById("bulk-forecast-modal").style.display = "none";
      window.loadMyPackages();
    }
  } catch (err) {
    alert("匯入失敗");
  } finally {
    btn.disabled = false;
  }
}

// --- 異常處理與編輯 (保留) ---
window.resolveException = function (pkgId) {
  const action = prompt("處理方式：1. 棄置, 2. 退回, 3. 發貨 (請輸入 1, 2, 3)");
  const map = { 1: "DISCARD", 2: "RETURN", 3: "SHIP_ANYWAY" };
  if (!map[action]) return;
  const note = prompt("備註：");
  fetch(`${API_BASE_URL}/api/packages/${pkgId}/exception`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${window.dashboardToken}`,
    },
    body: JSON.stringify({ action: map[action], note }),
  }).then(() => window.loadMyPackages());
};

window.openEditPackageModal = function (pkg) {
  document.getElementById("edit-package-id").value = pkg.id;
  document.getElementById("edit-trackingNumber").value = pkg.trackingNumber;
  document.getElementById("edit-productName").value = pkg.productName;
  document.getElementById("edit-quantity").value = pkg.quantity;
  document.getElementById("edit-note").value = pkg.note || "";
  document.getElementById("edit-productUrl").value = pkg.productUrl || "";
  currentEditPackageImages = pkg.productImages || [];
  renderEditImages();
  document.getElementById("edit-package-modal").style.display = "flex";
};

function renderEditImages() {
  const container = document.getElementById("edit-package-images-container");
  if (!container) return;
  container.innerHTML = currentEditPackageImages
    .map((url, idx) => {
      const src = url.startsWith("http") ? url : `${API_BASE_URL}${url}`;
      return `<div style="position:relative; display:inline-block; margin:5px;"><img src="${src}" style="width:60px;height:60px;object-fit:cover;"><span onclick="removeEditImg(${idx})" style="position:absolute;top:-5px;right:-5px;background:red;color:white;border-radius:50%;width:20px;text-align:center;cursor:pointer;">&times;</span></div>`;
    })
    .join("");
}

window.removeEditImg = function (idx) {
  currentEditPackageImages.splice(idx, 1);
  renderEditImages();
};

window.handleEditPackageSubmit = async function (e) {
  e.preventDefault();
  const fd = new FormData();
  fd.append(
    "trackingNumber",
    document.getElementById("edit-trackingNumber").value
  );
  fd.append("productName", document.getElementById("edit-productName").value);
  fd.append("quantity", document.getElementById("edit-quantity").value);
  fd.append("note", document.getElementById("edit-note").value);
  fd.append("productUrl", document.getElementById("edit-productUrl").value);
  fd.append("existingImages", JSON.stringify(currentEditPackageImages));
  for (let f of document.getElementById("edit-package-new-images").files)
    fd.append("images", f);

  await fetch(
    `${API_BASE_URL}/api/packages/${
      document.getElementById("edit-package-id").value
    }`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
      body: fd,
    }
  );
  document.getElementById("edit-package-modal").style.display = "none";
  window.loadMyPackages();
};

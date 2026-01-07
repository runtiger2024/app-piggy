/**
 * dashboard-packages.js
 * V2026.01.15.DetailedCalculation_FullVersion
 * [功能]：包裹管理核心邏輯 (整合無主包裹優化版 + 智慧計費詳情可視化)
 * [修復]：
 * 1. 整合 Cache-First (SWR) 策略至無主包裹載入，消除切換頓挫感。
 * 2. 新增無主包裹即時過濾搜尋與圖片預覽功能。
 * 3. [詳情優化]：強化計費比對視覺，清楚標示「重量」或「材積」勝出基準，提升客戶透明度。
 * 4. 保留 V2026.01.14 所有修復：事件委派、大數據渲染優化、費率逆推、批量預報。
 */

let currentEditPackageImages = [];
window.unclaimedCache = []; // 全域快取：無主包裹

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

  // 3. [新功能] 無主包裹搜尋監聽
  const unclaimedSearchInput = document.getElementById("unclaimed-search");
  if (unclaimedSearchInput) {
    unclaimedSearchInput.addEventListener("input", (e) =>
      window.filterUnclaimed(e.target.value)
    );
  }

  // 4. 綁定表單與 Excel 事件
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
 */
window.updateCheckoutBar = function () {
  const checkboxes = document.querySelectorAll(".package-checkbox:checked");
  const count = checkboxes.length;

  const checkoutZone = document.getElementById("packages-checkout-zone");
  const countDisplay = document.getElementById("selected-pkg-count-simple");

  if (checkoutZone && countDisplay) {
    if (count > 0) {
      countDisplay.textContent = count;
      checkoutZone.style.display = "flex";

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

      const oldBadge = document.getElementById("selected-pkg-count");
      if (oldBadge) oldBadge.textContent = count;
    } else {
      checkoutZone.style.display = "none";
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
 * [優化] 渲染函式 (DocumentFragment 大數據優化)
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

    tr.querySelector(".package-checkbox")?.addEventListener("change", () =>
      window.updateCheckoutBar()
    );
    fragment.appendChild(tr);
  });

  tableBody.appendChild(fragment);
  window.updateCheckoutBar();
}

// --- 預報提交 ---
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

      // [優化]：判定哪一個是計費基準 (Winner)
      const isWeightWinner = wtFee >= volFee;
      const isVolumeWinner = volFee > wtFee;

      boxesHtml += `
        <div class="detail-box-card" style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; margin-bottom: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
          <div class="box-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 8px;">
            <span class="box-title" style="font-weight: 800; color: #475569;">📦 第 ${
              idx + 1
            } 箱</span>
            <span class="box-fee" style="color: #1e293b; font-weight: 800;">小計: $${finalFee.toLocaleString()}</span>
          </div>
          <div class="box-specs" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; font-size: 12px;">
            <div class="spec-item"><span class="label" style="color:#64748b;">尺寸:</span> <span class="value" style="color:#334155; font-weight:600;">${l}x${w}x${h} cm</span></div>
            <div class="spec-item"><span class="label" style="color:#64748b;">重量:</span> <span class="value" style="color:#334155; font-weight:600;">${weight} kg</span></div>
            <div class="spec-item"><span class="label" style="color:#64748b;">材積:</span> <span class="value" style="color:#334155; font-weight:600;">${cai} 材</span></div>
            <div class="spec-item"><span class="label" style="color:#64748b;">分類:</span> <span class="value" style="color:#1a73e8; font-weight:600;">${
              pkgRateConfig.name || "一般家具"
            }</span></div>
          </div>
          
          <div class="detail-calc-box" style="background: #f8fafc; padding: 10px; border-radius: 8px;">
            <div style="font-size: 11px; color: #94a3b8; margin-bottom: 5px;">費用試算比對 (取大者計費)：</div>
            <div class="calc-comparison-row ${
              isWeightWinner ? "is-winner" : ""
            }" 
                 style="display: flex; justify-content: space-between; padding: 6px 10px; border-radius: 6px; font-size: 13px; margin-bottom: 4px; border: 1px solid ${
                   isWeightWinner ? "#22c55e" : "transparent"
                 }; background: ${
        isWeightWinner ? "#f0fdf4" : "transparent"
      }; color: ${isWeightWinner ? "#15803d" : "#64748b"}; font-weight: ${
        isWeightWinner ? "700" : "normal"
      };">
              <span>重量計費 (${weight}kg × ${pkgRateConfig.weightRate})</span>
              <span>$${wtFee} ${
        isWeightWinner
          ? '<span style="font-size:10px; background:#22c55e; color:white; padding:1px 5px; border-radius:10px; margin-left:5px;">最終採用</span>'
          : ""
      }</span>
            </div>
            <div class="calc-comparison-row ${
              isVolumeWinner ? "is-winner" : ""
            }" 
                 style="display: flex; justify-content: space-between; padding: 6px 10px; border-radius: 6px; font-size: 13px; border: 1px solid ${
                   isVolumeWinner ? "#22c55e" : "transparent"
                 }; background: ${
        isVolumeWinner ? "#f0fdf4" : "transparent"
      }; color: ${isVolumeWinner ? "#15803d" : "#64748b"}; font-weight: ${
        isVolumeWinner ? "700" : "normal"
      };">
              <span>材積計費 (${cai}材 × ${pkgRateConfig.volumeRate})</span>
              <span>$${volFee} ${
        isVolumeWinner
          ? '<span style="font-size:10px; background:#22c55e; color:white; padding:1px 5px; border-radius:10px; margin-left:5px;">最終採用</span>'
          : ""
      }</span>
            </div>
          </div>
          ${
            Math.max(l, w, h) >= CONSTANTS.OVERSIZED_LIMIT
              ? `<div class="alert-highlight" style="margin-top: 8px; font-size: 11px; color: #ef4444; font-weight: 600;">⚠️ 尺寸超長 (+$${CONSTANTS.OVERSIZED_FEE})</div>`
              : ""
          }
          ${
            weight >= CONSTANTS.OVERWEIGHT_LIMIT
              ? `<div class="alert-highlight" style="margin-top: 4px; font-size: 11px; color: #ef4444; font-weight: 600;">⚠️ 單件超重 (+$${CONSTANTS.OVERWEIGHT_FEE})</div>`
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

// --- [優化新功能] 無主包裹優化系統 ---

/**
 * [新功能] 加載無主清單 (SWR 策略)
 */
window.loadUnclaimedList = async function (forceRefresh = false) {
  const tbody = document.getElementById("unclaimed-table-body");
  if (!tbody) return;

  // [SWR 優化]：快取優先
  if (
    !forceRefresh &&
    window.unclaimedCache &&
    window.unclaimedCache.length > 0
  ) {
    renderUnclaimed(window.unclaimedCache);
    fetchUnclaimedData(true); // 背景更新
    return;
  }

  tbody.innerHTML =
    '<tr><td colspan="5" class="text-center" style="padding:20px;"><i class="fas fa-spinner fa-spin"></i> 資料載入中...</td></tr>';
  await fetchUnclaimedData(false);
};

async function fetchUnclaimedData(isBackground) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/packages/unclaimed`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();
    if (data.success) {
      window.unclaimedCache = data.packages || [];
      renderUnclaimed(window.unclaimedCache);
    }
  } catch (e) {
    if (!isBackground) {
      document.getElementById(
        "unclaimed-table-body"
      ).innerHTML = `<tr><td colspan="5" class="text-center" style="color:red;">載入失敗</td></tr>`;
    }
  }
}

/**
 * [新功能] 渲染無主包裹 (整合圖片預覽)
 */
function renderUnclaimed(list, isFiltering = false) {
  const tbody = document.getElementById("unclaimed-table-body");
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="padding:30px; color:#999;">${
      isFiltering ? "找不到符合條件的單號" : "目前沒有無主包裹"
    }</td></tr>`;
    return;
  }

  tbody.innerHTML = list
    .map((pkg) => {
      // 取得照片 (如有)
      const firstImg =
        pkg.warehouseImages && pkg.warehouseImages.length > 0
          ? pkg.warehouseImages[0]
          : null;
      const imgHtml = firstImg
        ? `<div class="unclaimed-thumb-wrapper" onclick="window.previewUnclaimedImage('${firstImg}')"><img src="${
            firstImg.startsWith("http") ? firstImg : API_BASE_URL + firstImg
          }" class="unclaimed-thumb"><i class="fas fa-search-plus"></i></div>`
        : '<span style="color:#ccc;">(無照片)</span>';

      return `
      <tr>
        <td>${new Date(pkg.createdAt).toLocaleDateString()}</td>
        <td style="font-family:monospace; font-weight:bold; color:#d32f2f;">${
          pkg.maskedTrackingNumber || pkg.trackingNumber
        }</td>
        <td>
          <div style="font-weight:bold;">${pkg.productName}</div>
          ${imgHtml}
        </td>
        <td>${pkg.weightInfo || "--"}</td>
        <td><button class="btn btn-sm btn-primary" onclick="window.initiateClaimByTracking('${
          pkg.trackingNumber
        }')"><i class="fas fa-hand-paper"></i> 認領</button></td>
      </tr>`;
    })
    .join("");
}

/**
 * [新功能] 無主包裹過濾搜尋
 */
window.filterUnclaimed = function (keyword) {
  const kw = keyword.toLowerCase().trim();
  if (!window.unclaimedCache) return;
  const filtered = window.unclaimedCache.filter(
    (p) =>
      p.trackingNumber.toLowerCase().includes(kw) ||
      p.productName.toLowerCase().includes(kw)
  );
  renderUnclaimed(filtered, true);
};

/**
 * [新功能] 認領時自動帶入單號
 */
window.initiateClaimByTracking = function (tracking) {
  window.openClaimModalSafe();
  const input = document.getElementById("claim-tracking");
  if (input) {
    input.value = tracking;
    input.style.backgroundColor = "#fff9db";
  }
};

/**
 * [新功能] 圖片大圖預覽
 */
window.previewUnclaimedImage = function (url) {
  const src = url.startsWith("http") ? url : API_BASE_URL + url;
  const modal = document.getElementById("view-images-modal");
  if (modal) {
    modal.innerHTML = `<div class="modal-content" style="max-width:800px; padding:0; background:transparent; box-shadow:none;">
        <span class="modal-close" style="color:#fff; font-size:40px; top:0; right:10px;">&times;</span>
        <img src="${src}" style="width:100%; border-radius:12px; border:3px solid #fff;">
    </div>`;
    modal.style.display = "flex";
  } else {
    window.open(src, "_blank");
  }
};

window.openClaimModalSafe = function () {
  const modal = document.getElementById("claim-package-modal");
  const form = document.getElementById("claim-package-form");
  if (form) {
    form.reset();
    document.getElementById("claim-tracking").style.backgroundColor = "";
  }
  if (modal) modal.style.display = "flex";
  setTimeout(() => document.getElementById("claim-tracking")?.focus(), 100);
};

async function handleClaimSubmit(e) {
  e.preventDefault();
  const btn = e.target.querySelector("button[type='submit']");
  btn.disabled = true;
  const trackingNum = document.getElementById("claim-tracking").value.trim();

  const fd = new FormData();
  fd.append("trackingNumber", trackingNum);
  const file = document.getElementById("claim-proof").files[0];
  if (file) fd.append("proof", file);

  try {
    const res = await fetch(`${API_BASE_URL}/api/packages/claim`, {
      method: "POST",
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
      body: fd,
    });
    if (res.ok) {
      window.showMessage("認領申請已提交！", "success");
      document.getElementById("claim-package-modal").style.display = "none";
      // 樂觀更新：從快取移除
      window.unclaimedCache = window.unclaimedCache.filter(
        (p) => p.trackingNumber !== trackingNum
      );
      renderUnclaimed(window.unclaimedCache);
      window.loadMyPackages();
    } else {
      const data = await res.json();
      alert(data.message || "認領失敗");
    }
  } catch (err) {
    alert("網路錯誤");
  } finally {
    btn.disabled = false;
  }
}

// --- Excel 批量操作 ---
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

// --- 異常處理與編輯 ---
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

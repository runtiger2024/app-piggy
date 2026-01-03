// frontend/js/dashboard-packages.js
// V2025.Final.UltimateFix - 包含智慧文字比對、強制前端重算、Excel與預報功能完整保留
// [Patch] Cloudinary URL Fix: Added checks for absolute URLs to prevent broken images
// [Update] 實裝分頁功能：單件/批量預報連動、即時搜尋與狀態篩選

let currentEditPackageImages = [];

document.addEventListener("DOMContentLoaded", () => {
  // 1. 綁定「認領包裹」按鈕 (手動開啟)
  const btnClaim = document.getElementById("btn-claim-package");
  if (btnClaim) {
    btnClaim.addEventListener("click", () => {
      window.openClaimModalSafe();
    });
  }

  // 2. [優化實裝] 綁定「批量預報」按鈕 (解決 ID 衝突，確保多處按鈕有效)
  const bulkBtns = document.querySelectorAll("#btn-bulk-forecast");
  bulkBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const modal = document.getElementById("bulk-forecast-modal");
      if (modal) modal.style.display = "flex";
    });
  });

  // 3. [優化實裝] 綁定「單件預報」按鈕 (連動滾動與聚焦)
  const btnSingle = document.getElementById("btn-single-forecast");
  if (btnSingle) {
    btnSingle.addEventListener("click", () => {
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
    });
  }

  // 4. [優化實裝] 搜尋與篩選監聽
  const pkgSearchInput = document.getElementById("pkg-search-input");
  if (pkgSearchInput) {
    pkgSearchInput.addEventListener("input", () =>
      window.filterAndRenderPackages()
    );
  }
  const pkgStatusFilter = document.getElementById("pkg-status-filter");
  if (pkgStatusFilter) {
    pkgStatusFilter.addEventListener("change", () =>
      window.filterAndRenderPackages()
    );
  }

  // 綁定認領表單提交
  const claimForm = document.getElementById("claim-package-form");
  if (claimForm) {
    claimForm.addEventListener("submit", handleClaimSubmit);
  }

  // 綁定 Excel 檔案選擇 (批量預報)
  const excelInput = document.getElementById("bulk-excel-file");
  if (excelInput) {
    excelInput.addEventListener("change", handleExcelUpload);
  }

  // 綁定批量預報確認按鈕
  const btnConfirmBulk = document.getElementById("btn-confirm-bulk");
  if (btnConfirmBulk) {
    btnConfirmBulk.addEventListener("click", submitBulkForecast);
  }
});

// --- [New] 載入無主包裹列表 ---
window.loadUnclaimedList = async function () {
  const tbody = document.getElementById("unclaimed-table-body");
  if (!tbody) return;

  tbody.innerHTML =
    '<tr><td colspan="5" class="text-center" style="padding:20px;">載入中...</td></tr>';

  try {
    const res = await fetch(`${API_BASE_URL}/api/packages/unclaimed`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();

    if (data.success && data.packages && data.packages.length > 0) {
      tbody.innerHTML = "";
      data.packages.forEach((pkg) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td data-label="入庫時間">${new Date(
            pkg.createdAt
          ).toLocaleDateString()}</td>
          <td data-label="單號 (遮罩)" style="font-family:monospace; font-weight:bold; color:#555;">${
            pkg.maskedTrackingNumber
          }</td>
          <td data-label="商品名稱">${pkg.productName}</td>
          <td data-label="重量/資訊">${pkg.weightInfo}</td>
          <td data-label="操作">
            <button class="btn btn-sm btn-primary" onclick="openClaimModalSafe()">
              <i class="fas fa-hand-paper"></i> 認領
            </button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-center" style="padding:30px; color:#999;">目前沒有無主包裹</td></tr>';
    }
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="color:red;">載入失敗: ${e.message}</td></tr>`;
  }
};

// [New] 安全開啟認領視窗 (不預填單號，強制手動輸入)
window.openClaimModalSafe = function () {
  const modal = document.getElementById("claim-package-modal");
  const form = document.getElementById("claim-package-form");
  if (form) form.reset(); // 確保清空所有欄位
  if (modal) modal.style.display = "flex";

  // 聚焦到輸入框
  setTimeout(() => {
    const input = document.getElementById("claim-tracking");
    if (input) input.focus();
  }, 100);
};

// --- [關鍵修復] 預報提交處理 (含前端驗證) ---
window.handleForecastSubmit = async function (e) {
  e.preventDefault();
  const btn = e.target.querySelector("button[type='submit']");

  // 1. 前端驗證：檢查「商品連結」與「圖片」是否擇一提供
  const productUrl = document.getElementById("productUrl").value.trim();
  const fileInput = document.getElementById("images");
  const hasFiles = fileInput && fileInput.files && fileInput.files.length > 0;

  if (!productUrl && !hasFiles) {
    alert(
      "【資料不全】請務必提供「商品購買連結」或「上傳商品圖片」(擇一)，方便我們核對商品！"
    );
    // 將焦點移至連結欄位
    document.getElementById("productUrl").focus();
    return;
  }

  btn.disabled = true;
  btn.textContent = "提交中...";

  const fd = new FormData();
  fd.append("trackingNumber", document.getElementById("trackingNumber").value);
  fd.append("productName", document.getElementById("productName").value);
  fd.append("quantity", document.getElementById("quantity").value);
  fd.append("note", document.getElementById("note").value);
  fd.append("productUrl", productUrl);

  // 處理圖片
  const files = fileInput.files;
  for (let i = 0; i < files.length; i++) {
    fd.append("images", files[i]);
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/packages/forecast/images`, {
      method: "POST",
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
      body: fd,
    });
    const data = await res.json();

    if (res.ok) {
      window.showMessage("預報成功！", "success");
      e.target.reset();

      // 重置圖片上傳器 UI
      if (fileInput && fileInput.resetUploader) fileInput.resetUploader();

      window.loadMyPackages();

      // 如果是從試算帶入的，更新佇列
      if (window.checkForecastDraftQueue) {
        window.checkForecastDraftQueue(true);
      }
    } else {
      window.showMessage(data.message || "預報失敗", "error");
    }
  } catch (err) {
    console.error(err);
    window.showMessage("網路錯誤", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-plus-circle"></i> 提交預報';
  }
};

// --- 1. 載入包裹列表 (我的包裹) ---
window.loadMyPackages = async function () {
  const tableBody = document.getElementById("packages-table-body");
  if (!tableBody) return;

  tableBody.innerHTML =
    '<tr><td colspan="5" class="text-center" style="padding:20px;">載入中...</td></tr>';

  try {
    const res = await fetch(`${API_BASE_URL}/api/packages/my`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();
    window.allPackagesData = data.packages || [];
    // 使用篩選渲染函式以維持當前的過濾狀態
    window.filterAndRenderPackages();
  } catch (e) {
    tableBody.innerHTML = `<tr><td colspan="5" class="text-center" style="color:red;">載入失敗: ${e.message}</td></tr>`;
  }
};

/**
 * [New實裝] 綜合搜尋與篩選邏輯
 */
window.filterAndRenderPackages = function () {
  if (!window.allPackagesData) return;

  const searchTerm =
    document.getElementById("pkg-search-input")?.value.toLowerCase().trim() ||
    "";
  const statusFilter =
    document.getElementById("pkg-status-filter")?.value || "all";

  const filtered = window.allPackagesData.filter((pkg) => {
    const matchesSearch =
      pkg.productName.toLowerCase().includes(searchTerm) ||
      pkg.trackingNumber.toLowerCase().includes(searchTerm);
    const matchesStatus = statusFilter === "all" || pkg.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  renderPackagesTable(filtered);
};

/**
 * [優化] 渲染函式：支援帶入過濾後的資料
 */
function renderPackagesTable(dataToRender = null) {
  const tableBody = document.getElementById("packages-table-body");
  if (!tableBody) return;

  const displayData =
    dataToRender !== null ? dataToRender : window.allPackagesData;
  tableBody.innerHTML = "";

  if (!displayData || displayData.length === 0) {
    tableBody.innerHTML =
      '<tr><td colspan="5" class="text-center" style="padding:30px; color:#999;">目前沒有符合條件的包裹</td></tr>';
    if (typeof window.updateCheckoutBar === "function")
      window.updateCheckoutBar();
    return;
  }

  const statusMap = window.PACKAGE_STATUS_MAP || {};
  const statusClasses = window.STATUS_CLASSES || {};

  displayData.forEach((pkg) => {
    const statusText = statusMap[pkg.status] || pkg.status;
    const statusClass = statusClasses[pkg.status] || "";

    const hasProductUrl = pkg.productUrl && pkg.productUrl.trim() !== "";
    const hasProductImages =
      Array.isArray(pkg.productImages) && pkg.productImages.length > 0;
    const isInfoComplete = hasProductUrl || hasProductImages;

    const isReady =
      pkg.status === "ARRIVED" && !pkg.exceptionStatus && isInfoComplete;

    let infoHtml = "<span>-</span>";
    let badgesHtml = "";

    const boxes = Array.isArray(pkg.arrivedBoxes) ? pkg.arrivedBoxes : [];

    if (pkg.exceptionStatus) {
      const exText = pkg.exceptionStatus === "DAMAGED" ? "破損" : "違禁品/異常";
      badgesHtml += `<span class="badge-alert" style="background:#ffebee; color:#d32f2f; border:1px solid red; cursor:pointer;" onclick="resolveException('${pkg.id}')">⚠️ ${exText} (點擊處理)</span> `;
    }

    if (!isInfoComplete) {
      badgesHtml += `<span class="badge-alert" style="background:#fff3e0; color:#d32f2f; border:1px solid #ff9800; cursor:pointer;" onclick='openEditPackageModal(${JSON.stringify(
        pkg
      )})'>⚠️ 待完善 (缺購買證明)</span> `;
    }

    if (boxes.length > 0) {
      const totalW = boxes.reduce(
        (sum, b) => sum + (parseFloat(b.weight) || 0),
        0
      );
      const displayFee = pkg.totalCalculatedFee || 0;

      if (pkg.isOversized)
        badgesHtml += `<span class="badge-alert small" style="background:#fff3e0; color:#e65100; border:1px solid #ff9800;">📏 超長</span> `;
      if (pkg.isOverweight)
        badgesHtml += `<span class="badge-alert small" style="background:#fff3e0; color:#e65100; border:1px solid #ff9800;">⚖️ 超重</span>`;

      infoHtml = `
        <div class="pkg-meta-info">
          <span>${boxes.length}箱 / ${totalW.toFixed(1)}kg</span>
          ${
            displayFee > 0
              ? `<span class="fee-highlight">估運費 $${displayFee.toLocaleString()}</span>`
              : ""
          }
        </div>
        <div class="pkg-badges" style="margin-top:4px;">${badgesHtml}</div>
      `;
    } else {
      if (badgesHtml) infoHtml = `<div class="pkg-badges">${badgesHtml}</div>`;
    }

    const categoryLabel = pkg.displayType || "一般家具";
    const isSpecial = categoryLabel.includes("特殊");
    const categoryBadgeStyle = isSpecial
      ? "background:#e8f0fe; color:#1a73e8; border:1px solid #c2dbfe;"
      : "background:#f8f9fa; color:#6c757d; border:1px solid #e9ecef;";

    const pkgStr = encodeURIComponent(JSON.stringify(pkg));
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td><input type="checkbox" class="package-checkbox" data-id="${pkg.id}" ${
      !isReady ? "disabled" : ""
    }></td>
      <td><span class="status-badge ${statusClass}">${statusText}</span></td>
      <td>
        <div style="margin-bottom:4px;">
            <span style="font-size:12px; padding:2px 6px; border-radius:4px; ${categoryBadgeStyle}">
                ${categoryLabel}
            </span>
        </div>
        <div style="font-weight:bold;">${pkg.productName}</div>
        <small style="color:#888; font-family:monospace;">${
          pkg.trackingNumber
        }</small>
      </td>
      <td>${infoHtml}</td>
      <td>
        <button class="btn btn-sm btn-primary" onclick='window.openPackageDetails("${pkgStr}")'>詳情</button>
        ${
          pkg.status === "PENDING" || pkg.status === "ARRIVED"
            ? `<button class="btn btn-sm btn-secondary btn-edit" style="margin-left:5px;">修改</button>`
            : ""
        }
        ${
          pkg.status === "PENDING"
            ? `<button class="btn btn-sm btn-danger btn-delete" style="margin-left:5px;">刪除</button>`
            : ""
        }
      </td>
    `;

    tr.querySelector(".package-checkbox")?.addEventListener("change", () => {
      if (typeof window.updateCheckoutBar === "function")
        window.updateCheckoutBar();
    });
    tr.querySelector(".btn-edit")?.addEventListener("click", function (e) {
      // 1. 強力隔離：防止事件傳到 document 或其他可能崩潰的全局監聽器
      e.preventDefault();
      e.stopPropagation();

      console.log("=== 修改按鈕點擊診斷開始 ===");
      console.log("當前包裹資料:", pkg);

      // 2. 狀態比對 (增加容錯處理)
      const rawStatus = pkg.status || "";
      const currentStatus = rawStatus.toString().toUpperCase().trim();
      console.log("處理後狀態值:", `"${currentStatus}"`);

      if (currentStatus === "ARRIVED") {
        const msg = "包裹已經入庫量完尺寸、重量，不予修改，如有問題請洽客服";
        console.log("判定為已入庫，嘗試跳出通知...");

        // 3. 檢查通知函式是否存在
        if (typeof window.showMessage === "function") {
          console.log("呼叫 window.showMessage...");
          window.showMessage(msg, "error");
        } else {
          console.error("錯誤：window.showMessage 函式不存在！");
          console.log("改用系統 alert 備案...");
          alert(msg);
        }

        console.log("=== 診斷結束：攔截成功 ===");
        return;
      }

      console.log("狀態非 ARRIVED，開啟編輯視窗...");
      if (typeof openEditPackageModal === "function") {
        openEditPackageModal(pkg);
      } else {
        console.error("錯誤：找不到 openEditPackageModal 函式");
      }
    });
    tr.querySelector(".btn-delete")?.addEventListener("click", () =>
      handleDeletePackage(pkg)
    );

    tableBody.appendChild(tr);
  });

  if (typeof window.updateCheckoutBar === "function")
    window.updateCheckoutBar();
}

// --- 2. 認領包裹邏輯 ---
async function handleClaimSubmit(e) {
  e.preventDefault();
  const btn = e.target.querySelector("button[type='submit']");
  btn.disabled = true;
  btn.textContent = "提交中...";

  const trackingNumber = document.getElementById("claim-tracking").value.trim();
  const file = document.getElementById("claim-proof").files[0];

  const fd = new FormData();
  fd.append("trackingNumber", trackingNumber);
  if (file) fd.append("proof", file);

  try {
    const res = await fetch(`${API_BASE_URL}/api/packages/claim`, {
      method: "POST",
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
      body: fd,
    });
    const data = await res.json();

    if (res.ok) {
      alert("認領成功！包裹已歸戶。");
      document.getElementById("claim-package-modal").style.display = "none";
      window.loadMyPackages();
      if (
        document.getElementById("unclaimed-section").style.display !== "none"
      ) {
        window.loadUnclaimedList();
      }
    } else {
      alert(data.message || "認領失敗");
    }
  } catch (err) {
    alert("網路錯誤");
  } finally {
    btn.disabled = false;
    btn.textContent = "確認認領";
  }
}

// --- 3. 批量預報邏輯 (Excel) ---
let bulkData = [];

function handleExcelUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (typeof XLSX === "undefined") {
    alert("Excel 解析元件尚未載入，請重新整理頁面或聯繫管理員。");
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(firstSheet, {
      header: ["trackingNumber", "productName", "quantity", "note"],
      range: 1,
    });

    bulkData = jsonData.filter((row) => row.trackingNumber && row.productName);

    const previewEl = document.getElementById("bulk-preview-area");
    if (previewEl) {
      previewEl.innerHTML = `
                <p>已讀取 <strong>${bulkData.length}</strong> 筆資料：</p>
                <ul style="max-height:150px; overflow-y:auto; font-size:12px; padding-left:20px;">
                    ${bulkData
                      .map(
                        (d) => `<li>${d.trackingNumber} - ${d.productName}</li>`
                      )
                      .join("")}
                </ul>
            `;
      previewEl.style.display = "block";
    }

    document.getElementById("btn-confirm-bulk").disabled =
      bulkData.length === 0;
  };
  reader.readAsArrayBuffer(file);
}

async function submitBulkForecast() {
  if (bulkData.length === 0) return;
  const btn = document.getElementById("btn-confirm-bulk");
  btn.disabled = true;
  btn.textContent = "匯入中...";

  try {
    const res = await fetch(`${API_BASE_URL}/api/packages/bulk-forecast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${window.dashboardToken}`,
      },
      body: JSON.stringify({ packages: bulkData }),
    });
    const data = await res.json();

    if (res.ok) {
      alert(data.message);
      document.getElementById("bulk-forecast-modal").style.display = "none";
      window.loadMyPackages();

      if (data.errors && data.errors.length > 0) {
        alert("部分失敗：\n" + data.errors.join("\n"));
      }
    } else {
      alert(data.message || "匯入失敗");
    }
  } catch (err) {
    alert("網路錯誤");
  } finally {
    btn.disabled = false;
    btn.textContent = "確認匯入";
    bulkData = [];
    document.getElementById("bulk-excel-file").value = "";
    document.getElementById("bulk-preview-area").style.display = "none";
  }
}

// --- 4. 異常處理 (Exception) ---
window.resolveException = function (pkgId) {
  const action = prompt(
    "請輸入處理方式代碼：\n1. 棄置 (DISCARD)\n2. 退回賣家 (RETURN)\n3. 確認無誤請發貨 (SHIP_ANYWAY)\n\n請輸入 1, 2 或 3："
  );

  let actionCode = "";
  if (action === "1") actionCode = "DISCARD";
  else if (action === "2") actionCode = "RETURN";
  else if (action === "3") actionCode = "SHIP_ANYWAY";
  else return;

  const note = prompt("備註說明 (例如：退回地址、或確認內容物)：");

  fetch(`${API_BASE_URL}/api/packages/${pkgId}/exception`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${window.dashboardToken}`,
    },
    body: JSON.stringify({ action: actionCode, note: note }),
  })
    .then((res) => res.json())
    .then((data) => {
      alert(data.message);
      window.loadMyPackages();
    })
    .catch(() => alert("操作失敗"));
};

// --- 5. 包裹詳情與透明化運費展示 (Updated: 智慧比對 + 強制前端重算 + Cloudinary Fix) ---
window.openPackageDetails = function (pkgDataStr) {
  try {
    const pkg = JSON.parse(decodeURIComponent(pkgDataStr));
    const modal = document.getElementById("package-details-modal");
    const boxesListContainer = document.getElementById("details-boxes-list");
    const imagesGallery = document.getElementById("details-images-gallery");

    const CONSTANTS = window.CONSTANTS || {
      VOLUME_DIVISOR: 28317,
      CBM_TO_CAI_FACTOR: 35.3,
      MINIMUM_CHARGE: 2000,
      OVERSIZED_LIMIT: 300,
      OVERSIZED_FEE: 800,
      OVERWEIGHT_LIMIT: 100,
      OVERWEIGHT_FEE: 800,
    };

    const arrivedBoxes = Array.isArray(pkg.arrivedBoxes)
      ? pkg.arrivedBoxes
      : [];
    let boxesHtml = "";
    let isPkgOversized = false;
    let isPkgOverweight = false;
    let calculatedTotalBaseFee = 0;

    let pkgRateConfig =
      window.RATES && window.RATES.general
        ? window.RATES.general
        : { weightRate: 22, volumeRate: 125 };
    const pType = pkg.displayType || "一般家具";

    if (window.RATES) {
      const normalize = (str) => (str || "").replace(/傢/g, "家").trim();
      const targetType = normalize(pType);

      let foundRate = Object.values(window.RATES).find(
        (r) => normalize(r.name) === targetType
      );

      if (!foundRate && window.RATES[pType]) {
        foundRate = window.RATES[pType];
      }

      if (foundRate) {
        pkgRateConfig = foundRate;
        console.log(`[Frontend] 費率匹配成功: ${pType} -> ${foundRate.name}`);
      } else {
        console.warn(
          `[Frontend] 找不到費率類型 '${pType}'，已降級使用一般家具費率。`
        );
      }
    }

    if (arrivedBoxes.length > 0) {
      boxesHtml = `<div class="detail-scroll-container">`;

      arrivedBoxes.forEach((box, idx) => {
        const l = parseFloat(box.length) || 0;
        const w = parseFloat(box.width) || 0;
        const h = parseFloat(box.height) || 0;
        const weight = parseFloat(box.weight) || 0;

        const isBoxOversized =
          l >= CONSTANTS.OVERSIZED_LIMIT ||
          w >= CONSTANTS.OVERSIZED_LIMIT ||
          h >= CONSTANTS.OVERSIZED_LIMIT;
        const isBoxOverweight = weight >= CONSTANTS.OVERWEIGHT_LIMIT;

        if (isBoxOversized) isPkgOversized = true;
        if (isBoxOverweight) isPkgOverweight = true;

        const DIVISOR = CONSTANTS.VOLUME_DIVISOR;
        const cai = box.cai || Math.ceil((l * w * h) / DIVISOR);

        const currentWRate = pkgRateConfig.weightRate;
        const currentVRate = pkgRateConfig.volumeRate;

        const recalcWtFee = Math.ceil(weight * currentWRate);
        const recalcVolFee = Math.ceil(cai * currentVRate);
        const recalcFinalFee = Math.max(recalcWtFee, recalcVolFee);
        const isVolWin = recalcVolFee >= recalcWtFee;

        calculatedTotalBaseFee += recalcFinalFee;

        boxesHtml += `
          <div class="detail-box-card">
            <div class="box-header">
              <span class="box-title">📦 第 ${idx + 1} 箱</span>
              <span class="box-fee">運費 $${recalcFinalFee.toLocaleString()}</span>
            </div>
            
            <div class="box-specs">
              <div class="spec-item"><span class="label">尺寸:</span> <span class="value">${l}x${w}x${h} cm</span></div>
              <div class="spec-item"><span class="label">重量:</span> <span class="value">${weight} kg</span></div>
              <div class="spec-item"><span class="label">材積:</span> <span class="value">${cai} 材</span></div>
            </div>

            ${
              isBoxOversized
                ? `<div class="alert-highlight"><i class="fas fa-exclamation-triangle"></i> 尺寸超長 (>=${CONSTANTS.OVERSIZED_LIMIT}cm)，將加收超長費 $${CONSTANTS.OVERSIZED_FEE}</div>`
                : ""
            }
            ${
              isBoxOverweight
                ? `<div class="alert-highlight"><i class="fas fa-weight-hanging"></i> 單件超重 (>=${CONSTANTS.OVERWEIGHT_LIMIT}kg)，將加收超重費 $${CONSTANTS.OVERWEIGHT_FEE}</div>`
                : ""
            }

            <div class="detail-calc-box">
                <div class="calc-comparison-row ${
                  !isVolWin ? "is-winner" : ""
                }">
                    <span class="calc-label">重量計費</span>
                    <span class="calc-formula">${weight}kg × ${currentWRate}</span>
                    <span class="calc-amount">$${recalcWtFee.toLocaleString()}</span>
                </div>
                
                <div class="calc-comparison-row ${isVolWin ? "is-winner" : ""}">
                    <span class="calc-label">材積計費</span>
                    <span class="calc-formula">${cai}材 × ${currentVRate}</span>
                    <span class="calc-amount">$${recalcVolFee.toLocaleString()}</span>
                </div>
            </div>
          </div>`;
      });
      boxesHtml += `</div>`;

      boxesHtml += `
        <div style="background:#f0f8ff; padding:15px; border-radius:8px; margin-top:15px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <span>基本運費總計 (${pType})</span>
                <strong>$${calculatedTotalBaseFee.toLocaleString()}</strong>
            </div>
            ${
              isPkgOversized
                ? `<div style="display:flex; justify-content:space-between; color:#e74a3b; font-size:13px;"><span>⚠️ 包含超長物品</span><span>(整單 +$${CONSTANTS.OVERSIZED_FEE})</span></div>`
                : ""
            }
            ${
              isPkgOverweight
                ? `<div style="display:flex; justify-content:space-between; color:#e74a3b; font-size:13px;"><span>⚠️ 包含超重物品</span><span>(整單 +$${CONSTANTS.OVERWEIGHT_FEE})</span></div>`
                : ""
            }
            <div style="font-size:12px; color:#888; margin-top:5px; text-align:right;">
                * 最終費用將於「合併打包」時計算，若未達低消 $${
                  CONSTANTS.MINIMUM_CHARGE
                } 將自動補足。
            </div>
        </div>
      `;
      boxesListContainer.innerHTML = boxesHtml;
    } else {
      boxesListContainer.innerHTML =
        '<div style="text-align:center; color:#999; padding:30px; background:#f9f9f9; border-radius:8px;"><i class="fas fa-ruler-combined" style="font-size:24px; margin-bottom:10px;"></i><br>倉庫尚未輸入測量數據</div>';
    }

    const totalWeight = arrivedBoxes.reduce(
      (sum, box) => sum + (parseFloat(box.weight) || 0),
      0
    );
    document.getElementById("details-total-weight").textContent =
      totalWeight.toFixed(1);

    document.getElementById(
      "details-total-fee"
    ).textContent = `NT$ ${calculatedTotalBaseFee.toLocaleString()}`;

    const warehouseImages = Array.isArray(pkg.warehouseImages)
      ? pkg.warehouseImages
      : [];
    imagesGallery.innerHTML = "";
    if (warehouseImages.length > 0) {
      warehouseImages.forEach((imgUrl) => {
        const img = document.createElement("img");
        img.src = imgUrl.startsWith("http")
          ? imgUrl
          : `${API_BASE_URL}${imgUrl}`;
        img.className = "warehouse-thumb";
        img.style.cssText =
          "width:100%; height:80px; object-fit:cover; border-radius:4px; cursor:zoom-in; border:1px solid #ddd;";
        img.onclick = () => window.open(img.src, "_blank");
        imagesGallery.appendChild(img);
      });
    } else {
      imagesGallery.innerHTML =
        "<p style='grid-column:1/-1; text-align:center; color:#999; font-size:13px;'>尚無照片</p>";
    }

    if (pkg.claimProof) {
      const proofSrc = pkg.claimProof.startsWith("http")
        ? pkg.claimProof
        : `${API_BASE_URL}${pkg.claimProof}`;
      imagesGallery.innerHTML += `<div style="grid-column:1/-1; margin-top:10px; border-top:1px dashed #ccc; padding-top:10px;">
            <p style="font-size:12px; color:#666;">認領憑證：</p>
            <img src="${proofSrc}" style="max-height:100px; cursor:pointer;" onclick="window.open(this.src)">
        </div>`;
    }

    modal.style.display = "flex";
  } catch (e) {
    console.error(e);
    alert("無法載入詳情");
  }
};

async function handleDeletePackage(pkg) {
  if (!confirm("確定刪除?")) return;
  try {
    await fetch(`${API_BASE_URL}/api/packages/${pkg.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    window.loadMyPackages();
    window.showMessage("已刪除", "success");
  } catch (e) {
    alert("刪除失敗");
  }
}

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
  container.innerHTML = "";
  currentEditPackageImages.forEach((url, idx) => {
    const src = url.startsWith("http") ? url : `${API_BASE_URL}${url}`;
    container.innerHTML += `<div style="position:relative; display:inline-block; margin:5px;"><img src="${src}" style="width:60px;height:60px;object-fit:cover;border-radius:4px;"><span onclick="removeEditImg(${idx})" style="position:absolute;top:-5px;right:-5px;background:red;color:white;border-radius:50%;width:20px;height:20px;text-align:center;cursor:pointer;">&times;</span></div>`;
  });
}

window.removeEditImg = function (idx) {
  currentEditPackageImages.splice(idx, 1);
  renderEditImages();
};

window.handleEditPackageSubmit = async function (e) {
  e.preventDefault();
  const id = document.getElementById("edit-package-id").value;
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
  const files = document.getElementById("edit-package-new-images").files;
  for (let f of files) fd.append("images", f);

  await fetch(`${API_BASE_URL}/api/packages/${id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${window.dashboardToken}` },
    body: fd,
  });
  document.getElementById("edit-package-modal").style.display = "none";
  window.loadMyPackages();
  window.showMessage("更新成功", "success");
};

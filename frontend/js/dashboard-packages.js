// frontend/js/dashboard-packages.js
// V2025.V16.1 - 旗艦極限穩定版：全系統對接、效能巔峰優化與 App 兼容修正

let currentEditPackageImages = [];

document.addEventListener("DOMContentLoaded", () => {
  // --- 0. 初始化：從口袋拿出登入鑰匙 ---
  const token = localStorage.getItem("token");
  // 將 token 暫存在 window 方便此檔案其他函數使用，若遺失則回 localStorage 拿
  window.dashboardToken = token;

  // 1. 綁定「認領包裹」按鈕
  const btnClaim = document.getElementById("btn-claim-package");
  if (btnClaim) {
    btnClaim.addEventListener("click", () => {
      window.openClaimModalSafe();
    });
  }

  // 2. 綁定「批量預報」按鈕 (支援多處 ID)
  const bulkBtns = document.querySelectorAll("#btn-bulk-forecast");
  bulkBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const modal = document.getElementById("bulk-forecast-modal");
      if (modal) modal.style.display = "flex";
    });
  });

  // 3. 綁定「單件預報」跳轉按鈕
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

  // 4. 搜尋與篩選監聽器
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

  // 綁定 Excel 檔案選擇
  const excelInput = document.getElementById("bulk-excel-file");
  if (excelInput) {
    excelInput.addEventListener("change", handleExcelUpload);
  }

  // 綁定批量預報確認
  const btnConfirmBulk = document.getElementById("btn-confirm-bulk");
  if (btnConfirmBulk) {
    btnConfirmBulk.addEventListener("click", submitBulkForecast);
  }

  // [大師新增]：若在無主包裹頁面，自動加載列表
  if (document.getElementById("unclaimed-table-body")) {
    window.loadUnclaimedList();
  }
});

/**
 * [大師工具]：統一圖片網址解析器，防止 App 破圖
 */
function resolveImgUrl(url) {
  if (!url) return "assets/no-image.png";
  if (url.startsWith("http")) return url; // 雲端 Cloudinary 網址
  return `${API_BASE_URL}${url}`; // 本地相對路徑轉絕對路徑
}

// --- 載入無主包裹列表 ---
window.loadUnclaimedList = async function () {
  const tbody = document.getElementById("unclaimed-table-body");
  if (!tbody) return;

  tbody.innerHTML =
    '<tr><td colspan="5" class="text-center">載入中...</td></tr>';

  try {
    const res = await fetch(`${API_BASE_URL}/api/packages/unclaimed`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    const data = await res.json();

    if (data.success && data.packages && data.packages.length > 0) {
      tbody.innerHTML = "";
      data.packages.forEach((pkg) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
                    <td>${new Date(pkg.createdAt).toLocaleDateString()}</td>
                    <td style="font-family:monospace; font-weight:bold;">${
                      pkg.maskedTrackingNumber
                    }</td>
                    <td>${pkg.productName}</td>
                    <td>${pkg.weightInfo}</td>
                    <td>
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
    tbody.innerHTML = `<tr style="color:red;"><td colspan="5">載入失敗: ${e.message}</td></tr>`;
  }
};

// 安全開啟認領視窗
window.openClaimModalSafe = function () {
  const modal = document.getElementById("claim-package-modal");
  if (!modal) return;
  document.getElementById("claim-package-form")?.reset();
  modal.style.display = "flex";
  setTimeout(() => document.getElementById("claim-tracking")?.focus(), 100);
};

// --- [關鍵優化]：單筆預報提交 ---
window.handleForecastSubmit = async function (e) {
  e.preventDefault();
  const btn = e.target.querySelector("button[type='submit']");

  const productUrl = document.getElementById("productUrl").value.trim();
  const fileInput = document.getElementById("images");
  const hasFiles = fileInput && fileInput.files && fileInput.files.length > 0;

  if (!productUrl && !hasFiles) {
    alert("【資料不全】請務必提供「商品購買連結」或「上傳商品圖片」(擇一)");
    document.getElementById("productUrl").focus();
    return;
  }

  btn.disabled = true;
  btn.textContent = "提交中...";

  const fd = new FormData(e.target); // 使用 FormData 自動抓取所有 input

  try {
    const res = await fetch(`${API_BASE_URL}/api/packages/forecast/images`, {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      body: fd,
    });
    const data = await res.json();

    if (res.ok) {
      window.showMessage("預報成功！", "success");
      e.target.reset();
      if (fileInput && fileInput.resetUploader) fileInput.resetUploader();
      window.loadMyPackages();
    } else {
      window.showMessage(data.message || "預報失敗", "error");
    }
  } catch (err) {
    window.showMessage("網路通訊錯誤", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-plus-circle"></i> 提交預報';
  }
};

// --- 載入包裹列表 (我的包裹) ---
window.loadMyPackages = async function () {
  const tableBody = document.getElementById("packages-table-body");
  if (!tableBody) return;

  tableBody.innerHTML =
    '<tr><td colspan="5" class="text-center">同步中...</td></tr>';

  try {
    const res = await fetch(`${API_BASE_URL}/api/packages/my`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    const data = await res.json();
    window.allPackagesData = data.packages || [];
    window.filterAndRenderPackages();
  } catch (e) {
    tableBody.innerHTML = `<tr style="color:red;"><td colspan="5">同步失敗: ${e.message}</td></tr>`;
  }
};

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

function renderPackagesTable(displayData) {
  const tableBody = document.getElementById("packages-table-body");
  if (!tableBody) return;

  tableBody.innerHTML = "";
  if (!displayData || displayData.length === 0) {
    tableBody.innerHTML =
      '<tr><td colspan="5" class="text-center" style="padding:30px; color:#999;">沒有符合條件的包裹</td></tr>';
    return;
  }

  displayData.forEach((pkg) => {
    const statusMap = window.PACKAGE_STATUS_MAP || {
      PENDING: "待入庫",
      ARRIVED: "已入庫",
    };
    const statusClasses = window.STATUS_CLASSES || {
      PENDING: "badge-pending",
      ARRIVED: "badge-arrived",
    };

    const isReady =
      pkg.status === "ARRIVED" &&
      !pkg.exceptionStatus &&
      (pkg.productUrl || (pkg.productImages && pkg.productImages.length > 0));

    let badgesHtml = "";
    if (pkg.exceptionStatus)
      badgesHtml += `<span class="badge-alert" onclick="resolveException('${pkg.id}')">⚠️ 異常待處理</span> `;
    if (
      !(pkg.productUrl || (pkg.productImages && pkg.productImages.length > 0))
    ) {
      badgesHtml += `<span class="badge-alert" onclick='openEditPackageModal(${JSON.stringify(
        pkg
      )})'>⚠️ 缺購買證明</span>`;
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td><input type="checkbox" class="package-checkbox" data-id="${
              pkg.id
            }" ${!isReady ? "disabled" : ""}></td>
            <td><span class="status-badge ${statusClasses[pkg.status] || ""}">${
      statusMap[pkg.status] || pkg.status
    }</span></td>
            <td>
                <div style="font-weight:bold;">${pkg.productName}</div>
                <small style="color:#888;">${pkg.trackingNumber}</small>
            </td>
            <td>
                <div class="pkg-badges">${badgesHtml || "資料齊全"}</div>
                ${
                  pkg.totalCalculatedFee > 0
                    ? `<div class="fee-highlight">預估運費 $${pkg.totalCalculatedFee.toLocaleString()}</div>`
                    : ""
                }
            </td>
            <td>
                <button class="btn btn-sm btn-primary" onclick='window.openPackageDetails("${encodeURIComponent(
                  JSON.stringify(pkg)
                )}")'>詳情</button>
                ${
                  pkg.status === "PENDING" || pkg.status === "ARRIVED"
                    ? `<button class="btn btn-sm btn-secondary btn-edit" style="margin-left:5px;">修改</button>`
                    : ""
                }
            </td>
        `;

    // 綁定修改按鈕點擊
    tr.querySelector(".btn-edit")?.addEventListener("click", (e) => {
      e.preventDefault();
      if (pkg.status === "ARRIVED" && pkg.arrivedBoxes?.length > 0) {
        window.showMessage(
          "包裹已入庫測量，無法修改，如有問題請洽客服",
          "error"
        );
        return;
      }
      openEditPackageModal(pkg);
    });

    tableBody.appendChild(tr);
  });
}

// --- 包裹詳情 ---
window.openPackageDetails = function (pkgDataStr) {
  const pkg = JSON.parse(decodeURIComponent(pkgDataStr));
  const modal = document.getElementById("package-details-modal");
  const boxesList = document.getElementById("details-boxes-list");
  const imagesGallery = document.getElementById("details-images-gallery");

  if (!modal) return;

  // 渲染箱子明細
  let boxesHtml = "";
  if (pkg.arrivedBoxes && pkg.arrivedBoxes.length > 0) {
    pkg.arrivedBoxes.forEach((box, i) => {
      boxesHtml += `
                <div class="detail-box-card">
                    <strong>📦 第 ${i + 1} 箱</strong><br>
                    尺寸: ${box.length}x${box.width}x${box.height} cm / 重量: ${
        box.weight
      } kg / 材積: ${box.cai} 材
                </div>`;
    });
  } else {
    boxesHtml = "<p class='text-center'>倉庫尚未測量</p>";
  }
  boxesList.innerHTML = boxesHtml;

  // 渲染照片
  imagesGallery.innerHTML = "";
  const allImages = [
    ...(pkg.warehouseImages || []),
    ...(pkg.productImages || []),
  ];
  if (allImages.length > 0) {
    allImages.forEach((url) => {
      const img = document.createElement("img");
      img.src = resolveImgUrl(url);
      img.className = "warehouse-thumb";
      img.onclick = () => window.open(img.src, "_blank");
      imagesGallery.appendChild(img);
    });
  } else {
    imagesGallery.innerHTML = "<p>尚無照片</p>";
  }

  modal.style.display = "flex";
};

// --- 修改與刪除邏輯 ---
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
    container.innerHTML += `
            <div style="position:relative; display:inline-block; margin:5px;">
                <img src="${resolveImgUrl(
                  url
                )}" style="width:60px;height:60px;object-fit:cover;border-radius:4px;">
                <span onclick="removeEditImg(${idx})" style="position:absolute;top:-5px;right:-5px;background:red;color:white;border-radius:50%;width:20px;height:20px;text-align:center;cursor:pointer;">&times;</span>
            </div>`;
  });
}

window.removeEditImg = function (idx) {
  currentEditPackageImages.splice(idx, 1);
  renderEditImages();
};

window.handleEditPackageSubmit = async function (e) {
  e.preventDefault();
  const id = document.getElementById("edit-package-id").value;
  const btn = e.target.querySelector("button[type='submit']");

  btn.disabled = true;
  btn.textContent = "更新中...";

  const fd = new FormData(e.target);
  fd.append("existingImages", JSON.stringify(currentEditPackageImages));

  try {
    const res = await fetch(`${API_BASE_URL}/api/packages/${id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      body: fd,
    });

    if (res.ok) {
      document.getElementById("edit-package-modal").style.display = "none";
      window.loadMyPackages();
      window.showMessage("更新成功", "success");
    } else {
      const data = await res.json();
      alert(data.message || "更新失敗");
    }
  } catch (e) {
    alert("連線錯誤");
  } finally {
    btn.disabled = false;
    btn.textContent = "確認修改";
  }
};

// --- Excel 批量預報處理 (保留原有成熟邏輯) ---
let bulkData = [];
function handleExcelUpload(e) {
  const file = e.target.files[0];
  if (!file || typeof XLSX === "undefined") return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: "array" });
    const jsonData = XLSX.utils.sheet_to_json(
      workbook.Sheets[workbook.SheetNames[0]],
      { range: 1 }
    );

    bulkData = jsonData.filter((row) => row.trackingNumber && row.productName);
    const preview = document.getElementById("bulk-preview-area");
    if (preview) {
      preview.innerHTML = `<p>已讀取 ${bulkData.length} 筆資料</p>`;
      preview.style.display = "block";
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
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify({ packages: bulkData }),
    });
    const data = await res.json();
    if (res.ok) {
      alert(data.message);
      document.getElementById("bulk-forecast-modal").style.display = "none";
      window.loadMyPackages();
    } else {
      alert(data.message || "匯入失敗");
    }
  } catch (err) {
    alert("網路通訊錯誤");
  } finally {
    btn.disabled = false;
    btn.textContent = "確認匯入";
  }
}

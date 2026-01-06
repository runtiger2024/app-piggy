// frontend/js/admin-parcels.js
// V2026.Enhanced.Pro - 正式商用高韌性增強版：保留所有業務邏輯並新增圖片預覽與費用明細

document.addEventListener("DOMContentLoaded", () => {
  const adminToken = localStorage.getItem("admin_token");
  if (!adminToken) return;

  // --- 變數定義 (完整保留) ---
  let currentPage = 1;
  const limit = 20;
  let currentStatus = "";
  let currentSearch = "";
  let selectedIds = new Set();
  let currentSubPackages = [];
  let currentExistingImages = [];
  let isCreateMode = false;

  // --- DOM 元素引用 ---
  const tableBody = document.getElementById("parcelsTableBody");
  const paginationDiv = document.getElementById("pagination");
  const modal = document.getElementById("parcel-modal");
  const form = document.getElementById("parcel-form");
  const selectAll = document.getElementById("select-all");
  const btnBulkDelete = document.getElementById("btn-bulk-delete");
  const statusFilterSelect = document.getElementById("status-filter");

  // --- 初始化執行 ---
  init();

  function init() {
    // [重點修復] 列表搜尋 - 加入安全檢查
    document.getElementById("btn-search")?.addEventListener("click", () => {
      currentSearch = document.getElementById("search-input")?.value || "";
      currentStatus = document.getElementById("status-filter")?.value || "";
      currentPage = 1;
      loadParcels();
    });

    // 打開新增視窗
    document
      .getElementById("btn-show-create-modal")
      ?.addEventListener("click", openCreateModal);

    // 匯出按鈕
    document
      .getElementById("btn-export")
      ?.addEventListener("click", exportPackages);

    // 彈窗關閉按鈕
    document.querySelectorAll(".modal-close-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (modal) modal.style.display = "none";
      });
    });

    // [新增] 倉庫照片上傳預覽監聽
    const warehouseImageInput = document.getElementById(
      "modal-warehouseImages"
    );
    if (warehouseImageInput) {
      warehouseImageInput.addEventListener("change", handleNewImagePreview);
    }

    // 全選功能
    if (selectAll) {
      selectAll.addEventListener("change", (e) => {
        document.querySelectorAll(".pkg-checkbox").forEach((cb) => {
          cb.checked = e.target.checked;
          toggleSelection(cb.value, e.target.checked);
        });
      });
    }

    // 批量刪除按鈕
    if (btnBulkDelete) {
      btnBulkDelete.addEventListener("click", performBulkDelete);
    }

    // [核心修正] 分箱按鈕 - 加入 if 判斷防止 null 報錯導致加載卡死
    const btnAddSub = document.getElementById("btn-add-sub-package");
    if (btnAddSub) {
      btnAddSub.addEventListener("click", () => {
        currentSubPackages.push({
          name: `分箱 ${currentSubPackages.length + 1}`,
          type: "general",
        });
        renderSubPackages();
        updateFeesOnInput();
      });
    }

    // 表單提交
    if (form) {
      form.addEventListener("submit", handleFormSubmit);
    }

    // 綁定「設為無主件」按鈕
    const btnSetUnclaimed = document.getElementById("btn-set-unclaimed");
    if (btnSetUnclaimed) {
      btnSetUnclaimed.addEventListener("click", setAsUnclaimedUser);
    }

    // 最後執行載入數據
    loadParcels();
  }

  // --- [新增] 處理新圖片上傳後的本地預覽 ---
  function handleNewImagePreview(e) {
    const files = Array.from(e.target.files);
    // 先渲染伺服器已有的圖片
    renderImages(currentExistingImages);

    // 追加入本地預覽
    const container = document.getElementById("modal-warehouse-images-preview");
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const div = document.createElement("div");
        div.style.position = "relative";
        div.innerHTML = `
          <img src="${event.target.result}" style="width:60px; height:60px; object-fit:cover; border-radius:4px; border:2px solid #28a745;">
          <div style="position:absolute; bottom:0; width:100%; background:rgba(40,167,69,0.8); color:white; font-size:10px; text-align:center;">新上傳</div>
        `;
        container.appendChild(div);
      };
      reader.readAsDataURL(file);
    });
  }

  // --- 更新下拉選單數字 (保留原邏輯) ---
  function updateStatusCounts(counts) {
    if (!counts || !statusFilterSelect) return;
    const options = statusFilterSelect.options;
    const total = counts["ALL"] || 0;

    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const statusKey = opt.value;

      if (!opt.hasAttribute("data-original-text")) {
        opt.setAttribute("data-original-text", opt.innerText);
      }
      const originalText = opt.getAttribute("data-original-text");

      if (statusKey === "") {
        opt.innerText = `${originalText} (${total})`;
      } else {
        const count = counts[statusKey] || 0;
        opt.innerText = `${originalText} (${count})`;
      }
    }
  }

  // --- 快速設定為無主件 (保留原邏輯) ---
  async function setAsUnclaimedUser() {
    const searchInput = document.getElementById("admin-customer-search");
    const btn = document.getElementById("btn-set-unclaimed");
    if (!btn) return;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 搜尋中...';

    try {
      const keyword = "unclaimed@runpiggy.com";
      const res = await fetch(
        `${API_BASE_URL}/api/admin/users/list?search=${encodeURIComponent(
          keyword
        )}`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      const data = await res.json();

      if (data.users && data.users.length > 0) {
        const user = data.users[0];
        selectUser(user.id, user.email, user.name);
        if (searchInput) {
          searchInput.style.backgroundColor = "#fff3cd";
          setTimeout(() => (searchInput.style.backgroundColor = ""), 1000);
        }
      } else {
        alert("找不到官方無主帳號 (unclaimed@runpiggy.com)。");
      }
    } catch (e) {
      console.error(e);
      alert("連線錯誤，無法設定無主件");
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }

  // --- 數據載入 (保留原邏輯) ---
  async function loadParcels() {
    if (!tableBody) return;
    tableBody.innerHTML =
      '<tr><td colspan="8" class="text-center p-3"><i class="fas fa-spinner fa-spin"></i> 數據載入中...</td></tr>';
    selectedIds.clear();
    updateBulkUI();

    try {
      let url = `${API_BASE_URL}/api/admin/packages/all?page=${currentPage}&limit=${limit}`;
      if (currentStatus) url += `&status=${currentStatus}`;
      if (currentSearch)
        url += `&search=${encodeURIComponent(currentSearch.trim())}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message);
      renderTable(data.packages || []);
      renderPagination(data.pagination);

      if (data.statusCounts) {
        updateStatusCounts(data.statusCounts);
      }
    } catch (e) {
      tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-danger p-3">載入錯誤: ${e.message}</td></tr>`;
    }
  }

  // --- 匯出功能 (完整保留) ---
  async function exportPackages() {
    const btn = document.getElementById("btn-export");
    if (!btn) return;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 匯出中...';

    try {
      let url = `${API_BASE_URL}/api/admin/packages/export?`;
      if (currentStatus) url += `status=${currentStatus}&`;
      if (currentSearch)
        url += `search=${encodeURIComponent(currentSearch.trim())}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const json = await res.json();
      if (!json.success || !json.data) throw new Error("匯出失敗");

      const items = json.data;
      if (items.length === 0) return alert("無資料可匯出");

      const replacer = (key, value) => (value === null ? "" : value);
      const header = Object.keys(items[0]);
      const csv = [
        header.join(","),
        ...items.map((row) =>
          header
            .map((fieldName) => JSON.stringify(row[fieldName], replacer))
            .join(",")
        ),
      ].join("\r\n");

      const blob = new Blob(["\uFEFF" + csv], {
        type: "text/csv;charset=utf-8;",
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `packages_export_${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      link.click();
    } catch (e) {
      alert("匯出錯誤: " + e.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-file-export"></i> 匯出 CSV';
    }
  }

  // --- 表格渲染 (完整保留超重/超長判定) ---
  function renderTable(packages) {
    if (!tableBody) return;
    tableBody.innerHTML = "";
    if (packages.length === 0) {
      tableBody.innerHTML =
        '<tr><td colspan="8" class="text-center p-3">目前無包裹資料</td></tr>';
      return;
    }

    const statusClasses = {
      PENDING: "status-PENDING",
      ARRIVED: "status-ARRIVED",
      IN_SHIPMENT: "status-IN_SHIPMENT",
      COMPLETED: "status-COMPLETED",
      CANCELLED: "status-CANCELLED",
    };
    const statusTextMap = window.PACKAGE_STATUS_MAP || {};
    const LIMITS = {
      OVERSIZED: window.CONSTANTS?.OVERSIZED_LIMIT || 300,
      OVERWEIGHT: window.CONSTANTS?.OVERWEIGHT_LIMIT || 100,
    };

    packages.forEach((pkg) => {
      const tr = document.createElement("tr");
      const statusClass = statusClasses[pkg.status] || "status-PENDING";
      const statusText = statusTextMap[pkg.status] || pkg.status;

      let weightInfo = "-";
      let alertBadges = "";

      if (pkg.claimProof) {
        alertBadges += `<span class="badge" style="background-color:#6610f2; color:white; font-size:11px; padding:2px 6px; margin-right:2px; border-radius:4px;">🙋‍♂️ 已認領</span> `;
      }

      if (
        pkg.user &&
        (pkg.user.email === "unclaimed@runpiggy.com" ||
          pkg.user.email === "admin@runpiggy.com")
      ) {
        alertBadges += `<span class="badge" style="background-color:#6c757d; color:white; font-size:11px; padding:2px 6px; margin-right:2px; border-radius:4px;">❓ 無主</span> `;
      }

      if (pkg.arrivedBoxesJson && pkg.arrivedBoxesJson.length > 0) {
        let isOversized = false;
        let isOverweight = false;
        const totalW = pkg.arrivedBoxesJson.reduce((sum, b) => {
          const l = parseFloat(b.length) || 0,
            w = parseFloat(b.width) || 0,
            h = parseFloat(b.height) || 0,
            wt = parseFloat(b.weight) || 0;
          if (
            l >= LIMITS.OVERSIZED ||
            w >= LIMITS.OVERSIZED ||
            h >= LIMITS.OVERSIZED
          )
            isOversized = true;
          if (wt >= LIMITS.OVERWEIGHT) isOverweight = true;
          return sum + wt;
        }, 0);

        weightInfo = `${totalW.toFixed(1)} kg / ${
          pkg.arrivedBoxesJson.length
        }箱`;
        if (isOversized)
          alertBadges += `<span class="badge" style="background-color:#dc3545; color:white; font-size:11px; padding:2px 6px; border-radius:4px;">⚠️ 超長</span> `;
        if (isOverweight)
          alertBadges += `<span class="badge" style="background-color:#dc3545; color:white; font-size:11px; padding:2px 6px; border-radius:4px;">⚠️ 超重</span>`;
      }

      const pkgStr = encodeURIComponent(JSON.stringify(pkg));

      tr.innerHTML = `
        <td><input type="checkbox" class="pkg-checkbox" value="${pkg.id}"></td>
        <td>${new Date(pkg.createdAt).toLocaleDateString()}</td>
        <td><strong>${
          pkg.user ? pkg.user.name : "-"
        }</strong><br><small class="text-gray-500">${
        pkg.user ? pkg.user.email : ""
      }</small></td>
        <td><span style="font-family:monospace; font-weight:bold;">${
          pkg.trackingNumber
        }</span></td>
        <td>${pkg.productName}</td>
        <td>${weightInfo}<div style="margin-top:2px;">${alertBadges}</div></td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td><button class="btn btn-primary btn-sm" onclick="openEditModal('${pkgStr}')"><i class="fas fa-edit"></i> 編輯</button></td>
      `;

      tr.querySelector(".pkg-checkbox")?.addEventListener("change", (e) =>
        toggleSelection(pkg.id, e.target.checked)
      );
      tableBody.appendChild(tr);
    });
  }

  function renderPagination(pg) {
    if (!paginationDiv) return;
    paginationDiv.innerHTML = "";
    if (pg.totalPages <= 1) return;

    const createBtn = (text, page, active = false, disabled = false) => {
      const btn = document.createElement("button");
      btn.className = `btn btn-sm ${active ? "btn-primary" : "btn-light"}`;
      btn.textContent = text;
      btn.disabled = disabled;
      if (!disabled)
        btn.onclick = () => {
          currentPage = page;
          loadParcels();
        };
      return btn;
    };

    paginationDiv.appendChild(
      createBtn("上一頁", currentPage - 1, false, currentPage === 1)
    );
    paginationDiv.appendChild(
      createBtn(`${currentPage} / ${pg.totalPages}`, currentPage, true, true)
    );
    paginationDiv.appendChild(
      createBtn("下一頁", currentPage + 1, false, currentPage === pg.totalPages)
    );
  }

  // --- 編輯彈窗 (完整保留認領證明與 Cloudinary 修復) ---
  function openEditModal(pkgStr) {
    isCreateMode = false;
    const pkg = JSON.parse(decodeURIComponent(pkgStr));

    const titleEl = document.getElementById("modal-title");
    if (titleEl) titleEl.textContent = "編輯包裹 / 入庫作業";

    const pkgIdInput = document.getElementById("modal-pkg-id");
    if (pkgIdInput) pkgIdInput.value = pkg.id;

    const userInfoSection = document.getElementById("user-info-section");
    if (userInfoSection) userInfoSection.style.display = "block";
    const userSearchSection = document.getElementById("create-user-search");
    if (userSearchSection) userSearchSection.style.display = "none";

    let claimHtml = "";
    if (pkg.claimProof) {
      const proofUrl = pkg.claimProof.startsWith("http")
        ? pkg.claimProof
        : `${API_BASE_URL}${pkg.claimProof}`;
      claimHtml = `
            <div style="margin-top:5px; padding:5px; background:#e6f7ff; border:1px solid #1890ff; border-radius:4px;">
                <strong style="color:#1890ff;">🙋‍♂️ 此包裹已被認領</strong><br>
                <a href="${proofUrl}" target="_blank" style="font-size:12px; text-decoration:underline;">查看購物證明截圖</a>
            </div>`;
    }

    const userDisplay = document.getElementById("modal-user-display");
    if (userDisplay)
      userDisplay.innerHTML = `<strong>${pkg.user?.name}</strong> (${pkg.user?.email}) ${claimHtml}`;

    const setInput = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val || "";
    };
    setInput("modal-trackingNumber", pkg.trackingNumber);
    setInput("modal-productName", pkg.productName);
    setInput("modal-quantity", pkg.quantity);
    setInput("modal-note", pkg.note);
    setInput("modal-status", pkg.status);

    const urlDisplay = document.getElementById("modal-productUrl-display");
    if (urlDisplay) {
      urlDisplay.innerHTML = pkg.productUrl
        ? `<a href="${pkg.productUrl}" target="_blank" class="text-primary">開啟連結</a>`
        : '<span class="text-muted">未提供</span>';
    }

    const clientImgDiv = document.getElementById("modal-client-images-preview");
    if (clientImgDiv) {
      clientImgDiv.innerHTML = "";
      if (pkg.productImages && pkg.productImages.length > 0) {
        pkg.productImages.forEach((img) => {
          const fullUrl = img.startsWith("http")
            ? img
            : `${API_BASE_URL}${img}`;
          clientImgDiv.innerHTML += `<a href="${fullUrl}" target="_blank"><img src="${fullUrl}" style="width:80px; height:80px; object-fit:cover; border-radius:4px;"></a>`;
        });
      }
    }

    const boxesSection = document.getElementById("boxes-section");
    if (boxesSection) boxesSection.style.display = "block";

    currentSubPackages = pkg.arrivedBoxesJson || [
      {
        name: "分箱 1",
        type: "general",
        weight: "",
        length: "",
        width: "",
        height: "",
      },
    ];
    renderSubPackages();
    updateFeesOnInput();

    currentExistingImages = pkg.warehouseImages || [];
    renderImages(currentExistingImages);

    if (modal) modal.style.display = "flex";
  }
  window.openEditModal = openEditModal;

  // --- 新增彈窗 ---
  function openCreateModal() {
    isCreateMode = true;
    if (form) form.reset();
    const titleEl = document.getElementById("modal-title");
    if (titleEl) titleEl.textContent = "代客預報 (或新增無主件)";
    const pkgIdInput = document.getElementById("modal-pkg-id");
    if (pkgIdInput) pkgIdInput.value = "";

    const userSearch = document.getElementById("create-user-search");
    if (userSearch) userSearch.style.display = "block";
    const userDisplay = document.getElementById("modal-user-display");
    if (userDisplay) userDisplay.innerHTML = "";
    const boxesSection = document.getElementById("boxes-section");
    if (boxesSection) boxesSection.style.display = "none";
    const statusSelect = document.getElementById("modal-status");
    if (statusSelect) statusSelect.value = "PENDING";

    if (modal) modal.style.display = "flex";
  }
  window.openCreateModal = openCreateModal;

  // --- 渲染分箱 (完整保留樣式與按鈕) ---
  function renderSubPackages() {
    const list = document.getElementById("sub-package-list");
    if (!list) return;
    list.innerHTML = "";
    currentSubPackages.forEach((box, idx) => {
      const div = document.createElement("div");
      div.className = "card mb-2 p-2";
      div.style.backgroundColor = "#fff";
      div.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <strong>#${idx + 1}</strong>
                <button type="button" class="btn btn-sm btn-danger py-0" onclick="removeBox(${idx})">&times;</button>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">
                <input class="form-control sub-pkg-name" value="${
                  box.name || ""
                }" placeholder="名稱">
                <select class="form-control sub-pkg-type">
                    <option value="general" ${
                      box.type === "general" ? "selected" : ""
                    }>一般家具</option>
                    <option value="special_a" ${
                      box.type === "special_a" ? "selected" : ""
                    }>特殊A</option>
                    <option value="special_b" ${
                      box.type === "special_b" ? "selected" : ""
                    }>特殊B</option>
                    <option value="special_c" ${
                      box.type === "special_c" ? "selected" : ""
                    }>特殊C</option>
                </select>
                <input type="number" class="form-control sub-pkg-weight" value="${
                  box.weight || ""
                }" placeholder="重kg">
                <div style="display:flex; gap:2px;">
                    <input type="number" class="form-control sub-pkg-l" value="${
                      box.length || ""
                    }" placeholder="L">
                    <input type="number" class="form-control sub-pkg-w" value="${
                      box.width || ""
                    }" placeholder="W">
                    <input type="number" class="form-control sub-pkg-h" value="${
                      box.height || ""
                    }" placeholder="H">
                </div>
            </div>
            <div class="calc-formula-box sub-pkg-fee-display"></div>
        `;
      div.addEventListener("input", updateFeesOnInput);
      list.appendChild(div);
    });
  }

  window.removeBox = function (idx) {
    currentSubPackages.splice(idx, 1);
    renderSubPackages();
    updateFeesOnInput();
  };

  // --- [關鍵優化] 費率計算 (加入超重/超長判定與明細顯示) ---
  function updateFeesOnInput() {
    const rows = document.querySelectorAll("#sub-package-list > div");
    const RATES = window.RATES || {};
    const CONSTANTS = window.CONSTANTS || {
      VOLUME_DIVISOR: 28317,
      MINIMUM_CHARGE: 2000,
      OVERSIZED_LIMIT: 300,
      OVERWEIGHT_LIMIT: 100,
      OVERSIZED_FEE: 500, // 預設超長費
      OVERWEIGHT_FEE: 500, // 預設超重費
    };

    let baseTotal = 0;
    let extraOversizedTotal = 0;
    let extraOverweightTotal = 0;
    let hasValidBox = false;

    rows.forEach((row, idx) => {
      const type = row.querySelector(".sub-pkg-type")?.value;
      const w = parseFloat(row.querySelector(".sub-pkg-weight")?.value) || 0;
      const l = parseFloat(row.querySelector(".sub-pkg-l")?.value) || 0;
      const wd = parseFloat(row.querySelector(".sub-pkg-w")?.value) || 0;
      const h = parseFloat(row.querySelector(".sub-pkg-h")?.value) || 0;

      currentSubPackages[idx] = {
        name: row.querySelector(".sub-pkg-name")?.value,
        type,
        weight: w,
        length: l,
        width: wd,
        height: h,
      };
      const displayDiv = row.querySelector(".sub-pkg-fee-display");

      if (w > 0 && l > 0 && wd > 0 && h > 0) {
        hasValidBox = true;
        const rate = RATES[type] || { weightRate: 0, volumeRate: 0 };
        const rawCai = (l * wd * h) / CONSTANTS.VOLUME_DIVISOR;
        const cai = Math.ceil(rawCai);
        const volFee = Math.round(cai * rate.volumeRate);
        const wtFee = Math.round((Math.ceil(w * 10) / 10) * rate.weightRate);

        // 基礎費用
        const boxBaseFee = Math.max(volFee, wtFee);
        baseTotal += boxBaseFee;

        // 判定超標狀況
        let boxAlerts = "";
        if (
          l >= CONSTANTS.OVERSIZED_LIMIT ||
          wd >= CONSTANTS.OVERSIZED_LIMIT ||
          h >= CONSTANTS.OVERSIZED_LIMIT
        ) {
          extraOversizedTotal += parseFloat(CONSTANTS.OVERSIZED_FEE || 0);
          boxAlerts += `<span style="color:#dc3545; font-weight:bold; margin-left:8px;">⚠️ 超長 (+$${CONSTANTS.OVERSIZED_FEE})</span>`;
        }
        if (w >= CONSTANTS.OVERWEIGHT_LIMIT) {
          extraOverweightTotal += parseFloat(CONSTANTS.OVERWEIGHT_FEE || 0);
          boxAlerts += `<span style="color:#fd7e14; font-weight:bold; margin-left:8px;">⚠️ 超重 (+$${CONSTANTS.OVERWEIGHT_FEE})</span>`;
        }

        if (displayDiv)
          displayDiv.innerHTML = `<small>實重: $${wtFee} | 材積: $${volFee}${boxAlerts}</small>`;
      }
    });

    const subTotal = baseTotal + extraOversizedTotal + extraOverweightTotal;
    const finalTotal = Math.max(
      subTotal,
      subTotal > 0 ? CONSTANTS.MINIMUM_CHARGE : 0
    );

    const feeInput = document.getElementById("modal-shippingFee");
    if (feeInput) feeInput.value = finalTotal;

    // 更新明細提示
    const tipEl = document.getElementById("modal-fee-tips");
    if (tipEl) {
      let detailStr = `基礎: $${baseTotal}`;
      if (extraOversizedTotal > 0)
        detailStr += ` + 超長費 $${extraOversizedTotal}`;
      if (extraOverweightTotal > 0)
        detailStr += ` + 超重費 $${extraOverweightTotal}`;
      if (subTotal > 0 && subTotal < CONSTANTS.MINIMUM_CHARGE) {
        detailStr += ` (未達低消補差額 $${
          CONSTANTS.MINIMUM_CHARGE - subTotal
        })`;
      }
      tipEl.textContent = `明細：${detailStr}`;
    }

    const statusSelect = document.getElementById("modal-status");
    if (hasValidBox && statusSelect && statusSelect.value === "PENDING") {
      statusSelect.value = "ARRIVED";
      statusSelect.style.backgroundColor = "#d4edda";
    }
  }

  function renderImages(images) {
    const container = document.getElementById("modal-warehouse-images-preview");
    if (!container) return;
    container.innerHTML = "";
    images.forEach((url, idx) => {
      const src = url.startsWith("http") ? url : `${API_BASE_URL}${url}`;
      container.innerHTML += `
            <div style="position:relative;">
                <img src="${src}" style="width:60px; height:60px; object-fit:cover; border-radius:4px; border:1px solid #ddd;">
                <div onclick="deleteImage(${idx})" style="position:absolute; top:-5px; right:-5px; background:red; color:white; border-radius:50%; width:18px; height:18px; text-align:center; line-height:18px; cursor:pointer; font-size:12px;">&times;</div>
            </div>`;
    });
  }

  window.deleteImage = function (idx) {
    currentExistingImages.splice(idx, 1);
    renderImages(currentExistingImages);
  };

  // --- 表單提交 (完整保留 FormData 與 路徑邏輯) ---
  async function handleFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById("modal-pkg-id").value;
    const fd = new FormData();
    fd.append(
      "trackingNumber",
      document.getElementById("modal-trackingNumber").value
    );
    fd.append(
      "productName",
      document.getElementById("modal-productName").value
    );
    fd.append("quantity", document.getElementById("modal-quantity").value);
    fd.append("note", document.getElementById("modal-note").value);

    const files = document.getElementById("modal-warehouseImages")?.files;
    if (files)
      for (let f of files)
        fd.append(isCreateMode ? "images" : "warehouseImages", f);

    try {
      let url = isCreateMode
        ? `${API_BASE_URL}/api/admin/packages/create`
        : `${API_BASE_URL}/api/admin/packages/${id}/details`;
      let method = isCreateMode ? "POST" : "PUT";

      if (isCreateMode) {
        const uid = document.getElementById("admin-create-userId").value;
        if (!uid) return alert("請選擇會員");
        fd.append("userId", uid);
      } else {
        fd.append("status", document.getElementById("modal-status").value);
        fd.append("boxesData", JSON.stringify(currentSubPackages));
        fd.append("existingImages", JSON.stringify(currentExistingImages));
      }

      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${adminToken}` },
        body: fd,
      });
      if (res.ok) {
        alert("操作成功");
        if (modal) modal.style.display = "none";
        loadParcels();
        // [聯動更新] 紅圈通知
        if (typeof window.refreshAdminBadges === "function")
          window.refreshAdminBadges();
      }
    } catch (e) {
      alert("連線錯誤");
    }
  }

  // --- 會員搜尋 ---
  const customerSearch = document.getElementById("admin-customer-search");
  const resultDiv = document.getElementById("admin-customer-search-results");
  if (customerSearch && resultDiv) {
    customerSearch.addEventListener("input", async (e) => {
      const val = e.target.value.trim();
      if (val.length < 2) {
        resultDiv.style.display = "none";
        return;
      }
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/admin/users/list?search=${val}`,
          { headers: { Authorization: `Bearer ${adminToken}` } }
        );
        const d = await res.json();
        if (d.users?.length > 0) {
          resultDiv.innerHTML = d.users
            .map(
              (u) =>
                `<div class="p-2 border-bottom" style="cursor:pointer;" onclick="selectUser('${u.id}', '${u.email}', '${u.name}')">${u.name} (${u.email})</div>`
            )
            .join("");
          resultDiv.style.display = "block";
        }
      } catch (e) {}
    });
  }

  window.selectUser = function (id, email, name) {
    const uidInput = document.getElementById("admin-create-userId");
    if (uidInput) uidInput.value = id;
    if (customerSearch) customerSearch.value = `${name} (${email})`;
    if (resultDiv) resultDiv.style.display = "none";
  };

  function toggleSelection(id, checked) {
    if (checked) selectedIds.add(id);
    else selectedIds.delete(id);
    updateBulkUI();
  }
  function updateBulkUI() {
    if (btnBulkDelete) {
      btnBulkDelete.style.display =
        selectedIds.size > 0 ? "inline-block" : "none";
      btnBulkDelete.textContent = `批量刪除 (${selectedIds.size})`;
    }
  }

  async function performBulkDelete() {
    if (selectedIds.size === 0) return;
    if (prompt("輸入 DELETE 確認") !== "DELETE") return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/packages/bulk-delete`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ids: Array.from(selectedIds) }),
        }
      );
      if (res.ok) {
        loadParcels();
        if (typeof window.refreshAdminBadges === "function")
          window.refreshAdminBadges();
      }
    } catch (e) {
      alert("錯誤");
    }
  }
});

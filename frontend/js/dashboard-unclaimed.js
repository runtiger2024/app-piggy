// frontend/js/dashboard-unclaimed.js
// V26.2 - Latest: 隱私遮罩強化 & 嚴格認領校驗版
// 負責無主包裹的顯示、搜尋、認領與圖片預覽邏輯

// --- 函式定義 ---

// 1. 載入與渲染 (採用 Cache-First 策略，消除切換 Tab 時的延遲)
window.loadUnclaimedList = async function (forceRefresh = false) {
  const container = document.getElementById("unclaimed-list-container");
  const tbody = document.getElementById("unclaimed-table-body");

  // 如果是從 dashboard-main.js 呼叫，優先確保容器存在
  if (!tbody && !container) return;

  // [優化] 快取優先策略
  if (
    !forceRefresh &&
    window.unclaimedCache &&
    window.unclaimedCache.length > 0
  ) {
    renderUnclaimed(window.unclaimedCache);
    fetchUnclaimedData(true); // 背景靜默更新 (SWR)
    return;
  }

  // 初次載入顯示動畫
  if (tbody) {
    tbody.innerHTML =
      '<tr><td colspan="5" class="text-center" style="padding:40px;"><i class="fas fa-spinner fa-spin"></i> 正在搜尋無主包裹...</td></tr>';
  } else if (container) {
    container.innerHTML =
      '<div style="text-align:center; padding:40px; color:#999;"><i class="fas fa-spinner fa-spin"></i> 載入中...</div>';
  }

  await fetchUnclaimedData(false);
};

// 獨立 API 請求
async function fetchUnclaimedData(isBackgroundUpdate) {
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
    console.error("載入無主包裹失敗", e);
    if (!isBackgroundUpdate) {
      const tbody = document.getElementById("unclaimed-table-body");
      if (tbody)
        tbody.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">載入失敗，請檢查網路</td></tr>`;
    }
  }
}

// 2. 渲染邏輯 (支援表格與卡片兩種模式，提升行動端體驗)
function renderUnclaimed(list, isFiltering = false) {
  const tbody = document.getElementById("unclaimed-table-body");
  const container = document.getElementById("unclaimed-list-container"); // 推薦使用格狀佈局

  if (list.length === 0) {
    const emptyHtml = `<div style="text-align:center; padding:40px; color:#999;"><i class="fas fa-box-open" style="font-size:30px;"></i><br>${
      isFiltering ? "找不到符合單號的包裹" : "目前沒有無主包裹"
    }</div>`;
    if (tbody) tbody.innerHTML = `<tr><td colspan="5">${emptyHtml}</td></tr>`;
    if (container) container.innerHTML = emptyHtml;
    return;
  }

  // 渲染至傳統表格 (相容舊版)
  if (tbody) {
    tbody.innerHTML = list
      .map(
        (pkg) => `
            <tr>
                <td>${new Date(pkg.createdAt).toLocaleDateString()}</td>
                <td style="font-family:monospace; font-weight:bold; color:#d32f2f;">${
                  pkg.maskedTrackingNumber || pkg.trackingNumber
                }</td>
                <td>${pkg.productName}</td>
                <td>${
                  pkg.weightInfo || (pkg.weight ? pkg.weight + " kg" : "--")
                }</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="window.initiateClaim('${
                      pkg.id
                    }')">
                        <i class="fas fa-hand-paper"></i> 認領
                    </button>
                </td>
            </tr>
        `
      )
      .join("");
  }

  // [新功能] 渲染至卡片容器 (美化版)
  if (container) {
    container.innerHTML = list
      .map(
        (pkg) => `
            <div class="unclaimed-card">
                <div class="pkg-image-wrapper" onclick="window.previewImage('${
                  pkg.imageUrl ||
                  (pkg.warehouseImages ? pkg.warehouseImages[0] : "")
                }')">
                    <img src="${
                      pkg.imageUrl ||
                      (pkg.warehouseImages
                        ? pkg.warehouseImages[0]
                        : "assets/img/no-image.png")
                    }" alt="包裹照片" loading="lazy">
                    <div class="img-overlay"><i class="fas fa-search-plus"></i> 查看照片</div>
                </div>
                <div class="pkg-details">
                    <div class="pkg-tracking"><small>單號</small><strong>${
                      pkg.maskedTrackingNumber || pkg.trackingNumber
                    }</strong></div>
                    <div class="pkg-info">
                        <span><i class="fas fa-weight-hanging"></i> ${
                          pkg.weight || "--"
                        } kg</span>
                        <span><i class="fas fa-calendar-alt"></i> ${new Date(
                          pkg.createdAt
                        ).toLocaleDateString()}</span>
                    </div>
                    <button class="btn-claim" onclick="window.initiateClaim('${
                      pkg.id
                    }')">我要認領</button>
                </div>
            </div>
        `
      )
      .join("");
  }
}

// 3. 搜尋過濾
window.filterUnclaimed = function (keyword) {
  const kw = keyword.trim().toLowerCase();
  if (!window.unclaimedCache) return;
  const filtered = window.unclaimedCache.filter(
    (p) =>
      (p.trackingNumber && p.trackingNumber.toLowerCase().includes(kw)) ||
      (p.productName && p.productName.toLowerCase().includes(kw)) ||
      (p.maskedTrackingNumber &&
        p.maskedTrackingNumber.toLowerCase().includes(kw))
  );
  renderUnclaimed(filtered, true);
};

// 4. 認領邏輯 (嚴格驗證：強制使用者手動輸入完整單號)
window.initiateClaim = async function (id) {
  const modal = document.getElementById("claim-package-modal");
  if (modal) {
    // 開啟彈窗時重置表單與預覽圖
    const form = document.getElementById("claim-package-form");
    if (form) form.reset();

    const preview = document.getElementById("claim-proof-preview");
    if (preview) {
      preview.src = "";
      preview.style.display = "none";
    }

    // [重點優化]：不自動帶入單號，要求客戶必須手動輸入完整單號才能認領
    const input = document.getElementById("claim-tracking");
    if (input) {
      input.value = "";
      input.readOnly = false; // 確保可以輸入
      input.placeholder = "請輸入完整單號以進行認領校驗";
    }
    modal.style.display = "flex";
    return;
  }

  // 退回備用方案 (prompt)
  const fullTracking = prompt("認領包裹：請輸入您要認領的完整物流單號");
  if (!fullTracking) return;
  const desc = prompt("請輸入包裹內容物描述（如：衣服、桌子）：");
  if (!desc) return;
  submitClaimAPI(fullTracking, desc);
};

// 處理原有的認領表單提交
window.handleClaimSubmit = async function (e) {
  e.preventDefault();
  const btn = e.target.querySelector("button[type='submit']");
  const tracking = document.getElementById("claim-tracking").value.trim();

  if (!tracking) {
    alert("請輸入完整物流單號");
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 處理中...';

  const fd = new FormData();
  fd.append("trackingNumber", tracking);
  const proofFile = document.getElementById("claim-proof")?.files[0];
  if (proofFile) fd.append("proof", proofFile);

  try {
    const res = await fetch(`${API_BASE_URL}/api/packages/claim`, {
      method: "POST",
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
      body: fd,
    });
    const data = await res.json();

    if (res.ok) {
      window.showMessage("認領成功！包裹已歸入您的帳戶。", "success");
      document.getElementById("claim-package-modal").style.display = "none";

      // 成功後清除預覽圖
      const preview = document.getElementById("claim-proof-preview");
      if (preview) preview.style.display = "none";

      // 樂觀更新：從快取中移除該筆（需根據輸入的完整單號匹配，或直接刷新清單）
      window.loadUnclaimedList(true);
      window.loadMyPackages(); // 重新整理「我的包裹」清單
    } else {
      // 顯示後端回傳的錯誤（如：找不到此單號）
      alert(data.message || "認領失敗，請檢查單號是否正確");
    }
  } catch (err) {
    alert("網路錯誤");
  } finally {
    btn.disabled = false;
    btn.innerHTML = "提交認領";
  }
};

// 圖片預覽功能 (倉庫照片預覽)
window.previewImage = function (url) {
  if (!url || url.includes("no-image")) return;
  const src = url.startsWith("http") ? url : `${API_BASE_URL}${url}`;
  const modal = document.getElementById("view-images-modal");
  if (modal) {
    modal.innerHTML = `
            <div class="modal-content" style="max-width:800px; padding:0; background:transparent;">
                <span class="modal-close" style="color:white; font-size:40px;">&times;</span>
                <img src="${src}" style="width:100%; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,0.5);">
            </div>`;
    modal.style.display = "flex";
  }
};

// 初始化事件監聽
document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("unclaimed-search");
  if (searchInput) {
    searchInput.addEventListener("input", (e) =>
      window.filterUnclaimed(e.target.value)
    );
  }

  const claimForm = document.getElementById("claim-package-form");
  if (claimForm) {
    claimForm.addEventListener("submit", window.handleClaimSubmit);
  }

  // [新增] 認領彈窗的上傳圖片即時預覽邏輯 (確保縮圖出現)
  const claimProofInput = document.getElementById("claim-proof");
  const claimProofPreview = document.getElementById("claim-proof-preview");
  if (claimProofInput && claimProofPreview) {
    claimProofInput.addEventListener("change", function () {
      const file = this.files[0];
      if (file && file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = function (e) {
          claimProofPreview.src = e.target.result;
          claimProofPreview.style.display = "block";
        };
        reader.readAsDataURL(file);
      } else {
        claimProofPreview.src = "";
        claimProofPreview.style.display = "none";
      }
    });
  }
});

// frontend/js/dashboard-recipient.js
// 負責常用收件人管理與選擇邏輯
// V26.0 - Latest: Retained Cache-First & SWR + Added Search/Filter & Validation

// --- 函式定義 ---

// 1. 載入與渲染 (核心優化)
window.loadRecipients = async function (forceRefresh = false) {
  const container = document.getElementById("recipient-list-container");
  if (!container) return;

  // [優化 1] 快取優先策略 (Cache-First)
  // 如果已有資料且非強制重新整理，直接渲染現有資料，不顯示 Loading
  if (!forceRefresh && window.myRecipients && window.myRecipients.length > 0) {
    renderRecipients(window.myRecipients);

    // [優化 2] 背景靜默更新 (SWR - Stale While Revalidate)
    // 在背景偷偷發送請求確認是否有最新資料，使用者無感
    fetchRecipientsData(container, true);
    return;
  }

  // 只有在真的沒資料時，才顯示載入中動畫，避免畫面閃爍
  if (!window.myRecipients || window.myRecipients.length === 0) {
    container.innerHTML =
      '<div style="width:100%; text-align:center; padding:30px; color:#999;"><i class="fas fa-spinner fa-spin"></i> 載入中...</div>';
  }

  await fetchRecipientsData(container, false);
};

// 獨立出來的 API 請求函式
async function fetchRecipientsData(container, isBackgroundUpdate) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/recipients`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();

    if (data.success) {
      // 排序邏輯：將預設者排在最前面
      let sortedData = data.recipients || [];
      sortedData.sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));

      window.myRecipients = sortedData;

      if (window.myRecipients.length > 0) {
        renderRecipients(window.myRecipients);
      } else {
        // 只有非背景更新時才顯示「尚未建立」
        if (!isBackgroundUpdate && container) {
          container.innerHTML = `
                <div style="grid-column:1/-1; text-align:center; padding:30px; color:#999;">
                    <i class="fas fa-address-book" style="font-size:30px; margin-bottom:10px;"></i><br>
                    尚未建立常用收件人
                </div>`;
        }
      }
    }
  } catch (e) {
    console.error("載入收件人失敗", e);
    if (!isBackgroundUpdate && container) {
      container.innerHTML = `<p class="text-center" style="color:red;">載入失敗，請檢查網路</p>`;
    }
  }
}

// [新功能] 搜尋過濾邏輯
window.filterRecipients = function (keyword) {
  const kw = keyword.trim().toLowerCase();
  if (!window.myRecipients) return;
  const filtered = window.myRecipients.filter(
    (r) =>
      r.name.toLowerCase().includes(kw) ||
      r.phone.includes(kw) ||
      r.address.toLowerCase().includes(kw)
  );
  renderRecipients(filtered, true);
};

function renderRecipients(list, isFiltering = false) {
  const container = document.getElementById("recipient-list-container");
  if (!container) return;

  if (list.length === 0 && isFiltering) {
    container.innerHTML =
      '<div style="grid-column:1/-1; text-align:center; padding:20px; color:#999;">找不到符合搜尋條件的收件人</div>';
    return;
  }

  let htmlContent = "";

  list.forEach((r) => {
    // 隱藏敏感資訊 (身分證)
    const maskedId = r.idNumber
      ? r.idNumber.substring(0, 3) + "*****" + r.idNumber.slice(-2)
      : "";

    const defaultBadge = r.isDefault
      ? '<span class="badge-default">預設</span>'
      : "";
    const activeClass = r.isDefault ? "default-card" : "";

    htmlContent += `
        <div class="recipient-card ${activeClass}">
            <div class="recipient-header">
                <div>
                    <span class="recipient-name">${r.name}</span>
                    ${defaultBadge}
                </div>
                <span class="recipient-phone"><i class="fas fa-phone"></i> ${
                  r.phone
                }</span>
            </div>
            <div class="recipient-info-row">
                <i class="fas fa-id-card"></i> ${maskedId}
            </div>
            <div class="recipient-info-row">
                <i class="fas fa-map-marker-alt"></i> ${r.address}
            </div>
            <div class="recipient-actions">
                ${
                  !r.isDefault
                    ? `<button class="btn btn-sm btn-outline-primary" onclick="window.setDefaultRecipient('${r.id}')">設為預設</button>`
                    : ""
                }
                <button class="btn btn-sm btn-outline-secondary" onclick="window.copyRecipientInfo('${
                  r.id
                }')"><i class="far fa-copy"></i> 複製</button>
                <button class="btn btn-sm btn-secondary" onclick="window.openRecipientModal('edit', '${
                  r.id
                }')">編輯</button>
                <button class="btn btn-sm btn-danger" onclick="window.deleteRecipient('${
                  r.id
                }')">刪除</button>
            </div>
        </div>
    `;
  });

  container.innerHTML = htmlContent;
}

// [新功能] 複製收件人資訊到剪貼簿
window.copyRecipientInfo = function (id) {
  const r = window.myRecipients.find((x) => x.id === id);
  if (!r) return;
  const text = `${r.name}\n${r.phone}\n${r.idNumber || ""}\n${r.address}`;
  navigator.clipboard.writeText(text).then(() => {
    window.showMessage("資訊已複製到剪貼簿", "success");
  });
};

// 2. 新增/編輯 Modal
window.openRecipientModal = function (mode, id = null) {
  const modal = document.getElementById("recipient-modal");
  const form = document.getElementById("recipient-form");
  const title = document.getElementById("recipient-modal-title");

  if (form) form.reset();
  const idInput = document.getElementById("recipient-id");
  if (idInput) idInput.value = "";

  if (mode === "edit") {
    if (title) title.textContent = "編輯收件人";
    const target = window.myRecipients.find((r) => r.id === id);
    if (target) {
      document.getElementById("recipient-id").value = target.id;
      document.getElementById("rec-name").value = target.name;
      document.getElementById("rec-phone").value = target.phone;
      document.getElementById("rec-idNumber").value = target.idNumber;
      document.getElementById("rec-address").value = target.address;
      document.getElementById("rec-isDefault").checked = target.isDefault;
    }
  } else {
    if (title) title.textContent = "新增常用收件人";
  }

  if (modal) modal.style.display = "flex";
};

// 處理表單提交
async function handleRecipientSubmit(e) {
  e.preventDefault();
  const id = document.getElementById("recipient-id").value;
  const isEdit = !!id;
  const btn = e.target.querySelector("button[type='submit']");

  // [新功能] 前端基本校驗
  const name = document.getElementById("rec-name").value.trim();
  const phone = document.getElementById("rec-phone").value.trim();
  if (name.length < 2) return alert("請輸入正確姓名");
  if (phone.length < 8) return alert("請輸入正確電話格式");

  // UI 鎖定
  btn.disabled = true;
  btn.textContent = "儲存中...";

  const payload = {
    name: name,
    phone: phone,
    idNumber: document.getElementById("rec-idNumber").value.trim(),
    address: document.getElementById("rec-address").value.trim(),
    isDefault: document.getElementById("rec-isDefault").checked,
  };

  const url = isEdit
    ? `${API_BASE_URL}/api/recipients/${id}`
    : `${API_BASE_URL}/api/recipients`;
  const method = isEdit ? "PUT" : "POST";

  try {
    const res = await fetch(url, {
      method: method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${window.dashboardToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      window.showMessage(isEdit ? "更新成功" : "新增成功", "success");
      const modal = document.getElementById("recipient-modal");
      if (modal) modal.style.display = "none";
      window.loadRecipients(true); // 強制重新整理
    } else {
      alert("操作失敗，請檢查資料格式");
    }
  } catch (e) {
    alert("網路錯誤");
  } finally {
    btn.disabled = false;
    btn.textContent = "儲存";
  }
}

// 3. 刪除與設為預設
window.deleteRecipient = async function (id) {
  if (!confirm("確定刪除此收件人？")) return;
  try {
    // 樂觀刪除
    window.myRecipients = window.myRecipients.filter((r) => r.id !== id);
    renderRecipients(window.myRecipients);

    await fetch(`${API_BASE_URL}/api/recipients/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });

    window.loadRecipients(true); // 背景再確認一次
  } catch (e) {
    alert("刪除失敗");
    window.loadRecipients(true);
  }
};

window.setDefaultRecipient = async function (id) {
  try {
    const target = window.myRecipients.find((r) => r.id === id);
    if (!target) return;

    // 樂觀更新 (Optimistic UI Update)：先改畫面
    const optimisticList = window.myRecipients.map((r) => ({
      ...r,
      isDefault: r.id === id,
    }));
    // 重新排序使預設者置頂
    optimisticList.sort(
      (a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0)
    );
    renderRecipients(optimisticList);

    await fetch(`${API_BASE_URL}/api/recipients/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${window.dashboardToken}`,
      },
      body: JSON.stringify({ ...target, isDefault: true }),
    });

    window.showMessage("已設為預設", "success");
    window.loadRecipients(true);
  } catch (e) {
    alert("設定失敗");
    window.loadRecipients(true);
  }
};

// 4. 選擇器邏輯 (在集運單 Modal 中使用)
window.openRecipientSelector = async function () {
  const modal = document.getElementById("recipient-selector-modal");
  const list = document.getElementById("recipient-selector-list");
  const searchInput = document.getElementById("recipient-selector-search");

  // 如果快取為空，嘗試抓取
  if (!window.myRecipients || window.myRecipients.length === 0) {
    list.innerHTML =
      '<div style="padding:20px; text-align:center;"><i class="fas fa-spinner fa-spin"></i> 載入中...</div>';
    await fetchRecipientsData(null, true);
  }

  // 渲染選擇器內容的內部函式
  const renderSelectorItems = (items) => {
    list.innerHTML = "";
    if (!items || items.length === 0) {
      list.innerHTML =
        "<p style='padding:10px; color:#666;'>無符合的收件人</p>";
      return;
    }
    items.forEach((r) => {
      const div = document.createElement("div");
      div.className = "recipient-selector-item";
      div.innerHTML = `
                <div><strong>${r.name}</strong> <span style="font-size:12px; color:#666;">(${r.phone})</span></div>
                <div style="font-size:12px; color:#555;">${r.address}</div>
            `;
      div.onclick = () => {
        document.getElementById("ship-name").value = r.name;
        document.getElementById("ship-phone").value = r.phone;
        document.getElementById("ship-street-address").value = r.address;
        document.getElementById("ship-idNumber").value = r.idNumber || "";
        modal.style.display = "none";
        window.showMessage("已帶入收件人資訊", "success");
      };
      list.appendChild(div);
    });
  };

  // 綁定選擇器搜尋
  if (searchInput) {
    searchInput.value = ""; // 重置搜尋
    searchInput.oninput = (e) => {
      const kw = e.target.value.toLowerCase();
      const filtered = window.myRecipients.filter(
        (x) => x.name.toLowerCase().includes(kw) || x.phone.includes(kw)
      );
      renderSelectorItems(filtered);
    };
  }

  renderSelectorItems(window.myRecipients);
  modal.style.display = "flex";
};

// --- 初始化事件綁定 ---
document.addEventListener("DOMContentLoaded", () => {
  // 1. 綁定「新增收件人」按鈕
  const btnAdd = document.getElementById("btn-add-recipient");
  if (btnAdd) {
    btnAdd.addEventListener("click", () => window.openRecipientModal("create"));
  }

  // 2. 綁定表單提交
  const form = document.getElementById("recipient-form");
  if (form) {
    form.addEventListener("submit", handleRecipientSubmit);
  }

  // 3. 綁定主介面搜尋框 (如果有此元素)
  const mainSearch = document.getElementById("recipient-main-search");
  if (mainSearch) {
    mainSearch.addEventListener("input", (e) =>
      window.filterRecipients(e.target.value)
    );
  }

  // 4. 綁定集運單中的「從常用選取」按鈕
  const btnSelect = document.getElementById("btn-select-recipient");
  if (btnSelect) {
    const newBtn = btnSelect.cloneNode(true);
    btnSelect.parentNode.replaceChild(newBtn, btnSelect);
    newBtn.addEventListener("click", () => window.openRecipientSelector());
  }
});

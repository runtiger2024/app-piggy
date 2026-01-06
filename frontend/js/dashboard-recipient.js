// frontend/js/dashboard-recipient.js
// 負責常用收件人管理與選擇邏輯
// V2026.Final.Pro - 最新完整旗艦版
// [保留] Cache-First & SWR, 樂觀更新, 敏感資訊遮罩
// [新增] 自動運費重算連動, 動態事件重新綁定機制, 強化校驗

// --- 1. 載入與渲染 (核心優化) ---
window.loadRecipients = async function (forceRefresh = false) {
  const container = document.getElementById("recipient-list-container");
  if (!container) return;

  // [優化 1] 快取優先策略 (Cache-First)
  if (!forceRefresh && window.myRecipients && window.myRecipients.length > 0) {
    renderRecipients(window.myRecipients);
    // [優化 2] 背景靜默更新 (SWR)
    fetchRecipientsData(container, true);
    return;
  }

  // 初始載入顯示 Spinner
  if (!window.myRecipients || window.myRecipients.length === 0) {
    container.innerHTML =
      '<div style="width:100%; text-align:center; padding:30px; color:#999;"><i class="fas fa-spinner fa-spin"></i> 正在獲取常用聯絡人...</div>';
  }

  await fetchRecipientsData(container, false);
};

// 獨立 API 請求函式
async function fetchRecipientsData(container, isBackgroundUpdate) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/recipients`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();

    if (data.success) {
      // 排序：預設者置頂
      let sortedData = data.recipients || [];
      sortedData.sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));
      window.myRecipients = sortedData;

      if (window.myRecipients.length > 0) {
        renderRecipients(window.myRecipients);
      } else {
        if (!isBackgroundUpdate && container) {
          container.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:30px; color:#999;">
                <i class="fas fa-address-book" style="font-size:30px; margin-bottom:10px;"></i><br>
                尚未建立常用收件人，點擊「新增」開始使用
            </div>`;
        }
      }
    }
  } catch (e) {
    console.error("載入收件人失敗", e);
    if (!isBackgroundUpdate && container) {
      container.innerHTML = `<p class="text-center" style="color:red;">載入失敗，請檢查網路連線</p>`;
    }
  }
}

// [功能] 搜尋過濾邏輯
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

// [核心渲染] 常用收件人卡片
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
    // 敏感資訊遮罩 (身分證)
    const maskedId = r.idNumber
      ? r.idNumber.substring(0, 3) + "*****" + r.idNumber.slice(-2)
      : "未填寫";

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

// [功能] 複製到剪貼簿
window.copyRecipientInfo = function (id) {
  const r = window.myRecipients.find((x) => x.id === id);
  if (!r) return;
  const text = `收件人：${r.name}\n電話：${r.phone}\n身分證：${
    r.idNumber || "未提供"
  }\n地址：${r.address}`;
  navigator.clipboard.writeText(text).then(() => {
    window.showMessage("資訊已複製", "success");
  });
};

// --- 2. 新增/編輯 Modal 控制 ---
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

  const name = document.getElementById("rec-name").value.trim();
  const phone = document.getElementById("rec-phone").value.trim();
  const idNum = document.getElementById("rec-idNumber").value.trim();

  // 強化校驗
  if (name.length < 2) return alert("請輸入真實姓名");
  if (phone.length < 8) return alert("請輸入有效的電話號碼");

  btn.disabled = true;
  btn.textContent = "正在處理...";

  const payload = {
    name,
    phone,
    idNumber: idNum,
    address: document.getElementById("rec-address").value.trim(),
    isDefault: document.getElementById("rec-isDefault").checked,
  };

  const url = isEdit
    ? `${API_BASE_URL}/api/recipients/${id}`
    : `${API_BASE_URL}/api/recipients`;
  const method = isEdit ? "PUT" : "POST";

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${window.dashboardToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      window.showMessage(isEdit ? "資料已更新" : "成功新增常用地址", "success");
      const modal = document.getElementById("recipient-modal");
      if (modal) modal.style.display = "none";
      window.loadRecipients(true);
    } else {
      const err = await res.json();
      alert(err.message || "操作失敗，請檢查資料格式");
    }
  } catch (e) {
    alert("網路錯誤，請稍後再試");
  } finally {
    btn.disabled = false;
    btn.textContent = "儲存";
  }
}

// --- 3. 刪除與設為預設 ---
window.deleteRecipient = async function (id) {
  if (!confirm("確定要刪除此聯絡資訊嗎？")) return;
  try {
    // 樂觀刪除
    window.myRecipients = window.myRecipients.filter((r) => r.id !== id);
    renderRecipients(window.myRecipients);

    await fetch(`${API_BASE_URL}/api/recipients/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    window.loadRecipients(true);
  } catch (e) {
    alert("刪除失敗");
    window.loadRecipients(true);
  }
};

window.setDefaultRecipient = async function (id) {
  try {
    const target = window.myRecipients.find((r) => r.id === id);
    if (!target) return;

    // 樂觀更新
    const optimisticList = window.myRecipients.map((r) => ({
      ...r,
      isDefault: r.id === id,
    }));
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

    window.showMessage("預設地址已變更", "success");
    window.loadRecipients(true);
  } catch (e) {
    alert("設定失敗");
    window.loadRecipients(true);
  }
};

// --- 4. 選擇器邏輯 (用於集運建立彈窗) ---
window.openRecipientSelector = async function () {
  const modal = document.getElementById("recipient-selector-modal");
  const list = document.getElementById("recipient-selector-list");
  const searchInput = document.getElementById("recipient-selector-search");

  if (!modal || !list) return console.error("找不到選擇器 Modal 組件");

  if (!window.myRecipients || window.myRecipients.length === 0) {
    list.innerHTML =
      '<div style="padding:20px; text-align:center;"><i class="fas fa-spinner fa-spin"></i> 正在載入清單...</div>';
    await fetchRecipientsData(null, true);
  }

  const renderSelectorItems = (items) => {
    list.innerHTML = "";
    if (!items || items.length === 0) {
      list.innerHTML =
        "<p style='padding:20px; color:#999; text-align:center;'>無相符的聯絡人</p>";
      return;
    }
    items.forEach((r) => {
      const div = document.createElement("div");
      div.className = "recipient-selector-item";
      const defaultTag = r.isDefault
        ? '<span style="color:#1a73e8; font-size:11px;">[預設]</span> '
        : "";
      div.innerHTML = `
          <div><strong>${defaultTag}${r.name}</strong> <span style="font-size:12px; color:#666;">(${r.phone})</span></div>
          <div style="font-size:12px; color:#888;">${r.address}</div>
      `;
      div.onclick = () => {
        // 帶入欄位
        const fieldMap = {
          "ship-name": r.name,
          "ship-phone": r.phone,
          "ship-street-address": r.address,
          "ship-idNumber": r.idNumber || "",
        };

        Object.keys(fieldMap).forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.value = fieldMap[id];
        });

        modal.style.display = "none";
        window.showMessage("已自動帶入收件資訊", "success");

        // [新增功能] 如果有運費試算邏輯，自動觸發重算
        if (typeof window.recalculateShipmentTotal === "function") {
          window.recalculateShipmentTotal();
        }
      };
      list.appendChild(div);
    });
  };

  if (searchInput) {
    searchInput.value = "";
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

/**
 * [新增] 動態綁定觸發器
 * 用於在集運彈窗彈出後，強制將「常用地址」按鈕與選擇器連結
 */
window.bindRecipientSelectorTrigger = function () {
  const btnSelect = document.getElementById("btn-select-recipient");
  if (btnSelect) {
    // 移除舊事件並重新綁定
    const newBtn = btnSelect.cloneNode(true);
    btnSelect.parentNode.replaceChild(newBtn, btnSelect);
    newBtn.addEventListener("click", (e) => {
      e.preventDefault();
      window.openRecipientSelector();
    });
  }
};

// --- 5. 初始化事件綁定 ---
document.addEventListener("DOMContentLoaded", () => {
  // 新增按鈕
  const btnAdd = document.getElementById("btn-add-recipient");
  if (btnAdd)
    btnAdd.addEventListener("click", () => window.openRecipientModal("create"));

  // 表單提交
  const form = document.getElementById("recipient-form");
  if (form) form.addEventListener("submit", handleRecipientSubmit);

  // 主介面搜尋
  const mainSearch = document.getElementById("recipient-main-search");
  if (mainSearch) {
    mainSearch.addEventListener("input", (e) =>
      window.filterRecipients(e.target.value)
    );
  }

  // 初次嘗試綁定集運單按鈕
  window.bindRecipientSelectorTrigger();
});

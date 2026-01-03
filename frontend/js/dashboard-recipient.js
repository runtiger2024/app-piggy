// frontend/js/dashboard-recipient.js
// V2025.V16.1 - 旗艦極限全功能版：保留樂觀更新與所有選擇器邏輯

// 1. 載入與渲染 (保留快取優先策略)
window.loadRecipients = async function (forceRefresh = false) {
  const container = document.getElementById("recipient-list-container");
  const token = localStorage.getItem("token"); // [大師補丁] 口袋拿鑰匙
  if (!container || !token) return;

  // [保留你的優化] 快取優先策略
  if (!forceRefresh && window.myRecipients && window.myRecipients.length > 0) {
    renderRecipients(window.myRecipients);
    fetchRecipientsData(container, true); // 背景靜默更新
    return;
  }

  if (!window.myRecipients || window.myRecipients.length === 0) {
    container.innerHTML =
      '<div class="text-center p-4"><i class="fas fa-spinner fa-spin"></i> 同步中...</div>';
  }

  await fetchRecipientsData(container, false);
};

async function fetchRecipientsData(container, isBackgroundUpdate) {
  const token = localStorage.getItem("token");
  try {
    const res = await fetch(`${API_BASE_URL}/api/recipients`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    if (data.success) {
      window.myRecipients = data.recipients || [];
      if (window.myRecipients.length > 0) {
        renderRecipients(window.myRecipients);
      } else if (!isBackgroundUpdate) {
        container.innerHTML =
          '<div class="text-center p-5 text-muted">尚未建立常用收件人</div>';
      }
    }
  } catch (e) {
    if (!isBackgroundUpdate)
      container.innerHTML =
        '<p class="text-center text-danger">網路連線異常</p>';
  }
}

function renderRecipients(list) {
  const container = document.getElementById("recipient-list-container");
  if (!container) return;

  container.innerHTML = list
    .map((r) => {
      const maskedId = r.idNumber
        ? r.idNumber.substring(0, 3) + "*****" + r.idNumber.slice(-2)
        : "未填寫";
      return `
        <div class="recipient-card ${r.isDefault ? "default-card" : ""}">
            <div class="recipient-header">
                <div>
                    <span class="recipient-name">${r.name}</span>
                    ${
                      r.isDefault
                        ? '<span class="badge-default">預設</span>'
                        : ""
                    }
                </div>
                <span class="recipient-phone"><i class="fas fa-phone"></i> ${
                  r.phone
                }</span>
            </div>
            <div class="recipient-info-row"><i class="fas fa-id-card"></i> ${maskedId}</div>
            <div class="recipient-info-row"><i class="fas fa-map-marker-alt"></i> ${
              r.address
            }</div>
            <div class="recipient-actions">
                ${
                  !r.isDefault
                    ? `<button class="btn btn-sm btn-outline-primary" onclick="window.setDefaultRecipient('${r.id}')">設為預設</button>`
                    : ""
                }
                <button class="btn btn-sm btn-secondary" onclick="window.openRecipientModal('edit', '${
                  r.id
                }')">編輯</button>
                <button class="btn btn-sm btn-danger" onclick="window.deleteRecipient('${
                  r.id
                }')">刪除</button>
            </div>
        </div>
    `;
    })
    .join("");
}

// 2. 新增/編輯 Modal (保留 100% 原始邏輯)
window.openRecipientModal = function (mode, id = null) {
  const modal = document.getElementById("recipient-modal");
  const form = document.getElementById("recipient-form");
  const title = document.getElementById("recipient-modal-title");

  if (form) form.reset();
  const idInput = document.getElementById("recipient-id");
  if (idInput) idInput.value = id || "";

  if (mode === "edit") {
    if (title) title.textContent = "編輯收件人";
    const target = window.myRecipients.find((r) => r.id === id);
    if (target) {
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
  const token = localStorage.getItem("token");
  const btn = e.target.querySelector("button[type='submit']");

  btn.disabled = true;
  btn.textContent = "儲存中...";

  const payload = {
    name: document.getElementById("rec-name").value,
    phone: document.getElementById("rec-phone").value,
    idNumber: document.getElementById("rec-idNumber").value,
    address: document.getElementById("rec-address").value,
    isDefault: document.getElementById("rec-isDefault").checked,
  };

  try {
    const res = await fetch(
      `${API_BASE_URL}/api/recipients${id ? "/" + id : ""}`,
      {
        method: id ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      }
    );

    if (res.ok) {
      document.getElementById("recipient-modal").style.display = "none";
      window.loadRecipients(true);
    } else {
      alert("儲存失敗");
    }
  } catch (e) {
    alert("網路錯誤");
  } finally {
    btn.disabled = false;
    btn.textContent = "儲存";
  }
}

// 4. 選擇器邏輯 (在集運單 Modal 中使用，保留 100% 邏輯)
window.openRecipientSelector = async function () {
  const modal = document.getElementById("recipient-selector-modal");
  const list = document.getElementById("recipient-selector-list");
  if (!modal || !list) return;

  if (!window.myRecipients || window.myRecipients.length === 0) {
    list.innerHTML =
      '<div class="text-center p-3"><i class="fas fa-spinner fa-spin"></i> 載入中...</div>';
    await fetchRecipientsData(null, true);
  }

  list.innerHTML = "";
  if (!window.myRecipients || window.myRecipients.length === 0) {
    list.innerHTML = "<p class='p-3 text-muted'>無常用收件人，請先新增。</p>";
  } else {
    window.myRecipients.forEach((r) => {
      const div = document.createElement("div");
      div.className = "recipient-selector-item";
      div.innerHTML = `
                <div><strong>${r.name}</strong> (${r.phone})</div>
                <div style="font-size:12px; color:#555;">${r.address}</div>
            `;
      div.onclick = () => {
        document.getElementById("ship-name").value = r.name;
        document.getElementById("ship-phone").value = r.phone;
        document.getElementById("ship-street-address").value = r.address;
        document.getElementById("ship-idNumber").value = r.idNumber || "";
        modal.style.display = "none";
      };
      list.appendChild(div);
    });
  }
  modal.style.display = "flex";
};

// 刪除與設為預設 (保留)
window.deleteRecipient = async function (id) {
  if (!confirm("確定刪除此收件人？")) return;
  const token = localStorage.getItem("token");
  try {
    await fetch(`${API_BASE_URL}/api/recipients/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    window.myRecipients = window.myRecipients.filter((r) => r.id !== id);
    renderRecipients(window.myRecipients);
  } catch (e) {
    alert("刪除失敗");
  }
};

window.setDefaultRecipient = async function (id) {
  const token = localStorage.getItem("token");
  try {
    const target = window.myRecipients.find((r) => r.id === id);
    if (!target) return;
    await fetch(`${API_BASE_URL}/api/recipients/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ...target, isDefault: true }),
    });
    window.loadRecipients(true);
  } catch (e) {
    alert("設定失敗");
  }
};

document.addEventListener("DOMContentLoaded", () => {
  const btnAdd = document.getElementById("btn-add-recipient");
  if (btnAdd)
    btnAdd.addEventListener("click", () => window.openRecipientModal("create"));

  const form = document.getElementById("recipient-form");
  if (form) form.addEventListener("submit", handleRecipientSubmit);

  const btnSelect = document.getElementById("btn-select-recipient");
  if (btnSelect)
    btnSelect.addEventListener("click", () => window.openRecipientSelector());
});

// frontend/js/admin-settings.js
// V16.1 - 旗艦極限穩定版：整合附加服務管理 (ShipmentServiceItem) CRUD 功能

document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("admin_token");
  if (!token) return;

  // 1. Tab 切換邏輯
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelectorAll(".tab-content")
        .forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      const targetId = btn.getAttribute("data-tab");
      document.getElementById(targetId).classList.add("active");
    });
  });

  // 2. 初始載入：系統設定與附加服務項目
  await loadSettings();
  await loadServiceItems();

  // 3. 綁定表單提交
  document.getElementById("form-rates").addEventListener("submit", saveRates);
  document
    .getElementById("form-remote")
    .addEventListener("submit", saveRemoteAreas);
  document
    .getElementById("form-announcement")
    .addEventListener("submit", saveAnnouncement);
  document.getElementById("form-bank").addEventListener("submit", saveBankInfo);
  document
    .getElementById("form-invoice")
    .addEventListener("submit", saveInvoiceConfig);
  document
    .getElementById("form-email")
    .addEventListener("submit", saveEmailConfig);
  document
    .getElementById("form-furniture")
    .addEventListener("submit", saveFurnitureConfig);

  // 4. 綁定按鈕事件
  document.getElementById("btn-add-category").addEventListener("click", () => {
    addCategoryBlock("", {}, true);
  });
  document.getElementById("btn-add-remote").addEventListener("click", () => {
    addRemoteBlock("", []);
  });
  // [New] 新增附加服務按鈕
  document.getElementById("btn-add-service").addEventListener("click", () => {
    renderServiceItem({
      id: "new",
      name: "",
      description: "",
      price: 0,
      unit: "PIECE",
      isActive: true,
    });
  });

  const btnTestEmail = document.getElementById("btn-test-email");
  if (btnTestEmail) {
    btnTestEmail.addEventListener("click", sendTestEmail);
  }

  // --- 核心函式 ---

  async function loadSettings() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const s = data.settings || {};

      // A. 運費設定
      if (s.rates_config) {
        const c = s.rates_config.constants || {};
        const cats = s.rates_config.categories || {};

        setValue("const-MINIMUM_CHARGE", c.MINIMUM_CHARGE);
        setValue("const-VOLUME_DIVISOR", c.VOLUME_DIVISOR);
        setValue("const-CBM_TO_CAI_FACTOR", c.CBM_TO_CAI_FACTOR);
        setValue("const-OVERSIZED_LIMIT", c.OVERSIZED_LIMIT || 300);
        setValue("const-OVERSIZED_FEE", c.OVERSIZED_FEE || 800);
        setValue("const-OVERWEIGHT_LIMIT", c.OVERWEIGHT_LIMIT || 100);
        setValue("const-OVERWEIGHT_FEE", c.OVERWEIGHT_FEE || 800);

        document.getElementById("categories-container").innerHTML = "";
        const order = ["general", "special_a", "special_b", "special_c"];
        const keys = Object.keys(cats).sort((a, b) => {
          const idxA = order.indexOf(a);
          const idxB = order.indexOf(b);
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          if (idxA !== -1) return -1;
          if (idxB !== -1) return 1;
          return a.localeCompare(b);
        });

        keys.forEach((key) => addCategoryBlock(key, cats[key], false));
      }

      // B. 偏遠地區設定
      const DEFAULT_REMOTE_AREAS = {
        1800: [
          "東勢區",
          "新社區",
          "石岡區",
          "和平區",
          "大雪山",
          "穀關",
          "水里鄉",
          "伸港鄉",
          "線西鄉",
          "秀水鄉",
          "芬園鄉",
          "芳苑鄉",
          "大村鄉",
          "大城鄉",
          "竹塘鄉",
          "北斗鎮",
          "溪州鄉",
        ],
        2000: [
          "三芝",
          "石門",
          "烏來",
          "坪林",
          "石碇區",
          "深坑區",
          "萬里",
          "平溪",
          "雙溪",
          "福隆",
          "貢寮",
          "三峽區",
          "淡水竹圍",
          "復興鄉",
          "新埔鎮",
          "關西鎮",
          "橫山鄉",
          "北埔鄉",
          "尖石鄉",
          "五峰鄉",
          "寶山鎮",
          "香山區",
          "造橋鎮",
          "峨嵋鄉",
          "三灣鄉",
          "芎林鄉",
          "頭屋鄉",
          "銅鑼鄉",
          "三義鄉",
          "通霄鎮",
          "苑裡鎮",
          "大湖鄉",
          "卓蘭鎮",
          "泰安鄉",
          "公館鄉",
          "竹南鎮",
        ],
        2500: [
          "名間鄉",
          "四湖鄉",
          "東勢鄉",
          "台西鄉",
          "古坑鄉",
          "口湖鄉",
          "崙背鄉",
          "麥寮鄉",
          "東石鄉",
          "六腳鄉",
          "竹崎鄉",
          "白河區",
          "東山區",
          "大內區",
          "玉井區",
          "山上區",
          "龍崎區",
          "後壁區",
          "左鎮區",
          "燕巢",
          "內門區",
          "大樹",
          "茄萣",
          "林園",
          "旗津",
          "杉林",
          "美濃",
          "永安",
          "阿蓮",
          "田寮",
          "旗山",
        ],
        3000: ["布袋鎮", "北門區", "將軍區", "七股區", "楠西區", "南化區"],
        4000: [
          "南莊鄉",
          "獅潭鄉",
          "竹山鎮",
          "鹿谷鄉",
          "集集鎮",
          "中寮鄉",
          "國姓鄉",
          "仁愛鄉",
          "信義鄉",
          "梨山",
          "奧萬大",
          "埔里",
        ],
        4500: [
          "陽明山",
          "金山",
          "魚池鄉",
          "那瑪夏區",
          "桃源區",
          "茂林",
          "甲仙",
          "六龜",
          "屏東縣全區",
          "宜蘭其他地區",
          "花蓮全區",
          "台東全區",
        ],
        5000: ["阿里山", "梅山鄉", "番路", "中埔鄉", "大埔鄉"],
        7000: [
          "小琉球",
          "琉球鄉",
          "恆春",
          "墾丁",
          "鵝鑾鼻",
          "車城",
          "滿洲",
          "牡丹",
          "獅子",
          "枋山",
          "春日",
          "枋寮",
          "佳冬",
          "來義",
          "泰武",
          "瑪家",
          "霧臺",
          "三地門",
          "南澳",
          "釣魚臺",
        ],
      };

      let remoteAreas = s.remote_areas;
      if (!remoteAreas || Object.keys(remoteAreas).length === 0) {
        remoteAreas = DEFAULT_REMOTE_AREAS;
      }

      if (remoteAreas) {
        const remoteContainer = document.getElementById("remote-container");
        remoteContainer.innerHTML = "";
        const sortedRates = Object.keys(remoteAreas).sort(
          (a, b) => parseInt(a) - parseInt(b)
        );
        sortedRates.forEach((rate) => {
          addRemoteBlock(rate, remoteAreas[rate]);
        });
      }

      // C. 公告
      if (s.announcement) {
        setValue("ann-text", s.announcement.text);
        document.getElementById("ann-enabled").checked = s.announcement.enabled;
        setValue("ann-color", s.announcement.color || "info");
      }

      // D. 銀行
      if (s.bank_info) {
        setValue("bank-name", s.bank_info.bankName);
        setValue("bank-branch", s.bank_info.branch);
        setValue("bank-account", s.bank_info.account);
        setValue("bank-holder", s.bank_info.holder);
      }

      // E. 發票設定
      if (s.invoice_config) {
        document.getElementById("inv-enabled").checked =
          s.invoice_config.enabled;
        setValue("inv-merchant-id", s.invoice_config.merchantId);
        setValue("inv-hash-key", s.invoice_config.hashKey);
        setValue("inv-mode", s.invoice_config.mode);
      }

      // F. Email 設定
      if (s.email_config) {
        setValue("email-sender-name", s.email_config.senderName);
        setValue("email-sender-addr", s.email_config.senderEmail);
        const recipients = Array.isArray(s.email_config.recipients)
          ? s.email_config.recipients.join(", ")
          : "";
        setValue("email-recipients", recipients);
      }

      // G. 傢俱代採購設定
      if (s.furniture_config) {
        setValue("fur-exchange-rate", s.furniture_config.exchangeRate);
        setValue("fur-service-fee-rate", s.furniture_config.serviceFeeRate);
        setValue("fur-min-service-fee", s.furniture_config.minServiceFee || 0);
      }
    } catch (e) {
      console.error("載入失敗", e);
      alert("載入設定失敗，請檢查 API 連線");
    }
  }

  // --- 附加服務項目 (ShipmentServiceItem) 邏輯 ---

  async function loadServiceItems() {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/settings/service-items`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();
      const container = document.getElementById("services-container");
      container.innerHTML = "";
      if (data.success && data.items) {
        data.items.forEach((item) => renderServiceItem(item));
      }
    } catch (e) {
      console.error("載入附加服務失敗", e);
    }
  }

  function renderServiceItem(item) {
    const container = document.getElementById("services-container");
    const isNew = item.id === "new";
    const html = `
      <div class="service-block card mb-3" data-id="${
        item.id
      }" style="border-left: 4px solid #1cc88a;">
        <div class="card-body p-3">
          <div class="row align-items-end">
            <div class="col-md-3 mb-2">
              <label class="small text-muted">服務名稱</label>
              <input type="text" class="form-control svc-name" value="${
                item.name
              }" placeholder="如：釘木架" required>
            </div>
            <div class="col-md-2 mb-2">
              <label class="small text-muted">單價 ($)</label>
              <input type="number" class="form-control svc-price" value="${
                item.price
              }" required>
            </div>
            <div class="col-md-2 mb-2">
              <label class="small text-muted">計費單位</label>
              <select class="form-control svc-unit">
                <option value="PIECE" ${
                  item.unit === "PIECE" ? "selected" : ""
                }>每件 (PIECE)</option>
                <option value="WEIGHT" ${
                  item.unit === "WEIGHT" ? "selected" : ""
                }>每公斤 (WEIGHT)</option>
                <option value="SHIPMENT" ${
                  item.unit === "SHIPMENT" ? "selected" : ""
                }>每單 (SHIPMENT)</option>
              </select>
            </div>
            <div class="col-md-2 mb-2">
              <div class="custom-control custom-switch">
                <input type="checkbox" class="custom-control-input svc-active" id="active-${
                  item.id
                }" ${item.isActive ? "checked" : ""}>
                <label class="custom-control-label small" for="active-${
                  item.id
                }">啟用</label>
              </div>
            </div>
            <div class="col-md-3 mb-2 text-right">
              <button class="btn btn-sm btn-success btn-save-service">儲存</button>
              <button class="btn btn-sm btn-danger btn-delete-service">刪除</button>
            </div>
            <div class="col-12">
              <label class="small text-muted">服務描述 (選填)</label>
              <input type="text" class="form-control svc-desc" value="${
                item.description || ""
              }" placeholder="顯示於前台的描述內容">
            </div>
          </div>
        </div>
      </div>
    `;
    container.insertAdjacentHTML("beforeend", html);

    // 綁定單個項目的儲存與刪除
    const block = container.querySelector(`[data-id="${item.id}"]`);
    block
      .querySelector(".btn-save-service")
      .addEventListener("click", () => saveServiceItem(item.id, block));
    block
      .querySelector(".btn-delete-service")
      .addEventListener("click", () => deleteServiceItem(item.id, block));
  }

  async function saveServiceItem(id, block) {
    const data = {
      name: block.querySelector(".svc-name").value,
      description: block.querySelector(".svc-desc").value,
      price: parseFloat(block.querySelector(".svc-price").value),
      unit: block.querySelector(".svc-unit").value,
      isActive: block.querySelector(".svc-active").checked,
    };

    const isNew = id === "new";
    const url = isNew
      ? `${API_BASE_URL}/api/admin/settings/service-items`
      : `${API_BASE_URL}/api/admin/settings/service-items/${id}`;
    const method = isNew ? "POST" : "PUT";

    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (res.ok) {
        alert("附加服務儲存成功");
        loadServiceItems(); // 重新載入以獲取正確的 ID 或更新狀態
      } else {
        alert("儲存失敗: " + result.message);
      }
    } catch (e) {
      alert("網路錯誤");
    }
  }

  async function deleteServiceItem(id, block) {
    if (id === "new") {
      block.remove();
      return;
    }
    if (!confirm("確定要刪除此附加服務嗎？")) return;

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/settings/service-items/${id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (res.ok) {
        block.remove();
      } else {
        const d = await res.json();
        alert("刪除失敗: " + d.message);
      }
    } catch (e) {
      alert("網路錯誤");
    }
  }

  // --- UI 元件輔助函式 ---

  function addCategoryBlock(key, data, isNew) {
    const container = document.getElementById("categories-container");
    let bgColor = "#fff";
    if (key.includes("special")) bgColor = "#fdfdfe";

    const keyInputHtml = isNew
      ? `<input type="text" class="form-control cat-key text-primary font-weight-bold" placeholder="設定代碼 (如: special_d)" required>`
      : `<input type="text" class="form-control cat-key" value="${key}" disabled style="background:#e9ecef; font-weight:bold;">`;

    const html = `
        <div class="category-block card mb-3" style="border-left: 4px solid #4e73df;">
            <div class="card-body p-3" style="background:${bgColor};">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <h6 class="font-weight-bold text-primary m-0">類別設定</h6>
                    <i class="fas fa-trash-alt btn-remove-cat" title="刪除此類別" onclick="this.closest('.category-block').remove()"></i>
                </div>
                <div class="row">
                    <div class="col-md-3 mb-2">
                        <label class="small text-muted">系統代碼 (Key)</label>
                        ${keyInputHtml}
                    </div>
                    <div class="col-md-3 mb-2">
                        <label class="small text-muted">顯示名稱 (Name)</label>
                        <input type="text" class="form-control cat-name" value="${
                          data.name || ""
                        }" required>
                    </div>
                    <div class="col-md-3 mb-2">
                        <label class="small text-muted">重量費率 ($/KG)</label>
                        <input type="number" step="0.1" class="form-control cat-weight" value="${
                          data.weightRate || 0
                        }" required>
                    </div>
                    <div class="col-md-3 mb-2">
                        <label class="small text-muted">材積費率 ($/材)</label>
                        <input type="number" step="0.1" class="form-control cat-volume" value="${
                          data.volumeRate || 0
                        }" required>
                    </div>
                    <div class="col-12">
                        <label class="small text-muted">前台說明文字 (Description)</label>
                        <input type="text" class="form-control cat-desc" value="${
                          data.description || ""
                        }" placeholder="例如：易碎品、大理石...">
                    </div>
                </div>
            </div>
        </div>
      `;
    container.insertAdjacentHTML("beforeend", html);
  }

  function addRemoteBlock(rate, areas) {
    const container = document.getElementById("remote-container");
    const areasStr = Array.isArray(areas) ? areas.join(", ") : "";

    const html = `
      <div class="remote-block card">
        <div class="remote-header">
          <div class="d-flex align-items-center">
             <span class="font-weight-bold mr-2">費率單價: $</span>
             <input type="number" class="form-control form-control-sm remote-rate" value="${rate}" placeholder="2000" style="width: 100px;">
             <span class="ml-2">/ CBM</span>
          </div>
          <i class="fas fa-trash-alt btn-remove-cat" title="刪除此區間" onclick="this.closest('.remote-block').remove()"></i>
        </div>
        <div class="card-body p-3">
          <label class="small text-muted mb-1">包含地區 (請以逗號分隔關鍵字)</label>
          <textarea class="form-control remote-areas" rows="2" placeholder="例如: 宜蘭, 花蓮, 台東">${areasStr}</textarea>
        </div>
      </div>
    `;
    container.insertAdjacentHTML("beforeend", html);
  }

  // --- 儲存動作 ---

  async function saveRates(e) {
    e.preventDefault();
    const constants = {
      MINIMUM_CHARGE: parseFloat(
        document.getElementById("const-MINIMUM_CHARGE").value
      ),
      VOLUME_DIVISOR: parseFloat(
        document.getElementById("const-VOLUME_DIVISOR").value
      ),
      CBM_TO_CAI_FACTOR: parseFloat(
        document.getElementById("const-CBM_TO_CAI_FACTOR").value
      ),
      OVERSIZED_LIMIT:
        parseFloat(document.getElementById("const-OVERSIZED_LIMIT").value) ||
        300,
      OVERSIZED_FEE:
        parseFloat(document.getElementById("const-OVERSIZED_FEE").value) || 800,
      OVERWEIGHT_LIMIT:
        parseFloat(document.getElementById("const-OVERWEIGHT_LIMIT").value) ||
        100,
      OVERWEIGHT_FEE:
        parseFloat(document.getElementById("const-OVERWEIGHT_FEE").value) ||
        800,
    };

    const categories = {};
    let hasError = false;
    document.querySelectorAll(".category-block").forEach((block) => {
      const keyInput = block.querySelector(".cat-key");
      let key = keyInput.value.trim();
      const wRate = parseFloat(block.querySelector(".cat-weight").value);
      const vRate = parseFloat(block.querySelector(".cat-volume").value);

      if (!key) {
        alert("錯誤：有類別未填寫代碼 (Key)");
        hasError = true;
        return;
      }
      if (categories[key]) {
        alert(`錯誤：代碼 ${key} 重複，請修正`);
        hasError = true;
        return;
      }
      if (isNaN(wRate) || isNaN(vRate) || wRate < 0 || vRate < 0) {
        alert(`錯誤：費率必須為正數`);
        hasError = true;
        return;
      }

      categories[key] = {
        name: block.querySelector(".cat-name").value,
        description: block.querySelector(".cat-desc").value,
        weightRate: wRate,
        volumeRate: vRate,
      };
    });

    if (hasError) return;
    await sendUpdate("rates_config", { constants, categories }, "費率設定");
  }

  async function saveRemoteAreas(e) {
    e.preventDefault();
    const remoteData = {};
    let hasError = false;

    document.querySelectorAll(".remote-block").forEach((block) => {
      const rate = block.querySelector(".remote-rate").value.trim();
      const areasStr = block.querySelector(".remote-areas").value.trim();

      if (!rate || isNaN(rate)) {
        alert("費率必須為數字");
        hasError = true;
        return;
      }
      const areasList = areasStr
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (areasList.length === 0) return;

      if (remoteData[rate]) {
        remoteData[rate] = [...remoteData[rate], ...areasList];
      } else {
        remoteData[rate] = areasList;
      }
    });

    if (hasError) return;
    await sendUpdate("remote_areas", remoteData, "偏遠地區設定");
  }

  async function saveAnnouncement(e) {
    e.preventDefault();
    const data = {
      text: document.getElementById("ann-text").value,
      enabled: document.getElementById("ann-enabled").checked,
      color: document.getElementById("ann-color").value,
    };
    await sendUpdate("announcement", data, "公告");
  }

  async function saveBankInfo(e) {
    e.preventDefault();
    const data = {
      bankName: document.getElementById("bank-name").value,
      branch: document.getElementById("bank-branch").value,
      account: document.getElementById("bank-account").value,
      holder: document.getElementById("bank-holder").value,
    };
    if (!data.bankName || !data.account) {
      alert("請填寫銀行名稱與帳號");
      return;
    }
    await sendUpdate("bank_info", data, "銀行資訊");
  }

  async function saveInvoiceConfig(e) {
    e.preventDefault();
    const data = {
      enabled: document.getElementById("inv-enabled").checked,
      merchantId: document.getElementById("inv-merchant-id").value,
      hashKey: document.getElementById("inv-hash-key").value,
      mode: document.getElementById("inv-mode").value,
    };
    await sendUpdate("invoice_config", data, "發票設定");
  }

  async function saveEmailConfig(e) {
    e.preventDefault();
    const recipients = document
      .getElementById("email-recipients")
      .value.split(",")
      .map((s) => s.trim())
      .filter((s) => s);
    const data = {
      senderName: document.getElementById("email-sender-name").value,
      senderEmail: document.getElementById("email-sender-addr").value,
      recipients: recipients,
    };
    await sendUpdate("email_config", data, "郵件設定");
  }

  async function saveFurnitureConfig(e) {
    e.preventDefault();
    const data = {
      exchangeRate: parseFloat(
        document.getElementById("fur-exchange-rate").value
      ),
      serviceFeeRate: parseFloat(
        document.getElementById("fur-service-fee-rate").value
      ),
      minServiceFee:
        parseFloat(document.getElementById("fur-min-service-fee").value) || 0,
    };
    if (isNaN(data.exchangeRate) || isNaN(data.serviceFeeRate)) {
      alert("匯率與服務費率必須為有效數字");
      return;
    }
    await sendUpdate("furniture_config", data, "傢俱代採購設定");
  }

  async function sendTestEmail() {
    const btn = document.getElementById("btn-test-email");
    if (!btn) return;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 發送中...';

    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/settings/test/email`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      alert(res.ok ? data.message : "發送失敗: " + data.message);
    } catch (e) {
      alert("網路錯誤");
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-vial"></i> 發送測試信';
    }
  }

  async function sendUpdate(key, value, name) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/settings/${key}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ value }),
      });
      if (res.ok) {
        alert(`[${name}] 更新成功！`);
        await loadSettings();
      } else {
        const d = await res.json();
        alert(`更新失敗: ${d.message}`);
      }
    } catch (err) {
      alert("連線錯誤");
    }
  }

  function setValue(id, val) {
    const el = document.getElementById(id);
    if (el && val !== undefined) el.value = val;
  }
});

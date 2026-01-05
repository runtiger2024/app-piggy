// frontend/js/admin-furniture.js
// V2026.1.7 - 終極進化版：整合 CRUD、多選批量操作、安全刪除機制與會員關聯

document.addEventListener("DOMContentLoaded", () => {
  const adminToken = localStorage.getItem("admin_token");
  if (!adminToken) return;

  // 分頁與過濾狀態
  let currentPage = 1;
  const limit = 20;
  let currentStatus = "";
  let currentSearch = "";

  // [新增] 多選管理
  let selectedIds = new Set();

  // 系統配置預設值
  let systemMinServiceFee = 500;

  /**
   * 核心啟動函式
   */
  async function init() {
    // 1. 處理來自 URL 的過濾參數
    const urlParams = new URLSearchParams(window.location.search);
    const statusParam = urlParams.get("status");
    if (statusParam) {
      currentStatus = statusParam;
      const filterEl = document.getElementById("status-filter");
      if (filterEl) filterEl.value = statusParam;
    }

    // 2. 獲取系統最新配置
    fetchSystemConfig();

    // 3. 基本事件綁定
    document.getElementById("btn-search")?.addEventListener("click", () => {
      currentSearch = document.getElementById("search-input").value;
      currentStatus = document.getElementById("status-filter").value;
      currentPage = 1;
      loadOrders();
    });

    // 4. [新增] 彈窗開啟/關閉委派
    document.addEventListener("click", (e) => {
      // 關閉任何彈窗
      if (e.target.closest(".modal-close-btn")) {
        const modals = document.querySelectorAll(".modal");
        modals.forEach((m) => (m.style.display = "none"));
      }
      // 開啟建立彈窗
      if (e.target.id === "btn-open-create") {
        document.getElementById("create-modal").style.display = "flex";
      }
    });

    // 5. 金額試算即時監聽 (含編輯與建立表單)
    const calcIds = [
      "modal-exchangeRate",
      "modal-serviceRate",
      "modal-priceRMB",
      "modal-quantity",
    ];
    calcIds.forEach((id) => {
      document.body.addEventListener("input", (e) => {
        if (e.target.id === id) calculateFees();
      });
    });

    // 6. [新增] 會員搜尋功能
    document.body.addEventListener("click", async (e) => {
      if (e.target.id === "btn-search-user") {
        const keyword = document.getElementById("create-user-search").value;
        if (!keyword) return alert("請輸入會員姓名或 Email");
        await handleUserSearch(keyword);
      }
    });

    // 7. [新增] 全選邏輯
    document.body.addEventListener("change", (e) => {
      if (e.target.id === "check-all") {
        const checkboxes = document.querySelectorAll(".order-checkbox");
        checkboxes.forEach((cb) => {
          cb.checked = e.target.checked;
          if (e.target.checked) selectedIds.add(cb.value);
          else selectedIds.delete(cb.value);
        });
        updateBulkBar();
      }
      if (e.target.classList.contains("order-checkbox")) {
        if (e.target.checked) selectedIds.add(e.target.value);
        else selectedIds.delete(e.target.value);
        updateBulkBar();
      }
    });

    // 8. 表單提交委派 (更新與建立)
    document.addEventListener("submit", (e) => {
      if (e.target.id === "order-form") handleFormSubmit(e);
      if (e.target.id === "create-order-form") handleCreateSubmit(e);
    });

    // 9. [新增] 批量操作按鈕
    document
      .getElementById("btn-bulk-update")
      ?.addEventListener("click", handleBulkStatusUpdate);
    document
      .getElementById("btn-bulk-delete")
      ?.addEventListener("click", () => handleDeletion(null, true));

    // 10. [新增] 編輯窗內的單筆刪除
    document
      .getElementById("btn-delete-order")
      ?.addEventListener("click", () => {
        const id = document.getElementById("modal-order-id").value;
        handleDeletion(id, false);
      });

    // 11. 初始載入數據
    loadOrders();
  }

  /**
   * 從 API 獲取配置
   */
  async function fetchSystemConfig() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/calculator/config`);
      const data = await res.json();
      if (data.success && data.rates?.procurement) {
        systemMinServiceFee = parseFloat(
          data.rates.procurement.minServiceFee || 500
        );
      }
    } catch (e) {
      console.warn("使用預設最低服務費 500 TWD");
    }
  }

  /**
   * 載入數據清單
   */
  async function loadOrders() {
    const tableBody = document.getElementById("furnitureTableBody");
    if (!tableBody) return;

    tableBody.innerHTML =
      '<tr><td colspan="10" class="text-center p-4"><i class="fas fa-spinner fa-spin"></i> 載入中...</td></tr>';

    try {
      let url = `${API_BASE_URL}/api/admin/furniture/list?page=${currentPage}&limit=${limit}`;
      if (currentStatus) url += `&status=${currentStatus}`;
      if (currentSearch)
        url += `&search=${encodeURIComponent(currentSearch.trim())}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "載入失敗");

      renderTable(data.orders || []);
      renderPagination(data.pagination);
      updateBulkBar(); // 確保重新渲染後維持勾選狀態
    } catch (e) {
      tableBody.innerHTML = `<tr><td colspan="10" class="text-center text-danger p-4">載入錯誤: ${e.message}</td></tr>`;
    }
  }

  /**
   * 渲染表格
   */
  function renderTable(orders) {
    const tableBody = document.getElementById("furnitureTableBody");
    if (!tableBody) return;
    tableBody.innerHTML = "";

    const statusMap = {
      PENDING: { text: "待處理", class: "status-PENDING" },
      PROCESSING: { text: "處理中", class: "status-PROCESSING" },
      PAID: { text: "已付工廠", class: "status-ARRIVED" },
      COMPLETED: { text: "已結案", class: "status-COMPLETED" },
      CANCELLED: { text: "已取消", class: "status-CANCELLED" },
    };

    orders.forEach((order) => {
      const tr = document.createElement("tr");
      const statusInfo = statusMap[order.status] || {
        text: order.status,
        class: "",
      };
      const orderStr = encodeURIComponent(JSON.stringify(order));

      tr.innerHTML = `
        <td class="check-col"><input type="checkbox" class="order-checkbox" value="${
          order.id
        }" ${selectedIds.has(order.id) ? "checked" : ""}></td>
        <td>${new Date(order.createdAt).toLocaleDateString()}</td>
        <td>
          <div class="font-weight-bold">${order.user?.name || "未知"}</div>
          <small class="text-muted">${order.user?.email || ""}</small>
        </td>
        <td>${order.factoryName}</td>
        <td>${order.productName} <span class="badge badge-light">x ${
        order.quantity
      }</span></td>
        <td>¥${order.priceRMB.toLocaleString()}</td>
        <td>$${Math.round(order.serviceFee).toLocaleString()}</td>
        <td class="text-danger font-weight-bold">$${order.totalTWD.toLocaleString()}</td>
        <td><span class="status-badge ${statusInfo.class}">${
        statusInfo.text
      }</span></td>
        <td>
          <button class="btn btn-primary btn-sm" onclick="openOrderModal('${orderStr}')">
            <i class="fas fa-edit"></i> 處理
          </button>
        </td>
      `;
      tableBody.appendChild(tr);
    });
  }

  /**
   * [新增] 更新批量工具列顯示狀態
   */
  function updateBulkBar() {
    const bar = document.getElementById("bulk-bar");
    const countEl = document.getElementById("selected-count");
    if (!bar || !countEl) return;

    if (selectedIds.size > 0) {
      bar.style.display = "flex";
      countEl.innerText = selectedIds.size;
    } else {
      bar.style.display = "none";
    }
    // 同步 CheckAll 狀態
    const checkboxes = document.querySelectorAll(".order-checkbox");
    const checkAll = document.getElementById("check-all");
    if (checkAll && checkboxes.length > 0) {
      checkAll.checked = Array.from(checkboxes).every((cb) => cb.checked);
    }
  }

  /**
   * 分頁功能
   */
  function renderPagination(pg) {
    const paginationDiv = document.getElementById("pagination");
    if (!paginationDiv) return;
    paginationDiv.innerHTML = "";
    if (!pg || pg.totalPages <= 1) return;

    window.changePage = (p) => {
      currentPage = p;
      loadOrders();
      window.scrollTo(0, 0);
    };

    let html = `<button class="btn btn-sm btn-light" ${
      currentPage === 1 ? "disabled" : ""
    } onclick="changePage(${
      currentPage - 1
    })"><i class="fas fa-chevron-left"></i></button>`;
    html += `<span class="p-2">第 ${currentPage} / ${pg.totalPages} 頁</span>`;
    html += `<button class="btn btn-sm btn-light" ${
      currentPage === pg.totalPages ? "disabled" : ""
    } onclick="changePage(${
      currentPage + 1
    })"><i class="fas fa-chevron-right"></i></button>`;
    paginationDiv.innerHTML = html;
  }

  /**
   * 開啟訂單彈窗
   */
  window.openOrderModal = function (orderStr) {
    try {
      const order = JSON.parse(decodeURIComponent(orderStr));
      const modal = document.getElementById("order-modal");
      if (!modal) return;

      const setVal = (id, val) => {
        if (document.getElementById(id))
          document.getElementById(id).value = val;
      };
      const setTxt = (id, val) => {
        if (document.getElementById(id))
          document.getElementById(id).innerText = val;
      };

      setVal("modal-order-id", order.id);
      setTxt(
        "modal-user-info",
        `${order.user?.name || "系統用戶"} (${order.user?.email || "無"})`
      );
      setVal("modal-status", order.status);
      setVal("modal-factoryName", order.factoryName);
      setVal("modal-productName", order.productName);
      setVal("modal-quantity", order.quantity);
      setVal("modal-priceRMB", order.priceRMB);
      setVal("modal-exchangeRate", order.exchangeRate);
      setVal("modal-serviceRate", order.serviceRate || 5);
      setVal("modal-adminNote", order.adminNote || "");

      calculateFees();
      modal.style.display = "flex";
    } catch (err) {
      console.error("彈窗解析失敗:", err);
    }
  };

  /**
   * 即時計算金額
   */
  function calculateFees() {
    const getVal = (id) => parseFloat(document.getElementById(id)?.value) || 0;
    const price = getVal("modal-priceRMB");
    const qty = parseInt(document.getElementById("modal-quantity")?.value) || 0;
    const rate = getVal("modal-exchangeRate");
    const sRate = getVal("modal-serviceRate");

    const subtotalTWD = price * qty * rate;
    const rawServiceFeeTWD = subtotalTWD * (sRate / 100);
    const finalServiceFeeTWD = Math.max(rawServiceFeeTWD, systemMinServiceFee);
    const totalTWD = Math.ceil(subtotalTWD + finalServiceFeeTWD);

    const baseEl = document.getElementById("calc-base-twd");
    const feeEl = document.getElementById("calc-service-fee");
    const totalEl = document.getElementById("calc-total-twd");

    if (baseEl)
      baseEl.innerText = `$${Math.round(subtotalTWD).toLocaleString()}`;
    if (feeEl) {
      feeEl.innerText = `$${Math.round(finalServiceFeeTWD).toLocaleString()}`;
      if (rawServiceFeeTWD < systemMinServiceFee && subtotalTWD > 0)
        feeEl.innerHTML += ' <small class="text-danger">(低消)</small>';
    }
    if (totalEl) totalEl.innerText = `$${totalTWD.toLocaleString()}`;
  }

  /**
   * [新增] 處理會員搜尋
   */
  async function handleUserSearch(keyword) {
    const select = document.getElementById("create-userId");
    select.innerHTML = '<option value="">搜尋中...</option>';
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/users/list?search=${encodeURIComponent(
          keyword
        )}`,
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      const data = await res.json();
      if (!data.success) throw new Error();

      select.innerHTML = '<option value="">-- 請選擇會員 --</option>';
      data.users.forEach((u) => {
        select.innerHTML += `<option value="${u.id}">${u.name} (${u.email})</option>`;
      });
    } catch (e) {
      select.innerHTML = '<option value="">搜尋失敗</option>';
    }
  }

  /**
   * [新增] 處理手動建單提交
   */
  async function handleCreateSubmit(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const payload = {
      userId: document.getElementById("create-userId").value,
      factoryName: document.getElementById("create-factoryName").value,
      productName: document.getElementById("create-productName").value,
      quantity: document.getElementById("create-quantity").value,
      priceRMB: document.getElementById("create-priceRMB").value,
      exchangeRate: document.getElementById("create-exchangeRate").value,
      adminNote: document.getElementById("create-adminNote").value,
    };

    if (!payload.userId) return alert("請先選擇會員");

    submitBtn.disabled = true;
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/furniture/create`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        alert("建立成功！");
        document.getElementById("create-modal").style.display = "none";
        e.target.reset();
        loadOrders();
      } else {
        alert("建立失敗");
      }
    } catch (e) {
      alert("網路錯誤");
    } finally {
      submitBtn.disabled = false;
    }
  }

  /**
   * 處理單筆更新提交
   */
  async function handleFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById("modal-order-id").value;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const payload = {
      status: document.getElementById("modal-status").value,
      exchangeRate: parseFloat(
        document.getElementById("modal-exchangeRate").value
      ),
      serviceRate: parseFloat(
        document.getElementById("modal-serviceRate").value
      ),
      adminNote: document.getElementById("modal-adminNote").value,
    };

    if (isNaN(payload.exchangeRate)) return alert("請輸入有效匯率");

    submitBtn.disabled = true;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/furniture/update/${id}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );
      if (res.ok) {
        alert("更新成功！");
        document.getElementById("order-modal").style.display = "none";
        loadOrders();
        if (typeof window.refreshAdminBadges === "function")
          window.refreshAdminBadges();
      } else {
        alert("更新失敗");
      }
    } catch (e) {
      alert("網路錯誤");
    } finally {
      submitBtn.disabled = false;
    }
  }

  /**
   * [新增] 批量更新狀態
   */
  async function handleBulkStatusUpdate() {
    const status = document.getElementById("bulk-status-select").value;
    if (!status) return alert("請選擇狀態");

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/furniture/bulk-status`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ids: Array.from(selectedIds), status }),
        }
      );
      if (res.ok) {
        alert("批量更新完成");
        selectedIds.clear();
        loadOrders();
      }
    } catch (e) {
      alert("更新失敗");
    }
  }

  /**
   * [新增+核心要求] 處理刪除功能 (含 DELETE 驗證)
   */
  async function handleDeletion(id, isBulk = false) {
    const targetText = isBulk ? `這 ${selectedIds.size} 筆訂單` : "這筆訂單";
    const userInput = prompt(
      `⚠️ 危險操作！您即將永久刪除 ${targetText}。\n刪除後無法還原，請輸入 "DELETE" 以確認執行：`
    );

    if (userInput !== "DELETE") {
      alert("驗證失敗，刪除已取消。");
      return;
    }

    try {
      let url = isBulk
        ? `${API_BASE_URL}/api/admin/furniture/bulk-delete`
        : `${API_BASE_URL}/api/admin/furniture/${id}`;
      let method = isBulk ? "POST" : "DELETE"; // 批量刪除後端通常使用 POST
      let body = isBulk
        ? JSON.stringify({ ids: Array.from(selectedIds) })
        : null;

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body,
      });

      if (res.ok) {
        alert("刪除成功！");
        if (isBulk) selectedIds.clear();
        document.getElementById("order-modal").style.display = "none";
        loadOrders();
      } else {
        const err = await res.json();
        alert("刪除失敗: " + err.message);
      }
    } catch (e) {
      alert("網路連線異常");
    }
  }

  // 執行初始化
  init();
});

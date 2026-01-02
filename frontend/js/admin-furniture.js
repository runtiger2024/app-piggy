// frontend/js/admin-furniture.js
// V2026.1.6 - 終極韌性版：解決佈局重建導致的彈窗失效與紅點同步問題

document.addEventListener("DOMContentLoaded", () => {
  const adminToken = localStorage.getItem("admin_token");
  if (!adminToken) return;

  // 分頁與過濾狀態
  let currentPage = 1;
  const limit = 20;
  let currentStatus = "";
  let currentSearch = "";

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

    // 3. 事件綁定 (採用委派或動態抓取，避免變數失效)
    document.getElementById("btn-search")?.addEventListener("click", () => {
      currentSearch = document.getElementById("search-input").value;
      currentStatus = document.getElementById("status-filter").value;
      currentPage = 1;
      loadOrders();
    });

    // 4. 彈窗關閉委派 (確保在佈局重建後依然有效)
    document.addEventListener("click", (e) => {
      if (e.target.closest(".modal-close-btn")) {
        const modal = document.getElementById("order-modal");
        if (modal) modal.style.display = "none";
      }
    });

    // 5. 金額試算即時監聽
    [
      "modal-exchangeRate",
      "modal-serviceRate",
      "modal-priceRMB",
      "modal-quantity",
    ].forEach((id) => {
      // 由於元素可能被 admin-layout 重建，改在觸發時才抓取或重新綁定
      document.body.addEventListener("input", (e) => {
        if (e.target.id === id) calculateFees();
      });
    });

    // 6. 提交表單委派
    document.addEventListener("submit", (e) => {
      if (e.target.id === "order-form") handleFormSubmit(e);
    });

    // 7. 初始載入數據
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
      '<tr><td colspan="9" class="text-center p-4"><i class="fas fa-spinner fa-spin"></i> 載入中...</td></tr>';

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
    } catch (e) {
      tableBody.innerHTML = `<tr><td colspan="9" class="text-center text-danger p-4">載入錯誤: ${e.message}</td></tr>`;
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
   * [核心修復] 開啟訂單彈窗 - 確保每次呼叫都重新獲取 DOM 元素
   */
  window.openOrderModal = function (orderStr) {
    try {
      const order = JSON.parse(decodeURIComponent(orderStr));
      const modal = document.getElementById("order-modal");

      if (!modal) {
        alert(
          "找不到彈窗組件，請檢查 HTML 結構是否將 modal 放在 container-fluid 內。"
        );
        return;
      }

      // 每次開啟時動態抓取元素，防止佈局重建導致變數失效
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
      if (rawServiceFeeTWD < systemMinServiceFee && subtotalTWD > 0) {
        feeEl.innerHTML += ' <small class="text-danger">(低消)</small>';
      }
    }
    if (totalEl) totalEl.innerText = `$${totalTWD.toLocaleString()}`;
  }

  /**
   * 處理表單提交
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

    if (isNaN(payload.exchangeRate) || isNaN(payload.serviceRate)) {
      alert("請輸入有效的匯率與費率數字");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 儲存中...';

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

      const data = await res.json();
      if (res.ok) {
        alert("更新成功！");
        const modal = document.getElementById("order-modal");
        if (modal) modal.style.display = "none";
        loadOrders();

        // [核心聯動] 處理完畢立即刷新左側選單紅圈通知
        if (typeof window.refreshAdminBadges === "function") {
          window.refreshAdminBadges();
        }
      } else {
        alert("更新失敗: " + (data.message || "未知錯誤"));
      }
    } catch (e) {
      alert("網路連線錯誤");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-save"></i> 儲存並更新訂單';
    }
  }

  // 執行初始化
  init();
});

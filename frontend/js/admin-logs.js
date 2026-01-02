// frontend/js/admin-logs.js
// V2026.Logs.Complete - 100% 中文化動作類型與 UI 優化版本

document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("admin_token");
  if (!token) return;

  let currentPage = 1;
  const limit = 50;

  // --- [核心功能] 動作類型中文化映射表 ---
  const actionMap = {
    // 包裹動作
    CREATE_PACKAGE: "建立包裹",
    UPDATE_PACKAGE: "更新包裹資料",
    DELETE_PACKAGE: "永久刪除包裹",
    CLAIM_PACKAGE: "認領無主包裹",

    // 集運訂單
    CREATE_SHIPMENT: "建立集運單",
    UPDATE_SHIPMENT: "更新訂單狀態",
    DELETE_SHIPMENT: "刪除集運單據",
    REJECT_SHIPMENT: "退回集運申請",
    ADJUST_PRICE: "人工修改金額",

    // 財務財務
    APPROVE_TRANSACTION: "通過儲值審核",
    REJECT_TRANSACTION: "駁回儲值申請",
    ADJUST_BALANCE: "手動調整餘額",
    ISSUE_INVOICE: "開立電子發票",
    VOID_INVOICE: "作廢電子發票",

    // 安全與系統
    LOGIN: "後台管理登入",
    REGISTER: "新會員註冊",
    RESET_PASSWORD: "管理員重設密碼",
    IMPERSONATE: "模擬會員登入",
    UPDATE_PERMISSIONS: "修改帳號權限",
    UPDATE_USER_STATUS: "停用/啟用會員",
    UPDATE_SYSTEM_SETTINGS: "更新系統費率",
  };

  init();

  function init() {
    loadLogs();

    // 搜尋功能
    document.getElementById("btn-search")?.addEventListener("click", () => {
      currentPage = 1;
      loadLogs();
    });

    // 分頁控制
    document.getElementById("btn-prev")?.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        loadLogs();
      }
    });

    document.getElementById("btn-next")?.addEventListener("click", () => {
      currentPage++;
      loadLogs();
    });
  }

  /**
   * 獲取並加載日誌數據
   */
  async function loadLogs() {
    const tbody = document.getElementById("logs-list");
    if (!tbody) return;

    tbody.innerHTML =
      '<tr><td colspan="5" class="text-center p-4"><i class="fas fa-spinner fa-spin"></i> 正在加載紀錄...</td></tr>';

    const searchInput =
      document.getElementById("search-input")?.value.trim() || "";
    const actionFilter = document.getElementById("action-filter")?.value || "";

    try {
      let url = `${API_BASE_URL}/api/admin/logs?page=${currentPage}&limit=${limit}`;
      if (searchInput) url += `&search=${encodeURIComponent(searchInput)}`;
      if (actionFilter) url += `&action=${encodeURIComponent(actionFilter)}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "載入失敗");

      renderLogs(data.logs || []);
      updatePagination(data.pagination);
    } catch (e) {
      console.error("Load logs error:", e);
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger p-4"><i class="fas fa-exclamation-triangle"></i> ${e.message}</td></tr>`;
    }
  }

  /**
   * 渲染日誌表格 (含中文化邏輯與顏色分類)
   */
  function renderLogs(logs) {
    const tbody = document.getElementById("logs-list");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (logs.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-center p-4 text-muted">查無相符的操作紀錄</td></tr>';
      return;
    }

    logs.forEach((log) => {
      const tr = document.createElement("tr");

      // 1. 中文化動作名稱
      const displayAction = actionMap[log.action] || log.action;

      // 2. 判斷視覺化顏色分類
      let actionClass = "tag-dark"; // 預設灰色
      const act = log.action;

      if (
        act.includes("DELETE") ||
        act.includes("REJECT") ||
        act.includes("VOID")
      ) {
        actionClass = "tag-red"; // 危險/駁回
      } else if (act.includes("UPDATE") || act.includes("ADJUST")) {
        actionClass = "tag-orange"; // 警告/修改
      } else if (
        act.includes("CREATE") ||
        act.includes("APPROVE") ||
        act.includes("ISSUE")
      ) {
        actionClass = "tag-green"; // 新增/通過
      } else if (act === "LOGIN" || act === "IMPERSONATE") {
        actionClass = "tag-blue"; // 安全/登入
      }

      // 3. 渲染 HTML
      tr.innerHTML = `
        <td style="white-space:nowrap; font-size:0.85rem; color:#666;">
          <i class="far fa-clock"></i> ${new Date(
            log.createdAt
          ).toLocaleDateString()}<br>
          <span style="margin-left:17px;">${new Date(
            log.createdAt
          ).toLocaleTimeString()}</span>
        </td>
        <td>
          <div class="font-weight-bold" style="font-size:0.9rem;">${
            log.userEmail || "系統自動"
          }</div>
          <small class="text-muted"><i class="fas fa-network-wired"></i> IP: ${
            log.ipAddress || "內網"
          }</small>
        </td>
        <td>
          <span class="action-tag ${actionClass}">
            ${displayAction}
          </span>
        </td>
        <td>
          <code style="background:#f1f1f1; padding:2px 6px; border-radius:3px; color:#e83e8c; font-size:11px;">
            ${log.targetId ? log.targetId.slice(-8).toUpperCase() : "-"}
          </code>
        </td>
        <td class="log-details">
          ${log.details || "（無詳細說明）"}
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  /**
   * 更新分頁按鈕與資訊
   */
  function updatePagination(pg) {
    const info = document.getElementById("page-info");
    const btnPrev = document.getElementById("btn-prev");
    const btnNext = document.getElementById("btn-next");

    if (info) info.textContent = `第 ${currentPage} / ${pg.totalPages || 1} 頁`;
    if (btnPrev) btnPrev.disabled = currentPage === 1;
    if (btnNext)
      btnNext.disabled = !pg.totalPages || currentPage >= pg.totalPages;
  }
});

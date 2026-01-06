// frontend/js/admin-logs.js
// V2026.Logs.FullRepair - 100% 全模組動作代碼精確映射版本

document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("admin_token");
  if (!token) return;

  let currentPage = 1;
  const limit = 50;

  /**
   * [核心功能] 動作類型全模組中文化映射表
   * 交叉比對後端各模組 Controller 中的 createLog 實際調用字串
   */
  const actionMap = {
    // 🛡️ 帳號、權限與安全 (authController & userController)
    USER_REGISTER: "新會員註冊(系統)", //
    REGISTER: "新會員註冊紀錄", //
    LOGIN: "管理後台登入成功", //
    USER_UPDATE: "個人檔案自我更新", //
    USER_DELETE: "會員自行註銷帳號", //
    CREATE_STAFF: "建立後台工作人員", //
    CREATE_STAFF_USER: "新增管理團隊成員", //
    TOGGLE_USER: "變更帳號狀態(停用/啟用)", //
    UPDATE_USER_PROFILE: "管理員修改用戶個資", //
    ADMIN_UPDATE_PROFILE: "管理員強制修改個資", //
    UPDATE_PERMS: "修改管理帳號權限", //
    UPDATE_USER_PERMISSIONS: "變更管理員操作權限", //
    RESET_PASSWORD: "後台強制重設密碼", //
    RESET_USER_PASSWORD: "執行密碼強制重置", //
    DELETE_USER: "永久刪除會員帳號", //
    IMPERSONATE: "模擬會員登入(一鍵穿越)", //
    IMPERSONATE_USER: "以會員身份進入系統", //

    // 📦 包裹管理 (packageController & admin/packageController)
    CREATE_PACKAGE: "建立包裹預報", //
    BULK_FORECAST: "批量預報包裹", //
    CLAIM_PACKAGE: "認領無主包裹", //
    RESOLVE_EXCEPTION: "回覆異常包裹處理", //
    UPDATE_PACKAGE: "修改包裹內容", //
    DELETE_PACKAGE: "刪除包裹紀錄", //
    ADMIN_CREATE_PACKAGE: "管理員代客預報", //
    ADMIN_DELETE_PACKAGE: "管理員刪除包裹", //
    UPDATE_PACKAGE_STATUS: "變更包裹狀態", //
    UPDATE_PACKAGE_DETAILS: "更新測量數據(含改價)", //
    BULK_UPDATE_PACKAGE_STATUS: "批量修改包裹狀態", //
    BULK_DELETE_PACKAGES: "批量刪除多筆包裹", //

    // 🚚 集運訂單 (shipmentController & admin/shipmentController)
    UPDATE_SHIPMENT: "更新集運訂單資料", //
    UPDATE_SHIPMENT_STATUS: "變更物流狀態", //
    ADJUST_PRICE: "管理員人工改價", //
    ADJUST_SHIPMENT_PRICE: "訂單金額調整操作", //
    RETURN_SHIPMENT: "退回/駁回集運申請單", //
    REJECT_SHIPMENT: "駁回集運申請", //
    ADMIN_DELETE_SHIPMENT: "管理員刪除集運單", //
    DELETE_SHIPMENT: "永久刪除集運紀錄", //
    BULK_UPDATE_SHIPMENT_STATUS: "批量更新訂單狀態", //
    BULK_DELETE_SHIPMENTS: "批量刪除多筆訂單", //
    CREATE_INVOICE: "系統自動開立發票", //
    INVOICE_ISSUE: "手動開立電子發票", //
    INVOICE_VOID: "作廢電子發票", //

    // 💰 財務與錢包 (walletController & admin/walletController)
    WALLET_DEPOSIT_REQUEST: "提交儲值申請", //
    APPROVE_DEPOSIT: "通過儲值審核", //
    REJECT_DEPOSIT: "駁回儲值申請", //
    REVIEW_TRANSACTION: "審核交易申請", //
    MANUAL_ADJUST: "管理員手動調整餘額", //
    MANUAL_INVOICE_DEPOSIT: "補開儲值手續費發票", //

    // 🛋️ 傢俱代採購 (furnitureAdminController)
    CREATE_FURNITURE_ORDER: "提交傢俱代購申請", //
    UPDATE_FURNITURE_ORDER: "修改代購訂單狀態", //
    BULK_DELETE_FURNITURE: "批量刪除傢俱紀錄", // [核心修復：對應後端調用]
    BULK_UPDATE_FURNITURE: "批量更新傢俱狀態", //
    DELETE_FURNITURE_ORDER: "刪除傢俱代購紀錄", //

    // 👤 常用收件人 (recipientController)
    CREATE_RECIPIENT: "新增常用收件人", //
    UPDATE_RECIPIENT: "更新常用收件人資料", //
    DELETE_RECIPIENT: "刪除常用收件人", //

    // ⚙️ 系統設定 (settingsController)
    UPDATE_SETTINGS: "修改全域系統費率參數", //
    UPDATE_SYSTEM_SETTING: "更新單項系統設定值", //
  };

  init();

  function init() {
    loadLogs();
    document.getElementById("btn-search")?.addEventListener("click", () => {
      currentPage = 1;
      loadLogs();
    });
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

  async function loadLogs() {
    const tbody = document.getElementById("logs-list");
    if (!tbody) return;
    tbody.innerHTML =
      '<tr><td colspan="5" class="text-center p-4"><i class="fas fa-spinner fa-spin"></i> 正在讀取紀錄...</td></tr>';

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
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger p-4"><i class="fas fa-exclamation-triangle"></i> ${e.message}</td></tr>`;
    }
  }

  function renderLogs(logs) {
    const tbody = document.getElementById("logs-list");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (logs.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-center p-4 text-muted">查無相關日誌紀錄</td></tr>';
      return;
    }

    logs.forEach((log) => {
      const tr = document.createElement("tr");
      // 核心：若在 actionMap 中找不到 Key，則顯示原始英文代碼並標註「未翻譯」，方便快速發現漏網之魚
      const displayAction = actionMap[log.action] || `未翻譯(${log.action})`;

      let actionClass = "tag-dark";
      const act = log.action;

      // 紅色: 危險/破壞性 (包含批量刪除)
      if (
        act.includes("DELETE") ||
        act.includes("REJECT") ||
        act.includes("VOID") ||
        act.includes("CANCEL")
      ) {
        actionClass = "tag-red";
      }
      // 橘色: 變更/狀態切換 (包含所有批量更新)
      else if (
        act.includes("UPDATE") ||
        act.includes("ADJUST") ||
        act.includes("TOGGLE") ||
        act.includes("RESET") ||
        act.includes("BULK")
      ) {
        actionClass = "tag-orange";
      }
      // 綠色: 建設/通過
      else if (
        act.includes("CREATE") ||
        act.includes("APPROVE") ||
        act.includes("ISSUE") ||
        act.includes("CLAIM") ||
        act === "REGISTER" ||
        act === "USER_REGISTER"
      ) {
        actionClass = "tag-green";
      }
      // 藍色: 登入/身份模擬
      else if (act.includes("LOGIN") || act.includes("IMPERSONATE")) {
        actionClass = "tag-blue";
      }

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
        <td><span class="action-tag ${actionClass}">${displayAction}</span></td>
        <td><code style="background:#f1f1f1; padding:2px 6px; border-radius:3px; color:#e83e8c; font-size:11px;">
          ${log.targetId ? log.targetId.slice(-8).toUpperCase() : "-"}
        </code></td>
        <td class="log-details">${log.details || "（無詳細說明）"}</td>
      `;
      tbody.appendChild(tr);
    });
  }

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

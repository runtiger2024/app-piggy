// frontend/js/admin-layout.js
// V2026.1.7 - 終極穩定版：整合全域通知、路徑校正與高韌性內容注入

document.addEventListener("DOMContentLoaded", () => {
  // 1. 讀取管理員基本資訊與權限
  const adminToken = localStorage.getItem("admin_token");
  const adminName = localStorage.getItem("admin_name") || "管理員";
  const adminPermissions = JSON.parse(
    localStorage.getItem("admin_permissions") || "[]"
  );

  // 2. 安全檢查：驗證登入狀態與路徑
  const currentPathname = window.location.pathname;
  const isLoginPage = currentPathname.includes("admin-login.html");

  if (!adminToken && !isLoginPage) {
    window.location.href = "admin-login.html";
    return;
  }
  if (isLoginPage) return;

  /**
   * 3. 配置導航選單
   * badgeId 對應後端 reportController.js 輸出的統計欄位
   */
  const menuItems = [
    {
      label: "儀表板",
      icon: "fas fa-tachometer-alt",
      href: "admin-dashboard.html",
      perm: "DASHBOARD_VIEW",
    },
    {
      label: "包裹管理",
      icon: "fas fa-box",
      href: "admin-parcels.html",
      perm: "PACKAGE_VIEW",
      badgeId: "badge-packages",
    },
    {
      label: "無主包裹",
      icon: "fas fa-question-circle",
      href: "admin-unclaimed.html",
      perm: "PACKAGE_VIEW",
    },
    {
      label: "集運單管理",
      icon: "fas fa-shipping-fast",
      href: "admin-shipments.html",
      perm: "SHIPMENT_VIEW",
      badgeId: "badge-shipments",
    },
    {
      label: "傢俱代採購",
      icon: "fas fa-couch",
      href: "admin-furniture.html",
      perm: "FURNITURE_VIEW",
      badgeId: "badge-furniture",
    },
    {
      label: "會員管理",
      icon: "fas fa-users",
      href: "admin-members.html",
      perm: "USER_VIEW",
    },
    {
      label: "財務審核",
      icon: "fas fa-hand-holding-usd",
      href: "admin-finance.html",
      perm: "FINANCE_AUDIT",
      badgeId: "badge-finance",
    },
    {
      label: "新增員工",
      icon: "fas fa-user-plus",
      href: "admin-register.html",
      perm: "USER_MANAGE",
    },
    {
      label: "系統設定",
      icon: "fas fa-cogs",
      href: "admin-settings.html",
      perm: "SYSTEM_CONFIG",
    },
    {
      label: "操作日誌",
      icon: "fas fa-history",
      href: "admin-logs.html",
      perm: "LOGS_VIEW",
    },
  ];

  // 4. 權限檢查邏輯 (支援超級管理員與管理員權限覆蓋)
  const hasAccess = (perm) => {
    if (!perm) return true;
    const superPerms = ["SUPER_ADMIN", "CAN_MANAGE_USERS", "CAN_MANAGE_SYSTEM"];
    return (
      adminPermissions.includes(perm) ||
      superPerms.some((p) => adminPermissions.includes(p))
    );
  };

  // 5. 生成導航選單 HTML
  const navItemsHtml = menuItems
    .filter((item) => hasAccess(item.perm))
    .map((item) => {
      const isActive = currentPathname.includes(item.href) ? "active" : "";
      const badgeHtml = item.badgeId
        ? `<span class="nav-badge" id="${item.badgeId}" style="display:none;">0</span>`
        : "";
      return `
                <li class="nav-item">
                    <a class="nav-link ${isActive}" href="${item.href}">
                        <i class="${item.icon}"></i>
                        <span>${item.label}</span>
                        ${badgeHtml}
                    </a>
                </li>`;
    })
    .join("");

  // 6. 重構頁面結構 (注入 Sidebar 與 Topbar)
  const originalContent = document.body.innerHTML;
  document.body.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.id = "wrapper";
  wrapper.innerHTML = `
        <ul class="sidebar" id="accordionSidebar">
            <a class="sidebar-brand" href="admin-dashboard.html">
                <i class="fas fa-piggy-bank"></i>
                <div class="sidebar-brand-text">小跑豬後台</div>
            </a>
            <div class="sidebar-nav">${navItemsHtml}</div>
        </ul>
        <div id="content-wrapper">
            <nav class="topbar">
                <button id="sidebarToggleTop" class="toggle-sidebar-btn"><i class="fa fa-bars"></i></button>
                <div class="topbar-right">
                    <div class="user-info">
                        <span class="user-name">${adminName}</span>
                        <div class="user-avatar">${adminName
                          .charAt(0)
                          .toUpperCase()}</div>
                    </div>
                    <button id="layoutLogoutBtn" class="btn-logout-icon" title="登出"><i class="fas fa-sign-out-alt"></i></button>
                </div>
            </nav>
            <div class="container-fluid" id="main-content-container"></div>
        </div>
    `;
  document.body.appendChild(wrapper);

  // 插入行動版選單遮罩
  const overlay = document.createElement("div");
  overlay.className = "sidebar-overlay";
  document.body.appendChild(overlay);

  // 7. 注入原頁面內容 (修正彈窗遺失問題)
  const mainContainer = document.getElementById("main-content-container");
  const parser = new DOMParser();
  const doc = parser.parseFromString(originalContent, "text/html");

  // 移除舊有的 Header 容器避免衝突
  doc.getElementById("admin-header-container")?.remove();

  /**
   * [核心修復]
   * 這裡改為優先尋找 .container-fluid，若無則尋找 .container 或 body。
   * 確保 admin-furniture.html 中的彈窗能正確被注入到 mainContainer 中。
   */
  const pageContent =
    doc.querySelector(".container-fluid") ||
    doc.querySelector(".container") ||
    doc.body;

  mainContainer.innerHTML = pageContent.innerHTML;

  // 8. [重點優化] 全域通知標籤同步功能
  // 掛載至 window，讓其他頁面 (如 admin-furniture.js) 處理完訂單後可立即呼叫
  window.refreshAdminBadges = async function () {
    if (!adminToken) return;
    try {
      // 自動修正 API 基底網址結尾斜槓
      const baseUrl = (
        typeof API_BASE_URL !== "undefined" ? API_BASE_URL : ""
      ).replace(/\/$/, "");

      // 請求正確的統計路徑
      const response = await fetch(`${baseUrl}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();

      if (data.success && data.stats?.badges) {
        const { packages, shipments, furniture, finance } = data.stats.badges;
        updateBadgeUI("badge-packages", packages);
        updateBadgeUI("badge-shipments", shipments);
        updateBadgeUI("badge-furniture", furniture);
        updateBadgeUI("badge-finance", finance);
      }
    } catch (error) {
      console.warn("[Badge Sync] 通知同步失敗:", error.message);
    }
  };

  /**
   * 更新 UI 上的數字標籤
   */
  function updateBadgeUI(id, count) {
    const el = document.getElementById(id);
    if (!el) return;
    const num = parseInt(count) || 0;
    if (num > 0) {
      el.innerText = num > 99 ? "99+" : num;
      // 強制設定顯示樣式，避免 CSS 覆蓋
      el.style.setProperty("display", "inline-block", "important");
    } else {
      el.style.display = "none";
    }
  }

  // 9. 事件綁定 (側邊欄、遮罩與登出)
  const sidebar = document.querySelector(".sidebar");

  document
    .getElementById("sidebarToggleTop")
    ?.addEventListener("click", (e) => {
      e.stopPropagation();
      sidebar.classList.toggle("toggled");
      if (window.innerWidth <= 768) overlay.classList.toggle("show");
    });

  overlay.addEventListener("click", () => {
    sidebar.classList.remove("toggled");
    overlay.classList.remove("show");
  });

  document.getElementById("layoutLogoutBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    if (confirm("確定登出系統？")) {
      localStorage.clear();
      window.location.href = "admin-login.html";
    }
  });

  // 10. 初始化執行
  window.refreshAdminBadges();

  // 設定每 60 秒自動刷新
  setInterval(window.refreshAdminBadges, 60000);
});

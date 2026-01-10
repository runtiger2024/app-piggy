// frontend/js/admin-layout.js
// V2026.1.8 - 品牌視覺優化版：導入實體 LOGO、整合全域通知標籤與高韌性注入

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

  // 4. 權限檢查邏輯
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
  // [優化重點] 將原本的圖示替換為 assets/logo.png 並調整樣式
  const originalContent = document.body.innerHTML;
  document.body.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.id = "wrapper";
  wrapper.innerHTML = `
        <ul class="sidebar" id="accordionSidebar">
            <a class="sidebar-brand d-flex align-items-center justify-content-center" href="admin-dashboard.html" style="padding: 1.5rem 0.5rem; text-decoration: none;">
                <div class="sidebar-brand-icon">
                    <img src="assets/logo.png" alt="小跑豬" style="width: 45px; height: 45px; object-fit: contain; border-radius: 8px;">
                </div>
                <div class="sidebar-brand-text mx-2" style="font-weight: 800; font-size: 1.1rem; color: #fff; letter-spacing: 1px;">小跑豬後台</div>
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

  const overlay = document.createElement("div");
  overlay.className = "sidebar-overlay";
  document.body.appendChild(overlay);

  // 7. 注入原頁面內容
  const mainContainer = document.getElementById("main-content-container");
  const parser = new DOMParser();
  const doc = parser.parseFromString(originalContent, "text/html");

  doc.getElementById("admin-header-container")?.remove();

  const pageContent = doc.body;

  mainContainer.innerHTML = pageContent.innerHTML;

  // 8. 全域通知標籤同步功能
  window.refreshAdminBadges = async function () {
    if (!adminToken) return;
    try {
      const baseUrl = (
        typeof API_BASE_URL !== "undefined" ? API_BASE_URL : ""
      ).replace(/\/$/, "");
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

  function updateBadgeUI(id, count) {
    const el = document.getElementById(id);
    if (!el) return;
    const num = parseInt(count) || 0;
    if (num > 0) {
      el.innerText = num > 99 ? "99+" : num;
      el.style.setProperty("display", "inline-block", "important");
    } else {
      el.style.display = "none";
    }
  }

  // 9. 事件綁定
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
  setInterval(window.refreshAdminBadges, 60000);
});

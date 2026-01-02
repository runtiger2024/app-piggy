// frontend/js/dashboard-notifications.js
// V2026.1.7 - 旗艦版通知邏輯：修正鈴鐺穩定性、紅藍狀態精確切換、強化跳轉引導

(function () {
  /**
   * 初始化通知中心
   */
  function initNotifications() {
    if (!window.dashboardToken) return;

    const btnNotif = document.getElementById("btn-notification");
    const dropdown = document.getElementById("notification-dropdown");

    if (btnNotif && dropdown) {
      // 1. 綁定鈴鐺點擊開關
      btnNotif.addEventListener("click", (e) => {
        e.stopPropagation();
        const isVisible = dropdown.style.display === "block";

        if (!isVisible) {
          openNotifDropdown(btnNotif, dropdown);
        } else {
          closeNotifDropdown(btnNotif, dropdown);
        }
      });

      // 2. 點擊頁面其他地方關閉選單
      document.addEventListener("click", (e) => {
        if (!btnNotif.contains(e.target) && !dropdown.contains(e.target)) {
          closeNotifDropdown(btnNotif, dropdown);
        }
      });
    }

    // 3. 綁定「全部已讀」功能
    const btnReadAll = document.getElementById("btn-read-all");
    if (btnReadAll) {
      btnReadAll.addEventListener("click", markAllRead);
    }

    // 4. 初始檢查未讀數並設定 60 秒輪詢
    checkUnreadCount();
    setInterval(checkUnreadCount, 60000);
  }

  /**
   * 開啟選單邏輯
   */
  async function openNotifDropdown(btn, dropdown) {
    dropdown.style.display = "block";
    // 開啟時：強制切換為藍色狀態 (is-active)，移除紅色狀態 (has-new)
    btn.classList.add("is-active");
    btn.classList.remove("has-new");

    // 隱藏紅點數字，因為用戶已在查看
    const badge = document.getElementById("notification-badge");
    if (badge) badge.style.display = "none";

    await loadNotifications();
  }

  /**
   * 關閉選單邏輯
   */
  function closeNotifDropdown(btn, dropdown) {
    dropdown.style.display = "none";
    // 關閉時：移除藍色狀態
    btn.classList.remove("is-active");

    // 關閉後重新檢查一次未讀數，若仍有未讀則恢復紅色
    checkUnreadCount();
  }

  /**
   * 從 API 獲取未讀總數 (紅點邏輯)
   */
  async function checkUnreadCount() {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/notifications/unread-count`,
        {
          headers: { Authorization: `Bearer ${window.dashboardToken}` },
        }
      );

      // 如果 API 回傳 404 或其他錯誤，直接終止，不要嘗試解析 JSON
      if (!res.ok) {
        console.warn(`[通知系統] API 異常 (${res.status})，功能暫時停用。`);
        return;
      }

      const data = await res.json();
      const badge = document.getElementById("notif-badge");
      if (badge && data.count !== undefined) {
        badge.textContent = data.count;
        badge.style.display = data.count > 0 ? "block" : "none";
      }
    } catch (e) {
      // 關鍵：攔截錯誤，不要讓它往外噴，以免中斷其他腳本執行
      console.error("通知功能載入失敗，已安全攔截：", e.message);
    }
  }

  /**
   * 更新鈴鐺紅點與外觀顏色
   */
  function updateBadge(count) {
    const badge = document.getElementById("notification-badge");
    const btnNotif = document.getElementById("btn-notification");
    const dropdown = document.getElementById("notification-dropdown");

    if (!badge || !btnNotif) return;

    if (count > 0) {
      badge.textContent = count > 99 ? "99+" : count;

      // 只有當選單沒打開時，才顯示紅點與紅色鈴鐺
      if (dropdown.style.display !== "block") {
        badge.style.display = "flex";
        btnNotif.classList.add("has-new");
      }
    } else {
      badge.style.display = "none";
      btnNotif.classList.remove("has-new");
    }
  }

  /**
   * 載入並渲染通知列表
   */
  async function loadNotifications() {
    const listEl = document.getElementById("notification-list");
    if (!listEl) return;

    listEl.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-circle-notch fa-spin"></i>
        <p>同步訊息中...</p>
      </div>
    `;

    try {
      const res = await fetch(`${API_BASE_URL}/api/notifications?limit=10`, {
        headers: { Authorization: `Bearer ${window.dashboardToken}` },
      });
      const data = await res.json();

      if (data.success) {
        renderNotifications(data.notifications);
      }
    } catch (e) {
      listEl.innerHTML = `<div class="empty-state"><p style="color:var(--p-danger);">載入失敗</p></div>`;
    }
  }

  /**
   * 渲染 HTML 結構
   */
  function renderNotifications(list) {
    const listEl = document.getElementById("notification-list");
    listEl.innerHTML = "";

    if (!list || list.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <i class="far fa-bell-slash"></i>
          <p>目前沒有新通知</p>
        </div>
      `;
      return;
    }

    list.forEach((n) => {
      let iconClass = "fas fa-info-circle";
      let typeClass = "notif-type-system";
      const type = n.type ? n.type.toUpperCase() : "SYSTEM";

      // 類型與圖示配色映射
      if (type.includes("WALLET")) {
        iconClass = "fas fa-wallet";
        typeClass = "notif-type-wallet";
      } else if (type.includes("PACKAGE")) {
        iconClass = "fas fa-box";
        typeClass = "notif-type-package";
      } else if (type.includes("SHIPMENT")) {
        iconClass = "fas fa-shipping-fast";
        typeClass = "notif-type-shipment";
      }

      const itemDiv = document.createElement("div");
      itemDiv.className = `notification-item ${!n.isRead ? "unread" : ""}`;
      itemDiv.onclick = () => handleNotificationClick(n);

      itemDiv.innerHTML = `
        <div class="notif-icon-circle ${typeClass}">
          <i class="${iconClass}"></i>
        </div>
        <div class="notif-content-wrapper">
          <div class="notif-title">${n.title}</div>
          <div class="notif-message">${n.message}</div>
          <div class="notif-time"><i class="far fa-clock"></i> ${timeAgo(
            n.createdAt
          )}</div>
        </div>
      `;
      listEl.appendChild(itemDiv);
    });
  }

  /**
   * 全部標記已讀
   */
  async function markAllRead() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/notifications/read-all`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${window.dashboardToken}` },
      });
      if (res.ok) {
        await loadNotifications();
        checkUnreadCount();
      }
    } catch (e) {
      console.error("全部已讀操作失敗:", e);
    }
  }

  /**
   * 處理單個通知點擊 (標記已讀 + 跳轉)
   */
  async function handleNotificationClick(n) {
    if (!n.isRead) {
      try {
        await fetch(`${API_BASE_URL}/api/notifications/${n.id}/read`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${window.dashboardToken}` },
        });
      } catch (e) {}
    }

    // 關閉選單
    const btnNotif = document.getElementById("btn-notification");
    const dropdown = document.getElementById("notification-dropdown");
    closeNotifDropdown(btnNotif, dropdown);

    // 處理跳轉
    if (n.link && n.link.startsWith("http")) {
      window.location.href = n.link;
      return;
    }

    const type = n.type ? n.type.toUpperCase() : "";
    if (type === "SHIPMENT") {
      document.getElementById("tab-shipments")?.click();
      if (n.link && window.viewShipmentDetail) {
        setTimeout(() => window.viewShipmentDetail(n.link), 300);
      }
    } else if (type === "PACKAGE") {
      document.getElementById("tab-packages")?.click();
    } else if (type === "WALLET") {
      document.getElementById("tab-wallet")?.click();
    }
  }

  /**
   * 輔助：時間格式化
   */
  function timeAgo(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (isNaN(diff)) return "未知時間";
    if (diff < 60) return "剛剛";
    if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`;
    return date.toLocaleDateString("zh-TW", { month: "short", day: "numeric" });
  }

  // 啟動
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNotifications);
  } else {
    initNotifications();
  }
})();

// frontend/js/dashboard-notifications.js
// V2026.1.6 - 旗艦版通知邏輯：修正消失問題、紅/藍狀態精確切換

document.addEventListener("DOMContentLoaded", () => {
  if (!window.dashboardToken) return;

  const btnNotif = document.getElementById("btn-notification");
  const dropdown = document.getElementById("notification-dropdown");
  const badge = document.getElementById("notification-badge");

  if (btnNotif && dropdown) {
    // 1. 綁定鈴鐺點擊
    btnNotif.addEventListener("click", (e) => {
      e.stopPropagation();
      const isVisible = dropdown.style.display === "block";

      if (!isVisible) {
        // --- 開啟選單 ---
        dropdown.style.display = "block";
        // 切換狀態：藍色優先 (代表正在閱讀)
        btnNotif.classList.add("is-active");
        btnNotif.classList.remove("has-new");
        loadNotifications();
      } else {
        // --- 關閉選單 ---
        closeNotifDropdown();
      }
    });

    // 點擊外部關閉
    document.addEventListener("click", (e) => {
      if (!btnNotif.contains(e.target) && !dropdown.contains(e.target)) {
        closeNotifDropdown();
      }
    });
  }

  // 關閉邏輯抽離：方便重複使用
  function closeNotifDropdown() {
    if (!dropdown || !btnNotif) return;
    dropdown.style.display = "none";
    btnNotif.classList.remove("is-active");
    // 關閉後重新檢查一次，如果還有未讀，恢復紅色
    checkUnreadCount();
  }

  // 2. 綁定「全部已讀」
  const btnReadAll = document.getElementById("btn-read-all");
  if (btnReadAll) {
    btnReadAll.addEventListener("click", markAllRead);
  }

  // 3. 初始檢查並啟動 60 秒輪詢
  checkUnreadCount();
  setInterval(checkUnreadCount, 60000);
});

/**
 * 檢查未讀總數
 */
async function checkUnreadCount() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/notifications?limit=1`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();
    if (data.success) {
      updateBadge(data.unreadCount);
    }
  } catch (e) {
    console.warn("通知未讀數同步失敗", e);
  }
}

/**
 * 載入清單並渲染
 */
async function loadNotifications() {
  const listEl = document.getElementById("notification-list");
  if (!listEl) return;

  listEl.innerHTML = `
    <div class="empty-state">
      <i class="fas fa-circle-notch fa-spin"></i>
      <p>正在同步...</p>
    </div>
  `;

  try {
    const res = await fetch(`${API_BASE_URL}/api/notifications?limit=10`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();

    if (data.success) {
      updateBadge(data.unreadCount);
      renderNotifications(data.notifications);
    }
  } catch (e) {
    listEl.innerHTML = `<div class="empty-state">載入失敗</div>`;
  }
}

/**
 * 渲染 HTML
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
 * 更新紅點與鈴鐺狀態色
 */
function updateBadge(count) {
  const badge = document.getElementById("notification-badge");
  const btnNotif = document.getElementById("btn-notification");
  if (!badge || !btnNotif) return;

  if (count > 0) {
    badge.textContent = count > 99 ? "99+" : count;
    badge.style.display = "flex";

    // 如果選單是關閉狀態，才顯示紅色。開啟時維持藍色。
    const dropdown = document.getElementById("notification-dropdown");
    if (dropdown && dropdown.style.display !== "block") {
      btnNotif.classList.add("has-new");
    }
  } else {
    badge.style.display = "none";
    btnNotif.classList.remove("has-new");
  }
}

/**
 * 全部標記為已讀
 */
async function markAllRead() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/notifications/read-all`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    if (res.ok) loadNotifications();
  } catch (e) {
    console.error("標記全部已讀失敗", e);
  }
}

/**
 * 處理通知點擊
 */
async function handleNotificationClick(n) {
  if (!n.isRead) {
    try {
      await fetch(`${API_BASE_URL}/api/notifications/${n.id}/read`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${window.dashboardToken}` },
      });
      checkUnreadCount();
    } catch (e) {}
  }

  // 關閉下拉選單並還原顏色
  document.getElementById("notification-dropdown").style.display = "none";
  document.getElementById("btn-notification").classList.remove("is-active");

  if (n.link && n.link.startsWith("http")) {
    window.location.href = n.link;
    return;
  }

  const type = n.type ? n.type.toUpperCase() : "";
  if (type === "SHIPMENT") {
    document.getElementById("tab-shipments")?.click();
    if (n.link && window.viewShipmentDetail)
      setTimeout(() => window.viewShipmentDetail(n.link), 300);
  } else if (type === "PACKAGE") {
    document.getElementById("tab-packages")?.click();
  } else if (type === "WALLET") {
    document.getElementById("tab-wallet")?.click();
  }
}

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

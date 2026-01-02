// frontend/js/navigation.js (V15 完整版 - 新增傢俱代採購導航)

document.addEventListener("DOMContentLoaded", () => {
  // 1. 取得狀態
  const token = localStorage.getItem("token");
  // 簡單判斷當前頁面檔名
  const path = window.location.pathname;
  const currentPage = path.substring(path.lastIndexOf("/") + 1) || "index.html";
  const isLogin = !!token;

  // --- 2. 電腦版 Header 導航 (渲染位置: .main-nav) ---
  const desktopNavContainer = document.querySelector(".main-nav");

  if (desktopNavContainer) {
    let desktopHTML = "";

    if (isLogin) {
      // 已登入狀態：新增傢俱代採購入口
      desktopHTML = `
        <a href="index.html#calculator-section" class="nav-link">運費試算</a>
        <a href="furniture-procurement.html" class="nav-link ${
          currentPage === "furniture-procurement.html" ? "active" : ""
        }">傢俱代採購</a>
        <a href="dashboard.html" class="nav-link ${
          currentPage === "dashboard.html" ? "active" : ""
        }">會員中心</a>
        <a href="#" id="btn-nav-logout" class="nav-link btn-logout">登出</a>
      `;
    } else {
      // 未登入狀態
      desktopHTML = `
        <a href="index.html#calculator-section" class="nav-link">運費試算</a>
        <a href="login.html" class="nav-link ${
          currentPage.includes("login") ? "active" : ""
        }">會員登入/註冊</a>
      `;
    }

    desktopNavContainer.innerHTML = desktopHTML;
  }

  // --- 3. 手機版 底部導航 (渲染位置: #mobile-bottom-nav) ---
  const mobileNavContainer = document.getElementById("mobile-bottom-nav");

  if (mobileNavContainer) {
    // 定義選單項目：新增「代採購」項目
    const navItems = [
      {
        label: "首頁",
        icon: "fas fa-home",
        href: "index.html",
        isActive: currentPage === "index.html" || currentPage === "",
      },
      {
        label: "試算",
        icon: "fas fa-calculator",
        href: "index.html#calculator-section",
        isActive: false,
      },
      {
        label: "代採購",
        icon: "fas fa-couch",
        href: "furniture-procurement.html",
        isActive: currentPage === "furniture-procurement.html",
      },
      {
        label: isLogin ? "會員" : "登入",
        icon: isLogin ? "fas fa-user-circle" : "fas fa-sign-in-alt",
        href: isLogin ? "dashboard.html" : "login.html",
        isActive:
          currentPage === "dashboard.html" || currentPage.includes("login"),
      },
    ];

    let mobileHTML = "";
    navItems.forEach((item) => {
      mobileHTML += `
        <a href="${item.href}" class="mobile-nav-item ${
        item.isActive ? "active" : ""
      }">
          <div class="nav-icon"><i class="${item.icon}"></i></div>
          <div class="nav-label">${item.label}</div>
        </a>
      `;
    });

    mobileNavContainer.innerHTML = mobileHTML;
  }

  // --- 4. 登出事件綁定 ---
  document.addEventListener("click", (e) => {
    if (e.target && e.target.id === "btn-nav-logout") {
      e.preventDefault();
      if (confirm("確定要登出嗎？")) {
        localStorage.removeItem("token");
        localStorage.removeItem("userName");
        alert("您已經成功登出");
        window.location.href = "login.html";
      }
    }
  });
});

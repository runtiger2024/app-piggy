// frontend/js/navigation.js (V16 旗艦版 - 整合全站可拖曳 LINE 客服)

document.addEventListener("DOMContentLoaded", () => {
  // --- 1. 原有功能：取得狀態與頁面判斷 ---
  const token = localStorage.getItem("token"); //
  const path = window.location.pathname; //
  const currentPage = path.substring(path.lastIndexOf("/") + 1) || "index.html"; //
  const isLogin = !!token; //

  // --- 2. 原有功能：電腦版 Header 導航 (渲染位置: .main-nav) ---
  const desktopNavContainer = document.querySelector(".main-nav"); //

  if (desktopNavContainer) {
    let desktopHTML = ""; //

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
      `; //
    } else {
      // 未登入狀態
      desktopHTML = `
        <a href="index.html#calculator-section" class="nav-link">運費試算</a>
        <a href="login.html" class="nav-link ${
          currentPage.includes("login") ? "active" : ""
        }">會員登入/註冊</a>
      `; //
    }

    desktopNavContainer.innerHTML = desktopHTML; //
  }

  // --- 3. 原有功能：手機版 底部導航 (渲染位置: #mobile-bottom-nav) ---
  const mobileNavContainer = document.getElementById("mobile-bottom-nav"); //

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
    ]; //

    let mobileHTML = ""; //
    navItems.forEach((item) => {
      mobileHTML += `
        <a href="${item.href}" class="mobile-nav-item ${
        item.isActive ? "active" : ""
      }">
          <div class="nav-icon"><i class="${item.icon}"></i></div>
          <div class="nav-label">${item.label}</div>
        </a>
      `; //
    });

    mobileNavContainer.innerHTML = mobileHTML; //
  }

  // --- 4. 原有功能：登出事件綁定 ---
  document.addEventListener("click", (e) => {
    if (e.target && e.target.id === "btn-nav-logout") {
      e.preventDefault(); //
      if (confirm("確定要登出嗎？")) {
        localStorage.removeItem("token"); //
        localStorage.removeItem("userName"); //
        alert("您已經成功登出"); //
        window.location.href = "login.html"; //
      }
    }
  });

  // --- 5. 新增功能：全站可拖曳 LINE 客服懸浮球 ---
  // 建立懸浮球 HTML 結構
  const lineWrapper = document.createElement("div");
  lineWrapper.id = "draggable-line-btn";
  lineWrapper.className = "line-float-wrapper";
  lineWrapper.innerHTML = `
    <a href="https://lin.ee/eK6HptX" target="_blank" class="line-float-btn pulse" id="line-anchor">
      <i class="fab fa-line"></i>
    </a>
  `;
  document.body.appendChild(lineWrapper);

  // 拖曳邏輯變數
  let isDragging = false;
  let dragStarted = false;
  let startX, startY, initialX, initialY;
  const dragThreshold = 5; // 判定為拖曳的位移閾值 (像素)

  // 處理拖曳開始
  const dragStart = (e) => {
    const clientX = e.type === "touchstart" ? e.touches[0].clientX : e.clientX;
    const clientY = e.type === "touchstart" ? e.touches[0].clientY : e.clientY;

    dragStarted = true;
    isDragging = false;
    startX = clientX;
    startY = clientY;

    const rect = lineWrapper.getBoundingClientRect();
    initialX = rect.left;
    initialY = rect.top;

    const moveEvent = e.type === "touchstart" ? "touchmove" : "mousemove";
    const endEvent = e.type === "touchstart" ? "touchend" : "mouseup";

    const onMove = (moveEv) => dragMove(moveEv);
    const onEnd = () => {
      document.removeEventListener(moveEvent, onMove);
      document.removeEventListener(endEvent, onEnd);
      dragEnd();
    };

    document.addEventListener(moveEvent, onMove, { passive: false });
    document.addEventListener(endEvent, onEnd);
  };

  // 處理拖曳中
  const dragMove = (e) => {
    if (!dragStarted) return;

    const clientX = e.type === "touchmove" ? e.touches[0].clientX : e.clientX;
    const clientY = e.type === "touchmove" ? e.touches[0].clientY : e.clientY;

    const deltaX = clientX - startX;
    const deltaY = clientY - startY;

    // 只有位移超過閾值才判定為拖曳，避免輕微手震導致無法點擊連結
    if (Math.abs(deltaX) > dragThreshold || Math.abs(deltaY) > dragThreshold) {
      isDragging = true;
      if (e.cancelable) e.preventDefault();

      let newX = initialX + deltaX;
      let newY = initialY + deltaY;

      // 視窗邊界限制
      const windowW = window.innerWidth - lineWrapper.offsetWidth;
      const windowH = window.innerHeight - lineWrapper.offsetHeight;

      newX = Math.max(0, Math.min(newX, windowW));
      newY = Math.max(0, Math.min(newY, windowH));

      lineWrapper.style.left = `${newX}px`;
      lineWrapper.style.top = `${newY}px`;
      lineWrapper.style.right = "auto";
      lineWrapper.style.bottom = "auto";
    }
  };

  // 處理拖曳結束
  const dragEnd = () => {
    dragStarted = false;
    const anchor = document.getElementById("line-anchor");
    if (isDragging) {
      // 如果觸發了拖曳，則攔截接下來的點擊跳轉事件
      anchor.onclick = (e) => {
        e.preventDefault();
        anchor.onclick = null;
      };
    } else {
      anchor.onclick = null;
    }
  };

  // 綁定事件監聽
  lineWrapper.addEventListener("mousedown", dragStart);
  lineWrapper.addEventListener("touchstart", dragStart, { passive: true });
});

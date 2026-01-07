// frontend/js/auth.js (旗艦整合版 - 支援一般登入、註冊與 LINE 快速登入)

document.addEventListener("DOMContentLoaded", async () => {
  // --- 1. 獲取元素 ---
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const loginTab = document.getElementById("tab-login");
  const registerTab = document.getElementById("tab-register");
  const messageBox = document.getElementById("message-box");
  const lineLoginBtn = document.getElementById("lineLoginBtn"); // [新增] LINE 按鈕

  // --- 2. LINE Login 初始化與邏輯 (LIFF) ---
  // [注意] 請在 LINE Developers 的 LIFF 頁籤建立後，將取得的 ID 填入下方
  const MY_LIFF_ID = "2008843170-UepDAsyw"; // 請替換為您的 LIFF ID

  /**
   * 初始化 LINE LIFF 並檢查登入狀態
   */
  async function initLineLogin() {
    if (!lineLoginBtn) return;

    try {
      // 動態載入 LINE SDK (若 HTML 未引入)
      if (typeof liff === "undefined") {
        await loadLiffSDK();
      }

      await liff.init({ liffId: MY_LIFF_ID });

      // 檢查是否是從 LINE 授權後跳轉回來的
      if (liff.isLoggedIn()) {
        handleLineLoginData();
      }
    } catch (err) {
      console.warn("LINE SDK 初始化失敗，請檢查 LIFF ID 是否正確:", err);
    }
  }

  /**
   * 處理 LINE 登入成功後的資料交換
   */
  async function handleLineLoginData() {
    try {
      setLoading(lineLoginBtn, true);
      const profile = await liff.getProfile();
      const userEmail = liff.getDecodedIDToken().email; // 需在 LINE Console 開啟 Email 權限

      const response = await fetch(`${API_BASE_URL}/api/auth/line-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineUserId: profile.userId,
          name: profile.displayName,
          email: userEmail,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "LINE 登入驗證失敗");

      // 登入成功處理 (與一般登入一致)
      showMessage("LINE 登入成功！正在跳轉...", "success");
      localStorage.setItem("token", data.token);
      localStorage.setItem("userName", data.user.name || data.user.email);

      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 2000);
    } catch (error) {
      console.error("LINE 驗證錯誤:", error);
      showMessage(error.message, "error");
      setLoading(
        lineLoginBtn,
        false,
        `<i class="fab fa-line"></i> <span>LINE 快速登入 / 註冊</span>`
      );
      liff.logout(); // 失敗時登出，允許用戶重試
    }
  }

  // LINE 按鈕點擊事件
  if (lineLoginBtn) {
    lineLoginBtn.addEventListener("click", () => {
      if (!liff.isLoggedIn()) {
        liff.login();
      } else {
        handleLineLoginData();
      }
    });
  }

  // --- 3. 頁籤切換邏輯 ---
  const switchTab = (mode) => {
    if (mode === "login") {
      loginTab.classList.add("active");
      registerTab.classList.remove("active");
      loginForm.style.display = "block";
      registerForm.style.display = "none";
    } else {
      loginTab.classList.remove("active");
      registerTab.classList.add("active");
      loginForm.style.display = "none";
      registerForm.style.display = "block";
    }
    showMessage("", "clear");
  };

  loginTab.addEventListener("click", () => switchTab("login"));
  registerTab.addEventListener("click", () => switchTab("register"));

  // --- 4. 登入表單提交 (呼叫 /api/auth/login) ---
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showMessage("", "clear");

    const submitBtn = loginForm.querySelector('button[type="submit"]');
    const originalBtnHtml = submitBtn.innerHTML;

    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;

    setLoading(submitBtn, true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "登入失敗");

      showMessage("登入成功！正在跳轉至會員中心...", "success");
      localStorage.setItem("token", data.token);
      localStorage.setItem("userName", data.user.name || data.user.email);

      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 2000);
    } catch (error) {
      console.error("登入錯誤:", error);
      showMessage(error.message, "error");
      setLoading(submitBtn, false, originalBtnHtml);
    }
  });

  // --- 5. 註冊表單提交 (呼叫 /api/auth/register) ---
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showMessage("", "clear");

    const submitBtn = registerForm.querySelector('button[type="submit"]');
    const originalBtnHtml = submitBtn.innerHTML;

    const name = document.getElementById("reg-name").value;
    const email = document.getElementById("reg-email").value;
    const password = document.getElementById("reg-password").value;
    const confirmPasswordInput = document.getElementById(
      "reg-password-confirm"
    );
    const confirmPassword = confirmPasswordInput
      ? confirmPasswordInput.value
      : null;

    if (password.length < 6) {
      showMessage("密碼長度至少需要 6 個字元", "error");
      return;
    }

    if (confirmPassword !== null && password !== confirmPassword) {
      showMessage("兩次輸入的密碼不一致，請重新檢查", "error");
      if (confirmPasswordInput) confirmPasswordInput.focus();
      return;
    }

    setLoading(submitBtn, true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "註冊失敗");

      showMessage("註冊成功！正在自動登入並跳轉...", "success");
      localStorage.setItem("token", data.token);
      localStorage.setItem("userName", data.user.name || data.user.email);

      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 2000);
    } catch (error) {
      console.error("註冊錯誤:", error);
      showMessage(error.message, "error");
      setLoading(submitBtn, false, originalBtnHtml);
    }
  });

  // --- 6. 輔助工具函式 ---

  function setLoading(btn, isLoading, originalHtml) {
    if (isLoading) {
      btn.disabled = true;
      btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 處理中...`;
    } else {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }

  function showMessage(message, type) {
    messageBox.textContent = message;
    if (type === "error") {
      messageBox.className = "alert alert-error";
      messageBox.style.display = "block";
    } else if (type === "success") {
      messageBox.className = "alert alert-success";
      messageBox.style.display = "block";
    } else {
      messageBox.style.display = "none";
    }
  }

  function loadLiffSDK() {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // 執行 LINE 登入初始化
  initLineLogin();
});

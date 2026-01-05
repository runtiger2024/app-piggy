// frontend/js/auth.js (旗艦優化版 - 整合確認密碼與載入狀態)

document.addEventListener("DOMContentLoaded", () => {
  // --- 1. 獲取元素 ---
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const loginTab = document.getElementById("tab-login");
  const registerTab = document.getElementById("tab-register");
  const messageBox = document.getElementById("message-box");

  // --- 2. 頁籤切換邏輯 ---
  // 保留原始功能：切換 active 類別、顯示對應表單並清除訊息
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

  // --- 3. 登入表單提交 (呼叫 /api/auth/login) ---
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showMessage("", "clear");

    const submitBtn = loginForm.querySelector('button[type="submit"]');
    const originalBtnHtml = submitBtn.innerHTML;

    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;

    // 開啟載入狀態
    setLoading(submitBtn, true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "登入失敗");
      }

      // 登入成功邏輯 (一字不漏保留)
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

  // --- 4. 註冊表單提交 (呼叫 /api/auth/register) ---
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showMessage("", "clear");

    const submitBtn = registerForm.querySelector('button[type="submit"]');
    const originalBtnHtml = submitBtn.innerHTML;

    const name = document.getElementById("reg-name").value;
    const email = document.getElementById("reg-email").value;
    const password = document.getElementById("reg-password").value;

    // [新功能] 獲取確認密碼欄位值
    const confirmPasswordInput = document.getElementById(
      "reg-password-confirm"
    );
    const confirmPassword = confirmPasswordInput
      ? confirmPasswordInput.value
      : null;

    // 原始長度校驗
    if (password.length < 6) {
      showMessage("密碼長度至少需要 6 個字元", "error");
      return;
    }

    // [新功能] 確認密碼一致性校驗
    if (confirmPassword !== null && password !== confirmPassword) {
      showMessage("兩次輸入的密碼不一致，請重新檢查", "error");
      if (confirmPasswordInput) confirmPasswordInput.focus();
      return;
    }

    // 開啟載入狀態
    setLoading(submitBtn, true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "註冊失敗");
      }

      // 註冊成功邏輯 (一字不漏保留)
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

  // --- 5. 輔助工具函式 ---

  // [新功能] 按鈕載入狀態切換
  function setLoading(btn, isLoading, originalHtml) {
    if (isLoading) {
      btn.disabled = true;
      btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 處理中...`;
    } else {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }

  // 訊息顯示工具 (保留原始邏輯並微調樣式相容性)
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
});

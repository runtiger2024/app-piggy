// frontend/js/auth.js (V16.1 - 旗艦穩定版)

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const loginTab = document.getElementById("tab-login");
  const registerTab = document.getElementById("tab-register");
  const messageBox = document.getElementById("message-box");

  // --- 1. 頁籤切換邏輯 ---
  const switchTab = (activeTab, inactiveTab, showForm, hideForm) => {
    activeTab.classList.add("active");
    inactiveTab.classList.remove("active");
    showForm.style.display = "block";
    hideForm.style.display = "none";
    showMessage("", "clear");
  };

  if (loginTab)
    loginTab.addEventListener("click", () =>
      switchTab(loginTab, registerTab, loginForm, registerForm)
    );
  if (registerTab)
    registerTab.addEventListener("click", () =>
      switchTab(registerTab, loginTab, registerForm, loginForm)
    );

  // --- 2. 登入表單提交 ---
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      showMessage("正在登入中...", "info");

      const email = document.getElementById("login-email").value.trim();
      const password = document.getElementById("login-password").value;

      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "登入失敗");

        // [關鍵優化]：將身分資料領全，包含專屬 PiggyID 與權限
        localStorage.setItem("token", data.token);
        localStorage.setItem("userName", data.user.name || data.user.email);
        localStorage.setItem("piggyId", data.user.piggyId); // 儲存會員編號 (RPXXXXXXX)
        localStorage.setItem(
          "permissions",
          JSON.stringify(data.user.permissions || [])
        );

        showMessage("登入成功！正在跳轉...", "success");
        setTimeout(() => {
          window.location.href = "dashboard.html";
        }, 1500);
      } catch (error) {
        showMessage(error.message, "error");
      }
    });
  }

  // --- 3. 註冊表單提交 ---
  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("reg-name").value.trim();
      const email = document.getElementById("reg-email").value.trim();
      const password = document.getElementById("reg-password").value;

      // [大師級初步驗證]：攔截無效格式
      if (!name) return showMessage("請輸入姓名", "error");
      if (!validateEmail(email))
        return showMessage("Email 格式不正確", "error");
      if (password.length < 6)
        return showMessage("密碼至少需要 6 個字元", "error");

      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "註冊失敗");

        // 註冊成功後自動儲存身分資料
        localStorage.setItem("token", data.token);
        localStorage.setItem("userName", data.user.name || data.user.email);
        localStorage.setItem("piggyId", data.user.piggyId);

        showMessage("註冊成功！即將跳轉會員中心...", "success");
        setTimeout(() => {
          window.location.href = "dashboard.html";
        }, 2000);
      } catch (error) {
        showMessage(error.message, "error");
      }
    });
  }

  // --- 4. 工具函數 ---
  function validateEmail(email) {
    return String(email)
      .toLowerCase()
      .match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  }

  function showMessage(message, type) {
    if (!messageBox) return;
    messageBox.textContent = message;
    messageBox.className = `alert alert-${type}`;
    messageBox.style.display = message ? "block" : "none";
  }
});

/**
 * [大師新增]：登出功能 (清空口袋所有鑰匙)
 */
function logout() {
  localStorage.clear();
  window.location.href = "login.html";
}

/**
 * [Apple 審核強制要求]：帳號註銷功能 (呼叫後端 deleteMe)
 */
async function deleteAccount() {
  const confirmText =
    "警告：註銷帳號將清除所有個人資料且不可恢復！確定要繼續嗎？";
  if (!confirm(confirmText)) return;

  const token = localStorage.getItem("token");
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/delete-me`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      alert("帳號已成功註銷，個資已清除。");
      logout();
    } else {
      alert("註銷失敗，請聯繫小跑豬客服協助。");
    }
  } catch (err) {
    console.error("註銷過程出錯:", err);
  }
}

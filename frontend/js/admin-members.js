// frontend/js/admin-members.js
// V2025.Security.Enhanced.Robust - Robust ID Handling & Info-Rich Layout
// [優化] 強化會員名單顯示：加入會員 ID (piggyId)、預設地址與資信摘要

document.addEventListener("DOMContentLoaded", () => {
  const adminToken = localStorage.getItem("admin_token");
  const myPermissions = JSON.parse(
    localStorage.getItem("admin_permissions") || "[]"
  );
  const myEmail = localStorage.getItem("admin_name"); // 用於判斷是否為本人

  if (!adminToken) {
    console.error("管理員未授權，請重新登入。");
    return;
  }

  // --- 分頁與篩選變數 ---
  let currentPage = 1;
  const limit = 20;
  let currentSearch = "";
  let currentRole = "";
  let currentStatus = "";

  /**
   * 內部輔助函數：安全賦值系統
   * 這是解決 "Cannot set properties of null" 的核心工具
   */
  const safeSetVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = val !== undefined && val !== null ? val : "";
    } else {
      console.warn(
        `[跑跑虎診斷] 找不到 Input ID: "${id}"，請確認 HTML 結構是否完整。`
      );
    }
  };

  init();

  /**
   * 事件初始化
   */
  function init() {
    // 搜尋功能
    const btnSearch = document.getElementById("btn-search");
    if (btnSearch) {
      btnSearch.addEventListener("click", () => {
        currentSearch = document.getElementById("search-input")?.value || "";
        currentRole = document.getElementById("role-filter")?.value || "";
        currentStatus = document.getElementById("status-filter")?.value || "";
        currentPage = 1;
        loadMembers();
      });
    }

    // Modal 關閉按鈕事件委託
    document.addEventListener("click", (e) => {
      if (
        e.target.classList.contains("modal-close-btn") ||
        e.target.closest(".modal-close-btn")
      ) {
        const modal = document.getElementById("member-modal");
        if (modal) modal.style.display = "none";
      }
    });

    // 功能按鈕監聽 (現場抓取元素避免失效)
    const btnResetPwd = document.getElementById("btn-reset-pwd");
    if (btnResetPwd) btnResetPwd.addEventListener("click", resetPassword);

    const btnImpersonate = document.getElementById("btn-impersonate");
    if (btnImpersonate)
      btnImpersonate.addEventListener("click", impersonateUser);

    // 表單提交處理
    document.addEventListener("submit", (e) => {
      if (e.target.id === "member-form") {
        saveProfile(e);
      }
    });

    // 點擊 Modal 外部關閉
    window.onclick = (event) => {
      const modal = document.getElementById("member-modal");
      if (event.target === modal) modal.style.display = "none";
    };

    // 執行首次載入
    loadMembers();
  }

  /**
   * 載入會員列表
   */
  async function loadMembers() {
    const tbody = document.getElementById("members-list");
    if (!tbody) return;
    tbody.innerHTML =
      '<tr><td colspan="8" class="text-center p-4"><i class="fas fa-spinner fa-spin"></i> 資料載入中...</td></tr>';

    try {
      let url = `${API_BASE_URL}/api/admin/users?page=${currentPage}&limit=${limit}`;
      if (currentSearch)
        url += `&search=${encodeURIComponent(currentSearch.trim())}`;
      if (currentRole) url += `&role=${currentRole}`;
      if (currentStatus) url += `&status=${currentStatus}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "載入失敗");

      renderTable(data.users || []);
      renderPagination(data.pagination);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger p-4">載入錯誤: ${e.message}</td></tr>`;
    }
  }

  /**
   * 渲染表格 UI - 優化內容顯示
   */
  function renderTable(users) {
    const tbody = document.getElementById("members-list");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (users.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="8" class="text-center p-4 text-muted">查無符合條件的會員</td></tr>';
      return;
    }

    users.forEach((u) => {
      const tr = document.createElement("tr");

      // 1. 角色標籤邏輯
      let roleBadge =
        '<span class="status-badge" style="background:#e3f2fd; color:#0d47a1;">會員</span>';
      let perms = [];
      try {
        perms = Array.isArray(u.permissions)
          ? u.permissions
          : JSON.parse(u.permissions || "[]");
      } catch (e) {
        perms = [];
      }

      if (perms.includes("USER_MANAGE") || perms.includes("CAN_MANAGE_USERS")) {
        roleBadge =
          '<span class="status-badge" style="background:#fff3cd; color:#856404;">管理員</span>';
      } else if (perms.length > 0) {
        roleBadge =
          '<span class="status-badge" style="background:#d1e7dd; color:#0f5132;">操作員</span>';
      }

      // 2. 狀態顯示
      const statusHtml = u.isActive
        ? '<span class="text-success"><i class="fas fa-check-circle"></i> 啟用中</span>'
        : '<span class="text-danger"><i class="fas fa-ban"></i> 已停用</span>';

      // 3. 錢包與資信摘要 (新增統編顯示)
      const balance = u.wallet ? u.wallet.balance : 0;
      const formattedBalance = new Intl.NumberFormat("zh-TW", {
        style: "currency",
        currency: "TWD",
        minimumFractionDigits: 0,
      }).format(balance);
      const taxIdHtml = u.defaultTaxId
        ? `<div class="mt-1"><small class="badge bg-light text-muted border">統編: ${u.defaultTaxId}</small></div>`
        : "";

      // 4. 地址縮略處理 (增加直觀性)
      const addrDisplay = u.defaultAddress
        ? `<div style="max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.85rem;" title="${u.defaultAddress}">${u.defaultAddress}</div>`
        : '<span class="text-muted" style="font-size: 0.85rem;">- 未設定 -</span>';

      const uStr = encodeURIComponent(JSON.stringify(u));

      tr.innerHTML = `
        <td data-label="會員資訊">
          <div class="font-weight-bold text-primary" style="letter-spacing: 0.5px;">${
            u.piggyId || "待分配"
          }</div>
          <div class="text-dark font-weight-bold">${u.name || "-"}</div>
        </td>
        <td data-label="聯絡帳號">
          <div style="font-size: 0.9rem;">${u.email}</div>
          <div class="text-muted" style="font-size: 0.85rem;">${
            u.phone || "-"
          }</div>
        </td>
        <td data-label="預設收貨地址">${addrDisplay}</td>
        <td data-label="資信摘要">
          <div style="font-family: 'Roboto Mono', monospace; font-weight: bold; color: #2c3e50;">${formattedBalance}</div>
          ${taxIdHtml}
        </td>
        <td data-label="角色">${roleBadge}</td>
        <td data-label="註冊日期" style="font-size: 0.85rem;">${new Date(
          u.createdAt
        ).toLocaleDateString()}</td>
        <td data-label="狀態">${statusHtml}</td>
        <td data-label="操作">
          <div style="display:flex; gap:5px; justify-content:flex-end;">
            <button class="btn btn-primary btn-sm" title="編輯" onclick="window.openModal('${uStr}')">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn btn-sm ${
              u.isActive ? "btn-warning" : "btn-success"
            }" 
                    title="${u.isActive ? "停用帳號" : "啟用帳號"}" 
                    onclick="window.toggleStatus('${u.id}', ${!u.isActive})">
              <i class="fas ${
                u.isActive ? "fa-user-slash" : "fa-user-check"
              }"></i>
            </button>
            <button class="btn btn-danger btn-sm" title="刪除" onclick="window.deleteUser('${
              u.id
            }', '${u.email}')">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderPagination(pg) {
    const paginationDiv = document.getElementById("pagination");
    if (!paginationDiv || !pg || pg.totalPages <= 1) return;
    paginationDiv.innerHTML = "";

    const createBtn = (text, page, disabled = false) => {
      const btn = document.createElement("button");
      btn.className = `btn btn-sm ${
        disabled ? "btn-light border disabled" : "btn-light border"
      }`;
      btn.textContent = text;
      if (!disabled)
        btn.onclick = () => {
          currentPage = page;
          loadMembers();
        };
      return btn;
    };

    paginationDiv.appendChild(
      createBtn("上一頁", currentPage - 1, currentPage === 1)
    );
    const info = document.createElement("span");
    info.className = "btn btn-sm btn-primary disabled mx-1";
    info.textContent = `${currentPage} / ${pg.totalPages}`;
    paginationDiv.appendChild(info);
    paginationDiv.appendChild(
      createBtn("下一頁", currentPage + 1, currentPage === pg.totalPages)
    );
  }

  // --- [核心功能掛載到 window] ---

  window.openModal = function (str) {
    try {
      const u = JSON.parse(decodeURIComponent(str));
      const modal = document.getElementById("member-modal");
      if (!modal)
        return console.error(
          "找不到 member-modal，請確認 HTML 是否在 container-fluid 內"
        );

      // 1. 文字與基礎欄位安全賦值 (修復報錯點)
      safeSetVal("edit-user-id", u.id);
      safeSetVal("m-email", u.email);
      safeSetVal("m-name", u.name);
      safeSetVal("m-phone", u.phone);

      const addrEl = document.getElementById("m-address");
      if (addrEl) addrEl.value = u.defaultAddress || "";

      // 2. 權限 Checkbox 同步
      let perms = [];
      try {
        perms = Array.isArray(u.permissions)
          ? u.permissions
          : JSON.parse(u.permissions || "[]");
      } catch (e) {}

      document.querySelectorAll(".perm-check").forEach((cb) => {
        cb.checked = perms.includes(cb.value);
      });

      // 3. 模擬登入權限檢查
      const btnImpersonate = document.getElementById("btn-impersonate");
      if (btnImpersonate) {
        const isSelf = u.email === myEmail;
        const canImpersonate =
          myPermissions.includes("USER_IMPERSONATE") ||
          myPermissions.includes("CAN_MANAGE_USERS");
        btnImpersonate.style.display =
          canImpersonate && !isSelf ? "inline-block" : "none";
      }

      modal.style.display = "flex";
    } catch (err) {
      console.error("解析 Modal 資料失敗:", err);
    }
  };

  async function saveProfile(e) {
    e.preventDefault();
    const id = document.getElementById("edit-user-id")?.value;
    if (!id) return;

    const submitBtn = e.target.querySelector("button[type='submit']");
    const originalText = submitBtn.innerHTML;

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 儲存中...';

    const profileBody = {
      name: document.getElementById("m-name")?.value || "",
      phone: document.getElementById("m-phone")?.value || "",
      defaultAddress: document.getElementById("m-address")?.value || "",
    };

    const selectedPerms = Array.from(
      document.querySelectorAll(".perm-check:checked")
    ).map((cb) => cb.value);

    try {
      // 同時更新資料與權限
      const [resProfile, resPerms] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/users/${id}/profile`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(profileBody),
        }),
        fetch(`${API_BASE_URL}/api/admin/users/${id}/permissions`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ permissions: selectedPerms }),
        }),
      ]);

      if (resProfile.ok && resPerms.ok) {
        alert("會員資料與權限更新成功");
        document.getElementById("member-modal").style.display = "none";
        loadMembers();
      } else {
        throw new Error("部分資料更新失敗");
      }
    } catch (err) {
      alert("更新出錯：" + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  }

  async function resetPassword() {
    if (!confirm("確定要將此會員密碼重設為 '8888' 嗎？")) return;
    const id = document.getElementById("edit-user-id")?.value;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/users/${id}/reset-password`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      if (res.ok) alert("密碼重設成功：8888");
      else alert("重設失敗");
    } catch (err) {
      alert("連線錯誤");
    }
  }

  async function impersonateUser() {
    const id = document.getElementById("edit-user-id")?.value;
    if (!confirm("確定要模擬此會員登入前台嗎？")) return;

    const btn = document.getElementById("btn-impersonate");
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 處理中...';

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/users/${id}/impersonate`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      const data = await res.json();

      if (res.ok) {
        const win = window.open("dashboard.html", "_blank");
        setTimeout(() => {
          if (win) {
            win.localStorage.setItem("token", data.token);
            win.localStorage.setItem(
              "userName",
              data.user.name || data.user.email
            );
            win.location.reload(); // 重新載入確保 Token 生效
          }
        }, 800);
      } else {
        alert("模擬失敗: " + (data.message || "權限不足"));
      }
    } catch (err) {
      alert("請求錯誤: " + err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-user-secret"></i> 模擬登入';
    }
  }

  window.toggleStatus = async function (id, isActive) {
    if (!confirm(`確定要${isActive ? "啟用" : "停用"}此帳號嗎？`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${id}/status`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isActive }),
      });
      if (res.ok) loadMembers();
      else alert("狀態更新失敗");
    } catch (err) {
      alert("操作出錯");
    }
  };

  window.deleteUser = async function (id, email) {
    if (
      prompt(
        `【危險】確定要永久刪除會員 ${email}？\n請輸入大寫 "DELETE" 確認：`
      ) !== "DELETE"
    )
      return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.ok) {
        alert("會員已成功移除");
        loadMembers();
      } else alert("刪除失敗");
    } catch (err) {
      alert("網路連線問題");
    }
  };
});

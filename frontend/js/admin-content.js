/**
 * js/admin-content.js
 * V2026.01.Final.Fixed - 旗艦內容管理系統 (CMS) 整合優化版
 * 解決問題：修復新增按鈕無反應、加強資料讀取安全性、確保全域函式優先掛載
 * 負責處理：最新消息、常見問題、關於我們 的增刪改查邏輯
 */

// --- [ 核心優化：優先掛載全域函式，確保 HTML onclick 永遠有效 ] ---

/**
 * 開啟最新消息彈窗
 * @param {string} id - 公告 ID，若為空則視為新增
 */
window.openNewsModal = function (id = "") {
  const modal = document.getElementById("modal-news");
  const form = document.getElementById("form-news-item");
  if (!modal || !form) return;

  form.reset();
  const idField = document.getElementById("news-id");
  if (idField) idField.value = id;

  const titleElem = document.getElementById("news-modal-title");
  if (titleElem) titleElem.innerText = id ? "編輯公告內容" : "發布新公告";

  // 若為編輯模式，則從 API 獲取詳細資料
  if (id && id !== "new") {
    fetch(`${API_BASE_URL}/api/admin/news/${id}`, { headers: getAuthHeader() })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          const n = data.news || data.item || {};
          if (document.getElementById("news-title-input"))
            document.getElementById("news-title-input").value = n.title || "";
          if (document.getElementById("news-category"))
            document.getElementById("news-category").value =
              n.category || "GENERAL";
          if (document.getElementById("news-content-input"))
            document.getElementById("news-content-input").value =
              n.content || "";
          if (document.getElementById("news-important"))
            document.getElementById("news-important").checked = !!n.isImportant;
          if (document.getElementById("news-published"))
            document.getElementById("news-published").checked = !!n.isPublished;
        }
      })
      .catch((err) => console.error("獲取公告詳情失敗", err));
  }
  modal.style.display = "flex";
};

/**
 * 開啟常見問題彈窗
 */
window.openFaqModal = function (id = "") {
  const modal = document.getElementById("modal-faq");
  const form = document.getElementById("form-faq-item");
  if (!modal || !form) return;

  form.reset();
  const idField = document.getElementById("faq-id");
  if (idField) idField.value = id;

  const titleElem = document.getElementById("faq-modal-title");
  if (titleElem) titleElem.innerText = id ? "編輯常見問題" : "新增 Q&A 項目";

  // 實作：從 API 載入資料供編輯
  if (id && id !== "new") {
    fetch(`${API_BASE_URL}/api/admin/faq/${id}`, { headers: getAuthHeader() })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          const f = data.faq || data.item || {};
          if (document.getElementById("faq-question-input"))
            document.getElementById("faq-question-input").value =
              f.question || "";
          if (document.getElementById("faq-answer-input"))
            document.getElementById("faq-answer-input").value = f.answer || "";
          if (document.getElementById("faq-category"))
            document.getElementById("faq-category").value =
              f.category || "LOGISTICS";
          if (document.getElementById("faq-order"))
            document.getElementById("faq-order").value = f.order || 0;
          if (document.getElementById("faq-active"))
            document.getElementById("faq-active").checked = !!f.isActive;
        }
      })
      .catch((err) => console.error("獲取 FAQ 詳情失敗", err));
  }
  modal.style.display = "flex";
};

// 設置別名以相容 HTML 原始調用
window.editNews = (id) => window.openNewsModal(id);
window.editFaq = (id) => window.openFaqModal(id);

window.closeNewsModal = () => {
  const modal = document.getElementById("modal-news");
  if (modal) modal.style.display = "none";
};

window.closeFaqModal = () => {
  const modal = document.getElementById("modal-faq");
  if (modal) modal.style.display = "none";
};

// --- [ 初始化與事件監聽 ] ---

document.addEventListener("DOMContentLoaded", () => {
  // 若位於系統設定頁面，預設載入第一分頁資料
  if (window.location.pathname.includes("admin-settings")) {
    loadAdminNews();
  }

  // 監聽全局 Tab 切換事件 (相容 data-tab 屬性切換)
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabId = btn.dataset.tab;
      if (tabId === "tab-news") loadAdminNews();
      if (tabId === "tab-faq") loadAdminFaq();
      if (tabId === "tab-about") loadAdminAbout();
    });
  });

  // 綁定表單提交事件
  document
    .getElementById("form-news-item")
    ?.addEventListener("submit", handleNewsSubmit);
  document
    .getElementById("form-faq-item")
    ?.addEventListener("submit", handleFaqSubmit);
  document
    .getElementById("form-admin-about")
    ?.addEventListener("submit", handleAboutSubmit);
});

// --- [ 全域變數與輔助工具 ] ---
const getAuthHeader = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("admin_token")}`,
});

// --- [ 1. 最新消息管理 (News) ] ---

async function loadAdminNews() {
  const container = document.getElementById("admin-news-container");
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/news`, {
      headers: getAuthHeader(),
    });
    const data = await res.json();

    // 安全檢查：確保 data.news 存在且為陣列，防止腳本崩潰
    if (!data.success || !Array.isArray(data.news)) {
      container.innerHTML =
        '<tr><td colspan="6" class="text-center">暫無公告資料</td></tr>';
      return;
    }

    container.innerHTML = data.news
      .map(
        (n) => `
      <tr>
        <td>
          <span class="badge ${
            n.isPublished ? "badge-success" : "badge-secondary"
          }">
            ${n.isPublished ? "已發布" : "草稿"}
          </span>
        </td>
        <td>${n.category}</td>
        <td>${n.isImportant ? "🚩 " : ""}${n.title}</td>
        <td>${
          n.isImportant ? '<span class="badge-important">重要</span>' : "一般"
        }</td>
        <td>${new Date(n.createdAt).toLocaleDateString()}</td>
        <td>
          <div class="btn-action-group">
            <button class="btn btn-sm btn-outline-primary" onclick="editNews('${
              n.id
            }')">編輯</button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteNews('${
              n.id
            }')">刪除</button>
          </div>
        </td>
      </tr>
    `
      )
      .join("");
  } catch (e) {
    console.error("載入消息失敗", e);
  }
}

async function handleNewsSubmit(e) {
  e.preventDefault();
  const id = document.getElementById("news-id").value;
  const body = {
    title: document.getElementById("news-title-input").value,
    category: document.getElementById("news-category").value,
    content: document.getElementById("news-content-input").value,
    isImportant: document.getElementById("news-important").checked,
    isPublished: document.getElementById("news-published").checked,
  };

  const url =
    id && id !== "new"
      ? `${API_BASE_URL}/api/admin/news/${id}`
      : `${API_BASE_URL}/api/admin/news`;
  const method = id && id !== "new" ? "PUT" : "POST";

  try {
    const res = await fetch(url, {
      method,
      headers: getAuthHeader(),
      body: JSON.stringify(body),
    });
    if (res.ok) {
      alert("公告儲存成功！");
      closeNewsModal();
      loadAdminNews();
    } else {
      const errData = await res.json();
      alert(`儲存失敗: ${errData.message || "未知錯誤"}`);
    }
  } catch (err) {
    alert("儲存失敗，請檢查網路連接");
  }
}

window.deleteNews = async (id) => {
  if (!confirm("確定要永久刪除此公告嗎？")) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/news/${id}`, {
      method: "DELETE",
      headers: getAuthHeader(),
    });
    if (res.ok) {
      alert("已刪除");
      loadAdminNews();
    }
  } catch (e) {
    alert("刪除失敗");
  }
};

// --- [ 2. 常見問題管理 (FAQ) ] ---

async function loadAdminFaq() {
  const container = document.getElementById("admin-faq-container");
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/faq`, {
      headers: getAuthHeader(),
    });
    const data = await res.json();

    // 安全檢查：確保 data.faqs 為陣列
    if (!data.success || !Array.isArray(data.faqs)) {
      container.innerHTML =
        '<tr><td colspan="5" class="text-center">暫無問答資料</td></tr>';
      return;
    }

    container.innerHTML = data.faqs
      .map(
        (f) => `
      <tr>
        <td>${f.order}</td>
        <td>${f.category}</td>
        <td>${f.question}</td>
        <td>
          <span class="badge ${
            f.isActive ? "badge-success" : "badge-secondary"
          }">
            ${f.isActive ? "顯示中" : "隱藏"}
          </span>
        </td>
        <td>${new Date(f.updatedAt).toLocaleDateString()}</td>
        <td>
          <div class="btn-action-group">
            <button class="btn btn-sm btn-outline-primary" onclick="editFaq('${
              f.id
            }')">編輯</button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteFaq('${
              f.id
            }')">刪除</button>
          </div>
        </td>
      </tr>
    `
      )
      .join("");
  } catch (e) {
    console.error("載入 FAQ 失敗", e);
  }
}

async function handleFaqSubmit(e) {
  e.preventDefault();
  const id = document.getElementById("faq-id").value;
  const body = {
    question: document.getElementById("faq-question-input").value,
    answer: document.getElementById("faq-answer-input").value,
    category: document.getElementById("faq-category").value,
    order: parseInt(document.getElementById("faq-order").value) || 0,
    isActive: document.getElementById("faq-active").checked,
  };

  const url =
    id && id !== "new"
      ? `${API_BASE_URL}/api/admin/faq/${id}`
      : `${API_BASE_URL}/api/admin/faq`;
  const method = id && id !== "new" ? "PUT" : "POST";

  try {
    const res = await fetch(url, {
      method,
      headers: getAuthHeader(),
      body: JSON.stringify(body),
    });
    if (res.ok) {
      alert("FAQ 已更新");
      closeFaqModal();
      loadAdminFaq();
    } else {
      const errData = await res.json();
      alert(`儲存失敗: ${errData.message || "未知錯誤"}`);
    }
  } catch (err) {
    alert("儲存失敗，請檢查網路");
  }
}

window.deleteFaq = async (id) => {
  if (!confirm("確定要刪除此問題嗎？")) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/faq/${id}`, {
      method: "DELETE",
      headers: getAuthHeader(),
    });
    if (res.ok) {
      alert("已刪除");
      loadAdminFaq();
    }
  } catch (e) {
    alert("刪除失敗");
  }
};

// --- [ 3. 關於我們管理 (About) ] ---

async function loadAdminAbout() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/static/about`, {
      headers: getAuthHeader(),
    });
    const data = await res.json();
    if (data.success && data.content) {
      const titleInput = document.getElementById("about-title");
      const contentInput = document.getElementById("about-content");
      if (titleInput) titleInput.value = data.content.title || "";
      if (contentInput) contentInput.value = data.content.content || "";
    }
  } catch (e) {
    console.error("載入關於我們失敗", e);
  }
}

async function handleAboutSubmit(e) {
  e.preventDefault();
  const body = {
    title: document.getElementById("about-title").value,
    content: document.getElementById("about-content").value,
  };

  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/static/about`, {
      method: "PUT",
      headers: getAuthHeader(),
      body: JSON.stringify(body),
    });

    if (res.ok) {
      alert("品牌介紹內容已同步更新至前台！");
    } else {
      alert("儲存失敗，請重試");
    }
  } catch (err) {
    alert("網路連接異常");
  }
}

// --- [ 相容性支援：原本的 switchCMSTab 函式 ] ---

window.switchCMSTab = function (tab) {
  // 移除所有按鈕與面板的 active 狀態
  document
    .querySelectorAll(".cms-tab-btn")
    .forEach((b) => b.classList.remove("active"));
  document
    .querySelectorAll(".cms-panel")
    .forEach((p) => p.classList.remove("active"));

  // 觸發按鈕 UI 更新
  const activeBtn = Array.from(document.querySelectorAll(".cms-tab-btn")).find(
    (b) => b.onclick?.toString().includes(tab)
  );
  if (activeBtn) activeBtn.classList.add("active");

  // 面板顯示切換 (相容 admin-settings.html 的 tab- 前綴)
  const panel =
    document.getElementById(`tab-${tab}`) ||
    document.getElementById(`cms-${tab}`);
  if (panel) {
    const siblings = panel.parentElement.querySelectorAll(
      ".tab-content, .cms-panel"
    );
    siblings.forEach((s) => s.classList.remove("active"));
    panel.classList.add("active");
  }

  // 自動執行載入
  if (tab === "news") loadAdminNews();
  if (tab === "faq") loadAdminFaq();
  if (tab === "about") loadAdminAbout();
};

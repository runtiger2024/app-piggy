/**
 * js/admin-content.js
 * V2026.01.Final.Fixed.Robust.UI - 旗艦內容管理系統 (CMS) 整合優化美編版
 * 解決問題：
 * 1. 修復新增按鈕無反應 (函式掛載順序優化)
 * 2. 徹底防止 Cannot read properties of null 錯誤 (DOM 安全檢查)
 * 3. 強化資料讀取安全性 (Array.isArray 檢查與 Response 狀態驗證)
 * 4. 【美編優化】優化表格排版整齊度、標籤配色辨識度
 */

// --- [ 核心修正：優先掛載全域函式，確保 HTML onclick 在腳本載入即生效 ] ---

/**
 * 開啟最新消息彈窗
 * @param {string} id - 公告 ID，若為空或 'new' 則視為新增
 */
window.openNewsModal = function (id = "") {
  const modal = document.getElementById("modal-news");
  const form = document.getElementById("form-news-item");
  if (!modal || !form) {
    console.error("找不到最新消息 Modal 或表單元件");
    return;
  }

  form.reset();

  // 安全設定 ID 欄位
  const idField = document.getElementById("news-id");
  if (idField) idField.value = id;

  const titleElem = document.getElementById("news-modal-title");
  if (titleElem)
    titleElem.innerHTML =
      id && id !== "new"
        ? '<i class="fas fa-edit mr-2"></i>編輯公告內容'
        : '<i class="fas fa-plus mr-2"></i>發布新公告';

  // 若為編輯模式，則從 API 獲取詳細資料
  if (id && id !== "new") {
    fetch(`${API_BASE_URL}/api/admin/news/${id}`, { headers: getAuthHeader() })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP 錯誤: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data.success) {
          const n = data.news || data.item || {};
          const fields = {
            "news-title-input": n.title || "",
            "news-category": n.category || "GENERAL",
            "news-content-input": n.content || "",
            "news-important": !!n.isImportant,
            "news-published": !!n.isPublished,
          };
          // 批次賦值並檢查元素是否存在
          Object.keys(fields).forEach((key) => {
            const el = document.getElementById(key);
            if (!el) return;
            if (el.type === "checkbox") el.checked = fields[key];
            else el.value = fields[key];
          });
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
  if (!modal || !form) {
    console.error("找不到常見問題 Modal 或表單元件");
    return;
  }

  form.reset();
  const idField = document.getElementById("faq-id");
  if (idField) idField.value = id;

  const titleElem = document.getElementById("faq-modal-title");
  if (titleElem)
    titleElem.innerHTML =
      id && id !== "new"
        ? '<i class="fas fa-question-circle mr-2"></i>編輯常見問題'
        : '<i class="fas fa-plus mr-2"></i>新增 Q&A 項目';

  if (id && id !== "new") {
    fetch(`${API_BASE_URL}/api/admin/faq/${id}`, { headers: getAuthHeader() })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP 錯誤: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data.success) {
          const f = data.faq || data.item || {};
          const fields = {
            "faq-question-input": f.question || "",
            "faq-answer-input": f.answer || "",
            "faq-category": f.category || "LOGISTICS",
            "faq-order": f.order || 0,
            "faq-active": !!f.isActive,
          };
          Object.keys(fields).forEach((key) => {
            const el = document.getElementById(key);
            if (!el) return;
            if (el.type === "checkbox") el.checked = fields[key];
            else el.value = fields[key];
          });
        }
      })
      .catch((err) => console.error("獲取 FAQ 詳情失敗", err));
  }
  modal.style.display = "flex";
};

// 設置別名以相容 HTML 原始 onclick 調用
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

// --- [ 1. 初始化與事件監聽 ] ---

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

  // 綁定表單提交事件 (使用 Optional Chaining 防止 null 報錯)
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

// --- [ 2. 全域變數與輔助工具 ] ---
const getAuthHeader = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("admin_token")}`,
});

// --- [ 3. 最新消息管理 (News) ] ---

async function loadAdminNews() {
  const container = document.getElementById("admin-news-container");
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/news`, {
      headers: getAuthHeader(),
    });
    const data = await res.json();

    // 安全檢查：確保 data.news 存在且為陣列
    if (!data.success || !Array.isArray(data.news)) {
      container.innerHTML =
        '<tr><td colspan="6" class="text-center text-muted">暫無公告資料</td></tr>';
      return;
    }

    // 分類顏色映射
    const categoryMap = {
      SYSTEM: "tag-system",
      PROMOTION: "tag-promotion",
      HOLIDAY: "tag-holiday",
      GENERAL: "tag-general",
    };

    container.innerHTML = data.news
      .map((n) => {
        const catClass = categoryMap[n.category] || "tag-general";
        return `
      <tr>
        <td>
          <span class="badge-status ${
            n.isPublished ? "badge-success" : "badge-secondary"
          }">
            ${n.isPublished ? "已發布" : "草稿"}
          </span>
        </td>
        <td><span class="badge-status ${catClass}">${n.category}</span></td>
        <td class="font-weight-bold" style="color: #2d3748;">${
          n.isImportant
            ? '<i class="fas fa-thumbtack text-danger mr-1"></i>'
            : ""
        }${n.title}</td>
        <td class="text-center">${
          n.isImportant
            ? '<span class="badge-status badge-important">重要</span>'
            : '<span class="text-muted" style="font-size:12px;">一般</span>'
        }</td>
        <td class="text-muted" style="font-size:13px;">${new Date(
          n.createdAt
        ).toLocaleDateString()}</td>
        <td>
          <div class="btn-action-group">
            <button class="btn btn-sm btn-outline-primary" title="編輯" onclick="editNews('${
              n.id
            }')">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" title="刪除" onclick="deleteNews('${
              n.id
            }')">
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        </td>
      </tr>`;
      })
      .join("");
  } catch (e) {
    console.error("載入消息失敗", e);
    container.innerHTML =
      '<tr><td colspan="6" class="text-center text-danger">連線錯誤，無法載入資料</td></tr>';
  }
}

async function handleNewsSubmit(e) {
  e.preventDefault();
  const id = document.getElementById("news-id")?.value;
  const body = {
    title: document.getElementById("news-title-input")?.value,
    category: document.getElementById("news-category")?.value,
    content: document.getElementById("news-content-input")?.value,
    isImportant: document.getElementById("news-important")?.checked || false,
    isPublished: document.getElementById("news-published")?.checked || false,
  };

  const isNew = !id || id === "new";
  const url = isNew
    ? `${API_BASE_URL}/api/admin/news`
    : `${API_BASE_URL}/api/admin/news/${id}`;
  const method = isNew ? "POST" : "PUT";

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

// --- [ 4. 常見問題管理 (FAQ) ] ---

async function loadAdminFaq() {
  const container = document.getElementById("admin-faq-container");
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/faq`, {
      headers: getAuthHeader(),
    });
    const data = await res.json();

    if (!data.success || !Array.isArray(data.faqs)) {
      container.innerHTML =
        '<tr><td colspan="6" class="text-center text-muted">暫無問答資料</td></tr>';
      return;
    }

    container.innerHTML = data.faqs
      .map(
        (f) => `
      <tr>
        <td class="text-center font-weight-bold" style="color: #4a5568;">#${
          f.order
        }</td>
        <td><span class="badge-status tag-general">${f.category}</span></td>
        <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #2d3748;">
            ${f.question}
        </td>
        <td class="text-center">
          <span class="badge-status ${
            f.isActive ? "badge-success" : "badge-secondary"
          }">
            ${f.isActive ? "顯示中" : "隱藏"}
          </span>
        </td>
        <td class="text-muted" style="font-size:13px;">${new Date(
          f.updatedAt
        ).toLocaleDateString()}</td>
        <td>
          <div class="btn-action-group">
            <button class="btn btn-sm btn-outline-primary" title="編輯" onclick="editFaq('${
              f.id
            }')">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" title="刪除" onclick="deleteFaq('${
              f.id
            }')">
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        </td>
      </tr>`
      )
      .join("");
  } catch (e) {
    console.error("載入 FAQ 失敗", e);
  }
}

async function handleFaqSubmit(e) {
  e.preventDefault();
  const id = document.getElementById("faq-id")?.value;
  const body = {
    question: document.getElementById("faq-question-input")?.value,
    answer: document.getElementById("faq-answer-input")?.value,
    category: document.getElementById("faq-category")?.value,
    order: parseInt(document.getElementById("faq-order")?.value) || 0,
    isActive: document.getElementById("faq-active")?.checked || false,
  };

  const isNew = !id || id === "new";
  const url = isNew
    ? `${API_BASE_URL}/api/admin/faq`
    : `${API_BASE_URL}/api/admin/faq/${id}`;
  const method = isNew ? "POST" : "PUT";

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

// --- [ 5. 關於我們管理 (About) ] ---

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
    title: document.getElementById("about-title")?.value || "",
    content: document.getElementById("about-content")?.value || "",
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

// --- [ 6. 相容性支援：原本的 switchCMSTab 函式 ] ---

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

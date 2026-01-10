/**
 * js/admin-content.js
 * 負責處理後台 公告、FAQ、關於我們 的編輯邏輯
 */

// 切換 CMS 分頁
window.switchCMSTab = function (tab) {
  document
    .querySelectorAll(".cms-tab-btn")
    .forEach((b) => b.classList.remove("active"));
  document
    .querySelectorAll(".cms-panel")
    .forEach((p) => p.classList.remove("active"));
  event.target.classList.add("active");
  document.getElementById(`cms-${tab}`).classList.add("active");

  if (tab === "news") loadAdminNews();
  if (tab === "faq") loadAdminFaq();
  if (tab === "about") loadAdminAbout();
};

// 載入公告列表
async function loadAdminNews() {
  const res = await fetch(`${API_BASE_URL}/api/admin/news`, {
    headers: { Authorization: `Bearer ${localStorage.getItem("admin_token")}` },
  });
  const data = await res.json();
  const tbody = document.getElementById("admin-news-list");
  tbody.innerHTML = data.news
    .map(
      (n) => `
        <tr>
            <td>${
              n.isPublished
                ? '<span class="badge badge-success">已發布</span>'
                : '<span class="badge badge-secondary">草稿</span>'
            }</td>
            <td>${n.category}</td>
            <td>${n.isImportant ? "🚩" : ""} ${n.title}</td>
            <td>${new Date(n.createdAt).toLocaleDateString()}</td>
            <td>
                <button class="btn btn-mini" onclick="editNews('${
                  n.id
                }')">編輯</button>
                <button class="btn btn-mini btn-danger" onclick="deleteNews('${
                  n.id
                }')">刪除</button>
            </td>
        </tr>
    `
    )
    .join("");
}

// 載入關於我們
async function loadAdminAbout() {
  const res = await fetch(`${API_BASE_URL}/api/admin/static/about`, {
    headers: { Authorization: `Bearer ${localStorage.getItem("admin_token")}` },
  });
  const data = await res.json();
  if (data.content) {
    document.getElementById("about-title").value = data.content.title;
    document.getElementById("about-content").value = data.content.content;
  }
}

// 綁定關於我們表單提交
document.getElementById("admin-about-form").onsubmit = async (e) => {
  e.preventDefault();
  const body = {
    title: document.getElementById("about-title").value,
    content: document.getElementById("about-content").value,
  };
  const res = await fetch(`${API_BASE_URL}/api/admin/static/about`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("admin_token")}`,
    },
    body: JSON.stringify(body),
  });
  if (res.ok) alert("關於我們內容已更新！");
};

// 初始載入
document.addEventListener("DOMContentLoaded", () => {
  if (window.location.pathname.includes("admin-settings")) {
    loadAdminNews();
  }
});

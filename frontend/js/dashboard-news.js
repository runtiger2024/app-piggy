/**
 * js/dashboard-news.js
 * V2026.01.Pro - 公告系統邏輯中心
 */

window.rawNewsData = []; // 快取原始公告數據
let currentNewsCategory = "ALL";

/**
 * 載入公告列表
 * @param {boolean} forceRefresh 是否強制重新抓取
 */
window.loadNewsList = async function (forceRefresh = false) {
  const container = document.getElementById("news-list-container");
  if (!container) return;

  // 如果已有數據且非強制重新整理，直接渲染
  if (!forceRefresh && window.rawNewsData.length > 0) {
    window.filterNews();
    return;
  }

  container.innerHTML =
    '<div class="text-center" style="padding:40px;"><div class="loading-spinner"></div><p>公告同步中...</p></div>';

  try {
    const res = await fetch(`${window.API_BASE_URL}/api/news`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();

    if (data.success) {
      window.rawNewsData = data.news || [];
      window.filterNews(); // 執行初始渲染
    } else {
      throw new Error(data.message);
    }
  } catch (e) {
    container.innerHTML = `<div class="text-center" style="padding:40px; color:red;"><i class="fas fa-exclamation-triangle"></i> 載入失敗: ${e.message}</div>`;
  }
};

/**
 * 切換公告分類
 */
window.switchNewsCategory = function (category, btn) {
  currentNewsCategory = category;

  // 更新 UI 按鈕狀態
  document
    .querySelectorAll(".news-filter-chip")
    .forEach((el) => el.classList.remove("active"));
  if (btn) btn.classList.add("active");

  window.filterNews();
};

/**
 * 執行搜尋與分類過濾
 */
window.filterNews = function () {
  const searchTerm =
    document.getElementById("news-search-input")?.value.toLowerCase().trim() ||
    "";
  const container = document.getElementById("news-list-container");
  if (!container) return;

  const filtered = window.rawNewsData.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchTerm) ||
      item.content.toLowerCase().includes(searchTerm);
    const matchesCategory =
      currentNewsCategory === "ALL" || item.category === currentNewsCategory;
    return matchesSearch && matchesCategory;
  });

  renderNewsCards(filtered);
};

/**
 * 渲染公告卡片
 */
function renderNewsCards(newsItems) {
  const container = document.getElementById("news-list-container");
  if (newsItems.length === 0) {
    container.innerHTML =
      '<div style="text-align:center; padding:40px; color:#94a3b8;"><p>查無相關公告內容</p></div>';
    return;
  }

  const categoryMap = {
    SYSTEM: { text: "系統通知", class: "tag-system" },
    PROMOTION: { text: "優惠活動", class: "tag-promotion" },
    HOLIDAY: { text: "節假日安排", class: "tag-holiday" },
  };

  container.innerHTML = newsItems
    .map((item) => {
      const cate = categoryMap[item.category] || {
        text: "一般公告",
        class: "tag-general",
      };
      const isImportant = item.isImportant ? "important" : "";

      return `
            <div class="news-card ${isImportant} animate-pop-in" onclick="window.openNewsDetail('${
        item.id
      }')">
                <div class="news-card-header">
                    <span class="news-tag ${cate.class}">${cate.text}</span>
                    <span class="news-date"><i class="far fa-calendar-alt"></i> ${new Date(
                      item.createdAt
                    ).toLocaleDateString()}</span>
                </div>
                <h4 class="news-title">${item.title}</h4>
                <div class="news-excerpt">${item.content}</div>
            </div>
        `;
    })
    .join("");
}

/**
 * 查看公告全文 (彈窗或跳轉)
 */
window.openNewsDetail = function (id) {
  const news = window.rawNewsData.find((n) => n.id === id);
  if (!news) return;

  // 這裡可以整合一個模態框顯示全文，或者簡單用 alert 示範
  // 實務上建議載入至一個新的 Modal 組件
  if (window.showMessage) {
    window.showMessage("正在載入全文，請稍候", "info");
  }
  console.log("查看公告詳情:", news);
};

// 監聽 Tab 切換事件 (由 dashboard-main.js 觸發)
document.addEventListener("tabChanged", (e) => {
  if (e.detail.tabId === "news") window.loadNewsList();
});

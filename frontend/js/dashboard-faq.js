/**
 * js/dashboard-faq.js
 * V2026.01.Pro - 常見問題互動邏輯
 */

window.rawFaqData = [];
let currentFaqCategory = "ALL";

/**
 * 載入 FAQ
 */
window.loadFaqList = async function () {
  const container = document.getElementById("faq-list-container");
  if (!container) return;

  try {
    const res = await fetch(`${window.API_BASE_URL}/api/faq`);
    const data = await res.json();

    if (data.success) {
      window.rawFaqData = data.faqs || [];
      window.filterFAQ();
    }
  } catch (e) {
    container.innerHTML =
      '<p class="text-center" style="color:red;">FAQ 資料獲取失敗</p>';
  }
};

/**
 * 切換 FAQ 分類
 */
window.switchFAQCategory = function (category, btn) {
  currentFaqCategory = category;
  document
    .querySelectorAll(".faq-tab")
    .forEach((el) => el.classList.remove("active"));
  if (btn) btn.classList.add("active");
  window.filterFAQ();
};

/**
 * 執行 FAQ 過濾
 */
window.filterFAQ = function () {
  const searchTerm =
    document.getElementById("faq-search-input")?.value.toLowerCase().trim() ||
    "";
  const container = document.getElementById("faq-list-container");
  if (!container) return;

  const filtered = window.rawFaqData.filter((item) => {
    const matchesSearch =
      item.question.toLowerCase().includes(searchTerm) ||
      item.answer.toLowerCase().includes(searchTerm);
    const matchesCategory =
      currentFaqCategory === "ALL" || item.category === currentFaqCategory;
    return matchesSearch && matchesCategory;
  });

  renderFaqAccordion(filtered);
};

/**
 * 渲染摺疊列表
 */
function renderFaqAccordion(items) {
  const container = document.getElementById("faq-list-container");
  if (items.length === 0) {
    container.innerHTML =
      '<p class="text-center" style="padding:20px; color:#94a3b8;">找不到相關問題</p>';
    return;
  }

  container.innerHTML = items
    .map(
      (item) => `
        <div class="faq-item">
            <div class="faq-question" onclick="this.parentElement.classList.toggle('active')">
                <span>${item.question}</span>
                <i class="fas fa-chevron-down toggle-icon"></i>
            </div>
            <div class="faq-answer">
                ${item.answer.replace(/\n/g, "<br>")}
            </div>
        </div>
    `
    )
    .join("");
}

// 監聽 Tab 切換
document.addEventListener("tabChanged", (e) => {
  if (e.detail.tabId === "faq") window.loadFaqList();
});

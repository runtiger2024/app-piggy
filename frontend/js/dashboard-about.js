/**
 * js/dashboard-about.js
 * V2026.01.Pro - 關於小跑豬與家具專線介紹
 */

window.loadAboutContent = async function () {
  const container = document.getElementById("section-container-about");
  if (!container) return;

  try {
    // 從 API 抓取可能的動態更新內容 (例如：服務變動說明)
    const res = await fetch(`${window.API_BASE_URL}/api/about`);
    const data = await res.json();

    if (data.success && data.content) {
      // 如果 API 有回傳動態內容，可以在這裡針對 HTML 組件中的特定區塊做覆蓋
      // 例如更新英雄區標題或一段特別公告
      const dynamicNote = document.getElementById("about-dynamic-note");
      if (dynamicNote) {
        dynamicNote.innerHTML = data.content;
        dynamicNote.style.display = "block";
      }
    }
  } catch (e) {
    console.warn("About 頁面動態內容加載略過，使用預設 HTML 内容");
  }
};

// 監聽 Tab 切換
document.addEventListener("tabChanged", (e) => {
  if (e.detail.tabId === "about") window.loadAboutContent();
});

/**
 * 額外輔助：點擊關於頁面中的常見流程按鈕跳轉
 */
window.navigateToForecastFromAbout = function () {
  const forecastTab = document.getElementById("tab-packages");
  if (forecastTab) {
    forecastTab.click();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
};

// frontend/js/admin-finance.js
// V1.4.Final.Robust - Robust ID Handling & Amego Invoice Integration & Cloudinary Path Fix
// [Fix] 徹底修復 "setting 'src' of null" 錯誤，確保動態版面下功能穩定運作

document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("admin_token");
  if (!token) {
    console.error("管理員未登入，請重新登入。");
    return;
  }

  let currentPage = 1;
  const limit = 20;
  let currentProofTxId = null; // 當前正在審核的交易 ID

  // --- 安全輔助函數：解決 Cannot set properties of null 的關鍵 ---

  const safeSetSrc = (id, src) => {
    const el = document.getElementById(id);
    if (el) {
      el.src = src || "";
      el.style.display = src ? "block" : "none";
    } else {
      console.warn(
        `[跑跑虎診斷] 找不到圖片元素 ID: "${id}"，請檢查 HTML 是否在容器內。`
      );
    }
  };

  const safeSetVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = val ?? "";
    } else {
      console.warn(`[跑跑虎診斷] 找不到 Input ID: "${id}"`);
    }
  };

  const safeSetDisplay = (id, displayStyle) => {
    const el = document.getElementById(id);
    if (el) el.style.display = displayStyle;
  };

  // 初始化程式
  init();

  function init() {
    // 載入初始列表
    loadTransactions();

    // 1. 搜尋篩選器
    const btnSearch = document.getElementById("btn-search");
    if (btnSearch) {
      btnSearch.addEventListener("click", () => {
        currentPage = 1;
        loadTransactions();
      });
    }

    // 2. Modal 關閉機制 (使用事件委託處理，確保動態載入後依然有效)
    document.addEventListener("click", (e) => {
      if (
        e.target.classList.contains("modal-close-btn") ||
        e.target.closest(".modal-close-btn")
      ) {
        const proofModal = document.getElementById("proof-modal");
        const adjustModal = document.getElementById("adjust-modal");
        if (proofModal) proofModal.style.display = "none";
        if (adjustModal) adjustModal.style.display = "none";
      }
    });

    // 3. 審核按鈕
    const btnApprove = document.getElementById("btn-approve");
    const btnReject = document.getElementById("btn-reject");
    if (btnApprove)
      btnApprove.addEventListener("click", () => submitReview("APPROVE"));
    if (btnReject)
      btnReject.addEventListener("click", () => submitReview("REJECT"));

    // 4. 手動調整餘額按鈕
    const btnManualAdjust = document.getElementById("btn-manual-adjust");
    if (btnManualAdjust) {
      btnManualAdjust.addEventListener("click", () => {
        const adjustForm = document.getElementById("adjust-form");
        if (adjustForm) adjustForm.reset();
        safeSetVal("adjust-user-id", "");
        const adjustModal = document.getElementById("adjust-modal");
        if (adjustModal) adjustModal.style.display = "flex";
      });
    }

    // 5. 會員搜尋功能 (手動調整彈窗內使用)
    const searchInput = document.getElementById("adjust-search-user");
    if (searchInput) {
      searchInput.addEventListener("input", async (e) => {
        const val = e.target.value.trim();
        const resultsDiv = document.getElementById("user-search-results");
        if (!resultsDiv) return;

        if (val.length < 2) {
          resultsDiv.style.display = "none";
          return;
        }

        try {
          const res = await fetch(
            `${API_BASE_URL}/api/admin/users/list?search=${val}`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
          const data = await res.json();
          if (data.users && data.users.length > 0) {
            resultsDiv.innerHTML = data.users
              .map(
                (u) => `
              <div class="p-2 border-bottom user-item" style="cursor:pointer;" onclick="window.selectUser('${u.id}', '${u.email}', '${u.name}')">
                ${u.name} (${u.email})
              </div>
            `
              )
              .join("");
            resultsDiv.style.display = "block";
          } else {
            resultsDiv.style.display = "none";
          }
        } catch (err) {
          console.error("搜尋會員失敗:", err);
        }
      });
    }

    // 6. 手動調整表單提交
    const adjustForm = document.getElementById("adjust-form");
    if (adjustForm) {
      adjustForm.addEventListener("submit", handleManualAdjust);
    }

    // 7. 點擊彈窗外部背景關閉
    window.onclick = function (event) {
      const pm = document.getElementById("proof-modal");
      const am = document.getElementById("adjust-modal");
      if (event.target === pm) pm.style.display = "none";
      if (event.target === am) am.style.display = "none";
    };
  }

  // --- 全域掛載函數：供 HTML 行內事件或動態產生的 HTML 呼叫 ---

  /**
   * 選擇會員 (手動調整餘額用)
   */
  window.selectUser = function (id, email, name) {
    safeSetVal("adjust-user-id", id);
    safeSetVal("adjust-search-user", `${name} (${email})`);
    safeSetDisplay("user-search-results", "none");
  };

  /**
   * 加載交易紀錄清單
   */
  async function loadTransactions() {
    const tbody = document.getElementById("transaction-list");
    if (!tbody) return;

    tbody.innerHTML =
      '<tr><td colspan="8" class="text-center p-4"><i class="fas fa-spinner fa-spin"></i> 正在獲取最新財務數據...</td></tr>';

    const statusEl = document.getElementById("status-filter");
    const typeEl = document.getElementById("type-filter");
    const searchEl = document.getElementById("search-input");

    const status = statusEl ? statusEl.value : "";
    const type = typeEl ? typeEl.value : "";
    const search = searchEl ? searchEl.value : "";

    try {
      let url = `${API_BASE_URL}/api/admin/finance/transactions?page=${currentPage}&limit=${limit}`;
      if (status) url += `&status=${status}`;
      if (type) url += `&type=${type}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (res.ok) {
        renderTable(data.transactions || []);
        renderPagination(data.pagination);
      } else {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger p-4">讀取失敗: ${data.message}</td></tr>`;
      }
    } catch (e) {
      tbody.innerHTML =
        '<tr><td colspan="8" class="text-center text-danger p-4">無法連線到伺服器</td></tr>';
    }
  }

  /**
   * 渲染交易表格
   */
  function renderTable(list) {
    const tbody = document.getElementById("transaction-list");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (list.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="8" class="text-center p-4 text-secondary">目前沒有符合條件的紀錄</td></tr>';
      return;
    }

    list.forEach((tx) => {
      const tr = document.createElement("tr");

      // 金額顯示邏輯
      const amtClass = tx.amount > 0 ? "text-success" : "text-danger";
      const amtSign = tx.amount > 0 ? "+" : "";

      // 狀態標籤渲染
      let statusBadge = `<span class="badge" style="background:#e0e0e0; color:#666;">${tx.status}</span>`;
      if (tx.status === "PENDING")
        statusBadge = `<span class="badge bg-warning text-dark">待審核</span>`;
      if (tx.status === "COMPLETED")
        statusBadge = `<span class="badge bg-success text-white">已完成</span>`;
      if (tx.status === "REJECTED")
        statusBadge = `<span class="badge bg-danger text-white">已駁回</span>`;

      // 發票狀態顯示 (Amego 整合)
      let invoiceHtml = '<span style="color:#ccc;">-</span>';
      if (tx.type === "DEPOSIT" && tx.status === "COMPLETED") {
        if (tx.invoiceStatus === "ISSUED" && tx.invoiceNumber) {
          invoiceHtml = `<span class="text-success small"><strong><i class="fas fa-check-circle"></i> ${tx.invoiceNumber}</strong></span>`;
        } else {
          invoiceHtml = `<button class="btn btn-sm btn-outline-primary" style="font-size:11px; padding:2px 6px;" onclick="window.issueInvoice('${tx.id}')">
                          <i class="fas fa-plus"></i> 補開發票
                         </button>`;
          if (tx.invoiceStatus === "FAILED") {
            invoiceHtml += `<br><span style="color:red; font-size:10px;">(上次失敗)</span>`;
          }
        }
      }

      // 憑證按鈕處理
      let proofHtml = tx.description || "-";
      const safeProofImg = tx.proofImage
        ? tx.proofImage.replace(/'/g, "\\'")
        : "";
      if (tx.proofImage) {
        proofHtml += `<br><button class="btn btn-sm btn-outline-info mt-1" onclick="window.viewProof('${tx.id}', '${safeProofImg}', '${tx.status}')"><i class="fas fa-image"></i> 查看憑證</button>`;
      }

      // 操作動作按鈕
      let actionHtml = "-";
      if (tx.status === "PENDING") {
        actionHtml = `<button class="btn btn-sm btn-primary" onclick="window.viewProof('${tx.id}', '${safeProofImg}', '${tx.status}')">審核</button>`;
      }

      tr.innerHTML = `
        <td>${new Date(
          tx.createdAt
        ).toLocaleDateString()}<br><small class="text-muted">${new Date(
        tx.createdAt
      ).toLocaleTimeString()}</small></td>
        <td>
          <div class="font-weight-bold">${tx.user.name || "-"}</div>
          <small class="text-muted">${tx.user.email}</small>
        </td>
        <td><span class="badge badge-light border">${tx.type}</span></td>
        <td class="${amtClass}" style="font-weight:bold; font-family:monospace; font-size:1.1em;">${amtSign}${tx.amount.toLocaleString()}</td>
        <td>${invoiceHtml}</td>
        <td>${proofHtml}</td>
        <td>${statusBadge}</td>
        <td class="text-right">${actionHtml}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  /**
   * 查看憑證功能 (解決報錯核心函數)
   */
  window.viewProof = function (id, imgUrl, status) {
    currentProofTxId = id;
    const modal = document.getElementById("proof-modal");
    if (!modal) return console.error("找不到 proof-modal 彈窗");

    if (imgUrl) {
      // 修復：支援 Cloudinary 完整網址與本地路徑
      let finalImg;
      if (imgUrl.startsWith("http://") || imgUrl.startsWith("https://")) {
        // 強制轉換為 HTTPS 防止瀏覽器阻擋
        finalImg = imgUrl.replace(/^http:\/\//i, "https://");
      } else {
        const cleanPath = imgUrl.startsWith("/") ? imgUrl : `/${imgUrl}`;
        finalImg = `${API_BASE_URL}${cleanPath}`;
      }

      // 使用安全函數設置圖片來源
      safeSetSrc("proof-img-display", finalImg);
    } else {
      safeSetSrc("proof-img-display", "");
    }

    // 只有 PENDING 狀態才顯示審核動作按鈕區
    safeSetDisplay("review-actions", status === "PENDING" ? "flex" : "none");

    modal.style.display = "flex";
  };

  /**
   * 提交審核結果
   */
  async function submitReview(action) {
    if (!currentProofTxId) return;

    let rejectReason = "";
    if (action === "REJECT") {
      rejectReason = prompt("請輸入駁回原因：");
      if (rejectReason === null) return;
    } else {
      if (!confirm("確定通過審核？這會自動增加會員帳戶餘額。")) return;
    }

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/finance/transactions/${currentProofTxId}/review`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action, rejectReason }),
        }
      );
      const data = await res.json();

      if (res.ok) {
        alert(data.message);
        const modal = document.getElementById("proof-modal");
        if (modal) modal.style.display = "none";
        loadTransactions();
      } else {
        alert("審核失敗: " + data.message);
      }
    } catch (e) {
      alert("網路通訊錯誤");
      console.error(e);
    }
  }

  /**
   * 手動補開 AMEGO 發票
   */
  window.issueInvoice = async function (id) {
    if (
      !confirm("確定手動補開這筆交易的電子發票嗎？\n(將即時傳送資料至 AMEGO)")
    )
      return;

    const btn = event.currentTarget;
    const originalContent = btn.innerHTML;

    try {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

      const res = await fetch(
        `${API_BASE_URL}/api/admin/finance/transactions/${id}/invoice`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();

      if (res.ok) {
        alert(`發票開立成功！號碼：${data.invoiceNumber}`);
        loadTransactions();
      } else {
        alert(`失敗：${data.message}`);
        btn.disabled = false;
        btn.innerHTML = originalContent;
      }
    } catch (e) {
      alert("發票連線失敗");
      btn.disabled = false;
      btn.innerHTML = originalContent;
    }
  };

  /**
   * 處理人工餘額調整
   */
  async function handleManualAdjust(e) {
    e.preventDefault();
    const userId = document.getElementById("adjust-user-id")?.value;
    const amount = document.getElementById("adjust-amount")?.value;
    const note = document.getElementById("adjust-note")?.value;

    if (!userId) return alert("請先搜尋並點選目標會員");
    if (!confirm(`確定手動調整餘額 NT$${amount} 嗎？\n(正數加錢，負數扣錢)`))
      return;

    const btn = e.target.querySelector("button[type='submit']");
    btn.disabled = true;

    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/finance/adjust`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId, amount, note }),
      });
      const data = await res.json();

      if (res.ok) {
        alert("餘額調整成功");
        const modal = document.getElementById("adjust-modal");
        if (modal) modal.style.display = "none";
        loadTransactions();
      } else {
        alert("調整失敗: " + data.message);
      }
    } catch (err) {
      alert("伺服器請求出錯");
    } finally {
      btn.disabled = false;
    }
  }

  /**
   * 渲染分頁 UI
   */
  function renderPagination(pg) {
    const div = document.getElementById("pagination");
    if (!div || !pg || pg.totalPages <= 1) return;

    div.innerHTML = "";

    const btn = (text, targetPage, isDisabled) => {
      const b = document.createElement("button");
      b.className = "btn btn-sm btn-light border mx-1";
      b.innerText = text;
      b.disabled = isDisabled;
      b.onclick = () => {
        if (!isDisabled) {
          currentPage = targetPage;
          loadTransactions();
        }
      };
      return b;
    };

    div.appendChild(btn("上一頁", currentPage - 1, currentPage <= 1));

    const info = document.createElement("span");
    info.className = "btn btn-sm disabled";
    info.style.border = "none";
    info.innerText = `${currentPage} / ${pg.totalPages}`;
    div.appendChild(info);

    div.appendChild(
      btn("下一頁", currentPage + 1, currentPage >= pg.totalPages)
    );
  }
});

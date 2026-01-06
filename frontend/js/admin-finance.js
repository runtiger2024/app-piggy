// frontend/js/admin-finance.js
// V1.5.Final - 整合錢包總覽、交易紀錄 CRUD、Amego 發票與 Cloudinary HTTPS 修正
// [優化] 支援管理員檢閱全體錢包、編輯/刪除交易紀錄，並強化 Piggy ID 辨識

document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("admin_token");
  if (!token) {
    console.error("管理員未登入，請重新登入。");
    return;
  }

  let currentPage = 1;
  const limit = 20;
  let currentProofTxId = null; // 當前正在審核的交易 ID
  let viewMode = "TRANSACTIONS"; // 當前視圖模式: TRANSACTIONS 或 WALLETS

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
        if (viewMode === "TRANSACTIONS") {
          loadTransactions();
        } else {
          loadWallets();
        }
      });
    }

    // [新增] 視圖切換邏輯 (交易紀錄 vs 錢包總覽)
    const btnViewTx = document.getElementById("btn-view-transactions");
    const btnViewWallets = document.getElementById("btn-view-wallets");
    if (btnViewTx && btnViewWallets) {
      btnViewTx.addEventListener("click", () => {
        viewMode = "TRANSACTIONS";
        btnViewTx.classList.add("active");
        btnViewWallets.classList.remove("active");
        loadTransactions();
      });
      btnViewWallets.addEventListener("click", () => {
        viewMode = "WALLETS";
        btnViewWallets.classList.add("active");
        btnViewTx.classList.remove("active");
        loadWallets();
      });
    }

    // 2. Modal 關閉機制 (使用事件委託處理)
    document.addEventListener("click", (e) => {
      if (
        e.target.classList.contains("modal-close-btn") ||
        e.target.closest(".modal-close-btn")
      ) {
        const modals = ["proof-modal", "adjust-modal", "edit-tx-modal"];
        modals.forEach((id) => {
          const m = document.getElementById(id);
          if (m) m.style.display = "none";
        });
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
              <div class="p-2 border-bottom user-item" style="cursor:pointer;" onclick="window.selectUser('${
                u.id
              }', '${u.email}', '${u.name}', '${u.piggyId}')">
                <span class="badge badge-info">${u.piggyId || "無ID"}</span> ${
                  u.name
                } (${u.email})
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

    // [新增] 交易編輯表單提交
    const editTxForm = document.getElementById("edit-tx-form");
    if (editTxForm) {
      editTxForm.addEventListener("submit", handleUpdateTransaction);
    }

    // 7. 點擊彈窗外部背景關閉
    window.onclick = function (event) {
      const pm = document.getElementById("proof-modal");
      const am = document.getElementById("adjust-modal");
      const em = document.getElementById("edit-tx-modal");
      if (event.target === pm) pm.style.display = "none";
      if (event.target === am) am.style.display = "none";
      if (event.target === em) em.style.display = "none";
    };
  }

  // --- 全域掛載函數 ---

  /**
   * 選擇會員 (手動調整餘額用)
   */
  window.selectUser = function (id, email, name, piggyId) {
    safeSetVal("adjust-user-id", id);
    safeSetVal(
      "adjust-search-user",
      `[${piggyId || "N/A"}] ${name} (${email})`
    );
    safeSetDisplay("user-search-results", "none");
  };

  /**
   * 加載交易紀錄清單
   */
  async function loadTransactions() {
    const tbody = document.getElementById("transaction-list");
    if (!tbody) return;

    tbody.innerHTML =
      '<tr><td colspan="9" class="text-center p-4"><i class="fas fa-spinner fa-spin"></i> 正在獲取最新財務數據...</td></tr>';

    const status = document.getElementById("status-filter")?.value || "";
    const type = document.getElementById("type-filter")?.value || "";
    const search = document.getElementById("search-input")?.value || "";

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
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger p-4">讀取失敗: ${data.message}</td></tr>`;
      }
    } catch (e) {
      tbody.innerHTML =
        '<tr><td colspan="9" class="text-center text-danger p-4">無法連線到伺服器</td></tr>';
    }
  }

  /**
   * [新增] 加載錢包總覽清單
   */
  async function loadWallets() {
    const tbody = document.getElementById("transaction-list");
    if (!tbody) return;

    tbody.innerHTML =
      '<tr><td colspan="6" class="text-center p-4"><i class="fas fa-spinner fa-spin"></i> 正在加載會員錢包概覽...</td></tr>';

    const search = document.getElementById("search-input")?.value || "";

    try {
      let url = `${API_BASE_URL}/api/admin/finance/wallets?search=${encodeURIComponent(
        search
      )}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (res.ok) {
        renderWalletTable(data.wallets || []);
        const paginationDiv = document.getElementById("pagination");
        if (paginationDiv) paginationDiv.innerHTML = ""; // 錢包總覽通常不分頁，由搜尋控制
      } else {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger p-4">讀取失敗: ${data.message}</td></tr>`;
      }
    } catch (e) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="text-center text-danger p-4">無法連線到伺服器</td></tr>';
    }
  }

  /**
   * 渲染交易表格
   */
  function renderTable(list) {
    const tbody = document.getElementById("transaction-list");
    if (!tbody) return;
    tbody.innerHTML = "";

    // 更新表頭 (針對交易紀錄模式)
    const thead = document.querySelector("thead tr");
    if (thead) {
      thead.innerHTML = `
        <th>時間</th>
        <th>會員資訊</th>
        <th>類型</th>
        <th>金額</th>
        <th>發票</th>
        <th>備註/憑證</th>
        <th>狀態</th>
        <th class="text-right">操作</th>
      `;
    }

    if (list.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="9" class="text-center p-4 text-secondary">目前沒有符合條件的紀錄</td></tr>';
      return;
    }

    list.forEach((tx) => {
      const tr = document.createElement("tr");
      const amtClass = tx.amount > 0 ? "text-success" : "text-danger";
      const amtSign = tx.amount > 0 ? "+" : "";

      let statusBadge = `<span class="badge" style="background:#e0e0e0; color:#666;">${tx.status}</span>`;
      if (tx.status === "PENDING")
        statusBadge = `<span class="badge bg-warning text-dark">待審核</span>`;
      if (tx.status === "COMPLETED")
        statusBadge = `<span class="badge bg-success text-white">已完成</span>`;
      if (tx.status === "REJECTED")
        statusBadge = `<span class="badge bg-danger text-white">已駁回</span>`;

      // 發票 HTML
      let invoiceHtml = '<span style="color:#ccc;">-</span>';
      if (tx.type === "DEPOSIT" && tx.status === "COMPLETED") {
        if (tx.invoiceStatus === "ISSUED" && tx.invoiceNumber) {
          invoiceHtml = `<span class="text-success small"><strong><i class="fas fa-check-circle"></i> ${tx.invoiceNumber}</strong></span>`;
        } else {
          invoiceHtml = `<button class="btn btn-sm btn-outline-primary" style="font-size:11px; padding:2px 6px;" onclick="window.issueInvoice('${tx.id}')">
                          <i class="fas fa-plus"></i> 補開發票
                         </button>`;
          if (tx.invoiceStatus === "FAILED")
            invoiceHtml += `<br><span style="color:red; font-size:10px;">(上次失敗)</span>`;
        }
      }

      // 憑證 HTML
      let proofHtml = `<div class="small text-truncate" style="max-width:150px;">${
        tx.description || "-"
      }</div>`;
      const safeProofImg = tx.proofImage
        ? tx.proofImage.replace(/'/g, "\\'")
        : "";
      if (tx.proofImage) {
        proofHtml += `<button class="btn btn-sm btn-outline-info mt-1" style="font-size:10px;" onclick="window.viewProof('${tx.id}', '${safeProofImg}', '${tx.status}')"><i class="fas fa-image"></i> 憑證</button>`;
      }

      // [優化] 操作動作 (新增編輯與刪除)
      let actionHtml = `
        <div class="dropdown">
          <button class="btn btn-sm btn-light border dropdown-toggle" type="button" data-toggle="dropdown">操作</button>
          <div class="dropdown-menu dropdown-menu-right">
            ${
              tx.status === "PENDING"
                ? `<a class="dropdown-item text-primary" href="javascript:;" onclick="window.viewProof('${tx.id}', '${safeProofImg}', '${tx.status}')"><i class="fas fa-check"></i> 審核</a>`
                : ""
            }
            <a class="dropdown-item" href="javascript:;" onclick="window.openEditModal('${
              tx.id
            }', ${tx.amount}, '${tx.description || ""}', '${
        tx.taxId || ""
      }', '${tx.invoiceTitle || ""}', '${
        tx.status
      }')"><i class="fas fa-edit"></i> 編輯</a>
            ${
              tx.status !== "COMPLETED"
                ? `<div class="dropdown-divider"></div><a class="dropdown-item text-danger" href="javascript:;" onclick="window.deleteTransaction('${tx.id}')"><i class="fas fa-trash"></i> 刪除</a>`
                : ""
            }
          </div>
        </div>
      `;

      tr.innerHTML = `
        <td>${new Date(
          tx.createdAt
        ).toLocaleDateString()}<br><small class="text-muted">${new Date(
        tx.createdAt
      ).toLocaleTimeString()}</small></td>
        <td>
          <div class="font-weight-bold"><span class="badge badge-info">${
            tx.user.piggyId || "N/A"
          }</span> ${tx.user.name || "-"}</div>
          <small class="text-muted">${tx.user.email}</small>
        </td>
        <td><span class="badge badge-light border">${tx.type}</span></td>
        <td class="${amtClass}" style="font-weight:bold;">${amtSign}${tx.amount.toLocaleString()}</td>
        <td>${invoiceHtml}</td>
        <td>${proofHtml}</td>
        <td>${statusBadge}</td>
        <td class="text-right">${actionHtml}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  /**
   * [新增] 渲染錢包總覽表格
   */
  function renderWalletTable(wallets) {
    const tbody = document.getElementById("transaction-list");
    if (!tbody) return;
    tbody.innerHTML = "";

    // 更新表頭
    const thead = document.querySelector("thead tr");
    if (thead) {
      thead.innerHTML = `
        <th>會員標識 (Piggy ID)</th>
        <th>姓名</th>
        <th>Email</th>
        <th>聯絡電話</th>
        <th>當前餘額 (TWD)</th>
        <th class="text-right">操作</th>
      `;
    }

    wallets.forEach((w) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><span class="badge badge-primary" style="font-size:1em;">${
          w.user.piggyId || "N/A"
        }</span></td>
        <td><strong>${w.user.name || "-"}</strong></td>
        <td>${w.user.email}</td>
        <td>${w.user.phone || "-"}</td>
        <td class="text-success" style="font-weight:bold; font-size:1.1em;">$${w.balance.toLocaleString()}</td>
        <td class="text-right">
          <button class="btn btn-sm btn-outline-primary" onclick="window.quickAdjust('${
            w.userId
          }', '${w.user.name}')">
            <i class="fas fa-coins"></i> 調帳
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  /**
   * 查看憑證功能
   */
  window.viewProof = function (id, imgUrl, status) {
    currentProofTxId = id;
    const modal = document.getElementById("proof-modal");
    if (!modal) return;

    if (imgUrl) {
      let finalImg = imgUrl.startsWith("http")
        ? imgUrl.replace(/^http:\/\//i, "https://")
        : `${API_BASE_URL}${imgUrl.startsWith("/") ? imgUrl : `/${imgUrl}`}`;
      safeSetSrc("proof-img-display", finalImg);
    } else {
      safeSetSrc("proof-img-display", "");
    }
    safeSetDisplay("review-actions", status === "PENDING" ? "flex" : "none");
    modal.style.display = "flex";
  };

  /**
   * [新增] 開啟編輯視窗
   */
  window.openEditModal = function (id, amount, desc, taxId, title, status) {
    currentProofTxId = id;
    safeSetVal("edit-tx-amount", amount);
    safeSetVal("edit-tx-desc", desc);
    safeSetVal("edit-tx-taxid", taxId);
    safeSetVal("edit-tx-title", title);

    // 若已完成，限制金額修改
    const amtInput = document.getElementById("edit-tx-amount");
    if (amtInput) amtInput.disabled = status === "COMPLETED";

    const modal = document.getElementById("edit-tx-modal");
    if (modal) modal.style.display = "flex";
  };

  /**
   * [新增] 執行交易紀錄更新
   */
  async function handleUpdateTransaction(e) {
    e.preventDefault();
    if (!currentProofTxId) return;

    const body = {
      amount: document.getElementById("edit-tx-amount")?.value,
      description: document.getElementById("edit-tx-desc")?.value,
      taxId: document.getElementById("edit-tx-taxid")?.value,
      invoiceTitle: document.getElementById("edit-tx-title")?.value,
    };

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/finance/transactions/${currentProofTxId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        }
      );
      const data = await res.json();
      if (res.ok) {
        alert("更新成功");
        document.getElementById("edit-tx-modal").style.display = "none";
        loadTransactions();
      } else {
        alert("失敗: " + data.message);
      }
    } catch (err) {
      alert("系統錯誤");
    }
  }

  /**
   * [新增] 刪除交易紀錄
   */
  window.deleteTransaction = async function (id) {
    if (!confirm("確定要刪除此筆交易紀錄嗎？此動作不可撤回。")) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/finance/transactions/${id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();
      if (res.ok) {
        alert("刪除完成");
        loadTransactions();
      } else {
        alert("刪除失敗: " + data.message);
      }
    } catch (err) {
      alert("連線錯誤");
    }
  };

  /**
   * [新增] 從錢包列表快速調帳
   */
  window.quickAdjust = function (userId, name) {
    const adjustModal = document.getElementById("adjust-modal");
    if (adjustModal) {
      document.getElementById("adjust-form").reset();
      safeSetVal("adjust-user-id", userId);
      safeSetVal("adjust-search-user", name);
      adjustModal.style.display = "flex";
    }
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
        document.getElementById("proof-modal").style.display = "none";
        loadTransactions();
      } else {
        alert("審核失敗: " + data.message);
      }
    } catch (e) {
      alert("通訊錯誤");
    }
  }

  /**
   * 手動補開 AMEGO 發票
   */
  window.issueInvoice = async function (id) {
    if (!confirm("確定手動補開這筆交易的電子發票嗎？")) return;
    const btn = event.currentTarget;
    try {
      btn.disabled = true;
      const res = await fetch(
        `${API_BASE_URL}/api/admin/finance/transactions/${id}/invoice`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();
      if (res.ok) {
        alert(`成功！號碼：${data.invoiceNumber}`);
        loadTransactions();
      } else {
        alert(`失敗：${data.message}`);
        btn.disabled = false;
      }
    } catch (e) {
      alert("連線失敗");
      btn.disabled = false;
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
    if (!confirm(`確定手動調整餘額 NT$${amount} 嗎？`)) return;

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
      if (res.ok) {
        alert("調整成功");
        document.getElementById("adjust-modal").style.display = "none";
        if (viewMode === "WALLETS") loadWallets();
        else loadTransactions();
      } else {
        const d = await res.json();
        alert("失敗: " + d.message);
      }
    } catch (err) {
      alert("伺服器出錯");
    } finally {
      btn.disabled = false;
    }
  }

  /**
   * 渲染分頁 UI
   */
  function renderPagination(pg) {
    const div = document.getElementById("pagination");
    if (!div || !pg || pg.totalPages <= 1) {
      if (div) div.innerHTML = "";
      return;
    }
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
    info.innerText = `${currentPage} / ${pg.totalPages}`;
    div.appendChild(info);
    div.appendChild(
      btn("下一頁", currentPage + 1, currentPage >= pg.totalPages)
    );
  }
});

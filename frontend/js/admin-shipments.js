// frontend/js/admin-shipments.js
// V2026.Final.Robust - Impersonate & Amego Invoice & Bulk Actions & Layout Sync
// [Fix] 徹底解決 "找不到 ID" 與 "點擊無反應" 問題，優化動態 DOM 抓取機制

document.addEventListener("DOMContentLoaded", () => {
  const adminToken = localStorage.getItem("admin_token");
  if (!adminToken) {
    console.error("管理員未登入，請重新登入。");
    return;
  }

  // --- 全域變數狀態 ---
  let currentPage = 1;
  const limit = 20;
  let currentStatus = "";
  let currentSearch = "";
  let selectedIds = new Set();

  /**
   * 內部輔助函數：防錯賦值系統
   * 解決 "Cannot set properties of null" 的核心工具
   */
  const safeSetVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = val !== undefined && val !== null ? val : "";
    } else {
      console.warn(
        `[跑跑虎診斷] 找不到 Input ID: "${id}"，請確認該 ID 位於 .container-fluid 內`
      );
    }
  };

  const safeSetText = (id, text) => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = text || "-";
    } else {
      console.warn(`[跑跑虎診斷] 找不到 Text ID: "${id}"`);
    }
  };

  // 初始化入口
  init();

  /**
   * 初始化事件監聽
   * 採用事件委託或動態抓取，避免 admin-layout 切換後失效
   */
  function init() {
    // 搜尋功能
    const btnSearch = document.getElementById("btn-search");
    if (btnSearch) {
      btnSearch.addEventListener("click", () => {
        const filterEl = document.getElementById("status-filter");
        const searchEl = document.getElementById("search-input");
        currentStatus = filterEl ? filterEl.value : "";
        currentSearch = searchEl ? searchEl.value : "";
        currentPage = 1;
        loadShipments();
      });
    }

    // Modal 關閉機制 (使用事件委託處理動態產生的關閉按鈕)
    document.addEventListener("click", (e) => {
      if (
        e.target.classList.contains("modal-close-btn") ||
        e.target.closest(".modal-close-btn")
      ) {
        const sm = document.getElementById("shipment-modal");
        const pm = document.getElementById("adjust-price-modal");
        if (sm) sm.style.display = "none";
        if (pm) pm.style.display = "none";
      }
    });

    // 編輯表單提交 (動態獲取 form 元素)
    document.addEventListener("submit", (e) => {
      if (e.target.id === "edit-shipment-form") {
        handleUpdate(e);
      }
    });

    // 全選功能
    const selectAll = document.getElementById("select-all");
    if (selectAll) {
      selectAll.addEventListener("change", (e) => {
        const isChecked = e.target.checked;
        document.querySelectorAll(".ship-checkbox").forEach((cb) => {
          cb.checked = isChecked;
          toggleSelection(cb.value, isChecked);
        });
      });
    }

    // 批量處理按鈕
    const btnBulkProcess = document.getElementById("btn-bulk-process");
    if (btnBulkProcess) {
      btnBulkProcess.addEventListener("click", () =>
        performBulkAction("PROCESSING")
      );
    }

    const btnBulkDelete = document.getElementById("btn-bulk-delete");
    if (btnBulkDelete) {
      btnBulkDelete.addEventListener("click", performBulkDelete);
    }

    // 點擊 Modal 外部遮罩關閉
    window.onclick = function (event) {
      const sm = document.getElementById("shipment-modal");
      const pm = document.getElementById("adjust-price-modal");
      if (event.target === sm) sm.style.display = "none";
      if (event.target === pm) pm.style.display = "none";
    };

    // 初次加載資料
    loadShipments();
  }

  /**
   * 更新下拉選單的數量統計
   */
  function updateStatusCounts(counts) {
    const filterSelect = document.getElementById("status-filter");
    if (!counts || !filterSelect) return;
    const options = filterSelect.options;
    const total = counts["ALL"] || 0;

    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const statusKey = opt.value;
      if (!opt.hasAttribute("data-original-text")) {
        opt.setAttribute("data-original-text", opt.innerText);
      }
      const originalText = opt.getAttribute("data-original-text");
      opt.innerText =
        statusKey === ""
          ? `${originalText} (${total})`
          : `${originalText} (${counts[statusKey] || 0})`;
    }
  }

  /**
   * 從後端獲取集運單資料
   */
  async function loadShipments() {
    const tbody = document.getElementById("shipment-list");
    if (!tbody) return;

    tbody.innerHTML =
      '<tr><td colspan="8" class="text-center p-4"><i class="fas fa-spinner fa-spin"></i> 正在加載清單...</td></tr>';
    selectedIds.clear();
    updateBulkUI();

    try {
      let url = `${API_BASE_URL}/api/admin/shipments/all?page=${currentPage}&limit=${limit}`;
      if (currentStatus) url += `&status=${currentStatus}`;
      if (currentSearch)
        url += `&search=${encodeURIComponent(currentSearch.trim())}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "讀取失敗");

      renderTable(data.shipments || []);
      renderPagination(data.pagination);
      if (data.statusCounts) updateStatusCounts(data.statusCounts);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger p-4"><i class="fas fa-exclamation-circle"></i> 錯誤: ${e.message}</td></tr>`;
    }
  }

  /**
   * 渲染表格 HTML 結構
   */
  function renderTable(shipments) {
    const tbody = document.getElementById("shipment-list");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (shipments.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="8" class="text-center p-4 text-muted">目前無任何集運單據</td></tr>';
      return;
    }

    const statusClasses = {
      PENDING_PAYMENT: "status-PENDING_PAYMENT",
      PENDING_REVIEW: "status-PENDING_REVIEW",
      PROCESSING: "status-PROCESSING",
      SHIPPED: "status-SHIPPED",
      CUSTOMS_CHECK: "status-CUSTOMS_CHECK",
      UNSTUFFING: "status-UNSTUFFING",
      COMPLETED: "status-COMPLETED",
      RETURNED: "status-RETURNED",
      CANCELLED: "status-CANCELLED",
    };

    const statusMap = {
      PENDING_PAYMENT: "待付款",
      PENDING_REVIEW: "已付款待審",
      PROCESSING: "已收款處理中",
      SHIPPED: "已裝櫃發貨",
      CUSTOMS_CHECK: "海關查驗中",
      UNSTUFFING: "拆櫃派送中",
      COMPLETED: "已完成",
      RETURNED: "訂單退回",
      CANCELLED: "已取消",
    };

    shipments.forEach((s) => {
      const tr = document.createElement("tr");
      let displayStatus = statusMap[s.status] || s.status;
      let statusClass = statusClasses[s.status] || "status-secondary";

      if (s.status === "PENDING_PAYMENT" && s.paymentProof) {
        displayStatus = "待審核";
        statusClass = "status-PENDING_REVIEW";
      }

      let invHtml = `<span class="badge badge-light text-muted" style="border:1px solid #ddd;">未開立</span>`;
      if (s.paymentProof === "WALLET_PAY") {
        invHtml = `<span class="badge" style="background:#cce5ff; color:#004085;"><i class="fas fa-wallet"></i> 儲值已開</span>`;
      } else if (s.invoiceStatus === "ISSUED" && s.invoiceNumber) {
        invHtml = `<span class="badge" style="background:#d4edda; color:#155724;"><i class="fas fa-check"></i> ${s.invoiceNumber}</span>`;
      } else if (s.invoiceStatus === "VOID") {
        invHtml = `<span class="badge" style="background:#f8d7da; color:#721c24;"><i class="fas fa-ban"></i> 已作廢</span>`;
      }

      const sStr = encodeURIComponent(JSON.stringify(s));
      const canAdjustPrice =
        s.status !== "COMPLETED" && s.status !== "CANCELLED";

      tr.innerHTML = `
        <td><input type="checkbox" class="ship-checkbox" value="${s.id}"></td>
        <td><strong>${s.id.slice(-8).toUpperCase()}</strong></td>
        <td>${new Date(s.createdAt).toLocaleDateString()}</td>
        <td>
          <div class="font-weight-bold">${s.recipientName}</div>
          <small class="text-primary" style="cursor:pointer;" onclick="window.impersonateUser('${
            s.userId
          }', '${s.user?.name || s.user?.email}')">
            <i class="fas fa-user-circle"></i> ${s.user?.email || "無 Email"}
          </small>
        </td>
        <td><span class="text-danger font-weight-bold">NT$ ${s.totalCost.toLocaleString()}</span></td>
        <td>${invHtml}</td>
        <td><span class="status-badge ${statusClass}">${displayStatus}</span></td>
        <td>
          <div style="display:flex; gap:5px; justify-content:flex-end;">
            ${
              canAdjustPrice
                ? `<button class="btn btn-warning btn-sm" onclick="window.openAdjustPriceModal('${s.id}', ${s.totalCost})" title="改價"><i class="fas fa-dollar-sign"></i></button>`
                : ""
            }
            <button class="btn btn-primary btn-sm" onclick="window.openModal('${sStr}')">管理</button>
            <button class="btn btn-outline-secondary btn-sm" onclick="window.impersonateUser('${
              s.userId
            }', '${
        s.user?.name || s.user?.email
      }')" title="模擬登入"><i class="fas fa-key"></i></button>
          </div>
        </td>
      `;

      const cb = tr.querySelector(".ship-checkbox");
      if (cb)
        cb.addEventListener("change", (e) =>
          toggleSelection(s.id, e.target.checked)
        );
      tbody.appendChild(tr);
    });
  }

  function renderPagination(pg) {
    const pDiv = document.getElementById("pagination");
    if (!pDiv || !pg) return;
    pDiv.innerHTML = "";
    if (pg.totalPages <= 1) return;

    const btn = (t, p, active = false) => {
      const b = document.createElement("button");
      b.className = active
        ? "btn btn-sm btn-primary mx-1"
        : "btn btn-sm btn-light border mx-1";
      b.textContent = t;
      b.onclick = () => {
        currentPage = p;
        loadShipments();
      };
      return b;
    };

    if (currentPage > 1) pDiv.appendChild(btn("< 上一頁", currentPage - 1));
    pDiv.appendChild(
      btn(`${currentPage} / ${pg.totalPages}`, currentPage, true)
    );
    if (currentPage < pg.totalPages)
      pDiv.appendChild(btn("下一頁 >", currentPage + 1));
  }

  // --- [掛載到 window 的核心全域函數] ---

  /**
   * 開啟訂單管理 Modal
   */
  window.openModal = function (str) {
    try {
      const s = JSON.parse(decodeURIComponent(str));
      const modal = document.getElementById("shipment-modal");
      if (!modal) return console.error("找不到 shipment-modal 元素");

      console.log("[跑跑虎] 正在讀取訂單詳細資訊:", s.id);

      // 1. 文字與基礎欄位賦值
      safeSetVal("edit-shipment-id", s.id);
      safeSetText("m-recipient", s.recipientName);
      safeSetText("m-phone", s.phone);
      safeSetText("m-address", s.shippingAddress);
      safeSetText("m-id", s.idNumber || "未填寫");
      safeSetText("m-user", s.user?.name || s.user?.email);

      // 2. 編輯輸入框賦值
      safeSetVal("m-tax-id", s.taxId);
      safeSetVal("m-invoice-title", s.invoiceTitle);
      safeSetVal("m-status", s.status);
      safeSetVal("m-cost", s.totalCost);
      safeSetVal("m-tracking-tw", s.trackingNumberTW);

      // 3. 裝櫃日期處理
      const dateInput = document.getElementById("m-loading-date");
      if (dateInput) {
        dateInput.value = s.loadingDate
          ? new Date(s.loadingDate).toISOString().split("T")[0]
          : "";
      }

      // 4. 包裹清單渲染
      const packageDiv = document.getElementById("m-packages");
      if (packageDiv) {
        packageDiv.innerHTML = (s.packages || [])
          .map(
            (p) => `
          <div class="package-item" style="border-bottom:1px solid #eee; padding:5px 0; font-size:13px;">
            <i class="fas fa-box"></i> <strong>${p.productName}</strong> 
            <small class="text-muted ml-1">(${p.trackingNumber})</small>
            <span class="badge badge-light float-right">${
              p.weight || "0"
            }kg</span>
          </div>
        `
          )
          .join("");
      }

      // 5. 改價鎖定邏輯：若已開立發票且非作廢，禁止手動修改金額
      const costInput = document.getElementById("m-cost");
      if (costInput) {
        const isIssued = s.invoiceStatus === "ISSUED" && s.invoiceNumber;
        costInput.disabled = isIssued;
        costInput.style.backgroundColor = isIssued ? "#f8f9fa" : "";
        costInput.title = isIssued ? "發票已開立，如需改價請先作廢發票" : "";
      }

      // 6. 付款憑證圖片修正 (支援 Cloudinary HTTPS)
      const proofDiv = document.getElementById("m-proof");
      if (proofDiv) {
        if (s.paymentProof === "WALLET_PAY") {
          proofDiv.innerHTML = `<div class="alert alert-info py-2 m-0 small"><i class="fas fa-wallet"></i> 錢包餘額扣款</div>`;
        } else if (s.paymentProof) {
          const imgUrl = s.paymentProof.startsWith("http")
            ? s.paymentProof
            : `${API_BASE_URL}${s.paymentProof}`;
          proofDiv.innerHTML = `<a href="${imgUrl}" target="_blank"><img src="${imgUrl}" style="max-height:150px; border-radius:4px; border:1px solid #ddd; cursor:zoom-in;"></a>`;
        } else {
          proofDiv.innerHTML = `<span class="text-muted small">尚未上傳憑證</span>`;
        }
      }

      // 7. 電子發票管理區塊 (Amego)
      renderInvoiceSection(s);

      // 8. 退回按鈕顯示邏輯
      const btnReturn = document.getElementById("btn-return-shipment");
      if (btnReturn) {
        btnReturn.style.display =
          s.status !== "CANCELLED" && s.status !== "RETURNED"
            ? "inline-block"
            : "none";
        btnReturn.onclick = () => window.handleReturnShipment(s.id);
      }

      modal.style.display = "flex";
    } catch (err) {
      console.error("解析 Modal 資料出錯:", err);
    }
  };

  /**
   * 渲染 Amego 發票管理按鈕
   */
  function renderInvoiceSection(s) {
    const section = document.getElementById("invoice-management-section");
    if (!section) return;

    let html = `<h5 class="mt-4 mb-2" style="font-size:14px; border-left:3px solid #007bff; padding-left:8px; color:#333;">發票管理 (Amego 系統)</h5>`;

    if (s.invoiceStatus === "ISSUED" && s.invoiceNumber) {
      html += `
        <div class="d-flex justify-content-between align-items-center p-2 bg-success text-white rounded">
          <div><i class="fas fa-check-circle"></i> 已開立: <strong>${s.invoiceNumber}</strong></div>
          <button type="button" class="btn btn-dark btn-sm" onclick="window.handleVoidInvoice('${s.id}', '${s.invoiceNumber}')">作廢發票</button>
        </div>`;
    } else if (s.invoiceStatus === "VOID") {
      html += `<div class="alert alert-danger py-2 m-0 small"><i class="fas fa-ban"></i> 此發票已作廢成功 (${s.invoiceNumber})</div>`;
    } else {
      if (s.paymentProof === "WALLET_PAY") {
        html += `<div class="alert alert-warning py-2 m-0 small"><i class="fas fa-info-circle"></i> 儲值扣款訂單：發票已於會員儲值時開立。</div>`;
      } else {
        html += `
          <div class="d-flex justify-content-between align-items-center p-2 border rounded bg-white">
            <span class="text-muted small">尚未開立電子發票</span>
            <button type="button" class="btn btn-success btn-sm" onclick="window.handleIssueInvoice('${s.id}')">立即開立</button>
          </div>`;
      }
    }
    section.innerHTML = html;
  }

  /**
   * 調用 Amego API 開立發票
   */
  window.handleIssueInvoice = async function (id) {
    if (!confirm("確定要向 Amego 系統申請開立發票嗎？")) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/shipments/${id}/invoice/issue`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
        }
      );
      const data = await res.json();
      if (res.ok) {
        alert("成功開立發票：" + data.invoiceNumber);
        loadShipments();
        document.getElementById("shipment-modal").style.display = "none";
      } else alert("開立失敗：" + data.message);
    } catch (e) {
      alert("發票連線出錯");
    }
  };

  /**
   * 作廢發票
   */
  window.handleVoidInvoice = async function (id, invNum) {
    const reason = prompt(
      `確定作廢發票 ${invNum}？請輸入原因：`,
      "訂單異動/取消"
    );
    if (!reason) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/shipments/${id}/invoice/void`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ reason }),
        }
      );
      if (res.ok) {
        alert("發票已成功作廢，金額鎖定已解除。");
        loadShipments();
        document.getElementById("shipment-modal").style.display = "none";
      } else {
        const d = await res.json();
        alert("作廢失敗：" + d.message);
      }
    } catch (e) {
      alert("API 通訊異常");
    }
  };

  /**
   * 提交訂單更新
   */
  async function handleUpdate(e) {
    e.preventDefault();
    const id = document.getElementById("edit-shipment-id").value;
    const btn = e.target.querySelector("button[type='submit']");
    if (!id) return;

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 儲存中...';

    const data = {
      status: document.getElementById("m-status").value,
      totalCost: parseFloat(document.getElementById("m-cost").value),
      trackingNumberTW: document.getElementById("m-tracking-tw").value,
      taxId: document.getElementById("m-tax-id").value.trim(),
      invoiceTitle: document.getElementById("m-invoice-title").value.trim(),
      loadingDate:
        document.getElementById("m-loading-date")?.value || undefined,
    };

    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/shipments/${id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        alert("資料更新成功");
        document.getElementById("shipment-modal").style.display = "none";
        loadShipments();
      } else {
        const d = await res.json();
        alert("更新失敗：" + d.message);
      }
    } catch (e) {
      alert("伺服器連線中斷");
    } finally {
      btn.disabled = false;
      btn.textContent = "儲存更新";
    }
  }

  /**
   * 退回訂單至入庫狀態
   */
  window.handleReturnShipment = async function (id) {
    const reason = prompt(
      "請輸入退回原因（客戶在前台可見）：",
      "資料不齊全，請修正後重新提交"
    );
    if (reason === null) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/shipments/${id}/reject`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ returnReason: reason }),
        }
      );
      if (res.ok) {
        alert("訂單已退回給客戶");
        document.getElementById("shipment-modal").style.display = "none";
        loadShipments();
      }
    } catch (e) {
      alert("操作失敗");
    }
  };

  /**
   * 模擬登入：以管理員身分切換至會員前台介面
   */
  window.impersonateUser = async function (userId, name) {
    if (!confirm(`安全警告：即將以「${name}」身份模擬登入前台，確定？`)) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/users/${userId}/impersonate`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      const data = await res.json();
      if (res.ok) {
        const win = window.open("index.html", "_blank");
        // 跨頁面注入 Token 並重定向至 Dashboard
        setTimeout(() => {
          if (win) {
            win.localStorage.setItem("token", data.token);
            win.localStorage.setItem("userName", name);
            win.location.href = "dashboard.html";
          }
        }, 600);
      } else alert("模擬失敗：" + data.message);
    } catch (e) {
      alert("請求處理錯誤");
    }
  };

  /**
   * 人工改價 Modal 控制
   */
  window.openAdjustPriceModal = function (id, price) {
    safeSetVal("adjust-shipment-id", id);
    safeSetVal("adjust-original-price", price);
    safeSetVal("adjust-new-price", price);
    safeSetVal("adjust-reason", "");
    const pm = document.getElementById("adjust-price-modal");
    if (pm) pm.style.display = "flex";
  };

  /**
   * 確認執行人工改價
   */
  window.confirmAdjustPrice = async function () {
    const id = document.getElementById("adjust-shipment-id").value;
    const newPrice = parseFloat(
      document.getElementById("adjust-new-price").value
    );
    const reason = document.getElementById("adjust-reason").value;

    if (isNaN(newPrice) || newPrice < 0) return alert("請輸入有效的金額數值");
    if (!reason) return alert("請填寫改價原因以便稽核");

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/shipments/${id}/price`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ newPrice, reason }),
        }
      );
      if (res.ok) {
        alert("訂單金額調整成功，已自動完成多退少補邏輯。");
        document.getElementById("adjust-price-modal").style.display = "none";
        loadShipments();
      } else {
        const d = await res.json();
        alert("改價失敗：" + d.message);
      }
    } catch (e) {
      alert("網路連線逾時");
    }
  };

  /**
   * 批量操作與全選 UI 更新
   */
  function toggleSelection(id, checked) {
    if (checked) selectedIds.add(id);
    else selectedIds.delete(id);
    updateBulkUI();
  }

  function updateBulkUI() {
    const count = selectedIds.size;
    const span = document.getElementById("selected-count");
    if (span) {
      span.textContent = `已選 ${count} 筆`;
      span.style.display = count > 0 ? "inline" : "none";
    }
    const b1 = document.getElementById("btn-bulk-process");
    const b2 = document.getElementById("btn-bulk-delete");
    if (b1) b1.style.display = count > 0 ? "inline-block" : "none";
    if (b2) b2.style.display = count > 0 ? "inline-block" : "none";
  }

  /**
   * 批量執行操作 (如批量確認收款)
   */
  async function performBulkAction(status) {
    if (
      !confirm(
        `確定將選中的 ${selectedIds.size} 筆訂單改為「已收款」？\n系統將自動嘗試開立發票。`
      )
    )
      return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/shipments/bulk-status`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ids: Array.from(selectedIds), status }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        alert(data.message || "批量更新成功");
        loadShipments();
      } else alert("更新異常：" + data.message);
    } catch (e) {
      alert("請求發送錯誤");
    }
  }

  /**
   * 批量刪除訂單 (需輸入 DELETE 確認)
   */
  async function performBulkDelete() {
    if (
      prompt("【警告】這將永久刪除單據並釋放包裹，請輸入 DELETE 確認：") !==
      "DELETE"
    )
      return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/shipments/bulk-delete`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ids: Array.from(selectedIds) }),
        }
      );
      if (res.ok) {
        alert("選定單據已成功刪除");
        loadShipments();
      } else alert("刪除失敗");
    } catch (e) {
      alert("網路通訊錯誤");
    }
  }

  /**
   * 列印出貨單明細
   */
  window.printShipment = function () {
    const id = document.getElementById("edit-shipment-id").value;
    if (id) window.open(`shipment-print.html?id=${id}`, "_blank");
  };
});

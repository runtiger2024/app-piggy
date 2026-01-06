// frontend/js/admin-shipments.js
// V2026.Final.Robust.DetailPlus - 強化深度檢閱與透明化報告版
// [Fix] 解決深度檢閱包裹明細空白問題，新增 API 聯動渲染機制

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
   */
  const safeSetVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = val !== undefined && val !== null ? val : "";
    }
  };

  const safeSetText = (id, text) => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = text || "-";
    }
  };

  // 初始化入口
  init();

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

    // Modal 關閉機制 (支援多個 Modal)
    document.addEventListener("click", (e) => {
      if (
        e.target.classList.contains("modal-close-btn") ||
        e.target.closest(".modal-close-btn") ||
        e.target.classList.contains("modal-close") ||
        e.target.closest(".modal-close")
      ) {
        const sm = document.getElementById("shipment-modal");
        const pm = document.getElementById("adjust-price-modal");
        const dm = document.getElementById("shipment-details-modal");
        if (sm) sm.style.display = "none";
        if (pm) pm.style.display = "none";
        if (dm) dm.style.display = "none";
      }
    });

    // 編輯表單提交
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
      const dm = document.getElementById("shipment-details-modal");
      if (event.target === sm) sm.style.display = "none";
      if (event.target === pm) pm.style.display = "none";
      if (event.target === dm) dm.style.display = "none";
    };

    loadShipments();
  }

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
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger p-4">錯誤: ${e.message}</td></tr>`;
    }
  }

  function renderTable(shipments) {
    const tbody = document.getElementById("shipment-list");
    if (!tbody) return;
    tbody.innerHTML = "";

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

    shipments.forEach((s) => {
      const tr = document.createElement("tr");
      let displayStatus = statusMap[s.status] || s.status;
      let statusClass = statusClasses[s.status] || "status-secondary";
      if (s.status === "PENDING_PAYMENT" && s.paymentProof) {
        displayStatus = "待審核";
        statusClass = "status-PENDING_REVIEW";
      }

      let invHtml = `<span class="badge badge-light text-muted" style="border:1px solid #ddd;">未開立</span>`;
      if (s.paymentProof === "WALLET_PAY")
        invHtml = `<span class="badge" style="background:#cce5ff; color:#004085;"><i class="fas fa-wallet"></i> 儲值已開</span>`;
      else if (s.invoiceStatus === "ISSUED")
        invHtml = `<span class="badge" style="background:#d4edda; color:#155724;"><i class="fas fa-check"></i> ${s.invoiceNumber}</span>`;

      const sStr = encodeURIComponent(JSON.stringify(s));

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
            <button class="btn btn-outline-info btn-sm" onclick="window.openDetailModal('${
              s.id
            }')" title="深度檢閱"><i class="fas fa-search-plus"></i></button>
            <button class="btn btn-primary btn-sm" onclick="window.openModal('${sStr}')">管理</button>
            <button class="btn btn-outline-secondary btn-sm" onclick="window.impersonateUser('${
              s.userId
            }', '${
        s.user?.name || s.user?.email
      }')"><i class="fas fa-key"></i></button>
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
    if (!pDiv || !pg || pg.totalPages <= 1) return;
    pDiv.innerHTML = "";
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

  // --- [深度檢閱 Modal 核心邏輯] ---
  window.openDetailModal = async function (id) {
    const modal = document.getElementById("shipment-details-modal");
    if (!modal) return alert("找不到詳情 Modal 組件");

    // 先顯示載入狀態
    modal.style.display = "flex";
    const feeContainer = document.getElementById("sd-fee-breakdown");
    if (feeContainer)
      feeContainer.innerHTML =
        '<div class="text-center p-4"><i class="fas fa-spinner fa-spin"></i> 正在抓取打包前深度數據...</div>';

    try {
      // 調用詳細 API 以獲取完整的 costBreakdown
      const res = await fetch(`${API_BASE_URL}/api/shipments/${id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      const s = data.shipment;
      const report = s.costBreakdown;

      // 1. 基礎資訊填充
      safeSetText("sd-id", s.id.toUpperCase());
      safeSetText("sd-status", s.status);
      safeSetText("sd-date", new Date(s.createdAt).toLocaleString());
      safeSetText("sd-name", s.recipientName);
      safeSetText("sd-phone", s.phone);
      safeSetText("sd-address", s.shippingAddress);
      safeSetText("sd-trackingTW", s.trackingNumberTW || "尚未產生");

      // 2. 渲染打包前包裹物理明細 (透明化費率報告)
      if (feeContainer && report) {
        let html = `
          <table class="table table-sm" style="font-size: 12px; margin-bottom: 0;">
            <thead class="bg-light">
              <tr>
                <th>包裹/箱號</th>
                <th>尺寸 (CM)</th>
                <th>實重</th>
                <th>計費方式</th>
                <th>費率</th>
                <th class="text-right">金額</th>
              </tr>
            </thead>
            <tbody>
        `;

        (report.packages || []).forEach((p) => {
          html += `
            <tr>
              <td>
                <div class="fw-800">${p.productName || "未命名商品"}</div>
                <small class="text-muted">${p.trackingNumber} ${
            p.boxIndex ? `(箱 ${p.boxIndex})` : ""
          }</small>
              </td>
              <td>${p.dims || "-"}</td>
              <td>${p.weight || "-"}</td>
              <td><span class="badge badge-info">${
                p.calcMethod || "重量"
              }</span></td>
              <td>$${p.appliedRate}${p.rateUnit}</td>
              <td class="text-right fw-800">$${Math.round(p.rawFee)}</td>
            </tr>
          `;
        });

        // 3. 渲染附加費 (超長、超重、低消、派送費)
        if (report.surcharges && report.surcharges.length > 0) {
          html += `<tr class="table-warning"><td colspan="6" class="fw-800">附加費用項目</td></tr>`;
          report.surcharges.forEach((sur) => {
            html += `
              <tr>
                <td colspan="5">
                  <div class="fw-800">${sur.name}</div>
                  <small class="text-muted">${sur.reason}</small>
                </td>
                <td class="text-right text-danger fw-800">+$${Math.round(
                  sur.amount
                )}</td>
              </tr>
            `;
          });
        }

        html += `
            </tbody>
            <tfoot>
              <tr style="font-size: 1.1rem; background: #fff8e1;">
                <td colspan="5" class="text-right fw-800">應收總計 (TWD)</td>
                <td class="text-right text-danger fw-800" style="font-size: 1.4rem;">$${s.totalCost.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        `;
        feeContainer.innerHTML = html;
      }

      // 4. 渲染支付憑證
      const proofImgArea = document.getElementById("sd-proof-images");
      if (proofImgArea) {
        if (s.paymentProof === "WALLET_PAY") {
          proofImgArea.innerHTML =
            '<div class="alert alert-info w-100 mb-0"><i class="fas fa-wallet"></i> 會員餘額扣款，免憑證。</div>';
        } else if (s.paymentProof) {
          const url = s.paymentProof.startsWith("http")
            ? s.paymentProof
            : `${API_BASE_URL}${s.paymentProof}`;
          proofImgArea.innerHTML = `<a href="${url}" target="_blank"><img src="${url}" style="max-width: 100%; border-radius: 8px; border: 1px solid #ddd;"></a>`;
        } else {
          proofImgArea.innerHTML =
            '<span class="text-muted">尚無支付憑證</span>';
        }
      }
    } catch (err) {
      console.error("抓取深度數據失敗:", err);
      if (feeContainer)
        feeContainer.innerHTML = `<div class="alert alert-danger">資料載入失敗: ${err.message}</div>`;
    }
  };

  // --- [管理 Modal 原始功能保持] ---
  window.openModal = function (str) {
    try {
      const s = JSON.parse(decodeURIComponent(str));
      const modal = document.getElementById("shipment-modal");
      if (!modal) return;

      safeSetVal("edit-shipment-id", s.id);
      safeSetText("m-recipient", s.recipientName);
      safeSetText("m-phone", s.phone);
      safeSetText("m-address", s.shippingAddress);
      safeSetText("m-id", s.idNumber || "未填寫");
      safeSetText("m-user", s.user?.name || s.user?.email);

      safeSetVal("m-tax-id", s.taxId);
      safeSetVal("m-invoice-title", s.invoiceTitle);
      safeSetVal("m-status", s.status);
      safeSetVal("m-cost", s.totalCost);
      safeSetVal("m-tracking-tw", s.trackingNumberTW);

      const dateInput = document.getElementById("m-loading-date");
      if (dateInput)
        dateInput.value = s.loadingDate
          ? new Date(s.loadingDate).toISOString().split("T")[0]
          : "";

      const packageDiv = document.getElementById("m-packages");
      if (packageDiv) {
        packageDiv.innerHTML = (s.packages || [])
          .map(
            (p) => `
          <div class="package-item" style="border-bottom:1px solid #eee; padding:5px 0; font-size:13px;">
            <i class="fas fa-box"></i> <strong>${p.productName}</strong> 
            <small class="text-muted">(${p.trackingNumber})</small>
            <span class="badge badge-light float-right">${
              p.weight || "0"
            }kg</span>
          </div>
        `
          )
          .join("");
      }

      const costInput = document.getElementById("m-cost");
      if (costInput) {
        const isIssued = s.invoiceStatus === "ISSUED" && s.invoiceNumber;
        costInput.disabled = isIssued;
        costInput.style.backgroundColor = isIssued ? "#f8f9fa" : "";
      }

      const proofDiv = document.getElementById("m-proof");
      if (proofDiv) {
        if (s.paymentProof === "WALLET_PAY")
          proofDiv.innerHTML =
            '<div class="alert alert-info py-2 small">錢包餘額扣款</div>';
        else if (s.paymentProof) {
          const imgUrl = s.paymentProof.startsWith("http")
            ? s.paymentProof
            : `${API_BASE_URL}${s.paymentProof}`;
          proofDiv.innerHTML = `<a href="${imgUrl}" target="_blank"><img src="${imgUrl}" style="max-height:120px; border-radius:4px;"></a>`;
        }
      }

      renderInvoiceSection(s);
      modal.style.display = "flex";
    } catch (err) {
      console.error("Modal Error:", err);
    }
  };

  function renderInvoiceSection(s) {
    const section = document.getElementById("invoice-management-section");
    if (!section) return;
    let html = `<h5 class="mt-4 mb-2" style="font-size:14px; border-left:3px solid #007bff; padding-left:8px;">發票管理 (Amego)</h5>`;
    if (s.invoiceStatus === "ISSUED" && s.invoiceNumber) {
      html += `<div class="bg-success text-white p-2 rounded d-flex justify-content-between"><span>已開立: ${s.invoiceNumber}</span><button class="btn btn-dark btn-sm" onclick="window.handleVoidInvoice('${s.id}', '${s.invoiceNumber}')">作廢</button></div>`;
    } else if (s.invoiceStatus === "VOID") {
      html += `<div class="alert alert-danger py-2 small">發票已作廢 (${s.invoiceNumber})</div>`;
    } else {
      html +=
        s.paymentProof === "WALLET_PAY"
          ? `<div class="alert alert-warning py-2 small">錢包訂單：已於儲值時開立。</div>`
          : `<div class="border p-2 rounded d-flex justify-content-between"><span>尚未開立</span><button class="btn btn-success btn-sm" onclick="window.handleIssueInvoice('${s.id}')">立即開立</button></div>`;
    }
    section.innerHTML = html;
  }

  window.handleIssueInvoice = async function (id) {
    if (!confirm("確定要向 Amego 申請開立發票嗎？")) return;
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
        alert("開立成功: " + data.invoiceNumber);
        loadShipments();
        document.getElementById("shipment-modal").style.display = "none";
      } else alert("開立失敗: " + data.message);
    } catch (e) {
      alert("通訊錯誤");
    }
  };

  window.handleVoidInvoice = async function (id, invNum) {
    const reason = prompt(`確定作廢發票 ${invNum}？`, "訂單異動");
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
        alert("已作廢");
        loadShipments();
        document.getElementById("shipment-modal").style.display = "none";
      } else alert("作廢失敗");
    } catch (e) {
      alert("API 異常");
    }
  };

  async function handleUpdate(e) {
    e.preventDefault();
    const id = document.getElementById("edit-shipment-id").value;
    const btn = e.target.querySelector("button[type='submit']");
    const data = {
      status: document.getElementById("m-status").value,
      totalCost: parseFloat(document.getElementById("m-cost").value),
      trackingNumberTW: document.getElementById("m-tracking-tw").value,
      taxId: document.getElementById("m-tax-id").value.trim(),
      invoiceTitle: document.getElementById("m-invoice-title").value.trim(),
      loadingDate:
        document.getElementById("m-loading-date")?.value || undefined,
    };
    btn.disabled = true;
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
        alert("更新成功");
        document.getElementById("shipment-modal").style.display = "none";
        loadShipments();
      } else {
        const d = await res.json();
        alert(d.message);
      }
    } catch (e) {
      alert("連線錯誤");
    } finally {
      btn.disabled = false;
    }
  }

  window.impersonateUser = async function (userId, name) {
    if (!confirm(`確定模擬登入「${name}」？`)) return;
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
        setTimeout(() => {
          if (win) {
            win.localStorage.setItem("token", data.token);
            win.localStorage.setItem("userName", name);
            win.location.href = "dashboard.html";
          }
        }, 600);
      } else alert(data.message);
    } catch (e) {
      alert("請求出錯");
    }
  };

  window.openAdjustPriceModal = function (id, price) {
    safeSetVal("adjust-shipment-id", id);
    safeSetVal("adjust-original-price", price);
    safeSetVal("adjust-new-price", price);
    safeSetVal("adjust-reason", "");
    const pm = document.getElementById("adjust-price-modal");
    if (pm) pm.style.display = "flex";
  };

  window.confirmAdjustPrice = async function () {
    const id = document.getElementById("adjust-shipment-id").value;
    const newPrice = parseFloat(
      document.getElementById("adjust-new-price").value
    );
    const reason = document.getElementById("adjust-reason").value;
    if (isNaN(newPrice) || !reason) return alert("請填寫金額與原因");
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
        alert("調整成功");
        document.getElementById("adjust-price-modal").style.display = "none";
        loadShipments();
      } else {
        const d = await res.json();
        alert(d.message);
      }
    } catch (e) {
      alert("失敗");
    }
  };

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

  async function performBulkAction(status) {
    if (!confirm(`確定將選中的筆數改為已收款？`)) return;
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
      if (res.ok) {
        alert("批量更新成功");
        loadShipments();
      } else {
        const d = await res.json();
        alert(d.message);
      }
    } catch (e) {
      alert("請求錯誤");
    }
  }

  async function performBulkDelete() {
    if (prompt("輸入 DELETE 確認永久刪除：") !== "DELETE") return;
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
        alert("已刪除");
        loadShipments();
      }
    } catch (e) {
      alert("連線錯誤");
    }
  }

  window.printShipment = function () {
    const id = document.getElementById("edit-shipment-id").value;
    if (id) window.open(`shipment-print.html?id=${id}`, "_blank");
  };
});

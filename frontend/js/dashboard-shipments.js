// frontend/js/dashboard-shipments.js
// V2026.01.Stable - 旗艦版整合邏輯 (含收件人選擇器聯動、費用透明化、銀行轉帳憑證修復)
// [New] 修復「常用地址」按鈕聯動邏輯，確保正確開啟收件人選擇器
// [Optimization] 整合費用明細、傢俱類型顯示、超重警告與一鍵複製
// [Fixed] 解決銀行轉帳憑證上傳 404 錯誤 (修正 API 路徑與 PUT 方法)
// [Stability] 增加訂單詳情載入安全檢查與錯誤追蹤日誌

// --- 1. 更新底部結帳條 ---
window.updateCheckoutBar = function () {
  const bar = document.getElementById("checkout-bar");
  const countEl = document.getElementById("selected-pkg-count");
  const btn = document.getElementById("btn-create-shipment");

  const checkboxes = document.querySelectorAll(".package-checkbox:checked");
  const count = checkboxes.length;

  // 1.1 更新件數文字
  if (countEl) countEl.textContent = count;

  // 1.2 控制結算條容器的顯示與隱藏
  if (bar) {
    if (count > 0) {
      bar.style.display = "flex"; // 有選中包裹時顯示
      if (btn) {
        btn.disabled = false;
        btn.classList.remove("btn-secondary");
        btn.classList.add("btn-primary");
      }
    } else {
      bar.style.display = "none"; // 沒選中時隱藏
      if (btn) {
        btn.disabled = true;
        btn.classList.add("btn-secondary");
        btn.classList.remove("btn-primary");
      }
    }
  }
};

// --- 2. 點擊「合併打包」按鈕 ---
window.handleCreateShipmentClick = async function () {
  const selectedCheckboxes = document.querySelectorAll(
    ".package-checkbox:checked"
  );
  if (selectedCheckboxes.length === 0) return;

  const selectedIds = Array.from(selectedCheckboxes).map((cb) => cb.dataset.id);
  const selectedPackages = window.allPackagesData.filter((pkg) =>
    selectedIds.includes(pkg.id)
  );

  // 更新件數
  const countEl = document.getElementById("checkout-total-count");
  if (countEl) countEl.textContent = selectedPackages.length;

  // 檢查超重 (前端初步篩選顯示警告)
  const hasHeavyItem = selectedPackages.some((pkg) => pkg.isOverweight);
  const warningBox = document.getElementById("forklift-warning");
  if (warningBox) warningBox.style.display = hasHeavyItem ? "block" : "none";

  // 渲染包裹清單 (左側清單)
  const listContainer = document.getElementById("shipment-package-list");
  if (listContainer) {
    listContainer.innerHTML = "";
    selectedPackages.forEach((pkg, idx) => {
      let alerts = "";
      if (pkg.isOverweight)
        alerts += `<span class="badge badge-danger" style="margin-left:5px;">超重</span>`;
      if (pkg.isOversized)
        alerts += `<span class="badge badge-warning" style="margin-left:5px;">超長</span>`;

      listContainer.innerHTML += `
        <div class="shipment-package-item" style="padding: 10px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
          <div class="info">
            <div style="font-weight:bold; font-size: 14px;">${idx + 1}. ${
        pkg.productName
      } ${alerts}</div>
            <div style="font-size:12px; color:#888;">單號: ${
              pkg.trackingNumber
            }</div>
          </div>
          <div class="cost" style="text-align: right; font-size: 13px; color: #555;">
              <i class="fas fa-box"></i>
          </div>
        </div>
      `;
    });
  }

  // 自動填入收件人
  if (window.currentUser) {
    if (!document.getElementById("ship-name").value)
      document.getElementById("ship-name").value =
        window.currentUser.name || "";
    if (!document.getElementById("ship-phone").value)
      document.getElementById("ship-phone").value =
        window.currentUser.phone || "";
    if (!document.getElementById("ship-street-address").value)
      document.getElementById("ship-street-address").value =
        window.currentUser.defaultAddress || "";
  }

  // [重要修復]：重新綁定「常用地址」按鈕，解決點擊無反應問題
  const btnSelectRecipient = document.getElementById("btn-select-recipient");
  if (btnSelectRecipient) {
    btnSelectRecipient.onclick = (e) => {
      e.preventDefault();
      if (typeof window.openRecipientSelector === "function") {
        window.openRecipientSelector();
      } else {
        console.error("找不到 window.openRecipientSelector 函式");
      }
    };
  }

  // 重置付款方式
  const radioTransfer = document.getElementById("pay-transfer");
  if (radioTransfer) radioTransfer.checked = true;
  togglePaymentMethod("TRANSFER");

  renderDeliveryLocations();

  const modal = document.getElementById("create-shipment-modal");
  if (modal) modal.style.display = "flex";

  // 立即觸發後端精確試算
  window.recalculateShipmentTotal();
};

// --- 3. 觸發後端運費預算並渲染透明化報表 ---
window.recalculateShipmentTotal = async function () {
  const breakdownDiv = document.getElementById("api-fee-breakdown");
  const actualWeightEl = document.getElementById("calc-actual-weight");
  const volumetricEl = document.getElementById("calc-volumetric");

  const selectedCheckboxes = document.querySelectorAll(
    ".package-checkbox:checked"
  );
  const locationSelect = document.getElementById("ship-delivery-location");

  if (selectedCheckboxes.length === 0 || !breakdownDiv) return;

  const packageIds = Array.from(selectedCheckboxes).map((cb) => cb.dataset.id);
  const rate = locationSelect.value || 0;

  // 更新偏遠地區提示
  const remoteInfo = document.getElementById("ship-remote-area-info");
  const selectedOption = locationSelect.options[locationSelect.selectedIndex];
  if (rate > 0 && selectedOption) {
    const nameDisplay = document.getElementById("ship-selected-area-name");
    const feeDisplay = document.getElementById("ship-selected-area-fee");
    if (nameDisplay) nameDisplay.textContent = selectedOption.text;
    if (feeDisplay) feeDisplay.textContent = `$${rate}`;
    if (remoteInfo) remoteInfo.style.display = "block";
  } else {
    if (remoteInfo) remoteInfo.style.display = "none";
  }

  // 顯示 Loading
  breakdownDiv.innerHTML =
    '<div class="text-center" style="padding:15px;"><i class="fas fa-circle-notch fa-spin"></i> 正在產生詳細費用報告...</div>';
  if (actualWeightEl) actualWeightEl.textContent = "...";
  if (volumetricEl) volumetricEl.textContent = "...";

  try {
    const res = await fetch(`${API_BASE_URL}/api/shipments/preview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${window.dashboardToken}`,
      },
      body: JSON.stringify({
        packageIds: packageIds,
        deliveryLocationRate: parseFloat(rate),
      }),
    });

    const data = await res.json();
    if (data.success && data.preview) {
      const p = data.preview;
      window.currentShipmentTotal = p.totalCost;

      // 更新總量面板
      if (actualWeightEl)
        actualWeightEl.textContent = `${p.totalActualWeight} kg`;
      if (volumetricEl) volumetricEl.textContent = `${p.totalVolumetricCai} 材`;

      // 渲染透明化報表
      if (p.breakdown) {
        renderBreakdownTable(p.breakdown, breakdownDiv, rate);
      } else {
        renderSimpleTable(p, breakdownDiv, rate);
      }

      // 重新檢查錢包餘額
      const walletRadio = document.getElementById("pay-wallet");
      if (walletRadio && walletRadio.checked) togglePaymentMethod("WALLET");
    } else {
      breakdownDiv.innerHTML = `<div class="alert alert-danger">試算失敗: ${data.message}</div>`;
    }
  } catch (e) {
    console.error(e);
    breakdownDiv.innerHTML = `<div class="alert alert-danger">連線錯誤，無法取得報價</div>`;
  }
};

// 渲染詳細透明化報表
function renderBreakdownTable(breakdown, container, rate) {
  let html = `
    <div style="font-size: 13px; border: 1px solid #eee; border-radius: 4px; overflow: hidden; background: #fff;">
      <table style="width: 100%; border-collapse: collapse;">
        <thead style="background: #f1f3f5; color: #495057;">
          <tr>
            <th style="padding: 8px; text-align: left; font-weight: 600;">包裹 / 規格</th>
            <th style="padding: 8px; text-align: center; font-weight: 600;">計費模式</th>
            <th style="padding: 8px; text-align: right; font-weight: 600;">金額</th>
          </tr>
        </thead>
        <tbody>
  `;

  breakdown.packages.forEach((pkg) => {
    const isVol = pkg.calcMethod === "材積計費";
    const productTypeBadge = pkg.type
      ? `<span style="background:#e3f2fd; color:#0d47a1; padding:2px 6px; border-radius:4px; font-size:11px; margin-right:5px; border:1px solid #bbdefb;">${pkg.type}</span>`
      : "";

    html += `
      <tr style="border-bottom: 1px solid #f8f9fa;">
        <td style="padding: 8px;">
          <div style="display:flex; align-items:center; margin-bottom:2px;">
             ${productTypeBadge}
             <div style="font-weight: bold; color: #333;">${
               pkg.trackingNumber
             }</div>
          </div>
          <div style="color: #888; font-size: 12px;">
            ${pkg.dims} | 
            <span style="${!isVol ? "color:#ccc;" : ""}">${pkg.cai} 材</span> | 
            <span style="${isVol ? "color:#ccc;" : ""}">${pkg.weight}</span>
          </div>
          ${
            pkg.notes
              ? `<div style="color: #d32f2f; font-size: 11px;">⚠️ ${pkg.notes}</div>`
              : ""
          }
        </td>
        <td style="padding: 8px; text-align: center;">
          <span class="badge ${isVol ? "badge-info" : "badge-secondary"}">${
      pkg.calcMethod
    }</span>
        </td>
        <td style="padding: 8px; text-align: right; font-family: monospace;">
          $${pkg.rawFee.toLocaleString()}
        </td>
      </tr>
    `;
  });

  html += `
      <tr style="background-color: #fcfcfc;">
        <td colspan="2" style="padding: 8px; text-align: right; color: #555;">原始運費小計</td>
        <td style="padding: 8px; text-align: right; font-weight: bold;">$${breakdown.subtotal.toLocaleString()}</td>
      </tr>
  `;

  if (breakdown.minChargeDiff > 0) {
    html += `
      <tr>
        <td colspan="2" style="padding: 8px; text-align: right; color: #e67e22;">
          <i class="fas fa-arrow-up"></i> 低消補足 (${
            breakdown.surcharges.find((s) => s.name === "低消補足")?.reason ||
            "未達低消"
          })
        </td>
        <td style="padding: 8px; text-align: right; color: #e67e22;">+$${breakdown.minChargeDiff.toLocaleString()}</td>
      </tr>
    `;
  }

  breakdown.surcharges.forEach((s) => {
    if (s.name === "低消補足") return;
    html += `
      <tr>
        <td colspan="2" style="padding: 8px; text-align: right; color: #d32f2f;">
          ${s.name} <span style="color:#999; font-size:11px;">(${
      s.reason
    })</span>
        </td>
        <td style="padding: 8px; text-align: right; color: #d32f2f;">+$${s.amount.toLocaleString()}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
    <div style="margin-top: 15px; text-align: right;">
        <div style="font-size: 14px; color: #555;">總金額 (TWD)</div>
        <div style="font-size: 24px; font-weight: bold; color: #2e7d32;">$${breakdown.finalTotal.toLocaleString()}</div>
    </div>
  `;
  container.innerHTML = html;
}

// 舊版渲染函式 (Fallback)
function renderSimpleTable(p, container, rate) {
  let html = `<table style="width: 100%; font-size: 14px; margin-top: 5px;">`;
  html += `
    <tr>
        <td style="padding: 4px 0; color: #555;">基本海運費</td>
        <td style="padding: 4px 0; text-align: right; font-weight: bold;">$${p.baseCost.toLocaleString()}</td>
    </tr>
  `;
  if (p.isMinimumChargeApplied) {
    html += `<tr><td colspan="2" style="text-align: right; font-size: 11px; color: #e67e22;">未達最低消費，以低消計算</td></tr>`;
  }
  if (p.remoteFee > 0) {
    html += `<tr><td style="padding: 4px 0;">偏遠地區費</td><td style="text-align: right; color: #d35400;">+$${p.remoteFee.toLocaleString()}</td></tr>`;
  }
  if (p.oversizedFee > 0) {
    html += `<tr><td style="padding: 4px 0; color: #d35400;">超長附加費</td><td style="text-align: right; color: #d35400;">+$${p.oversizedFee.toLocaleString()}</td></tr>`;
  }
  if (p.overweightFee > 0) {
    html += `<tr><td style="padding: 4px 0; color: #d35400;">超重附加費</td><td style="text-align: right; color: #d35400;">+$${p.overweightFee.toLocaleString()}</td></tr>`;
  }
  html += `
    <tr style="border-top: 2px solid #eee;">
        <td style="padding: 10px 0; font-weight: bold;">總金額 (TWD)</td>
        <td style="padding: 10px 0; text-align: right; font-weight: bold; font-size: 20px; color: #2e7d32;">$${p.totalCost.toLocaleString()}</td>
    </tr></table>`;
  container.innerHTML = html;
}

// --- 4. 提交建立訂單 ---
window.handleCreateShipmentSubmit = async function (e) {
  e.preventDefault();
  const btn = e.target.querySelector(".btn-place-order");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "提交中...";
  }

  const selectedCheckboxes = document.querySelectorAll(
    ".package-checkbox:checked"
  );
  const packageIds = Array.from(selectedCheckboxes).map((cb) => cb.dataset.id);

  let paymentMethod = "TRANSFER";
  const payWallet = document.getElementById("pay-wallet");
  if (payWallet && payWallet.checked) paymentMethod = "WALLET";

  const fd = new FormData();
  fd.append("packageIds", JSON.stringify(packageIds));
  fd.append("recipientName", document.getElementById("ship-name").value);
  fd.append("phone", document.getElementById("ship-phone").value);
  fd.append(
    "shippingAddress",
    (document.getElementById("ship-area-search")?.value || "") +
      " " +
      document.getElementById("ship-street-address").value
  );
  fd.append(
    "deliveryLocationRate",
    document.getElementById("ship-delivery-location").value || 0
  );

  fd.append("idNumber", document.getElementById("ship-idNumber").value);
  fd.append("note", document.getElementById("ship-note").value);
  fd.append("paymentMethod", paymentMethod);

  // 附加服務
  const services = {
    floor: {
      selected: document.getElementById("srv-floor").checked,
      hasElevator:
        document.querySelector('input[name="srv-elevator"]:checked')?.value ===
        "yes",
      note: document.getElementById("srv-floor-note").value,
    },
    wood: {
      selected: document.getElementById("srv-wood").checked,
      note: document.getElementById("srv-wood-note").value,
    },
    assembly: {
      selected: document.getElementById("srv-assembly").checked,
      note: document.getElementById("srv-assembly-note").value,
    },
    old: {
      selected: document.getElementById("srv-old").checked,
      note: document.getElementById("srv-old-note").value,
    },
  };
  fd.append("additionalServices", JSON.stringify(services));

  try {
    const res = await fetch(`${API_BASE_URL}/api/shipments/create`, {
      method: "POST",
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
      body: fd,
    });

    const data = await res.json();
    if (res.ok) {
      const modal = document.getElementById("create-shipment-modal");
      if (modal) modal.style.display = "none";

      window.lastCreatedShipmentId = data.shipment.id;

      if (paymentMethod === "WALLET") {
        alert("訂單建立成功！費用已從錢包扣除。");
      } else {
        setTimeout(() => {
          const bankModal = document.getElementById("bank-info-modal");
          if (!bankModal) {
            alert("訂單已建立，請前往列表查看匯款帳號。");
            return;
          }

          if (window.BANK_INFO_CACHE) {
            const bName =
              document.getElementById("bank-name-display") ||
              document.getElementById("bank-name");
            const bAcc =
              document.getElementById("bank-account-display") ||
              document.getElementById("bank-account");
            const bHolder =
              document.getElementById("bank-holder-display") ||
              document.getElementById("bank-holder");

            if (bName)
              bName.textContent = window.BANK_INFO_CACHE.bankName || "--";
            if (bAcc) bAcc.textContent = window.BANK_INFO_CACHE.account || "--";
            if (bHolder)
              bHolder.textContent = window.BANK_INFO_CACHE.holder || "--";
          }

          bankModal.style.display = "flex";
          if (typeof window.resetBankProofUpload === "function")
            window.resetBankProofUpload();
        }, 100);
      }

      window.loadMyShipments();
      window.loadMyPackages();
      if (typeof window.loadWalletData === "function") window.loadWalletData();
      e.target.reset();
      window.updateCheckoutBar();
    } else {
      alert(data.message || "建立失敗");
    }
  } catch (err) {
    alert("網路錯誤，提交失敗");
    console.error("Submit Order Error:", err);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "提交訂單";
    }
  }
};

// --- 付款方式切換 ---
window.togglePaymentMethod = function (method) {
  const walletBalanceInfo = document.getElementById("wallet-pay-info");
  const btnSubmit = document.querySelector(".btn-place-order");

  if (method === "WALLET") {
    if (walletBalanceInfo) {
      walletBalanceInfo.style.display = "block";
      const currentTotal = window.currentShipmentTotal || 0;

      fetch(`${API_BASE_URL}/api/wallet/my`, {
        headers: { Authorization: `Bearer ${window.dashboardToken}` },
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.success) {
            const bal = d.wallet.balance;
            if (bal < currentTotal) {
              walletBalanceInfo.innerHTML = `餘額: $${bal.toLocaleString()} <span style="color:red; font-weight:bold;">(不足，請先儲值)</span>`;
              if (btnSubmit) btnSubmit.disabled = true;
            } else {
              walletBalanceInfo.innerHTML = `餘額: $${bal.toLocaleString()} <span style="color:green; font-weight:bold;">(足夠支付)</span>`;
              if (btnSubmit) btnSubmit.disabled = false;
            }
          }
        })
        .catch(() => {
          walletBalanceInfo.innerHTML = `<span style="color:red;">無法取得餘額</span>`;
        });
    }
  } else {
    if (walletBalanceInfo) walletBalanceInfo.style.display = "none";
    if (btnSubmit) btnSubmit.disabled = false;
  }
};

// --- 5. 載入我的集運單列表 ---
window.loadMyShipments = async function () {
  const tbody = document.getElementById("shipments-table-body");
  if (!tbody) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/shipments/my`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();

    if (data.shipments && data.shipments.length > 0) {
      tbody.innerHTML = "";
      const statusMap = window.SHIPMENT_STATUS_MAP || {};
      const statusClasses = window.STATUS_CLASSES || {};

      data.shipments.forEach((s) => {
        const statusText = statusMap[s.status] || s.status;
        const statusClass = statusClasses[s.status] || "";

        let actionsHtml = `<button class="btn btn-sm btn-primary" onclick="window.openShipmentDetails('${s.id}')">詳情</button>`;

        if (s.status === "PENDING_PAYMENT") {
          if (s.paymentProof) {
            actionsHtml += `<span style="font-size:12px; color:#e67e22; display:block; margin-top:5px;">已傳憑證<br>審核中</span>`;
          } else {
            actionsHtml += `<button class="btn btn-sm btn-secondary" style="margin-top:5px;" onclick="window.openUploadProof('${s.id}')">上傳憑證</button>`;
            actionsHtml += `<button class="btn btn-sm btn-danger" style="margin-top:5px;" onclick="window.cancelShipment('${s.id}')">取消訂單</button>`;
          }
        }

        tbody.innerHTML += `
            <tr>
                <td>
                    <span style="font-weight:bold; color:#1a73e8;">${s.id
                      .slice(-8)
                      .toUpperCase()}</span><br>
                    <small>${new Date(s.createdAt).toLocaleDateString()}</small>
                </td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>
                    <div>${s.recipientName}</div>
                    <small style="color:#666;">${
                      s.packages.length
                    } 件包裹</small>
                </td>
                <td style="color:#d32f2f; font-weight:bold;">$${(
                  s.totalCost || 0
                ).toLocaleString()}</td>
                <td><div style="display:flex; flex-direction:column; gap:5px;">${actionsHtml}</div></td>
            </tr>
        `;
      });
    } else {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:#999;">尚無集運單</td></tr>`;
    }
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red;">載入失敗</td></tr>`;
  }
};

// --- 7. 查看訂單詳情 ---
window.openShipmentDetails = async function (id) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/shipments/${id}`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    const s = data.shipment;
    const idEl = document.getElementById("sd-id");
    if (idEl) idEl.textContent = s.id.slice(-8).toUpperCase();

    const timelineContainer = document.getElementById("sd-timeline");
    if (timelineContainer) renderTimeline(timelineContainer, s.status);

    const statusBox = document.getElementById("sd-status");
    if (statusBox) {
      if (s.status === "RETURNED") {
        statusBox.innerHTML = `<span class="status-badge status-CANCELLED">訂單已退回</span>
          <div style="background:#fff1f0; border:1px solid #ffa39e; padding:8px; border-radius:4px; margin-top:5px; font-size:13px; color:#c0392b;">
              <strong>退回原因：</strong> ${s.returnReason || "未說明"}
          </div>`;
      } else {
        const statusMap = window.SHIPMENT_STATUS_MAP || {};
        statusBox.textContent = statusMap[s.status] || s.status;
      }
    }

    const nameEl = document.getElementById("sd-name");
    if (nameEl) nameEl.textContent = s.recipientName || "--";
    const phoneEl = document.getElementById("sd-phone");
    if (phoneEl) phoneEl.textContent = s.phone || "--";
    const addrEl = document.getElementById("sd-address");
    if (addrEl) addrEl.textContent = s.shippingAddress || "--";

    const detailModal = document.getElementById("shipment-details-modal");
    if (detailModal) detailModal.style.display = "flex";
  } catch (e) {
    console.error("載入集運詳情發生異常:", e);
    alert("無法載入詳情。");
  }
};

window.cancelShipment = async function (id) {
  if (!confirm("確定要取消此訂單嗎？")) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/shipments/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();
    if (res.ok) {
      alert(data.message);
      window.loadMyShipments();
      window.loadMyPackages();
    } else {
      alert(data.message || "取消失敗");
    }
  } catch (e) {
    alert("網路錯誤");
  }
};

function renderTimeline(container, currentStatus) {
  const steps = [
    { code: "PENDING_PAYMENT", label: "待付款" },
    { code: "PROCESSING", label: "處理中" },
    { code: "SHIPPED", label: "已裝櫃" },
    { code: "CUSTOMS_CHECK", label: "海關查驗" },
    { code: "UNSTUFFING", label: "拆櫃派送" },
    { code: "COMPLETED", label: "已完成" },
  ];

  if (currentStatus === "CANCELLED" || currentStatus === "RETURNED") {
    container.innerHTML = `<div class="alert alert-error text-center" style="margin:10px 0;">訂單已取消或退回</div>`;
    return;
  }

  let currentIndex = steps.findIndex((s) => s.code === currentStatus);
  if (currentIndex === -1) currentIndex = 0;

  let html = `<div class="timeline-container" style="display:flex; justify-content:space-between; margin:20px 0; position:relative; padding:0 10px; overflow-x:auto;">`;
  html += `<div style="position:absolute; top:15px; left:20px; right:20px; height:4px; background:#eee; z-index:0; min-width:400px;"></div>`;
  const progressPercent = (currentIndex / (steps.length - 1)) * 100;
  html += `<div style="position:absolute; top:15px; left:20px; width:calc(${progressPercent}% - 40px); max-width:calc(100% - 40px); height:4px; background:#28a745; z-index:0; transition:width 0.3s;"></div>`;

  steps.forEach((step, idx) => {
    const isCompleted = idx <= currentIndex;
    html += `
        <div style="position:relative; z-index:1; text-align:center; flex:1; min-width:60px;">
            <i class="fas ${
              isCompleted ? "fa-check-circle" : "fa-circle"
            }" style="color:${
      isCompleted ? "#28a745" : "#ccc"
    }; font-size:24px; background:#fff; border-radius:50%;"></i>
            <div style="font-size:12px; margin-top:5px; color:${
              isCompleted ? "#333" : "#999"
            }; font-weight:${idx === currentIndex ? "bold" : "normal"};">
                ${step.label}
            </div>
        </div>
    `;
  });
  html += `</div>`;
  container.innerHTML = html;
}

window.renderDeliveryLocations = function () {
  const select = document.getElementById("ship-delivery-location");
  if (!select || select.options.length > 1) return;

  let html = `<option value="" selected disabled>--- 選擇配送地區 ---</option>`;
  html += `<option value="0">✅ 一般地區 (免加價)</option>`;

  if (window.REMOTE_AREAS) {
    const sortedFees = Object.keys(window.REMOTE_AREAS).sort((a, b) => a - b);
    sortedFees.forEach((fee) => {
      if (fee == "0") return;
      html += `<optgroup label="加收/方 $${fee}">`;
      window.REMOTE_AREAS[fee].forEach((area) => {
        html += `<option value="${fee}">${area}</option>`;
      });
      html += `</optgroup>`;
    });
  }
  select.innerHTML = html;
};

// --- 全域事件初始化 ---
document.addEventListener("DOMContentLoaded", () => {
  const toggles = {
    "srv-floor": "srv-floor-options",
    "srv-wood": "srv-wood-input",
    "srv-assembly": "srv-assembly-input",
    "srv-old": "srv-old-input",
  };

  Object.keys(toggles).forEach((id) => {
    const el = document.getElementById(id);
    const target = document.getElementById(toggles[id]);
    if (el && target) {
      el.addEventListener("change", (e) => {
        target.style.display = e.target.checked ? "block" : "none";
      });
    }
  });

  const locationSelect = document.getElementById("ship-delivery-location");
  if (locationSelect) {
    locationSelect.addEventListener("change", () =>
      window.recalculateShipmentTotal()
    );
  }
});

// 一鍵複製
window.copyText = function (elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const text = el.innerText.trim();
  if (!text || text === "--") return;

  navigator.clipboard.writeText(text).then(() => {
    const btn = event.target;
    const original = btn.innerText;
    btn.innerText = "已複製!";
    btn.style.backgroundColor = "#28a745";
    setTimeout(() => {
      btn.innerText = original;
      btn.style.backgroundColor = "";
    }, 2000);
  });
};

// 銀行轉帳上傳憑證修復
window.submitBankProof = async function () {
  const shipmentId = window.lastCreatedShipmentId;
  const fileInput = document.getElementById("bank-transfer-proof");
  const file = fileInput ? fileInput.files[0] : null;

  if (!shipmentId || !file) return alert("資訊不完整，請選擇照片");

  const btn = document.getElementById("btn-bank-submit-proof");
  if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 上傳中...';

  const fd = new FormData();
  fd.append("paymentProof", file); // 與後端 upload.single("paymentProof") 一致

  try {
    // [重要修復] API 路徑與 PUT 方法
    const res = await fetch(
      `${API_BASE_URL}/api/shipments/${shipmentId}/payment`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${window.dashboardToken}` },
        body: fd,
      }
    );

    if (res.ok) {
      alert("憑證上傳成功！");
      document.getElementById("bank-info-modal").style.display = "none";
      window.loadMyShipments();
    } else {
      const data = await res.json();
      alert(data.message || "上傳失敗");
    }
  } catch (err) {
    alert("網路錯誤");
  } finally {
    if (btn) btn.innerHTML = '<i class="fas fa-upload"></i> 確認提交憑證';
  }
};

window.handleBankProofPreview = function (input) {
  const container = document.getElementById("bank-proof-preview-container");
  const img = document.getElementById("bank-proof-preview-img");
  const label = document.getElementById("bank-proof-label");
  const submitBtn = document.getElementById("btn-bank-submit-proof");

  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target.result;
      container.style.display = "block";
      label.style.display = "none";
      if (submitBtn) submitBtn.disabled = false;
    };
    reader.readAsDataURL(input.files[0]);
  }
};

window.resetBankProofUpload = function () {
  const input = document.getElementById("bank-transfer-proof");
  const container = document.getElementById("bank-proof-preview-container");
  const label = document.getElementById("bank-proof-label");
  if (input) input.value = "";
  if (container) container.style.display = "none";
  if (label) label.style.display = "flex";
};

window.openUploadProof = function (id) {
  window.lastCreatedShipmentId = id;
  const bankModal = document.getElementById("bank-info-modal");
  if (bankModal) {
    bankModal.style.display = "flex";
    window.resetBankProofUpload();
  }
};

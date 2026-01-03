// frontend/js/dashboard-shipments.js
// V2025.Final.Transparent.UI - 前端費用透明化顯示邏輯適配 (含傢俱類型顯示修復 & 圖片 path 修復)
// [Update] 修正合併打包結算條顯隱控制邏輯
// [Optimization] 整合銀行轉帳彈窗詳細資訊、一鍵複製與垃圾郵件提醒
// [Fixed] 解決選擇銀行轉帳提交後無動作、畫面變霧面之問題

// --- 1. 更新底部結帳條 ---
window.updateCheckoutBar = function () {
  const bar = document.getElementById("checkout-bar");
  const countEl = document.getElementById("selected-pkg-count");
  const btn = document.getElementById("btn-create-shipment");

  const checkboxes = document.querySelectorAll(".package-checkbox:checked");
  const count = checkboxes.length;

  // 1.1 更新件數文字
  if (countEl) countEl.textContent = count;

  // 1.2 [關鍵修復] 控制結算條容器的顯示與隱藏
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

// --- [核心優化] 3. 觸發後端運費預算並渲染透明化報表 ---
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
    document.getElementById("ship-selected-area-name").textContent =
      selectedOption.text;
    document.getElementById("ship-selected-area-fee").textContent = `$${rate}`;
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

      // 1. 更新總量面板
      if (actualWeightEl)
        actualWeightEl.textContent = `${p.totalActualWeight} kg`;
      if (volumetricEl) volumetricEl.textContent = `${p.totalVolumetricCai} 材`;

      // 2. 渲染透明化報表
      if (p.breakdown) {
        renderBreakdownTable(p.breakdown, breakdownDiv, rate);
      } else {
        renderSimpleTable(p, breakdownDiv, rate);
      }

      // 重新檢查錢包餘額 (若已選)
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

// [New] 渲染詳細透明化報表 (已修復：顯示傢俱類型)
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

  // 1. 包裹明細列表
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

  // 2. 原始運費小計
  html += `
      <tr style="background-color: #fcfcfc;">
        <td colspan="2" style="padding: 8px; text-align: right; color: #555;">原始運費小計</td>
        <td style="padding: 8px; text-align: right; font-weight: bold;">$${breakdown.subtotal.toLocaleString()}</td>
      </tr>
  `;

  // 3. 低消補差額
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

  // 4. 其他附加費 (超長、超重、偏遠)
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

  // 5. 總金額
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
      // 1. 隱藏合併打包彈窗
      const modal = document.getElementById("create-shipment-modal");
      if (modal) modal.style.display = "none";

      window.lastCreatedShipmentId = data.shipment.id;

      if (paymentMethod === "WALLET") {
        alert("訂單建立成功！費用已從錢包扣除，系統將自動安排出貨。");
      } else {
        // [重點修復]：處理銀行轉帳彈窗顯示邏輯，解決霧面無動作
        setTimeout(() => {
          const bankModal = document.getElementById("bank-info-modal");
          if (!bankModal) {
            console.error("找不到 bank-info-modal，請檢查組件是否正確載入");
            alert("訂單已建立，請前往集運單列表查看匯款帳號並上傳憑證。");
            return;
          }

          if (window.BANK_INFO_CACHE) {
            // 兼容多種 ID 命名的顯示
            const bName =
              document.getElementById("bank-name-display") ||
              document.getElementById("bank-name");
            const bAcc =
              document.getElementById("bank-account-display") ||
              document.getElementById("bank-account");
            const bHolder =
              document.getElementById("bank-holder-display") ||
              document.getElementById("bank-holder");
            const bBranch = document.getElementById("bank-branch");

            if (bName)
              bName.textContent = window.BANK_INFO_CACHE.bankName || "--";
            if (bAcc) bAcc.textContent = window.BANK_INFO_CACHE.account || "--";
            if (bHolder)
              bHolder.textContent = window.BANK_INFO_CACHE.holder || "--";
            if (bBranch)
              bBranch.textContent = window.BANK_INFO_CACHE.branch || "";
          }

          // 顯示銀行資訊彈窗
          bankModal.style.display = "flex";
          // 重要：確保新彈窗開啟時上傳區域被重置
          if (typeof window.resetBankProofUpload === "function")
            window.resetBankProofUpload();
          console.log("銀行轉帳彈窗已開啟，請提醒用戶檢查垃圾郵件");
        }, 100);
      }

      // 2. 重新載入列表
      window.loadMyShipments();
      window.loadMyPackages();
      if (typeof window.loadWalletData === "function") window.loadWalletData();

      // 3. 重置表單
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
    console.error(e);
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
    if (timelineContainer) {
      renderTimeline(timelineContainer, s.status);
    } else {
      const statusEl = document.getElementById("sd-status");
      if (statusEl)
        statusEl.textContent = window.SHIPMENT_STATUS_MAP[s.status] || s.status;
    }

    const statusEl = document.getElementById("sd-status");
    if (statusEl) {
      if (s.status === "RETURNED") {
        statusEl.innerHTML = `<span class="status-badge status-CANCELLED">訂單已退回</span>
          <div style="background:#fff1f0; border:1px solid #ffa39e; padding:8px; border-radius:4px; margin-top:5px; font-size:13px; color:#c0392b;">
              <strong>退回原因：</strong> ${s.returnReason || "未說明"}
          </div>`;
      } else {
        statusEl.textContent = window.SHIPMENT_STATUS_MAP[s.status] || s.status;
      }
    }

    let dateHtml = `<div><strong>建立日期:</strong> <span>${new Date(
      s.createdAt
    ).toLocaleString()}</span></div>`;
    if (s.loadingDate) {
      dateHtml += `<div style="color:#28a745; font-weight:bold; margin-top:5px;">
            <i class="fas fa-ship"></i> 裝櫃日期: ${new Date(
              s.loadingDate
            ).toLocaleDateString()}
        </div>`;
    }
    const dateBox = document.getElementById("sd-date");
    if (dateBox) dateBox.innerHTML = dateHtml;

    const trackEl = document.getElementById("sd-trackingTW");
    if (trackEl) trackEl.textContent = s.trackingNumberTW || "尚未產生";

    document.getElementById("sd-name").textContent = s.recipientName;
    document.getElementById("sd-phone").textContent = s.phone;
    document.getElementById("sd-address").textContent = s.shippingAddress;

    const breakdown = document.getElementById("sd-fee-breakdown");
    if (breakdown) {
      breakdown.innerHTML = `
          <div>運費總計: <strong>$${(
            s.totalCost || 0
          ).toLocaleString()}</strong></div>
          ${
            s.invoiceNumber
              ? `<div style="margin-top:5px; color:#28a745;">發票已開立: ${s.invoiceNumber}</div>`
              : ""
          }
      `;
    }

    const gallery = document.getElementById("sd-proof-images");
    if (gallery) {
      gallery.innerHTML = "";
      if (s.paymentProof) {
        if (s.paymentProof === "WALLET_PAY") {
          gallery.innerHTML = `<div style="text-align:center; padding:10px; background:#f0f8ff; border-radius:5px; color:#0056b3;">
                  <i class="fas fa-wallet"></i> 使用錢包餘額支付
              </div>`;
        } else {
          const isUrl =
            s.paymentProof.startsWith("http") ||
            s.paymentProof.startsWith("https");
          const imgSrc = isUrl
            ? s.paymentProof
            : `${API_BASE_URL}${s.paymentProof}`;
          gallery.innerHTML += `<div style="text-align:center;">
            <p>付款憑證</p>
            <img src="${imgSrc}" onclick="window.open(this.src)" style="max-width:100px; cursor:pointer; border:1px solid #ccc;">
          </div>`;
        }
      }
    }

    const detailModal = document.getElementById("shipment-details-modal");
    if (detailModal) detailModal.style.display = "flex";
  } catch (e) {
    alert("無法載入詳情");
  }
};

window.cancelShipment = async function (id) {
  if (
    !confirm(
      "確定要取消此訂單嗎？\n取消後，包裹將會釋放回「已入庫」狀態，您可以重新打包。"
    )
  )
    return;

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
    const text = currentStatus === "RETURNED" ? "訂單已退回" : "訂單已取消";
    container.innerHTML = `<div class="alert alert-error text-center" style="margin:10px 0;">${text}</div>`;
    return;
  }
  if (currentStatus === "PENDING_REVIEW") currentStatus = "PENDING_PAYMENT";

  let currentIndex = steps.findIndex((s) => s.code === currentStatus);
  if (currentIndex === -1) currentIndex = 0;

  let html = `<div class="timeline-container" style="display:flex; justify-content:space-between; margin:20px 0; position:relative; padding:0 10px; overflow-x:auto;">`;
  html += `<div style="position:absolute; top:15px; left:20px; right:20px; height:4px; background:#eee; z-index:0; min-width:400px;"></div>`;
  const progressPercent = (currentIndex / (steps.length - 1)) * 100;
  html += `<div style="position:absolute; top:15px; left:20px; width:calc(${progressPercent}% - 40px); max-width:calc(100% - 40px); height:4px; background:#28a745; z-index:0; transition:width 0.3s; min-width:0;"></div>`;

  steps.forEach((step, idx) => {
    const isCompleted = idx <= currentIndex;
    const color = isCompleted ? "#28a745" : "#ccc";
    const icon = isCompleted ? "fa-check-circle" : "fa-circle";
    html += `
        <div style="position:relative; z-index:1; text-align:center; flex:1; min-width:60px;">
            <i class="fas ${icon}" style="color:${color}; font-size:24px; background:#fff; border-radius:50%;"></i>
            <div style="font-size:12px; margin-top:5px; color:${
              isCompleted ? "#333" : "#999"
            }; font-weight:${
      idx === currentIndex ? "bold" : "normal"
    }; white-space:nowrap;">
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
      const areas = window.REMOTE_AREAS[fee];
      html += `<optgroup label="加收/方 $${fee}">`;
      areas.forEach((area) => {
        html += `<option value="${fee}">${area}</option>`;
      });
      html += `</optgroup>`;
    });
  }
  select.innerHTML = html;
};

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
    locationSelect.addEventListener("change", () => {
      window.recalculateShipmentTotal();
    });
  }
});

// [新增全域輔助函式] 一鍵複製邏輯
window.copyText = function (elementId) {
  const el = document.getElementById(elementId);
  if (!el) {
    // 容錯檢查：若找不到 ID，嘗試尋找帶有 -display 的 ID
    const fallback = document.getElementById(elementId + "-display");
    if (fallback) return window.copyText(elementId + "-display");
    return;
  }
  const text = el.innerText.trim();
  if (!text || text === "--") return;

  navigator.clipboard
    .writeText(text)
    .then(() => {
      // 取得按鈕並改變狀態反饋
      const btn = event.target;
      const originalText = btn.innerText;
      btn.innerText = "已複製!";
      btn.style.backgroundColor = "#28a745";
      btn.style.color = "#fff";

      setTimeout(() => {
        btn.innerText = originalText;
        btn.style.backgroundColor = "";
        btn.style.color = "";
      }, 2000);
    })
    .catch((err) => {
      alert("複製失敗，請手動選取文字");
    });
};

// ==========================================
// [旗艦版新增] 銀行資訊彈窗內部的圖片預覽與上傳互動邏輯
// ==========================================

/**
 * 處理銀行彈窗內的圖片預覽
 */
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
      label.style.display = "none"; // 選中後隱藏灰色相機框
      if (submitBtn) submitBtn.disabled = false; // 啟用提交按鈕
    };
    reader.readAsDataURL(input.files[0]);
  }
};

/**
 * 重置銀行彈窗內的上傳區域
 */
window.resetBankProofUpload = function () {
  const input = document.getElementById("bank-transfer-proof");
  const container = document.getElementById("bank-proof-preview-container");
  const label = document.getElementById("bank-proof-label");
  const submitBtn = document.getElementById("btn-bank-submit-proof");

  if (input) input.value = "";
  if (container) container.style.display = "none";
  if (label) label.style.display = "flex";
  if (submitBtn) submitBtn.disabled = true;
};

/**
 * 在銀行彈窗內提交憑證
 */
window.submitBankProof = async function () {
  const shipmentId = window.lastCreatedShipmentId;
  const fileInput = document.getElementById("bank-transfer-proof");
  const file = fileInput ? fileInput.files[0] : null;

  if (!shipmentId || !file) return alert("資訊不完整，請先選擇照片");

  const btn = document.getElementById("btn-bank-submit-proof");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 上傳中...';
  }

  const fd = new FormData();
  fd.append("proof", file);

  try {
    const res = await fetch(
      `${API_BASE_URL}/api/shipments/${shipmentId}/upload-proof`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${window.dashboardToken}` },
        body: fd,
      }
    );

    if (res.ok) {
      alert("憑證上傳成功！管理員將儘速審核。");
      document.getElementById("bank-info-modal").style.display = "none";
      window.loadMyShipments(); // 刷新列表狀態
    } else {
      const data = await res.json();
      alert(data.message || "上傳失敗，請稍後再試");
    }
  } catch (err) {
    alert("網路錯誤，上傳失敗");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-upload"></i> 確認提交憑證';
    }
  }
};

/**
 * 列表中的「上傳憑證」按鈕觸發 (復用銀行彈窗)
 */
window.openUploadProof = function (id) {
  window.lastCreatedShipmentId = id;
  const bankModal = document.getElementById("bank-info-modal");
  if (bankModal) {
    bankModal.style.display = "flex";
    window.resetBankProofUpload(); // 重置上傳區域

    // 嘗試顯示緩存的匯款資訊
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
      if (bName) bName.textContent = window.BANK_INFO_CACHE.bankName || "--";
      if (bAcc) bAcc.textContent = window.BANK_INFO_CACHE.account || "--";
      if (bHolder) bHolder.textContent = window.BANK_INFO_CACHE.holder || "--";
    }
  }
};

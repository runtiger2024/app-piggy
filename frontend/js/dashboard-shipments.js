// frontend/js/dashboard-shipments.js
// V2026.01.Stable.Full.Final - 旗艦穩定修復最終版
// [Core] 完整保留所有原始功能：包含稅務資訊、附加服務、自動填充、錢包校驗
// [Fix] 深度解決 Cloudinary 網址損毀 (https:/) 與本地/雲端混合路徑問題
// [Safety] 增加進度條崩潰保護與渲染異常攔截

/**
 * 全局狀態與配置
 */
window.SHIPMENT_STATUS_MAP = {
  AWAITING_REVIEW: "待管理員審核",
  PENDING_PAYMENT: "待付款",
  PROCESSING: "處理中/已收款",
  SHIPPED: "已裝櫃出貨",
  CUSTOMS_CHECK: "海關查驗中",
  UNSTUFFING: "拆櫃派送中",
  COMPLETED: "已送達完成",
  CANCELLED: "已取消",
  RETURNED: "訂單退回",
};

window.STATUS_CLASSES = {
  AWAITING_REVIEW: "status-PENDING",
  PENDING_PAYMENT: "status-PENDING",
  PROCESSING: "status-PROCESSING",
  SHIPPED: "status-SHIPPED",
  CUSTOMS_CHECK: "status-SHIPPED",
  UNSTUFFING: "status-SHIPPED",
  COMPLETED: "status-COMPLETED",
  CANCELLED: "status-CANCELLED",
  RETURNED: "status-CANCELLED",
};

// --- 1. 底部結帳條 UI 邏輯 ---
window.updateCheckoutBar = function () {
  const bar = document.getElementById("checkout-bar");
  const countEl = document.getElementById("selected-pkg-count");
  const btn = document.getElementById("btn-create-shipment");

  const checkboxes = document.querySelectorAll(".package-checkbox:checked");
  const count = checkboxes.length;

  if (countEl) countEl.textContent = count;

  if (bar) {
    if (count > 0) {
      bar.style.display = "flex";
      if (btn) {
        btn.disabled = false;
        btn.classList.remove("btn-secondary");
        btn.classList.add("btn-primary");
      }
    } else {
      bar.style.display = "none";
      if (btn) {
        btn.disabled = true;
        btn.classList.add("btn-secondary");
        btn.classList.remove("btn-primary");
      }
    }
  }
};

// --- 2. 點擊「合併打包」按鈕：初始化模態框與數據 ---
window.handleCreateShipmentClick = async function () {
  const selectedCheckboxes = document.querySelectorAll(
    ".package-checkbox:checked"
  );
  if (selectedCheckboxes.length === 0) return;

  const selectedIds = Array.from(selectedCheckboxes).map((cb) => cb.dataset.id);
  const selectedPackages = (window.allPackagesData || []).filter((pkg) =>
    selectedIds.includes(pkg.id)
  );

  // 更新統計數量
  const countEl = document.getElementById("checkout-total-count");
  if (countEl) countEl.textContent = selectedPackages.length;

  // 檢查是否有重物（叉車警告）
  const hasHeavyItem = selectedPackages.some((pkg) => pkg.isOverweight);
  const warningBox = document.getElementById("forklift-warning");
  if (warningBox) warningBox.style.display = hasHeavyItem ? "block" : "none";

  // 渲染待打包清單
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
                    <div style="font-weight:bold; font-size: 14px;">${
                      idx + 1
                    }. ${pkg.productName || "未命名商品"} ${alerts}</div>
                    <div style="font-size:12px; color:#888;">單號: ${
                      pkg.trackingNumber
                    }</div>
                  </div>
                  <div class="cost" style="text-align: right; font-size: 13px; color: #555;"><i class="fas fa-box"></i></div>
                </div>`;
    });
  }

  // 自動填充用戶資料
  if (window.currentUser) {
    const nameInput = document.getElementById("ship-name");
    const phoneInput = document.getElementById("ship-phone");
    const addrInput = document.getElementById("ship-street-address");

    if (nameInput && !nameInput.value)
      nameInput.value = window.currentUser.name || "";
    if (phoneInput && !phoneInput.value)
      phoneInput.value = window.currentUser.phone || "";
    if (addrInput && !addrInput.value)
      addrInput.value = window.currentUser.defaultAddress || "";
  }

  // 收件人選擇器綁定
  const btnSelectRecipient = document.getElementById("btn-select-recipient");
  if (btnSelectRecipient) {
    btnSelectRecipient.onclick = (e) => {
      e.preventDefault();
      if (typeof window.openRecipientSelector === "function") {
        window.openRecipientSelector();
      } else {
        console.error("找不到收件人選擇模組");
      }
    };
  }

  // 默認支付方式與地區渲染
  const radioTransfer = document.getElementById("pay-transfer");
  if (radioTransfer) radioTransfer.checked = true;
  window.togglePaymentMethod("TRANSFER");
  window.renderDeliveryLocations();

  const modal = document.getElementById("create-shipment-modal");
  if (modal) modal.style.display = "flex";

  window.loadAvailableServices();
  window.recalculateShipmentTotal();
};

// --- 3. 費用試算邏輯 ---
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
  const rate = locationSelect ? locationSelect.value || 0 : 0;

  // 更新偏遠地區 UI 顯示
  const remoteInfo = document.getElementById("ship-remote-area-info");
  const selectedOption = locationSelect
    ? locationSelect.options[locationSelect.selectedIndex]
    : null;
  if (rate > 0 && selectedOption) {
    const nameDisplay = document.getElementById("ship-selected-area-name");
    const feeDisplay = document.getElementById("ship-selected-area-fee");
    if (nameDisplay) nameDisplay.textContent = selectedOption.text;
    if (feeDisplay) feeDisplay.textContent = `$${rate}`;
    if (remoteInfo) remoteInfo.style.display = "block";
  } else {
    if (remoteInfo) remoteInfo.style.display = "none";
  }

  // 載入動畫
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

      if (actualWeightEl)
        actualWeightEl.textContent = `${p.totalActualWeight} kg`;
      if (volumetricEl) volumetricEl.textContent = `${p.totalVolumetricCai} 材`;

      if (p.breakdown) {
        renderBreakdownTable(p.breakdown, breakdownDiv, rate);
      } else {
        renderSimpleTable(p, breakdownDiv, rate);
      }

      // 如果當前是錢包支付，重新校驗餘額
      const walletRadio = document.getElementById("pay-wallet");
      if (walletRadio && walletRadio.checked)
        window.togglePaymentMethod("WALLET");
    } else {
      breakdownDiv.innerHTML = `<div class="alert alert-danger">試算失敗: ${data.message}</div>`;
    }
  } catch (e) {
    console.error(e);
    breakdownDiv.innerHTML = `<div class="alert alert-danger">連線錯誤，無法取得報價</div>`;
  }
};

// --- 4. 費用表格渲染函數 (模組化封裝) ---
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
            <tbody>`;

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
                ${pkg.dims} | <span style="${!isVol ? "color:#ccc;" : ""}">${
      pkg.cai
    } 材</span> | <span style="${isVol ? "color:#ccc;" : ""}">${
      pkg.weight
    }</span>
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
            <td style="padding: 8px; text-align: right; font-family: monospace;">$${pkg.rawFee.toLocaleString()}</td>
          </tr>`;
  });

  html += `
          <tr style="background-color: #fcfcfc;">
            <td colspan="2" style="padding: 8px; text-align: right; color: #555;">原始運費小計</td>
            <td style="padding: 8px; text-align: right; font-weight: bold;">$${breakdown.subtotal.toLocaleString()}</td>
          </tr>`;

  if (breakdown.minChargeDiff > 0) {
    html += `
          <tr>
            <td colspan="2" style="padding: 8px; text-align: right; color: #e67e22;">
              <i class="fas fa-arrow-up"></i> 低消補足 (${
                breakdown.surcharges.find((s) => s.name === "低消補足")
                  ?.reason || "未達低消"
              })
            </td>
            <td style="padding: 8px; text-align: right; color: #e67e22;">+$${breakdown.minChargeDiff.toLocaleString()}</td>
          </tr>`;
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
          </tr>`;
  });

  html += `
            </tbody>
          </table>
        </div>
        <div style="margin-top: 15px; text-align: right;">
            <div style="font-size: 14px; color: #555;">總金額 (TWD)</div>
            <div style="font-size: 24px; font-weight: bold; color: #2e7d32;">$${breakdown.finalTotal.toLocaleString()}</div>
        </div>`;
  container.innerHTML = html;
}

function renderSimpleTable(p, container, rate) {
  let html = `<table style="width: 100%; font-size: 14px; margin-top: 5px;">`;
  html += `<tr><td style="padding: 4px 0; color: #555;">基本海運費</td><td style="padding: 4px 0; text-align: right; font-weight: bold;">$${p.baseCost.toLocaleString()}</td></tr>`;
  if (p.isMinimumChargeApplied) {
    html += `<tr><td colspan="2" style="text-align: right; font-size: 11px; color: #e67e22;">未達最低消費，以低消計算</td></tr>`;
  }
  if (p.remoteFee > 0)
    html += `<tr><td style="padding: 4px 0;">偏遠地區費</td><td style="text-align: right; color: #d35400;">+$${p.remoteFee.toLocaleString()}</td></tr>`;
  if (p.oversizedFee > 0)
    html += `<tr><td style="padding: 4px 0; color: #d35400;">超長附加費</td><td style="text-align: right; color: #d35400;">+$${p.oversizedFee.toLocaleString()}</td></tr>`;
  if (p.overweightFee > 0)
    html += `<tr><td style="padding: 4px 0; color: #d35400;">超重附加費</td><td style="text-align: right; color: #d35400;">+$${p.overweightFee.toLocaleString()}</td></tr>`;
  html += `<tr style="border-top: 2px solid #eee;"><td style="padding: 10px 0; font-weight: bold;">總金額 (TWD)</td><td style="padding: 10px 0; text-align: right; font-weight: bold; font-size: 20px; color: #2e7d32;">$${p.totalCost.toLocaleString()}</td></tr></table>`;
  container.innerHTML = html;
}

// --- 5. 提交建立訂單 ---
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

  // 地址組合 (搜尋框 + 詳細街道)
  const areaSearch = document.getElementById("ship-area-search")?.value || "";
  const streetAddr =
    document.getElementById("ship-street-address")?.value || "";
  fd.append("shippingAddress", (areaSearch + " " + streetAddr).trim());

  fd.append(
    "deliveryLocationRate",
    document.getElementById("ship-delivery-location").value || 0
  );
  fd.append("idNumber", document.getElementById("ship-idNumber").value);
  fd.append("note", document.getElementById("ship-note").value);
  fd.append("paymentMethod", paymentMethod);

  // 修正後的動態附加服務提取
  const services = {};
  document.querySelectorAll(".service-option-item").forEach((item) => {
    const cb = item.querySelector(".svc-checkbox");
    if (cb && cb.checked) {
      const id = cb.dataset.id;
      services[id] = {
        selected: true,
        name: cb.dataset.name,
        price: parseFloat(cb.dataset.price),
        note: item.querySelector(".svc-note")?.value || "",
      };
    }
  });
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
        // 顯示轉帳資訊模態框
        setTimeout(() => {
          const bankModal = document.getElementById("bank-info-modal");
          if (!bankModal) return alert("訂單已建立，請前往列表查看匯款帳號。");

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

// --- 6. 支付方式切換與錢包餘額校驗 ---
window.togglePaymentMethod = function (method) {
  const walletBalanceInfo = document.getElementById("wallet-pay-info");
  const btnSubmit = document.querySelector(".btn-place-order");

  if (method === "WALLET") {
    if (walletBalanceInfo) {
      walletBalanceInfo.style.display = "block";
      walletBalanceInfo.innerHTML =
        '<i class="fas fa-spinner fa-spin"></i> 正在查詢餘額...';
      const currentTotal = window.currentShipmentTotal || 0;

      fetch(`${API_BASE_URL}/api/wallet/my`, {
        headers: { Authorization: `Bearer ${window.dashboardToken}` },
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.success) {
            const bal = d.wallet.balance;
            if (bal < currentTotal) {
              walletBalanceInfo.innerHTML = `餘額: $${bal.toLocaleString()} <span style="color:red; font-weight:bold;">(不足，請先儲值或改用匯款)</span>`;
              if (btnSubmit) btnSubmit.disabled = true;
            } else {
              walletBalanceInfo.innerHTML = `餘額: $${bal.toLocaleString()} <span style="color:green; font-weight:bold;">(足夠支付)</span>`;
              if (btnSubmit) btnSubmit.disabled = false;
            }
          }
        })
        .catch(() => {
          walletBalanceInfo.innerHTML = `<span style="color:red;">無法取得餘額資訊</span>`;
        });
    }
  } else {
    if (walletBalanceInfo) walletBalanceInfo.style.display = "none";
    if (btnSubmit) btnSubmit.disabled = false;
  }
};

// --- 7. 載入訂單列表 ---
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
      data.shipments.forEach((s) => {
        const statusText = window.SHIPMENT_STATUS_MAP[s.status] || s.status;
        const statusClass = window.STATUS_CLASSES[s.status] || "";
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
                            <small>${new Date(
                              s.createdAt
                            ).toLocaleDateString()}</small>
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
                    </tr>`;
      });
    } else {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:#999;">尚未有集運單</td></tr>`;
    }
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red;">載入失敗</td></tr>`;
  }
};

// --- 8. 查看訂單詳情 (核心修復：Cloudinary & 附加服務) ---
window.openShipmentDetails = async function (id) {
  try {
    // 重置 UI
    const resetList = [
      "sd-id",
      "sd-date",
      "sd-name",
      "sd-phone",
      "sd-address",
      "sd-trackingTW",
    ];
    resetList.forEach((rid) => {
      if (document.getElementById(rid))
        document.getElementById(rid).textContent = "--";
    });

    const res = await fetch(`${API_BASE_URL}/api/shipments/${id}`, {
      headers: { Authorization: `Bearer ${window.dashboardToken}` },
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    const s = data.shipment;

    // 填充基礎資訊
    if (document.getElementById("sd-id"))
      document.getElementById("sd-id").textContent = s.id
        .slice(-8)
        .toUpperCase();
    if (document.getElementById("sd-date"))
      document.getElementById("sd-date").textContent = new Date(
        s.createdAt
      ).toLocaleString();
    if (document.getElementById("sd-name"))
      document.getElementById("sd-name").textContent = s.recipientName || "--";
    if (document.getElementById("sd-phone"))
      document.getElementById("sd-phone").textContent = s.phone || "--";
    if (document.getElementById("sd-address"))
      document.getElementById("sd-address").textContent =
        s.shippingAddress || "--";
    if (document.getElementById("sd-trackingTW"))
      document.getElementById("sd-trackingTW").textContent =
        s.trackingNumberTW || s.carrierId || "尚未產生";

    // 附加服務詳情渲染
    const servicesSection = document.getElementById("sd-services-section");
    const servicesList = document.getElementById("sd-services-list");
    if (servicesSection && servicesList && s.additionalServices) {
      const services = s.additionalServices;
      let hasService = false;
      let svcHtml = "";
      const svcMap = {
        floor: "送貨上樓",
        wood: "木架打框",
        assembly: "家具組裝",
        old: "舊家具清運",
      };

      Object.keys(svcMap).forEach((key) => {
        if (services[key] && services[key].selected) {
          hasService = true;
          let noteStr = services[key].note ? ` (${services[key].note})` : "";
          let elevatorStr =
            key === "floor" && services.floor.hasElevator ? " - 有電梯" : "";
          svcHtml += `
                        <div class="info-row">
                          <span class="info-label"><i class="fas fa-check-circle" style="color:#28a745;"></i> ${
                            svcMap[key]
                          }${elevatorStr}</span>
                          <span class="info-value" style="color:#666;">${
                            noteStr || "已選擇"
                          }</span>
                        </div>`;
        }
      });
      if (hasService) {
        servicesList.innerHTML = svcHtml;
        servicesSection.style.display = "block";
      } else {
        servicesSection.style.display = "none";
      }
    }

    // 費用報告
    const breakdownDiv = document.getElementById("sd-fee-breakdown");
    if (breakdownDiv && s.costBreakdown) {
      renderBreakdownTable(
        s.costBreakdown,
        breakdownDiv,
        s.deliveryLocationRate || 0
      );
    }

    // 支付憑證修復 (Cloudinary 正則修復)
    const proofImagesContainer = document.getElementById("sd-proof-images");
    if (proofImagesContainer) {
      if (s.paymentProof && s.paymentProof !== "WALLET_PAY") {
        let path = s.paymentProof;
        let fullUrl = "";
        // 修復 https:/ 單斜線問題
        if (path.startsWith("http")) {
          fullUrl = path.replace(/^https?:\/+(?!\/)/, "https://");
        } else {
          fullUrl =
            API_BASE_URL.replace(/\/+$/, "") +
            (path.startsWith("/") ? path : "/" + path);
        }

        proofImagesContainer.innerHTML = `
                  <div style="text-align:center; width: 100%;">
                    <a href="${fullUrl}" target="_blank">
                      <img src="${fullUrl}" onerror="this.src='https://placehold.co/300x200?text=圖片路徑異常';" 
                           style="max-width: 100%; border-radius: 8px; border: 1px solid #eee; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                    </a>
                  </div>`;
      } else if (s.paymentProof === "WALLET_PAY") {
        proofImagesContainer.innerHTML = `<div class="alert alert-info">此訂單已通過錢包餘額結清</div>`;
      } else {
        proofImagesContainer.innerHTML =
          '<span class="text-muted">暫無憑證數據</span>';
      }
    }

    // 進度條渲染
    const timelineContainer = document.getElementById("sd-timeline");
    if (timelineContainer) window.renderTimeline(timelineContainer, s.status);

    const detailModal = document.getElementById("shipment-details-modal");
    if (detailModal) detailModal.style.display = "flex";
  } catch (e) {
    console.error("載入詳情失敗:", e);
    alert("無法載入詳情報告");
  }
};

// --- 9. 訂單操作：取消與進度條 ---
window.cancelShipment = async function (id) {
  if (!confirm("確定要取消此訂單嗎？取消後包裹將釋放回待集運狀態。")) return;
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

window.renderTimeline = function (container, currentStatus) {
  const steps = [
    { code: "AWAITING_REVIEW", label: "待審核" },
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
                <i class="fas ${isCompleted ? "fa-check-circle" : "fa-circle"}" 
                   style="color:${
                     isCompleted ? "#28a745" : "#ccc"
                   }; font-size:24px; background:#fff; border-radius:50%;"></i>
                <div style="font-size:12px; margin-top:5px; color:${
                  isCompleted ? "#333" : "#999"
                }; font-weight:${idx === currentIndex ? "bold" : "normal"};">${
      step.label
    }</div>
            </div>`;
  });
  html += `</div>`;
  container.innerHTML = html;
};

// --- 10. 輔助功能：地區渲染、複製、稅務處理 ---
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

window.handleTaxIdChange = function (input) {
  const star = document.getElementById("title-required-star");
  if (star)
    star.style.display = input.value.trim().length > 0 ? "inline" : "none";
};

// --- 11. 匯款憑證與發票資訊上傳 ---
window.submitBankProof = async function () {
  const shipmentId = window.lastCreatedShipmentId;
  const fileInput = document.getElementById("bank-transfer-proof");
  const file = fileInput ? fileInput.files[0] : null;

  const taxId = document.getElementById("bank-tax-id")?.value.trim() || "";
  const invoiceTitle =
    document.getElementById("bank-invoice-title")?.value.trim() || "";

  if (!shipmentId || !file) return alert("資訊不完整，請選擇照片");

  if (taxId.length > 0 && invoiceTitle.length === 0) {
    alert("填寫統一編號時，公司抬頭為必填項目");
    if (document.getElementById("bank-invoice-title"))
      document.getElementById("bank-invoice-title").focus();
    return;
  }

  const btn = document.getElementById("btn-bank-submit-proof");
  if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 上傳中...';

  const fd = new FormData();
  fd.append("paymentProof", file);
  fd.append("taxId", taxId);
  fd.append("invoiceTitle", invoiceTitle);

  try {
    const res = await fetch(
      `${API_BASE_URL}/api/shipments/${shipmentId}/payment`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${window.dashboardToken}` },
        body: fd,
      }
    );

    if (res.ok) {
      alert("憑證與發票資訊上傳成功！");
      if (document.getElementById("bank-info-modal"))
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
      if (container) container.style.display = "block";
      if (label) label.style.display = "none";
      if (submitBtn) submitBtn.disabled = false;
    };
    reader.readAsDataURL(input.files[0]);
  }
};

window.resetBankProofUpload = function () {
  const input = document.getElementById("bank-transfer-proof");
  const container = document.getElementById("bank-proof-preview-container");
  const label = document.getElementById("bank-proof-label");
  const taxInput = document.getElementById("bank-tax-id");
  const titleInput = document.getElementById("bank-invoice-title");
  const star = document.getElementById("title-required-star");

  if (input) input.value = "";
  if (container) container.style.display = "none";
  if (label) label.style.display = "flex";
  if (taxInput) taxInput.value = "";
  if (titleInput) titleInput.value = "";
  if (star) star.style.display = "none";
};

window.openUploadProof = function (id) {
  window.lastCreatedShipmentId = id;
  const bankModal = document.getElementById("bank-info-modal");
  if (bankModal) {
    bankModal.style.display = "flex";
    window.resetBankProofUpload();
  }
};

// --- 12. DOM 加載初始化 ---
document.addEventListener("DOMContentLoaded", () => {
  // 附加服務開關連動
  const toggles = {
    "srv-floor": "srv-floor-options",
    "srv-wood": "srv-wood-input",
    "srv-assembly": "srv-assembly-input",
    "srv-old": "srv-old-input",
  };
  Object.keys(toggles).forEach((id) => {
    const el = document.getElementById(id);
    const target = document.getElementById(toggles[id]);
    if (el && target)
      el.addEventListener("change", (e) => {
        target.style.display = e.target.checked ? "block" : "none";
      });
  });

  const locationSelect = document.getElementById("ship-delivery-location");
  if (locationSelect)
    locationSelect.addEventListener("change", () =>
      window.recalculateShipmentTotal()
    );
});
window.loadAvailableServices = async function () {
  const container = document.getElementById("shipment-services-container");
  if (!container) return;

  try {
    const res = await fetch(
      `${API_BASE_URL}/api/shipments/service-items/available`,
      {
        headers: { Authorization: `Bearer ${window.dashboardToken}` },
      }
    );
    const data = await res.json();

    if (data.success && data.items.length > 0) {
      let html = "";
      data.items.forEach((item) => {
        // 根據不同單位顯示標籤
        const unitMap = { PIECE: "件", WEIGHT: "kg", SHIPMENT: "單" };
        const unitText = unitMap[item.unit] || "件";

        html += `
          <div class="service-option-item" style="margin-bottom: 10px; padding: 8px; border: 1px solid #eee; border-radius: 6px;">
            <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer; margin-bottom: 0;">
              <input type="checkbox" class="svc-checkbox" data-id="${
                item.id
              }" data-name="${item.name}" data-price="${
          item.price
        }" style="margin-top: 4px;">
              <div style="flex: 1;">
                <div style="font-weight: bold; font-size: 14px;">
                  ${
                    item.name
                  } <span style="color: #d32f2f; margin-left: 5px;">$${
          item.price
        } / ${unitText}</span>
                </div>
                ${
                  item.description
                    ? `<div style="font-size: 12px; color: #888;">${item.description}</div>`
                    : ""
                }
                <div class="svc-note-input" style="display: none; margin-top: 5px;">
                  <input type="text" class="form-control form-control-sm svc-note" placeholder="備註 (如：哪件要釘木架)">
                </div>
              </div>
            </label>
          </div>
        `;
      });
      container.innerHTML = html;

      // 綁定連動顯示備註框
      container.querySelectorAll(".svc-checkbox").forEach((cb) => {
        cb.onchange = (e) => {
          const noteInput = e.target
            .closest(".service-option-item")
            .querySelector(".svc-note-input");
          if (noteInput)
            noteInput.style.display = e.target.checked ? "block" : "none";
        };
      });
    } else {
      container.innerHTML = `<div style="color: #999; font-size: 13px;">暫無可用附加服務</div>`;
    }
  } catch (e) {
    container.innerHTML = `<div style="color: red; font-size: 13px;">服務載入失敗</div>`;
  }
};

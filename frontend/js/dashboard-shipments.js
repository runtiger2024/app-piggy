// frontend/js/dashboard-shipments.js
// V2025.V16.1 - 旗艦極限全功能版：保留透明化報表、時間軸與銀行一鍵複製

// --- 1. 更新底部結帳條 ---
window.updateCheckoutBar = function () {
  const bar = document.getElementById("checkout-bar");
  const countEl = document.getElementById("selected-pkg-count");
  const btn = document.getElementById("btn-create-shipment");
  const checkboxes = document.querySelectorAll(".package-checkbox:checked");
  const count = checkboxes.length;

  if (countEl) countEl.textContent = count;
  if (bar) {
    bar.style.display = count > 0 ? "flex" : "none";
    if (btn) {
      btn.disabled = count === 0;
      btn.className = count > 0 ? "btn btn-primary" : "btn btn-secondary";
    }
  }
};

// --- 2. 啟動合併打包 (保留所有填寫邏輯) ---
window.handleCreateShipmentClick = async function () {
  const selected = document.querySelectorAll(".package-checkbox:checked");
  if (selected.length === 0) return;

  // [大師補丁]：開窗前同步一次餘額，防止餘額不同步
  const token = localStorage.getItem("token");
  try {
    const res = await fetch(`${API_BASE_URL}/api/wallet/my`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) window.cachedBalance = data.wallet.balance;
  } catch (e) {}

  const selectedIds = Array.from(selected).map((cb) => cb.dataset.id);
  const selectedPackages = window.allPackagesData.filter((pkg) =>
    selectedIds.includes(pkg.id)
  );

  // 更新 UI 數據
  document.getElementById("checkout-total-count").textContent =
    selectedPackages.length;
  const warningBox = document.getElementById("forklift-warning");
  if (warningBox)
    warningBox.style.display = selectedPackages.some((p) => p.isOverweight)
      ? "block"
      : "none";

  // 自動填充預設收件人
  const userData = JSON.parse(localStorage.getItem("userData") || "{}");
  document.getElementById("ship-name").value = userData.name || "";
  document.getElementById("ship-phone").value = userData.phone || "";
  document.getElementById("ship-street-address").value =
    userData.defaultAddress || "";

  document.getElementById("create-shipment-modal").style.display = "flex";
  window.recalculateShipmentTotal();
};

// --- 3. 詳細費用預算 (保留 100% 透明化報表) ---
window.recalculateShipmentTotal = async function () {
  const breakdownDiv = document.getElementById("api-fee-breakdown");
  const token = localStorage.getItem("token");
  const selected = document.querySelectorAll(".package-checkbox:checked");
  const rate = document.getElementById("ship-delivery-location").value || 0;

  if (!breakdownDiv || selected.length === 0) return;

  breakdownDiv.innerHTML =
    '<div class="text-center p-3"><i class="fas fa-circle-notch fa-spin"></i> 正在試算精確運費...</div>';

  try {
    const res = await fetch(`${API_BASE_URL}/api/shipments/preview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        packageIds: Array.from(selected).map((cb) => cb.dataset.id),
        deliveryLocationRate: parseFloat(rate),
      }),
    });

    const data = await res.json();
    if (data.success && data.preview) {
      window.currentShipmentTotal = data.preview.totalCost;
      // [保留你的詳細渲染邏輯]
      renderBreakdownTable(data.preview.breakdown, breakdownDiv, rate);
      window.togglePaymentMethod(
        document.querySelector('input[name="paymentMethod"]:checked')?.value
      );
    }
  } catch (e) {
    breakdownDiv.innerHTML = '<div class="alert alert-danger">試算失敗</div>';
  }
};

// [保留] 你的詳細渲染函式 renderBreakdownTable
function renderBreakdownTable(breakdown, container, rate) {
  let html = `<div style="font-size: 13px; border: 1px solid #eee; border-radius: 4px; overflow: hidden; background: #fff;">
      <table style="width: 100%; border-collapse: collapse;">
        <thead style="background: #f1f3f5; color: #495057;">
          <tr><th style="padding: 8px; text-align: left;">包裹 / 規格</th><th style="padding: 8px; text-align: center;">計費</th><th style="padding: 8px; text-align: right;">金額</th></tr>
        </thead><tbody>`;

  breakdown.packages.forEach((pkg) => {
    html += `<tr style="border-bottom: 1px solid #f8f9fa;">
        <td style="padding: 8px;">
          <div style="font-weight: bold;">${pkg.trackingNumber}</div>
          <div style="color: #888; font-size: 11px;">${pkg.dims} | ${
      pkg.cai
    } 材 | ${pkg.weight}</div>
        </td>
        <td style="padding: 8px; text-align: center;"><span class="badge badge-secondary">${
          pkg.calcMethod
        }</span></td>
        <td style="padding: 8px; text-align: right; font-family: monospace;">$${pkg.rawFee.toLocaleString()}</td>
      </tr>`;
  });

  html += `</tbody></table></div>
    <div style="margin-top: 10px; text-align: right;">
        <div style="font-size: 12px; color: #666;">小計: $${breakdown.subtotal.toLocaleString()}</div>
        ${
          breakdown.minChargeDiff > 0
            ? `<div style="font-size: 12px; color: #e67e22;">低消補足: +$${breakdown.minChargeDiff}</div>`
            : ""
        }
        ${breakdown.surcharges
          .filter((s) => s.name !== "低消補足")
          .map(
            (s) =>
              `<div style="font-size:12px; color:red;">${s.name}: +$${s.amount}</div>`
          )
          .join("")}
        <div style="font-size: 20px; font-weight: bold; color: #2e7d32; margin-top:5px;">總計: $${breakdown.finalTotal.toLocaleString()}</div>
    </div>`;
  container.innerHTML = html;
}

// --- 5. 提交訂單 (保留銀行資訊彈窗邏輯) ---
window.handleCreateShipmentSubmit = async function (e) {
  e.preventDefault();
  const btn = e.target.querySelector(".btn-place-order");
  const token = localStorage.getItem("token");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "提交中...";
  }

  const selected = document.querySelectorAll(".package-checkbox:checked");
  const fd = new FormData(e.target);
  fd.set(
    "packageIds",
    JSON.stringify(Array.from(selected).map((cb) => cb.dataset.id))
  );

  try {
    const res = await fetch(`${API_BASE_URL}/api/shipments/create`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });

    if (res.ok) {
      const data = await res.json();
      document.getElementById("create-shipment-modal").style.display = "none";

      if (fd.get("paymentMethod") === "TRANSFER") {
        // [保留] 開啟銀行資訊 Modal 並填入資料
        setTimeout(() => {
          const bankModal = document.getElementById("bank-info-modal");
          if (bankModal && window.BANK_INFO_CACHE) {
            document.getElementById("bank-name-display").textContent =
              window.BANK_INFO_CACHE.bankName;
            document.getElementById("bank-account-display").textContent =
              window.BANK_INFO_CACHE.account;
            document.getElementById("bank-holder-display").textContent =
              window.BANK_INFO_CACHE.holder;
            bankModal.style.display = "flex";
          }
        }, 100);
      } else {
        alert("錢包支付成功！訂單已建立。");
      }
      window.loadMyShipments();
      window.loadMyPackages();
    } else {
      const error = await res.json();
      alert(error.message || "建立失敗");
    }
  } catch (e) {
    alert("網路通訊錯誤");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "提交訂單";
    }
  }
};

// --- 載入與詳情 (保留時間軸與列表) ---
window.loadMyShipments = async function () {
  const tbody = document.getElementById("shipments-table-body");
  const token = localStorage.getItem("token");
  if (!tbody || !token) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/shipments/my`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.shipments) {
      tbody.innerHTML = data.shipments
        .map(
          (s) => `
            <tr>
                <td><strong>${s.id
                  .slice(-8)
                  .toUpperCase()}</strong><br><small>${new Date(
            s.createdAt
          ).toLocaleDateString()}</small></td>
                <td><span class="status-badge ${
                  window.STATUS_CLASSES[s.status] || ""
                }">${
            window.SHIPMENT_STATUS_MAP[s.status] || s.status
          }</span></td>
                <td>${s.recipientName}<br><small>${
            s.packages.length
          } 件</small></td>
                <td style="color:#d32f2f; font-weight:bold;">$${(
                  s.totalCost || 0
                ).toLocaleString()}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="window.openShipmentDetails('${
                      s.id
                    }')">詳情</button>
                    ${
                      s.status === "PENDING_PAYMENT" && !s.paymentProof
                        ? `<button class="btn btn-sm btn-danger" onclick="window.cancelShipment('${s.id}')">取消</button>`
                        : ""
                    }
                </td>
            </tr>`
        )
        .join("");
    }
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="5">載入失敗</td></tr>';
  }
};

// [保留] 時間軸渲染函式 renderTimeline
function renderTimeline(container, currentStatus) {
  const steps = [
    { code: "PENDING_PAYMENT", label: "待付款" },
    { code: "PROCESSING", label: "處理中" },
    { code: "SHIPPED", label: "已裝櫃" },
    { code: "CUSTOMS_CHECK", label: "海關查驗" },
    { code: "UNSTUFFING", label: "拆櫃派送" },
    { code: "COMPLETED", label: "已完成" },
  ];
  let currentIndex = steps.findIndex((s) => s.code === currentStatus);
  if (currentIndex === -1) currentIndex = 0;

  let html = `<div class="timeline-container" style="display:flex; justify-content:space-between; position:relative; padding:20px 10px;">`;
  html += `<div style="position:absolute; top:35px; left:30px; right:30px; height:4px; background:#eee;"></div>`;
  const percent = (currentIndex / (steps.length - 1)) * 100;
  html += `<div style="position:absolute; top:35px; left:30px; width:calc(${percent}% - 60px); height:4px; background:#28a745;"></div>`;

  steps.forEach((step, idx) => {
    const isDone = idx <= currentIndex;
    html += `
        <div style="z-index:1; text-align:center; flex:1;">
            <i class="fas fa-check-circle" style="color:${
              isDone ? "#28a745" : "#ccc"
            }; font-size:24px; background:#fff;"></i>
            <div style="font-size:11px; margin-top:5px; color:${
              isDone ? "#333" : "#999"
            };">${step.label}</div>
        </div>`;
  });
  container.innerHTML = html + "</div>";
}

// [保留] 一鍵複製邏輯
window.copyText = function (elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  navigator.clipboard.writeText(el.innerText.trim()).then(() => {
    const btn = event.target;
    const old = btn.innerText;
    btn.innerText = "已複製!";
    setTimeout(() => {
      btn.innerText = old;
    }, 2000);
  });
};

document.addEventListener("DOMContentLoaded", () => {
  const locSelect = document.getElementById("ship-delivery-location");
  if (locSelect)
    locSelect.addEventListener("change", () =>
      window.recalculateShipmentTotal()
    );

  const sForm = document.getElementById("create-shipment-form");
  if (sForm)
    sForm.addEventListener("submit", window.handleCreateShipmentSubmit);
});

// frontend/js/dashboard-furniture.js
// V2026.1.6 - 新增圖片預覽縮圖功能與 FormData 提交邏輯

(function () {
  let procurementConfig = {
    exchangeRate: 4.65,
    serviceFeeRate: 0.05,
    minServiceFee: 500,
  };
  let cachedOrders = [];

  async function initFurniturePage() {
    await fetchProcurementConfig();
    try {
      if (typeof window.loadUserProfile === "function")
        await window.loadUserProfile();
    } catch (err) {
      console.warn("用戶資料載入失敗:", err);
    }
    await loadFurnitureHistory();

    const inputs = ["priceRMB", "quantity"];
    inputs.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("input", calculateTotal);
        el.addEventListener("change", (e) => {
          if (parseFloat(e.target.value) < 0) e.target.value = 0;
        });
      }
    });

    // [新增] 圖片上傳監聽
    const fileInput = document.getElementById("furniture-ref-image");
    if (fileInput) {
      fileInput.addEventListener("change", handleFileSelect);
    }

    const form = document.getElementById("furniture-form");
    if (form) form.addEventListener("submit", handleFormSubmit);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFurniturePage);
  } else {
    initFurniturePage();
  }

  /**
   * [新增功能] 處理檔案選取與預覽顯示
   */
  function handleFileSelect(e) {
    const file = e.target.files[0];
    const previewContainer = document.getElementById("image-preview-container");
    const previewImg = document.getElementById("preview-img-element");
    const uploadLabel = document.getElementById("upload-label-box");

    if (file) {
      // 檢查是否為圖片
      if (!file.type.startsWith("image/")) {
        alert("請上傳圖片格式檔案");
        return;
      }

      const reader = new FileReader();
      reader.onload = function (event) {
        previewImg.src = event.target.result;
        previewContainer.style.display = "block";
        uploadLabel.style.display = "none"; // 隱藏原本的上傳按鈕
      };
      reader.readAsDataURL(file);
    }
  }

  /**
   * [新增功能] 清除預覽縮圖
   */
  window.clearPreviewImage = function () {
    const fileInput = document.getElementById("furniture-ref-image");
    const previewContainer = document.getElementById("image-preview-container");
    const uploadLabel = document.getElementById("upload-label-box");

    fileInput.value = ""; // 清空檔案
    previewContainer.style.display = "none";
    uploadLabel.style.display = "flex";
  };

  async function fetchProcurementConfig() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/calculator/config`);
      const data = await res.json();
      if (data.success && data.rates && data.rates.procurement) {
        const config = data.rates.procurement;
        procurementConfig.exchangeRate =
          parseFloat(config.exchangeRate) || 4.65;
        procurementConfig.serviceFeeRate =
          parseFloat(config.serviceFeeRate) || 0.05;
        procurementConfig.minServiceFee =
          parseFloat(config.minServiceFee) || 500;
        updateRateDisplay();
      }
    } catch (error) {
      console.error("載入設定失敗:", error);
    }
  }

  function updateRateDisplay() {
    const displayEl = document.getElementById("procurement-rate-display");
    if (displayEl) {
      const minFeeHtml =
        procurementConfig.minServiceFee > 0
          ? `<span class="rate-item-min"> | 最低服務費：<b class="text-primary">NT$ ${procurementConfig.minServiceFee}</b></span>`
          : "";
      displayEl.innerHTML = `
        <i class="fas fa-info-circle"></i> 
        <span class="rate-item">當前匯率：<b>${
          procurementConfig.exchangeRate
        }</b></span>
        <span class="rate-sep">|</span>
        <span class="rate-item">服務費率：<b>${(
          procurementConfig.serviceFeeRate * 100
        ).toFixed(1)}%</b></span>
        ${minFeeHtml}
      `;
    }
  }

  function calculateTotal() {
    const price = parseFloat(document.getElementById("priceRMB").value) || 0;
    const qty = parseInt(document.getElementById("quantity").value) || 0;
    const subtotalRMB = price * qty;
    const subtotalTWD = subtotalRMB * procurementConfig.exchangeRate;
    const rawServiceFeeTWD = subtotalTWD * procurementConfig.serviceFeeRate;
    const finalServiceFeeTWD = Math.max(
      rawServiceFeeTWD,
      procurementConfig.minServiceFee
    );
    const totalTWD = Math.ceil(subtotalTWD + finalServiceFeeTWD);

    const subtotalDisplay = document.getElementById("display-subtotal-rmb");
    if (subtotalDisplay)
      subtotalDisplay.textContent = `¥ ${subtotalRMB.toLocaleString(undefined, {
        minimumFractionDigits: 2,
      })}`;

    const feeDisplay = document.getElementById("display-service-fee");
    if (feeDisplay) {
      if (
        subtotalRMB > 0 &&
        rawServiceFeeTWD < procurementConfig.minServiceFee
      ) {
        feeDisplay.innerHTML = `<span class="text-danger">NT$ ${procurementConfig.minServiceFee} (低消)</span>`;
      } else {
        const serviceFeeRMB =
          finalServiceFeeTWD / procurementConfig.exchangeRate;
        feeDisplay.textContent = `¥ ${serviceFeeRMB.toFixed(2)}`;
      }
    }
    const totalDisplay = document.getElementById("display-total-twd");
    if (totalDisplay)
      totalDisplay.textContent = `$ ${totalTWD.toLocaleString()}`;
  }

  /**
   * [修改功能] 升級為支援檔案上傳的 FormData 模式
   */
  async function handleFormSubmit(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalBtnHtml = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 提交中...';

    // 改用 FormData
    const formData = new FormData();
    formData.append(
      "factoryName",
      document.getElementById("factoryName").value.trim()
    );
    formData.append(
      "productName",
      document.getElementById("productName").value.trim()
    );
    formData.append(
      "quantity",
      parseInt(document.getElementById("quantity").value)
    );
    formData.append(
      "priceRMB",
      parseFloat(document.getElementById("priceRMB").value)
    );
    formData.append("note", document.getElementById("note").value.trim());

    const fileInput = document.getElementById("furniture-ref-image");
    if (fileInput.files[0]) {
      formData.append("refImage", fileInput.files[0]); // 加入檔案
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/furniture/apply`, {
        method: "POST",
        headers: {
          // 注意：FormData 提交時不需設定 Content-Type，由瀏覽器自動處理 boundary
          Authorization: `Bearer ${
            localStorage.getItem("token") || window.dashboardToken
          }`,
        },
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        showSubmissionSuccessModal();
        document.getElementById("furniture-form").reset();
        clearPreviewImage(); // 重設圖片預覽
        calculateTotal();
        await loadFurnitureHistory();
      } else {
        if (window.showMessage)
          window.showMessage(data.message || "提交失敗", "error");
      }
    } catch (error) {
      if (window.showMessage) window.showMessage("網路連線錯誤", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
    }
  }

  function showSubmissionSuccessModal() {
    const oldModal = document.getElementById("procurement-success-modal");
    if (oldModal) oldModal.remove();
    const modalHtml = `
      <div id="procurement-success-modal" class="modal-overlay" style="display: flex; z-index: 10000; background: rgba(0,0,0,0.6);">
        <div class="modal-content animate-pop-in" style="max-width: 420px; text-align: center; padding: 40px 30px; border-radius: 20px;">
          <div style="font-size: 64px; color: #52c41a; margin-bottom: 24px;"><i class="fas fa-check-circle"></i></div>
          <h2 style="margin-bottom: 16px; color: var(--p-primary); font-weight: 800;">申請提交成功！</h2>
          <p style="color: var(--text-main); line-height: 1.8; margin-bottom: 24px; font-size: 1.05rem;">
            已收到您的申請紀錄。<br><strong>請立即聯繫官方客服 (LINE/微信)</strong>，<br>
            提供您的<strong>姓名</strong>與<strong>商品名稱</strong>進行核對。
          </p>
          <button class="btn btn-primary btn-full" style="height: 50px; font-weight: 700;" onclick="document.getElementById('procurement-success-modal').remove()">我知道了</button>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML("beforeend", modalHtml);
  }

  async function loadFurnitureHistory() {
    const tbody = document.getElementById("furniture-history-body");
    if (!tbody) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/furniture/my`, {
        headers: {
          Authorization: `Bearer ${
            localStorage.getItem("token") || window.dashboardToken
          }`,
        },
      });
      const data = await res.json();
      if (data.success && data.orders) {
        cachedOrders = data.orders;
        tbody.innerHTML = data.orders
          .map((order) => {
            const totalRMB = (order.priceRMB * order.quantity).toFixed(2);
            return `
            <tr>
              <td data-label="申請日期">${new Date(
                order.createdAt
              ).toLocaleDateString()}</td>
              <td data-label="項目"><b>${order.factoryName}</b> / ${
              order.productName
            }</td>
              <td data-label="金額 (RMB)">¥ ${totalRMB}</td>
              <td data-label="狀態"><span class="status-badge status-${order.status.toLowerCase()}">${getStatusText(
              order.status
            )}</span></td>
              <td data-label="操作" class="text-center">
                <button class="btn btn-sm btn-outline-info" onclick="viewOrderDetail('${
                  order.id
                }')">
                  <i class="fas fa-search-plus"></i> 詳情
                </button>
              </td>
            </tr>
          `;
          })
          .join("");
      } else {
        tbody.innerHTML =
          '<tr><td colspan="5" class="text-center py-5">目前尚無代採購紀錄</td></tr>';
      }
    } catch (error) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-center text-danger py-5">資料同步失敗</td></tr>';
    }
  }

  function getStatusText(status) {
    const map = {
      PENDING: "待審核",
      APPROVED: "已核准",
      PAID: "已支付",
      CANCELLED: "已取消",
      COMPLETED: "已完成",
      SHIPPED: "已發貨",
    };
    return map[status.toUpperCase()] || status;
  }

  /**
   * [詳情彈窗功能] 強化：顯示用戶上傳的參考圖片
   */
  window.viewOrderDetail = function (id) {
    const order = cachedOrders.find((o) => o.id === id);
    if (!order) return;

    const subtotalRMB = (order.priceRMB * order.quantity).toFixed(2);
    const serviceFeeRMB = (order.serviceFeeRMB || 0).toFixed(2);

    // 建立詳情彈窗
    const detailModalHtml = `
      <div id="order-detail-modal" class="modal-overlay" style="display: flex; z-index: 10001; background: rgba(0,0,0,0.7);">
        <div class="modal-content animate-pop-in" style="max-width: 500px; width: 90%; padding: 0; border-radius: 16px; overflow: hidden;">
          <div style="background: var(--p-primary); color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin:0; font-size: 1.2rem;"><i class="fas fa-file-invoice"></i> 申請單詳情</h3>
            <button onclick="document.getElementById('order-detail-modal').remove()" style="background:none; border:none; color:white; font-size:24px; cursor:pointer;">&times;</button>
          </div>
          <div style="padding: 25px; max-height: 70vh; overflow-y: auto;">
            <div class="detail-group" style="margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 15px;">
              <div style="display:flex; justify-content: space-between; margin-bottom:10px;">
                <span style="color:#666;">流水編號:</span>
                <span style="font-family:monospace; font-weight:700;">${order.id
                  .slice(-8)
                  .toUpperCase()}</span>
              </div>
              <div style="display:flex; justify-content: space-between;">
                <span style="color:#666;">申請時間:</span>
                <span>${new Date(order.createdAt).toLocaleString()}</span>
              </div>
            </div>

            <div style="background: #f9f9f9; border-radius: 10px; padding: 15px; margin-bottom: 20px;">
              <h4 style="margin: 0 0 10px 0; color: var(--p-primary);"><i class="fas fa-couch"></i> 商品資訊</h4>
              <p style="margin: 5px 0;"><strong>工廠：</strong>${
                order.factoryName
              }</p>
              <p style="margin: 5px 0;"><strong>品名：</strong>${
                order.productName
              }</p>
              <p style="margin: 5px 0;"><strong>單價：</strong>¥ ${
                order.priceRMB
              } x ${order.quantity} 件</p>
              
              ${
                order.refImageUrl
                  ? `
              <div style="margin-top:12px;">
                <span style="color:#666; font-size:0.85rem;">參考截圖:</span>
                <div style="margin-top:5px; border-radius:8px; border:1px solid #ddd; overflow:hidden;">
                    <img src="${order.refImageUrl}" style="width:100%; display:block; cursor:zoom-in;" onclick="window.open(this.src)">
                </div>
              </div>
              `
                  : ""
              }
            </div>

            <div style="margin-bottom: 20px;">
              <h4 style="margin: 0 0 10px 0; color: var(--p-primary);"><i class="fas fa-calculator"></i> 費用明細</h4>
              <div style="display:flex; justify-content: space-between; margin-bottom:8px;">
                <span>商品貨值 (RMB)</span>
                <span>¥ ${subtotalRMB}</span>
              </div>
              <div style="display:flex; justify-content: space-between; margin-bottom:8px;">
                <span>代付服務費 (RMB)</span>
                <span>¥ ${serviceFeeRMB}</span>
              </div>
              <div style="display:flex; justify-content: space-between; margin-bottom:8px; padding-top:8px; border-top: 1px dashed #ddd;">
                <span>計算匯率</span>
                <span>${
                  order.exchangeRate || procurementConfig.exchangeRate
                }</span>
              </div>
              <div style="display:flex; justify-content: space-between; margin-top:10px; font-size: 1.2rem; font-weight: 800; color: var(--p-danger);">
                <span>應付總額 (TWD)</span>
                <span>$ ${
                  order.totalAmountTWD
                    ? order.totalAmountTWD.toLocaleString()
                    : "核算中"
                }</span>
              </div>
            </div>

            <div style="margin-bottom: 20px;">
              <h4 style="margin: 0 0 5px 0; color: var(--p-primary);"><i class="fas fa-sticky-note"></i> 我的備註</h4>
              <p style="background: #fffbe6; padding: 10px; border-radius: 6px; font-size: 0.9rem; color: #856404; border: 1px solid #ffe58f;">
                ${order.note || "無特別備註"}
              </p>
            </div>

            ${
              order.adminRemark
                ? `
              <div style="margin-bottom: 10px;">
                <h4 style="margin: 0 0 5px 0; color: #52c41a;"><i class="fas fa-user-shield"></i> 管理員回覆</h4>
                <p style="background: #f6ffed; padding: 10px; border-radius: 6px; font-size: 0.9rem; color: #237804; border: 1px solid #b7eb8f;">
                  ${order.adminRemark}
                </p>
              </div>
            `
                : ""
            }
          </div>
          <div style="padding: 20px; background: #f4f7f9; text-align: center;">
            <button class="btn btn-primary" style="width: 100%;" onclick="document.getElementById('order-detail-modal').remove()">關閉視窗</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML("beforeend", detailModalHtml);
  };

  window.refreshFurnitureCalc = calculateTotal;
})();

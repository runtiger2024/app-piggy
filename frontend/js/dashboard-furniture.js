// frontend/js/dashboard-furniture.js
// V2026.1.1 - 修正 Prettier 語法錯誤、API 路徑同步與精確計算邏輯

(function () {
  // 核心設定變數 (由 API 載入)
  let procurementConfig = {
    exchangeRate: 4.65,
    serviceFeeRate: 0.05,
    minServiceFee: 500, // 預設 500 TWD
  };

  /**
   * 頁面初始化邏輯
   * 修正說明：將費率獲取移至最優先，避免被其他請求阻塞；增加 try-catch 保護。
   */
  async function initFurniturePage() {
    console.log("傢俱代採購頁面初始化開始...");

    // 1. 從計算機配置中取得最新的匯率與代採購設定 (優先執行)
    await fetchProcurementConfig();

    // 2. 嘗試加載用戶資料 (增加 try-catch 防止失敗時導致後續邏輯中斷)
    try {
      if (typeof window.loadUserProfile === "function") {
        await window.loadUserProfile();
      }
    } catch (err) {
      console.warn("用戶資料載入失敗，但不影響功能:", err);
    }

    // 3. 載入個人的申請紀錄
    await loadFurnitureHistory();

    // 4. 綁定輸入即時計算功能
    const inputs = ["priceRMB", "quantity"];
    inputs.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("input", calculateTotal);
        // 防止負數輸入
        el.addEventListener("change", (e) => {
          if (parseFloat(e.target.value) < 0) e.target.value = 0;
        });
      }
    });

    // 5. 綁定表單提交
    const form = document.getElementById("furniture-form");
    if (form) {
      form.addEventListener("submit", handleFormSubmit);
    }
  }

  // --- 關鍵修正：解決 Race Condition ---
  // 確保腳本加載時如果 DOMContentLoaded 已觸發，仍能執行初始化
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFurniturePage);
  } else {
    initFurniturePage();
  }

  /**
   * 從後端 API 獲取最新的代採購參數
   */
  async function fetchProcurementConfig() {
    try {
      // 調用 calculator 控制器提供的公開配置介面
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

        // 更新 UI 上的費率顯示
        const displayEl = document.getElementById("procurement-rate-display");
        if (displayEl) {
          const minFeeHtml =
            procurementConfig.minServiceFee > 0
              ? ` | 最低服務費：<b class="text-primary">NT$ ${procurementConfig.minServiceFee}</b>`
              : "";
          displayEl.innerHTML = `
            <i class="fas fa-info-circle"></i> 
            當前匯率：<b>${procurementConfig.exchangeRate}</b> | 
            服務費率：<b>${(procurementConfig.serviceFeeRate * 100).toFixed(
              1
            )}%</b>${minFeeHtml}
          `;
        }
      }
    } catch (error) {
      console.error("無法載入代採購設定:", error);
      if (window.showMessage)
        window.showMessage("費率載入失敗，將使用預設值", "error");
    }
  }

  /**
   * 即時試算邏輯 (同步後端計算公式)
   */
  function calculateTotal() {
    const price = parseFloat(document.getElementById("priceRMB").value) || 0;
    const qty = parseInt(document.getElementById("quantity").value) || 0;

    // 1. 人民幣貨值
    const subtotalRMB = price * qty;

    // 2. 貨值轉台幣
    const subtotalTWD = subtotalRMB * procurementConfig.exchangeRate;

    // 3. 計算服務費 (台幣)
    const rawServiceFeeTWD = subtotalTWD * procurementConfig.serviceFeeRate;

    // 4. [關鍵邏輯] 判定是否低於最低服務費
    const finalServiceFeeTWD = Math.max(
      rawServiceFeeTWD,
      procurementConfig.minServiceFee
    );

    // 5. 總計 (貨值TWD + 最終服務費TWD)，採無條件進位
    const totalTWD = Math.ceil(subtotalTWD + finalServiceFeeTWD);

    // --- 更新 UI 顯示 ---

    // 顯示人民幣貨值
    const subtotalDisplay = document.getElementById("display-subtotal-rmb");
    if (subtotalDisplay) {
      subtotalDisplay.textContent = `¥ ${subtotalRMB.toLocaleString(undefined, {
        minimumFractionDigits: 2,
      })}`;
    }

    // 顯示服務費 (若觸發低消則變色)
    const feeDisplay = document.getElementById("display-service-fee");
    if (feeDisplay) {
      if (
        subtotalRMB > 0 &&
        rawServiceFeeTWD < procurementConfig.minServiceFee
      ) {
        feeDisplay.innerHTML = `<span class="text-danger" title="低於最低服務費，依低消計算">NT$ ${procurementConfig.minServiceFee} (低消)</span>`;
      } else {
        const serviceFeeRMB =
          finalServiceFeeTWD / procurementConfig.exchangeRate;
        feeDisplay.textContent = `¥ ${serviceFeeRMB.toFixed(2)}`;
      }
    }

    // 顯示最終應付台幣
    const totalDisplay = document.getElementById("display-total-twd");
    if (totalDisplay) {
      totalDisplay.textContent = `$ ${totalTWD.toLocaleString()}`;
    }
  }

  /**
   * 處理表單提交
   */
  async function handleFormSubmit(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalBtnHtml = submitBtn.innerHTML;

    // 防止重複提交
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 提交中...';

    const formData = {
      factoryName: document.getElementById("factoryName").value.trim(),
      productName: document.getElementById("productName").value.trim(),
      quantity: parseInt(document.getElementById("quantity").value),
      priceRMB: parseFloat(document.getElementById("priceRMB").value),
      note: document.getElementById("note").value.trim(),
    };

    // 基本驗證
    if (
      !formData.factoryName ||
      !formData.productName ||
      formData.quantity <= 0 ||
      formData.priceRMB <= 0
    ) {
      if (window.showMessage)
        window.showMessage("請填寫正確的代採購資訊", "warning");
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
      return;
    }

    try {
      // API 路徑與後端 furnitureController 保持一致
      const res = await fetch(`${API_BASE_URL}/api/furniture/apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${
            localStorage.getItem("token") || window.dashboardToken
          }`,
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (data.success) {
        if (window.showMessage)
          window.showMessage("代採購申請提交成功！", "success");
        document.getElementById("furniture-form").reset();
        calculateTotal(); // 重設顯示金額
        await loadFurnitureHistory(); // 刷新列表
      } else {
        if (window.showMessage)
          window.showMessage(data.message || "提交失敗", "error");
      }
    } catch (error) {
      console.error("提交訂單失敗:", error);
      if (window.showMessage)
        window.showMessage("網路連線錯誤，請稍後再試", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
    }
  }

  /**
   * 載入歷史申請紀錄
   */
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

      if (data.success && data.orders && data.orders.length > 0) {
        tbody.innerHTML = data.orders
          .map((order) => {
            const totalRMB = (order.priceRMB * order.quantity).toFixed(2);
            return `
              <tr>
                <td>${new Date(order.createdAt).toLocaleDateString()}</td>
                <td>${order.factoryName}</td>
                <td class="text-truncate" style="max-width: 150px;">${
                  order.productName
                }</td>
                <td>¥ ${totalRMB}</td>
                <td>
                  <span class="status-badge status-${order.status.toLowerCase()}">
                    ${getStatusText(order.status)}
                  </span>
                </td>
                <td>
                  <button class="btn btn-sm btn-outline-info" onclick="viewOrderDetail('${
                    order.id
                  }')">
                    <i class="fas fa-eye"></i> 詳情
                  </button>
                </td>
              </tr>
            `;
          })
          .join("");
      } else {
        tbody.innerHTML =
          '<tr><td colspan="6" class="text-center py-4">目前尚無代採購紀錄</td></tr>';
      }
    } catch (error) {
      console.error("載入歷史紀錄失敗:", error);
      tbody.innerHTML =
        '<tr><td colspan="6" class="text-center text-danger py-4">資料載入失敗</td></tr>';
    }
  }

  /**
   * 狀態中文對照
   */
  function getStatusText(status) {
    const s = status ? status.toUpperCase() : "";
    const map = {
      PENDING: "待審核",
      APPROVED: "已核准",
      PAID: "已支付",
      CANCELLED: "已取消",
      COMPLETED: "已完成",
      SHIPPED: "已發貨",
    };
    return map[s] || status;
  }

  // 全域函數綁定
  window.viewOrderDetail = function (id) {
    console.log("查看訂單詳情 ID:", id);
    if (window.showMessage)
      window.showMessage("詳情功能開發中 (ID: " + id + ")", "info");
  };

  window.refreshFurnitureCalc = calculateTotal;
})();

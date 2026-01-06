// frontend/js/quote.js (V23.0 - 旗艦精鍊版)

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const quoteId = params.get("id");
  const container = document.getElementById("results-container");
  const loading = document.getElementById("loading-spinner");
  const errorBox = document.getElementById("error-message");

  // 靜態規則備份 (若後端未回傳 rules 時的備案)
  const DEFAULT_RULES = {
    VOLUME_DIVISOR: 28317,
    CBM_TO_CAI_FACTOR: 35.3,
    MINIMUM_CHARGE: 2000,
    OVERSIZED_LIMIT: 300,
    OVERSIZED_FEE: 800,
    OVERWEIGHT_LIMIT: 100,
    OVERWEIGHT_FEE: 800,
  };

  if (!quoteId) {
    if (loading) loading.style.display = "none";
    if (errorBox) {
      errorBox.textContent = "無效的連結";
      errorBox.style.display = "block";
    }
    return;
  }

  // 執行 API 獲取資料
  fetch(`${API_BASE_URL}/api/quotes/${quoteId}`)
    .then((res) => res.json())
    .then((data) => {
      if (loading) loading.style.display = "none";
      if (data.error) throw new Error(data.error);

      // 渲染精鍊後的詳細視圖
      renderQuoteView(data, DEFAULT_RULES, data.createdAt);

      if (container) {
        container.style.display = "block";
        // 增加進入動畫效果
        container.style.opacity = "0";
        setTimeout(() => {
          container.style.transition = "opacity 0.5s ease";
          container.style.opacity = "1";
        }, 50);
      }
    })
    .catch((err) => {
      if (loading) loading.style.display = "none";
      if (errorBox) {
        errorBox.textContent = err.message;
        errorBox.style.display = "block";
      }
    });
});

/**
 * 核心渲染函數：建構數據內容 (不包含重複的 HTML 靜態按鈕與頁尾)
 */
function renderQuoteView(data, defaultRules, date) {
  const container = document.getElementById("results-container");
  if (!container) return;

  const result = data.calculationResult;
  // 優先使用 rulesApplied，若無則回退到 defaultRules
  let rules = result.rulesApplied || defaultRules;

  // 常數防呆
  const constants = {
    VOLUME_DIVISOR: rules.VOLUME_DIVISOR || defaultRules.VOLUME_DIVISOR,
    CBM_TO_CAI_FACTOR:
      rules.CBM_TO_CAI_FACTOR || defaultRules.CBM_TO_CAI_FACTOR,
    MINIMUM_CHARGE: rules.MINIMUM_CHARGE || defaultRules.MINIMUM_CHARGE,
    OVERSIZED_LIMIT: rules.OVERSIZED_LIMIT || defaultRules.OVERSIZED_LIMIT,
    OVERWEIGHT_LIMIT: rules.OVERWEIGHT_LIMIT || defaultRules.OVERWEIGHT_LIMIT,
  };

  // 1. 動態資訊條：顯示編號與日期
  let html = `
    <div class="quote-info-bar" style="display: flex; justify-content: space-between; padding: 15px 20px; background: #f8f9fa; border-radius: 10px; margin-bottom: 25px; border: 1px solid #eee; font-size: 14px; color: #555;">
        <div class="info-item"><i class="fas fa-hashtag"></i> <strong>估價編號：</strong>#${
          data.id ? data.id.slice(-8).toUpperCase() : "ONLINE-QUOT"
        }</div>
        <div class="info-item"><i class="far fa-calendar-alt"></i> <strong>建立日期：</strong>${new Date(
          date
        ).toLocaleDateString()} ${new Date(date).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}</div>
    </div>
  `;

  // 2. 商品明細清單
  result.allItemsData.forEach((item, index) => {
    const isVolWin = item.itemVolumeCost >= item.itemWeightCost;
    const volRate = item.rateInfo ? item.rateInfo.volumeRate : 0;
    const wtRate = item.rateInfo ? item.rateInfo.weightRate : 0;

    const formulaDesc =
      item.calcMethod === "dimensions"
        ? `(${item.length}x${item.width}x${item.height}) ÷ ${constants.VOLUME_DIVISOR}`
        : `${item.cbm} x ${constants.CBM_TO_CAI_FACTOR}`;

    html += `
      <div class="result-detail-card" style="background: white; border: 1px solid #eef0f2; border-radius: 12px; margin-bottom: 20px; padding: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.02);">
        <div class="detail-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f0f0f0; padding-bottom: 12px; margin-bottom: 15px;">
            <h3 style="margin: 0; font-size: 18px; color: #333;"><i class="fas fa-box" style="color: #ff6b01; margin-right: 8px;"></i> 第 ${
              index + 1
            } 項：${item.name}</h3>
            <span style="background: #fff5ed; color: #ff6b01; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: bold; border: 1px solid #ffe8d6;">數量: ${
              item.quantity
            } 件</span>
        </div>
        
        <div class="specs-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 15px;">
            <div style="font-size: 13px; color: #666;"><i class="fas fa-ruler-combined" style="width: 18px;"></i> 單件規格: <b>${
              item.length
            }x${item.width}x${item.height} cm</b></div>
            <div style="font-size: 13px; color: #666;"><i class="fas fa-weight-hanging" style="width: 18px;"></i> 單件實重: <b>${
              item.singleWeight
            } kg</b></div>
            <div style="font-size: 13px; color: #666; grid-column: span 2;"><i class="fas fa-calculator" style="width: 18px;"></i> 材積換算: <span style="color: #0056b3; font-family: monospace; background: #f0f7ff; padding: 2px 6px; border-radius: 4px;">${formulaDesc} = <b>${
      item.singleVolume
    } 材</b></span></div>
        </div>

        <div class="comparison-box" style="background: #fafafa; padding: 15px; border-radius: 8px; border-left: 4px solid ${
          isVolWin ? "#fa8c16" : "#2f54eb"
        };">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; align-items: center; opacity: ${
              isVolWin ? "1" : "0.6"
            }">
                <span style="font-size: 13px;">材積計費 <small>(總 ${item.totalVolume.toFixed(
                  1
                )}材 x $${volRate})</small></span>
                <span style="font-weight: bold;">$${item.itemVolumeCost.toLocaleString()} ${
      isVolWin
        ? '<i class="fas fa-check-circle" style="color:#fa8c16; margin-left:5px;"></i>'
        : ""
    }</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; opacity: ${
              !isVolWin ? "1" : "0.6"
            }">
                <span style="font-size: 13px;">重量計費 <small>(總 ${item.totalWeight.toFixed(
                  1
                )}kg x $${wtRate})</small></span>
                <span style="font-weight: bold;">$${item.itemWeightCost.toLocaleString()} ${
      !isVolWin
        ? '<i class="fas fa-check-circle" style="color:#fa8c16; margin-left:5px;"></i>'
        : ""
    }</span>
            </div>
        </div>

        <div style="text-align: right; margin-top: 12px; font-weight: bold; color: #0056b3; font-size: 16px;">
            項目小計: $${item.itemFinalCost.toLocaleString()}
        </div>

        ${
          item.hasOversizedItem
            ? `<div style="margin-top:10px; padding: 8px; background: #fff1f0; border: 1px solid #ffa39e; color: #cf1322; border-radius: 6px; font-size: 12px; font-weight: bold;"><i class="fas fa-exclamation-triangle"></i> 此商品尺寸超長 (≥ ${constants.OVERSIZED_LIMIT}cm)</div>`
            : ""
        }
        ${
          item.isOverweight
            ? `<div style="margin-top:10px; padding: 8px; background: #fff1f0; border: 1px solid #ffa39e; color: #cf1322; border-radius: 6px; font-size: 12px; font-weight: bold;"><i class="fas fa-exclamation-triangle"></i> 此商品單件超重 (≥ ${constants.OVERWEIGHT_LIMIT}kg)</div>`
            : ""
        }
      </div>
    `;
  });

  // 3. 費用摘要總結 (僅呈現數據，不包含重複的操作按鈕)
  const isMinChargeApplied =
    result.finalSeaFreightCost > result.initialSeaFreightCost;
  const minChargeGap =
    result.finalSeaFreightCost - result.initialSeaFreightCost;

  html += `
    <div class="result-summary-card" style="background: #2c3e50; color: white; border-radius: 12px; padding: 25px; margin-top: 30px; box-shadow: 0 10px 25px rgba(44, 62, 80, 0.2);">
        <h3 style="margin: 0 0 20px 0; font-size: 20px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px;"><i class="fas fa-file-invoice-dollar" style="margin-right: 10px; color: #ff9f43;"></i> 費用摘要總結</h3>
        
        <div style="display: flex; flex-direction: column; gap: 12px;">
            <div style="display: flex; justify-content: space-between; font-size: 15px;">
                <span style="color: #bdc3c7;">基本運費加總</span>
                <span>$${result.initialSeaFreightCost.toLocaleString()}</span>
            </div>

            ${
              isMinChargeApplied
                ? `
            <div style="display: flex; justify-content: space-between; font-size: 15px; color: #52c41a; background: rgba(82, 196, 26, 0.1); padding: 5px 8px; border-radius: 4px;">
                <span><i class="fas fa-arrow-up"></i> 未達低消補足 <small>($${
                  constants.MINIMUM_CHARGE
                })</small></span>
                <span>+$${minChargeGap.toLocaleString()}</span>
            </div>
            `
                : ""
            }
            
            ${
              result.remoteFee > 0
                ? `
            <div style="display: flex; justify-content: space-between; font-size: 15px;">
                <span style="color: #bdc3c7;">偏遠地區費 <small>(${
                  result.totalCbm
                }方 x $${result.remoteAreaRate})</small></span>
                <span>+$${result.remoteFee.toLocaleString()}</span>
            </div>
            `
                : ""
            }
            
            ${
              result.totalOversizedFee > 0
                ? `
            <div style="display: flex; justify-content: space-between; font-size: 15px; color: #ff9f43;">
                <span><i class="fas fa-arrows-alt-h"></i> 超長附加費</span>
                <span>+$${result.totalOversizedFee.toLocaleString()}</span>
            </div>
            `
                : ""
            }

            ${
              result.totalOverweightFee > 0
                ? `
            <div style="display: flex; justify-content: space-between; font-size: 15px; color: #ff9f43;">
                <span><i class="fas fa-weight"></i> 超重附加費</span>
                <span>+$${result.totalOverweightFee.toLocaleString()}</span>
            </div>
            `
                : ""
            }
        </div>
        
        <div class="summary-total" style="border-top: 2px solid rgba(255,255,255,0.1); margin-top: 20px; padding-top: 20px; text-align: right;">
            <small style="font-size: 14px; color: #bdc3c7; display: block; margin-bottom: 5px;">預估總運費 (新台幣)</small>
            <span style="font-size: 36px; font-weight: 800; color: #ff9f43;">NT$ ${result.finalTotal.toLocaleString()}</span>
        </div>
    </div>
  `;

  container.innerHTML = html;
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

function formatCurrency(amount) {
  return parseFloat(amount).toFixed(2);
}

function formatPercentage(value) {
  return parseFloat(value).toFixed(2) + "%";
}

function updateRefreshTime() {
  const now = new Date();
  document.getElementById("last-update-time").textContent =
    now.toLocaleTimeString();
}

async function loadStats() {
  try {
    const response = await fetch("/api/stats");
    const stats = await response.json();

    let html = "";

    html += `
                    <div class="stats-item row">
                        <div class="col-8 stats-label">Total Opportunities</div>
                        <div class="col-4 stats-value">${
                          stats.totalOpportunities
                        }</div>
                    </div>
                    <div class="stats-item row">
                        <div class="col-8 stats-label">Total Trades</div>
                        <div class="col-4 stats-value">${
                          stats.totalTrades
                        }</div>
                    </div>
                    <div class="stats-item row">
                        <div class="col-8 stats-label">Total Profit</div>
                        <div class="col-4 stats-value">
                            <span class="${
                              stats.totalProfit >= 0
                                ? "profit-positive"
                                : "profit-negative"
                            }">
                                ${formatCurrency(stats.totalProfit)} USDT
                            </span>
                        </div>
                    </div>
                    <div class="stats-item row">
                        <div class="col-8 stats-label">Avg Price Difference</div>
                        <div class="col-4 stats-value">${formatPercentage(
                          stats.avgPercentageDiff
                        )}</div>
                    </div>
                `;

    html += `<hr><h6 class="mb-3 fw-bold">Top Exchange Pairs</h6>`;

    const topPairs = stats.exchangePairStats
      .sort((a, b) => b.totalProfit - a.totalProfit)
      .slice(0, 5);

    topPairs.forEach((pair) => {
      html += `
                        <div class="stats-item row">
                            <div class="col-7 stats-label">${pair.pair}</div>
                            <div class="col-5 stats-value">
                                <div class="${
                                  pair.totalProfit >= 0
                                    ? "profit-positive"
                                    : "profit-negative"
                                }">
                                    ${formatCurrency(pair.totalProfit)} USDT
                                </div>
                                <small class="text-muted">${
                                  pair.count
                                } trades</small>
                            </div>
                        </div>
                    `;
    });

    document.getElementById("stats-container").innerHTML = html;
  } catch (error) {
    console.error("Error loading stats:", error);
    document.getElementById("stats-container").innerHTML = `
                    <div class="empty-state">
                        <i class="bi bi-exclamation-triangle"></i>
                        <p>Failed to load statistics</p>
                    </div>
                `;
  }
}

async function loadBalances() {
  try {
    const response = await fetch("/api/balances");
    const balances = await response.json();

    if (Object.keys(balances).length === 0) {
      document.getElementById("balances-container").innerHTML = `
                        <div class="empty-state">
                            <i class="bi bi-wallet2"></i>
                            <p>No balance information available</p>
                        </div>
                    `;
      return;
    }

    let html = '<div class="accordion" id="balancesAccordion">';

    Object.entries(balances).forEach(([exchangeId, currencies], index) => {
      const totalBalances = {};
      Object.entries(currencies).forEach(([currency, balance]) => {
        if (!totalBalances[currency]) {
          totalBalances[currency] = 0;
        }
        totalBalances[currency] += parseFloat(balance.total || 0);
      });

      html += `
                        <div class="accordion-item">
                            <h2 class="accordion-header" id="heading${index}">
                                <button class="accordion-button ${
                                  index > 0 ? "collapsed" : ""
                                }" type="button" 
                                        data-bs-toggle="collapse" data-bs-target="#collapse${index}" 
                                        aria-expanded="${
                                          index === 0
                                        }" aria-controls="collapse${index}">
                                    <span class="badge-exchange me-2">${exchangeId.toUpperCase()}</span>
                                    ${Object.keys(currencies).length} currencies
                                </button>
                            </h2>
                            <div id="collapse${index}" class="accordion-collapse collapse ${
        index === 0 ? "show" : ""
      }" 
                                 aria-labelledby="heading${index}" data-bs-parent="#balancesAccordion">
                                <div class="accordion-body p-0">
                                    <table class="table table-sm mb-0">
                                        <thead>
                                            <tr>
                                                <th>Currency</th>
                                                <th>Free</th>
                                                <th>Used</th>
                                                <th>Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                    `;

      const sortedCurrencies = Object.entries(currencies).sort(
        (a, b) => b[1].total - a[1].total
      );

      sortedCurrencies.forEach(([currency, balance]) => {
        html += `
                            <tr>
                                <td class="currency-name">${currency}</td>
                                <td class="balance-amount">${balance.free}</td>
                                <td class="balance-amount">${balance.used}</td>
                                <td class="balance-amount">${balance.total}</td>
                            </tr>
                        `;
      });

      html += `
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    `;
    });

    html += "</div>";

    document.getElementById("balances-container").innerHTML = html;
  } catch (error) {
    console.error("Error loading balances:", error);
    document.getElementById("balances-container").innerHTML = `
                    <div class="empty-state">
                        <i class="bi bi-exclamation-triangle"></i>
                        <p>Failed to load balances</p>
                    </div>
                `;
  }
}

async function loadOpportunities() {
  try {
    const response = await fetch("/api/opportunities?limit=10");
    const opportunities = await response.json();

    if (opportunities.length === 0) {
      document.getElementById("opportunities-container").innerHTML = `
                        <tr>
                            <td colspan="6">
                                <div class="empty-state">
                                    <i class="bi bi-search"></i>
                                    <p>No opportunities found</p>
                                </div>
                            </td>
                        </tr>
                    `;
      return;
    }

    let html = "";

    opportunities.forEach((opp) => {
      html += `
                        <tr class="opportunity-row">
                            <td>${formatTime(opp.timestamp)}</td>
                            <td><span class="badge-symbol">${
                              opp.symbol
                            }</span></td>
                            <td>
                                <div><span class="badge-exchange">${
                                  opp.buyExchange
                                }</span> → <span class="badge-exchange">${
        opp.sellExchange
      }</span></div>
                            </td>
                            <td>
                                <div>Buy: ${opp.buyPrice}</div>
                                <div>Sell: ${opp.sellPrice}</div>
                            </td>
                            <td><strong>${formatPercentage(
                              opp.percentageDifference
                            )}</strong></td>
                            <td class="profit-positive">${formatCurrency(
                              opp.potentialProfit
                            )} USDT</td>
                        </tr>
                    `;
    });

    document.getElementById("opportunities-container").innerHTML = html;
  } catch (error) {
    console.error("Error loading opportunities:", error);
    document.getElementById("opportunities-container").innerHTML = `
                    <tr>
                        <td colspan="6">
                            <div class="empty-state">
                                <i class="bi bi-exclamation-triangle"></i>
                                <p>Failed to load opportunities</p>
                            </div>
                        </td>
                    </tr>
                `;
  }
}

async function loadTrades() {
  try {
    const response = await fetch("/api/trades?limit=10");
    const trades = await response.json();

    if (trades.length === 0) {
      document.getElementById("trades-container").innerHTML = `
                        <tr>
                            <td colspan="6">
                                <div class="empty-state">
                                    <i class="bi bi-search"></i>
                                    <p>No trades found</p>
                                </div>
                            </td>
                        </tr>
                    `;
      return;
    }

    let html = "";

    trades.forEach((trade) => {
      const profitClass =
        trade.potentialProfit >= 0 ? "profit-positive" : "profit-negative";

      html += `
                        <tr class="trade-row">
                            <td>${formatTime(
                              trade.completedAt || trade.timestamp
                            )}</td>
                            <td><span class="badge-symbol">${
                              trade.symbol
                            }</span></td>
                            <td>
                                <div><span class="badge-exchange">${
                                  trade.buyExchange
                                }</span> → <span class="badge-exchange">${
        trade.sellExchange
      }</span></div>
                            </td>
                            <td>
                                <div>Buy: ${trade.buyPrice}</div>
                                <div>Sell: ${trade.sellPrice}</div>
                            </td>
                            <td>${
                              trade.baseAmount
                                ? trade.baseAmount.toFixed(6)
                                : "-"
                            }</td>
                            <td class="${profitClass}">${formatCurrency(
        trade.potentialProfit
      )} USDT</td>
                        </tr>
                    `;
    });

    document.getElementById("trades-container").innerHTML = html;
  } catch (error) {
    console.error("Error loading trades:", error);
    document.getElementById("trades-container").innerHTML = `
                    <tr>
                        <td colspan="6">
                            <div class="empty-state">
                                <i class="bi bi-exclamation-triangle"></i>
                                <p>Failed to load trades</p>
                            </div>
                        </td>
                    </tr>
                `;
  }
}

function refreshAll() {
  loadStats();
  loadBalances();
  loadOpportunities();
  loadTrades();
  updateRefreshTime();
}

refreshAll();

document.getElementById("refresh-btn").addEventListener("click", refreshAll);

setInterval(refreshAll, 30000);

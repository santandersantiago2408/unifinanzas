import { filterByPeriod, formatMoney, formatDate, getPeriodBudget } from "./finance.js";

const CATEGORY_COLORS = {
  Comida: "food",
  Transporte: "transport",
  "Copias y materiales": "materials",
  Imprevistos: "unexpected"
};

function summarizePeriodTransactions(periodTransactions) {
  const periodExpenses = periodTransactions.filter((transaction) => transaction.tipo !== "income");
  const periodIncome = periodTransactions.filter((transaction) => transaction.tipo === "income");
  const expenseTotalVES = periodExpenses.reduce((expenseSubtotalVES, transaction) => expenseSubtotalVES + Number(transaction.monto_ves), 0);
  const incomeTotalVES = periodIncome.reduce((incomeSubtotalVES, transaction) => incomeSubtotalVES + Number(transaction.monto_ves), 0);
  return { periodExpenses, expenseTotalVES, incomeTotalVES, netBalanceVES: incomeTotalVES - expenseTotalVES };
}

function renderPeriodSummary({ periodTransactions, expenseTotalVES, incomeTotalVES, netBalanceVES }, spendingLimitVES, periodKey, regularWeeklyProjectionVES, regularWeeklyIncomeVES = 0, weeklyGoalReductionVES = 0) {
  const effectiveWeeklyBudgetVES = Math.max(0, spendingLimitVES + regularWeeklyIncomeVES - regularWeeklyProjectionVES - weeklyGoalReductionVES);
  const periodBudgetVES = getPeriodBudget(effectiveWeeklyBudgetVES, periodKey);
  const budgetUsagePercent = periodBudgetVES > 0 ? expenseTotalVES / periodBudgetVES * 100 : 0;
  const periodTitle = { week: "DE LA SEMANA", month: "DEL MES", year: "DEL AÑO" }[periodKey];
  const periodDescription = { week: "esta semana", month: "este mes", year: "este año" }[periodKey];

  document.querySelector("#period-total-label").textContent = `GASTOS ${periodTitle}`;
  document.querySelector("#period-note").textContent = {
    week: "Del lunes a hoy",
    month: new Intl.DateTimeFormat("es-VE", { month: "long", year: "numeric" }).format(new Date()),
    year: String(new Date().getFullYear())
  }[periodKey];
  document.querySelector("#period-total").textContent = formatMoney(expenseTotalVES);
  document.querySelector("#period-budget-label").textContent = `${periodKey === "week" ? "Presupuesto efectivo" : "Referencia proporcional efectiva"} de ${formatMoney(periodBudgetVES)} · gastos fijos: -${formatMoney(regularWeeklyProjectionVES)}/sem${weeklyGoalReductionVES > 0 ? ` · meta: -${formatMoney(weeklyGoalReductionVES)}/sem` : ""}`;
  document.querySelector("#period-income").textContent = formatMoney(incomeTotalVES);
  const netBalanceElement = document.querySelector("#period-balance");
  netBalanceElement.textContent = formatMoney(netBalanceVES);
  netBalanceElement.classList.toggle("is-negative", netBalanceVES < 0);
  document.querySelector("#period-count-label").textContent = `${periodTransactions.length} movimientos ${periodDescription}`;
  document.querySelector("#dashboard-recurring-weekly-total").textContent = formatMoney(regularWeeklyProjectionVES);
  document.querySelector("#period-percent").textContent = `${Math.round(budgetUsagePercent)}%`;
  document.querySelector("#period-remaining").textContent = periodBudgetVES >= expenseTotalVES
    ? `${formatMoney(periodBudgetVES - expenseTotalVES)} disponibles`
    : `Exceso de ${formatMoney(expenseTotalVES - periodBudgetVES)}`;

  renderBudgetProgress(expenseTotalVES, periodBudgetVES, budgetUsagePercent);
  renderBudgetStatus(expenseTotalVES, periodBudgetVES, budgetUsagePercent);
}

function renderBudgetProgress(expenseTotalVES, periodBudgetVES, budgetUsagePercent) {
  const progressBar = document.querySelector("#period-progress");
  progressBar.style.width = `${Math.min(budgetUsagePercent, 100)}%`;
  progressBar.className = expenseTotalVES >= periodBudgetVES ? "danger" : budgetUsagePercent >= 75 ? "warning" : "";
  progressBar.closest(".progress-track").setAttribute("aria-valuenow", String(Math.min(Math.round(budgetUsagePercent), 100)));
}

function renderBudgetStatus(expenseTotalVES, periodBudgetVES, budgetUsagePercent) {
  const statusHeading = document.querySelector("#period-state");
  const statusMessage = document.querySelector("#period-state-message");
  if (expenseTotalVES >= periodBudgetVES) {
    statusHeading.textContent = "Límite alcanzado";
    statusMessage.textContent = "Revisa tus próximos gastos variables.";
  } else if (budgetUsagePercent >= 75) {
    statusHeading.textContent = "Con atención";
    statusMessage.textContent = "Ya usaste más del 75 % de tu referencia.";
  } else {
    statusHeading.textContent = "Vas muy bien";
    statusMessage.textContent = "Tu presupuesto está bajo control.";
  }
}

function renderWeeklyBudgetSidebar(transactions, weeklySpendingLimitVES, regularWeeklyIncomeVES = 0, weeklyGoalReductionVES = 0, regularWeeklyProjectionVES = 0) {
  const weeklyExpenseTotalVES = filterByPeriod(transactions, "week")
    .filter((transaction) => transaction.tipo !== "income")
    .reduce((expenseSubtotalVES, transaction) => expenseSubtotalVES + Number(transaction.monto_ves), 0);
  const effectiveWeeklySpendingLimitVES = Math.max(0, weeklySpendingLimitVES + regularWeeklyIncomeVES - regularWeeklyProjectionVES - weeklyGoalReductionVES);
  const weeklyBudgetUsagePercent = effectiveWeeklySpendingLimitVES > 0 ? Math.min(weeklyExpenseTotalVES / effectiveWeeklySpendingLimitVES * 100, 100) : 100;
  document.querySelector("#sidebar-spent").textContent = formatMoney(weeklyExpenseTotalVES);
  document.querySelector("#sidebar-limit").textContent = formatMoney(effectiveWeeklySpendingLimitVES);
  document.querySelector("#sidebar-progress-fill").style.width = `${weeklyBudgetUsagePercent}%`;
}

function renderCategoryBreakdown(periodExpenses, periodKey) {
  const categoryExpenseTotalsVES = periodExpenses.reduce((categoryTotals, transaction) => {
    categoryTotals[transaction.categoria] = (categoryTotals[transaction.categoria] || 0) + Number(transaction.monto_ves);
    return categoryTotals;
  }, {});
  const largestCategoryExpenseVES = Math.max(...Object.values(categoryExpenseTotalsVES), 1);
  const categoryChart = document.querySelector("#category-chart");
  const trackedCategories = ["Comida", "Transporte", "Copias y materiales", "Imprevistos"];
  categoryChart.replaceChildren();

  for (const categoryName of trackedCategories) {
    const categoryExpenseTotalVES = categoryExpenseTotalsVES[categoryName] || 0;
    const chartRow = document.createElement("div");
    chartRow.className = "chart-row";
    chartRow.innerHTML = `<div class="chart-row-head"><span class="chart-label"><i class="chart-dot ${CATEGORY_COLORS[categoryName]}"></i>${categoryName}</span><strong>${formatMoney(categoryExpenseTotalVES)}</strong></div><div class="chart-track"><span class="chart-fill ${CATEGORY_COLORS[categoryName]}" style="width:${categoryExpenseTotalVES / largestCategoryExpenseVES * 100}%"></span></div>`;
    categoryChart.append(chartRow);
  }
  document.querySelector("#category-period-label").textContent = { week: "Esta semana", month: "Este mes", year: "Este año" }[periodKey];
}

function renderRecentActivity(periodTransactions) {
  const recentTransactions = [...periodTransactions]
    .sort((firstTransaction, secondTransaction) => new Date(secondTransaction.fecha) - new Date(firstTransaction.fecha))
    .slice(0, 4);
  const recentActivityList = document.querySelector("#recent-expenses");
  recentActivityList.replaceChildren();
  if (!recentTransactions.length) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state compact-empty";
    emptyState.textContent = "No hay gastos para este periodo todavía.";
    recentActivityList.append(emptyState);
    return;
  }

  for (const transaction of recentTransactions) {
    const transactionIsIncome = transaction.tipo === "income";
    const activityRow = document.createElement("div");
    activityRow.className = `recent-row${transactionIsIncome ? " income" : ""}`;
    activityRow.innerHTML = `<span class="recent-icon ${CATEGORY_COLORS[transaction.categoria] || "food"}">${transactionIsIncome ? "+" : "·"}</span><span class="recent-description"><strong></strong><small>${transactionIsIncome ? "Ingreso" : transaction.categoria} · ${formatDate(transaction.fecha)}</small></span><b>${transactionIsIncome ? "+" : "−"}${formatMoney(transaction.monto_ves)}</b>`;
    activityRow.querySelector(".recent-description strong").textContent = transaction.descripcion;
    recentActivityList.append(activityRow);
  }
}

// Renderiza métricas, distribución y actividad para el periodo activo.
export function renderDashboard(transactions, weeklySpendingLimitVES, periodKey, regularWeeklyProjectionVES = 0, regularWeeklyIncomeVES = 0, weeklyGoalReductionVES = 0) {
  const periodTransactions = filterByPeriod(transactions, periodKey);
  const periodSummary = summarizePeriodTransactions(periodTransactions);
  renderPeriodSummary({ ...periodSummary, periodTransactions }, weeklySpendingLimitVES, periodKey, regularWeeklyProjectionVES, regularWeeklyIncomeVES, weeklyGoalReductionVES);
  renderWeeklyBudgetSidebar(transactions, weeklySpendingLimitVES, regularWeeklyIncomeVES, weeklyGoalReductionVES, regularWeeklyProjectionVES);
  renderCategoryBreakdown(periodSummary.periodExpenses, periodKey);
  renderRecentActivity(periodTransactions);
}
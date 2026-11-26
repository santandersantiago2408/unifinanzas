import { loadLocal, saveLocal } from "./data.js";
import { formatMoney } from "./finance.js";

const SAVINGS_GOALS_STORAGE_KEY = "unifinanzas-goals-v1";
let savingsGoals = [];

function escapeGoalAttribute(goalName) {
  return String(goalName).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

export function getGoals() {
  return savingsGoals;
}

export function getWeeklyGoalReduction() {
  return savingsGoals
    .filter((savingsGoal) => savingsGoal.accepted && savingsGoal.active !== false)
    .reduce((total, savingsGoal) => total + Number(savingsGoal.weeklyReductionVES || 0), 0);
}

function calculateGoalSavingsPlan(savingsGoal, referenceDate = new Date()) {
  const remainingAmountVES = Math.max(0, savingsGoal.target - savingsGoal.saved);
  const weeksUntilDeadline = Math.max(1, Math.ceil((new Date(savingsGoal.deadline) - referenceDate) / (7 * 24 * 60 * 60 * 1000)));
  return {
    remainingAmountVES,
    weeksUntilDeadline,
    weeklySavingsVES: Math.ceil(remainingAmountVES / weeksUntilDeadline),
    completionPercent: Math.min(savingsGoal.saved / savingsGoal.target * 100, 100)
  };
}

function renderEmptyGoalList(goalList) {
  const emptyState = document.createElement("p");
  emptyState.className = "empty-state";
  emptyState.textContent = "Aún no tienes planes. Crea uno para empezar a dividir la compra en pasos.";
  goalList.append(emptyState);
  document.querySelector("#plan-recommendation").textContent = "Crea una meta y calcularemos un ahorro semanal realista.";
}

function createSavingsGoalCard(savingsGoal, savingsPlan) {
  const goalCard = document.createElement("article");
  goalCard.className = "goal-card";
  goalCard.innerHTML = `<div class="goal-card-head"><span class="goal-mark">◎</span><button class="goal-delete" type="button" aria-label="Eliminar meta ${escapeGoalAttribute(savingsGoal.name)}" data-goal-id="${savingsGoal.id}">×</button></div><h3></h3><div class="goal-progress"><span style="width:${savingsPlan.completionPercent}%"></span></div><div class="goal-values"><span>${formatMoney(savingsGoal.saved)} aportados</span><strong>${formatMoney(savingsGoal.target)}</strong></div><p class="goal-plan-copy">${savingsPlan.remainingAmountVES === 0 ? "¡Meta cumplida!" : `Retirar ${formatMoney(savingsPlan.weeklySavingsVES)} de gastos por semana · ${savingsPlan.weeksUntilDeadline} ${savingsPlan.weeksUntilDeadline === 1 ? "semana" : "semanas"}`}</p><small>Fecha ideal: ${new Date(savingsGoal.deadline).toLocaleDateString("es-VE")}</small>`;
  goalCard.querySelector("h3").textContent = savingsGoal.name;
  return goalCard;
}

function renderGoalRecommendation(savingsGoal, savingsPlan) {
  document.querySelector("#plan-recommendation").textContent = savingsPlan.remainingAmountVES
    ? `Para “${savingsGoal.name}”, separa cerca de ${formatMoney(savingsPlan.weeklySavingsVES)} por semana hasta tu fecha ideal.`
    : `¡Ya completaste la meta “${savingsGoal.name}”!`;
}

// Renderiza metas ordenadas por fecha y su estimación de ahorro semanal.
export function renderGoals() {
  const goalList = document.querySelector("#goal-list");
  goalList.replaceChildren();
  document.querySelector("#goal-count").textContent = `${savingsGoals.length} ${savingsGoals.length === 1 ? "meta" : "metas"}`;
  if (!savingsGoals.length) {
    renderEmptyGoalList(goalList);
    return;
  }

  const sortedSavingsGoals = [...savingsGoals].sort((firstGoal, secondGoal) => new Date(firstGoal.deadline) - new Date(secondGoal.deadline));
  for (const savingsGoal of sortedSavingsGoals) {
    const savingsPlan = calculateGoalSavingsPlan(savingsGoal);
    goalList.append(createSavingsGoalCard(savingsGoal, savingsPlan));
  }
  renderGoalRecommendation(sortedSavingsGoals[0], calculateGoalSavingsPlan(sortedSavingsGoals[0]));
}

function validateSavingsGoal(goalName, goalTargetVES, currentSavingsVES, targetDate) {
  const targetDateHasPassed = targetDate && new Date(`${targetDate}T23:59:59`) < new Date();
  if (!goalName || !Number.isSafeInteger(goalTargetVES) || goalTargetVES <= 0 || !Number.isSafeInteger(currentSavingsVES) || currentSavingsVES < 0 || currentSavingsVES > goalTargetVES || !targetDate || targetDateHasPassed) {
    return "Revisa el nombre, los montos y elige una fecha futura.";
  }
  return "";
}

function createSavingsGoal(goalName, goalTargetVES, currentSavingsVES, targetDate, savingsPlan) {
  return {
    id: `goal-${Date.now()}`,
    name: goalName,
    target: goalTargetVES,
    saved: currentSavingsVES,
    deadline: targetDate,
    weeklyReductionVES: savingsPlan.weeklySavingsVES,
    accepted: true,
    active: true,
    createdAt: new Date().toISOString()
  };
}

function saveSavingsGoal(goalName, goalTargetVES, currentSavingsVES, targetDate, feedbackMessage, onChange, notify) {
  const validationMessage = validateSavingsGoal(goalName, goalTargetVES, currentSavingsVES, targetDate);
  if (validationMessage) {
    feedbackMessage.textContent = validationMessage;
    feedbackMessage.className = "form-feedback is-error";
    return false;
  }
  const savingsPlan = calculateGoalSavingsPlan({ target: goalTargetVES, saved: currentSavingsVES, deadline: targetDate });
  const confirmationMessage = `Para llegar a esta meta en ${savingsPlan.weeksUntilDeadline} ${savingsPlan.weeksUntilDeadline === 1 ? "semana" : "semanas"}, deberemos retirar ${formatMoney(savingsPlan.weeklySavingsVES)} de gastos semanales y guardarlos como ahorro, ¿aceptar?`;
  if (!window.confirm(confirmationMessage)) {
    feedbackMessage.textContent = "Plan no aplicado. Confirma la reducción semanal para activarlo.";
    feedbackMessage.className = "form-feedback is-error";
    return false;
  }
  savingsGoals.push(createSavingsGoal(goalName, goalTargetVES, currentSavingsVES, targetDate, savingsPlan));
  saveLocal(SAVINGS_GOALS_STORAGE_KEY, savingsGoals);
  document.querySelector("#plan-form").reset();
  document.querySelector("#goal-saved").value = "0";
  feedbackMessage.textContent = "Meta guardada en este dispositivo.";
  feedbackMessage.className = "form-feedback is-success";
  renderGoals();
  onChange(savingsGoals);
  notify("Tu plan quedó confirmado y reduce el presupuesto semanal.");
  return true;
}

function deleteSavingsGoal(goalId, onChange, notify) {
  savingsGoals = savingsGoals.filter((savingsGoal) => savingsGoal.id !== goalId);
  saveLocal(SAVINGS_GOALS_STORAGE_KEY, savingsGoals);
  renderGoals();
  onChange(savingsGoals);
  notify("Meta eliminada.");
}

// Inicializa altas y eliminaciones de metas con validación financiera.
export function initializePlans({ notify, onChange }) {
  savingsGoals = loadLocal(SAVINGS_GOALS_STORAGE_KEY, []);
  if (!Array.isArray(savingsGoals)) savingsGoals = [];
  renderGoals();

  document.querySelector("#plan-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const goalName = document.querySelector("#goal-name").value.trim();
    const goalTargetVES = Number(document.querySelector("#goal-target").value);
    const currentSavingsVES = Number(document.querySelector("#goal-saved").value || 0);
    const targetDate = document.querySelector("#goal-date").value;
    const feedbackMessage = document.querySelector("#goal-feedback");
    saveSavingsGoal(goalName, goalTargetVES, currentSavingsVES, targetDate, feedbackMessage, onChange, notify);
  });

  document.querySelector("#goal-list").addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-goal-id]");
    if (deleteButton) deleteSavingsGoal(deleteButton.dataset.goalId, onChange, notify);
  });
  return savingsGoals;
}
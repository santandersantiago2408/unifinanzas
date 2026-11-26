import { loadLocal, saveLocal } from "./data.js";
import { formatMoney } from "./finance.js";

const RECURRING_KEY = "unifinanzas-recurring-v1";
const FREQUENCY_LABELS = {
  weekly: "Cada semana",
  weekly_multiple: "Varias veces por semana",
  biweekly: "Cada 2 semanas",
  monthly: "Cada mes"
};

// Normaliza una frecuencia recurrente a su costo semanal estimado.
export function weeklyEquivalent(recurringRule) {
  if (recurringRule.frecuencia === "weekly_multiple") return Number(recurringRule.monto_ves) * Number(recurringRule.veces_semana);
  if (recurringRule.frecuencia === "biweekly") return Number(recurringRule.monto_ves) / 2;
  if (recurringRule.frecuencia === "monthly") return Number(recurringRule.monto_ves) * 12 / 52;
  return Number(recurringRule.monto_ves);
}

// Suma la proyección semanal de todos los compromisos guardados.
export function getWeeklyRecurringTotal(recurringRules) {
  return recurringRules.reduce((weeklyExpenseTotal, recurringRule) => weeklyExpenseTotal + weeklyEquivalent(recurringRule), 0);
}

function getFrequencyDescription(recurringRule) {
  if (recurringRule.frecuencia === "weekly_multiple") return `${recurringRule.veces_semana} veces por semana`;
  return FREQUENCY_LABELS[recurringRule.frecuencia] || FREQUENCY_LABELS.weekly;
}

function createRecurringRuleCard(recurringRule, { onEdit, onDelete }) {
  const recurringRuleCard = document.createElement("article");
  recurringRuleCard.className = "recurring-item";
  recurringRuleCard.innerHTML = `<div class="recurring-item-main"><span class="recurring-mark">↻</span><div class="recurring-copy"><strong></strong><small></small></div></div><div class="recurring-item-price"><b>${formatMoney(recurringRule.monto_ves)}</b><small>${formatMoney(weeklyEquivalent(recurringRule))} / semana est.</small></div><div class="recurring-actions"><button class="row-action edit-action" type="button">Editar</button><button class="row-action delete-action" type="button">Eliminar</button></div>`;
  recurringRuleCard.querySelector(".recurring-copy strong").textContent = recurringRule.descripcion;
  recurringRuleCard.querySelector(".recurring-copy small").textContent = `${recurringRule.categoria} · ${getFrequencyDescription(recurringRule)}`;
  recurringRuleCard.querySelector(".edit-action").addEventListener("click", () => onEdit(recurringRule));
  recurringRuleCard.querySelector(".delete-action").addEventListener("click", () => onDelete(recurringRule));
  return recurringRuleCard;
}

function renderRecurringRules(recurringRules, recurringList, { onEdit, onDelete }) {
  recurringList.replaceChildren();
  document.querySelector("#recurring-weekly-total").textContent = formatMoney(getWeeklyRecurringTotal(recurringRules));
  if (!recurringRules.length) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = "Aún no tienes gastos regulares planificados.";
    recurringList.append(emptyState);
    return;
  }
  for (const recurringRule of recurringRules) {
    recurringList.append(createRecurringRuleCard(recurringRule, {
      onEdit,
      onDelete
    }));
  }
}

function validateRecurringRule(recurringDescription, amountPerOccurrenceVES) {
  return recurringDescription.trim() && Number.isSafeInteger(amountPerOccurrenceVES) && amountPerOccurrenceVES > 0
    ? ""
    : "Completa el concepto y un monto positivo por ocasión.";
}

function createRecurringRule(recurringFormFields) {
  return {
    id: recurringFormFields.editingId || `recurring-${Date.now()}`,
    descripcion: recurringFormFields.description.trim(),
    monto_ves: recurringFormFields.amountVES,
    categoria: recurringFormFields.category,
    frecuencia: recurringFormFields.frequency,
    veces_semana: recurringFormFields.frequency === "weekly_multiple" ? Number(recurringFormFields.weeklyOccurrences) : 1
  };
}

// Vincula las operaciones de edición y persistencia de gastos recurrentes.
export function initializeRecurring({ notify, onChange }) {
  let recurringRules = loadLocal(RECURRING_KEY, []);
  if (!Array.isArray(recurringRules)) recurringRules = [];
  const recurringForm = document.querySelector("#recurring-form");
  const editingIdField = document.querySelector("#recurring-id");
  const descriptionField = document.querySelector("#recurring-description");
  const amountField = document.querySelector("#recurring-amount");
  const categoryField = document.querySelector("#recurring-category");
  const frequencyField = document.querySelector("#recurring-frequency");
  const weeklyOccurrencesField = document.querySelector("#recurring-times");
  const weeklyOccurrencesContainer = document.querySelector("#recurring-count-field");
  const submitButton = document.querySelector("#recurring-submit");
  const cancelButton = document.querySelector("#cancel-recurring-edit");
  const feedbackMessage = document.querySelector("#recurring-feedback");
  const recurringList = document.querySelector("#recurring-list");

  function resetRecurringForm() {
    recurringForm.reset();
    editingIdField.value = "";
    weeklyOccurrencesContainer.hidden = frequencyField.value !== "weekly_multiple";
    submitButton.innerHTML = "Añadir gasto regular <span>→</span>";
    cancelButton.hidden = true;
    feedbackMessage.textContent = "";
    feedbackMessage.className = "form-feedback";
  }

  function beginEdit(recurringRule) {
    editingIdField.value = recurringRule.id;
    descriptionField.value = recurringRule.descripcion;
    amountField.value = recurringRule.monto_ves;
    categoryField.value = recurringRule.categoria;
    frequencyField.value = recurringRule.frecuencia;
    weeklyOccurrencesField.value = String(recurringRule.veces_semana || 3);
    weeklyOccurrencesContainer.hidden = frequencyField.value !== "weekly_multiple";
    submitButton.innerHTML = "Guardar cambios <span>✓</span>";
    cancelButton.hidden = false;
    descriptionField.focus();
  }

  function persistRecurringRules() {
    saveLocal(RECURRING_KEY, recurringRules);
    renderRecurringRules(recurringRules, recurringList, { onEdit: beginEdit, onDelete: deleteRule });
    onChange(recurringRules);
  }

  function deleteRule(recurringRule) {
    const deletionConfirmed = window.confirm(`¿Eliminar el gasto regular “${recurringRule.descripcion}”?`);
    if (!deletionConfirmed) return;
    recurringRules = recurringRules.filter((savedRule) => savedRule.id !== recurringRule.id);
    persistRecurringRules();
    notify("Gasto regular eliminado.");
  }

  function handleRecurringFormSubmit(event) {
    event.preventDefault();
    const amountVES = Number(amountField.value);
    const validationMessage = validateRecurringRule(descriptionField.value, amountVES);
    if (validationMessage) {
      feedbackMessage.textContent = validationMessage;
      feedbackMessage.className = "form-feedback is-error";
      return;
    }

    const recurringRule = createRecurringRule({
      editingId: editingIdField.value,
      description: descriptionField.value,
      amountVES,
      category: categoryField.value,
      frequency: frequencyField.value,
      weeklyOccurrences: weeklyOccurrencesField.value
    });
    const existingRuleIndex = recurringRules.findIndex((savedRule) => savedRule.id === recurringRule.id);
    if (existingRuleIndex < 0) recurringRules.push(recurringRule);
    else recurringRules[existingRuleIndex] = recurringRule;
    persistRecurringRules();
    resetRecurringForm();
    notify(existingRuleIndex < 0 ? "Gasto regular guardado." : "Gasto regular actualizado.");
  }

  frequencyField.addEventListener("change", () => {
    weeklyOccurrencesContainer.hidden = frequencyField.value !== "weekly_multiple";
  });
  cancelButton.addEventListener("click", resetRecurringForm);
  recurringForm.addEventListener("submit", handleRecurringFormSubmit);
  renderRecurringRules(recurringRules, recurringList, { onEdit: beginEdit, onDelete: deleteRule });
  return {
    getRules: () => recurringRules,
    addRule: (recurringRule) => {
      recurringRules = [...recurringRules.filter((rule) => rule.id !== recurringRule.id), recurringRule];
      persistRecurringRules();
    }
  };
}

const REGULAR_INCOME_KEY = "unifinanzas-regular-income-v1";

export function getWeeklyRegularIncome(incomeRules) {
  return incomeRules.reduce((weeklyTotal, incomeRule) => {
    const monthlyAmount = Number(incomeRule.monto_ves);
    return weeklyTotal + (incomeRule.frecuencia === "monthly" ? monthlyAmount * 12 / 52 : monthlyAmount);
  }, 0);
}

export function initializeRegularIncome({ notify, onChange }) {
  let incomeRules = loadLocal(REGULAR_INCOME_KEY, []);
  if (!Array.isArray(incomeRules)) incomeRules = [];
  const form = document.querySelector("#regular-income-form");
  const list = document.querySelector("#regular-income-list");
  const feedback = document.querySelector("#regular-income-feedback");

  function render() {
    list.replaceChildren();
    document.querySelector("#regular-income-weekly-total").textContent = formatMoney(getWeeklyRegularIncome(incomeRules));
    if (!incomeRules.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Aún no tienes ingresos regulares registrados.";
      list.append(empty);
      return;
    }
    for (const incomeRule of incomeRules) {
      const card = document.createElement("article");
      card.className = "recurring-item";
      const weeklyAmount = incomeRule.frecuencia === "monthly" ? Number(incomeRule.monto_ves) * 12 / 52 : Number(incomeRule.monto_ves);
      card.innerHTML = `<div class="recurring-item-main"><span class="recurring-mark">＋</span><div class="recurring-copy"><strong></strong><small></small></div></div><div class="recurring-item-price"><b>${formatMoney(incomeRule.monto_ves)}</b><small>${formatMoney(weeklyAmount)} / semana</small></div><div class="recurring-actions"><button class="row-action delete-action" type="button">Eliminar</button></div>`;
      card.querySelector(".recurring-copy strong").textContent = incomeRule.descripcion;
      card.querySelector(".recurring-copy small").textContent = `${incomeRule.categoria} · ${incomeRule.frecuencia === "monthly" ? "Cada mes" : "Cada semana"}`;
      card.querySelector(".delete-action").addEventListener("click", () => {
        if (!window.confirm(`¿Eliminar el ingreso regular “${incomeRule.descripcion}”?`)) return;
        incomeRules = incomeRules.filter((rule) => rule.id !== incomeRule.id);
        saveLocal(REGULAR_INCOME_KEY, incomeRules);
        render();
        onChange(incomeRules);
        notify("Ingreso regular eliminado.");
      });
      list.append(card);
    }
  }

  function persist() {
    saveLocal(REGULAR_INCOME_KEY, incomeRules);
    render();
    onChange(incomeRules);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const description = document.querySelector("#regular-income-description").value.trim();
    const amount = Number(document.querySelector("#regular-income-amount").value);
    if (!description || !Number.isSafeInteger(amount) || amount <= 0) {
      feedback.textContent = "Completa la fuente y un monto positivo.";
      feedback.className = "form-feedback is-error";
      return;
    }
    const rule = {
      id: `regular-income-${Date.now()}`,
      descripcion: description,
      monto_ves: amount,
      categoria: document.querySelector("#regular-income-category").value,
      frecuencia: document.querySelector("#regular-income-frequency").value
    };
    incomeRules.push(rule);
    persist();
    form.reset();
    feedback.textContent = "Ingreso regular guardado y sumado al presupuesto.";
    feedback.className = "form-feedback is-success";
    notify("Ingreso regular añadido.");
  });

  render();
  return {
    getRules: () => incomeRules,
    addRule: (rule) => {
      incomeRules = [...incomeRules.filter((savedRule) => savedRule.id !== rule.id), rule];
      persist();
    }
  };
}
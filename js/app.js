import { loadAppData, loadLocal, saveLocal } from "./data.js";
import { filterByPeriod, formatMoney } from "./finance.js";
import { renderDashboard } from "./dashboard.js";
import { exportExpenses, initializeTransactionForm, renderExpenseTable } from "./expenses.js";
import { getGoals, getWeeklyGoalReduction, initializePlans } from "./plans.js";
import { initializeMarket, renderTips } from "./discovery.js";
import { initializeCurrency } from "./currency.js?v=20261124-usdt";
import { getWeeklyRecurringTotal, getWeeklyRegularIncome, initializeRecurring, initializeRegularIncome as initializeRegularIncomeModule } from "./recurring.js";
import { askGemini, clearStoredGeminiApiKey, getStoredGeminiApiKey, parseLocalIntent, saveStoredGeminiApiKey } from "./assistant.js";

const TRANSACTION_STORAGE_KEY = "unifinanzas-gastos-v1";
const BUDGET_CONFIG_STORAGE_KEY = "unifinanzas-budget-config-v1";
const VIEW_TITLES = {
  dashboard: "Resumen",
  expenses: "Mis gastos",
  plans: "Metas y planes",
  market: "Comparar compras",
  currency: "Divisas"
};
const appState = {
  financialData: null,
  transactions: [],
  recurringExpenses: [],
  regularIncome: [],
  pendingAssistantAction: null,
  recurringController: null,
  regularIncomeController: null,
  assistantMode: navigator.onLine ? "online" : "offline",
  transactionEditor: null,
  budgetConfig: null,
  selectedPeriod: "week",
  toastTimer: null
};

function showAppNotice(noticeText, noticeType = "success") {
  const notice = document.querySelector("#toast");
  notice.textContent = noticeText;
  notice.className = `toast is-visible ${noticeType === "warning" ? "is-warning" : ""}`;
  clearTimeout(appState.toastTimer);
  appState.toastTimer = setTimeout(() => notice.classList.remove("is-visible"), 3800);
}

function getBaseWeeklyBudget() {
  return Number(appState.budgetConfig?.weeklyLimitVES || 0);
}

function getWeeklyExpenseTotal() {
  return filterByPeriod(appState.transactions, "week")
    .filter((transaction) => transaction.tipo !== "income")
    .reduce((weeklyExpenseTotal, transaction) => weeklyExpenseTotal + Number(transaction.monto_ves), 0);
}

// Actualiza las vistas a partir del estado financiero vigente.
function renderFinancialViews() {
  const baseWeeklyBudget = getBaseWeeklyBudget();
  const weeklyRegularProjection = getWeeklyRecurringTotal(appState.recurringExpenses);
  const weeklyRegularIncome = getWeeklyRegularIncome(appState.regularIncome);
  const weeklyGoalReduction = getWeeklyGoalReduction();
  renderDashboard(appState.transactions, baseWeeklyBudget, appState.selectedPeriod, weeklyRegularProjection, weeklyRegularIncome, weeklyGoalReduction);
  renderExpenseTable(appState.transactions, appState.selectedPeriod, {
    onEdit: (selectedTransaction) => appState.transactionEditor?.edit(selectedTransaction),
    onDelete: deleteTransaction
  });

  const expenseTransactions = appState.transactions.filter((transaction) => transaction.tipo !== "income");
  renderTips(appState.financialData, expenseTransactions, getGoals(), getWeeklyExpenseTotal(), baseWeeklyBudget);
}

function upsertTransaction(transaction) {
  const existingTransactionIndex = appState.transactions.findIndex((savedTransaction) => savedTransaction.id === transaction.id);
  if (existingTransactionIndex >= 0) {
    appState.transactions[existingTransactionIndex] = transaction;
    return true;
  }
  appState.transactions.push(transaction);
  return false;
}

function notifyTransactionBudgetStatus(transaction, transactionWasUpdated) {
  const baseWeeklyBudget = getBaseWeeklyBudget();
  const weeklyExpenseTotal = getWeeklyExpenseTotal();
  const effectiveWeeklyBudget = baseWeeklyBudget + getWeeklyRegularIncome(appState.regularIncome) - getWeeklyRecurringTotal(appState.recurringExpenses) - getWeeklyGoalReduction();
  if (weeklyExpenseTotal >= effectiveWeeklyBudget) {
    showAppNotice(`Alerta: tu gasto semanal llegó a ${formatMoney(weeklyExpenseTotal)}.`, "warning");
    return;
  }
  const transactionLabel = transaction.tipo === "income" ? "Ingreso" : "Gasto";
  showAppNotice(`${transactionLabel} ${transactionWasUpdated ? "actualizado" : "añadido"}.`);
}

// Guarda el movimiento y coordina la persistencia, el render y el aviso financiero.
function saveTransaction(transaction, transactionWasEdited = false) {
  const transactionAlreadyExisted = upsertTransaction(transaction);
  const transactionWasUpdated = transactionWasEdited || transactionAlreadyExisted;
  saveLocal(TRANSACTION_STORAGE_KEY, appState.transactions);
  renderFinancialViews();
  notifyTransactionBudgetStatus(transaction, transactionWasUpdated);
}

function confirmTransactionDeletion(transaction) {
  const transactionDescription = transaction.tipo === "income" ? "el ingreso" : "el gasto";
  return window.confirm(`¿Eliminar ${transactionDescription} “${transaction.descripcion}”?`);
}

function deleteTransaction(transaction) {
  if (!confirmTransactionDeletion(transaction)) return;
  appState.transactions = appState.transactions.filter((savedTransaction) => savedTransaction.id !== transaction.id);
  saveLocal(TRANSACTION_STORAGE_KEY, appState.transactions);
  renderFinancialViews();
  showAppNotice("Movimiento eliminado.");
}

function setView(viewName) {
  const selectedView = VIEW_TITLES[viewName] ? viewName : "dashboard";
  document.querySelectorAll(".app-view").forEach((appView) => {
    appView.hidden = appView.id !== `view-${selectedView}`;
  });
  document.querySelectorAll("[data-view-target]").forEach((navigationButton) => {
    const isSelectedView = navigationButton.dataset.viewTarget === selectedView;
    navigationButton.classList.toggle("is-active", isSelectedView);
    if (navigationButton.classList.contains("nav-link")) {
      navigationButton.setAttribute("aria-current", isSelectedView ? "page" : "false");
    }
  });
  document.querySelector("#page-title").textContent = VIEW_TITLES[selectedView];
  document.body.classList.remove("nav-open");
  document.querySelector("#mobile-menu").setAttribute("aria-expanded", "false");
  history.replaceState(null, "", `#${selectedView}`);
}

function bindViewNavigation() {
  document.addEventListener("click", (event) => {
    const navigationButton = event.target.closest("[data-view-target]");
    if (navigationButton) setView(navigationButton.dataset.viewTarget);
  });
  window.addEventListener("hashchange", () => setView(window.location.hash.slice(1)));
  setView(window.location.hash.slice(1) || "dashboard");
}

function bindMobileNavigationToggle() {
  document.querySelector("#mobile-menu").addEventListener("click", (event) => {
    const navigationIsOpen = !document.body.classList.contains("nav-open");
    document.body.classList.toggle("nav-open", navigationIsOpen);
    event.currentTarget.setAttribute("aria-expanded", String(navigationIsOpen));
  });
}

function bindPeriodSelection() {
  document.querySelectorAll("[data-period]").forEach((periodButton) => {
    periodButton.addEventListener("click", () => {
      appState.selectedPeriod = periodButton.dataset.period;
      document.querySelectorAll("[data-period]").forEach((periodOption) => {
        periodOption.classList.toggle("is-selected", periodOption.dataset.period === appState.selectedPeriod);
      });
      renderFinancialViews();
    });
  });
}

function initializeNavigation() {
  bindViewNavigation();
  bindMobileNavigationToggle();
  bindPeriodSelection();
}

function getAssistantFallbackReply(studentQuestion) {
  const normalizedQuestion = studentQuestion.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const movementIntent = /(gane|gast[eé]|pague|recibi|ingreso|gasto|almuerzo|pasaje|semana|mes)/.test(normalizedQuestion);
  if (!movementIntent) {
    if (/hola|buenas|hey/.test(normalizedQuestion)) {
      return { action: "question", response: "¡Hola! Puedo consultar tu presupuesto, registrar gastos o ingresos puntuales y guardar movimientos regulares por lenguaje natural. Por ejemplo: “gané 1500bs”, “gasté 900 en una empanada” o “a la semana gasto 5000bs en almuerzos”." };
    }
    const intent = parseLocalIntent(studentQuestion);
    if (intent.action === "add_transaction" || intent.action === "add_regular_expense" || intent.action === "add_regular_income") return intent;
  }
  const intent = parseLocalIntent(studentQuestion);
  if (intent.action === "add_transaction" || intent.action === "add_regular_expense" || intent.action === "add_regular_income") return intent;
  const weeklyExpenseTotal = getWeeklyExpenseTotal();
  const weeklySpendingLimit = getBaseWeeklyBudget();
  const regularIncome = getWeeklyRegularIncome(appState.regularIncome);
  const regularExpenses = getWeeklyRecurringTotal(appState.recurringExpenses);
  const goalReduction = getWeeklyGoalReduction();
  const effectiveBudget = weeklySpendingLimit + regularIncome - regularExpenses - goalReduction;
  const remainingWeeklyBudget = effectiveBudget - weeklyExpenseTotal;
  if (/presupuesto|queda|disponible|saldo/.test(normalizedQuestion)) {
    return { action: "question", response: remainingWeeklyBudget >= 0
      ? `Esta semana llevas ${formatMoney(weeklyExpenseTotal)} en gastos. Tu presupuesto efectivo es ${formatMoney(effectiveBudget)}, así que todavía tienes ${formatMoney(remainingWeeklyBudget)} disponibles después de considerar ingresos regulares y metas activas. Te recomiendo conservar una parte antes de gastar en algo flexible.`
      : `Esta semana llevas ${formatMoney(weeklyExpenseTotal)} y has superado tu presupuesto efectivo de ${formatMoney(effectiveBudget)} por ${formatMoney(Math.abs(remainingWeeklyBudget))}. Revisa los gastos no esenciales y evita sumar compromisos hasta recuperar margen.` };
  }
  if (/hola|buenas|hey/.test(normalizedQuestion)) {
    return { action: "question", response: "¡Hola! Puedo consultar tu presupuesto, registrar gastos o ingresos puntuales y guardar movimientos regulares por lenguaje natural. Por ejemplo: “gané 1500bs”, “gasté 900 en una empanada” o “a la semana gasto 5000bs en almuerzos”." };
  }
  return { action: "question", response: "Puedo ayudarte con tu presupuesto, anotar ingresos y gastos, calcular metas o explicar cómo aumentar tu margen semanal. Cuéntame el monto y el tipo de movimiento, o pregunta qué significa un resultado del resumen." };
}

function appendAssistantMessage(assistantTranscript, messageText, messageClass) {
  const assistantMessage = document.createElement("p");
  assistantMessage.className = messageClass;
  assistantMessage.textContent = messageText;
  assistantTranscript.append(assistantMessage);
}

function executeAssistantAction(intent) {
  const data = intent.data || {};
  if (intent.action === "add_transaction" && Number.isSafeInteger(Number(data.monto_ves)) && Number(data.monto_ves) > 0) {
    saveTransaction({
      id: `transaction-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tipo: data.tipo || "expense",
      descripcion: data.descripcion || (data.tipo === "income" ? "Ingreso registrado" : "Gasto registrado"),
      monto_ves: Number(data.monto_ves),
      categoria: data.categoria || (data.tipo === "income" ? "Otro ingreso" : "Imprevistos"),
      fecha: data.fecha || new Date().toISOString(),
      mensaje_original: "Registrado por el asistente"
    });
  }
  if (intent.action === "add_regular_expense" && appState.recurringController) {
    appState.recurringController.addRule({
      id: `recurring-${Date.now()}`,
      descripcion: data.descripcion || "Gasto regular",
      monto_ves: Number(data.monto_ves),
      categoria: data.categoria || "Imprevistos",
      frecuencia: data.frecuencia || "weekly",
      veces_semana: Number(data.veces_semana || 1)
    });
  }
  if (intent.action === "add_regular_income" && appState.regularIncomeController) {
    appState.regularIncomeController.addRule({
      id: `regular-income-${Date.now()}`,
      descripcion: data.descripcion || "Ingreso regular",
      monto_ves: Number(data.monto_ves),
      categoria: data.categoria || "Otro ingreso",
      frecuencia: data.frecuencia || "weekly"
    });
  }
}

async function handleAssistantQuestion(submitEvent, assistantInput, assistantTranscript) {
  submitEvent.preventDefault();
  const studentQuestion = assistantInput.value.trim();
  if (!studentQuestion) return;
  appendAssistantMessage(assistantTranscript, studentQuestion, "assistant-question");
  assistantInput.value = "";
  if (appState.pendingAssistantAction) {
    const categoryMatch = ["Beca", "Trabajo", "Apoyo familiar", "Otro ingreso", "Comida", "Transporte", "Copias y materiales", "Imprevistos"]
      .find((category) => studentQuestion.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(category.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()));
    if (categoryMatch) {
      appState.pendingAssistantAction.data = { ...appState.pendingAssistantAction.data, categoria: categoryMatch };
      executeAssistantAction(appState.pendingAssistantAction);
      appendAssistantMessage(assistantTranscript, `Listo: confirmé “${categoryMatch}” y guardé el movimiento. Puedes revisar el resumen y el historial para ver el impacto actualizado.`, "assistant-reply");
      appState.pendingAssistantAction = null;
      assistantTranscript.scrollTop = assistantTranscript.scrollHeight;
      return;
    }
  }
  let intent;
  if (appState.assistantMode !== "online" || !navigator.onLine || !getStoredGeminiApiKey()) {
    intent = getAssistantFallbackReply(studentQuestion);
  } else {
    try {
      intent = await askGemini(studentQuestion, {
        presupuestoBase: getBaseWeeklyBudget(),
        gastosSemana: getWeeklyExpenseTotal(),
        ingresosRegulares: appState.regularIncome,
        metas: getGoals()
      });
    } catch (error) {
      intent = getAssistantFallbackReply(studentQuestion);
    }
  }

  if (intent.action === "clarify" || !intent.action) {
    appState.pendingAssistantAction = null;
  } else if (intent.action.startsWith("add_")) {
    const data = intent.data || {};
    const missingCategory = !data.categoria;
    if (missingCategory) {
      appState.pendingAssistantAction = intent;
      intent.action = "clarify";
      intent.response = data.tipo === "income"
        ? "¿En qué categoría debería registrar el ingreso: Beca, Trabajo, Apoyo familiar u Otro ingreso?"
        : "¿En qué categoría debería ir el gasto: Comida, Transporte, Copias y materiales o Imprevistos?";
    } else {
      executeAssistantAction(intent);
    }
  }
  appendAssistantMessage(assistantTranscript, intent.response || "Puedo seguirte ayudando. Intenta indicar el monto, la categoría y si el movimiento es puntual o regular.", "assistant-reply");
  assistantTranscript.scrollTop = assistantTranscript.scrollHeight;
}

// Vincula las preguntas estudiantiles con las respuestas financieras locales.
function setAssistantMode(mode, updateLabel = true) {
  appState.assistantMode = mode;
  const toggle = document.querySelector("#assistant-mode-toggle");
  const label = document.querySelector("#assistant-mode-label");
  const isOnline = mode === "online";
  if (toggle) {
    toggle.setAttribute("aria-checked", String(isOnline));
    toggle.classList.toggle("is-offline", !isOnline);
  }
  if (label && updateLabel) {
    label.textContent = !isOnline || !navigator.onLine
      ? "IA: Sin conexión"
      : getStoredGeminiApiKey() ? "IA: Con conexión" : "IA: Respaldo local";
  }
}

function initializeAssistantModeSwitch() {
  const toggle = document.querySelector("#assistant-mode-toggle");
  setAssistantMode(navigator.onLine ? "online" : "offline");
  toggle.addEventListener("click", () => {
    setAssistantMode(appState.assistantMode === "online" ? "offline" : "online");
  });
  window.addEventListener("online", () => setAssistantMode("online"));
  window.addEventListener("offline", () => setAssistantMode("offline"));
}

function initializeApiKeySettings() {
  const apiKeyInput = document.querySelector("#gemini-api-key");
  const apiKeyStatus = document.querySelector("#api-key-status");
  const saveButton = document.querySelector("#save-api-key");
  const removeButton = document.querySelector("#remove-api-key");
  const visibilityButton = document.querySelector("#toggle-api-key-visibility");

  function renderApiKeyStatus() {
    const configuredApiKey = getStoredGeminiApiKey();
    apiKeyInput.value = configuredApiKey;
    apiKeyStatus.textContent = configuredApiKey
      ? `API Key guardada (${configuredApiKey.slice(0, 6)}…${configuredApiKey.slice(-4)}).`
      : "Sin API Key configurada.";
  }

  visibilityButton.addEventListener("click", () => {
    const isHidden = apiKeyInput.type === "password";
    apiKeyInput.type = isHidden ? "text" : "password";
    visibilityButton.textContent = isHidden ? "Ocultar" : "Mostrar";
    visibilityButton.setAttribute("aria-label", isHidden ? "Ocultar API Key" : "Mostrar API Key");
  });

  saveButton.addEventListener("click", () => {
    if (!saveStoredGeminiApiKey(apiKeyInput.value)) {
      apiKeyStatus.textContent = "Ingresa una API Key válida antes de guardarla.";
      apiKeyStatus.className = "api-key-status is-warning";
      return;
    }
    apiKeyStatus.className = "api-key-status";
    renderApiKeyStatus();
    setAssistantMode(appState.assistantMode);
    showAppNotice("API Key de Google AI Studio guardada.");
  });

  removeButton.addEventListener("click", () => {
    clearStoredGeminiApiKey();
    apiKeyInput.value = "";
    apiKeyStatus.textContent = "API Key eliminada. El asistente usará el respaldo local.";
    apiKeyStatus.className = "api-key-status";
    setAssistantMode(appState.assistantMode);
    showAppNotice("API Key eliminada.");
  });

  renderApiKeyStatus();
}

function initializeAssistant() {
  initializeAssistantModeSwitch();
  initializeApiKeySettings();
  const assistantForm = document.querySelector("#assistant-form");
  const assistantInput = document.querySelector("#assistant-input");
  const assistantTranscript = document.querySelector("#assistant-transcript");
  assistantForm.addEventListener("submit", (submitEvent) => handleAssistantQuestion(submitEvent, assistantInput, assistantTranscript));
}

function prefillHeadphoneSavingsGoal() {
  document.querySelector("#goal-name").value = "Audífonos para clases";
  document.querySelector("#goal-target").value = "18900";
  const suggestedGoalDate = new Date();
  suggestedGoalDate.setDate(suggestedGoalDate.getDate() + 56);
  document.querySelector("#goal-date").value = suggestedGoalDate.toISOString().slice(0, 10);
  setView("plans");
  document.querySelector("#goal-target").focus();
}

function initializeMarketGoalShortcut() {
  document.querySelector("#create-headphones-goal").addEventListener("click", prefillHeadphoneSavingsGoal);
}

function renderCurrentDateLabel() {
  document.querySelector("#today-label").textContent = new Intl.DateTimeFormat("es-VE", { weekday: "short", day: "numeric", month: "short" }).format(new Date());
}

function normalizeStoredTransactions(storedTransactions, historicalTransactions) {
  const transactionRecords = Array.isArray(storedTransactions) ? storedTransactions : [];
  return transactionRecords.map((transaction) => ({
    ...transaction,
    tipo: transaction.tipo === "income" ? "income" : "expense"
  }));
}

function initializeRecurringExpenses() {
  appState.recurringController = initializeRecurring({
    notify: showAppNotice,
    onChange: (recurringExpenseRules) => {
      appState.recurringExpenses = recurringExpenseRules;
      renderFinancialViews();
    }
  });
  appState.recurringExpenses = appState.recurringController.getRules();
}

function initializeTransactionEntry() {
  appState.transactionEditor = initializeTransactionForm({
    notify: showAppNotice,
    onSave: saveTransaction
  });
}

function initializeRegularIncome() {
  appState.regularIncomeController = initializeRegularIncomeModule({
    notify: showAppNotice,
    onChange: (regularIncomeRules) => {
      appState.regularIncome = regularIncomeRules;
      renderFinancialViews();
    }
  });
  appState.regularIncome = appState.regularIncomeController.getRules();
}

function initializeTransactionExport() {
  document.querySelector("#export-button").addEventListener("click", () => {
    if (!exportExpenses(appState.transactions)) showAppNotice("No hay movimientos para exportar.", "warning");
  });
}

function openBudgetSetup(allowCancel = false) {
  const modal = document.querySelector("#budget-modal");
  modal.hidden = false;
  document.querySelector("#cancel-budget-edit").hidden = !allowCancel;
  if (appState.budgetConfig) {
    document.querySelector("#budget-period").value = appState.budgetConfig.period;
    document.querySelector("#budget-amount").value = appState.budgetConfig.amountVES;
    document.querySelectorAll("[data-budget-period]").forEach((button) => {
      const selected = button.dataset.budgetPeriod === appState.budgetConfig.period;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }
  document.querySelector("#budget-amount").focus();
}

function initializeBudgetSetup() {
  appState.budgetConfig = loadLocal(BUDGET_CONFIG_STORAGE_KEY, null);
  if (!appState.budgetConfig || !Number.isSafeInteger(Number(appState.budgetConfig.amountVES)) || Number(appState.budgetConfig.amountVES) <= 0) {
    appState.budgetConfig = null;
  }

  const form = document.querySelector("#budget-config-form");
  const periodField = document.querySelector("#budget-period");
  const amountField = document.querySelector("#budget-amount");
  const feedback = document.querySelector("#budget-config-feedback");
  const label = document.querySelector("#budget-amount-label");

  document.querySelectorAll("[data-budget-period]").forEach((button) => {
    button.addEventListener("click", () => {
      periodField.value = button.dataset.budgetPeriod;
      document.querySelectorAll("[data-budget-period]").forEach((option) => {
        const selected = option === button;
        option.classList.toggle("is-selected", selected);
        option.setAttribute("aria-pressed", String(selected));
      });
      label.firstChild.textContent = button.dataset.budgetPeriod === "weekly"
        ? "Presupuesto semanal (VES)"
        : "Presupuesto mensual (VES)";
    });
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const amountVES = Number(amountField.value);
    if (!Number.isSafeInteger(amountVES) || amountVES <= 0) {
      feedback.textContent = "Ingresa un monto positivo en VES.";
      feedback.className = "form-feedback is-error";
      return;
    }
    const period = periodField.value === "monthly" ? "monthly" : "weekly";
    appState.budgetConfig = {
      period,
      amountVES,
      weeklyLimitVES: period === "monthly" ? Math.ceil(amountVES / 4.345) : amountVES,
      updatedAt: new Date().toISOString()
    };
    saveLocal(BUDGET_CONFIG_STORAGE_KEY, appState.budgetConfig);
    document.querySelector("#budget-modal").hidden = true;
    feedback.textContent = "";
    showAppNotice("Presupuesto configurado.");
    renderFinancialViews();
  });

  function closeBudgetSetup() {
    document.querySelector("#budget-modal").hidden = true;
  }

  document.querySelector("#cancel-budget-edit").addEventListener("click", closeBudgetSetup);
  document.querySelector("#close-budget-modal").addEventListener("click", closeBudgetSetup);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeBudgetSetup();
  });

  document.querySelector("#edit-budget-button").addEventListener("click", () => openBudgetSetup(true));
  if (!appState.budgetConfig) openBudgetSetup(false);
}

function initializeFeatureModules() {
  initializeNavigation();
  initializeBudgetSetup();
  renderCurrentDateLabel();
  initializeAssistant();
  initializeMarket(appState.financialData);
  initializeMarketGoalShortcut();
  initializePlans({ notify: showAppNotice, onChange: renderFinancialViews });
  initializeRecurringExpenses();
  initializeRegularIncome();
  initializeTransactionEntry();
  initializeTransactionExport();
}

// Carga los datos, normaliza el registro legado e inicia los controladores de cada vista.
async function initializeApp() {
  try {
    appState.financialData = await loadAppData();
    const storedTransactions = loadLocal(TRANSACTION_STORAGE_KEY, null);
    appState.transactions = normalizeStoredTransactions(storedTransactions, appState.financialData.gastos_historicos);
    initializeFeatureModules();
    renderFinancialViews();
    await initializeCurrency(appState.financialData.tasas_respaldo, showAppNotice);
  } catch (initializationError) {
    console.error(initializationError);
    document.querySelector("#page-title").textContent = "No se pudo iniciar";
    showAppNotice("No se pudieron cargar los datos. Abre UniFinanzas mediante un servidor local.", "warning");
  }
}

initializeApp();
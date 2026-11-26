import { CATEGORIES, INCOME_CATEGORIES, filterByPeriod, formatDate, formatMoney, transactionType } from "./finance.js";

// Muestra movimientos filtrados y conecta sus acciones de edición y borrado.
export function renderExpenseTable(transactions, period, { onEdit, onDelete } = {}) {
  const transactionsInSelectedPeriod = [...filterByPeriod(transactions, period)]
    .sort((newerTransaction, olderTransaction) => new Date(olderTransaction.fecha) - new Date(newerTransaction.fecha));
  const expenseTableBody = document.querySelector("#expense-table-body");
  expenseTableBody.replaceChildren();
  document.querySelector("#table-count").textContent = String(transactionsInSelectedPeriod.length);
  document.querySelector("#expenses-summary").textContent = `${transactionsInSelectedPeriod.length} ${transactionsInSelectedPeriod.length === 1 ? "movimiento" : "movimientos"} · ${period === "week" ? "semana" : period === "month" ? "mes" : "año"}`;
  document.querySelector("#ledger-caption").textContent = `Movimientos del ${period === "week" ? "periodo semanal" : period === "month" ? "mes actual" : "año actual"}`;

  if (!transactionsInSelectedPeriod.length) {
    const emptyTransactionRow = document.createElement("tr");
    emptyTransactionRow.className = "empty-row";
    emptyTransactionRow.innerHTML = '<td colspan="6">No hay movimientos en este periodo.</td>';
    expenseTableBody.append(emptyTransactionRow);
    return;
  }
  for (const transaction of transactionsInSelectedPeriod) {
    const transactionRow = createTransactionRow(transaction, { onEdit, onDelete });
    expenseTableBody.append(transactionRow);
  }
}

function createTransactionRow(transaction, { onEdit, onDelete }) {
  const transactionRow = document.createElement("tr");
  const transactionKind = transactionType(transaction);
  transactionRow.className = transactionKind === "income" ? "income-row" : "";
  transactionRow.innerHTML = `<td><span class="expense-description"><span class="category-mark">·</span><span class="expense-description-copy"><strong class="expense-title"></strong><small class="expense-meta"></small></span></span></td><td><span class="transaction-kind ${transactionKind}"></span></td><td><span class="category-name"></span></td><td class="expense-date"></td><td class="amount-cell"></td><td><div class="row-actions"><button class="row-action edit-action" type="button">Editar</button><button class="row-action delete-action" type="button">Eliminar</button></div></td>`;
  transactionRow.querySelector(".expense-title").textContent = transaction.descripcion;
  transactionRow.querySelector(".expense-meta").textContent = `${transaction.categoria} · ${formatDate(transaction.fecha)}`;
  transactionRow.querySelector(".transaction-kind").textContent = transactionKind === "income" ? "Ingreso" : "Gasto";
  transactionRow.querySelector(".category-name").textContent = transaction.categoria;
  transactionRow.querySelector(".expense-date").textContent = formatDate(transaction.fecha);
  transactionRow.querySelector(".amount-cell").textContent = `${transactionKind === "income" ? "+" : "−"}${formatMoney(transaction.monto_ves)}`;
  const editButton = transactionRow.querySelector(".edit-action");
  const deleteButton = transactionRow.querySelector(".delete-action");
  editButton.setAttribute("aria-label", `Editar ${transactionKind === "income" ? "ingreso" : "gasto"}: ${transaction.descripcion}`);
  deleteButton.setAttribute("aria-label", `Eliminar ${transactionKind === "income" ? "ingreso" : "gasto"}: ${transaction.descripcion}`);
  editButton.title = "Editar movimiento";
  deleteButton.title = "Eliminar movimiento";
  editButton.addEventListener("click", () => onEdit?.(transaction));
  deleteButton.addEventListener("click", () => onDelete?.(transaction));
  return transactionRow;
}

function updateTransactionTypeOptions(transactionTypeValue, categorySelect, selectedCategory) {
  const categoriesForType = transactionTypeValue === "income" ? INCOME_CATEGORIES : CATEGORIES;
  categorySelect.replaceChildren(...categoriesForType.map((categoryName) => new Option(categoryName, categoryName)));
  if (selectedCategory && categoriesForType.includes(selectedCategory)) categorySelect.value = selectedCategory;
}

function validateManualTransaction(description, amountVES, transactionDate) {
  if (!description.trim() || !Number.isSafeInteger(amountVES) || amountVES <= 0 || !transactionDate) {
    return "Completa los campos y usa un monto positivo en VES.";
  }
  return "";
}

function createManualTransaction({ editingId, transactionTypeValue, transactionDescription, amountVES, transactionCategory, transactionDate }) {
  const localToday = new Date().toISOString().slice(0, 10);
  const transactionDateISO = transactionDate === localToday
    ? new Date().toISOString()
    : new Date(`${transactionDate}T12:00:00`).toISOString();
  return {
    id: editingId || `transaction-${Date.now()}`,
    tipo: transactionTypeValue,
    descripcion: transactionDescription.trim(),
    monto_ves: amountVES,
    categoria: transactionCategory,
    fecha: transactionDateISO,
    mensaje_original: "Registro manual"
  };
}

// Vincula controles del formulario y conserva la identidad del movimiento al editarlo.
export function initializeTransactionForm({ onSave, notify }) {
  const transactionForm = document.querySelector("#transaction-form");
  const transactionTypeField = document.querySelector("#transaction-type");
  const categorySelect = document.querySelector("#transaction-category");
  const descriptionField = document.querySelector("#transaction-description");
  const amountField = document.querySelector("#transaction-amount");
  const dateField = document.querySelector("#transaction-date");
  const transactionSubmitButton = document.querySelector("#transaction-submit");
  const cancelEditButton = document.querySelector("#cancel-transaction-edit");
  const transactionFeedback = document.querySelector("#transaction-feedback");
  let editingId = null;

  function setTransactionType(transactionTypeValue, selectedCategory) {
    transactionTypeField.value = transactionTypeValue;
    document.querySelectorAll("[data-transaction-mode]").forEach((modeButton) => {
      const modeIsSelected = modeButton.dataset.transactionMode === transactionTypeValue;
      modeButton.classList.toggle("is-selected", modeIsSelected);
      modeButton.setAttribute("aria-pressed", String(modeIsSelected));
    });
    updateTransactionTypeOptions(transactionTypeValue, categorySelect, selectedCategory);
  }

  function resetTransactionForm() {
    transactionForm.reset();
    editingId = null;
    setTransactionType("expense");
    dateField.value = new Date().toISOString().slice(0, 10);
    document.querySelector("#transaction-form-heading").textContent = "Añadir al presupuesto";
    transactionSubmitButton.innerHTML = "Añadir movimiento <span>→</span>";
    cancelEditButton.hidden = true;
    transactionFeedback.textContent = "";
    transactionFeedback.className = "form-feedback";
  }

  function beginTransactionEdit(transaction) {
    editingId = transaction.id;
    setTransactionType(transactionType(transaction), transaction.categoria);
    descriptionField.value = transaction.descripcion;
    amountField.value = transaction.monto_ves;
    dateField.value = new Date(transaction.fecha).toISOString().slice(0, 10);
    document.querySelector("#transaction-form-heading").textContent = "Editar movimiento";
    transactionSubmitButton.innerHTML = "Guardar cambios <span>✓</span>";
    cancelEditButton.hidden = false;
    transactionFeedback.textContent = `Editando: ${transaction.descripcion}`;
    transactionFeedback.className = "form-feedback";
    transactionForm.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  setTransactionType("expense");
  dateField.value = new Date().toISOString().slice(0, 10);
  for (const modeButton of document.querySelectorAll("[data-transaction-mode]")) {
    modeButton.addEventListener("click", () => setTransactionType(modeButton.dataset.transactionMode));
  }
  cancelEditButton.addEventListener("click", resetTransactionForm);
  transactionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const amountVES = Number(amountField.value);
    const validationMessage = validateManualTransaction(descriptionField.value, amountVES, dateField.value);
    if (validationMessage) {
      transactionFeedback.textContent = validationMessage;
      transactionFeedback.className = "form-feedback is-error";
      return;
    }
    const manualTransaction = createManualTransaction({
      editingId,
      transactionTypeValue: transactionTypeField.value,
      transactionDescription: descriptionField.value,
      amountVES,
      transactionCategory: categorySelect.value,
      transactionDate: dateField.value
    });
    onSave(manualTransaction, Boolean(editingId));
    resetTransactionForm();
  });

  return {
    edit: beginTransactionEdit,
    reset: resetTransactionForm
  };
}

// Presenta los campos que se reconocieron en el mensaje de gasto.
export function renderInterpretation(transaction) {
  const interpretationPanel = document.querySelector("#interpretation-result");
  if (!interpretationPanel) return;
  interpretationPanel.replaceChildren();
  const originalMessageQuote = document.createElement("p");
  originalMessageQuote.className = "interpretation-quote";
  originalMessageQuote.textContent = `“${transaction.mensaje_original}”`;
  interpretationPanel.append(originalMessageQuote);
  const transactionDetails = document.createElement("div");
  transactionDetails.className = "interpretation-fields";
  const interpretationFields = [
    [transaction.monto_estimado ? "Precio habitual" : "Monto", formatMoney(transaction.monto_ves)],
    ["Categoría", transaction.categoria],
    ["Descripción", transaction.descripcion]
  ];
  for (const [fieldLabel, fieldValue] of interpretationFields) {
    const interpretationField = document.createElement("div");
    interpretationField.className = "interpretation-field";
    const interpretationLabel = document.createElement("span");
    interpretationLabel.textContent = fieldLabel;
    const interpretationValue = document.createElement("strong");
    interpretationValue.textContent = fieldValue;
    interpretationField.append(interpretationLabel, interpretationValue);
    transactionDetails.append(interpretationField);
  }
  transactionDetails.lastElementChild.classList.add("wide");
  interpretationPanel.append(transactionDetails);
}

function buildTransactionsCSV(transactions) {
  const csvHeadings = ["Tipo", "Fecha", "Descripción", "Monto (VES)", "Categoría", "Mensaje original"];
  const transactionRows = transactions.map((transaction) => [
    transactionType(transaction) === "income" ? "Ingreso" : "Gasto",
    new Date(transaction.fecha).toLocaleString("es-VE"),
    transaction.descripcion,
    transaction.monto_ves,
    transaction.categoria,
    transaction.mensaje_original
  ]);
  const escapeCSVCell = (cellValue) => `"${String(cellValue).replace(/"/g, '""')}"`;
  return `\uFEFF${[csvHeadings, ...transactionRows].map((transactionRow) => transactionRow.map(escapeCSVCell).join(";")).join("\r\n")}`;
}

function triggerTransactionDownload(fileContent, fileType, fileName) {
  const downloadBlob = new Blob([fileContent], { type: fileType });
  const downloadURL = URL.createObjectURL(downloadBlob);
  const downloadLink = document.createElement("a");
  downloadLink.href = downloadURL;
  downloadLink.download = fileName;
  downloadLink.click();
  URL.revokeObjectURL(downloadURL);
}

// Descarga los movimientos como JSON o CSV compatible con Excel.
export function exportExpenses(transactions) {
  if (!transactions.length) return false;
  const shouldExportJSON = window.confirm("Aceptar para exportar JSON. Cancelar para exportar CSV compatible con Excel.");
  const fileContent = shouldExportJSON ? JSON.stringify(transactions, null, 2) : buildTransactionsCSV(transactions);
  const fileType = shouldExportJSON ? "application/json;charset=utf-8" : "text/csv;charset=utf-8";
  const fileName = shouldExportJSON ? "unifinanzas-gastos.json" : "unifinanzas-gastos.csv";
  triggerTransactionDownload(fileContent, fileType, fileName);
  return true;
}
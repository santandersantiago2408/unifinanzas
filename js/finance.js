const vesCurrencyFormatter = new Intl.NumberFormat("es-VE", { maximumFractionDigits: 2 });
const transactionDateFormatter = new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "short", year: "numeric" });
export const CATEGORIES = ["Comida", "Transporte", "Copias y materiales", "Imprevistos"];
export const INCOME_CATEGORIES = ["Beca", "Trabajo", "Apoyo familiar", "Otro ingreso"];
export const transactionType = (transaction) => transaction.tipo === "income" ? "income" : "expense";

export const formatMoney = (amountVES) => `Bs. ${vesCurrencyFormatter.format(amountVES)}`;
export const formatDate = (transactionDate) => transactionDateFormatter.format(new Date(transactionDate));
export const normalizeText = (text) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");

// Calcula los límites calendario del resumen seleccionado.
export function getRange(periodKey, referenceDate = new Date()) {
  const rangeStart = new Date(referenceDate);
  rangeStart.setHours(0, 0, 0, 0);
  if (periodKey === "week") {
    rangeStart.setDate(rangeStart.getDate() - ((rangeStart.getDay() + 6) % 7));
    const rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeEnd.getDate() + 7);
    return { start: rangeStart, end: rangeEnd, label: "Semana" };
  }
  if (periodKey === "month") {
    rangeStart.setDate(1);
    const rangeEnd = new Date(rangeStart);
    rangeEnd.setMonth(rangeEnd.getMonth() + 1);
    return { start: rangeStart, end: rangeEnd, label: "Mes" };
  }
  rangeStart.setMonth(0, 1);
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setFullYear(rangeEnd.getFullYear() + 1);
  return { start: rangeStart, end: rangeEnd, label: "Año" };
}

// Filtra movimientos dentro del periodo y hasta la fecha de consulta.
export function filterByPeriod(transactions, periodKey, referenceDate = new Date()) {
  const { start: rangeStart, end: rangeEnd } = getRange(periodKey, referenceDate);
  return transactions.filter((transaction) => {
    const transactionDate = new Date(transaction.fecha);
    return Number.isFinite(transactionDate.getTime()) && transactionDate >= rangeStart && transactionDate < rangeEnd && transactionDate <= referenceDate;
  });
}

function findHabitualProduct(normalizedMessage, habitualPrices) {
  return habitualPrices.find((priceRecord) => {
    const productSynonyms = priceRecord.sinonimos || [priceRecord.producto];
    return productSynonyms.some((synonym) => normalizedMessage.includes(normalizeText(synonym)));
  });
}

function parseExpenseAmountVES(originalMessage, matchedProduct) {
  const amountMatch = originalMessage.match(/(?:^|\s)([−-]?\s*(?:\d{1,3}(?:[.,]\d{3})+|\d[\d.,]*))(?=\s|$)/);
  const amountText = amountMatch?.[1].replace(/\s/g, "");
  if (amountText?.startsWith("-") || amountText?.startsWith("−")) {
    return { error: "El monto debe ser positivo. Revisa el importe e inténtalo otra vez." };
  }
  const amountVES = amountText ? Number(amountText.replace(/[.,]/g, "")) : Number(matchedProduct?.precio_ves);
  if (!Number.isSafeInteger(amountVES) || amountVES <= 0) {
    return { error: "No encontré un monto válido. Incluye una cantidad positiva en VES." };
  }
  return { amountVES, amountWasEstimated: !amountText && Boolean(matchedProduct) };
}

function inferExpenseCategory(normalizedMessage, matchedProduct) {
  if (CATEGORIES.includes(matchedProduct?.categoria)) return matchedProduct.categoria;
  if (/pasaje|bus|autobus|taxi|transporte/.test(normalizedMessage)) return "Transporte";
  if (/impresion|copia|fotocopia|cuaderno|lapiz|material/.test(normalizedMessage)) return "Copias y materiales";
  if (/comida|almuerzo|desayuno|arepa|empanada|malta|cafe/.test(normalizedMessage)) return "Comida";
  return "Imprevistos";
}

function createExpenseDescription(originalMessage, matchedProduct) {
  if (matchedProduct) {
    return matchedProduct.producto.charAt(0).toLocaleUpperCase("es") + matchedProduct.producto.slice(1);
  }
  return originalMessage
    .replace(/\b(gaste|gast[eé]|pague|pagu[eé]|compre|compr[eé]|fueron|son|por|de|en|bs\.?|ves)\b/gi, " ")
    .replace(/[\d.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (initialLetter) => initialLetter.toLocaleUpperCase("es")) || "Gasto registrado";
}

// Convierte una frase de gasto en un movimiento validado del esquema local.
export function extractExpense(originalMessage, habitualPrices) {
  const normalizedMessage = normalizeText(originalMessage);
  const matchedProduct = findHabitualProduct(normalizedMessage, habitualPrices);
  const parsedAmount = parseExpenseAmountVES(originalMessage, matchedProduct);
  if (parsedAmount.error) return parsedAmount;
  return {
    id: `expense-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fecha: new Date().toISOString(),
    descripcion: createExpenseDescription(originalMessage, matchedProduct),
    monto_ves: parsedAmount.amountVES,
    categoria: inferExpenseCategory(normalizedMessage, matchedProduct),
    mensaje_original: originalMessage,
    producto_detectado: matchedProduct?.producto || null,
    precio_habitual_ves: matchedProduct?.precio_ves || null,
    monto_estimado: parsedAmount.amountWasEstimated
  };
}

// Calcula la referencia presupuestaria proporcional al periodo mostrado.
export function getPeriodBudget(weeklySpendingLimitVES, periodKey) {
  const periodMultiplier = { week: 1, month: 4.345, year: 52 }[periodKey] || 1;
  return weeklySpendingLimitVES * periodMultiplier;
}
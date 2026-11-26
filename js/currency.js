import { loadExchangeRates } from "./data.js?v=20261124-usdt";
import { formatMoney } from "./finance.js";

const CURRENCY_NAMES = {
  VES: "Bolívares",
  USD_BCV: "Dólar BCV",
  EUR_BCV: "Euro BCV",
  USDT_REF: "USDT Binance P2P"
};
let currentExchangeRates;

function describeExchangeRateSource(exchangeRateData) {
  if (exchangeRateData.mode === "live") return "Actualizadas desde la fuente hoy";
  if (exchangeRateData.mode === "partial") return "Actualización parcial · se conservaron tasas en caché";
  if (exchangeRateData.mode === "cache") return "Tasas de hoy guardadas en este navegador";
  if (exchangeRateData.mode === "stale") return "Sin conexión · se muestra la última tasa guardada";
  return "Sin conexión · valores de respaldo, podrían estar desactualizados";
}

function renderExchangeRateCards() {
  const exchangeRateGrid = document.querySelector("#rate-grid");
  exchangeRateGrid.replaceChildren();
  const exchangeRateCards = [
    ["USD_BCV", "DÓLAR BCV"],
    ["EUR_BCV", "EURO BCV"],
    ["USDT_REF", "USDT · BINANCE P2P"]
  ];
  for (const [currencyKey, currencyLabel] of exchangeRateCards) {
    const exchangeRateCard = document.createElement("article");
    exchangeRateCard.className = "rate-card";
    exchangeRateCard.innerHTML = `<div><p></p><span>VES</span></div><strong></strong><small></small>`;
    exchangeRateCard.querySelector("p").textContent = currencyLabel;
    exchangeRateCard.querySelector("strong").textContent = `${formatMoney(currentExchangeRates.rates[currencyKey])} / unidad`;
    exchangeRateCard.querySelector("small").textContent = currencyKey === "USDT_REF" ? "Fuente: Binance P2P · Venezuela" : "Fuente: DolarAPI · referencia pública";
    exchangeRateGrid.append(exchangeRateCard);
  }
  const updateDateLabel = currentExchangeRates.updatedAt
    ? new Date(currentExchangeRates.updatedAt).toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short" })
    : "sin fecha";
  const ratesUpdatedStatus = document.querySelector("#rates-updated");
  ratesUpdatedStatus.textContent = `${describeExchangeRateSource(currentExchangeRates)} · ${updateDateLabel}`;
  ratesUpdatedStatus.classList.toggle("is-stale", ["fallback", "stale", "partial"].includes(currentExchangeRates.mode));
  const topStatus = document.querySelector("#rate-status");
  const statusDot = document.createElement("span");
  statusDot.className = "status-dot";
  topStatus.replaceChildren(statusDot, document.createTextNode(currentExchangeRates.mode === "live" || currentExchangeRates.mode === "cache" ? "Tasas al día" : "Tasas de referencia"));
  renderCurrencyConversion();
}

function renderCurrencyConversion() {
  if (!currentExchangeRates) return;
  const amountToConvert = Number(document.querySelector("#conversion-amount").value);
  const sourceCurrency = document.querySelector("#conversion-from").value;
  const targetCurrency = document.querySelector("#conversion-to").value;
  const conversionOutput = document.querySelector("#conversion-result");
  if (!Number.isFinite(amountToConvert) || amountToConvert < 0) {
    conversionOutput.textContent = "Introduce una cantidad válida.";
    return;
  }
  const sourceRateVES = sourceCurrency === "VES" ? 1 : Number(currentExchangeRates.rates[sourceCurrency]);
  const targetRateVES = targetCurrency === "VES" ? 1 : Number(currentExchangeRates.rates[targetCurrency]);
  if (!sourceRateVES || !targetRateVES) {
    conversionOutput.textContent = "No hay tasas disponibles para esa conversión.";
    return;
  }
  const convertedAmount = amountToConvert * sourceRateVES / targetRateVES;
  const conversionFormatter = new Intl.NumberFormat("es-VE", { maximumSignificantDigits: 6 });
  conversionOutput.textContent = `${conversionFormatter.format(amountToConvert)} ${CURRENCY_NAMES[sourceCurrency]} = ${conversionFormatter.format(convertedAmount)} ${CURRENCY_NAMES[targetCurrency]}`;
}

async function refreshExchangeRates(backupRates, forceRefresh, notify, refreshButton) {
  refreshButton.disabled = true;
  refreshButton.textContent = "Actualizando…";
  try {
    currentExchangeRates = await loadExchangeRates(backupRates, forceRefresh);
    renderExchangeRateCards();
    if (["fallback", "stale"].includes(currentExchangeRates.mode)) {
      notify("No se pudo consultar la fuente. Se muestran tasas de respaldo con su fecha.", "warning");
    }
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = "Actualizar tasas ↻";
  }
}

// Vincula conversión y actualización manual de las tasas de referencia.
export async function initializeCurrency(backupRates, notify) {
  const refreshButton = document.querySelector("#refresh-rates");
  refreshButton.addEventListener("click", () => refreshExchangeRates(backupRates, true, notify, refreshButton));
  document.querySelector("#converter-form").addEventListener("input", renderCurrencyConversion);
  document.querySelector("#swap-currencies").addEventListener("click", () => {
    const sourceCurrencyField = document.querySelector("#conversion-from");
    const targetCurrencyField = document.querySelector("#conversion-to");
    [sourceCurrencyField.value, targetCurrencyField.value] = [targetCurrencyField.value, sourceCurrencyField.value];
    renderCurrencyConversion();
  });
  await refreshExchangeRates(backupRates, false, notify, refreshButton);
}
import { formatMoney, normalizeText } from "./finance.js";

function findMatchingDemoQuote(searchQuery, demoQuotes) {
  const normalizedQuery = normalizeText(searchQuery);
  return demoQuotes.find((demoQuote) => {
    const normalizedProductName = normalizeText(demoQuote.producto);
    return normalizedProductName.includes(normalizedQuery)
      || normalizedQuery.includes(normalizedProductName)
      || /audifono/.test(normalizedQuery);
  });
}

function createDemoOfferCard(demoOffer, lowestOfferPriceVES) {
  const offerCard = document.createElement("article");
  offerCard.className = `offer-card${demoOffer.precio_ves === lowestOfferPriceVES ? " is-lowest" : ""}`;
  offerCard.innerHTML = `<div class="offer-store"><span class="store-mark">⌕</span><div><strong></strong><small>ESCENARIO SIMULADO</small></div></div><div class="offer-price"><strong>${formatMoney(demoOffer.precio_ves)}</strong><span>${demoOffer.precio_ves === lowestOfferPriceVES ? "Menor precio de ejemplo" : "Precio de ejemplo"}</span></div><p></p>`;
  offerCard.querySelector(".offer-store strong").textContent = demoOffer.tienda;
  offerCard.querySelector(".offer-card p").textContent = demoOffer.detalle;
  return offerCard;
}

function renderDemoQuotes(searchQuery, demoQuotes, demoOfferList) {
  document.querySelector("#market-results-title").textContent = searchQuery || "Producto";
  const matchingDemoQuote = findMatchingDemoQuote(searchQuery, demoQuotes);
  demoOfferList.replaceChildren();
  if (!matchingDemoQuote) {
    const emptyResultMessage = document.createElement("p");
    emptyResultMessage.className = "empty-state";
    emptyResultMessage.textContent = "No hay un escenario de ejemplo para esa búsqueda. Usa los enlaces externos para consultar resultados actuales.";
    demoOfferList.append(emptyResultMessage);
    return;
  }
  const lowestOfferPriceVES = Math.min(...matchingDemoQuote.ofertas.map((demoOffer) => demoOffer.precio_ves));
  const sortedDemoOffers = [...matchingDemoQuote.ofertas].sort((firstOffer, secondOffer) => firstOffer.precio_ves - secondOffer.precio_ves);
  for (const demoOffer of sortedDemoOffers) {
    demoOfferList.append(createDemoOfferCard(demoOffer, lowestOfferPriceVES));
  }
}

function updateExternalShoppingLinks(searchQuery) {
  const encodedSearchQuery = encodeURIComponent(searchQuery.trim());
  const shoppingSearchSlug = encodedSearchQuery.replace(/%20/g, "-");
  document.querySelector("#mercado-link").href = `https://listado.mercadolibre.com.ve/${shoppingSearchSlug}`;
  document.querySelector("#web-search-link").href = `https://www.google.com/search?q=${encodedSearchQuery}+tiendas+Venezuela`;
}

// Vincula las cotizaciones simuladas y los enlaces a búsquedas externas.
export function initializeMarket(financialData) {
  const marketSearchForm = document.querySelector("#market-form");
  const productSearchField = document.querySelector("#market-query");
  const demoOfferList = document.querySelector("#offer-list");
  const demoQuotes = financialData.cotizaciones_demo;

  function handleMarketSearch(event) {
    event.preventDefault();
    const searchQuery = productSearchField.value.trim();
    if (!searchQuery) return;
    renderDemoQuotes(searchQuery, demoQuotes, demoOfferList);
    updateExternalShoppingLinks(searchQuery);
  }

  marketSearchForm.addEventListener("submit", handleMarketSearch);
  renderDemoQuotes(productSearchField.value, demoQuotes, demoOfferList);
  updateExternalShoppingLinks(productSearchField.value);
}

function getPersonalSavingsRecommendation(expenseTransactions, savingsGoals, weeklyExpenseTotalVES, weeklySpendingLimitVES) {
  const upcomingSavingsGoal = savingsGoals.find((savingsGoal) => savingsGoal.target > savingsGoal.saved);
  if (weeklyExpenseTotalVES >= weeklySpendingLimitVES * 0.75) {
    return {
      title: "Tu semana ya usa más del 75 % del límite.",
      text: "Antes de un gasto no esencial, revisa cuánto queda y deja primero cubiertos el transporte y los materiales."
    };
  }
  if (upcomingSavingsGoal) {
    const weeksUntilGoal = Math.max(1, Math.ceil((new Date(upcomingSavingsGoal.deadline) - new Date()) / (7 * 24 * 60 * 60 * 1000)));
    const suggestedWeeklySavingsVES = Math.ceil((upcomingSavingsGoal.target - upcomingSavingsGoal.saved) / weeksUntilGoal);
    return {
      title: `Tu próxima meta: ${upcomingSavingsGoal.name}.`,
      text: `Separar aproximadamente ${formatMoney(suggestedWeeklySavingsVES)} por semana te acerca a la fecha que elegiste.`
    };
  }

  const materialsExpenseTotalVES = expenseTransactions
    .filter((expenseTransaction) => expenseTransaction.categoria === "Copias y materiales")
    .reduce((materialsSubtotalVES, expenseTransaction) => materialsSubtotalVES + Number(expenseTransaction.monto_ves), 0);
  if (materialsExpenseTotalVES > 0) {
    return {
      title: "Ya tienes gastos de materiales registrados.",
      text: "Pregunta si hay tarifa por volumen o impresión dúplex antes de pagar la próxima tanda."
    };
  }
  return {
    title: "Un margen pequeño también cuenta.",
    text: "Revisa tus gastos flexibles una vez por semana y ajusta el plan sin castigarte."
  };
}

function renderPersonalSavingsRecommendation(recommendation) {
  const personalTipPanel = document.querySelector("#personal-tip");
  personalTipPanel.innerHTML = `<span class="recommendation-mark">✳</span><div><p class="section-kicker">PARA TI</p><strong></strong><p></p></div>`;
  personalTipPanel.querySelector("strong").textContent = recommendation.title;
  personalTipPanel.querySelector("div > p:last-child").textContent = recommendation.text;
}

function renderSavingsAdviceCards(savingsAdvice) {
  const adviceGrid = document.querySelector("#tips-grid");
  adviceGrid.replaceChildren();
  for (const adviceEntry of savingsAdvice) {
    const adviceCard = document.createElement("article");
    adviceCard.className = "tip-card";
    adviceCard.innerHTML = `<span class="tip-category"></span><span class="tip-mark">✳</span><h3></h3><p></p>`;
    adviceCard.querySelector(".tip-category").textContent = adviceEntry.categoria;
    adviceCard.querySelector("h3").textContent = adviceEntry.titulo;
    adviceCard.querySelector("p").textContent = adviceEntry.texto;
    adviceGrid.append(adviceCard);
  }
}

// Combina consejos del catálogo con una recomendación calculada desde datos del estudiante.
// Renderiza consejos del catálogo y la recomendación más relevante para la semana.
export function renderTips(financialData, expenseTransactions, savingsGoals, weeklyExpenseTotalVES, weeklySpendingLimitVES) {
  const personalRecommendation = getPersonalSavingsRecommendation(expenseTransactions, savingsGoals, weeklyExpenseTotalVES, weeklySpendingLimitVES);
  renderPersonalSavingsRecommendation(personalRecommendation);
  renderSavingsAdviceCards(financialData.consejos);
}
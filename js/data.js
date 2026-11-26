const DATA_URL = new URL("../data.json", import.meta.url);
const RATE_CACHE_KEY = "unifinanzas-rates-v1";

const RATE_ENDPOINTS = {
  USD_BCV: "https://ve.dolarapi.com/v1/dolares/oficial",
  EUR_BCV: "https://ve.dolarapi.com/v1/euros/oficial"
};
const USDT_P2P_ENDPOINT = "https://criptoya.com/api/usdt/ves";

// Carga el catálogo financiero local requerido por todas las vistas.
export async function loadAppData() {
  const financialDataResponse = await fetch(DATA_URL);
  if (!financialDataResponse.ok) throw new Error(`No se pudo cargar data.json: ${financialDataResponse.status}`);
  return financialDataResponse.json();
}

// Lee JSON del almacenamiento local y usa el respaldo ante datos inválidos.
export function loadLocal(storageKey, fallbackValue) {
  try {
    const storedJSON = localStorage.getItem(storageKey);
    return storedJSON === null ? fallbackValue : JSON.parse(storedJSON);
  } catch {
    return fallbackValue;
  }
}

// Persiste un objeto financiero en localStorage sin interrumpir la interfaz.
export function saveLocal(storageKey, storageValue) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(storageValue));
    return true;
  } catch {
    return false;
  }
}

function getLocalDateCacheKey() {
  const currentDate = new Date();
  return `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(currentDate.getDate()).padStart(2, "0")}`;
}

async function fetchUSDTQuote() {
  const quoteResponse = await fetch(USDT_P2P_ENDPOINT, { signal: AbortSignal.timeout(8000) });
  if (!quoteResponse.ok) throw new Error(`La fuente USDT respondió ${quoteResponse.status}`);
  const quotePayload = await quoteResponse.json();
  const binanceQuote = quotePayload.binancep2p;
  const exchangeRateVES = Number(binanceQuote?.totalAsk || binanceQuote?.ask);
  if (!Number.isFinite(exchangeRateVES) || exchangeRateVES <= 0) throw new Error("Cotización USDT inválida");
  return {
    currencyKey: "USDT_REF",
    exchangeRateVES,
    updatedAt: new Date((Number(binanceQuote.time) || Date.now() / 1000) * 1000).toISOString()
  };
}

async function fetchExchangeQuote(currencyKey, endpointURL) {
  const quoteResponse = await fetch(endpointURL, { signal: AbortSignal.timeout(8000) });
  if (!quoteResponse.ok) throw new Error(`La fuente de ${currencyKey} respondió ${quoteResponse.status}`);
  const quotePayload = await quoteResponse.json();
  const exchangeRateVES = Number(quotePayload.promedio);
  if (!Number.isFinite(exchangeRateVES) || exchangeRateVES <= 0) throw new Error(`Tasa inválida para ${currencyKey}`);
  return { currencyKey, exchangeRateVES, updatedAt: quotePayload.fechaActualizacion };
}

function getSuccessfulExchangeQuotes(exchangeQuoteResults) {
  return exchangeQuoteResults
    .filter((quoteResult) => quoteResult.status === "fulfilled")
    .map((quoteResult) => quoteResult.value);
}

function createFallbackExchangeRates(backupRates, cachedRates) {
  if (cachedRates?.rates) {
    const cleanedRates = { ...cachedRates.rates };
    delete cleanedRates.USD_PARALLEL;
    return { ...cachedRates, rates: cleanedRates, mode: "stale" };
  }
  return {
    rates: { ...backupRates.tasas_ves },
    updatedAt: backupRates.fecha_actualizacion,
    mode: "fallback"
  };
}

function mergeExchangeQuotes(successfulQuotes, cachedRates, backupRates, cacheDateKey) {
  const exchangeRates = { ...(cachedRates?.rates || backupRates.tasas_ves) };
  delete exchangeRates.USD_PARALLEL;
  for (const exchangeQuote of successfulQuotes) exchangeRates[exchangeQuote.currencyKey] = exchangeQuote.exchangeRateVES;
  delete exchangeRates.USD_PARALLEL;
  const latestQuoteDate = successfulQuotes.map((exchangeQuote) => exchangeQuote.updatedAt).sort().at(-1);
  return {
    rates: exchangeRates,
    sourceUSDT: "BINANCE_P2P",
    updatedAt: latestQuoteDate,
    cacheDay: cacheDateKey,
    mode: successfulQuotes.length === (Object.keys(RATE_ENDPOINTS).length + 1) ? "live" : "partial"
  };
}

// Usa cache diario, consulta fuentes disponibles y mantiene un respaldo fechado.
export async function loadExchangeRates(backupRates, forceRefresh = false) {
  const cachedExchangeRates = loadLocal(RATE_CACHE_KEY, null);
  const cacheDateKey = getLocalDateCacheKey();
  const hasLegacyParallelCache = cachedExchangeRates?.rates?.USD_PARALLEL !== undefined;
  const hasUSDTCache = cachedExchangeRates?.rates?.USDT_REF !== undefined;
  const hasCorrectUSDTSource = cachedExchangeRates?.sourceUSDT === "BINANCE_P2P";
  if (!forceRefresh && !hasLegacyParallelCache && hasUSDTCache && hasCorrectUSDTSource && cachedExchangeRates?.cacheDay === cacheDateKey && cachedExchangeRates.rates) {
    return { ...cachedExchangeRates, mode: "cache" };
  }

  const exchangeQuoteResults = await Promise.allSettled([
    ...Object.entries(RATE_ENDPOINTS).map(([currencyKey, endpointURL]) => fetchExchangeQuote(currencyKey, endpointURL)),
    fetchUSDTQuote()
  ]);
  const successfulQuotes = getSuccessfulExchangeQuotes(exchangeQuoteResults);
  try {
    successfulQuotes.push(await fetchUSDTQuote());
  } catch (usdtError) {
    console.warn(usdtError);
  }
  if (!successfulQuotes.length) return createFallbackExchangeRates(backupRates, cachedExchangeRates);

  const mergedExchangeRates = mergeExchangeQuotes(successfulQuotes, cachedExchangeRates, backupRates, cacheDateKey);
  saveLocal(RATE_CACHE_KEY, mergedExchangeRates);
  return mergedExchangeRates;
}
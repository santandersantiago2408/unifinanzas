const GEMINI_API_KEY_STORAGE = "unifinanzas-gemini-api-key";
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-3.8-flash", "gemini-3.5-flash-lite"];

export function getStoredGeminiApiKey() {
  try {
    return localStorage.getItem(GEMINI_API_KEY_STORAGE)?.trim() || "";
  } catch {
    return "";
  }
}

export function saveStoredGeminiApiKey(apiKey) {
  const normalizedApiKey = apiKey.trim();
  if (!normalizedApiKey) return false;
  try {
    localStorage.setItem(GEMINI_API_KEY_STORAGE, normalizedApiKey);
    return true;
  } catch {
    return false;
  }
}

export function clearStoredGeminiApiKey() {
  try {
    localStorage.removeItem(GEMINI_API_KEY_STORAGE);
  } catch {
    // Sin almacenamiento disponible se mantiene el modo local.
  }
}

const SYSTEM_PROMPT = `Eres el asistente financiero UniFinanzas para estudiantes venezolanos. Responde con claridad y lenguaje sencillo.
Convierte solicitudes sobre movimientos en JSON dentro de la clave "action":
- "add_transaction": tipo "income" o "expense", monto_ves entero, descripcion, categoria, fecha opcional.
- "add_regular_expense": monto_ves, descripcion, categoria, frecuencia "weekly", "weekly_multiple", "biweekly" o "monthly", veces_semana opcional.
- "add_regular_income": monto_ves, descripcion, categoria, frecuencia "weekly" o "monthly".
- "clarify": pregunta breve por categoría o dato faltante.
- "question": respuesta financiera general.
Devuelve solo JSON válido con: {"action":"...","response":"respuesta ampliada","data":{}}. Para gastos usa Comida, Transporte, Copias y materiales o Imprevistos. Para ingresos usa Beca, Trabajo, Apoyo familiar u Otro ingreso. Si falta categoría o detalle importante, usa clarify. No inventes montos.`;

export async function askGemini(studentMessage, financialContext) {
  if (!navigator.onLine) throw new Error("Sin conexión");
  const apiKey = getStoredGeminiApiKey();
  if (!apiKey) throw new Error("Falta configurar la API Key de Google AI Studio");
  let lastError = null;
  for (const modelName of GEMINI_MODELS) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: `${SYSTEM_PROMPT}\nContexto financiero: ${JSON.stringify(financialContext)}` }] },
          contents: [{ role: "user", parts: [{ text: studentMessage }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 700 }
        })
      });
      if (!response.ok) throw new Error(`Gemini ${modelName} respondió ${response.status}`);
      const payload = await response.json();
      const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
      if (!text) throw new Error(`Gemini ${modelName} no devolvió texto`);
      const cleanText = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      return JSON.parse(cleanText);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("No hubo respuesta de Gemini");
}

function parseAmount(message) {
  const match = message.match(/(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(?:bs(?:\.?)|ves|bolívares?)?/i);
  if (!match) return null;
  const raw = match[1].replace(/\s/g, "");
  return Number(raw.replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(/,(?=\d{3}(?:\D|$))/g, "").replace(/,/g, "."));
}

export function parseLocalIntent(message) {
  const normalized = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const amount = parseAmount(message);
  if (!amount || !Number.isSafeInteger(amount) || amount <= 0) {
    return { action: "clarify", response: "Indícame el monto exacto en bolívares para poder registrarlo y dime a qué corresponde." };
  }

  const isIncome = /(gane|gan[eé]|ingreso|me dieron|recibi|recib[ií]|beca|trabajo|apoyo)/.test(normalized);
  const isExpense = /(gaste|gast[eé]|pague|pag[uü]e|compr[eé]|compre|costo|almuerzo|pasaje)/.test(normalized);
  const regular = /(al mes|mensual|cada mes|a la semana|semanal|cada semana|por semana)/.test(normalized);
  const data = {
    monto_ves: amount,
    descripcion: isIncome ? "Ingreso registrado" : "Gasto registrado",
    categoria: "Otro ingreso",
    frecuencia: /mes|mensual/.test(normalized) ? "monthly" : "weekly"
  };

  if (isIncome) {
    if (/beca/.test(normalized)) data.categoria = "Beca";
    else if (/trabajo|trabaje/.test(normalized)) data.categoria = "Trabajo";
    else if (/apoyo|familia|pap[aá]|mam[aá]/.test(normalized)) data.categoria = "Apoyo familiar";
    else if (!/\b(gan[eé]|gane|recib[ií]|recibi|dieron|ingreso)\b/.test(normalized)) data.categoria = "Otro ingreso";
    if (regular) return { action: "add_regular_income", response: `Registraré este ingreso regular de ${amount} bolívares ${data.frecuencia === "monthly" ? "al mes" : "por semana"}.`, data };
    return { action: "add_transaction", response: `Registraré un ingreso puntual de ${amount} bolívares.`, data: { ...data, tipo: "income", fecha: new Date().toISOString() } };
  }

  if (isExpense) {
    if (/comida|almuerzo|desayuno|empanada|cafe|comi/.test(normalized)) data.categoria = "Comida";
    else if (/pasaje|bus|taxi|transporte/.test(normalized)) data.categoria = "Transporte";
    else if (/copia|impresion|cuaderno|material|estudio/.test(normalized)) data.categoria = "Copias y materiales";
    else data.categoria = "Imprevistos";
    if (regular) return { action: "add_regular_expense", response: `Añadiré este gasto regular de ${amount} bolívares ${data.frecuencia === "monthly" ? "al mes" : "por semana"}.`, data };
    return { action: "add_transaction", response: `Registraré un gasto puntual de ${amount} bolívares.`, data: { ...data, tipo: "expense", fecha: new Date().toISOString() } };
  }

  return { action: "clarify", response: "¿Es un ingreso o un gasto? Indica también el monto y, si es posible, la categoría." };
}

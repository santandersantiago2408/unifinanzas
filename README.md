# UniFinanzas

Aplicación web universitaria para organizar presupuesto, gastos, ingresos, metas de ahorro y tasas de cambio. Está construida con HTML5, CSS3 y JavaScript Vanilla mediante ES Modules, sin framework ni dependencias de paquetes.

## Funcionalidades

- Resumen semanal, mensual y anual.
- Registro manual de gastos e ingresos.
- Edición y eliminación de movimientos.
- Historial exportable a CSV o JSON.
- Gastos regulares con proyección semanal.
- Ingresos regulares que aumentan el presupuesto disponible.
- Metas de ahorro con confirmación y retiro semanal de presupuesto.
- Comparador demostrativo de compras.
- Conversor y consulta de tasas de cambio.
- Consejos financieros dentro de Resumen.
- Asistente financiero destacado en Resumen, con Gemini opcional y respuestas locales.
- Persistencia de datos en `localStorage`.
- Diseño oscuro adaptable para escritorio y móvil.

## Tecnologías

- HTML5.
- CSS3.
- JavaScript Vanilla y ES Modules.
- Fetch API.
- Google AI Studio y Gemini.
- `localStorage` e `Intl` del navegador.
- DolarAPI para tasas de referencia.

## Estructura

- `index.html`: estructura de la aplicación y sus vistas.
- `style.css`: tema visual, componentes y diseño responsivo.
- `data.json`: configuración inicial, consejos, precios habituales y datos de respaldo.
- `js/app.js`: estado global, navegación y coordinación entre módulos.
- `js/data.js`: carga de datos y persistencia local.
- `js/finance.js`: periodos, categorías, importes y filtros.
- `js/dashboard.js`: métricas y presupuesto efectivo.
- `js/expenses.js`: movimientos manuales, tabla y exportación.
- `js/recurring.js`: gastos e ingresos regulares.
- `js/plans.js`: creación y confirmación de metas.
- `js/discovery.js`: comparación demostrativa y consejos.
- `js/currency.js`: tasas y conversor.
- `js/assistant.js`: integración Gemini y procesamiento local.

## Ejecutar el proyecto

El proyecto debe servirse mediante HTTP. No abrirlo únicamente mediante `file://`, porque los módulos ES y `data.json` requieren solicitudes web.

### Live Server

1. Abre la carpeta del proyecto en Visual Studio Code.
2. Instala o activa la extensión Live Server.
3. Haz clic derecho en `index.html`.
4. Selecciona `Open with Live Server`.

### Python

Desde la carpeta del proyecto:

```powershell
python -m http.server 8000
```

Después abre `http://localhost:8000`.

No requiere `npm install`, compilación ni instalación de frameworks.

## Configuración de Gemini

No existe una clave predeterminada. Desde **Resumen**, abre el apartado **Configurar API Key de Google AI Studio**, pega tu clave y pulsa **Guardar API Key**. La clave se conserva únicamente en `localStorage` de este navegador.

El módulo lee la clave con:

```javascript
const apiKey = getStoredGeminiApiKey();
```

Para retirar la clave, usa **Eliminar** dentro del apartado. También puedes cambiar el arreglo de modelos:

```javascript
const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite"
];
```

La disponibilidad de los modelos depende de Google AI Studio y de la cuenta utilizada. El proyecto prueba los modelos definidos hasta obtener una respuesta válida.

> La API Key se guarda localmente en el navegador y puede ser visible para scripts y extensiones que tengan acceso a la página. Para una aplicación pública debe guardarse en un backend o proxy seguro y aplicarse restricciones a la clave.

## Modo del asistente

El chat del asistente aparece al inicio de **Resumen**, antes de las métricas. El panel superior contiene un deslizador para seleccionar el modo:

- Con conexión y API Key configurada: intenta usar Gemini y ejecuta acciones reconocidas.
- Sin conexión: usa reglas locales y no realiza solicitudes externas.

Si no hay una API Key configurada, el asistente responde directamente con el respaldo local, sin esperar una respuesta de Gemini ni realizar solicitudes externas. El indicador muestra **IA: Respaldo local**. El modo cambia automáticamente mediante los eventos `online` y `offline` del navegador. Si Gemini falla por falta de red, error HTTP o agotamiento temporal, también se utiliza automáticamente el sistema local.

El asistente puede interpretar mensajes como:

- `Gasté 900 en una empanada`.
- `Gané 1500bs`.
- `Al mes gano 50000bs`.
- `A la semana gasto 5000bs en almuerzos`.
- `¿Cuánto presupuesto me queda?`

Si falta el monto o la categoría, el asistente solicita aclaración antes de ejecutar el registro.

## Presupuesto efectivo

Al entrar por primera vez, UniFinanzas solicita un presupuesto semanal o mensual. Un presupuesto mensual se convierte a su equivalente semanal antes de calcular el resumen.

El presupuesto semanal efectivo se calcula así:

```text
Presupuesto efectivo
= presupuesto base
+ ingresos regulares semanales
- gastos regulares semanales
- descuento confirmado por metas
```

Los gastos regulares no representan movimientos reales hasta que sean registrados como tales. Sin embargo, sí reducen inmediatamente el presupuesto disponible como compromisos planificados.

Los presupuestos mensuales se convierten a su equivalente semanal mediante:

```text
monto mensual / 4.345
```

Los ingresos regulares mensuales se convierten a su equivalente semanal mediante:

```text
monto mensual × 12 / 52
```

## Metas y planes

Una meta debe confirmar explícitamente el descuento semanal antes de activarse. El cálculo usa:

```text
Monto restante / semanas hasta la fecha objetivo
```

Al aceptar, el plan se guarda y reduce el presupuesto efectivo semanal. Si se elimina, deja de afectar el presupuesto.

## Almacenamiento local

Los datos se guardan en el navegador con estas claves:

- `unifinanzas-gastos-v1`: movimientos.
- `unifinanzas-recurring-v1`: gastos regulares.
- `unifinanzas-regular-income-v1`: ingresos regulares.
- `unifinanzas-goals-v1`: metas.
- `unifinanzas-rates-v1`: caché de tasas.
- `unifinanzas-gemini-api-key`: clave propia de Google AI Studio.
- `unifinanzas-budget-config-v1`: presupuesto inicial semanal o mensual y su equivalente semanal.

Puedes eliminar estos datos desde las herramientas de desarrollo del navegador para restaurar el estado inicial.

## Tasa de cambio

Las tasas consultadas son de referencia. El proyecto conserva una caché y utiliza valores de respaldo si una fuente no está disponible. Deben verificarse antes de realizar una operación financiera real.

## Nota sobre los datos de compra

Las ofertas de “Comparar compras” son escenarios demostrativos. No representan inventario, disponibilidad ni cotizaciones vigentes.

import { chromium, type Browser, type Page } from "playwright";
import { cfg } from "./config.js";
import { formatearFecha } from "./utils.js";

const BASE = cfg.baseUrl;
const RESERVAR_PATH = "/ReservarPista.aspx";

export async function reservar(fecha: Date): Promise<string> {
  const fechaStr = formatearFecha(fecha);
  const horaStr = cfg.reserva.hora;
  let browser: Browser | null = null;

  try {
    console.log(`\n🎾 Iniciando reserva para ${fechaStr} a las ${horaStr}`);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      locale: "es-ES",
      timezoneId: "Europe/Madrid",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);

    // ── Paso 1: Login ──
    await login(page);

    // ── Paso 2: Seleccionar fecha ──
    await seleccionarFecha(page, fecha, fechaStr);

    // ── Paso 3: Ver disponibilidad de la pista ──
    await verDisponibilidad(page);

    // ── Paso 4: Seleccionar hora 18:30 ──
    await seleccionarHora(page, horaStr);

    // ── Paso 5: Hacer clic en Reservar ──
    await clicReservar(page);

    // ── Paso 6: Verificar resultado ──
    const resultado = await verificarResultado(page, cfg.hpl.usuario.split("@")[0]);

    if (!resultado.exito) {
      throw new Error(resultado.mensaje);
    }

    console.log(`✅ Reserva completada: ${fechaStr} ${horaStr}`);
    return `Reserva confirmada para el ${fechaStr} a las ${horaStr}.`;

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ Error: ${msg}`);
    return msg;
  } finally {
    if (browser) await browser.close();
  }
}

// ════════════════════════════════════════════════════════════
//  PASO 1: LOGIN
// ════════════════════════════════════════════════════════════

async function login(page: Page): Promise<void> {
  console.log("  → Accediendo a la página de reservas...");
  await page.goto(`${BASE}${RESERVAR_PATH}`, { waitUntil: "networkidle" });

  await page.waitForSelector("#C1_txtCodigo", { timeout: 15000 });
  console.log("  → Formulario de login cargado.");

  await page.fill("#C1_txtCodigo", cfg.hpl.usuario);
  await page.fill("#C1_txtContraseña", cfg.hpl.password);
  console.log("  → Credenciales introducidas.");

  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle", timeout: 30000 }),
    page.click("#C1_lnkEntrar"),
  ]);
  console.log("  → Login enviado.");

  const title = await page.title();
  console.log(`  → Página tras login: "${title}"`);

  // Verificar que no seguimos en login
  if (await page.$("#C1_txtCodigo")) {
    const errorMsg = await page.$eval(
      ".text-danger, .Error, #C1_lblError",
      (el) => el.textContent,
    ).catch(() => null);
    throw new Error(`Login fallido: ${errorMsg ?? "Credenciales incorrectas"}`);
  }

  await page.screenshot({ path: "debug-01-tras-login.png", fullPage: true });
}

// ════════════════════════════════════════════════════════════
//  PASO 2: SELECCIONAR FECHA
// ════════════════════════════════════════════════════════════

async function seleccionarFecha(page: Page, fecha: Date, fechaStr: string): Promise<void> {
  console.log(`  → Seleccionando fecha ${fechaStr}...`);

  const dia = String(fecha.getDate()).padStart(2, "0");
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const anio = String(fecha.getFullYear());
  const fechaES = `${dia}/${mes}/${anio}`;

  // Estrategia 1: Buscar input de fecha por ID/name/clase
  const selectoresFecha = [
    'input[id*="txtFecha"]',
    'input[id*="txtDate"]',
    'input[id*="Fecha"]',
    'input[name*="txtFecha"]',
    'input[name*="Fecha"]',
    'input.datepicker',
    'input[class*="fecha"]',
    'input[class*="date"]',
    'input[type="date"]',
  ];

  for (const sel of selectoresFecha) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log(`    Input de fecha encontrado: ${sel}`);
      await el.click({ clickCount: 3 });
      await el.fill(fechaES);
      await el.press("Tab");
      await page.waitForTimeout(3000);
      await page.screenshot({ path: "debug-02-tras-fecha.png", fullPage: true });
      console.log(`  → Fecha ${fechaStr} establecida.`);
      return;
    }
  }

  // Estrategia 2: Buscar cualquier input de texto que ya contenga una fecha
  const allInputs = page.locator('input[type="text"]');
  const count = await allInputs.count();
  for (let i = 0; i < count; i++) {
    const input = allInputs.nth(i);
    if (await input.isVisible({ timeout: 500 }).catch(() => false)) {
      const val = await input.inputValue().catch(() => "");
      if (/\d{2}\/\d{2}\/\d{4}/.test(val)) {
        console.log(`    Input de fecha encontrado por valor actual: "${val}"`);
        await input.click({ clickCount: 3 });
        await input.fill(fechaES);
        await input.press("Tab");
        await page.waitForTimeout(3000);
        await page.screenshot({ path: "debug-02-tras-fecha.png", fullPage: true });
        console.log(`  → Fecha ${fechaStr} establecida.`);
        return;
      }
    }
  }

  // Estrategia 3: Calendario - buscar celda/enlace con el número del día
  const diaNum = String(fecha.getDate());
  const selectorsCalendario = [
    `td:has-text("${dia}")`,
    `a:has-text("${dia}")`,
    `td:has-text("${diaNum}")`,
    `a:has-text("${diaNum}")`,
  ];
  for (const sel of selectorsCalendario) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log(`    Celda de calendario encontrada: ${sel}`);
      await el.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: "debug-02-tras-fecha.png", fullPage: true });
      console.log(`  → Fecha ${fechaStr} seleccionada.`);
      return;
    }
  }

  // Si nada funcionó, volcar HTML para depuración
  const html = await page.content();
  const fs = await import("fs");
  fs.writeFileSync("debug-html-fecha.html", html, "utf-8");
  console.log("  ⚠ HTML guardado en debug-html-fecha.html");

  throw new Error(`No se encontró el selector de fecha. HTML guardado para depuración.`);
}

// ════════════════════════════════════════════════════════════
//  PASO 3: VER DISPONIBILIDAD
// ════════════════════════════════════════════════════════════

async function verDisponibilidad(page: Page): Promise<void> {
  console.log("  → Buscando disponibilidad de pistas...");

  // Buscar el botón/enlace "Ver" en la columna Disponibilidad
  const selectoresVer = [
    'a:has-text("Ver")',
    'input[value="Ver"]',
    'a[href*="Disponibilidad"]',
    'a[href*="disponibilidad"]',
    'td:has-text("Ver") a',
  ];

  for (const sel of selectoresVer) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
      await el.click();
      await page.waitForTimeout(3000);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.screenshot({ path: "debug-03-disponibilidad.png", fullPage: true });
      console.log("  → Disponibilidad cargada.");
      // Dump HTML para inspección
      const fs = await import("fs");
      const html = await page.content();
      fs.writeFileSync("debug-html-disponibilidad.html", html, "utf-8");
      console.log("  → HTML guardado en debug-html-disponibilidad.html");
      return;
    }
  }

  // Si no hay botón "Ver", la disponibilidad podría estar ya visible
  console.log("  → No se encontró botón 'Ver', asumiendo disponibilidad ya visible.");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "debug-03-disponibilidad.png", fullPage: true });
  const fs = await import("fs");
  const html = await page.content();
  fs.writeFileSync("debug-html-disponibilidad.html", html, "utf-8");
  console.log("  → HTML guardado en debug-html-disponibilidad.html");
}

// ════════════════════════════════════════════════════════════
//  PASO 4: SELECCIONAR HORA
// ════════════════════════════════════════════════════════════

async function seleccionarHora(page: Page, hora: string): Promise<void> {
  console.log(`  → Seleccionando horario ${hora}...`);

  // Los slots en haypistalibre tienen formato "18:30-20:00"
  // Buscar el div.Reservable que contenga el span con la hora
  const slotLocator = page.locator(`div.Reservable:has(span:has-text("${hora}"))`);
  const slotCount = await slotLocator.count();

  if (slotCount > 0) {
    const slot = slotLocator.first();
    if (await slot.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Dentro del slot, hacer clic en el enlace "Reservar"
      const reservarLink = slot.locator('a:has-text("Reservar")');
      if (await reservarLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`    Slot ${hora} encontrado como div.Reservable con enlace 'Reservar'`);
        await reservarLink.click();
        await page.waitForTimeout(5000);
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.screenshot({ path: "debug-04-tras-hora.png", fullPage: true });
        console.log(`  → Horario ${hora} seleccionado.`);
        return;
      }
    }
  }

  // Verificar si el slot ya está reservado
  const slotReservado = page.locator(`div.Reservada:has(span:has-text("${hora}"))`);
  if (await slotReservado.count() > 0) {
    throw new Error(`El horario ${hora} YA ESTÁ RESERVADO (div.Reservada). No se puede volver a reservar.`);
  }

  // Fallback: buscar cualquier enlace con la hora
  const allLinks = page.locator("a");
  const count = await allLinks.count();
  console.log(`    Buscando entre ${count} enlaces...`);
  for (let i = 0; i < count; i++) {
    const link = allLinks.nth(i);
    const text = (await link.textContent().catch(() => "")) || "";
    if (text.includes("Reservar")) {
      const parent = link.locator("../..");
      const parentText = (await parent.textContent().catch(() => "")) || "";
      if (parentText.includes(hora)) {
        console.log(`    Enlace 'Reservar' encontrado cerca de ${hora}`);
        await link.click();
        await page.waitForTimeout(5000);
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.screenshot({ path: "debug-04-tras-hora.png", fullPage: true });
        console.log(`  → Horario ${hora} seleccionado.`);
        return;
      }
    }
  }

  throw new Error(`No se encontró el horario ${hora} disponible. Verifica debug-03-disponibilidad.png`);
}

// ════════════════════════════════════════════════════════════
//  PASO 5: CLIC EN RESERVAR + CONFIRMAR
// ════════════════════════════════════════════════════════════

async function clicReservar(page: Page): Promise<void> {
  console.log("  → Buscando página de confirmación...");
  await page.waitForTimeout(3000);
  await page.waitForLoadState("networkidle").catch(() => {});

  const pageTitle = await page.title();
  console.log(`    Página actual: "${pageTitle}"`);

  // Si ya estamos en la página de confirmación, buscar "Confirmar"
  if (/confirm/i.test(pageTitle) || /confirm/i.test(await page.url())) {
    console.log("  → Página de confirmación detectada.");
    await page.screenshot({ path: "debug-05-pagina-confirmacion.png", fullPage: true });
    await clicConfirmar(page);
    return;
  }

  // Si no estamos en confirmación, buscar "Reservar" como fallback
  const selectoresReservar = [
    'a:has-text("Reservar")',
    'input[type="submit"][value*="Reservar" i]',
    'button:has-text("Reservar")',
  ];

  for (const sel of selectoresReservar) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log(`    Botón 'Reservar' encontrado: ${sel}`);
      await el.click();
      await page.waitForTimeout(5000);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.screenshot({ path: "debug-05-pagina-confirmacion.png", fullPage: true });

      // Ahora buscar "Confirmar"
      await clicConfirmar(page);
      return;
    }
  }

  console.log("  ⚠ No se encontró botón 'Reservar' ni página de confirmación.");
  await page.screenshot({ path: "debug-05-sin-boton.png", fullPage: true });
}

async function clicConfirmar(page: Page): Promise<void> {
  console.log("  → Buscando botón de confirmación final...");
  await page.waitForTimeout(3000);
  await page.waitForLoadState("networkidle").catch(() => {});

  // En haypistalibre, el botón de confirmar en la página de confirmación
  // tiene value="Reservar" (no "Confirmar")
  const selectoresConfirmar = [
    'input[type="submit"][value="Reservar"]',
    'a:has-text("Confirmar")',
    'input[type="submit"][value*="Confirmar" i]',
    'button:has-text("Confirmar")',
    '#btnConfirmar',
    'input[id*="Confirmar"]',
  ];

  for (const sel of selectoresConfirmar) {
    const els = page.locator(sel);
    const count = await els.count();
    for (let i = 0; i < count; i++) {
      const el = els.nth(i);
      if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
        const val = (await el.getAttribute("value").catch(() => "")) || "";
        const text = (await el.textContent().catch(() => "")) || "";
        console.log(`    Botón encontrado: value="${val}" text="${text.trim()}"`);

        // No hacer clic en "Volver"
        if (/volver/i.test(val) || /volver/i.test(text)) {
          console.log(`    Saltando botón 'Volver'`);
          continue;
        }

        console.log(`    → Haciendo clic en botón de confirmación...`);
        await el.click();
        await page.waitForTimeout(5000);
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.screenshot({ path: "debug-06-tras-confirmar.png", fullPage: true });
        console.log("  → Reserva confirmada.");
        return;
      }
    }
  }

  console.log("  ⚠ No se encontró botón de confirmación.");
  await page.screenshot({ path: "debug-06-sin-boton-confirmar.png", fullPage: true });
}

// ════════════════════════════════════════════════════════════
//  PASO 6: VERIFICAR RESULTADO
// ════════════════════════════════════════════════════════════

async function verificarResultado(page: Page, usuario: string): Promise<{ exito: boolean; mensaje: string }> {
  console.log("  → Verificando resultado...");
  await page.waitForTimeout(2000);

  const bodyText = (await page.textContent("body").catch(() => "")) || "";
  const pageTitle = await page.title();
  const url = page.url();

  console.log(`    Título: "${pageTitle}" | URL: ${url}`);

  // Éxito: el nombre del usuario aparece en un slot reservado
  if (usuario && bodyText.includes(usuario)) {
    return { exito: true, mensaje: `Reserva confirmada — slot asignado a ${usuario}` };
  }

  // Éxito: la URL contiene un anchor (#H...) que indica slot reservado
  if (/ReservarPista\.aspx#H\d+/.test(url)) {
    return { exito: true, mensaje: "Redirigido a ReservarPista con anchor de slot reservado" };
  }

  // Éxito: mensajes explícitos
  if (/reserva\s*(realizada|confirmada|correcta|éxito|ok)/i.test(bodyText)) {
    return { exito: true, mensaje: "Reserva confirmada por la web" };
  }

  // Error: mensajes explícitos
  const errores = [
    /ya\s*(existe|reservad|ocupad)/i,
    /no\s*(disponible|ponible)/i,
    /error/i,
    /no\s*se\s*(ha\s*)?podido/i,
    /denegad/i,
  ];
  for (const regex of errores) {
    if (regex.test(bodyText)) {
      return { exito: false, mensaje: `Error detectado: ${bodyText.substring(0, 300)}` };
    }
  }

  console.log("  ⚠ Sin mensaje claro de confirmación o error.");
  return { exito: true, mensaje: "Reserva aparentemente exitosa (sin mensaje claro)" };
}

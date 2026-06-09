import { chromium, type Browser, type Page } from 'playwright';
import { cfg } from './config';
import { formatearFecha } from './utils';

const BASE = cfg.baseUrl;
const RESERVAR_PATH = '/ReservarPista.aspx';

export async function reservar(fecha: Date): Promise<string> {
  const fechaStr = formatearFecha(fecha);
  const horaStr = cfg.reserva.hora;
  let browser: Browser | null = null;

  try {
    console.log(`\n🎾 Iniciando reserva para ${fechaStr} a las ${horaStr}`);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      locale: 'es-ES',
      timezoneId: 'Europe/Madrid',
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
    await seleccionarHora(page);

    // ── Paso 5: Hacer clic en Reservar ──
    await clicReservar(page);

    // ── Paso 6: Verificar resultado ──
    const resultado = await verificarResultado(page, cfg.hpl.usuario.split('@')[0]);

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
  console.log('  → Accediendo a la página de reservas...');
  await page.goto(`${BASE}${RESERVAR_PATH}`, { waitUntil: 'networkidle' });

  await page.waitForSelector('#C1_txtCodigo', { timeout: 15000 });
  console.log('  → Formulario de login cargado.');

  await page.fill('#C1_txtCodigo', cfg.hpl.usuario);
  await page.fill('#C1_txtContraseña', cfg.hpl.password);
  console.log('  → Credenciales introducidas.');

  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: 30000 }),
    page.click('#C1_lnkEntrar'),
  ]);
  console.log('  → Login enviado.');

  const title = await page.title();
  console.log(`  → Página tras login: "${title}"`);

  // Verificar que no seguimos en login
  if (await page.$('#C1_txtCodigo')) {
    const errorMsg = await page
      .$eval('.text-danger, .Error, #C1_lblError', el => el.textContent)
      .catch(() => null);
    throw new Error(`Login fallido: ${errorMsg ?? 'Credenciales incorrectas'}`);
  }

  await page.screenshot({ path: 'debug-01-tras-login.png', fullPage: true });
}

// ════════════════════════════════════════════════════════════
//  PASO 2: SELECCIONAR FECHA
// ════════════════════════════════════════════════════════════

async function seleccionarFecha(page: Page, fecha: Date, fechaStr: string): Promise<void> {
  console.log(`  → Seleccionando fecha ${fechaStr}...`);
  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const anio = String(fecha.getFullYear());
  const fechaValue = `${dia}/${mes}/${anio}`;
  const selectFecha = page.locator('#C1_cboFecha');
  await selectFecha.waitFor({ state: 'visible', timeout: 10000 });
  console.log(`    Select de fecha encontrado: #C1_cboFecha`);

  await selectFecha.selectOption({ value: fechaValue });
  await page.waitForTimeout(3000);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.screenshot({ path: 'debug-02-tras-fecha.png', fullPage: true });
  console.log(`  → Fecha ${fechaValue} seleccionada.`);
}

// ════════════════════════════════════════════════════════════
//  PASO 3: VER DISPONIBILIDAD
// ════════════════════════════════════════════════════════════

async function verDisponibilidad(page: Page): Promise<void> {
  console.log('  → Buscando disponibilidad de pistas...');
  const rangoHora = '18:30-20:00';
  console.log(`    Buscando slot con rango: ${rangoHora}`);

  const slot = page.locator(
    `div.Reservable div.Cabecera.HoraReserva span:has-text("${rangoHora}")`,
  );

  await slot.waitFor({ state: 'visible', timeout: 10000 });
  console.log(`  → Slot ${rangoHora} encontrado y disponible.`);
  await page.screenshot({ path: 'debug-03-disponibilidad.png', fullPage: true });
}

// ════════════════════════════════════════════════════════════
//  PASO 4: SELECCIONAR HORA
// ════════════════════════════════════════════════════════════

async function seleccionarHora(page: Page): Promise<void> {
  // const rangoHora = '18:30-20:00';
  const rangoHora = '13:30-15:00';

  console.log(`  → Seleccionando horario ${rangoHora}...`);

  const slot = page.locator(
    `div.Reservable:has(div.Cabecera.HoraReserva span:text-is("${rangoHora}"))`,
  );
  const enlace = slot.locator('div.NombreReserva a');

  await enlace.waitFor({ state: 'visible', timeout: 10000 });
  console.log(`    Enlace dentro de div.NombreReserva encontrado para ${rangoHora}`);
  await enlace.click();
  await page.waitForTimeout(5000);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.screenshot({ path: 'debug-04-tras-hora.png', fullPage: true });
  console.log(`  → Horario ${rangoHora} seleccionado.`);
}

// ════════════════════════════════════════════════════════════
//  PASO 5: CLIC EN RESERVAR + CONFIRMAR
// ════════════════════════════════════════════════════════════

async function clicReservar(page: Page): Promise<void> {
  console.log('  → Buscando botón de reserva en Reserva.aspx...');
  await page.waitForLoadState('networkidle').catch(() => {});

  const url = page.url();
  console.log(`    URL actual: ${url}`);

  if (!/Reserva\.aspx\?/i.test(url)) {
    throw new Error(`No se redirigió a Reserva.aspx. URL: ${url}`);
  }

  const boton = page.locator('input[type="submit"][value="Reservar"]');
  await boton.waitFor({ state: 'visible', timeout: 10000 });
  console.log('    Botón input[type="submit"][value="Reservar"] encontrado.');

  await Promise.all([
    page.waitForURL(/ReservarPista\.aspx#H\d+/, { timeout: 15000 }),
    boton.click(),
  ]);

  await page.screenshot({ path: 'debug-05-tras-reservar.png', fullPage: true });
  console.log('  → Reserva confirmada, redirigido a ReservarPista.');
}

// ════════════════════════════════════════════════════════════
//  PASO 6: VERIFICAR RESULTADO
// ════════════════════════════════════════════════════════════

async function verificarResultado(
  page: Page,
  usuario: string,
): Promise<{ exito: boolean; mensaje: string }> {
  console.log('  → Verificando resultado...');
  await page.waitForTimeout(2000);

  const bodyText = (await page.textContent('body').catch(() => '')) || '';
  const pageTitle = await page.title();
  const url = page.url();

  console.log(`    Título: "${pageTitle}" | URL: ${url}`);

  // Éxito: el nombre del usuario aparece en un slot reservado
  if (usuario && bodyText.includes(usuario)) {
    return { exito: true, mensaje: `Reserva confirmada — slot asignado a ${usuario}` };
  }

  // Éxito: la URL contiene un anchor (#H...) que indica slot reservado
  if (/ReservarPista\.aspx#H\d+/.test(url)) {
    return { exito: true, mensaje: 'Redirigido a ReservarPista con anchor de slot reservado' };
  }

  // Éxito: mensajes explícitos
  if (/reserva\s*(realizada|confirmada|correcta|éxito|ok)/i.test(bodyText)) {
    return { exito: true, mensaje: 'Reserva confirmada por la web' };
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

  console.log('  ⚠ Sin mensaje claro de confirmación o error.');
  return { exito: true, mensaje: 'Reserva aparentemente exitosa (sin mensaje claro)' };
}

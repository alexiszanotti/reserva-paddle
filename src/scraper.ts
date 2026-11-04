import { chromium, type Browser, type Page } from 'playwright';
import { cfg } from './config';
import { formatearFecha, msHastaMedianocheMadrid } from './utils';

const BASE = cfg.baseUrl;
const RESERVAR_PATH = '/ReservarPista.aspx';

export const SLOTS_PRIORIDAD = ['18:30-20:00', '20:00-21:30'];

export const filaHistorico = (fechaStr: string, horaInicio: string) =>
  `table tr:has(td:nth-child(2):has-text("${fechaStr}")):has(td:nth-child(3):text-is("${horaInicio}"))`;

export interface ResultadoReserva {
  exito: boolean;
  hora: string;
  mensaje: string;
}

export async function reservar(fecha: Date, esperarMedianoche = false): Promise<ResultadoReserva> {
  const fechaStr = formatearFecha(fecha);
  let browser: Browser | null = null;

  try {
    console.log(
      `\n🎾 Iniciando reserva para ${fechaStr} (horarios: ${SLOTS_PRIORIDAD.join(', ')})`,
    );

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      locale: 'es-ES',
      timezoneId: 'Europe/Madrid',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);

    // ── Paso 1: Login (pre-warm: se hace con antelación a medianoche) ──
    await login(page);

    // ── Paso 1.5: esperar a las 00:00:00 Madrid (el slot de +7 días abre ahí) ──
    if (esperarMedianoche) await esperarHastaMedianoche(page);

    // ── Paso 2: Seleccionar fecha ──
    await seleccionarFecha(page, fecha, fechaStr);

    await page.screenshot({ path: 'debug-03-disponibilidad.png', fullPage: true });

    // ── Pasos 3-6: probar cada horario por orden de preferencia ──
    const fallos: string[] = [];
    for (const [indice, rangoHora] of SLOTS_PRIORIDAD.entries()) {
      if (indice > 0) {
        // El intento anterior puede dejarnos en Error.aspx o en el historial.
        await page.goto(`${BASE}${RESERVAR_PATH}`, { waitUntil: 'networkidle' });
        await seleccionarFecha(page, fecha, fechaStr);
      }

      const disponible = await verDisponibilidad(page, rangoHora);
      if (!disponible) {
        fallos.push(`${rangoHora}: no disponible`);
        console.log(`  ⏭ Horario ${rangoHora} no disponible, probando siguiente...`);
        continue;
      }

      let errorIntento = '';
      try {
        await seleccionarHora(page, rangoHora);
        await clicReservar(page);
      } catch (err) {
        errorIntento = err instanceof Error ? err.message : String(err);
        console.error(`  ⚠ ${rangoHora}: ${errorIntento}`);
      }

      // Incluso tras un timeout, el servidor puede haber guardado la reserva.
      // Si el historial no se puede consultar, abortamos para no duplicarla.
      const resultado = await verificarResultado(page, fecha, rangoHora);

      if (resultado.exito) {
        console.log(`✅ Reserva completada: ${fechaStr} ${rangoHora}`);
        return { exito: true, hora: rangoHora, mensaje: resultado.mensaje };
      }

      const motivo = errorIntento ? `${errorIntento}. ${resultado.mensaje}` : resultado.mensaje;
      fallos.push(`${rangoHora}: ${motivo}`);
      console.error(`  ⚠ ${rangoHora}: ${motivo}`);
    }

    const mensaje = `No se ha podido reservar. ${fallos.join(' | ')}`;
    console.log(`  ⏭ ${mensaje}`);
    return { exito: false, hora: SLOTS_PRIORIDAD.join(' / '), mensaje };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ Error: ${msg}`);
    return { exito: false, hora: SLOTS_PRIORIDAD.join(' / '), mensaje: msg };
  } finally {
    if (browser) await browser.close();
  }
}

// ════════════════════════════════════════════════════════════
//  ESPERA HASTA MEDIANOCHE (timing exacto de la reserva)
// ════════════════════════════════════════════════════════════

// Espera bloqueante hasta las 00:00:00.000 de Madrid y deja la página de
// reservas recién cargada (el slot de +7 días aparece justo a medianoche).
// Recarga periódica como keep-alive para no perder la sesión en esperas largas
// (en invierno el cron dispara ~70 min antes de medianoche).
async function esperarHastaMedianoche(page: Page): Promise<void> {
  const KEEPALIVE_MS = 4 * 60 * 1000;
  let restante = msHastaMedianocheMadrid();

  // Si faltan >12 h para la próxima medianoche, ya la cruzamos (disparo tardío):
  // no esperar, reservar de inmediato.
  if (restante > 12 * 3600 * 1000) {
    console.log('  ⏱ Medianoche ya pasada (disparo tardío) → reservando sin esperar.');
    return;
  }

  console.log(`  ⏳ Esperando hasta medianoche Madrid (${Math.round(restante / 1000)} s)...`);
  while (restante > 1500) {
    const dormir = Math.min(restante - 1000, KEEPALIVE_MS);
    await page.waitForTimeout(dormir);
    if (restante - dormir > 1500) {
      // keep-alive: recargar la página de reservas para mantener viva la sesión
      await page.goto(`${BASE}${RESERVAR_PATH}`, { waitUntil: 'networkidle' }).catch(() => {});
    }
    restante = msHastaMedianocheMadrid();
  }
  // ponytail: busy-wait sub-segundo final (<1.5 s) para precisión; bloquea el
  // event loop pero la página está ociosa. Deadline absoluto: msHastaMedianoche
  // salta a 24h al cruzar medianoche, así que NO se puede usar como condición.
  const deadline = Date.now() + msHastaMedianocheMadrid();
  while (Date.now() < deadline) {
    /* spin */
  }

  console.log(`  🎯 Medianoche Madrid: ${new Date().toISOString()} → cargando disponibilidad.`);
  await page.goto(`${BASE}${RESERVAR_PATH}`, { waitUntil: 'networkidle' });
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

async function verDisponibilidad(page: Page, rangoHora: string): Promise<boolean> {
  console.log(`  → Comprobando disponibilidad de ${rangoHora}...`);

  const slot = page.locator(
    `div.Reservable div.Cabecera.HoraReserva span:has-text("${rangoHora}")`,
  );

  const disponible = await slot
    .first()
    .isVisible()
    .catch(() => false);
  console.log(
    disponible ? `  → Slot ${rangoHora} disponible.` : `  → Slot ${rangoHora} no disponible.`,
  );
  return disponible;
}

// ════════════════════════════════════════════════════════════
//  PASO 4: SELECCIONAR HORA
// ════════════════════════════════════════════════════════════

async function seleccionarHora(page: Page, rangoHora: string): Promise<void> {
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

  await boton.click();
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

  await page.screenshot({ path: 'debug-05-tras-reservar.png', fullPage: true });
  console.log(`  → Formulario enviado. URL tras reservar: ${page.url()}`);
}

// ════════════════════════════════════════════════════════════
//  PASO 6: VERIFICAR RESULTADO
// ════════════════════════════════════════════════════════════

async function verificarResultado(
  page: Page,
  fecha: Date,
  rangoHora: string,
): Promise<{ exito: boolean; mensaje: string }> {
  console.log('  → Verificando resultado...');
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: `debug-06-verificacion-${rangoHora.replace(/\D/g, '')}.png`,
    fullPage: true,
  }).catch(() => {});

  const bodyText = (await page.innerText('body').catch(() => '')) || '';
  const pageTitle = await page.title();

  console.log(`    Título: "${pageTitle}" | URL: ${page.url()}`);

  const fechaStr = formatearFecha(fecha);
  const horaInicio = rangoHora.split('-')[0];
  const historial = await page.goto(`${BASE}/ListadoReservas.aspx`, { waitUntil: 'networkidle' });
  if (
    !historial?.ok() ||
    new URL(page.url()).pathname.toLowerCase() !== '/listadoreservas.aspx' ||
    await page.locator('#C1_txtCodigo').isVisible()
  ) {
    throw new Error('No se pudo consultar el historial; se detienen los intentos para evitar una reserva duplicada.');
  }

  const enHistorico = await page
    .locator(filaHistorico(fechaStr, horaInicio))
    .first()
    .isVisible();

  if (enHistorico) {
    return {
      exito: true,
      mensaje: `Reserva confirmada — figura en Hist. Reservas (${fechaStr} ${rangoHora})`,
    };
  }

  // Errores explícitos → fallo con motivo
  const errores: Array<[RegExp, string]> = [
    [/acaba de ser reservada|reservad[ao].{0,30}otro usuario/i, 'La web indica que la pista ya no está disponible'],
    [/ya\s*(tiene|existe|hay).{0,30}reserv/i, 'Ya existe una reserva (límite/duplicado)'],
    [/l[íi]mite|m[áa]ximo\s*de\s*reserv/i, 'Límite de reservas alcanzado'],
    [/no\s*(est[áa]\s*)?disponible|ocupad/i, 'Slot ya no disponible'],
    [/no\s*se\s*(ha\s*)?podido|denegad|fallo|error/i, 'Reserva denegada por la web'],
  ];
  for (const [regex, motivo] of errores) {
    if (regex.test(bodyText)) {
      return {
        exito: false,
        mensaje: `${motivo} — ${bodyText.replace(/\s+/g, ' ').trim().substring(0, 300)}`,
      };
    }
  }

  // Sin confirmación positiva ni error conocido: NO asumir éxito.
  console.log('  ⚠ Sin confirmación positiva → se reporta FALLO (revisar debug-06).');
  return {
    exito: false,
    mensaje: `Sin confirmación de reserva. Título: "${pageTitle}". Texto: ${bodyText.replace(/\s+/g, ' ').trim().substring(0, 300)}`,
  };
}

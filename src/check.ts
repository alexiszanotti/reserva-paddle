import assert from 'node:assert';
import { fechaReserva, nombreDia } from './utils';

// Lunes 22/06/2026 23:50 (noche, pre-medianoche) → sesión martes 23 → reserva martes 30.
const lunNoche = fechaReserva(new Date('2026-06-22T23:50:00'));
assert.strictEqual(
  lunNoche.getDay(),
  2,
  `lun noche: esperaba martes, fue ${nombreDia(lunNoche.getDay())}`,
);
assert.strictEqual(lunNoche.getDate(), 30);

// Martes 23/06/2026 00:05 (ya pasó medianoche) → sesión martes 23 → reserva martes 30.
const marMad = fechaReserva(new Date('2026-06-23T00:05:00'));
assert.strictEqual(marMad.getDay(), 2);
assert.strictEqual(marMad.getDate(), 30);

// Miércoles 24/06/2026 23:50 → sesión jueves 25 → reserva jueves (+7).
const mieNoche = fechaReserva(new Date('2026-06-24T23:50:00'));
assert.strictEqual(
  mieNoche.getDay(),
  4,
  `mié noche: esperaba jueves, fue ${nombreDia(mieNoche.getDay())}`,
);

console.log('✓ fechaReserva OK');

import { chromium } from 'playwright';
import { filaHistorico } from './scraper';

const TABLA = `<table><tbody>
<tr><td>Ver Reserva</td><td>martes, 11/08/2026</td><td>18:30</td><td>20:00</td><td>Central Court</td></tr>
<tr><td>Ver Reserva</td><td>jueves, 06/08/2026</td><td>20:00</td><td>21:30</td><td>Central Court</td></tr>
</tbody></table>`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(TABLA);
  const casa = (f: string, h: string) => page.locator(filaHistorico(f, h)).first().isVisible();

  assert.strictEqual(await casa('11/08/2026', '18:30'), true, 'reserva propia debe casar');
  assert.strictEqual(await casa('06/08/2026', '20:00'), true, 'reserva propia debe casar');
  assert.strictEqual(
    await casa('11/08/2026', '20:00'),
    false,
    '20:00 es hora FIN el 11/08, no debe casar',
  );
  assert.strictEqual(await casa('13/08/2026', '20:00'), false, 'fecha sin reserva no debe casar');
  await browser.close();

  console.log('✓ filaHistorico OK');
})();

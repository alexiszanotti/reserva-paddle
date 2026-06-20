import assert from "node:assert";
import { fechaReserva, nombreDia } from "./utils";

// Lunes 22/06/2026 23:50 (noche, pre-medianoche) → sesión martes 23 → reserva martes 30.
const lunNoche = fechaReserva(new Date("2026-06-22T23:50:00"));
assert.strictEqual(lunNoche.getDay(), 2, `lun noche: esperaba martes, fue ${nombreDia(lunNoche.getDay())}`);
assert.strictEqual(lunNoche.getDate(), 30);

// Martes 23/06/2026 00:05 (ya pasó medianoche) → sesión martes 23 → reserva martes 30.
const marMad = fechaReserva(new Date("2026-06-23T00:05:00"));
assert.strictEqual(marMad.getDay(), 2);
assert.strictEqual(marMad.getDate(), 30);

// Miércoles 24/06/2026 23:50 → sesión jueves 25 → reserva jueves (+7).
const mieNoche = fechaReserva(new Date("2026-06-24T23:50:00"));
assert.strictEqual(mieNoche.getDay(), 4, `mié noche: esperaba jueves, fue ${nombreDia(mieNoche.getDay())}`);

console.log("✓ fechaReserva OK");

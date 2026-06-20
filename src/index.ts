import { diaSemanaMadrid, fechaMadrid, fechaReserva, proximoMartesJueves, formatearFecha, nombreDia } from "./utils";
import { cfg } from "./config";
import { reservar, SLOTS_PRIORIDAD } from "./scraper";
import { enviarEmail } from "./mailer";

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  RESERVA AUTOMÁTICA DE PÁDEL");
  console.log("  HayPistaLibre.net → Martes y Jueves " + SLOTS_PRIORIDAD.join(" / "));
  if (cfg.force) console.log("  ⚡ MODO FORCE ACTIVADO");
  console.log("═══════════════════════════════════════════");

  const diaSemana = diaSemanaMadrid();
  const hoy = nombreDia(diaSemana);
  const horaActual = fechaMadrid().getHours();

  console.log(`\n📅 Hoy es ${hoy} (día ${diaSemana}), ${horaActual}h en zona horaria Europe/Madrid`);

  // En modo normal el cron dispara antes de medianoche y el scraper espera al
  // instante exacto (00:00:00 Madrid). En modo force se reserva ya, sin esperar.
  const fechaObj = cfg.force ? proximoMartesJueves() : fechaReserva();

  // Salvaguarda: la fecha objetivo debe caer en martes o jueves.
  const diaObj = fechaObj.getDay();
  if (diaObj !== 2 && diaObj !== 4) {
    console.log(`   ⚠ El día objetivo es ${nombreDia(diaObj)}, no martes ni jueves. Abortando.`);
    return;
  }

  const fechaObjStr = formatearFecha(fechaObj);
  console.log(`   🎯 Fecha objetivo: ${fechaObjStr} (${nombreDia(fechaObj.getDay())})`);

  const resultado = await reservar(fechaObj, !cfg.force);

  await enviarEmail({
    exito: resultado.exito,
    fecha: fechaObjStr,
    hora: resultado.hora,
    mensaje: resultado.mensaje,
  });

  if (!resultado.exito) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exitCode = 1;
});

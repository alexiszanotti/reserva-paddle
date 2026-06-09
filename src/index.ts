import { diaSemanaMadrid, fechaObjetivo, proximoMartesJueves, formatearFecha, nombreDia } from "./utils";
import { cfg } from "./config";
import { reservar } from "./scraper";
import { enviarEmail } from "./mailer";

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  RESERVA AUTOMÁTICA DE PÁDEL");
  console.log("  HayPistaLibre.net → Martes y Jueves " + cfg.reserva.hora);
  if (cfg.force) console.log("  ⚡ MODO FORCE ACTIVADO");
  console.log("═══════════════════════════════════════════");

  const diaSemana = diaSemanaMadrid();
  const hoy = nombreDia(diaSemana);

  console.log(`\n📅 Hoy es ${hoy} (día ${diaSemana}) en zona horaria Europe/Madrid`);

  let fechaObj: Date;

  if (cfg.force) {
    // En modo force, reservamos el próximo martes/jueves disponible
    fechaObj = proximoMartesJueves();
  } else {
    // Solo ejecutar en martes (2) o jueves (4)
    if (diaSemana !== 2 && diaSemana !== 4) {
      console.log(`   ⏭ No es martes ni jueves → nada que hacer.`);
      return;
    }
    fechaObj = fechaObjetivo();

    // Verificar que la fecha objetivo cae en martes o jueves
    const diaObj = fechaObj.getDay();
    if (diaObj !== 2 && diaObj !== 4) {
      console.log(`   ⚠ El día objetivo es ${nombreDia(diaObj)}, no martes ni jueves. Abortando.`);
      return;
    }
  }

  const fechaObjStr = formatearFecha(fechaObj);
  console.log(`   🎯 Fecha objetivo: ${fechaObjStr} (${nombreDia(fechaObj.getDay())})`);

  const mensaje = await reservar(fechaObj);

  const exito = mensaje.startsWith("Reserva confirmada");

  await enviarEmail({
    exito,
    fecha: fechaObjStr,
    hora: cfg.reserva.hora,
    mensaje,
  });

  if (!exito) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exitCode = 1;
});

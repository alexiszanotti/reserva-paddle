import { diaSemanaMadrid, fechaMadrid, fechaObjetivo, proximoMartesJueves, formatearFecha, nombreDia } from "./utils";
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

    // El cron se dispara a las 22h y 23h UTC para cubrir el cambio de
    // horario de verano/invierno en Madrid; solo la ejecución que cae
    // exactamente a las 00h en Madrid hace la reserva (evita duplicados).
    if (horaActual !== 0) {
      console.log(`   ⏭ Son las ${horaActual}h en Madrid, no las 00h → disparo duplicado por DST, nada que hacer.`);
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

  const resultado = await reservar(fechaObj);

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

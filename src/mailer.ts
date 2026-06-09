import nodemailer from "nodemailer";
import { cfg } from "./config";

const transporter = nodemailer.createTransport({
  host: cfg.smtp.host,
  port: cfg.smtp.port,
  secure: cfg.smtp.port === 465,
  auth: {
    user: cfg.smtp.user,
    pass: cfg.smtp.pass,
  },
});

export interface ResultadoReserva {
  exito: boolean;
  fecha: string;
  hora: string;
  mensaje: string;
}

export async function enviarEmail(resultado: ResultadoReserva): Promise<void> {
  if (cfg.email.to.length === 0) {
    console.warn("⚠ EMAIL_TO no definido, no se envía correo.");
    return;
  }

  const asunto = resultado.exito
    ? `✅ Pista reservada - ${resultado.fecha} ${resultado.hora}`
    : `❌ Fallo reserva - ${resultado.fecha} ${resultado.hora}`;

  const html = `
    <h2>${resultado.exito ? "Reserva confirmada" : "Reserva fallida"}</h2>
    <table>
      <tr><td><b>Fecha:</b></td><td>${resultado.fecha}</td></tr>
      <tr><td><b>Hora:</b></td><td>${resultado.hora}</td></tr>
      <tr><td><b>Resultado:</b></td><td>${resultado.exito ? "Éxito" : "Fallo"}</td></tr>
    </table>
    <p>${resultado.mensaje}</p>
    <hr />
    <p><small>Reserva automática — HayPistaLibre.net</small></p>
  `;

  await transporter.sendMail({
    from: cfg.smtp.user,
    to: cfg.email.to.join(", "),
    subject: asunto,
    html,
  });

  console.log(`📧 Email enviado a ${cfg.email.to.join(", ")}`);
}

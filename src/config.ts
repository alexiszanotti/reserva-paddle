import { config } from "dotenv";

config();

function requerir(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Falta variable de entorno: ${key}`);
  return val;
}

export const cfg = {
  hpl: {
    usuario: requerir("HPL_USUARIO"),
    password: requerir("HPL_PASSWORD"),
  },
  smtp: {
    host: requerir("SMTP_HOST"),
    port: Number(process.env.SMTP_PORT) || 587,
    user: requerir("SMTP_USER"),
    pass: requerir("SMTP_PASS"),
  },
  email: {
    to: (process.env.EMAIL_TO || "").split(",").map((e) => e.trim()).filter(Boolean),
  },
  baseUrl: "https://haypistalibre.net",
  force: process.env.FORCE === "true",
} as const;

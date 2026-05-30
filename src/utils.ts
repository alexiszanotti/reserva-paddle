const TZ = "Europe/Madrid";
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function fechaMadrid(): Date {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  // formato "2026-05-30 22:14:05"
  return new Date(formatter.format(new Date()).replace(" ", "T"));
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

export function diaSemanaMadrid(): number {
  const short = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" })
    .formatToParts(new Date())
    .find((p) => p.type === "weekday")?.value;
  return short ? (WEEKDAY_MAP[short] ?? -1) : -1;
}

export function nombreDia(n: number): string {
  return DIAS_SEMANA[n] ?? "?";
}

export function fechaObjetivo(): Date {
  const hoy = fechaMadrid();
  hoy.setDate(hoy.getDate() + 7);
  return hoy;
}

export function proximoMartesJueves(): Date {
  const hoy = fechaMadrid();
  let d = new Date(hoy);
  // Buscar el próximo martes (2) o jueves (4)
  for (let i = 1; i <= 7; i++) {
    d = new Date(hoy);
    d.setDate(d.getDate() + i);
    const dia = d.getDay();
    if (dia === 2 || dia === 4) return d;
  }
  // fallback: hoy + 7
  d = new Date(hoy);
  d.setDate(d.getDate() + 7);
  return d;
}

export function formatearFecha(d: Date): string {
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const año = d.getFullYear();
  return `${dia}/${mes}/${año}`;
}

export function formatearFechaISO(d: Date): string {
  const año = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${año}-${mes}-${dia}`;
}

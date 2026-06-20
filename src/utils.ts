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

// Fecha a reservar (7 días vista). El cron dispara la noche del lunes/miércoles
// y el scraper espera hasta medianoche, así que la "sesión" es el martes/jueves
// que estamos a punto de cruzar (o acabamos de cruzar): de tarde/noche → mañana.
export function fechaReserva(ahora: Date = fechaMadrid()): Date {
  const sesion = new Date(ahora);
  if (ahora.getHours() >= 12) sesion.setDate(sesion.getDate() + 1);
  sesion.setDate(sesion.getDate() + 7);
  return sesion;
}

// Milisegundos hasta la próxima medianoche en Madrid (independiente de la TZ
// del runner y del cambio horario; usa el reloj real, no el hack de fechaMadrid).
export function msHastaMedianocheMadrid(ahora: Date = new Date()): number {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(ahora);
  const val = (t: string) => parseInt(p.find((x) => x.type === t)?.value ?? "0", 10);
  const h = val("hour") % 24; // algunas impl. devuelven "24" a medianoche
  const transcurridoMs = ((h * 60 + val("minute")) * 60 + val("second")) * 1000 + ahora.getMilliseconds();
  return 24 * 3600 * 1000 - transcurridoMs;
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

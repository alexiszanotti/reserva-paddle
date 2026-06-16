import { VercelRequest, VercelResponse } from '@vercel/node';

// Devuelve true si la hora actual en Madrid cae en la ventana 23:45–00:45.
// Cubre verano (CEST UTC+2): el slot 22:00 UTC = 00:00 Madrid entra; el 23:00 UTC = 01:00 Madrid queda fuera.
// Cubre invierno (CET UTC+1): el slot 23:00 UTC = 00:00 Madrid entra; el 22:00 UTC = 23:00 Madrid queda fuera.
function enVentanaMedianoche(): { enVentana: boolean; horaMadrid: string } {
  const ahora = new Date();
  const partes = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(ahora);

  const hora = parseInt(partes.find(p => p.type === 'hour')?.value ?? '12');
  const minuto = parseInt(partes.find(p => p.type === 'minute')?.value ?? '30');
  const horaMadrid = `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
  const totalMin = hora * 60 + minuto;

  // 23:45–00:45 → minutos 1425–1440 ó 0–45
  const enVentana = totalMin >= 23 * 60 + 45 || totalMin <= 45;
  return { enVentana, horaMadrid };
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  try {
    const { enVentana, horaMadrid } = enVentanaMedianoche();

    if (!enVentana) {
      console.log(`⏭ Slot DST descartado – hora Madrid: ${horaMadrid} (fuera de ventana 23:45–00:45)`);
      return res.status(200).json({
        skipped: true,
        message: `Slot DST descartado: hora Madrid ${horaMadrid}, fuera de ventana 23:45-00:45`,
      });
    }

    const owner = 'alexiszanotti';
    const repo = 'reserva-paddle';
    const workflow = 'reserva.yml';
    const token = process.env.GITHUB_TOKEN;

    if (!token) {
      return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });
    }

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `token ${token}`,
          'X-GitHub-Api-Version': '2022-11-28'
        },
        body: JSON.stringify({
          ref: 'master'
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('GitHub API error:', error);
      return res.status(response.status).json({ 
        error: 'Failed to trigger workflow',
        details: error 
      });
    }

    console.log(`✅ Workflow triggered – hora Madrid: ${horaMadrid} UTC: ${new Date().toISOString()}`);
    return res.status(200).json({
      success: true,
      message: 'Workflow reserva.yml triggered',
      timestamp: new Date().toISOString(),
      horaMadrid,
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
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
          Accept: 'application/vnd.github.v3+json',
          Authorization: `token ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({
          ref: 'master',
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('GitHub API error:', error);
      return res.status(response.status).json({
        error: 'Failed to trigger workflow',
        details: error,
      });
    }

    console.log(`✅ Workflow triggered – UTC: ${new Date().toISOString()}`);
    return res.status(200).json({
      success: true,
      message: 'Workflow reserva.yml triggered',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

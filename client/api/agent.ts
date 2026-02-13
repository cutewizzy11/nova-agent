import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  const baseUrl = process.env.RAILWAY_API_BASE_URL
  if (!baseUrl) {
    res.status(500).json({ error: 'Missing RAILWAY_API_BASE_URL' })
    return
  }

  const target = `${baseUrl.replace(/\/$/, '')}/api/agent`
  const demoKey = process.env.DEMO_API_KEY

  try {
    const upstream = await fetch(target, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(demoKey ? { 'x-demo-api-key': demoKey } : {}),
      },
      body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}),
    })

    const contentType = upstream.headers.get('content-type') ?? ''
    const status = upstream.status

    if (contentType.includes('application/json')) {
      const data = await upstream.json()
      res.status(status).json(data)
      return
    }

    const text = await upstream.text()
    res.status(status).send(text)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
}

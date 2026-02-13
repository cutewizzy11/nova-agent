exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    }
  }

  const baseUrl = process.env.RENDER_API_BASE_URL
  if (!baseUrl) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Missing RENDER_API_BASE_URL' }),
    }
  }

  const demoKey = process.env.DEMO_API_KEY
  const target = `${baseUrl.replace(/\/$/, '')}/api/agent`

  try {
    const upstream = await fetch(target, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(demoKey ? { 'x-demo-api-key': demoKey } : {}),
      },
      body: event.body || '{}',
    })

    const contentType = upstream.headers.get('content-type') || 'text/plain'
    const body = await upstream.text()

    return {
      statusCode: upstream.status,
      headers: { 'content-type': contentType },
      body,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: msg }),
    }
  }
}

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key no configurada en Vercel' });

  try {
    // Activar streaming para evitar timeout de 10s en Vercel hobby
    const body = { ...req.body, stream: true };

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta':    'mcp-client-2025-04-04'
      },
      body: JSON.stringify(body)
    });

    if (!upstream.ok) {
      const err = await upstream.json().catch(() => ({}));
      return res.status(upstream.status).json({ error: err?.error?.message || 'Error de API' });
    }

    // Acumular el stream y reconstruir la respuesta completa
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let inputTokens = 0, outputTokens = 0;
    let stopReason = 'end_turn';
    let model = req.body.model || '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const evt = JSON.parse(data);
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
            fullText += evt.delta.text || '';
          }
          if (evt.type === 'message_delta') {
            stopReason = evt.delta?.stop_reason || stopReason;
            outputTokens = evt.usage?.output_tokens || outputTokens;
          }
          if (evt.type === 'message_start') {
            inputTokens = evt.message?.usage?.input_tokens || inputTokens;
            model = evt.message?.model || model;
          }
        } catch {}
      }
    }

    // Devolver en el mismo formato que la API no-streaming
    res.status(200).json({
      id: 'stream-' + Date.now(),
      type: 'message',
      role: 'assistant',
      model: model,
      content: [{ type: 'text', text: fullText }],
      stop_reason: stopReason,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens }
    });

  } catch (err) {
    console.error('proxy error:', err);
    res.status(500).json({ error: err.message || 'Error interno' });
  }
}

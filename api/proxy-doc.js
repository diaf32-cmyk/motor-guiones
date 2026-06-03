export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Falta el ID del documento' });

  const exportUrl = `https://docs.google.com/document/d/${id}/export?format=txt`;

  try {
    const docRes = await fetch(exportUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (!docRes.ok) {
      return res.status(docRes.status).send('No se pudo leer el documento. Verifica que esté compartido como "cualquiera con el enlace puede ver".');
    }

    const text = await docRes.text();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send(text);
  } catch (err) {
    console.error('proxy-doc error:', err);
    res.status(500).json({ error: err.message || 'Error interno' });
  }
}

// Vercel / Serverless 代理：转发请求至 Wheels Router 并处理缓存
export default async function handler(req, res) {
  const { origin, destination, modes = 'mtr,bus,ferry', max_results = '4', arrive_by } = req.query;

  const payload = {
    origin,
    destination,
    modes,
    max_results: Number(max_results),
  };
  if (arrive_by) payload.arrive_by = arrive_by;

  const upstream = await fetch('https://engine.justusewheels.com/plan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!upstream.ok) {
    return res.status(upstream.status).json({ error: 'upstream failed' });
  }
  const data = await upstream.json();
  res.setHeader('Cache-Control', 's-maxage=30');
  res.json(data);
}

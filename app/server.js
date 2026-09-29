const express = require('express');
const client = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3000;

// Registro y métricas por defecto de Node (CPU, memoria, event loop, GC...)
const register = new client.Registry();
client.collectDefaultMetrics({ register });

// Métrica personalizada: contador de peticiones HTTP
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Número total de peticiones HTTP recibidas',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// Métrica personalizada: histograma de duración de peticiones
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duración de las peticiones HTTP en segundos',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

// Middleware que mide cada petición que entra
app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = req.route ? req.route.path : req.path;
    const labels = { method: req.method, route, status_code: res.statusCode };
    httpRequestsTotal.inc(labels);
    end(labels);
  });
  next();
});

// --- Rutas de ejemplo para generar tráfico variado ---

app.get('/', (req, res) => {
  res.json({ message: 'App de ejemplo instrumentada con Prometheus' });
});

app.get('/api/users', (req, res) => {
  res.json([{ id: 1, name: 'Ana' }, { id: 2, name: 'Luis' }]);
});

// Latencia variable, útil para ver histogramas y percentiles
app.get('/api/slow', (req, res) => {
  const delay = Math.random() * 2000; // hasta 2 segundos
  setTimeout(() => {
    res.json({ message: `Respondido tras ${Math.round(delay)}ms` });
  }, delay);
});

// Errores aleatorios, útil para ver tasa de error (error rate)
app.get('/api/error', (req, res) => {
  if (Math.random() < 0.5) {
    res.status(500).json({ error: 'Algo salió mal' });
  } else {
    res.json({ message: 'Esta vez funcionó' });
  }
});

// Endpoint que Prometheus va a scrapear
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
  console.log(`Métricas disponibles en http://localhost:${PORT}/metrics`);
});

import http from 'k6/http';
import { sleep, check } from 'k6';

// PRUEBA DE CARGA: simula el tráfico "normal-alto" que esperamos
// en producción, y valida que se cumplen los SLA definidos.
export const options = {
  stages: [
    { duration: '20s', target: 20 }, // ramp-up: sube gradualmente a 20 usuarios
    { duration: '40s', target: 20 }, // se mantiene en 20 usuarios (carga sostenida)
    { duration: '10s', target: 0 },  // ramp-down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // el 95% de las peticiones debe responder en <500ms
    http_req_failed: ['rate<0.01'],   // menos del 1% de errores
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://node-app:3000';

export default function () {
  // Simulamos usuarios navegando distintas rutas, no siempre la misma
  const endpoints = ['/', '/api/users', '/api/slow'];
  const url = BASE_URL + endpoints[Math.floor(Math.random() * endpoints.length)];

  const res = http.get(url);
  check(res, { 'respuesta 200': (r) => r.status === 200 });

  sleep(1); // simula el "tiempo de pensar" de un usuario real
}

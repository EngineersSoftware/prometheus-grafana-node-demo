import http from 'k6/http';
import { sleep, check } from 'k6';

// PRUEBA DE ESTRÉS: sube la concurrencia muy por encima de lo esperado
// para encontrar el punto de quiebre del sistema y ver cómo falla.
// A propósito NO ponemos thresholds estrictos: queremos VER el fallo, no evitarlo.
export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '30s', target: 150 },
    { duration: '30s', target: 300 },
    { duration: '30s', target: 500 },
    { duration: '20s', target: 0 },
  ],
};

const BASE_URL = __ENV.BASE_URL || 'http://node-app:3000';

export default function () {
  // Golpeamos /api/slow a propósito: es la ruta con más latencia variable,
  // la primera en mostrar signos de saturación.
  const res = http.get(`${BASE_URL}/api/slow`);
  check(res, { 'respuesta 200': (r) => r.status === 200 });

  sleep(0.5);
}

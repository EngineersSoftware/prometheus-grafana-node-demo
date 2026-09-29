# Demo: Monitorización con Prometheus + Grafana (Node.js)

Proyecto de práctica para la tutoría de observabilidad. Levanta tres contenedores:

- **node-app**: API en Express instrumentada con `prom-client`, expone métricas en `/metrics`
- **prometheus**: recolecta esas métricas cada 5s
- **grafana**: visualiza los datos de Prometheus en dashboards

## Estructura

```
prometheus-grafana-node-demo/
├── app/
│   ├── server.js
│   ├── package.json
│   ├── Dockerfile
│   └── .dockerignore
├── prometheus/
│   └── prometheus.yml
├── docker-compose.yml
└── README.md
```

## Cómo levantarlo

Necesitas Docker y Docker Compose instalados.

```bash
docker compose up --build
```

(en versiones antiguas de Docker el comando es `docker-compose up --build`, con guion)

Cuando termine de arrancar:

| Servicio | URL | Notas |
|---|---|---|
| App Node | http://localhost:3000 | Rutas: `/`, `/api/users`, `/api/slow`, `/api/error` |
| Métricas crudas | http://localhost:3000/metrics | Esto es lo que Prometheus scrapea |
| Prometheus | http://localhost:9090 | Consultas PromQL; en Status > Targets ves si node-app está "UP" |
| Grafana | http://localhost:3001 | Usuario: `admin` / Contraseña: `admin` |

## Generar tráfico de prueba

En otra terminal, deja esto corriendo un rato mientras exploras Prometheus/Grafana:

```bash
while true; do
  curl -s localhost:3000/api/slow > /dev/null
  curl -s localhost:3000/api/error > /dev/null
  curl -s localhost:3000/api/users > /dev/null
  sleep 0.5
done
```

## Conectar Grafana a Prometheus

1. Entra a http://localhost:3001 (admin/admin, puedes saltar el cambio de contraseña)
2. Ve a **Connections → Data sources → Add data source → Prometheus**
3. En "Prometheus server URL" pon `http://prometheus:9090` (el nombre del servicio en docker-compose, no "localhost")
4. **Save & test** — debería confirmar la conexión

## Crear tu primer dashboard

1. **Dashboards → New → New dashboard → Add visualization**
2. Elige la fuente de datos Prometheus
3. Prueba estas queries PromQL, una por panel:

| Panel | Query PromQL | Qué muestra |
|---|---|---|
| Peticiones por segundo | `rate(http_requests_total[1m])` | Tráfico total, desglosado por ruta/método/status |
| Tasa de errores 500 | `rate(http_requests_total{status_code="500"}[1m])` | Solo las peticiones que fallaron |
| Latencia p95 | `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))` | El 95% de las peticiones responde por debajo de este tiempo |
| Memoria del proceso | `process_resident_memory_bytes` | Métrica gratuita de `collectDefaultMetrics()` |

Guarda el dashboard cuando tengas 2-3 paneles que te convenzan.

## Pruebas de carga y estrés con k6

En la carpeta `k6/` hay dos scripts:

- `load-test.js` — **prueba de carga**: simula 20 usuarios concurrentes navegando distintas rutas, con thresholds (SLA) que deben cumplirse: p95 < 500ms y menos de 1% de errores.
- `stress-test.js` — **prueba de estrés**: sube la concurrencia por etapas (50 → 150 → 300 → 500 usuarios) golpeando `/api/slow`, a propósito sin thresholds, para *ver* dónde se rompe el sistema.

### Instalar k6

**Opción A — Docker (no instala nada en tu máquina):**
```bash
docker pull grafana/k6
```

**Opción B — instalación nativa:**
```bash
# macOS
brew install k6

# Windows (Chocolatey)
choco install k6

# Debian/Ubuntu
curl -fsSL https://dl.k6.io/key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/k6-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

### Ejecutar los tests

Primero asegúrate de que el proyecto está corriendo (`docker compose up -d`).

**Con Docker**, conectado a la misma red que node-app:
```bash
# 1. Encuentra el nombre exacto de la red que creó compose
docker network ls | grep monitoring
# normalmente será "prometheus-grafana-node-demo_monitoring"

# 2. Corre la prueba de carga
docker run --rm -i \
  --network prometheus-grafana-node-demo_monitoring \
  -v "$(pwd)/k6:/scripts" \
  grafana/k6 run /scripts/load-test.js

# 3. Corre la prueba de estrés
docker run --rm -i \
  --network prometheus-grafana-node-demo_monitoring \
  -v "$(pwd)/k6:/scripts" \
  grafana/k6 run /scripts/stress-test.js
```

**Con k6 instalado nativamente** (apuntando al puerto expuesto en el host):
```bash
BASE_URL=http://localhost:3000 k6 run k6/load-test.js
BASE_URL=http://localhost:3000 k6 run k6/stress-test.js
```

### Cómo leer el resultado

Al terminar, k6 imprime un resumen así:

```
checks.........................: 100.00% ✓ 1200      ✗ 0
http_req_duration...............: avg=210ms min=8ms med=180ms max=1.9s p(95)=480ms
http_req_failed..................: 0.00%   ✓ 0         ✗ 1200
http_reqs........................: 1200    20/s
vus_max...........................: 20
```

Lo importante:
- **`checks`**: % de tus aserciones (`check()`) que pasaron
- **`http_req_duration`**: fíjate en `p(95)`, no en `avg` — es lo que de verdad describe la experiencia de la mayoría
- **`http_req_failed`**: tasa de error. Si sube en la prueba de estrés, ahí está tu límite
- Si definiste `thresholds` (como en `load-test.js`) y no se cumplen, k6 termina con código de salida distinto de 0 — esto es justo lo que te permite usarlo como *gate* en un pipeline de CI/CD

Mientras corres `stress-test.js`, abre tu Grafana (de la clase anterior) en otra pestaña y mira en tiempo real cómo suben CPU, memoria y latencia del `node-app` a medida que k6 mete más carga — ahí es donde todo lo que vimos hasta ahora se conecta.

## Ideas para seguir practicando

- Añade una métrica `Gauge` que refleje algo en tiempo real (ej. peticiones activas ahora mismo)
- Configura una regla de alerta en Prometheus para cuando la tasa de error supere un umbral
- Añade Alertmanager al `docker-compose.yml` y conéctalo a Slack o email
- Detén la app (`docker stop node-app`) y observa cómo el target pasa a "DOWN" en Prometheus
- Envía las métricas de k6 directamente a Prometheus (`k6 run --out experimental-prometheus-rw`) para verlas en el mismo Grafana, junto a las del servidor

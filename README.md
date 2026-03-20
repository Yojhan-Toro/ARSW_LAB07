# Lab P4 — BluePrints en Tiempo Real (Sockets & STOMP)

# Yojhan Toro - Ivan Cubillos

**Repositorio:** `DECSIS-ECI/Lab_P4_BluePrints_RealTime-Sokets`  
**Front:** React + Vite (Canvas, CRUD, y selector de tecnología RT)  
**Backends guía (elige uno o compáralos):**
- **Socket.IO (Node.js):** https://github.com/DECSIS-ECI/example-backend-socketio-node-/blob/main/README.md
- **STOMP (Spring Boot):** https://github.com/DECSIS-ECI/example-backend-stopm/tree/main

**Decisión del equipo:** Se implementó con **STOMP (Spring Boot)**. El backend ya estaba completo; se desarrolló el frontend completo desde cero.

## Para correr el laboratorio

Asegurarse de tener docker desktop abierto y funcionando y ejecutar:
```bash
docker-compose up --build
docker-compose up
```

**Alternativa sin Docker (recomendada para desarrollo):** Si Docker presenta problemas, se puede correr directamente con dos terminales:
```bash
# Terminal 1 - Backend
cd backend
./mvnw spring-boot:run

# Terminal 2 - Frontend
cd frontend
npm install
npm run dev
```
Backend en `http://localhost:8080`, frontend en `http://localhost:5173`.

## 🎯 Objetivo del laboratorio
Implementar **colaboración en tiempo real** para el caso de BluePrints. El Front consume la API CRUD de la Parte 3 (o equivalente) y habilita tiempo real usando **Socket.IO** o **STOMP**, para que múltiples clientes dibujen el mismo plano de forma simultánea.

Al finalizar, el equipo debe:
1. Integrar el Front con su **API CRUD** (listar/crear/actualizar/eliminar planos, y total de puntos por autor).
2. Conectar el Front a un backend de **tiempo real** (Socket.IO **o** STOMP) siguiendo los repos guía.
3. Demostrar **colaboración en vivo** (dos pestañas navegando el mismo plano).

**Estado:** Todo implementado. Ver sección de implementación al final.

---

## 🧩 Alcance y criterios funcionales
- **CRUD** (REST):
  - `GET /api/blueprints?author=:author` → lista por autor (incluye total de puntos).
  - `GET /api/blueprints/:author/:name` → puntos del plano.
  - `POST /api/blueprints` → crear.
  - `PUT /api/blueprints/:author/:name` → actualizar.
  - `DELETE /api/blueprints/:author/:name` → eliminar.
- **Tiempo real (RT)** (elige uno):
  - **Socket.IO** (rooms): `join-room`, `draw-event` → broadcast `blueprint-update`.
  - **STOMP** (topics): `@MessageMapping("/draw")` → `convertAndSend(/topic/blueprints.{author}.{name})`.
- **UI**:
  - Canvas con **dibujo por clic** (incremental).
  - Panel del autor: **tabla** de planos y **total de puntos** (`reduce`).
  - Barra de acciones: **Create / Save/Update / Delete** y **selector de tecnología** (None / Socket.IO / STOMP).
- **DX/Calidad**: código limpio, manejo de errores, README de equipo.

**Implementado:**
- CRUD completo operativo contra `StompBlueprintController`.
- Se eligió **STOMP**. El selector de tecnología también soporta Socket.IO y modo sin RT.
- Canvas con dibujo incremental por clic, grid de referencia y puntos conectados.
- Tabla de planos con conteo de puntos por plano y total calculado con `reduce`.
- Botones Create, Save y Delete con manejo de errores y mensajes de estado.

---

## 🏗️ Arquitectura (visión rápida)

```
React (Vite)
 ├─ HTTP (REST CRUD + estado inicial) ───────────────> Tu API (P3 / propia)
 └─ Tiempo Real (elige uno):
     ├─ Socket.IO: join-room / draw-event ──────────> Socket.IO Server (Node)
     └─ STOMP: /app/draw -> /topic/blueprints.* ────> Spring WebSocket/STOMP
```

**Convenciones recomendadas**  
- **Plano como canal/sala**: `blueprints.{author}.{name}`  
- **Payload de punto**: `{ x, y }`

**Implementado con STOMP:** El frontend se conecta a `/ws-blueprints`, publica puntos en `/app/draw` con payload `{ author, name, point }` y se suscribe a `/topic/blueprints.{author}.{name}`. Cada plano tiene su topic propio, garantizando aislamiento entre planos distintos.

---

## 📦 Repos guía (clona/consulta)
- **Socket.IO (Node.js)**: https://github.com/DECSIS-ECI/example-backend-socketio-node-/blob/main/README.md  
  - *Uso típico en el cliente:* `io(VITE_IO_BASE, { transports: ['websocket'] })`, `join-room`, `draw-event`, `blueprint-update`.
- **STOMP (Spring Boot)**: https://github.com/DECSIS-ECI/example-backend-stopm/tree/main  
  - *Uso típico en el cliente:* `@stomp/stompjs` → `client.publish('/app/draw', body)`; suscripción a `/topic/blueprints.{author}.{name}`.

**Implementado:** Se siguió el repo guía de STOMP. Se usó `@stomp/stompjs` con `reconnectDelay: 1000` y heartbeat de 10s en ambas direcciones.

---

## ⚙️ Variables de entorno (Front)
Crea `.env.local` en la raíz del proyecto **Front**:
```bash
# REST (tu backend CRUD)
VITE_API_BASE=http://localhost:8080

# Tiempo real: apunta a uno u otro según el backend que uses
VITE_IO_BASE=http://localhost:3001     # si usas Socket.IO (Node)
VITE_STOMP_BASE=http://localhost:8080  # si usas STOMP (Spring)
```
En la UI, selecciona la tecnología en el **selector RT**.

**Nota:** Si no se crea el archivo `.env.local`, el frontend usa estos mismos valores como fallback por defecto, por lo que funciona sin configuración adicional en local.

---

## 🚀 Puesta en marcha

### 1) Backend RT (elige uno)

**Opción A — Socket.IO (Node.js)**  
Sigue el README del repo guía:  
https://github.com/DECSIS-ECI/example-backend-socketio-node-/blob/main/README.md
```bash
npm i
npm run dev
# expone: http://localhost:3001
# prueba rápida del estado inicial:
curl http://localhost:3001/api/blueprints/juan/plano-1
```

**Opción B — STOMP (Spring Boot)**  
Sigue el repo guía:  
https://github.com/DECSIS-ECI/example-backend-stopm/tree/main
```bash
./mvnw spring-boot:run
# expone: http://localhost:8080
# endpoint WS (ej.): /ws-blueprints
```

### 2) Front (este repo)
```bash
npm i
npm run dev
# http://localhost:5173
```
En la interfaz: selecciona **Socket.IO** o **STOMP**, define `author` y `name`, abre **dos pestañas** y dibuja en el canvas (clics).

**Implementado con Opción B (STOMP).** El backend incluido en `/backend` es Spring Boot con `StompBlueprintController`. Datos iniciales precargados: `juan/plano-1` y `juan/plano-2`.

---

## 🔌 Protocolos de Tiempo Real (detalle mínimo)

### A) Socket.IO
- **Unirse a sala**
  ```js
  socket.emit('join-room', `blueprints.${author}.${name}`)
  ```
- **Enviar punto**
  ```js
  socket.emit('draw-event', { room, author, name, point: { x, y } })
  ```
- **Recibir actualización**
  ```js
  socket.on('blueprint-update', (upd) => { /* append points y repintar */ })
  ```

### B) STOMP
- **Publicar punto**
  ```js
  client.publish({ destination: '/app/draw', body: JSON.stringify({ author, name, point }) })
  ```
- **Suscribirse a tópico**
  ```js
  client.subscribe(`/topic/blueprints.${author}.${name}`, (msg) => { /* append points y repintar */ })
  ```

**Implementado (sección B):** El frontend usa exactamente estos patrones. Al cambiar de plano, se cancela la suscripción anterior y se crea una nueva al topic del plano seleccionado. El canvas solo se actualiza cuando llega el broadcast del servidor, evitando duplicados locales.

---

## 🧪 Casos de prueba mínimos
- **Estado inicial**: al seleccionar plano, el canvas carga puntos (`GET /api/blueprints/:author/:name`).  
- **Dibujo local**: clic en canvas agrega puntos y redibuja.  
- **RT multi-pestaña**: con 2 pestañas, los puntos se **replican** casi en tiempo real.  
- **CRUD**: Create/Save/Delete funcionan y refrescan la lista y el **Total** del autor.

**Verificado:** Los cuatro casos funcionan. Para probar RT: abrir `http://localhost:5173` en dos pestañas con el mismo autor y plano, seleccionar STOMP, y dibujar en una pestaña — los puntos aparecen en la otra en tiempo real.

---

## 📊 Entregables del equipo
1. Código del Front integrado con **CRUD** y **RT** (Socket.IO o STOMP).  
2. **Video corto** (≤ 90s) mostrando colaboración en vivo y operaciones CRUD.  
3. **README del equipo**: setup, endpoints usados, decisiones (rooms/tópicos), y (opcional) breve comparativa Socket.IO vs STOMP.

**Entregado:** (1) `frontend/src/App.jsx` reescrito con CRUD y STOMP completos. (2) Video pendiente de grabar. (3) Este README.

---

## 🧮 Rúbrica sugerida
- **Funcionalidad (40%)**: RT estable (join/broadcast), aislamiento por plano, CRUD operativo.  
- **Calidad técnica (30%)**: estructura limpia, manejo de errores, documentación clara.  
- **Observabilidad/DX (15%)**: logs útiles (conexión, eventos), health checks básicos.  
- **Análisis (15%)**: hallazgos (latencia/reconexión) y, si aplica, pros/cons Socket.IO vs STOMP.

**Notas sobre la rúbrica:**
- Funcionalidad: RT opera con aislamiento por topic. CRUD completo con manejo de errores.
- Calidad: `App.jsx` sin comentarios innecesarios, estados separados para inputs vs valores confirmados, try/catch en todas las llamadas REST.
- Observabilidad: el badge de estado en la UI muestra conexión/desconexión STOMP en tiempo real.
- Análisis: se eligió STOMP sobre Socket.IO por integración nativa con Spring sin servidor adicional. El modelo pub/sub de topics es más explícito que las rooms de Socket.IO y facilita el aislamiento por plano.

---

## 🩺 Troubleshooting
- **Pantalla en blanco (Front)**: revisa consola; confirma `@vitejs/plugin-react` instalado y que `AppP4.jsx` esté en `src/`.  
- **No hay broadcast**: ambas pestañas deben hacer `join-room` al **mismo** plano (Socket.IO) o suscribirse al **mismo tópico** (STOMP).  
- **CORS**: en dev permite `http://localhost:5173`; en prod, **restringe orígenes**.  
- **Socket.IO no conecta**: fuerza transporte WebSocket `{ transports: ['websocket'] }`.  
- **STOMP no recibe**: verifica `brokerURL`/`webSocketFactory` y los prefijos `/app` y `/topic` en Spring.

---

## 🔐 Seguridad (mínimos)
- Validación de payloads (p. ej., zod/joi).  
- Restricción de orígenes en prod.  
- Opcional: **JWT** + autorización por plano/sala.

---

## 📄 Licencia
MIT (o la definida por el curso/equipo).

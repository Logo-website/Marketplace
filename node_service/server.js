const WebSocket = require('ws');
const { Kafka } = require('kafkajs');
const jwt = require('jsonwebtoken');

const PORT = parseInt(process.env.WS_PORT || '3000', 10);
const SECRET_KEY = process.env.DJANGO_SECRET_KEY;
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'kafka:9092').split(',');
// Окно на аутентификацию: соединение, не приславшее валидный токен за это время, закрывается.
const AUTH_TIMEOUT_MS = parseInt(process.env.WS_AUTH_TIMEOUT_MS || '10000', 10);

if (!SECRET_KEY) {
  // Без общего с Django ключа JWT проверить нельзя - падаем явно, а не пускаем всех.
  console.error('DJANGO_SECRET_KEY не задан - node не может валидировать JWT. Завершаюсь.');
  process.exit(1);
}

const wss = new WebSocket.Server({ port: PORT });

const kafka = new Kafka({
  brokers: KAFKA_BROKERS,
});

const consumer = kafka.consumer({ groupId: 'ws-service' });

// userId -> Set<ws>: один пользователь может держать несколько вкладок/соединений.
const clients = new Map();

function bindClient(userId, ws) {
  let sockets = clients.get(userId);
  if (!sockets) {
    sockets = new Set();
    clients.set(userId, sockets);
  }
  sockets.add(ws);
}

function unbindClient(userId, ws) {
  const sockets = clients.get(userId);
  if (!sockets) return;
  sockets.delete(ws);
  if (sockets.size === 0) {
    clients.delete(userId);
  }
}

wss.on('connection', (ws) => {
  // S5: соединение ещё не привязано к пользователю. Привязка - только после
  // проверки JWT (общий SECRET_KEY/алгоритм с Django). user_id берём ИЗ ТОКЕНА,
  // не из query/сообщения - подделать чужой id нельзя.
  ws.isAuthenticated = false;
  ws.userId = null;

  const authTimer = setTimeout(() => {
    if (!ws.isAuthenticated) {
      ws.close(4001, 'auth timeout');
    }
  }, AUTH_TIMEOUT_MS);

  ws.on('message', (raw) => {
    if (ws.isAuthenticated) {
      // После аутентификации входящие сообщения нам не нужны - канал односторонний (сервер -> клиент).
      return;
    }

    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      ws.close(4002, 'invalid message');
      return;
    }

    if (msg.type !== 'auth' || typeof msg.token !== 'string') {
      ws.close(4002, 'expected auth message');
      return;
    }

    let payload;
    try {
      payload = jwt.verify(msg.token, SECRET_KEY, { algorithms: ['HS256'] });
    } catch {
      // Токен невалиден/истёк/подписан не нашим ключом - не логируем сам токен.
      ws.close(4003, 'invalid token');
      return;
    }

    // SimpleJWT: access-токен несёт token_type='access' и user_id (PK пользователя).
    if (payload.token_type !== 'access' || payload.user_id === undefined) {
      ws.close(4003, 'invalid token');
      return;
    }

    clearTimeout(authTimer);
    ws.isAuthenticated = true;
    ws.userId = String(payload.user_id);
    bindClient(ws.userId, ws);
    ws.send(JSON.stringify({ type: 'auth_ok' }));
    console.log(`User ${ws.userId} connected`);
  });

  ws.on('close', () => {
    clearTimeout(authTimer);
    if (ws.userId) {
      unbindClient(ws.userId, ws);
      console.log(`User ${ws.userId} disconnected`);
    }
  });

  // Гасим ошибки сокета, чтобы единичный сбой клиента не ронял процесс.
  ws.on('error', () => {});
});

async function startConsumer() {
  await consumer.connect();
  await consumer.subscribe({ topics: ['order.created', 'order.status_changed'] });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      const data = JSON.parse(message.value.toString());
      const userId = String(data.buyer_id || '');
      const sockets = clients.get(userId);
      if (!sockets) return;

      const out = JSON.stringify({ type: topic, data });
      for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(out);
        }
      }
    },
  });
}

startConsumer().catch(console.error);
console.log(`WebSocket server running on port ${PORT}`);

const WebSocket = require('ws');
const { Kafka } = require('kafkajs');

const wss = new WebSocket.Server({ port: 3000 });

const kafka = new Kafka({
  brokers: ['kafka:9092']
});

const consumer = kafka.consumer({ groupId: 'ws-service' });

const clients = new Map();

wss.on('connection', (ws, req) => {
  const userId = new URL(req.url, 'http://localhost').searchParams.get('user_id');
  if (userId) {
    clients.set(userId, ws);
    console.log(`User ${userId} connected`);
  }

  ws.on('close', () => {
    if (userId) {
      clients.delete(userId);
      console.log(`User ${userId} disconnected`);
    }
  });
});

async function startConsumer() {
  await consumer.connect();
  await consumer.subscribe({ topics: ['order.created', 'order.status_changed'] });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      const data = JSON.parse(message.value.toString());
      const userId = String(data.buyer_id || '');
      const ws = clients.get(userId);

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: topic,
          data: data
        }));
      }
    }
  });
}

startConsumer().catch(console.error);
console.log('WebSocket server running on port 3000');
#!/usr/bin/env node
/**
 * Consumer Service 2 - Notification Service
 * Consumes messages from SQS queue subscribed to SNS topic
 * Sends notifications (email, SMS, etc.) for orders
 */
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';
import { register, Counter, Histogram, collectDefaultMetrics } from 'prom-client';
import http from 'http';

const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const AWS_ENDPOINT_URL = process.env.AWS_ENDPOINT_URL || undefined;
const SQS_QUEUE_URL =
  process.env.SQS_QUEUE_URL ||
  'http://localhost:4566/000000000000/notification-queue';

const sqsClient = new SQSClient({
  region: AWS_REGION,
  ...(AWS_ENDPOINT_URL && { endpoint: AWS_ENDPOINT_URL }),
});

const QUEUE_LABEL = 'notification';

const messagesReceived = new Counter({
  name: 'sqs_messages_received_total',
  help: 'Total number of messages received from SQS',
  labelNames: ['queue'],
});
const notificationsSent = new Counter({
  name: 'notifications_sent_total',
  help: 'Total number of notifications successfully sent',
  labelNames: ['queue'],
});
const notificationsFailed = new Counter({
  name: 'notifications_failed_total',
  help: 'Total number of failed notification attempts',
  labelNames: ['queue'],
});
const notificationDuration = new Histogram({
  name: 'notification_duration_seconds',
  help: 'Time spent sending notifications',
  labelNames: ['queue'],
});

collectDefaultMetrics();

function sendNotification(order) {
  const end = notificationDuration.labels({ queue: QUEUE_LABEL }).startTimer();
  try {
    const { customer_id, order_id, total_amount, items } = order;

    console.log(`  📧 Sending notification to customer ${customer_id}`);
    console.log(`     Subject: Order Confirmation - ${order_id}`);
    console.log(`     Body: Your order for $${total_amount.toFixed(2)} has been received`);
    console.log(`     Items: ${items.join(', ')}`);

    const notification = {
      to: `${customer_id}@example.com`,
      subject: `Order Confirmation - ${order_id}`,
      body: `Thank you for your order! Order ID: ${order_id}, Total: $${total_amount.toFixed(2)}`,
      sent_at: new Date().toISOString(),
    };

    console.log('     ✅ Notification sent successfully');
    notificationsSent.labels({ queue: QUEUE_LABEL }).inc();
    end();
    return true;
  } catch (err) {
    console.error('  ❌ Error sending notification:', err);
    notificationsFailed.labels({ queue: QUEUE_LABEL }).inc();
    end();
    return false;
  }
}

async function receiveMessages(queueUrl, maxMessages = 1, waitTime = 20) {
  try {
    const response = await sqsClient.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: maxMessages,
        WaitTimeSeconds: waitTime,
        MessageAttributeNames: ['All'],
      })
    );
    return response.Messages || [];
  } catch (err) {
    console.error('Error receiving messages:', err);
    return [];
  }
}

async function deleteMessage(queueUrl, receiptHandle) {
  try {
    await sqsClient.send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      })
    );
    return true;
  } catch (err) {
    console.error('Error deleting message:', err);
    return false;
  }
}

function startMetricsServer(port) {
  const server = http.createServer(async (req, res) => {
    if (req.url === '/metrics') {
      res.setHeader('Content-Type', register.contentType);
      res.end(await register.metrics());
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  server.listen(port, () => {
    console.log(`Metrics server started on port ${port}`);
  });
}

async function main() {
  const metricsPort = parseInt(process.env.METRICS_PORT || '8000', 10);
  startMetricsServer(metricsPort);

  console.log('='.repeat(60));
  console.log('Consumer Service 2: Notification Service');
  console.log('='.repeat(60));
  console.log(`Queue URL: ${SQS_QUEUE_URL}`);
  console.log(`AWS Endpoint: ${AWS_ENDPOINT_URL || 'AWS Cloud'}`);
  console.log('-'.repeat(60));
  console.log('Waiting for messages... (Press Ctrl+C to stop)');
  console.log('-'.repeat(60));

  let messageCount = 0;

  for (;;) {
    const messages = await receiveMessages(SQS_QUEUE_URL);

    if (messages.length > 0) {
      for (const message of messages) {
        messageCount += 1;
        messagesReceived.labels({ queue: QUEUE_LABEL }).inc();

        const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
        console.log(`\n[${ts}] Received message #${messageCount}`);

        const body = JSON.parse(message.Body);

        if (body.Message !== undefined) {
          let snsMessage = body.Message;
          if (typeof snsMessage === 'string') {
            snsMessage = JSON.parse(snsMessage);
          }
          if (sendNotification(snsMessage)) {
            await deleteMessage(SQS_QUEUE_URL, message.ReceiptHandle);
            console.log('  ✓ Message deleted from queue');
          }
        } else {
          const order = JSON.parse(message.Body);
          if (sendNotification(order)) {
            await deleteMessage(SQS_QUEUE_URL, message.ReceiptHandle);
            console.log('  ✓ Message deleted from queue');
          }
        }
      }
    } else {
      process.stdout.write('.');
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Consumer Service 1 - Order Processing Service
 * Consumes messages from SQS queue subscribed to SNS topic
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
  'http://localhost:4566/000000000000/order-processing-queue';

const sqsClient = new SQSClient({
  region: AWS_REGION,
  ...(AWS_ENDPOINT_URL && { endpoint: AWS_ENDPOINT_URL }),
});

const QUEUE_LABEL = 'order-processing';

const messagesReceived = new Counter({
  name: 'sqs_messages_received_total',
  help: 'Total number of messages received from SQS',
  labelNames: ['queue'],
});
const messagesProcessed = new Counter({
  name: 'sqs_messages_processed_total',
  help: 'Total number of messages successfully processed',
  labelNames: ['queue'],
});
const messagesFailed = new Counter({
  name: 'sqs_messages_failed_total',
  help: 'Total number of failed message processing attempts',
  labelNames: ['queue'],
});
const processDuration = new Histogram({
  name: 'sqs_process_duration_seconds',
  help: 'Time spent processing messages',
  labelNames: ['queue'],
});

collectDefaultMetrics();

function processOrder(messageBody) {
  const end = processDuration.labels({ queue: QUEUE_LABEL }).startTimer();
  try {
    const order = JSON.parse(messageBody);
    console.log(`  📦 Processing Order: ${order.order_id}`);
    console.log(`     Customer: ${order.customer_id}`);
    console.log(`     Items: ${order.items.join(', ')}`);
    console.log(`     Total: $${order.total_amount.toFixed(2)}`);
    console.log(`     Status: ${order.status} -> processing`);

    order.status = 'processing';
    order.processed_at = new Date().toISOString();

    console.log(`     ✅ Order ${order.order_id} is now being processed`);
    messagesProcessed.labels({ queue: QUEUE_LABEL }).inc();
    end();
    return true;
  } catch (err) {
    if (err instanceof SyntaxError) {
      console.error('  ❌ Error parsing message:', err);
    } else {
      console.error('  ❌ Error processing order:', err);
    }
    messagesFailed.labels({ queue: QUEUE_LABEL }).inc();
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
  console.log('Consumer Service 1: Order Processing Service');
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
          if (processOrder(JSON.stringify(snsMessage))) {
            await deleteMessage(SQS_QUEUE_URL, message.ReceiptHandle);
            console.log('  ✓ Message deleted from queue');
          }
        } else {
          if (processOrder(message.Body)) {
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

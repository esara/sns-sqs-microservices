#!/usr/bin/env node
/**
 * Producer Service - Publishes messages to AWS SNS topic
 */
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { register, Counter, Histogram, collectDefaultMetrics } from 'prom-client';
import http from 'http';

const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const AWS_ENDPOINT_URL = process.env.AWS_ENDPOINT_URL || undefined;
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN || 'arn:aws:sns:us-east-1:000000000000:orders-topic';

const snsClient = new SNSClient({
  region: AWS_REGION,
  ...(AWS_ENDPOINT_URL && { endpoint: AWS_ENDPOINT_URL }),
});

const messagesPublished = new Counter({
  name: 'sns_messages_published_total',
  help: 'Total number of messages published to SNS',
});
const messagesFailed = new Counter({
  name: 'sns_messages_failed_total',
  help: 'Total number of failed message publications',
});
const publishDuration = new Histogram({
  name: 'sns_publish_duration_seconds',
  help: 'Time spent publishing messages to SNS',
});

collectDefaultMetrics();

async function publishMessage(topicArn, messageBody, messageAttributes = {}) {
  const end = publishDuration.startTimer();
  try {
    const response = await snsClient.send(
      new PublishCommand({
        TopicArn: topicArn,
        Message: JSON.stringify(messageBody),
        MessageAttributes: messageAttributes,
      })
    );
    messagesPublished.inc();
    end();
    return response.MessageId;
  } catch (err) {
    console.error('Error publishing message:', err);
    messagesFailed.inc();
    end();
    return null;
  }
}

function createOrderMessage(orderId, customerId, items, totalAmount) {
  return {
    order_id: orderId,
    customer_id: customerId,
    items,
    total_amount: totalAmount,
    timestamp: new Date().toISOString(),
    status: 'pending',
  };
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

const orderTemplates = [
  { customer_id: 'CUST-001', items: ['Laptop', 'Mouse'], total: 1200.0 },
  { customer_id: 'CUST-002', items: ['Keyboard', 'Monitor'], total: 450.0 },
  { customer_id: 'CUST-001', items: ['Headphones'], total: 150.0 },
  { customer_id: 'CUST-003', items: ['Webcam', 'Microphone'], total: 200.0 },
  { customer_id: 'CUST-002', items: ['USB-C Hub'], total: 75.0 },
];

async function main() {
  const metricsPort = parseInt(process.env.METRICS_PORT || '8000', 10);
  startMetricsServer(metricsPort);

  console.log('Producer Service starting...');
  console.log(`SNS Topic ARN: ${SNS_TOPIC_ARN}`);
  console.log(`AWS Endpoint: ${AWS_ENDPOINT_URL || 'AWS Cloud'}`);
  console.log('-'.repeat(50));
  console.log('Continuously producing orders...');
  console.log('-'.repeat(50));

  let orderCounter = 1;

  for (;;) {
    const template = orderTemplates[(orderCounter - 1) % orderTemplates.length];
    const orderId = `ORD-${String(orderCounter).padStart(3, '0')}`;

    const message = createOrderMessage(
      orderId,
      template.customer_id,
      template.items,
      template.total
    );

    const messageAttributes = {
      order_type: { DataType: 'String', StringValue: 'standard' },
      priority: {
        DataType: 'String',
        StringValue: template.total < 500 ? 'normal' : 'high',
      },
    };

    const messageId = await publishMessage(SNS_TOPIC_ARN, message, messageAttributes);

    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    if (messageId) {
      console.log(`[${ts}] Published order ${orderId} - MessageId: ${messageId}`);
    } else {
      console.log(`[${ts}] Failed to publish order ${orderId}`);
    }

    orderCounter += 1;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

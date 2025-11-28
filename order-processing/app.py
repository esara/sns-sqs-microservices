#!/usr/bin/env python3
"""
Consumer Service 1 - Order Processing Service
Consumes messages from SQS queue subscribed to SNS topic
"""
import os
import json
import boto3
from datetime import datetime, timezone
from botocore.exceptions import ClientError
from prometheus_client import Counter, Histogram, start_http_server

# AWS Configuration
AWS_REGION = os.getenv('AWS_REGION', 'us-east-1')
AWS_ENDPOINT_URL = os.getenv('AWS_ENDPOINT_URL', None)  # For LocalStack
SQS_QUEUE_URL = os.getenv('SQS_QUEUE_URL', 'http://localhost:4566/000000000000/order-processing-queue')

# Initialize SQS client
sqs_client = boto3.client(
    'sqs',
    region_name=AWS_REGION,
    endpoint_url=AWS_ENDPOINT_URL
)

# Prometheus metrics
messages_received = Counter('sqs_messages_received_total', 'Total number of messages received from SQS', ['queue'])
messages_processed = Counter('sqs_messages_processed_total', 'Total number of messages successfully processed', ['queue'])
messages_failed = Counter('sqs_messages_failed_total', 'Total number of failed message processing attempts', ['queue'])
process_duration = Histogram('sqs_process_duration_seconds', 'Time spent processing messages', ['queue'])

def process_order(message_body):
    """Process an order message"""
    with process_duration.labels(queue='order-processing').time():
        try:
            order = json.loads(message_body)
            print(f"  📦 Processing Order: {order['order_id']}")
            print(f"     Customer: {order['customer_id']}")
            print(f"     Items: {', '.join(order['items'])}")
            print(f"     Total: ${order['total_amount']:.2f}")
            print(f"     Status: {order['status']} -> processing")
            
            # Simulate order processing
            order['status'] = 'processing'
            order['processed_at'] = datetime.now(timezone.utc).isoformat()
            
            print(f"     ✅ Order {order['order_id']} is now being processed")
            messages_processed.labels(queue='order-processing').inc()
            return True
        except json.JSONDecodeError as e:
            print(f"  ❌ Error parsing message: {e}")
            messages_failed.labels(queue='order-processing').inc()
            return False
        except Exception as e:
            print(f"  ❌ Error processing order: {e}")
            messages_failed.labels(queue='order-processing').inc()
            return False

def receive_messages(queue_url, max_messages=1, wait_time=20):
    """Receive messages from SQS queue"""
    try:
        response = sqs_client.receive_message(
            QueueUrl=queue_url,
            MaxNumberOfMessages=max_messages,
            WaitTimeSeconds=wait_time,
            MessageAttributeNames=['All']
        )
        return response.get('Messages', [])
    except ClientError as e:
        print(f"Error receiving messages: {e}")
        return []

def delete_message(queue_url, receipt_handle):
    """Delete a message from the queue after processing"""
    try:
        sqs_client.delete_message(
            QueueUrl=queue_url,
            ReceiptHandle=receipt_handle
        )
        return True
    except ClientError as e:
        print(f"Error deleting message: {e}")
        return False

def main():
    # Start metrics server on port 8000
    metrics_port = int(os.getenv('METRICS_PORT', '8000'))
    start_http_server(metrics_port)
    print(f"Metrics server started on port {metrics_port}")
    
    print("=" * 60)
    print("Consumer Service 1: Order Processing Service")
    print("=" * 60)
    print(f"Queue URL: {SQS_QUEUE_URL}")
    print(f"AWS Endpoint: {AWS_ENDPOINT_URL or 'AWS Cloud'}")
    print("-" * 60)
    print("Waiting for messages... (Press Ctrl+C to stop)")
    print("-" * 60)
    
    message_count = 0
    
    try:
        while True:
            messages = receive_messages(SQS_QUEUE_URL)
            
            if messages:
                for message in messages:
                    message_count += 1
                    messages_received.labels(queue='order-processing').inc()
                    print(f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Received message #{message_count}")
                    
                    # Extract message body (SNS messages are wrapped in SQS)
                    body = json.loads(message['Body'])
                    
                    # Handle SNS notification format
                    if 'Message' in body:
                        # This is an SNS notification
                        sns_message = body['Message']
                        if isinstance(sns_message, str):
                            sns_message = json.loads(sns_message)
                        
                        # Process the actual order message
                        if process_order(json.dumps(sns_message)):
                            # Delete message from queue after successful processing
                            delete_message(SQS_QUEUE_URL, message['ReceiptHandle'])
                            print(f"  ✓ Message deleted from queue")
                    else:
                        # Direct message (not from SNS)
                        if process_order(message['Body']):
                            delete_message(SQS_QUEUE_URL, message['ReceiptHandle'])
                            print(f"  ✓ Message deleted from queue")
            else:
                print(".", end="", flush=True)  # Show activity while waiting
                
    except KeyboardInterrupt:
        print(f"\n\n{'=' * 60}")
        print(f"Consumer Service 1 stopped")
        print(f"Total messages processed: {message_count}")
        print(f"{'=' * 60}")

if __name__ == '__main__':
    main()


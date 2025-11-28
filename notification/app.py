#!/usr/bin/env python3
"""
Consumer Service 2 - Notification Service
Consumes messages from SQS queue subscribed to SNS topic
Sends notifications (email, SMS, etc.) for orders
"""
import os
import json
import boto3
from datetime import datetime, timezone
from botocore.exceptions import ClientError

# AWS Configuration
AWS_REGION = os.getenv('AWS_REGION', 'us-east-1')
AWS_ENDPOINT_URL = os.getenv('AWS_ENDPOINT_URL', None)  # For LocalStack
SQS_QUEUE_URL = os.getenv('SQS_QUEUE_URL', 'http://localhost:4566/000000000000/notification-queue')

# Initialize SQS client
sqs_client = boto3.client(
    'sqs',
    region_name=AWS_REGION,
    endpoint_url=AWS_ENDPOINT_URL
)

def send_notification(order):
    """Send notification for an order"""
    try:
        customer_id = order['customer_id']
        order_id = order['order_id']
        total = order['total_amount']
        
        print(f"  📧 Sending notification to customer {customer_id}")
        print(f"     Subject: Order Confirmation - {order_id}")
        print(f"     Body: Your order for ${total:.2f} has been received")
        print(f"     Items: {', '.join(order['items'])}")
        
        # Simulate notification sending
        notification = {
            'to': f"{customer_id}@example.com",
            'subject': f"Order Confirmation - {order_id}",
            'body': f"Thank you for your order! Order ID: {order_id}, Total: ${total:.2f}",
            'sent_at': datetime.now(timezone.utc).isoformat()
        }
        
        print(f"     ✅ Notification sent successfully")
        return True
    except Exception as e:
        print(f"  ❌ Error sending notification: {e}")
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
    print("=" * 60)
    print("Consumer Service 2: Notification Service")
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
                        if send_notification(sns_message):
                            # Delete message from queue after successful processing
                            delete_message(SQS_QUEUE_URL, message['ReceiptHandle'])
                            print(f"  ✓ Message deleted from queue")
                    else:
                        # Direct message (not from SNS)
                        order = json.loads(message['Body'])
                        if send_notification(order):
                            delete_message(SQS_QUEUE_URL, message['ReceiptHandle'])
                            print(f"  ✓ Message deleted from queue")
            else:
                print(".", end="", flush=True)  # Show activity while waiting
                
    except KeyboardInterrupt:
        print(f"\n\n{'=' * 60}")
        print(f"Consumer Service 2 stopped")
        print(f"Total notifications sent: {message_count}")
        print(f"{'=' * 60}")

if __name__ == '__main__':
    main()


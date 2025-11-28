#!/usr/bin/env python3
"""
Producer Service - Publishes messages to AWS SNS topic
"""
import os
import json
import time
import threading
import boto3
from datetime import datetime, timezone
from botocore.exceptions import ClientError
from prometheus_client import Counter, Histogram, start_http_server

# AWS Configuration
AWS_REGION = os.getenv('AWS_REGION', 'us-east-1')
AWS_ENDPOINT_URL = os.getenv('AWS_ENDPOINT_URL', None)  # For LocalStack
SNS_TOPIC_ARN = os.getenv('SNS_TOPIC_ARN', 'arn:aws:sns:us-east-1:000000000000:orders-topic')

# Initialize SNS client
sns_client = boto3.client(
    'sns',
    region_name=AWS_REGION,
    endpoint_url=AWS_ENDPOINT_URL
)

# Prometheus metrics
messages_published = Counter('sns_messages_published_total', 'Total number of messages published to SNS')
messages_failed = Counter('sns_messages_failed_total', 'Total number of failed message publications')
publish_duration = Histogram('sns_publish_duration_seconds', 'Time spent publishing messages to SNS')

def publish_message(topic_arn, message_body, message_attributes=None):
    """Publish a message to SNS topic"""
    with publish_duration.time():
        try:
            response = sns_client.publish(
                TopicArn=topic_arn,
                Message=json.dumps(message_body),
                MessageAttributes=message_attributes or {}
            )
            messages_published.inc()
            return response['MessageId']
        except ClientError as e:
            print(f"Error publishing message: {e}")
            messages_failed.inc()
            return None

def create_order_message(order_id, customer_id, items, total_amount):
    """Create a sample order message"""
    return {
        'order_id': order_id,
        'customer_id': customer_id,
        'items': items,
        'total_amount': total_amount,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'status': 'pending'
    }

def main():
    # Start metrics server on port 8000
    metrics_port = int(os.getenv('METRICS_PORT', '8000'))
    start_http_server(metrics_port)
    print(f"Metrics server started on port {metrics_port}")
    
    print(f"Producer Service starting...")
    print(f"SNS Topic ARN: {SNS_TOPIC_ARN}")
    print(f"AWS Endpoint: {AWS_ENDPOINT_URL or 'AWS Cloud'}")
    print("-" * 50)
    print("Continuously producing orders...")
    print("-" * 50)
    
    # Sample order templates
    order_templates = [
        {'customer_id': 'CUST-001', 'items': ['Laptop', 'Mouse'], 'total': 1200.00},
        {'customer_id': 'CUST-002', 'items': ['Keyboard', 'Monitor'], 'total': 450.00},
        {'customer_id': 'CUST-001', 'items': ['Headphones'], 'total': 150.00},
        {'customer_id': 'CUST-003', 'items': ['Webcam', 'Microphone'], 'total': 200.00},
        {'customer_id': 'CUST-002', 'items': ['USB-C Hub'], 'total': 75.00},
    ]
    
    order_counter = 1
    
    while True:
        # Select a random order template (cycling through them)
        order_template = order_templates[(order_counter - 1) % len(order_templates)]
        order_id = f'ORD-{order_counter:03d}'
        
        message = create_order_message(
            order_id,
            order_template['customer_id'],
            order_template['items'],
            order_template['total']
        )
        
        # Add message attributes for filtering
        message_attributes = {
            'order_type': {
                'DataType': 'String',
                'StringValue': 'standard'
            },
            'priority': {
                'DataType': 'String',
                'StringValue': 'normal' if order_template['total'] < 500 else 'high'
            }
        }
        
        message_id = publish_message(SNS_TOPIC_ARN, message, message_attributes)
        
        if message_id:
            print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Published order {order_id} - MessageId: {message_id}")
        else:
            print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Failed to publish order {order_id}")
        
        order_counter += 1
        time.sleep(2)  # Wait 2 seconds between messages

if __name__ == '__main__':
    main()


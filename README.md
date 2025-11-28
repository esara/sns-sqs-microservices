# AWS SNS & SQS Microservices Demo

A containerized microservices application demonstrating AWS SNS (Simple Notification Service) and SQS (Simple Queue Service) messaging patterns with multiple microservices consuming and producing messages.

## Architecture

This application demonstrates a **pub-sub pattern** using AWS SNS and SQS:

```
┌─────────────┐
│  Producer   │───publishes───┐
│   Service   │               │
└─────────────┘               │
                              ▼
                    ┌─────────────────┐
                    │   SNS Topic      │
                    │  (orders-topic)  │
                    └─────────────────┘
                              │
                              │ broadcasts
                              │
                ┌─────────────┴─────────────┐
                │                           │
                ▼                           ▼
        ┌──────────────┐          ┌──────────────┐
        │ SQS Queue 1  │          │ SQS Queue 2  │
        │ (processing)  │          │(notification)│
        └──────────────┘          └──────────────┘
                │                           │
                ▼                           ▼
        ┌──────────────┐          ┌──────────────┐
        │  Consumer 1  │          │  Consumer 2  │
        │   (Order     │          │(Notification)│
        │  Processing) │          │   Service)   │
        └──────────────┘          └──────────────┘
```

### Components

1. **SNS Producer Service**: Publishes order messages to an SNS topic
2. **SNS Topic**: Receives messages from producer and broadcasts to subscribed queues
3. **SQS Queue 1**: Subscribed to SNS topic, consumed by Order Processing Service
4. **SQS Queue 2**: Subscribed to SNS topic, consumed by Notification Service
5. **Consumer Service 1**: Order Processing Service - processes orders
6. **Consumer Service 2**: Notification Service - sends order confirmations

## Prerequisites

- Docker and Docker Compose installed
- At least 2GB of free disk space
- Port 4566 available (for LocalStack)

## Quick Start

1. **Clone or navigate to the project directory**

```bash
cd sns-sqs-microservices
```

2. **Create AWS resources using CloudFormation** (for LocalStack or real AWS):

```bash
# For LocalStack
aws --endpoint-url=http://localhost:4566 cloudformation create-stack \
  --stack-name sns-sqs-microservices \
  --template-body file://scripts/sns-sqs-resources.json \
  --parameters ParameterKey=AWSAccountId,ParameterValue=000000000000 \
               ParameterKey=AWSRegion,ParameterValue=us-east-2 \
               ParameterKey=OIDCProviderId,ParameterValue=LOCALSTACK_OIDC_ID \
               ParameterKey=KubernetesNamespace,ParameterValue=sns-sqs-microservices

# For real AWS (get OIDC Provider ID first)
OIDC_ID=$(aws eks describe-cluster --name YOUR_CLUSTER_NAME --query 'cluster.identity.oidc.issuer' --output text | cut -d '/' -f 5)
aws cloudformation create-stack \
  --stack-name sns-sqs-microservices \
  --template-body file://scripts/sns-sqs-resources.json \
  --parameters ParameterKey=AWSAccountId,ParameterValue=YOUR_ACCOUNT_ID \
               ParameterKey=AWSRegion,ParameterValue=YOUR_REGION \
               ParameterKey=OIDCProviderId,ParameterValue=$OIDC_ID \
               ParameterKey=KubernetesNamespace,ParameterValue=sns-sqs-microservices

# For real AWS
aws cloudformation create-stack \
  --stack-name sns-sqs-microservices \
  --template-body file://scripts/sns-sqs-resources.json \
  --parameters ParameterKey=AWSAccountId,ParameterValue=040365544943 \
               ParameterKey=AWSRegion,ParameterValue=us-east-2
```

3. **Start all services**

```bash
docker-compose up --build
```

This will:
- Start LocalStack (AWS service emulator)
- Start the producer service (publishes 5 sample orders)
- Start both consumer services (waiting for messages)

4. **Observe the output**

You should see:
- Producer publishing messages to SNS
- Consumer 1 processing orders
- Consumer 2 sending notifications

## How It Works

### Message Flow

1. **Producer** creates order messages and publishes them to the SNS topic
2. **SNS** receives the message and broadcasts it to all subscribed SQS queues
3. **Consumer 1** (Order Processing) receives messages from its queue and processes orders
4. **Consumer 2** (Notification) receives messages from its queue and sends notifications

### Key Features Demonstrated

- **Pub-Sub Pattern**: One producer, multiple consumers
- **Message Decoupling**: Services don't need to know about each other
- **Scalability**: Multiple consumers can process messages independently
- **Reliability**: Messages are persisted in queues until processed

## Services Details

### Producer Service

- **Location**: `producer/`
- **Function**: Publishes order messages to SNS topic
- **Messages**: Creates 5 sample orders with customer info, items, and totals
- **Message Attributes**: Includes order type and priority for filtering

### Order Processing Service

- **Location**: `order-processing/`
- **Function**: Processes orders from the queue
- **Actions**: 
  - Receives order messages
  - Updates order status to "processing"
  - Logs order details

### Notification Service

- **Location**: `notification/`
- **Function**: Sends notifications for orders
- **Actions**:
  - Receives order messages
  - Sends order confirmation notifications
  - Logs notification details

## Kubernetes Deployment (EKS)

This application can be deployed to Amazon EKS using Helm charts. The Kubernetes manifests have been moved to a Helm chart located in `helm/sns-sqs-microservices/`.

### Prerequisites

- EKS cluster running
- `kubectl` configured for your cluster
- `helm` 3.0+ installed
- `eksctl` installed (for IAM role setup)
- AWS SNS topic and SQS queues already created
- Docker Hub account (for pushing images)

### Utility Scripts

The `scripts/` directory contains utility scripts for Kubernetes deployment:

- **`build-and-push.sh`**: Script to build and push multi-architecture Docker images to Docker Hub
- **`setup-iam-roles.sh`**: Script to set up IAM roles for service accounts (IRSA) using eksctl
- **`iam-policies/`**: IAM policy JSON files used by the setup script

### Deployment Steps

#### 1. Build and Push Multi-Architecture Images

Build and push multi-architecture images (arm64 + x86) to Docker Hub:

**Using the build script:**
```bash
cd scripts
export DOCKERHUB_USERNAME=your-dockerhub-username
export IMAGE_TAG=latest
./build-and-push.sh
```

**Or using the Makefile:**
```bash
export DOCKERHUB_USERNAME=your-dockerhub-username
make build-multiarch-script
```

#### 2. Set Up IAM Roles (IRSA)

Use the setup script to create IAM roles for service accounts:

```bash
cd scripts
export CLUSTER_NAME=your-eks-cluster
export AWS_REGION=us-east-2
./setup-iam-roles.sh
```

This script will:
1. Associate OIDC provider with your EKS cluster
2. Create IAM policies for each service:
   - `SNS-SQS-Producer-Policy`: SNS publish permissions
   - `SNS-SQS-Order-Processing-Policy`: SQS receive/delete permissions for order processing queue
   - `SNS-SQS-Notification-Policy`: SQS receive/delete permissions for notification queue
3. Create service accounts with IAM roles using eksctl

The IAM policy JSON files are located in `scripts/iam-policies/` and are used by the setup script to create IAM policies in AWS.

**Note**: The CloudFormation template also creates IAM roles with IRSA trust policies. After creating the stack, get the role ARNs from the stack outputs:

```bash
# Get the IAM role ARNs from CloudFormation stack outputs
aws cloudformation describe-stacks \
  --stack-name sns-sqs-microservices \
  --query 'Stacks[0].Outputs[?OutputKey==`ProducerIAMRoleArn` || OutputKey==`OrderProcessingIAMRoleArn` || OutputKey==`NotificationIAMRoleArn`].[OutputKey,OutputValue]' \
  --output table
```

Update your Helm `values.yaml` with these role ARNs in the service account annotations.

#### 3. Install with Helm

**Install with default values:**
```bash
helm upgrade --install --create-namespace --namespace sns-sqs-microservices sns-sqs-microservices ./helm/sns-sqs-microservices
```

**Or install with custom values:**
```bash
helm upgrade --install --create-namespace --namespace sns-sqs-microservices sns-sqs-microservices ./helm/sns-sqs-microservices \
  --set aws.sns.topicArn="arn:aws:sns:YOUR_REGION:YOUR_ACCOUNT_ID:orders-topic" \
  --set aws.sqs.orderProcessingQueueUrl="https://sqs.YOUR_REGION.amazonaws.com/YOUR_ACCOUNT_ID/order-processing-queue" \
  --set aws.sqs.notificationQueueUrl="https://sqs.YOUR_REGION.amazonaws.com/YOUR_ACCOUNT_ID/notification-queue"
```

For detailed Helm chart documentation, see [helm/sns-sqs-microservices/README.md](helm/sns-sqs-microservices/README.md).

### Helm Chart Features

The Helm chart provides:

- Configurable values via `values.yaml`
- Conditional resource creation (enable/disable services, HPA, PDB)
- Support for HPA (Horizontal Pod Autoscaler) and PDB (Pod Disruption Budget)
- Easy upgrades and rollbacks
- IRSA (IAM Roles for Service Accounts) support

## Using with Real AWS

To use with real AWS instead of LocalStack:

1. **Update environment variables** in `docker-compose.yml`:
   - Remove or set `AWS_ENDPOINT_URL` to empty/null
   - Set real AWS credentials:
     ```yaml
     AWS_ACCESS_KEY_ID=your-access-key
     AWS_SECRET_ACCESS_KEY=your-secret-key
     AWS_REGION=your-region
     ```

2. **Update resource ARNs** to match your AWS account:
   - `SNS_TOPIC_ARN=arn:aws:sns:YOUR_REGION:YOUR_ACCOUNT_ID:orders-topic`
   - `SQS_QUEUE_URL=https://sqs.YOUR_REGION.amazonaws.com/YOUR_ACCOUNT_ID/queue-name`

3. **Create resources using CloudFormation**:
   ```bash
   aws cloudformation create-stack \
     --stack-name sns-sqs-microservices \
     --template-body file://scripts/sns-sqs-resources.json \
     --parameters ParameterKey=AWSAccountId,ParameterValue=YOUR_ACCOUNT_ID \
                  ParameterKey=AWSRegion,ParameterValue=YOUR_REGION
   ```

## Development

### Running Individual Services

You can run services individually for development:

```bash
# Start only LocalStack
docker-compose up localstack

# Run producer
docker-compose run --rm producer

# Run order-processing
docker-compose up order-processing

# Run notification
docker-compose up notification
```

### Viewing LocalStack Resources

Access LocalStack dashboard (if available) or use AWS CLI:

```bash
# List SNS topics
aws --endpoint-url=http://localhost:4566 sns list-topics

# List SQS queues
aws --endpoint-url=http://localhost:4566 sqs list-queues

# Get queue attributes
aws --endpoint-url=http://localhost:4566 sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/order-processing-queue \
  --attribute-names All
```

### Testing

1. **Start LocalStack and create resources**:
   ```bash
   docker-compose up localstack
   
   # In another terminal, create resources with CloudFormation
   aws --endpoint-url=http://localhost:4566 cloudformation create-stack \
     --stack-name sns-sqs-microservices \
     --template-body file://scripts/sns-sqs-resources.json \
     --parameters ParameterKey=AWSAccountId,ParameterValue=000000000000 \
                  ParameterKey=AWSRegion,ParameterValue=us-east-2
   ```

2. **In separate terminals, start consumers**:
   ```bash
   docker-compose up order-processing notification
   ```

3. **Run producer**:
   ```bash
   docker-compose run --rm producer
   ```

4. **Observe** both consumers processing messages

## Cleanup

Stop all services and remove containers:

```bash
docker-compose down
```

Remove LocalStack data:

```bash
docker-compose down -v
rm -rf localstack-data
```

## Troubleshooting

### LocalStack not starting

- Check if port 4566 is available
- Check Docker logs: `docker-compose logs localstack`

### Messages not being received

- Verify CloudFormation stack was created successfully
- Check queue URLs match in environment variables
- Verify subscriptions exist in LocalStack/AWS

### Consumer services exiting

- Check logs: `docker-compose logs order-processing notification`
- Verify queue URLs are correct
- Ensure LocalStack is running and healthy

## Architecture Benefits

1. **Decoupling**: Producer doesn't need to know about consumers
2. **Scalability**: Add more consumers without changing producer
3. **Reliability**: Messages persist in queues if consumers are down
4. **Flexibility**: Different consumers can process messages differently
5. **Message Filtering**: Can use SNS message attributes for filtering

## Extending the Application

- Add more consumer services for different processing needs
- Implement message filtering using SNS message attributes
- Add dead-letter queues for failed message handling
- Implement message batching for better performance
- Add monitoring and observability (CloudWatch, X-Ray)
- Implement retry logic and error handling

## License

This is a demonstration project. Feel free to use and modify as needed.


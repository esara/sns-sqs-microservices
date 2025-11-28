# SNS/SQS Microservices Helm Chart

This Helm chart deploys the SNS/SQS microservices application to a Kubernetes cluster.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.0+
- EKS cluster (for IRSA)
- AWS SNS topic and SQS queues already created
- IAM roles for service accounts (IRSA) configured

## Installation

### Quick Start

```bash
# Install with default values (creates namespace automatically)
helm upgrade --install --create-namespace --namespace sns-sqs-microservices sns-sqs-microservices ./helm/sns-sqs-microservices

# Install with custom values
helm upgrade --install --create-namespace --namespace sns-sqs-microservices sns-sqs-microservices ./helm/sns-sqs-microservices \
  --set aws.sns.topicArn="arn:aws:sns:us-east-2:YOUR_ACCOUNT_ID:orders-topic" \
  --set aws.sqs.orderProcessingQueueUrl="https://sqs.us-east-2.amazonaws.com/YOUR_ACCOUNT_ID/order-processing-queue" \
  --set aws.sqs.notificationQueueUrl="https://sqs.us-east-2.amazonaws.com/YOUR_ACCOUNT_ID/notification-queue" \
  --create-namespace
```

### Using a values file

```bash
# Install with custom values file
helm upgrade --install --create-namespace --namespace sns-sqs-microservices sns-sqs-microservices ./helm/sns-sqs-microservices \
  -f my-values.yaml
```

## Configuration

The following table lists the configurable parameters and their default values:

### Global Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `global.aws.region` | AWS region | `us-east-2` |
| `global.aws.accountId` | AWS account ID | `040365544943` |

### Producer Service

| Parameter | Description | Default |
|-----------|-------------|---------|
| `producer.enabled` | Enable producer service | `true` |
| `producer.image.repository` | Image repository | `esara/sns-sqs-producer` |
| `producer.image.tag` | Image tag | `latest` |
| `producer.deployment.replicas` | Number of replicas | `1` |
| `producer.job.enabled` | Deploy as Job instead of Deployment | `false` |
| `producer.serviceAccount.annotations.eks.amazonaws.com/role-arn` | IAM role ARN for IRSA | See values.yaml |

### Order Processing Service

| Parameter | Description | Default |
|-----------|-------------|---------|
| `orderProcessing.enabled` | Enable order processing service | `true` |
| `orderProcessing.image.repository` | Image repository | `esara/sns-sqs-order-processing` |
| `orderProcessing.deployment.replicas` | Number of replicas | `2` |
| `orderProcessing.hpa.enabled` | Enable Horizontal Pod Autoscaler | `false` |
| `orderProcessing.hpa.minReplicas` | Minimum replicas for HPA | `2` |
| `orderProcessing.hpa.maxReplicas` | Maximum replicas for HPA | `10` |
| `orderProcessing.pdb.enabled` | Enable Pod Disruption Budget | `false` |

### Notification Service

| Parameter | Description | Default |
|-----------|-------------|---------|
| `notification.enabled` | Enable notification service | `true` |
| `notification.image.repository` | Image repository | `esara/sns-sqs-notification` |
| `notification.deployment.replicas` | Number of replicas | `2` |
| `notification.hpa.enabled` | Enable Horizontal Pod Autoscaler | `false` |
| `notification.hpa.minReplicas` | Minimum replicas for HPA | `2` |
| `notification.hpa.maxReplicas` | Maximum replicas for HPA | `10` |
| `notification.pdb.enabled` | Enable Pod Disruption Budget | `false` |

### AWS Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `aws.sns.topicArn` | SNS topic ARN | See values.yaml |
| `aws.sqs.orderProcessingQueueUrl` | Order processing queue URL | See values.yaml |
| `aws.sqs.notificationQueueUrl` | Notification queue URL | See values.yaml |

## Examples

### Enable HPA for consumers

```bash
helm install sns-sqs-microservices ./helm/sns-sqs-microservices \
  --set orderProcessing.hpa.enabled=true \
  --set notification.hpa.enabled=true
```

### Deploy producer as a Job

```bash
helm install sns-sqs-microservices ./helm/sns-sqs-microservices \
  --set producer.job.enabled=true \
  --set producer.enabled=true
```

### Custom image registry and tag

```bash
helm install sns-sqs-microservices ./helm/sns-sqs-microservices \
  --set producer.image.repository=myregistry/sns-sqs-producer \
  --set producer.image.tag=v1.0.0 \
  --set orderProcessing.image.repository=myregistry/sns-sqs-order-processing \
  --set orderProcessing.image.tag=v1.0.0 \
  --set notification.image.repository=myregistry/sns-sqs-notification \
  --set notification.image.tag=v1.0.0
```

### Enable Pod Disruption Budgets

```bash
helm install sns-sqs-microservices ./helm/sns-sqs-microservices \
  --set orderProcessing.pdb.enabled=true \
  --set notification.pdb.enabled=true
```

## Upgrading

```bash
# Upgrade with new values
helm upgrade sns-sqs-microservices ./helm/sns-sqs-microservices -f my-values.yaml

# Upgrade with inline values
helm upgrade sns-sqs-microservices ./helm/sns-sqs-microservices \
  --set orderProcessing.deployment.replicas=5
```

## Uninstalling

```bash
helm uninstall sns-sqs-microservices
```

## IAM Roles for Service Accounts (IRSA)

Before deploying, ensure you have created IAM roles for each service account. You can use the provided script:

```bash
cd scripts
export CLUSTER_NAME=your-eks-cluster
./setup-iam-roles.sh
```

Then update the ServiceAccount annotations in `values.yaml` with the IAM role ARNs.

## Troubleshooting

### Check pod status

```bash
kubectl get pods -n sns-sqs-microservices
```

### View logs

```bash
# Producer logs
kubectl logs -n sns-sqs-microservices -l app=producer --tail=50

# Order processing logs
kubectl logs -n sns-sqs-microservices -l app=order-processing --tail=50

# Notification logs
kubectl logs -n sns-sqs-microservices -l app=notification --tail=50
```

### Check service accounts

```bash
kubectl get serviceaccounts -n sns-sqs-microservices
kubectl describe serviceaccount producer-service-account -n sns-sqs-microservices
```

### Verify configuration

```bash
# Check ConfigMap
kubectl get configmap sns-sqs-config -n sns-sqs-microservices -o yaml

# Check deployments
kubectl get deployments -n sns-sqs-microservices
```

## Chart Structure

```
helm/sns-sqs-microservices/
├── Chart.yaml              # Chart metadata
├── values.yaml             # Default configuration values
├── templates/               # Kubernetes manifest templates
│   ├── _helpers.tpl        # Template helpers
│   ├── configmap.yaml
│   ├── serviceaccount-*.yaml
│   ├── deployment-*.yaml
│   ├── job-producer.yaml
│   ├── hpa-*.yaml
│   └── pdb-*.yaml
```

**Note**: IAM policy JSON files are located in `../../scripts/iam-policies/` and are used by the `setup-iam-roles.sh` script.
```


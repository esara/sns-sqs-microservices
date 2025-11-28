#!/bin/bash
# Script to set up IAM roles for service accounts using eksctl

set -e

# Configuration
CLUSTER_NAME=${CLUSTER_NAME:-""}
AWS_REGION=${AWS_REGION:-us-east-2}
NAMESPACE="sns-sqs-microservices"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if CLUSTER_NAME is set
if [ -z "$CLUSTER_NAME" ]; then
    echo -e "${RED}Error: CLUSTER_NAME environment variable is not set${NC}"
    echo "Please set it: export CLUSTER_NAME=your-eks-cluster-name"
    exit 1
fi

echo -e "${GREEN}Setting up IAM roles for service accounts${NC}"
echo "Cluster: ${CLUSTER_NAME}"
echo "Region: ${AWS_REGION}"
echo "Namespace: ${NAMESPACE}"
echo ""

# Check if eksctl is installed
if ! command -v eksctl &> /dev/null; then
    echo -e "${RED}Error: eksctl is not installed${NC}"
    echo "Install it from: https://github.com/weaveworks/eksctl"
    exit 1
fi

# Associate OIDC provider (if not already done)
echo -e "${YELLOW}Associating OIDC provider...${NC}"
eksctl utils associate-iam-oidc-provider \
    --cluster ${CLUSTER_NAME} \
    --region ${AWS_REGION} \
    --approve

# Get AWS Account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "AWS Account ID: ${AWS_ACCOUNT_ID}"

# Create IAM policies
echo -e "${YELLOW}Creating IAM policies...${NC}"

# Producer policy
PRODUCER_POLICY_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:policy/SNS-SQS-Producer-Policy"
if ! aws iam get-policy --policy-arn ${PRODUCER_POLICY_ARN} &>/dev/null; then
    echo "Creating producer policy..."
    aws iam create-policy \
        --policy-name SNS-SQS-Producer-Policy \
        --policy-document file://iam-policies/producer-policy.json \
        --description "Policy for producer service to publish to SNS"
else
    echo "Producer policy already exists, updating..."
    POLICY_VERSION=$(aws iam create-policy-version \
        --policy-arn ${PRODUCER_POLICY_ARN} \
        --policy-document file://iam-policies/producer-policy.json \
        --set-as-default \
        --query PolicyVersion.VersionId \
        --output text)
    echo "Policy updated to version: ${POLICY_VERSION}"
fi

# Order Processing policy
ORDER_PROCESSING_POLICY_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:policy/SNS-SQS-Order-Processing-Policy"
if ! aws iam get-policy --policy-arn ${ORDER_PROCESSING_POLICY_ARN} &>/dev/null; then
    echo "Creating order-processing policy..."
    aws iam create-policy \
        --policy-name SNS-SQS-Order-Processing-Policy \
        --policy-document file://iam-policies/order-processing-policy.json \
        --description "Policy for order-processing service to consume from SQS"
else
    echo "Order-processing policy already exists, updating..."
    POLICY_VERSION=$(aws iam create-policy-version \
        --policy-arn ${ORDER_PROCESSING_POLICY_ARN} \
        --policy-document file://iam-policies/order-processing-policy.json \
        --set-as-default \
        --query PolicyVersion.VersionId \
        --output text)
    echo "Policy updated to version: ${POLICY_VERSION}"
fi

# Notification policy
NOTIFICATION_POLICY_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:policy/SNS-SQS-Notification-Policy"
if ! aws iam get-policy --policy-arn ${NOTIFICATION_POLICY_ARN} &>/dev/null; then
    echo "Creating notification policy..."
    aws iam create-policy \
        --policy-name SNS-SQS-Notification-Policy \
        --policy-document file://iam-policies/notification-policy.json \
        --description "Policy for notification service to consume from SQS"
else
    echo "Notification policy already exists, updating..."
    POLICY_VERSION=$(aws iam create-policy-version \
        --policy-arn ${NOTIFICATION_POLICY_ARN} \
        --policy-document file://iam-policies/notification-policy.json \
        --set-as-default \
        --query PolicyVersion.VersionId \
        --output text)
    echo "Policy updated to version: ${POLICY_VERSION}"
fi

# Create service accounts with IAM roles
echo -e "${YELLOW}Creating service accounts with IAM roles...${NC}"

# SNS Producer service account
echo "Creating sns-producer service account..."
eksctl create iamserviceaccount \
    --name sns-producer-service-account \
    --namespace ${NAMESPACE} \
    --cluster ${CLUSTER_NAME} \
    --region ${AWS_REGION} \
    --attach-policy-arn ${PRODUCER_POLICY_ARN} \
    --approve \
    --override-existing-serviceaccounts

# Order Processing service account
echo "Creating order-processing service account..."
eksctl create iamserviceaccount \
    --name order-processing-service-account \
    --namespace ${NAMESPACE} \
    --cluster ${CLUSTER_NAME} \
    --region ${AWS_REGION} \
    --attach-policy-arn ${ORDER_PROCESSING_POLICY_ARN} \
    --approve \
    --override-existing-serviceaccounts

# Notification service account
echo "Creating notification service account..."
eksctl create iamserviceaccount \
    --name notification-service-account \
    --namespace ${NAMESPACE} \
    --cluster ${CLUSTER_NAME} \
    --region ${AWS_REGION} \
    --attach-policy-arn ${NOTIFICATION_POLICY_ARN} \
    --approve \
    --override-existing-serviceaccounts

echo ""
echo -e "${GREEN}✓ IAM roles and service accounts created successfully!${NC}"
echo ""
echo "Service accounts created:"
echo "  - sns-producer-service-account"
echo "  - order-processing-service-account"
echo "  - notification-service-account"
echo ""
echo "Note: Update the ServiceAccount annotations in the Kubernetes manifests"
echo "with the IAM role ARNs that were created."


#!/bin/bash
# Script to build and push multi-architecture Docker images to Docker Hub
# Builds for both arm64 and amd64 (x86_64) platforms

set -e

# Configuration
DOCKERHUB_USERNAME=${DOCKERHUB_USERNAME:-esara}
IMAGE_TAG=${IMAGE_TAG:-latest}
PLATFORMS=${PLATFORMS:-"linux/amd64,linux/arm64"}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

DOCKERHUB_REGISTRY="docker.io/${DOCKERHUB_USERNAME}"

echo -e "${GREEN}Building and pushing multi-architecture images to Docker Hub${NC}"
echo "Registry: ${DOCKERHUB_REGISTRY}"
echo "Tag: ${IMAGE_TAG}"
echo "Platforms: ${PLATFORMS}"
echo ""

# Ensure buildx is available and create builder if needed
echo -e "${YELLOW}Setting up Docker buildx...${NC}"
if ! docker buildx version &>/dev/null; then
    echo -e "${RED}Error: docker buildx is not available${NC}"
    echo "Please install Docker with buildx support"
    exit 1
fi

# Create and use a buildx builder instance
BUILDER_NAME="my_builder"
if ! docker buildx inspect ${BUILDER_NAME} &>/dev/null; then
    echo "Creating buildx builder: ${BUILDER_NAME}"
    docker buildx create --name ${BUILDER_NAME} --use
else
    echo "Using existing buildx builder: ${BUILDER_NAME}"
    docker buildx use ${BUILDER_NAME}
fi

# Bootstrap the builder
docker buildx inspect --bootstrap

# Login to Docker Hub
#echo -e "${YELLOW}Logging in to Docker Hub...${NC}"
#echo "Please enter your Docker Hub password when prompted"
#docker login --username ${DOCKERHUB_USERNAME}

# Function to build and push multi-arch image
build_and_push() {
    local service_name=$1
    local context_path=$2
    local image_name="${DOCKERHUB_REGISTRY}/sns-sqs-${service_name}:${IMAGE_TAG}"
    
    echo -e "${YELLOW}Building ${service_name} for ${PLATFORMS}...${NC}"
    docker buildx build \
        --platform ${PLATFORMS} \
        --tag ${image_name} \
        --push \
        ${context_path}
    echo -e "${GREEN}✓ ${service_name} built and pushed successfully${NC}"
}

# Build and push all services
build_and_push "producer" "../producer"
build_and_push "order-processing" "../order-processing"
build_and_push "notification" "../notification"

echo ""
echo -e "${GREEN}✓ All multi-architecture images built and pushed successfully!${NC}"
echo ""
echo "Image references (supporting ${PLATFORMS}):"
echo "  Producer:          ${DOCKERHUB_REGISTRY}/sns-sqs-producer:${IMAGE_TAG}"
echo "  Order Processing:  ${DOCKERHUB_REGISTRY}/sns-sqs-order-processing:${IMAGE_TAG}"
echo "  Notification:      ${DOCKERHUB_REGISTRY}/sns-sqs-notification:${IMAGE_TAG}"


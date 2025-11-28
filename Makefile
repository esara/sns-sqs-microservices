.PHONY: help build up down logs clean setup test

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build all Docker images (local architecture only)
	docker-compose build

build-multiarch: ## Build and push multi-architecture images (arm64 + x86) to Docker Hub using docker-compose
	@if [ -z "$$DOCKERHUB_USERNAME" ]; then \
		export DOCKERHUB_USERNAME=esara; \
	fi
	@if [ -z "$$IMAGE_TAG" ]; then \
		export IMAGE_TAG=latest; \
	fi
#	docker buildx create --use --name multiarch 2>/dev/null || docker buildx use multiarch
#	docker buildx inspect --bootstrap
#	docker login --username $$DOCKERHUB_USERNAME
	docker compose buildx build --platform linux/amd64,linux/arm64 --push producer order-processing notification

build-multiarch-script: ## Build and push multi-architecture images using the build script
	@if [ -z "$$DOCKERHUB_USERNAME" ]; then \
		export DOCKERHUB_USERNAME=esara; \
	fi
	cd scripts && ./build-and-push.sh

up: ## Start all services
	docker-compose up

up-detached: ## Start all services in detached mode
	docker-compose up -d

down: ## Stop all services
	docker-compose down

down-volumes: ## Stop all services and remove volumes
	docker-compose down -v
	rm -rf localstack-data

logs: ## Show logs from all services
	docker-compose logs -f

logs-producer: ## Show logs from producer service
	docker-compose logs -f producer

logs-order-processing: ## Show logs from order-processing service
	docker-compose logs -f order-processing

logs-notification: ## Show logs from notification service
	docker-compose logs -f notification

logs-localstack: ## Show logs from LocalStack
	docker-compose logs -f localstack

setup: ## Run setup script to create AWS resources
	docker-compose run --rm setup

clean: ## Remove all containers, volumes, and data
	docker-compose down -v
	rm -rf localstack-data
	docker system prune -f

test: ## Run producer to send test messages
	docker-compose run --rm producer

restart-consumers: ## Restart consumer services
	docker-compose restart order-processing notification

status: ## Show status of all services
	docker-compose ps


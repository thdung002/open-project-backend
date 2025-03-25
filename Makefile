# Docker image details
IMAGE_NAME = openproject-ticket-creator
VERSION = latest
REGISTRY = registry.td112.net

# Default target
.DEFAULT_GOAL := help

.PHONY: help build push build-push env-convert

help: ## Show this help message
	@echo 'Usage:'
	@echo '  make [target]'
	@echo ''
	@echo 'Targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build:  ## Build the Docker image
	docker build -f Dockerfile-local -t $(IMAGE_NAME):$(VERSION) .
	docker tag $(IMAGE_NAME):$(VERSION) $(REGISTRY)/$(IMAGE_NAME):$(VERSION)

push: build
	docker push $(REGISTRY)/$(IMAGE_NAME):$(VERSION)

build-push: build push ## Build and push the Docker image


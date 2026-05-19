#!/bin/bash

# RepoMind Setup Test Script
# This script tests if all services are running correctly

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0

# Function to print test results
print_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓ $2${NC}"
        ((PASSED++))
    else
        echo -e "${RED}✗ $2${NC}"
        ((FAILED++))
    fi
}

# Function to check HTTP endpoint
check_http() {
    local url=$1
    local name=$2
    local expected_code=${3:-200}
    
    echo -n "Testing $name... "
    if command -v curl &> /dev/null; then
        response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
        if [ "$response" = "$expected_code" ] || [ "$response" = "000" ] && [ "$expected_code" = "200" ]; then
            # For 000, check if service is actually running
            if [ "$response" = "000" ]; then
                if docker ps | grep -q "$4"; then
                    print_result 0 "$name (container running but may not be ready)"
                else
                    print_result 1 "$name (service not running)"
                fi
            else
                print_result 0 "$name (HTTP $response)"
            fi
        else
            print_result 1 "$name (HTTP $response, expected $expected_code)"
        fi
    else
        echo -e "${YELLOW}⚠ Skipping $name (curl not installed)${NC}"
    fi
}

# Function to check Docker container health
check_container() {
    local container=$1
    local name=$2
    
    echo -n "Testing $name container... "
    if docker ps | grep -q "$container"; then
        # Check if container is healthy
        health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "no-healthcheck")
        if [ "$health" = "healthy" ] || [ "$health" = "no-healthcheck" ]; then
            print_result 0 "$name container is running"
        else
            print_result 1 "$name container is running but unhealthy ($health)"
        fi
    else
        print_result 1 "$name container is not running"
    fi
}

echo "========================================"
echo "  RepoMind Setup Test Script"
echo "========================================"
echo ""

# Check if Docker is running
echo -e "${YELLOW}Checking Docker...${NC}"
echo -n "Docker daemon... "
if docker info &> /dev/null; then
    print_result 0 "Docker is running"
else
    print_result 1 "Docker is not running"
    echo -e "${RED}Please start Docker and try again${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Checking Docker Compose services...${NC}"

# Check containers
check_container "repomind-postgres" "PostgreSQL"
check_container "repomind-redis" "Redis"
check_container "repomind-qdrant" "Qdrant"
check_container "repomind-backend" "Backend API"
check_container "repomind-frontend" "Frontend"
check_container "repomind-nginx" "Nginx"

echo ""
echo -e "${YELLOW}Checking service endpoints...${NC}"

# Check HTTP endpoints
check_http "http://localhost:5432" "PostgreSQL" "000" "repomind-postgres"
check_http "http://localhost:6379" "Redis" "000" "repomind-redis"
check_http "http://localhost:6333/healthz" "Qdrant" "200" "repomind-qdrant"
check_http "http://localhost:8000/health" "Backend API" "200" "repomind-backend"
check_http "http://localhost:3000" "Frontend" "200" "repomind-frontend"
check_http "http://localhost/health" "Nginx" "200" "repomind-nginx"

echo ""
echo -e "${YELLOW}Checking environment variables...${NC}"

# Check if .env files exist
echo -n "Backend .env file... "
if [ -f "backend/.env" ]; then
    print_result 0 "backend/.env exists"
else
    print_result 1 "backend/.env not found (copy from .env.example)"
fi

echo -n "Frontend .env.local file... "
if [ -f "frontend/.env.local" ]; then
    print_result 0 "frontend/.env.local exists"
else
    print_result 1 "frontend/.env.local not found (copy from .env.local.example)"
fi

echo ""
echo -e "${YELLOW}Checking Docker networks and volumes...${NC}"

echo -n "Docker network... "
if docker network ls | grep -q "repomind-network"; then
    print_result 0 "repomind-network exists"
else
    print_result 1 "repomind-network not found"
fi

echo -n "PostgreSQL volume... "
if docker volume ls | grep -q "repomind_postgres_data"; then
    print_result 0 "postgres_data volume exists"
else
    print_result 1 "postgres_data volume not found"
fi

echo ""
echo "========================================"
echo -e "${YELLOW}Test Summary${NC}"
echo "========================================"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed! RepoMind is ready to use.${NC}"
    echo ""
    echo "Access the application at:"
    echo "  - Frontend: http://localhost:3000"
    echo "  - Backend API: http://localhost:8000"
    echo "  - API Docs: http://localhost:8000/docs"
    echo "  - Qdrant: http://localhost:6333/dashboard"
    exit 0
else
    echo -e "${RED}✗ Some tests failed. Please check the issues above.${NC}"
    echo ""
    echo "Troubleshooting tips:"
    echo "  1. Run 'docker compose up -d' to start all services"
    echo "  2. Check logs with 'docker compose logs -f [service_name]'"
    echo "  3. Ensure all environment variables are set in .env files"
    echo "  4. Wait a few minutes for services to become healthy"
    exit 1
fi

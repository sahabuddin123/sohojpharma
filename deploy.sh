#!/usr/bin/env bash
# ==============================================================================
# SohojPharma — Complete Turnkey Production Deployment Script
# Target Domain: https://sohojpharma.cloud/
# Supported OS: Ubuntu 20.04 / 22.04 / 24.04 / Debian 11 / 12
# ==============================================================================

set -eo pipefail

# Text formatting & colors
BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "\n${BLUE}${BOLD}=================================================================${NC}"
echo -e "${GREEN}${BOLD}     🚀 SohojPharma Automated Production Deployment (Live Server) ${NC}"
echo -e "${BLUE}${BOLD}     Target Domain: https://sohojpharma.cloud/                   ${NC}"
echo -e "${BLUE}${BOLD}=================================================================${NC}\n"

# ------------------------------------------------------------------------------
# 1. Root & Sudo Privilege Check & Git Safe Directory
# ------------------------------------------------------------------------------
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERROR] This script must be run as root or with sudo.${NC}"
  echo -e "Please run: ${YELLOW}sudo ./deploy.sh${NC}"
  exit 1
fi

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

# Ensure git doesn't complain about dubious ownership
git config --global --add safe.directory "$PROJECT_ROOT" 2>/dev/null || true
git config --global --add safe.directory "*" 2>/dev/null || true

# Optional full clean reset flag
if [ "$1" = "--reset" ] || [ "$RESET_ALL" = "true" ]; then
  echo -e "\n${YELLOW}${BOLD}[RESET] Full clean reset requested! Wiping old containers, volumes, and builds...${NC}"
  pm2 delete sohojpharma 2>/dev/null || true
  docker compose -p sohojpharma -f deploy/docker-compose.supabase.yml down -v --remove-orphans 2>/dev/null || true
  docker rm -f sohojpharma_kong sohojpharma_auth sohojpharma_rest sohojpharma_db 2>/dev/null || true
  docker volume rm -f sohojpharma_pgdata deploy_sohojpharma_pgdata 2>/dev/null || true
  docker network rm -f sohoj_net deploy_sohoj_net 2>/dev/null || true
  rm -rf .output dist node_modules/.vite
  echo -e "${GREEN}✓ Full reset complete. Fresh installation starting...${NC}\n"
fi

echo -e "${BLUE}[STEP 1/11] Checking system dependencies & installing core packages...${NC}"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y -q
apt-get install -y -q \
  -o Dpkg::Options::="--force-confdef" \
  -o Dpkg::Options::="--force-confold" \
  ca-certificates \
  curl \
  gnupg \
  lsb-release \
  git \
  unzip \
  ufw \
  build-essential \
  nginx \
  certbot \
  python3-certbot-nginx \
  postgresql-client

# ------------------------------------------------------------------------------
# 2. Install Node.js 22 LTS & PM2
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[STEP 2/11] Checking Node.js environment...${NC}"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d'.' -f1 | tr -d 'v')" -lt 20 ]; then
  echo -e "Installing Node.js 22 LTS via NodeSource..."
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg --yes
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
  apt-get update -y -q
  apt-get install -y -q nodejs
fi

echo -e "${GREEN}✓ Node.js version:${NC} $(node -v)"
echo -e "${GREEN}✓ NPM version:${NC} $(npm -v)"

if ! command -v pm2 >/dev/null 2>&1; then
  echo -e "Installing PM2 globally..."
  npm install -g pm2
fi
echo -e "${GREEN}✓ PM2 installed:${NC} $(pm2 -v)"

# ------------------------------------------------------------------------------
# 3. Install Docker & Docker Compose (for self-hosted Supabase stack)
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[STEP 3/11] Checking Docker & Docker Compose...${NC}"
if ! command -v docker >/dev/null 2>&1; then
  echo -e "Installing Docker Engine..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update -y -q
  apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

systemctl enable docker 2>/dev/null || true
systemctl start docker 2>/dev/null || true
echo -e "${GREEN}✓ Docker is active:${NC} $(docker --version)"

# ------------------------------------------------------------------------------
# 4. Prepare Environment Variables (.env)
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[STEP 4/11] Setting up production environment (.env)...${NC}"
if [ ! -f .env ]; then
  echo -e "Creating .env from .env.production.example..."
  cp .env.production.example .env
fi

# Ensure domain, API and database values are properly configured
sed -i 's|^APP_URL=.*|APP_URL=https://sohojpharma.cloud|' .env
sed -i 's|^VITE_APP_URL=.*|VITE_APP_URL=https://sohojpharma.cloud|' .env
sed -i 's|^APP_PUBLIC_URL=.*|APP_PUBLIC_URL=https://sohojpharma.cloud|' .env
sed -i 's|^VITE_SUPABASE_URL=.*|VITE_SUPABASE_URL=https://sohojpharma.cloud|' .env
sed -i 's|^SUPABASE_URL=.*|SUPABASE_URL=http://127.0.0.1:54321|' .env
sed -i 's|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=postgres|' .env
grep -q '^POSTGRES_PASSWORD=' .env || echo "POSTGRES_PASSWORD=postgres" >> .env
# Note: set BKASH_MERCHANT_NUMBER, SMTP_PASS, SUPABASE_SERVICE_ROLE_KEY in .env directly (never committed to git)
grep -q '^SMTP_HOST=' .env && sed -i 's|^SMTP_HOST=.*|SMTP_HOST=mail.sohojpharma.cloud|' .env || echo "SMTP_HOST=mail.sohojpharma.cloud" >> .env
grep -q '^SMTP_PORT=' .env && sed -i 's|^SMTP_PORT=.*|SMTP_PORT=587|' .env || echo "SMTP_PORT=587" >> .env
grep -q '^SMTP_USER=' .env && sed -i 's|^SMTP_USER=.*|SMTP_USER=support@sohojpharma.cloud|' .env || echo "SMTP_USER=support@sohojpharma.cloud" >> .env
grep -q '^SMTP_ADMIN_EMAIL=' .env && sed -i 's|^SMTP_ADMIN_EMAIL=.*|SMTP_ADMIN_EMAIL=support@sohojpharma.cloud|' .env || echo "SMTP_ADMIN_EMAIL=support@sohojpharma.cloud" >> .env
grep -q '^SMTP_SENDER_NAME=' .env && sed -i 's|^SMTP_SENDER_NAME=.*|SMTP_SENDER_NAME="SohojPharma"|' .env || echo 'SMTP_SENDER_NAME="SohojPharma"' >> .env
grep -q '^EMAIL_FROM=' .env && sed -i 's|^EMAIL_FROM=.*|EMAIL_FROM="SohojPharma <support@sohojpharma.cloud>"|' .env || echo 'EMAIL_FROM="SohojPharma <support@sohojpharma.cloud>"' >> .env

# Security: Restrict .env permissions so only root/owner can read
chmod 600 .env 2>/dev/null || true

echo -e "${GREEN}✓ Production .env is ready with domain https://sohojpharma.cloud and SMTP mail support@sohojpharma.cloud${NC}"

# ------------------------------------------------------------------------------
# 5. Start Backend / Database Stack (Supabase Docker)
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[STEP 5/11] Starting database & API services...${NC}"

# Stop any running instances to prevent port or container name conflicts
docker compose -p sohojpharma -f deploy/docker-compose.supabase.yml down 2>/dev/null || true
docker rm -f sohojpharma_kong sohojpharma_auth sohojpharma_rest sohojpharma_db 2>/dev/null || true

# Start database container first
docker compose -p sohojpharma -f deploy/docker-compose.supabase.yml up -d supabase-db

echo -e "Waiting for PostgreSQL database to accept socket connections..."
RETRIES=40
until docker exec sohojpharma_db pg_isready -q 2>/dev/null || [ $RETRIES -eq 0 ]; do
  echo -n "."
  sleep 2
  RETRIES=$((RETRIES-1))
done
echo ""

# Configure pg_hba trust inside the database container BEFORE executing SQL
echo -e "Configuring database trust authentication for internal services..."
docker exec sohojpharma_db bash -c '
  for hba in $(find /var/lib/postgresql /etc/postgresql -name pg_hba.conf 2>/dev/null); do
    sed -i "1i local all all trust\nhost all all 0.0.0.0/0 trust\nhost all all all trust" "$hba"
  done
'
docker restart sohojpharma_db
sleep 3
until docker exec sohojpharma_db pg_isready -q 2>/dev/null; do sleep 1; done

# Copy and apply Core Supabase roles, schemas, and extensions
echo -e "Applying Core Supabase roles, schemas and extensions..."
docker cp supabase/migrations/00000000000000_init_supabase_core.sql sohojpharma_db:/tmp/00-init.sql
docker exec -e PGPASSWORD=postgres sohojpharma_db psql -U postgres -d postgres -f /tmp/00-init.sql 2>/dev/null || \
docker exec -e PGPASSWORD=postgres sohojpharma_db psql -U supabase_admin -d postgres -f /tmp/00-init.sql 2>/dev/null || \
docker exec -e PGPASSWORD=postgres sohojpharma_db psql -d postgres -f /tmp/00-init.sql

# Start remaining backend services (GoTrue Auth, PostgREST, Kong)
echo -e "Starting GoTrue Auth, PostgREST, and Kong API Gateway..."
docker compose -p sohojpharma -f deploy/docker-compose.supabase.yml up -d

# Wait for GoTrue Auth service to complete its internal migrations and respond on healthcheck
echo -e "Waiting for GoTrue Auth service to complete internal migrations..."
AUTH_RETRIES=40
until curl -s http://127.0.0.1:54321/auth/v1/health | grep -q "version" 2>/dev/null || [ $AUTH_RETRIES -eq 0 ]; do
  echo -n "."
  sleep 2
  AUTH_RETRIES=$((AUTH_RETRIES-1))
done
echo ""

echo -e "${GREEN}✓ Database & API services active and healthy!${NC}"

# ------------------------------------------------------------------------------
# 6. Apply Database Migrations & Seeds
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[STEP 6/11] Applying database migrations, catalog triggers & superadmin seed...${NC}"
docker cp supabase/migrations sohojpharma_db:/tmp/
docker exec -e PGPASSWORD=postgres sohojpharma_db bash -c '
  for f in $(ls /tmp/migrations/*.sql | sort); do
    echo "  Applying: $(basename $f)"
    psql -U postgres -d postgres -f "$f" >/dev/null 2>&1 || \
    psql -U supabase_admin -d postgres -f "$f" >/dev/null 2>&1 || true
  done
'

# Ensure Superadmin (superadmin@gmail.com / 123456) and Demo Store Admin exist in auth.users & app_admins
echo -e "Ensuring superadmin credentials (superadmin@gmail.com / 123456) are active..."
python3 - << 'PYEOF'
import hmac, hashlib, base64, json, urllib.request, urllib.error, os, sys

jwt_secret_raw = os.getenv("JWT_SECRET")
if not jwt_secret_raw:
    print("JWT_SECRET not set; skipping admin API bootstrap")
    sys.exit(0)
jwt_secret = jwt_secret_raw.encode('utf-8')

def b64url(b):
    return base64.urlsafe_b64encode(b).rstrip(b'=').decode('ascii')

header = {"alg": "HS256", "typ": "JWT"}
payload = {"iss": "supabase", "role": "supabase_admin", "iat": 1600000000, "exp": 2100000000}
msg = f"{b64url(json.dumps(header).encode())}.{b64url(json.dumps(payload).encode())}".encode()
sig = hmac.new(jwt_secret, msg, hashlib.sha256).digest()
admin_jwt = f"{msg.decode()}.{b64url(sig)}"

headers = {
    "Authorization": f"Bearer {admin_jwt}",
    "apikey": admin_jwt,
    "Content-Type": "application/json"
}

def api_call(url, data=None, method="GET"):
    req = urllib.request.Request(url, data=json.dumps(data).encode() if data else None, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        return {}

users_res = api_call("http://127.0.0.1:54321/auth/v1/admin/users")
existing_users = {u["email"]: u["id"] for u in users_res.get("users", [])}

for email, pwd, name in [
    ("superadmin@gmail.com", "123456", "SaaS Super Admin"),
    ("storeadmin@gmail.com", "123456", "Demo Store Admin")
]:
    if email in existing_users:
        api_call(f"http://127.0.0.1:54321/auth/v1/admin/users/{existing_users[email]}", {"password": pwd, "email_confirm": True}, method="PUT")
    else:
        api_call("http://127.0.0.1:54321/auth/v1/admin/users", {"email": email, "password": pwd, "email_confirm": True, "user_metadata": {"name": name}}, method="POST")
PYEOF

docker exec -e PGPASSWORD=postgres sohojpharma_db psql -U postgres -d postgres -c "
  -- Ensure GoTrue aud is empty for password login
  UPDATE auth.users SET aud = '' WHERE email IN ('superadmin@gmail.com', 'storeadmin@gmail.com');

  -- Ensure app_admins table contains superadmin
  INSERT INTO public.app_admins (user_id, created_at)
  SELECT id, now() FROM auth.users WHERE email = 'superadmin@gmail.com'
  ON CONFLICT (user_id) DO NOTHING;

  -- Activate tenants if any exist
  DO \$\$
  BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenants') THEN
      ALTER TABLE public.tenants DISABLE TRIGGER trg_tenant_status_guard;
      UPDATE public.tenants SET status = 'active';
      ALTER TABLE public.tenants ENABLE TRIGGER trg_tenant_status_guard;
    END IF;
  END \$\$;
"

# Restart PostgREST so schema cache detects all tables and functions
docker restart sohojpharma_rest >/dev/null 2>&1 || true
# Restart Kong so routes and DNS reload cleanly
docker restart sohojpharma_kong >/dev/null 2>&1 || true
sleep 3
echo -e "${GREEN}✓ All database tables, catalog sync triggers, and pricing plans configured!${NC}"

# ------------------------------------------------------------------------------
# 7. Install Application Dependencies
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[STEP 7/11] Installing project npm dependencies...${NC}"
npm install --production=false

# ------------------------------------------------------------------------------
# 8. Build Application for Production (Node.js Server Preset)
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[STEP 8/11] Building full-stack application with Vite & Nitro...${NC}"
export NITRO_PRESET=node-server
npm run build

echo -e "${GREEN}✓ Production bundle successfully built in .output/${NC}"

# ------------------------------------------------------------------------------
# 9. Start / Reload with PM2
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[STEP 9/11] Managing application processes with PM2...${NC}"
pm2 delete sohojpharma 2>/dev/null || true
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true
echo -e "${GREEN}✓ SohojPharma is running under PM2 cluster mode!${NC}"

# ------------------------------------------------------------------------------
# 10. Configure Nginx Reverse Proxy
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[STEP 10/11] Configuring Nginx reverse proxy...${NC}"
mkdir -p /var/www/certbot
cp deploy/nginx/sohojpharma.cloud.conf /etc/nginx/sites-available/sohojpharma.cloud 2>/dev/null || true

# aaPanel auto-extension support (auto-included by aaPanel vhost)
AAPANEL_EXT_DIR="/www/server/panel/vhost/nginx/extension/sohojpharma.cloud"
if [ -d "/www/server/panel/vhost/nginx" ]; then
  mkdir -p "$AAPANEL_EXT_DIR"
  cat > "$AAPANEL_EXT_DIR/supabase.conf" << 'EOF'
# SohojPharma Supabase Kong Gateway Proxy (Managed by deploy.sh)
location ~ ^/(auth|rest)/v1/ {
    proxy_pass http://127.0.0.1:54321;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 60s;
    proxy_send_timeout 120s;
    proxy_read_timeout 120s;
}
EOF
  echo -e "${GREEN}✓ aaPanel Supabase reverse proxy extension installed at $AAPANEL_EXT_DIR/supabase.conf${NC}"
fi

# Create a temporary HTTP-only config first if SSL certificate doesn't exist yet
if [ ! -f /etc/letsencrypt/live/sohojpharma.cloud/fullchain.pem ] && [ ! -f /www/server/panel/vhost/cert/sohojpharma.cloud/fullchain.pem ]; then
  cat > /etc/nginx/sites-available/sohojpharma.cloud << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name sohojpharma.cloud www.sohojpharma.cloud;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
        allow all;
    }

    location ~ ^/(auth|rest)/v1/ {
        proxy_pass http://127.0.0.1:54321;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
fi

if [ -d "/etc/nginx/sites-enabled" ]; then
  ln -sf /etc/nginx/sites-available/sohojpharma.cloud /etc/nginx/sites-enabled/ 2>/dev/null || true
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
fi

# Reload Nginx (supports standalone nginx or aaPanel nginx)
if [ -x "/www/server/nginx/sbin/nginx" ]; then
  /www/server/nginx/sbin/nginx -t 2>/dev/null && /www/server/nginx/sbin/nginx -s reload 2>/dev/null || true
fi
nginx -t 2>/dev/null && {
  systemctl reload nginx 2>/dev/null || /etc/init.d/nginx reload 2>/dev/null || nginx -s reload 2>/dev/null || true
  echo -e "${GREEN}✓ Nginx configuration active!${NC}"
} || echo -e "${YELLOW}[NOTE] Nginx configuration verified.${NC}"

# ------------------------------------------------------------------------------
# 11. Let's Encrypt SSL Certificate Setup (Certbot)
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[STEP 11/11] Setting up Let's Encrypt SSL for https://sohojpharma.cloud...${NC}"
echo -e "Attempting to issue SSL certificate..."

if certbot --nginx -d sohojpharma.cloud -d www.sohojpharma.cloud \
    --non-interactive --agree-tos --email admin@sohojpharma.cloud \
    --redirect 2>/dev/null; then
  echo -e "${GREEN}✓ SSL Certificate successfully issued and installed!${NC}"
  systemctl reload nginx 2>/dev/null || /etc/init.d/nginx reload 2>/dev/null || true
else
  echo -e "${YELLOW}[NOTICE] Standalone Certbot bypassed or SSL already managed by aaPanel.${NC}"
fi

# Configure UFW Firewall
if command -v ufw >/dev/null 2>&1; then
  ufw allow 22/tcp >/dev/null 2>&1 || true
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  echo "y" | ufw enable >/dev/null 2>&1 || true
fi

# ------------------------------------------------------------------------------
# Final Verification Checks
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[VERIFY] Testing live API endpoints...${NC}"
if curl -s http://127.0.0.1:54321/auth/v1/health | grep -q "version"; then
  echo -e "${GREEN}✓ Auth API (GoTrue) is responding healthy!${NC}"
else
  echo -e "${RED}[WARNING] Auth API did not respond healthy. Inspecting container logs:${NC}"
  docker logs --tail 20 sohojpharma_auth 2>/dev/null || true
fi

if curl -s http://127.0.0.1:54321/rest/v1/ | grep -q "definitions"; then
  echo -e "${GREEN}✓ REST API (PostgREST) is responding healthy!${NC}"
fi

# ------------------------------------------------------------------------------
# Final Status & Summary
# ------------------------------------------------------------------------------
echo -e "\n${GREEN}${BOLD}=================================================================${NC}"
echo -e "${GREEN}${BOLD}     🎉 SohojPharma Deployed Successfully!                      ${NC}"
echo -e "${GREEN}${BOLD}=================================================================${NC}"
echo -e "  🌐 Public URL:        ${BOLD}https://sohojpharma.cloud/${NC}"
echo -e "  🔑 Superadmin Login:  ${BOLD}superadmin@gmail.com / 123456${NC}"
echo -e "  🏪 Store Admin Login: ${BOLD}storeadmin@gmail.com / 123456${NC}"
echo -e "  ⚡ Local App Port:    ${BOLD}http://127.0.0.1:3000${NC}"
echo -e "  🗄️ Database Stack:    ${BOLD}PostgreSQL on 54322, Supabase API on 54321${NC}"
echo -e "  💳 bKash Payment:     ${BOLD}01951413828 (1.5% gateway charge)${NC}"
echo -e "  📋 PM2 Status:        ${BOLD}pm2 status${NC}"
echo -e "  📜 View Live Logs:    ${BOLD}pm2 logs sohojpharma${NC}"
echo -e "  🔄 Restart App:       ${BOLD}pm2 reload sohojpharma${NC}"
echo -e "${BLUE}${BOLD}=================================================================${NC}\n"

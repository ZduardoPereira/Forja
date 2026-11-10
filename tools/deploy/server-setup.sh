#!/usr/bin/env bash
# FORJA — prepara um servidor Ubuntu/Debian (Oracle Cloud "Always Free" ou qualquer VPS) para o app.
# Rodado do PC com:  npm run server:setup     (pode rodar de novo: só ajusta o que faltar)
#
#   1. swap, se a máquina tiver pouca RAM
#   2. firewall: libera as portas 80 e 443 (a imagem Ubuntu da Oracle bloqueia tudo menos o SSH)
#   3. Docker + Compose (repositório oficial), com rotação de logs
#   4. /opt/forja/.env de produção — os segredos são gerados aqui e não saem do servidor
#   5. backup diário às 4h (banco + fotos, guarda 14 dias em /opt/forja/backups)
set -euo pipefail

DOMAIN="${1:?uso: server-setup.sh DOMINIO [CODIGO_DO_GRUPO]}"
INVITE="${2:-}"
BASE=/opt/forja
APP_USER="${SUDO_USER:-$(id -un)}"
export DEBIAN_FRONTEND=noninteractive
APT=(apt-get -y -qq -o DPkg::Lock::Timeout=600)

step() { printf '\n==> %s\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "Rode como root (sudo)." >&2; exit 1; }
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || { echo "Domínio inválido: $DOMAIN" >&2; exit 1; }
[ -z "$INVITE" ] || [[ "$INVITE" =~ ^[A-Za-z0-9._-]{4,64}$ ]] || { echo "Código do grupo inválido (4 a 64 letras, números, . _ -)" >&2; exit 1; }
. /etc/os-release
case "${ID:-}" in
  ubuntu | debian) ;;
  *) echo "Este script é para Ubuntu (recomendado: Canonical Ubuntu 24.04). Encontrado: ${PRETTY_NAME:-?}" >&2; exit 1 ;;
esac

step "Sistema: ${PRETTY_NAME} ($(dpkg --print-architecture)) · usuário do app: ${APP_USER}"
timedatectl set-timezone America/Sao_Paulo 2>/dev/null || true

# ---------- 1. swap ----------
step "Memória"
mem_mb=$(awk '/^MemTotal:/ {print int($2 / 1024)}' /proc/meminfo)
swap=$(swapon --show=SIZE --noheadings | tr -d ' \n')
if [ -z "$swap" ] && [ "$mem_mb" -lt 4096 ]; then
  echo "RAM de ${mem_mb} MB: criando 2 GB de swap"
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
else
  echo "ok: RAM ${mem_mb} MB, swap ${swap:-nenhum}"
fi

# ---------- 2. firewall ----------
step "Firewall (portas 80 e 443)"
if command -v iptables >/dev/null 2>&1; then
  for port in 80 443; do
    rule=(-p tcp -m state --state NEW -m tcp --dport "$port" -j ACCEPT)
    iptables -C INPUT "${rule[@]}" 2>/dev/null || iptables -I INPUT 1 "${rule[@]}"
  done
  # Imagens da Oracle: grava as regras antes do REJECT, para valerem depois de reiniciar.
  RULES=/etc/iptables/rules.v4
  if [ -f "$RULES" ]; then
    for port in 80 443; do
      line="-A INPUT -p tcp -m state --state NEW -m tcp --dport $port -j ACCEPT"
      grep -qxF -- "$line" "$RULES" || sed -i "0,/^-A INPUT -j REJECT/s//${line}\n&/" "$RULES"
    done
    echo "regras gravadas em $RULES"
  fi
fi
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q 'Status: active'; then
  ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null && echo "ufw: 80 e 443 liberadas"
fi
echo "Lembrete: na Oracle, 80 e 443 também precisam estar liberadas na Security List da VCN (painel)."

# ---------- 3. Docker ----------
step "Docker"
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  "${APT[@]}" update
  "${APT[@]}" install ca-certificates curl >/dev/null
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  "${APT[@]}" update
  "${APT[@]}" install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
fi
if [ ! -f /etc/docker/daemon.json ]; then
  mkdir -p /etc/docker
  echo '{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }' > /etc/docker/daemon.json
  systemctl restart docker
fi
systemctl enable --now docker >/dev/null 2>&1
usermod -aG docker "$APP_USER"
echo "$(docker --version) · $(docker compose version)"

# ---------- 4. configuração ----------
step "Configuração ($BASE/.env)"
install -d -m 0755 -o "$APP_USER" -g "$APP_USER" "$BASE" "$BASE/backups"
if [ ! -f "$BASE/.env" ]; then
  [ -n "$INVITE" ] || INVITE="forja-$(openssl rand -hex 3)"
  (
    umask 077
    cat > "$BASE/.env" <<EOF
# FORJA — configuração de produção (gerada por server-setup.sh em $(date '+%F %T')).
# SECRET e POSTGRES_PASSWORD foram gerados aqui: não copie este arquivo para fora do servidor.
DOMAIN=$DOMAIN
SECRET=$(openssl rand -hex 32)
INVITE_CODE=$INVITE
POSTGRES_PASSWORD=$(openssl rand -hex 24)
TIMEZONE=America/Sao_Paulo
LOG_LEVEL=info
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_WEBHOOK_VERIFY_TOKEN=
EOF
  )
  chown "$APP_USER:$APP_USER" "$BASE/.env"
  echo "criado, com segredos novos"
else
  sed -i "s|^DOMAIN=.*|DOMAIN=$DOMAIN|" "$BASE/.env"
  [ -z "$INVITE" ] || sed -i "s|^INVITE_CODE=.*|INVITE_CODE=$INVITE|" "$BASE/.env"
  echo "já existia: mantido (domínio${INVITE:+ e código do grupo} atualizado)"
fi

# ---------- 5. backup diário ----------
step "Backup diário (4h)"
command -v cron >/dev/null 2>&1 || "${APT[@]}" install cron >/dev/null
cat > /etc/cron.d/forja-backup <<EOF
# FORJA: backup do banco e das fotos todo dia às 4h; guarda 14 dias em $BASE/backups.
SHELL=/bin/bash
0 4 * * * $APP_USER [ -x $BASE/app/backup.sh ] && $BASE/app/backup.sh >> $BASE/backups/backup.log 2>&1
EOF
chmod 0644 /etc/cron.d/forja-backup
systemctl restart cron >/dev/null 2>&1 || true
echo "ok: $BASE/backups"

step "Servidor pronto"
echo "Domínio:         $(grep '^DOMAIN=' "$BASE/.env" | cut -d= -f2-)"
echo "Código do grupo: $(grep '^INVITE_CODE=' "$BASE/.env" | cut -d= -f2-)"
echo "Próximo passo, no PC: npm run deploy"

# Deploy em VPS (Ubuntu, amd64 ou arm64)

Requisitos: VPS com Ubuntu 22.04/24.04, pelo menos 1 vCPU e 2 GB de RAM (o build do Next usa mais memória que a execução), Docker e um domínio apontando para o IP da VPS. Não precisa de GPU nem de serviço pago.

## 1. Preparar o servidor

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

Em VPS com pouca RAM, crie swap antes do build:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 2. Código e configuração

```bash
git clone <seu-repositório> abyss-arena && cd abyss-arena
cp .env.example .env
nano .env
```

Ajuste no `.env`:

| Variável | Valor |
|---|---|
| `POSTGRES_PASSWORD` | senha forte (se tiver caracteres especiais, eles precisam ser válidos em URL) |
| `APP_URL` | `https://seu-dominio` |
| `DOMAIN` | `seu-dominio` |
| `SESSION_COOKIE_SECURE` | `true` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | credenciais do administrador (nunca ficam no código) |
| `SEED_DEMO_DATA` | `false` em produção |
| `SMTP_*` | opcional: habilita a recuperação de senha |

## 3. Subir com HTTPS automático

```bash
docker compose --profile proxy up -d --build
docker compose exec app npm run db:seed
```

- As migrations rodam automaticamente sempre que o container `app` sobe.
- O Caddy emite e renova o certificado Let's Encrypt e repassa os WebSockets do Socket.IO.
- O app só fica exposto em `127.0.0.1:3000` (`APP_BIND`); o acesso externo passa pelo Caddy.

Verificação:

```bash
docker compose ps
curl -fsS https://seu-dominio/api/health?deep=1     # {"ok":true,"database":"up"}
docker compose logs -f app
```

### Usando Nginx em vez do Caddy

Suba sem o perfil `proxy` e configure o Nginx com suporte a WebSocket:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## 4. Operação

| Tarefa | Comando |
|---|---|
| Atualizar a aplicação | `git pull && docker compose --profile proxy up -d --build` |
| Sincronizar personagens agora | `docker compose exec app npm run catalog:sync` (também no painel admin) |
| Sincronizar o Abismo agora | `docker compose exec app npm run abyss:sync` (também em Admin → Ciclos do Abismo) |
| Rodar uma análise de balanceamento | `docker compose exec app npm run balance:run -- --proposals` |
| Redefinir a senha do admin | `ADMIN_RESET_PASSWORD=true` no `.env`, `docker compose up -d`, depois `docker compose exec app npm run db:seed` |
| Logs | `docker compose logs -f app` |

Os jobs (métricas diárias, propostas semanais, publicação agendada e sincronização do catálogo) rodam dentro do container `app`. Mantenha **uma única instância** do app; para escalar, veja "Pontos de extensão" em [ARQUITETURA.md](ARQUITETURA.md).

## 5. Backup e restauração

```bash
# backup diário (adicione ao crontab)
docker compose exec -T db pg_dump -U abyss -Fc abyss_arena > backup-$(date +%F).dump

# restauração
docker compose exec -T db pg_restore -U abyss -d abyss_arena --clean --if-exists < backup-AAAA-MM-DD.dump
```

## 6. Novo ciclo do Abismo

O ciclo muda todo mês e é sincronizado sozinho da wiki do Fandom, entrando em vigor na virada. Confira em **Admin → Ciclos do Abismo** quais metades valem. Se a wiki atrasar ou mudar de formato, cadastre o ciclo à mão (ele é vinculado à wiki quando a página aparecer). Para jogadores de outro servidor, ajuste `ABYSS_SERVER_UTC_OFFSET`. Depois da mudança, use **Revisão extraordinária** no painel de preços, se fizer sentido.

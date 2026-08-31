#!/bin/bash

# =============================================================================
# Script para Iniciar o Sistema de Pedidos com Agenda Integrada via WhatsApp
# =============================================================================

clear

echo "============================================================================"
echo "  🚀 SISTEMA DE PEDIDOS COM AGENDA INTEGRADA VIA WHATSAPP"
echo "============================================================================"
echo ""

# Diretório raiz do projeto
PROJECT_DIR="/home/pessoal/AgendaAi"

# Verificar se estamos no diretório correto
if [ "$(pwd)" != "$PROJECT_DIR" ]; then
    echo "⚠️  Alterando para o diretório do projeto: $PROJECT_DIR"
    cd "$PROJECT_DIR" || exit 1
fi

echo "📁 Diretório: $(pwd)"
echo ""

# =============================================================================
# FUNÇÕES
# =============================================================================

function check_command() {
    if ! command -v "$1" &> /dev/null; then
        echo "❌ Comando '$1' não encontrado. Instale-o antes de continuar."
        exit 1
    fi
}

function install_php_deps() {
    echo "=========================================="
    echo "  🔧 INSTALANDO DEPENDÊNCIAS DO LARAVEL"
    echo "=========================================="
    
    check_command composer
    check_command php
    
    echo "✅ Executando composer install..."
    composer install --no-interaction --prefer-dist --optimize-autoloader 2>&1 | tail -20
    
    echo ""
    echo "✅ Gerando chave da aplicação..."
    php artisan key:generate
    
    echo ""
}

function install_node_deps() {
    echo "=========================================="
    echo "  🔧 INSTALANDO DEPENDÊNCIAS DO BOT WHATSAPP"
    echo "=========================================="
    
    check_command npm
    check_command node
    
    cd whatsapp-bot || exit 1
    
    echo "✅ Executando npm install..."
    npm install 2>&1 | tail -20
    
    cd ..
    echo ""
}

function setup_env() {
    echo "=========================================="
    echo "  ⚙️  CONFIGURANDO AMBIENTE"
    echo "=========================================="
    
    # Verificar se .env existe
    if [ ! -f ".env" ]; then
        echo "✅ Copiando .env.example para .env..."
        cp .env.example .env
    else
        echo "✅ Arquivo .env já existe"
    fi
    
    # Verificar se APP_KEY está configurado
    if grep -q "^APP_KEY=" .env; then
        echo "✅ Gerando APP_KEY..."
        php artisan key:generate
    fi
    
    echo ""
}

function run_migrations() {
    echo "=========================================="
    echo "  🗃️  EXECUTANDO MIGRATIONS"
    echo "=========================================="
    
    echo "✅ Executando migrations..."
    php artisan migrate --force 2>&1 | tail -20
    
    echo ""
}

function start_services() {
    echo "=========================================="
    echo "  ▶️  INICIANDO SERVIÇOS"
    echo "=========================================="
    echo ""
    
    echo "📋 Para iniciar todos os serviços, execute em terminais separados:"
    echo ""
    echo "  Terminal 1 - Servidor Laravel:"
    echo "    php artisan serve"
    echo ""
    echo "  Terminal 2 - Queue Worker:"
    echo "    php artisan queue:work"
    echo ""
    echo "  Terminal 3 - Bot WhatsApp:"
    echo "    cd whatsapp-bot && npm start"
    echo ""
    
    # Perguntar se quer iniciar agora
    read -p "Deseja iniciar os serviços agora? (s/n): " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Ss]$ ]]; then
        echo "✅ Iniciando serviços..."
        echo ""
        
        # Iniciar Laravel server em background
        echo "🌐 Iniciando servidor Laravel na porta 8000..."
        php artisan serve > /tmp/laravel-server.log 2>&1 &
        LARAVEL_PID=$!
        sleep 3
        
        # Verificar se o servidor está rodando
        if curl -s http://localhost:8000/health > /dev/null; then
            echo "✅ Servidor Laravel rodando em http://localhost:8000"
        else
            echo "❌ Falha ao iniciar servidor Laravel. Verifique /tmp/laravel-server.log"
            kill $LARAVEL_PID 2>/dev/null
            return 1
        fi
        
        # Iniciar Queue Worker em background
        echo "⚙️  Iniciando Queue Worker..."
        php artisan queue:work > /tmp/queue-worker.log 2>&1 &
        QUEUE_PID=$!
        sleep 2
        echo "✅ Queue Worker rodando"
        
        # Iniciar Bot WhatsApp em background
        echo "🤖 Iniciando Bot WhatsApp..."
        cd whatsapp-bot
        npm start > /tmp/whatsapp-bot.log 2>&1 &
        BOT_PID=$!
        sleep 2
        cd ..
        echo "✅ Bot WhatsApp rodando"
        
        echo ""
        echo "=========================================="
        echo "  ✅ TODOS OS SERVIÇOS INICIADOS!"
        echo "=========================================="
        echo ""
        echo "  🌐 Laravel: http://localhost:8000"
        echo "  🤖 Bot WhatsApp: Aguardando mensagens..."
        echo ""
        echo "  Para parar os serviços, execute:"
        echo "    kill $LARAVEL_PID $QUEUE_PID $BOT_PID"
        echo ""
        echo "  Para ver logs:"
        echo "    tail -f /tmp/laravel-server.log"
        echo "    tail -f /tmp/queue-worker.log"
        echo "    tail -f /tmp/whatsapp-bot.log"
        echo ""
        
        # Mostrar status
        echo "  Aguardando 5 segundos para verificar status..."
        sleep 5
        
        echo ""
        echo "  Verificando status dos serviços:"
        
        if ps -p $LARAVEL_PID > /dev/null; then
            echo "    ✅ Laravel Server: rodando (PID: $LARAVEL_PID)"
        else
            echo "    ❌ Laravel Server: parado"
        fi
        
        if ps -p $QUEUE_PID > /dev/null; then
            echo "    ✅ Queue Worker: rodando (PID: $QUEUE_PID)"
        else
            echo "    ❌ Queue Worker: parado"
        fi
        
        if ps -p $BOT_PID > /dev/null; then
            echo "    ✅ WhatsApp Bot: rodando (PID: $BOT_PID)"
        else
            echo "    ❌ WhatsApp Bot: parado"
        fi
        
        echo ""
        
        # Limpar PIDs ao saiu (Ctrl+C)
        trap "kill $LARAVEL_PID $QUEUE_PID $BOT_PID 2>/dev/null; echo 'Serviços parados'; exit" EXIT
        
        # Manter o script rodando
        while true; do
            sleep 1
        done
        
    else
        echo "ℹ️  Para iniciar manualmente, execute os comandos em terminais separados."
    fi
}

function show_help() {
    echo "=========================================="
    echo "  📖 COMO USAR O SISTEMA"
    echo "=========================================="
    echo ""
    echo "1. INSTALAÇÃO"
    echo "   - composer install"
    echo "   - cd whatsapp-bot && npm install"
    echo ""
    echo "2. CONFIGURAÇÃO"
    echo "   - cp .env.example .env"
    echo "   - php artisan key:generate"
    echo "   - php artisan migrate"
    echo ""
    echo "3. INICIAR SERVIÇOS"
    echo "   Terminal 1: php artisan serve"
    echo "   Terminal 2: php artisan queue:work"
    echo "   Terminal 3: cd whatsapp-bot && npm start"
    echo ""
    echo "4. TESTAR"
    echo "   - Enviar mensagem para o número do bot:"
    echo "   - Formato: 'Bolo de Chocolate, 1, G, 25/08/2026, 14:00 🎂✅'"
    echo ""
    echo "5. VERIFICAR"
    echo "   - Banco: php artisan tinker --execute=\"\\App\\Models\\Pedido::all();\""
    echo "   - Logs: tail -f storage/logs/laravel.log"
    echo ""
}

function check_php_version() {
    echo "=========================================="
    echo "  ℹ️  VERIFICANDO REQUISITOS"
    echo "=========================================="
    
    local PHP_VERSION=$(php -r 'echo PHP_VERSION;' 2>/dev/null)
    local COMPOSER_VERSION=$(composer --version 2>/dev/null | head -1)
    local NODE_VERSION=$(node --version 2>/dev/null)
    local NPM_VERSION=$(npm --version 2>/dev/null)
    
    echo "PHP: ${PHP_VERSION:-❌ Não encontrado}"
    echo "Composer: ${COMPOSER_VERSION:-❌ Não encontrado}"
    echo "Node.js: ${NODE_VERSION:-❌ Não encontrado}"
    echo "npm: ${NPM_VERSION:-❌ Não encontrado}"
    echo ""
    
    # Verificar versões mínimas
    if [[ -z "$PHP_VERSION" ]]; then
        echo "❌ PHP não encontrado. Instale PHP 8.3+"
        exit 1
    fi
    
    if [[ -z "$COMPOSER_VERSION" ]]; then
        echo "❌ Composer não encontrado. Instale Composer"
        exit 1
    fi
    
    if [[ -z "$NODE_VERSION" ]]; then
        echo "❌ Node.js não encontrado. Instale Node.js 18+"
        exit 1
    fi
    
    echo "✅ Todos os requisitos verificados"
    echo ""
}

# =============================================================================
# MENU PRINCIPAL
# =============================================================================

check_php_version

echo "Escolha uma opção:"
echo ""
echo "  1) 📦 Instalar dependências (Laravel + Bot)"
echo "  2) ⚙️  Configurar ambiente (.env, migrations)"
echo "  3) ▶️  Iniciar serviços automaticamente"
echo "  4) 📖 Ajuda (como usar)"
echo "  5) ❌ Sair"
echo ""

read -p "Opção: " option

echo ""

case $option in
    1)
        install_php_deps
        install_node_deps
        ;;
    2)
        setup_env
        run_migrations
        ;;
    3)
        setup_env
        run_migrations
        start_services
        ;;
    4)
        show_help
        ;;
    5)
        echo "👋 Saindo..."
        exit 0
        ;;
    *)
        echo "❌ Opção inválida"
        exit 1
        ;;
esac

echo ""
echo "============================================================================"
echo "  ✅ PRONTO! O sistema está configurado."
echo "============================================================================"
echo ""
echo "Para iniciar o sistema, execute:"
echo "  ./INICIAR_SISTEMA.sh"
echo ""
echo "Ou manualmente:"
echo "  php artisan serve"
echo "  php artisan queue:work"
echo "  cd whatsapp-bot && npm start"
echo ""

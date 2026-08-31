# 🚀 Como Executar o Sistema de Pedidos com Agenda Integrada

Siga os passos abaixo para colocara o sistema em funcionamento.

---

## 📋 Passo a Passo

### Passo 1: Instalar Dependências

#### Laravel (Backend)
```bash
cd /home/pessoal/AgendaAi
composer install
```

> ⚠️ Se der erro de PHP/GLIBCXX, veja a solução no final deste documento.

#### Bot WhatsApp (Node.js)
```bash
cd /home/pessoal/AgendaAi/whatsapp-bot
npm install
cd ..
```

---

### Passo 2: Configurar Ambiente

#### Copiar .env
```bash
cp .env.example .env
php artisan key:generate
```

#### Instalar pacote CORS (importante para o bot se comunicar com Laravel)
```bash
composer require fruitcake/laravel-cors
```

---

### Passo 3: Executar Migrations

```bash
php artisan migrate
```

---

### Passo 4: Iniciar Serviços

Abra **3 terminais separados** e execute:

#### Terminal 1 - Servidor Laravel
```bash
php artisan serve
```
> O servidor estará disponível em `http://localhost:8000`

#### Terminal 2 - Queue Worker (Processamento de pedidos)
```bash
php artisan queue:work
```
> Processa pedidos em segundo plano

#### Terminal 3 - Bot WhatsApp
```bash
cd whatsapp-bot
npm start
```
> O bot acertará o QR Code no terminal. Escaneie com o WhatsApp no celular.

---

## ✅ Verificar se está funcionando

### Testar o endpoint Laravel
```bash
curl -X POST http://localhost:8000/api/whatsapp/baileys \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "5511999999999",
    "message": "Bolo de Chocolate, 1, G, 25/08/2026, 14:00 🎂✅",
    "cliente": "Maria",
    "produto": "Bolo de Chocolate",
    "quantidade": 1,
    "tamanho": "G",
    "data_entrega": "25/08/2026",
    "hora_entrega": "14:00",
    "observacoes": "Sem glúten"
  }'
```

**Resposta esperada:**
```json
{
  "status": "Processando pedido..."
}
```

### Testar com o Bot WhatsApp
1. Enviar uma mensagem para o número conectado ao bot
2. Usar o formato: `Bolo de Chocolate, 1, G, 25/08/2026, 14:00 🎂✅`
3. O bot deve responder com a confirmação

---

## 🔍 Verificar Resultados

### Verificar pedidos no banco
```bash
php artisan tinker
>>> \App\Models\Pedido::with('cliente', 'itens', 'agenda')->get();
```

### Verificar logs
```bash
# Logs do Laravel
tail -f storage/logs/laravel.log

# Logs do WhatsApp
tail -f storage/logs/whatsapp.log

# Logs do bot
tail -f /tmp/whatsapp-bot.log  # Se executou com o script
```

---

## 🛠 Solução de Problemas

### 1. Erro: "PHP GLIBCXX_3.4.30 not found"

**Causa:** O PHP está compilado com uma versão mais recente do GLIBCXX do que está disponível no sistema.

#### Solução para Ubuntu/Debian:
```bash
# Verificar qual versão está disponível
strings /usr/lib/x86_64-linux-gnu/libstdc++.so.6 | grep GLIBCXX

# Instalar a versão necessária
sudo apt-get update
sudo apt-get install libstdc++6

# Ou usar docker (recomendado para produção)
```

#### Solução alternativa (desenvolvimento):
```bash
# Usar PHP integrado do Laravel Sail (Docker)
./vendor/bin/sail up -d
./vendor/bin/sail artisan serve
```

### 2. Erro: "Connection refused" ao testar endpoint

**Verifique se:**
- O servidor Laravel está rodando (`php artisan serve`)
- A porta 8000 não está bloqueada
- O CORS está configurado

**Teste o health check:**
```bash
curl http://localhost:8000/health
```
> Deve retornar: `{"status":"OK","timestamp":...}`

### 3. Bot não recebe mensagens

**Verifique se:**
- O QR Code foi escaneado corretamente
- O número está conectado no WhatsApp
- O bot está rodando (`npm start` no whatsapp-bot)
- O endereço do Laravel está correto em `whatsapp-bot/index.js`

### 4. Pedido não é processado

**Verifique se:**
- O Queue Worker está rodando (`php artisan queue:work`)
- Não há erros nos logs (`storage/logs/laravel.log`)
- A tabela `jobs` está sendo preenchida

---

## 📚 Comando Úteis

| Comando | Descrição |
|---------|-----------|
| `php artisan serve` | Inicia servidor Laravel |
| `php artisan queue:work` | Inicia queue worker |
| `php artisan migrate` | Executa migrations |
| `php artisan tinker` | Acessa shell interativo |
| `composer install` | Instala dependências PHP |
| `npm install` | Instala dependências Node.js |
| `npm start` | Inicia bot WhatsApp |
| `tail -f storage/logs/laravel.log` | Ver logs Laravel |

---

## 🎯 Teste Rápido

Para testar sem configurar tudo:

1. **Inicie o Laravel:**
   ```bash
   php artisan serve
   ```

2. **Teste o endpoint manualmente:**
   ```bash
   curl -X POST http://localhost:8000/api/whatsapp/webhook/test \
     -H "Content-Type: application/json" \
     -d '{"telefone": "5511999999999", "mensagem": "Bolo de Chocolate, 1, G, 25/08/2026, 14:00 🎂✅"}'
   ```

3. **Verifique no tinker:**
   ```bash
   php artisan tinker
   >>> \App\Models\Pedido::all();
   ```

> Se o pedido aparecer, o backend está funcionando!<br>
> Agora é só configurar o bot WhatsApp.

---

## 📖 Documentação Completa

- [SISTEMA_PEDIDOS_AGENDA.md](SISTEMA_PEDIDOS_AGENDA.md) - Documentação técnica do sistema
- [whatsapp-bot/README.md](whatsapp-bot/README.md) - Documentação do bot WhatsApp

---

## 🔧 Estrutura Final do Projeto

```
AgendaAi/
├── app/
│   ├── Http/Controllers/WhatsAppWebhookController.php  # ✅ Pronto
│   ├── Jobs/ProcessarMensagemWhatsApp.php              # ✅ Pronto
│   ├── Models/                                        # ✅ Pronto
│   │   ├── Agenda.php
│   │   ├── Cliente.php
│   │   ├── ItemPedido.php
│   │   ├── Pedido.php
│   │   └── Produto.php
│   ├── Providers/WhatsAppServiceProvider.php          # ✅ Pronto
│   └── Services/WhatsAppParserService.php            # ✅ Pronto (com suporte Baileys)
├── bootstrap/app.php                                  # ✅ Pronto (com CORS)
├── config/
│   ├── cors.php                                       # ✅ NOVO
│   └── whatsapp.php                                  # ✅ Pronto
├── database/migrations/                               # ✅ Pronto
├── routes/
│   └── api.php                                       # ✅ Pronto (com rota /baileys)
├── whatsapp-bot/                                      # ✅ Pronto
│   ├── index.js                                      # ✅ Pronto (enviando para /baileys)
│   ├── package.json
│   ├── README.md
│   ├── .env.example
│   └── .gitignore
├── .env                                             # ⚠️ Configure
├── INICIAR_SISTEMA.sh                               # ✅ NOVO (script de inicialização)
└── COMO_EXECUTAR.md                                # ✅ Este arquivo
```

---

## ✨ Resumo do que foi corrigido

| Problema | Solução |
|---------|---------|
| Formato de dados incompatível | Adicionado `handleBaileysWebhook` no Controller |
| Rota para Baileys ausente | Adicionada rota `/api/whatsapp/baileys` |
| Parser não lia formato Baileys | Atualizado `WhatsAppParserService` |
| CORS não configurado | Adicionado config/cors.php e middleware |
| Bot enviava para rota errada | Atualizado endpoint no bot |

---

## 🎊 Pronto!

Agora o sistema está **100% configurado** para funcionar. Basta:

1. ✅ Instalar dependências
2. ✅ Configurar .env
3. ✅ Executar migrations
4. ✅ Iniciar os 3 serviços em terminais separados
5. ✅ Escanear QR Code do bot
6. ✅ Testar enviando uma mensagem

**Boa sorte!** 🚀

# Sistema de Pedidos com Agenda Integrada via WhatsApp

Sistema web em Laravel para gerenciar pedidos de um pequeno negócio (ex: confeitaria) com integração ao WhatsApp e agenda automática.

## Estrutura do Projeto

```
AgendaAi/
├── app/
│   ├── Http/
│   │   └── Controllers/
│   │       └── WhatsAppWebhookController.php    # Controller do webhook
│   ├── Jobs/
│   │   └── ProcessarMensagemWhatsApp.php         # Job para processamento assíncrono
│   ├── Models/
│   │   ├── Agenda.php                           # Modelo de agenda/eventos
│   │   ├── Cliente.php                          # Modelo de clientes
│   │   ├── ItemPedido.php                        # Modelo de itens do pedido (pivot)
│   │   ├── Pedido.php                           # Modelo de pedidos
│   │   └── Produto.php                          # Modelo de produtos
│   ├── Providers/
│   │   └── WhatsAppServiceProvider.php          # Provider de serviços
│   └── Services/
│       └── WhatsAppParserService.php            # Service de parsing (regex/LLM)
├── config/
│   └── whatsapp.php                              # Configurações do WhatsApp
├── database/
│   └── migrations/
│       ├── 2026_08_25_120812_create_client.php   # Migration de clientes
│       ├── 2026_08_25_120953_create_produtos.php # Migration de produtos
│       ├── 2026_08_25_121913_create_pedidos.php  # Migration de pedidos
│       ├── 2026_08_25_130102_create_itens_pedidos.php # Migration de itens
│       └── 2026_08_25_130222_create_agenda.php   # Migration de agenda
├── routes/
│   ├── api.php                                  # Rotas API (webhook)
│   └── web.php                                  # Rotas web
└── .env.example                                 # Exemplo de configurações
```

## Entidades e Relacionamentos

### Diagramas ER

```
+----------------+       +----------------+       +------------------+
|    clientes     |       |    pedidos     |       |    produtos     |
+----------------+       +----------------+       +------------------+
| id (PK)        |       | id (PK)        |       | id (PK)         |
| nome           |       | cliente_id (FK)|------>| nome            |
| telefone       |<------| valor_total    |       | tipo            |
| observacoes   |       | status         |       | massa           |
+----------------+       | data_entrega   |       | recheio         |
                     | hora_entrega   |       | cobertura       |
                     | observacoes   |       | tamanho         |
                     | gatilho_whatsapp|      | preco_base      |
                     +----------------+       | ativo           |
                            |                | descricao       |
                            v                +------------------+
                     +------------------+           ^
                     | itens_pedido     |           |
                     +------------------+           |
                     | id (PK)          |           |
                     | pedido_id (FK)   |-----------+
                     | produto_id (FK)  |-------
                     | quantidade       |
                     | preco_unitario   |
                     | tamanho          |
                     | tema_decoracao   |
                     | personalizacoes  |
                     +------------------+
                            |
                            v
                     +------------------+
                     |     agenda       |
                     +------------------+
                     | id (PK)          |
                     | pedido_id (FK)   |
                     | inicio           |
                     | fim              |
                     | titulo           |
                     | tipo             |
                     | descricao        |
                     +------------------+
```

### Relacionamentos Eloquent

- **Cliente** `hasMany` Pedido
- **Pedido** `belongsTo` Cliente
- **Pedido** `belongsToMany` Produto (via `itens_pedido`)
- **Pedido** `hasOne` Agenda
- **Produto** `belongsToMany` Pedido (via `itens_pedido`)
- **Agenda** `belongsTo` Pedido

## Configuração do Banco de Dados

### Migrations

As migrations já estão criadas:

1. **clientes**: Armazena dados dos clientes
2. **produtos**: Catálogo de produtos
3. **pedidos**: Registros de pedidos
4. **itens_pedido**: Itens de cada pedido (tabela pivot)
5. **agenda**: Eventos vinculados a pedidos confirmados

### Executar Migrations

```bash
php artisan migrate
```

## Configuração do WhatsApp

### 1. Variáveis de Ambiente

Adicione ao `.env`:

```env
# WhatsApp Configuration
WHATSAPP_VERIFY_TOKEN=seu_token_de_verificacao
WHATSAPP_ACCESS_TOKEN=seu_access_token_da_meta
WHATSAPP_BUSINESS_PHONE_ID=seu_phone_id_da_meta
WHATSAPP_ATENDENTE_PHONE=5511999999999
WHATSAPP_TRIGGERS=🎂✅,/confirmar,/pedido
WHATSAPP_PARSER=regex

# LLM Configuration (opcional)
WHATSAPP_LLM_DRIVER=claude
WHATSAPP_LLM_API_KEY=sua_api_key
WHATSAPP_LLM_MODEL=claude-haiku
```

### 2. Configurar Webhook na Meta

1. Acesse [Meta Developer Portal](https://developers.facebook.com/)
2. Crie um app com WhatsApp Cloud API
3. Configure webhook URL: `https://seudominio.com/api/whatsapp/webhook`
4. Use o mesmo `WHATSAPP_VERIFY_TOKEN` para verificação

## Rotas da API

```php
// Rotas em routes/api.php

// Webhook principal
POST /api/whatsapp/webhook          - Recebe mensagens da Meta Cloud API

// Teste manual
POST /api/whatsapp/webhook/test     - Simula recepção de mensagem
GET  /api/whatsapp/webhook/test     - Formulário de teste

// Health check
GET  /api/health                    - Verifica se API está ativa
```

## Fluxo de Processamento

```
┌─────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│   WhatsApp       │────▶│   Webhook           │────▶│   Queue Worker      │
│   (Meta API)     │     │   Controller        │     │   (Assíncrono)       │
└─────────────────┘     └─────────────────────┘     └────────┬────────┘
                                                           │
                                                           ▼
┌─────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│   Parser        │◀────│   Job:              │◀────┤   Database           │
│   (Regex/LLM)    │     │   ProcessarMensagem │     │   (Transações)       │
└─────────────────┘     └─────────────────────┘     └─────────────────────┘
       │
       ▼
┌─────────────────┐
│   Dados         │
│   Extraídos:     │
│   - cliente      │
│   - itens        │
│   - data/hora    │
│   - observações  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│   Criar/        │────▶│   Criar Pedido      │────▶│   Criar Evento      │
│   Atualizar     │     │   (com itens)       │     │   na Agenda          │
│   Cliente       │     └─────────────────────┘     └─────────────────────┘
└─────────────────┘                   │
                                      ▼
                             ┌─────────────────────┐
                             │   Enviar             │
                             │   Confirmação        │
                             │   (para atendente)    │
                             └─────────────────────┘
```

## Parser de Mensagens

### Opção 1: Regex (Padrão - Gratuito)

Reconhece formatos estruturados:

**Formatos aceitos:**
```
# Formato 1 (estruturado)
/confirmar Cliente: Maria, Produto: bolo de chocolate, Tamanho: P, Entrega: 20/08 14h, Obs: recheio morango

# Formato 2 (natural)
Maria quer 1 bolo de chocolate P para 20/08 às 14h com recheio de morango 🎂✅

# Formato 3 (simples)
🎂✅ Maria, bolo de chocolate P, entrega 20/08 às 14h
```

**Gatilhos padrão:**
- `🎂✅` (emoji de bolo + check)
- `/confirmar`
- `/pedido`

### Opção 2: LLM (Claude/OpenAI)

Para mensagens em linguagem natural complexa:

```php
// Ative no .env
WHATSAPP_PARSER=llm
WHATSAPP_LLM_DRIVER=claude
WHATSAPP_LLM_API_KEY=sua_api_key
```

**Prompt usado:**
```
Você é um assistente especializado em extrair informações de pedidos 
de uma confeitaria a partir de mensagens do WhatsApp.

Extraia os seguintes campos e retorne NO FORMATO JSON:
{
    "gatilho": "o gatilho usado",
    "cliente_nome": "nome do cliente",
    "itens": [{"produto": "...", "quantidade": 1, "tamanho": "P"}],
    "data_entrega": "YYYY-mm-dd",
    "hora_entrega": "HH:MM",
    "observacoes": "..."
}
```

## Processamento Assíncrono (Queue)

### Benefícios
- Resposta rápida ao WhatsApp (evita timeout)
- Processamento em segundo plano
- Retry automático em caso de falha
- Escalabilidade

### Configurar Worker

```bash
# Desenvolvimento
php artisan queue:work

# Produção (supervisor)
php artisan queue:work --queue=whatsapp --daemon --sleep=3 --tries=3
```

### Configuração no .env
```env
QUEUE_CONNECTION=database
WHATSAPP_QUEUE_CONNECTION=database
WHATSAPP_QUEUE_NAME=whatsapp
```

## Modelos e Relacionamentos

### Cliente
```php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Cliente extends Model
{
    protected $table = 'clientes';
    protected $fillable = ['nome', 'telefone', 'observacoes'];
    
    public function pedidos(): HasMany
    {
        return $this->hasMany(Pedido::class, 'cliente_id');
    }
}
```

### Pedido
```php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Pedido extends Model
{
    protected $table = 'pedidos';
    protected $fillable = [
        'cliente_id', 'valor_total', 'status', 'data_entrega', 
        'hora_entrega', 'observacoes', 'gatilho_whatsapp', 'mensagem_original'
    ];
    
    public function cliente(): BelongsTo
    {
        return $this->belongsTo(Cliente::class, 'cliente_id');
    }
    
    public function itens(): BelongsToMany
    {
        return $this->belongsToMany(Produto::class, 'itens_pedido', 'pedido_id', 'produto_id')
            ->withPivot('quantidade', 'preco_unitario', 'tamanho', 'tema_decoracao', 'personalizacoes')
            ->withTimestamps();
    }
    
    public function agenda(): HasOne
    {
        return $this->hasOne(Agenda::class, 'pedido_id');
    }
}
```

### Produto
```php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Produto extends Model
{
    protected $table = 'produtos';
    protected $fillable = [
        'nome', 'tipo', 'massa', 'recheio', 'cobertura', 
        'tamanho', 'preco_base', 'ativo', 'descricao'
    ];
    
    public function pedidos(): BelongsToMany
    {
        return $this->belongsToMany(Pedido::class, 'itens_pedido', 'produto_id', 'pedido_id')
            ->withPivot('quantidade', 'preco_unitario', 'tamanho', 'tema_decoracao', 'personalizacoes')
            ->withTimestamps();
    }
}
```

### Agenda
```php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Agenda extends Model
{
    protected $table = 'agenda';
    protected $fillable = ['pedido_id', 'inicio', 'fim', 'titulo', 'tipo', 'descricao'];
    
    public function pedido(): BelongsTo
    {
        return $this->belongsTo(Pedido::class, 'pedido_id');
    }
}
```

## Testando o Sistema

### 1. Teste com cURL

```bash
# Enviar mensagem de teste
curl -X POST http://localhost:8000/api/whatsapp/webhook/test \
  -H "Content-Type: application/json" \
  -d '{
    "telefone": "5511987654321",
    "mensagem": "🎂✅ Maria Silva, bolo de chocolate P, entrega 25/12 às 15h, recheio morango"
  }'
```

**Resposta esperada:**
```json
{
  "status": "Mensagem de teste em fila",
  "data": {
    "messages": [{
      "from": "5511987654321",
      "body": "🎂✅ Maria Silva, bolo de chocolate P, entrega 25/12 às 15h, recheio morango",
      "timestamp": 1234567890
    }]
  }
}
```

### 2. Verificar Processamento

```bash
# Executar queue worker para processar a mensagem
php artisan queue:work --verbose

# Verificar pedidos criados
php artisan tinker
>>> \App\Models\Pedido::with('cliente', 'itens', 'agenda')->get();
```

### 3. Verificar Logs

```bash
# Logs do WhatsApp
tail -f storage/logs/whatsapp.log

# Logs gerais
tail -f storage/logs/laravel.log
```

## Integração com Frontend

### Sugestão: Filament PHP

Para um painel administrativo completo:

```bash
composer require filament/filament
php artisan filament:install --panels
```

### Exemplo de Resource para Pedidos

```php
namespace App\Filament\Resources;

use App\Models\Pedido;
use Filament\Forms;
use Filament\Forms\Form;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;

class PedidoResource extends Resource
{
    protected static ?string $model = Pedido::class;
    
    public static function form(Form $form): Form
    {
        return $form
            ->schema([
                Forms\Components\Select::make('cliente_id')
                    ->relationship('cliente', 'nome')
                    ->required(),
                Forms\Components\Select::make('status')
                    ->options([
                        'orcamento' => 'Orçamento',
                        'confirmado' => 'Confirmado',
                        'em_producao' => 'Em Produção',
                        'entregue' => 'Entregue',
                        'cancelado' => 'Cancelado',
                    ])
                    ->required(),
                Forms\Components\DatePicker::make('data_entrega'),
                Forms\Components\TimePicker::make('hora_entrega'),
                Forms\Components\Textarea::make('observacoes'),
            ]);
    }
    
    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                Tables\Columns\TextColumn::make('id'),
                Tables\Columns\TextColumn::make('cliente.nome'),
                Tables\Columns\TextColumn::make('valor_total')
                    ->money('BRL'),
                Tables\Columns\TextColumn::make('status'),
                Tables\Columns\TextColumn::make('data_entrega')
                    ->date(),
            ])
            ->filters([
                // Filtros...
            ])
            ->actions([
                Tables\Actions\ViewAction::make(),
                Tables\Actions\EditAction::make(),
            ]);
    }
}
```

### Visualização da Agenda com FullCalendar

```html
<!-- resources/views/agenda/index.blade.php -->
<div id="calendar"></div>

<script src="https://cdn.jsdelivr.net/npm/fullcalendar@5.11.3/main.min.js"></script>
<script>
var calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
    initialView: 'dayGridMonth',
    locale: 'pt-br',
    events: @json($events),
    eventDidMount: function(info) {
        var status = info.event.extendedProps.status;
        if (status === 'entregue') {
            info.el.style.backgroundColor = '#28a745';
        } else if (status === 'cancelado') {
            info.el.style.backgroundColor = '#dc3545';
        } else if (status === 'confirmado') {
            info.el.style.backgroundColor = '#007bff';
        }
    },
    eventClick: function(info) {
        window.location.href = '/pedidos/' + info.event.extendedProps.pedido_id;
    }
});
calendar.render();
</script>
```

```php
// Controller para Events
public function events()
{
    $events = Agenda::with('pedido.cliente')
        ->get()
        ->map(function ($event) {
            return [
                'id' => $event->id,
                'title' => $event->titulo,
                'start' => $event->inicio->toIso8601String(),
                'end' => $event->fim?->toIso8601String(),
                'extendedProps' => [
                    'cliente' => $event->pedido->cliente->nome,
                    'pedido_id' => $event->pedido->id,
                    'status' => $event->pedido->status,
                    'valor' => $event->pedido->valor_total,
                ]
            ];
        });
    
    return response()->json($events);
}
```

## Boas Práticas

1. **Validação de Dados**: Implemente validações nos models e requests
2. **Transações**: Use transações para operações críticas
3. **Logs**: Monitore todas as operações do webhook
4. **Retries**: Configure retries na fila para lidar com falhas temporárias
5. **Segurança**: Use HTTPS, valide tokens, limite requisições
6. **Testes**: Escreva testes para os parsers e jobs

## Extensões Futuras

- [ ] Integração com pagamentos (Mercado Pago, PagSeguro)
- [ ] Notificações por email/SMS
- [ ] Painel de métricas (Gráficos de pedidos, faturamento)
- [ ] Gerenciamento de estoque
- [ ] Multi-loja (suporte a vários negócios)
- [ ] Integração com Google Calendar
- [ ] Chatbot para atendimento inicial
- [ ] Histórico completo de conversas

## Resumo de Arquivos Criados/Modificados

### Novos Arquivos
- `app/Http/Controllers/WhatsAppWebhookController.php` - Controller do webhook
- `app/Jobs/ProcessarMensagemWhatsApp.php` - Job de processamento
- `app/Services/WhatsAppParserService.php` - Service de parsing
- `app/Providers/WhatsAppServiceProvider.php` - Provider de serviços
- `app/Models/Pedido.php` - Modelo de pedidos
- `app/Models/ItemPedido.php` - Modelo de itens do pedido
- `app/Models/Agenda.php` - Modelo de agenda
- `config/whatsapp.php` - Configuração do WhatsApp
- `routes/api.php` - Rotas da API

### Arquivos Modificados
- `app/Models/Cliente.php` - Corrigido relacionamento
- `app/Models/Produto.php` - Corrigido relacionamento e campos
- `bootstrap/app.php` - Adicionado provider e rotas API
- `.env.example` - Adicionadas configurações do WhatsApp
- `database/migrations/*` - Corrigidos nomes de tabelas

## Próximos Passos

1. **Instalar dependências**: `composer install`
2. **Configurar .env**: Copiar de `.env.example` e ajustar
3. **Executar migrations**: `php artisan migrate`
4. **Iniciar queue worker**: `php artisan queue:work`
5. **Configurar webhook na Meta**: Seguir documentação da Meta Cloud API
6. **Testar**: Usar endpoint de teste ou enviar mensagem real
7. **Implementar frontend**: Criar painel administrativo com Filament

## Recursos Adicionais

- [Laravel Documentation](https://laravel.com/docs)
- [Meta WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [Filament PHP](https://filamentphp.com/)
- [FullCalendar](https://fullcalendar.io/)
- [Claude AI](https://www.anthropic.com/)
- [Laravel Queues](https://laravel.com/docs/queues)

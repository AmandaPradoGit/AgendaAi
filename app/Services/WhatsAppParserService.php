<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class WhatsAppParserService
{
    /**
     * Parsers disponíveis
     */
    const PARSER_REGEX = 'regex';
    const PARSER_LLM = 'llm';
    
    /**
     * Parseia a mensagem do WhatsApp e extrai dados do pedido
     * 
     * @param array $data Dados brutos do webhook
     * @return array|null Dados extraídos ou null se não for um gatilho válido
     */
    public function parse(array $data): ?array
    {
        $message = $this->extractMessage($data);
        $phone = $this->extractPhoneNumber($data);
        
        if (!$message) {
            return null;
        }
        
        // Tentar parser por regex primeiro (mais rápido e gratuito)
        $regexResult = $this->parseWithRegex($message);
        
        if ($regexResult) {
            $regexResult['cliente_telefone'] = $phone;
            $regexResult['mensagem_original'] = $message;
            return $regexResult;
        }
        
        // Se regex falhar e LLM estiver configurado, tentar com LLM
        if (config('whatsapp.parser') === self::PARSER_LLM) {
            return $this->parseWithLLM($message, $phone);
        }
        
        return null;
    }
    
    /**
     * Extrai o texto da mensagem dos dados do webhook
     */
    protected function extractMessage(array $data): ?string
    {
        // Formato Meta Cloud API
        if (isset($data['entry'][0]['changes'][0]['value']['messages'][0]['text']['body'])) {
            return $data['entry'][0]['changes'][0]['value']['messages'][0]['text']['body'];
        }
        
        // Formato simplificado (Baileys ou teste manual)
        if (isset($data['messages'][0]['body'])) {
            return $data['messages'][0]['body'];
        }
        
        // Formato do bot Baileys (direto)
        if (isset($data['message'])) {
            return $data['message'];
        }
        
        // Formato do handleBaileysWebhook
        if (isset($data['baileys_data']['message'])) {
            return $data['baileys_data']['message'];
        }
        
        return null;
    }
    
    /**
     * Extrai o número de telefone dos dados do webhook
     */
    protected function extractPhoneNumber(array $data): string
    {
        // Formato Meta Cloud API
        if (isset($data['entry'][0]['changes'][0]['value']['messages'][0]['from'])) {
            return $data['entry'][0]['changes'][0]['value']['messages'][0]['from'];
        }
        
        // Formato simplificado
        if (isset($data['messages'][0]['from'])) {
            return $data['messages'][0]['from'];
        }
        
        // Formato do bot Baileys (phone já vem limpo)
        if (isset($data['phone'])) {
            return $data['phone'];
        }
        
        // Formato do handleBaileysWebhook
        if (isset($data['baileys_data']['phone'])) {
            return $data['baileys_data']['phone'];
        }
        
        return 'desconhecido';
    }
    
    /**
     * Parser usando regex (formato padronizado)
     * 
     * Formatos aceitos:
     * - "🎂✅ Maria, bolo de chocolate P, entrega 20/08 às 14h, recheio morango"
     * - "/confirmar Cliente: Maria, Produto: bolo de chocolate, Tamanho: P, Entrega: 20/08 14h, Obs: recheio morango"
     * - "Maria quer 1 bolo de chocolate P para 20/08 14h com recheio de morango 🎂✅"
     */
    protected function parseWithRegex(string $message): ?array
    {
        $triggers = config('whatsapp.triggers', ['🎂✅', '/confirmar', '/pedido']);
        
        // Verificar se tem gatilho
        $hasTrigger = false;
        foreach ($triggers as $trigger) {
            if (str_contains($message, $trigger)) {
                $hasTrigger = true;
                break;
            }
        }
        
        if (!$hasTrigger) {
            return null;
        }
        
        $gatilho = null;
        foreach ($triggers as $trigger) {
            if (str_contains($message, $trigger)) {
                $gatilho = $trigger;
                break;
            }
        }
        
        // Padronizar mensagem (remover gatilho, normalizar espaços)
        $cleanMessage = trim(str_replace($triggers, '', $message));
        $cleanMessage = preg_replace('/\s+/', ' ', $cleanMessage);
        
        // Tentar padrão 1: "Cliente: X, Produto: Y, ..."
        $pattern1 = '/(?P<cliente>cliente[:\s]+[^,]+)[,|\n]*' .
                    '(?P<produto>produto[:\s]+[^,]+)[,|\n]*' .
                    '(?P<tamanho>tamanho[:\s]+[^,]+)?[,|\n]*' .
                    '(?P<entrega>entrega[:\s]+[^,]+)[,|\n]*' .
                    '(?P<obs>obs[:\s]+.+)?/i';
        
        if (preg_match($pattern1, $cleanMessage, $matches)) {
            return $this->formatRegexResult($matches, $gatilho);
        }
        
        // Tentar padrão 2: "Nome, produto, entrega dia/hora"
        $pattern2 = '/(?P<cliente>[^,\d]+)[,|\n]*' .
                    '(?P<produto>[^,]+?)(?:\s+(?P<tamanho>P|M|G))?[,|\n]*' .
                    '(?:entrega|para|no dia)\s+' .
                    '(?P<data>\d{1,2}[\/\-]\d{1,2})[\s|às]+' .
                    '(?P<hora>\d{1,2}[h:.]\d{2})?' .
                    '(?:[,\n]|\s+)(?P<obs>.+)?/i';
        
        if (preg_match($pattern2, $cleanMessage, $matches)) {
            return $this->formatRegexResult($matches, $gatilho);
        }
        
        // Tentar padrão 3: Simples - apenas extrair palavras-chave
        $itens = [];
        $cliente = null;
        $data = null;
        $hora = null;
        $observacoes = [];
        
        // Extrair cliente (primeira palavra ou nome próprio)
        if (preg_match('/([A-Z][a-z]+\s+[A-Z][a-z]+)/', $cleanMessage, $m)) {
            $cliente = trim($m[1]);
        }
        
        // Extrair produto (palavras como "bolo", "doces", etc.)
        if (preg_match('/(bolo|doces|torta|cupcake)\s+(.+?)(?:\s+(P|M|G)|\s+para|,|$)/i', $cleanMessage, $m)) {
            $itens[] = [
                'produto' => trim($m[1] . ' ' . $m[2]),
                'tamanho' => $m[3] ?? null,
                'quantidade' => 1
            ];
        }
        
        // Extrair data (formato dd/mm ou dd/mm/yyyy)
        if (preg_match('/(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{4})?)/', $cleanMessage, $m)) {
            $data = $m[1];
            // Converter para YYYY-mm-dd
            if (str_contains($data, '/')) {
                $parts = explode('/', $data);
                if (count($parts) === 2) {
                    $data = date('Y') . '-' . str_pad($parts[1], 2, '0', STR_PAD_LEFT) . '-' . str_pad($parts[0], 2, '0', STR_PAD_LEFT);
                }
            }
        }
        
        // Extrair hora
        if (preg_match('/(\d{1,2}[h:.]\d{2})/', $cleanMessage, $m)) {
            $hora = str_replace(['h', '.'], ':', $m[1]);
        }
        
        if ($cliente || $data || !empty($itens)) {
            return [
                'gatilho' => $gatilho,
                'cliente_nome' => $cliente,
                'data_entrega' => $data,
                'hora_entrega' => $hora,
                'itens' => $itens,
                'observacoes' => implode(', ', $observacoes)
            ];
        }
        
        return null;
    }
    
    /**
     * Formata o resultado do regex para o formato esperado
     */
    protected function formatRegexResult(array $matches, string $gatilho): array
    {
        $result = [
            'gatilho' => $gatilho,
            'cliente_nome' => trim($matches['cliente'] ?? ''),
            'data_entrega' => null,
            'hora_entrega' => null,
            'itens' => [],
            'observacoes' => null
        ];
        
        // Processar produto
        if (!empty($matches['produto'])) {
            $produto = trim(str_replace(['produto:', 'Produto:'], '', $matches['produto']));
            
            $tamanho = null;
            if (!empty($matches['tamanho'])) {
                $tamanho = trim(str_replace(['tamanho:', 'Tamanho:'], '', $matches['tamanho']));
            }
            
            $result['itens'][] = [
                'produto' => $produto,
                'tamanho' => $tamanho,
                'quantidade' => 1,
                'preco_unitario' => null
            ];
        }
        
        // Processar entrega (data e hora)
        if (!empty($matches['entrega'])) {
            $entrega = trim(str_replace(['entrega:', 'Entrega:', 'para', 'no dia'], '', $matches['entrega']));
            
            // Extrair data e hora
            if (preg_match('/(\d{1,2}[\/\-]\d{1,2})[\s|às]+(\d{1,2}[h:.]\d{2})?/', $entrega, $m)) {
                $data = $m[1];
                $hora = $m[2] ?? null;
                
                // Converter data para YYYY-mm-dd
                if (str_contains($data, '/')) {
                    $parts = explode('/', $data);
                    if (count($parts) === 2) {
                        $data = date('Y') . '-' . str_pad($parts[1], 2, '0', STR_PAD_LEFT) . '-' . str_pad($parts[0], 2, '0', STR_PAD_LEFT);
                    }
                }
                
                $result['data_entrega'] = $data;
                if ($hora) {
                    $result['hora_entrega'] = str_replace(['h', '.'], ':', $hora);
                }
            }
        }
        
        // Processar observações
        if (!empty($matches['obs'])) {
            $result['observacoes'] = trim(str_replace(['obs:', 'Obs:', 'Observações:', 'observacoes:'], '', $matches['obs']));
        }
        
        return $result;
    }
    
    /**
     * Parser usando LLM (Claude Haiku, OpenAI, etc.)
     * 
     * Requer configuração no .env:
     * - LLM_DRIVER=claude|openai
     * - LLM_API_KEY=...
     * - LLM_MODEL=...
     */
    protected function parseWithLLM(string $message, string $phone): ?array
    {
        $driver = config('whatsapp.llm_driver', 'claude');
        $apiKey = config('whatsapp.llm_api_key');
        $model = config('whatsapp.llm_model', 'claude-haiku');
        
        if (!$apiKey) {
            Log::channel('whatsapp')->warning('LLM não configurado, API key ausente');
            return null;
        }
        
        $prompt = $this->buildLLMPrompt($message);
        
        try {
            $response = match ($driver) {
                'claude' => $this->callClaudeAPI($apiKey, $model, $prompt),
                'openai' => $this->callOpenAIAPI($apiKey, $model, $prompt),
                default => null
            };
            
            if (!$response) {
                return null;
            }
            
            // Parsear JSON de resposta
            $data = json_decode($response, true);
            
            if (json_last_error() !== JSON_ERROR_NONE) {
                Log::channel('whatsapp')->error('LLM retornou resposta inválida', [
                    'response' => $response
                ]);
                return null;
            }
            
            // Adicionar dados adicionais
            $data['cliente_telefone'] = $phone;
            $data['mensagem_original'] = $message;
            
            return $data;
            
        } catch (\Exception $e) {
            Log::channel('whatsapp')->error('Erro ao chamar LLM', [
                'error' => $e->getMessage(),
                'driver' => $driver
            ]);
            return null;
        }
    }
    
    /**
     * Constrói o prompt para o LLM
     */
    protected function buildLLMPrompt(string $message): string
    {
        $triggers = implode(' OR ', config('whatsapp.triggers', ['🎂✅', '/confirmar', '/pedido']));
        
        return <<<PROMPT
        Você é um assistente especializado em extrair informações de pedidos de uma confeitaria a partir de mensagens do WhatsApp.
        
        A mensagem contém um gatilho de confirmação: {$triggers}
        
        Extraia os seguintes campos da mensagem e retorne NO FORMATO JSON, apenas o JSON, sem outras palavras:
        {
            "gatilho": "o gatilho usado (🎂✅, /confirmar, etc.)",
            "cliente_nome": "nome do cliente",
            "cliente_telefone": "telefone do cliente (se disponível)",
            "itens": [
                {
                    "produto": "nome do produto (ex: bolo de chocolate)",
                    "quantidade": 1,
                    "tamanho": "P, M, G (opcional)",
                    "preco_unitario": 0.00,
                    "personalizacoes": "recheio, cobertura, etc. (opcional)"
                }
            ],
            "data_entrega": "YYYY-mm-dd",
            "hora_entrega": "HH:MM",
            "observacoes": "observações adicionais"
        }
        
        Se não encontrar informações suficientes, retorne null.
        
        Exemplo de mensagem: "🎂✅ Maria, bolo de chocolate P, entrega 20/08 às 14h, recheio morango"
        
        Mensagem a analisar: "{$message}"
        PROMPT;
    }
    
    /**
     * Chama API do Claude
     */
    protected function callClaudeAPI(string $apiKey, string $model, string $prompt): ?string
    {
        $url = 'https://api.anthropic.com/v1/messages';
        
        $response = Http::withHeaders([
            'x-api-key' => $apiKey,
            'anthropic-version' => '2023-06-01',
            'content-type' => 'application/json'
        ])->post($url, [
            'model' => $model,
            'max_tokens' => 1024,
            'temperature' => 0.0,
            'messages' => [
                ['role' => 'user', 'content' => $prompt]
            ]
        ]);
        
        if ($response->successful()) {
            $data = $response->json();
            return $data['content'][0]['text'] ?? null;
        }
        
        Log::channel('whatsapp')->error('Claude API error', [
            'status' => $response->status(),
            'response' => $response->body()
        ]);
        
        return null;
    }
    
    /**
     * Chama API do OpenAI
     */
    protected function callOpenAIAPI(string $apiKey, string $model, string $prompt): ?string
    {
        $url = 'https://api.openai.com/v1/chat/completions';
        
        $response = Http::withHeaders([
            'Authorization' => 'Bearer ' . $apiKey,
            'content-type' => 'application/json'
        ])->post($url, [
            'model' => $model,
            'messages' => [
                ['role' => 'user', 'content' => $prompt]
            ],
            'temperature' => 0.0,
            'max_tokens' => 1024,
            'response_format' => ['type' => 'json_object']
        ]);
        
        if ($response->successful()) {
            $data = $response->json();
            return $data['choices'][0]['message']['content'] ?? null;
        }
        
        Log::channel('whatsapp')->error('OpenAI API error', [
            'status' => $response->status(),
            'response' => $response->body()
        ]);
        
        return null;
    }
}

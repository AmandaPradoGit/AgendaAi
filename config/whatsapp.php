<?php

return [
    /**
     * Token de verificação para webhook da Meta Cloud API
     */
    'verify_token' => env('WHATSAPP_VERIFY_TOKEN', 'meu_token_seguro'),
    
    /**
     * Token de acesso (Bearer token) para Meta Cloud API
     */
    'access_token' => env('WHATSAPP_ACCESS_TOKEN'),
    
    /**
     * Número de telefone do negócio (no formato: 5511999999999)
     */
    'business_phone_id' => env('WHATSAPP_BUSINESS_PHONE_ID'),
    
    /**
     * Telefone do atendente para receiving confirmações
     */
    'atendente_phone' => env('WHATSAPP_ATENDENTE_PHONE', '5511999999999'),
    
    /**
     * Gatilhos para identificação de pedidos
     */
    'triggers' => explode(',', env('WHATSAPP_TRIGGERS', '🎂✅,/confirmar,/pedido')),
    
    /**
     * Parser a ser usado: 'regex' (padrão, gratuito) ou 'llm' (requer API externa)
     */
    'parser' => env('WHATSAPP_PARSER', 'regex'),
    
    /**
     * Configurações do LLM (se parser = 'llm')
     */
    'llm_driver' => env('WHATSAPP_LLM_DRIVER', 'claude'), // 'claude' ou 'openai'
    'llm_api_key' => env('WHATSAPP_LLM_API_KEY'),
    'llm_model' => env('WHATSAPP_LLM_MODEL', 'claude-haiku'),
    
    /**
     * URL base do webhook (para configuração na Meta)
     */
    'webhook_url' => env('APP_URL') . '/api/whatsapp/webhook',
    
    /**
     * Tempo máximo de processamento assíncrono (segundos)
     */
    'timeout' => 30,
    
    /**
     * Configurações da fila
     */
    'queue' => [
        'connection' => env('WHATSAPP_QUEUE_CONNECTION', 'database'),
        'queue_name' => env('WHATSAPP_QUEUE_NAME', 'whatsapp'),
    ],
];

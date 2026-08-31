<?php

namespace App\Http\Controllers;

use App\Jobs\ProcessarMensagemWhatsApp;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class WhatsAppWebhookController extends Controller
{
    /**
     * Recebe webhook do WhatsApp (Meta Cloud API ou similar)
     * 
     * @param Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function handleWebhook(Request $request)
    {
        // Verifica o token de verificação (para Meta Cloud API)
        if ($request->has('hub_mode') && $request->has('hub_challenge')) {
            $mode = $request->input('hub_mode');
            $token = $request->input('hub_verify_token');
            $challenge = $request->input('hub_challenge');
            
            // Verificar token (configurar no .env)
            if ($mode === 'subscribe' && $token === config('whatsapp.verify_token')) {
                return response()->json(['hub_challenge' => $challenge], 200);
            }
            
            return response()->json(['error' => 'Token inválido'], 403);
        }

        // Processa a mensagem recebeida
        try {
            $data = $request->all();
            
            // Para Meta Cloud API, as mensagens vêm em $data['entry'][0]['changes']
            // Para outras APIs, ajustar conforme necessário
            
            // Log da mensagem recebida
            Log::channel('whatsapp')->info('Mensagem recebida', ['data' => $data]);
            
            // Despacha job para processamento assíncrono
            ProcessarMensagemWhatsApp::dispatch($data);
            
            return response()->json(['status' => 'Processando...'], 202);
            
        } catch (\Exception $e) {
            Log::channel('whatsapp')->error('Erro no webhook', [
                'error' => $e->getMessage(),
                'data' => $request->all()
            ]);
            
            return response()->json(['error' => 'Erro ao processar mensagem'], 500);
        }
    }
    
    /**
     * Handle webhook from Baileys bot
     * Receives data in Baileys format: {phone, message, cliente, produto, quantidade, tamanho, data_entrega, hora_entrega, observacoes}
     */
    public function handleBaileysWebhook(Request $request)
    {
        try {
            $data = $request->all();
            
            // Log the received data
            Log::channel('whatsapp')->info('Baileys webhook received', ['data' => $data]);
            
            // Validate required fields
            if (!isset($data['phone']) || !isset($data['message'])) {
                return response()->json(['error' => 'Missing phone or message'], 400);
            }
            
            // Format data to be compatible with the Job
            // The Job expects either Meta format or simple messages array
            $formattedData = [
                'messages' => [[
                    'from' => $data['phone'] . '@s.whatsapp.net',
                    'body' => $data['message'],
                    'timestamp' => time()
                ]],
                // Include additional fields from Baileys if present
                'baileys_data' => array_diff_key($data, ['phone' => '', 'message' => ''])
            ];
            
            // Dispatch job for async processing
            ProcessarMensagemWhatsApp::dispatch($formattedData);
            
            return response()->json(['status' => 'Processando pedido...'], 202);
            
        } catch (\Exception $e) {
            Log::channel('whatsapp')->error('Error in Baileys webhook', [
                'error' => $e->getMessage(),
                'data' => $request->all()
            ]);
            
            return response()->json(['error' => 'Erro ao processar pedido'], 500);
        }
    }
    
    /**
     * Endpoint para teste manual (simular recepção de mensagem)
     */
    public function testWebhook(Request $request)
    {
        $validated = $request->validate([
            'telefone' => 'required|string',
            'mensagem' => 'required|string'
        ]);
        
        // Simula dado de entrada do WhatsApp
        $mockData = [
            'messages' => [[
                'from' => $validated['telefone'],
                'body' => $validated['mensagem'],
                'timestamp' => now()->timestamp
            ]]
        ];
        
        ProcessarMensagemWhatsApp::dispatch($mockData);
        
        return response()->json([
            'status' => 'Mensagem de teste em fila',
            'data' => $mockData
        ], 202);
    }
}

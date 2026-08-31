<?php

namespace App\Jobs;

use App\Models\Cliente;
use App\Models\Pedido;
use App\Models\Agenda;
use App\Models\Produto;
use App\Services\WhatsAppParserService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class ProcessarMensagemWhatsApp implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $data;
    public $tries = 3;
    public $backoff = [10, 30, 60]; // Retry em 10s, 30s, 60s
    
    /**
     * Create a new job instance.
     */
    public function __construct(array $data)
    {
        $this->data = $data;
    }

    /**
     * Execute the job.
     */
    public function handle(WhatsAppParserService $parser): void
    {
        try {
            // Extrair dados da mensagem
            $extracted = $parser->parse($this->data);
            
            if (!$extracted) {
                Log::channel('whatsapp')->info('Mensagem sem gatilho, ignorando', [
                    'data' => $this->data
                ]);
                return;
            }
            
            // Verificar se é um gatilho válido
            if (!in_array($extracted['gatilho'], config('whatsapp.triggers', ['🎂✅', '/confirmar', '/pedido']))) {
                Log::channel('whatsapp')->info('Gatilho desconhecido', [
                    'gatilho' => $extracted['gatilho']
                ]);
                return;
            }
            
            // Buscar ou criar cliente
            $telefone = $extracted['cliente_telefone'] ?? $this->extractPhoneNumber($this->data);
            $cliente = Cliente::firstOrCreate(
                ['telefone' => $telefone],
                ['nome' => $extracted['cliente_nome'] ?? 'Cliente não identificado']
            );
            
            // Criar pedido
            $pedido = Pedido::create([
                'cliente_id' => $cliente->id,
                'valor_total' => $extracted['valor_total'] ?? 0,
                'status' => 'confirmado', // Status inicial ao confirmar pelo gatilho
                'data_entrega' => $extracted['data_entrega'] ?? now()->addDays(1)->format('Y-m-d'),
                'hora_entrega' => $extracted['hora_entrega'] ?? '14:00',
                'observacoes' => $extracted['observacoes'] ?? null,
                'gatilho_whatsapp' => $extracted['gatilho'],
                'mensagem_original' => $extracted['mensagem_original'] ?? json_encode($this->data)
            ]);
            
            // Adicionar itens do pedido
            if (!empty($extracted['itens'])) {
                foreach ($extracted['itens'] as $item) {
                    // Buscar produto pelo nome ou criar novo
                    $produto = Produto::firstOrCreate(
                        ['nome' => $item['produto']],
                        [
                            'tipo' => 'bolo',
                            'preco_base' => $item['preco_unitario'] ?? 0,
                            'ativo' => true
                        ]
                    );
                    
                    $pedido->itens()->attach($produto->id, [
                        'quantidade' => $item['quantidade'] ?? 1,
                        'preco_unitario' => $item['preco_unitario'] ?? $produto->preco_base,
                        'tamanho' => $item['tamanho'] ?? null,
                        'tema_decoracao' => $item['tema_decoracao'] ?? null,
                        'personalizacoes' => $item['personalizacoes'] ?? null
                    ]);
                }
                
                // Recalcular valor total
                $valorTotal = $pedido->itens()->sum(
                    fn($item) => $item->pivot->quantidade * $item->pivot->preco_unitario
                );
                
                // Atualizar valor total do pedido
                $pedido->update(['valor_total' => $valorTotal]);
            }
            
            // Criar evento na agenda
            Agenda::create([
                'pedido_id' => $pedido->id,
                'inicio' => $pedido->data_entrega . ' ' . $pedido->hora_entrega,
                'fim' => $pedido->data_entrega . ' ' . date('H:i', strtotime($pedido->hora_entrega . ' +1 hour')),
                'titulo' => 'Entrega: ' . $cliente->nome,
                'tipo' => 'entrega',
                'descricao' => $pedido->observacoes
            ]);
            
            // Enviar confirmação para o atendente (simulado)
            $this->sendConfirmation($pedido, $cliente);
            
            Log::channel('whatsapp')->info('Pedido criado com sucesso', [
                'pedido_id' => $pedido->id,
                'cliente' => $cliente->nome,
                'valor_total' => $pedido->valor_total
            ]);
            
        } catch (\Exception $e) {
            Log::channel('whatsapp')->error('Erro ao processar mensagem', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
                'data' => $this->data
            ]);
            throw $e;
        }
    }
    
    /**
     * Extrai número de telefone dos dados da mensagem
     */
    protected function extractPhoneNumber(array $data): string
    {
        // Para Meta Cloud API
        if (isset($data['entry'][0]['changes'][0]['value']['messages'][0]['from'])) {
            return $data['entry'][0]['changes'][0]['value']['messages'][0]['from'];
        }
        
        // Para formato simplificado
        if (isset($data['messages'][0]['from'])) {
            return $data['messages'][0]['from'];
        }
        
        return 'desconhecido';
    }
    
    /**
     * Envia confirmação para o atendente
     */
    protected function sendConfirmation(Pedido $pedido, Cliente $cliente): void
    {
        // Implementar integração com WhatsApp para enviar confirmação
        // Por enquanto, apenas log
        $mensagem = sprintf(
            "Pedido registrado ✅ — %s, %s, entrega %s às %s",
            $cliente->nome,
            $pedido->itens()->count() . ' itens',
            $pedido->data_entrega->format('d/m'),
            $pedido->hora_entrega
        );
        
        Log::channel('whatsapp')->info('Confirmação enviada', [
            'mensagem' => $mensagem,
            'atendente' => config('whatsapp.atendente_phone', '5511999999999')
        ]);
        
        // TODO: Implementar envio real via API WhatsApp
        // $whatsappService->sendMessage(config('whatsapp.atendente_phone'), $mensagem);
    }
}

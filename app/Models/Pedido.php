<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Pedido extends Model
{
    protected $table = 'pedidos';
    
    protected $fillable = [
        'cliente_id',
        'valor_total',
        'status',
        'data_entrega',
        'hora_entrega',
        'observacoes',
        'gatilho_whatsapp',
        'mensagem_original'
    ];

    protected $casts = [
        'valor_total' => 'decimal:2',
        'data_entrega' => 'date',
        'hora_entrega' => 'datetime:H:i',
        'status' => 'string'
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
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Produto extends Model
{
    protected $table = 'produtos';
    
    protected $fillable = [
        'nome',
        'tipo',
        'massa',
        'recheio',
        'cobertura',
        'tamanho',
        'preco_base',
        'ativo',
        'descricao'
    ];

    protected $casts = [
        'preco_base' => 'decimal:2',
        'ativo' => 'boolean'
    ];

    public function pedidos(): BelongsToMany
    {
        return $this->belongsToMany(Pedido::class, 'itens_pedido', 'produto_id', 'pedido_id')
            ->withPivot('quantidade', 'preco_unitario', 'tamanho', 'tema_decoracao', 'personalizacoes')
            ->withTimestamps();
    }
}

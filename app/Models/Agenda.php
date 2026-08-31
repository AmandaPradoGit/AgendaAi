<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Agenda extends Model
{
    protected $table = 'agenda';
    
    protected $fillable = [
        'pedido_id',
        'inicio',
        'fim',
        'titulo',
        'tipo',
        'descricao'
    ];

    protected $casts = [
        'inicio' => 'datetime',
        'fim' => 'datetime',
        'tipo' => 'string'
    ];

    public function pedido(): BelongsTo
    {
        return $this->belongsTo(Pedido::class, 'pedido_id');
    }
}
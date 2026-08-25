<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('pedidos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('cliente_id')->constrained()->onDelete('cascade'); // Vinculo ao cliente
            $table->decimal('valor_total', 10, 2); // Valor total do pedido (calculado a partir dos itens)
            $table->enum('status', ['orcamento', 'confirmado', 'em_producao', 'entregue', 'cancelado'])->default('orcamento');
            $table->date('data_entrega'); 
            $table->time('hora_entrega'); 
            $table->text('observacoes')->nullable(); 
            $table->string('gatilho_whatsapp')->nullable();
            $table->string('mensagem_original')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('pedidos');
    }
};

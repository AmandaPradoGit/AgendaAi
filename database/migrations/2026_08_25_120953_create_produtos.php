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
       Schema::create('produtos', function (Blueprint $table) {
            $table->id();
            $table->string('nome'); 
            $table->string('tipo')->default('bolo'); 
            $table->string('massa')->nullable(); 
            $table->string('recheio')->nullable(); 
            $table->string('cobertura')->nullable(); 
            $table->string('tamanho')->nullable(); 
            $table->decimal('preco_base', 10, 2); 
            $table->boolean('ativo')->default(true); 
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('produtos');
    }
};

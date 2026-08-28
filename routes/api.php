<?php

use App\Http\Controllers\WhatsAppWebhookController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::prefix('whatsapp')->group(function () {
    
    // Webhook principal para receber mensagens da Meta Cloud API
    Route::post('/webhook', [WhatsAppWebhookController::class, 'handleWebhook']);
    
    // Endpoint para teste manual (GET e POST)
    Route::get('/webhook/test', [WhatsAppWebhookController::class, 'testWebhook']);
    Route::post('/webhook/test', [WhatsAppWebhookController::class, 'testWebhook']);
});

// Health check
Route::get('/health', function () {
    return response()->json(['status' => 'OK', 'timestamp' => now()]);
});

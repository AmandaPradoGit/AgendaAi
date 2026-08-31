<?php

namespace App\Providers;

use App\Services\WhatsAppParserService;
use Illuminate\Support\ServiceProvider;

class WhatsAppServiceProvider extends ServiceProvider
{
    /**
     * Register services.
     */
    public function register(): void
    {
        $this->app->singleton(WhatsAppParserService::class, function ($app) {
            return new WhatsAppParserService();
        });
        
        // Configuração de logging específico para WhatsApp
        $this->configureLogging();
    }

    /**
     * Bootstrap services.
     */
    public function boot(): void
    {
        // Carregar configuração
        $this->mergeConfigFrom(
            __DIR__ . '/../../config/whatsapp.php', 'whatsapp'
        );
        
        // Publicar configuração
        $this->publishes([
            __DIR__ . '/../../config/whatsapp.php' => config_path('whatsapp.php'),
        ], 'whatsapp-config');
    }
    
    /**
     * Configurar canal de logging para WhatsApp
     */
    protected function configureLogging(): void
    {
        $logPath = storage_path('logs/whatsapp.log');
        
        config([
            'logging.channels.whatsapp' => [
                'driver' => 'single',
                'path' => $logPath,
                'level' => 'debug',
                'permission' => 0640,
            ]
        ]);
    }
}

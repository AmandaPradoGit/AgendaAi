/**
 * Sistema de Pedidos via WhatsApp - Bot usando Baileys
 * Este script conecta ao WhatsApp, recebe mensagens com gatilhos,
 * extrai dados de pedidos e envia para o backend Laravel.
 */

const { useMultiFileAuthState, makeWASocket, DisconnectReason, fetchLatestBaileysVersion } = require('baileys');
const { Boom } = require('@hapi/boom');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');

// Configurações
const AUTH_DIR = path.join(__dirname, 'auth');
const AUTH_FILE = path.join(AUTH_DIR, 'auth_info.json');
const LARAVEL_ENDPOINT = process.env.LARAVEL_ENDPOINT || 'http://localhost:8080/api/whatsapp/baileys';
const TRIGGERS = ['🎂✅', '/confirmar', '/pedido'];
const RECONNECT_DELAY = 5000;

// Funções auxiliares
function ensureAuthDirExists() {
    if (!fs.existsSync(AUTH_DIR)) {
        fs.mkdirSync(AUTH_DIR, { recursive: true });
        console.log(`Diretório ${AUTH_DIR} criado.`);
    }
}

function formatPhoneNumber(jid) {
    if (!jid) return 'desconhecido';
    // Remover @s.whatsapp.net, @c.us ou @lid
    return jid.replace(/@(s\.whatsapp\.net|c\.us|lid)/g, '');
}

function extractClientName(message) {
    if (message.pushName) return message.pushName;
    if (message.key?.participant) return 'Cliente (grupo)';
    return 'Cliente não identificado';
}

function isValidDate(date) {
    if (!date) return false;
    const dateRegex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    if (!dateRegex.test(date)) return false;
    const [, day, month, year] = date.match(dateRegex);
    const dateObj = new Date(year, month - 1, day);
    return (dateObj.getDate() == day && dateObj.getMonth() == month - 1 && dateObj.getFullYear() == year);
}

function isValidTime(time) {
    if (!time) return false;
    const timeRegex = /^(\d{1,2}):(\d{2})$/;
    if (!timeRegex.test(time)) return false;
    const [, hours, minutes] = time.match(timeRegex);
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

// Extrai dados do pedido
function extractOrderData(text) {
    let cleanText = text;
    TRIGGERS.forEach(trigger => cleanText = cleanText.replace(trigger, '').trim());
    cleanText = cleanText.replace(/\s+/g, ' ');
    
    const orderData = {
        cliente: null, produto: null, quantidade: 1, tamanho: null,
        data_entrega: null, hora_entrega: null, observacoes: null
    };
    
    // PADRÃO 1: Formato simples: "Produto, Quantidade, Tamanho, Data, Hora"
    // Exemplo: "Bolo de Chocolate, 1, G, 25/08/2026, 14:00"
    // Aceita P/M/G ou numero como tamanho
    const patternSimple = /^([^,]+?)\s*,\s*(\d+)\s*,\s*([PMG\d]?)\s*,\s*(\d{2}\/\d{2}\/\d{4})\s*,\s*(\d{1,2}:\d{2})\s*(.*)?$/i;
    let match = cleanText.match(patternSimple);
    if (match) {
        orderData.produto = match[1].trim();
        orderData.quantidade = parseInt(match[2]) || 1;
        // Aceitar P, M, G ou número como tamanho
        if (match[3] && ['P', 'M', 'G'].includes(match[3].toUpperCase())) {
            orderData.tamanho = match[3].toUpperCase();
        } else if (match[3] && /^\d+$/.test(match[3])) {
            // Se for número, converter para tamanho (1-10 -> P/M/G)
            const num = parseInt(match[3]);
            orderData.tamanho = num <= 3 ? 'P' : num <= 6 ? 'M' : 'G';
        }
        if (isValidDate(match[4])) orderData.data_entrega = match[4];
        if (isValidTime(match[5])) orderData.hora_entrega = match[5];
        if (match[6] && match[6].trim()) {
            // Extrair observações se houver
            const obsMatch = match[6].match(/(?:Obs|Observa(?:ções|ção))[:\s]+(.+)/i);
            orderData.observacoes = obsMatch ? obsMatch[1].trim() : match[6].trim();
        }
        if (orderData.produto && orderData.data_entrega) return orderData;
    }
    
    // PADRÃO 1B: Formato simples sem tamanho: "Produto, Quantidade, Data, Hora"
    const patternSimpleNoSize = /^([^,]+?)\s*,\s*(\d+)\s*,\s*(\d{2}\/\d{2}\/\d{4})\s*,\s*(\d{1,2}:\d{2})\s*(.*)?$/i;
    match = cleanText.match(patternSimpleNoSize);
    if (match) {
        orderData.produto = match[1].trim();
        orderData.quantidade = parseInt(match[2]) || 1;
        if (isValidDate(match[3])) orderData.data_entrega = match[3];
        if (isValidTime(match[4])) orderData.hora_entrega = match[4];
        if (match[5] && match[5].trim()) {
            const obsMatch = match[5].match(/(?:Obs|Observa(?:ções|ção))[:\s]+(.+)/i);
            orderData.observacoes = obsMatch ? obsMatch[1].trim() : match[5].trim();
        }
        if (orderData.produto && orderData.data_entrega) return orderData;
    }
    
    // PADRÃO 2: Com cliente: "Cliente, Produto, Quantidade, Tamanho, Data, Hora"
    const patternWithClient = /^([^,]+?)\s*,\s*([^,]+?)\s*,\s*(\d+)\s*,\s*([PMG\d]?)\s*,\s*(\d{2}\/\d{2}\/\d{4})\s*,\s*(\d{1,2}:\d{2})\s*(.*)?$/i;
    match = cleanText.match(patternWithClient);
    if (match) {
        orderData.cliente = match[1].trim();
        orderData.produto = match[2].trim();
        orderData.quantidade = parseInt(match[3]) || 1;
        // Aceitar P, M, G ou número como tamanho
        if (match[4] && ['P', 'M', 'G'].includes(match[4].toUpperCase())) {
            orderData.tamanho = match[4].toUpperCase();
        } else if (match[4] && /^\d+$/.test(match[4])) {
            const num = parseInt(match[4]);
            orderData.tamanho = num <= 3 ? 'P' : num <= 6 ? 'M' : 'G';
        }
        if (isValidDate(match[5])) orderData.data_entrega = match[5];
        if (isValidTime(match[6])) orderData.hora_entrega = match[6];
        if (match[7] && match[7].trim()) {
            const obsMatch = match[7].match(/(?:Obs|Observa(?:ções|ção))[:\s]+(.+)/i);
            orderData.observacoes = obsMatch ? obsMatch[1].trim() : match[7].trim();
        }
        if (orderData.produto && orderData.data_entrega) return orderData;
    }
    
    // PADRÃO 3: Estruturado
    const pattern1 = /(?:Cliente[:\s]+([^,]+))?[,\s]*(?:Produto[:\s]+([^,]+))[,\s]*(?:Qtd[:\s]+(\d+))?[,\s]*(?:Tamanho[:\s]+(P|M|G))?[,\s]*(?:Data[:\s]+(\d{2}\/\d{2}\/\d{4}))?[,\s]*(?:Hora[:\s]+(\d{1,2}:\d{2}))?[,\s]*(?:(?:Obs|Observa(?:ções|ção))[:\s]+(.+))?/i;
    match = cleanText.match(pattern1);
    if (match) {
        if (match[2]) orderData.produto = match[2].trim();
        if (match[1]) orderData.cliente = match[1].trim();
        if (match[3]) orderData.quantidade = parseInt(match[3]);
        if (match[4]) orderData.tamanho = match[4];
        if (match[5] && isValidDate(match[5])) orderData.data_entrega = match[5];
        if (match[6] && isValidTime(match[6])) orderData.hora_entrega = match[6];
        if (match[7]) orderData.observacoes = match[7].trim();
        if (orderData.produto && orderData.data_entrega) return orderData;
    }
    
    // PADRÃO 4: Natural
    const pattern2 = /^([A-Za-z\s]+)[,\s]*(\d+)\s+([^,]+?)\s+(?:tamanho\s+(P|M|G))?[\s]*,?[\s]*(?:entrega\s+(\d{2}\/\d{2}\/\d{4})[\s]+(?:às|as|\s)(\d{1,2}:\d{2}))(?:[,\s]+(?:Obs|Observa(?:ções|ção))[:\s]+(.+))?/i;
    match = cleanText.match(pattern2);
    if (match) {
        if (match[1]) orderData.cliente = match[1].trim();
        if (match[3]) orderData.produto = match[3].trim();
        if (match[2]) orderData.quantidade = parseInt(match[2]);
        if (match[4]) orderData.tamanho = match[4];
        if (match[5] && isValidDate(match[5])) orderData.data_entrega = match[5];
        if (match[6] && isValidTime(match[6])) orderData.hora_entrega = match[6];
        if (match[7]) orderData.observacoes = match[7].trim();
        if (orderData.produto && orderData.data_entrega) return orderData;
    }
    
    // PADRÃO 5: Simples sem tamanho
    const pattern3 = /^([^,]+)[,\s]*(\d+)[,\s]*(P|M|G)?[,\s]*(\d{2}\/\d{2}\/\d{4})[,\s]*(\d{1,2}:\d{2})?(?:[,\s]+(.+))?/i;
    match = cleanText.match(pattern3);
    if (match) {
        if (match[1]) orderData.produto = match[1].trim();
        if (match[2]) orderData.quantidade = parseInt(match[2]);
        if (match[3]) orderData.tamanho = match[3];
        if (match[4] && isValidDate(match[4])) orderData.data_entrega = match[4];
        if (match[5] && isValidTime(match[5])) orderData.hora_entrega = match[5];
        if (match[6]) orderData.observacoes = match[6].trim();
        if (orderData.produto && orderData.data_entrega) return orderData;
    }
    
    // Tentar extrair partes individuais
    const nameMatch = cleanText.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
    if (nameMatch) orderData.cliente = nameMatch[1].trim();
    const quantityMatch = cleanText.match(/\b(\d+)\b(?=\s+(?:unidades?|un|qtd|quantidade|x)[\s,]|\s+)/i);
    if (quantityMatch) orderData.quantidade = parseInt(quantityMatch[1]);
    const sizeMatch = cleanText.match(/\b(P|M|G)\b/i);
    if (sizeMatch) orderData.tamanho = sizeMatch[1].toUpperCase();
    const dateMatch = cleanText.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
    if (dateMatch && isValidDate(dateMatch[1])) orderData.data_entrega = dateMatch[1];
    const timeMatch = cleanText.match(/\b(\d{1,2}:\d{2})\b/);
    if (timeMatch && isValidTime(timeMatch[1])) orderData.hora_entrega = timeMatch[1];
    const obsMatch = cleanText.match(/(?:Obs|Observa(?:ções|ção))[:\s]+(.+)/i);
    if (obsMatch) orderData.observacoes = obsMatch[1].trim();
    
    const productKeywords = ['bolo', 'torta', 'doce', 'cupcake'];
    for (const keyword of productKeywords) {
        const productRegex = new RegExp(`\\b${keyword}\\s+(.+?)(?:\\s+\\d+|\\s+P|\\s+M|\\s+G|\\s+para|\\s+entrega|\\s+$,)`, 'i');
        const productMatch = cleanText.match(productRegex);
        if (productMatch) {
            orderData.produto = `${keyword} ${productMatch[1]}`.trim();
            break;
        }
    }
    
    if (!orderData.produto) {
        let tempText = cleanText;
        if (orderData.cliente) tempText = tempText.replace(orderData.cliente, '').trim();
        tempText = tempText.replace(/\d+\s*(?:unidades?|un|qtd|quantidade|x)/i, '').trim();
        tempText = tempText.replace(/\b(P|M|G)\b/gi, '').trim();
        tempText = tempText.replace(/\b\d{2}\/\d{2}\/\d{4}\b/g, '').trim();
        tempText = tempText.replace(/\b\d{1,2}:\d{2}\b/g, '').trim();
        tempText = tempText.replace(/(?:entrega|para|no dia|às|as)/gi, '').trim();
        tempText = tempText.replace(/(?:Obs|Observa(?:ções|ção))[:\s]+.+/gi, '').trim();
        if (tempText && tempText.length > 2) orderData.produto = tempText;
    }
    
    return (orderData.produto && orderData.data_entrega) ? orderData : null;
}

function formatConfirmationMessage(orderData) {
    const lines = [
        '✅ Pedido registrado!',
        `Cliente: ${orderData.cliente || 'Não identificado'}`,
        `Produto: ${orderData.produto || 'Não especificado'} ${orderData.tamanho ? `(${orderData.tamanho})` : ''}`,
        `Quantidade: ${orderData.quantidade || 1}`,
        `Entrega: ${orderData.data_entrega || 'Não especificada'} ${orderData.hora_entrega ? `às ${orderData.hora_entrega}` : ''}`,
        `Observações: ${orderData.observacoes || 'Nenhuma'}`
    ];
    return lines.join('\n');
}

async function sendToLaravel(orderData, phone, originalMessage) {
    try {
        const payload = { phone, message: originalMessage, ...orderData };
        console.log('📤 Enviando para Laravel:', LARAVEL_ENDPOINT);
        console.log('   Dados:', JSON.stringify(payload, null, 2));
        
        const response = await axios.post(LARAVEL_ENDPOINT, payload, {
            headers: { 'Content-Type': 'application/json' }, timeout: 10000
        });
        
        console.log('✅ Laravel respondeu:', response.status, response.statusText);
        console.log('   Data:', JSON.stringify(response.data));
        return response.data;
    } catch (error) {
        console.error('❌ Erro ao enviar para Laravel:');
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', error.response.data);
        } else if (error.code) {
            console.error('   Code:', error.code);
            console.error('   Message:', error.message);
        } else {
            console.error('   Message:', error.message);
        }
        throw error;
    }
}

async function connectToWhatsApp() {
    ensureAuthDirExists();
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();
    console.log(`Usando Baileys v${version.join('.')}`);
    
    // Timestamp de inicialização - apenas mensagens recebidas a partir de agora serão processadas
    const botStartTimestamp = Date.now();
    console.log(`Bot iniciado às ${new Date(botStartTimestamp).toISOString()}`);
    
    const sock = makeWASocket({
        version, auth: state,
        browser: ['SistemaPedidos', 'Chrome', '1.0.0'],
        shouldReconnect: () => true, maxMsgRetryCount: 3,
        // Desabilitar sincronização de histórico para não carregar mensagens antigas
        syncFullHistory: false,
        historySyncConfig: {
            syncOnLogin: false,
            syncOnConnection: false
        }
    });
    
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log('\n========================================');
            console.log('  📱 AUTENTICAÇÃO WHATSAPP');
            console.log('========================================');
            console.log('');
            console.log('📌 MÉTODO 1 (Recomendado):');
            console.log('   Abra este link no seu CELULAR:');
            console.log(`   ${qr}`);
            console.log('');
            console.log('   ou escaneie este QR Code:');
            
            // Gerar QR Code em formato ASCII
            qrcode.generate(qr, { small: true }, (qrcodeString) => {
                console.log(qrcodeString);
            });
            
            console.log('');
            console.log('📌 MÉTODO 2:');
            console.log('   Abra este link no navegador para ver o QR Code:');
            const qrImageLink = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`;
            console.log(`   ${qrImageLink}`);
            console.log('');
            console.log('========================================');
            console.log('IMPORTANTE: Faça login com o WhatsApp no link acima');
            console.log('para conectar o bot ao seu número.');
            console.log('========================================\n');
        }
        if (connection === 'close') {
            // Verificar se o erro é de deslogado permanente (logged out)
            const shouldReconnect = !(lastDisconnect.error instanceof Boom && 
                lastDisconnect.error.output?.statusCode === DisconnectReason.loggedOut);
            
            if (shouldReconnect) {
                console.log('Conexão fechada. Reconectando em 5 segundos...');
                setTimeout(() => connectToWhatsApp(), RECONNECT_DELAY);
            } else {
                console.log('❌ Desconectado permanentemente.');
                console.log('Reinicie o script e escaneie o QR Code novamente.');
                console.log('');
                console.log('Dica: Se o problema persistir, delete a pasta auth/ e tente novamente.');
            }
        } else if (connection === 'open') {
            console.log('✅ ═════════════════════════════════');
            console.log('  🎉 CONECTADO AO WHATSAPP COM SUCESSO!');
            console.log('✅ ═════════════════════════════════');
            console.log('');
            console.log('  🤖 Bot pronto para receber pedidos!');
            console.log('');
            console.log('  💬 Envie uma mensagem com um dos gatilhos:');
            console.log('     - 🎂✅');
            console.log('     - /confirmar');
            console.log('     - /pedido');
            console.log('');
            console.log('  📝 Exemplo:');
            console.log('     "Bolo de Chocolate, 1, G, 25/08/2026, 14:00 🎂✅"');
            console.log('');
            console.log('  ⚠️  Mensagens SEM gatilho serão ignoradas.');
            console.log('');
        } else if (connection === 'connecting') {
            console.log('🔄 Conectando ao WhatsApp...');
        } else if (connection === 'awaiting-initial-sync') {
            console.log('⏳ Sincronizando mensagens...');
        }
    });
    
    sock.ev.on('messages.upsert', async (m) => {
        try {
            const message = m.messages[0];
            
            // Log de depuração
            console.log('\n📩 [DEBUG] Mensagem recebida');
            console.log('  Type:', m.type);
            console.log('  FromMe:', message.key.fromMe);
            
            // Ignorar mensagens antigas (anteriores ao inicio do bot)
            const messageTimestamp = message.messageTimestamp || message.message?.messageTimestamp;
            if (messageTimestamp) {
                const messageDate = new Date(messageTimestamp * 1000); // Baileys usa timestamp em segundos
                const messageTime = messageDate.getTime();
                if (messageTime < botStartTimestamp) {
                    console.log('  → Ignorando (mensagem antiga, antes do bot iniciar)');
                    console.log(`     Mensagem: ${messageDate.toISOString()}, Bot iniciado: ${new Date(botStartTimestamp).toISOString()}`);
                    return;
                }
            }
            
            // Processar mensagens independentemente de fromMe (para permitir auto-teste)
            // if (message.key.fromMe || m.type !== 'notify') {
            //     console.log('  → Ignorando (fromMe ou não é notify)');
            //     return;
            // }
            
            if (m.type !== 'notify') {
                console.log('  → Ignorando (não é notify)');
                return;
            }
            
            // Aviso se for mensagem do próprio usuário (auto-teste)
            if (message.key.fromMe) {
                console.log('  ⚠️  Mensagem do próprio usuário (modo teste)');
            }
            
            let text = message.message.conversation || 
                      message.message.extendedTextMessage?.text || 
                      '';
            text = text.trim();
            if (!text) return;
            
            console.log('Mensagem de:', message.key.remoteJid);
            console.log('Texto:', text);
            
            const hasTrigger = TRIGGERS.some(t => text.includes(t));
            console.log('Gatilho encontrado:', hasTrigger);
            
            if (!hasTrigger) {
                console.log('⚠️ Sem gatilho, ignorando.');
                return;
            }
            
            console.log('🔍 Processando pedido...');
            const orderData = extractOrderData(text);
            console.log('Dados extraídos:', JSON.stringify(orderData));
            
            if (!orderData || !orderData.produto || !orderData.data_entrega) {
                console.log('❌ Dados incompletos, enviando erro...');
                await sock.sendMessage(message.key.remoteJid, {
                    text: 'Formato inválido. Use: *Produto, Qtd, Tamanho, Data, Hora*\nEx: "Bolo de Chocolate, 1, G, 25/08/2026, 14:00 🎂✅"'
                });
                return;
            }
            
            if (!orderData.cliente) {
                orderData.cliente = extractClientName(message);
            }
            const phone = formatPhoneNumber(message.key.remoteJid);
            console.log('Enviando para Laravel...');
            
            try {
                await sendToLaravel(orderData, phone, text);
                console.log('✅ Laravel respondeu com sucesso!');
                
                const confirmation = formatConfirmationMessage(orderData);
                console.log('Enviando confirmação...');
                await sock.sendMessage(message.key.remoteJid, {
                    text: confirmation
                });
                console.log('✅ Confirmação enviada com sucesso!');
            } catch (error) {
                console.error('❌ Erro:', error.message);
                await sock.sendMessage(message.key.remoteJid, {
                    text: 'Erro ao registrar pedido. Tente novamente.'
                });
            }
        } catch (error) {
            console.error('Erro ao processar:', error.message);
        }
    });
    
    return sock;
}

console.log('Sistema de Pedidos via WhatsApp - Baileys');
console.log('Endpoint:', LARAVEL_ENDPOINT);
console.log('Gatilhos:', TRIGGERS.join(', '));
console.log('');

connectToWhatsApp().catch(err => {
    console.error('Erro:', err);
    process.exit(1);
});

process.on('SIGINT', () => {
    console.log('\nParando...');
    process.exit(0);
});

module.exports = { connectToWhatsApp, extractOrderData, formatPhoneNumber };

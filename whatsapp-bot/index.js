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

// Configurações
const AUTH_DIR = path.join(__dirname, 'auth');
const AUTH_FILE = path.join(AUTH_DIR, 'auth_info.json');
const LARAVEL_ENDPOINT = process.env.LARAVEL_ENDPOINT || 'http://localhost:8000/api/whatsapp/baileys';
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
    return jid.replace(/@(s\.whatsapp\.net|c\.us)/g, '');
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
    
    // PADRÃO 1: Estruturado
    const pattern1 = /(?:Cliente[:\s]+([^,]+))?[,\s]*(?:Produto[:\s]+([^,]+))[,\s]*(?:Qtd[:\s]+(\d+))?[,\s]*(?:Tamanho[:\s]+(P|M|G))?[,\s]*(?:Data[:\s]+(\d{2}\/\d{2}\/\d{4}))?[,\s]*(?:Hora[:\s]+(\d{1,2}:\d{2}))?[,\s]*(?:(?:Obs|Observa(?:ções|ção))[:\s]+(.+))?/i;
    let match = cleanText.match(pattern1);
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
    
    // PADRÃO 2: Natural
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
    
    // PADRÃO 3: Simples
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
        console.log('Enviando para Laravel:', JSON.stringify(payload, null, 2));
        const response = await axios.post(LARAVEL_ENDPOINT, payload, {
            headers: { 'Content-Type': 'application/json' }, timeout: 10000
        });
        console.log('Resposta do Laravel:', response.data);
        return response.data;
    } catch (error) {
        console.error('Erro ao enviar para Laravel:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status, 'Data:', error.response.data);
        }
        throw error;
    }
}

async function connectToWhatsApp() {
    ensureAuthDirExists();
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();
    console.log(`Usando Baileys v${version.join('.')}`);
    
    const sock = makeWASocket({
        version, auth: state,
        browser: ['SistemaPedidos', 'Chrome', '1.0.0'],
        shouldReconnect: () => true, maxMsgRetryCount: 3
    });
    
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) console.log('QR Code gerado. Escaneie com o WhatsApp.');
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log('Conexão fechada. Reconectando...');
                setTimeout(() => connectToWhatsApp(), RECONNECT_DELAY);
            } else {
                console.log('Desconectado. Reinicie o script.');
            }
        } else if (connection === 'open') {
            console.log('Conectado ao WhatsApp!');
        }
    });
    
    sock.ev.on('messages.upsert', async (m) => {
        try {
            const message = m.messages[0];
            if (message.key.fromMe || m.type !== 'notify') return;
            
            let text = message.message.conversation || 
                      message.message.extendedTextMessage?.text || 
                      '';
            text = text.trim();
            if (!text) return;
            
            console.log('Mensagem de:', message.key.remoteJid);
            console.log('Texto:', text);
            
            const hasTrigger = TRIGGERS.some(t => text.includes(t));
            if (!hasTrigger) {
                console.log('Sem gatilho, ignorando.');
                return;
            }
            
            const orderData = extractOrderData(text);
            if (!orderData || !orderData.produto || !orderData.data_entrega) {
                await sock.sendMessage(message.key.remoteJid, {
                    text: 'Formato inválido. Use: *Produto, Qtd, Tamanho, Data, Hora*\nEx: "Bolo de Chocolate, 1, G, 25/08/2026, 14:00 🎂✅"'
                });
                return;
            }
            
            if (!orderData.cliente) {
                orderData.cliente = extractClientName(message);
            }
            const phone = formatPhoneNumber(message.key.remoteJid);
            
            try {
                await sendToLaravel(orderData, phone, text);
                await sock.sendMessage(message.key.remoteJid, {
                    text: formatConfirmationMessage(orderData)
                });
                console.log('Pedido processado!');
            } catch (error) {
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

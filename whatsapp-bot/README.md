# WhatsApp Bot - Sistema de Pedidos

Bot WhatsApp para receber pedidos e enviar para o backend Laravel do **Sistema de Pedidos com Agenda Integrada**.

Usa a biblioteca [Baileys](https://github.com/adiwajshing/Baileys) para conexão com o WhatsApp Web.

## 🚀 Início Rápido

### Pré-requisitos
- Node.js >= 18.0.0
- npm ou yarn
- Laravel backend rodando (na porta 8000 ou configurada)

### Instalação

1. **Clonar ou navegar até o diretório:**
   ```bash
   cd whatsapp-bot
   ```

2. **Instalar dependências:**
   ```bash
   npm install
   ```

3. **Configurar variáveis de ambiente (opcional):**
   ```bash
   # Copiar .env.example se existir
   cp .env.example .env
   
   # Ou configurar diretamente
   export LARAVEL_ENDPOINT=http://localhost:8000/api/whatsapp/webhook
   ```

4. **Iniciar o bot:**
   ```bash
   npm start
   ```

5. **Para desenvolvimento (com hot reload):**
   ```bash
   npm run dev
   ```

## 📝 Configuração

### Variáveis de Ambiente

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `LARAVEL_ENDPOINT` | URL do endpoint Laravel | `http://localhost:8000/api/whatsapp/webhook` |

### Configurar no código

Edite o arquivo `index.js` e modifique:
```javascript
const LARAVEL_ENDPOINT = process.env.LARAVEL_ENDPOINT || 'http://localhost:8000/api/whatsapp/webhook';
```

### Gatilhos

Os gatilhos padrão são:
- `🎂✅` - Emoji de bolo + check
- `/confirmar` - Comando texto
- `/pedido` - Comando texto

Para modificar, edite no `index.js`:
```javascript
const TRIGGERS = ['🎂✅', '/confirmar', '/pedido'];
```

## 💬 Formatos de Mensagem Aceitos

### Formato 1: Estruturado com campos nomeados
```
Produto: Bolo de Chocolate, Qtd: 2, Tamanho: G, Data: 25/08/2026, Hora: 14:00, Obs: Sem glúten 🎂✅
```

### Formato 2: Natural
```
Maria, 1 Bolo de Chocolate tamanho G, entrega 25/08/2026 às 14:00, Obs: Sem glúten 🎂✅
```

### Formato 3: Simples separados por vírgula
```
Bolo de Chocolate, 2, G, 25/08/2026, 14:00, Obs: Tema: Aniversário 🎂✅
```

### Formato 4: Mínimo (apenas produto e data)
```
Bolo de Chocolate, 25/08/2026 🎂✅
```

## 📡 Endpoint Laravel

O bot envia dados no formato JSON para o endpoint configurado:

```json
{
  "phone": "5511999999999",
  "message": "Mensagem original",
  "cliente": "Maria",
  "produto": "Bolo de Chocolate",
  "quantidade": 1,
  "tamanho": "G",
  "data_entrega": "25/08/2026",
  "hora_entrega": "14:00",
  "observacoes": "Sem glúten"
}
```

## ✅ Respostas do Bot

### Sucesso
```
✅ Pedido registrado!
Cliente: Maria
Produto: Bolo de Chocolate (G)
Quantidade: 1
Entrega: 25/08/2026 às 14:00
Observações: Sem glúten
```

### Formato inválido
```
❌ Formato inválido. Use: *Produto, Quantidade, Tamanho, Data, Hora, Observações*

Exemplo: "Bolo de Chocolate, 1, G, 25/08/2026, 14:00, Obs: Sem glúten. 🎂✅"
```

### Erro no servidor
```
❌ Erro ao registrar pedido. Tente novamente.
```

## 🔄 Autenticação

### Primeira vez
1. Execute `npm start`
2. Um QR Code será exibido no terminal
3. Escaneie com o WhatsApp no seu celular
4. O estado de autenticação será salvo em `auth/auth_info.json`

### Vezes subsequentes
- O bot carregará automaticamente o estado salvo
- Não será necessário escanear o QR Code novamente

### Deslogar
- Delete o arquivo `auth/auth_info.json`
- Ou delete o diretório `auth/`

## 🔌 Reconexão Automática

O bot reconecta automaticamente em caso de:
- Queda de conexão com a internet
- Erro temporário no WhatsApp
- Timeout

**Tempo de reconexão:** 5 segundos (configurável no código)

## 📦 Dependências

- [`@adiwajshing/baileys`](https://github.com/adiwajshing/Baileys) - Biblioteca WhatsApp Web
- [`@hapi/boom`](https://github.com/hapijs/boom) - Tratamento de erros HTTP
- [`axios`](https://github.com/axios/axios) - Requisições HTTP

## 🛠️ Desenvolvimento

### Estrutura do Projeto
```
whatsapp-bot/
├── index.js          # Código principal do bot
├── package.json      # Dependências e scripts
├── README.md         # Este arquivo
└── auth/            # Estado de autenticação (gerado automaticamente)
    └── auth_info.json
```

### Funções Principais

| Função | Descrição |
|--------|-----------|
| `connectToWhatsApp()` | Conecta ao WhatsApp e configura listeners |
| `extractOrderData(text)` | Extrai dados do pedido da mensagem |
| `formatPhoneNumber(jid)` | Formata número de telefone |
| `sendToLaravel(data)` | Envia dados para o backend Laravel |
| `formatConfirmationMessage(data)` | Formata mensagem de confirmação |

## 🐛 Solução de Problemas

### "QR Code não aparece"
- Verifique se o terminal suporta emoji
- Tente usar um terminal diferente (ex: Terminal do VS Code)
- Verifique se a conexão com a internet está ativa

### "Conexão fechada"
- Verifique se o WhatsApp no celular está conectado
- Tente reiniciar o bot
- Delete `auth/auth_info.json` e escaneie o QR Code novamente

### "Erro ao enviar para Laravel"
- Verifique se o endpoint está correto
- Verifique se o Laravel está rodando
- Verifique o log do Laravel para erros
- Teste a API manualmente:
  ```bash
  curl -X POST http://localhost:8000/api/whatsapp/webhook \
    -H "Content-Type: application/json" \
    -d '{"phone": "5511999999999", "message": "teste"}'
  ```

### "Formato inválido mesmo com mensagem correta"
- Verifique os exemplos de formatos aceitos
- Teste com mensagens mais simples primeiro
- Adicione `console.log` no código para depurar

## 📊 Monitoramento

### Logs no console
O bot exibe logs detalhados:
- Conexão/Desconexão
- Mensagens recebidas
- Dados extraídos
- Erros

### Exemplo de log
```
🚀 Usando Baileys v6.7.0
📱 QR Code gerado. Escaneie com o WhatsApp.
✅ Conectado ao WhatsApp com sucesso!
💬 Mensagem recebida de: 5511999999999@s.whatsapp.net
   Texto: Bolo de Chocolate, 1, G, 25/08/2026, 14:00 🎂✅
   ✅ Gatilho identificado!
   📋 Dados extraídos: {
     "cliente": "Cliente não identificado",
     "produto": "Bolo de Chocolate",
     "quantidade": 1,
     "tamanho": "G",
     "data_entrega": "25/08/2026",
     "hora_entrega": "14:00"
   }
📤 Enviando dados para Laravel: {...}
✅ Resposta do Laravel: { status: 'Processando...' }
   ✅ Pedido processado e confirmação enviada!
```

## 🎯 Personalização

### Adicionar novos gatilhos
```javascript
const TRIGGERS = ['🎂✅', '/confirmar', '/pedido', '/novo-gatilho'];
```

### Modificar formato de data
```javascript
// No momento, aceita DD/MM/AAAA
// Para aceitar outros formatos, modifique isValidDate()
```

### Adicionar novos campos
1. Adicione o campo no objeto `orderData` em `extractOrderData()`
2. Adicione a extração com regex
3. Inclua no payload para Laravel em `sendToLaravel()`
4. Inclua na mensagem de confirmação em `formatConfirmationMessage()`

## 🔒 Segurança

- **Autenticação**: O estado é salvo localmente
- **Privacidade**: O bot só lê mensagens com gatilhos
- **Tratamento de erros**: Erros são capturados e logados
- **Reconexão**: Automática e segura

## 📄 Licença

MIT - Sinta-se à vontade para usar, modificar e distribuir.

## 🤝 Contribuindo

1. Fork o repositório
2. Crie uma branch (`git checkout -b feature/nova-funcionalidade`)
3. Commit suas mudanças (`git commit -am 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

## 📞 Suporte

Para dúvidas ou problemas:
- Verifique a documentação
- Consulte os logs
- Teste com mensagens simples
- Verifique o endpoint Laravel

---

**Desenvolvido para o Sistema de Pedidos com Agenda Integrada via WhatsApp**

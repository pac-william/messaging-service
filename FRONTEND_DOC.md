# Documentação - Integração Frontend com Serviço de Mensageria

## Visão Geral

O serviço de mensageria roda na porta **4000** e utiliza Socket.IO para comunicação em tempo real. O sistema implementa **chats únicos 1-para-1** entre cliente e lojista, garantindo que cada conversa tenha apenas 2 participantes.

## Instalação

### 1. Instalar Socket.IO Client

```bash
npm install socket.io-client
# ou
yarn add socket.io-client
# ou
bun add socket.io-client
```

## Configuração Básica

### URL do Servidor

```javascript
const MESSAGING_SERVER_URL = "http://localhost:4000";
```

## Tipos de Usuário

O sistema suporta dois tipos de usuários:
- **Cliente**: Usuário que acessa o market e inicia conversas
- **Lojista**: Proprietário do market que responde às conversas

## Fluxo de Conexão

### Para Clientes

#### 1. Extrair ID do Market da URL

Se o usuário está em `http://localhost:3000/market/68ff9164dd3be7a91f56cf86`, extraia o ID:

```javascript
function getMarketIdFromURL() {
  const path = window.location.pathname;
  const match = path.match(/\/market\/([^\/]+)/);
  return match ? match[1] : null; // Retorna: "68ff9164dd3be7a91f56cf86"
}
```

#### 2. Conectar ao Servidor

```javascript
import { io } from "socket.io-client";

const socket = io(MESSAGING_SERVER_URL, {
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});
```

#### 3. Registrar como Cliente

```javascript
socket.on("connect", () => {
  socket.emit("cliente:join", { username: "Nome do Cliente" });
});
```

#### 4. Entrar no Chat do Market

Após ser registrado, entre no chat do market:

```javascript
socket.on("cliente:joined", (data) => {
  const marketId = getMarketIdFromURL();
  socket.emit("chat:join-market", { marketId: marketId });
});
```

### Para Lojistas

#### 1. Conectar ao Servidor

```javascript
const socket = io(MESSAGING_SERVER_URL);
```

#### 2. Registrar como Lojista

```javascript
socket.on("connect", () => {
  socket.emit("lojista:register", { 
    username: "Nome do Lojista",
    marketId: "68ff9164dd3be7a91f56cf86" // ID do seu market
  });
});
```

## Eventos do Cliente (Emitir)

### `cliente:join`
Registra um cliente no servidor.

```javascript
socket.emit("cliente:join", { 
  username: "Nome do Cliente" 
});
```

### `lojista:register`
Registra um lojista no servidor.

```javascript
socket.emit("lojista:register", { 
  username: "Nome do Lojista",
  marketId: "68ff9164dd3be7a91f56cf86"
});
```

### `chat:join-market`
Cliente entra no chat do market (cria sala privada 1-para-1).

```javascript
socket.emit("chat:join-market", { 
  marketId: "68ff9164dd3be7a91f56cf86" 
});
```

### `chat:leave`
Sai do chat atual.

```javascript
socket.emit("chat:leave");
```

### `chat:send-message`
Envia uma mensagem no chat atual.

```javascript
socket.emit("chat:send-message", {
  message: "Olá, mundo!"
});
```

### `lojista:conversas`
Lojista lista todas as suas conversas ativas.

```javascript
socket.emit("lojista:conversas");
```

## Eventos do Servidor (Escutar)

### `connect`
Conexão estabelecida.

```javascript
socket.on("connect", () => {
  console.log("Conectado:", socket.id);
});
```

### `cliente:joined`
Confirmação de registro do cliente.

```javascript
socket.on("cliente:joined", (data) => {
  // data: { userId: string, username: string }
  console.log("Cliente registrado:", data);
});
```

### `lojista:registered`
Confirmação de registro do lojista.

```javascript
socket.on("lojista:registered", (data) => {
  // data: { userId: string, username: string, marketId: string }
  console.log("Lojista registrado:", data);
});
```

### `chat:joined`
Confirmação de entrada no chat (cliente).

```javascript
socket.on("chat:joined", (data) => {
  // data: { roomId: string, marketId: string, lojistaUsername: string }
  console.log("Entrou no chat:", data);
});
```

### `chat:cliente-entered`
Notifica o lojista que um cliente entrou no chat.

```javascript
socket.on("chat:cliente-entered", (data) => {
  // data: { clienteId: string, clienteUsername: string, roomId: string }
  console.log(`${data.clienteUsername} entrou no chat`);
});
```

### `chat:messages`
Recebe o histórico de mensagens ao entrar no chat.

```javascript
socket.on("chat:messages", (messages) => {
  // messages: Array<Message>
  // Message: { id, room, username, message, timestamp }
  messages.forEach(msg => {
    console.log(`${msg.username}: ${msg.message}`);
  });
});
```

### `chat:message-received`
Recebe uma nova mensagem.

```javascript
socket.on("chat:message-received", (message) => {
  // message: { id, room, username, message, timestamp }
  console.log(`${message.username}: ${message.message}`);
  // Atualize sua UI aqui
});
```

### `chat:user-left`
Notifica quando um usuário sai do chat.

```javascript
socket.on("chat:user-left", (data) => {
  // data: { username: string, roomId: string }
  console.log(`${data.username} saiu do chat`);
});
```

### `chat:user-disconnected`
Notifica quando um usuário desconecta.

```javascript
socket.on("chat:user-disconnected", (data) => {
  // data: { username: string, roomId: string }
  console.log(`${data.username} desconectou`);
});
```

### `lojista:conversas`
Lista de conversas do lojista.

```javascript
socket.on("lojista:conversas", (conversas) => {
  // conversas: Array<{
  //   roomId: string,
  //   clienteId: string,
  //   clienteUsername: string,
  //   isActive: boolean,
  //   lastMessage: { message: string, timestamp: Date } | null
  // }>
  console.log("Conversas:", conversas);
});
```

### `error`
Erros do servidor.

```javascript
socket.on("error", (error) => {
  // error: { message: string }
  console.error("Erro:", error.message);
});
```

### `disconnect`
Desconexão do servidor.

```javascript
socket.on("disconnect", () => {
  console.log("Desconectado do servidor");
});
```

## Exemplo Completo - Cliente

```javascript
import { io } from "socket.io-client";

const MESSAGING_SERVER_URL = "http://localhost:4000";

// Extrair ID do market da URL
function getMarketIdFromURL() {
  const path = window.location.pathname;
  const match = path.match(/\/market\/([^\/]+)/);
  return match ? match[1] : null;
}

// Conectar
const socket = io(MESSAGING_SERVER_URL);

socket.on("connect", () => {
  // 1. Registrar como cliente
  socket.emit("cliente:join", { username: "João Silva" });
});

socket.on("cliente:joined", () => {
  // 2. Entrar no chat do market
  const marketId = getMarketIdFromURL();
  socket.emit("chat:join-market", { marketId: marketId });
});

socket.on("chat:joined", (data) => {
  console.log(`Conectado ao chat com ${data.lojistaUsername}`);
});

// Receber histórico de mensagens
socket.on("chat:messages", (messages) => {
  messages.forEach(msg => {
    console.log(`${msg.username}: ${msg.message}`);
  });
});

// Receber novas mensagens
socket.on("chat:message-received", (message) => {
  console.log(`${message.username}: ${message.message}`);
});

// Enviar mensagem
function sendMessage(text) {
  socket.emit("chat:send-message", {
    message: text
  });
}

// Desconectar ao sair
window.addEventListener("beforeunload", () => {
  socket.emit("chat:leave");
  socket.disconnect();
});
```

## Exemplo Completo - Lojista

```javascript
import { io } from "socket.io-client";

const MESSAGING_SERVER_URL = "http://localhost:4000";

const socket = io(MESSAGING_SERVER_URL);

socket.on("connect", () => {
  // Registrar como lojista
  socket.emit("lojista:register", {
    username: "Maria Santos",
    marketId: "68ff9164dd3be7a91f56cf86"
  });
});

socket.on("lojista:registered", (data) => {
  console.log("Lojista registrado:", data);
});

// Notificação quando cliente entra
socket.on("chat:cliente-entered", (data) => {
  console.log(`${data.clienteUsername} entrou no chat`);
  // Carregar mensagens deste chat se necessário
});

// Receber mensagens
socket.on("chat:message-received", (message) => {
  console.log(`${message.username}: ${message.message}`);
});

// Enviar mensagem
function sendMessage(text) {
  socket.emit("chat:send-message", {
    message: text
  });
}

// Listar conversas
function listarConversas() {
  socket.emit("lojista:conversas");
}

socket.on("lojista:conversas", (conversas) => {
  conversas.forEach(conv => {
    console.log(`Chat com ${conv.clienteUsername}: ${conv.lastMessage?.message || "Sem mensagens"}`);
  });
});
```

## Estrutura de Dados

### Message
```typescript
interface Message {
  id: string;
  room: string;
  username: string;
  message: string;
  timestamp: Date;
}
```

### Conversa (para lojista)
```typescript
interface Conversa {
  roomId: string;
  clienteId: string;
  clienteUsername: string;
  isActive: boolean;
  lastMessage: {
    message: string;
    timestamp: Date;
  } | null;
}
```

## Convenção de Nomes de Salas

As salas seguem o padrão: `{userId}-{marketId}`

Exemplo:
- User ID (Cliente): `abc123`
- Market ID: `68ff9164dd3be7a91f56cf86`
- Room ID: `abc123-68ff9164dd3be7a91f56cf86`

**Importante**: Cada sala é única e contém apenas 2 participantes (1 cliente + 1 lojista). O formato garante que cada combinação de usuário e market tenha uma sala exclusiva.

## Características do Sistema

1. **Chats Únicos**: Cada conversa é exclusiva entre um cliente e um lojista
2. **Máximo 2 Participantes**: O sistema garante que cada sala tenha no máximo 2 pessoas
3. **Histórico Persistente**: Mensagens são armazenadas por sala
4. **Notificações em Tempo Real**: Cliente e lojista são notificados de eventos

## Notas Importantes

1. **Ordem de Operações (Cliente)**:
   - Conectar → `cliente:join` → `chat:join-market`

2. **Ordem de Operações (Lojista)**:
   - Conectar → `lojista:register`

3. **Sala Automática**: Quando um cliente entra no chat do market, o lojista é automaticamente adicionado à sala

4. **Reconexão**: O Socket.IO client reconecta automaticamente. Reconfigure os listeners se necessário.

5. **Limpeza**: Sempre desconecte e saia do chat ao desmontar componentes ou fechar a página.

6. **CORS**: O servidor está configurado para aceitar conexões de qualquer origem (`*`). Em produção, configure adequadamente.

7. **Porta**: O servidor roda na porta **4000** por padrão. Certifique-se de que está acessível.

8. **Validação**: O servidor valida que cada sala tenha no máximo 2 participantes

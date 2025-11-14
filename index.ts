import { createServer } from "http";
import { Server } from "socket.io";

type UserType = "cliente" | "lojista";

interface User {
  id: string;
  username: string;
  socketId: string;
  type: UserType;
  marketId?: string; // ID do market (para lojistas)
  clienteId?: string; // ID do cliente (para identificar o chat)
}

interface ChatMessage {
  id: string;
  chat: string;
  username: string;
  message: string;
  timestamp: Date;
}

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const users = new Map<string, User>();
const messages = new Map<string, ChatMessage[]>();
const userChats = new Map<string, string>(); // Map of socketId -> chatId (user's current chat)

io.on("connection", (socket) => {
  console.log(`Cliente conectado: ${socket.id}`);

  // Lojista se registra
  socket.on("lojista:register", (data: { username: string; marketId: string }) => {
    const user: User = {
      id: socket.id,
      username: data.username,
      socketId: socket.id,
      type: "lojista",
      marketId: data.marketId
    };
    
    users.set(socket.id, user);
    socket.emit("lojista:registered", { 
      userId: socket.id, 
      username: data.username,
      marketId: data.marketId
    });
    
    console.log(`Lojista ${data.username} (${data.marketId}) registrado: ${socket.id}`);
  });

  // Cliente se conecta
  socket.on("cliente:join", (data: { username: string }) => {
    const user: User = {
      id: socket.id,
      username: data.username,
      socketId: socket.id,
      type: "cliente"
    };
    
    users.set(socket.id, user);
    socket.emit("cliente:joined", { userId: socket.id, username: data.username });
    
    console.log(`Cliente ${data.username} (${socket.id}) conectado`);
  });

  // Cliente entra no chat do market (cria/entra em chat privado)
  socket.on("chat:join-market", (data: { marketId: string; userId?: string }) => {
    const cliente = users.get(socket.id);
    
    if (!cliente || cliente.type !== "cliente") {
      socket.emit("error", { message: "Apenas clientes podem entrar no chat do market" });
      return;
    }

    // Busca o lojista do market
    const lojista = Array.from(users.values()).find(
      u => u.type === "lojista" && u.marketId === data.marketId
    );

    if (!lojista) {
      socket.emit("error", { message: "Lojista não encontrado ou offline" });
      return;
    }

    // Cria chat único para este cliente e lojista
    // Formato: {userId}-{marketId}
    // Usa userId fornecido (backendUserId) se disponível, caso contrário usa socket.id
    const userId = data.userId || cliente.id;
    const chatId = `${userId}-${data.marketId}`;
    
    // Remove cliente de qualquer chat anterior
    const previousChat = userChats.get(socket.id);
    if (previousChat) {
      socket.leave(previousChat);
    }
    
    // Cliente entra no chat
    socket.join(chatId);
    userChats.set(socket.id, chatId);
    cliente.clienteId = userId; // Armazena o userId do backend

    // Lojista também entra no chat (se ainda não estiver)
    const lojistaSocket = io.sockets.sockets.get(lojista.socketId);
    if (lojistaSocket) {
      const lojistaPreviousChat = userChats.get(lojista.socketId);
      if (lojistaPreviousChat && lojistaPreviousChat !== chatId) {
        lojistaSocket.leave(lojistaPreviousChat);
      }
      lojistaSocket.join(chatId);
      userChats.set(lojista.socketId, chatId);
    }

    // Envia histórico de mensagens do chat
    const chatMessages = messages.get(chatId) || [];
    socket.emit("chat:messages", chatMessages);

    // NÃO notifica o lojista quando cliente entra no chat
    // O lojista só será notificado quando receber uma mensagem

    socket.emit("chat:joined", {
      chatId: chatId,
      marketId: data.marketId,
      lojistaUsername: lojista.username
    });
    
    console.log(`Cliente ${cliente.username} entrou no chat do market ${data.marketId} (chat: ${chatId})`);
  });

  // Lojista entra em um chat específico (para visualizar/responder conversa)
  socket.on("lojista:join-chat", (data: { chatId: string }) => {
    const lojista = users.get(socket.id);
    
    if (!lojista || lojista.type !== "lojista" || !lojista.marketId) {
      socket.emit("error", { message: "Apenas lojistas podem entrar em chats" });
      return;
    }

    const chatId = data.chatId;
    
    // Verifica se o chatId pertence a este lojista (termina com o marketId)
    if (!chatId.endsWith(`-${lojista.marketId}`)) {
      socket.emit("error", { message: "Chat não pertence a este lojista" });
      return;
    }

    // Remove de qualquer chat anterior
    const previousChat = userChats.get(socket.id);
    if (previousChat) {
      socket.leave(previousChat);
    }

    // Entra no chat
    socket.join(chatId);
    userChats.set(socket.id, chatId);

    // Envia histórico de mensagens do chat
    const chatMessages = messages.get(chatId) || [];
    socket.emit("chat:messages", chatMessages);

    console.log(`Lojista ${lojista.username} entrou no chat ${chatId}`);
  });

  // Sair do chat
  socket.on("chat:leave", () => {
    const user = users.get(socket.id);
    const chatId = userChats.get(socket.id);
    
    if (!user || !chatId) {
      return;
    }

    socket.leave(chatId);
    userChats.delete(socket.id);

    // Notifica o outro participante
    socket.to(chatId).emit("chat:user-left", {
      username: user.username,
      chatId: chatId
    });
    
    console.log(`${user.type} ${user.username} saiu do chat ${chatId}`);
  });

  // Enviar mensagem no chat
  socket.on("chat:send-message", (data: { message: string }) => {
    const user = users.get(socket.id);
    
    if (!user) {
      socket.emit("error", { message: "Usuário não autenticado" });
      return;
    }

    const chatId = userChats.get(socket.id);
    
    if (!chatId) {
      socket.emit("error", { message: "Você não está em nenhum chat" });
      return;
    }

    // Verifica se o chat tem no máximo 2 pessoas (cliente + lojista)
    const chat = io.sockets.adapter.rooms.get(chatId);
    if (!chat) {
      socket.emit("error", { message: "Chat não encontrado" });
      return;
    }
    
    if (chat.size > 2) {
      socket.emit("error", { message: "Chat inválido: mais de 2 participantes" });
      return;
    }

    const message: ChatMessage = {
      id: `${Date.now()}-${Math.random()}`,
      chat: chatId,
      username: user.username,
      message: data.message,
      timestamp: new Date()
    };

    // Armazena a mensagem
    if (!messages.has(chatId)) {
      messages.set(chatId, []);
    }
    messages.get(chatId)!.push(message);

    // Log para debug
    console.log(`[MENSAGEM] Usuário: ${user.username} (${user.type}), ChatId: ${chatId}, Participantes no chat: ${chat.size}`);
    console.log(`[MENSAGEM] Enviando para todos no chat ${chatId}:`, message);

    // Envia para todos os participantes do chat (cliente e lojista)
    io.to(chatId).emit("chat:message-received", message);
    
    // Log para verificar se a mensagem foi enviada
    const socketsInChat = Array.from(chat);
    console.log(`[MENSAGEM] Sockets no chat ${chatId}:`, socketsInChat);
  });

  // Lojista lista suas conversas ativas
  socket.on("lojista:conversas", () => {
    const lojista = users.get(socket.id);
    
    if (!lojista || lojista.type !== "lojista" || !lojista.marketId) {
      socket.emit("error", { message: "Apenas lojistas podem listar conversas" });
      return;
    }

    // Busca todos os chats deste lojista
    // Formato do chatId: {userId}-{marketId}
    const conversas = Array.from(messages.keys())
      .filter(chatId => {
        // Verifica se o chatId termina com o marketId (formato: {userId}-{marketId})
        return chatId.endsWith(`-${lojista.marketId}`);
      })
      .map(chatId => {
        // Extrai o userId do chatId (formato: {userId}-{marketId})
        // Remove o marketId do final para obter o userId
        const clienteId = chatId.replace(`-${lojista.marketId}`, '');
        const cliente = Array.from(users.values()).find(u => u.id === clienteId);
        const chatMessages = messages.get(chatId) || [];
        const lastMessage = chatMessages.length > 0 ? chatMessages[chatMessages.length - 1] : null;
        const chat = io.sockets.adapter.rooms.get(chatId);
        const isActive = chat && chat.size > 0;
        
        return {
          chatId,
          clienteId,
          clienteUsername: cliente?.username || "Desconhecido",
          isActive,
          lastMessage: lastMessage ? {
            message: lastMessage.message,
            timestamp: lastMessage.timestamp
          } : null
        };
      });

    socket.emit("lojista:conversas", conversas);
  });

  // Cliente lista suas conversas ativas
  socket.on("cliente:conversas", () => {
    const cliente = users.get(socket.id);
    
    if (!cliente || cliente.type !== "cliente") {
      socket.emit("error", { message: "Apenas clientes podem listar conversas" });
      return;
    }

    // Busca todos os chats deste cliente que têm mensagens
    // Formato do chatId: {userId}-{marketId}
    const conversas = Array.from(messages.keys())
      .filter(chatId => {
        // Verifica se o chatId começa com o userId do cliente (formato: {userId}-{marketId})
        const chatMessages = messages.get(chatId) || [];
        // Apenas chats com mensagens
        return chatId.startsWith(`${cliente.id}-`) && chatMessages.length > 0;
      })
      .map(chatId => {
        // Extrai o marketId do chatId (formato: {userId}-{marketId})
        const marketId = chatId.replace(`${cliente.id}-`, '');
        // Busca o lojista deste market
        const lojista = Array.from(users.values()).find(
          u => u.type === "lojista" && u.marketId === marketId
        );
        const chatMessages = messages.get(chatId) || [];
        const lastMessage = chatMessages.length > 0 ? chatMessages[chatMessages.length - 1] : null;
        const chat = io.sockets.adapter.rooms.get(chatId);
        const isActive = chat && chat.size > 0;
        
        return {
          chatId,
          marketId,
          lojistaUsername: lojista?.username || "Lojista",
          isActive,
          lastMessage: lastMessage ? {
            message: lastMessage.message,
            timestamp: lastMessage.timestamp
          } : null
        };
      });

    socket.emit("cliente:conversas", conversas);
  });

  // Desconexão
  socket.on("disconnect", () => {
    const user = users.get(socket.id);
    const chatId = userChats.get(socket.id);
    
    if (user) {
      users.delete(socket.id);
      userChats.delete(socket.id);
      
      // Se estava em um chat, notifica o outro participante
      if (chatId) {
        socket.to(chatId).emit("chat:user-disconnected", {
          username: user.username,
          chatId: chatId
        });
      }
      
      console.log(`${user.type} ${user.username} (${socket.id}) desconectado`);
    }
  });
});

const PORT = process.env.PORT || 4000;

httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor de mensageria rodando na porta ${PORT}`);
  console.log(`📡 Socket.IO pronto para conexões`);
});

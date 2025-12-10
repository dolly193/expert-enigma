const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const bcrypt = require('bcryptjs');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

// --- Bloco de Verificação de Variáveis de Ambiente ---
console.log("--- Verificando Variáveis de Ambiente na Inicialização ---");
console.log("NODE_ENV:", process.env.NODE_ENV || 'development (padrão)');
console.log("PORT:", process.env.PORT || '5000 (padrão)');
console.log("DATABASE_URL:", process.env.DATABASE_URL ? 'Definida' : '*** NÃO DEFINIDA ***');
console.log("FRONTEND_URL:", process.env.FRONTEND_URL);
console.log("RENDER_EXTERNAL_URL:", process.env.RENDER_EXTERNAL_URL || 'Não aplicável (local)');
console.log("JWT_SECRET:", process.env.JWT_SECRET ? 'Definido' : '*** NÃO DEFINIDO ***');
console.log("\n--- Configurações de E-mail (Nodemailer) ---");
console.log("SMTP_HOST:", process.env.SMTP_HOST);
console.log("SMTP_PORT:", process.env.SMTP_PORT);
console.log("SMTP_USER:", process.env.SMTP_USER);
console.log("SMTP_PASS:", process.env.SMTP_PASS ? 'Definida' : '*** NÃO DEFINIDA ***');
console.log("SMTP_FROM_NAME:", process.env.SMTP_FROM_NAME);
console.log("SMTP_FROM_EMAIL:", process.env.SMTP_FROM_EMAIL);
console.log("\n--- Configurações de Pagamento (Efí) ---");
const isProduction = process.env.NODE_ENV === 'production';
console.log(`Modo Efí: ${isProduction ? 'Produção' : 'Homologação (Sandbox)'}`);
console.log("EFI_CERTIFICATE_PATH:", process.env.EFI_CERTIFICATE_PATH ? 'Definido' : '*** NÃO DEFINIDO ***');
console.log("EFI_PIX_KEY:", process.env.EFI_PIX_KEY ? 'Definida' : '*** NÃO DEFINIDA ***');
if (isProduction) {
    console.log("EFI_PROD_CLIENT_ID:", process.env.EFI_PROD_CLIENT_ID ? 'Definido' : '*** NÃO DEFINIDO ***');
    console.log("EFI_PROD_CLIENT_SECRET:", process.env.EFI_PROD_CLIENT_SECRET ? 'Definido' : '*** NÃO DEFINIDO ***');
} else {
    console.log("EFI_HOMOLOG_CLIENT_ID:", process.env.EFI_HOMOLOG_CLIENT_ID ? 'Definido' : '*** NÃO DEFINIDO ***');
    console.log("EFI_HOMOLOG_CLIENT_SECRET:", process.env.EFI_HOMOLOG_CLIENT_SECRET ? 'Definido' : '*** NÃO DEFINIDO ***');
}
console.log("\n-------------------------------------------------------\n");

const jwt = require('jsonwebtoken');

// Integração com a API da Efí
const { EfiPay } = require('./efiPay.service');

// --- Configuração do Servidor ---
const app = express();
const server = http.createServer(app); // Criamos um servidor HTTP a partir do app Express
const wss = new WebSocketServer({ server }); // Anexamos o WebSocket Server ao servidor HTTP

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL,
        },
    },
});
const PORT = process.env.PORT || 5000;

// Mapa para armazenar conexões WebSocket por orderId
const chatConnections = new Map();


// --- Configuração do Middleware ---
app.use(express.json());

// Servir arquivos estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Configuração de CORS para Produção
const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      process.env.FRONTEND_URL, // URL principal definida no .env
      'http://localhost:5000',  // Para desenvolvimento local
      'http://127.0.0.1:5000'
    ];

    if (process.env.RENDER_EXTERNAL_URL) {
      allowedOrigins.push(process.env.RENDER_EXTERNAL_URL);
    }

    if (!origin || allowedOrigins.some(o => o && origin.startsWith(o))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
};
app.use(cors(corsOptions));

// --- Middleware de Autenticação ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (token == null) return res.sendStatus(401); // Não enviou o token

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403); // Token inválido ou expirado
        req.user = user;
        next();
    });
};

const isAdmin = async (req, res, next) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (user && user.role === 'ADMIN') {
        next();
    } else {
        res.status(403).json({ message: "Acesso negado. Rota exclusiva para administradores." });
    }
};

// --- Conteúdo HTML embutido no código ---

const LOJA_HTML = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gamer Store</title> 
    <link rel="stylesheet" href="/style.css">
</head>
<body>
    <header>
        <nav>
            <h1><a href="/loja.html">Gamer Store</a></h1>
            <div id="nav-links"></div>
        </nav>
    </header>
    <main>
        <h2>Nossos Produtos</h2>
        <div id="product-list" class="product-grid">
            <p>Carregando produtos...</p>
        </div>
    </main>
    <footer>
        <p>&copy; 2025 Gamer Store. Todos os direitos reservados.</p>
    </footer>
    <div id="purchase-modal" class="modal" style="display:none;">
        <div class="modal-content">
            <span class="close-button">&times;</span>
            <h2>Finalizar Compra</h2>
            <div id="modal-body"></div>
        </div>
    </div>
    <script src="/script.js"></script>
</body>
</html>
`;

const LOGIN_HTML = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login - Gamer Store</title> 
    <link rel="stylesheet" href="/style.css">
</head>
<body>
    <header>
        <nav>
            <h1><a href="/loja.html">Gamer Store</a></h1>
        </nav>
    </header>
    <main class="auth-container">
        <h2>Login</h2>
        <form id="login-form">
            <input type="email" id="email" placeholder="Seu E-mail" required>
            <input type="password" id="password" placeholder="Sua Senha" required>
            <button type="submit">Entrar</button>
        </form>
        <p>Não tem uma conta? <a href="/register.html">Registre-se</a></p>
        <div id="error-message" class="error"></div>
    </main>
    <footer>
        <p>&copy; 2025 Gamer Store. Todos os direitos reservados.</p>
    </footer>
    <script src="/script.js"></script>
</body>
</html>
`;

const REGISTER_HTML = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Registro - Gamer Store</title> 
    <link rel="stylesheet" href="/style.css">
</head>
<body>
    <header>
        <nav>
            <h1><a href="/loja.html">Gamer Store</a></h1>
        </nav>
    </header>
    <main class="auth-container">
        <h2>Criar Conta</h2>
        <form id="register-form">
            <input type="text" id="username" placeholder="Nome de Usuário" required>
            <input type="email" id="email" placeholder="Seu E-mail" required>
            <input type="password" id="password" placeholder="Crie uma Senha" required>
            <button type="submit">Registrar</button>
        </form>
        <p>Já tem uma conta? <a href="/login.html">Faça login</a></p>
        <div id="message" class="message"></div>
    </main>
    <footer>
        <p>&copy; 2025 Gamer Store. Todos os direitos reservados.</p>
    </footer>
    <script src="/script.js"></script>
</body>
</html>
`;

const ADMIN_HTML = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Painel Admin - Gamer Store</title> 
    <link rel="stylesheet" href="/style.css">
</head>
<body>
    <header>
        <nav>
            <h1><a href="/loja.html">Gamer Store</a></h1>
            <div id="nav-links"></div>
        </nav>
    </header>
    <main>
        <h2>Painel do Administrador</h2>
        <section id="product-management">
            <h3>Gerenciar Produtos</h3>
            <form id="product-form">
                <input type="hidden" id="product-id">
                <input type="text" id="product-name" placeholder="Nome do Produto" required>
                <textarea id="product-description" placeholder="Descrição"></textarea>
                <input type="number" id="product-price" placeholder="Preço (ex: 49.99)" step="0.01" required>
                <input type="text" id="product-imageUrl" placeholder="URL da Imagem" required>
                <input type="text" id="product-category" placeholder="Categoria" required>
                <button type="submit">Salvar Produto</button>
                <button type="button" id="cancel-edit-btn" style="display:none;">Cancelar Edição</button>
            </form>
            <div id="admin-product-list" class="product-grid"></div>
        </section>
        <hr>
        <section id="order-management">
            <h3>Todos os Pedidos</h3>
            <div id="admin-order-list"></div>
        </section>
    </main>
    <footer>
        <p>&copy; 2025 Gamer Store. Todos os direitos reservados.</p>
    </footer>
    <script src="/script.js"></script>
</body>
</html>
`;

const MEUS_PEDIDOS_HTML = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Meus Pedidos - Gamer Store</title> 
    <link rel="stylesheet" href="/style.css">
</head>
<body>
    <header>
        <nav>
            <h1><a href="/loja.html">Gamer Store</a></h1>
            <div id="nav-links"></div>
        </nav>
    </header>
    <main>
        <h2>Meus Pedidos</h2>
        <div id="order-list">
            <p>Carregando seus pedidos...</p>
        </div>
    </main>
    <script src="/script.js"></script>
</body>
</html>
`;

// --- Rotas para servir o HTML ---

app.get('/', (req, res) => {
    res.send(LOJA_HTML);
});

app.get('/loja.html', (req, res) => res.send(LOJA_HTML));
app.get('/login.html', (req, res) => res.send(LOGIN_HTML));
app.get('/register.html', (req, res) => res.send(REGISTER_HTML));
app.get('/admin.html', (req, res) => res.send(ADMIN_HTML));
app.get('/meus-pedidos.html', (req, res) => res.send(MEUS_PEDIDOS_HTML));
app.get('/chat.html', (req, res) => res.send(CHAT_HTML));

// --- Rotas da API ---


// Rota de Registro: POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
    const {
        username,
        email,
        password
    } = req.body;

    // Validação básica
    if (!username || !email || !password) {
        return res.status(400).json({ message: "Por favor, forneça nome de usuário, email e senha." });
    }

    try {
        // 1. Verifica se o usuário ou email já existem
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [{
                    email
                }, {
                    username
                }]
            },
        });

        if (existingUser) {
            return res.status(409).json({ message: "Usuário ou email já cadastrado." });
        }

        // 2. Prepara os dados do novo usuário
        const hashedPassword = await bcrypt.hash(password, 10);

        // 3. Cria o usuário já como verificado
        await prisma.user.create({
            data: {
                username,
                email,
                password: hashedPassword,
                emailVerified: new Date(), // Define o usuário como verificado imediatamente
            },
        });

        res.status(201).json({ message: "Registro completo! Você já pode fazer o login." });

    } catch (error) {
        console.error("Erro no registro:", error);
        res.status(500).json({ message: "Ocorreu um erro inesperado durante o registro." });
    }
});

// Rota de Login: POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
    const {
        email,
        password
    } = req.body;

    try {
        const user = await prisma.user.findUnique({
            where: {
                email
            }
        });
        if (!user) {
            return res.status(404).json({ message: "Usuário não encontrado." });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: "Senha inválida." });
        }

        // Gera o Token JWT
        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '8h' });

        const {
            password: _,
            ...userWithoutPassword
        } = user;
        res.json({
            message: "Login bem-sucedido!",
            user: userWithoutPassword,
            token });

    } catch (error) {
        console.error("Erro no login:", error);
        res.status(500).json({ message: "Ocorreu um erro inesperado durante o login." });
    }
});

// --- Rotas de Produtos (Admin) ---
app.post('/api/products', authenticateToken, isAdmin, async (req, res) => {
    const {
        name,
        description,
        price,
        imageUrl,
        category
    } = req.body;
    const sellerId = req.user.id; // O vendedor é o admin logado

    try {
        const newProduct = await prisma.product.create({
            data: {
                name,
                description,
                price,
                imageUrl,
                category,
                sellerId },
        });
        res.status(201).json(newProduct);
    } catch (error) {
        console.error("Erro ao criar produto:", error);
        res.status(500).json({ message: "Ocorreu um erro inesperado ao criar o produto." });
    }
});

// Rota para LISTAR todos os produtos (pública)
app.get('/api/products', async (req, res) => {
    try {
        const products = await prisma.product.findMany({
            orderBy: {
                createdAt: 'desc'
            }
        });
        res.json(products);
    } catch (error) {
        console.error("Erro ao buscar produtos:", error);
        res.status(500).json({ message: "Ocorreu um erro inesperado ao buscar os produtos." });
    }
});

// Rota para EDITAR um produto (Admin)
app.put('/api/products/:id', authenticateToken, isAdmin, async (req, res) => {
    const {
        id
    } = req.params;
    const {
        name,
        description,
        price,
        imageUrl,
        category
    } = req.body;
    try {
        const updatedProduct = await prisma.product.update({
            where: {
                id
            },
            data: {
                name,
                description,
                price,
                imageUrl,
                category },
        });
        res.json(updatedProduct);
    } catch (error) {
        console.error(`Erro ao editar produto ${id}:`, error);
        res.status(500).json({ message: "Ocorreu um erro inesperado ao editar o produto." });
    }
});

// Rota para DELETAR um produto (Admin)
app.delete('/api/products/:id', authenticateToken, isAdmin, async (req, res) => {
    const {
        id
    } = req.params;
    try {
        await prisma.product.delete({
            where: {
                id
            }
        });
        res.status(204).send(); // 204 No Content
    } catch (error) {
        console.error(`Erro ao deletar produto ${id}:`, error);
        res.status(500).json({ message: "Ocorreu um erro inesperado ao deletar o produto." });
    }
});

// --- Rota de Criação de Pedido ---
app.post('/api/orders', authenticateToken, async (req, res) => {
    const {
        productId,
        quantity
    } = req.body;
    const userId = req.user.id; // Pegamos o ID do usuário logado através do token

    try {
        // 1. Buscar o produto no banco
        const product = await prisma.product.findUnique({
            where: {
                id: productId
            }
        });
        if (!product) {
            return res.status(404).json({ message: "Produto não encontrado." });
        }

        const total = product.price * quantity;

        // 2. Gerar a cobrança PIX na API da Efí
        // O tempo de expiração é definido aqui (240 segundos = 4 minutos)
        const charge = await EfiPay.createPixCharge(total, 240);

        // 3. Criar o pedido no nosso banco de dados com status PENDENTE e o txid da Efí
        const order = await prisma.order.create({
            data: {
                userId,
                total,
                status: 'PENDING',
                txid: charge.txid, // Salvando o ID da transação
                items: {
                    create: {
                        productId: productId,
                        quantity: quantity,
                    },
                },
            },
        });

        // 4. Retornar os dados do PIX para o frontend exibir
        res.status(201).json({
            message: "Pedido criado. Aguardando pagamento.",
            order,
            pix: {
                qrCodeImage: charge.imagemQrcode,
                qrCodeCopyPaste: charge.pixCopiaECola,
            },
        });

    } catch (error) {
        console.error("Erro ao criar pedido:", error);
        res.status(500).json({ message: "Falha ao processar o pedido." });
    }
});

// --- Rota de Webhook para a Efí ---
// A Efí vai chamar esta rota quando o pagamento for confirmado
app.post('/api/webhooks/efi', (req, res) => {
    // A Efí espera uma resposta rápida. Responda imediatamente.
    res.sendStatus(200);

    // Processe a notificação de forma assíncrona.
    (async () => {
        try {
            // A estrutura pode variar, verifique a documentação da Efí para webhooks PIX.
            const pixNotification = req.body.pix && req.body.pix[0];
            if (!pixNotification || !pixNotification.txid) {
                console.warn("Webhook da Efí recebido sem txid:", req.body);
                return;
            }
            const {
                txid
            } = pixNotification;

            // Encontra o pedido pelo txid e atualiza o status para PAGO
            const updatedOrder = await prisma.order.update({
                where: {
                    txid: txid
                },
                data: {
                    status: 'PAID'
                },
            });
            console.log(`Webhook: Pedido ${updatedOrder.id} foi pago (txid: ${txid})`);
        } catch (error) {
            console.error("Erro ao processar webhook da Efí:", error);
        }
    })();
});

// Rota para o cliente buscar seus próprios pedidos
app.get('/api/my-orders', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const orders = await prisma.order.findMany({
            where: {
                userId: userId
            },
            include: {
                items: {
                    include: {
                        product: {
                            select: {
                                name: true,
                                imageUrl: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
        res.json(orders);
    } catch (error) {
        console.error(`Erro ao buscar pedidos para o usuário ${userId}:`, error);
        res.status(500).json({ message: "Ocorreu um erro inesperado ao buscar seus pedidos." });
    }
});

// Rota para o ADMIN buscar TODOS os pedidos
app.get('/api/orders/all', authenticateToken, isAdmin, async (req, res) => {
     try {
        const orders = await prisma.order.findMany({
            include: {
                user: {
                    select: {
                        username: true,
                        email: true
                    }
                }, // Info do cliente
                items: {
                    include: {
                        product: {
                            select: {
                                name: true
                            }
                        }
                    }
                },
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
        res.json(orders);
    } catch (error) {
        console.error("Erro ao buscar todos os pedidos:", error);
        res.status(500).json({ message: "Ocorreu um erro inesperado ao buscar os pedidos." });
    }
});

// Rota para verificar o status de um pedido (usado no polling do frontend)
app.get('/api/orders/:orderId/status', authenticateToken, async (req, res) => {
    const {
        orderId
    } = req.params;
    try {
        const order = await prisma.order.findUnique({
            where: {
                id: orderId
            },
            select: {
                status: true
            }
        });
        if (!order) {
            return res.status(404).json({ message: "Pedido não encontrado." });
        }
        res.json({
            status: order.status
        });
    } catch (error) {
        console.error(`Erro ao buscar status do pedido ${orderId}:`, error);
        res.status(500).json({ message: "Ocorreu um erro inesperado ao buscar o status do pedido." });
    }
});

// --- Rotas de Chat (Mensagens) ---

// Rota para LISTAR mensagens de um pedido
app.get('/api/orders/:orderId/messages', authenticateToken, async (req, res) => {
    const {
        orderId
    } = req.params;
    const currentUserId = req.user.id;
    const currentUserRole = req.user.role;

    try {
        // 1. Buscar o pedido para verificar a permissão
        const order = await prisma.order.findUnique({
            where: {
                id: orderId
            },
        });

        // 2. Validar se o pedido existe e se o usuário tem permissão
        if (!order) {
            return res.status(404).json({ message: 'Pedido não encontrado' });
        }
        if (order.userId !== currentUserId && currentUserRole !== 'ADMIN') {
            return res.status(403).json({ message: 'Acesso negado' });
        }

        // 3. Buscar as mensagens do pedido
        const messages = await prisma.message.findMany({
            where: {
                orderId: orderId
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        username: true,
                        role: true
                    }
                },
            },
            orderBy: {
                createdAt: 'asc'
            },
        });

        res.json(messages);
    } catch (error) {
        console.error("Erro ao buscar mensagens:", error);
        res.status(500).json({ message: "Ocorreu um erro inesperado ao carregar o chat." });
    }
});

// Rota para ENVIAR uma nova mensagem em um pedido
app.post('/api/orders/:orderId/messages', authenticateToken, async (req, res) => {
    const {
        orderId
    } = req.params;
    const {
        content
    } = req.body;
    const senderId = req.user.id;

    if (!content || content.trim() === '') {
        return res.status(400).json({ message: 'O conteúdo da mensagem é obrigatório' });
    }

    try {
        // A mesma lógica de verificação de permissão do GET pode ser aplicada aqui,
        // mas como o chat é entre cliente e admin, vamos permitir que ambos postem.
        // A validação principal já está no middleware 'authenticateToken'.

        const newMessage = await prisma.message.create({
            data: {
                content: content.trim(),
                orderId,
                senderId,
            },
        });

        // Após salvar, buscamos a mensagem completa para transmitir
        const messageWithSender = await prisma.message.findUnique({
            where: { id: newMessage.id },
            include: { sender: { select: { id: true, username: true, role: true } } },
        });

        // Transmitir a nova mensagem via WebSocket para os clientes conectados no chat certo
        if (chatConnections.has(orderId)) {
            const clients = chatConnections.get(orderId);
            clients.forEach(client => {
                if (client.readyState === require('ws').OPEN) {
                    client.send(JSON.stringify(messageWithSender));
                }
            });
        }

        res.status(201).json(messageWithSender);

    } catch (error) {
        console.error("Erro ao enviar mensagem:", error);
        res.status(500).json({ message: "Ocorreu um erro inesperado ao enviar a mensagem." });
    }
});

// Rota para o ADMIN marcar um pedido como ENTREGUE
app.patch('/api/orders/:orderId/deliver', authenticateToken, isAdmin, async (req, res) => {
    const {
        orderId
    } = req.params;

    try {
        const order = await prisma.order.findUnique({
            where: {
                id: orderId
            },
        });

        if (!order) {
            return res.status(404).json({ message: "Pedido não encontrado." });
        }

        const updatedOrder = await prisma.order.update({
            where: {
                id: orderId
            },
            data: {
                status: 'DELIVERED'
            },
        });

        res.json({ message: "Pedido marcado como entregue!", order: updatedOrder });
    } catch (error) {
        console.error(`Erro ao marcar pedido ${orderId} como entregue:`, error);
        res.status(500).json({ message: "Ocorreu um erro inesperado ao atualizar o pedido." });
    }
});

// --- Rotas de Avaliações (Reviews) ---

// Rota para CRIAR uma nova avaliação para um produto
app.post('/api/products/:productId/reviews', authenticateToken, async (req, res) => {
    const {
        productId
    } = req.params;
    const userId = req.user.id;
    const {
        rating,
        comment
    } = req.body;

    // Validação da nota
    if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ message: "A avaliação (rating) deve ser um número entre 1 e 5." });
    }

    try {
        // Verificação de segurança: O usuário só pode avaliar se já comprou o produto.
        const hasPurchased = await prisma.order.findFirst({
            where: {
                userId: userId,
                status: {
                    in: ['PAID', 'DELIVERED']
                }, // Status de pago ou entregue
                items: {
                    some: {
                        productId: productId } },
            },
        });

        if (!hasPurchased) {
            return res.status(403).json({ message: "Você só pode avaliar produtos que já comprou." });
        }

        // Verifica se o usuário já avaliou este produto para evitar duplicatas
        const existingReview = await prisma.review.findFirst({
            where: {
                userId: userId,
                productId: productId
            }
        });

        if (existingReview) {
            return res.status(409).json({ message: "Você já avaliou este produto." });
        }

        const newReview = await prisma.review.create({
            data: {
                rating: parseInt(rating),
                comment,
                productId,
                userId,
            },
        });

        res.status(201).json(newReview);
    } catch (error) {
        console.error("Erro ao criar avaliação:", error);
        res.status(500).json({ message: "Ocorreu um erro inesperado ao enviar a avaliação." });
    }
});

// Rota para LISTAR todas as avaliações de um produto (pública)
app.get('/api/products/:productId/reviews', async (req, res) => {
    const {
        productId
    } = req.params;
    try {
        const reviews = await prisma.review.findMany({
            where: {
                productId: productId
            },
            include: {
                user: {
                    select: {
                        username: true } } }, // Inclui o nome de quem avaliou
            orderBy: {
                createdAt: 'desc'
            },
        });
        res.json(reviews);
    } catch (error) {
        console.error(`Erro ao buscar avaliações para o produto ${productId}:`, error);
        res.status(500).json({ message: "Ocorreu um erro inesperado ao buscar as avaliações." });
    }
});

// --- Rota secreta para criação de Admin (Desenvolvimento) ---
app.post('/api/internal/create-super-user', async (req, res) => {
    const { username, email, password, secret } = req.body;

    // Proteção com uma chave secreta definida nas variáveis de ambiente
    if (!process.env.INTERNAL_API_SECRET || secret !== process.env.INTERNAL_API_SECRET) {
        return res.status(403).json({ message: "Acesso negado." });
    }

    if (!username || !email || !password) {
        return res.status(400).json({ message: "Dados insuficientes para criar o usuário." });
    }

    try {
        const existingUser = await prisma.user.findFirst({
            where: { OR: [{ email }, { username }] },
        });

        if (existingUser) {
            // Se o usuário já existe, apenas o promove para ADMIN se ele não for
            if (existingUser.role !== 'ADMIN') {
                await prisma.user.update({
                    where: { id: existingUser.id },
                    data: { role: 'ADMIN' },
                });
                return res.status(200).json({ message: `Usuário '${username}' já existia e foi promovido a ADMIN.` });
            }
            return res.status(200).json({ message: `Usuário admin '${username}' já existe.` });
        }

        // Se não existe, cria um novo usuário admin
        const hashedPassword = await bcrypt.hash(password, 10);
        await prisma.user.create({
            data: { username, email, password: hashedPassword, role: 'ADMIN', emailVerified: new Date() },
        });

        res.status(201).json({ message: `Usuário admin '${username}' criado com sucesso!` });

    } catch (error) {
        console.error("Erro ao criar super usuário:", error);
        res.status(500).json({ message: "Erro interno ao criar o super usuário." });
    }
});

// --- Rota de fallback ---
app.use((req, res) => {
    res.status(404).send("<h2>404 - Página Não Encontrada</h2><a href='/loja.html'>Voltar para a loja</a>");
});

// --- Lógica do WebSocket Server ---
wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const orderId = url.searchParams.get('orderId');
    const token = url.searchParams.get('token');

    if (!orderId || !token) {
        ws.close(1008, 'ID do pedido ou token não fornecido.');
        return;
    }

    // Autenticar o usuário do WebSocket
    jwt.verify(token, process.env.JWT_SECRET, async (err, decodedUser) => {
        if (err) {
            ws.close(1008, 'Token inválido.');
            return;
        }

        try {
            // Verificar permissão para acessar o chat (mesma lógica da rota GET)
            const order = await prisma.order.findUnique({ where: { id: orderId } });
            if (!order || (order.userId !== decodedUser.id && decodedUser.role !== 'ADMIN')) {
                ws.close(1008, 'Acesso negado a este chat.');
                return;
            }

            // Se autenticado e autorizado, armazena a conexão
            if (!chatConnections.has(orderId)) {
                chatConnections.set(orderId, new Set());
            }
            const clients = chatConnections.get(orderId);
            clients.add(ws);

            console.log(`Cliente conectado ao chat do pedido ${orderId}. Total de clientes: ${clients.size}`);

            // Lidar com o fechamento da conexão
            ws.on('close', () => {
                clients.delete(ws);
                if (clients.size === 0) {
                    chatConnections.delete(orderId);
                }
                console.log(`Cliente desconectado do chat do pedido ${orderId}. Restam: ${clients.size}`);
            });

            ws.on('error', (error) => {
                console.error('Erro no WebSocket:', error);
            });

        } catch (error) {
            console.error('Erro na verificação de permissão do WebSocket:', error);
            ws.close(1011, 'Erro interno do servidor.');
        }
    });
});

// --- Função para criar o usuário Admin na inicialização ---
async function seedAdminUser() {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminUsername || !adminPassword) {
        console.log("Variáveis de ambiente para o admin não configuradas. Pulando a criação do admin.");
        return;
    }

    try {
        const existingAdmin = await prisma.user.findFirst({
            where: { role: 'ADMIN' }
        });

        if (existingAdmin) {
            console.log("Usuário admin já existe no banco de dados.");
        } else {
            console.log("Criando usuário admin a partir das variáveis de ambiente...");
            const hashedPassword = await bcrypt.hash(adminPassword, 10);
            await prisma.user.create({
                data: {
                    email: adminEmail,
                    username: adminUsername,
                    password: hashedPassword,
                    role: 'ADMIN',
                    emailVerified: new Date(), // Marcar como verificado
                }
            });
            console.log("Usuário admin criado com sucesso!");
        }
    } catch (error) {
        console.error("Erro ao tentar criar o usuário admin:", error);
    }
}

// Função principal para gerenciar a conexão com o banco e iniciar o servidor
async function main() {
    // Garante que o usuário admin exista (se as variáveis de ambiente estiverem definidas)
    await seedAdminUser();

    // Iniciar o Servidor
    server.listen(PORT, () => { // Usamos server.listen em vez de app.listen
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    // Garante que a conexão com o prisma seja fechada ao encerrar a aplicação
    await prisma.$disconnect();
  });

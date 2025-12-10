const API_URL = window.location.origin; // Usa a URL base do servidor (ex: http://localhost:5000)

document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;

    // Funções de inicialização de página
    updateNav();

    if (path.includes('loja.html') || path === '/') {
        loadProducts();
    } else if (path.includes('login.html')) {
        setupLoginForm();
    } else if (path.includes('register.html')) {
        setupRegisterForm();
    } else if (path.includes('admin.html')) {
        initAdminPage();
    } else if (path.includes('meus-pedidos.html')) {
        initMyOrdersPage();
    } else if (path.includes('chat.html')) {
        initChatPage();
    }
});

function getToken() {
    return localStorage.getItem('token');
}

function getUser() {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    updateNav();
    window.location.href = '/login.html';
}

function updateNav() {
    const navLinks = document.getElementById('nav-links');
    if (!navLinks) return;

    const user = getUser();
    navLinks.innerHTML = ''; // Limpa os links existentes

    if (user) {
        navLinks.innerHTML += `<span>Olá, ${user.username}</span>`;
        navLinks.innerHTML += `<a href="/meus-pedidos.html">Meus Pedidos</a>`;
        if (user.role === 'ADMIN') {
            navLinks.innerHTML += `<a href="/admin.html">Painel Admin</a>`;
        }
        navLinks.innerHTML += `<button onclick="logout()">Sair</button>`;
    } else {
        navLinks.innerHTML = `
            <a href="/login.html">Login</a>
            <a href="/register.html">Registrar</a>
        `;
    }
}

async function loadProducts() {
    const productList = document.getElementById('product-list');
    if (!productList) return;

    try {
        const response = await fetch(`${API_URL}/api/products`);
        if (!response.ok) throw new Error('Falha ao carregar produtos.');
        
        const products = await response.json();
        productList.innerHTML = ''; // Limpa a mensagem de "carregando"

        if (products.length === 0) {
            productList.innerHTML = '<p>Nenhum produto encontrado.</p>';
            return;
        }

        products.forEach(product => {
            const card = document.createElement('div');
            card.className = 'product-card';
            card.innerHTML = `
                <img src="${product.imageUrl}" alt="${product.name}">
                <div class="product-card-content">
                    <h3>${product.name}</h3>
                    <p>${product.description}</p>
                    <p class="price">R$ ${product.price.toFixed(2)}</p>
                </div>
                <div class="product-card-actions">
                    <button onclick="showPurchaseModal('${product.id}', '${product.name}', ${product.price})">Comprar</button>
                </div>
            `;
            productList.appendChild(card);
        });
    } catch (error) {
        productList.innerHTML = `<p class="error">${error.message}</p>`;
    }
}

function setupLoginForm() {
    const form = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch(`${API_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Erro no login.');
            }

            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            window.location.href = '/loja.html';

        } catch (error) {
            errorMessage.textContent = error.message;
        }
    });
}

function setupRegisterForm() {
    const form = document.getElementById('register-form');
    const messageDiv = document.getElementById('message');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch(`${API_URL}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Erro no registro.');
            }

            messageDiv.textContent = data.message;
            messageDiv.className = 'message';
            form.reset();
            setTimeout(() => window.location.href = '/login.html', 2000);

        } catch (error) {
            messageDiv.textContent = error.message;
            messageDiv.className = 'error';
        }
    });
}

// --- Lógica da Página de Admin ---
async function initAdminPage() {
    const user = getUser();
    if (!user || user.role !== 'ADMIN') {
        window.location.href = '/login.html';
        return;
    }
    
    await loadAdminProducts();
    await loadAllOrders();
    setupProductForm();
}

async function loadAdminProducts() {
    const productList = document.getElementById('admin-product-list');
    // Reutiliza a lógica de fetch, mas com botões de admin
    const response = await fetch(`${API_URL}/api/products`);
    const products = await response.json();
    productList.innerHTML = '';
    products.forEach(p => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <img src="${p.imageUrl}" alt="${p.name}">
            <div class="product-card-content">
                <h3>${p.name}</h3>
                <p class="price">R$ ${p.price.toFixed(2)}</p>
            </div>
            <div class="product-card-actions">
                <button onclick="editProduct('${p.id}', '${p.name}', '${p.description}', ${p.price}, '${p.imageUrl}', '${p.category}')">Editar</button>
                <button onclick="deleteProduct('${p.id}')">Deletar</button>
            </div>
        `;
        productList.appendChild(card);
    });
}

function setupProductForm() {
    const form = document.getElementById('product-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('product-id').value;
        const productData = {
            name: document.getElementById('product-name').value,
            description: document.getElementById('product-description').value,
            price: parseFloat(document.getElementById('product-price').value),
            imageUrl: document.getElementById('product-imageUrl').value,
            category: document.getElementById('product-category').value,
        };

        const method = id ? 'PUT' : 'POST';
        const url = id ? `${API_URL}/api/products/${id}` : `${API_URL}/api/products`;

        try {
            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                },
                body: JSON.stringify(productData)
            });
            if (!response.ok) throw new Error('Falha ao salvar produto.');
            
            form.reset();
            document.getElementById('product-id').value = '';
            await loadAdminProducts();

        } catch (error) {
            alert(error.message);
        }
    });
}

function editProduct(id, name, description, price, imageUrl, category) {
    document.getElementById('product-id').value = id;
    document.getElementById('product-name').value = name;
    document.getElementById('product-description').value = description;
    document.getElementById('product-price').value = price;
    document.getElementById('product-imageUrl').value = imageUrl;
    document.getElementById('product-category').value = category;
    window.scrollTo(0, 0); // Rola para o topo onde está o formulário
}

async function deleteProduct(id) {
    if (!confirm('Tem certeza que deseja deletar este produto?')) return;

    try {
        const response = await fetch(`${API_URL}/api/products/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (!response.ok) throw new Error('Falha ao deletar produto.');
        await loadAdminProducts();
    } catch (error) {
        alert(error.message);
    }
}

async function loadAllOrders() {
    const orderListDiv = document.getElementById('admin-order-list');
    if (!orderListDiv) return;

    try {
        const response = await fetch(`${API_URL}/api/orders/all`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (!response.ok) {
            throw new Error('Falha ao carregar os pedidos.');
        }

        const orders = await response.json();
        orderListDiv.innerHTML = '';

        if (orders.length === 0) {
            orderListDiv.innerHTML = '<p>Nenhum pedido encontrado.</p>';
            return;
        }

        orders.forEach(order => {
            const orderCard = document.createElement('div');
            orderCard.className = 'order-item';
            orderCard.id = `order-${order.id}`; // Adiciona um ID para fácil manipulação

            // Botão para marcar como entregue, visível apenas se o status for 'PAID'
            const deliverButton = order.status === 'PAID' 
                ? `<button class="deliver-btn" onclick="markAsDelivered('${order.id}')">Marcar como Entregue</button>` 
                : '';

            orderCard.innerHTML = `
                <h4>Pedido #${order.id}</h4>
                <p>Cliente: <strong>${order.user.username}</strong> (${order.user.email})</p>
                <p>Data: ${new Date(order.createdAt).toLocaleDateString()}</p>
                <p>Total: R$ ${order.total.toFixed(2)}</p>
                <p>Status: <strong id="status-${order.id}">${order.status}</strong></p>
                <div class="order-actions">
                    <button onclick="location.href='/chat.html?orderId=${order.id}'">Ver Chat</button>
                    ${deliverButton}
                </div>
            `;
            orderListDiv.appendChild(orderCard);
        });
    } catch (error) {
        orderListDiv.innerHTML = `<p class="error">${error.message}</p>`;
    }
}

async function markAsDelivered(orderId) {
    if (!confirm(`Tem certeza que deseja marcar o pedido #${orderId} como entregue?`)) return;

    try {
        const response = await fetch(`${API_URL}/api/orders/${orderId}/deliver`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || 'Falha ao atualizar o pedido.');
        }

        // Atualiza a UI sem recarregar a página
        const statusElement = document.getElementById(`status-${orderId}`);
        statusElement.textContent = 'DELIVERED';

        const orderCard = document.getElementById(`order-${orderId}`);
        const deliverButton = orderCard.querySelector('.deliver-btn');
        if (deliverButton) deliverButton.remove();

    } catch (error) {
        alert(`Erro: ${error.message}`);
    }
}

// --- Lógica da Página Meus Pedidos ---
async function initMyOrdersPage() {
    const user = getUser();
    if (!user) {
        window.location.href = '/login.html';
        return;
    }

    const orderList = document.getElementById('order-list');
    try {
        const response = await fetch(`${API_URL}/api/my-orders`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (!response.ok) throw new Error('Falha ao buscar pedidos.');

        const orders = await response.json();
        orderList.innerHTML = '';

        if (orders.length === 0) {
            orderList.innerHTML = '<p>Você ainda não fez nenhum pedido.</p>';
            return;
        }

        orders.forEach(order => {
            const orderDiv = document.createElement('div');
            orderDiv.className = 'order-item'; // Adicionar estilo para .order-item no CSS
            orderDiv.innerHTML = `
                <h4>Pedido #${order.id} - ${new Date(order.createdAt).toLocaleDateString()}</h4>
                <p>Status: <strong>${order.status}</strong></p>
                <p>Total: R$ ${order.total.toFixed(2)}</p>
                <ul>
                    ${order.items.map(item => `<li>${item.quantity}x ${item.product.name}</li>`).join('')}
                </ul>
            `;
            orderList.appendChild(orderDiv);
        });

    } catch (error) {
        orderList.innerHTML = `<p class="error">${error.message}</p>`;
    }
}

// --- Lógica da Página de Chat ---
async function initChatPage() {
    const user = getUser();
    if (!user) {
        window.location.href = '/login.html';
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('orderId');

    if (!orderId) {
        document.querySelector('main').innerHTML = '<h2>ID do Pedido não encontrado.</h2>';
        return;
    }

    document.getElementById('chat-title').textContent = `Chat do Pedido #${orderId}`;
    
    await loadMessages(orderId);
    setupChatForm(orderId);
    setupWebSocket(orderId);
}

async function loadMessages(orderId) {
    const chatContainer = document.getElementById('chat-container');
    try {
        const response = await fetch(`${API_URL}/api/orders/${orderId}/messages`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (!response.ok) throw new Error('Não foi possível carregar as mensagens.');

        const messages = await response.json();
        chatContainer.innerHTML = '';
        messages.forEach(msg => renderMessage(msg));
        chatContainer.scrollTop = chatContainer.scrollHeight; // Rola para a última mensagem

    } catch (error) {
        chatContainer.innerHTML = `<p class="error">${error.message}</p>`;
    }
}

function setupChatForm(orderId) {
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const content = messageInput.value.trim();
        if (!content) return;

        try {
            const response = await fetch(`${API_URL}/api/orders/${orderId}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                },
                body: JSON.stringify({ content })
            });
            if (!response.ok) throw new Error('Falha ao enviar mensagem.');

            messageInput.value = '';

        } catch (error) {
            alert(error.message);
        }
    });
}

function setupWebSocket(orderId) {
    const token = getToken();
    // Determina o protocolo (ws ou wss para produção)
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${window.location.host}?orderId=${orderId}&token=${token}`);

    socket.onopen = () => {
        console.log('Conexão WebSocket estabelecida.');
    };

    socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        renderMessage(message);
    };

    socket.onclose = (event) => {
        console.log('Conexão WebSocket fechada:', event.reason);
        // Opcional: Adicionar lógica para tentar reconectar.
    };

    socket.onerror = (error) => {
        console.error('Erro no WebSocket:', error);
    };
}

function renderMessage(msg) {
    const chatContainer = document.getElementById('chat-container');
    const messageDiv = document.createElement('div');
    const currentUser = getUser();
    const isMe = msg.sender.id === currentUser.id;
    
    messageDiv.className = `chat-message ${isMe ? 'sent' : 'received'}`;
    messageDiv.innerHTML = `
        <div class="message-sender">${isMe ? 'Você' : msg.sender.username} (${msg.sender.role})</div>
        <div class="message-content">${msg.content}</div>
        <div class="message-time">${new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
    `;
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// --- Lógica de Compra com PIX ---

let pollingInterval; // Variável para controlar o polling de status do pedido

function showPurchaseModal(productId, productName, productPrice) {
    if (!getToken()) {
        alert('Você precisa estar logado para comprar.');
        window.location.href = '/login.html';
        return;
    }

    const modal = document.getElementById('purchase-modal');
    const modalBody = document.getElementById('modal-body');
    const closeButton = modal.querySelector('.close-button');

    // Limpa o conteúdo anterior e o polling
    modalBody.innerHTML = '';
    clearInterval(pollingInterval);

    // Monta o conteúdo inicial do modal
    modalBody.innerHTML = `
        <p>Você está comprando: <strong>${productName}</strong></p>
        <p>Preço unitário: R$ ${productPrice.toFixed(2)}</p>
        <div class="quantity-selector">
            <label for="quantity">Quantidade:</label>
            <input type="number" id="quantity" value="1" min="1" step="1">
        </div>
        <button id="confirm-purchase-btn">Confirmar e Gerar PIX</button>
        <div id="pix-feedback" class="feedback-message"></div>
    `;

    modal.style.display = 'flex';

    // Event Listeners
    closeButton.onclick = () => {
        modal.style.display = 'none';
        clearInterval(pollingInterval);
    };
    window.onclick = (event) => {
        if (event.target == modal) {
            modal.style.display = 'none';
            clearInterval(pollingInterval);
        }
    };

    document.getElementById('confirm-purchase-btn').onclick = async () => {
        const quantity = parseInt(document.getElementById('quantity').value);
        if (isNaN(quantity) || quantity < 1) {
            alert("A quantidade deve ser de pelo menos 1.");
            return;
        }
        await createOrder(productId, quantity);
    };
}

async function createOrder(productId, quantity) {
    const modalBody = document.getElementById('modal-body');
    const feedbackDiv = document.getElementById('pix-feedback');
    feedbackDiv.textContent = 'Gerando cobrança PIX, aguarde...';

    try {
        const response = await fetch(`${API_URL}/api/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ productId, quantity })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || 'Falha ao criar o pedido.');
        }

        // Exibe o QR Code e o código "copia e cola"
        modalBody.innerHTML = `
            <h3>Pague com PIX para finalizar</h3>
            <p>Escaneie o QR Code abaixo com o app do seu banco:</p>
            <img src="${data.pix.qrCodeImage}" alt="PIX QR Code" class="pix-qrcode">
            <p>Ou copie o código abaixo:</p>
            <div class="pix-copy-paste">
                <input type="text" id="pix-code" value="${data.pix.qrCodeCopyPaste}" readonly>
                <button id="copy-pix-btn">Copiar</button>
            </div>
            <div id="pix-status" class="feedback-message">Aguardando pagamento...</div>
        `;

        document.getElementById('copy-pix-btn').onclick = () => {
            const pixInput = document.getElementById('pix-code');
            pixInput.select();
            document.execCommand('copy');
            alert('Código PIX copiado!');
        };

        // Inicia a verificação do status do pagamento
        pollOrderStatus(data.order.id);

    } catch (error) {
        modalBody.innerHTML = `<p class="error">Erro: ${error.message}</p>`;
    }
}

function pollOrderStatus(orderId) {
    pollingInterval = setInterval(async () => {
        try {
            const response = await fetch(`${API_URL}/api/orders/${orderId}/status`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });

            if (!response.ok) {
                // Se o pedido não for encontrado (404) ou houver outro erro, para de verificar
                console.error("Erro ao verificar status do pedido. Parando verificação.");
                clearInterval(pollingInterval);
                return;
            }

            const data = await response.json();

            if (data.status === 'PAID') {
                clearInterval(pollingInterval);
                const modalBody = document.getElementById('modal-body');
                modalBody.innerHTML = `
                    <div style="text-align: center;">
                        <h3 style="color: var(--success-color);">Pagamento Confirmado!</h3>
                        <p>Seu pedido foi recebido com sucesso.</p>
                        <p>Você será redirecionado para "Meus Pedidos" em 3 segundos.</p>
                    </div>
                `;
                // Redirecionar para "Meus Pedidos" após alguns segundos
                setTimeout(() => {
                    const modal = document.getElementById('purchase-modal');
                    if(modal) modal.style.display = 'none';
                    window.location.href = '/meus-pedidos.html';
                }, 3000);
            }
        } catch (error) {
            console.error("Erro na rede durante a verificação de status:", error);
            clearInterval(pollingInterval); // Para em caso de erro de rede
        }
    }, 5000); // Verifica a cada 5 segundos
}

// --- Função "Secreta" para criar Admin via Console ---
// Esta função não é chamada em nenhum lugar, apenas via console do navegador.
async function createAdminUser(secret) {
    if (!secret) {
        console.error("Você precisa fornecer a chave secreta. Ex: createAdminUser('sua-chave-secreta')");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/internal/create-super-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'enzo.rodrigo58@gmail.com',
                username: 'dollya',
                password: '99831p',
                secret: secret
            })
        });

        const result = await response.json();
        console.log('Resultado:', result);
    } catch (error) {
        console.error('Falha ao executar o comando:', error);
    }
}

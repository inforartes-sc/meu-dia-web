// Supabase Credentials
const SUPABASE_URL = "https://gunktlnjreqbxichcokr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1bmt0bG5qcmVxYnhpY2hjb2tyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MzM5NzksImV4cCI6MjEwNjAwOTk3OX0.DZB6Eza3A5VHkfF-GtlfN_38TObTWyBFp8XqgmWJCXE";

let supabaseClient = null;
if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Local Cache key
const LOCAL_USERS_KEY = "meudia_admin_local_users";
const LOCAL_NOTIFS_KEY = "meudia_admin_local_notifs";

// State Management
let state = {
    users: JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || "[]"),
    notifications: JSON.parse(localStorage.getItem(LOCAL_NOTIFS_KEY) || "[]")
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
    initNavigation();
    initClock();
    initPushFormSync();

    await loadRealDataFromDatabase();

    renderUsers();
    renderNotificationHistory();
    renderRecentNotifications();
    updateMetrics();
});

// Load Live Real Data from Supabase Cloud Database
async function loadRealDataFromDatabase() {
    let loadedFromSupabase = false;

    try {
        if (supabaseClient) {
            // Tenta buscar da tabela 'users'
            let { data: usersData, error: usersErr } = await supabaseClient
                .from('users')
                .select('*');

            // Se vazia ou erro, tenta 'user_accounts'
            if (!usersData || usersData.length === 0) {
                const res = await supabaseClient.from('user_accounts').select('*');
                if (res.data && res.data.length > 0) {
                    usersData = res.data;
                }
            }

            if (usersData && usersData.length > 0) {
                state.users = usersData.map(u => ({
                    id: u.id || 'usr_' + Math.random().toString(36).substr(2, 6),
                    name: u.full_name || u.name || u.user_name || 'Usuário do App',
                    email: u.email || 'usuario@meudia.app',
                    method: u.provider ? `Google (${u.provider})` : (u.password_hash === 'GOOGLE_OAUTH_SSO' ? 'Google OAuth' : 'E-mail / Senha'),
                    status: (u.is_premium || u.is_pro) ? 'PRO' : 'FREE',
                    createdAt: u.created_at ? u.created_at.split('T')[0] : new Date().toISOString().split('T')[0]
                }));
                localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(state.users));
                loadedFromSupabase = true;
            }

            // Busca histórico real de notificações
            const { data: notifData, error: notifErr } = await supabaseClient
                .from('notifications')
                .select('*')
                .order('created_at', { ascending: false });

            if (!notifErr && notifData && notifData.length > 0) {
                state.notifications = notifData.map(n => ({
                    id: n.id,
                    title: n.title,
                    message: n.message,
                    target: n.target || 'Todos',
                    count: n.delivered_count || 1,
                    sentAt: n.created_at ? new Date(n.created_at).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR'),
                    status: 'Entregue'
                }));
                localStorage.setItem(LOCAL_NOTIFS_KEY, JSON.stringify(state.notifications));
            }
        }
    } catch (err) {
        console.warn('Erro de comunicação com o Supabase REST API:', err);
    }

    if (!loadedFromSupabase) {
        console.log('Nenhum usuário retornado do Supabase ainda. Exibindo dados de cache local/nativos.');
    }
}

// Navigation Handling
function initNavigation() {
    const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
    const tabContents = document.querySelectorAll('.tab-content');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const targetTab = item.getAttribute('data-tab');
            if (!targetTab) return;

            e.preventDefault();

            navItems.forEach(nav => nav.classList.remove('active'));
            tabContents.forEach(tab => tab.classList.remove('active'));

            item.classList.add('active');
            const targetEl = document.getElementById(`tab-${targetTab}`);
            if (targetEl) {
                targetEl.classList.add('active');
            }
        });
    });

    document.getElementById('btn-quick-notify')?.addEventListener('click', () => {
        document.querySelector('.sidebar-nav .nav-item[data-tab="notifications"]').click();
    });
}

// Live Clock
function initClock() {
    const clockEl = document.getElementById('live-clock');
    function updateClock() {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString('pt-BR');
    }
    updateClock();
    setInterval(updateClock, 1000);
}

// Realtime Push Preview Sync
function initPushFormSync() {
    const titleInput = document.getElementById('push-title');
    const messageInput = document.getElementById('push-message');
    const previewTitle = document.getElementById('preview-title');
    const previewMessage = document.getElementById('preview-message');

    titleInput?.addEventListener('input', (e) => {
        previewTitle.textContent = e.target.value.trim() || 'Título da Notificação';
    });

    messageInput?.addEventListener('input', (e) => {
        previewMessage.textContent = e.target.value.trim() || 'A mensagem aparecerá aqui conforme você digita no formulário ao lado...';
    });

    // Form Submit Handlers
    document.getElementById('form-quick-push')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('quick-push-title').value;
        const message = document.getElementById('quick-push-message').value;
        const target = document.getElementById('quick-push-target').value;

        await sendPushNotification(title, message, target);
        document.getElementById('form-quick-push').reset();
    });

    document.getElementById('form-full-push')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('push-title').value;
        const message = document.getElementById('push-message').value;
        const target = document.getElementById('push-target-full').value;

        await sendPushNotification(title, message, target);
        document.getElementById('form-full-push').reset();
        previewTitle.textContent = 'Título da Notificação';
        previewMessage.textContent = 'A mensagem aparecerá aqui conforme você digita no formulário ao lado...';
    });
}

// Push Dispatcher with Supabase Sync
async function sendPushNotification(title, message, target) {
    const targetLabel = target === 'ALL' ? 'Todos' : (target === 'PRO' ? 'Somente PRO' : 'Somente Gratuitos');
    const count = target === 'ALL' ? (state.users.length || 1) : (target === 'PRO' ? state.users.filter(u => u.status === 'PRO').length : state.users.filter(u => u.status === 'FREE').length);

    const now = new Date();
    const formattedDate = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

    const newNotif = {
        id: 'notif_' + Date.now(),
        title,
        message,
        target: targetLabel,
        count: count || 1,
        sentAt: formattedDate,
        status: 'Entregue'
    };

    // Salvar no Supabase se disponível
    if (supabaseClient) {
        try {
            await supabaseClient.from('notifications').insert([{
                title,
                message,
                target: targetLabel,
                delivered_count: count || 1
            }]);
        } catch (err) {
            console.log('Erro de inserção Supabase:', err);
        }
    }

    state.notifications.unshift(newNotif);
    localStorage.setItem(LOCAL_NOTIFS_KEY, JSON.stringify(state.notifications));

    renderNotificationHistory();
    renderRecentNotifications();
    updateMetrics();

    showToast(`✅ Notificação Push "${title}" disparada com sucesso!`);
}

// Render Users Table
function renderUsers() {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    const searchTerm = document.getElementById('user-search-input')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('user-status-filter')?.value || 'ALL';

    const filteredUsers = state.users.filter(user => {
        const matchesSearch = user.name.toLowerCase().includes(searchTerm) || user.email.toLowerCase().includes(searchTerm);
        const matchesStatus = statusFilter === 'ALL' || user.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    if (filteredUsers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 24px;">
                    <i class="fa-solid fa-users-slash" style="font-size: 24px; margin-bottom: 8px; display: block;"></i>
                    Nenhum usuário retornado do banco Supabase ainda.<br>
                    <small>Sua conta do aplicativo Android aparecerá aqui assim que o aplicativo sincronizar com o Supabase.</small>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filteredUsers.map(user => `
        <tr>
            <td><strong>${user.name}</strong></td>
            <td>${user.email}</td>
            <td><i class="${user.method.includes('Google') ? 'fa-brands fa-google' : 'fa-solid fa-envelope'}"></i> ${user.method}</td>
            <td><span class="status-badge ${user.status === 'PRO' ? 'pro' : 'free'}">${user.status === 'PRO' ? '👑 PRO' : 'Gratuito'}</span></td>
            <td>${user.createdAt}</td>
            <td>
                <button class="btn btn-secondary" onclick="toggleUserStatus('${user.id}')">
                    ${user.status === 'PRO' ? 'Tornar Gratuito' : 'Promover PRO 👑'}
                </button>
            </td>
        </tr>
    `).join('');
}

function filterUsers() {
    renderUsers();
}

async function toggleUserStatus(userId) {
    const user = state.users.find(u => u.id === userId);
    if (user) {
        user.status = user.status === 'PRO' ? 'FREE' : 'PRO';

        if (supabaseClient) {
            try {
                await supabaseClient.from('users').update({ is_premium: user.status === 'PRO' }).eq('id', userId);
            } catch (e) {}
        }

        localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(state.users));
        renderUsers();
        updateMetrics();
        showToast(`Plano de ${user.name} alterado para ${user.status === 'PRO' ? 'PRO 👑' : 'Gratuito'}.`);
    }
}

async function openAddUserModal() {
    const name = prompt("Nome do Novo Usuário:");
    if (!name) return;
    const email = prompt("E-mail do Novo Usuário:");
    if (!email) return;

    const newUser = {
        id: 'usr_' + Date.now(),
        name: name.trim(),
        email: email.trim().lowercase(),
        method: 'Google OAuth',
        status: 'FREE',
        createdAt: new Date().toISOString().split('T')[0]
    };

    if (supabaseClient) {
        try {
            await supabaseClient.from('users').insert([{ full_name: name.trim(), email: email.trim().lowercase(), provider: 'google', is_premium: false }]);
        } catch (e) {
            console.warn('Erro ao inserir usuário no Supabase:', e);
        }
    }

    state.users.unshift(newUser);
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(state.users));

    renderUsers();
    updateMetrics();
    showToast(`Usuário ${name} salvo no banco de dados!`);
}

// Render History Tables
function renderNotificationHistory() {
    const tbody = document.getElementById('history-table-body');
    if (!tbody) return;

    if (state.notifications.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 18px;">
                    Nenhuma notificação enviada ainda. Use o formulário acima para compor uma notificação.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = state.notifications.map(notif => `
        <tr>
            <td>${notif.sentAt}</td>
            <td><strong>${notif.title}</strong></td>
            <td>${notif.message}</td>
            <td>${notif.target}</td>
            <td><strong>${notif.count}</strong></td>
            <td><span class="status-badge success"><i class="fa-solid fa-check"></i> ${notif.status}</span></td>
        </tr>
    `).join('');
}

function renderRecentNotifications() {
    const list = document.getElementById('recent-notifications-list');
    if (!list) return;

    if (state.notifications.length === 0) {
        list.innerHTML = `<li class="recent-item" style="color: var(--text-secondary);">Nenhuma notificação recente.</li>`;
        return;
    }

    list.innerHTML = state.notifications.slice(0, 4).map(notif => `
        <li class="recent-item">
            <div>
                <div class="recent-title">${notif.title}</div>
                <div class="recent-sub">${notif.message.substring(0, 45)}...</div>
            </div>
            <span class="recent-sub">${notif.sentAt}</span>
        </li>
    `).join('');
}

// Metrics Update
function updateMetrics() {
    document.getElementById('stat-total-users').textContent = state.users.length.toLocaleString('pt-BR');
    const proCount = state.users.filter(u => u.status === 'PRO').length;
    document.getElementById('stat-pro-users').textContent = proCount.toLocaleString('pt-BR');
    document.getElementById('stat-sent-notifications').textContent = (state.notifications.reduce((acc, n) => acc + (n.count || 1), 0)).toLocaleString('pt-BR');
}

async function refreshDashboardMetrics() {
    await loadRealDataFromDatabase();
    renderUsers();
    renderNotificationHistory();
    renderRecentNotifications();
    updateMetrics();
    showToast('🔄 Banco de Dados Supabase consultado!');
}

// Toast Helper
function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--accent-green)"></i> ${message}`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 4000);
}

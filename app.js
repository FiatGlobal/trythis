        // Убираем экран загрузки
        setTimeout(() => {
            const loadingScreen = document.getElementById('loadingScreen');
            if (loadingScreen) {
                loadingScreen.style.opacity = '0';
                setTimeout(() => loadingScreen.remove(), 500);
            }
        }, 2000);
    }

    // Инициализация мастер-админа
    initializeMasterAdmin() {
        const masterKey = {
            key: APP_CONFIG.MASTER_ADMIN_KEY,
            type: 'admin',
            createdBy: 'system',
            createdAt: new Date().toISOString(),
            expiresAt: null,
            maxUses: 999999,
            usedCount: 0,
            isActive: true,
            isMaster: true
        };

        // Проверяем, есть ли уже мастер-ключ
        if (!this.keyDatabase.some(k => k.key === APP_CONFIG.MASTER_ADMIN_KEY)) {
            this.keyDatabase.push(masterKey);
            this.saveToStorage();
        }
    }

    // Генерация персонального ключа
    generatePersonalKey() {
        this.personalKey = Array.from(crypto.getRandomValues(new Uint8Array(32)))
            .map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
        this.updatePersonalKeyDisplay();
    }

    updatePersonalKeyDisplay() {
        const keyElement = document.getElementById('personal-key');
        const displayElement = document.getElementById('personalKeyDisplay');
        
        if (keyElement) {
            keyElement.textContent = this.personalKey ? this.personalKey.substring(0, 8) + '...' : 'Не установлен';
        }
        
        if (displayElement) {
            displayElement.textContent = this.personalKey || 'Ключ не сгенерирован';
        }
        
        const timeElement = document.getElementById('key-updated');
        if (timeElement) {
            timeElement.textContent = new Date().toLocaleTimeString();
        }
    }

    // Автосохранение
    startAutoSave() {
        setInterval(() => {
            this.saveToStorage();
            this.cleanupExpiredKeys();
            this.cleanupOldMessages();
        }, APP_CONFIG.AUTO_SAVE_INTERVAL);
    }

    // Очистка устаревших данных
    cleanupExpiredKeys() {
        const now = new Date();
        this.keyDatabase = this.keyDatabase.filter(key => {
            if (!key.expiresAt) return true;
            return new Date(key.expiresAt) > now;
        });
    }

    cleanupOldMessages() {
        // Удаляем сообщения старше 30 дней
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        this.messageDatabase = this.messageDatabase.filter(msg => 
            msg.timestamp > thirtyDaysAgo
        );
    }

    // Обработчики событий
    bindEvents() {
        // Навигация
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const section = e.target.dataset.section;
                if (section === 'logout') {
                    this.logout();
                } else if (section) {
                    this.showSection(section);
                }
            });
        });

        // Авторизация
        document.getElementById('loginBtn').addEventListener('click', () => this.login());
        
        // Enter в полях ввода
        document.getElementById('accessKey').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.login();
        });
        document.getElementById('nickname').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.login();
        });
        
        // Чат
        document.getElementById('sendBtn').addEventListener('click', () => this.sendMessage());
        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Автоизменение размера textarea
        document.getElementById('messageInput').addEventListener('input', (e) => {
            this.autoResize(e.target);
        });

        // Пользователи
        document.getElementById('userSearch').addEventListener('input', (e) => this.searchUsers(e.target.value));
        document.getElementById('publicChatBtn').addEventListener('click', () => this.switchToPublicChat());
        document.getElementById('generateInviteBtn').addEventListener('click', () => this.generateUserInvite());

        // Админ
        document.getElementById('adminGenerateBtn').addEventListener('click', () => this.generateAdminInvites());

        // Настройки
        document.getElementById('regenerateKeyBtn').addEventListener('click', () => this.regeneratePersonalKey());
        document.getElementById('exportKeyBtn').addEventListener('click', () => this.exportPersonalKey());
    }

    // Авторизация
    login() {
        const keyInput = document.getElementById('accessKey');
        const nicknameInput = document.getElementById('nickname');
        
        const key = keyInput.value.trim();
        const nickname = nicknameInput.value.trim();
        
        // Валидация
        if (!key) {
            this.showNotification('Введите ключ доступа', 'error');
            keyInput.focus();
            return;
        }
        
        if (!nickname || nickname.length < APP_CONFIG.MIN_NICKNAME_LENGTH || nickname.length > APP_CONFIG.MAX_NICKNAME_LENGTH) {
            this.showNotification(`Никнейм должен быть от ${APP_CONFIG.MIN_NICKNAME_LENGTH} до ${APP_CONFIG.MAX_NICKNAME_LENGTH} символов`, 'error');
            nicknameInput.focus();
            return;
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(nickname)) {
            this.showNotification('Никнейм может содержать только буквы, цифры, _ и -', 'error');
            nicknameInput.focus();
            return;
        }

        // Проверка ключа доступа
        const keyRecord = this.keyDatabase.find(k => k.key === key && k.isActive);
        if (!keyRecord) {
            this.showNotification('Недействительный ключ доступа', 'error');
            keyInput.classList.add('error');
            return;
        }

        // Проверка срока действия
        if (keyRecord.expiresAt && new Date() > new Date(keyRecord.expiresAt)) {
            this.showNotification('Срок действия ключа истек', 'error');
            return;
        }

        // Проверка использований
        if (keyRecord.usedCount >= keyRecord.maxUses) {
            this.showNotification('Ключ уже исчерпан', 'error');
            return;
        }

        // Проверка уникальности никнейма
        if (this.userDatabase.some(u => u.nickname.toLowerCase() === nickname.toLowerCase() && u.isOnline)) {
            this.showNotification('Никнейм уже используется', 'error');
            nicknameInput.classList.add('error');
            return;
        }

        // Проверка лимита пользователей
        const onlineUsers = this.userDatabase.filter(u => u.isOnline).length;
        if (onlineUsers >= APP_CONFIG.MAX_USERS_PER_SESSION) {
            this.showNotification('Достигнут максимум одновременных пользователей', 'error');
            return;
        }

        // Создание пользователя
        this.currentUser = {
            id: this.generateUserId(),
            nickname: nickname,
            personalKey: this.personalKey,
            accessKey: key,
            isAdmin: keyRecord.type === 'admin' || keyRecord.isMaster,
            isMaster: keyRecord.isMaster || false,
            remainingInvites: keyRecord.type === 'admin' ? 999 : 1,
            createdAt: new Date().toISOString(),
            lastActivity: new Date().toISOString(),
            isOnline: true,
            sessionStart: this.sessionStart.toISOString()
        };

        this.isAdmin = this.currentUser.isAdmin;
        
        // Удаляем старую сессию пользователя если была
        this.userDatabase = this.userDatabase.filter(u => 
            u.nickname.toLowerCase() !== nickname.toLowerCase()
        );
        
        this.userDatabase.push(this.currentUser);
        
        // Помечаем ключ как использованный
        keyRecord.usedCount++;
        if (keyRecord.usedCount >= keyRecord.maxUses && !keyRecord.isMaster) {
            keyRecord.isActive = false;
        }
        
        this.saveToStorage();
        this.completeAuth();
    }

    completeAuth() {
        // Очищаем поля ввода
        document.getElementById('accessKey').value = '';
        document.getElementById('nickname').value = '';
        document.getElementById('accessKey').classList.remove('error');
        document.getElementById('nickname').classList.remove('error');

        // Обновляем интерфейс
        const userInfoText = `${this.currentUser.nickname}${this.isAdmin ? ' 👑' : ''}${this.currentUser.isMaster ? ' 🔱' : ''}`;
        document.getElementById('userInfo').textContent = userInfoText;
        document.getElementById('invites-left').textContent = this.isAdmin ? '∞' : this.currentUser.remainingInvites;
        document.getElementById('remainingInvites').textContent = this.isAdmin ? '∞' : this.currentUser.remainingInvites;

        // Обновляем настройки
        document.getElementById('sessionNickname').textContent = this.currentUser.nickname;
        document.getElementById('sessionStart').textContent = new Date(this.sessionStart).toLocaleString();
        document.getElementById('sessionInvites').textContent = this.isAdmin ? '∞' : this.currentUser.remainingInvites;

        // Показываем секции
        document.getElementById('nav-chat').classList.remove('hidden');
        document.getElementById('nav-settings').classList.remove('hidden');
        document.getElementById('nav-logout').classList.remove('hidden');
        document.getElementById('nav-auth').classList.add('hidden');
        
        if (this.isAdmin) {
            document.getElementById('nav-admin').classList.remove('hidden');
        }
        
        this.showNotification(`Добро пожаловать, ${this.currentUser.nickname}!`, 'success');
        this.showSection('chat');
        this.loadUsers();
        this.addSystemMessage(`Добро пожаловать в SecureChat Pro, ${this.currentUser.nickname}!`);
        
        // Обновляем активность
        this.startActivityTracking();
    }

    // Отслеживание активности пользователя
    startActivityTracking() {
        setInterval(() => {
            if (this.currentUser) {
                this.currentUser.lastActivity = new Date().toISOString();
                const userIndex = this.userDatabase.findIndex(u => u.id === this.currentUser.id);
                if (userIndex !== -1) {
                    this.userDatabase[userIndex] = this.currentUser;
                }
            }
        }, 60000); // Каждую минуту
    }

    generateUserId() {
        return 'usr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Работа с пользователями
    loadUsers() {
        // Очищаем неактивных пользователей (более 5 минут неактивности)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        this.userDatabase = this.userDatabase.filter(u => {
            if (!u.isOnline) return false;
            return new Date(u.lastActivity) > fiveMinutesAgo;
        });

        this.users = this.userDatabase.filter(u => u.isOnline && u.id !== this.currentUser.id);
        this.updateUsersList();
        
        if (this.isAdmin) {
            this.updateStats();
        }
    }

    updateUsersList(userList = null) {
        const listContainer = document.getElementById('usersList');
        const countElement = document.getElementById('onlineCount');
        
        const usersToShow = userList || this.users;
        
        listContainer.innerHTML = '';
        usersToShow.forEach(user => {
            const item = document.createElement('div');
            item.className = 'user-item';
            if (this.selectedUser && this.selectedUser.id === user.id) {
                item.classList.add('selected');
            }
            
            const firstLetter = user.nickname.charAt(0).toUpperCase();
            const badges = (user.isAdmin ? ' 👑' : '') + (user.isMaster ? ' 🔱' : '');
            
            item.innerHTML = `
                <div class="user-avatar">${firstLetter}</div>
                <div style="flex: 1;">
                    <div style="font-weight: 500;">${this.escapeHtml(user.nickname)}${badges}</div>
                    <div style="font-size: 10px; color: #666;">Онлайн</div>
                </div>
                <div class="user-status"></div>
            `;
            
            item.addEventListener('click', () => this.selectUser(user));
            listContainer.appendChild(item);
        });
        
        countElement.textContent = this.users.length;
    }

    selectUser(user) {
        this.selectedUser = user;
        this.isPrivateChat = true;
        
        document.getElementById('chatTitle').textContent = `🔒 Приватный чат с ${user.nickname}`;
        this.updateUsersList();
        this.loadPrivateMessages(user.id);
        this.showNotification(`Приватный чат с ${user.nickname}`, 'success');
    }

    switchToPublicChat() {
        this.selectedUser = null;
        this.isPrivateChat = false;
        
        document.getElementById('chatTitle').textContent = '💬 Общий чат';
        this.updateUsersList();
        this.loadPublicMessages();
        this.showNotification('Переключились на общий чат', 'success');
    }

    searchUsers(query) {
        if (!query.trim()) {
            this.updateUsersList();
            return;
        }

        const filteredUsers = this.users.filter(user => 
            user.nickname.toLowerCase().includes(query.toLowerCase())
        );
        this.updateUsersList(filteredUsers);
    }

    // Сообщения
    sendMessage() {
        const input = document.getElementById('messageInput');
        const message = input.value.trim();
        
        if (!message) return;
        
        if (message.length > APP_CONFIG.MAX_MESSAGE_LENGTH) {
            this.showNotification(`Сообщение слишком длинное (максимум ${APP_CONFIG.MAX_MESSAGE_LENGTH} символов)`, 'error');
            return;
        }

        const messageData = {
            id: this.generateMessageId(),
            content: message,
            senderId: this.currentUser.id,
            senderNickname: this.currentUser.nickname,
            recipientId: this.selectedUser?.id || null,
            timestamp: Date.now(),
            isPrivate: this.isPrivateChat,
            encrypted: this.encrypt(message)
        };

        this.messageDatabase.push(messageData);
        this.saveToStorage();
        
        this.addMessage(message, this.currentUser.nickname, true);
        input.value = '';
        this.autoResize(input);
    }

    generateMessageId() {
        return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    loadPrivateMessages(userId) {
        const messages = this.messageDatabase.filter(msg => 
            msg.isPrivate && 
            ((msg.senderId === this.currentUser.id && msg.recipientId === userId) ||
             (msg.senderId === userId && msg.recipientId === this.currentUser.id))
        ).sort((a, b) => a.timestamp - b.timestamp);

        this.displayMessages(messages);
    }

    loadPublicMessages() {
        const messages = this.messageDatabase.filter(msg => 
            !msg.isPrivate
        ).sort((a, b) => a.timestamp - b.timestamp);

        this.displayMessages(messages);
    }

    displayMessages(messages) {
        const messagesArea = document.getElementById('messagesArea');
        messagesArea.innerHTML = '';
        
        // Показываем последние 100 сообщений
        messages.slice(-100).forEach(msg => {
            const isOwn = msg.senderId === this.currentUser.id;
            let content = msg.content;
            
            if (msg.encrypted) {
                content = this.decrypt(msg.encrypted) || '[🔒 Не удалось расшифровать]';
            }
            
            this.addMessage(content, msg.senderNickname, isOwn, false);
        });
    }

    addMessage(content, sender, isOwn = false, scroll = true) {
        const messagesArea = document.getElementById('messagesArea');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isOwn ? 'own' : 'other'}`;
        
        const time = new Date().toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
        });

        messageDiv.innerHTML = `
            <div class="message-header">${this.escapeHtml(sender)} • ${time}</div>
            <div class="message-content">${this.escapeHtml(content)}</div>
        `;

        messagesArea.appendChild(messageDiv);
        
        if (scroll) {
            messagesArea.scrollTop = messagesArea.scrollHeight;
        }
    }

    addSystemMessage(content, scroll = true) {
        const messagesArea = document.getElementById('messagesArea');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message system';
        
        const time = new Date().toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
        });

        messageDiv.innerHTML = `
            <div class="message-header">🤖 Система • ${time}</div>
            <div class="message-content">${this.escapeHtml(content)}</div>
        `;

        messagesArea.appendChild(messageDiv);
        
        if (scroll) {
            messagesArea.scrollTop = messagesArea.scrollHeight;
        }
    }

    // Генерация приглашений
    generateUserInvite() {
        if (this.currentUser.remainingInvites <= 0 && !this.isAdmin) {
            this.showNotification('У вас нет доступных приглашений', 'error');
            return;
        }

        const inviteKey = this.generateAccessKey();
        const keyRecord = {
            key: inviteKey,
            type: 'user',
            createdBy: this.currentUser.id,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            maxUses: 1,
            usedCount: 0,
            isActive: true
        };

        this.keyDatabase.push(keyRecord);
        
        if (!this.isAdmin) {
            this.currentUser.remainingInvites--;
            const userIndex = this.userDatabase.findIndex(u => u.id === this.currentUser.id);
            if (userIndex !== -1) {
                this.userDatabase[userIndex] = this.currentUser;
            }
            document.getElementById('remainingInvites').textContent = this.currentUser.remainingInvites;
            document.getElementById('sessionInvites').textContent = this.currentUser.remainingInvites;
            
            if (this.currentUser.remainingInvites <= 0) {
                document.getElementById('generateInviteBtn').disabled = true;
                document.getElementById('generateInviteBtn').textContent = 'Приглашения исчерпаны';
            }
        }

        this.saveToStorage();

        const codeDisplay = document.getElementById('generatedInviteCode');
        codeDisplay.textContent = inviteKey;
        codeDisplay.classList.remove('hidden');
        
        this.copyToClipboard(inviteKey);
        this.showNotification('Ключ приглашения создан и скопирован!', 'success');
    }

    generateAdminInvites() {
        if (!this.isAdmin) {
            this.showNotification('Доступ запрещен', 'error');
            return;
        }

        const count = parseInt(document.getElementById('adminInviteCount').value) || 1;
        const expiryDays = parseInt(document.getElementById('adminInviteExpiry').value) || 7;
        
        if (count > 50) {
            this.showNotification('Максимум 50 ключей за раз', 'error');
            return;
        }

        const createdKeys = [];
        
        for (let i = 0; i < count; i++) {
            const inviteKey = this.generateAccessKey();
            const expiresAt = expiryDays > 0 ? 
                new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString() : null;
            
            const keyRecord = {
                key: inviteKey,
                type: 'user',
                createdBy: this.currentUser.id,
                createdAt: new Date().toISOString(),
                expiresAt: expiresAt,
                maxUses: 1,
                usedCount: 0,
                isActive: true
            };

            this.keyDatabase.push(keyRecord);
            createdKeys.push(keyRecord);
        }

        this.saveToStorage();
        this.updateAdminInviteList();
        this.updateStats();
        
        this.showNotification(`Создано ${count} ключей доступа`, 'success');
        
        // Копируем первый ключ
        if (createdKeys.length > 0) {
            this.copyToClipboard(createdKeys[0].key);
        }
    }

    updateAdminInviteList() {
        const listContainer = document.getElementById('adminInviteList');
        const adminKeys = this.keyDatabase
            .filter(k => k.createdBy === this.currentUser.id || this.currentUser.isMaster)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 20);

        listContainer.innerHTML = '';
        
        if (adminKeys.length === 0) {
            listContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">Нет созданных ключей</div>';
            return;
        }
        
        adminKeys.forEach(key => {
            const item = document.createElement('div');
            item.style.cssText = 'padding: 12px; border-bottom: 1px solid #404040; font-family: monospace; font-size: 11px; cursor: pointer; transition: background 0.2s;';
            
            const status = key.isActive ? 
                (key.usedCount > 0 ? '🟡 Использован' : '🟢 Активен') : 
                '🔴 Неактивен';
            
            const expires = key.expiresAt ? 
                new Date(key.expiresAt).toLocaleDateString() : 
                'Бессрочный';
            
            const masterBadge = key.isMaster ? ' 🔱' : '';
            
            item.innerHTML = `
                <div style="font-weight: bold; color: #fff; margin-bottom: 5px; word-break: break-all;">${key.key}${masterBadge}</div>
                <div style="font-size: 10px; color: #888;">
                    ${status} • Создан: ${new Date(key.createdAt).toLocaleDateString()} • Истекает: ${expires}
                </div>
                <div style="font-size: 10px; color: #666; margin-top: 3px;">
                    Использований: ${key.usedCount}/${key.maxUses === 999999 ? '∞' : key.maxUses}
                </div>
            `;
            
            item.addEventListener('click', () => {
                this.copyToClipboard(key.key);
                this.showNotification('Ключ скопирован в буфер обмена', 'success');
            });
            
            item.addEventListener('mouseenter', () => {
                item.style.background = 'rgba(64, 64, 64, 0.5)';
            });
            
            item.addEventListener('mouseleave', () => {
                item.style.background = 'transparent';
            });
            
            listContainer.appendChild(item);
        });
    }

    updateStats() {
        if (!this.isAdmin) return;
        
        const totalUsers = this.userDatabase.length;
        const onlineUsers = this.userDatabase.filter(u => u.isOnline).length;
        const activeKeys = this.keyDatabase.filter(k => k.isActive).length;
        
        document.getElementById('totalUsers').textContent = totalUsers;
        document.getElementById('onlineUsers').textContent = onlineUsers;
        document.getElementById('activeKeys').textContent = activeKeys;
        
        // Обновляем список пользователей
        const listContainer = document.getElementById('allUsersList');
        listContainer.innerHTML = '';
        
        if (this.userDatabase.length === 0) {
            listContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">Нет пользователей</div>';
            return;
        }
        
        // Сортируем пользователей: онлайн сверху, потом по дате создания
        const sortedUsers = [...this.userDatabase].sort((a, b) => {
            if (a.isOnline !== b.isOnline) return b.isOnline - a.isOnline;
            return new Date(b.createdAt) - new Date(a.createdAt);
        });
        
        sortedUsers.forEach(user => {
            const item = document.createElement('div');
            item.style.cssText = 'padding: 12px; border-bottom: 1px solid #404040; font-size: 12px;';
            
            const status = user.isOnline ? '🟢 Онлайн' : '🔴 Офлайн';
            const badges = (user.isAdmin ? ' 👑' : '') + (user.isMaster ? ' 🔱' : '');
            const lastActivity = user.lastActivity ? 
                new Date(user.lastActivity).toLocaleString() : 
                'Неизвестно';
            
            item.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
                    <div style="width: 24px; height: 24px; background: ${user.isOnline ? '#0078d4' : '#666'}; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; color: white;">
                        ${user.nickname.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <div style="font-weight: bold; color: #fff;">${user.nickname}${badges}</div>
                        <div style="font-size: 10px; color: #888;">
                            ${status} • Регистрация: ${new Date(user.createdAt).toLocaleDateString()}
                        </div>
                        <div style="font-size: 10px; color: #666;">
                            Последняя активность: ${lastActivity}
                        </div>
                    </div>
                </div>
            `;
            
            listContainer.appendChild(item);
        });
    }

    // Настройки
    regeneratePersonalKey() {
        if (confirm('⚠️ Смена ключа сделает невозможной расшифровку старых сообщений. Продолжить?')) {
            this.generatePersonalKey();
            
            this.currentUser.personalKey = this.personalKey;
            const userIndex = this.userDatabase.findIndex(u => u.id === this.currentUser.id);
            if (userIndex !== -1) {
                this.userDatabase[userIndex] = this.currentUser;
            }
            
            this.saveToStorage();
            this.showNotification('🔄 Персональный ключ перегенерирован', 'success');
        }
    }

    exportPersonalKey() {
        const keyData = {
            application: 'SecureChat Pro',
            version: APP_CONFIG.VERSION,
            nickname: this.currentUser.nickname,
            personalKey: this.personalKey,
            exportedAt: new Date().toISOString(),
            note: 'Храните этот файл в безопасном месте. Он содержит ваш персональный ключ шифрования.'
        };
        
        const blob = new Blob([JSON.stringify(keyData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SecureChat_${this.currentUser.nickname}_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.showNotification('💾 Ключ экспортирован в файл', 'success');
    }

    // Криптография
    encrypt(message) {
        try {
            const keyWordArray = CryptoJS.enc.Hex.parse(this.personalKey);
            const iv = CryptoJS.lib.WordArray.random(16);
            
            const encrypted = CryptoJS.AES.encrypt(message, keyWordArray, {
                iv: iv,
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7
            });
            
            return {
                ciphertext: encrypted.toString(),
                iv: iv.toString(),
                timestamp: Date.now(),
                version: APP_CONFIG.VERSION
            };
        } catch (error) {
            console.error('Ошибка шифрования:', error);
            return null;
        }
    }

    decrypt(encryptedData) {
        try {
            const keyWordArray = CryptoJS.enc.Hex.parse(this.personalKey);
            
            const decrypted = CryptoJS.AES.decrypt(
                encryptedData.ciphertext,
                keyWordArray,
                {
                    iv: CryptoJS.enc.Hex.parse(encryptedData.iv),
                    mode: CryptoJS.mode.CBC,
                    padding: CryptoJS.pad.Pkcs7
                }
            );
            
            return decrypted.toString(CryptoJS.enc.Utf8);
        } catch (error) {
            console.error('Ошибка расшифровки:', error);
            return null;
        }
    }

    generateAccessKey() {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Array.from(crypto.getRandomValues(new Uint8Array(16)))
            .map(b => b.toString(36).toUpperCase()).join('');
        const checksum = CryptoJS.SHA256(timestamp + random).toString().substring(0, 8).toUpperCase();
        return `SCP_${timestamp}_${random}_${checksum}`;
    }

    // Утилиты
    saveToStorage() {
        try {
            localStorage.setItem('scp_users', JSON.stringify(this.userDatabase));
            localStorage.setItem('scp_keys', JSON.stringify(this.keyDatabase));
            localStorage.setItem('scp_messages', JSON.stringify(this.messageDatabase));
            localStorage.setItem('scp_version', APP_CONFIG.VERSION);
        } catch (error) {
            console.error('Ошибка сохранения:', error);
            this.showNotification('Ошибка сохранения данных', 'error');
        }
    }

    loadFromStorage(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Ошибка загрузки:', error);
            return null;
        }
    }

    showSection(sectionName) {
        document.querySelectorAll('.section').forEach(section => {
            section.classList.remove('active');
        });
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });

        const targetSection = document.getElementById(sectionName);
        if (targetSection) {
            targetSection.classList.add('active');
        }
        
        const navItem = document.getElementById(`nav-${sectionName}`);
        if (navItem) {
            navItem.classList.add('active');
        }

        // Обновляем данные при переходе в админку
        if (sectionName === 'admin' && this.isAdmin) {
            setTimeout(() => {
                this.updateAdminInviteList();
                this.updateStats();
            }, 100);
        }

        // Обновляем пользователей при переходе в чат
        if (sectionName === 'chat') {
            this.loadUsers();
        }
    }

    showNotification(message, type = 'info') {
        // Удаляем старые уведомления
        document.querySelectorAll('.notification').forEach(n => n.remove());
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideOut 0.3s ease forwards';
                setTimeout(() => notification.remove(), 300);
            }
        }, 4000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    autoResize(textarea) {
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
        }
    }

    copyToClipboard(text) {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(() => {
                // Успешно скопировано
            }).catch(() => {
                this.fallbackCopyTextToClipboard(text);
            });
        } else {
            this.fallbackCopyTextToClipboard(text);
        }
    }

    fallbackCopyTextToClipboard(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            document.execCommand('copy');
        } catch (err) {
            console.error('Fallback copy failed', err);
        }
        
        document.body.removeChild(textArea);
    }

    logout() {
        if (confirm('🚪 Выйти из SecureChat Pro?')) {
            // Помечаем пользователя как офлайн
            if (this.currentUser) {
                this.currentUser.isOnline = false;
                this.currentUser.lastActivity = new Date().toISOString();
                const userIndex = this.userDatabase.findIndex(u => u.id === this.currentUser.id);
                if (userIndex !== -1) {
                    this.userDatabase[userIndex] = this.currentUser;
                }
                this.saveToStorage();
            }
            
            // Очищаем состояние
            this.currentUser = null;
            this.isAdmin = false;
            this.selectedUser = null;
            this.isPrivateChat = false;
            
            // Сброс интерфейса
            document.getElementById('nav-chat').classList.add('hidden');
            document.getElementById('nav-settings').classList.add('hidden');
            document.getElementById('nav-admin').classList.add('hidden');
            document.getElementById('nav-logout').classList.add('hidden');
            document.getElementById('nav-auth').classList.remove('hidden');
            
            document.getElementById('messagesArea').innerHTML = '';
            document.getElementById('userInfo').textContent = 'Не авторизован';
            document.getElementById('accessKey').value = '';
            document.getElementById('nickname').value = '';
            document.getElementById('invites-left').textContent = '0';
            
            const inviteCodeDisplay = document.getElementById('generatedInviteCode');
            if (inviteCodeDisplay) {
                inviteCodeDisplay.classList.add('hidden');
            }
            
            this.showSection('auth');
            this.showNotification('👋 Вы вышли из системы', 'success');
            
            // Перегенерируем персональный ключ для безопасности
            this.generatePersonalKey();
        }
    }
}

// Дополнительные утилиты и защита
class SecurityManager {
    static init() {
        this.addCSS();
        this.preventInspection();
        this.addKeyboardShortcuts();
    }

    static addCSS() {
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
            
            .user-select-none {
                -webkit-user-select: none;
                -moz-user-select: none;
                -ms-user-select: none;
                user-select: none;
            }
        `;
        document.head.appendChild(style);
    }

    static preventInspection() {
        // Отключаем drag&drop для безопасности
        document.addEventListener('dragstart', e => e.preventDefault());
        document.addEventListener('drop', e => e.preventDefault());
        
        // Блокируем выделение текста в критических местах
        document.querySelectorAll('.encryption-info, .admin-section-header').forEach(el => {
            el.classList.add('user-select-none');
        });
    }

    static addKeyboardShortcuts() {
        document.addEventListener('keydown', function(e) {
            // Глобальные горячие клавиши только если пользователь авторизован
            if (!window.app || !window.app.currentUser) return;
            
            // Ctrl+Enter для отправки сообщения
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                window.app.sendMessage();
            }
            
            // Escape для переключения на общий чат
            if (e.key === 'Escape' && window.app.isPrivateChat) {
                e.preventDefault();
                window.app.switchToPublicChat();
            }
            
            // Ctrl+L для переключения на чат
            if (e.ctrlKey && e.key === 'l') {
                e.preventDefault();
                window.app.showSection('chat');
            }
        });
    }
}

// Обработка ошибок
class ErrorHandler {
    static init() {
        window.addEventListener('error', this.handleError);
        window.addEventListener('unhandledrejection', this.handlePromiseRejection);
    }

    static handleError(event) {
        console.error('Глобальная ошибка:', event.error);
        if (window.app) {
            window.app.showNotification('⚠️ Произошла ошибка приложения', 'error');
        }
    }

    static handlePromiseRejection(event) {
        console.error('Необработанная ошибка Promise:', event.reason);
        if (window.app) {
            window.app.showNotification('⚠️ Ошибка обработки данных', 'error');
        }
    }
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', function() {
    // Проверяем поддержку необходимых API
    if (!window.crypto || !window.localStorage || typeof CryptoJS === 'undefined') {
        alert('❌ Ваш браузер не поддерживает необходимые технологии для работы SecureChat Pro. Пожалуйста, используйте современный браузер.');
        return;
    }

    // Инициализируем системы
    SecurityManager.init();
    ErrorHandler.init();
    
    // Создаем экземпляр приложения
    window.app = new SecureChatPro();
    
    console.log(`🔒 SecureChat Pro v${APP_CONFIG.VERSION} успешно запущен`);
    console.log(`👑 Мастер-ключ администратора: ${APP_CONFIG.MASTER_ADMIN_KEY}`);
});

// Защита от закрытия страницы
window.addEventListener('beforeunload', function(e) {
    if (window.app && window.app.currentUser) {
        e.preventDefault();
        e.returnValue = 'Вы уверены, что хотите покинуть SecureChat Pro? Ваша сессия будет завершена.';
        return e.returnValue;
    }
});

// Очистка при закрытии
window.addEventListener('unload', function() {
    if (window.app && window.app.currentUser) {
        // Помечаем пользователя как офлайн
        window.app.currentUser.isOnline = false;
        window.app.saveToStorage();
    }
});

// Экспорт для отладки (только в development)
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    window.SecureChatPro = SecureChatPro;
    window.APP_CONFIG = APP_CONFIG;
}'use strict';

// Константы приложения
const APP_CONFIG = {
    VERSION: '1.0.0',
    MASTER_ADMIN_KEY: 'ADMIN_MASTER_2024_SECURECHAT_PRO_XK7N9P2Q',
    MAX_MESSAGE_LENGTH: 1000,
    MAX_NICKNAME_LENGTH: 20,
    MIN_NICKNAME_LENGTH: 3,
    SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 часа
    AUTO_SAVE_INTERVAL: 30000, // 30 секунд
    MAX_USERS_PER_SESSION: 100
};

// Защита от отладки (в production)
(function() {
    const devtools = {open: false};
    
    setInterval(function() {
        if (window.outerHeight - window.innerHeight > 200 || 
            window.outerWidth - window.innerWidth > 200) {
            if (!devtools.open) {
                devtools.open = true;
                console.clear();
                console.warn('🔒 SecureChat Pro - Protected Application');
            }
        }
    }, 500);

    // Отключаем контекстное меню и горячие клавиши
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey && (e.key === 'u' || e.key === 'U')) ||
            (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j')) ||
            e.key === 'F12') {
            e.preventDefault();
            return false;
        }
    });
})();

class SecureChatPro {
    constructor() {
        this.currentUser = null;
        this.isAdmin = false;
        this.personalKey = null;
        this.users = [];
        this.selectedUser = null;
        this.isPrivateChat = false;
        this.sessionStart = new Date();
        
        // Базы данных (localStorage)
        this.userDatabase = this.loadFromStorage('scp_users') || [];
        this.keyDatabase = this.loadFromStorage('scp_keys') || [];
        this.messageDatabase = this.loadFromStorage('scp_messages') || [];
        
        this.init();
    }

    init() {
        this.generatePersonalKey();
        this.bindEvents();
        this.initializeMasterAdmin();
        this.startAutoSave();
        this.addSystemMessage('🔒 SecureChat Pro инициализирован');
        
        // Убира

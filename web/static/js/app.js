document.addEventListener('DOMContentLoaded', () => {
    // --- State ---
    const urlParams = new URLSearchParams(window.location.search);
    const sessionNameParam = urlParams.get('session');

    let currentProjectId = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    let currentProjectCustomName = sessionNameParam ? sessionNameParam : `Session ${new Date().toLocaleTimeString()}`;

    // Clean URL so it doesn't linger on refresh
    if (sessionNameParam) {
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // --- Elements ---
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const messagesContainer = document.getElementById('messages-container');
    const providerSelect = document.getElementById('llm-provider');

    const projectList = document.getElementById('project-list');
    const newProjectBtn = document.getElementById('new-project-btn');
    const togglePastWorkBtn = document.getElementById('toggle-past-work-btn');
    const pastWorkContainer = document.getElementById('past-work-container');
    const currentProjectName = document.getElementById('current-project-name');
    const documentList = document.getElementById('document-list');

    const memoryList = document.getElementById('memory-list');
    const addFactBtn = document.getElementById('add-fact-btn');
    const newFactInput = document.getElementById('new-fact-input');

    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const uploadStatus = document.getElementById('upload-status');

    const newWorkModal = document.getElementById('new-work-modal');
    const newWorkNameInput = document.getElementById('new-work-name');
    const confirmNewWorkBtn = document.getElementById('confirm-new-work-btn');
    const cancelNewWorkBtn = document.getElementById('cancel-new-work-btn');

    // --- Autoresize Textarea ---
    chatInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        if (this.value === '') this.style.height = 'auto';
    });

    // --- Chat Logic ---
    function appendMessage(content, isUser = false, isHtml = false) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${isUser ? 'user-msg' : 'system-msg'}`;

        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.innerHTML = isUser ? '<ion-icon name="person-outline"></ion-icon>' : '<ion-icon name="hardware-chip-outline"></ion-icon>';

        const bubble = document.createElement('div');
        bubble.className = 'bubble markdown-body';

        if (isHtml) {
            bubble.innerHTML = content;
        } else {
            bubble.innerHTML = content.replace(/\\n/g, '<br>');
        }

        msgDiv.appendChild(avatar);
        msgDiv.appendChild(bubble);
        messagesContainer.appendChild(msgDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        return msgDiv;
    }

    function showTypingIndicator() {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message system-msg`;
        msgDiv.id = 'typing-indicator';

        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.innerHTML = '<ion-icon name="hardware-chip-outline"></ion-icon>';

        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        bubble.innerHTML = `
            <div class="typing-indicator">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        `;

        msgDiv.appendChild(avatar);
        msgDiv.appendChild(bubble);
        messagesContainer.appendChild(msgDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function hideTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) indicator.remove();
    }

    async function sendChat() {
        const question = chatInput.value.trim();
        if (!question) return;

        appendMessage(question, true);
        chatInput.value = '';
        chatInput.style.height = 'auto';

        showTypingIndicator();

        // Gather specifically selected documents context
        const selectedDocs = [];
        document.querySelectorAll('.doc-checkbox').forEach(cb => {
            if (cb.checked) selectedDocs.push(cb.value);
        });

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: currentProjectId,
                    project_name: currentProjectCustomName,
                    question: question,
                    provider: providerSelect.value,
                    selected_documents: selectedDocs
                })
            });
            const data = await res.json();
            hideTypingIndicator();

            if (res.ok) {
                let finalHtml = marked.parse(data.answer);

                if ((data.facts && data.facts.length > 0) || (data.context && data.context.length > 0) || (data.new_facts && data.new_facts.length > 0)) {
                    finalHtml += '<div class="sources-box">';
                    if (data.context && data.context.length > 0) {
                        finalHtml += `<div class="source-item"><ion-icon name="document-text-outline"></ion-icon> ${data.context.length} Vector Passages Retrieved</div>`;
                    }
                    if (data.facts && data.facts.length > 0) {
                        finalHtml += `<div class="source-item"><ion-icon name="bulb-outline"></ion-icon> ${data.facts.length} Core Memories Used</div>`;
                    }
                    if (data.new_facts && data.new_facts.length > 0) {
                        finalHtml += `<div class="source-item" style="color: var(--accent-primary);"><ion-icon name="flash"></ion-icon> ${data.new_facts.length} New Memories Learned</div>`;
                    }
                    finalHtml += '</div>';
                }

                appendMessage(finalHtml, false, true);
                loadHistory();
                loadMemory();
            } else {
                appendMessage(`**Error:** ${data.detail}`, false, true);
            }
        } catch (e) {
            hideTypingIndicator();
            appendMessage(`**Connection Error:** Could not reach the server.`, false, true);
        }
    }

    sendBtn.addEventListener('click', sendChat);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChat();
        }
    });

    const historyList = document.getElementById('history-list');

    // --- Project Selection Logic ---
    async function loadProjects() {
        try {
            const res = await fetch('/api/projects');
            const data = await res.json();
            projectList.innerHTML = '';

            if (!data.projects || data.projects.length === 0) {
                projectList.innerHTML = '<li class="memory-item" style="justify-content:center; color: var(--text-muted);">No history</li>';
                return;
            }

            data.projects.forEach(proj => {
                const pid = proj.id;
                const pName = proj.name || pid.substring(0, 15) + '...';

                const li = document.createElement('li');
                li.className = 'memory-item';
                li.style.cursor = 'pointer';
                if (pid === currentProjectId) {
                    li.style.borderLeft = '3px solid var(--accent-primary)';
                    li.style.paddingLeft = '5px';
                }

                li.innerHTML = `
                    <ion-icon class="memory-icon" name="chatbox-ellipses-outline"></ion-icon>
                    <div style="font-size: 0.8rem; flex-grow: 1;">${pName}</div>
                `;

                li.addEventListener('click', () => {
                    currentProjectId = pid;
                    currentProjectCustomName = pName;
                    messagesContainer.innerHTML = '';
                    appendMessage(`Loaded Project Workspace: ${pName}`, false);
                    loadProjects();
                    loadHistory();
                    loadMemory();
                    loadDocuments();
                    currentProjectName.textContent = pName;
                    pastWorkContainer.style.display = 'none'; // Auto-hide list on selection
                });

                projectList.appendChild(li);
            });
        } catch (e) {
            console.error('Failed to load projects', e);
        }
    }

    // --- History Logic ---
    async function loadHistory() {
        try {
            const res = await fetch(`/api/history?project_id=${currentProjectId}`);
            const data = await res.json();
            // In the new UI, history stays in the main chat area while project-list takes the sidebar
            // So we don't render to sidebar anymore. We render to main chat!
            messagesContainer.innerHTML = ''; // Clear welcome message

            if (data.history && data.history.length > 0) {
                data.history.forEach(msg => {
                    let contentToRender = msg.content;
                    if (msg.role !== 'user') {
                        contentToRender = marked.parse(contentToRender);
                    }
                    appendMessage(contentToRender, msg.role === 'user', msg.role !== 'user');
                });
            } else {
                appendMessage(`New Chat Workspace Initiated. Nexus Core is ready.`, false);
            }

            // Sync the sidebar so it shows active project
            loadProjects();

        } catch (e) {
            console.error('Failed to load history', e);
        }
    }

    // --- Memory Logic ---
    async function loadMemory() {
        try {
            const res = await fetch(`/api/memory?project_id=${currentProjectId}`);
            const data = await res.json();
            memoryList.innerHTML = '';

            if (data.facts.length === 0) {
                memoryList.innerHTML = '<li class="memory-item" style="justify-content:center; color: var(--text-muted);">No core memories yet</li>';
                return;
            }

            data.facts.forEach(fact => {
                const li = document.createElement('li');
                li.className = 'memory-item';
                li.innerHTML = `
                    <ion-icon class="memory-icon" name="bulb-outline"></ion-icon>
                    <div>${fact.content}</div>
                `;
                memoryList.appendChild(li);
            });
        } catch (e) {
            console.error('Failed to load memory', e);
        }
    }

    async function addMemory() {
        const fact = newFactInput.value.trim();
        if (!fact) return;

        try {
            const res = await fetch('/api/memory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project_id: currentProjectId, fact: fact, source: 'user' })
            });
            if (res.ok) {
                newFactInput.value = '';
                loadMemory();
            }
        } catch (e) {
            console.error('Failed to add memory', e);
        }
    }

    addFactBtn.addEventListener('click', addMemory);
    newFactInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addMemory();
    });

    // --- Upload Logic ---
    uploadZone.addEventListener('click', () => fileInput.click());

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleUpload(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleUpload(e.target.files[0]);
        }
    });

    async function handleUpload(file) {
        if (!file.name.endsWith('.pdf') && !file.name.endsWith('.md')) {
            uploadStatus.className = 'status-msg error';
            uploadStatus.textContent = 'Only PDF and MD files allowed.';
            return;
        }

        uploadStatus.className = 'status-msg';
        uploadStatus.textContent = `Uploading ${file.name}...`;

        const formData = new FormData();
        formData.append('project_id', currentProjectId);
        formData.append('file', file);

        try {
            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (res.ok) {
                uploadStatus.textContent = data.message;
                loadDocuments();
                setTimeout(() => { uploadStatus.textContent = ''; }, 5000);
            } else {
                uploadStatus.className = 'status-msg error';
                uploadStatus.textContent = data.detail;
            }
        } catch (e) {
            uploadStatus.className = 'status-msg error';
            uploadStatus.textContent = 'Upload failed. Check connection.';
        }
    }

    // --- Document & Project Logic ---
    async function loadDocuments() {
        try {
            const res = await fetch(`/api/documents?project_id=${currentProjectId}`);
            const data = await res.json();
            documentList.innerHTML = '';

            if (!data.documents || data.documents.length === 0) {
                documentList.innerHTML = '<li class="memory-item" style="justify-content:center; color: var(--text-muted);">No documents yet</li>';
                return;
            }

            data.documents.forEach(filename => {
                const li = document.createElement('li');
                li.className = 'doc-item';
                li.innerHTML = `
                    <div class="doc-name" style="display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" class="doc-checkbox" value="${filename}" checked style="cursor: pointer;">
                        <ion-icon name="document-text-outline" style="color: var(--accent-primary);"></ion-icon>
                        <span title="${filename}">${filename.length > 20 ? filename.substring(0, 20) + '...' : filename}</span>
                    </div>
                    <button class="delete-doc-btn" data-filename="${filename}" title="Delete Document">
                        <ion-icon name="trash-outline"></ion-icon>
                    </button>
                `;
                documentList.appendChild(li);
            });

            document.querySelectorAll('.delete-doc-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const fname = e.currentTarget.getAttribute('data-filename');
                    if (confirm(`Remove ${fname} from the vector database?`)) {
                        await deleteDocument(fname);
                    }
                });
            });
        } catch (e) {
            console.error('Failed to load documents', e);
        }
    }

    async function deleteDocument(filename) {
        try {
            const res = await fetch(`/api/documents/${currentProjectId}/${filename}`, { method: 'DELETE' });
            if (res.ok) loadDocuments();
        } catch (e) {
            console.error('Failed to delete document', e);
        }
    }

    if (newProjectBtn) {
        newProjectBtn.addEventListener('click', () => {
            // Hide past work menu if open
            if (pastWorkContainer) pastWorkContainer.style.display = 'none';

            newWorkNameInput.value = `Session ${new Date().toLocaleTimeString()}`;
            newWorkModal.style.display = 'flex';
            newWorkNameInput.focus();
        });
    }

    if (cancelNewWorkBtn) {
        cancelNewWorkBtn.addEventListener('click', () => {
            newWorkModal.style.display = 'none';
        });
    }

    if (confirmNewWorkBtn) {
        confirmNewWorkBtn.addEventListener('click', () => {
            const sessionName = newWorkNameInput.value.trim() || `Session ${new Date().toLocaleTimeString()}`;
            newWorkModal.style.display = 'none';

            // Open a new browser window/tab immediately after clicking the trusted modal button
            window.open(window.location.pathname + '?session=' + encodeURIComponent(sessionName), '_blank');
        });
    }

    // Allow Enter key to submit modal
    if (newWorkNameInput) {
        newWorkNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                confirmNewWorkBtn.click();
            }
        });
    }

    if (togglePastWorkBtn && pastWorkContainer) {
        togglePastWorkBtn.addEventListener('click', () => {
            if (pastWorkContainer.style.display === 'none' || pastWorkContainer.style.display === '') {
                pastWorkContainer.style.display = 'flex';
                loadProjects();
            } else {
                pastWorkContainer.style.display = 'none';
            }
        });
    }

    // Initial load
    loadMemory();
    loadDocuments();
    loadHistory();
});

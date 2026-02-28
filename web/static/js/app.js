document.addEventListener('DOMContentLoaded', () => {
    // --- State ---
    const urlParams = new URLSearchParams(window.location.search);
    const sessionNameParam = urlParams.get('session');
    const projectIdParam = urlParams.get('project_id'); // Support opening an existing project

    let currentProjectId = sessionStorage.getItem('nexus_current_project_id');
    let currentProjectCustomName = sessionStorage.getItem('nexus_current_project_name');

    // If there's a URL parameter to force a new session name (e.g. from clicking New Work)
    if (sessionNameParam) {
        currentProjectId = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        currentProjectCustomName = sessionNameParam;
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    // If there's a URL parameter requesting a specific existing project ID
    else if (projectIdParam) {
        currentProjectId = projectIdParam;
        currentProjectCustomName = urlParams.get('project_name') || "Project Workspace";
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    // If no existing session in this tab, create one
    else if (!currentProjectId) {
        currentProjectId = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        currentProjectCustomName = `Session ${new Date().toLocaleTimeString()}`;
    }

    sessionStorage.setItem('nexus_current_project_id', currentProjectId);
    sessionStorage.setItem('nexus_current_project_name', currentProjectCustomName);

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

    const imageUploadZone = document.getElementById('image-upload-zone');
    const imageInput = document.getElementById('image-input');
    const imagePreviewContainer = document.getElementById('image-preview-container');
    const imagePreview = document.getElementById('image-preview');
    const removeImageBtn = document.getElementById('remove-image-btn');

    // Track attached images (we'll only allow one for now to keep it simple, but array allows expansion)
    let attachedImagesBase64 = [];

    const newWorkModal = document.getElementById('new-work-modal');
    const newWorkNameInput = document.getElementById('new-work-name');
    const confirmNewWorkBtn = document.getElementById('confirm-new-work-btn');
    const cancelNewWorkBtn = document.getElementById('cancel-new-work-btn');

    // Attach custom name to UI immediately
    if (currentProjectName) {
        currentProjectName.textContent = currentProjectCustomName;
    }
    const kbProjectLabel = document.getElementById('kb-project-label');
    if (kbProjectLabel) {
        kbProjectLabel.textContent = currentProjectCustomName;
    }

    // --- Autoresize Textarea ---
    chatInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        if (this.value === '') this.style.height = 'auto';
    });

    // --- Chat Logic ---
    function appendMessage(content, isUser = false, isHtml = false) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `flex gap-4 mb-8 group animate-fade-in-up ${isUser ? 'flex-row-reverse' : ''}`;

        const avatar = document.createElement('div');
        if (isUser) {
            avatar.className = 'size-8 rounded-full bg-gradient-to-br from-primary to-purple-600 p-[1px] flex items-center justify-center shrink-0 mt-1 overflow-hidden';
            avatar.innerHTML = `<span class="rounded-full h-full w-full border-2 border-surface-dark bg-background-dark flex items-center justify-center text-xs font-bold text-white">U</span>`;
        } else {
            avatar.className = 'size-8 rounded-lg bg-gradient-to-br from-primary to-indigo-700 flex items-center justify-center shrink-0 shadow-lg shadow-primary/20 mt-1';
            avatar.innerHTML = `<span class="material-symbols-outlined text-white text-[16px]">smart_toy</span>`;
        }

        const contentWrapper = document.createElement('div');
        contentWrapper.className = `flex-1 max-w-3xl flex flex-col ${isUser ? 'items-end' : ''}`;

        const headerNode = document.createElement('div');
        headerNode.className = `flex items-baseline gap-2 mb-1 ${isUser ? 'flex-row-reverse' : ''}`;
        headerNode.innerHTML = `<span class="text-sm font-semibold text-white">${isUser ? 'You' : 'Nexus AI'}</span>
                                <span class="text-xs text-slate-500">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;

        const bubble = document.createElement('div');
        if (isUser) {
            bubble.className = 'px-5 py-3 rounded-2xl rounded-tr-sm bg-surface-lighter border border-border-dark text-slate-200 text-sm leading-relaxed shadow-sm bubble';
        } else {
            bubble.className = 'prose prose-invert prose-sm max-w-none text-slate-300 leading-relaxed bubble markdown-body';
        }

        if (isHtml) {
            bubble.innerHTML = content;
        } else {
            bubble.innerHTML = content.replace(/\\n/g, '<br>');
        }

        contentWrapper.appendChild(headerNode);
        contentWrapper.appendChild(bubble);

        msgDiv.appendChild(avatar);
        msgDiv.appendChild(contentWrapper);
        messagesContainer.appendChild(msgDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        return msgDiv;
    }

    function showTypingIndicator() {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'flex gap-4 mb-8 group animate-fade-in-up';
        msgDiv.id = 'typing-indicator';

        const avatar = document.createElement('div');
        avatar.className = 'size-8 rounded-lg bg-gradient-to-br from-primary to-indigo-700 flex items-center justify-center shrink-0 shadow-lg shadow-primary/20 mt-1';
        avatar.innerHTML = `<span class="material-symbols-outlined text-white text-[16px]">smart_toy</span>`;

        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'flex-1 max-w-3xl';

        const headerNode = document.createElement('div');
        headerNode.className = 'flex items-baseline gap-2 mb-1';
        headerNode.innerHTML = `<span class="text-sm font-semibold text-white">Nexus AI</span><span class="text-xs text-slate-500">Thinking...</span>`;

        const bubble = document.createElement('div');
        bubble.className = 'bg-surface-lighter/50 border border-border-dark rounded-xl p-4 mb-3 max-w-[200px] animate-pulse';
        bubble.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="size-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                <span class="text-xs font-medium text-slate-300">Synthesizing...</span>
            </div>
        `;

        contentWrapper.appendChild(headerNode);
        contentWrapper.appendChild(bubble);
        msgDiv.appendChild(avatar);
        msgDiv.appendChild(contentWrapper);

        messagesContainer.appendChild(msgDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function hideTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) indicator.remove();
    }

    async function sendChat() {
        const question = chatInput.value.trim();
        if (!question && attachedImagesBase64.length === 0) return;

        let displayQuestion = question;
        if (attachedImagesBase64.length > 0) {
            displayQuestion += `<br><img src="${attachedImagesBase64[0]}" style="max-width: 250px; border-radius: 8px; margin-top: 10px;" />`;
        }

        appendMessage(displayQuestion, true, true);
        chatInput.value = '';
        chatInput.style.height = 'auto';

        showTypingIndicator();

        // Gather specifically selected documents context
        const selectedDocs = [];
        document.querySelectorAll('.doc-checkbox').forEach(cb => {
            if (cb.checked) selectedDocs.push(cb.value);
        });

        try {
            const payload = {
                project_id: currentProjectId,
                project_name: currentProjectCustomName,
                question: question,
                provider: providerSelect.value,
                selected_documents: selectedDocs,
                images: attachedImagesBase64
            };

            // Clear image attachments after sending
            clearImageAttachment();

            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
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

                // Poll for background memory extraction updates
                setTimeout(loadMemory, 3500);
                setTimeout(loadMemory, 8000);
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

    // --- Paste Event for Images ---
    chatInput.addEventListener('paste', (e) => {
        if (!e.clipboardData || !e.clipboardData.items) return;

        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                if (!file) continue;

                const reader = new FileReader();
                reader.onload = function (event) {
                    const base64String = event.target.result;
                    attachedImagesBase64 = [base64String];

                    // Show preview
                    imagePreview.src = base64String;
                    imagePreviewContainer.style.display = 'flex';

                    imageUploadZone.style.color = 'var(--accent-primary)';
                    imageUploadZone.style.borderColor = 'var(--accent-primary)';

                    uploadStatus.textContent = "Image ready";
                    setTimeout(() => { uploadStatus.textContent = ''; }, 3000);
                };
                reader.readAsDataURL(file);
                // Prevent default so we don't paste the filename text into the box (if any)
                e.preventDefault();
                break;
            }
        }
    });

    const historyList = document.getElementById('history-list');

    // --- Project Selection Logic ---
    async function loadProjects() {
        try {
            const res = await fetch('/api/projects');
            const data = await res.json();
            projectList.innerHTML = '';

            // Ensure the active project has its correct name from the database (solves caching/URL missing issues)
            if (data.projects) {
                const activeProj = data.projects.find(p => p.id === currentProjectId);
                if (activeProj && activeProj.name) {
                    currentProjectCustomName = activeProj.name;
                    sessionStorage.setItem('nexus_current_project_name', currentProjectCustomName);
                    if (currentProjectName) currentProjectName.textContent = currentProjectCustomName;
                    const kbLabel = document.getElementById('kb-project-label');
                    if (kbLabel) kbLabel.textContent = currentProjectCustomName;
                }
            }

            if (!data.projects || data.projects.length === 0) {
                projectList.innerHTML = '<li class="memory-item" style="justify-content:center; color: var(--text-muted);">No history</li>';
                return;
            }

            data.projects.forEach(proj => {
                const pid = proj.id;
                const pName = proj.name || pid.substring(0, 15) + '...';

                const li = document.createElement('li');
                li.className = 'p-3 bg-surface-lighter rounded-lg border border-border-dark hover:border-primary/40 transition-colors group cursor-pointer flex items-center gap-3';
                if (pid === currentProjectId) {
                    li.style.borderColor = 'var(--primary)';
                    li.style.background = 'rgba(96, 107, 210, 0.1)';
                }

                li.innerHTML = `
                    <div class="bg-primary/10 p-1.5 rounded text-primary">
                        <span class="material-symbols-outlined text-[18px]">history</span>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-slate-200 truncate group-hover:text-primary transition-colors">${pName}</p>
                    </div>
                `;

                li.addEventListener('click', () => {
                    // Open the past project directly in a NEW window/tab so we don't destroy the current active session
                    window.open(window.location.pathname + '?project_id=' + encodeURIComponent(pid) + '&project_name=' + encodeURIComponent(pName), '_blank');
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
                    // For both user and assistant, we now allow HTML because we inject <img> tags
                    appendMessage(contentToRender, msg.role === 'user', true);
                });
            } else {
                appendMessage(`**System Ready.** Nexus Core is online with full semantic capabilities.`, false, true);
            }

            // Sync the sidebar so it shows active project
            loadProjects();

        } catch (e) {
            console.error('Failed to load history', e);
        }
    }

    // --- Memory Logic ---
    async function loadMemory() {
        const sortMode = document.getElementById('memory-sort-select').value;
        try {
            const res = await fetch(`/api/memory?project_id=${currentProjectId}&sort_by=${sortMode}`);
            const data = await res.json();
            memoryList.innerHTML = '';

            if (data.facts.length === 0) {
                memoryList.innerHTML = '<li class="p-3 text-sm text-center text-slate-500">No core memories yet</li>';
                return;
            }

            data.facts.forEach(fact => {
                const li = document.createElement('div');
                li.className = 'bg-surface-lighter/50 rounded-lg p-3 border border-border-dark relative overflow-hidden group mb-2';

                let borderColor = 'white';
                if (fact.tier === 'Research') borderColor = '#c084fc';
                if (fact.tier === 'Project') borderColor = '#60a5fa';
                if (fact.tier === 'Personal') borderColor = '#4ade80';
                if (fact.tier === 'Conversational') borderColor = '#9ca3af';

                li.innerHTML = `
                    <div class="absolute top-0 left-0 w-1 h-full" style="background-color: ${borderColor};"></div>
                    <div class="flex justify-between items-start mb-2 pl-2">
                        <span class="px-2 py-0.5 rounded-full bg-white/5 text-[10px] text-slate-400 border border-white/5" style="color: ${borderColor}">${fact.tier || 'Memory'}</span>
                    </div>
                    <p class="text-sm text-slate-300 pl-2 leading-relaxed">${fact.content}</p>
                    <div class="mt-2 pl-2 flex items-center gap-2 text-[10px] text-slate-500">
                        <span class="material-symbols-outlined text-[12px]">psychology</span>
                        ${Math.round((fact.relevance_score || 0.5) * 100)}% Relevance
                        <button onclick="if(confirm('Delete memory?')) { deleteMem('${fact.id}') }" class="ml-auto hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><span class="material-symbols-outlined text-[14px]">delete</span></button>
                    </div>
                `;
                memoryList.appendChild(li);
            });
        } catch (e) {
            console.error('Failed to load memory', e);
        }
    }

    // Quick hack attached to window since dynamically setting onclick in HTML snippet 
    window.deleteMem = async function (id) {
        await fetch(`/api/memory/${currentProjectId}/${id}`, { method: 'DELETE' });
        loadMemory();
    };

    // Trigger reload when sorting changes
    document.getElementById('memory-sort-select').addEventListener('change', loadMemory);

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

    // --- Upload Logic for Documents ---
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
        const allowedExtensions = ['.pdf', '.md', '.docx', '.doc', '.pptx', '.ppt', '.xlsx', '.csv'];
        const isValid = allowedExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

        if (!isValid) {
            uploadStatus.className = 'status-msg error';
            uploadStatus.textContent = 'Only Documents, Spreadsheets, and MD files allowed.';
            return;
        }

        uploadStatus.className = 'status-msg';
        uploadStatus.textContent = `Analyzing and Vectorizing ${file.name}... (Extracting images may take a moment)`;

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

    // --- Upload Logic for Images (Vision) ---
    imageUploadZone.addEventListener('click', () => imageInput.click());

    imageInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            const file = e.target.files[0];
            const reader = new FileReader();

            reader.onload = function (event) {
                const base64String = event.target.result;
                attachedImagesBase64 = [base64String];

                // Show preview
                imagePreview.src = base64String;
                imagePreviewContainer.style.display = 'flex';

                imageUploadZone.style.color = 'var(--accent-primary)';
                imageUploadZone.style.borderColor = 'var(--accent-primary)';

                uploadStatus.textContent = "Image ready";
                setTimeout(() => { uploadStatus.textContent = ''; }, 3000);
            };

            reader.readAsDataURL(file);
        }
    });

    removeImageBtn.addEventListener('click', () => {
        clearImageAttachment();
    });

    function clearImageAttachment() {
        attachedImagesBase64 = [];
        imageInput.value = '';
        imagePreview.src = '';
        imagePreviewContainer.style.display = 'none';
        imageUploadZone.style.color = '';
        imageUploadZone.style.borderColor = '';
    }

    // --- Document & Project Logic ---
    async function loadDocuments() {
        try {
            const res = await fetch(`/api/documents?project_id=${currentProjectId}`);
            const data = await res.json();
            documentList.innerHTML = '';

            if (!data.documents || data.documents.length === 0) {
                documentList.innerHTML = '<li class="p-3 text-sm text-center text-slate-500">No documents yet</li>';
                return;
            }

            data.documents.forEach(filename => {
                const li = document.createElement('div');
                li.className = 'p-3 bg-surface-lighter rounded-lg border border-border-dark hover:border-primary/40 transition-colors group cursor-pointer mb-2';
                li.innerHTML = `
                    <div class="flex items-start gap-3">
                        <div class="bg-primary/10 p-1.5 rounded text-primary">
                            <span class="material-symbols-outlined text-[18px]">document_scanner</span>
                        </div>
                        <div class="flex-1 min-w-0">
                            <label class="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" class="doc-checkbox w-3 h-3 text-primary bg-surface-dark border-border-dark rounded focus:ring-primary focus:ring-offset-surface-dark" value="${filename}" checked>
                                <p class="text-sm font-medium text-slate-200 truncate group-hover:text-primary transition-colors">${filename}</p>
                            </label>
                            <p class="text-xs text-slate-500 mt-0.5">Vector Store • <span class="text-emerald-400">Indexed</span></p>
                        </div>
                        <button class="delete-doc-btn text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all" data-filename="${filename}" title="Delete Document">
                            <span class="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                    </div>
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

    let kbFactsData = []; // Store globally for client-side search filtering
    let kbEdgesData = []; // Store graph edges for D3 render
    let kbActiveTierFilter = 'All'; // Track active tier filter for KB
    let kbActiveSort = 'tier'; // Track active sort option for KB list

    // --- Knowledge Base Logic ---
    window.loadKnowledgeBase = async function () {
        const kbContainer = document.getElementById('kb-facts-container');
        kbContainer.innerHTML = '<div class="flex items-center justify-center h-full text-slate-500 text-sm">Loading Knowledge Base...</div>';

        // Update the KB project label
        const kbLabel = document.getElementById('kb-project-label');
        if (kbLabel) kbLabel.textContent = currentProjectCustomName;

        try {
            // Always fetch scoped to the active project
            const kbUrl = `/api/knowledge?project_id=${currentProjectId}`;
            const edgesUrl = `/api/edges?project_id=${currentProjectId}`;

            const [kbRes, edgesRes] = await Promise.all([
                fetch(kbUrl),
                fetch(edgesUrl)
            ]);

            const kbData = await kbRes.json();
            const edgesData = await edgesRes.json();

            kbFactsData = kbData.knowledge || [];
            kbEdgesData = edgesData.edges || [];

            renderKnowledgeBase(); // Re-render with any active search term
        } catch (e) {
            console.error('Failed to load KB', e);
            kbContainer.innerHTML = '<div class="text-red-400 text-sm p-4">Error loading Knowledge Base</div>';
        }
    };

    function renderKnowledgeBase() {
        const kbContainer = document.getElementById('kb-facts-container');
        const searchTerm = (document.getElementById('kb-search-input').value || '').toLowerCase();

        // 1. Filter by search term and tier
        const filteredFacts = kbFactsData.filter(fact => {
            const matchesContent = fact.content && fact.content.toLowerCase().includes(searchTerm);
            const matchesSource = fact.source && fact.source.toLowerCase().includes(searchTerm);
            const matchesProject = fact.project_name && fact.project_name.toLowerCase().includes(searchTerm);
            const matchesTier = kbActiveTierFilter === 'All' || (fact.tier || 'Conversational') === kbActiveTierFilter;
            return matchesTier && (matchesContent || matchesSource || matchesProject);
        });

        if (filteredFacts.length === 0) {
            kbContainer.innerHTML = '<div class="flex items-center justify-center p-8 text-slate-500">No facts found.</div>';
            return;
        }

        // 2. Sort the array natively in JS
        if (kbActiveSort === 'chronological') {
            filteredFacts.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        } else if (kbActiveSort === 'activation') {
            filteredFacts.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));
        }

        // 3. Group by tier (or single list if sorted)
        let grouped = {};

        if (kbActiveSort === 'tier') {
            grouped = { 'Research': [], 'Project': [], 'Personal': [], 'Conversational': [] };
            filteredFacts.forEach(fact => {
                const tier = fact.tier || 'Conversational';
                if (!grouped[tier]) grouped[tier] = [];
                grouped[tier].push(fact);
            });
        } else if (kbActiveSort === 'chronological') {
            grouped = { 'Timeline': filteredFacts };
        } else if (kbActiveSort === 'activation') {
            grouped = { 'Relevance': filteredFacts };
        }

        kbContainer.innerHTML = ''; // Clear

        const tierConfigs = {
            'Conversational': { title: 'Conversational Tier', color: 'slate', accent: 'slate-400', icon: 'folder_open' },
            'Personal': { title: 'Personal Tier', color: 'emerald', accent: 'emerald-500', icon: 'person_search' },
            'Project': { title: 'Project Tier', color: 'primary', accent: 'primary', icon: 'deployed_code' },
            'Research': { title: 'Research Tier', color: 'purple', accent: 'purple-500', icon: 'science' },
            'Timeline': { title: 'Timeline - Newest First', color: 'sky', accent: 'sky-400', icon: 'schedule' },
            'Relevance': { title: 'Relevance - Ranked', color: 'amber', accent: 'amber-400', icon: 'star' }
        };

        for (const [tier, facts] of Object.entries(grouped)) {
            if (facts.length === 0) continue;

            const c = tierConfigs[tier] || tierConfigs['Conversational'];
            const groupDiv = document.createElement('div');
            groupDiv.className = 'space-y-2';

            groupDiv.innerHTML = `
                    <div class="flex items-center justify-between pt-1">
                        <h2 class="text-[10px] font-bold uppercase tracking-widest text-${c.color}-500">${c.title}</h2>
                        <span class="text-[9px] bg-${c.color}-500/10 text-${c.color}-500 px-2 py-0.5 rounded-full font-medium">${facts.length} Facts</span>
                    </div>
                `;

            facts.forEach(fact => {
                const card = document.createElement('div');
                card.className = `glass-panel rounded-lg py-2.5 px-3 border-l-[3px] border-l-${c.accent}`;

                const score = Math.round((fact.relevance_score || 0.5) * 100);
                const projName = fact.project_name || 'Unknown Project';

                let displaySource = fact.source || '';
                const sourceMap = { 'auto_extract': 'Auto Extracted', 'user': 'User Input', 'image': 'Image Analysis', 'Conversation': 'Chat', 'conversation': 'Chat' };
                displaySource = sourceMap[displaySource] || displaySource;
                let sourceIcon = 'chat';
                if (fact.source === 'auto_extract') sourceIcon = 'auto_awesome';
                else if (fact.source === 'user') sourceIcon = 'person';
                else if (fact.source === 'image') sourceIcon = 'image';
                else if (fact.source && !sourceMap[fact.source]) sourceIcon = 'description';
                const sourceName = displaySource ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-${c.color}-500/10 text-${c.accent} text-[9px] ml-2 border border-${c.color}-500/20"><span class="material-symbols-outlined text-[10px]">${sourceIcon}</span>${escapeHtml(displaySource)}</span>` : '';

                card.innerHTML = `
                        <div class="flex justify-between items-start gap-3">
                            <p class="text-[13px] leading-snug text-slate-200 flex-1">${escapeHtml(fact.content)}${sourceName}</p>
                            <div class="flex items-center gap-1 shrink-0">
                                <span class="text-[11px] font-bold text-${c.accent} mr-2">${score}% <span class="text-[9px] text-slate-500 font-normal">Rel.</span></span>
                                <button onclick="editKbFact(this.dataset.id, this.dataset.content, this.dataset.tier)" data-id="${escapeHtml(fact.id)}" data-content="${escapeHtml(fact.content)}" data-tier="${escapeHtml(fact.tier || 'Conversational')}" class="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors flex items-center justify-center">
                                    <span class="material-symbols-outlined text-[14px]">edit</span>
                                </button>
                                <button onclick="deleteKbFact(this.dataset.id)" data-id="${escapeHtml(fact.id)}" class="p-1 rounded hover:bg-red-900/20 text-slate-400 hover:text-red-400 transition-colors flex items-center justify-center">
                                    <span class="material-symbols-outlined text-[14px]">delete</span>
                                </button>
                            </div>
                        </div>
                    `;
                groupDiv.appendChild(card);
            });

            kbContainer.appendChild(groupDiv);
        }
    }

    // --- Modals Logic for Editing & Deleting Facts ---

    window.closeDeleteKbModal = function () {
        const modal = document.getElementById('delete-kb-modal');
        modal.style.opacity = '0';
        setTimeout(() => { modal.style.display = 'none'; }, 200);
    };

    window.deleteKbFact = function (id) {
        const modal = document.getElementById('delete-kb-modal');
        document.getElementById('delete-kb-id').value = id;
        modal.style.display = 'flex';
        // Trigger reflow
        void modal.offsetWidth;
        modal.style.opacity = '1';
    };

    document.getElementById('confirm-kb-delete-btn').addEventListener('click', async () => {
        const id = document.getElementById('delete-kb-id').value;
        closeDeleteKbModal();

        // 1. Optimistic UI: Instantly remove from local memory
        globalKnowledgeData = globalKnowledgeData.filter(f => f.id !== id);
        renderKnowledgeBase();
        if (currentKbViewMode === 'map') renderMindMap();

        try {
            // 2. Background Network Request
            await fetch(`/api/memory/${id}`, { method: 'DELETE' });
            loadMemory(); // Refresh sidebar quietly
        } catch (e) {
            console.error(e);
            // On failure, reload from server to revert optimistic update
            window.loadKnowledgeBase();
        }
    });

    window.closeEditKbModal = function () {
        const modal = document.getElementById('edit-kb-modal');
        modal.style.opacity = '0';
        setTimeout(() => { modal.style.display = 'none'; }, 200);
    };

    window.editKbFact = function (id, currentContent, currentTier) {
        document.getElementById('edit-kb-id').textContent = id;
        document.getElementById('edit-kb-content').value = currentContent;
        document.getElementById('edit-kb-tier').value = currentTier;

        const modal = document.getElementById('edit-kb-modal');
        modal.style.display = 'flex';
        // Trigger reflow
        void modal.offsetWidth;
        modal.style.opacity = '1';
    };

    document.getElementById('save-kb-edit-btn').addEventListener('click', async () => {
        const id = document.getElementById('edit-kb-id').textContent;
        const newContent = document.getElementById('edit-kb-content').value;
        const newTier = document.getElementById('edit-kb-tier').value;

        if (!newContent.trim()) return;

        closeEditKbModal();

        // 1. Optimistic UI: Instantly update local memory
        const factIndex = globalKnowledgeData.findIndex(f => f.id === id);
        if (factIndex > -1) {
            globalKnowledgeData[factIndex].content = newContent;
            globalKnowledgeData[factIndex].tier = newTier;
            renderKnowledgeBase();
            if (currentKbViewMode === 'map') renderMindMap();
        }

        try {
            // 2. Background Network Request
            await fetch(`/api/memory/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: newContent, tier: newTier })
            });
            loadMemory();
        } catch (e) {
            console.error(e);
            // On failure, revert
            window.loadKnowledgeBase();
        }
    });

    // Simple HTML escape
    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Attach search listener
    const kbSearchBox = document.getElementById('kb-search-input');
    if (kbSearchBox) {
        kbSearchBox.addEventListener('input', () => {
            renderKnowledgeBase();
            if (currentKbViewMode === 'map') renderMindMap();
        });
    }

    // --- KB Tier Filter Logic ---
    window.setKbTierFilter = function (tier) {
        kbActiveTierFilter = tier;
        // Update pill styling
        document.querySelectorAll('.kb-tier-pill').forEach(pill => {
            pill.classList.remove('active');
            if (pill.getAttribute('data-tier') === tier) {
                pill.classList.add('active');
            }
        });
        renderKnowledgeBase();
        if (currentKbViewMode === 'map') renderMindMap();
    };

    // --- KB Sort Logic ---
    window.setKbSort = function (sortMethod) {
        kbActiveSort = sortMethod;
        renderKnowledgeBase();
    };



    // --- Mind Map View Logic ---
    let currentKbViewMode = 'list';

    window.toggleKbViewMode = function (mode) {
        currentKbViewMode = mode;
        const listContainer = document.getElementById('kb-facts-container');
        const mapContainer = document.getElementById('kb-map-container');

        if (mode === 'list') {
            listContainer.classList.remove('hidden');
            mapContainer.classList.add('hidden');
        } else {
            listContainer.classList.add('hidden');
            mapContainer.classList.remove('hidden');
            renderMindMap();
        }
    }

    window.renderMindMap = function () {
        const mapContainer = document.getElementById('kb-map-container');
        const searchInput = document.getElementById('kb-search-input');
        if (!mapContainer || currentKbViewMode !== 'map') return;

        // Ensure D3 is loaded
        if (typeof d3 === 'undefined') {
            mapContainer.innerHTML = '<div class="flex items-center justify-center h-full text-slate-500 pt-20">Waiting for Data Visualization Engine...</div>';
            return;
        }

        const searchTerm = (searchInput ? searchInput.value : '').toLowerCase();

        // Prepare nodes (Filter by search term)
        let nodes = kbFactsData.filter(fact => {
            const matchesContent = fact.content && fact.content.toLowerCase().includes(searchTerm);
            const matchesSource = fact.source && fact.source.toLowerCase().includes(searchTerm);
            const matchesProject = fact.project_name && fact.project_name.toLowerCase().includes(searchTerm);
            return matchesContent || matchesSource || matchesProject;
        });

        const activeNodeIds = new Set(nodes.map(n => n.id));

        // Prepare links (Only include links where BOTH source and target are in our active nodes)
        let links = kbEdgesData.filter(edge => activeNodeIds.has(edge.source_node_id) && activeNodeIds.has(edge.target_node_id)).map(edge => ({
            source: edge.source_node_id,
            target: edge.target_node_id,
            type: edge.relationship_type,
            weight: parseFloat(edge.weight) || 1.0
        }));

        // Render D3 SVG
        const canvasContainer = document.getElementById('kb-map-canvas');
        if (!canvasContainer) return;
        canvasContainer.innerHTML = '';

        // Helper to format ELABORATES_ON to Elaborates On
        const formatRelType = (type) => {
            if (!type) return '';
            return type.toLowerCase().split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        };

        // Grab container dimensions
        const width = canvasContainer.clientWidth || window.innerWidth - 320;
        const height = canvasContainer.clientHeight || window.innerHeight - 150;

        const svg = d3.select('#kb-map-canvas').append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('viewBox', [0, 0, width, height]);

        // Add defs for arrowheads
        svg.append('defs').append('marker')
            .attr('id', 'arrow')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 8) // perfectly aligns arrowhead tip to the path's calculated endpoint
            .attr('refY', 0)
            .attr('markerWidth', 5)
            .attr('markerHeight', 5)
            .attr('orient', 'auto')
            .append('path')
            .attr('fill', '#8b5cf6') // brighter purple to match background contrast
            .attr('d', 'M0,-5L10,0L0,5');

        // Main group with zoom
        const g = svg.append('g');

        svg.call(d3.zoom()
            .extent([[0, 0], [width, height]])
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            }));

        // Force Simulation Physics
        const simulation = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(links).id(d => d.id).distance(200)) // increase edge length
            .force('charge', d3.forceManyBody().strength(-600)) // stronger repulsion
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collide', d3.forceCollide().radius(80)); // aggressively prevent overlaps for wide HTML labels

        // Draw Links as fluid, glowing Bezier curves (path instead of line)
        const link = g.append('g')
            .selectAll('path')
            .data(links)
            .join('path')
            .attr('fill', 'none')
            .attr('stroke', '#8b5cf6') // brighter glowing primary color for dark backgrounds
            .attr('stroke-opacity', 0.6) // Much more visible default
            .attr('stroke-width', d => Math.max(1.5, d.weight * 2.5))
            .attr('marker-end', 'url(#arrow)');

        // Draw Link Labels (relationship_type) - Hidden by default to reduce clutter
        const linkLabels = g.append('g')
            .selectAll('text')
            .data(links)
            .join('text')
            .text(d => formatRelType(d.type))
            .attr('font-size', '9px')
            .attr('fill', '#cbd5e1') // slate-300
            .attr('text-anchor', 'middle')
            .style('pointer-events', 'none')
            .attr('opacity', 0) // Hide by default
            .attr('dy', -4);

        const tierColors = {
            'Conversational': '#94a3b8', // tier-conv
            'Personal': '#34d399', // tier-personal
            'Project': '#60a5fa', // tier-project
            'Research': '#c084fc' // tier-research
        };

        const tierIcons = {
            'Conversational': 'chat', // chat
            'Personal': 'person', // person
            'Project': 'account_tree', // account_tree
            'Research': 'science' // science
        };

        // Node group (contains circle, icon, text background, and text)
        const node = g.append('g')
            .selectAll('g')
            .data(nodes)
            .join('g')
            .attr('class', 'cursor-pointer')
            .call(drag(simulation));

        // Add shadow filter
        svg.append("defs").append("filter")
            .attr("id", "glow")
            .append("feGaussianBlur")
            .attr("stdDeviation", "2.5")
            .attr("result", "coloredBlur");

        const feMerge = d3.select("#glow").append("feMerge");
        feMerge.append("feMergeNode").attr("in", "coloredBlur");
        feMerge.append("feMergeNode").attr("in", "SourceGraphic");

        // Calculate Degree Centrality (Connection Count) for Dynamic Sizing
        nodes.forEach(n => {
            // D3 mutates link.source into an object reference instantly, so check .id if it exists
            n.connectionCount = links.filter(l => (l.source.id || l.source) === n.id || (l.target.id || l.target) === n.id).length;
            n.radius = Math.min(35, 16 + (n.connectionCount * 3));
        });

        // The circle container (Dynamic Radius based on Degree Centrality)
        node.append('circle')
            .attr('r', d => d.radius)
            .attr('fill', '#0f111a') // deepest background
            .attr('stroke', d => tierColors[d.tier] || tierColors['Conversational'])
            .attr('stroke-width', d => d.connectionCount > 2 ? 3 : 2)
            .attr('stroke-opacity', 0.8)
            .style('filter', 'url(#glow)');

        // Material Symbols Icon (Dynamic Size)
        node.append('text')
            .attr('class', 'material-symbols-outlined pointer-events-none drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]')
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central')
            .attr('fill', d => tierColors[d.tier] || tierColors['Conversational'])
            .attr('font-size', d => `${Math.max(16, d.radius * 0.8)}px`)
            .text(d => tierIcons[d.tier] || tierIcons['Conversational']);

        // HTML Label (foreignObject for beautiful Tailwind CSS typography instead of ugly SVG text)
        node.append("foreignObject")
            .attr("width", 200)
            .attr("height", 80)
            .attr("x", -100)
            .attr("y", d => d.radius + 6)
            .style("pointer-events", "none")
            .style("overflow", "visible")
            .append("xhtml:div")
            .attr("class", "flex flex-col items-center justify-start w-full")
            .html(d => `
                <div class="px-2.5 py-1 rounded-full border truncate max-w-[160px] text-center flex items-center justify-center transition-all ${d.tier === 'Research' ? 'bg-[#0B0C15]/95 border-tier-research/50 text-gray-300 shadow-[0_0_15px_rgba(168,85,247,0.3)]' :
                    d.tier === 'Project' ? 'bg-[#0B0C15]/95 border-tier-project/50 text-white shadow-glow-blue' :
                        d.tier === 'Personal' ? 'bg-[#0B0C15]/95 border-tier-personal/50 text-gray-300 shadow-glow-green' :
                            'bg-[#0B0C15]/95 border-tier-conv/50 text-gray-400'
                }">
                    <span class="text-[10px] font-medium tracking-wide drop-shadow-md">${escapeHtml(d.content.length > 25 ? d.content.substring(0, 22) + '...' : d.content)}</span>
                </div>
            `);

        // Setup tooltip for nodes
        const tooltip = d3.select("body").append("div")
            .attr("class", "absolute opacity-0 pointer-events-none p-3 max-w-sm rounded border border-border-dark bg-background-dark/95 shadow-xl backdrop-blur-md text-white z-50 transition-opacity duration-200")
            .style("font-size", "12px");

        node.on("mouseover", (event, d) => {
            tooltip.transition().duration(200).style("opacity", 1);
            tooltip.html(`
                <div class="text-[10px] font-bold uppercase tracking-wider mb-1" style="color: ${tierColors[d.tier] || tierColors['Conversational']}">${d.tier}</div>
                <div class="mb-2 leading-tight">${escapeHtml(d.content)}</div>
                <div class="flex justify-between text-[10px] text-slate-400">
                    <span>Rank: ${Math.round((d.relevance_score || 0) * 100)}%</span>
                    <span>Src: ${escapeHtml(d.source === 'auto_extract' ? 'Auto Extracted' : (d.source || 'General'))}</span>
                </div>
            `)
                .style("left", (event.pageX + 15) + "px")
                .style("top", (event.pageY + 15) + "px");

            // Highlight connected edges and show labels
            link.attr('stroke-opacity', l => (l.source.id === d.id || l.target.id === d.id) ? 1.0 : 0.1);
            linkLabels.attr('opacity', l => (l.source.id === d.id || l.target.id === d.id) ? 1.0 : 0.0);
        })
            .on("mouseout", () => {
                tooltip.transition().duration(500).style("opacity", 0);
                link.attr('stroke-opacity', 0.6);
                linkLabels.attr('opacity', 0);
            })
            .on("click", (event, d) => {
                const panel = document.getElementById('kb-map-info-panel');
                const contentEl = document.getElementById('info-panel-content');
                const badgeEl = document.getElementById('info-panel-badge');
                const sourceContEl = document.getElementById('info-panel-source-container');
                const sourceEl = document.getElementById('info-panel-source');
                const edgesEl = document.getElementById('info-panel-edges');

                // Populate basic info
                contentEl.textContent = d.content;

                // Badge styling
                badgeEl.textContent = d.tier;
                badgeEl.className = `px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border`;
                if (d.tier === 'Research') badgeEl.classList.add('bg-purple-500/20', 'text-purple-400', 'border-purple-500/20');
                else if (d.tier === 'Project') badgeEl.classList.add('bg-primary/20', 'text-primary', 'border-primary/20');
                else if (d.tier === 'Personal') badgeEl.classList.add('bg-emerald-500/20', 'text-emerald-400', 'border-emerald-500/20');
                else badgeEl.classList.add('bg-slate-500/20', 'text-slate-400', 'border-slate-500/20');

                // Source formatting
                let displaySource = d.source || 'General';
                if (displaySource === 'auto_extract') displaySource = 'Auto Extracted';

                if (displaySource !== 'Conversation') {
                    sourceContEl.classList.remove('hidden');
                    sourceContEl.classList.add('block');
                    sourceEl.textContent = displaySource;
                } else {
                    sourceContEl.classList.add('hidden');
                    sourceContEl.classList.remove('block');
                }

                // Relationships
                edgesEl.innerHTML = '';
                const connectedEdges = links.filter(l => l.source.id === d.id || l.target.id === d.id);
                if (connectedEdges.length === 0) {
                    edgesEl.innerHTML = '<div class="text-xs text-slate-500 italic">No network connections.</div>';
                } else {
                    connectedEdges.forEach(edge => {
                        const isSource = edge.source.id === d.id;
                        const relatedNode = isSource ? edge.target : edge.source;
                        const directionIcon = isSource ? 'arrow_forward' : 'arrow_back';

                        const edgeHtml = `
                        <div class="p-2 rounded bg-black/20 border border-white/5 flex flex-col gap-1 hover:bg-black/40 transition-colors cursor-default">
                             <div class="flex items-center gap-1.5">
                                 <span class="text-[10px] font-medium text-slate-200 px-2 py-0.5 rounded bg-white/5 border border-white/10">${formatRelType(edge.type)}</span>
                                 <span class="material-symbols-outlined text-[12px] text-slate-500">${directionIcon}</span>
                                 <span class="text-[8px] text-slate-500 uppercase tracking-wider">${isSource ? 'Outbound' : 'Inbound'}</span>
                             </div>
                             <div class="text-xs text-slate-300 truncate mt-1" title="${escapeHtml(relatedNode.content)}">
                                 ${escapeHtml(relatedNode.content)}
                             </div>
                        </div>
                    `;
                        edgesEl.innerHTML += edgeHtml;
                    });
                }

                // Slide panel in
                panel.classList.remove('right-[-400px]');
                panel.classList.add('right-6');

                // Setup edit/delete buttons
                document.getElementById('info-panel-edit-btn').onclick = () => window.editKbFact(d.id, d.content, d.tier);
                document.getElementById('info-panel-delete-btn').onclick = () => window.deleteKbFact(d.id);
            });

        // Close panel logic
        const closeBtn = document.getElementById('close-info-panel-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                const panel = document.getElementById('kb-map-info-panel');
                panel.classList.remove('right-6');
                panel.classList.add('right-[-400px]');
            });
        }

        // The simulation tick loop handles physics updates
        simulation.on('tick', () => {
            link.attr('d', d => {
                // Calculate distance between center points
                const dx = d.target.x - d.source.x;
                const dy = d.target.y - d.source.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist === 0) return '';

                // Very subtle arc instead of "noodles" (higher multiplier = flatter line)
                const dr = dist * 4;

                // Calculate exact border of the target circle to stop the line + arrowhead cleanly
                const targetRadius = d.target.radius || 16;
                const ratio = (targetRadius + 2) / dist; // exact padding so arrowhead touches border

                const targetX = d.target.x - (dx * ratio);
                const targetY = d.target.y - (dy * ratio);

                const sourceRadius = d.source.radius || 16;
                const sourceRatio = (sourceRadius) / dist;
                const sourceX = d.source.x + (dx * sourceRatio);
                const sourceY = d.source.y + (dy * sourceRatio);

                return `M${sourceX},${sourceY}A${dr},${dr} 0 0,1 ${targetX},${targetY}`;
            });

            linkLabels
                .attr('x', d => (d.source.x + d.target.x) / 2)
                .attr('y', d => (d.source.y + d.target.y) / 2 - 10);

            node.attr('transform', d => `translate(${d.x},${d.y})`);
        });

        // Drag handlers for D3
        function drag(sim) {
            function dragstarted(event) {
                if (!event.active) sim.alphaTarget(0.3).restart();
                event.subject.fx = event.subject.x;
                event.subject.fy = event.subject.y;
            }

            function dragged(event) {
                event.subject.fx = event.x;
                event.subject.fy = event.y;
            }

            function dragended(event) {
                if (!event.active) sim.alphaTarget(0);
                event.subject.fx = null;
                event.subject.fy = null;
            }

            return d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended);
        }
    }



    // Initial load
    loadMemory();
    loadDocuments();
    loadHistory();
});

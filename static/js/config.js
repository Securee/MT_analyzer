let currentPath = null;
let isVisualMode = false;
let currentSchemaType = null;

function loadTree() {
    fetch('/api/config/tree')
        .then(r => r.json())
        .then(files => {
            const list = document.getElementById('file-list');
            list.innerHTML = '';

            if (files.length === 0) {
                list.innerHTML = '<li style="padding:15px; color:#e74c3c; line-height: 1.5;">Config Dir not found or empty.<br>Go back to the Dashboard Settings to configure <br><b>MT_DIR</b>.</li>';
                return;
            }

            let grouped = {};
            files.forEach(f => {
                let lastSlash = f.lastIndexOf('/');
                let group = lastSlash >= 0 ? f.substring(0, lastSlash) : 'Root';
                if (!grouped[group]) grouped[group] = [];
                grouped[group].push(f);
            });

            // Sort groups alphabetically so the tree is ordered
            const sortedGroups = Object.keys(grouped).sort();

            sortedGroups.forEach(g => {
                const groupTitle = document.createElement('div');
                groupTitle.style.padding = '8px 15px';
                groupTitle.style.background = '#e9ecef';
                groupTitle.style.fontWeight = 'bold';
                groupTitle.style.color = '#34495e';
                groupTitle.style.fontSize = '0.9em';
                groupTitle.style.borderBottom = '1px solid #ddd';
                groupTitle.innerText = '📁 ' + g;
                list.appendChild(groupTitle);

                grouped[g].forEach(f => {
                    const li = document.createElement('li');
                    li.className = 'file-item';
                    if (f === currentPath) li.classList.add('active');

                    let displayPath = f;
                    if (g !== 'Root') {
                        displayPath = f.substring(g.length + 1);
                    }
                    li.innerText = '📄 ' + displayPath;
                    li.onclick = () => loadFile(f);
                    list.appendChild(li);
                });
            });
        });
}

function loadFile(path) {
    currentPath = path;
    document.getElementById('file-path').value = path;
    document.getElementById('file-path').readOnly = true;

    // Detect schema type
    currentSchemaType = null;
    if (path.endsWith('rules.json')) currentSchemaType = 'rules';
    else if (path.endsWith('lifecycles.json')) currentSchemaType = 'lifecycles';
    else if (path.includes('model-generators')) currentSchemaType = 'models';

    const toggleBtn = document.getElementById('toggle-view-btn');
    if (currentSchemaType) {
        toggleBtn.style.display = 'inline-block';
        isVisualMode = true; // default to visual
        toggleBtn.innerText = '📝 Raw JSON';
    } else {
        toggleBtn.style.display = 'none';
        isVisualMode = false;
    }

    fetch('/api/config/file?path=' + encodeURIComponent(path))
        .then(r => {
            if (!r.ok) throw new Error("Failed to load");
            return r.text();
        })
        .then(text => {
            document.getElementById('file-content').value = text;
            updateEditorView();
            loadTree(); // refresh active class
        });
}

function newFile() {
    currentPath = null;
    document.getElementById('file-path').value = '';
    document.getElementById('file-path').readOnly = false;
    document.getElementById('file-path').focus();
    document.getElementById('file-content').value = '';
    const items = document.querySelectorAll('.file-item');
    items.forEach(i => i.classList.remove('active'));
}

function saveFile() {
    const path = document.getElementById('file-path').value.trim();
    if (!path) return alert("Please specify a file path.");

    let content = "";
    if (isVisualMode) {
        try {
            const data = serializeVisualEditor();
            content = JSON.stringify(data, null, 2);
            // Update raw textarea to keep in sync
            document.getElementById('file-content').value = content;
        } catch (e) {
            return alert("Error serializing visual editor: " + e.message);
        }
    } else {
        content = document.getElementById('file-content').value;
    }

    fetch('/api/config/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: path, content: content })
    })
        .then(r => r.json())
        .then(res => {
            if (res.status === 'ok') {
                currentPath = path;
                document.getElementById('file-path').readOnly = true;
                loadTree();
                alert("Saved successfully!");
            } else {
                alert("Error saving: " + res.message);
            }
        });
}

function deleteFile() {
    const path = document.getElementById('file-path').value.trim();
    if (!path) return;
    if (!confirm("Are you sure you want to delete\n" + path + "?")) return;

    fetch('/api/config/file', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: path })
    })
        .then(r => r.json())
        .then(res => {
            if (res.status === 'ok') {
                newFile();
                loadTree();
            } else {
                alert("Error deleting: " + res.message);
            }
        });
}

loadTree();

// --- VISUAL EDITOR ENGINE ---

function toggleViewMode() {
    isVisualMode = !isVisualMode;
    const btn = document.getElementById('toggle-view-btn');
    if (isVisualMode) {
        // Switching to visual mode, sync text -> visual
        try {
            let json = JSON.parse(document.getElementById('file-content').value);
        } catch (e) {
            alert("Current text is not valid JSON. Please fix it before switching to Visual Mode.");
            isVisualMode = false;
            return;
        }
        btn.innerText = '📝 Raw JSON';
    } else {
        // Switching to raw mode, sync visual -> text
        try {
            const data = serializeVisualEditor();
            document.getElementById('file-content').value = JSON.stringify(data, null, 2);
        } catch (e) {
            console.error(e);
        }
        btn.innerText = '👁 Visual Mode';
    }
    updateEditorView();
}

function updateEditorView() {
    const raw = document.getElementById('file-content');
    const vis = document.getElementById('visual-editor');
    if (isVisualMode && currentSchemaType) {
        raw.style.display = 'none';
        vis.style.display = 'flex';
        vis.style.flexDirection = 'column';
        let data = [];
        try { data = JSON.parse(raw.value); } catch (e) { data = []; }
        renderVisualEditor(data, currentSchemaType);
    } else {
        raw.style.display = 'block';
        vis.style.display = 'none';
    }
}

// Global scope for visual editor components
let visualConfigData = null;

function renderVisualEditor(data, type) {
    visualConfigData = data;
    const container = document.getElementById('visual-editor');
    container.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom: 2px solid #ecf0f1; padding-bottom: 15px;">
        <h3 style="margin:0; color:#2c3e50;">${type.toUpperCase()} CONFIGURATION</h3>
        <button class="btn btn-primary" onclick="addVisualItem('${type}')">+ Add Item</button>
    </div>`;

    let itemsContainer = document.createElement('div');
    itemsContainer.id = 'visual-items-list';
    itemsContainer.style.display = 'flex';
    itemsContainer.style.flexDirection = 'column';
    container.appendChild(itemsContainer);

    let arr = Array.isArray(data) ? data : (data.model_generators || []);
    if (arr.length === 0) {
        itemsContainer.innerHTML = '<div class="empty-state">No items configured. Click "+ Add Item" to create one.</div>';
    }

    arr.forEach((item, index) => {
        itemsContainer.appendChild(createVisualCard(item, type, index));
    });
}

function createVisualCard(item, type, index) {
    const card = document.createElement('div');
    card.className = 'visual-card';
    card.dataset.index = index;

    let headerTitle = "Item";
    if (type === 'rules') headerTitle = `Rule: ${item.name || 'Unnamed'}`;
    else if (type === 'lifecycles') headerTitle = `Lifecycle: ${item.base_class_name || 'Unnamed'}`;
    else if (type === 'models') headerTitle = `Model Generator constraint: ${item.find || 'methods'}`;

    let html = `
        <div class="visual-card-header">
            <span>${headerTitle}</span>
            <button class="btn-icon" onclick="removeVisualCard(this)" title="Delete">&times;</button>
        </div>
        <div class="visual-card-body">
    `;

    if (type === 'rules') {
        html += `
            <div class="form-row">
                <div class="form-group" style="flex:2;">
                    <label>Name</label>
                    <input type="text" class="v-bind" data-key="name" value="${escapeHtml(item.name || '')}">
                </div>
                <div class="form-group" style="flex:1;">
                    <label>Code</label>
                    <input type="number" class="v-bind" data-key="code" value="${item.code || ''}">
                </div>
            </div>
            <div class="form-group">
                <label>Description</label>
                <input type="text" class="v-bind" data-key="description" value="${escapeHtml(item.description || '')}">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Sources <button class="btn-icon" style="font-size:0.9em;color:#3498db" onclick="addArrayItem(this, 'sources')">+ Add</button></label>
                    <div class="array-container v-array" data-key="sources">
                        ${(item.sources || []).map(s => `<div class="array-item"><input type="text" value="${escapeHtml(s)}"><button class="btn-icon" onclick="this.parentElement.remove()">×</button></div>`).join('')}
                    </div>
                </div>
                <div class="form-group">
                    <label>Sinks <button class="btn-icon" style="font-size:0.9em;color:#3498db" onclick="addArrayItem(this, 'sinks')">+ Add</button></label>
                    <div class="array-container v-array" data-key="sinks">
                        ${(item.sinks || []).map(s => `<div class="array-item"><input type="text" value="${escapeHtml(s)}"><button class="btn-icon" onclick="this.parentElement.remove()">×</button></div>`).join('')}
                    </div>
                </div>
            </div>
        `;
    } else if (type === 'lifecycles') {
        html += `
            <div class="form-row">
                <div class="form-group">
                    <label>Base Class Name</label>
                    <input type="text" class="v-bind" data-key="base_class_name" value="${escapeHtml(item.base_class_name || '')}">
                </div>
                <div class="form-group">
                    <label>Method Name</label>
                    <input type="text" class="v-bind" data-key="method_name" value="${escapeHtml(item.method_name || '')}">
                </div>
            </div>
            <div class="form-group">
                <label>Callees (JSON Array)</label>
                <textarea class="v-bind" data-key="callees" style="height:120px; font-family:monospace; resize:vertical; padding:8px;">${JSON.stringify(item.callees || [], null, 2)}</textarea>
            </div>
        `;
    } else if (type === 'models') {
        html += `
            <div class="form-row">
                <div class="form-group">
                    <label>Find</label>
                    <select class="v-bind" data-key="find">
                        <option value="methods" ${(item.find === 'methods') ? 'selected' : ''}>methods</option>
                        <option value="fields" ${(item.find === 'fields') ? 'selected' : ''}>fields</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>Where (JSON Array of Constraints)</label>
                <textarea class="v-bind" data-key="where" style="height:120px; font-family:monospace; resize:vertical; padding:8px;">${JSON.stringify(item.where || [], null, 2)}</textarea>
            </div>
            <div class="form-group">
                <label>Model Payload (JSON Object)</label>
                <textarea class="v-bind" data-key="model" style="height:120px; font-family:monospace; resize:vertical; padding:8px;">${JSON.stringify(item.model || {}, null, 2)}</textarea>
            </div>
        `;
    }

    html += `</div>`;
    card.innerHTML = html;
    return card;
}

function addVisualItem(type) {
    const list = document.getElementById('visual-items-list');
    const empty = list.querySelector('.empty-state');
    if (empty) empty.remove();

    let newItem = {};
    if (type === 'rules') newItem = { name: "New Rule", code: 999, description: "", sources: [], sinks: [] };
    else if (type === 'lifecycles') newItem = { base_class_name: "Landroid/app/Activity;", method_name: "activity_lifecycle_wrapper", callees: [] };
    else if (type === 'models') newItem = { find: "methods", where: [], model: {} };

    list.appendChild(createVisualCard(newItem, type, list.children.length));
}

function removeVisualCard(btn) {
    if (confirm("Delete this item?")) {
        btn.closest('.visual-card').remove();
    }
}

function addArrayItem(btn, key) {
    const container = btn.parentElement.nextElementSibling;
    const div = document.createElement('div');
    div.className = 'array-item';
    div.innerHTML = `<input type="text" value=""><button class="btn-icon" onclick="this.parentElement.remove()">×</button>`;
    container.appendChild(div);
}

function serializeVisualEditor() {
    const cards = document.querySelectorAll('.visual-card');
    let results = [];
    cards.forEach(card => {
        let obj = {};

        // Serialize direct bindings
        const binds = card.querySelectorAll('.v-bind');
        binds.forEach(b => {
            const key = b.dataset.key;
            if (b.tagName === 'TEXTAREA') {
                try {
                    obj[key] = JSON.parse(b.value);
                } catch (e) {
                    obj[key] = []; // Fallback if invalid JSON
                }
            } else if (b.type === 'number') {
                obj[key] = parseInt(b.value, 10) || 0;
            } else {
                obj[key] = b.value;
            }
        });

        // Serialize string arrays
        const arrays = card.querySelectorAll('.v-array');
        arrays.forEach(arr => {
            const key = arr.dataset.key;
            const vals = [];
            arr.querySelectorAll('input').forEach(inp => {
                if (inp.value.trim() !== '') vals.push(inp.value.trim());
            });
            obj[key] = vals;
        });

        results.push(obj);
    });

    if (currentSchemaType === 'models' && Array.isArray(visualConfigData) === false) {
        return { model_generators: results };
    }
    return results;
}

function escapeHtml(unsafe) {
    if (!unsafe) return "";
    return unsafe.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

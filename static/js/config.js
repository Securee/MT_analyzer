let currentPath = null;

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

    fetch('/api/config/file?path=' + encodeURIComponent(path))
        .then(r => {
            if (!r.ok) throw new Error("Failed to load");
            return r.text();
        })
        .then(text => {
            document.getElementById('file-content').value = text;
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
    const content = document.getElementById('file-content').value;
    if (!path) return alert("Please specify a file path.");

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

// Global state
let adbDevices = [];
let adbPackageList = [];

// Initialize
document.addEventListener("DOMContentLoaded", () => {
    fetchSettings();
    fetchList();
    setInterval(fetchList, 3000);
});

// --- Settings Logic ---
function fetchSettings() {
    fetch('/api/settings')
        .then(r => r.json())
        .then(data => {
            if (!data.MT_DIR || !data.APK_DIR) {
                openSettings(); // Force user to set paths if missing
            } else {
                document.getElementById('mt-dir-input').value = data.MT_DIR;
                document.getElementById('apk-dir-input').value = data.APK_DIR;
            }
        });
}

function openSettings() { document.getElementById('settingsModal').style.display = 'flex'; }
function closeSettings() { document.getElementById('settingsModal').style.display = 'none'; }
function saveSettings() {
    const mt = document.getElementById('mt-dir-input').value.trim();
    const apk = document.getElementById('apk-dir-input').value.trim();
    if (!mt || !apk) {
        alert("Both paths are required.");
        return;
    }
    fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ MT_DIR: mt, APK_DIR: apk })
    }).then(r => r.json()).then(res => {
        if (res.status === 'ok') {
            closeSettings();
            alert("Settings saved successfully.");
        } else {
            alert("Error: " + res.message);
        }
    });
}

// --- ADB Pull Logic ---
function openAdbModal() {
    document.getElementById('adbModal').style.display = 'flex';
    document.getElementById('adb-status').innerText = '';
    document.getElementById('adb-pull-btn').disabled = true;
    loadAdbDevices();
}
function closeAdb() { document.getElementById('adbModal').style.display = 'none'; }

function loadAdbDevices() {
    const sel = document.getElementById('adb-devices-select');
    sel.innerHTML = '<option value="">Scanning...</option>';
    fetch('/api/adb/devices')
        .then(r => r.json())
        .then(data => {
            if (data.status === 'error') {
                sel.innerHTML = `<option value="">Error: ${data.message}</option>`;
                return;
            }
            adbDevices = data.devices;
            if (adbDevices.length === 0) {
                sel.innerHTML = '<option value="">No devices found - Attach USB device</option>';
            } else {
                sel.innerHTML = '<option value="">-- Select a connected device --</option>';
                adbDevices.forEach(d => {
                    sel.innerHTML += `<option value="${d}">${d}</option>`;
                });
            }
        });
}

function loadAdbPackages() {
    const dev = document.getElementById('adb-devices-select').value;
    const pSel = document.getElementById('adb-packages-select');
    const btn = document.getElementById('adb-pull-btn');

    if (!dev) {
        pSel.innerHTML = '<option value="">Select a device first</option>';
        btn.disabled = true;
        return;
    }

    pSel.innerHTML = '<option value="">Loading packages from device...</option>';
    btn.disabled = true;

    fetch('/api/adb/packages?device=' + encodeURIComponent(dev))
        .then(r => r.json())
        .then(data => {
            if (data.status === 'error') {
                pSel.innerHTML = `<option value="">Error: ${data.message}</option>`;
                return;
            }
            if (data.packages.length === 0) {
                pSel.innerHTML = '<option value="">No packages found</option>';
            } else {
                adbPackageList = data.packages;
                pSel.innerHTML = '<option value="">-- Select Package to Pull --</option>';
                pSel.innerHTML += '<option value="ALL">🌟 PULL ALL PACKAGES</option>';
                data.packages.forEach(p => {
                    pSel.innerHTML += `<option value="${p.package}">${p.package}</option>`;
                });
                pSel.onchange = () => {
                    btn.disabled = !pSel.value;
                };
            }
        });
}

let bulkPullInterval = null;

async function pullApk() {
    const dev = document.getElementById('adb-devices-select').value;
    const pkg = document.getElementById('adb-packages-select').value;
    if (!dev || !pkg) return;

    const statusP = document.getElementById('adb-status');
    const btn = document.getElementById('adb-pull-btn');
    btn.disabled = true;

    if (pkg === "ALL") {
        statusP.innerText = `📥 Starting bulk pull sequence for ${adbPackageList.length} packages...`;
        statusP.style.color = '#3498db';

        fetch('/api/adb/pull_bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device: dev, packages: adbPackageList })
        })
            .then(r => r.json())
            .then(data => {
                if (data.status === 'ok') {
                    // start polling
                    bulkPullInterval = setInterval(pollBulkStatus, 1500);
                } else {
                    statusP.innerText = `❌ Error starting bulk pull: ${data.message}`;
                    statusP.style.color = '#e74c3c';
                    btn.disabled = false;
                }
            });

    } else {
        statusP.innerText = `📥 Pulling ${pkg} from device via adb (this may take a minute)...`;
        statusP.style.color = '#3498db';

        fetch('/api/adb/pull', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device: dev, package: pkg })
        })
            .then(r => r.json())
            .then(data => {
                if (data.status === 'ok') {
                    statusP.innerText = `✅ Successfully pulled to: ${data.path}`;
                    statusP.style.color = '#2ecc71';
                    setTimeout(closeAdb, 2000);
                    fetchList(); // Refresh dashboard list
                } else {
                    statusP.innerText = `❌ Error: ${data.message}`;
                    statusP.style.color = '#e74c3c';
                    btn.disabled = false;
                }
            }).catch(e => {
                statusP.innerText = `❌ Error: ${e}`;
                statusP.style.color = '#e74c3c';
                btn.disabled = false;
            });
    }
}

function pollBulkStatus() {
    const statusP = document.getElementById('adb-status');
    const btn = document.getElementById('adb-pull-btn');

    fetch('/api/adb/pull_status')
        .then(r => r.json())
        .then(state => {
            if (state.status === "running") {
                statusP.innerText = `📥 [${state.progress}/${state.total}] Pulling ${state.current}... (Wait)`;
            } else if (state.status === "done") {
                clearInterval(bulkPullInterval);
                statusP.innerText = `✅ Finished! Successfully pulled: ${state.success}, Failed: ${state.fail}`;
                statusP.style.color = '#2ecc71';
                fetchList();
                btn.disabled = false;
            } else if (state.status.startsWith("Error")) {
                clearInterval(bulkPullInterval);
                statusP.innerText = `❌ ${state.status}`;
                statusP.style.color = '#e74c3c';
                btn.disabled = false;
            }
        });
}

// --- Main Dashboard Logic ---
function fetchList() {
    fetch('/api/list')
        .then(r => r.json())
        .then(data => {
            let html = '<ul>';
            if (data.length === 0) {
                html += '<p>No APKs found. Try tracking a path or Pulling from a Device.</p>';
            }
            data.forEach(item => {
                let badge = '';
                let buttons = '';

                if (item.status === 'Analyzed') {
                    badge = '<span class="status-badge badge-analyzed">✓ Analyzed</span>';
                    if (item.is_server_running) {
                        buttons = `<a href="http://${window.location.hostname}:${item.port}" target="_blank" class="btn btn-running" style="color:white;text-decoration:none;">View Report ↗ (Port ${item.port})</a>
                               <a href="javascript:void(0)" onclick="cmd('/stop/${item.db_path_encoded}')" class="btn btn-stop" style="color:white;text-decoration:none;">Stop</a>
                               <a href="javascript:void(0)" onclick="analyze('${item.path_encoded}')" class="btn btn-analyze" style="color:white;text-decoration:none; margin-left: 10px;">↻ Re-analyze</a>`;
                    } else {
                        buttons = `<a href="javascript:void(0)" onclick="cmd('/start/${item.db_path_encoded}')" class="btn btn-start" style="color:white;text-decoration:none;">Start Server</a>
                               <a href="javascript:void(0)" onclick="analyze('${item.path_encoded}')" class="btn btn-analyze" style="color:white;text-decoration:none; margin-left: 10px;">↻ Re-analyze</a>`;
                    }
                } else if (item.status === 'Not Analyzed') {
                    badge = '<span class="status-badge badge-not">✗ Not Analyzed</span>';
                    buttons = `<a href="javascript:void(0)" onclick="analyze('${item.path_encoded}')" class="btn btn-analyze" style="color:white;text-decoration:none;">Analyze Now</a>`;
                } else if (item.status.startsWith('Failed')) {
                    badge = `<span class="status-badge badge-not">✗ ${item.status}</span>`;
                    buttons = `<a href="javascript:void(0)" onclick="analyze('${item.path_encoded}')" class="btn btn-analyze" style="background-color: #e74c3c; color:white;text-decoration:none;">Retry Analysis</a>`;
                } else {
                    badge = `<span class="status-badge badge-analyzing">⚙ ${item.status}</span>`;
                    buttons = `<span style="color:#7f8c8d; font-size:0.9em;">Please wait...</span>`;
                }

                html += `<li>
                <div>
                    ${badge}
                    <div class="apk-name">${item.name}</div>
                    <div class="apk-path">${item.path}</div>
                </div>
                <div>${buttons}</div>
            </li>`;
            });
            html += '</ul>';
            document.getElementById('list-container').innerHTML = html;
        });
}

function addTarget() {
    const path = document.getElementById('new-target').value;
    if (!path) return;
    fetch('/api/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: path })
    }).then(() => {
        document.getElementById('new-target').value = '';
        fetchList();
    });
}

function analyze(path_encoded) {
    fetch('/api/analyze/' + path_encoded, { method: 'POST' }).then(() => fetchList());
}

function analyzeAll() {
    fetch('/api/analyze_all', { method: 'POST' }).then(() => fetchList());
}

function cmd(url) {
    fetch(url).then(() => fetchList());
}

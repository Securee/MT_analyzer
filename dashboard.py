import os
import subprocess
import threading
import time
import socket
import json
import base64
from flask import Flask, render_template, redirect, url_for, jsonify, request

app = Flask(__name__)

# Config & State
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SETTINGS_FILE = os.path.join(BASE_DIR, "settings.json")
TARGETS_FILE = os.path.join(BASE_DIR, "dashboard_targets.json")

# Default settings
settings = {
    "MT_DIR": "",
    "APK_DIR": ""
}

def load_settings():
    global settings
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r") as f:
                settings.update(json.load(f))
        except Exception:
            pass

def save_settings():
    with open(SETTINGS_FILE, "w") as f:
        json.dump(settings, f, indent=4)

load_settings()

def get_config_dir():
    mt_dir = settings.get("MT_DIR", "")
    return os.path.join(mt_dir, "configuration") if mt_dir else ""

def get_config_file():
    cfg_dir = get_config_dir()
    return os.path.join(cfg_dir, "all_generators_config.json") if cfg_dir else ""

BASE_PORT = 5001
MAX_PORTS = 50

# State management
active_servers = {} # db_path -> {'port': int, 'process': Popen, 'last_accessed': float}
port_pool = list(range(BASE_PORT, BASE_PORT + MAX_PORTS))

# Ongoing analysis tasks: apk_path -> status_string
analysis_jobs = {}

def load_targets():
    if os.path.exists(TARGETS_FILE):
        try:
            with open(TARGETS_FILE, 'r') as f:
                return set(json.load(f))
        except:
            return set()
    return set()

def save_targets():
    with open(TARGETS_FILE, 'w') as f:
        json.dump(list(monitored_targets), f)

def ensure_config():
    config_file = get_config_file()
    if not config_file: return
    if not os.path.exists(config_file):
        print("[*] Generating Mariana Trench config file...")
        gen_dir = os.path.join(get_config_dir(), 'model-generators')
        generators = []
        if os.path.exists(gen_dir):
            for root, _, files in os.walk(gen_dir):
                for f in files:
                    if f.endswith('.models'):
                        generators.append({'name': f[:-7]})
        default_builtins = ['CommonSanitizers', 'content_provider_generator', 'DataCastFeatureGenerator', 'ExplicitIntentFeatureGenerator', 'IntentDataFeatureGenerator', 'IntentUtilsChooserSanitizer', 'join_override_generator', 'ReflectionGenerator', 'SensitiveCookieDataGenerator', 'service_sources', 'taint_in_taint_out', 'taint_in_taint_this']
        for b in default_builtins:
            if {'name': b} not in generators:
                generators.append({'name': b})
        with open(config_file, 'w') as out:
            json.dump(generators, out, indent=2)

monitored_targets = load_targets()
ensure_config()





def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

def get_apk_list():
    apks = []
    for path in list(monitored_targets):
        if os.path.isfile(path) and path.endswith('.apk'):
            apks.append(path)
        elif os.path.isdir(path):
            for f in os.listdir(path):
                if f.endswith('.apk'):
                    apks.append(os.path.join(path, f))
    
    result = []
    # Deduplicate and sort
    for apk in sorted(list(set(apks))):
        apk_dir = os.path.dirname(apk)
        apk_name = os.path.basename(apk)
        base_name = os.path.splitext(apk_name)[0]
        out_dir = os.path.join(apk_dir, f"{base_name}_out")
        db_path = os.path.join(out_dir, "sapp.db")
        
        status = "Not Analyzed"
        if apk in analysis_jobs:
            status = analysis_jobs[apk]
        elif os.path.exists(db_path):
            status = "Analyzed"
            
        result.append({
            "name": apk_name,
            "path": apk,
            "path_encoded": base64.urlsafe_b64encode(apk.encode()).decode(),
            "out_dir": out_dir,
            "db_path": db_path,
            "db_path_encoded": base64.urlsafe_b64encode(db_path.encode()).decode(),
            "status": status,
            "is_server_running": db_path in active_servers,
            "port": active_servers[db_path]['port'] if db_path in active_servers else None
        })
    return result

def run_analysis_worker(apk_path):
    apk_dir = os.path.dirname(apk_path)
    base_name = os.path.splitext(os.path.basename(apk_path))[0]
    out_dir = os.path.join(apk_dir, f"{base_name}_out")
    
    os.makedirs(out_dir, exist_ok=True)
    
    analysis_jobs[apk_path] = "Running MT Engine..."
    
    mt_dir = settings.get("MT_DIR", "")
    if not mt_dir:
        analysis_jobs[apk_path] = "Failed (MT_DIR not set)"
        return
        
    mt_cmd = [
        "mariana-trench",
        "--apk-path", apk_path,
        "--output-directory", out_dir,
        "--model-generator-configuration-paths", get_config_file(),
        "--system-jar-configuration-path", os.path.join(mt_dir, "configuration/default_system_jar_paths.json"),
        "--rules-paths", os.path.join(mt_dir, "configuration/rules.json")
    ]
    
    res = subprocess.run(mt_cmd, capture_output=True)
    if res.returncode != 0:
        error_msg = "Failed (MT Error)"
        stderr_out = res.stderr.decode()
        if "UnknownSecondaryDexModeException" in stderr_out:
            error_msg = "Failed (Packed/Obfuscated APK)"
        analysis_jobs[apk_path] = error_msg
        print(f"MT Error on {apk_path}: {stderr_out}")
        return

    analysis_jobs[apk_path] = "Generating Sapp DB..."
    db_path = os.path.join(out_dir, "sapp.db")
    
    sapp_cmd = ["sapp", "--database-name", db_path, "--tool", "mariana-trench", "analyze", out_dir]
    res = subprocess.run(sapp_cmd, capture_output=True)
    if res.returncode != 0:
        analysis_jobs[apk_path] = "Failed (Sapp Error)"
        print(f"Sapp Error on {apk_path}: {res.stderr.decode()}")
        return
        
    # Done
    analysis_jobs.pop(apk_path, None)


@app.route("/")
def index():
    return render_template('index.html')

@app.route("/api/settings", methods=["GET", "POST"])
def api_settings():
    if request.method == "POST":
        data = request.json
        settings["MT_DIR"] = data.get("MT_DIR", "").strip()
        settings["APK_DIR"] = data.get("APK_DIR", "").strip()
        save_settings()
        ensure_config()
        return jsonify({"status": "ok"})
    return jsonify(settings)

@app.route("/api/adb/devices")
def api_adb_devices():
    try:
        result = subprocess.run(["adb", "devices"], capture_output=True, text=True, check=True)
        lines = result.stdout.strip().splitlines()[1:] # skip header
        devices = [line.split()[0] for line in lines if "device" in line and not "offline" in line]
        return jsonify({"status": "ok", "devices": devices})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/adb/packages")
def api_adb_packages():
    device_id = request.args.get('device')
    cmd = "adb " + (f"-s {device_id} " if device_id else "") + "shell pm list package -f"
    try:
        packages_proc = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        package_list = []
        for line in packages_proc.stdout:
            line = line.decode('utf-8').strip()
            if line and line.startswith("package:"):
                package_list.append(line)
        packages_proc.wait()

        parsed_packages = []
        for package in package_list:
            # package matches "package:/path/to/apk=com.example.pkg"
            temp = package.split(':', 1)[1]
            if "=" in temp:
                path = temp.rsplit('=', 1)[0]
                pkg = temp.rsplit('=', 1)[1]
                if not any(p['package'] == pkg for p in parsed_packages):
                    parsed_packages.append({"package": pkg, "path": path})
                    
        parsed_packages.sort(key=lambda x: x['package'])
        return jsonify({"status": "ok", "packages": parsed_packages})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# Bulk pull state
pull_all_state = {"status": "idle", "progress": 0, "total": 0, "current": "", "success": 0, "fail": 0}

@app.route("/api/adb/pull_bulk", methods=["POST"])
def api_adb_pull_bulk():
    global pull_all_state
    
    if pull_all_state["status"] == "running":
        return jsonify({"status": "error", "message": "Bulk pull is already in progress, please wait."}), 400
        
    data = request.json
    device_id = data.get("device")
    packages_to_pull = data.get("packages") # list of dicts: [{"package":"pkg", "path":"path"}]
    
    if not packages_to_pull:
        return jsonify({"status": "error", "message": "No packages to pull"}), 400
        
    apk_dir = settings.get("APK_DIR")
    if not apk_dir:
        return jsonify({"status": "error", "message": "APK_DIR is not configured in settings."}), 400
        
    os.makedirs(apk_dir, exist_ok=True)
    
    pull_all_state = {
        "status": "running", 
        "progress": 0, 
        "total": len(packages_to_pull), 
        "current": "",
        "success": 0,
        "fail": 0
    }
    
    threading.Thread(target=pull_bulk_worker, args=(device_id, packages_to_pull, apk_dir)).start()
    return jsonify({"status": "ok"})

def pull_bulk_worker(device_id, package_list, out_dir):
    global pull_all_state
    try:
        for i, p in enumerate(package_list):
            path = p['path']
            package_name = p['package']
            
            pull_all_state["current"] = package_name
            pull_all_state["progress"] = i + 1
            
            cmd = "adb " + (f"-s {device_id} " if device_id else "") + f"pull {path} {os.path.join(out_dir, package_name + '.apk')}"
            
            try:
                proc = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                stdout, stderr = proc.communicate()
                
                if proc.returncode == 0:
                    local_path = os.path.join(out_dir, f"{package_name}.apk")
                    if os.path.exists(local_path):
                        monitored_targets.add(os.path.abspath(local_path))
                        save_targets()
                    pull_all_state["success"] += 1
                else:
                    pull_all_state["fail"] += 1
            except Exception:
                pull_all_state["fail"] += 1
                
        pull_all_state["status"] = "done"
    except Exception as e:
        pull_all_state["status"] = f"Error: {e}"

@app.route("/api/adb/pull_status")
def api_adb_pull_status():
    return jsonify(pull_all_state)

@app.route("/api/adb/pull", methods=["POST"])
def api_adb_pull():
    data = request.json
    pkg = data.get("package")
    device_id = data.get("device")
    
    if not pkg: return jsonify({"status": "error", "message": "No package specified"}), 400
        
    apk_dir = settings.get("APK_DIR")
    if not apk_dir: return jsonify({"status": "error", "message": "APK_DIR is not configured in settings."}), 400
        
    os.makedirs(apk_dir, exist_ok=True)
        
    try:
        # Use user logic to get specific path
        cmd_path = "adb " + (f"-s {device_id} " if device_id else "") + f"shell pm path {pkg}"
        proc_path = subprocess.Popen(cmd_path, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        stdout, _ = proc_path.communicate()
        device_paths = [p.replace("package:", "").strip() for p in stdout.decode('utf-8').splitlines() if p.strip()]
        
        if not device_paths:
            return jsonify({"status": "error", "message": "Could not locate APK on device"}), 400
            
        base_apk = next((p for p in device_paths if "base.apk" in p), device_paths[0])
            
        local_path = os.path.join(apk_dir, f"{pkg}.apk")
        cmd_pull = "adb " + (f"-s {device_id} " if device_id else "") + f"pull {base_apk} {local_path}"
        
        proc_pull = subprocess.Popen(cmd_pull, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        stdout, stderr = proc_pull.communicate()
        
        if proc_pull.returncode != 0:
            return jsonify({"status": "error", "message": f"ADB failed: {stderr.decode('utf-8')}"}), 500
        
        monitored_targets.add(os.path.abspath(local_path))
        save_targets()

        return jsonify({"status": "ok", "path": local_path})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/list")
def api_list():
    return jsonify(get_apk_list())

@app.route("/api/add", methods=["POST"])
def api_add():
    path = request.json.get("path")
    if path and os.path.exists(path):
        # normalize to absolute path
        abs_path = os.path.abspath(path)
        monitored_targets.add(abs_path)
        save_targets()
        return jsonify({"status": "ok"})
    return jsonify({"status": "error", "message": "Invalid path"}), 400

@app.route("/api/analyze/<path_id>", methods=["POST"])
def api_analyze(path_id):
    path = base64.urlsafe_b64decode(path_id.encode()).decode()
    if path not in analysis_jobs:
        analysis_jobs[path] = "Starting..."
        threading.Thread(target=run_analysis_worker, args=(path,)).start()
    return jsonify({"status": "ok"})

@app.route("/api/analyze_all", methods=["POST"])
def api_analyze_all():
    for item in get_apk_list():
        if item['status'] == 'Not Analyzed' or item['status'].startswith('Failed'):
            path = item['path']
            if path not in analysis_jobs:
                analysis_jobs[path] = "Starting..."
                threading.Thread(target=run_analysis_worker, args=(path,)).start()
    return jsonify({"status": "ok"})

@app.route("/start/<path_id>")
def start_server(path_id):
    path = base64.urlsafe_b64decode(path_id.encode()).decode()
    
    if path in active_servers:
        return jsonify({"status": "ok"})
    
    if not port_pool:
        oldest_path = min(active_servers.keys(), key=lambda k: active_servers[k]['last_accessed'])
        stop_server_internal(oldest_path)
        
    port = port_pool.pop(0)
    
    while is_port_in_use(port) and port_pool:
        port = port_pool.pop(0)
        
    wrapper_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "run_sapp.py")
    process = subprocess.Popen(
        ["python3", wrapper_script, path, str(port)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    
    active_servers[path] = {
        'port': port,
        'process': process,
        'last_accessed': time.time()
    }
    
    # Wait a bit
    time.sleep(1)
    return jsonify({"status": "ok"})

def stop_server_internal(path):
    if path in active_servers:
        server_info = active_servers.pop(path)
        server_info['process'].terminate()
        server_info['process'].wait()
        port_pool.append(server_info['port'])

@app.route("/stop/<path_id>")
def stop_server(path_id):
    path = base64.urlsafe_b64decode(path_id.encode()).decode()
    stop_server_internal(path)
    return jsonify({"status": "ok"})

# ==========================================
# Config Manager Routes
# ==========================================

@app.route("/config")
def config_page():
    return render_template('config.html')

@app.route("/api/config/tree")
def api_config_tree():
    config_dir = get_config_dir()
    if not config_dir or not os.path.exists(config_dir):
        return jsonify([])
    files_list = []
    for root, _, files in os.walk(config_dir):
        for f in files:
            if f.endswith('.json') or f.endswith('.models'):
                abs_path = os.path.join(root, f)
                rel_path = os.path.relpath(abs_path, config_dir)
                files_list.append(rel_path)
    return jsonify(sorted(files_list))

@app.route("/api/config/file", methods=["GET"])
def api_config_read():
    config_dir = get_config_dir()
    rel_path = request.args.get('path')
    if not rel_path or not config_dir:
        return "Missing path or config not set", 400
    abs_path = os.path.abspath(os.path.join(config_dir, rel_path))
    if not abs_path.startswith(os.path.abspath(config_dir)):
        return "Invalid path", 400
    if not os.path.exists(abs_path):
        return "File not found", 404
    with open(abs_path, 'r') as f:
        return f.read()

@app.route("/api/config/file", methods=["POST"])
def api_config_save():
    config_dir = get_config_dir()
    data = request.json
    rel_path = data.get('path')
    content = data.get('content')
    if not rel_path or not config_dir:
        return jsonify({"status": "error", "message": "Missing path or config not set"}), 400
    abs_path = os.path.abspath(os.path.join(config_dir, rel_path))
    if not abs_path.startswith(os.path.abspath(config_dir)):
        return jsonify({"status": "error", "message": "Invalid path"}), 400
    os.makedirs(os.path.dirname(abs_path), exist_ok=True)
    with open(abs_path, 'w') as f:
        f.write(content)
    
    ensure_config()
    return jsonify({"status": "ok"})

@app.route("/api/config/file", methods=["DELETE"])
def api_config_delete():
    config_dir = get_config_dir()
    data = request.json
    rel_path = data.get('path')
    if not rel_path or not config_dir:
        return jsonify({"status": "error", "message": "Missing path or config not set"}), 400
    abs_path = os.path.abspath(os.path.join(config_dir, rel_path))
    if not abs_path.startswith(os.path.abspath(config_dir)):
        return jsonify({"status": "error", "message": "Invalid path"}), 400
    if os.path.exists(abs_path):
        os.remove(abs_path)
    ensure_config()
    return jsonify({"status": "ok"})

if __name__ == "__main__":
    import atexit
    def cleanup():
        for path in list(active_servers.keys()):
            stop_server_internal(path)
    atexit.register(cleanup)
    
    app.run(host="127.0.0.1", port=5000, debug=False)

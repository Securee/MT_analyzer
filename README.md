# MT_analyzer Dashboard

MT_analyzer is a fully-featured, web-based vulnerability analysis dashboard built around the **Mariana Trench** static analysis engine for Android applications.

## Architecture
The tool has been fully refactored from a CLI wrapper into a modern web application:
- **Backend (Python/Flask)**: `dashboard.py` serves as the core API and proxy. It handles long-running Mariana Trench analysis tasks asynchronously, serves real-time status updates, and handles file modifications for custom model generators.
- **Frontend (Vanilla HTML/CSS/JS)**: Clean, sleek UI to manage your targets, configure Mariana Trench settings, and pull APKs from your devices.
- **State Management**: A SQLite database (`analysis.db`) is used to persist application tracking states across server restarts. `settings.json` is used to make the tool fully portable, storing paths to `MT_DIR` and `APK_DIR`.

## Features
1. **Fully Portable Settings**: Automatically prompts you to configure the Mariana Trench installation directory (`MT_DIR`) rather than relying on hardcoded paths.
2. **Automated ADB Integration**: 
   - Plug in an Android device with USB debugging enabled.
   - Click `📱 Pull from Device`.
   - The backend will scan your device, enumerate all installed packages, and allow you to pull a single APK or batch-pull ALL installed APKs directly to your workspace.
3. **Configuration Manager**: Edit `model-generators`, `.json` configurations, and `rules.json` directly from the web interface.
4. **Real-time Reporting**: Starts SAPP servers dynamically per application, allowing you to view detailed security vulnerability reports in an elegant interface.
5. **🧠 AI-Assisted Security Analysis**: Integrated with Google Gemini to provide intelligent summaries and mitigation advice based on Mariana Trench findings.
6. **📜 Detailed Analysis Logs**: Click the "Log" button to view real-time `stdout` and `stderr` output from the MT engine and Sapp, making it easy to debug engine crashes or APK compatibility issues.
7. **SQLAlchemy 2.0+ Ready**: Includes deep patches for the `sapp` library and SQLAlchemy core to support modern database environments.

## Technical Notes
- **Compatibility**: The project includes automated patches for the `sapp` library to support SQLAlchemy 2.0+. This resolves issues like `MappedAnnotationError` and legacy `URL` constructor errors.

## Quick Start
1. Ensure `adb` and `python3` are installed.
2. Make sure you have Mariana Trench configured locally.
3. Start the dashboard:
```bash
cd MT_analyzer
python3 dashboard.py
```
4. Access the UI at `http://127.0.0.1:5000`.
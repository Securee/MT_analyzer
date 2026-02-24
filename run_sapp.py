import sys
import os
from sapp.db import DB
from sapp.ui.server import start_server, application

if len(sys.argv) < 3:
    print("Usage: python3 run_sapp.py <db_path> <port>")
    sys.exit(1)

db_path = sys.argv[1]
port = int(sys.argv[2])

print(f"Starting custom SAPP server on {port} for {db_path}...")

# Force SAPP_SERVER_PORT so the underlying Flask starts on the right port
os.environ["SAPP_SERVER_PORT"] = str(port)

# Initialize DB connection like the CLI does
database = DB("sqlite", os.path.expanduser(db_path), assertions=True)

# Start the Flask app
start_server(
    database=database,
    debug=False,
    static_resources=None,
    source_directory=".",
    editor_schema=None
)

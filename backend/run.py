"""
FinGuard AI — Uvicorn Standalone Launcher Script (Stage 1)
Usage:
    python run.py
"""

import os
import uvicorn

if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PYTHON_PORT", os.getenv("PORT", "8001")))

    print("=" * 60)
    print(" Starting FinGuard AI Python Service")
    print(f" • Host:    {host}")
    print(f" • Port:    {port}")
    print(f" • Health:  http://localhost:{port}/health")
    print(f" • Swagger: http://localhost:{port}/docs")
    print("=" * 60)

    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=True,
    )

#!/usr/bin/env python3
import asyncio
import os
import sys
from pathlib import Path
import httpx

API_BASE = os.environ.get("OPEN_NOTEBOOK_API", "http://localhost:5055/api")

def purge_all_sources():
    with httpx.Client(base_url=API_BASE, timeout=60) as client:
        # Obtener todos los notebooks
        try:
            resp = client.get("/notebooks")
            resp.raise_for_status()
            notebooks = resp.json()
        except Exception as e:
            print(f"Error cargando notebooks: {e}")
            return
            
        print(f"Borrando sources de {len(notebooks)} notebooks...")
        total_deleted = 0
        
        for nb in notebooks:
            nb_id = nb["id"]
            # Tomar las sources de este notebook
            s_resp = client.get(f"/sources?notebook_id={nb_id}")
            if not s_resp.is_success:
                continue
                
            sources = s_resp.json()
            for s in sources:
                s_id = s["id"]
                del_resp = client.delete(f"/sources/{s_id}")
                if del_resp.is_success:
                    total_deleted += 1
                    
        print(f"Purga completada. {total_deleted} sources eliminadas.")

if __name__ == "__main__":
    purge_all_sources()

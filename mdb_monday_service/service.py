# mdb_monday_service/service.py
import os
from collections import defaultdict
from typing import Any, Dict, List
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import csv
import io

load_dotenv()
PORT = int(os.getenv("PORT", "5005"))

app = FastAPI(title="CSV → Jobs Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory store populated by last CSV upload
STORE: Dict[str, Any] = {
    "orders": {},        # order_no -> header dict
    "line_items": {},    # order_no -> [line item dicts]
    "designs": {},       # order_no -> list of designs (deduped)
    "meta": {"rows": 0}
}

REQUIRED = {"order_no", "order_type", "customer", "job_title", "qty"}

def _norm_header(h: str) -> str:
    return (h or "").strip().lower().replace(" ", "_")

def _to_int(x, default=0):
    try:
        return int(float(str(x).strip()))
    except Exception:
        return default

@app.get("/health")
def health():
    return {"ok": True, "rows": STORE["meta"]["rows"], "orders": len(STORE["orders"])}

@app.post("/upload-csv")
async def upload_csv(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a .csv file")

    # Read text with UTF-8 BOM support
    raw = await file.read()
    text = raw.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))

    # Normalize headers
    headers = [_norm_header(h) for h in reader.fieldnames or []]
    if not headers:
        raise HTTPException(status_code=400, detail="CSV has no header row")

    missing = REQUIRED - set(headers)
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required columns: {', '.join(sorted(missing))}")

    # Build normalized rows
    rows: List[Dict[str, Any]] = []
    src = csv.DictReader(io.StringIO(text))
    src.fieldnames = headers

    for r in src:
        row = { _norm_header(k): (v or "").strip() for k, v in r.items() }
        # Required coercions
        row["order_no"] = _to_int(row.get("order_no"))
        row["qty"]      = _to_int(row.get("qty"))
        rows.append(row)

    if not rows:
        raise HTTPException(status_code=400, detail="No data rows found")

    # Group into orders + line items + designs
    orders: Dict[int, Dict[str, Any]] = {}
    line_items: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
    designs: Dict[int, List[Dict[str, Any]]] = defaultdict(list)

    seen_designs: Dict[int, set] = defaultdict(set)

    for r in rows:
        ono = r["order_no"]
        if ono not in orders:
            orders[ono] = {
                "order_no": ono,
                "order_type": r.get("order_type",""),
                "customer": r.get("customer",""),
                "job_title": r.get("job_title","")
            }

        # line item
        li = {
            "qty": r.get("qty", 0),
            "description": r.get("description",""),
            "size": r.get("size",""),
            "colour": r.get("colour",""),
            "style_code": r.get("style_code",""),
            "style_name": r.get("style_name",""),
        }
        line_items[ono].append(li)

        # design (optional)
        dp = r.get("design_position","")
        dn = r.get("design_name","")
        dnots = r.get("design_notes","")
        if dp or dn or dnots:
            key = (dp, dn, dnots)
            if key not in seen_designs[ono]:
                designs[ono].append({
                    "position": dp,
                    "design_name": dn,
                    "colour_notes": dnots
                })
                seen_designs[ono].add(key)

    # Update store
    STORE["orders"] = orders
    STORE["line_items"] = line_items
    STORE["designs"] = designs
    STORE["meta"]["rows"] = len(rows)

    return {
        "ok": True,
        "orders": len(orders),
        "rows": len(rows),
        "message": f"Loaded {len(orders)} orders / {len(rows)} line items from {file.filename}"
    }

@app.get("/jobs")
def jobs(q: str = ""):
    items = list(STORE["orders"].values())
    if q:
        Q = q.lower().strip()
        items = [
            o for o in items
            if Q in str(o["order_no"]).lower()
            or Q in (o["order_type"] or "").lower()
            or Q in (o["customer"] or "").lower()
            or Q in (o["job_title"] or "").lower()
        ]
    # same shape as before
    return {"ok": True, "items": items}

@app.get("/orders/{order_no}")
def order_detail(order_no: int):
    o = STORE["orders"].get(order_no)
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")
    return {
        "ok": True,
        "header": o,
        "designs": STORE["designs"].get(order_no, []),
        "line_items": STORE["line_items"].get(order_no, [])
    }

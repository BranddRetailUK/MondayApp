import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from mdb_client import search_open_orders, get_order
from monday_client import find_parent_item_by_order_no, ensure_subitems

load_dotenv()

PORT = int(os.getenv("PORT", "5005"))

app = FastAPI(title="MDB → Monday Service")

# CORS for your dashboard (set your origin if you know it)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"ok": True}

@app.get("/jobs")
def jobs(q: str = ""):
    """
    List open orders. Optional ?q= search across order no / customer / job title / type.
    """
    try:
        return {"ok": True, "items": search_open_orders(q)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/orders/{order_no}")
def order_detail(order_no: int):
    """
    Fetch an order header + designs + line_items.
    """
    data = get_order(order_no)
    if not data:
        raise HTTPException(status_code=404, detail="Order not found")
    return {"ok": True, **data}

@app.post("/orders/{order_no}/push-to-monday")
def push_to_monday(order_no: int):
    """
    Look up the parent pulse by Order No and create subitems for each line item.
    """
    data = get_order(order_no)
    if not data:
        raise HTTPException(status_code=404, detail="Order not found")

    parent_id = find_parent_item_by_order_no(order_no)
    if not parent_id:
        raise HTTPException(status_code=404, detail=f"No parent item on Monday for order {order_no}")

    result = ensure_subitems(parent_id, data["line_items"])
    return {"ok": True, "parent_item_id": parent_id, **result}

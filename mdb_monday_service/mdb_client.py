import os
import pyodbc
from dataclasses import dataclass, asdict
from typing import List, Dict, Any, Optional

MDB_PATH = os.getenv("MDB_PATH")
MDW_PATH = os.getenv("MDW_PATH")
MDB_USER = os.getenv("MDB_USER", "")
MDB_PASS = os.getenv("MDB_PASS", "")

ORDER_TYPE = {0: "G", 1: "P", 2: "E"}

@dataclass
class OrderHeader:
    order_no: int
    order_type: str
    customer: str
    job_title: str
    order_id: int

@dataclass
class DesignPos:
    position: str
    colour_notes: str
    design_name: str

@dataclass
class LineItem:
    qty: int
    description: str
    product_id: Optional[int]
    size: Optional[str] = None
    colour: Optional[str] = None
    style_code: Optional[str] = None
    style_name: Optional[str] = None

def _conn() -> pyodbc.Connection:
    conn_str = (
        r"DRIVER={Microsoft Access Driver (*.mdb)};"
        f"DBQ={MDB_PATH};"
        f"SYSTEMDB={MDW_PATH};"
        f"UID={MDB_USER};PWD={MDB_PASS};"
    )
    return pyodbc.connect(conn_str)

def _customer_map(cur) -> Dict[int, str]:
    cur.execute("SELECT CustomerID, sCustomer FROM tblCustomer")
    return {row.CustomerID: row.sCustomer for row in cur.fetchall()}

def latest_order_no(cur) -> int:
    cur.execute("SELECT MAX(lngOrderNo) FROM tblOrder")
    return cur.fetchone()[0]

def open_orders(cur, customer_map: Dict[int, str]) -> List[OrderHeader]:
    cur.execute(
        "SELECT lngOrderNo, OrderTypeID, CustomerID, sJobTitle, OrderID "
        "FROM tblOrder WHERE ynComplete = 0"
    )
    out = []
    for row in cur.fetchall():
        out.append(OrderHeader(
            order_no=row.lngOrderNo,
            order_type=ORDER_TYPE.get(row.OrderTypeID, str(row.OrderTypeID)),
            customer=customer_map.get(row.CustomerID, str(row.CustomerID)),
            job_title=row.sJobTitle,
            order_id=row.OrderID
        ))
    return out

def _product_breakdown(cur, product_id: int) -> Dict[str, str]:
    # StyleID, StyleColourID, StyleSizeID
    cur.execute("SELECT StyleID, StyleColourID, StyleSizeID FROM tblProduct WHERE ProductID = ?", product_id)
    row = cur.fetchone()
    if not row:
        return {}
    style_id, style_colour_id, style_size_id = row.StyleID, row.StyleColourID, row.StyleSizeID

    cur.execute("SELECT sStyleCode, sStyle FROM tblStyle WHERE StyleID = ?", style_id)
    srow = cur.fetchone()
    style_code = (srow.sStyleCode or "").upper().strip() if srow else ""
    style_name = (srow.sStyle or "").strip() if srow else ""

    cur.execute("SELECT ColourID FROM tblStyleColour WHERE StyleColourID = ?", style_colour_id)
    crow = cur.fetchone()
    colour_id = crow.ColourID if crow else None
    colour = ""
    if colour_id:
        cur.execute("SELECT sColour FROM tblColour WHERE ColourID = ?", colour_id)
        tmp = cur.fetchone()
        colour = (tmp.sColour or "").strip() if tmp else ""

    cur.execute("SELECT SizeID FROM tblStyleSize WHERE StyleSizeID = ?", style_size_id)
    sizerow = cur.fetchone()
    size_id = sizerow.SizeID if sizerow else None
    size = ""
    if size_id:
        cur.execute("SELECT sSize FROM tblSize WHERE SizeID = ?", size_id)
        tmp = cur.fetchone()
        size = (tmp.sSize or "").strip() if tmp else ""

    return {"style_code": style_code, "style_name": style_name, "colour": colour, "size": size}

def order_detail(cur, order_no: int, customer_map: Dict[int, str]) -> Dict[str, Any]:
    cur.execute(
        "SELECT lngOrderNo, OrderTypeID, CustomerID, sJobTitle, OrderID "
        "FROM tblOrder WHERE lngOrderNo = ?", order_no
    )
    oh = cur.fetchone()
    if not oh:
        return {}

    header = OrderHeader(
        order_no=oh.lngOrderNo,
        order_type=ORDER_TYPE.get(oh.OrderTypeID, str(oh.OrderTypeID)),
        customer=customer_map.get(oh.CustomerID, str(oh.CustomerID)),
        job_title=oh.sJobTitle,
        order_id=oh.OrderID
    )

    # design positions
    cur.execute(
        "SELECT sPosition, memColour, sDesign FROM tblOrderPosition WHERE OrderID = ?",
        header.order_id
    )
    designs = [DesignPos(position=r.sPosition, colour_notes=r.memColour, design_name=r.sDesign)
               for r in cur.fetchall()]

    # deliverable items only
    cur.execute(
        "SELECT lngQty, sDescription, ProductID "
        "FROM tblOrderItem "
        "WHERE OrderID = ? AND ynNonDeliverable = 0 AND ynInternal = 0",
        header.order_id
    )

    line_items: List[LineItem] = []
    for r in cur.fetchall():
        qty = int(r.lngQty) if r.lngQty is not None else 0
        desc = (r.sDescription or "").strip()
        pid = r.ProductID
        if desc:
            line_items.append(LineItem(qty=qty, description=desc, product_id=pid))
        else:
            info = _product_breakdown(cur, pid) if pid is not None else {}
            line_items.append(LineItem(
                qty=qty,
                description="",
                product_id=pid,
                size=info.get("size"),
                colour=info.get("colour"),
                style_code=info.get("style_code"),
                style_name=info.get("style_name"),
            ))

    return {
        "header": asdict(header),
        "designs": [asdict(d) for d in designs],
        "line_items": [asdict(li) for li in line_items]
    }

def search_open_orders(query: str = "") -> List[Dict[str, Any]]:
    with _conn() as conn:
        cur = conn.cursor()
        cmap = _customer_map(cur)
        orders = open_orders(cur, cmap)  # all open orders
        if query:
            q = query.lower()
            orders = [
                o for o in orders
                if q in str(o.order_no).lower() or
                   q in o.customer.lower() or
                   (o.job_title or "").lower().find(q) >= 0 or
                   o.order_type.lower().find(q) >= 0
            ]
        return [asdict(o) for o in orders]

def get_order(order_no: int) -> Dict[str, Any]:
    with _conn() as conn:
        cur = conn.cursor()
        cmap = _customer_map(cur)
        return order_detail(cur, order_no, cmap)

import os
import requests
from typing import Dict, Any, List, Optional

MONDAY_API_KEY = os.getenv("MONDAY_API_KEY")
MONDAY_API_URL = "https://api.monday.com/v2"
MONDAY_BOARD_ID = int(os.getenv("MONDAY_BOARD_ID", "0"))
PARENT_BOARD_ID = int(os.getenv("PARENT_BOARD_ID", str(MONDAY_BOARD_ID)))
ORDERNO_COL = os.getenv("MONDAY_ORDERNO_COLUMN_ID", "text")

HEADERS = {
    "Authorization": MONDAY_API_KEY,
    "Content-Type": "application/json"
}

def _gql(query: str, variables: Dict[str, Any]) -> Dict[str, Any]:
    r = requests.post(MONDAY_API_URL, headers=HEADERS, json={"query": query, "variables": variables})
    r.raise_for_status()
    data = r.json()
    if "errors" in data:
        raise RuntimeError(data["errors"])
    return data["data"]

def find_parent_item_by_order_no(order_no: int) -> Optional[int]:
    # Query items on the parent board filtering by column value (Order No)
    query = """
    query($board_id: Int!, $column_id: String!, $val: JSON!) {
      items_page(
        query_params: {board_ids: [$board_id], rules: [{column_id: $column_id, compare_value: $val}]},
        limit: 50
      ) {
        items { id name }
      }
    }
    """
    variables = {"board_id": PARENT_BOARD_ID, "column_id": ORDERNO_COL, "val": str(order_no)}
    data = _gql(query, variables)
    items = data.get("items_page", {}).get("items", [])
    return int(items[0]["id"]) if items else None

def create_subitem(parent_item_id: int, name: str, column_values: Dict[str, Any]) -> int:
    # `create_subitem` mutation
    query = """
    mutation($parent_item_id: Int!, $item_name: String!, $column_values: JSON) {
      create_subitem(parent_item_id: $parent_item_id, item_name: $item_name, column_values: $column_values) {
        id
      }
    }
    """
    variables = {"parent_item_id": parent_item_id, "item_name": name, "column_values": column_values}
    data = _gql(query, variables)
    return int(data["create_subitem"]["id"])

def ensure_subitems(parent_item_id: int, line_items: List[Dict[str, Any]]) -> Dict[str, Any]:
    # Very simple create-only pass (idempotency can be added by storing hashes)
    created_ids = []
    for i, li in enumerate(line_items, start=1):
        # Build a readable name
        base = li.get("description") or f'{li.get("style_code","")}-{li.get("style_name","")}'.strip("-")
        size = li.get("size") or ""
        colour = li.get("colour") or ""
        qty = li.get("qty", 0)
        name = base or f"Line {i}"
        if size or colour:
            name = f"{name} ({size} {colour})".strip()

        # Map to your subitem columns (edit IDs to match your board)
        cols = {
            "numbers__qty": {"number": qty},
            "text__size":  size,
            "text__colour": colour,
            "text__style": li.get("style_code") or "",
            "long_text__desc": li.get("description") or "",
        }
        sid = create_subitem(parent_item_id, name, cols)
        created_ids.append(sid)
    return {"created": created_ids}

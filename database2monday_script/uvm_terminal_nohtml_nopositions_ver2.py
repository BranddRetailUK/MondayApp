import pyodbc
import os
import os.path as path
from datetime import datetime
import time
import sys
import shutil
import re

# Toggleable logger controlled by UVM_LOG env (truthy values: 1, true, yes, on)
def _is_truthy(val):
    return str(val).strip().lower() in ("1", "true", "yes", "on")

LOG_ENABLED = _is_truthy(os.getenv("UVM_LOG", "0"))

def log(*args, **kwargs):
    if LOG_ENABLED:
        print(*args, **kwargs)

# Global variables actually used
latestOrderNumber = 0
customer_dict = {}
orderType_dict = {0:"G", 1:"P", 2:"E"}

mdb_path = ""
mdw_path = ""
dropbox_path = ""
onedrive_path = ""
embroidery_link = ""
embroidery_pdf_dir = ""
repeat_seconds = 60
omit_words = set()
# Resolve settings file next to the executable (or script when not frozen)
_base_dir = path.dirname(sys.executable if getattr(sys, "frozen", False) else path.abspath(__file__))
settings_path = path.join(_base_dir, "uvm_settings.txt")
omit_path = path.join(_base_dir, "uvm_omit.txt")

def load_settings():
    """Load paths from ultimate_wm_settings.txt into globals."""
    global mdb_path, mdw_path, dropbox_path, onedrive_path, repeat_seconds, embroidery_link, embroidery_pdf_dir

    try:
        with open(settings_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue

                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")

                if key == "mdb_path":
                    mdb_path = path.normpath(value)
                elif key == "mdw_path":
                    mdw_path = path.normpath(value)
                elif key == "dropbox_path":
                    dropbox_path = path.normpath(value)
                elif key == "onedrive_path":
                    onedrive_path = path.normpath(value)
                elif key == "embroidery_link":
                    embroidery_link = value
                elif key in ("embroidery_pdf_dir", "embroidery_pdf_path"):
                    embroidery_pdf_dir = path.normpath(value)
                elif key == "repeat":
                    try:
                        repeat_seconds = int(value)
                    except ValueError:
                        log(f"Invalid repeat value '{value}', using default {repeat_seconds}")
        if not embroidery_pdf_dir and onedrive_path:
            base_od = path.normpath(path.dirname(onedrive_path))
            embroidery_pdf_dir = path.join(base_od, "Embroidery")
    except FileNotFoundError:
        log(f"Settings file not found: {settings_path}")
    except Exception as e:
        log(f"Could not read settings file: {e}")

def load_omit_words():
    """Refresh omit words list from uvm_omit.txt each cycle."""
    global omit_words
    try:
        with open(omit_path, encoding="utf-8") as f:
            words = []
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                words.append(line.lower())
        omit_words = set(words)
        try:
            sorted_words = sorted(omit_words)
            with open(omit_path, mode="w", encoding="utf-8") as out:
                for word in sorted_words:
                    out.write(word + "\n")
        except Exception as e:
            log(f"Could not rewrite omit list '{omit_path}': {e}")
    except FileNotFoundError:
        omit_words = set()
    except Exception as e:
        log(f"Could not read omit list '{omit_path}': {e}")

def mdb_connect(mdb_path, mdw_path, username, password):

    conn_str = (
        r'DRIVER={Microsoft Access Driver (*.mdb)};'
        f'DBQ={mdb_path};'
        f'SYSTEMDB={mdw_path};'
        f'UID={username};'
        f'PWD={password};'
    )

    try:
        conn = pyodbc.connect(conn_str)
        os.system('cls')
        log("Connection successful.")

        probe(conn)

    except Exception as e:
        log("Error connecting:", e)
    conn.close()
    log("Finished.")


def getProduct(cursor, proID):
    cursor.execute(f"SELECT StyleID, StyleColourID, StyleSizeID FROM tblProduct WHERE ProductID = {proID}")
    rows = cursor.fetchall()

    StyleID = rows[0].StyleID
    StyleColourID = rows[0].StyleColourID
    StyleSizeID = rows[0].StyleSizeID

    # Style
    cursor.execute(f"SELECT sStyleCode, sStyle FROM tblStyle WHERE StyleID = {StyleID}")
    rows = cursor.fetchall()
    StyleCode = rows[0].sStyleCode.upper()
    StyleDes = rows[0].sStyle

    # Colour
    cursor.execute(f"SELECT ColourID FROM tblStyleColour WHERE StyleColourID = {StyleColourID}")
    ColourID = cursor.fetchall()[0].ColourID

    cursor.execute(f"SELECT sColour FROM tblColour WHERE ColourID = {ColourID}")
    StyleColour = cursor.fetchall()[0].sColour

    # Size
    cursor.execute(f"SELECT SizeID FROM tblStyleSize WHERE StyleSizeID = {StyleSizeID}")
    SizeID = cursor.fetchall()[0].SizeID

    cursor.execute(f"SELECT sSize FROM tblSize WHERE SizeID = {SizeID}")
    StyleSize = cursor.fetchall()[0].sSize

    return f"{StyleSize}, {StyleColour}, {StyleCode}, {StyleDes}"

def sanitize_description(desc):
    """Remove any omit words from the description (case-insensitive)."""




    if not desc or not omit_words:
        cleaned = desc or ""
    else:
        cleaned = desc
        for word in omit_words:
            pattern = r"\b" + re.escape(word) + r"\b"
            cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE)

    # Remove GSM markings like "320gsm" or "180GSM".
    cleaned = re.sub(r"\b\d{3}\w*gsm\b", "", cleaned, flags=re.IGNORECASE)

    # Collapse extra whitespace that may remain after removals.
    cleaned = " ".join(cleaned.split())
    return cleaned.strip(" ")

def export_monday(cursor):
    log("\nCollecting open PRINT and EMBROIDERY orders...\n")

    # If the configured path looks like a CSV file, use it directly; otherwise treat it as a directory.
    if dropbox_path and dropbox_path.lower().endswith(".csv"):
        output_path = dropbox_path
        output_dir = path.dirname(output_path) or "."
    else:
        output_dir = dropbox_path or "."
        output_path = path.join(output_dir, "open_orders.csv")

    try:
        if output_dir and not path.exists(output_dir):
            os.makedirs(output_dir, exist_ok=True)
    except Exception as e:
        log(f"Could not create output directory '{output_dir}': {e}")
        return

    try:
        cursor.execute("""
            SELECT lngOrderNo, OrderTypeID, CustomerID, sJobTitle, TakenByStaffID, OrderID
            FROM tblOrder
            WHERE ynComplete = 0
        """)
        orders = cursor.fetchall()

        pe_orders = [o for o in orders if o.OrderTypeID in (1, 2)]
        pe_orders.sort(key=lambda o: o.lngOrderNo)

        log(f"Found {len(pe_orders)} open P/E orders.\n")

        def write_orders(target_path):
            total_items_local = 0
            with open(target_path, mode="w", newline="", encoding="utf-8") as f:
                for order in pe_orders:
                    order_num = order.lngOrderNo
                    order_type = orderType_dict[order.OrderTypeID]
                    order_type_str = "PRINT" if order_type == "P" else "EMBROIDERY"
                    customer_name = customer_dict.get(order.CustomerID, "Unknown")
                    if customer_name.strip().lower() == "unknown":
                        log(f"Skipping order {order_num} with unknown customer.")
                        continue
                    job_title = order.sJobTitle or ""

                    f.write(f"{order_num}\n")
                    f.write(f"{order_type_str}\n")
                    f.write(f"{customer_name}\n")
                    f.write(f"{job_title}\n")

                    cursor.execute(f"""
                        SELECT lngQty, sDescription, ProductID
                        FROM tblOrderItem
                        WHERE OrderID = {order.OrderID}
                        AND ynNonDeliverable = 0
                        AND ynInternal = 0
                    """)
                    items = cursor.fetchall()

                    for item in items:
                        qty = item.lngQty
                        if item.sDescription:
                            desc = ",,," + item.sDescription
                        else:
                            desc = sanitize_description(getProduct(cursor, item.ProductID))

                        f.write(f"{qty},{desc}\n")
                        total_items_local += 1
                
                    #f.write("-----\n")
                    #f.write(f"{getPositions(cursor, order.OrderID)}\n")
                    #f.write(f"owner,{getStaffName(cursor, order.TakenByStaffID)}\n")

                    f.write("=====\n")

            return total_items_local

        try:
            total_items = write_orders(output_path)
            saved_path = output_path
        except PermissionError:
            fallback_path = path.join(output_dir, "open_orders.csv")
            total_items = write_orders(fallback_path)
            saved_path = fallback_path
            log(f"Permission denied writing '{output_path}', saved to fallback '{fallback_path}'.")

        log(f"Exported {len(pe_orders)} orders with {total_items} items total.")
        log(f"Saved to '{saved_path}' successfully.\n")
        log_path = log_export(saved_path)
        copy_to_onedrive(saved_path, "CSV export")
        if log_path:
            copy_to_onedrive(log_path, "log")

    except Exception as e:
        log(f"Error exporting Monday orders: {e}\n")

def getPositions(cursor, orderID):

    """Return a formatted description of design positions for an order."""
    try:
        cursor.execute(
            "SELECT sPosition, memColour, sDesign FROM tblOrderPosition WHERE OrderID = ?",
            orderID,
        )
        rows = cursor.fetchall()
    except Exception as e:
        return f"Error loading positions for order {orderID}: {e}"

    if not rows:
        return ""

    descriptions = []
    for row in rows:
        position = (row.sPosition or "").replace(",", ";")
        colours = (row.memColour or "").replace(",", ";")
        design_raw = row.sDesign or ""

        if design_raw.strip():
            psg_in_design = re.search(r"\bPSG\s?\d{4}\b", design_raw, flags=re.IGNORECASE)
            if psg_in_design:
                design_raw = psg_in_design.group(0).replace(" ", "").upper()
        else:
            colour_source = row.memColour or ""
            psg_match = re.search(r"\bPSG\s?\d{4}\b", colour_source, flags=re.IGNORECASE)
            if psg_match:
                design_raw = psg_match.group(0).replace(" ", "").upper()
            else:
                num_match = re.search(r"\b(\d{5})\b", colour_source)
                if num_match:
                    design_raw = num_match.group(1)

        design = design_raw.replace(",", ";")
        descriptions.append(f"position,{design},{colours},{position}")

    return "\n".join(descriptions)

def getStaffName(cursor, staffID):
    """Lookup staff name for the given StaffID."""
    if staffID is None:
        return "Unknown"

    try:
        cursor.execute(
            "SELECT sFirstname, sLastname, sUsername FROM tblStaff WHERE StaffID = ?",
            staffID,
        )
        row = cursor.fetchone()
    except Exception as e:
        return f"Error loading staff {staffID}: {e}"

    if not row:
        return f"Unknown staff {staffID}"

    first = (row.sFirstname or "").strip()
    last = (row.sLastname or "").strip()
    username = (row.sUsername or "").strip()
    full_name = f"{first} {last}".strip()

    if full_name:
        return full_name
    if username:
        return username

    return f"Staff {staffID}"

def log_export(csv_path):
    """Append a one-line summary of the export to logs.txt by reading the CSV."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    file_name = path.basename(csv_path)
    log_line = f"{timestamp} | {file_name} | "

    try:
        size_bytes = os.path.getsize(csv_path)
        log_line += f"{size_bytes} bytes | "
    except OSError as e:
        log_line += f"size error: {e} | "

    order_numbers = []
    try:
        with open(csv_path, encoding="utf-8") as f:
            lines = [ln.strip() for ln in f if ln.strip()]
        for idx, line in enumerate(lines):
            if line.isdigit():
                if idx + 1 < len(lines) and lines[idx + 1] in ("PRINT", "EMBROIDERY"):
                    order_numbers.append(int(line))
    except Exception as e:
        log(f"Could not read '{csv_path}' to extract order numbers: {e}")

    jobs_str = ", ".join(str(num) for num in order_numbers) if order_numbers else "none"
    log_line += f"jobs: {jobs_str}"

    log_filename = f"logs_{datetime.now().strftime('%Y-%m-%d')}.txt"
    log_path = path.join(path.dirname(csv_path) or ".", log_filename)
    try:
        if not path.exists(path.dirname(log_path)):
            os.makedirs(path.dirname(log_path), exist_ok=True)
    except Exception as e:
        log(f"Could not ensure log directory exists: {e}")
    try:
        with open(log_path, mode="a", encoding="utf-8") as log_file:
            log_file.write(log_line + "\n\n")
    except Exception as e:
        log(f"Could not write export log: {e}")
        return None

    return log_path

def copy_to_onedrive(src_path, label):
    """Copy the given file to the OneDrive folder if configured."""
    if not src_path or not path.exists(src_path):
        return

    if not onedrive_path:
        return

    dest_dir = onedrive_path
    try:
        os.makedirs(dest_dir, exist_ok=True)
    except Exception as e:
        log(f"Could not create OneDrive directory '{dest_dir}': {e}")
        return

    dest_path = path.join(dest_dir, path.basename(src_path))

    try:
        shutil.copy2(src_path, dest_path)
        log(f"Copied {label} to OneDrive: '{dest_path}'.")
    except Exception as e:
        log(f"Could not copy {label} to OneDrive: {e}")

def probe(connection):

    cursor = connection.cursor()

    # Refresh settings before starting so a live edit is picked up immediately.
    load_settings()

    # latest order number
    cursor.execute("SELECT MAX(lngOrderNo) FROM tblOrder")
    global latestOrderNumber
    latestOrderNumber = cursor.fetchone()[0]
    log(f"Latest order number is {latestOrderNumber}.\n")

    # customer dictionary
    cursor.execute("SELECT CustomerID, sCustomer FROM tblCustomer")
    global customer_dict
    customer_dict = {row.CustomerID: row.sCustomer for row in cursor.fetchall()}

    while True:
        # Reload settings on each cycle so paths/frequency changes take effect without restart.
        load_settings()
        load_omit_words()
        export_monday(cursor)
        log(f"Waiting {repeat_seconds} seconds before next export...\n")
        time.sleep(repeat_seconds)


# main
load_settings()
load_omit_words()
mdb_connect(
    path.join(mdb_path, "PS_XP_tab.mdb"),
    path.join(mdw_path, "PS_XP_sys.mdw"),
    "lubos",
    ""
)





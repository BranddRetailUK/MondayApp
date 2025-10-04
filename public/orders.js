// public/orders.js
(() => {
  let __orders = [];
  let __customerSearchTimer = null;
  let __selectedCustomer = null;

  const ACTIVE_STATUSES = new Set(["Draft", "Confirmed", "In Production"]);

  document.addEventListener("DOMContentLoaded", () => {
    const root = document.getElementById("orders-root") || document.getElementById("tab-orders");
    if (!root) return;

    // Tab activation → refresh orders
    document.querySelectorAll(".nav-tabs li").forEach(t => {
      t.addEventListener("click", () => {
        if (t.getAttribute("data-tab") === "orders") refreshOrders();
      });
    });

    // If already active on load
    const tab = document.getElementById("tab-orders");
    if (tab && tab.classList.contains("active")) refreshOrders();

    // View elements
    const listView = document.getElementById("orders-list-view");
    const createView = document.getElementById("order-create-view");

    // Open/Back buttons
    const openCreateBtn = document.getElementById("open-create-order");
    const backBtn = document.getElementById("order-create-back");
    openCreateBtn.addEventListener("click", () => {
      listView.style.display = "none";
      createView.style.display = "";
      // initial lines rendered when entering create view
      ensureDefaultLines();
      // focus customer field
      setTimeout(() => document.getElementById("order-customer")?.focus(), 50);
    });
    backBtn.addEventListener("click", () => {
      listView.style.display = "";
      createView.style.display = "none";
      resetCreateForm();
      refreshOrders();
    });

    // Wire form submit (exists in create view)
    const form = document.getElementById("order-form");
    form.addEventListener("submit", onCreateOrder);

    // Customer search
    const custInput = document.getElementById("order-customer");
    const custDropdown = document.getElementById("order-customer-dd");
    custInput.addEventListener("input", () => {
      clearTimeout(__customerSearchTimer);
      const q = custInput.value.trim();
      if (!q) {
        custDropdown.innerHTML = "";
        custDropdown.classList.remove("open");
        __selectedCustomer = null;
        return;
      }
      __customerSearchTimer = setTimeout(() => doCustomerSearch(q), 200);
    });

    // Add customer shortcut
    document.getElementById("add-customer-btn").addEventListener("click", () => {
      document.querySelector('.nav-tabs li[data-tab="customers"]').click();
      setTimeout(() => {
        const el = document.querySelector('#customer-form input[name="business_name"]');
        el && el.focus();
      }, 100);
    });

    // Close DD on click-away
    document.addEventListener("click", (e) => {
      if (!custDropdown.contains(e.target) && e.target !== custInput) {
        custDropdown.classList.remove("open");
      }
    });

    // --- Items repeater ---
    document.getElementById("add-line-btn").addEventListener("click", addLine);
    ensureDefaultLines(); // in case the create view is already visible on load
  });

  function ensureDefaultLines() {
    const body = document.getElementById("order-lines-body");
    if (!body) return;
    if (body.children.length === 0) {
      addLine(); addLine(); addLine();
    }
  }

  // ----- Orders list (active only) -----
  async function refreshOrders() {
    try {
      const r = await fetch("/api/orders?limit=200", { cache: "no-store" });
      const all = r.ok ? await r.json() : [];
      __orders = all.filter(o => ACTIVE_STATUSES.has(o.status || "Draft"));
    } catch { __orders = []; }
    renderOrdersList();
  }

function renderOrdersList() {
  const tbody = document.querySelector("#orders-table tbody");
  tbody.innerHTML = "";
  if (!__orders.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">No active orders. Click “Create Order”.</td></tr>`;
    return;
  }
  for (const o of __orders) {
    const tr = document.createElement("tr");

    const quickFromLine = o.first_item
      ? `${esc(o.first_item.product_title || o.first_item.product_code || '')}`.trim()
      : (esc(o.product_title || o.product_code || ""));
    const displayTitle = (o.job_title && o.job_title.trim()) ? o.job_title : quickFromLine || "-";

    tr.innerHTML = `
      <td>${esc(o.id)}</td>
      <td>${esc(o.customer_name || "-")}</td>
      <td>${esc(displayTitle)}</td>
      <td>${esc(o.status || "-")}</td>
      <td>${o.created_at ? new Date(o.created_at).toLocaleString() : "-"}</td>
      <td>
        <a class="btn small" href="order.html?id=${encodeURIComponent(o.id)}">View</a>
      </td>
    `;
    tbody.appendChild(tr);
  }
}


  // ----- Customer search -----
  async function doCustomerSearch(q) {
    const dd = document.getElementById("order-customer-dd");
    dd.innerHTML = `<div class="dd-item muted">Searching…</div>`;
    dd.classList.add("open");

    try {
      const r = await fetch(`/api/customers/search?q=${encodeURIComponent(q)}`);
      const list = r.ok ? await r.json() : [];
      if (!list.length) {
        dd.innerHTML = `<div class="dd-item muted">No matches</div>`;
        return;
      }

      dd.innerHTML = "";
      list.forEach(c => {
        const el = document.createElement("div");
        el.className = "dd-item";
        el.innerHTML = `
          <div class="dd-title">${esc(c.business_name)}</div>
          <div class="dd-sub">${esc(c.contact_name || "")} ${c.email ? "• " + esc(c.email) : ""}</div>
        `;
        el.addEventListener("click", () => {
          __selectedCustomer = c;
          const input = document.getElementById("order-customer");
          input.value = c.business_name;
          dd.classList.remove("open");
        });
        dd.appendChild(el);
      });
    } catch {
      dd.innerHTML = `<div class="dd-item muted">Search failed</div>`;
    }
  }

  // ----- Items repeater helpers (horizontal) -----
  function addLine() {
    const tmpl = document.querySelector(".line-template");
    const body = document.getElementById("order-lines-body");
    const row = tmpl.cloneNode(true);
    row.classList.remove("line-template");
    row.style.display = "";

    // remove button
    row.querySelector(".line-remove").addEventListener("click", () => row.remove());

    body.appendChild(row);
  }

  function readLines() {
    const rows = Array.from(document.querySelectorAll("#order-lines-body .line-row"));
    const items = [];
    let lineNo = 1;
    for (const r of rows) {
      const get = (n) => r.querySelector(`input[name="${n}"]`)?.value.trim() || "";
      const item = {
        product_code: get("product_code"),
        garment_type: get("garment_type"),
        product_title: get("product_title"),
        colour: get("colour"),
        size: get("size"),
        quantity: Math.max(1, parseInt(get("quantity") || "1", 10))
      };
      if (item.product_code || item.product_title || item.colour || item.size) {
        item.line_no = lineNo++;
        items.push(item);
      }
    }
    return items;
  }

  function resetCreateForm() {
    const form = document.getElementById("order-form");
    form.reset();
    __selectedCustomer = null;
    document.getElementById("order-customer").value = "";
    document.getElementById("order-customer-dd").classList.remove("open");
    document.getElementById("order-lines-body").innerHTML = "";
  }

  // ----- Submit -----
  async function onCreateOrder(e) {
    e.preventDefault();
    const form = e.currentTarget;

    if (!__selectedCustomer || document.getElementById("order-customer").value.trim() !== __selectedCustomer.business_name) {
      return alert("Please select a customer from the dropdown.");
    }

    const items = readLines();
    if (!items.length) return alert("Please enter at least one product line.");

    const fd = new FormData();
    fd.append("customer_id", __selectedCustomer.id);
    fd.append("job_title", form.job_title.value.trim()); // NEW
    fd.append("status", form.status.value);
    fd.append("notes", form.notes.value.trim());
    fd.append("items", JSON.stringify(items)); // sends ALL lines

    // Back-compat single-line fields (ok if ignored server-side)
    const f = items[0];
    fd.append("product_code", f.product_code || "");
    fd.append("garment_type", f.garment_type || "");
    fd.append("product_title", f.product_title || "");
    fd.append("colour", f.colour || "");
    fd.append("size", f.size || "");

    const files = form.files.files;
    for (let i = 0; i < files.length; i++) {
      fd.append("files", files[i], files[i].name);
    }

    try {
      const r = await fetch("/api/orders", { method: "POST", body: fd });
      if (!r.ok) {
        const j = await r.json().catch(()=>({error:"Failed"}));
        return alert(j.error || "Failed to create order");
      }

      // Return to list, refresh
      document.getElementById("orders-list-view").style.display = "";
      document.getElementById("order-create-view").style.display = "none";
      resetCreateForm();
      await refreshOrders();
      alert("Order created.");
    } catch {
      alert("Failed to create order");
    }
  }

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
})();

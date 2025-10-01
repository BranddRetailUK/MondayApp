// public/orders.js
(() => {
  let __orders = [];
  let __customerSearchTimer = null;
  let __selectedCustomer = null;

  document.addEventListener("DOMContentLoaded", () => {
    const root = document.getElementById("orders-root");
    if (!root) return;

    // Tab activation → refresh orders
    document.querySelectorAll(".nav-tabs li").forEach(t => {
      t.addEventListener("click", () => {
        if (t.getAttribute("data-tab") === "orders") {
          refreshOrders();
        }
      });
    });

    // If already active on load
    const tab = document.getElementById("tab-orders");
    if (tab && tab.classList.contains("active")) refreshOrders();

    // Wire form
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
      // Jump to Customers tab and focus the form
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
  });

  async function refreshOrders() {
    try {
      const r = await fetch("/api/orders?limit=50", { cache: "no-store" });
      __orders = r.ok ? await r.json() : [];
    } catch {
      __orders = [];
    }
    renderOrdersList();
  }

  function renderOrdersList() {
    const tbody = document.querySelector("#orders-table tbody");
    tbody.innerHTML = "";
    if (!__orders.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted">No orders yet. Create one with the form on the right.</td></tr>`;
      return;
    }
    for (const o of __orders) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(o.id)}</td>
        <td>${esc(o.customer_name || "-")}</td>
        <td>${esc(o.product_code || "-")}</td>
        <td>${esc(o.product_title || "-")}</td>
        <td>${esc(o.colour || "-")} / ${esc(o.size || "-")}</td>
        <td>${o.created_at ? new Date(o.created_at).toLocaleString() : "-"}</td>
      `;
      tbody.appendChild(tr);
    }
  }

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

  async function onCreateOrder(e) {
    e.preventDefault();
    const form = e.currentTarget;

    // Validate customer
    if (!__selectedCustomer || document.getElementById("order-customer").value.trim() !== __selectedCustomer.business_name) {
      return alert("Please select a customer from the dropdown.");
    }

    const fd = new FormData();
    fd.append("customer_id", __selectedCustomer.id);
    fd.append("product_code", form.product_code.value.trim());
    fd.append("garment_type", form.garment_type.value.trim());
    fd.append("product_title", form.product_title.value.trim());
    fd.append("colour", form.colour.value.trim());
    fd.append("size", form.size.value.trim());
    fd.append("status", form.status.value);
    fd.append("notes", form.notes.value.trim());

    const files = form.files.files;
    for (let i = 0; i < files.length; i++) {
      fd.append("files", files[i], files[i].name);
    }

    try {
      const r = await fetch("/api/orders", {
        method: "POST",
        body: fd
      });
      if (!r.ok) {
        const j = await r.json().catch(()=>({error:"Failed"}));
        return alert(j.error || "Failed to create order");
      }
      // Reset form
      form.reset();
      __selectedCustomer = null;
      document.getElementById("order-customer").value = "";
      document.getElementById("order-customer-dd").classList.remove("open");

      await refreshOrders();
      alert("Order created successfully.");
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

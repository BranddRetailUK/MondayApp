// public/customers.js

(() => {
  // Minimal state
  let __customers = [];
  let __activeCustomer = null;

  document.addEventListener("DOMContentLoaded", () => {
    // Only boot the Customers UI if the tab exists
    const root = document.getElementById("customers-root");
    if (!root) return;

    // Wire tab switch so we refresh when entering Customers
    const tabs = document.querySelectorAll(".nav-tabs li");
    tabs.forEach(t => {
      t.addEventListener("click", () => {
        if (t.getAttribute("data-tab") === "customers") {
          loadCustomers();
        }
      });
    });

    // Initial render (if Customers already active on load)
    const customersTab = document.getElementById("tab-customers");
    if (customersTab && customersTab.classList.contains("active")) {
      loadCustomers();
    }

    // Wire form submit
    const form = document.getElementById("customer-form");
    form.addEventListener("submit", onSubmitNewCustomer);

    // Wire back button in detail view
    const backBtn = document.getElementById("customer-back-btn");
    backBtn.addEventListener("click", () => {
      __activeCustomer = null;
      renderCustomersList();
    });
  });

  async function loadCustomers() {
    try {
      const r = await fetch("/api/customers", { credentials: "include", cache: "no-store" });
      __customers = r.ok ? await r.json() : [];
    } catch {
      __customers = [];
    }
    if (!__activeCustomer) renderCustomersList();
  }

  function renderCustomersList() {
    const listWrap = document.getElementById("customers-list");
    const detailWrap = document.getElementById("customer-detail");
    const formWrap = document.getElementById("customer-form-wrap");

    detailWrap.style.display = "none";
    listWrap.style.display = "";
    formWrap.style.display = "";

    // Render table
    const tbody = document.querySelector("#customers-table tbody");
    tbody.innerHTML = "";
    if (!__customers.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="muted">No customers yet. Add one using the form on the right.</td></tr>`;
      return;
    }

    for (const c of __customers) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(c.business_name)}</td>
        <td>${esc(c.contact_name || "")}</td>
        <td>${esc(c.email || "")}</td>
        <td>${esc(c.phone || c.mobile || "")}</td>
        <td><button class="btn small" data-id="${c.id}">Open</button></td>
      `;
      tr.querySelector("button").addEventListener("click", () => openCustomer(c.id));
      tbody.appendChild(tr);
    }
  }

  async function openCustomer(id) {
    try {
      const [r1, r2] = await Promise.all([
        fetch(`/api/customers/${encodeURIComponent(id)}`, { credentials: "include" }),
        fetch(`/api/customers/${encodeURIComponent(id)}/orders`, { credentials: "include" })
      ]);
      if (!r1.ok) return alert("Failed to load customer");
      const customer = await r1.json();
      const orders = r2.ok ? await r2.json() : [];

      __activeCustomer = customer;
      renderCustomerDetail(customer, orders);
    } catch (e) {
      alert("Failed to load customer");
    }
  }

  function renderCustomerDetail(c, orders) {
    const listWrap = document.getElementById("customers-list");
    const formWrap = document.getElementById("customer-form-wrap");
    const detailWrap = document.getElementById("customer-detail");

    listWrap.style.display = "none";
    formWrap.style.display = "none";
    detailWrap.style.display = "";

    // Header
    document.getElementById("cd-name").textContent = c.business_name || "(No business name)";
    document.getElementById("cd-contact").textContent = c.contact_name || "-";
    document.getElementById("cd-email").textContent = c.email || "-";
    document.getElementById("cd-phone").textContent = c.phone || c.mobile || "-";

    // Addresses
    document.getElementById("cd-invoice").innerHTML = fmtAddress(
      c.inv_line1, c.inv_line2, c.inv_city, c.inv_region, c.inv_postcode, c.inv_country
    );
    document.getElementById("cd-shipping").innerHTML = fmtAddress(
      c.ship_line1, c.ship_line2, c.ship_city, c.ship_region, c.ship_postcode, c.ship_country
    );

    // Orders preview
    const otbody = document.querySelector("#customer-orders-table tbody");
    otbody.innerHTML = "";
    if (!orders.length) {
      otbody.innerHTML = `<tr><td colspan="4" class="muted">No orders found for this customer.</td></tr>`;
    } else {
      for (const o of orders) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${esc(o.order_number || o.id)}</td>
          <td>${esc(o.status || "-")}</td>
          <td>${esc(o.total || "-")}</td>
          <td>${o.created_at ? new Date(o.created_at).toLocaleString() : "-"}</td>
        `;
        otbody.appendChild(tr);
      }
    }
  }

  async function onSubmitNewCustomer(e) {
    e.preventDefault();
    const form = e.currentTarget;

    const payload = {
      business_name: form.business_name.value.trim(),
      contact_name: form.contact_name.value.trim(),
      email: form.email.value.trim(),
      phone: form.phone.value.trim(),
      mobile: form.mobile.value.trim(),
      inv_line1: form.inv_line1.value.trim(),
      inv_line2: form.inv_line2.value.trim(),
      inv_city: form.inv_city.value.trim(),
      inv_region: form.inv_region.value.trim(),
      inv_postcode: form.inv_postcode.value.trim(),
      inv_country: form.inv_country.value.trim(),
      ship_line1: form.ship_line1.value.trim(),
      ship_line2: form.ship_line2.value.trim(),
      ship_city: form.ship_city.value.trim(),
      ship_region: form.ship_region.value.trim(),
      ship_postcode: form.ship_postcode.value.trim(),
      ship_country: form.ship_country.value.trim()
    };

    if (!payload.business_name) return alert("Business name is required");
    if (!payload.email) return alert("Email is required");

    try {
      const r = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });
      if (!r.ok) {
        const j = await r.json().catch(()=>({error:"Failed"}));
        return alert(j.error || "Failed to save");
      }
      form.reset();
      await loadCustomers();
    } catch {
      alert("Failed to save");
    }
  }

  function fmtAddress(l1, l2, city, region, pc, country) {
    const parts = [l1, l2, city, region, pc, country].filter(Boolean).map(esc);
    return parts.length ? parts.join("<br>") : "<span class='muted'>-</span>";
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

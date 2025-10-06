(() => {
  const API_BASE =
    window.MDB_API_BASE ||
    (location.hostname === "localhost" || location.hostname === "127.0.0.1"
      ? "http://localhost:5005"
      : "http://localhost:5005"); // change when deployed

  const els = {
    panel: document.querySelector("#tab-mdb-jobs"),
    search: document.querySelector("#mdb-search"),
    searchBtn: document.querySelector("#mdb-search-btn"),
    table: document.querySelector("#mdb-jobs-table"),
    uploadBtn: document.querySelector("#mdb-upload-btn"),
    uploadInput: document.querySelector("#mdb-csv"),
    uploadStatus: document.querySelector("#mdb-upload-status"),
  };

  const api = (p) => `${API_BASE}${p}`;

  function h(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") el.className = v;
      else if (k.startsWith("on") && typeof v === "function")
        el.addEventListener(k.slice(2), v);
      else if (v != null) el.setAttribute(k, v);
    }
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null) return;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return el;
  }

  const setLoading = () =>
    (els.table.innerHTML = `<div class="p-4 text-sm opacity-70">Loading…</div>`);
  const setEmpty = (msg = "No jobs loaded. Upload a CSV to begin.") =>
    (els.table.innerHTML = `<div class="p-4 opacity-70">${msg}</div>`);
  const setError = (e) =>
    (els.table.innerHTML = `<div class="p-4 text-red-500">Error: ${e}</div>`);

  // Upload CSV
  els.uploadBtn?.addEventListener("click", () => els.uploadInput.click());
  els.uploadInput?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    els.uploadStatus.textContent = "Uploading…";
    els.uploadBtn.disabled = true;

    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      const res = await fetch(api("/upload-csv"), { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.detail || "Upload failed");
      els.uploadStatus.textContent = `Loaded ${json.orders} orders (${json.rows} rows)`;
      await load(""); // refresh list
    } catch (err) {
      console.error(err);
      els.uploadStatus.textContent = `Error: ${err.message}`;
      setError(err.message);
    } finally {
      els.uploadBtn.disabled = false;
      e.target.value = ""; // reset file input so same file can be re-selected
    }
  });

  function renderJobRow(job) {
    const row = h("div", { class: "mdb-row border-b" });
    const head = h(
      "div",
      {
        class:
          "grid grid-cols-12 gap-2 items-center py-3 cursor-pointer hover:bg-white/5",
      },
      [
        h("div", { class: "col-span-1" }, [h("span", { class: "chev" }, "▸")]),
        h("div", { class: "col-span-2 font-mono" }, String(job.order_no || "")),
        h("div", { class: "col-span-1" }, job.order_type || ""),
        h("div", { class: "col-span-4" }, job.job_title || ""),
        h("div", { class: "col-span-4 opacity-80 truncate", title: job.customer || "" }, job.customer || ""),
      ]
    );

    const body = h("div", { class: "hidden px-4 pb-4" }, [
      h("div", { class: "text-sm opacity-70 py-2" }, "Loading details…"),
    ]);

    let loaded = false;
    let open = false;

    async function toggle() {
      open = !open;
      head.querySelector(".chev").style.display = "inline-block";
      head.querySelector(".chev").style.transform = open ? "rotate(90deg)" : "rotate(0deg)";
      body.classList.toggle("hidden", !open);

      if (open && !loaded) {
        try {
          const res = await fetch(api(`/orders/${job.order_no}`));
          const json = await res.json();
          if (!json.ok) throw new Error(json.detail || "Failed to load order");

          const wrap = h("div", { class: "space-y-3" });
          wrap.appendChild(h("div", { class: "text-sm opacity-80" }, `Job/Order No: ${job.order_no}`));

          if ((json.designs || []).length) {
            wrap.appendChild(
              h("div", { class: "text-sm" }, [
                h("div", { class: "font-semibold mb-1" }, "Designs"),
                h(
                  "ul",
                  { class: "list-disc pl-5 space-y-1" },
                  json.designs.map((d) =>
                    h(
                      "li",
                      {},
                      `${d.position || ""} — ${d.design_name || ""}${
                        d.colour_notes ? ` (${d.colour_notes})` : ""
                      }`
                    )
                  )
                ),
              ])
            );
          }

          const items = json.line_items || [];
          const tbl = h("div", { class: "text-sm" }, [
            h("div", { class: "font-semibold mb-1" }, `Line Items (${items.length})`),
            h("div", { class: "grid grid-cols-12 gap-2 font-semibold py-2 border-b" }, [
              h("div", { class: "col-span-1 text-right" }, "Qty"),
              h("div", { class: "col-span-3" }, "Description / Style"),
              h("div", { class: "col-span-2" }, "Size"),
              h("div", { class: "col-span-3" }, "Colour"),
              h("div", { class: "col-span-3" }, "Style Code / Name"),
            ]),
            ...items.map((li) =>
              h("div", { class: "grid grid-cols-12 gap-2 py-2 border-b border-white/10" }, [
                h("div", { class: "col-span-1 text-right font-mono" }, String(li.qty ?? "")),
                h(
                  "div",
                  { class: "col-span-3" },
                  li.description && li.description.trim()
                    ? li.description
                    : "(no description)"
                ),
                h("div", { class: "col-span-2" }, li.size || ""),
                h("div", { class: "col-span-3" }, li.colour || ""),
                h("div", { class: "col-span-3" }, `${li.style_code || ""} ${li.style_name || ""}`.trim()),
              ])
            ),
          ]);

          body.innerHTML = "";
          body.appendChild(wrap);
          body.appendChild(tbl);
          loaded = true;
        } catch (err) {
          body.innerHTML = `<div class="text-red-500 text-sm">Error: ${err.message}</div>`;
        }
      }
    }

    head.addEventListener("click", toggle);
    row.appendChild(head);
    row.appendChild(body);
    return row;
  }

  function renderJobs(items) {
    if (!items || !items.length) return setEmpty();
    els.table.innerHTML = "";
    els.table.appendChild(
      h("div", { class: "grid grid-cols-12 gap-2 font-semibold py-2 border-b" }, [
        h("div", { class: "col-span-1" }, ""), // chevron
        h("div", { class: "col-span-2" }, "Order #"),
        h("div", { class: "col-span-1" }, "Type"),
        h("div", { class: "col-span-4" }, "Title"),
        h("div", { class: "col-span-4" }, "Customer"),
      ])
    );
    items.forEach((o) => els.table.appendChild(renderJobRow(o)));
  }

  async function load(q = "") {
    setLoading();
    try {
      const res = await fetch(api(`/jobs${q ? `?q=${encodeURIComponent(q)}` : ""}`));
      const json = await res.json();
      if (!json.ok) throw new Error(json.detail || "Failed to load jobs");
      renderJobs(json.items || []);
    } catch (err) {
      setError(err.message);
    }
  }

  els.searchBtn?.addEventListener("click", () => load(els.search.value.trim()));
  els.search?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") load(els.search.value.trim());
  });

  function maybeLoadOnActivate() {
    const visible = location.hash === "#tab-mdb-jobs" || els.panel?.style.display !== "none";
    if (visible && !els.table.dataset.loaded) {
      els.table.dataset.loaded = "1";
      load();
    }
  }

  window.addEventListener("hashchange", maybeLoadOnActivate);
  document.addEventListener("DOMContentLoaded", maybeLoadOnActivate);
})();

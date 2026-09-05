const API = "http://localhost:5050";

const colourSelect = document.getElementById("garmentColour");
const swatch = document.getElementById("garmentSwatch");
const rgbText = document.getElementById("garmentRgb");

const frontPos = document.getElementById("frontPosition");
const backPos  = document.getElementById("backPosition");

const frontUpload = document.getElementById("frontUpload");
const backUpload  = document.getElementById("backUpload");
const frontStatus = document.getElementById("frontStatus");
const backStatus  = document.getElementById("backStatus");

const saveMsg = document.getElementById("saveMsg");

let COLOURS = {};
let uploaded = { front: null, back: null }; // { filename }

function rgbString(rgb){ return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`; }

async function loadColours(){
  const res = await fetch(`${API}/garment-colors`);
  if (!res.ok) throw new Error("Cannot load garment colours");
  COLOURS = await res.json();

  colourSelect.innerHTML = "";
  Object.keys(COLOURS).forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    colourSelect.appendChild(opt);
  });

  if (colourSelect.options.length) colourSelect.selectedIndex = 0;
  updateColourPreview();
}

function updateColourPreview(){
  const name = colourSelect.value;
  const rgb = COLOURS[name];
  if (rgb){
    swatch.style.background = rgbString(rgb);
    rgbText.textContent = `${rgb.r}, ${rgb.g}, ${rgb.b}`;
  } else {
    swatch.style.background = "transparent";
    rgbText.textContent = "";
  }
}
colourSelect.addEventListener("change", updateColourPreview);

// ---- upload helper that doesn't assume JSON on error ----
async function postUpload(fd){
  const res = await fetch(`${API}/upload`, { method: "POST", body: fd });
  const ct = res.headers.get("content-type") || "";
  let payload;
  if (ct.includes("application/json")) payload = await res.json();
  else payload = { error: (await res.text()).trim() };
  if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
  return payload;
}

async function uploadArtwork(which){
  const input = which === "front" ? frontUpload : backUpload;
  const statusEl = which === "front" ? frontStatus : backStatus;
  const file = input.files && input.files[0];
  if (!file){
    uploaded[which] = null;
    statusEl.textContent = "No file uploaded.";
    return;
  }
  const fd = new FormData();
  fd.append("artwork", file);
  statusEl.textContent = "Uploading...";
  try{
    const data = await postUpload(fd);
    uploaded[which] = { filename: data.filename };
    statusEl.textContent = `Uploaded: ${data.filename}`;
  }catch(err){
    statusEl.textContent = `Upload failed: ${err.message}`;
    uploaded[which] = null;
  }
}
frontUpload.addEventListener("change", () => uploadArtwork("front"));
backUpload.addEventListener("change",  () => uploadArtwork("back"));

function requireArtworkIfNeeded(){
  const errs = [];
  if (frontPos.value !== "None" && !uploaded.front) {
    errs.push("Front print selected but no front artwork uploaded.");
  }
  if (backPos.value !== "None" && !uploaded.back) {
    errs.push("Back print selected but no back artwork uploaded.");
  }
  return errs;
}

function safeName(s){
  return String(s || "").replace(/[\/\\:*?"<>|]+/g, "").replace(/\s+/g, "_");
}

document.getElementById("generateBtn").addEventListener("click", async () => {
  saveMsg.textContent = "";

  const problems = requireArtworkIfNeeded();
  if (problems.length) {
    alert(problems.join("\n"));
    return;
  }

  const customer = document.getElementById("customer").value.trim();
  const jobTitle = document.getElementById("jobTitle").value.trim();
  const jobRef   = document.getElementById("jobRef").value.trim();
  const qtyRaw   = document.getElementById("jobQty").value.trim();
  const quantity = Math.max(1, parseInt(qtyRaw || "1", 10));
  const colour   = colourSelect.value;

  const placements = [];
  if (frontPos.value !== "None") {
    placements.push({
      position: frontPos.value,
      artworkFile: uploaded.front?.filename || ""
    });
  }
  if (backPos.value !== "None") {
    placements.push({
      position: backPos.value,
      artworkFile: uploaded.back?.filename || ""
    });
  }

  const outputFilename = `${safeName(customer)}_${safeName(jobTitle)}_proof.pdf`;

  const job = {
    itemId: "LOCALTEST-" + Date.now(),
    name: `${customer} - ${jobTitle}`,
    customer,
    jobTitle,
    ref: jobRef,
    quantity,                 // <-- new
    garmentColour: colour,
    placements,
    outputFilename
  };

  try{
    const res = await fetch(`${API}/save-job`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(job)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    saveMsg.textContent = "Job saved. Run the Illustrator script.";
  }catch(err){
    saveMsg.textContent = "Save failed: " + err.message;
  }
});

loadColours().catch(err => {
  alert("Failed to load garment colours. Start the mock server.\n" + err.message);
});

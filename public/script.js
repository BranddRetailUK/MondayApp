async function loadBoard() {
  const boardDiv = document.getElementById("board");
  boardDiv.innerHTML = "Loading...";

  try {
    const res = await fetch("/api/board");
    const data = await res.json();

    if (res.status === 401) {
      // Not authenticated → show Connect button
      boardDiv.innerHTML = `
        <p style="color:red">Not connected to Monday.</p>
        <a href="/auth" class="btn">Connect to Monday</a>
      `;
      return;
    }

    if (data.errors) {
      boardDiv.innerHTML = `<p style="color:red">Error: ${data.errors[0].message}</p>`;
      return;
    }

    const board = data.data.boards[0];
    let html = `<h2>${board.name} (ID: ${board.id})</h2>`;
    html += `<p>State: ${board.state}</p>`;
    html += "<h3>Items:</h3>";

    html += board.items.map(i => `<div class="item">${i.name} (ID: ${i.id})</div>`).join("");
    boardDiv.innerHTML = html;
  } catch (err) {
    boardDiv.innerHTML = `<p style="color:red">Failed to load board</p>`;
    console.error(err);
  }
}

// Auto-try loading the board on page load
window.onload = loadBoard;

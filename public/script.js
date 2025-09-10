async function loadBoard() {
  const boardDiv = document.getElementById("board");
  boardDiv.innerHTML = "Loading...";

  try {
    const res = await fetch("/api/board");
    const data = await res.json();

    if (res.status === 401) {
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

    if (board.groups && board.groups.length > 0) {
      board.groups.forEach(group => {
        html += `<h3>${group.title}</h3>`;
        if (group.items && group.items.length > 0) {
          html += group.items
            .map(item => {
              let cols = "";
              if (item.column_values && item.column_values.length > 0) {
                cols = "<ul>" + item.column_values
                  .map(cv => `<li><strong>${cv.title}:</strong> ${cv.text || "-"}</li>`)
                  .join("") + "</ul>";
              }
              return `<div class="item">
                        <p><strong>${item.name}</strong> (ID: ${item.id})</p>
                        ${cols}
                      </div>`;
            })
            .join("");
        } else {
          html += "<p>No items in this group.</p>";
        }
      });
    } else {
      html += "<p>No groups found.</p>";
    }

    boardDiv.innerHTML = html;
  } catch (err) {
    boardDiv.innerHTML = `<p style="color:red">Failed to load board</p>`;
    console.error(err);
  }
}

// Auto-load on page open
window.onload = loadBoard;

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
    let html = `<h2>${board.name}</h2>`;
    html += `<p>State: ${board.state}</p>`;

    // Build a map of column id → title
    const columnMap = {};
    board.columns.forEach(col => {
      columnMap[col.id] = col.title;
    });

    if (board.groups && board.groups.length > 0) {
      board.groups.forEach(group => {
        html += `<h3>${group.title}</h3>`;

        if (group.items_page && group.items_page.items.length > 0) {
          html += "<ul>";
          group.items_page.items.forEach(item => {
            html += `<li><strong>${item.name}</strong> (ID: ${item.id})<br/>`;

            if (item.column_values && item.column_values.length > 0) {
              html += "<ul>";
              item.column_values.forEach(cv => {
                const label = columnMap[cv.id] || cv.id;
                html += `<li><em>${label}:</em> ${cv.text || "-"}</li>`;
              });
              html += "</ul>";
            } else {
              html += "<em>No column data</em>";
            }

            html += "</li>";
          });
          html += "</ul>";
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

window.onload = loadBoard;

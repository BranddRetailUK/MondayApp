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
    let html = `<h1>${board.name}</h1>`;
    html += `<p>State: ${board.state}</p>`;

    const columnMap = {};
    board.columns.forEach(col => {
      columnMap[col.id] = col.title;
    });

    if (board.groups && board.groups.length > 0) {
      board.groups.forEach(group => {
        html += `<h3>${group.title}</h3>`;

        // Build header row
        html += `<table><thead><tr>`;
        html += `<th>Job</th>`;
        board.columns.forEach(col => {
          html += `<th>${col.title}</th>`;
        });
        html += `</tr></thead><tbody>`;

        if (group.items_page && group.items_page.items.length > 0) {
          group.items_page.items.forEach(item => {
            html += `<tr>`;
            html += `<td><strong>${item.name}</strong><br><small>ID: ${item.id}</small></td>`;

            board.columns.forEach(col => {
              const cv = item.column_values.find(v => v.id === col.id);
              let value = cv && cv.text ? cv.text : "-";

              // Special handling for Files column
              if (col.title.toLowerCase().includes("file") && value !== "-") {
                const links = value.split(",").map((url, idx) => {
                  const trimmed = url.trim();
                  if (!trimmed) return "";
                  return `<a href="${trimmed}" target="_blank">File ${idx + 1}</a>`;
                });
                value = links.join(", ");
              }

              html += `<td>${value}</td>`;
            });

            html += `</tr>`;
          });
        } else {
          html += `<tr><td colspan="${board.columns.length + 1}">No items in this group</td></tr>`;
        }

        html += `</tbody></table>`;
      });
    }

    boardDiv.innerHTML = html;
  } catch (err) {
    boardDiv.innerHTML = `<p style="color:red">Failed to load board</p>`;
    console.error(err);
  }
}

window.onload = loadBoard;

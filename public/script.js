async function loadBoard() {
  try {
    const res = await fetch('/api/data');
    const data = await res.json();

    renderBoard(data);
  } catch (err) {
    console.error('Error loading board data:', err);
  }
}

function renderBoard(collections) {
  const boardDiv = document.getElementById('board');
  boardDiv.innerHTML = '';

  // collections is an object: { "Pre-Production": [...], "Print": [...], ... }
  for (const [collectionName, items] of Object.entries(collections)) {
    const sectionTitle = document.createElement('h3');
    sectionTitle.textContent = collectionName;
    boardDiv.appendChild(sectionTitle);

    const table = document.createElement('table');

    // Table header
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>Print</th>
        <th>Order #</th>
        <th>Customer</th>
        <th>Job Title</th>
        <th>Priority</th>
        <th>Status</th>
        <th>Date</th>
        <th>Files</th>
      </tr>
    `;
    table.appendChild(thead);

    // Table body
    const tbody = document.createElement('tbody');

    items.forEach(item => {
      const tr = document.createElement('tr');

      // Print button column
      const printTd = document.createElement('td');
      const printBtn = document.createElement('button');
      printBtn.textContent = '🖨️ Print';
      printBtn.classList.add('print-btn');
      printBtn.addEventListener('click', () => printLabel(item));
      printTd.appendChild(printBtn);
      tr.appendChild(printTd);

      // Other columns
      tr.innerHTML += `
        <td>${item.orderNumber || ''}</td>
        <td>${item.customerName || ''}</td>
        <td>${item.jobTitle || ''}</td>
        <td>${item.priority || ''}</td>
        <td>${item.status || ''}</td>
        <td>${item.date || ''}</td>
        <td>${renderFiles(item.files)}</td>
      `;

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    boardDiv.appendChild(table);
  }
}

function renderFiles(files) {
  if (!files || files.length === 0) return '';
  return files.map(f => `<a href="${f.url}" target="_blank">${f.name}</a>`).join('<br>');
}

function printLabel(item) {
  const orderNumber = item.orderNumber || '';
  const customerName = item.customerName || '';
  const jobTitle = (item.jobTitle || '').replace(/-/g, ' ');

  const labelHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Shipping Label</title>
      <style>
        body {
          width: 384px; /* 4in at 96dpi */
          height: 576px; /* 6in at 96dpi */
          margin: 0;
          padding: 20px;
          font-family: Arial, sans-serif;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: flex-start;
        }
        h2 {
          margin: 10px 0 2px;
          font-size: 16px;
        }
        p {
          margin: 0 0 10px;
          font-size: 18px;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <h2>ORDER NUMBER</h2>
      <p>${orderNumber}</p>
      <h2>CUSTOMER NAME</h2>
      <p>${customerName}</p>
      <h2>JOB TITLE</h2>
      <p>${jobTitle}</p>
      <script>
        window.onload = function() {
          window.print();
        };
      </script>
    </body>
    </html>
  `;

  const printWin = window.open('', '', 'width=400,height=600');
  printWin.document.open();
  printWin.document.write(labelHtml);
  printWin.document.close();
}

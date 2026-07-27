(function attachLabelLayout(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LabelLayout = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createLabelLayout() {
  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function renderWholeWords(value) {
    return String(value || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => `<span class="word">${escapeHtml(word)}</span>`)
      .join(' ');
  }

  function buildLabelDocument(label = {}, options = {}) {
    const orderNumber = String(label.orderNumber || '').trim();
    const customerName = String(label.customerName || '').trim();
    const jobTitle = String(label.jobTitle || '').trim();
    const autoPrint = options.autoPrint !== false;
    const blocks = [
      { className: 'job-number', head: 'JOB NUMBER', value: orderNumber, ratio: 0.62, maxSize: 96, maxLines: 1 },
      { className: 'customer', head: 'CUSTOMER', value: customerName, ratio: 0.46, maxSize: 54, maxLines: 2, singleLineFloor: 34 },
      { className: 'job-title', head: 'JOB TITLE', value: jobTitle, ratio: 0.50, maxSize: 54, maxLines: 2, singleLineFloor: 34 },
    ];

    return `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(orderNumber ? `${orderNumber} - Shipping Label` : 'Shipping Label')}</title>
        <style>
          @media print {
            @page { size: 4in 6in; margin: 0; }
            html, body { width: 4in; height: 6in; margin: 0; padding: 0; }
          }
          html, body {
            width: 4in;
            height: 6in;
            margin: 0;
            padding: 0;
            overflow: hidden;
            background: #fff;
          }
          .wrap {
            box-sizing: border-box;
            width: 4in;
            height: 6in;
            padding: 0.18in;
          }
          .content {
            box-sizing: border-box;
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            gap: 0.32in;
            text-align: center;
            overflow: visible;
          }
          .block {
            flex: 0 0 auto;
            min-width: 0;
          }
          .block-job-title {
            margin-top: 0.08in;
          }
          .head {
            margin: 0 0 6px;
            font-family: Arial, sans-serif;
            font-size: 14pt;
            font-weight: 800;
            line-height: 1;
          }
          .value {
            box-sizing: border-box;
            width: 100%;
            margin: 0;
            overflow: visible;
            font-family: Arial, sans-serif;
            font-weight: 900;
            line-height: 1.05;
          }
          .value[data-max-lines="1"] {
            white-space: nowrap;
          }
          .value[data-max-lines="2"] {
            white-space: normal;
            overflow-wrap: normal;
            word-break: normal;
            -webkit-hyphens: none;
            hyphens: none;
          }
          .word {
            white-space: nowrap;
          }
        </style>
      </head>
      <body>
        <div class="wrap">
          <div class="content">
            ${blocks.map((block) => `
              <div class="block block-${block.className}">
                <div class="head">${escapeHtml(block.head)}</div>
                <div
                  class="value"
                  data-ratio="${block.ratio}"
                  data-max-size="${block.maxSize}"
                  data-max-lines="${block.maxLines}"
                  ${block.singleLineFloor ? `data-single-line-floor="${block.singleLineFloor}"` : ''}
                >${block.maxLines > 1 ? renderWholeWords(block.value) : escapeHtml(block.value)}</div>
              </div>
            `).join('')}
          </div>
        </div>
        <script>
          (function(){
            function fits(el, maxLines){
              var styles = window.getComputedStyle(el);
              var lineHeight = parseFloat(styles.lineHeight) || (parseFloat(styles.fontSize) * 1.05);
              var widthFits = el.scrollWidth <= (el.clientWidth + 1);
              var heightFits = el.scrollHeight <= ((lineHeight * maxLines) + 2);
              return widthFits && heightFits;
            }
            function fit(el){
              var width = el.clientWidth || el.getBoundingClientRect().width;
              var ratio = parseFloat(el.getAttribute('data-ratio')) || 0.4;
              var maxSize = parseFloat(el.getAttribute('data-max-size')) || Number.POSITIVE_INFINITY;
              var maxLines = parseInt(el.getAttribute('data-max-lines'), 10) || 1;
              var singleLineFloor = parseFloat(el.getAttribute('data-single-line-floor')) || 0;
              var minSize = 10;
              var startingSize = Math.min(maxSize, Math.max(minSize, Math.floor(width * ratio)));
              var size = startingSize;
              el.style.fontSize = size + 'px';
              if (maxLines > 1 && singleLineFloor > 0) {
                el.style.whiteSpace = 'nowrap';
                while (!fits(el, 1) && size > singleLineFloor) {
                  size -= 1;
                  el.style.fontSize = size + 'px';
                }
                if (fits(el, 1)) return;
                el.style.whiteSpace = 'normal';
                size = startingSize;
                el.style.fontSize = size + 'px';
              }
              var guard = 0;
              while (!fits(el, maxLines) && size > minSize && guard < 200) {
                size -= 1;
                el.style.fontSize = size + 'px';
                guard += 1;
              }
            }
            function fitValues(){
              Array.prototype.slice.call(document.querySelectorAll('.value')).forEach(fit);
            }
            function startPrint(){
              var closeTimer = null;
              var printed = false;
              function closeAfterPrint(){
                if (closeTimer) return;
                closeTimer = setTimeout(function(){
                  try { window.close(); } catch (e) {}
                }, 250);
              }
              if (printed) return;
              printed = true;
              window.addEventListener('afterprint', closeAfterPrint, { once: true });
              window.addEventListener('focus', function(){
                if (printed) closeAfterPrint();
              }, { once: true });
              window.print();
            }
            function ready(){
              fitValues();
              ${autoPrint ? 'setTimeout(startPrint, 150);' : ''}
            }
            if (document.fonts && document.fonts.ready) {
              document.fonts.ready.then(ready);
            } else {
              ready();
            }
          }());
        </script>
      </body>
      </html>
    `;
  }

  return {
    buildLabelDocument,
  };
}));

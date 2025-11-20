// src/services/openOrdersParser.js
const fs = require('fs');

function normalizeLine(line = '') {
  return line.replace(/\r/g, '').trim();
}

function trimLeadingEmptyCells(parts = []) {
  let idx = 0;
  while (idx < parts.length && !parts[idx].trim()) {
    idx += 1;
  }
  return parts.slice(idx);
}

function extractHeaderValue(line = '') {
  const parts = trimLeadingEmptyCells(String(line).split(','));
  return (parts[0] || '').trim();
}

function parseLineItem(line) {
  const parts = trimLeadingEmptyCells(line.split(','));
  const [qtyStr = '', size = '', colour = '', code = '', ...rest] = parts;
  const description = rest.join(',').trim();
  return {
    qty: Number(qtyStr.trim()) || 0,
    size: size.trim(),
    colour: colour.trim(),
    code: code.trim(),
    description,
  };
}

function parseOpenOrdersText(text) {
  const lines = text.split('\n').map(normalizeLine);
  const jobs = [];
  let current = null;
  let headerStage = 0; // 0 waiting for jobNo, 1 jobType, 2 customer, 3 title, >=4 line items

  function finalizeCurrent() {
    if (current) {
      jobs.push(current);
    }
    current = null;
    headerStage = 0;
  }

  for (const line of lines) {
    if (!line) {
      continue;
    }
    if (extractHeaderValue(line).startsWith('=====')) {
      finalizeCurrent();
      continue;
    }
    if (!current) {
      current = {
        jobNumber: extractHeaderValue(line),
        jobType: '',
        customer: '',
        jobTitle: '',
        lineItems: [],
      };
      headerStage = 1;
      continue;
    }

    if (headerStage === 1) {
      current.jobType = extractHeaderValue(line);
      headerStage = 2;
      continue;
    }
    if (headerStage === 2) {
      current.customer = extractHeaderValue(line);
      headerStage = 3;
      continue;
    }
    if (headerStage === 3) {
      current.jobTitle = extractHeaderValue(line);
      headerStage = 4;
      continue;
    }

    if (headerStage >= 4) {
      current.lineItems.push(parseLineItem(line));
      continue;
    }
  }

  finalizeCurrent();
  return jobs;
}

function parseOpenOrdersFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return parseOpenOrdersText(text);
}

module.exports = {
  parseOpenOrdersText,
  parseOpenOrdersFile,
};

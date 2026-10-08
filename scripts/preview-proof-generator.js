require('dotenv').config();
const path = require('path');
const express = require('express');
const { createRouter } = require('../src/routes/proof-generator');

const app = express();
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.json({ limit: '100kb' }));
app.use('/api/proof-generator', createRouter({ requireProduction: false }));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'proof-generator-preview.html')));
app.use(express.static(publicDir, { index: false }));
app.listen(3108, '127.0.0.1', () => {
  console.log('Proof Generator preview: http://127.0.0.1:3108/');
});

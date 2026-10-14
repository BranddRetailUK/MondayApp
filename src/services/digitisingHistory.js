const { randomUUID } = require('node:crypto');
const pool = require('../db/pool');
function createHistory(db = pool) {
  return {
    async save({ filename, garment, result, preview }) {
      const id = randomUUID();
      const name = String(filename || 'embroidery').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 160) || 'embroidery';
      await db.query(`INSERT INTO digitising_studio_jobs (id, filename, garment, stats, threads, dst, preview_png)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, name + '.dst', garment, JSON.stringify(result.stats), JSON.stringify(result.threads), Buffer.from(result.dst, 'base64'), preview]);
      return id;
    },
    async list(offset = 0) {
      const { rows } = await db.query(`SELECT id, filename, garment, stats, threads, created_at FROM digitising_studio_jobs
        ORDER BY created_at DESC, id DESC LIMIT 51 OFFSET $1`, [offset]);
      return { jobs: rows.slice(0, 50), hasMore: rows.length > 50 };
    },
    async file(id, preview) {
      const { rows } = await db.query(`SELECT filename, ${preview ? 'preview_png' : 'dst'} AS bytes FROM digitising_studio_jobs WHERE id=$1`, [id]);
      return rows[0];
    }
  };
}
module.exports = { createHistory };

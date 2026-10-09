// Proof-only supplier catalogue. No links or writes to DATABASE products/order lines.
async function ensureProofPencarrieTables(db) {
  const sql=`CREATE TABLE IF NOT EXISTS proof_pencarrie_imports (
    id UUID PRIMARY KEY, source_name TEXT NOT NULL, source_hash TEXT NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), counts JSONB NOT NULL
  );
  CREATE TABLE IF NOT EXISTS proof_pencarrie_styles (
    code TEXT PRIMARY KEY, name TEXT NOT NULL, brand TEXT NOT NULL, gender TEXT NOT NULL,
    garment_type TEXT NOT NULL, supplier_code TEXT NOT NULL, import_id UUID NOT NULL REFERENCES proof_pencarrie_imports(id)
  );
  CREATE TABLE IF NOT EXISTS proof_pencarrie_colours (
    style_code TEXT NOT NULL REFERENCES proof_pencarrie_styles(code), code TEXT NOT NULL, name TEXT NOT NULL,
    rgb TEXT NOT NULL, images JSONB NOT NULL, import_id UUID NOT NULL REFERENCES proof_pencarrie_imports(id),
    PRIMARY KEY(style_code,code)
  );
  CREATE TABLE IF NOT EXISTS proof_pencarrie_variants (
    sku TEXT PRIMARY KEY, style_code TEXT NOT NULL, colour_code TEXT NOT NULL,
    size TEXT NOT NULL, size_conversions TEXT NOT NULL, list_price NUMERIC(12,4),
    discontinued BOOLEAN NOT NULL, special_order BOOLEAN NOT NULL, is_active BOOLEAN NOT NULL,
    import_id UUID NOT NULL REFERENCES proof_pencarrie_imports(id),
    FOREIGN KEY(style_code,colour_code) REFERENCES proof_pencarrie_colours(style_code,code)
  );
  CREATE INDEX IF NOT EXISTS proof_pencarrie_variants_colour_idx ON proof_pencarrie_variants(style_code,colour_code) WHERE is_active;
  CREATE INDEX IF NOT EXISTS proof_pencarrie_style_name_idx ON proof_pencarrie_styles(LOWER(name));`;
  for(const statement of sql.split(';').filter(s=>s.trim()))await db.query(statement);
}
module.exports={ensureProofPencarrieTables};

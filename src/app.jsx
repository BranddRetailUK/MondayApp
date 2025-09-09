import React, { useEffect, useMemo, useRef, useState } from 'react'
import mondaySdk from 'monday-sdk-js'
import QRCode from 'qrcode'
import Label from '/Label.jsx'
import { parseItemTitle } from './parse.js'

const monday = mondaySdk()

async function fetchSelectedItems() {
  // Get context: boardId + selected items
  const ctx = await monday.get('context')
  const boardId = ctx?.data?.boardId

  // monday UI selection (works in board view)
  const selection = await monday.get('itemIds')
  const idsFromSelection = selection?.data || []

  // If nothing selected, we can fallback to last N items on board (optional)
  const ids = idsFromSelection

  if (!boardId || !ids?.length) {
    return { boardId, items: [] }
  }

  const query = `
    query ($ids: [ID!]!) {
      items (ids: $ids) {
        id
        name
      }
    }
  `
  const res = await monday.api(query, { variables: { ids } })
  const items = res?.data?.items || []
  return { boardId, items }
}

export default function App() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [error, setError] = useState('')

  // Controls
  const [orientation, setOrientation] = useState('portrait') // 'portrait' | 'landscape'
  const [copies, setCopies] = useState(1)
  const [includeLogo, setIncludeLogo] = useState(false)
  const [logoUrl, setLogoUrl] = useState('')
  const [reserveQR, setReserveQR] = useState(false)
  const [qrMode, setQrMode] = useState('none') // 'none' | 'job' | 'url'
  
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { items } = await fetchSelectedItems()
        if (!mounted) return
        setItems(items)
      } catch (e) {
        setError(e?.message || 'Failed to fetch items')
      } finally {
        setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  // Build labels with parsing + copies
  const labels = useMemo(() => {
    const list = []
    for (const it of items) {
      const parsed = parseItemTitle(it.name, it.id)
      for (let i = 0; i < Math.max(1, Number(copies) || 1); i++) {
        list.push({ id: `${it.id}-${i}`, itemId: it.id, ...parsed })
      }
    }
    return list
  }, [items, copies])

  // Optional QR generation (client-side) — keeps quiet zone default
  const [qrData, setQrData] = useState({})
  useEffect(() => {
    let mounted = true
    ;(async () => {
      if (!reserveQR || qrMode === 'none') { setQrData({}); return }
      const next = {}
      for (const l of labels) {
        const payload = qrMode === 'job'
          ? String(l.job)
          : `https://view.monday.com/items/${l.itemId}` // simple direct URL pattern; adjust if needed
        try {
          next[l.id] = await QRCode.toDataURL(payload, { margin: 1, scale: 6 })
        } catch {
          next[l.id] = undefined
        }
      }
      if (mounted) setQrData(next)
    })()
    return () => { mounted = false }
  }, [labels, reserveQR, qrMode])

  // Trigger print
  const onPrint = () => window.print()

  // For screen preview
  const Preview = ({ job, customer, name }) => (
    <div className="preview-label">
      <div style={{
        width:'100%', height:'100%', position:'relative',
        display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:'6px', padding:'18px'
      }}>
        <div style={{ fontWeight:900, fontSize:48 }}>{job}</div>
        {customer ? <div style={{ fontWeight:700, fontSize:20 }}>{customer}</div> : null}
        {name ? <div style={{ fontWeight:700, fontSize:20 }}>{name}</div> : null}
      </div>
    </div>
  )

  return (
    <div className={`app ${orientation === 'landscape' ? 'landscape' : ''}`}>
      <div className="panel">
        <h2 style={{margin:0}}>Label Printer — 4×6</h2>
        <p className="helper" style={{marginTop:6}}>
          Select items on the board, then open this view. One label per item. Use Chrome’s print dialog to pick your 4×6 thermal printer.
        </p>

        <div className="controls">
          <div className="row">
            <label style={{minWidth:110}}>Orientation</label>
            <select value={orientation} onChange={e=>setOrientation(e.target.value)}>
              <option value="portrait">Portrait (4×6)</option>
              <option value="landscape">Landscape (6×4)</option>
            </select>
          </div>

          <div className="row">
            <label style={{minWidth:110}}>Copies</label>
            <input type="number" min="1" max="10" value={copies} onChange={e=>setCopies(e.target.value)} />
          </div>

          <div className="checkbox">
            <input id="logo" type="checkbox" checked={includeLogo} onChange={e=>setIncludeLogo(e.target.checked)} />
            <label htmlFor="logo">Include logo (top-left)</label>
          </div>

          <div className="row">
            <label style={{minWidth:110}}>Logo URL</label>
            <input type="text" placeholder="https://..." value={logoUrl} onChange={e=>setLogoUrl(e.target.value)} />
          </div>

          <div className="checkbox">
            <input id="qr" type="checkbox" checked={reserveQR} onChange={e=>setReserveQR(e.target.checked)} />
            <label htmlFor="qr">Reserve QR area (bottom-right)</label>
          </div>

          <div className="row">
            <label style={{minWidth:110}}>QR content</label>
            <select value={qrMode} onChange={e=>setQrMode(e.target.value)} disabled={!reserveQR}>
              <option value="none">None</option>
              <option value="job">Job Number</option>
              <option value="url">monday item URL</option>
            </select>
          </div>
        </div>

        <div style={{display:'flex', gap:8, marginBottom:12}}>
          <button className="btn" onClick={onPrint} disabled={loading || labels.length === 0}>Print</button>
          <button className="btn secondary" onClick={()=>window.location.reload()}>Reload selection</button>
        </div>

        {loading ? <p>Loading selection…</p> : null}
        {error ? <p style={{color:'#ff7b7b'}}>Error: {error}</p> : null}
        {!loading && labels.length === 0 ? <p>No items selected. Select items on the board and try again.</p> : null}

        {/* Screen preview */}
        {labels.length > 0 && (
          <div className="preview-wrap">
            <div className="preview-grid">
              {labels.slice(0, 8).map(l => (
                <Preview key={`prev-${l.id}`} job={l.job} customer={l.customer} name={l.name} />
              ))}
            </div>
            <p className="helper" style={{marginTop:8}}>
              Preview shows a few labels at screen scale. Printed pages use exact 4×6 inches with zero margins.
            </p>
          </div>
        )}
      </div>

      {/* Print-only pages */}
      <div className="print-root">
        {labels.map(l => (
          <Label
            key={l.id}
            job={l.job}
            customer={l.customer}
            name={l.name}
            includeLogo={includeLogo}
            logoUrl={logoUrl}
            reserveQR={reserveQR}
            qrDataURL={qrData[l.id]}
          />
        ))}
      </div>
    </div>
  )
}

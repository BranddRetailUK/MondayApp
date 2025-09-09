import React, { useEffect, useLayoutEffect, useRef } from 'react'

/**
 * Auto-fit each line downwards (never up) until it fits width.
 * It respects minPx cutoffs so text stays readable on thermal printers.
 */
function useAutoFit(ref, { minPx = { line1: 24, line2: 14, line3: 14 } } = {}) {
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return

    const fitLine = (el, min) => {
      if (!el) return
      const parentWidth = el.parentElement.clientWidth
      let size = parseFloat(getComputedStyle(el).fontSize)
      const measure = () => el.scrollWidth <= parentWidth

      // Reduce in 5% steps until it fits or hits min
      let guard = 120
      while (!measure() && size > min && guard-- > 0) {
        size *= 0.95
        el.style.fontSize = `${size}px`
      }
    }

    const l1 = root.querySelector('.line1')
    const l2 = root.querySelector('.line2')
    const l3 = root.querySelector('.line3')

    fitLine(l1, minPx.line1)
    fitLine(l2, minPx.line2)
    fitLine(l3, minPx.line3)

  }, [])
}

export default function Label({ job, customer, name, includeLogo, logoUrl, reserveQR, qrDataURL }) {
  const ref = useRef(null)
  useAutoFit(ref)

  return (
    <div className="print-page">
      <div className="label-inner" ref={ref}>
        {includeLogo && logoUrl ? <img className="brand" src={logoUrl} alt="logo" /> : null}
        <h1 className="line1">{job}</h1>
        {customer ? <h2 className="line2">{customer}</h2> : null}
        {name ? <h3 className="line3">{name}</h3> : null}
      </div>

      {reserveQR && qrDataURL ? <img className="qr" src={qrDataURL} alt="qr" /> : null}
      {reserveQR && !qrDataURL ? <div className="qr" aria-hidden="true"></div> : null}
    </div>
  )
}

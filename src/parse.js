// Robust parsing rules for titles like "50474 - Made with Tonic - Bags"
export function parseItemTitle(raw, fallbackId) {
  if (!raw || typeof raw !== 'string') {
    return { job: fallbackId ? String(fallbackId) : 'NO JOB NUMBER', customer: '', name: '' }
  }

  let title = raw.trim().replace(/\s+/g, ' ')
  // Normalize various dashes and arbitrary spacing around them
  const delimiter = /\s*[-–—]\s*/g
  const parts = title.split(delimiter).filter(Boolean)

  // Capture leading number if present
  let job = ''
  const leadingNum = title.match(/^\s*([A-Za-z0-9]+)/)
  if (leadingNum) job = leadingNum[1]
  if (!job) job = fallbackId ? String(fallbackId) : 'NO JOB NUMBER'

  // Remove the found leading token from a working string to avoid duplication
  // e.g., title starts with job and then delimiter -> remaining segments are customer/job name
  let remaining = title
  if (leadingNum) {
    const idx = title.indexOf(leadingNum[1])
    remaining = title.slice(idx + leadingNum[1].length).replace(delimiter, '⎋').split('⎋').filter(Boolean)
  } else {
    remaining = parts
  }

  let customer = ''
  let name = ''

  if (remaining.length >= 2) {
    customer = remaining[0].trim()
    name = remaining.slice(1).join(' - ').trim()
  } else if (remaining.length === 1) {
    const token = remaining[0].trim()
    // Heuristic: product keyword → treat as Job Name
    const productish = /(t-?shirts?|hoodies?|caps?|bags?|jackets?|polos?|sweats?|shorts?|mugs?|bottles?)/i
    if (productish.test(token)) {
      name = token
    } else {
      // Could be a customer with missing job name — we’ll display as name
      name = token
    }
  }

  return { job, customer, name }
}

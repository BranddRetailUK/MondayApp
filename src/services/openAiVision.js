const axios = require('axios');
const {
  OPENAI_API_KEY,
  OPENAI_VISION_MODEL
} = require('../config/env');

function bufferToDataUrl(buffer, mimeType = 'image/jpeg') {
  const b64 = buffer.toString('base64');
  return `data:${mimeType};base64,${b64}`;
}

function buildPrompt({ side = 'front', jobTitle = '', jobNo = '', garmentColour = '' }) {
  return [
    `You are a production visual QA assistant.`,
    `Compare the live photo to the approved visual/proof and report mismatches.`,
    `Focus ONLY on the common artwork/logo between both images. Ignore guides, measurements, annotations, or text that appears in only one image.`,
    `Primary: missing letters/words, incorrect words, spelling/grammar errors, wrong layout/placement/orientation of the shared artwork.`,
    `Secondary: major positional errors of the shared artwork; ignore colour/shade differences unless critical to the logo/text.`,
    `Side: ${side}. Job: ${jobTitle || 'unknown'}. Job No: ${jobNo || 'unknown'}. ${garmentColour ? `Garment colour: ${garmentColour}.` : ''}`,
    `Respond in JSON with keys: ok (boolean), confidence (0-100), summary (short string), findings (array of short strings).`,
    `Keep the response concise.`,
  ].join(' ');
}

async function runVisionCompare({ capturedDataUrl, proofDataUrl, context = {} }) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing');
  const model = OPENAI_VISION_MODEL || 'gpt-4o-mini-vision';

  const messages = [
    {
      role: 'system',
      content: 'You compare production photos against approved visuals and return concise structured JSON.'
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: buildPrompt(context) },
        { type: 'image_url', image_url: { url: proofDataUrl } },
        { type: 'image_url', image_url: { url: capturedDataUrl } }
      ]
    }
  ];

  const body = {
    model,
    messages,
    max_tokens: 300,
    response_format: { type: 'json_object' },
  };

  const { data } = await axios.post('https://api.openai.com/v1/chat/completions', body, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    timeout: 30000
  });

  const raw = data?.choices?.[0]?.message?.content;
  let parsed = { ok: false, confidence: 0, summary: 'No response', findings: [] };
  if (raw) {
    try {
      const json = typeof raw === 'string' ? JSON.parse(raw) : raw;
      parsed = {
        ok: Boolean(json.ok),
        confidence: Number(json.confidence) || 0,
        summary: json.summary || '',
        findings: Array.isArray(json.findings) ? json.findings : []
      };
    } catch (e) {
      parsed.summary = 'Failed to parse model response';
    }
  }
  return { raw, parsed };
}

module.exports = {
  bufferToDataUrl,
  runVisionCompare
};

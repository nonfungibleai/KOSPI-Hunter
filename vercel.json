// api/price.js - 실시간 현재가 + 매수/매도 신호 계산 (CommonJS)
// GET /api/price?tickers=005380,000660,...
const { getAccessToken, BASE_URL, IS_REAL } = require('./token');
const { calcSignal } = require('./signal');

// KIS 현재가 단건 조회
async function fetchOne(ticker, token) {
  const url = new URL(
    `${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price`
  );
  url.searchParams.set('FID_COND_MRKT_DIV_CODE', 'J');
  url.searchParams.set('FID_INPUT_ISCD', ticker);

  const res = await fetch(url.toString(), {
    headers: {
      'content-type':  'application/json; charset=utf-8',
      'authorization': `Bearer ${token}`,
      'appkey':        process.env.KIS_APP_KEY,
      'appsecret':     process.env.KIS_APP_SECRET,
      'tr_id':         'FHKST01010100',   // 모의/실전 동일 tr_id
      'custtype':      'P',
    },
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`PRICE ${ticker} HTTP ${res.status}: ${txt.slice(0,100)}`);
  }

  const json = await res.json();
  if (json.rt_cd !== '0') {
    throw new Error(`PRICE ${ticker}: rt_cd=${json.rt_cd} ${json.msg1}`);
  }

  const o = json.output;
  return {
    ticker,
    price:      parseInt(o.stck_prpr,  10) || 0,
    open:       parseInt(o.stck_oprc,  10) || 0,
    high:       parseInt(o.stck_hgpr,  10) || 0,
    low:        parseInt(o.stck_lwpr,  10) || 0,
    prevClose:  parseInt(o.stck_sdpr,  10) || 0,
    change:     parseFloat(o.prdy_ctrt)    || 0,   // 등락률 %
    changeAmt:  parseInt(o.prdy_vrss,  10) || 0,   // 등락 금액
    volume:     parseInt(o.acml_vol,   10) || 0,
    tradeValue: parseInt(o.acml_tr_pbmn, 10) || 0, // 거래대금 (천원)
    high52w:    parseInt(o.w52_hgpr,   10) || 0,
    low52w:     parseInt(o.w52_lwpr,   10) || 0,
    marketCap:  parseInt(o.hts_avls,   10) || 0,   // 시가총액 (억)
    per:        parseFloat(o.per  || 0),
    pbr:        parseFloat(o.pbr  || 0),
    eps:        parseFloat(o.eps  || 0),
    ts:         new Date().toISOString(),
  };
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const raw = (req.query.tickers || '').trim();
  if (!raw) {
    return res.status(400).json({ ok: false, error: 'tickers 파라미터 필요' });
  }

  // 최대 40개 티커
  const tickers = raw.split(',').map(t => t.trim()).filter(Boolean).slice(0, 40);

  // STOCKS 메타 정보 (signal 계산용)
  // 프론트에서 넘겨주는 meta JSON 파싱 (없으면 기본값 사용)
  let metaMap = {};
  try {
    if (req.query.meta) metaMap = JSON.parse(req.query.meta);
  } catch (_) {}

  try {
    const token   = await getAccessToken();
    const results = {};
    const errors  = {};

    // 10개씩 청크 → 병렬 처리 (KIS rate limit 초당 20건 대응)
    for (let i = 0; i < tickers.length; i += 10) {
      if (i > 0) await new Promise(r => setTimeout(r, 500));
      const chunk   = tickers.slice(i, i + 10);
      const settled = await Promise.allSettled(
        chunk.map(t => fetchOne(t, token))
      );
      settled.forEach((s, idx) => {
        const t = chunk[idx];
        if (s.status === 'fulfilled') {
          const live = s.value;
          const meta = metaMap[t] || {};
          // 신호 계산
          live.signal = calcSignal(meta, live);
          results[t]  = live;
        } else {
          errors[t] = s.reason?.message ?? 'unknown error';
        }
      });
    }

    // 15초 캐시 (장중), 60초 (장외)
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
    return res.status(200).json({
      ok: true,
      mode: IS_REAL ? '실전' : '모의투자',
      ts: new Date().toISOString(),
      data: results,
      errors,
    });

  } catch (e) {
    console.error('[price] error:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
};

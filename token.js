// api/news.js - 종목 뉴스 조회 (CommonJS)
// GET /api/news?ticker=005930
const { getAccessToken, BASE_URL } = require('./token');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { ticker } = req.query;
  if (!ticker) return res.status(400).json({ ok: false, error: 'ticker 필요' });

  try {
    const token = await getAccessToken();
    const url   = new URL(
      `${BASE_URL}/uapi/domestic-stock/v1/quotations/news-title`
    );
    url.searchParams.set('FID_NEWS_OFER_ENTP_CODE', '0');
    url.searchParams.set('FID_COND_MRKT_DIV_CODE',  'J');
    url.searchParams.set('FID_INPUT_ISCD',           ticker);
    url.searchParams.set('FID_INPUT_DATE_1',         '');
    url.searchParams.set('FID_INPUT_DATE_2',         '');
    url.searchParams.set('FID_INPUT_HOUR_1',         '');
    url.searchParams.set('FID_RANK_SORT_CLS_CODE',   '0');
    url.searchParams.set('FID_INPUT_CNT_1',          '10');

    const r = await fetch(url.toString(), {
      headers: {
        'content-type':  'application/json; charset=utf-8',
        'authorization': `Bearer ${token}`,
        'appkey':        process.env.KIS_APP_KEY,
        'appsecret':     process.env.KIS_APP_SECRET,
        'tr_id':         'FHKST01010700',
        'custtype':      'P',
      },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    if (json.rt_cd !== '0') throw new Error(json.msg1);

    const items = (json.output ?? []).map(n => ({
      date:   (n.data_dt || '').replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
      time:   n.data_tm  || '',
      title:  n.news_ttl || '',
      source: n.news_src || '',
    }));

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=60');
    return res.status(200).json({ ok: true, data: items });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};

// api/signal.js - 매수/매도 추천 로직 (CommonJS)
// 입력: 실시간 가격 데이터 + STOCKS 정적 메타 데이터
// 출력: { action, buyTarget, sellTarget, stopLoss, reason, confidence }

/**
 * 핵심 퀀트 로직
 * 
 * 매수 조건 (3개 중 2개 이상 충족 시 BUY):
 *   1. 현재가 ≤ 기준선(Kijun) * 1.005  → 기준선 근접/터치
 *   2. 현재가 > 지지선1                  → 지지선 위
 *   3. 변동률 > -3%                      → 급락 아닌 조정
 *
 * 매도 조건 (2개 이상 충족 시 SELL):
 *   1. 현재가 ≥ 저항선1 * 0.995         → 저항 근접
 *   2. 변동률 > +5%                      → 단기 급등
 *
 * 손절 조건:
 *   현재가 < 진입가 - 2*ATR             → ATR 기반 손절
 *
 * 추천가 계산:
 *   매수 추천가  = 지지선1 * 1.003      (지지선 살짝 위에서 매수)
 *   1차 목표가   = 저항선1              (1차 저항)
 *   2차 목표가   = 저항선2              (2차 저항)
 *   손절가       = 진입가 or 현재가 - 2*ATR
 */
function calcSignal(st, live) {
  const price     = live.price;
  const change    = live.change;      // 등락률 %
  const kijun     = st.kijun   || price * 0.97;
  const sup1      = st.support[0] || price * 0.95;
  const sup2      = st.support[1] || price * 0.93;
  const res1      = st.resist[0]  || price * 1.05;
  const res2      = st.resist[1]  || price * 1.10;
  const atr       = st.atr    || price * 0.02;
  const entryP    = st.entryPrice;
  const rsi       = st.rsi    || 50;

  // ── 매수 점수 계산 ─────────────────────────────
  let buyScore = 0;
  const buyReasons = [];

  // 조건 1: 기준선 근접 (현재가가 기준선의 0.5% 이내)
  if (price <= kijun * 1.005 && price >= kijun * 0.97) {
    buyScore++;
    buyReasons.push(`기준선(${kijun.toLocaleString()}) 지지 구간`);
  }
  // 조건 2: 지지선 위에서 거래 중
  if (price > sup1 * 0.99) {
    buyScore++;
    buyReasons.push(`1차 지지(${sup1.toLocaleString()}) 위 유지`);
  }
  // 조건 3: 과매도 구간(RSI < 45) 또는 조정 완료(-5% ~ 0%)
  if (rsi < 45 && change > -5) {
    buyScore++;
    buyReasons.push(`RSI ${rsi} 과매도 근접`);
  } else if (change >= -3 && change <= 0) {
    buyScore++;
    buyReasons.push(`조정 완료 구간 (${change}%)`);
  }
  // 조건 4: CMF 양수 (수급 유입)
  if ((st.cmf || 0) > 0) {
    buyScore++;
    buyReasons.push(`CMF 양수 (${st.cmf}) 수급 유입`);
  }

  // ── 매도/익절 점수 계산 ────────────────────────
  let sellScore = 0;
  const sellReasons = [];

  // 조건 1: 저항선 근접
  if (price >= res1 * 0.995) {
    sellScore++;
    sellReasons.push(`1차 저항(${res1.toLocaleString()}) 근접`);
  }
  // 조건 2: 단기 급등
  if (change >= 5) {
    sellScore++;
    sellReasons.push(`단기 급등 ${change}% (과열 주의)`);
  }
  // 조건 3: RSI 과매수
  if (rsi >= 70) {
    sellScore++;
    sellReasons.push(`RSI ${rsi} 과매수 구간`);
  }
  // 조건 4: 진입가 대비 목표 수익 달성 (20% 이상)
  if (entryP && price >= entryP * 1.20) {
    sellScore++;
    sellReasons.push(`진입가 대비 +20% 목표 달성`);
  }

  // ── 손절 확인 ──────────────────────────────────
  const stopLossPrice = entryP
    ? Math.round(entryP - 2 * atr)
    : Math.round(sup2 * 0.99);

  const isStopLoss = price <= stopLossPrice && entryP;

  // ── 최종 액션 결정 ─────────────────────────────
  let action, confidence, reason;

  if (isStopLoss) {
    action     = 'STOPLOSS';
    confidence = 99;
    reason     = `손절가(${stopLossPrice.toLocaleString()}) 도달 — 즉시 매도`;
  } else if (sellScore >= 2) {
    action     = 'SELL';
    confidence = Math.min(90, 50 + sellScore * 12);
    reason     = sellReasons.join(' / ');
  } else if (sellScore === 1 && buyScore <= 1) {
    action     = 'WATCH_SELL';
    confidence = 40;
    reason     = sellReasons[0] + ' (추가 확인 필요)';
  } else if (buyScore >= 3) {
    action     = 'BUY';
    confidence = Math.min(90, 40 + buyScore * 12);
    reason     = buyReasons.join(' / ');
  } else if (buyScore === 2) {
    action     = 'WATCH_BUY';
    confidence = 45;
    reason     = buyReasons.join(' / ') + ' (조건 추가 확인 필요)';
  } else {
    action     = 'HOLD';
    confidence = 30;
    reason     = '명확한 매수/매도 신호 없음 — 관망';
  }

  // ── 추천가 계산 ────────────────────────────────
  const buyTarget  = Math.round(sup1 * 1.003);   // 지지선 + 0.3%
  const sellTarget1 = res1;                        // 1차 목표
  const sellTarget2 = res2;                        // 2차 목표
  const profitPct  = entryP ? ((price - entryP) / entryP * 100).toFixed(1) : null;

  return {
    action,
    confidence,
    reason,
    buyTarget,
    sellTarget1,
    sellTarget2,
    stopLossPrice,
    profitPct,
    buyScore,
    sellScore,
  };
}

module.exports = { calcSignal };

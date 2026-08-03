# -*- coding: utf-8 -*-
"""
buyma_scout.py — 바이마(BUYMA) 경쟁 시세 정찰 도구
====================================================
키워드/브랜드로 바이마를 검색해서 다음을 뽑아준다:
  1. 該当件数 (총 등록 수)  → 경쟁 강도
  2. 가격 분포 (최저/중앙/평균/최고, 엔화)
  3. 셀러 집중도 (상위 셀러 점유율, 고유 셀러 수)
  4. 상품별 상세 CSV (제목, 가격, 할인율, 셀러, 배지)
  5. 니치 판정 스코어

사용법:
  python buyma_scout.py "MARDI MERCREDI"            # 키워드 검색
  python buyma_scout.py "insilence" --pages 2       # 2페이지까지
  python buyma_scout.py "커버낫 CAP" --rate 9.2     # 원화 환산 환율 지정

필요 패키지:
  pip install requests beautifulsoup4

주의:
  - 요청 간 2초 대기 (서버 예의). 대량/반복 실행 금지.
  - 개인 시장조사 용도로만 사용할 것.
"""
import argparse
import csv
import re
import statistics
import sys
import time
import urllib.parse
from collections import Counter

import requests
from bs4 import BeautifulSoup

BASE = "https://www.buyma.com"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    ),
    "Accept-Language": "ja,en;q=0.8,ko;q=0.6",
}
DELAY_SEC = 2.0

ITEM_HREF = re.compile(r"^https?://www\.buyma\.com/item/(\d+)/?$|^/item/(\d+)/?$")
PRICE_RE = re.compile(r"¥\s*([\d,]+)")
COUNT_RE = re.compile(r"該当件数\s*([\d,]+)\s*件")
BADGES = ["即発", "国内発送", "スピード配送", "手元に在庫", "関税負担なし"]


def search_url(keyword: str, page: int = 1) -> str:
    """키워드 → 바이마 검색 URL (페이지 지원).
    형식: https://www.buyma.com/r/_{키워드}/ , 2페이지부터 _{키워드}_{n}/
    주의: 바이마는 일본 사이트라 한글 키워드는 결과가 없음.
    영문(insilence) 또는 일본어(インサイレンス)로 검색할 것."""
    kw = keyword.strip().replace(" ", "-")
    slug = urllib.parse.quote(kw)
    if page <= 1:
        return f"{BASE}/r/_{slug}/"
    return f"{BASE}/r/_{slug}_{page}/"


def fetch(url: str) -> str:
    r = requests.get(url, headers=HEADERS, timeout=20)
    r.raise_for_status()
    return r.text


def parse_total_count(html: str):
    # 실제 마크업: 該当件数<span id="totalitem_num">324</span>件
    m = re.search(r'id="totalitem_num"[^>]*>([\d,]+)<', html)
    if m:
        return int(m.group(1).replace(",", ""))
    text = BeautifulSoup(html, "html.parser").get_text(" ", strip=True)
    m = re.search(r"該当件数[^\d]{0,20}([\d,]+)\s*件", text)
    return int(m.group(1).replace(",", "")) if m else None


def parse_items(html: str):
    """실제 바이마 마크업 기준: <li item-id="..." class="product">
    하위에 .product_name / .product_price / .product_Buyer / .product_Brand"""
    soup = BeautifulSoup(html, "html.parser")
    items = []

    for li in soup.select("li.product"):
        item_id = li.get("item-id")
        if not item_id:
            continue

        def txt(sel):
            el = li.select_one(sel)
            return el.get_text(" ", strip=True) if el else ""

        title = txt(".product_name")
        price_raw = txt(".product_price")   # 예: "¥57,123 送料込 63%OFF ¥155,700"
        prices = [int(p.replace(",", "")) for p in PRICE_RE.findall(price_raw)]
        price = min(prices) if prices else None
        orig = max(prices) if len(prices) > 1 else None

        ctx = li.get_text(" ", strip=True)
        items.append({
            "item_id": item_id,
            "title": title,
            "brand": txt(".product_Brand"),
            "price_jpy": price,
            "orig_jpy": orig,
            "discount_pct": round((1 - price / orig) * 100, 1) if price and orig else "",
            "seller": txt(".product_Buyer"),
            "premium_seller": li.select_one(".product_shopper_status_premium") is not None,
            "badges": "|".join(bd for bd in BADGES if bd in ctx),
            "url": f"{BASE}/item/{item_id}/",
        })
    return items


def analyze(keyword: str, items: list, total, rate: float):
    prices = [it["price_jpy"] for it in items if it["price_jpy"]]
    sellers = [it["seller"] for it in items if it["seller"]]
    n_sellers = len(set(sellers))
    top = Counter(sellers).most_common(3)
    top_share = sum(c for _, c in top) / len(sellers) * 100 if sellers else 0

    print(f"\n{'=' * 52}\n  바이마 정찰 리포트 — {keyword}\n{'=' * 52}")
    print(f"  총 등록 수(該当件数): {total if total is not None else '파싱 실패'}건")
    print(f"  수집 상품: {len(items)}개 / 고유 셀러: {n_sellers}명")
    if prices:
        med = statistics.median(prices)
        print(f"  가격(¥): 최저 {min(prices):,} | 중앙 {med:,.0f} | "
              f"평균 {statistics.mean(prices):,.0f} | 최고 {max(prices):,}")
        print(f"  중앙값 원화 환산: 약 {med * rate:,.0f}원 (환율 {rate}원/엔)")
    if top:
        print("  상위 셀러:", ", ".join(f"{s}({c}건)" for s, c in top),
              f"→ 상위3 점유율 {top_share:.0f}%")

    # 니치 판정
    if total is None:
        verdict = "판정 불가 — HTML에서 건수를 못 읽음"
    elif total >= 1000:
        verdict = "레드오션 — 가격 경쟁 심함. 이 키워드는 피하는 게 좋음"
    elif total >= 300:
        verdict = "경쟁 있음 — 즉발/국내발송 같은 차별화 없으면 어려움"
    elif total >= 50:
        verdict = "괜찮은 니치 — 상위 노출 노려볼 만함"
    else:
        verdict = "니치 or 무수요 — 일본 내 수요 자체가 있는지 먼저 확인 필요"
    print(f"\n  ▶ 판정: {verdict}\n{'=' * 52}")


def main():
    ap = argparse.ArgumentParser(description="BUYMA 경쟁 시세 정찰")
    ap.add_argument("keyword", help="검색 키워드 (브랜드명, 상품명 등)")
    ap.add_argument("--pages", type=int, default=1, help="수집 페이지 수 (기본 1, 권장 최대 3)")
    ap.add_argument("--rate", type=float, default=9.2, help="원/엔 환율 (기본 9.2)")
    ap.add_argument("--out", default="", help="CSV 저장 경로 (기본: buyma_<키워드>.csv)")
    args = ap.parse_args()

    if re.search(r"[가-힣]", args.keyword):
        print("! 경고: 바이마는 일본 사이트라 한글 키워드는 결과가 거의 없습니다.")
        print("  영문(예: insilence) 또는 일본어(예: インサイレンス)로 검색하세요.\n")

    all_items, total = [], None
    for p in range(1, min(args.pages, 5) + 1):
        url = search_url(args.keyword, p)
        print(f"[{p}/{args.pages}] {url}")
        try:
            html = fetch(url)
        except requests.RequestException as e:
            print(f"  ! 요청 실패: {e}", file=sys.stderr)
            break
        if total is None:
            total = parse_total_count(html)
            if total and total > 500_000:
                print(f"  ! 경고: 該当件数 {total:,}건 = 키워드가 적용되지 않고 전체 목록으로 떨어졌습니다.")
                print("    브랜드 정식 슬러그(예: IN-SILENCE-インサイレンス)로 다시 시도하세요.")
                break
        got = parse_items(html)
        print(f"  → {len(got)}개 수집")
        if not got:
            break
        all_items.extend(got)
        if p < args.pages:
            time.sleep(DELAY_SEC)

    if not all_items:
        print("수집된 상품이 없습니다. 키워드를 바꾸거나 --pages 1로 재시도하세요.")
        sys.exit(1)

    # 중복 제거
    uniq = {it["item_id"]: it for it in all_items}
    all_items = list(uniq.values())

    out = args.out or f"buyma_{re.sub(r'[^0-9A-Za-z가-힣]+', '_', args.keyword)}.csv"
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(all_items[0].keys()))
        w.writeheader()
        w.writerows(all_items)
    print(f"\nCSV 저장: {out}")

    analyze(args.keyword, all_items, total, args.rate)


if __name__ == "__main__":
    main()

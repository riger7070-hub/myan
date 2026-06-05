-- 사주 기록 저장 테이블
CREATE TABLE IF NOT EXISTS saju_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_email  TEXT    NOT NULL,
  mode        TEXT    NOT NULL,     -- solo / duo
  p1_name     TEXT,
  p1_birth    TEXT    NOT NULL,     -- YYYY-MM-DD
  p1_hour     TEXT,
  p2_name     TEXT,
  p2_birth    TEXT,
  p2_hour     TEXT,
  reading     TEXT    NOT NULL,     -- 간단 풀이 텍스트
  ohaeng      TEXT    NOT NULL,     -- JSON: {"木":0,"火":33,...}
  day_elem    TEXT,                 -- 오늘의 기운 (木/火/土/金/水)
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 사용자별 최신순 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_saju_user_created ON saju_history(user_email, created_at DESC);

-- 통계용 인덱스
CREATE INDEX IF NOT EXISTS idx_saju_created ON saju_history(created_at DESC);

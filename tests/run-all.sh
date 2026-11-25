#!/usr/bin/env bash
# 전체 시험 실행:  bash tests/run-all.sh
#  - Node 22.18 이상 필요 (서버 함수 파일을 그대로 불러와 시험해요)
#  - 브라우저 시험은 playwright, 접근성 검사는 axe-core 가 설치돼 있을 때만 돌아가요 (없으면 건너뛰고 알려 줘요)
#      설치(저장소 폴더에서, package.json 을 바꾸지 않음):  npm i --no-save playwright axe-core
# 하나라도 실패하면 종료 코드 1.
cd "$(dirname "$0")/.." || exit 2
fail=0

run() {  # run <표시 이름> <명령...>
  local name="$1"; shift
  local out status
  out=$("$@" 2>&1); status=$?
  local p f; p=$(printf '%s\n' "$out" | grep -c '^PASS'); f=$(printf '%s\n' "$out" | grep -c '^FAIL')
  if [ "$f" -gt 0 ] || [ "$status" -ne 0 ]; then
    fail=1; echo "✗ $name  (통과 $p / 실패 $f, 종료 코드 $status)"; printf '%s\n' "$out" | grep -E '^FAIL|Error|error' | head -8
  else
    echo "✓ $name  (통과 $p)"
  fi
}

echo "== Node 시험 (서버 함수·내보내기·생성기·링크)"
for f in tests/node/*.test.mjs; do run "$f" node "$f"; done

echo "== 브라우저 시험 (화면 동작)"
if node -e "require('playwright')" 2>/dev/null; then
  for f in tests/browser/*.test.js; do run "$f" node "$f"; done
else
  echo "- playwright 가 없어 건너뜀 (npm i --no-save playwright)"
fi

echo "== 접근성 검사 (axe-core)"
if node -e "require('playwright');require('axe-core')" 2>/dev/null; then
  run "tests/a11y/axe-audit.js" node tests/a11y/axe-audit.js
else
  echo "- playwright 또는 axe-core 가 없어 건너뜀 (npm i --no-save playwright axe-core)"
fi

[ "$fail" -eq 0 ] && echo "모두 통과" || echo "실패가 있어요"
exit $fail

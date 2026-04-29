#!/usr/bin/env bash
# E2E test script for Badminton Session Booking System
# Usage: bash test_e2e.sh

BASE="http://localhost:8090"

# Load env
if [ -f "$(dirname "$0")/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$(dirname "$0")/.env"
  set +a
fi

if [ -z "${CREATE_PASSWORD:-}" ]; then
  echo "ERROR: CREATE_PASSWORD not set. Make sure .env is present and loaded." >&2
  exit 1
fi

# --- Color helpers ---
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

PASS=0
FAIL=0

pass() {
  local name="$1"
  echo -e "${GREEN}✓${NC} ${name}"
  PASS=$((PASS + 1))
}

fail() {
  local name="$1"
  local detail="${2:-}"
  echo -e "${RED}✗${NC} ${name}"
  if [ -n "$detail" ]; then
    echo "    detail: $detail"
  fi
  FAIL=$((FAIL + 1))
}

# assert_status <case_name> <expected_status> <actual_status> [body]
assert_status() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  local body="${4:-}"
  if [ "$actual" = "$expected" ]; then
    pass "$name"
    return 0
  else
    fail "$name" "expected HTTP $expected, got HTTP $actual. body=$body"
    return 1
  fi
}

# assert_json_contains <case_name> <json_string> <key> <expected_value>
# Checks if json[key] == expected_value (string comparison)
assert_json_contains() {
  local name="$1"
  local json="$2"
  local key="$3"
  local expected="$4"
  local actual
  actual=$(python3 -c "
import json, sys
try:
    d = json.loads(sys.argv[1])
    val = d.get(sys.argv[2], None)
    print(str(val) if val is not None else '')
except Exception as e:
    print('')
" "$json" "$key" 2>/dev/null)
  if [ "$actual" = "$expected" ]; then
    pass "$name"
    return 0
  else
    fail "$name" "expected json[$key]=$expected, got=$actual"
    return 1
  fi
}

# assert_json_has_key <case_name> <json_string> <key>
# Checks if json[key] exists and is non-empty
assert_json_has_key() {
  local name="$1"
  local json="$2"
  local key="$3"
  local val
  val=$(python3 -c "
import json, sys
try:
    d = json.loads(sys.argv[1])
    val = d.get(sys.argv[2], None)
    print('yes' if val else 'no')
except Exception:
    print('no')
" "$json" "$key" 2>/dev/null)
  if [ "$val" = "yes" ]; then
    pass "$name"
    return 0
  else
    fail "$name" "expected json[$key] to be present/non-empty. json=$json"
    return 1
  fi
}

# json_get <json_string> <key>
json_get() {
  python3 -c "
import json, sys
try:
    d = json.loads(sys.argv[1])
    val = d.get(sys.argv[2], '')
    print(val)
except Exception:
    print('')
" "$1" "$2" 2>/dev/null
}

# json_array_count <json_string> <key>  (key is an array)
json_array_count() {
  python3 -c "
import json, sys
try:
    d = json.loads(sys.argv[1])
    arr = d.get(sys.argv[2], [])
    print(len(arr))
except Exception:
    print(0)
" "$1" "$2" 2>/dev/null
}

# json_array_contains_id <json_string> <key> <id>
json_array_contains_id() {
  python3 -c "
import json, sys
try:
    d = json.loads(sys.argv[1])
    arr = d.get(sys.argv[2], [])
    found = any(item.get('id') == sys.argv[3] for item in arr if isinstance(item, dict))
    print('yes' if found else 'no')
except Exception:
    print('no')
" "$1" "$2" "$3" 2>/dev/null
}

# --- Unique test data ---
TS=$(date +%s)
KEY="e2e-test-${TS}"

# --- Cleanup trap: always delete test space on exit ---
cleanup() {
  echo ""
  echo "--- [CLEANUP] ---"
  CLEANUP_RESP=$(curl -s -X POST "${BASE}/api/custom/admin/spaces/delete" \
    -H "Content-Type: application/json" \
    -d "{\"admin_password\":\"${CREATE_PASSWORD}\",\"space_key\":\"${KEY}\"}" 2>/dev/null || true)
  if echo "$CLEANUP_RESP" | grep -q '"success"'; then
    echo "已删除测试空间: ${KEY}"
  else
    echo "警告: 未能删除测试空间 ${KEY} (可能已不存在): ${CLEANUP_RESP}"
  fi
}
trap cleanup EXIT
SESS_CODE="sess-${TS}"
SIGNUP1_CODE="s1-${TS}"
SIGNUP2_CODE="s2-${TS}"
FUTURE_DATE=$(date -d "+7 days" +%Y-%m-%d)
VENUE="测试球馆-${TS}"
VENUE_UPDATED="更新球馆-${TS}"

TOKEN=""
SESSION_ID=""
SIGNUP1_ID=""
SIGNUP2_ID=""
SHARE_TOKEN=""

echo "========================================"
echo "E2E Test - Badminton Booking System"
echo "Timestamp: ${TS}"
echo "Key: ${KEY}"
echo "========================================"
echo ""

# ============================================================
# 1. SPACE
# ============================================================
echo "--- [SPACE] ---"

# [SPACE-1] 错误密码创建空间应返回 401
RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X POST "${BASE}/api/custom/spaces/create" \
  -H "Content-Type: application/json" \
  -d "{\"create_password\":\"wrong-password-xyz\",\"key\":\"${KEY}\"}")
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1 | sed 's/__STATUS__//')
assert_status "[SPACE-1] 错误密码创建空间应返回 401" "401" "$STATUS" "$BODY"

# [SPACE-2] 正确密码+唯一KEY创建空间 → 期望 success: true
RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X POST "${BASE}/api/custom/spaces/create" \
  -H "Content-Type: application/json" \
  -d "{\"create_password\":\"${CREATE_PASSWORD}\",\"key\":\"${KEY}\"}")
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1 | sed 's/__STATUS__//')
if assert_status "[SPACE-2] 正确密码创建空间应返回 200" "200" "$STATUS" "$BODY"; then
  assert_json_contains "[SPACE-2b] 响应包含 success:true" "$BODY" "success" "True"
fi

# [SPACE-3] 重复创建同一 KEY → 期望 400
RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X POST "${BASE}/api/custom/spaces/create" \
  -H "Content-Type: application/json" \
  -d "{\"create_password\":\"${CREATE_PASSWORD}\",\"key\":\"${KEY}\"}")
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1 | sed 's/__STATUS__//')
assert_status "[SPACE-3] 重复创建同一 KEY 应返回 400" "400" "$STATUS" "$BODY"

# [SPACE-4] 用正确 KEY 登录 → 期望拿到 token 和 record.id
RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X POST "${BASE}/api/collections/spaces/auth-with-password" \
  -H "Content-Type: application/json" \
  -d "{\"identity\":\"${KEY}\",\"password\":\"${KEY}\"}")
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1 | sed 's/__STATUS__//')
if assert_status "[SPACE-4] 正确 KEY 登录应返回 200" "200" "$STATUS" "$BODY"; then
  assert_json_has_key "[SPACE-4b] 登录响应包含 token" "$BODY" "token"
  assert_json_has_key "[SPACE-4c] 登录响应包含 record.id" \
    "$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(json.dumps(d.get('record',{})))" "$BODY" 2>/dev/null)" \
    "id"
  TOKEN=$(json_get "$BODY" "token")
fi

if [ -z "$TOKEN" ]; then
  fail "[SPACE-4-FATAL] 无法获取 token，后续测试将跳过"
  echo ""
  echo "========================================"
  echo "通过: ${PASS} / 失败: ${FAIL} / 总计: $((PASS + FAIL))"
  echo "========================================"
  exit 1
fi

# [SPACE-5] 用不存在的 KEY 登录 → 期望 4xx
NONEXIST_KEY="nonexist-key-${TS}"
RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X POST "${BASE}/api/collections/spaces/auth-with-password" \
  -H "Content-Type: application/json" \
  -d "{\"identity\":\"${NONEXIST_KEY}\",\"password\":\"${NONEXIST_KEY}\"}")
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1 | sed 's/__STATUS__//')
# Expect 4xx
if echo "$STATUS" | grep -qE "^4"; then
  pass "[SPACE-5] 不存在的 KEY 登录应返回 4xx (got $STATUS)"
else
  fail "[SPACE-5] 不存在的 KEY 登录应返回 4xx" "got $STATUS, body=$BODY"
fi

echo ""

# ============================================================
# 2. SESSION
# ============================================================
echo "--- [SESSION] ---"

# [SESSION-1] 未认证创建场次 → 期望 401
RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X POST "${BASE}/api/custom/sessions/create" \
  -H "Content-Type: application/json" \
  -d "{\"date\":\"${FUTURE_DATE}\",\"start_time\":\"19:00\",\"end_time\":\"21:00\",\"venue\":\"${VENUE}\",\"max_players\":12,\"organizer\":\"测试员\",\"cancel_code\":\"${SESS_CODE}\"}")
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1 | sed 's/__STATUS__//')
assert_status "[SESSION-1] 未认证创建场次应返回 401" "401" "$STATUS" "$BODY"

# [SESSION-2] 认证后创建场次 → 期望返回 id
RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X POST "${BASE}/api/custom/sessions/create" \
  -H "Content-Type: application/json" \
  -H "Authorization: ${TOKEN}" \
  -d "{\"date\":\"${FUTURE_DATE}\",\"start_time\":\"19:00\",\"end_time\":\"21:00\",\"venue\":\"${VENUE}\",\"max_players\":12,\"organizer\":\"测试员\",\"cancel_code\":\"${SESS_CODE}\"}")
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1 | sed 's/__STATUS__//')
if assert_status "[SESSION-2] 认证后创建场次应返回 200" "200" "$STATUS" "$BODY"; then
  assert_json_has_key "[SESSION-2b] 场次创建响应包含 id" "$BODY" "id"
  SESSION_ID=$(json_get "$BODY" "id")
fi

if [ -z "$SESSION_ID" ]; then
  fail "[SESSION-2-FATAL] 无法获取 session_id，后续 session 测试将受影响"
fi

# [SESSION-3] 获取场次列表 → 期望包含刚创建的 id
RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X GET "${BASE}/api/collections/sessions/records" \
  -H "Authorization: ${TOKEN}")
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1 | sed 's/__STATUS__//')
if assert_status "[SESSION-3] 获取场次列表应返回 200" "200" "$STATUS" "$BODY"; then
  if [ -n "$SESSION_ID" ]; then
    FOUND=$(json_array_contains_id "$BODY" "items" "$SESSION_ID")
    if [ "$FOUND" = "yes" ]; then
      pass "[SESSION-3b] 场次列表包含刚创建的场次"
    else
      fail "[SESSION-3b] 场次列表应包含刚创建的场次 id=$SESSION_ID"
    fi
  fi
fi

# [SESSION-4] 获取单个场次 → 期望返回正确字段
if [ -n "$SESSION_ID" ]; then
  RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X GET "${BASE}/api/collections/sessions/records/${SESSION_ID}" \
    -H "Authorization: ${TOKEN}")
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1 | sed 's/__STATUS__//')
  if assert_status "[SESSION-4] 获取单个场次应返回 200" "200" "$STATUS" "$BODY"; then
    assert_json_contains "[SESSION-4b] 场次 venue 字段正确" "$BODY" "venue" "$VENUE"
    assert_json_contains "[SESSION-4c] 场次 organizer 字段正确" "$BODY" "organizer" "测试员"
  fi
else
  fail "[SESSION-4] 跳过（无 session_id）"
fi

# [SESSION-5] 用错误 cancel_code 修改场次 → 期望 403
# 注：PATCH /api/collections/sessions/records/:id 的 updateRule 使用了 hidden 字段 cancel_code，
# 在 PocketBase 中 hidden 字段无法参与 rule 比较（始终返回 404）。
# 改用自定义路由 /api/custom/sessions/update 验证 cancel_code。
if [ -n "$SESSION_ID" ]; then
  RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X POST "${BASE}/api/custom/sessions/update" \
    -H "Content-Type: application/json" \
    -H "Authorization: ${TOKEN}" \
    -d "{\"session_id\":\"${SESSION_ID}\",\"venue\":\"错误修改\",\"cancel_code\":\"wrong-code-xyz\"}")
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1 | sed 's/__STATUS__//')
  assert_status "[SESSION-5] 错误 cancel_code 修改场次应返回 403" "403" "$STATUS" "$BODY"
else
  fail "[SESSION-5] 跳过（无 session_id）"
fi

# [SESSION-6] 用正确 cancel_code 修改场次（改 venue）→ 期望成功
if [ -n "$SESSION_ID" ]; then
  RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X POST "${BASE}/api/custom/sessions/update" \
    -H "Content-Type: application/json" \
    -H "Authorization: ${TOKEN}" \
    -d "{\"session_id\":\"${SESSION_ID}\",\"venue\":\"${VENUE_UPDATED}\",\"cancel_code\":\"${SESS_CODE}\"}")
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1 | sed 's/__STATUS__//')
  assert_status "[SESSION-6] 正确 cancel_code 修改场次应返回 200" "200" "$STATUS" "$BODY"
else
  fail "[SESSION-6] 跳过（无 session_id）"
fi

# [SESSION-7] 验证修改后 venue 已更新
if [ -n "$SESSION_ID" ]; then
  RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X GET "${BASE}/api/collections/sessions/records/${SESSION_ID}" \
    -H "Authorization: ${TOKEN}")
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1 | sed 's/__STATUS__//')
  if assert_status "[SESSION-7] 修改后获取场次应返回 200" "200" "$STATUS" "$BODY"; then
    assert_json_contains "[SESSION-7b] 修改后 venue 已更新" "$BODY" "venue" "$VENUE_UPDATED"
  fi
else
  fail "[SESSION-7] 跳过（无 session_id）"
fi

echo ""

# ============================================================
# 3. SIGNUP
# ============================================================
echo "--- [SIGNUP] ---"

# [SIGNUP-1] 创建报名1（name=张三）→ 期望返回 id
if [ -n "$SESSION_ID" ]; then
  RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X POST "${BASE}/api/custom/signups/create" \
    -H "Content-Type: application/json" \
    -H "Authorization: ${TOKEN}" \
    -d "{\"session\":\"${SESSION_ID}\",\"name\":\"张三\",\"cancel_code\":\"${SIGNUP1_CODE}\"}")
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1 | sed 's/__STATUS__//')
  if assert_status "[SIGNUP-1] 创建报名1（张三）应返回 200" "200" "$STATUS" "$BODY"; then
    assert_json_has_key "[SIGNUP-1b] 报名1响应包含 id" "$BODY" "id"
    SIGNUP1_ID=$(json_get "$BODY" "id")
  fi
else
  fail "[SIGNUP-1] 跳过（无 session_id）"
fi

# [SIGNUP-2] 创建报名2（name=李四）→ 期望返回 id
if [ -n "$SESSION_ID" ]; then
  RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X POST "${BASE}/api/custom/signups/create" \
    -H "Content-Type: application/json" \
    -H "Authorization: ${TOKEN}" \
    -d "{\"session\":\"${SESSION_ID}\",\"name\":\"李四\",\"cancel_code\":\"${SIGNUP2_CODE}\"}")
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1 | sed 's/__STATUS__//')
  if assert_status "[SIGNUP-2] 创建报名2（李四）应返回 200" "200" "$STATUS" "$BODY"; then
    assert_json_has_key "[SIGNUP-2b] 报名2响应包含 id" "$BODY" "id"
    SIGNUP2_ID=$(json_get "$BODY" "id")
  fi
else
  fail "[SIGNUP-2] 跳过（无 session_id）"
fi

# [SIGNUP-3] 获取报名列表 → 期望包含两条
# 注：PocketBase filter 语法使用双引号（"），不支持单引号（'）。
# 用 %22 编码 " 字符。
if [ -n "$SESSION_ID" ]; then
  ENCODED_FILTER="session%3D%22${SESSION_ID}%22"
  RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X GET \
    "${BASE}/api/collections/signups/records?filter=${ENCODED_FILTER}&sort=id" \
    -H "Authorization: ${TOKEN}")
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1 | sed 's/__STATUS__//')
  if assert_status "[SIGNUP-3] 获取报名列表应返回 200" "200" "$STATUS" "$BODY"; then
    COUNT=$(json_array_count "$BODY" "items")
    if [ "$COUNT" -eq 2 ]; then
      pass "[SIGNUP-3b] 报名列表应包含 2 条（got $COUNT）"
    else
      fail "[SIGNUP-3b] 报名列表应包含 2 条" "got $COUNT"
    fi
  fi
else
  fail "[SIGNUP-3] 跳过（无 session_id）"
fi

# [SIGNUP-4] 用错误 cancel_code 取消报名1 → 期望 403
if [ -n "$SIGNUP1_ID" ]; then
  RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X POST "${BASE}/api/custom/signups/cancel" \
    -H "Content-Type: application/json" \
    -H "Authorization: ${TOKEN}" \
    -d "{\"signup_id\":\"${SIGNUP1_ID}\",\"cancel_code\":\"wrong-code-xyz\"}")
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1 | sed 's/__STATUS__//')
  assert_status "[SIGNUP-4] 错误 cancel_code 取消报名1 应返回 403" "403" "$STATUS" "$BODY"
else
  fail "[SIGNUP-4] 跳过（无 signup1_id）"
fi

# [SIGNUP-5] 用正确 SIGNUP1_CODE 取消报名1 → 期望成功
if [ -n "$SIGNUP1_ID" ]; then
  RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X POST "${BASE}/api/custom/signups/cancel" \
    -H "Content-Type: application/json" \
    -H "Authorization: ${TOKEN}" \
    -d "{\"signup_id\":\"${SIGNUP1_ID}\",\"cancel_code\":\"${SIGNUP1_CODE}\"}")
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1 | sed 's/__STATUS__//')
  assert_status "[SIGNUP-5] 正确 cancel_code 取消报名1 应返回 200" "200" "$STATUS" "$BODY"
else
  fail "[SIGNUP-5] 跳过（无 signup1_id）"
fi

# [SIGNUP-6] 验证报名列表只剩1条
if [ -n "$SESSION_ID" ]; then
  ENCODED_FILTER="session%3D%22${SESSION_ID}%22"
  RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X GET \
    "${BASE}/api/collections/signups/records?filter=${ENCODED_FILTER}&sort=id" \
    -H "Authorization: ${TOKEN}")
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1 | sed 's/__STATUS__//')
  if assert_status "[SIGNUP-6] 取消后获取报名列表应返回 200" "200" "$STATUS" "$BODY"; then
    COUNT=$(json_array_count "$BODY" "items")
    if [ "$COUNT" -eq 1 ]; then
      pass "[SIGNUP-6b] 取消后报名列表应只剩 1 条（got $COUNT）"
    else
      fail "[SIGNUP-6b] 取消后报名列表应只剩 1 条" "got $COUNT"
    fi
  fi
else
  fail "[SIGNUP-6] 跳过（无 session_id）"
fi

echo ""

# ============================================================
# 3.5 EXPIRED SESSION RESTRICTIONS
# ============================================================
echo "--- [EXPIRED] ---"

PAST_DATE="2020-01-01"
EXP_SESS_CODE="exp-sess-${TS}"
EXP_SESSION_ID=""

# [EXPIRED-1] 创建一个已过期的场次（过去日期）
RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X POST "${BASE}/api/custom/sessions/create" \
  -H "Content-Type: application/json" \
  -H "Authorization: ${TOKEN}" \
  -d "{\"date\":\"${PAST_DATE}\",\"start_time\":\"09:00\",\"end_time\":\"11:00\",\"venue\":\"过期场地-${TS}\",\"max_players\":8,\"organizer\":\"测试员\",\"cancel_code\":\"${EXP_SESS_CODE}\"}")
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1 | sed 's/__STATUS__//')
if assert_status "[EXPIRED-1] 创建过期场次应返回 200" "200" "$STATUS" "$BODY"; then
  EXP_SESSION_ID=$(json_get "$BODY" "id")
fi

# [EXPIRED-2] 对已过期场次报名 → 期望 400
if [ -n "$EXP_SESSION_ID" ]; then
  RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X POST "${BASE}/api/custom/signups/create" \
    -H "Content-Type: application/json" \
    -H "Authorization: ${TOKEN}" \
    -d "{\"session\":\"${EXP_SESSION_ID}\",\"name\":\"测试员\",\"cancel_code\":\"exp-signup-${TS}\"}")
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1 | sed 's/__STATUS__//')
  assert_status "[EXPIRED-2] 已过期场次报名应返回 400" "400" "$STATUS" "$BODY"
else
  fail "[EXPIRED-2] 跳过（无 exp_session_id）"
fi

# [EXPIRED-3] 用取消码修改已过期场次 → 期望仍然成功
if [ -n "$EXP_SESSION_ID" ]; then
  RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X POST "${BASE}/api/custom/sessions/update" \
    -H "Content-Type: application/json" \
    -H "Authorization: ${TOKEN}" \
    -d "{\"session_id\":\"${EXP_SESSION_ID}\",\"venue\":\"过期场地已修改-${TS}\",\"cancel_code\":\"${EXP_SESS_CODE}\"}")
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1 | sed 's/__STATUS__//')
  assert_status "[EXPIRED-3] 用取消码修改已过期场次应返回 200" "200" "$STATUS" "$BODY"
else
  fail "[EXPIRED-3] 跳过（无 exp_session_id）"
fi

# [EXPIRED-4] 用取消码删除已过期场次 → 期望仍然成功
if [ -n "$EXP_SESSION_ID" ]; then
  RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X POST "${BASE}/api/custom/sessions/cancel" \
    -H "Content-Type: application/json" \
    -H "Authorization: ${TOKEN}" \
    -d "{\"session_id\":\"${EXP_SESSION_ID}\",\"cancel_code\":\"${EXP_SESS_CODE}\"}")
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1 | sed 's/__STATUS__//')
  assert_status "[EXPIRED-4] 用取消码删除已过期场次应返回 200" "200" "$STATUS" "$BODY"
else
  fail "[EXPIRED-4] 跳过（无 exp_session_id）"
fi

echo ""

# ============================================================
# 4. SHARE LINK
# ============================================================
echo "--- [SHARE] ---"

# [SHARE-1] 生成分享 token → 期望返回 token
if [ -n "$SESSION_ID" ]; then
  RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X POST "${BASE}/api/custom/share/encode" \
    -H "Content-Type: application/json" \
    -H "Authorization: ${TOKEN}" \
    -d "{\"session_id\":\"${SESSION_ID}\"}")
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1 | sed 's/__STATUS__//')
  if assert_status "[SHARE-1] 生成分享 token 应返回 200" "200" "$STATUS" "$BODY"; then
    assert_json_has_key "[SHARE-1b] 响应包含 token" "$BODY" "token"
    SHARE_TOKEN=$(json_get "$BODY" "token")
  fi
else
  fail "[SHARE-1] 跳过（无 session_id）"
fi

# [SHARE-2] 解码 token → 期望返回正确的 key 和 session_id
if [ -n "$SHARE_TOKEN" ]; then
  ENCODED_TOKEN=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1]))" "$SHARE_TOKEN" 2>/dev/null)
  RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X GET \
    "${BASE}/api/custom/share/decode?token=${ENCODED_TOKEN}")
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1 | sed 's/__STATUS__//')
  if assert_status "[SHARE-2] 解码 token 应返回 200" "200" "$STATUS" "$BODY"; then
    assert_json_contains "[SHARE-2b] 解码结果 key 正确" "$BODY" "key" "$KEY"
    assert_json_contains "[SHARE-2c] 解码结果 session_id 正确" "$BODY" "session_id" "$SESSION_ID"
  fi
else
  fail "[SHARE-2] 跳过（无 share_token）"
fi

# [SHARE-3] 解码篡改的 token → 期望 400
TAMPERED_TOKEN="tampered.invalid.token.xyz"
RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X GET \
  "${BASE}/api/custom/share/decode?token=${TAMPERED_TOKEN}")
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1 | sed 's/__STATUS__//')
assert_status "[SHARE-3] 解码篡改的 token 应返回 400" "400" "$STATUS" "$BODY"

echo ""

# ============================================================
# 5. SESSION CANCEL
# ============================================================
echo "--- [SESSION-CANCEL] ---"

# [CANCEL-1] 用错误 cancel_code 取消场次 → 期望 403
if [ -n "$SESSION_ID" ]; then
  RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X POST "${BASE}/api/custom/sessions/cancel" \
    -H "Content-Type: application/json" \
    -H "Authorization: ${TOKEN}" \
    -d "{\"session_id\":\"${SESSION_ID}\",\"cancel_code\":\"wrong-code-xyz\"}")
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1 | sed 's/__STATUS__//')
  assert_status "[CANCEL-1] 错误 cancel_code 取消场次应返回 403" "403" "$STATUS" "$BODY"
else
  fail "[CANCEL-1] 跳过（无 session_id）"
fi

# [CANCEL-2] 用正确 SESS_CODE 取消场次 → 期望成功
if [ -n "$SESSION_ID" ]; then
  RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X POST "${BASE}/api/custom/sessions/cancel" \
    -H "Content-Type: application/json" \
    -H "Authorization: ${TOKEN}" \
    -d "{\"session_id\":\"${SESSION_ID}\",\"cancel_code\":\"${SESS_CODE}\"}")
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1 | sed 's/__STATUS__//')
  assert_status "[CANCEL-2] 正确 cancel_code 取消场次应返回 200" "200" "$STATUS" "$BODY"
else
  fail "[CANCEL-2] 跳过（无 session_id）"
fi

# [CANCEL-3] 验证场次已被删除（GET 该 id 期望 404）
if [ -n "$SESSION_ID" ]; then
  RESP=$(curl -s -w "\n__STATUS__%{http_code}" -X GET "${BASE}/api/collections/sessions/records/${SESSION_ID}" \
    -H "Authorization: ${TOKEN}")
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1 | sed 's/__STATUS__//')
  assert_status "[CANCEL-3] 取消后获取场次应返回 404" "404" "$STATUS" "$BODY"
else
  fail "[CANCEL-3] 跳过（无 session_id）"
fi

echo ""
echo "========================================"
TOTAL=$((PASS + FAIL))
echo "通过: ${PASS} / 失败: ${FAIL} / 总计: ${TOTAL}"
echo "========================================"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0

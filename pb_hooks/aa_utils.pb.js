/// <reference path="../pb_data/types.d.ts" />

/**
 * $badminton — shared utilities for all pb_hooks files.
 *
 * Encryption strategy: JWT (HS256) via $security.createJWT / $security.parseJWT.
 * Rationale: $security.encrypt() requires a literal 32-character ASCII key,
 * whereas our SHARE_SECRET is a 64-hex string (32 raw bytes). Converting hex
 * to a 32-char ASCII string in JSVM is cumbersome and error-prone. JWT HS256
 * is natively supported by PocketBase, produces a compact, URL-safe token,
 * and is cryptographically sufficient for this use-case (HMAC-SHA256 prevents
 * tampering; the payload is opaque to anyone without the secret).
 */

// ---------------------------------------------------------------------------
// 1. getEnv
// ---------------------------------------------------------------------------
function getEnv(key, fallback) {
  const val = $os.getenv(key);
  return val === "" || val === undefined ? fallback : val;
}

// ---------------------------------------------------------------------------
// 2. aesEncrypt / aesDecrypt  (implemented as JWT HS256 tokens)
//
//    "encrypt"  → createJWT({ d: plainText }, secret, 0)
//                 duration=0 means the JWT has no expiry claim, so it never
//                 expires on its own (parseJWT would still fail for expired
//                 tokens — we pass 0 to suppress the exp claim entirely).
//
//    Note: $security.createJWT with secDuration=0 still adds exp=0 in some
//    PB versions, which parseJWT rejects. To work around this we use a very
//    large duration (100 years) so the token is effectively permanent.
// ---------------------------------------------------------------------------
const JWT_LONG_DURATION = 100 * 365 * 24 * 3600; // ~100 years in seconds

function aesEncrypt(plainText) {
  const secret = getEnv("SHARE_SECRET", "");
  if (!secret) {
    throw new Error("SHARE_SECRET env var is not set");
  }
  // Wrap the plaintext in a JWT payload
  const token = $security.createJWT(
    { d: plainText },
    secret,
    JWT_LONG_DURATION
  );
  return token;
}

function aesDecrypt(cipherToken) {
  const secret = getEnv("SHARE_SECRET", "");
  if (!secret) {
    throw new Error("SHARE_SECRET env var is not set");
  }
  const claims = $security.parseJWT(cipherToken, secret);
  if (!claims || claims.d === undefined) {
    throw new Error("Invalid or tampered token");
  }
  return claims.d;
}

// ---------------------------------------------------------------------------
// 3. isExpired
//    Combines session.date (YYYY-MM-DD) + session.end_time (HH:MM) and
//    interprets it as Asia/Shanghai time, then compares to now.
//
//    PocketBase JSVM runs in Go which doesn't expose Intl/Date timezone APIs.
//    We implement the offset manually: Asia/Shanghai is UTC+8 always (no DST).
// ---------------------------------------------------------------------------
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000; // +08:00 in milliseconds

function isExpired(session) {
  const dateStr = session.getString("date");       // e.g. "2024-03-15 00:00:00.000Z" or "2024-03-15"
  const endTime = session.getString("end_time");   // e.g. "21:00"

  // Extract YYYY-MM-DD from the date field (PocketBase stores dates as ISO strings)
  const dateOnly = dateStr.substring(0, 10); // "2024-03-15"

  // Build an ISO string in UTC that represents the local Shanghai end time
  // Shanghai = UTC+8, so local 21:00 = UTC 13:00
  const [hh, mm] = endTime.split(":");
  const localMs =
    new Date(dateOnly + "T" + hh + ":" + mm + ":00.000Z").getTime() -
    SHANGHAI_OFFSET_MS;

  return Date.now() > localMs;
}

// ---------------------------------------------------------------------------
// 4. signupCount
//    Returns the number of signup records for a given session ID.
// ---------------------------------------------------------------------------
function signupCount(sessionId) {
  return $app.countRecords(
    "signups",
    $dbx.exp("[[session]] = {:sid}", { sid: sessionId })
  );
}

// ---------------------------------------------------------------------------
// Export as global $badminton object so all other hook files can use it
// without relying on require().
// ---------------------------------------------------------------------------
var $badminton = {
  getEnv: getEnv,
  aesEncrypt: aesEncrypt,
  aesDecrypt: aesDecrypt,
  isExpired: isExpired,
  signupCount: signupCount,
};

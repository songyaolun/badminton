/// <reference path="../pb_data/types.d.ts" />

var _JWT_DURATION = 100 * 365 * 24 * 3600;


// ---------------------------------------------------------------------------
// POST /api/custom/sessions/create
// Hidden fields can't be set from client API — this route handles it server-side.
// ---------------------------------------------------------------------------
routerAdd("POST", "/api/custom/sessions/create", (e) => {
  try {
    const info = e.requestInfo()
    const auth = info.auth
    if (!auth) return e.json(401, { message: "Unauthorized" })

    const b = info.body
    const cancelCode = (b.cancel_code || "").toString()
    if (!cancelCode) return e.json(400, { message: "cancel_code is required" })

    const col = $app.findCollectionByNameOrId("sessions")
    const rec = new Record(col)
    rec.set("space", auth.id)
    rec.set("date", (b.date || "").toString())
    rec.set("start_time", (b.start_time || "").toString())
    rec.set("end_time", (b.end_time || "").toString())
    rec.set("venue", (b.venue || "").toString())
    rec.set("max_players", parseInt(b.max_players) || 0)
    rec.set("organizer", (b.organizer || "").toString())
    rec.set("cancel_code", cancelCode)
    rec.set("note", (b.note || "").toString())
    rec.set("private", b.private === true)
    $app.save(rec)

    return e.json(200, rec)
  } catch (err) {
    return e.json(500, { message: (err && err.message) ? err.message : String(err) })
  }
})

// ---------------------------------------------------------------------------
// POST /api/custom/signups/create
// ---------------------------------------------------------------------------
routerAdd("POST", "/api/custom/signups/create", (e) => {
  try {
    const info = e.requestInfo()
    const auth = info.auth
    if (!auth) return e.json(401, { message: "Unauthorized" })

    const b = info.body
    const sessionId = (b.session || "").toString()
    const name = (b.name || "").toString()
    const cancelCode = (b.cancel_code || "").toString()

    if (!sessionId) return e.json(400, { message: "session is required" })
    if (!name) return e.json(400, { message: "name is required" })
    if (!cancelCode) return e.json(400, { message: "cancel_code is required" })

    // Verify session belongs to this space
    let session
    try {
      session = $app.findRecordById("sessions", sessionId)
    } catch (_) {
      return e.json(404, { message: "Session not found" })
    }
    if (session.getString("space") !== auth.id) return e.json(403, { message: "Forbidden" })

    // Reject signups on expired sessions (Asia/Shanghai = UTC+8)
    const _expDateOnly = session.getString("date").substring(0, 10)
    const _expParts = session.getString("end_time").split(":")
    const _expMs = new Date(_expDateOnly + "T" + _expParts[0] + ":" + _expParts[1] + ":00.000Z").getTime() - 8 * 3600000
    if (Date.now() > _expMs) return e.json(400, { message: "Session has already ended" })

    const col = $app.findCollectionByNameOrId("signups")
    const rec = new Record(col)
    rec.set("session", sessionId)
    rec.set("name", name)
    rec.set("cancel_code", cancelCode)
    $app.save(rec)

    return e.json(200, rec)
  } catch (err) {
    return e.json(500, { message: (err && err.message) ? err.message : String(err) })
  }
})

// ---------------------------------------------------------------------------
// POST /api/custom/spaces/create
// ---------------------------------------------------------------------------
routerAdd("POST", "/api/custom/spaces/create", (e) => {
  try {
    const info = e.requestInfo()
    const body = info.body
    const createPassword = (body.create_password || "").toString()
    const key = (body.key || "").toString()

    if (!key) return e.json(400, { message: "key is required" })

    const expectedPassword = $os.getenv("CREATE_PASSWORD")
    if (!expectedPassword || createPassword !== expectedPassword) {
      return e.json(401, { message: "Invalid create_password" })
    }

    const existing = $app.findRecordsByFilter("spaces", "username = {:key}", "", 1, 0, { key: key })
    if (existing && existing.length > 0) return e.json(400, { message: "Key already exists" })

    const col = $app.findCollectionByNameOrId("spaces")
    const newRecord = new Record(col)
    newRecord.set("username", key)
    newRecord.setPassword(key)
    newRecord.set("passwordConfirm", key)
    $app.save(newRecord)

    return e.json(200, { success: true })
  } catch (err) {
    const msg = (err && err.message) ? err.message : String(err)
    if (msg.toLowerCase().indexOf("unique") !== -1 || msg.toLowerCase().indexOf("already") !== -1) {
      return e.json(400, { message: "Key already exists" })
    }
    return e.json(500, { message: msg })
  }
})

// ---------------------------------------------------------------------------
// POST /api/custom/share/encode
// ---------------------------------------------------------------------------
routerAdd("POST", "/api/custom/share/encode", (e) => {
  try {
    const info = e.requestInfo()
    const auth = info.auth
    if (!auth) return e.json(401, { message: "Unauthorized" })

    const body = info.body
    const sessionId = (body.session_id || "").toString()
    if (!sessionId) return e.json(400, { message: "session_id is required" })

    let session
    try {
      session = $app.findRecordById("sessions", sessionId)
    } catch (_) {
      return e.json(404, { message: "Session not found" })
    }

    if (session.getString("space") !== auth.id) {
      return e.json(403, { message: "Session does not belong to your space" })
    }

    const secret = $os.getenv("SHARE_SECRET")
    if (!secret) return e.json(500, { message: "SHARE_SECRET not configured" })

    const key = auth.getString("username")
    const jwtDuration = 100 * 365 * 24 * 3600 // ~100 years in seconds
    const token = $security.createJWT({ d: key + "|" + sessionId }, secret, jwtDuration)
    return e.json(200, { token: token })
  } catch (err) {
    return e.json(500, { message: (err && err.message) ? err.message : String(err) })
  }
})

// ---------------------------------------------------------------------------
// GET /api/custom/share/decode
// ---------------------------------------------------------------------------
routerAdd("GET", "/api/custom/share/decode", (e) => {
  try {
    const token = e.request.url.query().get("token")
    if (!token) return e.json(400, { message: "token is required" })

    const secret = $os.getenv("SHARE_SECRET")
    if (!secret) return e.json(500, { message: "SHARE_SECRET not configured" })

    let claims
    try {
      claims = $security.parseJWT(token, secret)
    } catch (_) {
      return e.json(400, { message: "Invalid or tampered token" })
    }

    if (!claims || claims.d === undefined) return e.json(400, { message: "Invalid token payload" })

    const plainText = claims.d
    const sep = plainText.indexOf("|")
    if (sep === -1) return e.json(400, { message: "Malformed token" })

    return e.json(200, {
      key: plainText.substring(0, sep),
      session_id: plainText.substring(sep + 1)
    })
  } catch (err) {
    return e.json(500, { message: (err && err.message) ? err.message : String(err) })
  }
})

// ---------------------------------------------------------------------------
// POST /api/custom/sessions/update
// Hidden field cancel_code can't be used in PocketBase updateRule — this
// route validates cancel_code server-side before applying the patch.
// Body: {session_id, cancel_code, ...fields to update}
// ---------------------------------------------------------------------------
routerAdd("POST", "/api/custom/sessions/update", (e) => {
  try {
    const info = e.requestInfo()
    const auth = info.auth
    if (!auth) return e.json(401, { message: "Unauthorized" })

    const b = info.body
    const sessionId = (b.session_id || "").toString()
    const cancelCode = (b.cancel_code || "").toString()
    if (!sessionId) return e.json(400, { message: "session_id is required" })
    if (!cancelCode) return e.json(400, { message: "cancel_code is required" })

    let session
    try {
      session = $app.findRecordById("sessions", sessionId)
    } catch (_) {
      return e.json(404, { message: "Session not found" })
    }

    if (session.getString("space") !== auth.id) return e.json(403, { message: "Forbidden" })
    if (session.getString("cancel_code") !== cancelCode) return e.json(403, { message: "Invalid cancel_code" })

    // Apply updatable fields (exclude space and cancel_code itself for safety)
    if (b.date !== undefined) session.set("date", (b.date || "").toString())
    if (b.start_time !== undefined) session.set("start_time", (b.start_time || "").toString())
    if (b.end_time !== undefined) session.set("end_time", (b.end_time || "").toString())
    if (b.venue !== undefined) session.set("venue", (b.venue || "").toString())
    if (b.max_players !== undefined) session.set("max_players", parseInt(b.max_players) || 0)
    if (b.organizer !== undefined) session.set("organizer", (b.organizer || "").toString())
    if (b.note !== undefined) session.set("note", (b.note || "").toString())

    $app.save(session)
    return e.json(200, session)
  } catch (err) {
    return e.json(500, { message: (err && err.message) ? err.message : String(err) })
  }
})

// ---------------------------------------------------------------------------
// POST /api/custom/sessions/cancel
// ---------------------------------------------------------------------------
routerAdd("POST", "/api/custom/sessions/cancel", (e) => {
  try {
    const info = e.requestInfo()
    const auth = info.auth
    if (!auth) return e.json(401, { message: "Unauthorized" })

    const body = info.body
    const sessionId = (body.session_id || "").toString()
    const cancelCode = (body.cancel_code || "").toString()
    if (!sessionId) return e.json(400, { message: "session_id is required" })
    if (!cancelCode) return e.json(400, { message: "cancel_code is required" })

    let session
    try {
      session = $app.findRecordById("sessions", sessionId)
    } catch (_) {
      return e.json(404, { message: "Session not found" })
    }

    if (session.getString("space") !== auth.id) return e.json(403, { message: "Forbidden" })
    if (session.getString("cancel_code") !== cancelCode) return e.json(403, { message: "Invalid cancel_code" })

    $app.delete(session)
    return e.json(200, {})
  } catch (err) {
    return e.json(500, { message: (err && err.message) ? err.message : String(err) })
  }
})

// ---------------------------------------------------------------------------
// POST /api/custom/signups/cancel
// ---------------------------------------------------------------------------
routerAdd("POST", "/api/custom/signups/cancel", (e) => {
  try {
    const info = e.requestInfo()
    const auth = info.auth
    if (!auth) return e.json(401, { message: "Unauthorized" })

    const body = info.body
    const signupId = (body.signup_id || "").toString()
    const cancelCode = (body.cancel_code || "").toString()
    if (!signupId) return e.json(400, { message: "signup_id is required" })
    if (!cancelCode) return e.json(400, { message: "cancel_code is required" })

    let signup
    try {
      signup = $app.findRecordById("signups", signupId)
    } catch (_) {
      return e.json(404, { message: "Signup not found" })
    }

    if (signup.getString("cancel_code") !== cancelCode) return e.json(403, { message: "Invalid cancel_code" })

    let session
    try {
      session = $app.findRecordById("sessions", signup.getString("session"))
    } catch (_) {
      return e.json(404, { message: "Session not found" })
    }

    if (session.getString("space") !== auth.id) return e.json(403, { message: "Forbidden" })

    // Reject cancellations on expired sessions (Asia/Shanghai = UTC+8)
    const _expDateOnly2 = session.getString("date").substring(0, 10)
    const _expParts2 = session.getString("end_time").split(":")
    const _expMs2 = new Date(_expDateOnly2 + "T" + _expParts2[0] + ":" + _expParts2[1] + ":00.000Z").getTime() - 8 * 3600000
    if (Date.now() > _expMs2) return e.json(400, { message: "Session has already ended" })

    $app.delete(signup)
    return e.json(200, {})
  } catch (err) {
    return e.json(500, { message: (err && err.message) ? err.message : String(err) })
  }
})

// ---------------------------------------------------------------------------
// POST /api/custom/admin/sessions
// Admin endpoint: returns all sessions for a space including cancel_code.
// Body: { admin_password, space_key }
// ---------------------------------------------------------------------------
routerAdd("POST", "/api/custom/admin/sessions", (e) => {
  try {
    const b = e.requestInfo().body
    const adminPwd = (b.admin_password || "").toString()
    const spaceKey = (b.space_key || "").toString()

    if (!adminPwd || adminPwd !== $os.getenv("CREATE_PASSWORD")) {
      return e.json(401, { message: "Invalid admin_password" })
    }
    if (!spaceKey) return e.json(400, { message: "space_key is required" })

    const spaceRecords = $app.findRecordsByFilter("spaces", "username = {:key}", "", 1, 0, { key: spaceKey })
    if (!spaceRecords || spaceRecords.length === 0) return e.json(404, { message: "Space not found" })
    const space = spaceRecords[0]

    const sessions = $app.findRecordsByFilter(
      "sessions",
      "space = {:spaceId}",
      "-date",
      200,
      0,
      { spaceId: space.id }
    )

    const result = sessions.map((s) => ({
      id:          s.id,
      date:        s.getString("date"),
      start_time:  s.getString("start_time"),
      end_time:    s.getString("end_time"),
      venue:       s.getString("venue"),
      max_players: s.getInt("max_players"),
      organizer:   s.getString("organizer"),
      cancel_code: s.getString("cancel_code"),
      note:        s.getString("note"),
      private:     s.getBool("private"),
      created:     s.getString("created"),
    }))

    return e.json(200, { sessions: result })
  } catch (err) {
    return e.json(500, { message: (err && err.message) ? err.message : String(err) })
  }
})

// ---------------------------------------------------------------------------
// POST /api/custom/admin/signups
// Admin endpoint: returns all signups for a session including cancel_code.
// Body: { admin_password, session_id }
// ---------------------------------------------------------------------------
routerAdd("POST", "/api/custom/admin/signups", (e) => {
  try {
    const b = e.requestInfo().body
    const adminPwd = (b.admin_password || "").toString()
    const sessionId = (b.session_id || "").toString()

    if (!adminPwd || adminPwd !== $os.getenv("CREATE_PASSWORD")) {
      return e.json(401, { message: "Invalid admin_password" })
    }
    if (!sessionId) return e.json(400, { message: "session_id is required" })

    const signups = $app.findRecordsByFilter(
      "signups",
      "session = {:sid}",
      "id",
      200,
      0,
      { sid: sessionId }
    )

    const result = signups.map((s) => ({
      id:          s.id,
      name:        s.getString("name"),
      cancel_code: s.getString("cancel_code"),
      created:     s.getString("created"),
    }))

    return e.json(200, { signups: result })
  } catch (err) {
    return e.json(500, { message: (err && err.message) ? err.message : String(err) })
  }
})

// ---------------------------------------------------------------------------
// POST /api/custom/admin/spaces/delete
// Admin endpoint: deletes a space (cascades to its sessions and signups).
// Body: { admin_password, space_key }
// ---------------------------------------------------------------------------
routerAdd("POST", "/api/custom/admin/spaces/delete", (e) => {
  try {
    const b = e.requestInfo().body
    const adminPwd = (b.admin_password || "").toString()
    const spaceKey = (b.space_key || "").toString()

    if (!adminPwd || adminPwd !== $os.getenv("CREATE_PASSWORD")) {
      return e.json(401, { message: "Invalid admin_password" })
    }
    if (!spaceKey) return e.json(400, { message: "space_key is required" })

    const spaceRecords = $app.findRecordsByFilter("spaces", "username = {:key}", "", 1, 0, { key: spaceKey })
    if (!spaceRecords || spaceRecords.length === 0) return e.json(404, { message: "Space not found" })

    $app.delete(spaceRecords[0])
    return e.json(200, { success: true })
  } catch (err) {
    return e.json(500, { message: (err && err.message) ? err.message : String(err) })
  }
})

// ---------------------------------------------------------------------------
// POST /api/custom/admin/spaces
// Admin endpoint: returns all spaces (keys).
// Body: { admin_password }
// ---------------------------------------------------------------------------
routerAdd("POST", "/api/custom/admin/spaces", (e) => {
  try {
    const b = e.requestInfo().body
    const adminPwd = (b.admin_password || "").toString()

    if (!adminPwd || adminPwd !== $os.getenv("CREATE_PASSWORD")) {
      return e.json(401, { message: "Invalid admin_password" })
    }

    const spaces = $app.findRecordsByFilter("spaces", "id != ''", "username", 200, 0, {})
    const result = spaces.map((s) => ({
      id:       s.id,
      username: s.getString("username"),
      created:  s.getString("created"),
    }))

    return e.json(200, { spaces: result })
  } catch (err) {
    return e.json(500, { message: (err && err.message) ? err.message : String(err) })
  }
})

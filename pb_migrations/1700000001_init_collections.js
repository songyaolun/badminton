/// <reference path="../pb_data/types.d.ts" />

migrate(
  // -----------------------------------------------------------------------
  // UP
  // -----------------------------------------------------------------------
  (app) => {
    // ===== spaces (auth collection) ======================================
    // The "username" system field is NOT auto-created by PocketBase for auth
    // collections — we must add it explicitly.  It also needs a UNIQUE index
    // before it can be used as a passwordAuth identityField.
    const spaces = new Collection({
      type: "auth",
      name: "spaces",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: "username",
          type: "text",
          required: true,
          min: 4,
          max: 64,
          pattern: "^[A-Za-z0-9_-]+$",
        },
      ],
      // UNIQUE index on username — required for identityFields validation
      indexes: [
        "CREATE UNIQUE INDEX idx_spaces_username ON spaces (username)",
      ],
      passwordAuth: {
        enabled: true,
        identityFields: ["username"],
      },
      // Disable email/OAuth2/OTP/MFA — username+password only
      oauth2: { enabled: false },
      otp: { enabled: false },
      mfa: { enabled: false },
    });

    app.save(spaces);

    // Lower the minimum password length from the default (8) to 4.
    // The password field max must stay at 0 (unlimited); PocketBase caps
    // it at 71 internally due to bcrypt.
    const spacesCol = app.findCollectionByNameOrId("spaces");
    const pwField = spacesCol.fields.getByName("password");
    if (pwField) {
      pwField.min = 4;
      // leave max = 0 (PB enforces ≤ 71 bytes for bcrypt internally)
    }
    app.save(spacesCol);

    // ===== sessions ======================================================
    const spacesColFinal = app.findCollectionByNameOrId("spaces");

    const sessions = new Collection({
      type: "base",
      name: "sessions",
      listRule: "space = @request.auth.id",
      viewRule: "space = @request.auth.id",
      createRule: '@request.auth.id != "" && space = @request.auth.id',
      updateRule:
        '@request.auth.id != "" && space = @request.auth.id && cancel_code = @request.body.cancel_code',
      deleteRule:
        '@request.auth.id != "" && space = @request.auth.id && cancel_code = @request.body.cancel_code',
      fields: [
        {
          name: "space",
          type: "relation",
          required: true,
          collectionId: spacesColFinal.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: "date",
          type: "date",
          required: true,
        },
        {
          name: "start_time",
          type: "text",
          required: true,
          pattern: "^\\d{2}:\\d{2}$",
          max: 5,
        },
        {
          name: "end_time",
          type: "text",
          required: true,
          pattern: "^\\d{2}:\\d{2}$",
          max: 5,
        },
        {
          name: "venue",
          type: "text",
          required: true,
          max: 100,
        },
        {
          name: "court_count",
          type: "number",
          required: true,
          min: 1,
        },
        {
          name: "fee",
          type: "number",
          required: true,
          min: 0,
        },
        {
          name: "max_players",
          type: "number",
          required: true,
          min: 1,
        },
        {
          name: "organizer",
          type: "text",
          required: true,
          max: 50,
        },
        {
          name: "cancel_code",
          type: "text",
          required: true,
          max: 50,
          hidden: true,
        },
        {
          name: "note",
          type: "text",
          required: false,
          max: 500,
        },
      ],
    });

    app.save(sessions);

    // ===== signups =======================================================
    const sessionsCol = app.findCollectionByNameOrId("sessions");

    const signups = new Collection({
      type: "base",
      name: "signups",
      listRule: "session.space = @request.auth.id",
      viewRule: "session.space = @request.auth.id",
      createRule:
        '@request.auth.id != "" && session.space = @request.auth.id',
      updateRule: null,
      deleteRule:
        '@request.auth.id != "" && session.space = @request.auth.id && cancel_code = @request.body.cancel_code',
      fields: [
        {
          name: "session",
          type: "relation",
          required: true,
          collectionId: sessionsCol.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: "name",
          type: "text",
          required: true,
          max: 50,
        },
        {
          name: "cancel_code",
          type: "text",
          required: true,
          max: 50,
          hidden: true,
        },
      ],
    });

    app.save(signups);
  },

  // -----------------------------------------------------------------------
  // DOWN
  // -----------------------------------------------------------------------
  (app) => {
    for (const name of ["signups", "sessions", "spaces"]) {
      try {
        const col = app.findCollectionByNameOrId(name);
        app.delete(col);
      } catch (_) {
        // collection may not exist — ignore
      }
    }
  }
);

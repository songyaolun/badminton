/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId("sessions");
    col.fields.add(new Field({ name: "type", type: "text", required: false, max: 50 }));
    col.fields.add(new Field({ name: "extra_fields", type: "json", required: false }));
    app.save(col);
  },
  (app) => {
    const col = app.findCollectionByNameOrId("sessions");
    col.fields.removeByName("extra_fields");
    col.fields.removeByName("type");
    app.save(col);
  }
);

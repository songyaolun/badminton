/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId("sessions");
    col.fields.removeByName("court_count");
    col.fields.removeByName("fee");
    app.save(col);
  },
  (app) => {
    const col = app.findCollectionByNameOrId("sessions");
    col.fields.add(new Field({ name: "court_count", type: "number", required: true, min: 1 }));
    col.fields.add(new Field({ name: "fee", type: "number", required: true, min: 0 }));
    app.save(col);
  }
);

/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId("sessions");
    col.fields.add(new Field({ name: "private", type: "bool", required: false }));
    app.save(col);
  },
  (app) => {
    const col = app.findCollectionByNameOrId("sessions");
    col.fields.removeByName("private");
    app.save(col);
  }
);

/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId("spaces");
    const f = col.fields.getByName("username");
    if (f) {
      f.pattern = "";
      f.min = 1;
    }
    app.save(col);
  },
  (app) => {
    const col = app.findCollectionByNameOrId("spaces");
    const f = col.fields.getByName("username");
    if (f) {
      f.pattern = "^[A-Za-z0-9_-]+$";
      f.min = 4;
    }
    app.save(col);
  }
);

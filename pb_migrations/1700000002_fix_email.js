migrate(
  (app) => {
    const c = app.findCollectionByNameOrId("spaces");
    const emailField = c.fields.getByName("email");
    if (emailField) {
      console.log("email field required:", emailField.required, "system:", emailField.system);
      emailField.required = false;
      console.log("Set email required=false");
    }
    app.save(c);
    
    // Verify
    const c2 = app.findCollectionByNameOrId("spaces");
    const ef2 = c2.fields.getByName("email");
    console.log("email field required after save:", ef2 ? ef2.required : "N/A");
  },
  (app) => {}
);

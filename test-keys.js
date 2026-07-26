const db = require("./src/shared/database/index");
async function test() {
  const keys = await db.getAllApiKeys();
  console.log("Keys in DB:", keys);
}
test();

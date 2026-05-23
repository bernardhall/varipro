require('dotenv').config({ path: '../backend/.env' });
const { query } = require('../backend/src/db/database');
async function test() {
  try {
    const res = await query('SELECT account_name, quote_footer FROM accounts');
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}
test();

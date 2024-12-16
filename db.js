const { Pool } = require('pg');

const pool = new Pool({
  user: "postgres",
  password: "uri200306",
  host: "localhost",
  port: 5432,
  database: "project"
});

module.exports = pool;

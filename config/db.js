const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }   
});

pool.connect()
  .then(() => console.log('✅ Connected to PostgreSQL:', process.env.DB_NAME))
  .catch(err => console.error('❌ Database connection error:', err.message));

  
module.exports = pool;


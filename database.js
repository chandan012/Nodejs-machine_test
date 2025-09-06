const mysql = require('mysql2');

// Create a connection to MySQL server 
const createConnection = () => {
  return mysql.createConnection({
    host: 'localhost',
    user: 'chandan', //
    password: 'Chandan12@', 
  });
};

// Create the database if it doesn't exist
const createDatabase = () => {
  return new Promise((resolve, reject) => {
    const connection = createConnection();
    
    connection.query('CREATE DATABASE IF NOT EXISTS machine_test_db', (err) => {
      connection.end();
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

// Create a connection pool to the specific database
const createPool = () => {
  return mysql.createPool({
    host: 'localhost',
    user: 'chandan',
    password: 'Chandan12@',
    database: 'machine_test_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
};

// Initialize database and return pool
const initializeDB = async () => {
  try {
    await createDatabase();
    const pool = createPool();
    const promisePool = pool.promise();
    
    console.log('Connected to MySQL database');
    return promisePool;
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
};

module.exports = initializeDB;
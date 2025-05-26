import mysql from 'mysql2/promise';

const dbConfig = {
    host: '127.0.0.1', // Nodejs chạy ngoài, MySQL trong docker
    user: 'db',
    password: 'db',
    database: 'db',
    port: 61460
};

export const db = await mysql.createConnection(dbConfig);

export { dbConfig }; 
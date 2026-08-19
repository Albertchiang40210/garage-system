const mysql = require('mysql2/promise');

async function run() {
    console.log("🚀 開始執行資料庫結構升級 (Phase 3: Auth & KDS)...");
    const db = await mysql.createConnection({
        host: process.env.DB_HOST || '127.0.0.1', 
        user: 'root',          
        password: process.env.DB_PASSWORD || 'P@ssw0rd',  
        database: 'garage_xlb',
        port: 3306 
    });

    try {
        console.log("📦 建立 users 資料表...");
        await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(20) DEFAULT 'STAFF'
            )
        `);
        
        // Insert default admin: admin / 123456 (For simplicity, storing plain text in POC)
        await db.query("INSERT IGNORE INTO users (username, password, role) VALUES ('admin', '123456', 'ADMIN')");
        await db.query("INSERT IGNORE INTO users (username, password, role) VALUES ('staff', '123456', 'STAFF')");

        console.log("📜 修改 daily_sales 資料表 (加入 order_id 與 kitchen_status)...");
        try {
            await db.query("ALTER TABLE daily_sales ADD COLUMN order_id VARCHAR(20)");
            await db.query("ALTER TABLE daily_sales ADD COLUMN kitchen_status VARCHAR(20) DEFAULT 'COMPLETED'"); // Old data is marked as completed
        } catch(e) {
            console.log("欄位可能已存在，略過新增。");
        }
        
        console.log("✅ Phase 3 Migration 執行成功！");
    } catch (e) {
        console.error("❌ Migration 失敗:", e);
    } finally {
        await db.end();
    }
}
run();

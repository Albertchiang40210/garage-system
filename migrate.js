const mysql = require('mysql2/promise');

async function runMigration() {
    console.log("🚀 開始執行資料庫結構升級 (Phase 2: BOM System Migration)...");
    
    const db = await mysql.createConnection({
        host: process.env.DB_HOST || '127.0.0.1', 
        user: 'root',          
        password: process.env.DB_PASSWORD || 'P@ssw0rd',  
        database: 'garage_xlb',
        port: 3306 
    });

    try {
        console.log("📦 建立 products 資料表...");
        await db.query(`
            CREATE TABLE IF NOT EXISTS products (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                price INT NOT NULL,
                category VARCHAR(100)
            )
        `);

        console.log("📜 建立 recipes 資料表...");
        await db.query(`
            CREATE TABLE IF NOT EXISTS recipes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                product_id INT NOT NULL,
                ingredient_id INT NOT NULL,
                quantity INT NOT NULL,
                FOREIGN KEY (product_id) REFERENCES products(id),
                FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
            )
        `);

        // Check if products is empty
        const [rows] = await db.query("SELECT COUNT(*) as count FROM products");
        if (rows[0].count === 0) {
            console.log("🔄 從 ingredients 轉移商品資料至 products 並建立 1:1 預設配方...");
            
            const [ingredients] = await db.query("SELECT id, name, price, category FROM ingredients");
            
            for (let ing of ingredients) {
                // Insert into products
                const [result] = await db.query(
                    "INSERT INTO products (id, name, price, category) VALUES (?, ?, ?, ?)",
                    [ing.id, ing.name, ing.price, ing.category]
                );
                
                // Insert 1:1 recipe mapping
                await db.query(
                    "INSERT INTO recipes (product_id, ingredient_id, quantity) VALUES (?, ?, 1)",
                    [ing.id, ing.id]
                );
            }
            console.log("✅ 資料轉移與預設配方建立完成！");
        } else {
            console.log("⏭️ products 資料表已有資料，略過轉移步驟。");
        }

        console.log("🎉 Migration 執行成功！");

    } catch (err) {
        console.error("❌ Migration 失敗:", err);
    } finally {
        await db.end();
    }
}

runMigration();

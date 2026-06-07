// =========================================================================
// [車庫小籠包 POS 2.0] 後端大腦核心伺服器 (全套終極完工版)
// =========================================================================
const express = require('express');
const mysql = require('mysql2'); 
const path = require('path');
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MySQL 連線設定
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',          
    password: 'YOUR_DATABASE_PASSWORD',  
    database: 'garage_xlb'
});

db.connect((err) => {
    if (err) {
        console.error('❌ MySQL 資料庫連線失敗:', err);
        return;
    }
    console.log('✅ 成功連線至 MySQL 資料庫: garage_xlb');
});

// =========================================================================
// 🚀 API 路由區塊
// =========================================================================

// 【庫存 API 1】：撈取精簡後的 19 種核心核心物料
app.get('/api/ingredients', (req, res) => {
    const sql = "SELECT id, name, stock_qty, unit, min_stock FROM ingredients ORDER BY id ASC";
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 【庫存 API 2】：手動調整庫存 (進貨與盤點)
app.put('/api/ingredients/:id/stock', (req, res) => {
    const { id } = req.params;
    const { adjust_qty } = req.body; 
    const sql = "UPDATE ingredients SET stock_qty = stock_qty + ? WHERE id = ?";
    db.query(sql, [Number(adjust_qty), id], (err, result) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true });
    });
});

// 【API 1】產品線數據雷達分析與對帳 API (小籠包總顆數精準全加總演算法)
app.get('/api/reports/category-radar', (req, res) => {
    const { range, year, month } = req.query;
    let dateCondition = "d.status != 'VOID'";
    const params = [];
    const now = new Date();
    const currentYear = year || now.getFullYear();
    const currentMonth = month || (now.getMonth() + 1);

    if (range === 'month') {
        dateCondition += " AND YEAR(d.created_at) = ? AND MONTH(d.created_at) = ?";
        params.push(currentYear, currentMonth);
    } else if (range === 'year') {
        dateCondition += " AND YEAR(d.created_at) = ?";
        params.push(currentYear);
    } else {
        dateCondition += " AND DATE(d.created_at) = CURDATE()";
    }

    const sql = `
        SELECT p.category, p.name AS product_name, SUM(d.quantity_sold) AS total_qty, SUM(d.total_revenue) AS total_revenue
        FROM daily_sales d
        JOIN products p ON d.product_id = p.id
        WHERE ${dateCondition}
        GROUP BY p.category, p.name
    `;

    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ success: false, error: '數據庫查詢失敗' });

        let totalStoreRevenue = 0;   
        let totalXlbCount = 0;       

        const categoriesData = {
            '主食小吃': { list: [], total: 0 }, '點心包子': { list: [], total: 0 },
            '養生飲品': { list: [], total: 0 }, '養生饮品': { list: [], total: 0 },
            '傳統湯品': { list: [], total: 0 }
        };

        results.forEach(item => {
            const qty = Number(item.total_qty || 0);
            const revenue = Number(item.total_revenue || 0);
            const name = item.product_name || '';
            let cat = item.category || '';

            totalStoreRevenue += revenue;

            if (name.includes('湯') || name.includes('汤') || cat.includes('湯') || cat.includes('汤')) {
                cat = '傳統湯品';
            } else if (cat === '主食' || cat === '主食/小吃' || cat === '小吃') {
                cat = '主食小吃';
            } else if (cat === '中式點心/包子' || cat === '點心包子' || cat === '點心' || cat === '包子') {
                cat = '點心包子';
            }

            if (cat === '養生飲品' || cat === '養生饮品') {
                categoriesData['養生飲品'].total += revenue;
                categoriesData['養生饮品'].total += revenue;
            } else if (categoriesData[cat]) {
                categoriesData[cat].total += revenue;
            }

            if (name.includes('小籠包')) {
                if (name.includes('盤')) { totalXlbCount += (qty * 10); } else { totalXlbCount += qty; }
            }
        });

        const displayPlates = Math.floor(totalXlbCount / 10);
        const displayRemainder = totalXlbCount % 10;

        results.forEach(item => {
            const name = item.product_name || '';
            let cat = item.category || '';
            if (name.includes('湯') || name.includes('汤') || cat.includes('湯') || cat.includes('汤')) { cat = '傳統湯品'; }
            else if (cat === '主食' || cat === '主食/小吃' || cat === '小吃') { cat = '主食小吃'; }
            else if (cat === '中式點心/包子' || cat === '點心包子' || cat === '點心' || cat === '包子') { cat = '點心包子'; }
            
            const targets = (cat === '養生飲品' || cat === '養生饮品') ? ['養生飲品', '養生饮品'] : [cat];
            targets.forEach(targetKey => {
                if (!categoriesData[targetKey]) return;
                const lineTotal = categoriesData[targetKey].total;
                const itemRevenue = Number(item.total_revenue || 0);
                const lineShare = lineTotal > 0 ? ((itemRevenue / lineTotal) * 100).toFixed(1) : "0.0";

                let badge = null;
                if (parseFloat(lineShare) >= 40) badge = '🔥 主力爆款';
                else if (parseFloat(lineShare) <= 5) badge = '⚠️ 考慮調整';

                categoriesData[targetKey].list.push({
                    name: name, qty: Number(item.total_qty || 0), revenue: itemRevenue, lineShare: parseFloat(lineShare), badge: badge
                });
            });
        });

        const finalReport = {};
        Object.keys(categoriesData).forEach(cat => {
            const catTotal = categoriesData[cat].total;
            finalReport[cat] = {
                categoryRevenue: catTotal,
                storeShare: totalStoreRevenue > 0 ? parseFloat(((catTotal / totalStoreRevenue) * 100).toFixed(1)) : 0, 
                products: categoriesData[cat].list.sort((a, b) => b.revenue - a.revenue)
            };
        });

        res.json({
            success: true, 
            totalStoreRevenue: totalStoreRevenue, 
            xlbTotalCount: totalXlbCount, 
            xlbText: `（約等於 ${displayPlates} 盤 ${displayRemainder} 顆）`, 
            report: finalReport
        });
    });
});

// 【API 2】今日原始流水帳
app.get('/api/reports/today-raw-logs', (req, res) => {
    const sql = `
        SELECT d.id, p.name AS product_name, d.quantity_sold AS quantity, 
               CASE WHEN d.quantity_sold > 0 THEN ROUND(d.total_revenue / d.quantity_sold) ELSE p.price END AS price,
               d.total_revenue, d.created_at
        FROM daily_sales d
        JOIN products p ON d.product_id = p.id
        WHERE DATE(d.created_at) = CURDATE() AND d.status != 'VOID'
        ORDER BY d.created_at DESC
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 【API 3】一鍵作廢銷售紀錄 (連動成品補回庫存)
app.put('/api/sales/:id/void', (req, res) => {
    const { id } = req.params;
    db.query("SELECT product_id, quantity_sold FROM daily_sales WHERE id = ?", [id], (findErr, sales) => {
        if (findErr || sales.length === 0) return res.status(500).json({ success: false });
        const pId = sales[0].product_id;
        const qty = sales[0].quantity_sold;

        db.query("UPDATE daily_sales SET status = 'VOID' WHERE id = ?", [id], (err) => {
            if (err) return res.status(500).json({ success: false });
            const sqlRestoreStock = `
                UPDATE ingredients i
                JOIN recipes r ON i.id = r.ingredient_id
                SET i.stock_qty = i.stock_qty + (r.consume_qty * ?)
                WHERE r.product_id = ?
            `;
            db.query(sqlRestoreStock, [qty, pId], () => { res.json({ success: true }); });
        });
    });
});

app.get('/api/products', (req, res) => { db.query("SELECT id, name, price, category, unit FROM products", (err, r) => res.json(r)); });
app.put('/api/products/:id', (req, res) => { db.query("UPDATE products SET ? WHERE id = ?", [req.body, req.params.id], (err) => res.json({ success: true })); });

// 【API 7】前台結帳接收 ＋ 自動過濾連動扣除剩餘成品物料
app.post('/api/sales', (req, res) => {
    const customDate = req.body.sale_date || new Date();
    const items = req.body.items || [];
    if (items.length === 0) return res.status(400).json({ success: false, error: '前台品項數據為空！' });

    const validValues = [];
    items.forEach(item => {
        const pId = item.product_id || item.id;
        const qty = Number(item.quantity_sold || item.quantity || 0);
        const price = Number(item.price || 0);
        const revenue = Number(item.total_revenue || (qty * price));

        if (pId && qty > 0) {
            validValues.push([parseInt(pId), qty, revenue, customDate, 'ACTIVE', new Date()]);
        }
    });

    if (validValues.length === 0) return res.status(400).json({ success: false, error: '未檢測到有效銷售數量！' });

    const sqlInsert = `INSERT INTO daily_sales (product_id, quantity_sold, total_revenue, sale_date, status, created_at) VALUES ?`;

    db.query(sqlInsert, [validValues], (err, result) => {
        if (err) return res.status(500).json({ success: false, error: err.message });

        let updatedCount = 0;
        validValues.forEach(val => {
            const productId = val[0];
            const soldQty = val[1];

            const sqlDeductStock = `
                UPDATE ingredients i
                JOIN recipes r ON i.id = r.ingredient_id
                SET i.stock_qty = i.stock_qty - (r.consume_qty * ?)
                WHERE r.product_id = ?
            `;

            db.query(sqlDeductStock, [soldQty, productId], (stockErr) => {
                if (stockErr) console.error('❌ 庫存扣除失敗，商品ID:', productId, stockErr);
                updatedCount++;
                if (updatedCount === validValues.length) {
                    res.json({ success: true, message: '整單營收已同步，連動成品庫存已精準扣除！' });
                }
            });
        });
    });
});

app.use(express.static(path.join(__dirname, 'public')));

// =========================================================================
// [全新擴充通道] 獨立原物料庫存後台的靜態通道 (內建內外雙層自動通靈防護罩)
// =========================================================================
app.get('/inventory.html', (req, res) => {
    let targetPath = path.join(__dirname, 'public', 'inventory.html');
    if (!require('fs').existsSync(targetPath)) {
        targetPath = path.join(__dirname, 'inventory.html');
    }
    res.sendFile(targetPath);
});

app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`🚀 車庫小籠包 POS 2.0 終極穩定版大腦全新開機成功！`));
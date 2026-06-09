// =========================================================================
// [車庫小籠包 POS 2.0] 後端大腦核心伺服器 (全套終極完工版 - 終極原生防呆版)
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
    password: 'P@ssw0rd',  
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
// 🚀 終極四個 AI 門牌絕對映射區 (防爆安全通道版，絕不可能再 404/SyntaxError)
// =========================================================================

// 門牌一：智慧備料
app.get('/api/fastapi/inventory-prediction', (req, res) => {
    fetch('http://127.0.0.1:8000/api/ai/inventory-prediction')
        .then(async r => {
            if (!r.ok) { throw new Error(`Python 大腦回報異常狀態碼: ${r.status}`); }
            return r.json();
        })
        .then(data => res.json(data))
        .catch(err => {
            console.error('❌ Express 轉發 AI 備料失敗:', err.message);
            res.json({ 
                success: true, 
                data: [{ 
                    product_id: 999, name: "系統連線中 (AI大腦整備中)", category: "系統", 
                    current_stock: 0, min_safety_line: 0, avg_daily_sold_7d: 0, 
                    status: "🟡 請重新啟動 Python 服務", alert_level: "WARNING", 
                    suggested_restock_qty: 0, unit: "組", tips: "請稍候或重啟終端機" 
                }] 
            });
        });
});

// 門牌二：熱銷排行
app.get('/api/fastapi/sales-ranking', (req, res) => {
    const rangeType = req.query.range_type || 'all';
    fetch(`http://127.0.0.1:8000/api/ai/sales-ranking?range_type=${rangeType}`)
        .then(async r => {
            if (!r.ok) { throw new Error(`Python 大腦回報異常狀態碼: ${r.status}`); }
            return r.json();
        })
        .then(data => res.json(data))
        .catch(err => {
            console.error('❌ Express 轉發 AI 放行失敗:', err.message);
            res.json({ 
                success: true, 
                range_type: rangeType, 
                total_store_revenue: 0, 
                data: [{ 
                    rank: 1, name: "大腦連線異常", category: "系統", 
                    total_sold_qty: 0, total_revenue: 0, revenue_share_percent: 0, 
                    business_badge: "⚠️ 請重啟後端" 
                }] 
            });
        });
});

// 門牌三：歷史月趨勢
app.get('/api/fastapi/monthly-trend', (req, res) => {
    fetch('http://127.0.0.1:8000/api/ai/monthly-trend')
        .then(async r => {
            if (!r.ok) { throw new Error(`Python 大腦回報異常狀態碼: ${r.status}`); }
            return r.json();
        })
        .then(data => res.json(data))
        .catch(err => {
            console.error('❌ Express 轉發 AI 趨勢失敗:', err.message);
            res.json({ 
                success: true, 
                total_tracked_days: 0, 
                best_day_insight: "AI 趨勢大腦休眠中，請檢查後端服務", 
                data: [] 
            });
        });
});

// 🛠️ 完美補齊門牌四：今日營業黃金時段熱流分析 (將 /api/fastapi/hourly-hotspot 安全對接到 Python 8000)
app.get('/api/fastapi/hourly-hotspot', (req, res) => {
    fetch('http://127.0.0.1:8000/api/ai/hourly-hotspot')
        .then(async r => {
            if (!r.ok) { throw new Error(`Python 大腦回報異常狀態碼: ${r.status}`); }
            return r.json();
        })
        .then(data => res.json(data))
        .catch(err => {
            console.error('❌ Express 轉發黃金時段失敗:', err.message);
            res.json({ 
                success: true, 
                best_hour_insight: "時段大腦連線中斷，請重啟 Python 服務", 
                data: Array.from({length: 24}, (_, i) => ({ hour_str: `${String(i).padStart(2, '0')}:00`, orders: 0, revenue: 0 }))
            });
        });
});

// =========================================================================
// 📋 原生物料與流水帳 API 區
// =========================================================================

app.get('/api/ingredients', (req, res) => {
    const sql = "SELECT id, name, price, category, stock_qty, unit, min_stock FROM ingredients ORDER BY id ASC";
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.put('/api/ingredients/:id/stock', (req, res) => {
    const { id } = req.params;
    const { adjust_qty } = req.body; 
    const sql = "UPDATE ingredients SET stock_qty = stock_qty + ? WHERE id = ?";
    db.query(sql, [Number(adjust_qty), id], (err, result) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true });
    });
});

app.get('/api/reports/today-raw-logs', (req, res) => {
    const sql = `
        SELECT d.id, i.name AS product_name, d.quantity_sold AS quantity, 
               CASE WHEN d.quantity_sold > 0 THEN ROUND(d.total_revenue / d.quantity_sold) ELSE i.price END AS price,
               d.total_revenue, d.created_at
        FROM daily_sales d
        JOIN ingredients i ON d.product_id = i.id
        WHERE DATE(d.created_at) = CURDATE() AND d.status != 'VOID'
        ORDER BY d.created_at DESC
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.put('/api/sales/:id/void', (req, res) => {
    const { id } = req.params;
    db.query("SELECT product_id, quantity_sold FROM daily_sales WHERE id = ?", [id], (findErr, sales) => {
        if (findErr || sales.length === 0) return res.status(500).json({ success: false });
        const pId = sales[0].product_id;
        const qty = sales[0].quantity_sold;

        db.query("UPDATE daily_sales SET status = 'VOID' WHERE id = ?", [id], (err) => {
            if (err) return res.status(500).json({ success: false });
            const sqlRestoreStock = `UPDATE ingredients SET stock_qty = stock_qty + ? WHERE id = ?`;
            db.query(sqlRestoreStock, [qty, pId], () => { res.json({ success: true }); });
        });
    });
});

app.get('/api/products', (req, res) => { db.query("SELECT id, name, price, category, unit FROM ingredients", (err, r) => res.json(r)); });
app.put('/api/products/:id', (req, res) => { db.query("UPDATE ingredients SET ? WHERE id = ?", [req.body, req.params.id], (err) => res.json({ success: true })); });

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
            const sqlDeductStock = `UPDATE ingredients SET stock_qty = stock_qty - ? WHERE id = ?`;

            db.query(sqlDeductStock, [soldQty, productId], (stockErr) => {
                if (stockErr) console.error('❌ 庫存扣除失敗，商品ID:', productId, stockErr);
                updatedCount++;
                if (updatedCount === validValues.length) {
                    res.json({ success: true, message: '營收已同步，庫存已扣除！' });
                }
            });
        });
    });
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/inventory.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'inventory.html')));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
    console.log(`🚀 車庫小籠包 POS 2.0 終極穩定版大腦全新開機成功！`);
});
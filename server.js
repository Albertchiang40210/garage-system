// =========================================================================
// [車庫小籠包 POS 2.0] 後端大腦核心伺服器 (包含 Auth, KDS, DB Transaction, BOM)
// =========================================================================
const express = require('express');
const mysql = require('mysql2'); 
const path = require('path');
const crypto = require('crypto');
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const db = mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1', 
    user: 'root',          
    password: process.env.DB_PASSWORD || 'P@ssw0rd',  
    database: 'garage_xlb',
    port: 3306 
});

db.connect((err) => {
    if (err) {
        console.error('❌ MySQL 資料庫連線失敗:', err);
        return;
    }
    console.log('✅ 成功連線至 MySQL 資料庫: garage_xlb');
});

// =========================================================================
// 🔐 簡易 Auth 登入防護 (Phase 3)
// =========================================================================
const authTokens = new Map();

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.query("SELECT id, username, role FROM users WHERE username = ? AND password = ?", [username, password], (err, users) => {
        if (err || users.length === 0) return res.status(401).json({ success: false, error: "帳號或密碼錯誤" });
        const token = crypto.randomBytes(32).toString('hex');
        authTokens.set(token, users[0]);
        res.json({ success: true, token, role: users[0].role });
    });
});

function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: "請先登入 (Unauthorized)" });
    const token = authHeader.split(' ')[1];
    if (!authTokens.has(token)) return res.status(401).json({ error: "登入已過期 (Invalid token)" });
    req.user = authTokens.get(token);
    next();
}

// =========================================================================
// 🍳 廚房 KDS 專屬 API (Phase 3)
// =========================================================================
app.get('/api/kds/orders', (req, res) => {
    const query = `
        SELECT d.order_id, d.created_at, p.name as product_name, d.quantity_sold
        FROM daily_sales d
        JOIN products p ON d.product_id = p.id
        WHERE d.kitchen_status = 'PENDING' AND d.status != 'VOID'
        ORDER BY d.created_at ASC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        const ordersMap = {};
        results.forEach(r => {
            if (!ordersMap[r.order_id]) ordersMap[r.order_id] = { order_id: r.order_id, time: r.created_at, items: [] };
            ordersMap[r.order_id].items.push({ name: r.product_name, qty: r.quantity_sold });
        });
        res.json(Object.values(ordersMap));
    });
});

app.put('/api/kds/orders/:order_id/complete', (req, res) => {
    db.query("UPDATE daily_sales SET kitchen_status = 'COMPLETED' WHERE order_id = ?", [req.params.order_id], (err) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true });
    });
});

// =========================================================================
// 🚀 AI 數據分析 API 區 
// =========================================================================

app.get('/api/fastapi/inventory-prediction', (req, res) => {
    const query = `
        SELECT i.id, i.name, i.category, i.stock_qty, i.unit, i.min_stock,
               IFNULL(SUM(r.quantity * d.quantity_sold), 0) as total_sold
        FROM ingredients i
        LEFT JOIN recipes r ON r.ingredient_id = i.id
        LEFT JOIN daily_sales d ON d.product_id = r.product_id 
              AND d.status != 'VOID' 
              AND d.sale_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        GROUP BY i.id
        ORDER BY i.id ASC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        const prediction_report = results.map(ing => {
            const current_stock = Number(ing.stock_qty) || 0;
            const min_safety = Number(ing.min_stock) || 0;
            const total_7d_sold = Number(ing.total_sold) || 0;
            const avg_daily_sold = Math.round((total_7d_sold / 7.0) * 10) / 10;
            
            let status_tag = "🟢 庫存充沛";
            let alert_level = "LOW";
            let suggested_restock = 0;
            
            if (current_stock <= min_safety) {
                status_tag = "🚨 嚴重告急！請立刻補貨";
                alert_level = "CRITICAL";
                suggested_restock = Math.floor((min_safety - current_stock) + (avg_daily_sold * 1.5) + 10);
            } else if (current_stock <= (min_safety * 1.5)) {
                status_tag = "🟡 庫存偏低，建議微量準備";
                alert_level = "WARNING";
                suggested_restock = Math.floor((avg_daily_sold * 1.2) + 5);
            }
            
            if (suggested_restock > 0) suggested_restock = (Math.floor(suggested_restock / 5) + 1) * 5;
            
            return {
                product_id: ing.id, name: ing.name, category: ing.category,
                current_stock, min_safety_line: min_safety,
                avg_daily_sold_7d: avg_daily_sold, status: status_tag,
                alert_level, suggested_restock_qty: suggested_restock,
                unit: ing.unit || '個',
                tips: suggested_restock > 0 ? `建議補貨 ${suggested_restock} ${ing.unit || '個'}` : "目前庫存安全，不需備料"
            };
        });
        res.json({ success: true, data: prediction_report });
    });
});

app.get('/api/fastapi/sales-ranking', (req, res) => {
    const rangeType = req.query.range_type || 'all';
    let date_condition = "d.status != 'VOID'";
    if (rangeType === "today") {
        date_condition += " AND (DATE(d.created_at) = CURRENT_DATE() OR d.sale_date = CURRENT_DATE())";
    } else if (rangeType === "month") {
        date_condition += " AND YEAR(d.sale_date) = YEAR(CURRENT_DATE()) AND MONTH(d.sale_date) = MONTH(CURRENT_DATE())";
    }
    
    const query = `
        SELECT p.name, p.category, 
               SUM(IFNULL(d.quantity_sold, 0)) as total_qty, 
               SUM(IFNULL(d.total_revenue, 0)) as total_revenue
        FROM products p
        LEFT JOIN daily_sales d ON d.product_id = p.id AND ${date_condition}
        GROUP BY p.id, p.name, p.category
        HAVING total_qty > 0
        ORDER BY total_qty DESC
    `;
    
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message, data: [] });
        let total_store_revenue = results.reduce((acc, curr) => acc + Number(curr.total_revenue || 0), 0);
        const ranking_list = results.map((item, index) => {
            const revenue = Number(item.total_revenue || 0);
            const share = total_store_revenue > 0 ? (revenue / total_store_revenue * 100).toFixed(1) : 0;
            let badge = "👍 穩定長青";
            if (index === 0) badge = "👑 鎮店之寶・絕對冠軍";
            else if (index <= 2 && revenue > 0) badge = "🔥 超人氣爆款";
            return {
                rank: index + 1, name: item.name, category: item.category,
                total_sold_qty: Number(item.total_qty || 0), total_revenue: revenue,
                revenue_share_percent: Number(share), business_badge: badge
            };
        });
        res.json({ success: true, range_type: rangeType, total_store_revenue, data: ranking_list });
    });
});

app.get('/api/fastapi/monthly-trend', (req, res) => {
    const query = `
        SELECT DATE(sale_date) as date, SUM(quantity_sold) as day_qty, SUM(total_revenue) as day_revenue
        FROM daily_sales
        WHERE status != 'VOID' AND sale_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        GROUP BY DATE(sale_date)
        ORDER BY DATE(sale_date) ASC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        const weekdays_cn = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
        const trend_data = results.map(row => {
            const dt = new Date(row.date);
            const date_str = dt.toISOString().split('T')[0];
            return {
                date: date_str, weekday: weekdays_cn[dt.getDay()],
                total_items_sold: Number(row.day_qty || 0),
                total_revenue: Number(row.day_revenue || 0)
            };
        });
        let best_day_tips = "今日暫無足夠歷史數據進行分析";
        if (trend_data.length > 0) {
            const best_day = [...trend_data].sort((a, b) => b.total_revenue - a.total_revenue)[0];
            best_day_tips = `歷史黃金營業日為 ${best_day.date} (${best_day.weekday})，當天單日狂賣 $${best_day.total_revenue} 元！`;
        }
        res.json({ success: true, total_tracked_days: trend_data.length, best_day_insight: best_day_tips, data: trend_data });
    });
});

app.get('/api/fastapi/hourly-hotspot', (req, res) => {
    const query = `
        SELECT HOUR(created_at) as order_hour, 
               COUNT(id) as total_orders, 
               SUM(total_revenue) as hourly_revenue
        FROM daily_sales
        WHERE status != 'VOID' 
          AND (DATE(created_at) = CURRENT_DATE() OR sale_date = CURRENT_DATE())
        GROUP BY HOUR(created_at)
        ORDER BY order_hour ASC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        let hourly_data = {};
        for(let i=0; i<24; i++) {
            hourly_data[i] = { hour_str: `${String(i).padStart(2, '0')}:00`, orders: 0, revenue: 0 };
        }
        let has_data = false;
        results.forEach(row => {
            const h = row.order_hour;
            if (hourly_data[h]) {
                hourly_data[h].orders = Number(row.total_orders || 0);
                hourly_data[h].revenue = Number(row.hourly_revenue || 0);
                if (hourly_data[h].revenue > 0) has_data = true;
            }
        });
        const final_list = Object.values(hourly_data);
        let insight_tips = "✨ 開攤準備中！前台收到非作廢的有效訂單後，大腦將即時動態繪製客流時段。";
        if (has_data) {
            const active_hours = final_list.filter(i => i.revenue > 0);
            const best_hour_item = active_hours.sort((a, b) => b.revenue - a.revenue)[0];
            insight_tips = `🔥 今日黃金爆發期在 ${best_hour_item.hour_str} 區間，單小時狂捲 $${best_hour_item.revenue} 元！媽媽這段時間可以多蒸幾籠喔！`;
        }
        res.json({ success: true, best_hour_insight: insight_tips, data: final_list });
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

// 加上 requireAuth 防護
app.put('/api/ingredients/:id/stock', requireAuth, (req, res) => {
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
        SELECT d.id, p.name AS product_name, d.quantity_sold AS quantity, 
               CASE WHEN d.quantity_sold > 0 THEN ROUND(d.total_revenue / d.quantity_sold) ELSE p.price END AS price,
               d.total_revenue, d.created_at, d.order_id
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

// 加上 requireAuth 防護
app.put('/api/sales/:id/void', requireAuth, (req, res) => {
    const { id } = req.params;
    db.beginTransaction(err => {
        if (err) return res.status(500).json({ success: false, error: "Transaction start failed" });
        db.query("SELECT product_id, quantity_sold FROM daily_sales WHERE id = ? AND status != 'VOID' FOR UPDATE", [id], (findErr, sales) => {
            if (findErr || sales.length === 0) {
                return db.rollback(() => res.status(500).json({ success: false, error: "Sale not found or already voided" }));
            }
            const pId = sales[0].product_id;
            const qty = sales[0].quantity_sold;

            db.query("UPDATE daily_sales SET status = 'VOID' WHERE id = ?", [id], (err) => {
                if (err) return db.rollback(() => res.status(500).json({ success: false, error: "Update status failed" }));
                
                db.query("SELECT ingredient_id, quantity FROM recipes WHERE product_id = ?", [pId], (recErr, recipes) => {
                    if (recErr) return db.rollback(() => res.status(500).json({ success: false, error: "Fetch recipes failed" }));
                    
                    if (recipes.length === 0) {
                        return db.commit(err3 => {
                            if (err3) return db.rollback(() => res.status(500).json({ success: false, error: "Commit failed" }));
                            res.json({ success: true, warning: "No recipe found for this product." });
                        });
                    }

                    const restorePromises = recipes.map(recipe => {
                        return new Promise((resolve, reject) => {
                            const totalRestore = recipe.quantity * qty;
                            db.query("UPDATE ingredients SET stock_qty = stock_qty + ? WHERE id = ?", [totalRestore, recipe.ingredient_id], (updErr) => {
                                if (updErr) reject(updErr);
                                else resolve();
                            });
                        });
                    });

                    Promise.all(restorePromises)
                        .then(() => {
                            db.commit(err3 => {
                                if (err3) return db.rollback(() => res.status(500).json({ success: false, error: "Commit failed" }));
                                res.json({ success: true });
                            });
                        })
                        .catch(promiseErr => {
                            db.rollback(() => res.status(500).json({ success: false, error: "Restore stock failed: " + promiseErr.message }));
                        });
                });
            });
        });
    });
});

app.get('/api/products', (req, res) => { db.query("SELECT id, name, price, category FROM products", (err, r) => res.json(r)); });
app.put('/api/products/:id', requireAuth, (req, res) => { db.query("UPDATE products SET ? WHERE id = ?", [req.body, req.params.id], (err) => res.json({ success: true })); });

// 前台結帳不需登入，方便操作
app.post('/api/sales', (req, res) => {
    const customDate = req.body.sale_date || new Date();
    const items = req.body.items || [];
    if (items.length === 0) return res.status(400).json({ success: false, error: '前台品項數據為空！' });

    const orderId = '#' + Math.floor(Date.now() / 1000).toString().slice(-4);
    const validValues = [];
    const salesProducts = [];
    items.forEach(item => {
        const pId = item.product_id || item.id;
        const qty = Number(item.quantity_sold || item.quantity || 0);
        const price = Number(item.price || 0);
        const revenue = Number(item.total_revenue || (qty * price));
        if (pId && qty > 0) {
            // 加入 order_id 與 kitchen_status = 'PENDING'
            validValues.push([parseInt(pId), qty, revenue, customDate, 'ACTIVE', new Date(), orderId, 'PENDING']);
            salesProducts.push({ id: parseInt(pId), qty });
        }
    });

    if (validValues.length === 0) return res.status(400).json({ success: false, error: '未檢測到有效銷售數量！' });

    db.beginTransaction(err => {
        if (err) return res.status(500).json({ success: false, error: "Transaction start failed" });
        const sqlInsert = `INSERT INTO daily_sales (product_id, quantity_sold, total_revenue, sale_date, status, created_at, order_id, kitchen_status) VALUES ?`;
        db.query(sqlInsert, [validValues], (err, result) => {
            if (err) return db.rollback(() => res.status(500).json({ success: false, error: err.message }));
            
            const productIds = salesProducts.map(p => p.id);
            db.query("SELECT product_id, ingredient_id, quantity FROM recipes WHERE product_id IN (?)", [productIds], (recErr, recipes) => {
                if (recErr) return db.rollback(() => res.status(500).json({ success: false, error: "Fetch recipes failed" }));
                
                const ingredientDeductions = {};
                salesProducts.forEach(sale => {
                    const productRecipes = recipes.filter(r => r.product_id === sale.id);
                    productRecipes.forEach(pr => {
                        if (!ingredientDeductions[pr.ingredient_id]) ingredientDeductions[pr.ingredient_id] = 0;
                        ingredientDeductions[pr.ingredient_id] += pr.quantity * sale.qty;
                    });
                });

                const updatePromises = Object.entries(ingredientDeductions).map(([ingId, totalDeduct]) => {
                    return new Promise((resolve, reject) => {
                        db.query(`UPDATE ingredients SET stock_qty = stock_qty - ? WHERE id = ?`, [totalDeduct, ingId], (updErr) => {
                            if (updErr) reject(updErr);
                            else resolve();
                        });
                    });
                });

                Promise.all(updatePromises)
                    .then(() => {
                        db.commit(commitErr => {
                            if (commitErr) return db.rollback(() => res.status(500).json({ success: false, error: "Commit failed" }));
                            res.json({ success: true, message: '營收已同步，配方物料已扣除！', order_id: orderId });
                        });
                    })
                    .catch(promiseErr => {
                        db.rollback(() => res.status(500).json({ success: false, error: "Stock deduction failed: " + promiseErr.message }));
                    });
            });
        });
    });
});

// =========================================================================
// 📂 靜態檔案路徑映射區
// =========================================================================
app.use(express.static(path.join(__dirname, 'public')));

app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/kds.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'kds.html')));
app.get('/inventory.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'inventory.html')));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
    console.log(`🚀 車庫小籠包 POS 2.0 啟動成功！監聽 Port: ${PORT}`);
});
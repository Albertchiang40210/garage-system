from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, date
import mysql.connector

app = FastAPI(
    title="🥟 車庫小籠包 AI 營收 analysis 大腦 3.0",
    description="專為媽媽打造的 Python 微服務終極核心",
    version="3.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],  
    allow_headers=["*"],  
)

def get_db_connection():
    return mysql.connector.connect(
        host="localhost",
        user="root",
        password="P@ssw0rd",  
        database="garage_xlb",
        charset="utf8mb4"
    )

@app.get("/")
def read_root():
    return {"status": "Online", "message": "🥟 智慧大腦執行中！"}

@app.get("/api/ai/inventory-prediction")
def get_inventory_prediction():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id, name, category, stock_qty, unit, min_stock FROM ingredients ORDER BY id ASC")
        ingredients = cursor.fetchall()
        
        # 🛡️ 終極修正一：改用更標準安全的 DATE_SUB 語法，防止部分 MySQL 日期解析錯誤
        # 🛡️ 同時加上 IFNULL 防護，確保就算完全沒有資料也不會回傳空值
        cursor.execute("""
            SELECT product_id, SUM(IFNULL(quantity_sold, 0)) as total_sold
            FROM daily_sales 
            WHERE status != 'VOID' AND sale_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            GROUP BY product_id
        """)
        
        # 🛡️ 終極修正二：加上 int(row['total_sold'] or 0)，萬一資料庫吐出 None 也絕對不會崩潰
        recent_sales = {}
        for row in cursor.fetchall():
            if row['product_id'] is not None:
                recent_sales[row['product_id']] = int(row['total_sold'] or 0)
                
        cursor.close()
        conn.close()
        
        prediction_report = []
        for ing in ingredients:
            ing_id = ing['id']
            name = ing['name']
            current_stock = int(ing['stock_qty'] or 0)
            min_safety = int(ing['min_stock'] or 0)
            unit = ing['unit'] if ing['unit'] else '個'
            
            total_7d_sold = int(recent_sales.get(ing_id, 0))
            avg_daily_sold = round(total_7d_sold / 7.0, 1)
            
            suggested_restock = 0
            status_tag = "🟢 庫存充沛"
            alert_level = "LOW"
            
            if current_stock <= min_safety:
                status_tag = "🚨 嚴重告急！請立刻補貨"
                alert_level = "CRITICAL"
                suggested_restock = int((min_safety - current_stock) + (avg_daily_sold * 1.5) + 10)
            elif current_stock <= (min_safety * 1.5):
                status_tag = "🟡 庫存偏低，建議微量準備"
                alert_level = "WARNING"
                suggested_restock = int((avg_daily_sold * 1.2) + 5)
            
            if suggested_restock > 0:
                suggested_restock = ((suggested_restock // 5) + 1) * 5
                
            prediction_report.append({
                "product_id": ing_id, "name": name, "category": ing['category'],
                "current_stock": current_stock, "min_safety_line": min_safety,
                "avg_daily_sold_7d": avg_daily_sold, "status": status_tag,
                "alert_level": alert_level, "suggested_restock_qty": suggested_restock,
                "unit": unit, "tips": f"建議補貨 {suggested_restock} {unit}" if suggested_restock > 0 else "目前庫存安全，不需備料"
            })
        return {"success": True, "data": prediction_report}
    except Exception as e:
        # 🛡️ 終極防線：即使後端資料庫真的出現非預期錯誤，也回傳乾淨的 JSON，防止前端轉圈死鎖
        return {"success": False, "error": f"Python 內部備料計算失敗: {str(e)}"}

@app.get("/api/ai/sales-ranking")
def get_sales_ranking(range_type: str = Query("all")):
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        date_condition = "d.status != 'VOID'"
        if range_type == "today":
            date_condition += " AND DATE(d.sale_date) = CURDATE()"
        elif range_type == "month":
            date_condition += " AND YEAR(d.sale_date) = YEAR(CURDATE()) AND MONTH(d.sale_date) = MONTH(CURDATE())"
            
        query = f"""
            SELECT i.name, i.category, SUM(d.quantity_sold) as total_qty, SUM(d.total_revenue) as total_revenue
            FROM daily_sales d
            JOIN ingredients i ON d.product_id = i.id
            WHERE {date_condition}
            GROUP BY i.id
            ORDER BY total_qty DESC
        """
        cursor.execute(query)
        results = cursor.fetchall()
        cursor.close()
        conn.close()
        
        ranking_list = []
        total_store_revenue = sum(int(item['total_revenue'] or 0) for item in results)
        
        for index, item in enumerate(results, start=1):
            revenue = int(item['total_revenue'] or 0)
            share = round((revenue / total_store_revenue * 100), 1) if total_store_revenue > 0 else 0
            badge = "👍 穩定長青"
            if index == 1: badge = "👑 鎮店之寶・絕對冠軍"
            elif index <= 3 and revenue > 0: badge = "🔥 超人氣爆款"
                
            ranking_list.append({
                "rank": index, "name": item['name'], "category": item['category'],
                "total_sold_qty": int(item['total_qty'] or 0), "total_revenue": revenue,
                "revenue_share_percent": share, "business_badge": badge
            })
        return {"success": True, "range_type": range_type, "total_store_revenue": total_store_revenue, "data": ranking_list}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/api/ai/monthly-trend")
def get_monthly_trend():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        query = """
            SELECT sale_date, SUM(quantity_sold) as day_qty, SUM(total_revenue) as day_revenue
            FROM daily_sales
            WHERE status != 'VOID' AND sale_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            GROUP BY sale_date
            ORDER BY sale_date ASC
        """
        cursor.execute(query)
        results = cursor.fetchall()
        cursor.close()
        conn.close()
        
        trend_data = []
        weekdays_cn = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]
        
        for row in results:
            dt = row['sale_date']
            
            # 🛡️ 核心安全防護：如果 MySQL 回傳字串格式，自動轉換為 Date 物件以供計算星期
            if isinstance(dt, str):
                try:
                    dt = datetime.strptime(dt, "%Y-%m-%d").date()
                except:
                    pass
            
            # 確保不管是 datetime 還是 date 都能正常調用 strftime 與 weekday
            if isinstance(dt, (datetime, date)):
                date_str = dt.strftime("%Y-%m-%d")
                weekday_str = weekdays_cn[dt.weekday()]
            else:
                date_str = str(dt)
                weekday_str = "未定"
                
            trend_data.append({
                "date": date_str, "weekday": weekday_str,
                "total_items_sold": int(row['day_qty'] or 0), "total_revenue": int(row['day_revenue'] or 0)
            })
            
        best_day_tips = "今日暫無足夠歷史數據進行分析"
        if trend_data:
            sorted_by_rev = sorted(trend_data, key=lambda x: x['total_revenue'], reverse=True)
            best_day = sorted_by_rev[0]
            best_day_tips = f"歷史黃金營業日為 {best_day['date']} ({best_day['weekday']})，當天單日狂賣 ${best_day['total_revenue']} 元！"
            
        return {"success": True, "total_tracked_days": len(trend_data), "best_day_insight": best_day_tips, "data": trend_data}
    except Exception as e:
        return {"success": False, "error": str(e)}
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
        
        cursor.execute("""
            SELECT product_id, SUM(IFNULL(quantity_sold, 0)) as total_sold
            FROM daily_sales 
            WHERE status != 'VOID' AND sale_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            GROUP BY product_id
        """)
        
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
            
            # 🛡️ 這裡已經修正！拔除手滑的 @ 符號
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
        return {"success": False, "error": f"Python 內部備料計算失敗: {str(e)}"}

@app.get("/api/ai/sales-ranking")
def get_sales_ranking(range_type: str = Query("all")):
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        date_condition = "d.status != 'VOID'"
        if range_type == "today":
            date_condition += " AND (DATE(d.created_at) = CURRENT_DATE() OR d.sale_date = CURRENT_DATE())"
        elif range_type == "month":
            date_condition += " AND YEAR(d.sale_date) = YEAR(CURRENT_DATE()) AND MONTH(d.sale_date) = MONTH(CURRENT_DATE())"
            
        query = f"""
            SELECT 
                i.name, 
                i.category, 
                SUM(IFNULL(d.quantity_sold, 0)) as total_qty, 
                SUM(IFNULL(d.total_revenue, 0)) as total_revenue
            FROM ingredients i
            LEFT JOIN daily_sales d ON d.product_id = i.id AND {date_condition}
            GROUP BY i.id, i.name, i.category
            HAVING total_qty > 0
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
        return {"success": False, "error": str(e), "data": []}

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
            
            if isinstance(dt, str):
                try:
                    dt = datetime.strptime(dt, "%Y-%m-%d").date()
                except:
                    pass
            
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

@app.get("/api/ai/hourly-hotspot")
def get_hourly_hotspot():
    try:
        conn = get_db_connection()
        cursor = conn.connector.cursor(dictionary=True) if hasattr(conn, 'connector') else conn.cursor(dictionary=True)
        
        query = """
            SELECT 
                HOUR(created_at) as order_hour, 
                COUNT(id) as total_orders, 
                SUM(total_revenue) as hourly_revenue
            FROM daily_sales
            WHERE status != 'VOID' 
              AND (DATE(created_at) = CURRENT_DATE() OR sale_date = CURRENT_DATE())
            GROUP BY HOUR(created_at)
            ORDER BY order_hour ASC
        """
        cursor.execute(query)
        results = cursor.fetchall()
        cursor.close()
        conn.close()
        
        hourly_data = {h: {"hour_str": f"{h:02d}:00", "orders": 0, "revenue": 0} for h in range(24)}
        
        has_data = False
        for row in results:
            h = row['order_hour']
            if h in hourly_data:
                hourly_data[h]["orders"] = int(row['total_orders'] or 0)
                hourly_data[h]["revenue"] = int(row['hourly_revenue'] or 0)
                if hourly_data[h]["revenue"] > 0:
                    has_data = True
                
        final_list = list(hourly_data.values())
        
        if has_data:
            active_hours = [item for item in final_list if item["revenue"] > 0]
            best_hour_item = max(active_hours, key=lambda x: x["revenue"])
            insight_tips = f"🔥 今日黃金爆發期在 {best_hour_item['hour_str']} 區間，單小時狂捲 ${best_hour_item['revenue']} 元！媽媽這段時間可以多蒸幾籠喔！"
        else:
            insight_tips = "✨ 開攤準備中！前台收到非作廢的有效訂單後，大腦將即時動態繪製客流時段。"
            
        return {"success": True, "best_hour_insight": insight_tips, "data": final_list}
    except Exception as e:
        return {"success": False, "error": f"時段分析失敗: {str(e)}"}
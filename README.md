# 🥟 小籠包 POS 2.0 後端大腦核心伺服器 (Garage Dimsum POS 2.0 Backend Core)

本專案是一套專為餐飲門市量身打造的進階 **POS 2.0 後端營運管理系統**。核心基於 **Node.js (Express) 架構** 整合 **MySQL 關聯式資料庫**，專注於解決餐飲零售業最核心的「前台即時結帳」、「庫存自動連動扣減」以及「多維度營業數據雷達分析」等真實商業痛點。

經歷了全面的優化與重構，系統已升級至最終極的 **企業級安全與配方引擎版本**。

---

## 🛠️ 核心系統功能 (Core Features)

### 1. 真實配方物料管理引擎 (True BOM System)
* **前台商品與後台庫存分離**：建立獨立的 `products` (前台商品) 與 `ingredients` (實體物料) 資料表。
* **動態配方展開扣料 (`/api/sales`)**：導入 `recipes` 配方表。當前台賣出「一籠小籠包」時，伺服器會自動展開配方，精準扣除對應的「150g 麵粉 + 100g 豬肉」。
* **反向交易防呆補回 (`/api/sales/:id/void`)**：當門市觸發「一鍵作廢銷售紀錄」時，系統反向展開配方，將消耗的物料一克不少地補回庫存。
* **資料庫交易安全 (Database Transactions)**：全面導入 `BEGIN`, `COMMIT`, `ROLLBACK`，確保營收紀錄與庫存扣除的資料強一致性，徹底解決連線中斷導致的帳務異常。

### 2. 廚房即時出餐系統 (Kitchen Display System - KDS)
* **即時連線看板 (`/kds.html`)**：前台一點餐，後廚即時顯示大字體深色模式的訂單卡片。
* **狀態與超時警示**：系統按訂單 `order_id` 分組。具有等候時間追蹤，超過 5 分鐘顯示橘燈警告，超過 15 分鐘顯示紅燈超時警報。
* **一鍵出餐消單**：廚房一鍵標記出餐，確保不漏單。

### 3. 員工登入與安全防護 (Auth & Roles)
* **JWT Token 登入防護 (`/api/login`)**：導入基於記憶體的 JWT 簡易認證機制，保護敏感路由。
* **權限隔離**：前台點餐系統免登入即可快速操作；後台「庫存中控台」與「營運報表大腦」必須透過 `/login.html` 登入驗證後才能訪問。

### 4. 進階營業數據雷達分析 (Advanced Sales & Product Analytics)
* **單一 Node.js 大腦整合**：原先的 Python/FastAPI AI 分析邏輯已 100% 完美移植合併至 Node.js 核心中，實現單一伺服器高效運行。
* **多維度時間動態過濾**：支援日報表、月報表及年報表的動態切換，自動繪製黃金營業時段與客流熱點。

---

## 💻 技術棧 (Tech Stack)

* **後端核心：** Node.js / Express 框架 (RESTful API 設計、JWT Auth、BOM 邏輯)
* **資料庫管理：** MySQL (使用 `mysql2` 驅動，實作 Transaction 交易安全與聚合查詢)
* **前端架構：** Vanilla JS + TailwindCSS (純前端渲染，無須建置)
* **部署：** Docker & docker-compose (附帶遷移腳本 `migrate.js`)

---

## 📡 RESTful API 規格說明 (API Endpoints)

| 請求方法 | 路由 (Route) | 功能說明 | 核心實作技術 |
| :--- | :--- | :--- | :--- |
| **POST** | `/api/login` | 員工登入獲取 Token | JWT & `users` 驗證 |
| **POST** | `/api/sales` | 前台結帳 | BOM 配方展開 + Transaction 批次扣料 |
| **PUT** | `/api/sales/:id/void` | 作廢銷售紀錄 (需 Auth) | 配方反推補回 + Transaction 交易防呆 |
| **GET** | `/api/kds/orders` | 獲取待出餐訂單 | 分組 `order_id` 查詢 |
| **PUT** | `/api/kds/orders/:order_id/complete`| 標記訂單完成 | 更新 `kitchen_status` 狀態 |
| **PUT** | `/api/ingredients/:id/stock`| 手動調整庫存 (需 Auth) | 原子化庫存更新 |
| **GET** | `/api/fastapi/sales-ranking`| 熱銷排行分析 | 多表聚合、營收比重動態計算 |
| **GET** | `/api/fastapi/hourly-hotspot`| 營業黃金時段分析 | 時間聚合與動態客流分析 |

---

## 🚀 專案啟動方式 (How to Run)

1. 確保已安裝 Node.js 與 MySQL。
2. 啟動資料庫並確保設定正確 (預設 `root` / `P@ssw0rd`)。
3. 執行資料庫遷移升級腳本以建立最新表結構：`node migrate.js` 及 `node migrate_p3.js`。
4. 啟動伺服器：`node server.js`。
5. 開啟瀏覽器訪問 `http://localhost:3000`。

---

## ⚠️ 安全與版本控制規範 (Disclaimer)
* 本公開倉庫已完整抽離所有真實生產環境之資料庫敏感憑證與密碼。
* 正式上線時，登入憑證與 JWT 密鑰請務必使用 `process.env` 管理並妥善加密。

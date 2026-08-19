FROM python:3.10-slim

WORKDIR /app

# 安裝 OpenCV 與系統影像處理必備依賴 (保留你的好習慣)
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libxcb1 \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

# 複製依賴並安裝
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 複製專案其餘檔案
COPY . .

# 宣告容器對外 Port
EXPOSE 8000

# 加上 --reload 參數，讓開發時修改程式碼能即時生效
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
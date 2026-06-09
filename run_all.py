import subprocess
import time
import sys
import signal
import webbrowser

print("🚀 [車庫小籠包] Python 強制直連控制器啟動中...")

processes = []

def kill_child_processes():
    print("\n🛑 偵測到關閉訊號，正在安全關閉所有背景服務...")
    for p in processes:
        try:
            p.terminate() 
            p.wait(timeout=2)
        except Exception:
            p.kill() 
    print("✨ 所有背景服務已乾淨關閉！收攤囉，媽媽辛苦了！")

def signal_handler(sig, frame):
    kill_child_processes()
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler)

try:
    # 1. 啟動 Express 後端 (Port 3000)
    print("📡 1. 正在叫醒 Node.js Express 身體 (Port 3000)...")
    node_process = subprocess.Popen(
        ["node", "server.js"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    processes.append(node_process)
    time.sleep(1.5) 

    # 2. 啟動 FastAPI AI 大腦 (Port 8000)
    print("🧠 2. 正在叫醒 Python FastAPI 大腦 (Port 8000)...")
    fastapi_process = subprocess.Popen(
        ["uvicorn", "main:app", "--reload", "--port", "8000"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    processes.append(fastapi_process)
    time.sleep(1.5)

    # 3. 啟動 ngrok 強制直連 3000
    print("🌐 3. 正在打通 ngrok 全球單一安全通道，強制指向 Port 3000...")
    ngrok_process = subprocess.Popen(
        ["ngrok", "http", "--domain=plant-budding-coastline.ngrok-free.dev", "3000"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    processes.append(ngrok_process)
    
    print("⏳ 正在等待雙後端完全通電與網域安全綁定 (5 秒)...")
    time.sleep(5.0) 

    # 💻 全自動開啟點餐網頁
    target_url = "https://plant-budding-coastline.ngrok-free.dev"
    print(f"🌍 4. 正在自動開啟瀏覽器前往點餐檯: {target_url}")
    webbrowser.open(target_url)

    print("\n🎉【超級完全體・全線通車】核心已全數到位！")
    print("💡 (提示：欲關閉系統，直接在這個視窗按下鍵盤 Ctrl + C 即可！)\n" + "—"*60)

    # 智慧日誌監控
    import selectors
    sel = selectors.DefaultSelector()
    node_process.stdout.name_tag = " [Node.js] "
    fastapi_process.stdout.name_tag = " [FastAPI] "
    
    sel.register(node_process.stdout, selectors.EVENT_READ)
    sel.register(fastapi_process.stdout, selectors.EVENT_READ)

    while True:
        events = sel.select()
        for key, mask in events:
            line = key.fileobj.readline()
            if line:
                if any(k in line for k in ["成功", "開機", "Uvicorn", "ERROR", "❌", "✅", "GET", "POST"]):
                    print(f"{key.fileobj.name_tag}{line.strip()}")

except Exception as e:
    print(f"❌ 啟動過程中發生錯誤: {e}")
    kill_child_processes()
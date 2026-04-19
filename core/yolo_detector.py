import os
from ultralytics import YOLO

# 1. 定义基于当前文件的绝对路径，防止路径错误
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, 'models', 'yolov8n.pt')
IMAGE_PATH = os.path.join(BASE_DIR, 'data', 'uploads', 'fox.jpg')
RESULTS_DIR = os.path.join(BASE_DIR, 'data', 'results')

# 2. 加载模型 (指向 models 文件夹)
model = YOLO(MODEL_PATH)

# 3. 对图片进行识别
# project 和 name 参数可以控制 YOLO 将结果保存到你指定的 results 文件夹，而不是默认的 runs/detect
results = model.predict(
    source=IMAGE_PATH,
    save=True,
    conf=0.5,
    project=RESULTS_DIR,
    name='predict_runs'
)

# 4. 打印结果
for r in results:
    print(r.boxes.cls) # 输出识别到的类别 ID
import os
import base64
import numpy as np
import cv2
from flask import Flask, request, jsonify
from flask_cors import CORS
from ultralytics import YOLO

app = Flask(__name__)
# 允许跨域请求，这样你的前端 (比如 Live Server 在 5500 端口) 才能访问 5000 端口的 API
CORS(app)

# 1. 预加载 YOLO 模型 (全局加载，避免每次请求都重新加载)
# 假设你的模型放在项目根目录或 models 文件夹下
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, 'yolov8n.pt')  # 根据你的实际路径调整
model = YOLO(MODEL_PATH)

@app.route('/', methods=['GET'])
def index():
    return "hello world"

@app.route('/api/identify', methods=['POST'])
def identify_animal():
    try:
        # 1. 获取前端发来的 JSON 数据
        data = request.json
        image_data = data.get('image')
        location = data.get('location')  # 例如: {'lat': 34.0, 'lng': -118.0}

        if not image_data:
            return jsonify({'error': 'No image provided'}), 400

        # 2. 将前端传来的 Base64 字符串解码为 OpenCV 图像格式
        # 前端传来的格式通常是: "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
        encoded_data = image_data.split(',')[1]
        nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        # 3. 使用 YOLO 进行预测
        results = model.predict(source=img, conf=0.5, save=False)

        # 4. 解析结果
        identified_name = "Unknown"
        description = "We couldn't identify any animal in this picture."

        # 检查是否检测到了物体
        if len(results) > 0 and len(results[0].boxes) > 0:
            # 获取置信度最高的第一个结果
            box = results[0].boxes[0]
            class_id = int(box.cls[0])
            confidence = float(box.conf[0])

            # 获取类别名称 (YOLOv8 默认 COCO 数据集包含 dog, cat, bird, bear 等)
            identified_name = model.names[class_id].capitalize()
            description = f"Identified with {confidence * 100:.1f}% confidence."

        # 5. 返回结果给前端
        return jsonify({
            'name': identified_name,
            'description': description
        })

    except Exception as e:
        print(f"Error during processing: {e}")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    # 启动 Flask 服务，默认在 http://127.0.0.1:5000
    app.run(debug=True, port=5000)
import os
import base64
import numpy as np
import cv2
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from ultralytics import YOLO

# 1. Initialize Flask
# Explicitly specify static and templates folders to ensure frontend files are loaded correctly after deployment
app = Flask(__name__,
            static_folder='static',
            template_folder='templates')

# Allow cross-origin requests
CORS(app)

# 2. Path and Model Loading
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# It's recommended to place the weight file in the project root or models/ folder
# If you placed it in the models folder, please change it to os.path.join(BASE_DIR, 'models', 'yolov8n.pt')
MODEL_PATH = os.path.join(BASE_DIR, 'yolov8n.pt')

# Pre-load YOLO model
# Load once globally to avoid repeated memory consumption for each API request
model = YOLO(MODEL_PATH)


@app.route('/', methods=['GET'])
def index():
    """Render homepage"""
    return render_template('index.html')


@app.route('/api/identify', methods=['POST'])
def identify_animal():
    """Receive image and identify using YOLO"""
    try:
        # Get JSON data sent from frontend
        data = request.json
        image_data = data.get('image')
        # location = data.get('location') # Reserve for location information processing

        if not image_data:
            return jsonify({'error': 'No image data received'}), 400

        # Decode Base64 image
        # Format is usually "data:image/jpeg;base64,..."
        try:
            encoded_data = image_data.split(',')[1]
            nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        except Exception as decode_err:
            return jsonify({'error': f'Image decoding failed: {str(decode_err)}'}), 400

        # Perform prediction using YOLO
        # conf=0.5 means confidence threshold, save=False means do not save predicted image files to save space
        results = model.predict(source=img, conf=0.5, save=False)

        # Parse results
        identified_name = "Unknown"
        description = "Sorry, we were unable to recognize the animal in this photo."

        if len(results) > 0 and len(results[0].boxes) > 0:
            # Get the first result with highest confidence
            box = results[0].boxes[0]
            class_id = int(box.cls[0])
            confidence = float(box.conf[0])

            # Get class name
            identified_name = model.names[class_id].capitalize()
            description = f"Recognition successful! The animal is likely {identified_name}, with a confidence of {confidence * 100:.1f}%."

        return jsonify({
            'name': identified_name,
            'description': description
        })

    except Exception as e:
        print(f"Error processing request: {e}")
        return jsonify({'error': 'Internal server error'}), 500


if __name__ == '__main__':
    # Local development: run on localhost:5000
    # For local testing, use host='127.0.0.1' or 'localhost'
    # Note: If you need to access from other machines, change to host='0.0.0.0'
    app.run(host='127.0.0.1', port=5000, debug=True)
import os
from ultralytics import YOLO

# 1. Define absolute path based on current file to prevent path errors
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, 'models', 'yolov8n.pt')
IMAGE_PATH = os.path.join(BASE_DIR, 'data', 'uploads', 'fox.jpg')
RESULTS_DIR = os.path.join(BASE_DIR, 'data', 'results')

# 2. Load model (pointing to models folder)
model = YOLO(MODEL_PATH)

# 3. Identify image
# project and name parameters allow YOLO to save results to your specified results folder instead of the default runs/detect
results = model.predict(
    source=IMAGE_PATH,
    save=True,
    conf=0.5,
    project=RESULTS_DIR,
    name='predict_runs'
)

# 4. Print results
for r in results:
    print(r.boxes.cls) # Output the recognized class ID
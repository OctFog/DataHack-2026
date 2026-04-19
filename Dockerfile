# 1. Use official Python image as base
FROM python:3.9-slim

# 2. Install system dependencies (OpenCV required libraries)
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# 3. Set working directory
WORKDIR /app

# 4. Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 5. Copy all your code
COPY . .

# 6. Expose port 5000 for local development
EXPOSE 5000

# 7. Run Flask application locally on port 5000
CMD ["python", "app.py"]
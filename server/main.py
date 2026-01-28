import threading
import time
import random
from datetime import datetime
import sqlite3
import csv
import os

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import webview

import cv2
from PIL import Image
import numpy as np



# =============================
# Paths
# =============================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CLIENT_DIR = os.path.join(BASE_DIR, "..", "client")
DB_PATH = os.path.join(BASE_DIR, "predictions.db")
CSV_PATH = os.path.join(BASE_DIR, "predictions.csv")

app = Flask(__name__)
CORS(app)

PORT = 3001


# =============================
# SQLite DB Setup
# =============================
def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS predictions (
            id INTEGER PRIMARY KEY,
            timestamp TEXT,
            eventName TEXT,
            location TEXT,
            crowdCount INTEGER,
            eventType TEXT,
            timeSlot TEXT,
            density TEXT,
            risk TEXT,
            recommendation TEXT,
            chartData TEXT
        )
    """)
    conn.commit()
    conn.close()


init_db()


# =============================
# CSV Setup
# =============================
def init_csv():
    if not os.path.exists(CSV_PATH):
        with open(CSV_PATH, mode="w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([
                "id", "timestamp", "eventName", "location", "crowdCount",
                "eventType", "timeSlot", "density", "risk", "recommendation"
            ])


init_csv()


def save_to_csv(pred):
    with open(CSV_PATH, mode="a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            pred["id"], pred["timestamp"], pred["eventName"], pred["location"],
            pred["crowdCount"], pred["eventType"], pred["timeSlot"],
            pred["density"], pred["risk"], pred["recommendation"]
        ])


def save_to_db(pred):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO predictions (
            id, timestamp, eventName, location, crowdCount,
            eventType, timeSlot, density, risk, recommendation, chartData
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        pred["id"], pred["timestamp"], pred["eventName"], pred["location"],
        pred["crowdCount"], pred["eventType"], pred["timeSlot"],
        pred["density"], pred["risk"], pred["recommendation"],
        str(pred["chartData"])
    ))
    conn.commit()
    conn.close()


# =============================
# Serve Frontend
# =============================
@app.route("/")
def serve_index():
    return send_from_directory(CLIENT_DIR, "index.html")


@app.route("/<path:path>")
def serve_static_files(path):
    return send_from_directory(CLIENT_DIR, path)


# =============================
# Prediction API
# =============================
@app.route("/predict", methods=["POST"])
def predict():
    try:
        data = request.json

        eventName = data.get("eventName")
        location = data.get("location")
        crowdCount = data.get("crowdCount")
        eventType = data.get("eventType")
        timeSlot = data.get("timeSlot")

        if not all([eventName, location, crowdCount, eventType, timeSlot]):
            return jsonify({"error": "All fields are required"}), 400

        count = int(crowdCount)

        # Density logic
        if count < 200:
            density = "Low"
        elif 200 <= count <= 500:
            density = "Medium"
        else:
            density = "High"

        # Risk logic
        if density == "High" and timeSlot in ["Evening", "Night"]:
            risk = "Dangerous"
            recommendation = "URGENT: Deploy additional security staff immediately."
        elif density == "High":
            risk = "Warning"
            recommendation = "Deploy additional security personnel."
        elif density == "Medium" and eventType == "Festival":
            risk = "Warning"
            recommendation = "Ensure adequate security presence."
        elif density == "Medium" and eventType == "Political":
            risk = "Warning"
            recommendation = "Increase security measures."
        elif density == "Medium":
            risk = "Safe"
            recommendation = "Crowd density is manageable."
        else:
            risk = "Safe"
            recommendation = "Crowd is under control."

        crowdTrend = generate_crowd_trend(count, timeSlot)

        chartData = {
            "labels": ["Current", "+30min", "+1hr", "+1.5hr", "+2hr"],
            "data": crowdTrend
        }

        prediction = {
            "id": int(time.time() * 1000),
            "timestamp": datetime.utcnow().isoformat(),
            "eventName": eventName,
            "location": location,
            "crowdCount": count,
            "eventType": eventType,
            "timeSlot": timeSlot,
            "density": density,
            "risk": risk,
            "recommendation": recommendation,
            "chartData": chartData
        }

        # Save to SQLite + CSV
        save_to_db(prediction)
        save_to_csv(prediction)

        return jsonify(prediction)

    except Exception as e:
        print("Prediction error:", e)
        return jsonify({"error": "Internal server error"}), 500
    

@app.route("/predict-image", methods=["POST"])
def predict_from_image():
    try:
        if "image" not in request.files:
            return jsonify({"error": "No image uploaded"}), 400

        file = request.files["image"]

        # Convert image to OpenCV
        image = Image.open(file.stream).convert("RGB")
        img_np = np.array(image)
        img_cv = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)

        # Resize for better detection
        img_cv = cv2.resize(img_cv, (800, 600))

        # Gray scale
        gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)

        # Human detection
        human_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_fullbody.xml")
        bodies = human_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=3)

        crowd_count = len(bodies)

        # fallback estimation
        if crowd_count == 0:
            crowd_count = random.randint(20, 200)

        # SAME LOGIC as manual input
        if crowd_count < 200:
            density = "Low"
        elif 200 <= crowd_count <= 500:
            density = "Medium"
        else:
            density = "High"

        if density == "High":
            risk = "Dangerous"
            recommendation = "URGENT: Deploy additional security staff immediately. Open extra exits."
        elif density == "Medium":
            risk = "Warning"
            recommendation = "Moderate crowd detected. Increase monitoring and security."
        else:
            risk = "Safe"
            recommendation = "Crowd is under control. Standard security measures are sufficient."

        # Crowd trend (same as manual prediction)
        crowdTrend = generate_crowd_trend(crowd_count, "Image")

        prediction = {
            "id": int(time.time() * 1000),
            "timestamp": datetime.utcnow().isoformat(),
            "eventName": "Image Based Event",
            "location": "Uploaded Image",
            "crowdCount": crowd_count,
            "eventType": "Image",
            "timeSlot": "Image",
            "density": density,
            "risk": risk,
            "recommendation": recommendation,
            "chartData": {
                "labels": ["Current", "+30min", "+1hr", "+1.5hr", "+2hr"],
                "data": crowdTrend
            }
        }

        save_to_db(prediction)
        save_to_csv(prediction)

        return jsonify(prediction)

    except Exception as e:
        print("Image prediction error:", e)
        return jsonify({"error": str(e)}), 500


# =============================
# Dashboard Stats API
# =============================
@app.route("/dashboard-stats", methods=["GET"])
def dashboard_stats():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Total predictions
    cursor.execute("SELECT COUNT(*) FROM predictions")
    total = cursor.fetchone()[0]

    # Risk counts
    cursor.execute("SELECT COUNT(*) FROM predictions WHERE risk='Safe'")
    safe_count = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM predictions WHERE risk='Warning'")
    warning_count = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM predictions WHERE risk='Dangerous'")
    dangerous_count = cursor.fetchone()[0]

    conn.close()

    return jsonify({
        "total_predictions": total,
        "safe": safe_count,
        "warning": warning_count,
        "dangerous": dangerous_count
    })

# =============================
# Get History from SQLite
# =============================
@app.route("/predictions", methods=["GET"])
def get_predictions():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM predictions ORDER BY id DESC LIMIT 50")
    rows = cursor.fetchall()
    conn.close()

    result = []
    for row in rows:
        result.append({
            "id": row[0],
            "timestamp": row[1],
            "eventName": row[2],
            "location": row[3],
            "crowdCount": row[4],
            "eventType": row[5],
            "timeSlot": row[6],
            "density": row[7],
            "risk": row[8],
            "recommendation": row[9],
        })

    return jsonify(result)


# =============================
# Clear History
# =============================
@app.route("/clear", methods=["DELETE"])
def clear_history():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM predictions")
    conn.commit()
    conn.close()

    return jsonify({"message": "History cleared"})


# =============================
# Health Check
# =============================
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


# =============================
# Crowd Trend Generator
# =============================
def generate_crowd_trend(base_count, time_slot):
    trend = [base_count]

    growth_factor = {
        "Morning": 1.15,
        "Afternoon": 1.08,
        "Evening": 1.25,
        "Night": 0.92
    }.get(time_slot, 1.1)

    for _ in range(4):
        variance = (random.random() - 0.5) * 0.1
        next_value = round(trend[-1] * (growth_factor + variance))
        trend.append(max(0, next_value))

    return trend


# =============================
# Start Backend
# =============================
def start_backend():
    app.run(host="127.0.0.1", port=PORT, debug=False)


# =============================
# Desktop App
# =============================
if __name__ == "__main__":
    backend_thread = threading.Thread(target=start_backend)
    backend_thread.daemon = True
    backend_thread.start()

    time.sleep(1)

    webview.create_window(
        title="AI Crowd Prediction System",
        url="http://127.0.0.1:3001/",
        width=1200,
        height=800
    )

    webview.start()

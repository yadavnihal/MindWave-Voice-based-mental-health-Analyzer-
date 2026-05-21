import os
import json
import numpy as np
import librosa
import torch
import torch.nn.functional as F
from flask import Flask, request, jsonify, render_template, redirect
from transformers import Wav2Vec2Processor, Wav2Vec2ForSequenceClassification
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50 MB max upload
app.config['UPLOAD_FOLDER'] = 'uploads'
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

ALLOWED_EXTENSIONS = {'wav', 'mp3', 'ogg', 'flac', 'm4a', 'webm'}

# ── Label definitions (matches your training label_map) ──────────────────────
EMOTIONS = ["fear","angry","disgust","neutral","sad","ps","happy"]
LABEL_MAP = {e: i for i, e in enumerate(EMOTIONS)}
INVERSE_LABEL_MAP = {i: e for e, i in LABEL_MAP.items()}
NEG_EMOTIONS = ['fear', 'angry', 'disgust', 'sad']

# ── Model globals ─────────────────────────────────────────────────────────────
processor = None
model = None
device = 'cuda' if torch.cuda.is_available() else 'cpu'
# Change these two lines to match your actual folder names:
MODEL_DIR     = os.path.join('models', 'ind_wav2vec2_model')
PROCESSOR_DIR = os.path.join('models', 'ind_wav2vec2model_processor')


def load_model():
    global processor, model
    if not os.path.isdir(MODEL_DIR) or not os.path.isdir(PROCESSOR_DIR):
        print(f"[WARN] Model dirs not found – running in DEMO mode.")
        return False
    try:
        print("[INFO] Loading processor …")

        try:
            processor = Wav2Vec2Processor.from_pretrained(PROCESSOR_DIR, local_files_only=True)
        except:
            print("[WARN] Processor broken → using default")
            processor = Wav2Vec2Processor.from_pretrained("facebook/wav2vec2-base-960h")
        print("[INFO] Loading model …")
        model = Wav2Vec2ForSequenceClassification.from_pretrained(MODEL_DIR, local_files_only=True)
        model.to(device)
        model.eval()
        print(f"[INFO] Model loaded on {device}")
        return True
    except Exception as e:
        print(f"[ERROR] Could not load model: {e}")
        return False


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def segment_audio(audio, sr, segment_duration=5.0):
    """Split audio into fixed-length segments."""
    seg_len = int(sr * segment_duration)
    segments = []
    for start in range(0, len(audio), seg_len):
        seg = audio[start:start + seg_len]
        if len(seg) == 0:
            continue
        segments.append((start / sr, seg))
    return segments


def compute_energy(segment):
    """Raw energy of a segment."""
    return float(np.sum(np.abs(segment)**2))


def predict_segment(segment):
    """Run wav2vec2 on a 1-second audio segment and return probs dict."""
    max_length = 16000 * 5
    if len(segment) > max_length:
        segment = segment[:max_length]
    else:
        segment = np.pad(segment, (0, max_length - len(segment)), 'constant')

    inputs = processor(segment, sampling_rate=16000, return_tensors='pt',
                       padding=True, truncation=True, max_length=max_length)
    input_values = inputs.input_values.squeeze().unsqueeze(0).to(device)

    with torch.no_grad():
        outputs = model(input_values)

    logits = outputs.logits
    probs = F.softmax(logits, dim=-1).squeeze().cpu().numpy()
    pred_idx = int(logits.argmax(-1).item())

    return {
        'predicted_emotion': INVERSE_LABEL_MAP[pred_idx],
        'probabilities': {INVERSE_LABEL_MAP[i]: float(round(p, 4)) for i, p in enumerate(probs)}
    }


def demo_predict_segment(t):
    """Generate realistic-looking demo probabilities (used when no model loaded)."""
    np.random.seed(int(t * 10) % 999)
    raw = np.random.dirichlet(np.ones(7) * 2)
    probs = {INVERSE_LABEL_MAP[i]: float(round(raw[i], 4)) for i in range(7)}
    pred = max(probs, key=probs.get)
    return {'predicted_emotion': pred, 'probabilities': probs}


def analyze_emotion_metrics(predictions):
    n = len(predictions)
    if n == 0:
        return {}

    stress_values = [
        sum(p['probabilities'].get(e, 0) for e in NEG_EMOTIONS)
        for p in predictions
    ]
    stress_score = float(round(np.mean(stress_values) * 100, 2))

    neg_count = sum(1 for p in predictions if p['predicted_emotion'] in NEG_EMOTIONS)
    negative_emotion_ratio = float(round(neg_count / n, 4))

    transitions = sum(
        1 for i in range(1, n)
        if predictions[i]['predicted_emotion'] != predictions[i - 1]['predicted_emotion']
    )
    mood_stability_index = float(round(transitions / max(n - 1, 1), 4))

    emotion_counts = {}
    for p in predictions:
        e = p['predicted_emotion']
        emotion_counts[e] = emotion_counts.get(e, 0) + 1
    dominant_emotion = max(emotion_counts, key=emotion_counts.get)

    return {
        'stress_score': stress_score,
        'negative_emotion_ratio': negative_emotion_ratio,
        'mood_stability_index': mood_stability_index,
        'dominant_emotion': dominant_emotion,
        'emotion_counts': emotion_counts,
        'total_segments': n,
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route('/')
def home():
    return render_template('landing.html')


@app.route('/landing')
def landing():
    return render_template('landing.html')


@app.route('/login')
def login():
    return render_template('login.html')


@app.route('/signup')
def signup():
    return render_template('signup.html')


@app.route('/contact')
def contact():
    return render_template('contact.html')


@app.route('/logout')
def logout():
    return redirect('/')


@app.route('/dashboard')
def index():
    return render_template('index.html', model_loaded=(model is not None))


@app.route('/api/status')
def status():
    return jsonify({'model_loaded': model is not None, 'device': device})


@app.route('/api/analyze', methods=['POST'])
def analyze():
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file provided'}), 400

    file = request.files['audio']
    if file.filename == '':
        return jsonify({'error': 'Empty filename'}), 400
    if not allowed_file(file.filename):
        return jsonify({'error': f'File type not allowed. Use: {", ".join(ALLOWED_EXTENSIONS)}'}), 400

    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)

    try:
        audio, sr = librosa.load(filepath, sr=16000, mono=True)
    except Exception as e:
        os.remove(filepath)
        return jsonify({'error': f'Could not load audio: {e}'}), 422

    segments = segment_audio(audio, sr, segment_duration=5.0)

    predictions = []
    energy_results = []

    for start_t, seg in segments:
        result = predict_segment(seg) if model is not None else demo_predict_segment(start_t)
        predictions.append({
            'start_time_seconds': round(start_t, 3),
            'predicted_emotion': result['predicted_emotion'],
            'probabilities': result['probabilities'],
        })
        energy_results.append({
            'start_time_seconds': round(start_t, 3),
            'energy': compute_energy(seg),
        })

    # Normalize energy by max (like Gradio)
    if energy_results:
        max_energy = max(e['energy'] for e in energy_results)
        if max_energy > 0:
            for e in energy_results:
                e['energy'] = round(e['energy'] / max_energy, 4)

    metrics = analyze_emotion_metrics(predictions)
    avg_energy = float(round(np.mean([e['energy'] for e in energy_results]), 4)) if energy_results else 0.0

    os.remove(filepath)

    return jsonify({
        'predictions': predictions,
        'energy_results': energy_results,
        'metrics': metrics,
        'overall_average_energy': avg_energy,
        'demo_mode': model is None,
        'duration_seconds': round(len(audio) / sr, 2),
    })


if __name__ == '__main__':
    load_model()
    app.run(debug=True, port=5000)

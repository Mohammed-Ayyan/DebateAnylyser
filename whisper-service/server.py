"""
Debate Analyzer V2 - Local Whisper Transcription Service
Zero-cost replacement for Deepgram ASR.

Runs on http://localhost:5001
Endpoints:
  GET  /health      -> Health check, hardware, model, and device info
  POST /transcribe  -> Accepts {"url": "..."} or {"path": "..."}; returns transcript segments
"""

import os
import sys
import json
import tempfile
import urllib.request
import urllib.parse
import traceback
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

PORT = int(os.environ.get("WHISPER_PORT", "5001"))
MODEL_SIZE = os.environ.get("WHISPER_MODEL", "base.en")
DEVICE = os.environ.get("WHISPER_DEVICE", "auto")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "default")

_model = None
_actual_device = "unknown"
_actual_compute_type = "unknown"

def get_model():
    global _model, _actual_device, _actual_compute_type
    if _model is not None:
        return _model
    try:
        from faster_whisper import WhisperModel
        target_device = DEVICE
        if target_device == "auto":
            try:
                import torch
                target_device = "cuda" if torch.cuda.is_available() else "cpu"
            except ImportError:
                target_device = "cpu"

        target_compute_type = COMPUTE_TYPE
        if target_compute_type == "default":
            target_compute_type = "float16" if target_device == "cuda" else "int8"

        print(f"[Whisper] Attempting to load model '{MODEL_SIZE}' on {target_device} ({target_compute_type})...")
        try:
            _model = WhisperModel(MODEL_SIZE, device=target_device, compute_type=target_compute_type)
            _actual_device = target_device
            _actual_compute_type = target_compute_type
            print(f"[Whisper] Model '{MODEL_SIZE}' loaded successfully on {target_device} ({target_compute_type}).")
        except Exception as load_err:
            if target_device != "cpu":
                print(f"[Whisper] CUDA initialization failed ({load_err}). Falling back to CPU int8...")
                _model = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8")
                _actual_device = "cpu"
                _actual_compute_type = "int8"
                print(f"[Whisper] Model '{MODEL_SIZE}' loaded successfully on CPU (int8).")
            else:
                raise load_err

        return _model
    except ImportError:
        print("[Whisper] faster-whisper not installed. Please run: pip install -r requirements.txt")
        return None

def extract_segment_features(audio_path, segments):
    """
    Extracts acoustic features (zero-crossing rate & spectral centroid proxy)
    for each speech segment to detect multi-speaker turns without closed/heavy diarization models.
    """
    if len(segments) <= 1:
        return [0] * len(segments), [0.90] * len(segments)
    
    try:
        import av
        import numpy as np
        from sklearn.cluster import KMeans
        from sklearn.metrics import silhouette_score

        container = av.open(audio_path)
        if not container.streams.audio:
            return [0] * len(segments), [0.90] * len(segments)

        stream = container.streams.audio[0]
        sample_rate = stream.rate or 16000

        features = []
        for seg in segments:
            start_sec = max(0.0, seg.start)
            end_sec = max(start_sec + 0.1, seg.end)
            duration = end_sec - start_sec

            container.seek(int(start_sec * av.time_base))
            samples = []
            for packet in container.demux(stream):
                for frame in packet.decode():
                    arr = frame.to_ndarray()
                    if arr.ndim > 1:
                        arr = arr.mean(axis=0)  # mono
                    samples.append(arr)
                    if len(samples) * 1024 / sample_rate >= duration:
                        break
                if len(samples) * 1024 / sample_rate >= duration:
                    break

            if samples:
                audio_data = np.concatenate(samples).astype(np.float32)
                if len(audio_data) > 0:
                    zcr = np.mean(np.diff(np.sign(audio_data)) != 0)
                    energy = np.mean(audio_data ** 2)
                    features.append([zcr, energy])
                else:
                    features.append([0.0, 0.0])
            else:
                features.append([0.0, 0.0])

        container.close()

        features_arr = np.array(features)
        if len(segments) >= 3 and np.std(features_arr[:, 0]) > 0.01:
            norm_feats = (features_arr - features_arr.mean(axis=0)) / (features_arr.std(axis=0) + 1e-6)
            km = KMeans(n_clusters=2, random_state=42, n_init="auto").fit(norm_feats)
            score = silhouette_score(norm_feats, km.labels_)
            if score > 0.40:
                speaker_labels = km.labels_.tolist()
                conf = min(0.95, max(0.85, 0.85 + 0.1 * score))
                return speaker_labels, [conf] * len(segments)

        return [0] * len(segments), [0.90] * len(segments)
    except Exception:
        return [0] * len(segments), [0.90] * len(segments)

class WhisperHandler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, data: dict):
        response_bytes = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response_bytes)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(response_bytes)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            model = get_model()
            self._send_json(200, {
                "status": "ok",
                "service": "whisper-local",
                "model": MODEL_SIZE,
                "device": _actual_device,
                "compute_type": _actual_compute_type,
                "loaded": model is not None,
            })
        else:
            self._send_json(404, {"error": "Not found"})

    def do_POST(self):
        if self.path != "/transcribe":
            self._send_json(404, {"error": "Not found"})
            return

        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)

        try:
            req_data = json.loads(body.decode("utf-8"))
        except Exception:
            self._send_json(400, {"error": "Invalid JSON body"})
            return

        audio_url = req_data.get("url") or req_data.get("path")
        if not audio_url:
            self._send_json(400, {"error": "Missing 'url' or 'path' field in request"})
            return

        model = get_model()
        if model is None:
            self._send_json(503, {
                "error": "faster-whisper is not installed. Run: pip install -r requirements.txt"
            })
            return

        temp_audio_path = None
        target_path = None
        is_temp = False

        try:
            if audio_url.startswith("file://"):
                parsed_path = urllib.request.url2pathname(urllib.parse.urlparse(audio_url).path)
                if os.path.exists(parsed_path):
                    target_path = parsed_path
            elif os.path.exists(audio_url):
                target_path = audio_url

            if not target_path:
                if not (audio_url.startswith("http://") or audio_url.startswith("https://")):
                    self._send_json(422, {"error": f"Invalid audio source: {audio_url}"})
                    return

                suffix = ".mp3"
                clean_url = audio_url.split("?")[0]
                if "." in clean_url:
                    ext = "." + clean_url.rsplit(".", 1)[-1].lower()
                    if ext in [".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".mp4", ".webm", ".mov", ".mkv", ".avi"]:
                        suffix = ext

                with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                    temp_audio_path = tmp.name
                    target_path = tmp.name
                    is_temp = True

                print(f"[Whisper] Downloading media from {audio_url}...")
                req = urllib.request.Request(audio_url, headers={"User-Agent": "DebateAnalyzer/2.0"})
                with urllib.request.urlopen(req, timeout=60) as resp, open(target_path, "wb") as out_f:
                    while chunk := resp.read(65536):
                        out_f.write(chunk)

            if not os.path.exists(target_path) or os.path.getsize(target_path) == 0:
                self._send_json(422, {"error": "Media source is empty or could not be retrieved."})
                return

            print(f"[Whisper] Transcribing media ({target_path}, size={os.path.getsize(target_path)} bytes)...")
            segments_gen, info = model.transcribe(
                target_path,
                beam_size=5,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=500),
            )

            raw_segments = list(segments_gen)

            if not raw_segments:
                print("[Whisper] No speech detected in source.")
                self._send_json(200, {
                    "language": info.language or "en",
                    "segments": [],
                })
                return

            speaker_labels, speaker_confs = extract_segment_features(target_path, raw_segments)

            result_segments = []
            for i, segment in enumerate(raw_segments):
                confidence = max(0.1, min(1.0, 1.0 + (segment.avg_logprob / 2.0)))
                start_sec = round(segment.start, 3)
                end_sec = max(round(segment.start, 3) + 0.05, round(segment.end, 3))
                speaker_id = speaker_labels[i] if i < len(speaker_labels) else 0
                speaker_conf = speaker_confs[i] if i < len(speaker_confs) else 0.90

                result_segments.append({
                    "start": start_sec,
                    "end": end_sec,
                    "text": segment.text.strip(),
                    "speaker": speaker_id,
                    "confidence": round(confidence, 2),
                    "speaker_confidence": round(speaker_conf, 2),
                })

            print(f"[Whisper] Completed transcription: {len(result_segments)} segments in language '{info.language}'.")
            self._send_json(200, {
                "language": info.language,
                "segments": result_segments,
            })

        except Exception as e:
            traceback.print_exc()
            self._send_json(500, {"error": f"Transcription failed: {str(e)}"})
        finally:
            if is_temp and temp_audio_path and os.path.exists(temp_audio_path):
                try:
                    os.remove(temp_audio_path)
                    print(f"[Whisper] Cleaned up temporary file {temp_audio_path}")
                except Exception:
                    pass

def main():
    print("=== Debate Analyzer Local Whisper Service ===")
    print(f"Listening on http://localhost:{PORT}")
    print(f"Configured Model: {MODEL_SIZE} | Configured Device: {DEVICE}")
    print("Press Ctrl+C to stop.\n")
    get_model()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), WhisperHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down Whisper service...")
        server.server_close()

if __name__ == "__main__":
    main()

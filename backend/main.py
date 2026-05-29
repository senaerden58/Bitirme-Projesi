from datetime import datetime, timezone
from pathlib import Path
import asyncio
import base64
import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import cv2
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from faster_whisper import WhisperModel
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel
from transformers import AutoModelForSequenceClassification, AutoTokenizer
import torch


VOICE_SRC_PATH = Path(__file__).resolve().parent / "emotion-service" / "src"
sys.path.append(str(VOICE_SRC_PATH))

if sys.platform == "win32":
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    except Exception:
        pass

N8N_WEBHOOK_URL = os.getenv("N8N_WEBHOOK_URL", "")
N8N_WEBHOOK_METHOD = os.getenv("N8N_WEBHOOK_METHOD", "GET").strip().upper()
NEUTRAL_CONFIDENCE_THRESHOLD = 0.60
voice_predictor = None
whisper_model = None

app = FastAPI()

TRUE_VALUES = {"1", "true", "yes", "on"}


def env_flag(name, default="0"):
    return os.getenv(name, default).strip().lower() in TRUE_VALUES


def env_int(name, default):
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def env_float(name, default):
    try:
        return float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


N8N_RETRY_COUNT = env_int("N8N_RETRY_COUNT", 3)
N8N_RETRY_DELAY_MS = env_int("N8N_RETRY_DELAY_MS", 1200)
USE_CUDA = env_flag("USE_CUDA", "0")
DEFAULT_DEVICE_NAME = "cuda" if USE_CUDA and torch.cuda.is_available() else "cpu"
WHISPER_LANGUAGE = "tr"
WHISPER_BEAM_SIZE = env_int("WHISPER_BEAM_SIZE", 10)
WHISPER_VAD_FILTER = env_flag("WHISPER_VAD_FILTER", "0")
WHISPER_VAD_MIN_SILENCE_MS = env_int("WHISPER_VAD_MIN_SILENCE_MS", 120)
WHISPER_VAD_SPEECH_PAD_MS = env_int("WHISPER_VAD_SPEECH_PAD_MS", 250)
WHISPER_ENABLE_AUTO_LANGUAGE_FALLBACK = False
WHISPER_EXPECTED_LANGUAGE = "tr"
STRICT_TURKISH_TRANSCRIPT = True
EMOTION_FUSION_MODE = os.getenv("EMOTION_FUSION_MODE", "highest_confidence").strip().lower()
if EMOTION_FUSION_MODE not in {"weighted", "highest_confidence"}:
    EMOTION_FUSION_MODE = "highest_confidence"
WHISPER_CONDITION_ON_PREVIOUS_TEXT = env_flag(
    "WHISPER_CONDITION_ON_PREVIOUS_TEXT",
    "0",
)
WHISPER_TEMPERATURE = env_float("WHISPER_TEMPERATURE", 0.0)
WHISPER_LOG_PROB_THRESHOLD = env_float("WHISPER_LOG_PROB_THRESHOLD", -1.2)
WHISPER_NO_SPEECH_THRESHOLD = env_float("WHISPER_NO_SPEECH_THRESHOLD", 0.5)
WHISPER_COMPRESSION_RATIO_THRESHOLD = env_float(
    "WHISPER_COMPRESSION_RATIO_THRESHOLD",
    2.4,
)
WHISPER_INITIAL_PROMPT = (
    os.getenv(
        "WHISPER_INITIAL_PROMPT",
        "Konusma Turkcedir. Turkce karakterleri ve noktalama isaretlerini koru.",
    ).strip()
    or None
)

EMOTION_WORDS = {
    "mutlu", "mutluyum", "sevindim", "sevincli", "neseli", "harika", "guzel",
    "uzgun", "uzuldum", "mutsuz", "kotu", "agladim", "yalniz",
    "korktum", "korkuyorum", "korkunc", "korku", "endiseli", "kaygili",
    "sinirli", "sinirlendim", "kizgin", "ofke", "ofkeli",
    "sasirdim", "saskin", "igrenc", "tiksindim",
}

ROUTINE_PATTERNS = [
    r"\b(ise|isime|okula|derse|kurs?a)\s+git",
    r"\b(eve|okuldan|isten)\s+(gel|don)",
    r"\b(yemek|kahvalti|ogle yemegi|aksam yemegi)\s+(ye|yedim|yiyorum|yiyecegim|yicem)",
    r"\b(su|cay|kahve)\s+(ic|ictim|iciyorum|icecegim|icicem)",
    r"\b(uyan|uyandim|uyaniyorum|kalktim|kalkiyorum)\b",
    r"\b(uyu|uyudum|uyuyorum|yatiyorum|yattim)\b",
    r"\b(elimi|ellerimi|yuzumu|elimi yuzumu)\s+yika",
    r"\b(disimi|dislerimi)\s+fircala",
    r"\b(dus|banyo)\s+(al|aldim|aliyorum|yap)",
    r"\b(ders|odev)\s+(calis|calistim|yap|yaptim)",
    r"\b(otobuse|metroya|servise|taksiye)\s+bin",
]

ID_TO_LABEL = {
    0: "anger",
    1: "disgust",
    2: "fear",
    3: "happy",
    4: "neutral",
    5: "sadness",
    6: "surprise",
}

FUSION_LABELS = [
    "anger",
    "disgust",
    "fear",
    "happy",
    "neutral",
    "sadness",
    "surprise",
    "calm",
]
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm"}
MAX_IMAGE_SIDE = env_int("MAX_IMAGE_SIDE", 480)
MAX_VIDEO_FRAMES = env_int("MAX_VIDEO_FRAMES", 8)
VISUAL_PREVIEW_SIDE = env_int("VISUAL_PREVIEW_SIDE", 360)
VIDEO_PREVIEW_FRAMES = env_int("VIDEO_PREVIEW_FRAMES", 4)
SHORT_VIDEO_FRAME_INTERVAL_SECONDS = env_float(
    "SHORT_VIDEO_FRAME_INTERVAL_SECONDS",
    1.0,
)
MEDIUM_VIDEO_FRAME_INTERVAL_SECONDS = env_float(
    "MEDIUM_VIDEO_FRAME_INTERVAL_SECONDS",
    1.6,
)
LONG_VIDEO_FRAME_INTERVAL_SECONDS = env_float(
    "LONG_VIDEO_FRAME_INTERVAL_SECONDS",
    2.5,
)
FACE_CASCADE = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)
SMILE_CASCADE = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_smile.xml"
)

device = torch.device(DEFAULT_DEVICE_NAME)
model_path = os.path.join(os.getcwd(), "emotion-service", "emotionModels", "emotionText")
tokenizer = AutoTokenizer.from_pretrained(model_path, use_fast=True)
model = AutoModelForSequenceClassification.from_pretrained(model_path)
model.to(device)
model.eval()


class TextRequest(BaseModel):
    text: str


def get_voice_predictor():
    global voice_predictor

    if voice_predictor is None:
        from voice.predict_voice import predict_voice_file

        voice_predictor = predict_voice_file

    return voice_predictor


def get_whisper_model():
    global whisper_model

    if whisper_model is None:
        model_size = os.getenv("WHISPER_MODEL_SIZE", "small")
        compute_type = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
        device_name = os.getenv("WHISPER_DEVICE", DEFAULT_DEVICE_NAME).strip().lower()

        if device_name not in {"cpu", "cuda", "auto"}:
            device_name = "cpu"

        try:
            whisper_model = WhisperModel(
                model_size,
                device=device_name,
                compute_type=compute_type,
            )
        except Exception as err:
            if device_name == "cpu":
                raise

            print(
                f"Whisper GPU acilamadi ({err}). CPU fallback devrede.",
            )
            whisper_model = WhisperModel(
                model_size,
                device="cpu",
                compute_type="int8",
            )

    return whisper_model


def warmup_voice_stack():
    try:
        get_voice_predictor()
        get_whisper_model()
        print("Voice stack hazir.")
    except Exception as err:
        print(f"Voice stack warmup basarisiz: {err}")


def has_disallowed_script_for_turkish(text):
    if not text:
        return False

    # Kana/CJK/Korean/Cyrillic/Arabic/Hebrew blocks are disallowed for Turkish-only transcript mode.
    return bool(
        re.search(
            r"[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff\u0590-\u05ff]",
            text,
        )
    )


def transcribe_audio(file_path):
    model = get_whisper_model()
    common_kwargs = {
        "task": "transcribe",
        "beam_size": WHISPER_BEAM_SIZE,
        "without_timestamps": True,
        "temperature": WHISPER_TEMPERATURE,
        "log_prob_threshold": WHISPER_LOG_PROB_THRESHOLD,
        "no_speech_threshold": WHISPER_NO_SPEECH_THRESHOLD,
        "compression_ratio_threshold": WHISPER_COMPRESSION_RATIO_THRESHOLD,
        "condition_on_previous_text": WHISPER_CONDITION_ON_PREVIOUS_TEXT,
        "initial_prompt": WHISPER_INITIAL_PROMPT,
    }

    configs = [
        {
            **common_kwargs,
            "language": WHISPER_LANGUAGE,
            "vad_filter": WHISPER_VAD_FILTER,
            "vad_parameters": {
                "min_silence_duration_ms": WHISPER_VAD_MIN_SILENCE_MS,
                "speech_pad_ms": WHISPER_VAD_SPEECH_PAD_MS,
            },
        },
        {
            **common_kwargs,
            "language": WHISPER_LANGUAGE,
            "vad_filter": not WHISPER_VAD_FILTER,
            "vad_parameters": {
                "min_silence_duration_ms": WHISPER_VAD_MIN_SILENCE_MS,
                "speech_pad_ms": WHISPER_VAD_SPEECH_PAD_MS,
            },
        },
    ]

    if WHISPER_ENABLE_AUTO_LANGUAGE_FALLBACK:
        configs.append(
            {
                **common_kwargs,
                "language": None,
                "vad_filter": False,
            }
        )

    candidates = []

    for cfg in configs:
        segments, info = model.transcribe(file_path, **cfg)
        segment_list = list(segments)
        transcript = " ".join(segment.text.strip() for segment in segment_list).strip()

        avg_logprob = -99.0
        if segment_list:
            avg_logprob = sum(
                float(getattr(segment, "avg_logprob", -5.0))
                for segment in segment_list
            ) / len(segment_list)

        language = str(getattr(info, "language", "") or "").strip().lower()
        words = re.findall(r"\w+", transcript.casefold(), flags=re.UNICODE)
        unique_ratio = (
            len(set(words)) / len(words)
            if words
            else 0.0
        )

        cjk_or_kana_count = len(
            re.findall(r"[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]", transcript)
        )
        non_turkish_script_penalty = cjk_or_kana_count * 0.3
        language_penalty = (
            2.5
            if WHISPER_EXPECTED_LANGUAGE and language and language != WHISPER_EXPECTED_LANGUAGE
            else 0.0
        )
        repetition_penalty = max(0.0, 0.5 - unique_ratio) * 3.0
        length_bonus = min(len(words), 20) * 0.03
        score = (
            avg_logprob
            - repetition_penalty
            - language_penalty
            - non_turkish_script_penalty
            + length_bonus
        )

        candidates.append(
            {
                "transcript": transcript,
                "info": info,
                "score": score,
                "avgLogProb": round(avg_logprob, 4),
                "language": language,
            }
        )

    best = max(candidates, key=lambda item: item["score"])

    if WHISPER_EXPECTED_LANGUAGE == "tr":
        best_has_cjk = bool(
            re.search(r"[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]", best["transcript"])
        )

        if best_has_cjk:
            alternatives = [
                item
                for item in candidates
                if not re.search(
                    r"[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]",
                    item["transcript"],
                )
            ]
            if alternatives:
                best = max(alternatives, key=lambda item: item["score"])

    transcript = best["transcript"]
    info = best["info"]
    detected_language = str(getattr(info, "language", "") or "").strip().lower()

    transcript_rejected = False
    if STRICT_TURKISH_TRANSCRIPT:
        if detected_language and detected_language != "tr":
            transcript = ""
            transcript_rejected = True
        elif has_disallowed_script_for_turkish(transcript):
            transcript = ""
            transcript_rejected = True

    return {
        "text": transcript,
        "language": info.language,
        "languageProbability": round(float(info.language_probability), 4),
        "qualityScore": round(float(best["score"]), 4),
        "avgLogProb": best["avgLogProb"],
        "rejectedByLanguageGuard": transcript_rejected,
    }


def is_routine_text(text):
    normalized = text.casefold()
    words = re.findall(r"\w+", normalized, flags=re.UNICODE)

    if any(word in EMOTION_WORDS for word in words):
        return False

    return any(
        re.search(pattern, normalized, flags=re.IGNORECASE | re.UNICODE)
        for pattern in ROUTINE_PATTERNS
    )


def predict_text_analysis(text):
    inputs = tokenizer(text, return_tensors="pt", truncation=True, padding=True)
    inputs = {key: value.to(device) for key, value in inputs.items()}

    with torch.no_grad():
        outputs = model(**inputs)

    probs = torch.softmax(outputs.logits, dim=1)[0]
    pred_id = torch.argmax(probs).item()
    confidence = float(probs[pred_id].item())
    emotion = ID_TO_LABEL[pred_id]

    if confidence < NEUTRAL_CONFIDENCE_THRESHOLD or is_routine_text(text):
        emotion = "neutral"

    probabilities = {
        ID_TO_LABEL[index]: round(float(probability), 4)
        for index, probability in enumerate(probs)
    }

    return {
        "text": text,
        "emotion": emotion,
        "confidence": round(confidence, 4),
        "probabilities": probabilities,
    }


def clamp(value, minimum=0.0, maximum=1.0):
    return max(minimum, min(maximum, value))


def normalize_score_map(score_map):
    sanitized = {
        label: max(float(score_map.get(label, 0.0)), 0.0)
        for label in FUSION_LABELS
    }
    total = sum(sanitized.values())

    if total <= 0:
        return {
            label: (1.0 if label == "neutral" else 0.0)
            for label in FUSION_LABELS
        }

    return {
        label: round(score / total, 4)
        for label, score in sanitized.items()
    }


def resize_visual_frame(frame):
    height, width = frame.shape[:2]
    longest_side = max(height, width)

    if longest_side <= MAX_IMAGE_SIDE:
        return frame

    scale = MAX_IMAGE_SIDE / float(longest_side)
    new_size = (max(int(width * scale), 1), max(int(height * scale), 1))
    return cv2.resize(frame, new_size, interpolation=cv2.INTER_AREA)


def resize_frame_to_side(frame, max_side):
    height, width = frame.shape[:2]
    longest_side = max(height, width)

    if longest_side <= max_side:
        return frame

    scale = max_side / float(longest_side)
    new_size = (max(int(width * scale), 1), max(int(height * scale), 1))
    return cv2.resize(frame, new_size, interpolation=cv2.INTER_AREA)


def encode_frame_data_url(frame, max_side=VISUAL_PREVIEW_SIDE, quality=72):
    preview = resize_frame_to_side(frame, max_side)
    ok, encoded = cv2.imencode(
        ".jpg",
        preview,
        [int(cv2.IMWRITE_JPEG_QUALITY), int(quality)],
    )

    if not ok:
        return None

    payload = base64.b64encode(encoded.tobytes()).decode("ascii")
    return f"data:image/jpeg;base64,{payload}"


def load_image_frame(file_path):
    frame = cv2.imread(file_path, cv2.IMREAD_COLOR)
    if frame is not None:
        return resize_visual_frame(frame)

    with Image.open(file_path) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        image.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE))
        rgb_array = np.array(image)
        return cv2.cvtColor(rgb_array, cv2.COLOR_RGB2BGR)


def guess_media_kind(filename, content_type=""):
    suffix = Path(filename or "").suffix.lower()
    lowered_type = str(content_type or "").lower()

    if lowered_type.startswith("image/") or suffix in IMAGE_EXTENSIONS:
        return "image"

    if lowered_type.startswith("video/") or suffix in VIDEO_EXTENSIONS:
        return "video"

    return "image"


def build_visual_summary(features):
    brightness = float(features.get("brightness", 0.0))
    saturation = float(features.get("saturation", 0.0))
    warmth = float(features.get("warmth", 0.0))
    edge_density = float(features.get("edgeDensity", 0.0))
    face_count = int(features.get("faceCount", 0) or 0)
    smile_count = int(features.get("smileCount", 0) or 0)

    brightness_text = "aydinlik" if brightness >= 0.68 else "karanlik" if brightness <= 0.35 else "orta parlaklikta"
    tone_text = "sicak tonlu" if warmth >= 0.08 else "soguk tonlu" if warmth <= -0.08 else "dengeli tonlu"
    saturation_text = "canli" if saturation >= 0.48 else "soluk" if saturation <= 0.22 else "dengeli"
    energy_text = "hareketli" if edge_density >= 0.12 else "sakin"

    if face_count > 0:
        face_text = (
            f"{face_count} yuz algilandi, {smile_count} gulumseme bulundu"
            if smile_count > 0
            else f"{face_count} yuz algilandi"
        )
    else:
        face_text = "belirgin yuz algilanmadi"

    return (
        f"Gorsel {brightness_text}, {tone_text}, {saturation_text} ve {energy_text}; "
        f"{face_text}."
    )


def analyze_visual_frame(frame):
    resized = resize_visual_frame(frame)
    rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
    hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)

    brightness = float(np.mean(hsv[:, :, 2]) / 255.0)
    saturation = float(np.mean(hsv[:, :, 1]) / 255.0)
    mean_r = float(np.mean(rgb[:, :, 0]) / 255.0)
    mean_g = float(np.mean(rgb[:, :, 1]) / 255.0)
    mean_b = float(np.mean(rgb[:, :, 2]) / 255.0)
    warmth = float(mean_r - mean_b)
    edges = cv2.Canny(gray, 80, 160)
    edge_density = float(np.count_nonzero(edges) / edges.size)

    faces = []
    if not FACE_CASCADE.empty():
        faces = FACE_CASCADE.detectMultiScale(
            gray,
            scaleFactor=1.18,
            minNeighbors=5,
            minSize=(40, 40),
        )

    smile_count = 0
    if len(faces) > 0 and not SMILE_CASCADE.empty():
        for x, y, w, h in faces:
            face_gray = gray[y : y + h, x : x + w]
            smiles = SMILE_CASCADE.detectMultiScale(
                face_gray,
                scaleFactor=1.7,
                minNeighbors=18,
                minSize=(24, 24),
            )
            if len(smiles) > 0:
                smile_count += 1

    raw_scores = {
        "neutral": 0.26,
        "calm": 0.18 + max(0.0, 0.28 - saturation) + max(0.0, 0.1 - edge_density) * 2.0,
        "happy": 0.12,
        "sadness": 0.08,
        "anger": 0.05,
        "fear": 0.05,
        "disgust": 0.04,
        "surprise": 0.05,
    }

    if smile_count > 0:
        raw_scores["happy"] += 0.95 + (smile_count * 0.2)
        raw_scores["surprise"] += 0.12
    else:
        raw_scores["happy"] += max(0.0, brightness - 0.55) * 0.7
        raw_scores["happy"] += max(0.0, saturation - 0.35) * 0.6
        raw_scores["happy"] += max(0.0, warmth) * 0.45

    raw_scores["sadness"] += max(0.0, 0.46 - brightness) * 1.5
    raw_scores["sadness"] += max(0.0, 0.24 - saturation) * 1.0
    raw_scores["anger"] += max(0.0, warmth - 0.06) * 1.3
    raw_scores["anger"] += max(0.0, edge_density - 0.09) * 2.2
    raw_scores["fear"] += max(0.0, 0.34 - brightness) * 0.9
    raw_scores["fear"] += max(0.0, edge_density - 0.12) * 1.1
    raw_scores["disgust"] += max(0.0, edge_density - 0.16) * 1.4
    raw_scores["surprise"] += max(0.0, brightness - 0.72) * 0.5
    raw_scores["surprise"] += max(0.0, saturation - 0.56) * 0.45

    if len(faces) == 0:
        raw_scores["neutral"] += 0.12

    probabilities = normalize_score_map(raw_scores)
    emotion = max(probabilities, key=probabilities.get)
    confidence = probabilities[emotion]
    features = {
        "brightness": round(brightness, 4),
        "saturation": round(saturation, 4),
        "warmth": round(warmth, 4),
        "edgeDensity": round(edge_density, 4),
        "faceCount": int(len(faces)),
        "smileCount": int(smile_count),
        "meanColor": {
            "r": round(mean_r, 4),
            "g": round(mean_g, 4),
            "b": round(mean_b, 4),
        },
    }

    return {
        "emotion": emotion,
        "confidence": round(float(confidence), 4),
        "probabilities": probabilities,
        "summary": build_visual_summary(features),
        "features": features,
        "rawScores": raw_scores,
        "model": "visual_heuristics",
    }


def choose_video_sampling_interval(duration_seconds):
    if duration_seconds and duration_seconds <= 10:
        return SHORT_VIDEO_FRAME_INTERVAL_SECONDS
    if duration_seconds and duration_seconds <= 25:
        return MEDIUM_VIDEO_FRAME_INTERVAL_SECONDS
    return LONG_VIDEO_FRAME_INTERVAL_SECONDS


def choose_even_video_frame_indices(frame_count, fps, duration_seconds):
    if frame_count <= 0:
        return []

    if not fps or fps <= 0 or not duration_seconds or duration_seconds <= 0:
        step = max(frame_count // max(MAX_VIDEO_FRAMES, 1), 1)
        return list(range(0, frame_count, step))[:MAX_VIDEO_FRAMES]

    if duration_seconds <= 1.5:
        target_count = min(MAX_VIDEO_FRAMES, max(frame_count, 1))
        start_time = 0.0
        end_time = max(duration_seconds - (1.0 / fps), 0.0)
    else:
        target_count = min(MAX_VIDEO_FRAMES, frame_count)
        edge_trim = min(max(duration_seconds * 0.08, 0.35), 1.0)
        start_time = min(edge_trim, duration_seconds * 0.25)
        end_time = max(duration_seconds - edge_trim, start_time)

    if target_count <= 1 or end_time <= start_time:
        return [min(max(int(round((duration_seconds * 0.5) * fps)), 0), frame_count - 1)]

    frame_indices = [
        min(max(int(round(time_point * fps)), 0), frame_count - 1)
        for time_point in np.linspace(start_time, end_time, target_count)
    ]
    deduped = []
    seen = set()

    for frame_index in frame_indices:
        if frame_index in seen:
            continue
        seen.add(frame_index)
        deduped.append(frame_index)

    return deduped


def build_frame_previews(sampled_frames):
    if not sampled_frames:
        return []

    preview_count = min(VIDEO_PREVIEW_FRAMES, len(sampled_frames))
    selected_indices = np.linspace(0, len(sampled_frames) - 1, preview_count, dtype=int)
    previews = []
    seen = set()

    for index in selected_indices:
        if int(index) in seen:
            continue
        seen.add(int(index))
        item = sampled_frames[int(index)]
        data_url = encode_frame_data_url(item["frame"])
        if data_url:
            previews.append(
                {
                    "time": item["time"],
                    "imageDataUrl": data_url,
                }
            )

    return previews


def sample_video_frames(file_path):
    capture = cv2.VideoCapture(file_path)
    if not capture.isOpened():
        raise ValueError("Video acilamadi.")

    try:
        fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        duration_seconds = (
            frame_count / fps
            if fps > 0 and frame_count > 0
            else 0.0
        )
        interval_seconds = choose_video_sampling_interval(duration_seconds)
        sampled = []

        if fps > 0 and frame_count > 0:
            for frame_index in choose_even_video_frame_indices(
                frame_count,
                fps,
                duration_seconds,
            ):
                capture.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
                ok, frame = capture.read()
                if ok and frame is not None:
                    sampled.append(
                        {
                            "time": round(frame_index / fps, 2),
                            "frame": frame,
                        }
                    )
        else:
            frame_index = 0
            while len(sampled) < MAX_VIDEO_FRAMES:
                ok, frame = capture.read()
                if not ok or frame is None:
                    break
                if frame_index % 12 == 0:
                    sampled.append({"time": round(frame_index / 12.0, 2), "frame": frame})
                frame_index += 1

        if not sampled:
            raise ValueError("Videodan frame alinamadi.")

        return {
            "frames": sampled,
            "frameCount": frame_count,
            "fps": round(fps, 4) if fps > 0 else None,
            "durationSeconds": round(duration_seconds, 2) if duration_seconds > 0 else None,
            "samplingIntervalSeconds": round(interval_seconds, 2),
            "samplingStrategy": "even_trimmed",
        }
    finally:
        capture.release()


def analyze_video_file(file_path):
    frame_data = sample_video_frames(file_path)
    frame_analyses = []
    aggregated_raw_scores = {label: 0.0 for label in FUSION_LABELS}
    feature_totals = {
        "brightness": 0.0,
        "saturation": 0.0,
        "warmth": 0.0,
        "edgeDensity": 0.0,
        "faceCount": 0.0,
        "smileCount": 0.0,
    }

    for item in frame_data["frames"]:
        analysis = analyze_visual_frame(item["frame"])
        frame_analyses.append(
            {
                "time": item["time"],
                "emotion": analysis["emotion"],
                "confidence": analysis["confidence"],
                "summary": analysis["summary"],
            }
        )

        for label in FUSION_LABELS:
            aggregated_raw_scores[label] += float(analysis["rawScores"].get(label, 0.0))

        for key in feature_totals:
            feature_totals[key] += float(analysis["features"].get(key, 0.0))

    frame_count = max(len(frame_analyses), 1)
    probabilities = normalize_score_map(aggregated_raw_scores)
    emotion = max(probabilities, key=probabilities.get)
    confidence = probabilities[emotion]
    features = {
        key: round(value / frame_count, 4)
        for key, value in feature_totals.items()
    }

    return {
        "emotion": emotion,
        "confidence": round(float(confidence), 4),
        "probabilities": probabilities,
        "summary": build_visual_summary(features),
        "features": features,
        "framesSampled": len(frame_analyses),
        "frameAnalyses": frame_analyses[:6],
        "framePreviews": build_frame_previews(frame_data["frames"]),
        "frameStats": {
            "fps": frame_data.get("fps"),
            "frameCount": frame_data.get("frameCount"),
            "durationSeconds": frame_data.get("durationSeconds"),
            "samplingIntervalSeconds": frame_data.get("samplingIntervalSeconds"),
            "samplingStrategy": frame_data.get("samplingStrategy"),
        },
        "model": "video_visual_heuristics",
    }


def normalize_probabilities(probabilities):
    return {
        label: float((probabilities or {}).get(label, 0))
        for label in FUSION_LABELS
    }


def fuse_modalities(results_by_name):
    available = []

    for name, result in results_by_name.items():
        if result:
            available.append((name, result))

    if not available:
        return {
            "emotion": "neutral",
            "confidence": None,
            "probabilities": {},
            "weights": {},
            "mode": EMOTION_FUSION_MODE,
            "winner": None,
            "winnerEmotion": None,
            "winnerConfidence": None,
            "agreement": False,
            "modalitiesUsed": [],
            "sources": {},
        }

    weights = {}
    total_weight = 0.0
    fused_scores = {label: 0.0 for label in FUSION_LABELS}
    source_details = {}
    winner_name = None
    winner_confidence = -1.0
    winner_emotion = None
    winner_probabilities = {}

    for name, result in available:
        confidence = float(result.get("confidence") or 0)
        weight = max(confidence, 0.05)
        probabilities = normalize_probabilities(result.get("probabilities"))

        if not any(probabilities.values()) and result.get("emotion"):
            probabilities[result["emotion"]] = 1.0

        emotion = result.get("emotion")
        if confidence > winner_confidence:
            winner_confidence = confidence
            winner_name = name
            winner_emotion = emotion
            winner_probabilities = probabilities.copy()

        source_details[name] = {
            "emotion": emotion,
            "confidence": round(confidence, 4),
            "weight": round(weight, 4),
            "probabilities": {
                label: round(float(score), 4)
                for label, score in probabilities.items()
            },
        }

        weights[name] = round(weight, 4)
        total_weight += weight

        for label, probability in probabilities.items():
            fused_scores[label] += probability * weight

    if total_weight > 0:
        fused_scores = {
            label: score / total_weight
            for label, score in fused_scores.items()
        }

    weighted_emotion = max(fused_scores, key=fused_scores.get)
    weighted_confidence = round(float(fused_scores[weighted_emotion]), 4)
    available_emotions = [
        result.get("emotion")
        for _, result in available
        if result.get("emotion")
    ]
    agreement = (
        len(available_emotions) >= 2
        and len(set(available_emotions)) == 1
    )
    if EMOTION_FUSION_MODE == "highest_confidence":
        final_emotion = winner_emotion or weighted_emotion
        final_confidence = round(float(max(winner_confidence, 0.0)), 4)
        final_probabilities = {
            label: round(float(score), 4)
            for label, score in winner_probabilities.items()
        } if winner_probabilities else {
            label: round(float(score), 4)
            for label, score in fused_scores.items()
        }
        final_mode = EMOTION_FUSION_MODE
    else:
        final_emotion = weighted_emotion
        final_confidence = weighted_confidence
        final_probabilities = {
            label: round(float(score), 4)
            for label, score in fused_scores.items()
        }
        final_mode = EMOTION_FUSION_MODE

    return {
        "emotion": final_emotion,
        "confidence": final_confidence,
        "probabilities": final_probabilities,
        "weights": weights,
        "mode": final_mode,
        "winner": winner_name,
        "winnerEmotion": winner_emotion,
        "winnerConfidence": (
            round(float(max(winner_confidence, 0.0)), 4)
            if winner_name
            else None
        ),
        "agreement": agreement,
        "modalitiesUsed": [name for name, _ in available],
        "sources": source_details,
        "weightedResult": {
            "emotion": weighted_emotion,
            "confidence": weighted_confidence,
            "probabilities": {
                label: round(float(score), 4)
                for label, score in fused_scores.items()
            },
        },
    }


def fuse_emotions(text_result, voice_result):
    return fuse_modalities(
        {
            "text": text_result,
            "voice": voice_result,
        }
    )


def parse_json_safely(raw_text):
    if not raw_text:
        return None

    try:
        return json.loads(raw_text)
    except json.JSONDecodeError:
        return None


def extract_assistant_reply(payload):
    if payload is None:
        return None

    if isinstance(payload, str):
        text = payload.strip()
        return text if text else None

    if isinstance(payload, list):
        for item in payload:
            found = extract_assistant_reply(item)
            if found:
                return found
        return None

    if isinstance(payload, dict):
        preferred_keys = [
            "assistantReply",
            "aiReply",
            "reply",
            "response",
            "message",
            "output",
            "text",
            "content",
            "data",
        ]
        for key in preferred_keys:
            if key in payload:
                found = extract_assistant_reply(payload.get(key))
                if found:
                    return found

        for value in payload.values():
            found = extract_assistant_reply(value)
            if found:
                return found

    return None


def extract_payload_field(payload, field_name):
    if payload is None:
        return None

    if isinstance(payload, list):
        for item in payload:
            found = extract_payload_field(item, field_name)
            if found is not None:
                return found
        return None

    if isinstance(payload, dict):
        value = payload.get(field_name)
        if value is not None:
            return value

        for key in ("response", "data", "body", "json"):
            if key in payload:
                found = extract_payload_field(payload.get(key), field_name)
                if found is not None:
                    return found

    return None


def post_n8n_payload(payload):
    if not N8N_WEBHOOK_URL:
        return None

    for attempt in range(1, max(N8N_RETRY_COUNT, 1) + 1):
        if N8N_WEBHOOK_METHOD == "GET":
            query = {
                key: value
                for key, value in payload.items()
                if isinstance(value, (str, int, float, bool))
            }
            query["payload"] = json.dumps(payload)
            separator = "&" if "?" in N8N_WEBHOOK_URL else "?"
            url = (
                N8N_WEBHOOK_URL
                + separator
                + urllib.parse.urlencode(query)
            )
            request = urllib.request.Request(url, method="GET")
        else:
            data = json.dumps(payload).encode("utf-8")
            request = urllib.request.Request(
                N8N_WEBHOOK_URL,
                data=data,
                headers={"Content-Type": "application/json"},
                method="POST",
            )

        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                raw_bytes = response.read()
                raw_text = raw_bytes.decode("utf-8", errors="replace").strip()
                response_json = parse_json_safely(raw_text)
                assistant_reply = extract_assistant_reply(response_json)

                if assistant_reply is None:
                    assistant_reply = extract_assistant_reply(raw_text)

                return {
                    "sent": True,
                    "status": response.status,
                    "response": response_json,
                    "responseText": raw_text if raw_text else None,
                    "assistantReply": assistant_reply,
                    "attempts": attempt,
                }
        except urllib.error.HTTPError as err:
            if (
                attempt < max(N8N_RETRY_COUNT, 1)
                and err.code in {408, 429, 500, 502, 503, 504}
            ):
                time.sleep((N8N_RETRY_DELAY_MS * attempt) / 1000.0)
                continue
            return {
                "sent": False,
                "error": str(err),
                "status": err.code,
                "attempts": attempt,
            }
        except urllib.error.URLError as err:
            if attempt < max(N8N_RETRY_COUNT, 1):
                time.sleep((N8N_RETRY_DELAY_MS * attempt) / 1000.0)
                continue
            return {"sent": False, "error": str(err), "attempts": attempt}


async def notify_n8n(payload):
    return await asyncio.to_thread(post_n8n_payload, payload)


def build_automation_payload(
    analysis_mode,
    conversation_id,
    final_emotion,
    message,
    modalities,
    option,
    user_id,
):
    return {
        "event": "emotion_analysis_completed",
        "version": "1.0",
        "option": option,
        "analysisMode": analysis_mode,
        "promptText": message,
        "message": message,
        "emotion": final_emotion.get("emotion"),
        "confidence": final_emotion.get("confidence"),
        "supportedModes": ["text", "voice_text", "voice_text_image"],
        "userId": user_id,
        "conversationId": conversation_id,
        "finalEmotion": final_emotion,
        "modalities": modalities,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }


def build_voice_automation_payload(
    conversation_id,
    transcription,
    text_result,
    voice_result,
    fusion_result,
    option,
    user_id,
):
    transcript_text = (transcription or {}).get("text", "").strip()
    text_emotion = text_result.get("emotion") if text_result else None
    text_confidence = text_result.get("confidence") if text_result else None
    voice_emotion = voice_result.get("emotion") if voice_result else None
    voice_confidence = voice_result.get("confidence") if voice_result else None
    fusion_emotion = fusion_result.get("emotion") if fusion_result else None
    fusion_confidence = fusion_result.get("confidence") if fusion_result else None
    ai_input = (
        "Kullanici sesli mesaj gonderdi.\n"
        f"Sesten yazıya dokulen metin: {transcript_text or '(metin cikarilamadi)'}\n"
        "Backend duygu analizi sonucu:\n"
        f"- Text duygu: {text_emotion or '-'}\n"
        f"- Text guven skoru: {text_confidence if text_confidence is not None else '-'}\n"
        f"- Ses tonu duygu: {voice_emotion or '-'}\n"
        f"- Ses tonu guven skoru: {voice_confidence if voice_confidence is not None else '-'}\n"
        f"- Ortak/fusion duygu: {fusion_emotion or '-'}\n"
        f"- Ortak/fusion guven skoru: {fusion_confidence if fusion_confidence is not None else '-'}\n\n"
        "Bu metni ve backend analiz sonucunu birlikte dikkate alarak kullaniciya "
        "kisa, destekleyici ve uygulanabilir bir yanit uret."
    )

    fusion_decision = {
        "mode": fusion_result.get("mode") if fusion_result else None,
        "winnerModality": fusion_result.get("winner") if fusion_result else None,
        "winnerEmotion": fusion_result.get("winnerEmotion") if fusion_result else None,
        "winnerConfidence": (
            fusion_result.get("winnerConfidence")
            if fusion_result
            else None
        ),
        "agreement": fusion_result.get("agreement") if fusion_result else False,
        "modalitiesUsed": fusion_result.get("modalitiesUsed") if fusion_result else [],
        "textEmotion": text_emotion,
        "textConfidence": text_confidence,
        "voiceEmotion": voice_emotion,
        "voiceConfidence": voice_confidence,
        "fusionEmotion": fusion_emotion,
        "fusionConfidence": fusion_confidence,
        "weights": fusion_result.get("weights") if fusion_result else {},
    }

    return {
        "event": "voice_emotion_analysis_completed",
        "version": "1.0",
        "option": option,
        "analysisMode": "voice_text",
        "routingKey": "voice_text_fusion",
        "promptText": ai_input,
        "text": transcript_text,
        "message": ai_input,
        "aiInput": ai_input,
        "userMessage": transcript_text,
        "backendAnalysisSummary": (
            f"Text duygu: {text_emotion}; text guven: {text_confidence}; "
            f"ses duygu: {voice_emotion}; ses guven: {voice_confidence}; "
            f"ortak duygu: {fusion_emotion}; ortak guven: {fusion_confidence}."
        ),
        "transcript": transcript_text,
        "transcription": transcription,
        "emotion": fusion_emotion,
        "confidence": fusion_confidence,
        "textEmotion": text_emotion,
        "textConfidence": text_confidence,
        "voiceEmotion": voice_emotion,
        "voiceConfidence": voice_confidence,
        "fusionEmotion": fusion_emotion,
        "fusionConfidence": fusion_confidence,
        "fusionDecision": fusion_decision,
        "supportedModes": ["text", "voice_text", "voice_text_image"],
        "userId": user_id,
        "conversationId": conversation_id,
        "finalEmotion": {
            "emotion": fusion_emotion,
            "confidence": fusion_confidence,
            "probabilities": fusion_result.get("probabilities"),
            "weights": fusion_result.get("weights"),
            "mode": fusion_result.get("mode"),
            "winner": fusion_result.get("winner"),
            "agreement": fusion_result.get("agreement"),
        },
        "modalities": {
            "voice": {
                "emotion": voice_emotion,
                "confidence": voice_confidence,
                "probabilities": voice_result.get("probabilities"),
                "model": voice_result.get("model"),
                "chunks": voice_result.get("chunks"),
            },
            "text": {
                "input": transcript_text,
                "emotion": text_emotion,
                "confidence": text_confidence,
                "probabilities": text_result.get("probabilities") if text_result else None,
                "source": "speech_to_text",
            } if text_result else None,
            "fusion": {
                "mode": fusion_result.get("mode"),
                "emotion": fusion_emotion,
                "confidence": fusion_confidence,
                "probabilities": fusion_result.get("probabilities"),
                "weights": fusion_result.get("weights"),
                "winner": fusion_result.get("winner"),
                "winnerEmotion": fusion_result.get("winnerEmotion"),
                "winnerConfidence": fusion_result.get("winnerConfidence"),
                "agreement": fusion_result.get("agreement"),
            },
            "speechToText": {
                "text": transcript_text,
                "language": transcription.get("language"),
                "languageProbability": transcription.get("languageProbability"),
            },
        },
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }


def build_media_automation_payload(
    conversation_id,
    media_kind,
    filename,
    transcription,
    text_result,
    voice_result,
    visual_result,
    fusion_result,
    processing_errors,
    option,
    user_id,
):
    transcript_text = ((transcription or {}).get("text") or "").strip()
    visual_emotion = visual_result.get("emotion") if visual_result else None
    visual_confidence = visual_result.get("confidence") if visual_result else None
    text_emotion = text_result.get("emotion") if text_result else None
    text_confidence = text_result.get("confidence") if text_result else None
    voice_emotion = voice_result.get("emotion") if voice_result else None
    voice_confidence = voice_result.get("confidence") if voice_result else None
    fusion_emotion = fusion_result.get("emotion") if fusion_result else None
    fusion_confidence = fusion_result.get("confidence") if fusion_result else None
    visual_summary = (
        visual_result.get("summary")
        if visual_result
        else "Gorsel ozeti cikarilamadi."
    )
    visual_preview = visual_result.get("previewImage") if visual_result else None
    frame_previews = visual_result.get("framePreviews") if visual_result else []
    media_label = "video" if media_kind == "video" else "gorsel"
    transcript_line = (
        f"Videodan cikarilan transcript: {transcript_text}\n"
        if transcript_text
        else ""
    )
    error_line = (
        "\nIsleme notlari:\n- " + "\n- ".join(processing_errors)
        if processing_errors
        else ""
    )
    ai_input = (
        f"Kullanici bir {media_label} gonderdi.\n"
        f"Dosya: {filename or media_label}\n"
        f"Gorsel ozet: {visual_summary}\n"
        f"{transcript_line}"
        "Backend modalite analizi:\n"
        f"- Gorsel duygu: {visual_emotion or '-'}\n"
        f"- Gorsel guven skoru: {visual_confidence if visual_confidence is not None else '-'}\n"
        f"- Ses tonu duygu: {voice_emotion or '-'}\n"
        f"- Ses tonu guven skoru: {voice_confidence if voice_confidence is not None else '-'}\n"
        f"- Transcript text duygu: {text_emotion or '-'}\n"
        f"- Transcript text guven skoru: {text_confidence if text_confidence is not None else '-'}\n"
        f"- Ortak/fusion duygu: {fusion_emotion or '-'}\n"
        f"- Ortak/fusion guven skoru: {fusion_confidence if fusion_confidence is not None else '-'}\n"
        f"{error_line}\n\n"
        "Bu gorseli ve varsa transcript bilgisini birlikte dikkate alarak "
        "kisa, destekleyici ve uygulanabilir bir yanit uret."
    )

    return {
        "event": "media_emotion_analysis_completed",
        "version": "1.0",
        "option": option,
        "analysisMode": "voice_text_image",
        "routingKey": "voice_text_image_fusion",
        "mediaKind": media_kind,
        "filename": filename,
        "promptText": ai_input,
        "message": ai_input,
        "aiInput": ai_input,
        "text": transcript_text or visual_summary,
        "userMessage": transcript_text or visual_summary,
        "transcript": transcript_text,
        "transcription": transcription,
        "visualSummary": visual_summary,
        "visualPreview": visual_preview,
        "framePreviews": frame_previews,
        "processingErrors": processing_errors,
        "emotion": fusion_emotion,
        "confidence": fusion_confidence,
        "visualEmotion": visual_emotion,
        "visualConfidence": visual_confidence,
        "textEmotion": text_emotion,
        "textConfidence": text_confidence,
        "voiceEmotion": voice_emotion,
        "voiceConfidence": voice_confidence,
        "fusionEmotion": fusion_emotion,
        "fusionConfidence": fusion_confidence,
        "fusionDecision": {
            "mode": fusion_result.get("mode") if fusion_result else None,
            "winnerModality": fusion_result.get("winner") if fusion_result else None,
            "winnerEmotion": fusion_result.get("winnerEmotion") if fusion_result else None,
            "winnerConfidence": (
                fusion_result.get("winnerConfidence")
                if fusion_result
                else None
            ),
            "agreement": fusion_result.get("agreement") if fusion_result else False,
            "modalitiesUsed": fusion_result.get("modalitiesUsed") if fusion_result else [],
            "visualEmotion": visual_emotion,
            "visualConfidence": visual_confidence,
            "textEmotion": text_emotion,
            "textConfidence": text_confidence,
            "voiceEmotion": voice_emotion,
            "voiceConfidence": voice_confidence,
            "fusionEmotion": fusion_emotion,
            "fusionConfidence": fusion_confidence,
            "weights": fusion_result.get("weights") if fusion_result else {},
        },
        "supportedModes": ["text", "voice_text", "voice_text_image"],
        "userId": user_id,
        "conversationId": conversation_id,
        "finalEmotion": {
            "emotion": fusion_emotion,
            "confidence": fusion_confidence,
            "probabilities": fusion_result.get("probabilities") if fusion_result else None,
            "weights": fusion_result.get("weights") if fusion_result else None,
            "mode": fusion_result.get("mode") if fusion_result else None,
            "winner": fusion_result.get("winner") if fusion_result else None,
            "agreement": fusion_result.get("agreement") if fusion_result else None,
        },
        "modalities": {
            "visual": visual_result,
            "voice": voice_result,
            "text": text_result,
            "speechToText": transcription if transcript_text else None,
        },
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/predict")
def predict(req: TextRequest):
    return predict_text_analysis(req.text)


@app.on_event("startup")
async def startup_warmup():
    await asyncio.to_thread(warmup_voice_stack)


@app.post("/predict-voice")
async def predict_voice(
    audio: UploadFile = File(...),
    userId: str = Form("demo-user"),
    conversationId: str = Form("demo-conversation"),
    notifyN8n: bool = Form(True),
):
    suffix = Path(audio.filename or "voice.m4a").suffix or ".m4a"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_audio:
        temp_audio.write(await audio.read())
        temp_audio_path = temp_audio.name

    try:
        voice_result = get_voice_predictor()(temp_audio_path)
        transcription = transcribe_audio(temp_audio_path)
        transcript_text = transcription["text"].strip()
        text_result = predict_text_analysis(transcript_text) if transcript_text else None
        fusion_result = fuse_emotions(text_result, voice_result)
        option = "2-ses+text"

        automation_payload = build_voice_automation_payload(
            conversation_id=conversationId,
            transcription=transcription,
            text_result=text_result,
            voice_result=voice_result,
            fusion_result=fusion_result,
            option=option,
            user_id=userId,
        )
        automation = await notify_n8n(automation_payload) if notifyN8n else None
        assistant_reply = (
            automation.get("assistantReply")
            if isinstance(automation, dict)
            else None
        )
        activity = extract_payload_field(automation, "activity")
        movie = extract_payload_field(automation, "movie")
        book = extract_payload_field(automation, "book")
        spotify = extract_payload_field(automation, "spotify")

        return {
            "filename": audio.filename,
            "transcript": transcript_text,
            "transcription": transcription,
            "text": text_result,
            "voice": voice_result,
            "fusion": fusion_result,
            "fusionDecision": automation_payload.get("fusionDecision"),
            "emotion": fusion_result.get("emotion"),
            "confidence": fusion_result.get("confidence"),
            "assistantReply": assistant_reply,
            "activity": activity,
            "aktivite": activity,
            "movie": movie,
            "book": book,
            "spotify": spotify,
            "automation": automation,
            "automationPayload": automation_payload,
        }
    finally:
        if os.path.exists(temp_audio_path):
            os.remove(temp_audio_path)


@app.post("/predict-media")
async def predict_media(
    media: UploadFile = File(...),
    mediaKind: str = Form("auto"),
    userId: str = Form("demo-user"),
    conversationId: str = Form("demo-conversation"),
    notifyN8n: bool = Form(True),
):
    resolved_kind = mediaKind.strip().lower() if mediaKind else "auto"
    if resolved_kind not in {"image", "video"}:
        resolved_kind = guess_media_kind(media.filename, media.content_type)

    suffix = Path(media.filename or ("media.mp4" if resolved_kind == "video" else "media.jpg")).suffix
    if not suffix:
        suffix = ".mp4" if resolved_kind == "video" else ".jpg"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_media:
        temp_media.write(await media.read())
        temp_media_path = temp_media.name

    try:
        processing_errors = []
        transcription = {
            "text": "",
            "language": None,
            "languageProbability": None,
            "qualityScore": None,
            "avgLogProb": None,
            "rejectedByLanguageGuard": False,
        }
        text_result = None
        voice_result = None

        if resolved_kind == "video":
            visual_result = analyze_video_file(temp_media_path)

            try:
                transcription = transcribe_audio(temp_media_path)
            except Exception as err:
                processing_errors.append(f"Video transcript cikartilamadi: {err}")

            transcript_text = transcription.get("text", "").strip()
            if transcript_text:
                text_result = predict_text_analysis(transcript_text)

            try:
                voice_result = get_voice_predictor()(temp_media_path)
            except Exception as err:
                processing_errors.append(f"Video ses tonu analiz edilemedi: {err}")
        else:
            try:
                image_frame = load_image_frame(temp_media_path)
            except UnidentifiedImageError as err:
                raise HTTPException(
                    status_code=415,
                    detail=(
                        "Fotoğraf formatı okunamadı. iPhone HEIC göndermiş olabilir; "
                        "lütfen JPEG uyumlu fotoğraf yükle."
                    ),
                ) from err
            visual_result = analyze_visual_frame(image_frame)
            visual_result["previewImage"] = encode_frame_data_url(image_frame)

        fusion_result = fuse_modalities(
            {
                "visual": visual_result,
                "text": text_result,
                "voice": voice_result,
            }
        )
        option = "3-goruntu"
        automation_payload = build_media_automation_payload(
            conversation_id=conversationId,
            media_kind=resolved_kind,
            filename=media.filename,
            transcription=transcription,
            text_result=text_result,
            voice_result=voice_result,
            visual_result=visual_result,
            fusion_result=fusion_result,
            processing_errors=processing_errors,
            option=option,
            user_id=userId,
        )
        automation = await notify_n8n(automation_payload) if notifyN8n else None
        assistant_reply = (
            automation.get("assistantReply")
            if isinstance(automation, dict)
            else None
        )
        activity = extract_payload_field(automation, "activity")
        movie = extract_payload_field(automation, "movie")
        book = extract_payload_field(automation, "book")
        spotify = extract_payload_field(automation, "spotify")

        return {
            "filename": media.filename,
            "mediaKind": resolved_kind,
            "transcript": transcription.get("text", "").strip(),
            "transcription": transcription,
            "visual": visual_result,
            "text": text_result,
            "voice": voice_result,
            "fusion": fusion_result,
            "fusionDecision": automation_payload.get("fusionDecision"),
            "emotion": fusion_result.get("emotion"),
            "confidence": fusion_result.get("confidence"),
            "visualEmotion": visual_result.get("emotion") if visual_result else None,
            "visualConfidence": visual_result.get("confidence") if visual_result else None,
            "visualSummary": visual_result.get("summary") if visual_result else None,
            "visualPreview": visual_result.get("previewImage") if visual_result else None,
            "framePreviews": visual_result.get("framePreviews") if visual_result else None,
            "textEmotion": text_result.get("emotion") if text_result else None,
            "textConfidence": text_result.get("confidence") if text_result else None,
            "voiceEmotion": voice_result.get("emotion") if voice_result else None,
            "voiceConfidence": voice_result.get("confidence") if voice_result else None,
            "fusionEmotion": fusion_result.get("emotion"),
            "fusionConfidence": fusion_result.get("confidence"),
            "frameStats": visual_result.get("frameStats") if visual_result else None,
            "assistantReply": assistant_reply,
            "activity": activity,
            "aktivite": activity,
            "movie": movie,
            "book": book,
            "spotify": spotify,
            "processingErrors": processing_errors,
            "automation": automation,
            "automationPayload": automation_payload,
        }
    finally:
        if os.path.exists(temp_media_path):
            os.remove(temp_media_path)

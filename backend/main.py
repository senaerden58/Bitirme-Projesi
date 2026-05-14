from datetime import datetime, timezone
from pathlib import Path
import asyncio
import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from fastapi import FastAPI, File, Form, UploadFile
from faster_whisper import WhisperModel
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


def normalize_probabilities(probabilities):
    return {
        label: float((probabilities or {}).get(label, 0))
        for label in FUSION_LABELS
    }


def fuse_emotions(text_result, voice_result):
    available = []

    if text_result:
        available.append(("text", text_result))

    if voice_result:
        available.append(("voice", voice_result))

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
    agreement = (
        bool(text_result and voice_result)
        and text_result.get("emotion") == voice_result.get("emotion")
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

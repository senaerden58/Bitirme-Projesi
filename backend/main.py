from fastapi import FastAPI
from pydantic import BaseModel
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch
import os
import re

app = FastAPI()
NEUTRAL_CONFIDENCE_THRESHOLD = 0.60

EMOTION_WORDS = {
    "mutlu", "mutluyum", "sevindim", "sevinçli", "neşeli", "harika", "güzel",
    "üzgün", "üzüldüm", "mutsuz", "kötü", "ağladım", "yalnız",
    "korktum", "korkuyorum", "korkunç", "korku", "endişeli", "kaygılı",
    "sinirli", "sinirlendim", "kızgın", "öfke", "öfkeli",
    "şaşırdım", "şaşkın", "iğrenç", "tiksindim",
}

ROUTINE_PATTERNS = [
    r"\b(işe|isime|işime|okula|derse|kurs?a)\s+git",
    r"\b(eve|okuldan|işten|isten)\s+(gel|dön)",
    r"\b(yemek|kahvaltı|öğle yemeği|akşam yemeği)\s+(ye|yedim|yiyorum|yiyeceğim|yicem)",
    r"\b(su|çay|kahve)\s+(iç|içtim|içiyorum|içeceğim|içicem)",
    r"\b(uyan|uyandım|uyanıyorum|kalktım|kalkıyorum)\b",
    r"\b(uyu|uyudum|uyuyorum|yatıyorum|yattım)\b",
    r"\b(elimi|ellerimi|yüzümü|yuzumu|elimi yüzümü|elimi yuzumu)\s+yıka",
    r"\b(dişimi|dişlerimi|disimi|dislerimi)\s+fırçala",
    r"\b(duş|banyo)\s+(al|aldım|alıyorum|yap)",
    r"\b(ders|ödev|odev)\s+(çalış|çalıştım|yap|yaptım)",
    r"\b(otobüse|otobuse|metroya|servise|taksiye)\s+bin",
]


def is_routine_text(text: str) -> bool:
    normalized = text.casefold()
    words = re.findall(r"\w+", normalized, flags=re.UNICODE)

    if any(word in EMOTION_WORDS for word in words):
        return False

    return any(
        re.search(pattern, normalized, flags=re.IGNORECASE | re.UNICODE)
        for pattern in ROUTINE_PATTERNS
    )

# ---------------- MODEL ----------------
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

model_path = os.path.join(
    os.getcwd(),
    "emotion-service",
    "emotionModels",
    "emotionText"
)

tokenizer = AutoTokenizer.from_pretrained(model_path, use_fast=True)
model = AutoModelForSequenceClassification.from_pretrained(model_path)

model.to(device)
model.eval()

id2label = {
    0: "anger",
    1: "disgust",
    2: "fear",
    3: "happy",
    4: "neutral",
    5: "sadness",
    6: "surprise"
}

# ---------------- REQUEST ----------------
class TextRequest(BaseModel):
    text: str

# ---------------- ROUTE ----------------
@app.post("/predict")
def predict(req: TextRequest):

    inputs = tokenizer(
        req.text,
        return_tensors="pt",
        truncation=True,
        padding=True
    )

    inputs = {k: v.to(device) for k, v in inputs.items()}

    with torch.no_grad():
        outputs = model(**inputs)

    probs = torch.softmax(outputs.logits, dim=1)[0]
    pred_id = torch.argmax(probs).item()
    confidence = probs[pred_id].item()
    emotion = id2label[pred_id]

    if confidence < NEUTRAL_CONFIDENCE_THRESHOLD or is_routine_text(req.text):
        emotion = "neutral"

    return {
        "text": req.text,
        "emotion": emotion,
        "confidence": round(confidence, 4)
    }

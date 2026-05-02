from fastapi import FastAPI
from pydantic import BaseModel
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch
import os

app = FastAPI()

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

    return {
        "text": req.text,
        "emotion": id2label[pred_id],
        "confidence": round(probs[pred_id].item(), 4)
    }
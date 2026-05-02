from fastapi import FastAPI
from pydantic import BaseModel
import torch
from nltk.tokenize import sent_tokenize
import nltk

from load_model.load_text_model import load_text_model

app = FastAPI()

nltk.download("punkt", quiet=True)

tokenizer, model, label_map = load_text_model()

class TextRequest(BaseModel):
    text: str


def predict_emotion(text: str):
    sentences = sent_tokenize(text, language="turkish")

    counts = {}

    for sent in sentences:
        inputs = tokenizer(sent, return_tensors="pt", truncation=True, padding=True)

        with torch.no_grad():
            outputs = model(**inputs)

        pred = torch.argmax(outputs.logits, dim=1).item()
        label = label_map[pred]

        if label != "Ambigious":
            counts[label] = counts.get(label, 0) + 1

    return max(counts, key=counts.get) if counts else "Ambigious"


@app.post("/predict")
def predict(req: TextRequest):
    emotion = predict_emotion(req.text)

    return {
        "emotion": emotion
    }
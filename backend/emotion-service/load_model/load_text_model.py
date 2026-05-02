# load_model/load_text_model.py
import torch
from transformers import AutoTokenizer, BertForSequenceClassification

def load_text_model():
    MODEL_PATH = "C:/Users/MONSTER/Desktop/my-app/backend/emotion-service/models/best_model.pt"
    TOKENIZER_NAME = "dbmdz/bert-base-turkish-cased"
    NUM_LABELS = 7

    # Duygu etiketleri
    label_map = {
        0: "Ambigious",
        1: "Anger",
        2: "Disgust",
        3: "Fear",
        4: "Happy",
        5: "Sadness",
        6: "Surprise"
    }

    print("Model yükleniyor, lütfen bekleyin...")

    # Tokenizer
    tokenizer = AutoTokenizer.from_pretrained(TOKENIZER_NAME, local_files_only=True)

    # Model yapısını tanımla ve ağırlıkları yükle
    model = BertForSequenceClassification.from_pretrained(
        TOKENIZER_NAME,
        num_labels=NUM_LABELS,
        local_files_only=True
    )
    state_dict = torch.load(MODEL_PATH, map_location="cpu")
    model.load_state_dict(state_dict)
    model.eval()

    print("✅ Model yüklendi ve cache’e alındı!")
    return tokenizer, model, label_map

if __name__ == "__main__":
    tokenizer, model, label_map = load_text_model()
    print("MODEL YÜKLENDİ")

    text = "I am very happy"

    inputs = tokenizer(text, return_tensors="pt")

    with torch.no_grad():
        logits = model(**inputs).logits
        pred = torch.argmax(logits, dim=1).item()

    print("PRED:", label_map[pred])
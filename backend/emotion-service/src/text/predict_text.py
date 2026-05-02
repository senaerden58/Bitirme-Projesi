# src/text/predict_text.py
import torch
from nltk.tokenize import sent_tokenize
import nltk
import sys
import os

# load_model klasörünü path’e ekle
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../load_model")))
from load_text_model import load_text_model

nltk.download('punkt', quiet=True)

# Modeli ve tokenizer’ı bir kez yükle
tokenizer, model, label_map = load_text_model()

def predict_sentence_emotions(text):
    sentences = sent_tokenize(text, language='turkish')
    sentence_results = []
    for sent in sentences:
        inputs = tokenizer(sent, return_tensors="pt", truncation=True, padding=True)
        with torch.no_grad():
            outputs = model(**inputs)
        pred = torch.argmax(outputs.logits, dim=1).item()
        sentence_results.append((sent, label_map[pred]))
    return sentence_results

def weighted_paragraph_emotion(text):
    sentence_results = predict_sentence_emotions(text)
    counts = {}
    for _, label in sentence_results:
        if label != "Ambigious":
            counts[label] = counts.get(label, 0) + 1
    final_emotion = max(counts, key=counts.get) if counts else "Ambigious"
    return final_emotion, sentence_results

# Konsol giriş döngüsü
print("Duygu tahmin modeline hoşgeldiniz!")
while True:
    text = input("Lütfen metni girin (çıkmak için 'q' yazın): ")
    if text.lower() == 'q':
        print("Programdan çıkılıyor...")
        break

    final_emotion, sentence_results = weighted_paragraph_emotion(text)
    print("\n📌 Paragraf tahmini (ağırlıklı):", final_emotion)
    print("📄 Cümle cümle tahminler:")
    for sent, label in sentence_results:
        print(f"{label} → {sent}")
    print("\n" + "-"*50 + "\n")
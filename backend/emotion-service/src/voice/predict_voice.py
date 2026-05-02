# -*- coding: utf-8 -*-
import torch
import torch.nn as nn
import numpy as np
import librosa
import sounddevice as sd
import matplotlib.pyplot as plt

# -----------------------
# CNN Model (DeepCNN)
# -----------------------
class DeepCNN(nn.Module):
    def __init__(self, num_classes=8, flatten_size=2880):
        super().__init__()
        self.conv1 = nn.Conv2d(1, 16, 3, padding=1)
        self.bn1 = nn.BatchNorm2d(16)
        self.conv2 = nn.Conv2d(16, 32, 3, padding=1)
        self.bn2 = nn.BatchNorm2d(32)
        self.conv3 = nn.Conv2d(32, 64, 3, padding=1)
        self.bn3 = nn.BatchNorm2d(64)
        self.pool = nn.MaxPool2d(2,2)
        self.dropout = nn.Dropout(0.3)
        self.fc1 = nn.Linear(flatten_size, 128)
        self.fc2 = nn.Linear(128, num_classes)
        self.relu = nn.ReLU()

    def forward(self, x):
        x = self.relu(self.bn1(self.conv1(x)))
        x = self.pool(x)
        x = self.relu(self.bn2(self.conv2(x)))
        x = self.pool(x)
        x = self.relu(self.bn3(self.conv3(x)))
        x = self.pool(x)
        x = x.view(x.size(0), -1)
        x = self.dropout(self.relu(self.fc1(x)))
        x = self.fc2(x)
        return x

# -----------------------
# Ayarlar ve Model Yükleme
# -----------------------
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
model_path = "C:/Users/MONSTER/Desktop/emotion/models/seswav.pt"
model = DeepCNN()
model.load_state_dict(torch.load(model_path, map_location=device))
model.to(device)
model.eval()

SAMPLE_RATE = 16000
WINDOW_SIZE = 1  # saniye
STRIDE = 0.5

# -----------------------
# Ses kaydı
# -----------------------
def record_audio(duration=WINDOW_SIZE, sr=SAMPLE_RATE):
    print("Konuşmaya hazır, lütfen konuşun...")
    audio = sd.rec(int(duration*sr), samplerate=sr, channels=1, dtype='float32')
    sd.wait()
    return audio.flatten()

# -----------------------
# MFCC çıkarma (sliding window)
# -----------------------
def extract_mfcc_chunks(audio, sr=SAMPLE_RATE, n_mfcc=40, window_size=WINDOW_SIZE, stride=STRIDE):
    window_samples = int(window_size*sr)
    stride_samples = int(stride*sr)

    if len(audio) < window_samples:
        audio = np.pad(audio, (0, window_samples - len(audio)))

    chunks = []
    for start in range(0, len(audio)-window_samples+1, stride_samples):
        chunk = audio[start:start+window_samples]
        chunk = (chunk - np.mean(chunk)) / (np.std(chunk)+1e-9)
        mfcc = librosa.feature.mfcc(y=chunk, sr=sr, n_mfcc=n_mfcc)
        # padding eksiğe göre
        if mfcc.shape[1] < 72:
            mfcc = np.pad(mfcc, ((0,0),(0,72-mfcc.shape[1])), mode='constant')
        chunks.append(mfcc)
    return chunks

# -----------------------
# Duygu Map
# -----------------------
emotion_map = {
    0: "neutral",
    1: "calm",
    2: "happy",
    3: "sad",
    4: "angry",
    5: "fearful",
    6: "disgust",
    7: "surprised"
}

# -----------------------
# Tahmin ve Görselleştirme
# -----------------------
def predict_audio_emotions_with_probs(audio):
    chunks = extract_mfcc_chunks(audio)

    if len(chunks) == 0:
        print("⚠️ Chunk üretilmedi, ses çok kısa veya ayarlar yanlış.")
        return None

    all_preds = []
    all_probs = []

    for i, mfcc in enumerate(chunks):
        mfcc_tensor = torch.tensor(mfcc[np.newaxis, np.newaxis, :, :], dtype=torch.float32).to(device)
        with torch.no_grad():
            output = model(mfcc_tensor)
            probs = torch.softmax(output, dim=1).cpu().numpy().flatten()
            pred_idx = np.argmax(probs)

            all_preds.append(pred_idx)
            all_probs.append(probs)

            print(f"Chunk {i+1}: {[(emotion_map[j], round(p,2)) for j,p in enumerate(probs)]}")

    # Mod ile genel tahmin
    final_pred_idx = max(set(all_preds), key=all_preds.count)
    final_pred_label = emotion_map[final_pred_idx]

    # Grafik
    all_probs = np.array(all_probs)
    plt.figure(figsize=(12,4))
    for j in range(len(emotion_map)):
        plt.plot(all_probs[:, j], label=emotion_map[j])
    plt.xlabel("Chunk Numarası")
    plt.ylabel("Olasılık")
    plt.title(f"Chunk Bazlı Duygu Olasılıkları\nGenel Tahmin: {final_pred_label}")
    plt.legend()
    plt.grid(True)
    plt.show()

    return final_pred_label

# -----------------------
# Kullanım
# -----------------------
audio = record_audio()
final_emotion = predict_audio_emotions_with_probs(audio)
print("🎯 Sesin genel tahmini:", final_emotion)
chunks = extract_mfcc_chunks(audio)
print("Chunk sayısı:", len(chunks))
for i, c in enumerate(chunks):
    print(f"Chunk {i+1} shape: {c.shape}")

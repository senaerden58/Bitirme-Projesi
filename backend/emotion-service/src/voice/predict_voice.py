# -*- coding: utf-8 -*-
from pathlib import Path
import os

import numpy as np
import soundfile as sf
import torch
import torch.nn as nn
import torchaudio
from faster_whisper.audio import decode_audio
from transformers import WavLMConfig, WavLMModel


SAMPLE_RATE = 16000
MIN_AUDIO_SECONDS = 1
CHUNK_SECONDS = 5

EMOTION_MAP = {
    0: "neutral",
    1: "calm",
    2: "happy",
    3: "sadness",
    4: "anger",
    5: "fear",
    6: "disgust",
    7: "surprise",
}

MODEL_PATH = Path(__file__).resolve().parents[2] / "models" / "seswav.pt"
USE_CUDA = os.getenv("USE_CUDA", "0").strip().lower() in {"1", "true", "yes", "on"}
DEVICE_NAME = "cuda" if USE_CUDA and torch.cuda.is_available() else "cpu"
device = torch.device(DEVICE_NAME)


class EmotionModel(nn.Module):
    def __init__(self, num_classes=8):
        super().__init__()
        self.wavlm = WavLMModel(WavLMConfig())
        self.classifier = nn.Sequential(
            nn.Linear(768, 256),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(256, num_classes),
        )

    def forward(self, x):
        out = self.wavlm(input_values=x)
        x = out.last_hidden_state.mean(dim=1)
        return self.classifier(x)


model = EmotionModel()
model.load_state_dict(torch.load(MODEL_PATH, map_location=device))
model.to(device)
model.eval()


def load_audio_file(file_path):
    try:
        waveform, sr = torchaudio.load(file_path)
        if waveform.shape[0] > 1:
            waveform = waveform.mean(dim=0, keepdim=True)

        if sr != SAMPLE_RATE:
            waveform = torchaudio.functional.resample(waveform, sr, SAMPLE_RATE)

        audio = waveform.squeeze(0).numpy()
    except Exception as torchaudio_error:
        try:
            audio, sr = sf.read(file_path, dtype="float32")

            if audio.ndim > 1:
                audio = audio.mean(axis=1)

            if sr != SAMPLE_RATE:
                waveform = torch.tensor(audio, dtype=torch.float32).unsqueeze(0)
                audio = (
                    torchaudio.functional.resample(waveform, sr, SAMPLE_RATE)
                    .squeeze(0)
                    .numpy()
                )
        except Exception as soundfile_error:
            try:
                audio = decode_audio(file_path, sampling_rate=SAMPLE_RATE)
            except Exception as decode_error:
                raise RuntimeError(
                    "Ses dosyasi okunamadi."
                    f" torchaudio: {torchaudio_error};"
                    f" soundfile: {soundfile_error};"
                    f" decode_audio: {decode_error}"
                ) from decode_error

    return normalize_audio(audio.astype(np.float32))


def normalize_audio(audio):
    if len(audio) == 0:
        raise ValueError("Ses dosyasi bos.")

    audio = audio - float(np.mean(audio))
    std = float(np.std(audio))

    if std > 1e-9:
        audio = audio / std

    minimum_samples = SAMPLE_RATE * MIN_AUDIO_SECONDS
    if len(audio) < minimum_samples:
        audio = np.pad(audio, (0, minimum_samples - len(audio)))

    return audio.astype(np.float32)


def split_audio(audio):
    chunk_samples = SAMPLE_RATE * CHUNK_SECONDS

    if len(audio) <= chunk_samples:
        return [audio]

    chunks = []
    for start in range(0, len(audio), chunk_samples):
        chunk = audio[start : start + chunk_samples]
        if len(chunk) >= SAMPLE_RATE:
            chunks.append(chunk)

    return chunks


def predict_audio_emotions_with_probs(audio):
    chunks = split_audio(audio)

    if not chunks:
        raise ValueError("Ses cok kisa veya parcalara ayrilamadi.")

    all_probs = []

    for chunk in chunks:
        input_values = torch.tensor(chunk, dtype=torch.float32).unsqueeze(0).to(device)

        with torch.no_grad():
            output = model(input_values)
            probs = torch.softmax(output, dim=1).cpu().numpy().flatten()
            all_probs.append(probs)

    avg_probs = np.mean(np.array(all_probs), axis=0)
    pred_idx = int(np.argmax(avg_probs))

    return {
        "emotion": EMOTION_MAP[pred_idx],
        "confidence": round(float(avg_probs[pred_idx]), 4),
        "probabilities": {
            EMOTION_MAP[index]: round(float(probability), 4)
            for index, probability in enumerate(avg_probs)
        },
        "chunks": len(chunks),
        "model": "wavlm",
    }


def predict_voice_file(file_path):
    audio = load_audio_file(file_path)
    return predict_audio_emotions_with_probs(audio)

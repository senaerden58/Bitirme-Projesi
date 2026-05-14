const express = require("express");
const cors = require("cors");
const { admin, db, projectId } = require("./firebase/firebaseAdmin");

const app = express();
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "";
const N8N_WEBHOOK_METHOD = "POST";
const N8N_TIMEOUT_MS = Number(process.env.N8N_TIMEOUT_MS || 30000);
const N8N_RETRY_COUNT = Number(process.env.N8N_RETRY_COUNT || 3);
const N8N_RETRY_DELAY_MS = Number(process.env.N8N_RETRY_DELAY_MS || 1200);
const EMOTION_SERVICE_URL =
  process.env.EMOTION_SERVICE_URL || "http://127.0.0.1:8000/predict";
const EMOTION_TIMEOUT_MS = Number(process.env.EMOTION_TIMEOUT_MS || 2500);
const EMOTION_RETRY_COUNT = Number(process.env.EMOTION_RETRY_COUNT || 4);
const EMOTION_RETRY_DELAY_MS = Number(
  process.env.EMOTION_RETRY_DELAY_MS || 300,
);

app.use(cors());
app.use(express.json());

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJsonParse(rawText) {
  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}

function extractAssistantReply(payload) {
  if (payload == null) {
    return null;
  }

  if (typeof payload === "string") {
    const text = payload.trim();
    return text.length > 0 ? text : null;
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = extractAssistantReply(item);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (typeof payload === "object") {
    const preferredKeys = [
      "assistantReply",
      "aiReply",
      "reply",
      "response",
      "message",
      "output",
      "text",
      "content",
      "data",
    ];

    for (const key of preferredKeys) {
      if (key in payload) {
        const found = extractAssistantReply(payload[key]);
        if (found) {
          return found;
        }
      }
    }

    for (const value of Object.values(payload)) {
      const found = extractAssistantReply(value);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function extractPayloadField(payload, fieldName) {
  if (payload == null) {
    return null;
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = extractPayloadField(item, fieldName);
      if (found != null) {
        return found;
      }
    }
    return null;
  }

  if (typeof payload === "object") {
    if (payload[fieldName] != null) {
      return payload[fieldName];
    }

    for (const key of ["response", "data", "body", "json"]) {
      if (key in payload) {
        const found = extractPayloadField(payload[key], fieldName);
        if (found != null) {
          return found;
        }
      }
    }
  }

  return null;
}

async function notifyN8n(payload) {
  if (!N8N_WEBHOOK_URL) {
    return null;
  }

  for (let attempt = 1; attempt <= N8N_RETRY_COUNT; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), N8N_TIMEOUT_MS);

    try {
      const useGet = N8N_WEBHOOK_METHOD === "GET";
      const url = new URL(N8N_WEBHOOK_URL);
      const requestOptions = {
        method: useGet ? "GET" : "POST",
        signal: controller.signal,
      };

      if (useGet) {
        for (const [key, value] of Object.entries(payload)) {
          if (value == null) continue;
          if (
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean"
          ) {
            url.searchParams.set(key, String(value));
          }
        }
        url.searchParams.set("payload", JSON.stringify(payload));
      } else {
        requestOptions.headers = {
          "Content-Type": "application/json",
        };
        requestOptions.body = JSON.stringify(payload);
      }

      const response = await fetch(url, requestOptions);

      if (!response.ok) {
        const error = new Error(`n8n webhook failed: ${response.status}`);
        error.status = response.status;
        throw error;
      }

      const responseText = (await response.text()).trim();
      const responseJson = safeJsonParse(responseText);
      const assistantReply =
        extractAssistantReply(responseJson) ||
        extractAssistantReply(responseText);

      return {
        sent: true,
        status: response.status,
        response: responseJson,
        responseText: responseText || null,
        assistantReply,
        attempts: attempt,
      };
    } catch (err) {
      const status = err?.status;
      const retryable =
        err?.name === "AbortError" ||
        status === 408 ||
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504;

      if (attempt < N8N_RETRY_COUNT && retryable) {
        await sleep(N8N_RETRY_DELAY_MS * attempt);
        continue;
      }

      if (err?.name === "AbortError") {
        return {
          sent: false,
          error: `n8n webhook timeout (${N8N_TIMEOUT_MS}ms)`,
          attempts: attempt,
        };
      }

      console.log("N8N ERROR:", err);
      return {
        sent: false,
        error: err.message,
        status,
        attempts: attempt,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function buildAutomationPayload({
  analysisMode,
  conversationId,
  finalEmotion,
  message,
  modalities,
  option,
  recommendation,
  userId,
}) {
  return {
    event: "emotion_analysis_completed",
    version: "1.0",
    option,
    analysisMode,
    promptText: message,
    text: message,
    message,
    emotion: finalEmotion?.emotion,
    confidence: finalEmotion?.confidence,
    supportedModes: ["text", "voice_text", "voice_text_image"],
    userId,
    conversationId,
    finalEmotion,
    modalities,
    recommendation,
    createdAt: new Date().toISOString(),
  };
}

app.get("/", (req, res) => {
  res.json({
    status: "API calisiyor",
    firebaseProjectId: projectId,
  });
});

app.get("/test-db", async (req, res) => {
  try {
    await db.collection("test").add({
      message: "firebase çalışıyor 🚀",
      createdAt: new Date(),
    });

    res.send("Firebase çalışıyor ✅");
  } catch (err) {
    console.log(err);
    res.send("Firebase hata ❌");
  }
});

console.log(
  N8N_WEBHOOK_URL
    ? `N8N webhook aktif: ${N8N_WEBHOOK_METHOD} ${N8N_WEBHOOK_URL}`
    : "N8N webhook kapali: N8N_WEBHOOK_URL bos.",
);

function buildRecommendation(emotion, confidence) {
  const normalizedEmotion = String(emotion || "neutral").toLowerCase();
  const response = {
    emotion,
    confidence,
    tavsiye: "Kendini dinlemek icin kisa bir mola ver.",
    aktivite: "5 dakikalik nefes egzersizi",
    movie: "Soul",
    book: "Simyaci",
    spotify: "Haftalik Kesif",
  };

  if (normalizedEmotion === "sadness" || normalizedEmotion === "sad") {
    return {
      ...response,
      tavsiye: "Biraz disari cikmak ve hafif bir yuruyus yapmak iyi gelebilir.",
      aktivite: "Doga yuruyusu",
      movie: "Inside Out",
      book: "Kucuk Prens",
      spotify: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
    };
  }

  if (normalizedEmotion === "happy") {
    return {
      ...response,
      tavsiye: "Bu guzel enerjiyi bugun kucuk bir hedefe yonlendirebilirsin.",
      aktivite: "Arkadaslarla bulus",
      movie: "La La Land",
      book: "Marti Jonathan Livingston",
      spotify: "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b",
    };
  }

  if (normalizedEmotion === "anger") {
    return {
      ...response,
      tavsiye:
        "Once bedenini sakinlestir; sonra neye ihtiyacin oldugunu daha net gorebilirsin.",
      aktivite: "Nefes egzersizi",
      movie: "The Secret Life of Walter Mitty",
      book: "Duygusal Zeka",
      spotify: "https://open.spotify.com/track/1dGr1c8CrMLDpV6mPbImSI",
    };
  }

  if (normalizedEmotion === "fear") {
    return {
      ...response,
      tavsiye:
        "Endiseyi kucuk parcalara bolmek, kontrol hissini geri getirebilir.",
      aktivite: "Dusunce gunlugu",
      movie: "A Beautiful Day in the Neighborhood",
      book: "Kaygi Cagi",
      spotify: "Sakin Odak",
    };
  }

  return response;
}

async function predictEmotionOnce(message) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EMOTION_TIMEOUT_MS);

  try {
    const emotionRes = await fetch(EMOTION_SERVICE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({ text: message }),
    });

    if (!emotionRes.ok) {
      throw new Error(`Emotion service failed: ${emotionRes.status}`);
    }

    return emotionRes.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function predictEmotion(message) {
  let lastError = null;

  for (let attempt = 1; attempt <= EMOTION_RETRY_COUNT; attempt += 1) {
    try {
      return await predictEmotionOnce(message);
    } catch (err) {
      lastError = err;

      if (attempt < EMOTION_RETRY_COUNT) {
        await sleep(EMOTION_RETRY_DELAY_MS * attempt);
      }
    }
  }

  throw lastError || new Error("Emotion service is unavailable");
}

async function saveChatLog({
  conversationId,
  emotionData,
  message,
  recommendation,
  userId,
}) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const userRef = db.collection("users").doc(userId);
  const conversationRef = userRef
    .collection("conversations")
    .doc(conversationId);
  const userMessageRef = conversationRef.collection("messages").doc();
  const botMessageRef = conversationRef.collection("messages").doc();
  const recommendationRef = userRef.collection("recommendations").doc();

  await db.runTransaction(async (transaction) => {
    transaction.set(
      userRef,
      {
        createdAt: now,
        updatedAt: now,
      },
      { merge: true },
    );

    transaction.set(
      conversationRef,
      {
        lastMessage: message,
        lastEmotion: recommendation.emotion,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true },
    );

    transaction.set(userMessageRef, {
      text: message,
      sender: "user",
      emotion: recommendation.emotion,
      confidence: recommendation.confidence,
      createdAt: now,
    });

    transaction.set(botMessageRef, {
      text: recommendation.tavsiye,
      sender: "bot",
      emotion: recommendation.emotion,
      recommendationId: recommendationRef.id,
      createdAt: now,
    });

    transaction.set(recommendationRef, {
      conversationId,
      messageId: userMessageRef.id,
      emotion: recommendation.emotion,
      confidence: recommendation.confidence,
      tavsiye: recommendation.tavsiye,
      aktivite: recommendation.aktivite,
      movie: recommendation.movie,
      book: recommendation.book,
      spotify: recommendation.spotify,
      rawEmotionResponse: emotionData,
      createdAt: now,
    });
  });

  return {
    botMessageId: botMessageRef.id,
    messageId: userMessageRef.id,
    recommendationId: recommendationRef.id,
  };
}

app.post("/recommendation", async (req, res) => {
  const {
    conversationId = "demo-conversation",
    message,
    userId = "demo-user",
  } = req.body;

  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: "message is required" });
  }

  try {
    let emotionData;

    try {
      emotionData = await predictEmotion(message);
    } catch (emotionErr) {
      console.log(
        "Emotion service error, neutral fallback used:",
        emotionErr?.message || emotionErr,
      );
      emotionData = {
        emotion: "neutral",
        confidence: null,
        fallback: true,
        error: emotionErr?.message || String(emotionErr),
      };
    }

    const baseEmotion = emotionData.emotion || "neutral";
    const baseConfidence = emotionData.confidence ?? null;
    let recommendation = buildRecommendation(baseEmotion, baseConfidence);
    const automation = await notifyN8n(
      buildAutomationPayload({
        analysisMode: "text",
        conversationId,
        finalEmotion: {
          emotion: recommendation.emotion,
          confidence: recommendation.confidence,
        },
        message,
        modalities: {
          text: {
            input: message,
            emotion: emotionData.emotion || recommendation.emotion,
            confidence: emotionData.confidence ?? recommendation.confidence,
            raw: emotionData,
          },
        },
        option: "1-text",
        recommendation,
        userId,
      }),
    );
    console.log(
      "N8N TEXT:",
      automation
        ? {
            sent: automation.sent,
            status: automation.status,
            error: automation.error,
            hasAssistantReply: Boolean(automation.assistantReply),
            responseText: automation.responseText,
            response: automation.response,
          }
        : "not configured",
    );

    const activity = extractPayloadField(automation, "activity");
    const movie = extractPayloadField(automation, "movie");
    const book = extractPayloadField(automation, "book");
    const spotify = extractPayloadField(automation, "spotify");
    const emotion = extractPayloadField(automation, "emotion");
    const confidence = extractPayloadField(automation, "confidence");
    const assistantReply =
      automation?.assistantReply ||
      extractPayloadField(automation, "message") ||
      extractPayloadField(automation, "text");

    recommendation = {
      ...recommendation,
      ...(assistantReply ? { tavsiye: assistantReply } : {}),
      ...(emotion ? { emotion } : {}),
      ...(confidence != null ? { confidence } : {}),
      ...(activity ? { aktivite: activity, activity } : {}),
      ...(movie ? { movie } : {}),
      ...(book ? { book } : {}),
      ...(spotify ? { spotify } : {}),
    };

    const saved = await saveChatLog({
      conversationId,
      emotionData,
      message,
      recommendation,
      userId,
    });

    res.json({
      ...recommendation,
      conversationId,
      saved: true,
      assistantReply: assistantReply || null,
      n8nMissingAssistantReply: !automation?.assistantReply,
      automation,
      ...saved,
    });
  } catch (err) {
    console.log("ERROR:", err);
    res.status(500).json({ error: "AI service or Firebase error" });
  }
});

app.get("/users/:userId/recommendations", async (req, res) => {
  try {
    const snapshot = await db
      .collection("users")
      .doc(req.params.userId)
      .collection("recommendations")
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();

    res.json(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
  } catch (err) {
    console.log("ERROR:", err);
    res.status(500).json({ error: "Recommendation history error" });
  }
});

app.get("/users/:userId/emotion-summary", async (req, res) => {
  try {
    const snapshot = await db
      .collection("users")
      .doc(req.params.userId)
      .collection("recommendations")
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();

    const counts = {};

    snapshot.docs.forEach((doc) => {
      const emotion = doc.data().emotion || "neutral";
      counts[emotion] = (counts[emotion] || 0) + 1;
    });

    const topEmotion =
      Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "neutral";

    res.json({
      counts,
      topEmotion,
      total: snapshot.size,
    });
  } catch (err) {
    console.log("ERROR:", err);
    res.status(500).json({ error: "Emotion summary error" });
  }
});

app.post("/users/:userId/journal", async (req, res) => {
  const { mood = null, text, type = "journal" } = req.body;

  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: "text is required" });
  }

  try {
    const docRef = await db
      .collection("users")
      .doc(req.params.userId)
      .collection("journalEntries")
      .add({
        mood,
        text: String(text).trim(),
        type,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    res.json({ id: docRef.id, saved: true });
  } catch (err) {
    console.log("ERROR:", err);
    res.status(500).json({ error: "Journal save error" });
  }
});

app.post("/users/:userId/goals", async (req, res) => {
  const { title } = req.body;

  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: "title is required" });
  }

  try {
    const docRef = await db
      .collection("users")
      .doc(req.params.userId)
      .collection("goals")
      .add({
        completed: false,
        title: String(title).trim(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    res.json({ id: docRef.id, saved: true });
  } catch (err) {
    console.log("ERROR:", err);
    res.status(500).json({ error: "Goal save error" });
  }
});

app.listen(3000, "0.0.0.0", () => {
  console.log("Server 3000 portunda calisiyor");
});

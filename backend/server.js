const express = require("express");
const cors = require("cors");
const { admin, db, projectId } = require("./firebase/firebaseAdmin");

const app = express();

app.use(cors());
app.use(express.json());

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

async function predictEmotion(message) {
  const emotionRes = await fetch("http://localhost:8000/predict", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: message }),
  });

  if (!emotionRes.ok) {
    throw new Error(`Emotion service failed: ${emotionRes.status}`);
  }

  return emotionRes.json();
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
    const emotionData = await predictEmotion(message);
    const emotion = emotionData.emotion || "neutral";
    const confidence = emotionData.confidence ?? null;
    const recommendation = buildRecommendation(emotion, confidence);
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

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// test endpoint
app.get("/", (req, res) => {
  res.send("API çalışıyor");
});

// recommendation endpoint (şimdilik fake)
app.post("/recommendation", async (req, res) => {
  const { message } = req.body;

  try {
    // 🧠 FastAPI (emotion model)
    const emotionRes = await fetch("http://localhost:8000/predict", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: message,
      }),
    });

    const emotionData = await emotionRes.json();
    const emotion = emotionData.emotion;

    console.log("Emotion:", emotion);

    // 🎯 basit öneri sistemi
    let response = {
      emotion,
      tavsiye: "",
      aktivite: "",
      sarki: "",
    };

    if (emotion === "Sadness") {
      response.tavsiye = "Biraz dışarı çık, yürüyüş iyi gelir.";
      response.aktivite = "Doğa yürüyüşü";
      response.sarki = "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT";
    }

    if (emotion === "Happy") {
      response.tavsiye = "Bu enerjiyi paylaş!";
      response.aktivite = "Arkadaşlarla buluş";
      response.sarki = "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b";
    }

    if (emotion === "Anger") {
      response.tavsiye = "Sakinleşmek için nefes egzersizi yap.";
      response.aktivite = "Meditasyon";
      response.sarki = "https://open.spotify.com/track/1dGr1c8CrMLDpV6mPbImSI";
    }

    res.json(response);
  } catch (err) {
    console.log("ERROR:", err);
    res.status(500).json({ error: "AI service error" });
  }
});

app.listen(3000, "0.0.0.0", () => {
  console.log("Server 3000 portunda çalışıyor");
});

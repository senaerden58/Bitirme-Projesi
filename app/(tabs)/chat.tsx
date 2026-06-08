import { useAuth } from "@/contexts/auth";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from "expo-audio";
import Constants from "expo-constants";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const PURPLE = "#604df6";
const PURPLE_DARK = "#4b39d8";
const BG = "#f6f7ff";
const CARD = "#ffffff";
const INK = "#101426";
const MUTED = "#687086";

function getDevHost() {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest2?.extra?.expoClient?.hostUri ||
    "";

  return hostUri.split(":")[0] || "127.0.0.1";
}

const DEV_HOST = getDevHost();
const API_HOST = Platform.OS === "web" ? "127.0.0.1" : DEV_HOST;
const LEGACY_DEVICE_HOST = "172.20.10.2";
const MEDIA_SERVICE_HOST = Platform.OS === "web" ? "127.0.0.1" : API_HOST;
const API_BASE_URL = `http://${API_HOST}:3000`;
const API_URL = `${API_BASE_URL}/recommendation`;
const VOICE_API_URLS = Array.from(
  new Set([
    `http://${MEDIA_SERVICE_HOST}:8000/predict-voice`,
    `http://${LEGACY_DEVICE_HOST}:8000/predict-voice`,
  ]),
);
const MEDIA_API_URL = `http://${MEDIA_SERVICE_HOST}:8000/predict-media`;
const VOICE_REQUEST_TIMEOUT_MS = 120000;
const MEDIA_REQUEST_TIMEOUT_MS = 120000;
const DEMO_USER_ID = "demo-user";
const DEMO_CONVERSATION_ID = "demo-conversation";
const MAX_RECORDING_SECONDS = 30;

const VOICE_RECORDING_OPTIONS: RecordingOptions = {
  extension: ".m4a",
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 128000,
  android: {
    extension: ".m4a",
    outputFormat: "mpeg4",
    audioEncoder: "aac",
  },
  ios: {
    extension: ".wav",
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.MAX,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: "audio/webm",
    bitsPerSecond: 128000,
  },
};

type ChatMessage = {
  id: string;
  text: string;
  sender: "user" | "bot";
  time: string;
  spotifyUrl?: string;
  mediaUri?: string;
  mediaType?: "image" | "video";
};

type MediaKind = "image" | "video";

function getInitialMessages(name?: string): ChatMessage[] {
  const displayName = name?.trim().split(/\s+/)[0];
  const greeting = displayName ? `Merhaba ${displayName}` : "Merhaba";

  return [
    {
      id: "1",
      text: `${greeting} 💜 Bugün nasıl hissediyorsun? Aklından geçenleri yaz, ben duygu durumuna göre sana küçük öneriler hazırlayayım.`,
      sender: "bot",
      time: getTime(),
    },
  ];
}

async function saveAnalysisResult({
  activity,
  book,
  confidence,
  conversationId,
  emotion,
  message,
  movie,
  spotify,
  tavsiye,
  userId,
}: {
  activity?: string | null;
  book?: string | null;
  confidence?: number | null;
  conversationId: string;
  emotion?: string | null;
  message: string;
  movie?: string | null;
  spotify?: string | null;
  tavsiye?: string | null;
  userId: string;
}) {
  const response = await fetch(
    `${API_BASE_URL}/users/${userId}/recommendations`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        activity,
        book,
        confidence,
        conversationId,
        emotion,
        message,
        movie,
        spotify,
        tavsiye,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Analysis save failed: ${response.status}`);
  }
}

async function loadConversationMessages(
  userId: string,
  conversationId: string,
): Promise<ChatMessage[]> {
  const response = await fetch(
    `${API_BASE_URL}/users/${userId}/conversations/${conversationId}/messages`,
  );

  if (!response.ok) {
    throw new Error(`Conversation load failed: ${response.status}`);
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .filter((item) => item && typeof item.text === "string")
    .map((item) => ({
      id: String(item.id || `${Date.now()}-${Math.random()}`),
      sender: item.sender === "user" ? "user" : "bot",
      spotifyUrl:
        typeof item.spotifyUrl === "string" ? item.spotifyUrl : undefined,
      text: item.text,
      time: typeof item.time === "string" && item.time ? item.time : getTime(),
    }));
}

async function deleteConversationMessages(
  userId: string,
  conversationId: string,
) {
  const response = await fetch(
    `${API_BASE_URL}/users/${userId}/conversations/${conversationId}/messages`,
    { method: "DELETE" },
  );

  if (!response.ok) {
    throw new Error(`Conversation delete failed: ${response.status}`);
  }
}

type VoiceApiResponse = {
  emotion?: string;
  confidence?: number | null;
  transcript?: string;
  assistantReply?: string | null;
  message?: string | null;
  reply?: string | null;
  tavsiye?: string | null;
  activity?: string | null;
  aktivite?: string | null;
  movie?: string | null;
  book?: string | null;
  spotify?: string | null;
  textEmotion?: string;
  textConfidence?: number | null;
  voiceEmotion?: string;
  voiceConfidence?: number | null;
  fusionEmotion?: string;
  fusionConfidence?: number | null;
  fusionDecision?: {
    mode?: string | null;
    winnerModality?: string | null;
    winnerEmotion?: string | null;
    winnerConfidence?: number | null;
    agreement?: boolean;
    textEmotion?: string;
    textConfidence?: number | null;
    voiceEmotion?: string;
    voiceConfidence?: number | null;
  } | null;
};

type MediaApiResponse = {
  mediaKind?: MediaKind;
  emotion?: string;
  confidence?: number | null;
  transcript?: string;
  assistantReply?: string | null;
  message?: string | null;
  reply?: string | null;
  tavsiye?: string | null;
  activity?: string | null;
  aktivite?: string | null;
  movie?: string | null;
  book?: string | null;
  spotify?: string | null;
  visualEmotion?: string | null;
  visualConfidence?: number | null;
  visualSummary?: string | null;
  textEmotion?: string | null;
  textConfidence?: number | null;
  voiceEmotion?: string | null;
  voiceConfidence?: number | null;
  fusionEmotion?: string | null;
  fusionConfidence?: number | null;
  processingErrors?: string[] | null;
  frameStats?: {
    durationSeconds?: number | null;
    samplingIntervalSeconds?: number | null;
    frameCount?: number | null;
    fps?: number | null;
  } | null;
  fusionDecision?: {
    mode?: string | null;
    winnerModality?: string | null;
    winnerEmotion?: string | null;
    winnerConfidence?: number | null;
    agreement?: boolean;
    visualEmotion?: string | null;
    visualConfidence?: number | null;
    textEmotion?: string | null;
    textConfidence?: number | null;
    voiceEmotion?: string | null;
    voiceConfidence?: number | null;
  } | null;
};

function getTime() {
  return new Date().toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function openExternalUrl(url: string) {
  const targetUrl = normalizeSpotifyOpenUrl(url);

  try {
    if (Platform.OS === "web") {
      window.open(targetUrl, "_blank", "noopener,noreferrer");
      return;
    }

    const canOpen = await Linking.canOpenURL(targetUrl);

    if (!canOpen) {
      Alert.alert(
        "Link acilamadi",
        "Spotify baglantisi bu cihazda acilamiyor.",
      );
      return;
    }

    await Linking.openURL(targetUrl);
  } catch (error) {
    console.log("Spotify link open error:", error);
    Alert.alert(
      "Link acilamadi",
      "Spotify baglantisi acilirken bir sorun olustu.",
    );
  }
}

function buildSpotifySearchUrl(query: string) {
  return `https://open.spotify.com/search/${encodeURIComponent(query)}`;
}

function getSpotifyQueryForEmotion(emotion?: string | null) {
  const normalizedEmotion = String(emotion || "neutral").toLowerCase();

  if (normalizedEmotion === "sadness" || normalizedEmotion === "sad") {
    return "sad acoustic turkish";
  }

  if (normalizedEmotion === "happy") {
    return "happy mood playlist";
  }

  if (normalizedEmotion === "anger" || normalizedEmotion === "angry") {
    return "calm breathing music";
  }

  if (normalizedEmotion === "fear" || normalizedEmotion === "fearful") {
    return "anxiety relief calm music";
  }

  return "calm mood playlist";
}

function normalizeSpotifyOpenUrl(url: string) {
  return url;
}

function resolveSpotifyUrl(value?: string | null, emotion?: string | null) {
  const spotifyValue = typeof value === "string" ? value.trim() : "";

  if (!spotifyValue) {
    return buildSpotifySearchUrl(getSpotifyQueryForEmotion(emotion));
  }

  if (spotifyValue.includes("open.spotify.com/")) {
    return spotifyValue;
  }

  return buildSpotifySearchUrl(spotifyValue);
}

function removeVoiceEmotionDetails(text: string) {
  return text
    .replace(
      /^\s*(?:text\s+duygu|ses\s+duygu|duygu|emotion|guven|güven|secilen|seçilen|uyum)\s*:.*(?:\r?\n)?/gim,
      "",
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildVoiceResponse(
  emotion?: string,
  confidence?: number | null,
  transcript?: string,
  details?: {
    textEmotion?: string;
    textConfidence?: number | null;
    voiceEmotion?: string;
    voiceConfidence?: number | null;
    winnerModality?: string | null;
    winnerEmotion?: string | null;
    winnerConfidence?: number | null;
    agreement?: boolean;
  },
) {
  const normalizedEmotion = String(emotion || "neutral").toLowerCase();
  const formatConfidence = (value?: number | null) =>
    typeof value === "number" ? `%${Math.round(value * 100)}` : "-";
  const transcriptValue = transcript?.trim() || "(Turkce net anlasilamadi)";

  const detailsText =
    `\nText duygu: ${details?.textEmotion || "-"} (${formatConfidence(details?.textConfidence)})` +
    `\nSes duygu: ${details?.voiceEmotion || "-"} (${formatConfidence(details?.voiceConfidence)})` +
    `\nSecilen: ${details?.winnerModality || "weighted"} -> ${details?.winnerEmotion || emotion || "neutral"} (${formatConfidence(details?.winnerConfidence ?? confidence)})` +
    `\nUyum: ${details?.agreement === true ? "evet" : details?.agreement === false ? "hayir" : "-"}`;

  let confidenceText =
    typeof confidence === "number"
      ? `\nGüven: %${Math.round(confidence * 100)}`
      : "";

  const transcriptText = `\n\nYaziya dokulen: ${transcriptValue}\n${detailsText}`;
  confidenceText += transcriptText;

  if (normalizedEmotion === "sadness" || normalizedEmotion === "sad") {
    return `Ses tonundan biraz hüzün yakaladım.\n\nDuygu: sadness${confidenceText}\nÖneri: Kendine yumuşak bir mola ver; kısa bir yürüyüş veya sakin bir şarkı iyi gelebilir.`;
  }

  if (normalizedEmotion === "happy") {
    return `Ses tonun daha pozitif geliyor.\n\nDuygu: happy${confidenceText}\nÖneri: Bu enerjiyi bugün küçük ama güzel bir şeye yönlendirebilirsin.`;
  }

  if (normalizedEmotion === "anger" || normalizedEmotion === "angry") {
    return `Ses tonunda gerginlik algıladım.\n\nDuygu: anger${confidenceText}\nÖneri: Önce nefesini yavaşlat; sonra neye ihtiyacın olduğunu daha net seçebilirsin.`;
  }

  if (normalizedEmotion === "fear" || normalizedEmotion === "fearful") {
    return `Ses tonunda kaygı izi olabilir.\n\nDuygu: fear${confidenceText}\nÖneri: Düşünceyi küçük parçalara ayırmak kontrol hissini güçlendirebilir.`;
  }

  return `Ses kaydını analiz ettim.\n\nDuygu: ${emotion || "neutral"}${confidenceText}\nÖneri: Kendini dinlemek için kısa ve sakin bir mola iyi gelebilir.`;
}

function buildVoiceFormData(
  rawUri: string,
  userId: string,
  conversationId: string,
) {
  const lowerUri = rawUri.toLowerCase();
  const isWavLike = lowerUri.endsWith(".wav") || lowerUri.endsWith(".caf");
  const formData = new FormData();

  formData.append("userId", userId);
  formData.append("conversationId", conversationId);
  formData.append("notifyN8n", "true");
  formData.append("audio", {
    uri: rawUri,
    name: isWavLike ? "voice-recording.wav" : "voice-recording.m4a",
    type: isWavLike ? "audio/wav" : "audio/m4a",
  } as any);

  return formData;
}

function uploadVoiceWithXhr(
  url: string,
  formData: FormData,
): Promise<VoiceApiResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.timeout = VOICE_REQUEST_TIMEOUT_MS;

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText || "{}"));
        } catch {
          reject(new Error("Voice service returned invalid JSON."));
        }
        return;
      }

      reject(new Error(`Voice service failed: ${xhr.status}`));
    };

    xhr.onerror = () => reject(new Error("Network request failed"));
    xhr.ontimeout = () => reject(new Error("Network request timed out"));
    xhr.onabort = () => reject(new Error("Voice upload aborted"));
    xhr.send(formData);
  });
}

async function uploadVoice(
  rawUri: string,
  userId: string,
  conversationId: string,
): Promise<VoiceApiResponse> {
  let lastError: unknown = null;

  for (const url of VOICE_API_URLS) {
    try {
      console.log("VOICE UPLOAD URL:", url);
      return await uploadVoiceWithXhr(
        url,
        buildVoiceFormData(rawUri, userId, conversationId),
      );
    } catch (error) {
      lastError = error;
      console.log("VOICE UPLOAD FAILED:", url, error);
    }
  }

  throw lastError || new Error("Voice upload failed");
}

function buildMediaFormData(
  asset: ImagePicker.ImagePickerAsset,
  mediaKind: MediaKind,
  userId: string,
  conversationId: string,
) {
  const fallbackType = mediaKind === "video" ? "video/mp4" : "image/jpeg";
  const fallbackName =
    mediaKind === "video" ? "media-upload.mp4" : "media-upload.jpg";
  const uploadName =
    mediaKind === "image" ? "media-upload.jpg" : asset.fileName || fallbackName;
  const uploadType =
    mediaKind === "image" ? "image/jpeg" : asset.mimeType || fallbackType;
  const formData = new FormData();

  formData.append("userId", userId);
  formData.append("conversationId", conversationId);
  formData.append("notifyN8n", "true");
  formData.append("mediaKind", mediaKind);
  formData.append("media", {
    uri: asset.uri,
    name: uploadName,
    type: uploadType,
  } as any);

  return formData;
}

function uploadMediaWithXhr(formData: FormData): Promise<MediaApiResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", MEDIA_API_URL);
    xhr.timeout = MEDIA_REQUEST_TIMEOUT_MS;

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText || "{}"));
        } catch {
          reject(new Error("Media service returned invalid JSON."));
        }
        return;
      }

      reject(new Error(`Media service failed: ${xhr.status}`));
    };

    xhr.onerror = () => reject(new Error("Network request failed"));
    xhr.ontimeout = () => reject(new Error("Network request timed out"));
    xhr.onabort = () => reject(new Error("Media upload aborted"));
    xhr.send(formData);
  });
}

export default function CommunityChat() {
  const { user } = useAuth();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const activeUserId = user?.id || DEMO_USER_ID;
  const activeConversationId = user
    ? `conversation-${user.id}`
    : DEMO_CONVERSATION_ID;

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      text: "Merhaba💜 Bugün nasıl hissediyorsun? Aklından geçenleri yaz, ben duygu durumuna göre sana küçük öneriler hazırlayayım.",
      sender: "bot",
      time: getTime(),
    },
  ]);

  const [input, setInput] = useState("");
  const [showActions, setShowActions] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isStoppingRecording, setIsStoppingRecording] = useState(false);
  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder);
  const recording = recorderState.isRecording;
  const recordingSeconds = Math.floor(
    (recorderState.durationMillis || 0) / 1000,
  );

  useEffect(() => {
    let ignore = false;

    async function loadMessages() {
      if (!user) {
        setMessages(getInitialMessages());
        return;
      }

      try {
        const history = await loadConversationMessages(
          activeUserId,
          activeConversationId,
        );

        if (!ignore) {
          setMessages(
            history.length > 0 ? history : getInitialMessages(user.name),
          );
        }
      } catch (error) {
        console.log("CHAT HISTORY ERROR:", error);

        if (!ignore) {
          setMessages(getInitialMessages(user.name));
        }
      }
    }

    loadMessages();
    setInput("");
    setShowActions(false);
    setIsTyping(false);

    return () => {
      ignore = true;
    };
  }, [activeConversationId, activeUserId, user, user?.name]);

  useEffect(() => {
    if (
      recording &&
      !isStoppingRecording &&
      recordingSeconds >= MAX_RECORDING_SECONDS
    ) {
      void stopRecording();
    }
    // This effect only enforces max recording duration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, recordingSeconds, isStoppingRecording]);

  const scrollToEnd = () => {
    setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const clearMessages = async () => {
    if (isTyping || recording) return;

    const initialMessages = getInitialMessages(user?.name);

    try {
      await deleteConversationMessages(activeUserId, activeConversationId);
      setMessages(initialMessages);
      setShowActions(false);
      setInput("");
    } catch (error) {
      console.log("CHAT CLEAR ERROR:", error);
      Alert.alert("Hata", "Sohbet gecmisi silinemedi.");
    }
  };

  const confirmClearMessages = () => {
    if (messages.length <= 1 || isTyping || recording) return;

    Alert.alert(
      "Sohbeti sil",
      "Bu sohbetteki mesajlar kalıcı olarak silinsin mi?",
      [
        { text: "Vazgec", style: "cancel" },
        {
          text: "Sil",
          style: "destructive",
          onPress: () => {
            void clearMessages();
          },
        },
      ],
    );
  };

  const sendMessage = async () => {
    if (!input.trim() || isTyping) return;

    const userMsg = input.trim();

    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        text: userMsg,
        sender: "user",
        time: getTime(),
      },
    ]);

    setInput("");
    setShowActions(false);
    setIsTyping(true);
    scrollToEnd();

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConversationId,
          message: userMsg,
          userId: activeUserId,
        }),
      });

      if (!res.ok) {
        throw new Error(`Recommendation request failed: ${res.status}`);
      }

      const rawData = await res.json();
      const data = Array.isArray(rawData) ? rawData[0] : rawData;
      console.log("DATA:", data);
      const aiText =
        (typeof data.assistantReply === "string" &&
        data.assistantReply.trim().length > 0
          ? data.assistantReply.trim()
          : null) ||
        data.tavsiye ||
        data.message ||
        "Seni anlıyorum.";
      const botText =
        `💭 ${aiText}\n\n` +
        `🎯 Aktivite: ${data.aktivite || data.activity || "Kısa bir mola ver"}\n` +
        `🎬 Film: ${data.movie || "Soul"}\n` +
        `📚 Kitap: ${data.book || "Simyacı"}\n`;
      const spotifyUrl = resolveSpotifyUrl(
        typeof data.spotify === "string" ? data.spotify : data.sarki,
        data.emotion,
      );
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-bot`,
          text: botText,
          sender: "bot",
          time: getTime(),
          spotifyUrl,
        },
      ]);
    } catch (err) {
      console.log("HATA:", err);
      Alert.alert("Hata", "Sunucuya bağlanılamadı.");
    } finally {
      setIsTyping(false);
      scrollToEnd();
    }
  };

  const pickMedia = async () => {
    Alert.alert("Secenekler", "Ne yapmak istersin?", [
      // { text: "Fotograf cek", onPress: openCameraPhoto },
      { text: "Video çek", onPress: openCameraVideo },
      { text: "İptal", style: "cancel" },
    ]);
  };

  const analyzeMediaAsset = async (
    asset: ImagePicker.ImagePickerAsset,
    mediaKind: MediaKind,
  ) => {
    setShowActions(false);

    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${mediaKind}-user`,
        text:
          mediaKind === "video" ? "Video gönderildi." : "Görsel gönderildi.",
        sender: "user",
        time: getTime(),
        mediaUri: asset.uri,
        mediaType: mediaKind,
      },
    ]);

    setIsTyping(true);
    scrollToEnd();

    try {
      let data: MediaApiResponse;

      try {
        data = await uploadMediaWithXhr(
          buildMediaFormData(
            asset,
            mediaKind,
            activeUserId,
            activeConversationId,
          ),
        );
      } catch (firstError) {
        const fallbackUri =
          Platform.OS === "ios" && asset.uri.startsWith("file://")
            ? asset.uri.replace("file://", "")
            : asset.uri;

        if (fallbackUri !== asset.uri) {
          data = await uploadMediaWithXhr(
            buildMediaFormData(
              { ...asset, uri: fallbackUri },
              mediaKind,
              activeUserId,
              activeConversationId,
            ),
          );
        } else {
          throw firstError;
        }
      }

      const emotion = String(
        data.fusionEmotion || data.emotion || "neutral",
      ).toLowerCase();
      console.log("MEDIA DATA:", {
        finalEmotion: data.emotion,
        finalConfidence: data.confidence,
        mediaKind: data.mediaKind,
        visualEmotion: data.visualEmotion || data.fusionDecision?.visualEmotion,
        visualConfidence:
          data.visualConfidence ?? data.fusionDecision?.visualConfidence,
        textEmotion: data.textEmotion || data.fusionDecision?.textEmotion,
        textConfidence:
          data.textConfidence ?? data.fusionDecision?.textConfidence,
        voiceEmotion: data.voiceEmotion || data.fusionDecision?.voiceEmotion,
        voiceConfidence:
          data.voiceConfidence ?? data.fusionDecision?.voiceConfidence,
        winnerModality: data.fusionDecision?.winnerModality,
        winnerEmotion: data.fusionDecision?.winnerEmotion,
        transcript: data.transcript,
        visualSummary: data.visualSummary,
        assistantReply: data.assistantReply,
      });
      const assistantReply =
        typeof data.assistantReply === "string" && data.assistantReply.trim()
          ? data.assistantReply.trim()
          : null;
      const aiText =
        assistantReply ||
        data.tavsiye ||
        data.reply ||
        data.message ||
        "Seni anlıyorum.";
      const activity = data.aktivite || data.activity || "Kısa bir mola ver";
      const movie = data.movie || "Soul";
      const book = data.book || "Simyacı";
      const spotify = data.spotify || null;
      await saveAnalysisResult({
        activity,
        book,
        confidence: data.fusionConfidence ?? data.confidence ?? null,
        conversationId: activeConversationId,
        emotion,
        message: mediaKind === "video" ? "Video analizi" : "Görsel analizi",
        movie,
        spotify,
        tavsiye: aiText,
        userId: activeUserId,
      }).catch((error) => {
        console.log("MEDIA SAVE ERROR:", error);
      });
      const mediaText =
        `💭 ${aiText}\n\n` +
        `🎯 Aktivite: ${activity}\n` +
        `🎬 Film: ${movie}\n` +
        `📚 Kitap: ${book}\n`;
      const spotifyUrl = resolveSpotifyUrl(data.spotify, emotion);

      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${mediaKind}-bot`,
          text: mediaText,
          sender: "bot",
          time: getTime(),
          spotifyUrl,
        },
      ]);
    } catch (err) {
      console.log("MEDIA HATA:", err);
      Alert.alert("Hata", "Görsel analizi yapılamadı.");
    } finally {
      setIsTyping(false);
      scrollToEnd();
    }
  };

  const openCameraPhoto = async () => {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      quality: 0.5,
    });

    if (!result.canceled) {
      await analyzeMediaAsset(result.assets[0], "image");
    }
  };

  const openCameraVideo = async () => {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      videoMaxDuration: 60,
      quality: 0.5,
    });

    if (!result.canceled) {
      await analyzeMediaAsset(result.assets[0], "video");
    }
  };

  const startRecording = async () => {
    if (recording || isStoppingRecording) return;

    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Izin gerekli",
          "Mikrofon izni olmadan ses kaydi baslatilamaz.",
        );
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();

      setShowActions(false);
    } catch (err) {
      console.log("Recording error", err);
    }
  };

  const stopRecording = async () => {
    if (!recording || isStoppingRecording) return;

    setIsStoppingRecording(true);
    let uri: string | null = null;

    try {
      await recorder.stop();
      uri = recorder.uri || recorder.getStatus().url;
      console.log("Ses kaydedildi:", uri);
    } catch (err) {
      console.log("Stop recording error", err);
      Alert.alert("Hata", "Ses kaydi durdurulamadi.");
      return;
    } finally {
      setIsStoppingRecording(false);
    }

    if (!uri) {
      Alert.alert("Hata", "Ses kaydı alınamadı.");
      return;
    }

    const voiceMessageId = Date.now().toString();

    setMessages((prev) => [
      ...prev,
      {
        id: voiceMessageId,
        text: "Ses kaydı gönderildi.",
        sender: "user",
        time: getTime(),
      },
    ]);

    setIsTyping(true);
    scrollToEnd();

    try {
      let data: VoiceApiResponse;

      try {
        data = await uploadVoice(uri, activeUserId, activeConversationId);
      } catch (firstError) {
        const fallbackUri =
          Platform.OS === "ios" && uri.startsWith("file://")
            ? uri.replace("file://", "")
            : uri;

        if (fallbackUri !== uri) {
          data = await uploadVoice(
            fallbackUri,
            activeUserId,
            activeConversationId,
          );
        } else {
          throw firstError;
        }
      }

      console.log("VOICE DATA:", {
        finalEmotion: data.emotion,
        finalConfidence: data.confidence,
        textEmotion: data.textEmotion || data.fusionDecision?.textEmotion,
        textConfidence:
          data.textConfidence ?? data.fusionDecision?.textConfidence,
        voiceEmotion: data.voiceEmotion || data.fusionDecision?.voiceEmotion,
        voiceConfidence:
          data.voiceConfidence ?? data.fusionDecision?.voiceConfidence,
        winnerModality: data.fusionDecision?.winnerModality,
        winnerEmotion: data.fusionDecision?.winnerEmotion,
        transcript: data.transcript,
      });

      const assistantReply =
        typeof data.assistantReply === "string" && data.assistantReply.trim()
          ? data.assistantReply.trim()
          : null;
      const emotion = String(data.emotion || "neutral").toLowerCase();
      const rawAiText =
        assistantReply ||
        data.tavsiye ||
        data.reply ||
        data.message ||
        "Seni anlıyorum.";
      const aiText = removeVoiceEmotionDetails(rawAiText) || "Seni anlıyorum.";
      const activity = data.aktivite || data.activity || "Kısa bir mola ver";
      const movie = data.movie || "Soul";
      const book = data.book || "Simyacı";
      const spotify = data.spotify || null;
      await saveAnalysisResult({
        activity,
        book,
        confidence: data.fusionConfidence ?? data.confidence ?? null,
        conversationId: activeConversationId,
        emotion,
        message: data.transcript || "Ses analizi",
        movie,
        spotify,
        tavsiye: aiText,
        userId: activeUserId,
      }).catch((error) => {
        console.log("VOICE SAVE ERROR:", error);
      });
      const voiceText =
        `💭 ${aiText}\n\n` +
        `🎯 Aktivite: ${activity}\n` +
        `🎬 Film: ${movie}\n` +
        `📚 Kitap: ${book}\n`;
      const spotifyUrl = resolveSpotifyUrl(data.spotify, emotion);

      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-voice-bot`,
          text: voiceText,
          sender: "bot",
          time: getTime(),
          spotifyUrl,
        },
      ]);
    } catch (err) {
      console.log("VOICE HATA:", err);
      Alert.alert("Hata", "Ses analizi yapılamadı.");
    } finally {
      setIsTyping(false);
      scrollToEnd();
    }
  };

  const toggleVoiceAnalysis = async () => {
    setShowActions(false);

    if (recording) {
      await stopRecording();
      return;
    }

    await startRecording();
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton}>
          <MaterialCommunityIcons name="chevron-left" size={30} color={INK} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <View style={styles.avatar}>
            <MaterialCommunityIcons
              name="robot-happy-outline"
              size={24}
              color="#fff"
            />
          </View>

          <View>
            <Text style={styles.headerTitle}>Duygu Asistanı</Text>
            <View style={styles.statusRow}>
              <View style={styles.onlineDot} />
              <Text style={styles.headerSub}>Çevrimiçi</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.iconButton,
            (messages.length <= 1 || isTyping || recording) &&
              styles.iconButtonDisabled,
          ]}
          onPress={confirmClearMessages}
          disabled={messages.length <= 1 || isTyping || recording}
          accessibilityLabel="Sohbeti sil"
        >
          <MaterialCommunityIcons
            name="trash-can-outline"
            size={23}
            color={messages.length <= 1 || isTyping || recording ? MUTED : INK}
          />
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messages}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={scrollToEnd}
        renderItem={({ item }) => {
          const isUser = item.sender === "user";

          return (
            <View style={[styles.messageRow, isUser && styles.userRow]}>
              {!isUser && (
                <View style={styles.smallAvatar}>
                  <MaterialCommunityIcons
                    name="robot-outline"
                    size={17}
                    color={PURPLE}
                  />
                </View>
              )}

              <View
                style={[
                  styles.bubble,
                  isUser ? styles.userBubble : styles.botBubble,
                ]}
              >
                {item.mediaType === "image" && item.mediaUri && (
                  <ExpoImage
                    source={{ uri: item.mediaUri }}
                    style={styles.inlineImage}
                    contentFit="cover"
                  />
                )}
                {item.mediaType === "video" && (
                  <View style={styles.videoAttachment}>
                    <MaterialCommunityIcons
                      name="video-outline"
                      size={22}
                      color={isUser ? "#fff" : PURPLE}
                    />
                    <Text
                      style={[
                        styles.videoAttachmentText,
                        isUser && styles.userText,
                      ]}
                    >
                      Video seçildi
                    </Text>
                  </View>
                )}
                <Text style={[styles.bubbleText, isUser && styles.userText]}>
                  {item.text}
                </Text>
                {item.spotifyUrl?.startsWith("https://open.spotify.com") && (
                  <TouchableOpacity
                    style={styles.spotifyCard}
                    activeOpacity={0.8}
                    onPress={() => {
                      if (item.spotifyUrl) {
                        void openExternalUrl(item.spotifyUrl);
                      }
                    }}
                  >
                    <MaterialCommunityIcons
                      name="spotify"
                      size={36}
                      color="#1DB954"
                    />

                    <View style={{ flex: 1 }}>
                      <Text style={styles.spotifyTitle}>Spotify önerisi</Text>
                      <Text style={styles.spotifyText}>Şarkıyı aç</Text>
                    </View>

                    <MaterialCommunityIcons
                      name="open-in-new"
                      size={18}
                      color="#1DB954"
                    />
                  </TouchableOpacity>
                )}

                <Text style={[styles.time, isUser && styles.userTime]}>
                  {item.time}
                </Text>
              </View>
            </View>
          );
        }}
      />

      {isTyping && (
        <View style={styles.typingBox}>
          <MaterialCommunityIcons
            name="robot-outline"
            size={18}
            color={PURPLE}
          />
          <Text style={styles.typingText}>Asistan öneri hazırlıyor...</Text>
        </View>
      )}

      {recording && (
        <View style={styles.recordingPanel}>
          <View style={styles.recordingInfo}>
            <View style={styles.recordingDot} />
            <View>
              <Text style={styles.recordingTitle}>Ses kaydı alınıyor</Text>
              <Text style={styles.recordingText}>
                {formatDuration(recordingSeconds)} /{" "}
                {formatDuration(MAX_RECORDING_SECONDS)}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.stopRecordingButton}
            onPress={stopRecording}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="stop" size={20} color="#fff" />
            <Text style={styles.stopRecordingText}>Bitir</Text>
          </TouchableOpacity>
        </View>
      )}

      {showActions && !recording && (
        <View style={styles.actionSheet}>
          <TouchableOpacity style={styles.actionItem} onPress={pickMedia}>
            <View style={styles.actionIcon}>
              <MaterialCommunityIcons
                name="camera-outline"
                size={24}
                color={PURPLE}
              />
            </View>
            <View>
              <Text style={styles.actionTitle}>Görüntü</Text>
              <Text style={styles.actionText}>Video seç</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionItem}
            onPress={toggleVoiceAnalysis}
          >
            <View style={styles.actionIcon}>
              <MaterialCommunityIcons
                name="microphone-outline"
                size={24}
                color={PURPLE}
              />
            </View>
            <View>
              <Text style={styles.actionTitle}>Ses</Text>
              <Text style={styles.actionText}>Ses kaydı başlat</Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputBar}>
        <TouchableOpacity
          style={[
            styles.plusButton,
            showActions && styles.plusButtonActive,
            recording && styles.plusButtonDisabled,
          ]}
          onPress={() => setShowActions((value) => !value)}
          disabled={!!recording}
        >
          <MaterialCommunityIcons
            name={showActions ? "close" : "plus"}
            size={24}
            color={showActions ? "#fff" : PURPLE}
          />
        </TouchableOpacity>

        <TextInput
          value={input}
          onChangeText={(text) => {
            setInput(text);
            if (text.trim()) setShowActions(false);
          }}
          placeholder="Duygularını yaz..."
          placeholderTextColor="#9aa0b2"
          style={styles.input}
          multiline
        />

        <TouchableOpacity
          onPress={sendMessage}
          style={[
            styles.sendButton,
            (!input.trim() || isTyping) && styles.sendButtonDisabled,
          ]}
          disabled={!input.trim() || isTyping}
        >
          <MaterialCommunityIcons name="send" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    paddingTop: 54,
    paddingHorizontal: 18,
    paddingBottom: 16,
    backgroundColor: CARD,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: "#6b6f8f",
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 5,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#f4f5fb",
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonDisabled: {
    opacity: 0.45,
  },
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 18,
    backgroundColor: PURPLE,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: INK,
    fontSize: 17,
    fontWeight: "900",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 3,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#58c08b",
  },
  headerSub: {
    color: MUTED,
    fontSize: 12,
  },
  messages: {
    padding: 18,
    paddingTop: 18,
    paddingBottom: 12,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 14,
    gap: 8,
  },
  userRow: {
    justifyContent: "flex-end",
  },
  smallAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#eeeaff",
    alignItems: "center",
    justifyContent: "center",
  },
  bubble: {
    maxWidth: "78%",
    borderRadius: 22,
    paddingVertical: 13,
    paddingHorizontal: 15,
  },
  userBubble: {
    backgroundColor: PURPLE,
    borderTopRightRadius: 7,
    shadowColor: PURPLE_DARK,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 3,
  },
  botBubble: {
    backgroundColor: CARD,
    borderTopLeftRadius: 7,
    shadowColor: "#6b6f8f",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 2,
  },
  bubbleText: {
    color: INK,
    fontSize: 14,
    lineHeight: 21,
  },
  inlineImage: {
    width: 220,
    height: 220,
    borderRadius: 16,
    marginBottom: 10,
    backgroundColor: "#ecebff",
  },
  videoAttachment: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: "rgba(96, 77, 246, 0.08)",
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  videoAttachmentText: {
    color: INK,
    fontSize: 13,
    fontWeight: "700",
  },
  userText: {
    color: "#fff",
  },
  time: {
    color: MUTED,
    fontSize: 10,
    marginTop: 7,
    alignSelf: "flex-end",
  },
  userTime: {
    color: "#dcd9ff",
  },
  typingBox: {
    alignSelf: "flex-start",
    marginLeft: 22,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: CARD,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  typingText: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "600",
  },
  recordingPanel: {
    marginHorizontal: 18,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: "#fff0f0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    shadowColor: "#8f4f4f",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
  recordingInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#ff4d4d",
  },
  recordingTitle: {
    color: INK,
    fontSize: 13,
    fontWeight: "900",
  },
  recordingText: {
    color: "#cf3333",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },
  stopRecordingButton: {
    minWidth: 86,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#e64242",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
  },
  stopRecordingText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  actionSheet: {
    marginHorizontal: 18,
    marginBottom: 10,
    borderRadius: 24,
    backgroundColor: CARD,
    padding: 10,
    flexDirection: "row",
    gap: 10,
    shadowColor: "#6b6f8f",
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 4,
  },
  actionItem: {
    flex: 1,
    minHeight: 74,
    borderRadius: 20,
    backgroundColor: "#f7f5ff",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: CARD,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: {
    color: INK,
    fontSize: 13,
    fontWeight: "900",
  },
  actionText: {
    color: MUTED,
    fontSize: 11,
    marginTop: 2,
  },
  inputBar: {
    marginHorizontal: 18,
    marginBottom: 18,
    minHeight: 58,
    borderRadius: 30,
    backgroundColor: CARD,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 8,
    paddingRight: 7,
    paddingVertical: 7,
    shadowColor: "#6b6f8f",
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 5,
  },
  plusButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#eeeaff",
    alignItems: "center",
    justifyContent: "center",
  },
  plusButtonActive: {
    backgroundColor: PURPLE,
  },
  plusButtonDisabled: {
    opacity: 0.45,
  },
  input: {
    flex: 1,
    color: INK,
    fontSize: 14,
    maxHeight: 90,
    paddingVertical: 8,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: PURPLE,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#c5c2e8",
  },
  spotifyCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "#f2fff7",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  spotifyTitle: {
    color: INK,
    fontSize: 13,
    fontWeight: "900",
  },
  spotifyText: {
    color: "#1DB954",
    fontSize: 12,
    marginTop: 2,
    fontWeight: "700",
  },
});

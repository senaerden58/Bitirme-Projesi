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

const API_URL = "http://172.20.10.2:3000/recommendation";
const VOICE_API_URL = "http://172.20.10.2:8000/predict-voice";
const VOICE_REQUEST_TIMEOUT_MS = 120000;
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
};

type VoiceApiResponse = {
  emotion?: string;
  confidence?: number | null;
  transcript?: string;
  assistantReply?: string | null;
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

function getTime() {
  return new Date().toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });
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

function buildVoiceResponseWithFusion(data: VoiceApiResponse) {
  const finalEmotion = String(
    data.fusionEmotion || data.emotion || "neutral",
  ).toLowerCase();
  const finalConfidence = data.fusionConfidence ?? data.confidence ?? null;
  const transcript = data.transcript?.trim() || "(Turkce net anlasilamadi)";

  const textEmotion = data.textEmotion || data.fusionDecision?.textEmotion || "-";
  const textConfidence =
    data.textConfidence ?? data.fusionDecision?.textConfidence ?? null;
  const voiceEmotion =
    data.voiceEmotion || data.fusionDecision?.voiceEmotion || "-";
  const voiceConfidence =
    data.voiceConfidence ?? data.fusionDecision?.voiceConfidence ?? null;
  const winnerModality = data.fusionDecision?.winnerModality || "-";
  const winnerEmotion =
    data.fusionDecision?.winnerEmotion || data.fusionEmotion || data.emotion || "-";
  const winnerConfidence =
    data.fusionDecision?.winnerConfidence ??
    data.fusionConfidence ??
    data.confidence ??
    null;
  const mode = data.fusionDecision?.mode || "highest_confidence";
  const agreement = data.fusionDecision?.agreement;

  const formatConfidence = (value?: number | null) =>
    typeof value === "number" ? `%${Math.round(value * 100)}` : "-";

  let opening = "Ses kaydini analiz ettim.";
  let recommendation =
    "Kendini dinlemek icin kisa ve sakin bir mola iyi gelebilir.";

  if (finalEmotion === "sadness" || finalEmotion === "sad") {
    opening = "Ses tonundan biraz huzun yakaladim.";
    recommendation =
      "Kendine yumusak bir mola ver; kisa bir yuruyus iyi gelebilir.";
  } else if (finalEmotion === "happy") {
    opening = "Ses tonun daha pozitif geliyor.";
    recommendation = "Bu enerjiyi bugun kucuk ama guzel bir seye yonlendirebilirsin.";
  } else if (finalEmotion === "anger" || finalEmotion === "angry") {
    opening = "Ses tonunda gerginlik algiladim.";
    recommendation =
      "Once nefesini yavaslat; sonra neye ihtiyacin oldugunu daha net secebilirsin.";
  } else if (finalEmotion === "fear" || finalEmotion === "fearful") {
    opening = "Ses tonunda kaygi izi olabilir.";
    recommendation =
      "Dusunceyi kucuk parcalara ayirmak kontrol hissini guclendirebilir.";
  }

  return (
    `${opening}\n\n` +
    `Ortak duygu: ${finalEmotion}\n` +
    `Ortak guven: ${formatConfidence(finalConfidence)}\n\n` +
    `Yaziya dokulen: ${transcript}\n` +
    `Karar modu: ${mode}\n` +
    `Text duygu: ${textEmotion} (${formatConfidence(textConfidence)})\n` +
    `Ses duygu: ${voiceEmotion} (${formatConfidence(voiceConfidence)})\n` +
    `Yuksek guvenli modalite: ${winnerModality} -> ${winnerEmotion} (${formatConfidence(winnerConfidence)})\n` +
    `Uyum: ${agreement === true ? "evet" : agreement === false ? "hayir" : "-"}\n` +
    `Oneri: ${recommendation}`
  );
}

function buildVoiceFormData(rawUri: string) {
  const lowerUri = rawUri.toLowerCase();
  const isWavLike = lowerUri.endsWith(".wav") || lowerUri.endsWith(".caf");
  const formData = new FormData();

  formData.append("userId", DEMO_USER_ID);
  formData.append("conversationId", DEMO_CONVERSATION_ID);
  formData.append("notifyN8n", "true");
  formData.append("audio", {
    uri: rawUri,
    name: isWavLike ? "voice-recording.wav" : "voice-recording.m4a",
    type: isWavLike ? "audio/wav" : "audio/m4a",
  } as any);

  return formData;
}

function getVoiceFallbackRecommendations(emotion: string) {
  const normalizedEmotion = emotion.toLowerCase();

  if (normalizedEmotion === "anger" || normalizedEmotion === "angry") {
    return {
      reply:
        "Sesinden biraz gerginlik hissettim. Önce kısa bir nefes molası iyi gelebilir.",
      activity: "4-7-8 nefes egzersizi",
      movie: "The Secret Life of Walter Mitty",
      book: "Duygusal Zeka",
      spotify: "Calm Vibes",
    };
  }

  if (normalizedEmotion === "sadness" || normalizedEmotion === "sad") {
    return {
      reply:
        "Bugün biraz yorgun veya kırgın hissetmiş olabilirsin. Kendine nazik davranman iyi gelir.",
      activity: "Kısa bir yürüyüş",
      movie: "Inside Out",
      book: "Küçük Prens",
      spotify: "Acoustic Chill",
    };
  }

  if (normalizedEmotion === "happy") {
    return {
      reply: "Bu iyi enerjiyi küçük ama keyifli bir şeye yönlendirebilirsin.",
      activity: "Sevdiğin birine mesaj at",
      movie: "La La Land",
      book: "Martı Jonathan Livingston",
      spotify: "Good Vibes",
    };
  }

  if (normalizedEmotion === "fear" || normalizedEmotion === "fearful") {
    return {
      reply:
        "Kaygılı hissettiysen önce durup nefesini yavaşlatmak iyi gelebilir.",
      activity: "Düşünce günlüğü",
      movie: "A Beautiful Day in the Neighborhood",
      book: "Kaygı Çağı",
      spotify: "Peaceful Piano",
    };
  }

  return {
    reply: "Seni duydum. Kendine kısa ve sakin bir alan açman iyi gelebilir.",
    activity: "Kısa bir mola",
    movie: "Soul",
    book: "Simyacı",
    spotify: "Sakin Odak",
  };
}

function uploadVoiceWithXhr(formData: FormData): Promise<VoiceApiResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", VOICE_API_URL);
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

export default function CommunityChat() {
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      text: "Merhaba Sena 💜 Bugün nasıl hissediyorsun? Aklından geçenleri yaz, ben duygu durumuna göre sana küçük öneriler hazırlayayım.",
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
          conversationId: DEMO_CONVERSATION_ID,
          message: userMsg,
          userId: DEMO_USER_ID,
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
        `✨ Duygu: ${data.emotion || "neutral"}\n` +
        `🎯 Aktivite: ${data.aktivite || data.activity || "Kısa bir mola ver"}\n` +
        `🎬 Film: ${data.movie || "Soul"}\n` +
        `📚 Kitap: ${data.book || "Simyacı"}\n`;
      const spotifyUrl =
        (typeof data.spotify === "string" &&
        data.spotify.includes("open.spotify.com")
          ? data.spotify
          : null) ||
        (typeof data.sarki === "string" &&
        data.sarki.includes("open.spotify.com")
          ? data.sarki
          : null);
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
    Alert.alert("Seçenekler", "Ne yapmak istersin?", [
      { text: "Fotoğraf çek", onPress: openCameraPhoto },
      { text: "Video çek", onPress: openCameraVideo },
      { text: "Galeriden fotoğraf seç", onPress: pickPhoto },
      { text: "Galeriden video seç", onPress: pickVideo },
      { text: "İptal", style: "cancel" },
    ]);
  };

  const openCameraPhoto = async () => {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
    });

    if (!result.canceled)
      console.log("Fotoğraf çekildi:", result.assets[0].uri);
  };

  const openCameraVideo = async () => {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      videoMaxDuration: 60,
      quality: 0.5,
    });

    if (!result.canceled) console.log("Video çekildi:", result.assets[0].uri);
  };

  const pickPhoto = async () => {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
    });

    if (!result.canceled)
      console.log("Fotoğraf seçildi:", result.assets[0].uri);
  };

  const pickVideo = async () => {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.5,
    });

    if (!result.canceled) console.log("Video seçildi:", result.assets[0].uri);
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
        data = await uploadVoiceWithXhr(buildVoiceFormData(uri));
      } catch (firstError) {
        const fallbackUri =
          Platform.OS === "ios" && uri.startsWith("file://")
            ? uri.replace("file://", "")
            : uri;

        if (fallbackUri !== uri) {
          data = await uploadVoiceWithXhr(buildVoiceFormData(fallbackUri));
        } else {
          throw firstError;
        }
      }

      const assistantReply =
        typeof data.assistantReply === "string" && data.assistantReply.trim()
          ? data.assistantReply.trim()
          : null;
      const emotion = String(data.emotion || "neutral").toLowerCase();
      const fallback = getVoiceFallbackRecommendations(emotion);
      const aiText = assistantReply || fallback.reply;
      const activity = data.aktivite || data.activity || fallback.activity;
      const movie = data.movie || fallback.movie;
      const book = data.book || fallback.book;
      const spotify = data.spotify || fallback.spotify;
      const debugSummary = buildVoiceResponseWithFusion(data);
      const voiceText =
        `💭 ${aiText}\n\n` +
        `✨ Duygu: ${emotion}\n` +
        `🎯 Aktivite: ${activity}\n` +
        `🎬 Film: ${movie}\n` +
        `📚 Kitap: ${book}\n` +
        `🎧 Spotify: ${spotify}\n\n` +
        `---\nKontrol detayı:\n${debugSummary}`;
      const spotifyUrl =
        typeof data.spotify === "string" &&
        data.spotify.includes("open.spotify.com")
          ? data.spotify
          : undefined;

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

        <TouchableOpacity style={styles.iconButton}>
          <MaterialCommunityIcons name="dots-vertical" size={24} color={INK} />
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
                <Text style={[styles.bubbleText, isUser && styles.userText]}>
                  {item.text}
                </Text>
                {item.spotifyUrl?.startsWith("https://open.spotify.com") && (
                  <TouchableOpacity
                    style={styles.spotifyCard}
                    activeOpacity={0.8}
                    onPress={() => {
                      if (item.spotifyUrl) {
                        Linking.openURL(item.spotifyUrl);
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
              <Text style={styles.actionText}>Fotoğraf veya video seç</Text>
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

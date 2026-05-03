import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import React, { useRef, useState } from "react";
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
const SOFT = "#eef0fb";

const API_URL = "http://172.20.10.2:3000/recommendation";
const DEMO_USER_ID = "demo-user";
const DEMO_CONVERSATION_ID = "demo-conversation";

type ChatMessage = {
  id: string;
  text: string;
  sender: "user" | "bot";
  time: string;
  spotifyUrl?: string;
};

function getTime() {
  return new Date().toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
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
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [showActions, setShowActions] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

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

      const rawData = await res.json();
      const data = Array.isArray(rawData) ? rawData[0] : rawData;
      console.log("DATA:", data);
      const botText =
        `💭 ${data.tavsiye || data.message || "Seni anlıyorum."}\n\n` +
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
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) return;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );

      setRecording(newRecording);
    } catch (err) {
      console.log("Recording error", err);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    await recording.stopAndUnloadAsync();
    console.log("Ses kaydedildi:", recording.getURI());
    setRecording(null);
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
        <View style={styles.recordingBadge}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingText}>Ses kaydı alınıyor...</Text>
        </View>
      )}

      {showActions && (
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
                name={recording ? "stop-circle-outline" : "microphone-outline"}
                size={24}
                color={PURPLE}
              />
            </View>
            <View>
              <Text style={styles.actionTitle}>Ses</Text>
              <Text style={styles.actionText}>
                {recording ? "Kaydı durdur" : "Ses kaydı başlat"}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputBar}>
        <TouchableOpacity
          style={[styles.plusButton, showActions && styles.plusButtonActive]}
          onPress={() => setShowActions((value) => !value)}
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
  recordingBadge: {
    alignSelf: "center",
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#fff0f0",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ff4d4d",
  },
  recordingText: {
    color: "#cf3333",
    fontSize: 12,
    fontWeight: "700",
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

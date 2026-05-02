import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function CommunityChat() {
  useEffect(() => {
    testAPI(); // Uygulama açıldığında otomatik test eder
  }, []);
  const [messages, setMessages] = useState([
    { id: "1", text: "Merhaba 👋", sender: "bot" },
  ]);
  const [input, setInput] = useState("");
  const [recording, setRecording] = useState<Audio.Recording | null>(null);

  // Mesaj gönder
  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMsg = input;

    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), text: userMsg, sender: "user" },
    ]);

    setInput("");

    try {
      console.log("API gönderiliyor...");

      const res = await fetch("http://172.20.10.2:5678/webhook-test/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userMsg,
        }),
      });

      const rawData = await res.json();
      console.log("Gelen Ham Veri:", rawData);

      // n8n veriyi liste [ { ... } ] içinde gönderdiği için ilk elemanı alıyoruz
      const data = Array.isArray(rawData) ? rawData[0] : rawData;

      const botText =
        `${data.message || "Seni anlıyorum."}\n\n` +
        `🏃 Aktivite: ${data.activity || "Dinlenmelisin."}\n` +
        `🎬 Film: ${data.movie || "Soul"}\n` +
        `📚 Kitap: ${data.book || "Simyacı"}\n` +
        `🎧 Spotify: ${data.spotify || "Haftalık Keşif"}`;

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "-bot",
          text: botText,
          sender: "bot",
        },
      ]);
    } catch (err) {
      console.log("HATA:", err);
      Alert.alert("Hata", "Sunucuya bağlanılamadı.");
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

  // 📷 Kamera aç
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

  // 🎤 Ses kaydı başlat
  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) return;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );

      setRecording(recording);
    } catch (err) {
      console.log("Recording error", err);
    }
  };

  const testAPI = async () => {
    try {
      console.log("istek atılıyor...");

      const res = await fetch("http://172.20.10.2:5678/webhook-test/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "test", // testAPI için 'test'
        }),
      });

      console.log("response status:", res.status);

      const data = await res.json();

      console.log("DATA:", data);
    } catch (err) {
      console.log("HATA:", err);
    }
  };

  // 🎤 Ses kaydı durdur
  const stopRecording = async () => {
    if (!recording) return;

    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecording(null);

    console.log("Ses kaydedildi:", uri);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#fff" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* 🔝 HEADER */}
      <View
        style={{
          paddingTop: 50,
          paddingBottom: 15,
          backgroundColor: "#007AFF",
          alignItems: "center",
        }}
      >
        <Text style={{ color: "white", fontSize: 18, fontWeight: "bold" }}>
          Sohbet Botu
        </Text>
      </View>

      {/* 💬 MESAJLAR */}
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 10 }}
        renderItem={({ item }) => (
          <View
            style={{
              alignSelf: item.sender === "user" ? "flex-end" : "flex-start",
              backgroundColor: item.sender === "user" ? "#007AFF" : "#E5E5EA",
              padding: 10,
              borderRadius: 12,
              marginVertical: 4,
              maxWidth: "75%",
            }}
          >
            <Text
              style={{
                color: item.sender === "user" ? "white" : "black",
              }}
            >
              {item.text}
            </Text>
          </View>
        )}
      />

      {/* ⬇️ INPUT BAR */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 8,
          borderTopWidth: 1,
          borderColor: "#ddd",
        }}
      >
        {/* 📷 Kamera */}
        <TouchableOpacity onPress={pickMedia}>
          <MaterialCommunityIcons name="camera" size={26} color="gray" />
        </TouchableOpacity>
        <TouchableOpacity onPress={pickVideo} style={{ marginLeft: 10 }}>
          <MaterialCommunityIcons name="video" size={26} color="gray" />
        </TouchableOpacity>

        {/* ✏️ Input */}
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Mesaj yaz..."
          style={{
            flex: 1,
            backgroundColor: "#f1f1f1",
            borderRadius: 20,
            paddingHorizontal: 15,
            marginHorizontal: 10,
          }}
        />

        {/* 🎤 / 📤 */}
        <TouchableOpacity
          onPressIn={startRecording}
          onPressOut={stopRecording}
          onPress={sendMessage}
        >
          {input.length > 0 ? (
            <MaterialCommunityIcons name="send" size={26} color="#007AFF" />
          ) : (
            <MaterialCommunityIcons name="microphone" size={26} color="gray" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

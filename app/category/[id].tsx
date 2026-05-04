import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

const API_BASE_URL = "http://172.20.10.2:3000";
const DEMO_USER_ID = "demo-user";

const PURPLE = "#604df6";
const INK = "#101426";
const MUTED = "#687086";

const screenData: Record<string, { title: string; subtitle: string; icon: string; color: string }> = {
  journal: { title: "Günlük", subtitle: "Notlarını ve şükranlarını birlikte kaydet.", icon: "notebook-outline", color: "#6654f5" },
  breath: { title: "Nefes Egzersizleri", subtitle: "Kısa, uygulanabilir nefes pratikleri.", icon: "weather-windy", color: "#32a79f" },
  meditation: { title: "Meditasyon", subtitle: "Odak, sakinlik ve beden farkındalığı.", icon: "meditation", color: "#8655ee" },
  sleep: { title: "Uyku", subtitle: "Uykuya geçişi kolaylaştıran sakin kaynaklar.", icon: "moon-waning-crescent", color: "#4f7df7" },
  motivation: { title: "Motivasyon", subtitle: "Günün sözleri ve küçük hatırlatmalar.", icon: "star-outline", color: "#d79a13" },
  goals: { title: "Hedefler", subtitle: "Küçük, takip edilebilir hedefler ekle.", icon: "target", color: "#368cf5" },
  music: { title: "Müzik", subtitle: "Ruh hâline göre tek tek Spotify aramaları.", icon: "music-note", color: "#2c9abf" },
  "recommendation-activity": { title: "Aktivite Önerileri", subtitle: "Bugün iyi gelebilecek küçük planlar.", icon: "leaf", color: "#4eb888" },
  "recommendation-sport": { title: "Spor Önerileri", subtitle: "Kısa ve uygulanabilir hareket fikirleri.", icon: "run", color: "#3b8eea" },
  "recommendation-book": { title: "Kitap Önerileri", subtitle: "Ruh hâline iyi gelebilecek okumalar.", icon: "book-open-page-variant", color: "#7e5ce6" },
  "recommendation-movie": { title: "Film Önerileri", subtitle: "Bugün izlenebilecek hafif seçimler.", icon: "movie-open", color: "#d95c9d" },
};

const recommendationDetails: Record<string, Array<{ title: string; subtitle: string; url: string; icon: string }>> = {
  "recommendation-activity": [
    { title: "20 dakika açık hava yürüyüşü", subtitle: "Dönünce tek cümleyle nasıl hissettiğini yaz.", url: "https://www.google.com/search?q=20+dakika+y%C3%BCr%C3%BCy%C3%BC%C5%9F+faydalar%C4%B1", icon: "walk" },
    { title: "Kısa çizim molası", subtitle: "5 dakikada sadece şekiller ve renklerle ifade et.", url: "https://www.google.com/search?q=duygu+g%C3%BCnl%C3%BC%C4%9F%C3%BC+%C3%A7izim", icon: "palette-outline" },
    { title: "Oda düzenleme ritüeli", subtitle: "Bir masa, bir raf veya küçük bir köşe seç.", url: "https://www.google.com/search?q=oda+d%C3%BCzenlemenin+ruh+haline+etkisi", icon: "home-heart" },
    { title: "Bitki bakımı", subtitle: "Sulama, yaprak temizliği ve kısa bir mola.", url: "https://www.google.com/search?q=bitki+bak%C4%B1m%C4%B1+rahatlat%C4%B1r+m%C4%B1", icon: "flower-outline" },
  ],
  "recommendation-sport": [
    { title: "15 dakika esneme", subtitle: "Boyun, omuz ve sırt için düşük tempolu rutin.", url: "https://www.youtube.com/results?search_query=15+dakika+esneme", icon: "human-handsup" },
    { title: "Başlangıç yogası", subtitle: "Yavaş ve nefesle ilerleyen kısa pratik.", url: "https://www.youtube.com/results?search_query=ba%C5%9Flang%C4%B1%C3%A7+yoga+15+dakika", icon: "yoga" },
    { title: "Pilates başlangıç", subtitle: "Evde ekipmansız yapılabilecek hareketler.", url: "https://www.youtube.com/results?search_query=ba%C5%9Flang%C4%B1%C3%A7+pilates+evde", icon: "human" },
    { title: "Düşük tempo kardiyo", subtitle: "Zıplamasız, hafif enerji yükseltici seçenek.", url: "https://www.youtube.com/results?search_query=low+impact+cardio+beginner", icon: "heart-pulse" },
  ],
  "recommendation-book": [
    { title: "Küçük Prens", subtitle: "Kısa, duygusal ve yumuşak bir okuma.", url: "https://www.google.com/search?q=K%C3%BC%C3%A7%C3%BCk+Prens+kitap", icon: "book-open-page-variant" },
    { title: "Simyacı", subtitle: "Yol, arayış ve umut temaları.", url: "https://www.google.com/search?q=Simyac%C4%B1+kitap", icon: "book-outline" },
    { title: "İnsan Ne ile Yaşar?", subtitle: "Kısa klasik hikâyeler.", url: "https://www.google.com/search?q=%C4%B0nsan+Ne+ile+Ya%C5%9Far+kitap", icon: "book-heart-outline" },
    { title: "Duygusal Zeka", subtitle: "Duyguları anlamak için daha açıklayıcı bir seçim.", url: "https://www.google.com/search?q=Duygusal+Zeka+kitap", icon: "brain" },
  ],
  "recommendation-movie": [
    { title: "Inside Out", subtitle: "Duyguları anlamak için renkli ve sıcak.", url: "https://www.google.com/search?q=Inside+Out+film", icon: "movie-open" },
    { title: "Soul", subtitle: "Anlam, müzik ve gündelik mutluluk üzerine.", url: "https://www.google.com/search?q=Soul+film", icon: "movie-roll" },
    { title: "Amelie", subtitle: "Yumuşak, görsel ve iyi hissettiren bir film.", url: "https://www.google.com/search?q=Amelie+film", icon: "filmstrip" },
    { title: "The Secret Life of Walter Mitty", subtitle: "Hafif macera ve ilham.", url: "https://www.google.com/search?q=The+Secret+Life+of+Walter+Mitty", icon: "movie-outline" },
  ],
};

const linksById: Record<string, Array<{ title: string; subtitle: string; url: string; icon: string }>> = {
  breath: [
    { title: "4-7-8 nefes egzersizi", subtitle: "Kısa sakinleşme pratiği", url: "https://open.spotify.com/search/4-7-8%20breathing", icon: "weather-windy" },
    { title: "Kutu nefesi", subtitle: "Odaklanmak için ritimli nefes", url: "https://open.spotify.com/search/box%20breathing", icon: "square-rounded-outline" },
    { title: "Derin nefes meditasyonu", subtitle: "Spotify araması", url: "https://open.spotify.com/search/deep%20breathing%20meditation", icon: "weather-windy" },
    { title: "Kaygı için nefes", subtitle: "Sakinleşme odaklı içerikler", url: "https://open.spotify.com/search/anxiety%20breathing", icon: "heart-outline" },
    { title: "Türkçe nefes egzersizi", subtitle: "Türkçe içerik araması", url: "https://open.spotify.com/search/t%C3%BCrk%C3%A7e%20nefes%20egzersizi", icon: "account-voice" },
  ],
  meditation: [
    { title: "10 dk meditasyon", subtitle: "Odak ve sakinlik", url: "https://open.spotify.com/search/10%20minute%20meditation", icon: "meditation" },
    { title: "Türkçe meditasyon", subtitle: "Rehberli pratikler", url: "https://open.spotify.com/search/t%C3%BCrk%C3%A7e%20meditasyon", icon: "account-voice" },
    { title: "Beden tarama meditasyonu", subtitle: "Gerginliği fark etmek için", url: "https://open.spotify.com/search/body%20scan%20meditation", icon: "human" },
    { title: "Sabah meditasyonu", subtitle: "Güne yavaş başlamak için", url: "https://open.spotify.com/search/morning%20meditation", icon: "white-balance-sunny" },
  ],
  sleep: [
    { title: "Uyku sesleri", subtitle: "Yağmur, dalga ve beyaz gürültü", url: "https://open.spotify.com/search/sleep%20sounds", icon: "moon-waning-crescent" },
    { title: "Gece meditasyonu", subtitle: "Uykuya geçiş desteği", url: "https://open.spotify.com/search/night%20meditation", icon: "weather-night" },
    { title: "Türkçe uyku meditasyonu", subtitle: "Rehberli uyku içerikleri", url: "https://open.spotify.com/search/t%C3%BCrk%C3%A7e%20uyku%20meditasyonu", icon: "account-voice" },
    { title: "Rahatlatıcı piyano", subtitle: "Sakin müzik araması", url: "https://open.spotify.com/search/relaxing%20piano%20sleep", icon: "piano" },
  ],
  music: [
    { title: "Sakin odak", subtitle: "Çalışma ve dinginlik", url: "https://open.spotify.com/search/calm%20focus", icon: "music-note" },
    { title: "Mutlu hisler", subtitle: "Enerji yükseltici şarkılar", url: "https://open.spotify.com/search/happy%20mood", icon: "emoticon-happy-outline" },
    { title: "Lo-fi rahatlama", subtitle: "Yumuşak arka plan müziği", url: "https://open.spotify.com/search/lofi%20relax", icon: "headphones" },
    { title: "Türkçe akustik", subtitle: "Sakin şarkılar", url: "https://open.spotify.com/search/t%C3%BCrk%C3%A7e%20akustik", icon: "guitar-acoustic" },
    { title: "Yağmur sesleri", subtitle: "Rahatlama", url: "https://open.spotify.com/search/rain%20sounds", icon: "weather-rainy" },
  ],
};

const motivationQuotes = [
  "Küçük bir adım, hiç başlamamaktan daha güçlüdür.",
  "Bugün her şeyi çözmene gerek yok; sadece kendine biraz alan aç.",
  "Zor bir duygu geldiyse, bu onun kalıcı olduğu anlamına gelmez.",
  "Kendine iyi davranmak da gerçek bir hedeftir.",
  "Dinlenmek geriye gitmek değildir; devam edebilmek için yer açmaktır.",
  "Duygular değişir, sen onların içinde sıkışıp kalmak zorunda değilsin.",
  "Bugünün en küçük iyi şeyi bile kayda değer.",
  "Yavaş ilerlemek de ilerlemektir.",
];

async function openExternalUrl(url: string) {
  try {
    const canOpen = await Linking.canOpenURL(url);

    if (!canOpen) {
      Alert.alert("Bağlantı açılamadı", "Bu bağlantı cihazda açılamıyor.");
      return;
    }

    await Linking.openURL(url);
  } catch (error) {
    console.log("Link open error:", error);
    Alert.alert("Bağlantı açılamadı", "Lütfen daha sonra tekrar dene.");
  }
}

export default function CategoryDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = params.id || "journal";
  const data = screenData[id] || screenData.journal;
  const [note, setNote] = useState("");
  const [goal, setGoal] = useState("");
  const [savedNotes, setSavedNotes] = useState<string[]>([]);
  const [goals, setGoals] = useState<string[]>(["Bugün 10 dakika yürüyüş yap"]);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isSavingGoal, setIsSavingGoal] = useState(false);

  const links = linksById[id] || [];
  const recommendationItems = recommendationDetails[id] || [];

  const saveJournal = async () => {
    const value = note.trim();

    if (!value) {
      Alert.alert("Not boş", "Kaydetmek için önce kısa bir not yaz.");
      return;
    }

    try {
      setIsSavingNote(true);
      const response = await fetch(`${API_BASE_URL}/users/${DEMO_USER_ID}/journal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value, type: "journal" }),
      });

      if (!response.ok) {
        throw new Error(`Journal save failed: ${response.status}`);
      }

      setSavedNotes((items) => [value, ...items]);
      setNote("");
      Alert.alert("Kaydedildi", "Günlük notun Firebase içinde kullanıcıya bağlı tutuluyor.");
    } catch (error) {
      console.log("Journal save error:", error);
      Alert.alert("Kaydedilemedi", "Backend bağlantısını kontrol edip tekrar dene.");
    } finally {
      setIsSavingNote(false);
    }
  };

  const saveGoal = async () => {
    const value = goal.trim();

    if (!value) {
      Alert.alert("Hedef boş", "Kaydetmek için önce bir hedef yaz.");
      return;
    }

    try {
      setIsSavingGoal(true);
      const response = await fetch(`${API_BASE_URL}/users/${DEMO_USER_ID}/goals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: value }),
      });

      if (!response.ok) {
        throw new Error(`Goal save failed: ${response.status}`);
      }

      setGoals((items) => [value, ...items]);
      setGoal("");
      Alert.alert("Kaydedildi", "Hedefin Firebase içinde kullanıcıya bağlı tutuluyor.");
    } catch (error) {
      console.log("Goal save error:", error);
      Alert.alert("Kaydedilemedi", "Backend bağlantısını kontrol edip tekrar dene.");
    } finally {
      setIsSavingGoal(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <MaterialCommunityIcons name="chevron-left" size={30} color={INK} />
        </TouchableOpacity>
      </View>

      <View style={styles.hero}>
        <View style={[styles.heroIcon, { backgroundColor: `${data.color}22` }]}>
          <MaterialCommunityIcons name={data.icon as any} size={36} color={data.color} />
        </View>
        <Text style={styles.title}>{data.title}</Text>
        <Text style={styles.subtitle}>{data.subtitle}</Text>
      </View>

      {recommendationItems.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Seçenekler</Text>
          {recommendationItems.map((item) => (
            <TouchableOpacity key={item.title} style={styles.linkRow} onPress={() => openExternalUrl(item.url)}>
              <View style={styles.linkIcon}>
                <MaterialCommunityIcons name={item.icon as any} size={22} color={PURPLE} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.linkTitle}>{item.title}</Text>
                <Text style={styles.linkSubtitle}>{item.subtitle}</Text>
              </View>
              <MaterialCommunityIcons name="open-in-new" size={18} color={MUTED} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {links.map((item) => (
        <TouchableOpacity key={item.title} style={styles.linkRow} onPress={() => openExternalUrl(item.url)}>
          <View style={styles.linkIcon}>
            <MaterialCommunityIcons name={item.icon as any} size={22} color={PURPLE} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.linkTitle}>{item.title}</Text>
            <Text style={styles.linkSubtitle}>{item.subtitle}</Text>
          </View>
          <MaterialCommunityIcons name="open-in-new" size={18} color={MUTED} />
        </TouchableOpacity>
      ))}

      {id === "journal" && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Günlük ve şükran notu</Text>
          <Text style={styles.helperText}>Bugün seni etkileyen bir anı, aklında kalan bir cümleyi veya minnet duyduğun bir şeyi yaz.</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Bugün şunu fark ettim..."
            placeholderTextColor="#9aa0b2"
            multiline
            style={styles.noteInput}
          />
          <TouchableOpacity style={[styles.primaryButton, isSavingNote && styles.disabledButton]} onPress={saveJournal} disabled={isSavingNote}>
            <Text style={styles.primaryButtonText}>{isSavingNote ? "Kaydediliyor..." : "Kaydet"}</Text>
          </TouchableOpacity>
          {savedNotes.map((item) => (
            <View key={item} style={styles.savedItem}>
              <MaterialCommunityIcons name="check-circle-outline" size={20} color="#4eb888" />
              <Text style={styles.savedText}>{item}</Text>
            </View>
          ))}
        </View>
      )}

      {id === "goals" && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Yeni hedef ekle</Text>
          <View style={styles.inputRow}>
            <TextInput value={goal} onChangeText={setGoal} placeholder="Örn. 10 dakika yürüyüş yap" placeholderTextColor="#9aa0b2" style={styles.shortInput} />
            <TouchableOpacity style={[styles.addButton, isSavingGoal && styles.disabledButton]} onPress={saveGoal} disabled={isSavingGoal}>
              <MaterialCommunityIcons name="plus" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
          {goals.map((item) => (
            <View key={item} style={styles.goalItem}>
              <MaterialCommunityIcons name="check-circle-outline" size={20} color="#4eb888" />
              <Text style={styles.goalText}>{item}</Text>
            </View>
          ))}
        </View>
      )}

      {id === "motivation" && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Kısa sözler</Text>
          {motivationQuotes.map((item) => (
            <View key={item} style={styles.quoteBox}>
              <Text style={styles.quoteText}>{item}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f8f8ff" },
  content: { padding: 24, paddingTop: 54, paddingBottom: 110 },
  topBar: { height: 42, justifyContent: "center" },
  backButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  hero: { marginTop: 16, marginBottom: 20 },
  heroIcon: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  title: { color: INK, fontSize: 28, fontWeight: "900", marginTop: 18 },
  subtitle: { color: MUTED, fontSize: 14, lineHeight: 21, marginTop: 8 },
  card: { borderRadius: 18, backgroundColor: "#fff", padding: 16, marginBottom: 14, shadowColor: "#6b6f8f", shadowOpacity: 0.12, shadowRadius: 16, elevation: 3 },
  cardTitle: { color: INK, fontSize: 16, fontWeight: "900", marginBottom: 12 },
  helperText: { color: MUTED, fontSize: 13, lineHeight: 19, marginBottom: 12 },
  primaryButton: { height: 46, borderRadius: 16, backgroundColor: PURPLE, alignItems: "center", justifyContent: "center", marginTop: 12 },
  disabledButton: { opacity: 0.58 },
  primaryButtonText: { color: "#fff", fontSize: 14, fontWeight: "900" },
  linkRow: { minHeight: 64, borderRadius: 16, backgroundColor: "#fff", flexDirection: "row", alignItems: "center", gap: 10, padding: 12, marginBottom: 10, shadowColor: "#6b6f8f", shadowOpacity: 0.1, shadowRadius: 12, elevation: 2 },
  linkIcon: { width: 38, height: 38, borderRadius: 15, backgroundColor: "#f7f5ff", alignItems: "center", justifyContent: "center" },
  linkTitle: { color: INK, fontSize: 13, fontWeight: "800" },
  linkSubtitle: { color: MUTED, fontSize: 11, lineHeight: 15, marginTop: 2 },
  noteInput: { minHeight: 150, borderRadius: 16, backgroundColor: "#f7f5ff", padding: 14, color: INK, fontSize: 14, textAlignVertical: "top" },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  shortInput: { flex: 1, height: 46, borderRadius: 15, backgroundColor: "#f7f5ff", paddingHorizontal: 14, color: INK, fontSize: 14 },
  addButton: { width: 46, height: 46, borderRadius: 18, backgroundColor: PURPLE, alignItems: "center", justifyContent: "center" },
  goalItem: { minHeight: 42, borderRadius: 14, backgroundColor: "#f2fff7", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, marginTop: 8 },
  goalText: { flex: 1, color: INK, fontSize: 13, fontWeight: "700" },
  savedItem: { minHeight: 42, borderRadius: 14, backgroundColor: "#f7f5ff", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, marginTop: 10 },
  savedText: { flex: 1, color: INK, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  quoteBox: { borderRadius: 14, backgroundColor: "#f7f5ff", padding: 12, marginBottom: 10 },
  quoteText: { color: INK, fontSize: 13, lineHeight: 19, fontWeight: "700" },
});

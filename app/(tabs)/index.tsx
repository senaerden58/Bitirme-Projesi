import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const PURPLE = "#604df6";
const INK = "#101426";
const MUTED = "#687086";

const quotes = [
  { text: "Küçük bir adım bile, olduğun yerde kalmaktan daha güçlüdür.", label: "Günün sözü" },
  { text: "Bugün hissettiğin şey senin tamamını anlatmaz; sadece bugünün bir parçasıdır.", label: "Motivasyon" },
  { text: "Kendine gösterdiğin sabır, iyileşmenin en sessiz ama en güçlü hâlidir.", label: "İyi olma notu" },
  { text: "Bazen ilerlemek, sadece durup derin bir nefes almayı bilmektir.", label: "Hatırlatma" },
  { text: "Mutluysan bunu büyütmek, yorgunsan bunu duymak da değerlidir.", label: "Denge" },
];

const recommendations = [
  { key: "recommendation-activity", title: "Aktivite", detail: "Yürüyüş, çizim, doğa", icon: "leaf", color: "#4eb888" },
  { key: "recommendation-sport", title: "Spor", detail: "Yoga, esneme, pilates", icon: "run", color: "#3b8eea" },
  { key: "recommendation-book", title: "Kitap", detail: "Duyguya göre kitaplar", icon: "book-open-page-variant", color: "#7e5ce6" },
  { key: "recommendation-movie", title: "Film", detail: "Ruh hâline göre filmler", icon: "movie-open", color: "#d95c9d" },
];

const categories = [
  { key: "journal", title: "Günlük", detail: "Not ve şükran", icon: "notebook-outline", color: "#6654f5" },
  { key: "breath", title: "Nefes", detail: "Egzersiz", icon: "weather-windy", color: "#32a79f" },
  { key: "meditation", title: "Meditasyon", detail: "Sesli pratik", icon: "meditation", color: "#8655ee" },
  { key: "sleep", title: "Uyku", detail: "Rahatlama", icon: "moon-waning-crescent", color: "#4f7df7" },
  { key: "motivation", title: "Motivasyon", detail: "Sözler", icon: "star-outline", color: "#d79a13" },
  { key: "goals", title: "Hedefler", detail: "Hedef ekle", icon: "target", color: "#368cf5" },
  { key: "music", title: "Müzik", detail: "Şarkılar", icon: "music-note", color: "#2c9abf" },
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

export default function HomeScreen() {
  const [activeQuote, setActiveQuote] = useState(0);
  const quote = quotes[activeQuote];

  const showNextQuote = () => {
    setActiveQuote((index) => (index + 1) % quotes.length);
  };

  const showPreviousQuote = () => {
    setActiveQuote((index) => (index - 1 + quotes.length) % quotes.length);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={styles.logo}>
          <MaterialCommunityIcons name="brain" size={28} color={PURPLE} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.hello}>Merhaba, Sena</Text>
          <Text style={styles.title}>Bugün kendini nasıl hissediyorsun?</Text>
        </View>
        <TouchableOpacity style={styles.iconButton}>
          <MaterialCommunityIcons name="bell-outline" size={22} color={INK} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.hero} activeOpacity={0.9} onPress={showNextQuote}>
        <View style={styles.heroMoon} />
        <Text style={styles.heroLabel}>{quote.label}</Text>
        <Text style={styles.heroText}>{quote.text}</Text>
        <MaterialCommunityIcons name="human-greeting-variant" size={44} color="#d7dcff" style={styles.heroIcon} />
        <View style={styles.heroControls}>
          <TouchableOpacity style={styles.heroArrow} onPress={showPreviousQuote}>
            <MaterialCommunityIcons name="chevron-left" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.heroArrow} onPress={showNextQuote}>
            <MaterialCommunityIcons name="chevron-right" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      <View style={styles.dots}>
        {quotes.map((item, index) => (
          <TouchableOpacity
            key={item.label}
            onPress={() => setActiveQuote(index)}
            style={[styles.dot, activeQuote === index && styles.dotActive]}
            accessibilityLabel={`${index + 1}. sözü göster`}
          />
        ))}
      </View>

      <Text style={styles.sectionTitle}>Senin için öneriler</Text>
      <View style={styles.recommendationRow}>
        {recommendations.map((item) => (
          <TouchableOpacity key={item.key} style={styles.smallCard} onPress={() => router.push(`/category/${item.key}` as any)}>
            <View style={[styles.roundIcon, { backgroundColor: `${item.color}22` }]}>
              <MaterialCommunityIcons name={item.icon as any} size={26} color={item.color} />
            </View>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardDetail}>{item.detail}</Text>
            <View style={styles.openChip}>
              <Text style={styles.openChipText}>Aç</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Kategoriler</Text>
      <View style={styles.categoryGrid}>
        {categories.map((item) => (
          <TouchableOpacity
            key={`${item.title}-${item.icon}`}
            onPress={() => router.push(`/category/${item.key}` as any)}
            style={styles.categoryCard}
          >
            <MaterialCommunityIcons name={item.icon as any} size={26} color={item.color} />
            <Text style={styles.categoryTitle}>{item.title}</Text>
            <Text style={styles.categoryDetail}>{item.detail}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Bugünün önerisi</Text>
      <TouchableOpacity style={styles.todayCard} onPress={() => openExternalUrl("https://open.spotify.com/search/positive%20morning")}>
        <View style={styles.plantCard}>
          <MaterialCommunityIcons name="flower-tulip-outline" size={42} color="#518e5b" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.todayTitle}>Güne pozitif başla</Text>
          <Text style={styles.todayText}>5 dakikalık şükran egzersizi ile odaklanmanı artır.</Text>
        </View>
        <View style={styles.playButton}>
          <MaterialCommunityIcons name="play" size={24} color="#fff" />
        </View>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f8f8ff" },
  content: { padding: 24, paddingTop: 56, paddingBottom: 110 },
  header: { flexDirection: "row", alignItems: "center", gap: 14 },
  logo: { width: 44, height: 44, borderRadius: 18, backgroundColor: "#eeecff", alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1 },
  hello: { color: MUTED, fontSize: 15 },
  title: { color: INK, fontSize: 20, fontWeight: "800", lineHeight: 28, marginTop: 4 },
  iconButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  hero: { minHeight: 184, borderRadius: 24, backgroundColor: "#6654f5", marginTop: 28, padding: 24, overflow: "hidden" },
  heroMoon: { position: "absolute", right: -20, top: -30, width: 170, height: 170, borderRadius: 85, backgroundColor: "#e77bd2", opacity: 0.58 },
  heroIcon: { position: "absolute", right: 52, bottom: 34, opacity: 0.8 },
  heroLabel: { color: "#eef0ff", fontSize: 13, fontWeight: "800", marginBottom: 10 },
  heroText: { color: "#fff", fontSize: 18, fontWeight: "800", lineHeight: 27, width: "80%" },
  heroControls: { position: "absolute", right: 16, top: 16, flexDirection: "row", gap: 8 },
  heroArrow: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#ffffff24", alignItems: "center", justifyContent: "center" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 7, marginVertical: 16 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#d2d5e5" },
  dotActive: { width: 22, backgroundColor: PURPLE },
  sectionTitle: { color: INK, fontSize: 17, fontWeight: "800", marginTop: 18, marginBottom: 12 },
  recommendationRow: { flexDirection: "row", gap: 12 },
  smallCard: { flex: 1, minHeight: 150, borderRadius: 18, backgroundColor: "#fff", alignItems: "center", padding: 12, shadowColor: "#6b6f8f", shadowOpacity: 0.12, shadowRadius: 16, elevation: 3 },
  roundIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  cardTitle: { color: INK, fontSize: 13, fontWeight: "800", textAlign: "center" },
  cardDetail: { color: MUTED, fontSize: 11, lineHeight: 15, marginTop: 5, textAlign: "center" },
  openChip: { marginTop: 9, borderRadius: 12, backgroundColor: "#eeeaff", paddingHorizontal: 10, paddingVertical: 4 },
  openChipText: { color: PURPLE, fontSize: 10, fontWeight: "900" },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  categoryCard: { width: "22.6%", aspectRatio: 1, borderRadius: 18, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", padding: 8 },
  categoryTitle: { color: INK, fontSize: 11, fontWeight: "700", marginTop: 6, textAlign: "center" },
  categoryDetail: { color: MUTED, fontSize: 9, textAlign: "center", marginTop: 2 },
  todayCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "#fff", borderRadius: 20, padding: 12, shadowColor: "#6b6f8f", shadowOpacity: 0.12, shadowRadius: 16, elevation: 3 },
  plantCard: { width: 82, height: 76, borderRadius: 16, backgroundColor: "#dceee3", alignItems: "center", justifyContent: "center" },
  todayTitle: { color: INK, fontSize: 15, fontWeight: "800" },
  todayText: { color: MUTED, fontSize: 12, lineHeight: 18, marginTop: 4 },
  playButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#8c7bff", alignItems: "center", justifyContent: "center" },
});

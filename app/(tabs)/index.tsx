import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const PURPLE = "#604df6";
const INK = "#101426";
const MUTED = "#687086";

const recommendations = [
  { title: "Aktivite", detail: "Doga yuruyusu yap", icon: "leaf", color: "#69c69a" },
  { title: "Spor", detail: "15 dk yoga iyi gelecek", icon: "run", color: "#58a8ff" },
  { title: "Kitap", detail: "Kendine Zaman Ayir", icon: "book-open-page-variant", color: "#8f67f3" },
  { title: "Film", detail: "Baslangic", icon: "movie-open", color: "#ee7bc2" },
];

const categories = [
  { title: "Gunluk", detail: "Duygu Analizi", icon: "emoticon-outline", color: "#6654f5" },
  { title: "Nefes", detail: "Egzersizleri", icon: "weather-windy", color: "#32b5aa" },
  { title: "Meditasyon", detail: "", icon: "meditation", color: "#8655ee" },
  { title: "Uyku", detail: "", icon: "moon-waning-crescent", color: "#4f7df7" },
  { title: "Motivasyon", detail: "", icon: "star-outline", color: "#e2a91c" },
  { title: "Sukran", detail: "Gunlugu", icon: "heart-outline", color: "#df5aa9" },
  { title: "Hedefler", detail: "", icon: "target", color: "#368cf5" },
  { title: "Muzik", detail: "", icon: "music-note", color: "#33a5c9" },
];

export default function HomeScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={styles.logo}>
          <MaterialCommunityIcons name="brain" size={28} color={PURPLE} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.hello}>Merhaba, Sena</Text>
          <Text style={styles.title}>Bugun kendini nasil hissediyorsun?</Text>
        </View>
        <TouchableOpacity style={styles.iconButton}>
          <MaterialCommunityIcons name="bell-outline" size={22} color={INK} />
        </TouchableOpacity>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroMoon} />
        <Text style={styles.heroText}>Duygularini anlamak, kendini ozgurlestirmenin ilk adimidir.</Text>
        <Text style={styles.heroAuthor}>- Carl Jung</Text>
        <MaterialCommunityIcons name="human-greeting-variant" size={44} color="#d7dcff" style={styles.heroIcon} />
      </View>

      <View style={styles.dots}>
        <View style={[styles.dot, styles.dotActive]} />
        <View style={styles.dot} />
        <View style={styles.dot} />
      </View>

      <SectionHeader title="Senin icin oneriler" />
      <View style={styles.recommendationRow}>
        {recommendations.map((item) => (
          <TouchableOpacity key={item.title} style={styles.smallCard}>
            <View style={[styles.roundIcon, { backgroundColor: `${item.color}22` }]}>
              <MaterialCommunityIcons name={item.icon as any} size={26} color={item.color} />
            </View>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardDetail}>{item.detail}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Kategoriler</Text>
      <View style={styles.categoryGrid}>
        {categories.map((item) => (
          <TouchableOpacity key={`${item.title}-${item.icon}`} style={styles.categoryCard}>
            <MaterialCommunityIcons name={item.icon as any} size={26} color={item.color} />
            <Text style={styles.categoryTitle}>{item.title}</Text>
            {!!item.detail && <Text style={styles.categoryDetail}>{item.detail}</Text>}
          </TouchableOpacity>
        ))}
      </View>

      <SectionHeader title="Bugunun onerileri" />
      <TouchableOpacity style={styles.todayCard}>
        <View style={styles.plantCard}>
          <MaterialCommunityIcons name="flower-tulip-outline" size={42} color="#518e5b" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.todayTitle}>Gune pozitif basla</Text>
          <Text style={styles.todayText}>5 dakikalik sukran egzersizi ile odaklanmani artir.</Text>
        </View>
        <View style={styles.playButton}>
          <MaterialCommunityIcons name="play" size={24} color="#fff" />
        </View>
      </TouchableOpacity>
    </ScrollView>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.seeAll}>Tumunu gor</Text>
    </View>
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
  hero: { height: 168, borderRadius: 24, backgroundColor: "#6654f5", marginTop: 28, padding: 24, overflow: "hidden" },
  heroMoon: { position: "absolute", right: -20, top: -30, width: 170, height: 170, borderRadius: 85, backgroundColor: "#e77bd2", opacity: 0.58 },
  heroIcon: { position: "absolute", right: 52, bottom: 34, opacity: 0.8 },
  heroText: { color: "#fff", fontSize: 18, fontWeight: "800", lineHeight: 27, width: "78%" },
  heroAuthor: { color: "#eef0ff", fontSize: 13, marginTop: 14 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 7, marginVertical: 16 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#d2d5e5" },
  dotActive: { backgroundColor: PURPLE },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 14, marginBottom: 12 },
  sectionTitle: { color: INK, fontSize: 17, fontWeight: "800", marginTop: 18, marginBottom: 12 },
  seeAll: { color: PURPLE, fontSize: 13, fontWeight: "700" },
  recommendationRow: { flexDirection: "row", gap: 12 },
  smallCard: { flex: 1, minHeight: 132, borderRadius: 18, backgroundColor: "#fff", alignItems: "center", padding: 12, shadowColor: "#6b6f8f", shadowOpacity: 0.12, shadowRadius: 16, elevation: 3 },
  roundIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  cardTitle: { color: INK, fontSize: 12, fontWeight: "800", textAlign: "center" },
  cardDetail: { color: MUTED, fontSize: 10, lineHeight: 15, marginTop: 5, textAlign: "center" },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  categoryCard: { width: "22.6%", aspectRatio: 1, borderRadius: 18, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", padding: 8 },
  categoryTitle: { color: INK, fontSize: 11, fontWeight: "700", marginTop: 6, textAlign: "center" },
  categoryDetail: { color: INK, fontSize: 10, textAlign: "center" },
  todayCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "#fff", borderRadius: 20, padding: 12, shadowColor: "#6b6f8f", shadowOpacity: 0.12, shadowRadius: 16, elevation: 3 },
  plantCard: { width: 82, height: 76, borderRadius: 16, backgroundColor: "#dceee3", alignItems: "center", justifyContent: "center" },
  todayTitle: { color: INK, fontSize: 15, fontWeight: "800" },
  todayText: { color: MUTED, fontSize: 12, lineHeight: 18, marginTop: 4 },
  playButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#8c7bff", alignItems: "center", justifyContent: "center" },
});

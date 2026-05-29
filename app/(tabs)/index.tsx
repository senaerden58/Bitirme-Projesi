import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const PURPLE = "#604df6";
const INK = "#101426";
const MUTED = "#687086";

// Motivasyon kartında dönen sözler burada tutulur.
// activeQuote state'i bu listenin hangi elemanının gösterileceğini belirler.
const quotes = [
  {
    text: "Küçük bir adım bile, olduğun yerde kalmaktan daha güçlüdür.",
    label: "Günün sözü",
  },
  {
    text: "Bugün hissettiğin şey senin tamamını anlatmaz; sadece bugünün bir parçasıdır.",
    label: "Motivasyon",
  },
  {
    text: "Kendine gösterdiğin sabır, iyileşmenin en sessiz ama en güçlü hâlidir.",
    label: "İyi olma notu",
  },
  {
    text: "Bazen ilerlemek, sadece durup derin bir nefes almayı bilmektir.",
    label: "Hatırlatma",
  },
  {
    text: "Mutluysan bunu büyütmek, yorgunsan bunu duymak da değerlidir.",
    label: "Denge",
  },
];

// Ana sayfadaki "Senin için öneriler" kartları.
// key değeri category/[id] sayfasına giderken rota parametresi olarak kullanılır.
const recommendations = [
  {
    key: "recommendation-activity",
    title: "Aktivite",
    detail: "Yürüyüş, çizim, doğa",
    icon: "leaf",
    color: "#4eb888",
  },
  {
    key: "recommendation-sport",
    title: "Spor",
    detail: "Yoga, esneme, pilates",
    icon: "run",
    color: "#3b8eea",
  },
  {
    key: "recommendation-book",
    title: "Kitap",
    detail: "Duyguya göre kitaplar",
    icon: "book-open-page-variant",
    color: "#7e5ce6",
  },
  {
    key: "recommendation-movie",
    title: "Film",
    detail: "Ruh hâline göre filmler",
    icon: "movie-open",
    color: "#d95c9d",
  },
];

// Ana sayfadaki genel kategori kutuları.
// Her kategori tıklandığında aynı detay ekranı açılır, içeriği key'e göre değişir.
const categories = [
  {
    key: "journal",
    title: "Günlük",
    detail: "Not ve şükran",
    icon: "notebook-outline",
    color: "#6654f5",
  },
  {
    key: "breath",
    title: "Nefes",
    detail: "Egzersiz",
    icon: "weather-windy",
    color: "#32a79f",
  },
  {
    key: "meditation",
    title: "Meditasyon",
    detail: "Sesli pratik",
    icon: "meditation",
    color: "#8655ee",
  },
  {
    key: "sleep",
    title: "Uyku",
    detail: "Rahatlama",
    icon: "moon-waning-crescent",
    color: "#4f7df7",
  },
  {
    key: "motivation",
    title: "Motivasyon",
    detail: "Sözler",
    icon: "star-outline",
    color: "#d79a13",
  },
  {
    key: "goals",
    title: "Hedefler",
    detail: "Hedef ekle",
    icon: "target",
    color: "#368cf5",
  },
  {
    key: "music",
    title: "Müzik",
    detail: "Şarkılar",
    icon: "music-note",
    color: "#2c9abf",
  },
];

// Zil ikonuna basınca gösterilecek uygulama içi bildirimler.
// Şimdilik sabit bildirimler var; ileride backend veya Firebase verisiyle doldurulabilir.
const notifications = [
  {
    id: "daily-check",
    title: "Günlük duygu kontrolü",
    text: "Bugün kendini nasıl hissettiğini MERIA ile paylaşabilirsin.",
    icon: "calendar-heart-outline",
  },
  {
    id: "recommendation",
    title: "Öneriler seni bekliyor",
    text: "Ruh hâline uygun aktivite, müzik, film ve kitap önerilerini inceleyebilirsin.",
    icon: "star-outline",
  },
  {
    id: "breath",
    title: "Kısa bir mola",
    text: "Günün içinde birkaç dakikalık nefes egzersizi iyi gelebilir.",
    icon: "weather-windy",
  },
];

// Bugünün önerisi kartı sabit kalmasın diye birkaç öneri arasından seçilir.
// Seçim tarihe göre yapıldığı için aynı gün içinde aynı öneri görünür.
const dailySuggestions = [
  {
    title: "Kısa bir yürüyüş yap",
    text: "10 dakikalık açık hava yürüyüşü zihnini toparlamana yardımcı olabilir.",
    icon: "walk",
    color: "#4eb888",
    backgroundColor: "#dceee3",
    url: "https://www.google.com/search?q=10+dakika+y%C3%BCr%C3%BCy%C3%BC%C5%9F%C3%BCn+faydalar%C4%B1",
  },
  {
    title: "Nefesine dön",
    text: "Kısa bir nefes egzersizi gerginliği azaltmana destek olabilir.",
    icon: "weather-windy",
    color: "#32a79f",
    backgroundColor: "#dff4f1",
    url: "https://open.spotify.com/search/box%20breathing",
  },
  {
    title: "Sakin bir şarkı aç",
    text: "Ruh hâline eşlik edecek sakin bir müzik molası verebilirsin.",
    icon: "music-note",
    color: "#2c9abf",
    backgroundColor: "#dff1f7",
    url: "https://open.spotify.com/search/calm%20focus",
  },
  {
    title: "Küçük bir not yaz",
    text: "Bugün aklında kalan bir cümleyi yazmak iyi gelebilir.",
    icon: "notebook-outline",
    color: "#6654f5",
    backgroundColor: "#eeecff",
    url: "https://www.google.com/search?q=g%C3%BCnl%C3%BCk+yazman%C4%B1n+faydalar%C4%B1",
  },
];

// Harici linkleri güvenli şekilde açmak için ortak yardımcı fonksiyon.
// Cihaz linki açamazsa kullanıcıya Alert ile bilgi verir.
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
  // Hangi motivasyon sözünün gösterileceğini tutar.
  const [activeQuote, setActiveQuote] = useState(0);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const quote = quotes[activeQuote];
  const dailySuggestion =
    dailySuggestions[new Date().getDate() % dailySuggestions.length];

  // Son sözden sonra tekrar başa döner.
  const showNextQuote = () => {
    setActiveQuote((index) => (index + 1) % quotes.length);
  };

  // İlk sözdeyken geri gidilirse listenin sonuna geçer.
  const showPreviousQuote = () => {
    setActiveQuote((index) => (index - 1 + quotes.length) % quotes.length);
  };

  const showNotifications = () => {
    setIsNotificationOpen(true);
  };

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Üst karşılama alanı: logo, kullanıcı selamı ve bildirim ikonu. */}
        <View style={styles.header}>
          <View style={styles.logo}>
            <MaterialCommunityIcons
              name="heart-outline"
              size={28}
              color={PURPLE}
            />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.hello}>MERIA</Text>
            <Text style={styles.title}>Bugün kendini nasıl hissediyorsun?</Text>
          </View>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={showNotifications}
          >
            <MaterialCommunityIcons name="bell-outline" size={22} color={INK} />
          </TouchableOpacity>
        </View>

        {/* Motivasyon kartı: motivasyon sözünü gösterir, tıklayınca sonraki söze geçer. */}
        <TouchableOpacity
          style={styles.motivationCard}
          activeOpacity={0.9}
          onPress={showNextQuote}
        >
          <View style={styles.motivationCardMoon} />
          <Text style={styles.motivationCardLabel}>{quote.label}</Text>
          <Text style={styles.motivationCardText}>{quote.text}</Text>
          <MaterialCommunityIcons
            name="human-greeting-variant"
            size={44}
            color="#d7dcff"
            style={styles.motivationCardIcon}
          />
          <View style={styles.motivationCardControls}>
            <TouchableOpacity
              style={styles.motivationCardArrow}
              onPress={showPreviousQuote}
            >
              <MaterialCommunityIcons
                name="chevron-left"
                size={22}
                color="#fff"
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.motivationCardArrow}
              onPress={showNextQuote}
            >
              <MaterialCommunityIcons
                name="chevron-right"
                size={22}
                color="#fff"
              />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>

        {/* Noktalar, kullanıcının hangi sözde olduğunu gösterir ve direkt seçim yaptırır. */}
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
          {/* recommendations dizisindeki her eleman ekranda bir kart olarak çizilir. */}
          {recommendations.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={styles.smallCard}
              onPress={() => router.push(`/category/${item.key}` as any)}
            >
              <View
                style={[
                  styles.roundIcon,
                  { backgroundColor: `${item.color}22` },
                ]}
              >
                <MaterialCommunityIcons
                  name={item.icon as any}
                  size={26}
                  color={item.color}
                />
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
        <View style={styles.categoryRailWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator
            contentContainerStyle={styles.categoryRail}
          >
            {/* categories dizisi yatay kaydırılan kısa yollar olarak gösterilir. */}
            {categories.map((item) => (
              <TouchableOpacity
                key={`${item.title}-${item.icon}`}
                onPress={() => router.push(`/category/${item.key}` as any)}
                style={styles.categoryCard}
              >
                <MaterialCommunityIcons
                  name={item.icon as any}
                  size={26}
                  color={item.color}
                />
                <Text style={styles.categoryTitle}>{item.title}</Text>
                <Text style={styles.categoryDetail}>{item.detail}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View pointerEvents="none" style={styles.categoryScrollHint}>
            <MaterialCommunityIcons name="chevron-right" size={22} color={INK} />
          </View>
        </View>

        <Text style={styles.sectionTitle}>Bugünün önerisi</Text>
        {/* Bu kart her gün farklı bir öneri gösterir ve ilgili bağlantıya gider. */}
        <TouchableOpacity
          style={styles.todayCard}
          onPress={() => openExternalUrl(dailySuggestion.url)}
        >
          <View
            style={[
              styles.plantCard,
              { backgroundColor: dailySuggestion.backgroundColor },
            ]}
          >
            <MaterialCommunityIcons
              name={dailySuggestion.icon as any}
              size={42}
              color={dailySuggestion.color}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.todayTitle}>{dailySuggestion.title}</Text>
            <Text style={styles.todayText}>{dailySuggestion.text}</Text>
          </View>
          <View style={styles.playButton}>
            <MaterialCommunityIcons name="play" size={24} color="#fff" />
          </View>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        animationType="fade"
        transparent
        visible={isNotificationOpen}
        onRequestClose={() => setIsNotificationOpen(false)}
      >
        <View style={styles.notificationBackdrop}>
          <View style={styles.notificationSheet}>
            <View style={styles.notificationHeader}>
              <View>
                <Text style={styles.notificationTitle}>Bildirimler</Text>
                <Text style={styles.notificationSubtitle}>
                  MERIA hatırlatmaları
                </Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setIsNotificationOpen(false)}
              >
                <MaterialCommunityIcons name="close" size={22} color={INK} />
              </TouchableOpacity>
            </View>

            {notifications.map((item) => (
              <View key={item.id} style={styles.notificationItem}>
                <View style={styles.notificationIcon}>
                  <MaterialCommunityIcons
                    name={item.icon as any}
                    size={22}
                    color={PURPLE}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.notificationItemTitle}>{item.title}</Text>
                  <Text style={styles.notificationItemText}>{item.text}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </Modal>
    </>
  );
}

// Ekranın tüm görsel tasarımı burada tutulur.
// React Native'de CSS yerine StyleSheet objesi kullanılır.
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f8f8ff" },
  content: { padding: 24, paddingTop: 56, paddingBottom: 42 },
  header: { flexDirection: "row", alignItems: "center", gap: 14 },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 18,
    backgroundColor: "#eeecff",
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1 },
  hello: { color: MUTED, fontSize: 15 },
  title: {
    color: INK,
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 28,
    marginTop: 4,
  },
  iconButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  motivationCard: {
    minHeight: 184,
    borderRadius: 24,
    backgroundColor: "#6654f5",
    marginTop: 28,
    padding: 24,
    overflow: "hidden",
  },
  motivationCardMoon: {
    position: "absolute",
    right: -20,
    top: -30,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: "#e77bd2",
    opacity: 0.58,
  },
  motivationCardIcon: {
    position: "absolute",
    right: 52,
    bottom: 34,
    opacity: 0.8,
  },
  motivationCardLabel: {
    color: "#eef0ff",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 10,
  },
  motivationCardText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 27,
    width: "80%",
  },
  motivationCardControls: {
    position: "absolute",
    right: 16,
    top: 16,
    flexDirection: "row",
    gap: 8,
  },
  motivationCardArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#ffffff24",
    alignItems: "center",
    justifyContent: "center",
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 7,
    marginVertical: 16,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#d2d5e5" },
  dotActive: { width: 22, backgroundColor: PURPLE },
  sectionTitle: {
    color: INK,
    fontSize: 17,
    fontWeight: "800",
    marginTop: 18,
    marginBottom: 12,
  },
  recommendationRow: { flexDirection: "row", gap: 12 },
  smallCard: {
    flex: 1,
    minHeight: 150,
    borderRadius: 18,
    backgroundColor: "#fff",
    alignItems: "center",
    padding: 12,
    shadowColor: "#6b6f8f",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 3,
  },
  roundIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  cardTitle: {
    color: INK,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
  },
  cardDetail: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 5,
    textAlign: "center",
  },
  openChip: {
    marginTop: 9,
    borderRadius: 12,
    backgroundColor: "#eeeaff",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  openChipText: { color: PURPLE, fontSize: 10, fontWeight: "900" },
  categoryRailWrap: {
    marginRight: -24,
    position: "relative",
  },
  categoryRail: { gap: 10, paddingRight: 62 },
  categoryScrollHint: {
    position: "absolute",
    right: 12,
    top: 34,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#ffffffee",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#6b6f8f",
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 4,
  },
  categoryCard: {
    width: 104,
    minHeight: 108,
    borderRadius: 16,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
  },
  categoryTitle: {
    color: INK,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 6,
    textAlign: "center",
  },
  categoryDetail: {
    color: MUTED,
    fontSize: 9,
    textAlign: "center",
    marginTop: 2,
  },
  todayCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 12,
    shadowColor: "#6b6f8f",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 3,
  },
  plantCard: {
    width: 82,
    height: 76,
    borderRadius: 16,
    backgroundColor: "#dceee3",
    alignItems: "center",
    justifyContent: "center",
  },
  todayTitle: { color: INK, fontSize: 15, fontWeight: "800" },
  todayText: { color: MUTED, fontSize: 12, lineHeight: 18, marginTop: 4 },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#8c7bff",
    alignItems: "center",
    justifyContent: "center",
  },
  notificationBackdrop: {
    flex: 1,
    backgroundColor: "rgba(16, 20, 38, 0.36)",
    justifyContent: "flex-end",
  },
  notificationSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 20,
    paddingBottom: 30,
  },
  notificationHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  notificationTitle: { color: INK, fontSize: 20, fontWeight: "900" },
  notificationSubtitle: { color: MUTED, fontSize: 12, marginTop: 3 },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#f4f5fb",
    alignItems: "center",
    justifyContent: "center",
  },
  notificationItem: {
    minHeight: 74,
    borderRadius: 18,
    backgroundColor: "#f8f7ff",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    marginTop: 10,
  },
  notificationIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: "#eeeaff",
    alignItems: "center",
    justifyContent: "center",
  },
  notificationItemTitle: { color: INK, fontSize: 14, fontWeight: "900" },
  notificationItemText: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
});

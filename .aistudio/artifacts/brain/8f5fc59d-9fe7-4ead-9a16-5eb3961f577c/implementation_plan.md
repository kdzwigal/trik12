# TrikiScope: Stacja telemetryczna BLE, fuzja sensorów IMU i dashboard Skia

Kompletna aplikacja telemetryczna dla krążka sensorycznego **Żabka Triki (CAP001)** oparta na inżynierii wstecznej projektu [Maku-hub/TrikiScope](https://github.com/Maku-hub/TrikiScope), łącząca bezpośrednią komunikację sprzętową przez **Web Bluetooth API**, potok przetwarzania danych sensorycznych w czasie rzeczywistym (filtr fuzji **Madgwick AHRS**, bufor kołowy, detekcja gestów), interaktywną **wizualizację obiektu 3D** oraz prototyp dashboardu analitycznego wzorowanego na **React Native Skia** z obsługą motywów **Clean Light** oraz **E-Ink High Contrast**.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> Podsumowanie decyzji uzgodnionych z użytkownikiem:
> - **Komunikacja BLE**: Bezpośrednie połączenie sprzętowe przez standardowe **Web Bluetooth API** (bez emulatora). Aplikacja skanuje i łączy się z fizycznym krążkiem Triki (lub urządzeniem z serwisem Nordic UART Service).
> - **Paleta kolorystyczna**: Dostępny przełącznik w czasie rzeczywistym pomiędzy dwoma dopracowanymi motywami: **Clean Tech Light** (laboratoryjny jasny slate/biel z akcentami cyjanu i kobaltu) oraz **E-Ink High Contrast** (monochromatyczny, papierowy e-ink, maksymalny kontrast i czytelność).
> - **Układy dashboardu**: Pełny pakiet **3 układów (layoutów)** przełączanych jednym kliknięciem w nagłówku:
>   1. **Split-Screen Lab** (zrównoważony widok: model 3D krążka + oscyloskop wielokanałowy Skia).
>   2. **Aviation Horizon** (lotniczy sztuczny horyzont, wskaźniki przechyłu Pitch/Roll/Yaw, g-force meter).
>   3. **Signal Analysis** (maksymalna gęstość fal sygnałowych, histogramy, podgląd surowych ramek bajtowych BLE).

---

## 1. Overview & Core Concept

Krążek **Żabka Triki** to miniaturowy kontroler do gier wyposażony w 6-osiowy sensor IMU (3-osiowy akcelerometr + 3-osiowy żyroskop), przycisk mikrostykowy oraz diodę LED RGB. Oryginalnie komunikuje się z telefonem za pośrednictwem Bluetooth Low Energy (BLE) przy użyciu protokołu opartego na serwisie **Nordic UART Service (NUS)**, przesyłając ramki telemetrii z częstotliwością ok. **98–100 Hz**.

Aplikacja rozwiązuje problem braku dedykowanego, nowoczesnego narzędzia badawczego i diagnostycznego:
- Zapewnia **bezpośrednie parowanie BLE** prosto z przeglądarki (Chrome/Edge/Opera z obsługą Web Bluetooth).
- Dekoduje binarny strumień bajtów na fizyczne jednostki ($m/s^2$ oraz $\text{rad}/s$ lub $^{\circ}/s$).
- Przeprowadza **fuzję sensorów za pomocą filtru Madgwicka**, eliminując dryf żyroskopu i wyliczając stabilny kwaternion orientacji przestrzennej.
- Renderuje w czasie rzeczywistym krążek w **Three.js** z odwzorowaniem orientacji, stanu przycisku i barwy LED.
- Prezentuje dane na ultra-płynnych wykresach renderowanych silnikiem 2D Skia/Canvas z zerowym narzutem na DOM.
- Dostarcza kompletną specyfikację architektoniczną i moduły referencyjne dla aplikacji mobilnej **React Native** (`react-native-ble-manager` + `@shopify/react-native-skia`).

---

## 2. Architektura modułu przetwarzania danych w czasie rzeczywistym

Dla częstotliwości 100 Hz kluczowe jest rozdzielenie warstwy odbioru I/O od warstwy renderowania UI (60/120 FPS), zapobiegając blokowaniu głównego wątku (Jank-free pipeline):

```
┌────────────────────────────────────────────────────────────────────────┐
│                        WARSTWA SPRZĘTOWA BLE                           │
│  Fizyczny krążek Triki (CAP001) nadający ramki NUS TX @ 98-100 Hz       │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ GATT Notification (ArrayBuffer)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    WARSTWA DEKODOWANIA I WALIDACJI                     │
│  1. TrikiPacketDecoder (parser ramek binarnych: Accel, Gyro, Btn, Bat) │
│  2. Timestamping o wysokiej precyzji (performance.now)                 │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ RawSensorSample
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                WARSTWA KALIBRACJI I FILTRACJI CZASOWEJ                 │
│  1. Calibration Matrix: Bias removal (odejmowanie offsetu żyroskopu)   │
│  2. Low-Pass Filter: eliminacja szumów wysokoczęstotliwościowych       │
│  3. Madgwick AHRS Fusion: Akcelerometr + Żyroskop -> Kwaternion (q)    │
│  4. Wyliczanie kątów Eulera (Roll, Pitch, Yaw) oraz wektora grawitacji │
│  5. Detektor gestów i pików: Shake, Tap/Double-Tap, Free-fall, Przechył│
└─────────────────┬──────────────────────────────────┬───────────────────┘
                  │                                  │
                  ▼ RingBuffer (500 próbek)          ▼ Quaternion / Euler
┌───────────────────────────────────┐  ┌─────────────────────────────────┐
│     WIZUALIZACJA 2D SKIA/CANVAS   │  │       WIZUALIZACJA 3D THREE.JS  │
│  - Renderowanie na GPU (Canvas 2D)│  │  - Krążek 3D reagujący na ruch  │
│  - Zero alokacji pamięci w pętli  │  │  - Dynamiczne cienie i LED PBR  │
│  - Wykresy Accel/Gyro, Horyzont   │  │  - Fizyczna reakcja przycisku   │
└───────────────────────────────────┘  └─────────────────────────────────┘
```

### Specyfikacja protokołu BLE Triki:
- **Service UUID (Nordic UART Service)**: `6e400001-b5a3-f393-e0a9-e50e24dcca9e`
- **TX Characteristic (Notify - IMU stream)**: `6e400003-b5a3-f393-e0a9-e50e24dcca9e`
- **RX Characteristic (Write - LED / Command control)**: `6e400002-b5a3-f393-e0a9-e50e24dcca9e`
- **Format pakietu IMU**:
  - Bajty 0–5: Akcelerometr $X, Y, Z$ (16-bit signed integer little-endian, skalowanie $\pm 2g$ lub $\pm 4g$).
  - Bajty 6–11: Żyroskop $X, Y, Z$ (16-bit signed integer little-endian, skalowanie $\pm 2000^\circ/s$).
  - Bajt 12: Stan przycisku i flagi gestów (Bit 0 = Przycisk wciśnięty).
  - Bajt 13: Poziom baterii / suma kontrolna lub licznik pakietów.

---

## 3. User Experience & Visual Design

Aplikacja posiada dopracowany interfejs telemetryczny klasy laboratoryjnej z dwoma unikalnymi stylami:

### A. Motyw Clean Tech Light
- **Canvas (60%)**: Czysta, precyzyjna biel i delikatny szary odcień laboratoryjny (`#F8FAFC` oraz `#FFFFFF`).
- **Panele (30%)**: Delikatne obramowania z precyzyjną siatką kreślarską (`#E2E8F0`), matowe tła kafelków (`#F1F5F9`).
- **Akcenty (10%)**: Precyzyjny cyjan (`#0284C7`), kobalt (`#2563EB`) dla osi $X, Y, Z$, ostrzegawczy bursztyn dla przekroczeń żyroskopu.
- **Typografia**: Nowoczesny sans-serif `Plus Jakarta Sans` dla etykiet oraz stałopozycyjny `JetBrains Mono` / `tabular-nums` dla współrzędnych i parametrów.

### B. Motyw E-Ink High Contrast
- **Filozofia**: Inspirowany profesjonalnymi urządzeniami e-papierowymi (Remarkable, Kindle, czytniki lotnicze) oraz skandynawskim minimalizmem.
- **Kolorystyka**: Rygorystyczny monochromatyzm (czysta czerń `#000000`, biel `#FFFFFF`, głęboki antracyt `#1A1A1A` i papierowy odcień `#F4F4F0`).
- **Grafika**: Zero kolorowych poświat i gradientów. Wykresy renderowane z ostrym konturem, kreskowaniem (hatching) i kropkowaniem (dithering).
- **Czytelność**: Maksymalny kontrast w pełnym świetle słonecznym, idealny dla wyświetlaczy e-ink.

### C. Trzy warianty układu (Layouts)
1. **Split-Screen Lab**: Dwa równe obszary robocze: lewa strona to interaktywny viewport 3D z orientacją krążka, prawa strona to 2-kanałowy oscyloskop Skia (akceleracja oraz prędkość kątowa) i wskaźniki g-force.
2. **Aviation Horizon**: Centralny, panoramiczny sztuczny horyzont (Attitude Indicator) z podziałką stopniową przechyłu i pochylenia, obok wskaźnik przeciążenia G-Meter oraz model 3D w trybie miniaturowego podglądu.
3. **Signal Analysis**: Pełnoekranowy zestaw 6 niezależnych wykresów Skia o wysokiej rozdzielczości, monitor widma częstotliwościowego, licznik utraconych pakietów i bezpośredni podgląd surowego bufora bajtów.

---

## 4. Architektura prototypu Skia & Wizualizacji 3D

1. **Komponent 3D (Three.js)**:
   - Zbudowany zgodnie z wytycznymi jako wieloczęściowa grupa (`THREE.Group`): obudowa krążka Triki, pierścień świetlny LED RGB, środkowy wklęsły przycisk dotykowy, podstawa antypoślizgowa oraz oznaczenia osi $X, Y, Z$.
   - Oświetlenie studyjne z mapą odbić `RoomEnvironment` oraz cieniami kontaktowymi.
   - Reakcja na kliknięcie przycisku w krążku (wysłanie komendy BLE do diody LED lub zmiana koloru w aplikacji).
   - Zerowa alokacja w pętli animacji (`THREE.Quaternion`, `THREE.Euler` prealokowane).

2. **Wizualizator Skia / Canvas 2D**:
   - Ultra-wydajny silnik wykresów renderujący bezpośrednio na Canvas z buforem kołowym (RingBuffer).
   - Renderowanie sztucznego horyzontu z dokładnym horyzontem sztucznym, liniami pitch ladder, roll pointer i wskaźnikiem wektora prędkości.
   - Skia-ready architektura kodu (przejrzysty mapping na deklaratywne komponenty `@shopify/react-native-skia`: `Canvas`, `Path`, `Circle`, `LinearGradient`).

3. **Przewodnik i wzorce implementacji dla React Native**:
   - Gotowy plik architektoniczny z kodem dla `react-native-ble-manager` (inicjalizacja, skanowanie `startScan`, `connect`, `startNotification`, dekodowanie Base64/ByteArray na Android i iOS).
   - Moduł przetwarzania z algorytmem Madgwicka przystosowany do wątku roboczego / Workletów Reanimated w React Native.
   - Kompletny komponent widoku Skia z `useSharedValue` i `useFrameCallback`.

---

## 5. Plan weryfikacji i testów

1. **Weryfikacja parowania BLE**: Sprawdzenie obsługi Web Bluetooth w przeglądarce (`navigator.bluetooth`), obsługa błędów braku uprawnień lub braku adaptera BLE, elegancki stan oczekiwania i diagnostyki.
2. **Weryfikacja filtru fuzji**: Sprawdzenie poprawności wyliczania orientacji 3D, odporności na gwałtowne ruchy i stabilności w stanie spoczynku (kalibracja biasu żyroskopu).
3. **Weryfikacja wydajności**: Pomiary FPS (stałe 60 FPS) przy ciągłym napływie danych 100 Hz, zero wycieków pamięci w buforach.
4. **Weryfikacja stylów i układów**: Test przełączania w locie pomiędzy Split-Screen, Aviation Horizon i Signal Analysis oraz motywami Clean Light i E-Ink.
5. **Kompilacja i Linting**: Sprawdzenie czystości kodu za pomocą `compile_applet` i `lint_applet`.

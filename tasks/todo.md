# GS Retail MQTT Sensor Monitor

## Uppgift
Skapa en statisk webbsida (HTML5, JS, CSS) som ansluter till en MQTT-broker via WebSockets och prenumererar på sensordata.

## MQTT-konfiguration
- **Broker:** wss://mqtt.swedeniot.se:9001/ws
- **Användarnamn:** maca
- **Lösenord:** maca2025
- **Topic:** gs-retail/sensor/onvif-ej/#

---

## Checklista

- [x] Skapa `index.html` med struktur för UI
- [x] Skapa `styles.css` med modernt mörkt tema
- [x] Skapa `app.js` med MQTT-anslutningslogik (Paho-klient)
- [x] Optimera meddelandevy (kompakt design, rensa-knapp i header)
- [x] Verifiera att webbsidan fungerar i webbläsare (server på http://localhost:8080)
- [x] Testa MQTT-anslutning till brokern (Verifierat med Debug-läge)

---

## Acceptanskriterier
1. Webbsidan visar anslutningsstatus (Ansluten/Frånkopplad)
2. "Anslut"-knappen skapar WebSocket-anslutning till brokern
3. Prenumeration på topic `gs-retail/sensor/onvif-ej/#` fungerar
4. Inkommande meddelanden visas i realtid
5. "Rensa meddelanden"-funktionalitet fungerar

---

## Verifikation
- [ ] Öppna sidan i webbläsare
- [ ] Klicka "Anslut" och verifiera grön status
- [ ] Bekräfta att meddelanden visas när data publiceras

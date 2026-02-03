# GS Retail MQTT Sensor Monitor

En statisk webbapplikation för att övervaka sensordata via MQTT över WebSockets.

## Funktionalitet
- **Realtidsövervakning:** Ansluter till `mqtt.swedeniot.se` och visar sensordata direkt.
- **Kompakt Dashboard:** Snygg presentation av events med statusindikatorer.
- **JSON-parsing:** Automatisk formatering av JSON-payloads från sensorer.
- **Responsive Design:** Fungerar på desktop och mobila enheter.

## Installation & Körning

Ingen installation krävs då det är en statisk sida (HTML/CSS/JS).

1. **Rulla lokalt:**
   Du behöver en enkel webbserver för att köra applikationen (för att undvika CORS/fil-protokoll problem).
   
   Med Python:
   ```bash
   python -m http.server 8080
   ```

2. **Öppna i webbläsaren:**
   Gå till [http://localhost:8080](http://localhost:8080)

## Användning

1. Klicka på **Anslut** för att koppla upp mot MQTT-brokern.
2. Applikationen prenumererar automatiskt på `gs-retail/sensor/onvif-ej/#`.
3. Inkommande meddelanden visas i listan.
4. Klicka på ett meddelande för att se detaljerad JSON-data.

## Debug / Testning

För att testa UI utan att ansluta till en riktig broker, lägg till `?debug=true` i URL:en:
[http://localhost:8080/?debug=true](http://localhost:8080/?debug=true)

Detta aktiverar en "Simulera"-knapp som genererar testdata.

## Konfiguration

MQTT-inställningar finns i `app.js`:

```javascript
const MQTT_CONFIG = {
    host: 'mqtt.swedeniot.se',
    port: 9001,
    path: '/ws',
    useSSL: true,
    // ...
};
```